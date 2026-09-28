/**
 * SatQuery AI - HTTP Trust-Boundary Access Control
 * SECURITY PHASE 2: Authorization + IDOR Protection
 *
 * Application model (verified by audit):
 * - The API is stateless. There are no user accounts, sessions, roles, databases,
 *   persistent user-owned resources, or `:id` route parameters. Every endpoint is a
 *   pure function of its request body, so classic stored-object IDOR (user A reading
 *   user B's stored object) is structurally impossible.
 * - The real object-reference risks at this boundary are:
 *   1. `image.path` carriers forwarded to Python workers, which call
 *      `Image.open(path)` -> arbitrary server-side file read (path traversal /
 *      IDOR-to-filesystem). The `path` carrier is therefore stripped here.
 *   2. Remote-URL `dataUri` values forwarded to Python workers, which call
 *      `urllib.request.urlopen(url)` -> server-side request forgery (SSRF).
 *      Only `data:` URIs are accepted where image bytes are consumed.
 *   3. Client-supplied identity/privilege fields (`ownerId`, `userId`, `workerUrl`,
 *      `authKey`, ...) must never influence routing, execution, or worker
 *      endpoints. Only allowlisted image fields cross this boundary.
 *
 * This module is enforced at the Express route layer (the HTTP trust boundary).
 * Adapter-level validation inside `server/tools/*` is unchanged defense-in-depth.
 */

import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { InputImageDescriptor } from '../types/index.js';
import { logAuthAttempt, logAuthFailure, logRateLimit } from './securityLogger.js';

/** Structured audit hooks for the API-key gate (logged without secrets). */
function logGateAttempt(req: Request): void {
  logAuthAttempt(req, { gate: 'api-key' });
}

function logGateFailure(req: Request): void {
  logAuthFailure(req, { gate: 'api-key' });
}

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** Maximum images accepted per request (legitimate flows need at most 2). */
export const MAX_IMAGES_PER_REQUEST = 8;

/** String field length caps (defense-in-depth; body parser already caps at 50mb). */
export const MAX_NAME_LENGTH = 255;
export const MAX_MIME_LENGTH = 128;
export const MAX_ID_LENGTH = 128;
export const MAX_SHORT_TEXT_LENGTH = 1024;

/** Only inline `data:` URIs may carry image bytes across the HTTP boundary. */
const DATA_URI_SCHEME = /^data:/i;

/**
 * Client-supplied identity / privilege / routing fields that must NEVER
 * cross the trust boundary. The server never reads these; they are dropped.
 */
const DROPPED_IDENTITY_FIELDS = [
  'ownerId',
  'owner',
  'userId',
  'user',
  'user_id',
  'owner_id',
  'role',
  'roles',
  'permissions',
  'workerUrl',
  'worker_url',
  'authKey',
  'auth_key',
  'token',
  'apiKey',
  'api_key',
  'projectId',
  'project_id',
  'resourceId',
  'resource_id'
] as const;

// ---------------------------------------------------------------------------
// Image sanitization
// ---------------------------------------------------------------------------

export interface SanitizeImageResult {
  /** Allowlisted, boundary-safe image descriptor (never contains `path`). */
  image: InputImageDescriptor;
  /** True when a `path` carrier was present and stripped. */
  droppedPath: boolean;
  /** Present when the descriptor is unusable at this boundary. */
  error?: string;
}

function asTrimmedString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined;
  return value;
}

/**
 * Sanitizes one client-supplied image descriptor at the HTTP trust boundary.
 *
 * - Builds an allowlisted copy: unknown fields (including identity/privilege
 *   fields such as `ownerId`, `userId`, `workerUrl`, `authKey`) are dropped.
 * - Strips the `path` filesystem carrier (prevents IDOR-to-filesystem /
 *   path traversal via downstream `Image.open(path)`).
 * - When `requireDataUri` is true (endpoints that consume image bytes),
 *   rejects descriptors whose `dataUri` is missing or is not an inline
 *   `data:` URI (prevents SSRF via downstream `urlopen(remote_url)`).
 */
