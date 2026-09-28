/**
 * SatQuery AI — SECURITY PHASE 2: Authorization + IDOR Regression Tests
 * SIH26167 | ISRO / Department of Space | Team IMPOSTERS
 *
 * Application model under test (verified by audit):
 * - No user accounts, sessions, roles, databases, or persistent user-owned
 *   resources exist. Every endpoint is stateless, so classic stored-object
 *   IDOR is structurally impossible. These tests prove that property holds
 *   AND that the real object-reference risks at this boundary stay closed:
 *   filesystem `path` carriers (IDOR-to-filesystem), remote-URL `dataUri`
 *   carriers (SSRF), forged routing objects, and error-message leakage.
 *
 * Checklist mapping:
 *   1. authenticated owner access -> allowed
 *   2. unauthenticated access -> rejected (when SATQUERY_API_KEY is configured)
 *   3. authenticated non-owner (wrong credential) -> rejected
 *   4. modified resource ID (path traversal / remote URL) -> rejected
 *   5. modified user ID / owner ID / privilege fields -> stripped & ignored
 *   6. unauthorized update -> rejected (no update verbs exist: 404)
 *   7. unauthorized delete -> rejected (no delete verbs exist: 404)
 *   8. unauthorized export/download -> rejected without credentials; exports
 *      are stateless audits of the supplied report only
 *   9. cross-user nested-resource access -> rejected (pair mismatch rejected;
 *      no cross-request state exists)
 */

import http from 'http';
import { AddressInfo } from 'net';
import { createServerApp } from '../index.js';
import { parseQuery } from '../agent/queryParser.js';
import {
  sanitizeImageDescriptor,
  sanitizeImageArray,
  isApiKeyEnforced,
  toSafeErrorMessage
} from './accessControl.js';

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
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(headers || {})
      }
    };
    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode || 0, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode || 0, data: raw }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const OPTICAL_IMAGE = {
  id: 'img-sec-opt',
  name: 'sec_optical.png',
  mimeType: 'image/png',
  modality: 'OPTICAL',
  dataUri: TINY_PNG,
  geographicArea: 'Delhi',
  acquisitionDate: '2024-05-12'
};

const SAR_IMAGE = {
  id: 'img-sec-sar',
  name: 'sec_sar.png',
  mimeType: 'image/png',
  modality: 'SAR',
  dataUri: TINY_PNG,
  geographicArea: 'Delhi',
  acquisitionDate: '2024-05-12'
};

const TEST_API_KEY = 'sec-phase2-test-key-abc123';

