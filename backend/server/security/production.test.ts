/**
 * SatQuery AI — SECURITY PHASE 3: Secure Deployment Configuration Tests
 * SIH26167 | ISRO / Department of Space | Team IMPOSTERS
 *
 * Verifies production security defaults without breaking development:
 * security headers, restrictive CORS, HTTPS enforcement, request IDs,
 * rate limiting, secret-safe logging, JSON error/404 handlers, and
 * production-readiness warnings. No cookies may ever be issued.
 */

import http from 'http';
import { AddressInfo } from 'net';
import { createServerApp } from '../index.js';
import {
  getProductionReadinessWarnings,
  resetRateLimitState
} from './secureDefaults.js';
import { redact, setSecurityEventSink, SecurityEvent } from './securityLogger.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log('  ✓ PASS: ' + label);
    passed++;
  } else {
    console.error('  ✗ FAIL: ' + label + (detail ? '\n         ' + detail : ''));
    failed++;
  }
}

interface HttpResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  data: any;
}

function requestRaw(
  port: number,
  method: string,
  path: string,
  rawBody?: string,
  headers?: Record<string, string>
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        ...(rawBody !== undefined
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(rawBody) }
          : {}),
        ...(headers || {})
      }
    };
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        let data: any = raw;
        try { data = JSON.parse(raw); } catch { /* keep raw */ }
        resolve({ status: res.statusCode || 0, headers: res.headers, data });
      });
    });
    req.on('error', reject);
    if (rawBody !== undefined) req.write(rawBody);
    req.end();
  });
}

