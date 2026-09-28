/**
 * SatQuery AI — SECURITY PHASE 6: Input Validation + Injection Regression
 * SIH26167 | ISRO / Department of Space | Team IMPOSTERS
 *
 * Verified sink inventory: no SQL engine, no shell execution, no eval, no
 * server-side filesystem writes, no innerHTML/dangerouslySetInnerHTML in
 * the frontend. These tests prove hostile inputs are rejected or rendered
 * inert at every entry point — and that rejections never echo payloads.
 *
 * Categories: SQLi, command injection, path traversal, malicious
 * filenames, invalid file types, oversized uploads, malformed JSON,
 * invalid IDs, unexpected field types, XSS payloads, malicious external
 * URLs, invalid worker payloads.
 */

import http from 'http';
import { AddressInfo } from 'net';
import { createServerApp } from '../index.js';
import {
  validateQueryText,
  validateFilename,
  sanitizeFilename,
  isValidTaskType,
  sanitizeParsedQuery
} from './inputValidation.js';

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
  body?: any
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? '' : JSON.stringify(body);
    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {})
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
  id: 'img-inj-opt',
  name: 'inj_optical.png',
  mimeType: 'image/png',
  modality: 'OPTICAL',
  dataUri: TINY_PNG,
  geographicArea: 'Delhi',
  acquisitionDate: '2024-05-12'
};

