/**
 * SatQuery AI - Stage 6D Visual Grounding Specialist Adapter Tests (Grounding DINO)
 * SIH26167 | ISRO Space Technology
 *
 * Tests the Remote-Sensing Visual Grounding specialist adapter:
 * 1. Empty target query rejected
 * 2. Whitespace target query rejected
 * 3. Missing image rejected
 * 4. Multiple images rejected
 * 5. Invalid image rejected (unsupported MIME)
 * 6. SAR rejected
 * 7. Valid optical input accepted
 * 8. Correct worker request generated
 * 9. Worker HTTP failure handled
 * 10. Worker timeout handled
 * 11. Malformed worker response rejected (missing detections)
 * 12. Invalid bounding box rejected
 * 13. Invalid confidence score rejected
 * 14. Valid grounding response parsed correctly into BoundingBoxEvidence
 * 15. Empty detection result handled cleanly
 * 16. No fake detections generated on failure
 * 17. Adapter lifecycle verified
 */

import http from 'http';
import { GroundingSpecialistAdapter } from './grounding.js';
import { SpecialistInput, InputImageDescriptor } from '../types/index.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAILED: ${message}`);
    process.exit(1);
  }
}

async function runStage6DTests() {
  console.log('--- Running SatQuery AI Stage 6D Visual Grounding Specialist Tests ---');

  const sampleOpticalImage: InputImageDescriptor = {
    id: 'img-optical-1',
    name: 'delhi_airport_optical.png',
    mimeType: 'image/png',
    modality: 'OPTICAL',
    acquisitionDate: '2024-05-12',
    geographicArea: 'Delhi Airport',
    dataUri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  };

  const sampleSarImage: InputImageDescriptor = {
    id: 'img-sar-1',
    name: 'delhi_sar.tif',
    mimeType: 'image/tiff',
    modality: 'SAR',
    acquisitionDate: '2024-05-12',
    geographicArea: 'Delhi Airport'
  };

  const sampleOpticalImage2: InputImageDescriptor = {
    id: 'img-optical-2',
    name: 'delhi_airport_optical_t2.png',
    mimeType: 'image/png',
    modality: 'OPTICAL',
    acquisitionDate: '2024-11-20',
    geographicArea: 'Delhi Airport'
  };

  const adapter = new GroundingSpecialistAdapter({ workerUrl: 'http://127.0.0.1:58888', timeoutMs: 1500 });

  // Test 1: Empty target query rejected
  const emptyQueryInput: SpecialistInput = {
    taskId: 'grd-test-1',
    taskType: 'grounding',
    query: '',
    images: [sampleOpticalImage]
  };
  const emptyQueryRes = await adapter.execute(emptyQueryInput);
  assert(emptyQueryRes.status === 'rejected', 'Test 1 Failed: Empty target query should be rejected.');
  assert(
    emptyQueryRes.rejectionReason?.includes('Empty target text rejected') === true,
    'Test 1 Failed: Rejection reason should specify empty target text.'
  );
  assert(emptyQueryRes.evidence.evidenceType === 'none', 'Test 1 Failed: Evidence type should be none.');
  console.log('  ✓ PASS: 1. Empty target query rejected');

  // Test 2: Whitespace target query rejected
  const wsQueryInput: SpecialistInput = {
    taskId: 'grd-test-2',
    taskType: 'grounding',
    query: '   \t \n  ',
    images: [sampleOpticalImage]
  };
  const wsQueryRes = await adapter.execute(wsQueryInput);
  assert(wsQueryRes.status === 'rejected', 'Test 2 Failed: Whitespace target query should be rejected.');
  assert(
    wsQueryRes.rejectionReason?.includes('Empty target text rejected') === true,
    'Test 2 Failed: Rejection reason should specify empty target text.'
  );
  console.log('  ✓ PASS: 2. Whitespace target query rejected');

  // Test 3: Missing image rejected
  const missingImageInput: SpecialistInput = {
    taskId: 'grd-test-3',
    taskType: 'grounding',
    query: 'Locate airplanes',
    images: []
  };
  const missingImageRes = await adapter.execute(missingImageInput);
  assert(missingImageRes.status === 'rejected', 'Test 3 Failed: Missing image should be rejected.');
  assert(
    missingImageRes.rejectionReason?.includes('Missing image') === true,
    'Test 3 Failed: Rejection reason should specify missing image.'
  );
  console.log('  ✓ PASS: 3. Missing image rejected');

  // Test 4: Multiple images rejected
  const multiImageInput: SpecialistInput = {
    taskId: 'grd-test-4',
    taskType: 'grounding',
    query: 'Locate runways in both images',
    images: [sampleOpticalImage, sampleOpticalImage2]
  };
  const multiImageRes = await adapter.execute(multiImageInput);
  assert(multiImageRes.status === 'rejected', 'Test 4 Failed: Multiple images should be rejected.');
  assert(
    multiImageRes.rejectionReason?.includes('Multiple images rejected') === true,
    'Test 4 Failed: Rejection reason should specify single image requirement.'
  );
  console.log('  ✓ PASS: 4. Multiple images rejected');

  // Test 5: Invalid image rejected (unsupported MIME)
  const invalidMimeImage: InputImageDescriptor = {
    id: 'img-invalid',
    name: 'binary_file.exe',
    mimeType: 'application/x-msdownload',
    modality: 'OPTICAL'
  };
  const invalidMimeInput: SpecialistInput = {
    taskId: 'grd-test-5',
    taskType: 'grounding',
    query: 'Locate hangars',
    images: [invalidMimeImage]
  };
  const invalidMimeRes = await adapter.execute(invalidMimeInput);
  assert(invalidMimeRes.status === 'rejected', 'Test 5 Failed: Invalid MIME type should be rejected.');
  assert(
    invalidMimeRes.rejectionReason?.includes('Unsupported image format') === true,
    'Test 5 Failed: Rejection reason should specify unsupported MIME format.'
  );
  console.log('  ✓ PASS: 5. Invalid image rejected (unsupported MIME)');

  // Test 6: SAR rejected
  const sarInput: SpecialistInput = {
    taskId: 'grd-test-6',
    taskType: 'grounding',
    query: 'Locate ships in radar image',
    images: [sampleSarImage]
  };
  const sarRes = await adapter.execute(sarInput);
  assert(sarRes.status === 'rejected', 'Test 6 Failed: SAR modality must be rejected.');
  assert(
    sarRes.rejectionReason?.includes('SAR imagery is not supported') === true,
    'Test 6 Failed: Rejection reason should state Grounding DINO does not support SAR.'
  );
  console.log('  ✓ PASS: 6. SAR rejected');

  // Test 7: Valid optical input accepted
  const validOpticalInput: SpecialistInput = {
    taskId: 'grd-test-7',
    taskType: 'grounding',
    query: 'Where are the solar panels?',
    images: [sampleOpticalImage]
  };
  const target = adapter.extractTargetQuery(validOpticalInput);
  assert(target === 'solar panels', 'Test 7 Failed: Target extraction mismatch.');
  console.log('  ✓ PASS: 7. Valid optical input accepted');

  // Test 8: Correct worker request generated
  const workerReq = adapter.formatWorkerRequest({
    ...validOpticalInput,
    parameters: { boxThreshold: 0.4, textThreshold: 0.3 }
  });
  assert(workerReq.task === 'grounding', 'Test 8 Failed: Task must be "grounding".');
  assert(workerReq.target === 'solar panels', 'Test 8 Failed: Target mismatch.');
  assert(workerReq.image.name === sampleOpticalImage.name, 'Test 8 Failed: Image name mismatch.');
  assert(workerReq.parameters?.coordinateFormat === 'normalized_xyxy', 'Test 8 Failed: Format mismatch.');
  console.log('  ✓ PASS: 8. Correct worker request generated');

  // Test 9: Worker HTTP failure handled
  const mockServer503 = http.createServer((_req, res) => {
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Grounding DINO model not loaded',
      detail: 'Host environment lacks NVIDIA CUDA GPU. Grounding DINO requires CUDA.'
    }));
  });
  await new Promise<void>((resolve) => mockServer503.listen(54432, resolve));

  const testAdapter503 = new GroundingSpecialistAdapter({ workerUrl: 'http://127.0.0.1:54432' });
  const http503Res = await testAdapter503.execute(validOpticalInput);
  assert(http503Res.status === 'failed', 'Test 9 Failed: 503 from worker should result in failed status.');
  assert(
    http503Res.rejectionReason?.includes('Grounding DINO requires CUDA') === true,
    'Test 9 Failed: Rejection reason should record worker detail.'
  );
  assert(http503Res.evidence.evidenceType === 'none', 'Test 9 Failed: Evidence must be none.');
  await new Promise<void>((resolve) => mockServer503.close(() => resolve()));
  console.log('  ✓ PASS: 9. Worker HTTP failure handled');

  // Test 10: Worker timeout handled
  const mockServerTimeout = http.createServer((_req, _res) => {
    // Deliberately do not reply to trigger timeout
  });
  await new Promise<void>((resolve) => mockServerTimeout.listen(54433, resolve));

  const testAdapterTimeout = new GroundingSpecialistAdapter({
    workerUrl: 'http://127.0.0.1:54433',
    timeoutMs: 100
  });
  const timeoutRes = await testAdapterTimeout.execute(validOpticalInput);
  assert(timeoutRes.status === 'failed', 'Test 10 Failed: Worker timeout should return failed.');
  assert(
    timeoutRes.rejectionReason?.includes('timed out') === true,
    'Test 10 Failed: Rejection reason should record timeout.'
  );
  await new Promise<void>((resolve) => mockServerTimeout.close(() => resolve()));
  console.log('  ✓ PASS: 10. Worker timeout handled');

  // Test 11: Malformed worker response rejected (missing detections)
  const mockServerMalformed = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ task: 'grounding', status: 'success' /* missing detections array */ }));
  });
  await new Promise<void>((resolve) => mockServerMalformed.listen(54434, resolve));

  const testAdapterMalformed = new GroundingSpecialistAdapter({ workerUrl: 'http://127.0.0.1:54434' });
  const malformedRes = await testAdapterMalformed.execute(validOpticalInput);
  assert(malformedRes.status === 'failed', 'Test 11 Failed: Missing detections should fail.');
  assert(
    malformedRes.rejectionReason?.includes('missing detections array') === true,
    'Test 11 Failed: Rejection reason should mention missing detections array.'
  );
  await new Promise<void>((resolve) => mockServerMalformed.close(() => resolve()));
  console.log('  ✓ PASS: 11. Malformed worker response rejected (missing detections)');

  // Test 12: Invalid bounding box rejected (e.g. xMin >= xMax or out of bounds)
  const mockServerBadBox = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      task: 'grounding',
      model: 'Grounding DINO',
      status: 'success',
      detections: [
        {
          label: 'solar panel',
          confidence: 0.95,
          box: { xMin: 0.8, yMin: 0.2, xMax: 0.4, yMax: 0.6 } // xMin > xMax is invalid
        }
      ]
    }));
  });
  await new Promise<void>((resolve) => mockServerBadBox.listen(54435, resolve));

  const testAdapterBadBox = new GroundingSpecialistAdapter({ workerUrl: 'http://127.0.0.1:54435' });
  const badBoxRes = await testAdapterBadBox.execute(validOpticalInput);
  assert(badBoxRes.status === 'failed', 'Test 12 Failed: Invalid box must fail.');
  assert(
    badBoxRes.rejectionReason?.includes('Invalid bounding box') === true,
    'Test 12 Failed: Rejection reason should mention invalid bounding box.'
  );
  await new Promise<void>((resolve) => mockServerBadBox.close(() => resolve()));
  console.log('  ✓ PASS: 12. Invalid bounding box rejected');

  // Test 13: Invalid confidence score rejected
  const mockServerBadConf = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      task: 'grounding',
      model: 'Grounding DINO',
      status: 'success',
      detections: [
        {
          label: 'solar panel',
          confidence: 1.8, // invalid confidence > 1
          box: { xMin: 0.1, yMin: 0.1, xMax: 0.5, yMax: 0.5 }
        }
      ]
    }));
  });
  await new Promise<void>((resolve) => mockServerBadConf.listen(54436, resolve));

  const testAdapterBadConf = new GroundingSpecialistAdapter({ workerUrl: 'http://127.0.0.1:54436' });
  const badConfRes = await testAdapterBadConf.execute(validOpticalInput);
  assert(badConfRes.status === 'failed', 'Test 13 Failed: Invalid confidence must fail.');
  assert(
    badConfRes.rejectionReason?.includes('Invalid confidence score') === true,
    'Test 13 Failed: Rejection reason should mention invalid confidence score.'
  );
  await new Promise<void>((resolve) => mockServerBadConf.close(() => resolve()));
  console.log('  ✓ PASS: 13. Invalid confidence score rejected');

  // Test 14: Valid grounding response parsed correctly into BoundingBoxEvidence
  const mockServerValid = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      task: 'grounding',
      model: 'Grounding DINO (groundingdino_swint_ogc)',
      status: 'success',
      coordinateFormat: 'normalized_xyxy',
      imageDimensions: { width: 512, height: 512 },
      detections: [
        {
          label: 'solar panel',
          confidence: 0.89,
          box: { xMin: 0.12, yMin: 0.25, xMax: 0.38, yMax: 0.55 }
        },
        {
          label: 'solar panel',
          confidence: 0.94,
          box: { xMin: 0.45, yMin: 0.3, xMax: 0.72, yMax: 0.62 }
        }
      ],
      durationMs: 155,
      device: 'cuda:0'
    }));
  });
  await new Promise<void>((resolve) => mockServerValid.listen(54437, resolve));

  const testAdapterValid = new GroundingSpecialistAdapter({ workerUrl: 'http://127.0.0.1:54437' });
  const validRes = await testAdapterValid.execute(validOpticalInput);
  assert(validRes.status === 'complete', 'Test 14 Failed: Valid grounding output must be complete.');
  assert(validRes.evidence.evidenceType === 'bounding_box', 'Test 14 Failed: Evidence type must be bounding_box.');
  assert(validRes.evidence.boxes?.length === 2, 'Test 14 Failed: Should have 2 detected boxes.');
  assert(validRes.evidence.boxes?.[0].label === 'solar panel', 'Test 14 Failed: Box label mismatch.');
  assert(validRes.evidence.boxes?.[0].xmin === 0.12, 'Test 14 Failed: xmin mismatch.');
  assert(validRes.executionMetrics.modelName.includes('Grounding DINO'), 'Test 14 Failed: Model name mismatch.');
  await new Promise<void>((resolve) => mockServerValid.close(() => resolve()));
  console.log('  ✓ PASS: 14. Valid grounding response parsed correctly into BoundingBoxEvidence');

  // Test 15: Empty detection result handled cleanly
  const mockServerEmpty = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      task: 'grounding',
      model: 'Grounding DINO (groundingdino_swint_ogc)',
      status: 'success',
      coordinateFormat: 'normalized_xyxy',
      detections: []
    }));
  });
  await new Promise<void>((resolve) => mockServerEmpty.listen(54438, resolve));

  const testAdapterEmpty = new GroundingSpecialistAdapter({ workerUrl: 'http://127.0.0.1:54438' });
  const emptyRes = await testAdapterEmpty.execute({
    ...validOpticalInput,
    query: 'locate submarine'
  });
  assert(emptyRes.status === 'complete', 'Test 15 Failed: 0 detections should still return complete status.');
  assert(emptyRes.evidence.evidenceType === 'bounding_box', 'Test 15 Failed: Evidence type must be bounding_box.');
  assert(emptyRes.evidence.boxes?.length === 0, 'Test 15 Failed: Box array should be empty.');
  assert(emptyRes.answerText.includes('No matching objects detected'), 'Test 15 Failed: Answer text should inform user of 0 detections.');
  await new Promise<void>((resolve) => mockServerEmpty.close(() => resolve()));
  console.log('  ✓ PASS: 15. Empty detection result handled cleanly');

  // Test 16: No fake detections generated on failure
  const failAdapter = new GroundingSpecialistAdapter({ workerUrl: 'http://127.0.0.1:59998', timeoutMs: 500 });
  const failRes = await failAdapter.execute(validOpticalInput);
  assert(failRes.status === 'failed', 'Test 16 Failed: Unreachable worker should return failed.');
  assert(failRes.evidence.evidenceType === 'none', 'Test 16 Failed: Evidence type must be none on failure.');
  assert(failRes.evidence.boxes === undefined, 'Test 16 Failed: Boxes must NOT exist on failure.');
  assert(
    failRes.metadataNotes.some((n) => n.includes('No simulated or placeholder bounding boxes generated')),
    'Test 16 Failed: Truthful integrity note required.'
  );
  console.log('  ✓ PASS: 16. No fake detections generated on failure');

  // Test 17: Adapter lifecycle verified
  const lifecycleAdapter = new GroundingSpecialistAdapter();
  assert(lifecycleAdapter.state === 'uninitialized', 'Test 17 Failed: Initial state should be uninitialized.');
  await lifecycleAdapter.initialize();
  assert(lifecycleAdapter.state === 'ready', 'Test 17 Failed: State should be ready after init.');
  await lifecycleAdapter.dispose();
  assert(lifecycleAdapter.state === 'disposed', 'Test 17 Failed: State should be disposed.');
  const disposedRes = await lifecycleAdapter.execute(validOpticalInput);
  assert(disposedRes.status === 'failed', 'Test 17 Failed: Executing disposed adapter must fail.');
  console.log('  ✓ PASS: 17. Adapter lifecycle verified');

  // Test 18: checkWorkerReadiness returns structured readiness status
  const mockServerReadiness = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      readinessState: 'RUNNABLE',
      isReady: true,
      model_id: 'IDEA-Research/grounding-dino-tiny',
      checkpoint: 'groundingdino_swint_ogc',
      device: 'cuda:0',
      gpu_name: 'Tesla T4',
      cuda_available: true,
      total_vram_gb: 15.0,
      available_vram_gb: 14.2,
      message: 'Grounding DINO Tiny model is loaded and runnable on GPU.'
    }));
  });
  await new Promise<void>((resolve) => mockServerReadiness.listen(54439, resolve));

  const testAdapterReadiness = new GroundingSpecialistAdapter({ workerUrl: 'http://127.0.0.1:54439' });
  const readinessRes = await testAdapterReadiness.checkWorkerReadiness();
  assert(readinessRes !== null, 'Test 18 Failed: Readiness response should not be null.');
  assert(readinessRes?.readinessState === 'RUNNABLE', 'Test 18 Failed: Readiness state should be RUNNABLE.');
  assert(readinessRes?.model_id === 'IDEA-Research/grounding-dino-tiny', 'Test 18 Failed: Model ID mismatch.');
  await new Promise<void>((resolve) => mockServerReadiness.close(() => resolve()));
  console.log('  ✓ PASS: 18. checkWorkerReadiness returns structured readiness status');

  // Test 19: Worker HTTP 401 Unauthorized handled gracefully
  const mockServer401 = http.createServer((_req, res) => {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized', code: 'UNAUTHORIZED' }));
  });
  await new Promise<void>((resolve) => mockServer401.listen(54440, resolve));

  const testAdapter401 = new GroundingSpecialistAdapter({ workerUrl: 'http://127.0.0.1:54440' });
  const res401 = await testAdapter401.execute(validOpticalInput);
  assert(res401.status === 'failed', 'Test 19 Failed: 401 should result in failed status.');
  assert(
    res401.rejectionReason?.includes('Authentication failed') === true,
    'Test 19 Failed: Rejection reason should mention authentication failure.'
  );
  await new Promise<void>((resolve) => mockServer401.close(() => resolve()));
  console.log('  ✓ PASS: 19. Worker HTTP 401 Unauthorized handled gracefully');

  // Test 20: Request sends authentication headers and propagates requestId
  let receivedAuth = '';
  let receivedWorkerKey = '';
  let receivedRequestId = '';
  const mockServerAuthHeaders = http.createServer((req, res) => {
    receivedAuth = req.headers['authorization'] || '';
    receivedWorkerKey = (req.headers['x-worker-auth-key'] as string) || '';
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        receivedRequestId = parsed.requestId || '';
      } catch {
        // empty
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        task: 'grounding',
        model: 'IDEA-Research/grounding-dino-tiny',
        status: 'success',
        provenance: 'MODEL_GENERATED',
        coordinateFormat: 'normalized_xyxy',
        requestId: receivedRequestId,
        detections: []
      }));
    });
  });
  await new Promise<void>((resolve) => mockServerAuthHeaders.listen(54441, resolve));

  const testAdapterAuthHeaders = new GroundingSpecialistAdapter({
    workerUrl: 'http://127.0.0.1:54441',
    authKey: 'test-grounding-secret-key-123'
  });
  const resAuth = await testAdapterAuthHeaders.execute({
    ...validOpticalInput,
    taskId: 'custom-grounding-task-42'
  });
  assert(resAuth.status === 'complete', 'Test 20 Failed: Status should be complete.');
  assert(receivedAuth === 'Bearer test-grounding-secret-key-123', 'Test 20 Failed: Authorization header mismatch.');
  assert(receivedWorkerKey === 'test-grounding-secret-key-123', 'Test 20 Failed: X-Worker-Auth-Key mismatch.');
  assert(receivedRequestId === 'custom-grounding-task-42', 'Test 20 Failed: RequestId mismatch.');
  await new Promise<void>((resolve) => mockServerAuthHeaders.close(() => resolve()));
  console.log('  ✓ PASS: 20. Request sends authentication headers and propagates requestId');

  // Test 21: Provenance MODEL_GENERATED propagated in evidence details and metadata notes
  const mockServerProvenance = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      task: 'grounding',
      model: 'IDEA-Research/grounding-dino-tiny',
      checkpoint: 'groundingdino_swint_ogc',
      status: 'success',
      provenance: 'MODEL_GENERATED',
      coordinateFormat: 'normalized_xyxy',
      imageDimensions: { width: 800, height: 800 },
      detections: [
        {
          label: 'runway',
          confidence: 0.91,
          box: { xMin: 0.1, yMin: 0.4, xMax: 0.9, yMax: 0.6 }
        }
      ]
    }));
  });
  await new Promise<void>((resolve) => mockServerProvenance.listen(54442, resolve));

  const testAdapterProvenance = new GroundingSpecialistAdapter({ workerUrl: 'http://127.0.0.1:54442' });
  const resProvenance = await testAdapterProvenance.execute(validOpticalInput);
  assert(resProvenance.status === 'complete', 'Test 21 Failed: Execution should be complete.');
  assert(resProvenance.evidence.details?.provenance === 'MODEL_GENERATED', 'Test 21 Failed: Evidence details must record MODEL_GENERATED.');
  assert(
    resProvenance.metadataNotes.some((n) => n.includes('provenance: MODEL_GENERATED')),
    'Test 21 Failed: Metadata notes must record provenance: MODEL_GENERATED.'
  );
  await new Promise<void>((resolve) => mockServerProvenance.close(() => resolve()));
  console.log('  ✓ PASS: 21. Provenance MODEL_GENERATED propagated in evidence details and metadata notes');

  // Test 22: Grounding DINO Tiny configuration defaults
  const tinyAdapter = new GroundingSpecialistAdapter();
  const cfg = tinyAdapter.getConfig();
  assert(cfg.modelId === 'IDEA-Research/grounding-dino-tiny', 'Test 22 Failed: Default modelId should be tiny.');
  assert(cfg.checkpoint === 'groundingdino_swint_ogc', 'Test 22 Failed: Default checkpoint should be groundingdino_swint_ogc.');
  assert(cfg.boxThreshold === 0.35, 'Test 22 Failed: Default boxThreshold should be 0.35.');
  assert(cfg.textThreshold === 0.25, 'Test 22 Failed: Default textThreshold should be 0.25.');
  console.log('  ✓ PASS: 22. Grounding DINO Tiny configuration defaults');

  console.log(`Test Summary: 22 passed, 0 failed out of 22 total tests.`);
}

runStage6DTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
