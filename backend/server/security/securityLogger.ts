/**
 * SatQuery AI - Structured Security Event Logging
 * SECURITY PHASE 3: Secure Deployment Configuration
 *
 * Single-line JSON security events for production monitoring.
 *
 * NEVER logged (enforced by `redact()` + explicit drops):
 * passwords, tokens, API keys, cookies, Authorization headers,
 * image bytes (`dataUri` / `images` arrays), or full request bodies.
 * IPs and request IDs ARE logged (needed for incident investigation).
 */

import { Request } from 'express';

export type SecurityEventType =
  | 'auth_attempt'
  | 'auth_failure'
  | 'authorization_failure'
  | 'api_error'
  | 'rate_limit'
  | 'insecure_transport_redirect'
  | 'unusual_request';

export type SecurityEventLevel = 'info' | 'warn' | 'error';

export interface SecurityEvent {
  ts: string;
  level: SecurityEventLevel;
  event: SecurityEventType;
  requestId?: string;
  method?: string;
  route?: string;
  ip?: string;
  status?: number;
  detail?: Record<string, unknown>;
}

type SecurityEventSink = (event: SecurityEvent) => void;

let sink: SecurityEventSink | null = null;

/** Override the event sink (used by tests to capture events). */
export function setSecurityEventSink(next: SecurityEventSink | null): void {
  sink = next;
}

/** Key fragments that must never appear in logs (case-insensitive). */
const SENSITIVE_KEY_PATTERN =
  /password|passwd|pwd|token|api[-_]?key|secret|cookie|authorization|set-cookie|bearer|session|private[-_]?key/i;

/** Payload keys dropped wholesale (bulk bytes / user content). */
const DROPPED_PAYLOAD_KEYS = new Set([
  'datauri',
  'images',
  'report',
  'query',
  'body',
  'buffer',
  'base64'
]);

const MAX_STRING_LENGTH = 500;

function redactKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key) || DROPPED_PAYLOAD_KEYS.has(key.toLowerCase());
}

/**
 * Deep-clones `value` while redacting sensitive keys, truncating long
 * strings, and refusing to serialize raw bytes. Never throws.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LENGTH) {
      return value.slice(0, MAX_STRING_LENGTH) + '…[truncated]';
    }
    return value;
  }
  if (typeof value !== 'object' || depth > 4) {
    return typeof value === 'object' ? '[object]' : value;
  }
  if (value instanceof Error) {
    // Message only: stacks contain filesystem paths and internals.
    return { name: value.name, message: String(value.message).slice(0, 200) };
  }
  if (Array.isArray(value)) {
    return value.slice(0, 10).map((entry) => redact(entry, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = redactKey(key) ? '[REDACTED]' : redact(entry, depth + 1);
  }
  return out;
}

function baseFromRequest(req?: Request): Partial<SecurityEvent> {
  if (!req) return {};
  return {
    requestId: (req as Request & { requestId?: string }).requestId,
    method: req.method,
    route: req.originalUrl ? req.originalUrl.split('?')[0] : req.path,
    ip: req.ip
  };
}

export function logSecurityEvent(
  type: SecurityEventType,
  level: SecurityEventLevel,
  req?: Request,
  detail?: Record<string, unknown>,
  status?: number
): void {
  const event: SecurityEvent = {
    ts: new Date().toISOString(),
    level,
    event: type,
    ...baseFromRequest(req),
    ...(status !== undefined ? { status } : {}),
    ...(detail ? { detail: redact(detail) as Record<string, unknown> } : {})
  };
  if (sink) {
    sink(event);
    return;
  }
  process.stdout.write(JSON.stringify(event) + '\n');
}

export function logAuthAttempt(req: Request, detail?: Record<string, unknown>): void {
  logSecurityEvent('auth_attempt', 'info', req, detail);
}

export function logAuthFailure(req: Request, detail?: Record<string, unknown>): void {
  logSecurityEvent('auth_failure', 'warn', req, detail, 401);
}

export function logAuthorizationFailure(req: Request, detail?: Record<string, unknown>): void {
  logSecurityEvent('authorization_failure', 'warn', req, detail);
}

export function logApiError(req: Request, context: string, error: unknown): void {
  logSecurityEvent('api_error', 'error', req, { context, error }, 500);
}

export function logRateLimit(req: Request, detail?: Record<string, unknown>): void {
  logSecurityEvent('rate_limit', 'warn', req, detail, 429);
}

export function logInsecureTransportRedirect(req: Request): void {
  logSecurityEvent('insecure_transport_redirect', 'info', req, {
    forwardedProto: req.headers['x-forwarded-proto']
  });
}

export function logUnusualRequest(
  req: Request,
  reason: string,
  status?: number
): void {
  logSecurityEvent('unusual_request', 'warn', req, { reason }, status);
}