async function run() {
  console.log('');
  console.log('==================================================================');
  console.log('  SatQuery AI SECURITY PHASE 6 — Input Validation + Injection');
  console.log('  SIH26167 | ISRO Space Technology | Team IMPOSTERS');
  console.log('==================================================================');
  console.log('');

  const app = createServerApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as AddressInfo;
  const port = address.port;

  try {
    // -----------------------------------------------------------------------
    // 1. SQL injection attempts are inert (no SQL sink exists)
    // -----------------------------------------------------------------------
    console.log('-- 1. SQL injection attempts inert -----------------------------');
    const s1 = await requestJson(port, 'POST', '/api/parse-query', {
      query: "Where are the buildings?' OR '1'='1' --"
    });
    assert(s1.status === 200 || s1.status === 400, '1a. SQLi query handled without server error');
    assert(!JSON.stringify(s1.data).toLowerCase().includes('sql') &&
      !JSON.stringify(s1.data).toLowerCase().includes('syntax error'),
      '1b. no SQL engine traces in response');
    const s2 = await requestJson(port, 'POST', '/api/analyze', {
      query: "'; DROP TABLE users; --",
      images: [OPTICAL_IMAGE]
    });
    assert(s2.status === 200, '1c. SQLi query treated as inert text (deterministic pipeline)');
    const s3 = await requestJson(port, 'GET', `/api/model-audit?taskType=${encodeURIComponent("vqa' OR '1'='1")}`);
    assert(s3.status === 404, '1d. SQLi taskType allowlist-rejected (404)');

    // -----------------------------------------------------------------------
    // 2. Command injection attempts are inert (no shell sink exists)
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 2. Command injection attempts inert -------------------------');
    const c1 = await requestJson(port, 'POST', '/api/analyze', {
      query: 'Where are the buildings; rm -rf /',
      images: [OPTICAL_IMAGE]
    });
    assert(c1.status === 200 && typeof c1.data?.report?.status === 'string',
      '2a. shell metachars in query processed as plain text');
    const c2 = await requestJson(port, 'POST', '/api/validate-image', {
      image: { ...OPTICAL_IMAGE, name: 'test;echo.png' }
    });
    assert(c2.status === 200, '2b. shell metachars in filename handled deterministically');
    const c3 = await requestJson(port, 'POST', '/api/analyze', {
      query: 'Find $(whoami) and `id` targets',
      images: [OPTICAL_IMAGE]
    });
    assert(c3.status === 200, '2c. substitution syntax inert (no shell)');

    // -----------------------------------------------------------------------
    // 3. Path traversal rejected, never echoed
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 3. Path traversal -------------------------------------------');
    for (const [label, evil] of [
      ['unix', '../../etc/passwd'],
      ['windows', '..\\..\\windows\\system32\\x.png'],
      ['absolute', '/abs/path.png'],
      ['drive', 'C:\\a.png']
    ] as Array<[string, string]>) {
      const r = await requestJson(port, 'POST', '/api/validate-image', {
        image: { ...OPTICAL_IMAGE, name: evil }
      });
      assert(r.status === 200 && r.data.valid === false, `3a. traversal filename rejected (${label})`);
      assert(!JSON.stringify(r.data).includes('passwd') && !JSON.stringify(r.data).includes('system32'),
        `3b. rejected payload not echoed (${label})`);
    }
    assert(validateFilename('../../x.png') !== null, '3c. unit: parent traversal rejected');
    assert(validateFilename('clean_scene-01.png') === null, '3d. unit: clean filename accepted');
    assert(sanitizeFilename('../../etc/passwd') === 'passwd', '3e. unit: sanitize yields safe basename');

    // -----------------------------------------------------------------------
    // 4. Malicious filenames
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 4. Malicious filenames --------------------------------------');
    const badNames: Array<[string, string]> = [
      ['null byte', 'a\0.png'],
      ['control char', 'a\x01.png'],
      ['angle brackets', 'evil<>.png'],
      ['reserved symbols', 'a?b|.png'],
      ['overlong', `${'a'.repeat(300)}.png`]
    ];
    for (const [label, evil] of badNames) {
      const r = await requestJson(port, 'POST', '/api/validate-image', {
        image: { ...OPTICAL_IMAGE, name: evil }
      });
      assert(r.status === 200 && r.data.valid === false, `4a. malicious filename rejected (${label})`);
    }

    // -----------------------------------------------------------------------
    // 5. Invalid file types (extension + content, not trust)
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 5. Invalid file types ---------------------------------------');
    const t1 = await requestJson(port, 'POST', '/api/validate-image', {
      image: { ...OPTICAL_IMAGE, name: 'payload.exe', mimeType: 'application/x-msdownload' }
    });
    assert(t1.data.valid === false, '5a. executable type rejected');
    const t2 = await requestJson(port, 'POST', '/api/validate-image', {
      image: { ...OPTICAL_IMAGE, name: 'fake.png', dataUri: 'data:image/png;base64,aGVsbG8td29ybGQ=' }
    });
    assert(t2.data.valid === false, '5b. text bytes with .png name rejected (magic bytes)');
    const t3 = await requestJson(port, 'POST', '/api/validate-image', {
      image: { ...OPTICAL_IMAGE, name: 'x.svg', mimeType: 'image/svg+xml' }
    });
    assert(t3.data.valid === false, '5c. SVG/scriptable type rejected');

    // -----------------------------------------------------------------------
    // 6. Oversized uploads
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 6. Oversized uploads ----------------------------------------');
    const o1 = await requestJson(port, 'POST', '/api/validate-image', {
      image: { ...OPTICAL_IMAGE, sizeBytes: 100 * 1024 * 1024 }
    });
    assert(o1.data.valid === false, '6a. inflated sizeBytes claim rejected');

    // -----------------------------------------------------------------------
    // 7. Malformed JSON / wrong types / overlong prompts
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 7. Malformed + mistyped inputs ------------------------------');
    for (const [label, query] of [
      ['number', 12345],
      ['array', ['Where are buildings?']],
      ['object', { text: 'x' }],
      ['null', null],
      ['boolean', true]
    ] as Array<[string, unknown]>) {
      const r = await requestJson(port, 'POST', '/api/analyze', { query, images: [OPTICAL_IMAGE] });
      assert(r.status === 400 && r.data.valid === false, `7a. non-string query rejected (${label})`);
    }
    const longQuery = `Where are the buildings? ${'x'.repeat(3000)}`;
    const rLong = await requestJson(port, 'POST', '/api/analyze', { query: longQuery, images: [OPTICAL_IMAGE] });
    assert(rLong.status === 400, '7b. overlong prompt rejected (2000-char cap)');
    assert(validateQueryText('  ok  ').ok === true, '7c. unit: normal query accepted');

    // -----------------------------------------------------------------------
    // 8. Invalid IDs
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 8. Invalid IDs ----------------------------------------------');
    for (const [label, taskType] of [
      ['array', ['vqa', 'caption']],
      ['object', { t: 'vqa' }],
      ['number', 42],
      ['oversized', 'vqa'.padEnd(5000, 'x')]
    ] as Array<[string, unknown]>) {
      const r = await requestJson(port, 'GET', `/api/model-audit?taskType=${encodeURIComponent(String(Array.isArray(taskType) ? taskType.join(',') : taskType))}`);
      assert(r.status === 404, `8a. invalid taskType rejected (${label})`);
    }
    const rEmpty = await requestJson(port, 'GET', '/api/model-audit?taskType=');
    assert(rEmpty.status === 200 && rEmpty.data.valid === true,
      '8a-ii. empty taskType returns the full audit (no filter), not an error');
    assert(isValidTaskType('vqa') === true && isValidTaskType('VQA') === false,
      '8b. unit: taskType allowlist is exact-match');
    const rId = await requestJson(port, 'POST', '/api/route-task', {
      parsedQuery: { rawQuery: 'Where are the buildings?', taskType: 'grounding', confidence: 0.9, targetFeatures: ['buildings'], requestedObjects: [], temporalIntent: false, comparisonIntent: false, modalityIntent: 'optical', requiresMultipleImages: false, explanation: 't' },
      images: [{ ...OPTICAL_IMAGE, id: 12345 }]
    });
    assert(rId.status === 200, '8c. non-string image id tolerated without crash');

    // -----------------------------------------------------------------------
    // 9. Unexpected field types
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 9. Unexpected field types -----------------------------------');
    const f1 = await requestJson(port, 'POST', '/api/route-task', {
      parsedQuery: { rawQuery: 'x', taskType: 'vqa' },
      images: { not: 'an-array' }
    });
    assert(f1.status === 400, '9a. non-array images rejected');
    const f2 = await requestJson(port, 'POST', '/api/execute-task', {
      routingResult: { taskId: 't', selectedToolId: 'tool_vqa_specialist', taskType: 'vqa', routingStatus: 'routed', confidence: 1, reasoning: 'x', requiredInputs: {}, compatibilityStatus: 'compatible', compatibilityErrors: [], warnings: [] },
      parsedQuery: ['not', 'an', 'object'],
      images: [OPTICAL_IMAGE]
    });
    assert(f2.status === 400, '9b. non-object parsedQuery rejected');
    const f3 = await requestJson(port, 'POST', '/api/execute-task', {
      routingResult: { taskId: 't', selectedToolId: 'tool_vqa_specialist', taskType: 'vqa', routingStatus: 'routed', confidence: 1, reasoning: 'x', requiredInputs: {}, compatibilityStatus: 'compatible', compatibilityErrors: [], warnings: [] },
      parsedQuery: { rawQuery: 'Where are the buildings?', taskType: 'vqa', targetFeatures: [1, 2, null], requestedObjects: 'oops' },
      images: [OPTICAL_IMAGE]
    });
    assert(f3.status === 200, '9c. mistyped arrays sanitized without crash');
    const f4 = await requestJson(port, 'POST', '/api/catalog/search', {
      bbox: 'https://evil.example/',
      startDate: '2024-01-01',
      endDate: '2024-02-01'
    });
    assert(f4.status === 400, '9d. non-array bbox rejected');
    const unitPQ = sanitizeParsedQuery({ rawQuery: 'q', taskType: 'vqa', targetFeatures: ['a', 7, null] });
    assert(unitPQ.ok === true && JSON.stringify((unitPQ.value as any).targetFeatures) === '["a"]',
      '9e. unit: non-string array entries dropped, strings kept');

    // -----------------------------------------------------------------------
    // 10. Script / XSS payloads (JSON API + React-escaped UI, no sinks)
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 10. XSS payloads --------------------------------------------');
    const xss = '<script>alert(1)</script>';
    const x1 = await requestJson(port, 'POST', '/api/analyze', {
      query: `Where are the buildings? ${xss}`,
      images: [OPTICAL_IMAGE]
    });
    assert(x1.status === 200, '10a. script payload in query processed as inert text');
    assert((header(x1, 'content-type') || '').includes('application/json'),
      '10b. response served as JSON, never HTML');
    const x2 = await requestJson(port, 'POST', '/api/validate-image', {
      image: { ...OPTICAL_IMAGE, name: '<img src=x onerror=alert(1)>.png' }
    });
    assert(x2.data.valid === false, '10c. markup in filename rejected');

    // -----------------------------------------------------------------------
    // 11. Malicious external URLs
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 11. Malicious external URLs ---------------------------------');
    const u1 = await requestJson(port, 'POST', '/api/catalog/search', {
      bbox: [77.5, 12.9, 77.7, 13.1],
      startDate: '2024-01-01',
      endDate: '2024-02-01',
      collections: ['https://evil.example/x']
    });
    assert(u1.status === 400, '11a. unallowlisted collection URL rejected');
    const u2 = await requestJson(port, 'POST', '/api/analyze', {
      query: 'Where are the buildings?',
      images: [{ ...OPTICAL_IMAGE, dataUri: 'http://169.254.169.254/latest/meta-data' }]
    });
    assert(u2.status === 400, '11b. cloud-metadata URL as image rejected (SSRF)');

    // -----------------------------------------------------------------------
    // 12. Invalid worker payloads
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 12. Invalid worker payloads ---------------------------------');
    const w1 = await requestJson(port, 'POST', '/api/analyze/export-evidence', {
      report: 'not-an-object',
      image: null
    });
    assert(w1.status === 400, '12a. string report rejected on export');
    const w2 = await requestJson(port, 'POST', '/api/execute-task', {
      routingResult: null,
      parsedQuery: null,
      images: []
    });
    assert(w2.status === 400, '12b. null routing/parsed query rejected');
    const w3 = await requestJson(port, 'POST', '/api/analyze', {
      query: 'Where are the buildings?',
      images: [{ ...OPTICAL_IMAGE, dataUri: 12345 }]
    });
    assert(w3.status === 400, '12c. numeric dataUri rejected');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('');
  console.log('==================================================================');
  const total = passed + failed;
  if (failed === 0) {
    console.log('  ALL ' + total + ' ASSERTIONS PASSED - Input Validation + Injection Verified.');
  } else {
    console.log('  ' + failed + '/' + total + ' ASSERTIONS FAILED');
  }
  console.log('==================================================================');
  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('[Input Validation Test Error]', err);
  process.exit(1);
});
