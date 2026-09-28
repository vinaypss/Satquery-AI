/**
 * SatQuery AI — Stage 7 Unified Result Integration & Reporting End-to-End Test
 * SIH26167 | ISRO / Department of Space | Team IMPOSTERS
 *
 * Exercises the unified /api/analyze route across multiple task workflows:
 *   1. Validation / bad query handling
 *   2. Ambiguous query routing handling
 *   3. Optical VQA pipeline & ResultReport schema
 *   4. Optical Grounding pipeline & ResultReport schema
 *   5. Modality incompatibility rejection handling
 *   6. Anti-fabrication guarantees (zero synthetic evidence)
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

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const OPTICAL_IMAGE = {
  id: 'img-delhi-opt',
  name: 'delhi_optical.png',
  mimeType: 'image/png',
  modality: 'OPTICAL',
  dataUri: TINY_PNG,
  geographicArea: 'Delhi',
  acquisitionDate: '2024-05-12'
};

const OPTICAL_IMAGE_T1 = {
  id: 'img-delhi-t1',
  name: 'delhi_2023.png',
  mimeType: 'image/png',
  modality: 'OPTICAL',
  dataUri: TINY_PNG,
  geographicArea: 'Delhi',
  acquisitionDate: '2023-03-15'
};

const OPTICAL_IMAGE_T2 = {
  id: 'img-delhi-t2',
  name: 'delhi_2024.png',
  mimeType: 'image/png',
  modality: 'OPTICAL',
  dataUri: TINY_PNG,
  geographicArea: 'Delhi',
  acquisitionDate: '2024-03-15'
};

const SAR_IMAGE = {
  id: 'img-delhi-sar',
  name: 'delhi_sar.png',
  mimeType: 'image/png',
  modality: 'SAR',
  dataUri: TINY_PNG,
  geographicArea: 'Delhi',
  acquisitionDate: '2024-05-12'
};

async function run() {
  console.log('');
  console.log('==================================================================');
  console.log('  SatQuery AI Stage 7 Unified Analysis & Reporting E2E Test');
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
    // -------------------------------------------------------------------------
    // STEP 1: Missing Query Rejection (HTTP 400)
    // -------------------------------------------------------------------------
    console.log('-- STEP 1: POST /api/analyze (Invalid / Empty Query) -------------');
    const res1 = await postJson(port, '/api/analyze', { query: '', images: [OPTICAL_IMAGE] });
    assert(res1.status === 400, '1a. HTTP 400 for empty query');
    assert(res1.data.valid === false, '1b. valid=false on missing query');
    assert(typeof res1.data.error === 'string', '1c. error message present on missing query');

    // -------------------------------------------------------------------------
    // STEP 2: Ambiguous Query (Routing Blocked)
    // -------------------------------------------------------------------------
    console.log('');
    console.log('-- STEP 2: POST /api/analyze (Ambiguous Query) -------------------');
    const res2 = await postJson(port, '/api/analyze', { query: 'Hello satellite', images: [OPTICAL_IMAGE] });
    assert(res2.status === 200, '2a. HTTP 200 response for graceful routing block');
    assert(res2.data.valid === true, '2b. valid=true in response envelope');
    const report2 = res2.data.report;
    assert(!!report2, '2c. report object generated');
    assert(report2?.status === 'routing_failed', '2d. status="routing_failed" for ambiguous query');
    assert(report2?.provenanceChain?.queryParsed === true, '2e. query was parsed');
    assert(report2?.provenanceChain?.taskRouted === false, '2f. task was not routed');
    assert(report2?.specialistOutput === null, '2g. specialistOutput is null when route fails');
    assert(typeof report2?.errorSummary === 'string', '2h. errorSummary provides explanation');

    // -------------------------------------------------------------------------
    // STEP 3: VQA Workflow Pipeline Execution
    // -------------------------------------------------------------------------
    console.log('');
    console.log('-- STEP 3: POST /api/analyze (VQA Pipeline Execution) ------------');
    const res3 = await postJson(port, '/api/analyze', {
      query: 'What is visible in this satellite scene?',
      images: [OPTICAL_IMAGE]
    });
    assert(res3.status === 200, '3a. HTTP 200 response for VQA analyze call');
    assert(res3.data.valid === true, '3b. valid=true in response envelope');
    const report3 = res3.data.report;
    assert(!!report3, '3c. report object present');
    assert(report3?.reportId?.startsWith('rpt_'), '3d. reportId starts with "rpt_"');
    assert(report3?.query === 'What is visible in this satellite scene?', '3e. report.query matches input');
    assert(report3?.parsedQuery?.taskType === 'vqa', '3f. parsedQuery taskType is vqa');
    assert(report3?.routingDecision?.selectedToolId === 'tool_vqa_specialist', '3g. routed to tool_vqa_specialist');
    assert(report3?.routingDecision?.routingStatus === 'routed', '3h. routingStatus is routed');
    assert(!!report3?.specialistOutput, '3i. specialistOutput is present');
    assert(report3?.specialistOutput?.toolId === 'tool_vqa_specialist', '3j. output toolId matches specialist');

    // Provenance chain inspection
    assert(report3?.provenanceChain?.queryParsed === true, '3k. provenance: queryParsed=true');
    assert(report3?.provenanceChain?.taskRouted === true, '3l. provenance: taskRouted=true');
    assert(report3?.provenanceChain?.specialistExecuted === true, '3m. provenance: specialistExecuted=true');
    assert(report3?.provenanceChain?.evidenceFabricated === false, '3n. provenance: evidenceFabricated=false strictly guaranteed');

    // Pipeline metrics
    assert(typeof report3?.pipelineMetrics?.parseMs === 'number', '3o. parseMs is numeric');
    assert(typeof report3?.pipelineMetrics?.routeMs === 'number', '3p. routeMs is numeric');
    assert(typeof report3?.pipelineMetrics?.executeMs === 'number', '3q. executeMs is numeric');
    assert(typeof report3?.pipelineMetrics?.totalMs === 'number', '3r. totalMs is numeric');

    // SIH26167 Compliance
    assert(report3?.sihCompliance?.zeroFabricatedEvidence === true, '3s. zeroFabricatedEvidence is true');
    assert(report3?.sihCompliance?.modelAuditRef === 'SIH26167-STAGE6A', '3t. modelAuditRef is SIH26167-STAGE6A');

    // -------------------------------------------------------------------------
    // STEP 4: Visual Grounding Pipeline Execution
    // -------------------------------------------------------------------------
    console.log('');
    console.log('-- STEP 4: POST /api/analyze (Visual Grounding Pipeline) ----------');
    const res4 = await postJson(port, '/api/analyze', {
      query: 'Where are the aircraft located?',
      images: [OPTICAL_IMAGE]
    });
    assert(res4.status === 200, '4a. HTTP 200 for grounding analyze call');
    const report4 = res4.data.report;
    assert(report4?.parsedQuery?.taskType === 'grounding', '4b. taskType is grounding');
    assert(report4?.routingDecision?.selectedToolId === 'tool_grounding_specialist', '4c. routed to tool_grounding_specialist');
    assert(report4?.sihCompliance?.zeroFabricatedEvidence === true, '4d. grounding maintains zeroFabricatedEvidence');

    // -------------------------------------------------------------------------
    // STEP 5: Routing Incompatibility Handled Truthfully
    // -------------------------------------------------------------------------
    console.log('');
    console.log('-- STEP 5: POST /api/analyze (Single Image for Change Analysis) ---');
    const res5 = await postJson(port, '/api/analyze', {
      query: 'What changed between these satellite scenes?',
      images: [OPTICAL_IMAGE]
    });
    assert(res5.status === 200, '5a. HTTP 200 for graceful incompatibility report');
    const report5 = res5.data.report;
    assert(report5?.status === 'routing_failed', '5b. status="routing_failed" on single-image change analysis');
    assert(report5?.routingDecision?.compatibilityStatus === 'rejected', '5c. compatibilityStatus="rejected"');
    assert(typeof report5?.errorSummary === 'string' && report5.errorSummary.length > 0, '5d. errorSummary explains incompatibility');
    assert(report5?.sihCompliance?.zeroFabricatedEvidence === true, '5e. zeroFabricatedEvidence preserved on rejection');

    // -------------------------------------------------------------------------
    // STEP 6: Specialist-Level Rejection Handled Truthfully
    // -------------------------------------------------------------------------
    console.log('');
    console.log('-- STEP 6: POST /api/analyze (SAR Image for GeoChat VQA) ----------');
    const res6 = await postJson(port, '/api/analyze', {
      query: 'What is visible in this satellite scene?',
      images: [SAR_IMAGE]
    });
    assert(res6.status === 200, '6a. HTTP 200 for specialist rejection report');
    const report6 = res6.data.report;
    assert(report6?.status === 'rejected', '6b. status="rejected" from specialist');
    assert(report6?.specialistOutput?.status === 'rejected', '6c. specialistOutput.status="rejected"');
    assert(report6?.specialistOutput?.evidence?.evidenceType === 'none', '6d. evidenceType="none" on rejection');
    assert(report6?.sihCompliance?.zeroFabricatedEvidence === true, '6e. zeroFabricatedEvidence preserved on specialist rejection');
    assert(report6?.provenanceChain?.evidenceFabricated === false, '6f. provenanceChain.evidenceFabricated=false');

    // -------------------------------------------------------------------------
    // STEP 7: Caption Specialist Pipeline Execution
    // -------------------------------------------------------------------------
    console.log('');
    console.log('-- STEP 7: POST /api/analyze (Scene Captioning Pipeline) ----------');
    const res7 = await postJson(port, '/api/analyze', {
      query: 'Describe this satellite image in detail.',
      images: [OPTICAL_IMAGE]
    });
    assert(res7.status === 200, '7a. HTTP 200 for caption analyze call');
    const report7 = res7.data.report;
    assert(report7?.parsedQuery?.taskType === 'caption', '7b. taskType is caption');
    assert(report7?.routingDecision?.selectedToolId === 'tool_caption_specialist', '7c. routed to tool_caption_specialist');
    assert(report7?.routingDecision?.routingStatus === 'routed', '7d. caption routingStatus is routed');
    assert(!!report7?.specialistOutput, '7e. caption specialistOutput present');
    assert(report7?.sihCompliance?.zeroFabricatedEvidence === true, '7f. caption zeroFabricatedEvidence is true');
    assert(report7?.provenanceChain?.evidenceFabricated === false, '7g. caption evidenceFabricated=false');

    // -------------------------------------------------------------------------
    // STEP 8: Semantic Segmentation Pipeline Execution
    // -------------------------------------------------------------------------
    console.log('');
    console.log('-- STEP 8: POST /api/analyze (Semantic Segmentation Pipeline) -----');
    const res8 = await postJson(port, '/api/analyze', {
      query: 'Segment the buildings and roads in this satellite image.',
      images: [OPTICAL_IMAGE]
    });
    assert(res8.status === 200, '8a. HTTP 200 for segmentation analyze call');
    const report8 = res8.data.report;
    assert(report8?.parsedQuery?.taskType === 'segmentation', '8b. taskType is segmentation');
    assert(report8?.routingDecision?.selectedToolId === 'tool_segmentation_specialist', '8c. routed to tool_segmentation_specialist');
    assert(report8?.routingDecision?.routingStatus === 'routed', '8d. segmentation routingStatus is routed');
    assert(!!report8?.specialistOutput, '8e. segmentation specialistOutput present');
    assert(report8?.sihCompliance?.zeroFabricatedEvidence === true, '8f. segmentation zeroFabricatedEvidence is true');
    assert(report8?.provenanceChain?.evidenceFabricated === false, '8g. segmentation evidenceFabricated=false');

    // -------------------------------------------------------------------------
    // STEP 9: Bi-Temporal Change Analysis Pipeline Execution
    // -------------------------------------------------------------------------
    console.log('');
    console.log('-- STEP 9: POST /api/analyze (Change Analysis Pipeline) -----------');
    const res9 = await postJson(port, '/api/analyze', {
      query: 'What changed between these satellite scenes?',
      images: [OPTICAL_IMAGE_T1, OPTICAL_IMAGE_T2]
    });
    assert(res9.status === 200, '9a. HTTP 200 for change analysis analyze call');
    const report9 = res9.data.report;
    assert(report9?.parsedQuery?.taskType === 'change_analysis', '9b. taskType is change_analysis');
    assert(report9?.routingDecision?.selectedToolId === 'tool_change_specialist', '9c. routed to tool_change_specialist');
    assert(report9?.routingDecision?.routingStatus === 'routed', '9d. change analysis routingStatus is routed');
    assert(report9?.routingDecision?.compatibilityStatus === 'compatible', '9e. temporal pair is compatible');
    assert(!!report9?.specialistOutput, '9f. change analysis specialistOutput present');
    assert(report9?.sihCompliance?.zeroFabricatedEvidence === true, '9g. change analysis zeroFabricatedEvidence is true');
    assert(report9?.provenanceChain?.evidenceFabricated === false, '9h. change analysis evidenceFabricated=false');

    // -------------------------------------------------------------------------
    // STEP 10: Optical-SAR Cross-Modal Pipeline Execution
    // -------------------------------------------------------------------------
    console.log('');
    console.log('-- STEP 10: POST /api/analyze (Optical-SAR Cross-Modal Pipeline) ---');
    const res10 = await postJson(port, '/api/analyze', {
      query: 'Compare optical and SAR imagery.',
      images: [OPTICAL_IMAGE, SAR_IMAGE]
    });
    assert(res10.status === 200, '10a. HTTP 200 for optical-sar analyze call');
    const report10 = res10.data.report;
    assert(report10?.parsedQuery?.taskType === 'optical_sar', '10b. taskType is optical_sar');
    assert(report10?.routingDecision?.selectedToolId === 'tool_optical_sar_specialist', '10c. routed to tool_optical_sar_specialist');
    assert(report10?.routingDecision?.routingStatus === 'routed', '10d. optical-sar routingStatus is routed');
    assert(report10?.routingDecision?.compatibilityStatus === 'compatible', '10e. optical-sar pair is compatible');
    assert(!!report10?.specialistOutput, '10f. optical-sar specialistOutput present');
    assert(report10?.sihCompliance?.zeroFabricatedEvidence === true, '10g. optical-sar zeroFabricatedEvidence is true');
    assert(report10?.provenanceChain?.evidenceFabricated === false, '10h. optical-sar evidenceFabricated=false');

    // -------------------------------------------------------------------------
    // STEP 11: All 6 Specialists Evaluation Matrix Verification
    // -------------------------------------------------------------------------
    console.log('');
    console.log('-- STEP 11: Specialist Coverage & Anti-Fabrication Evaluation Matrix');
    const specialistsEvaluated = [
      report3?.routingDecision?.selectedToolId,
      report7?.routingDecision?.selectedToolId,
      report4?.routingDecision?.selectedToolId,
      report8?.routingDecision?.selectedToolId,
      report9?.routingDecision?.selectedToolId,
      report10?.routingDecision?.selectedToolId
    ];

    const expectedTools = [
      'tool_vqa_specialist',
      'tool_caption_specialist',
      'tool_grounding_specialist',
      'tool_segmentation_specialist',
      'tool_change_specialist',
      'tool_optical_sar_specialist'
    ];

    for (const expected of expectedTools) {
      assert(specialistsEvaluated.includes(expected), `11a. Specialist "${expected}" evaluated in /api/analyze pipeline`);
    }

    const allReports = [report3, report4, report7, report8, report9, report10];
    for (let i = 0; i < allReports.length; i++) {
      const r = allReports[i];
      assert(r?.sihCompliance?.zeroFabricatedEvidence === true, `11b. Report ${i + 1} strictly enforces zeroFabricatedEvidence`);
      assert(r?.provenanceChain?.evidenceFabricated === false, `11c. Report ${i + 1} provenance strictly records evidenceFabricated=false`);
      assert((r?.pipelineMetrics?.totalMs || 0) >= 0, `11d. Report ${i + 1} records valid non-negative pipelineMetrics`);
    }

  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('');
  console.log('==================================================================');
  const total = passed + failed;
  if (failed === 0) {
    console.log('  ALL ' + total + ' ASSERTIONS PASSED - Stage 7 Unified Reporting Pipeline Verified.');
  } else {
    console.log('  ' + failed + '/' + total + ' ASSERTIONS FAILED');
  }
  console.log('==================================================================');
  console.log('');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('[E2E Error]', err);
  process.exit(1);
});