export function sanitizeImageDescriptor(
  raw: unknown,
  options: { requireDataUri?: boolean } = {}
): SanitizeImageResult {
  const requireDataUri = options.requireDataUri ?? false;

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      image: {},
      droppedPath: false,
      error: 'Invalid image descriptor: expected an object.'
    };
  }

  const source = raw as Record<string, unknown>;
  const image: InputImageDescriptor = {};
  let droppedPath = false;

  const id = asTrimmedString(source.id, MAX_ID_LENGTH);
  if (id !== undefined) image.id = id;

  const name = asTrimmedString(source.name, MAX_NAME_LENGTH);
  if (name !== undefined) image.name = name;

  const mimeType = asTrimmedString(source.mimeType, MAX_MIME_LENGTH);
  if (mimeType !== undefined) image.mimeType = mimeType;

  const sizeBytes = asFiniteNumber(source.sizeBytes);
  if (sizeBytes !== undefined) image.sizeBytes = sizeBytes;

  if (typeof source.dataUri === 'string' && source.dataUri.trim().length > 0) {
    image.dataUri = source.dataUri.trim();
  }

  const modality = asTrimmedString(source.modality, 32);
  if (modality !== undefined) {
    image.modality = modality as InputImageDescriptor['modality'];
  }

  const acquisitionDate = asTrimmedString(source.acquisitionDate, MAX_SHORT_TEXT_LENGTH);
  if (acquisitionDate !== undefined) image.acquisitionDate = acquisitionDate;

  const geographicArea = asTrimmedString(source.geographicArea, MAX_SHORT_TEXT_LENGTH);
  if (geographicArea !== undefined) image.geographicArea = geographicArea;

  const crs = asTrimmedString(source.crs, MAX_SHORT_TEXT_LENGTH);
  if (crs !== undefined) image.crs = crs;

  if (Array.isArray(source.coordinates)) {
    const coords = source.coordinates;
    if (
      (coords.length === 2 || coords.length === 4) &&
      coords.every((c) => typeof c === 'number' && Number.isFinite(c))
    ) {
      image.coordinates = coords as InputImageDescriptor['coordinates'];
    }
  }

  if (source.metadata && typeof source.metadata === 'object' && !Array.isArray(source.metadata)) {
    image.metadata = source.metadata as Record<string, unknown>;
  }

  // Strip filesystem carrier: never let a client-supplied path reach a worker.
  if (typeof source.path === 'string' && source.path.trim().length > 0) {
    droppedPath = true;
  }

  // Identity/privilege fields (ownerId, userId, workerUrl, authKey, ...)
  // are allowlist-dropped by construction: only the known image fields
  // above are ever copied into `image`. See DROPPED_IDENTITY_FIELDS.

  if (requireDataUri) {
    if (!image.dataUri || !DATA_URI_SCHEME.test(image.dataUri)) {
      return {
        image,
        droppedPath,
        error:
          'Invalid image carrier: image bytes must be supplied as an inline `data:` URI. ' +
          'Filesystem paths and remote URLs are not accepted.'
      };
    }
  }

  return { image, droppedPath };
}

export interface SanitizeImageArrayResult {
  images: InputImageDescriptor[];
  droppedPathCount: number;
  error?: string;
}

/**
 * Sanitizes an array of client-supplied image descriptors.
 * Enforces a bulk cap and per-descriptor boundary rules.
 */
export function sanitizeImageArray(
  raw: unknown,
  options: { requireDataUri?: boolean } = {}
): SanitizeImageArrayResult {
  if (raw === undefined || raw === null) {
    return { images: [], droppedPathCount: 0 };
  }
  if (!Array.isArray(raw)) {
    return { images: [], droppedPathCount: 0, error: 'Invalid request: "images" must be an array.' };
  }
  if (raw.length > MAX_IMAGES_PER_REQUEST) {
    return {
      images: [],
      droppedPathCount: 0,
      error: `Invalid request: at most ${MAX_IMAGES_PER_REQUEST} images are accepted per request.`
    };
  }

  const images: InputImageDescriptor[] = [];
  let droppedPathCount = 0;
  for (const entry of raw) {
    const result = sanitizeImageDescriptor(entry, options);
    if (result.error) {
      return { images: [], droppedPathCount, error: result.error };
    }
    if (result.droppedPath) droppedPathCount += 1;
    images.push(result.image);
  }
  return { images, droppedPathCount };
}