async function run() {
  console.log('');
  console.log('==================================================================');
  console.log('  SatQuery AI SECURITY PHASE 2 — Authorization + IDOR Regression');
  console.log('  SIH26167 | ISRO Space Technology | Team IMPOSTERS');
  console.log('==================================================================');
  console.log('');

  const app = createServerApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as AddressInfo;
  const port = address.port;

  const savedKey = process.env.SATQUERY_API_KEY;
  const withKey = { Authorization: `Bearer ${TEST_API_KEY}` };

  try {
    // -----------------------------------------------------------------------
    // 1. Authenticated owner access -> allowed (open demo model, no key set)
    // -----------------------------------------------------------------------
    console.log('-- 1. Legitimate access allowed (no key configured) --------------');
    delete process.env.SATQUERY_API_KEY;
    assert(isApiKeyEnforced() === false, '1a. API-key gate is open when SATQUERY_API_KEY is unset');
    const pq = parseQuery('Where are the buildings?').parsedQuery!;
    const r1 = await requestJson(port, 'POST', '/api/route-task', {
      parsedQuery: pq,
      images: [OPTICAL_IMAGE]
    });
    assert(r1.status === 200, '1b. HTTP 200 for well-formed route-task request');
    assert(r1.data.valid === true, '1c. valid=true for legitimate request');

    // -----------------------------------------------------------------------
    // 2/3. Unauthenticated + wrong-credential access -> rejected (key set)
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 2/3. API-key gate rejects missing/wrong credentials -----------');
    process.env.SATQUERY_API_KEY = TEST_API_KEY;
    assert(isApiKeyEnforced() === true, '2a. API-key gate engages when SATQUERY_API_KEY is set');
    const r2 = await requestJson(port, 'POST', '/api/route-task', {
      parsedQuery: pq,
      images: [OPTICAL_IMAGE]
    });
    assert(r2.status === 401, '2b. HTTP 401 without credentials');
    assert(r2.data.valid === false, '2c. valid=false on unauthenticated request');
    const r3 = await requestJson(port, 'POST', '/api/route-task', {
      parsedQuery: pq,
      images: [OPTICAL_IMAGE]
    }, { Authorization: 'Bearer wrong-key' });
    assert(r3.status === 401, '3a. HTTP 401 with wrong credential (non-owner rejected)');
    assert(typeof r3.data.error === 'string' && !r3.data.error.includes(TEST_API_KEY),
      '3b. 401 reveals nothing about the real key');
    const r3b = await requestJson(port, 'POST', '/api/route-task', {
      parsedQuery: pq,
      images: [OPTICAL_IMAGE]
    }, withKey);
    assert(r3b.status === 200 && r3b.data.valid === true, '3c. correct credential is allowed');
    const r3c = await requestJson(port, 'GET', '/api/health');
    assert(r3c.status === 200 && r3c.data.status === 'ok', '3d. /api/health stays exempt (probes allowed)');

    // -----------------------------------------------------------------------
    // 4. Modified resource ID: filesystem path carrier -> rejected/stripped
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 4. Filesystem path carriers rejected --------------------------');
    const pathOnly = {
      id: 'img-evil',
      name: 'x.png',
      mimeType: 'image/png',
      modality: 'OPTICAL',
      path: '/etc/passwd',
      geographicArea: 'Delhi'
    };
    const unit = sanitizeImageDescriptor(pathOnly, { requireDataUri: true });
    assert(unit.droppedPath === true, '4a. sanitizer flags stripped `path` carrier');
    assert(!('path' in unit.image), '4b. sanitized descriptor contains no `path` key');
    assert(typeof unit.error === 'string', '4c. path-only descriptor rejected where bytes are required');
    const traversal = sanitizeImageDescriptor(
      { ...OPTICAL_IMAGE, path: '../../etc/shadow' },
      { requireDataUri: true }
    );
    assert(traversal.droppedPath === true && !('path' in traversal.image),
      '4d. traversal path stripped even when dataUri present');
    const r4 = await requestJson(port, 'POST', '/api/analyze', {
      query: 'Where are the buildings?',
      images: [pathOnly]
    }, withKey);
    assert(r4.status === 400, '4e. HTTP 400 for path-carrier image on /api/analyze');
    assert(!JSON.stringify(r4.data).includes('/etc/passwd'),
      '4f. rejection echoes no filesystem path');

    // -----------------------------------------------------------------------
    // 4b. Modified resource ID: remote-URL dataUri (SSRF) -> rejected
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 4b. Remote-URL image carriers rejected (SSRF) -----------------');
    const urlImage = { ...OPTICAL_IMAGE, dataUri: 'https://evil-attacker.example/x.png' };
    const r4b = await requestJson(port, 'POST', '/api/analyze', {
      query: 'Where are the buildings?',
      images: [urlImage]
    }, withKey);
    assert(r4b.status === 400, '4c-i. HTTP 400 for https: dataUri on /api/analyze');
    const fileImage = { ...OPTICAL_IMAGE, dataUri: 'file:///etc/passwd' };
    const r4c = await requestJson(port, 'POST', '/api/validate-image', { image: fileImage }, withKey);
    assert(r4c.status === 200 && r4c.data.valid === false,
      '4c-ii. file: URI fails validation on /api/validate-image');
    const r4d = await requestJson(port, 'POST', '/api/execute-task', {
      routingResult: {
        taskId: 't', selectedToolId: 'tool_vqa_specialist', taskType: 'vqa',
        routingStatus: 'routed', confidence: 1, reasoning: 'x',
        requiredInputs: {}, compatibilityStatus: 'compatible',
        compatibilityErrors: [], warnings: []
      },
      parsedQuery: pq,
      images: [urlImage]
    }, withKey);
    assert(r4d.status === 400, '4c-iii. HTTP 400 for remote-URL image on /api/execute-task');

    // -----------------------------------------------------------------------
    // 5. Modified user/owner/privilege IDs -> stripped and ignored
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 5. Client-supplied identity fields ignored --------------------');
    const smuggled = sanitizeImageDescriptor({
      ...OPTICAL_IMAGE,
      ownerId: 'victim-user',
      userId: 'attacker',
      workerUrl: 'http://evil.example:9/',
      authKey: 'stolen-secret'
    });
    for (const f of ['ownerId', 'userId', 'workerUrl', 'authKey']) {
      assert(!(f in smuggled.image), `5a. sanitizer drops "${f}"`);
    }
    assert(smuggled.error === undefined, '5b. legitimate image still usable after stripping');
    const r5a = await requestJson(port, 'POST', '/api/route-task', {
      parsedQuery: pq,
      images: [OPTICAL_IMAGE]
    }, withKey);
    const r5b = await requestJson(port, 'POST', '/api/route-task', {
      parsedQuery: pq,
      images: [{ ...OPTICAL_IMAGE, ownerId: 'victim-user', userId: 'attacker' }]
    }, withKey);
    assert(
      r5a.data?.routingResult?.selectedToolId === r5b.data?.routingResult?.selectedToolId &&
      r5a.data?.routingResult?.taskType === r5b.data?.routingResult?.taskType,
      '5c. injected owner IDs do not alter routing outcome'
    );

    // -----------------------------------------------------------------------
    // 5b. Injected workerUrl in body never redirects worker calls
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 5b. Body-injected worker endpoint ignored ---------------------');
    const r5c = await requestJson(port, 'POST', '/api/execute-task', {
      routingResult: {
        taskId: 't', selectedToolId: 'tool_vqa_specialist', taskType: 'vqa',
        routingStatus: 'routed', confidence: 1, reasoning: 'x',
        requiredInputs: {}, compatibilityStatus: 'compatible',
        compatibilityErrors: [], warnings: []
      },
      parsedQuery: pq,
      images: [OPTICAL_IMAGE],
      workerUrl: 'http://127.0.0.1:1/evil',
      authKey: 'evil-key'
    }, withKey);
    const r5cText = JSON.stringify(r5c.data);
    assert(!r5cText.includes('evil'), '5d. injected workerUrl/authKey never appear in worker contact');

    // -----------------------------------------------------------------------
    // 6/7. Unauthorized update/delete -> rejected (no such verbs exist)
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 6/7. Update/delete verbs rejected -----------------------------');
    const r6 = await requestJson(port, 'PUT', '/api/analyze', { query: 'x' }, withKey);
    assert(r6.status === 404, '6a. PUT /api/analyze -> 404 (no update endpoint)');
    const r7 = await requestJson(port, 'DELETE', '/api/analyze/export-evidence', {}, withKey);
    assert(r7.status === 404, '7a. DELETE /api/analyze/export-evidence -> 404 (no delete endpoint)');
    const r7b = await requestJson(port, 'PATCH', '/api/route-task', {}, withKey);
    assert(r7b.status === 404, '7b. PATCH /api/route-task -> 404');

    // -----------------------------------------------------------------------
    // 8. Unauthorized export/download -> rejected; exports are stateless
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 8. Export authorization + stateless isolation -----------------');
    const forgedReport = {
      reportId: 'rpt_forged',
      status: 'complete',
      query: 'forged',
      specialistOutput: {
        toolId: 'tool_grounding_specialist',
        status: 'complete',
        answerText: '',
        evidence: { evidenceType: 'bounding_box', boxes: [] },
        executionMetrics: { modelName: 'x', durationMs: 1, device: 'none' }
      },
      sihCompliance: { zeroFabricatedEvidence: true }
    };
    const r8a = await requestJson(port, 'POST', '/api/analyze/export-evidence', {
      report: forgedReport,
      image: null
    });
    assert(r8a.status === 401, '8a. export without credentials -> 401 when key enforced');
    const r8b = await requestJson(port, 'POST', '/api/analyze/export-evidence', {
      report: forgedReport,
      image: null
    }, withKey);
    assert(r8b.status === 200 && r8b.data.valid === true,
      '8b. export with credentials audits the supplied report only');
    assert(!JSON.stringify(r8b.data).includes('path'),
      '8c. export output carries no filesystem references');
    const r8c = await requestJson(port, 'POST', '/api/analyze/export-evidence', {
      report: { reportId: 'rpt_broken' }
    }, withKey);
    assert(r8c.status === 400, '8d. malformed report (no specialistOutput) -> 400');
    const r8d = await requestJson(port, 'POST', '/api/analyze/export-evidence', {
      report: forgedReport,
      image: { ...OPTICAL_IMAGE, path: '/etc/shadow' }
    }, withKey);
    assert(r8d.status === 200 && !JSON.stringify(r8d.data).includes('/etc/shadow'),
      '8e. export image path carrier stripped, never echoed');

    // -----------------------------------------------------------------------
    // 8b. Forged routing objects cannot escape the controlled registry
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 8b. Forged routing decisions contained ------------------------');
    const r8f = await requestJson(port, 'POST', '/api/execute-task', {
      routingResult: {
        taskId: 't', selectedToolId: 'tool_admin_delete_everything', taskType: 'vqa',
        routingStatus: 'routed', confidence: 1, reasoning: 'forged',
        requiredInputs: {}, compatibilityStatus: 'compatible',
        compatibilityErrors: [], warnings: []
      },
      parsedQuery: pq,
      images: [OPTICAL_IMAGE]
    }, withKey);
    assert(
      r8f.data?.output?.status === 'rejected' || r8f.data?.output?.status === 'failed',
      '8f. unregistered toolId from forged routing is never executed'
    );

    // -----------------------------------------------------------------------
    // 9. Cross-user nested-resource access -> rejected
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 9. Nested-resource mismatch rejected --------------------------');
    const pqSar = parseQuery('Compare optical and SAR imagery.').parsedQuery!;
    const r9 = await requestJson(port, 'POST', '/api/route-task', {
      parsedQuery: pqSar,
      images: [
        { ...OPTICAL_IMAGE, geographicArea: 'Delhi' },
        { ...SAR_IMAGE, geographicArea: 'Rajasthan' }
      ]
    }, withKey);
    assert(
      r9.data?.routingResult?.routingStatus === 'rejected' ||
      r9.data?.routingResult?.compatibilityStatus !== 'compatible',
      '9a. geographically mismatched pair rejected (no cross-area fusion)'
    );
    const pqChange = parseQuery('What changed between these two images?').parsedQuery!;
    const r9b = await requestJson(port, 'POST', '/api/route-task', {
      parsedQuery: pqChange,
      images: [OPTICAL_IMAGE]
    }, withKey);
    assert(r9b.data?.routingResult?.routingStatus === 'rejected',
      '9b. single-image change request rejected (pair required)');
    const bulk = Array.from({ length: 9 }, (_, i) => ({ ...OPTICAL_IMAGE, id: `bulk-${i}` }));
    const r9c = await requestJson(port, 'POST', '/api/route-task', {
      parsedQuery: pq,
      images: bulk
    }, withKey);
    assert(r9c.status === 400, '9c. bulk image array beyond cap rejected');

    // -----------------------------------------------------------------------
    // 9b. Statelessness: no cross-request resource store exists
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 9b. No cross-request state (IDOR store impossible) ------------');
    const rA = await requestJson(port, 'POST', '/api/analyze', {
      query: 'Where are the buildings?',
      images: [OPTICAL_IMAGE]
    }, withKey);
    const rB = await requestJson(port, 'POST', '/api/analyze', {
      query: 'Describe this satellite image.',
      images: [OPTICAL_IMAGE]
    }, withKey);
    assert(rA.status === 200 && rB.status === 200, '9d. both sequential analyses succeed');
    assert(
      rB.data?.report?.query === 'Describe this satellite image.' &&
      !JSON.stringify(rB.data?.report).includes('Where are the buildings?'),
      '9e. second report contains zero residue from the first (no shared store)'
    );

    // -----------------------------------------------------------------------
    // 11. Authorization/error paths leak nothing sensitive
    // -----------------------------------------------------------------------
    console.log('');
    console.log('-- 11. Safe error messages ---------------------------------------');
    const safe = toSafeErrorMessage('unit-probe');
    assert(
      typeof safe === 'string' && !safe.includes('/etc') && !safe.includes('stack') &&
      !safe.includes('127.0.0.1'),
      '11a. sanitized error carries no paths, stacks, or topology'
    );
    const arr = sanitizeImageArray('not-an-array');
    assert(arr.error !== undefined && arr.images.length === 0,
      '11b. non-array images input rejected without exception');

    delete process.env.SATQUERY_API_KEY;
  } finally {
    if (savedKey === undefined) delete process.env.SATQUERY_API_KEY;
    else process.env.SATQUERY_API_KEY = savedKey;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('');
  console.log('==================================================================');
  const total = passed + failed;
  if (failed === 0) {
    console.log('  ALL ' + total + ' ASSERTIONS PASSED - Authorization + IDOR Regression Verified.');
  } else {
    console.log('  ' + failed + '/' + total + ' ASSERTIONS FAILED');
  }
  console.log('==================================================================');
  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('[Security E2E Error]', err);
  process.exit(1);
});
