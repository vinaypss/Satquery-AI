/**
 * SatQuery AI — Stage 6G Optical-SAR Fusion End-to-End Integration Test
 * SIH26167 | ISRO / Department of Space | Team IMPOSTERS
 *
 * Exercises the full pipeline:
 *   parse-query → route-task → execute-task
 *   → tool_optical_sar_specialist → OpticalSarSpecialistAdapter
 *   → Dual-Stream worker attempt → truthful offline state (no fake fusion results)
 */

import http from 'http';
import { AddressInfo } from 'net';
import { createServerApp } from '../index.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log('  \u2713 PASS: ' + label);
    passed++;
  } else {
    console.error('  \u2717 FAIL: ' + label + (detail ? '\n         ' + detail : ''));
    failed++;
  }
}

interface HttpResponse {
  status: number;
  data: any;
}

function postJson(port: number, path: string, body: any): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options: http.RequestOptions = {
      hostname: '127.0.0.1',
      port,
      path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
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
    req.write(payload);
    req.end();
  });
}

// Minimal 1×1 transparent PNG (base64)
const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const OPTICAL_IMAGE = {
  id: 'img-optical',
  name: 'delhi_optical.png',
  mimeType: 'image/png',
  modality: 'OPTICAL',
  dataUri: TINY_PNG,
  geographicArea: 'Delhi',
  acquisitionDate: '2024-06-01'
};

const SAR_IMAGE = {
  id: 'img-sar',
  name: 'delhi_sar.png',
  mimeType: 'image/png',
  modality: 'SAR',
  dataUri: TINY_PNG,
  geographicArea: 'Delhi',
  acquisitionDate: '2024-06-01'
};

