/**
 * SatQuery AI — SECURITY PHASE 4: Abuse Protection Regression Tests
 * SIH26167 | ISRO / Department of Space | Team IMPOSTERS
 *
 * Tiered server-side rate limits + API-key brute-force containment.
 * No login/signup/password-reset accounts exist (verified by audit), so
 * those attack surfaces are asserted absent (404) and the shared API-key
 * gate stands in for credential brute-force protection.
 *
 * Tiers under test: inference (/api/analyze + /api/execute-task, shared),
 * upload (/api/validate-image), external (/api/catalog/search), general.
 */

import http from 'http';
import { AddressInfo } from 'net';
import { createServerApp } from '../index.js';
import { resetRateLimitState } from './secureDefaults.js';
import { resetAuthFailureState } from './accessControl.js';

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

function requestJson(
  port: number,
  method: string,
  path: string,
  body?: any,
  headers?: Record<string, string>
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? '' : JSON.stringify(body);
    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
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
    if (payload) req.write(payload);
    req.end();
  });
}

function header(res: HttpResponse, name: string): string | undefined {
  const value = res.headers[name.toLowerCase()];
  return Array.isArray(value) ? value.join(', ') : value;
}

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const OPTICAL_IMAGE = {
  id: 'img-abuse-opt',
  name: 'abuse_optical.png',
  mimeType: 'image/png',
  modality: 'OPTICAL',
  dataUri: TINY_PNG,
  geographicArea: 'Delhi',
  acquisitionDate: '2024-05-12'
};

const ANALYZE_BODY = {
  query: 'Where are the buildings?',
  images: [OPTICAL_IMAGE]
};

const EXECUTE_BODY = {
  routingResult: {
    taskId: 't-abuse',
    selectedToolId: 'tool_vqa_specialist',
    taskType: 'vqa',
    routingStatus: 'routed',
    confidence: 1,
    reasoning: 'test',
    requiredInputs: {},
    compatibilityStatus: 'compatible',
    compatibilityErrors: [],
    warnings: []
  },
  parsedQuery: {
    rawQuery: 'Where are the buildings?',
    taskType: 'vqa',
    confidence: 0.95,
    targetFeatures: ['buildings'],
    requestedObjects: [],
    temporalIntent: false,
    comparisonIntent: false,
    modalityIntent: 'optical',
    requiresMultipleImages: false,
    explanation: 'test'
  },
  images: [OPTICAL_IMAGE]
};

const TEST_KEY = 'phase4-abuse-test-key';
const RATE_VARS = [
  'SATQUERY_API_KEY',
  'RATE_LIMIT_WINDOW_MS',
  'RATE_LIMIT_MAX_REQUESTS',
  'RATE_LIMIT_INFERENCE_MAX',
  'RATE_LIMIT_UPLOAD_MAX',
  'RATE_LIMIT_EXTERNAL_MAX',
  'RATE_LIMIT_AUTH_MAX',
  'RATE_LIMIT_AUTH_WINDOW_MS'
] as const;

