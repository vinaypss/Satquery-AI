/**
 * SatQuery AI - Secure Production Defaults
 * SECURITY PHASE 3: Secure Deployment Configuration
 *
 * Hand-rolled (no new dependencies): security headers, restrictive CORS,
 * HTTPS enforcement, request IDs, per-IP rate limiting, JSON error/404
 * handlers, and production-readiness warnings.
 *
 * Deliberate non-goals (documented, not oversights):
 * - No `X-Frame-Options` / `frame-ancestors`: the app is embedded in the
 *   AI Studio host iframe, so frame-blocking would break legitimate use.
 * - No COOP/COEP: the app uses OAuth-style popups/redirects (see APP_URL).
 * - No cookie flags to set: the API is stateless Bearer-token based and
 *   never issues cookies (asserted by tests).
 * - TLS itself terminates OUTSIDE this codebase (reverse proxy / Cloud Run).
 *   ENFORCE_HTTPS + HSTS here are defense-in-depth, not the TLS implementation.
 */

import { randomUUID } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import {
  logApiError,
  logRateLimit,
  logInsecureTransportRedirect,
  logUnusualRequest
} from './securityLogger.js';
import { API_KEY_ENV_VAR, extractBearerToken } from './accessControl.js';

// ---------------------------------------------------------------------------
// Environment helpers (read dynamically so tests can toggle safely)
// ---------------------------------------------------------------------------

/** True only when running a production build. */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** Trust-proxy hops for Express (`TRUST_PROXY`), e.g. "1" behind Cloud Run. */
export function parseTrustProxy(): number | undefined {
  const raw = process.env.TRUST_PROXY;
  if (!raw || raw.trim().length === 0) return undefined;
  const hops = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(hops) && hops >= 0 ? hops : undefined;
}

function rateLimitWindowMs(): number {
  const raw = Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 60000;
}

function rateLimitMaxRequests(): number {
  const raw = Number.parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 300;
}

// ---------------------------------------------------------------------------
// Request IDs (useful for incident investigation)
// ---------------------------------------------------------------------------

const SAFE_REQUEST_ID = /^[A-Za-z0-9-]{1,64}$/;

/**
 * Attaches a correlation ID to every request. Honors a client-supplied
 * `X-Request-Id` only when it matches a strict token format; otherwise
 * generates a UUID. Echoed back via the `X-Request-Id` response header.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  const id =
    typeof candidate === 'string' && SAFE_REQUEST_ID.test(candidate)
      ? candidate
      : randomUUID();
  (req as Request & { requestId?: string }).requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
}

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------

function buildCsp(production: boolean): string {
  // Production is strict. Development relaxes script/connect sources so Vite
  // HMR (inline preamble, ws:// websocket) keeps working; behavior unchanged.
  const scriptSrc = production ? "'self'" : "'self' 'unsafe-inline' 'unsafe-eval'";
  const connectSrc = production ? "'self'" : "'self' ws: wss:";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    `connect-src ${connectSrc}`,
    "font-src 'self' data:",
    "form-action 'self'"
  ].join('; ');
}

/**
 * Baseline response hardening. HSTS is production-only (it would otherwise
 * pin localhost to HTTPS in development).
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  const production = isProduction();
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', buildCsp(production));
  if (production) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  void req;
  next();
}

// ---------------------------------------------------------------------------
// Restrictive CORS (same-origin SPA; explicit allowlist only)
// ---------------------------------------------------------------------------

/** Parses `CORS_ALLOWED_ORIGINS` into exact `scheme://host[:port]` entries. */
export function parseAllowedOrigins(): string[] {
  const raw = process.env.CORS_ALLOWED_ORIGINS || '';
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0 && entry !== '*' && /^https?:\/\/[^/]+$/.test(entry));
}

function isOriginAllowed(origin: string): boolean {
  return parseAllowedOrigins().includes(origin.trim().toLowerCase());
}

/**
 * CORS policy: the SPA is same-origin, so cross-origin access is denied by
 * default (no `Access-Control-Allow-Origin` header). Exact origins listed in
 * `CORS_ALLOWED_ORIGINS` are echoed (never `*`); no credentials are ever
 * allowed since auth is Bearer-based, not cookie-based.
 */