function header(res: HttpResponse, name: string): string | undefined {
  const value = res.headers[name.toLowerCase()];
  return Array.isArray(value) ? value.join(', ') : value;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function run() {
  console.log('');
  console.log('==================================================================');
  console.log('  SatQuery AI SECURITY PHASE 3 — Secure Deployment Configuration');
  console.log('  SIH26167 | ISRO Space Technology | Team IMPOSTERS');
  console.log('==================================================================');
  console.log('');

  const savedEnv: Record<string, string | undefined> = {
    NODE_ENV: process.env.NODE_ENV,
    SATQUERY_API_KEY: process.env.SATQUERY_API_KEY,
    CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS,
    ENFORCE_HTTPS: process.env.ENFORCE_HTTPS,
    RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS,
    RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS
  };
  const restoreEnv = () => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };

  const app = createServerApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as AddressInfo;
  const port = address.port;

  const captured: SecurityEvent[] = [];
  setSecurityEventSink((event) => captured.push(event));

  try {
    // -----------------------------------------------------------------------
    // 1. Baseline security headers (all environments)
    // -----------------------------------------------------------------------
    console.log('-- 1. Security headers -----------------------------------------');
    const h1 = await requestRaw(port, 'GET', '/api/health');
    assert(h1.status === 200, '1a. health check still 200');
    assert(header(h1, 'x-content-type-options') === 'nosniff', '1b. X-Content-Type-Options: nosniff');
    assert(
      typeof header(h1, 'referrer-policy') === 'string' &&
        (header(h1, 'referrer-policy') as string).length > 0,
      '1c. Referrer-Policy present'
    );
    assert(
      typeof header(h1, 'permissions-policy') === 'string',
      '1d. Permissions-Policy present'
    );
    const csp = header(h1, 'content-security-policy') || '';
    assert(csp.includes("default-src 'self'") && csp.includes("object-src 'none'"),
      '1e. Content-Security-Policy baseline present');
    assert(!csp.toLowerCase().includes('frame-ancestors'),
      '1f. no frame-ancestors (AI Studio iframe embedding preserved)');
    assert(header(h1, 'x-powered-by') === undefined, '1g. X-Powered-By removed');
    assert(header(h1, 'strict-transport-security') === undefined,
      '1h. no HSTS outside production (localhost stays HTTP-capable)');

    // -----------------------------------------------------------------------
    // 2. HSTS in production only
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 2. HSTS (production only) -----------------------------------');
    process.env.NODE_ENV = 'production';
    const h2 = await requestRaw(port, 'GET', '/api/health');
    assert(
      (header(h2, 'strict-transport-security') || '').includes('max-age=31536000'),
      '2a. HSTS emitted when NODE_ENV=production'
    );
    if (savedEnv.NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = savedEnv.NODE_ENV;
    const h2b = await requestRaw(port, 'GET', '/api/health');
    assert(header(h2b, 'strict-transport-security') === undefined,
      '2b. HSTS absent again outside production');

    // -----------------------------------------------------------------------
    // 3. Restrictive CORS
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 3. CORS allowlist -------------------------------------------');
    delete process.env.CORS_ALLOWED_ORIGINS;
    const c1 = await requestRaw(port, 'GET', '/api/health');
    assert(header(c1, 'access-control-allow-origin') === undefined,
      '3a. no ACAO header without Origin (same-origin SPA needs none)');
    const c2 = await requestRaw(port, 'GET', '/api/health', undefined, {
      Origin: 'https://evil-attacker.example'
    });
    assert(header(c2, 'access-control-allow-origin') === undefined,
      '3b. non-allowlisted origin gets no ACAO (denied)');
    process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.com, *, not-a-url';
    const c3 = await requestRaw(port, 'GET', '/api/health', undefined, {
      Origin: 'https://app.example.com'
    });
    assert(header(c3, 'access-control-allow-origin') === 'https://app.example.com',
      '3c. allowlisted origin echoed exactly');
    assert((header(c3, 'vary') || '').includes('Origin'), '3d. Vary: Origin set');
    const c4 = await requestRaw(port, 'OPTIONS', '/api/route-task', undefined, {
      Origin: 'https://app.example.com',
      'Access-Control-Request-Method': 'POST'
    });
    assert(c4.status === 204, '3e. allowed preflight -> 204');
    assert((header(c4, 'access-control-allow-methods') || '').includes('POST'),
      '3f. preflight advertises methods');
    assert(!(header(c4, 'access-control-allow-credentials') === 'true'),
      '3g. credentials never allowed (Bearer model, no cookies)');
    const c5 = await requestRaw(port, 'GET', '/api/health', undefined, {
      Origin: '*'
    });
    assert(header(c5, 'access-control-allow-origin') === undefined,
      '3h. wildcard origin never honored');
    delete process.env.CORS_ALLOWED_ORIGINS;

    // -----------------------------------------------------------------------
    // 4. HTTPS enforcement (off by default; health exempt)
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 4. HTTPS enforcement ----------------------------------------');
    delete process.env.ENFORCE_HTTPS;
    const t1 = await requestRaw(port, 'GET', '/api/model-audit');
    assert(t1.status === 200, '4a. HTTP proceeds when ENFORCE_HTTPS unset (dev unaffected)');
    process.env.ENFORCE_HTTPS = 'true';
    const t2 = await requestRaw(port, 'GET', '/api/model-audit');
    assert(t2.status === 301, '4b. plain HTTP -> 301 when enforced');
    assert((header(t2, 'location') || '').startsWith('https://'),
      '4c. redirect target uses https scheme');
    const t3 = await requestRaw(port, 'GET', '/api/health');
    assert(t3.status === 200, '4d. /api/health exempt from redirect (probes)');
    const t4 = await requestRaw(port, 'GET', '/api/model-audit', undefined, {
      'X-Forwarded-Proto': 'https'
    });
    assert(t4.status === 200, '4e. proxied-TLS request passes through');
    delete process.env.ENFORCE_HTTPS;

    // -----------------------------------------------------------------------
    // 5. Request IDs
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 5. Request correlation IDs ----------------------------------');
    const q1 = await requestRaw(port, 'GET', '/api/health');
    assert(typeof header(q1, 'x-request-id') === 'string' && UUID_RE.test(header(q1, 'x-request-id') as string),
      '5a. server-generated UUID request ID echoed');
    const q2 = await requestRaw(port, 'GET', '/api/health', undefined, {
      'X-Request-Id': 'trace-abc-123'
    });
    assert(header(q2, 'x-request-id') === 'trace-abc-123',
      '5b. well-formed client request ID honored');
    // (CRLF values cannot even be transmitted: Node's HTTP stack rejects
    // them client-side. The overlong value below exercises the same
    // server-side replacement path with a transmittable input.)
    const q3 = await requestRaw(port, 'GET', '/api/health', undefined, {
      'X-Request-Id': 'x'.repeat(65)
    });
    assert(UUID_RE.test(header(q3, 'x-request-id') as string),
      '5c. malformed request ID replaced with server UUID, never reflected');

    // -----------------------------------------------------------------------
    // 6. Rate limiting
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 6. Rate limiting --------------------------------------------');
    resetRateLimitState();
    process.env.RATE_LIMIT_WINDOW_MS = '60000';
    process.env.RATE_LIMIT_MAX_REQUESTS = '2';
    const l1 = await requestRaw(port, 'GET', '/api/model-audit');
    const l2 = await requestRaw(port, 'GET', '/api/model-audit');
    assert(l1.status === 200 && l2.status === 200, '6a. requests within budget pass');
    const l3 = await requestRaw(port, 'GET', '/api/model-audit');
    assert(l3.status === 429, '6b. over-budget request -> 429');
    assert(l3.data.valid === false && typeof header(l3, 'retry-after') === 'string',
      '6c. 429 is JSON with Retry-After');
    assert(captured.some((e) => e.event === 'rate_limit'),
      '6d. rate-limit event logged');
    resetRateLimitState();
    delete process.env.RATE_LIMIT_WINDOW_MS;
    delete process.env.RATE_LIMIT_MAX_REQUESTS;

    // -----------------------------------------------------------------------
    // 7. Secret-safe logging
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 7. Secret-safe security logging -----------------------------');
    captured.length = 0;
    process.env.SATQUERY_API_KEY = 'phase3-test-key';
    await requestRaw(port, 'GET', '/api/model-audit');
    await requestRaw(port, 'GET', '/api/model-audit', undefined, {
      Authorization: 'Bearer wrong-key'
    });
    const failures = captured.filter((e) => e.event === 'auth_failure');
    assert(failures.length >= 1, '7a. auth failures produce security events');
    const blob = JSON.stringify(captured);
    assert(!blob.includes('phase3-test-key') && !blob.includes('wrong-key'),
      '7b. API keys never appear in logs');
    assert(!blob.toLowerCase().includes('authorization: bearer'),
      '7c. Authorization header material never logged');
    assert(failures.every((e) => typeof e.requestId === 'string' && typeof e.ts === 'string'),
      '7d. events carry requestId + timestamp for investigation');
    delete process.env.SATQUERY_API_KEY;
    const probe = redact({
      password: 'hunter2',
      apiKey: 'abc',
      Cookie: 'sess=1',
      dataUri: 'data:image/png;base64,AAAA',
      images: [{ dataUri: 'x' }],
      query: 'secret query text',
      normal: 'visible'
    }) as Record<string, unknown>;
    assert(
      probe.password === '[REDACTED]' && probe.apiKey === '[REDACTED]' &&
      probe.Cookie === '[REDACTED]' && probe.dataUri === '[REDACTED]' &&
      probe.images === '[REDACTED]' && probe.query === '[REDACTED]' &&
      probe.normal === 'visible',
      '7e. redactor strips secrets, bytes, and user content'
    );

    // -----------------------------------------------------------------------
    // 8. Cookies, 404s, malformed bodies
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 8. Cookies / 404 / malformed bodies -------------------------');
    const k1 = await requestRaw(port, 'GET', '/api/model-audit');
    assert(header(k1, 'set-cookie') === undefined, '8a. API never issues cookies');
    const k2 = await requestRaw(port, 'GET', '/api/does-not-exist');
    assert(k2.status === 404 && k2.data.valid === false, '8b. unknown API path -> JSON 404');
    assert(typeof k2.data.error === 'string' && !JSON.stringify(k2.data).includes('at '),
      '8c. 404 carries no stack trace');
    const k3 = await requestRaw(port, 'POST', '/api/parse-query', '{bad json');
    assert(k3.status === 400 && k3.data.valid === false, '8d. malformed JSON -> 400 JSON');
    assert(!JSON.stringify(k3.data).toLowerCase().includes('stack'),
      '8e. body-parser errors leak no stack');

    // -----------------------------------------------------------------------
    // 9. Production-readiness warnings
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 9. Production-readiness warnings ----------------------------');
    const wDev = getProductionReadinessWarnings({ NODE_ENV: 'development' } as NodeJS.ProcessEnv);
    assert(wDev.length === 0, '9a. no warnings outside production');
    const wProd = getProductionReadinessWarnings({ NODE_ENV: 'production' } as NodeJS.ProcessEnv);
    assert(
      wProd.some((w) => w.includes('SATQUERY_API_KEY')) &&
      wProd.some((w) => w.includes('ENFORCE_HTTPS')) &&
      wProd.some((w) => w.includes('TRUST_PROXY')),
      '9b. production without hardening flags warns on all three'
    );
    const wOk = getProductionReadinessWarnings({
      NODE_ENV: 'production',
      SATQUERY_API_KEY: 'k',
      ENFORCE_HTTPS: 'true',
      TRUST_PROXY: '1'
    } as NodeJS.ProcessEnv);
    assert(wOk.length === 0, '9c. hardened production is silent');

    restoreEnv();
    resetRateLimitState();
  } finally {
    restoreEnv();
    resetRateLimitState();
    setSecurityEventSink(null);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('');
  console.log('==================================================================');
  const total = passed + failed;
  if (failed === 0) {
    console.log('  ALL ' + total + ' ASSERTIONS PASSED - Secure Deployment Configuration Verified.');
  } else {
    console.log('  ' + failed + '/' + total + ' ASSERTIONS FAILED');
  }
  console.log('==================================================================');
  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('[Production Security Test Error]', err);
  process.exit(1);
});