async function run() {
  console.log('');
  console.log('==================================================================');
  console.log('  SatQuery AI SECURITY PHASE 4 — Abuse Protection Regression');
  console.log('  SIH26167 | ISRO Space Technology | Team IMPOSTERS');
  console.log('==================================================================');
  console.log('');

  const savedEnv: Record<string, string | undefined> = {};
  for (const key of RATE_VARS) savedEnv[key] = process.env[key];
  const restoreEnv = () => {
    for (const key of RATE_VARS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key] as string;
    }
  };
  const resetAll = () => {
    restoreEnv();
    resetRateLimitState();
    resetAuthFailureState();
  };

  const app = createServerApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as AddressInfo;
  const port = address.port;

  try {
    // -----------------------------------------------------------------------
    // 1. Legitimate traffic functional under default budgets
    // -----------------------------------------------------------------------
    console.log('-- 1. Legitimate requests functional ---------------------------');
    resetAll();
    const ok1 = await requestJson(port, 'POST', '/api/analyze', ANALYZE_BODY);
    assert(ok1.status === 200 && ok1.data.valid === true, '1a. analyze succeeds within budget');
    const ok2 = await requestJson(port, 'GET', '/api/health');
    assert(ok2.status === 200, '1b. health probes never throttled');

    // -----------------------------------------------------------------------
    // 2. Inference tier: strict budget shared by analyze + execute-task
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 2. AI inference tier (anti-bypass shared bucket) ------------');
    resetAll();
    process.env.RATE_LIMIT_INFERENCE_MAX = '3';
    const i1 = await requestJson(port, 'POST', '/api/analyze', ANALYZE_BODY);
    const i2 = await requestJson(port, 'POST', '/api/analyze', ANALYZE_BODY);
    const i3 = await requestJson(port, 'POST', '/api/analyze', ANALYZE_BODY);
    assert(i1.status === 200 && i2.status === 200 && i3.status === 200,
      '2a. requests within inference budget pass');
    const i4 = await requestJson(port, 'POST', '/api/analyze', ANALYZE_BODY);
    assert(i4.status === 429, '2b. inference request over budget -> 429');
    assert(i4.data.valid === false && typeof header(i4, 'retry-after') === 'string',
      '2c. 429 is safe JSON with Retry-After');
    const i5 = await requestJson(port, 'POST', '/api/execute-task', EXECUTE_BODY);
    assert(i5.status === 429,
      '2d. equivalent endpoint /api/execute-task shares the budget (no bypass)');
    const i6 = await requestJson(port, 'GET', '/api/model-audit');
    assert(i6.status === 200, '2e. cheap reads unaffected by inference exhaustion');

    // -----------------------------------------------------------------------
    // 3. Upload tier
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 3. Upload tier ----------------------------------------------');
    resetAll();
    process.env.RATE_LIMIT_UPLOAD_MAX = '2';
    const u1 = await requestJson(port, 'POST', '/api/validate-image', { image: OPTICAL_IMAGE });
    const u2 = await requestJson(port, 'POST', '/api/validate-image', { image: OPTICAL_IMAGE });
    assert(u1.status === 200 && u2.status === 200, '3a. uploads within budget pass');
    const u3 = await requestJson(port, 'POST', '/api/validate-image', { image: OPTICAL_IMAGE });
    assert(u3.status === 429 && u3.data.valid === false, '3b. repeated uploads over budget -> 429');

    // -----------------------------------------------------------------------
    // 4. External-service tier (upstream CDSE cost)
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 4. External-service tier ------------------------------------');
    resetAll();
    process.env.RATE_LIMIT_EXTERNAL_MAX = '2';
    const e1 = await requestJson(port, 'POST', '/api/catalog/search', { bogus: true });
    const e2 = await requestJson(port, 'POST', '/api/catalog/search', { bogus: true });
    assert(e1.status !== 429 && e2.status !== 429, '4a. searches within budget reach the handler');
    const e3 = await requestJson(port, 'POST', '/api/catalog/search', { bogus: true });
    assert(e3.status === 429, '4b. repeated upstream calls over budget -> 429');

    // -----------------------------------------------------------------------
    // 5. Credential brute-force tarpit (no login accounts exist)
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 5. API-key brute-force containment --------------------------');
    resetAll();
    process.env.SATQUERY_API_KEY = TEST_KEY;
    process.env.RATE_LIMIT_AUTH_MAX = '3';
    process.env.RATE_LIMIT_AUTH_WINDOW_MS = '60000';
    const b1 = await requestJson(port, 'GET', '/api/model-audit', undefined, { Authorization: 'Bearer wrong-1' });
    const b2 = await requestJson(port, 'GET', '/api/model-audit', undefined, { Authorization: 'Bearer wrong-2' });
    const b3 = await requestJson(port, 'GET', '/api/model-audit', undefined, { Authorization: 'Bearer wrong-3' });
    assert(b1.status === 401 && b2.status === 401 && b3.status === 401,
      '5a. wrong credentials rejected (401) within failure budget');
    const b4 = await requestJson(port, 'GET', '/api/model-audit', undefined, {
      Authorization: `Bearer ${TEST_KEY}`
    });
    assert(b4.status === 429, '5b. burned IP tar-pitted with 429 even for the correct key');
    assert(!JSON.stringify(b4.data).includes('RATE_LIMIT') && !JSON.stringify(b4.data).includes('SATQUERY'),
      '5c. tarpit response leaks no security configuration');
    resetAuthFailureState();
    const b5 = await requestJson(port, 'GET', '/api/model-audit', undefined, {
      Authorization: `Bearer ${TEST_KEY}`
    });
    assert(b5.status === 200, '5d. legitimate credential works after window reset');

    // -----------------------------------------------------------------------
    // 6. Credential rotation grants no extra budget (shared IP bucket)
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 6. No bypass via credential rotation ------------------------');
    resetAll();
    process.env.SATQUERY_API_KEY = TEST_KEY;
    process.env.RATE_LIMIT_INFERENCE_MAX = '4';
    const keyHeader = { Authorization: `Bearer ${TEST_KEY}` };
    await requestJson(port, 'POST', '/api/analyze', ANALYZE_BODY, keyHeader);
    await requestJson(port, 'POST', '/api/analyze', ANALYZE_BODY, keyHeader);
    await requestJson(port, 'POST', '/api/analyze', ANALYZE_BODY, {
      Authorization: 'Bearer attacker-token-1'
    });
    await requestJson(port, 'POST', '/api/analyze', ANALYZE_BODY, {
      Authorization: 'Bearer attacker-token-2'
    });
    const r6 = await requestJson(port, 'POST', '/api/analyze', ANALYZE_BODY, keyHeader);
    assert(r6.status === 429, '6a. rotating credentials does not escape the shared IP budget');

    // -----------------------------------------------------------------------
    // 7. No account endpoints exist to abuse; enumeration contained
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 7. Absent account surfaces + enumeration --------------------');
    resetAll();
    for (const path of ['/api/login', '/api/signup', '/api/password-reset']) {
      const r = await requestJson(port, 'POST', path, {});
      assert(r.status === 404, `7a. ${path} -> 404 (no such account endpoint)`);
    }
    const r7b = await requestJson(port, 'GET', '/api/model-audit?taskType=admin');
    assert(r7b.status === 404, '7b. unknown taskType enumerates nothing (404)');
    const r7c = await requestJson(port, 'GET', `/api/model-audit?taskType=${'x'.repeat(5000)}`);
    assert(r7c.status === 404, '7c. oversized taskType handled without error');

    // -----------------------------------------------------------------------
    // 8. Legitimate traffic fully functional after restore
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 8. Recovery -------------------------------------------------');
    resetAll();
    const f1 = await requestJson(port, 'POST', '/api/analyze', ANALYZE_BODY);
    const f2 = await requestJson(port, 'POST', '/api/validate-image', { image: OPTICAL_IMAGE });
    const f3 = await requestJson(port, 'GET', '/api/model-audit');
    assert(f1.status === 200 && f2.status === 200 && f3.status === 200,
      '8a. all tiers serve legitimate traffic after reset');

    resetAll();
  } finally {
    resetAll();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('');
  console.log('==================================================================');
  const total = passed + failed;
  if (failed === 0) {
    console.log('  ALL ' + total + ' ASSERTIONS PASSED - Abuse Protection Verified.');
  } else {
    console.log('  ' + failed + '/' + total + ' ASSERTIONS FAILED');
  }
  console.log('==================================================================');
  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('[Abuse Protection Test Error]', err);
  process.exit(1);
});