async function run() {
  console.log('');
  console.log('==================================================================');
  console.log('  SatQuery AI Stage 6G Optical-SAR Fusion Full Pipeline E2E Test');
  console.log('  SIH26167 | ISRO Space Technology | Team IMPOSTERS');
  console.log('==================================================================');
  console.log('');

  const app = createServerApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as AddressInfo;
  const port = address.port;
  console.log('  [Server] http://127.0.0.1:' + port);
  console.log('');

  try {
    // STEP 1: Parse query
    console.log('-- STEP 1: POST /api/parse-query (\"Compare optical and SAR imagery\") --');
    const p = await postJson(port, '/api/parse-query', { query: 'Compare optical and SAR imagery' });
    assert(p.status === 200, '1a. HTTP 200 from parse-query');
    assert(p.data.valid === true, '1b. valid=true');
    const pq = p.data.parsedQuery;
    assert(!!pq, '1c. parsedQuery present');
    assert(pq?.taskType === 'optical_sar', '1d. taskType=optical_sar (got: ' + pq?.taskType + ')');
    console.log('     rawQuery : ' + pq?.rawQuery);
    console.log('     taskType : ' + pq?.taskType);
    console.log('');

    // STEP 2: Route task
    console.log('-- STEP 2: POST /api/route-task -----------------------------------');
    const r = await postJson(port, '/api/route-task', { parsedQuery: pq, images: [OPTICAL_IMAGE, SAR_IMAGE] });
    assert(r.status === 200, '2a. HTTP 200 from route-task');
    assert(r.data.valid === true, '2b. valid=true');
    const rr = r.data.routingResult;
    assert(rr?.selectedToolId === 'tool_optical_sar_specialist', '2c. selectedToolId=tool_optical_sar_specialist (got: ' + rr?.selectedToolId + ')');
    assert(rr?.taskType === 'optical_sar', '2d. taskType=optical_sar');
    assert(rr?.routingStatus === 'routed', '2e. routingStatus=routed (got: ' + rr?.routingStatus + ')');
    console.log('     selectedToolId : ' + rr?.selectedToolId);
    console.log('     routingStatus  : ' + rr?.routingStatus);
    console.log('     confidence     : ' + rr?.confidence);
    console.log('');

    // STEP 3: Execute task
    console.log('-- STEP 3: POST /api/execute-task → OpticalSarSpecialistAdapter ----');
    const e = await postJson(port, '/api/execute-task', { routingResult: rr, parsedQuery: pq, images: [OPTICAL_IMAGE, SAR_IMAGE] });
    assert(e.status === 200, '3a. HTTP 200 from execute-task');
    assert(e.data.valid === true, '3b. valid=true');
    const out = e.data.output;
    assert(!!out, '3c. output present');
    assert(out?.toolId === 'tool_optical_sar_specialist', '3d. output.toolId=tool_optical_sar_specialist (got: ' + out?.toolId + ')');
    console.log('');

    // STEP 4: Output Integrity (dual-path: CUDA online vs CPU offline)
    console.log('-- STEP 4: Specialist Output Integrity ----------------------------');
    const online = out?.status === 'complete';
    const offline = out?.status === 'failed' || out?.status === 'rejected';

    if (online) {
      console.log('  [WORKER ONLINE — real dual-stream optical-SAR fusion path]');
      assert(out.evidence?.evidenceType === 'modality_comparison', '4a. evidenceType=modality_comparison');
      assert(typeof out.evidence?.modalityComparison === 'object', '4b. modalityComparison present');
      const mc = out.evidence?.modalityComparison as Record<string, unknown>;
      assert(mc?.provenance === 'MODEL_GENERATED', '4c. provenance=MODEL_GENERATED');
      assert(typeof mc?.metrics === 'object', '4d. metrics object present');
      assert(out.evidence?.evidenceType !== 'none', '4e. evidenceType is not none (real inference)');
    } else {
      console.log('  [WORKER OFFLINE — truthful failure, expected on CPU host]');
      assert(offline, '4a. status=failed or rejected (got: ' + out?.status + ')');
      assert(out?.evidence?.evidenceType === 'none', '4b. evidenceType=none when offline');
      assert(out?.evidence?.modalityComparison === undefined || out?.evidence?.modalityComparison === null,
        '4c. ZERO fake/synthetic cross-modal fusion evidence (SIH26167 integrity)');
      assert(typeof out?.rejectionReason === 'string' && out.rejectionReason.length > 0, '4d. rejectionReason present');
    }

    // STEP 5: Execution Metrics & metadataNotes
    console.log('');
    console.log('-- STEP 5: Execution Metrics -------------------------------------');
    assert(typeof out?.executionMetrics?.durationMs === 'number', '5a. durationMs present (' + out?.executionMetrics?.durationMs + 'ms)');
    assert(typeof out?.executionMetrics?.modelName === 'string' && out.executionMetrics.modelName.length > 0, '5b. modelName="' + out?.executionMetrics?.modelName + '"');
    assert(Array.isArray(out?.metadataNotes) && out.metadataNotes.length > 0, '5c. metadataNotes present');
    assert((out?.metadataNotes || []).join(' ').includes('tool_optical_sar_specialist'), '5d. metadataNotes references tool_optical_sar_specialist');

    // STEP 6: Anti-fabrication contract
    console.log('');
    console.log('-- STEP 6: Anti-Fabrication Contract (SIH26167) ------------------');
    if (!online) {
      const evType = out?.evidence?.evidenceType;
      assert(evType === 'none', '6a. Non-CUDA result has evidenceType=none');
      const mc = out?.evidence?.modalityComparison;
      assert(mc === undefined || mc === null, '6b. No fabricated modalityComparison evidence on CPU');
    } else {
      assert(out?.evidence?.evidenceType === 'modality_comparison', '6a. CUDA result has evidenceType=modality_comparison');
      const mc = out?.evidence?.modalityComparison as Record<string, unknown> | undefined;
      assert(mc?.provenance === 'MODEL_GENERATED', '6b. CUDA evidence has provenance=MODEL_GENERATED');
    }

    console.log('');
    console.log('     status         : ' + out?.status);
    console.log('     toolId         : ' + out?.toolId);
    console.log('     evidenceType   : ' + out?.evidence?.evidenceType);
    console.log('     durationMs     : ' + out?.executionMetrics?.durationMs + 'ms');
    console.log('     modelName      : ' + out?.executionMetrics?.modelName);
    if (out?.rejectionReason) console.log('     rejectionReason: ' + out.rejectionReason);

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('');
  console.log('==================================================================');
  const total = passed + failed;
  if (failed === 0) {
    console.log('  ALL ' + total + ' ASSERTIONS PASSED - Optical-SAR Fusion E2E pipeline verified.');
  } else {
    console.log('  ' + failed + '/' + total + ' ASSERTIONS FAILED');
  }
  console.log('==================================================================');
  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => { console.error('[E2E] Error:', err); process.exit(1); });