export function corsPolicy(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (typeof origin !== 'string' || origin.length === 0) {
    next();
    return;
  }

  if (!isOriginAllowed(origin)) {
    logUnusualRequest(req, 'cross-origin request from non-allowlisted origin');
    next();
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id');
  res.setHeader('Access-Control-Max-Age', '600');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// HTTPS enforcement (defense-in-depth; TLS terminates at the proxy)
// ---------------------------------------------------------------------------

function forwardedProto(req: Request): string {
  const header = req.headers['x-forwarded-proto'];
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === 'string' ? value.split(',')[0].trim().toLowerCase() : '';
}

/**
 * Redirects plain-HTTP traffic to HTTPS when `ENFORCE_HTTPS=true`.
 * Off by default so local HTTP development is unaffected. `/api/health`
 * is exempt (load-balancer probes). Behind a TLS-terminating proxy this is
 * a backstop only: the proxy redirect + HSTS remain authoritative.
 */
export function enforceHttps(req: Request, res: Response, next: NextFunction): void {
  if (process.env.ENFORCE_HTTPS !== 'true') {
    next();
    return;
  }
  if (req.path === '/api/health') {
    next();
    return;
  }
  if (req.secure || forwardedProto(req) === 'https') {
    next();
    return;
  }
  logInsecureTransportRedirect(req);
  const host = req.headers.host || 'localhost';
  res.redirect(301, `https://${host}${req.originalUrl}`);
}

// ---------------------------------------------------------------------------
// Tiered rate limiting (fixed window, in-memory, server-side enforced)
// ---------------------------------------------------------------------------
// SECURITY PHASE 4: Abuse Protection. Tiers exist so that expensive
// operations (GPU inference, large uploads, upstream STAC calls) get
// stricter budgets than cheap reads, and so that alternate equivalent
// endpoints cannot be used to bypass a limit: /api/analyze and
// /api/execute-task share the `inference` bucket; /api/analyze/export-*
// share the `general` bucket.
//
// Layering: every request consumes its per-IP bucket AND — when a Bearer
// credential is presented — a per-credential bucket. Rotating credentials
// therefore never grants extra budget (the IP bucket still binds), while
// distinct legitimate credentials are isolated from each other.

export type RateLimitTier = 'inference' | 'upload' | 'external' | 'general';

interface RateBucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, RateBucket>();

/** Clears limiter state (used by tests; not part of the request path). */
export function resetRateLimitState(): void {
  buckets.clear();
}

function clientKey(req: Request): string {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * Maps a request to its cost tier. Health probes and non-API traffic are
 * exempt (null) so legitimate monitoring is never throttled.
 */
export function tierForRequest(req: Request): RateLimitTier | null {
  if (!req.path.startsWith('/api/')) return null;
  if (req.path === '/api/health') return null;
  if (req.method === 'POST' && (req.path === '/api/analyze' || req.path === '/api/execute-task')) {
    return 'inference';
  }
  if (req.method === 'POST' && req.path === '/api/validate-image') {
    return 'upload';
  }
  if (req.method === 'POST' && req.path === '/api/catalog/search') {
    return 'external';
  }
  return 'general';
}

function tierMaxRequests(tier: RateLimitTier): number {
  const pick = (name: string, fallback: number): number => {
    const raw = Number.parseInt(process.env[name] || '', 10);
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
  };
  switch (tier) {
    case 'inference':
      return pick('RATE_LIMIT_INFERENCE_MAX', 60);
    case 'upload':
      return pick('RATE_LIMIT_UPLOAD_MAX', 120);
    case 'external':
      return pick('RATE_LIMIT_EXTERNAL_MAX', 60);
    case 'general':
    default:
      return pick('RATE_LIMIT_MAX_REQUESTS', 300);
  }
}

function consumeBucket(mapKey: string, windowMs: number, max: number, now: number): number {
  // Returns 0 when allowed, otherwise seconds until the window resets.
  const bucket = buckets.get(mapKey);
  if (!bucket || now - bucket.windowStart > windowMs) {
    buckets.set(mapKey, { count: 1, windowStart: now });
    return 0;
  }
  bucket.count += 1;
  if (bucket.count > max) {
    return Math.max(1, Math.ceil((bucket.windowStart + windowMs - now) / 1000));
  }
  return 0;
}

function denyRateLimited(req: Request, res: Response, retryAfter: number): void {
  // Deliberately generic: never discloses tier names, maxima, or windows.
  logRateLimit(req, { tier: tierForRequest(req) });
  res.setHeader('Retry-After', String(retryAfter));
  res.status(429).json({
    valid: false,
    error: 'Too many requests. Please slow down and retry later.',
    retryAfter
  });
}

/**
 * Tiered fixed-window limiter for `/api/*` (health probes exempt).
 * Tune via `RATE_LIMIT_WINDOW_MS` plus per-tier maxima:
 * `RATE_LIMIT_INFERENCE_MAX` / `RATE_LIMIT_UPLOAD_MAX` /
 * `RATE_LIMIT_EXTERNAL_MAX` / `RATE_LIMIT_MAX_REQUESTS`.
 * Exceeding callers get 429 + `Retry-After` and a logged security event.
 */
export function apiRateLimit(req: Request, res: Response, next: NextFunction): void {
  const tier = tierForRequest(req);
  if (!tier) {
    next();
    return;
  }

  const windowMs = rateLimitWindowMs();
  const max = tierMaxRequests(tier);
  const now = Date.now();

  // Lazy sweep to bound memory (amortized, no timers).
  if (buckets.size > 20000) {
    for (const [k, bucket] of buckets) {
      if (now - bucket.windowStart > windowMs) buckets.delete(k);
    }
  }

  const ipRetry = consumeBucket(`${tier}|ip|${clientKey(req)}`, windowMs, max, now);
  if (ipRetry > 0) {
    denyRateLimited(req, res, ipRetry);
    return;
  }

  const credential = extractBearerToken(req);
  if (credential !== null) {
    const keyRetry = consumeBucket(`${tier}|key|${credential}`, windowMs, max, now);
    if (keyRetry > 0) {
      denyRateLimited(req, res, keyRetry);
      return;
    }
  }

  next();
}

// ---------------------------------------------------------------------------
// JSON 404 + error handlers (no stacks, paths, or SQL in responses)
// ---------------------------------------------------------------------------

/** JSON 404 for unknown `/api/*` paths (also logs the probe). */
export function apiNotFound(req: Request, res: Response): void {
  logUnusualRequest(req, 'unknown API path', 404);
  res.status(404).json({
    valid: false,
    error: 'Not found: no such API endpoint.',
    requestId: (req as Request & { requestId?: string }).requestId
  });
}

/**
 * Final error handler: oversized bodies (413) and anything escaping routes
 * become generic JSON. Stacks and internals are logged server-side only
 * (redacted) and never serialized to clients.
 */
export function jsonErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status =
    typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status: unknown }).status === 'number'
      ? ((err as { status: number }).status as number)
      : 500;
  const expose =
    status === 413
      ? 'Request body too large.'
      : 'Internal server error while processing the request.';
  logApiError(req, 'unhandled error', err);
  if (res.headersSent) {
    return;
  }
  res.status(status).json({
    valid: false,
    error: expose,
    requestId: (req as Request & { requestId?: string }).requestId
  });
}

// ---------------------------------------------------------------------------
// Production-readiness warnings (warn-only; never throws, tests stay green)
// ---------------------------------------------------------------------------

/**
 * Returns human-readable warnings for insecure production configuration.
 * Pure function of the supplied env snapshot (defaults to process.env).
 */
export function getProductionReadinessWarnings(
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const warnings: string[] = [];
  if (env.NODE_ENV !== 'production') return warnings;
  const apiKey = env[API_KEY_ENV_VAR];
  if (typeof apiKey !== 'string' || apiKey.length === 0) {
    warnings.push(
      `Production has no ${API_KEY_ENV_VAR} configured: the API is openly accessible. Set a strong key.`
    );
  }
  if (env.ENFORCE_HTTPS !== 'true') {
    warnings.push(
      'Production has ENFORCE_HTTPS disabled: enable it and terminate TLS at the reverse proxy / Cloud Run.'
    );
  }
  if (!env.TRUST_PROXY) {
    warnings.push(
      'Production has TRUST_PROXY unset: client IPs and secure-scheme detection fall back to the direct peer. Set TRUST_PROXY=1 behind a single trusted proxy.'
    );
  }
  return warnings;
}