// ---------------------------------------------------------------------------
// Optional API-key gate (env-gated; default preserves the open demo model)
// ---------------------------------------------------------------------------

export const API_KEY_ENV_VAR = 'SATQUERY_API_KEY';

/** True only when the deployment configures an API key. Reads env dynamically. */
export function isApiKeyEnforced(): boolean {
  const key = process.env[API_KEY_ENV_VAR];
  return typeof key === 'string' && key.length > 0;
}

// ---------------------------------------------------------------------------
// API-key brute-force containment (SECURITY PHASE 4)
// ---------------------------------------------------------------------------
// There are no login/signup/password-reset accounts in this application
// (verified by audit), so the shared API-key gate is the only credential
// surface. Repeated failures from one IP are tar-pitted: after
// RATE_LIMIT_AUTH_MAX failures inside RATE_LIMIT_AUTH_WINDOW_MS the IP gets
// 429 for gated requests even with a correct key, until the window resets.

interface AuthFailureBucket {
  count: number;
  windowStart: number;
}

const authFailures = new Map<string, AuthFailureBucket>();

/** Clears brute-force state (used by tests; not part of the request path). */
export function resetAuthFailureState(): void {
  authFailures.clear();
}

function authFailureMax(): number {
  const raw = Number.parseInt(process.env.RATE_LIMIT_AUTH_MAX || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 20;
}

function authFailureWindowMs(): number {
  const raw = Number.parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 300000;
}

function authFailureKey(req: Request): string {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/** Extracts the raw Bearer credential (no verification; verification stays in requireApiKey). */
export function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || typeof header !== 'string') return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  return match[1].trim();
}

/**
 * Express middleware: when `SATQUERY_API_KEY` is configured, every request
 * must present `Authorization: Bearer <key>` (constant-time comparison).
 * When unconfigured, requests pass through unchanged (existing app model).
 * Failures return a generic 401 that reveals nothing about stored state.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  if (!isApiKeyEnforced()) {
    next();
    return;
  }

  // Brute-force tarpit: an IP that recently burned its failure budget is
  // shed with 429 before any credential comparison happens.
  const now = Date.now();
  const failureKey = authFailureKey(req);
  const failureWindow = authFailureWindowMs();
  const failureMax = authFailureMax();
  const failures = authFailures.get(failureKey);
  if (failures && now - failures.windowStart <= failureWindow && failures.count >= failureMax) {
    const retryAfter = Math.max(1, Math.ceil((failures.windowStart + failureWindow - now) / 1000));
    logRateLimit(req, { gate: 'api-key-brute-force' });
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({
      valid: false,
      error: 'Too many failed authentication attempts. Please slow down and retry later.',
      retryAfter
    });
    return;
  }
  if (failures && now - failures.windowStart > failureWindow) {
    authFailures.delete(failureKey);
  }

  // Structured audit trail (Phase 3): attempts + failures are logged with
  // request IDs; the credential itself is never logged (see securityLogger).
  logGateAttempt(req);

  const expected = process.env[API_KEY_ENV_VAR] as string;
  const provided = extractBearerToken(req);

  let authorized = false;
  if (provided !== null) {
    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    authorized = a.length === b.length && timingSafeEqual(a, b);
  }

  if (!authorized) {
    const bucket = authFailures.get(failureKey);
    if (!bucket || now - bucket.windowStart > failureWindow) {
      authFailures.set(failureKey, { count: 1, windowStart: now });
    } else {
      bucket.count += 1;
    }
    logGateFailure(req);
    res.status(401).json({
      valid: false,
      error: 'Unauthorized: valid API credentials are required.'
    });
    return;
  }

  next();
}

// ---------------------------------------------------------------------------
// Safe error responses (no internal-detail leakage)
// ---------------------------------------------------------------------------

/**
 * Converts any internal failure into a generic message safe for clients.
 * Authorization/validation failures must never echo paths, URLs, stack
 * traces, or worker topology. Details belong in server logs, not responses.
 */
export function toSafeErrorMessage(context: string): string {
  return `Internal server error while processing the request (${context}).`;
}
