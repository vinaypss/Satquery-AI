/**
 * SatQuery AI - Phase 7 VQA Specialist Adapter Tests (GeoChat-7B)
 * SIH26167 | ISRO Space Technology
 *
 * Tests the Remote-Sensing VQA specialist adapter:
 * 1. Empty question rejected
 * 2. Missing image rejected
 * 3. Multiple images rejected
 * 4. SAR rejected
 * 5. Invalid image rejected
 * 6. Valid optical input accepted
 * 7. Correct worker request generated
 * 8. Worker HTTP failure handled
 * 9. Malformed worker response rejected
 * 10. Worker timeout handled
 * 11. Valid real-looking response parsed correctly
 * 12. No fake answer generated
 * 13. Adapter lifecycle
 * 14. Model unavailable path
 * 15. Device/runtime diagnostics
 * 16. Authentication failure handled (HTTP 401)
 * 17. Worker readiness check endpoint
 * 18. RequestId and Provenance propagation (MODEL_GENERATED)
 * 19. Strict UNSUPPORTED_MODALITY rejection on SAR
 */

import http from 'http';
import { VqaSpecialistAdapter } from './vqa.js';
import { SpecialistInput, InputImageDescriptor } from '../types/index.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAILED: ${message}`);
    process.exit(1);
  }
}

async function runStage6BTests() {
  console.log('--- Running SatQuery AI Stage 6B Remote-Sensing VQA Specialist Tests ---');

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

  // Test 1: Empty question rejected
  const adapter = new VqaSpecialistAdapter({ workerUrl: 'http://127.0.0.1:59999' });
  const emptyQueryInput: SpecialistInput = {
    taskId: 'vqa-test-1',
    taskType: 'vqa',
    query: '   ',
    images: [sampleOpticalImage]
  };
  const emptyQueryRes = await adapter.execute(emptyQueryInput);
  assert(emptyQueryRes.status === 'rejected', 'Test 1 Failed: Empty query should be rejected.');
  assert(
    emptyQueryRes.rejectionReason?.includes('Empty question rejected') === true,
    'Test 1 Failed: Rejection reason should specify empty question.'
  );
  console.log('  ✓ PASS: 1. Empty question rejected');

  // Test 2: Missing image rejected
  const missingImageInput: SpecialistInput = {
    taskId: 'vqa-test-2',
    taskType: 'vqa',
    query: 'What features are present?',
    images: []
  };
  const missingImageRes = await adapter.execute(missingImageInput);
  assert(missingImageRes.status === 'rejected', 'Test 2 Failed: Missing image should be rejected.');
  assert(
    missingImageRes.rejectionReason?.includes('Missing image') === true,
    'Test 2 Failed: Rejection reason should specify missing image.'
  );
  console.log('  ✓ PASS: 2. Missing image rejected');

  // Test 3: Multiple images rejected
  const multiImageInput: SpecialistInput = {
    taskId: 'vqa-test-3',
    taskType: 'vqa',
    query: 'Compare these two images.',
    images: [sampleOpticalImage, sampleOpticalImage2]
  };
  const multiImageRes = await adapter.execute(multiImageInput);
  assert(multiImageRes.status === 'rejected', 'Test 3 Failed: Multiple images should be rejected.');
  assert(
    multiImageRes.rejectionReason?.includes('Multiple images rejected') === true,
    'Test 3 Failed: Rejection reason should specify multiple images.'
  );
  console.log('  ✓ PASS: 3. Multiple images rejected');

  // Test 4: SAR rejected
  const sarInput: SpecialistInput = {
    taskId: 'vqa-test-4',
    taskType: 'vqa',
    query: 'What runway structures are visible?',
    images: [sampleSarImage]
  };
  const sarRes = await adapter.execute(sarInput);
  assert(sarRes.status === 'rejected', 'Test 4 Failed: SAR imagery must be rejected.');
  assert(
    sarRes.rejectionReason?.includes('UNSUPPORTED_MODALITY') === true ||
      sarRes.rejectionReason?.includes('SAR') === true,
    'Test 4 Failed: Rejection reason should specify SAR not supported.'
  );
  console.log('  ✓ PASS: 4. SAR rejected');

  // Test 5: Invalid image format rejected
  const invalidMimeInput: SpecialistInput = {
    taskId: 'vqa-test-5',
    taskType: 'vqa',
    query: 'What features are present?',
    images: [
      {
        id: 'bad-img',
        name: 'test.bmp',
        mimeType: 'image/bmp'
      }
    ]
  };
  const invalidMimeRes = await adapter.execute(invalidMimeInput);
  assert(invalidMimeRes.status === 'rejected', 'Test 5 Failed: Unsupported format should be rejected.');
  assert(
    invalidMimeRes.rejectionReason?.includes('Unsupported image format') === true,
    'Test 5 Failed: Rejection reason should specify unsupported format.'
  );
  console.log('  ✓ PASS: 5. Invalid image rejected');

  // Test 6: Valid optical input accepted
  const validOpticalInput: SpecialistInput = {
    taskId: 'vqa-test-6',
    taskType: 'vqa',
    query: 'What features are present in this optical scene?',
    images: [sampleOpticalImage]
  };
  assert(adapter.supportedModalities.includes('OPTICAL'), 'Test 6 Failed: Must support OPTICAL.');
  console.log('  ✓ PASS: 6. Valid optical input accepted');

  // Test 7: Correct worker request payload generated
  const formattedRequest = adapter.formatWorkerRequest(validOpticalInput);
  assert(formattedRequest.task === 'vqa', 'Test 7 Failed: Task should be vqa.');
  assert(
    formattedRequest.question === 'What features are present in this optical scene?',
    'Test 7 Failed: Question mismatch.'
  );
  assert(formattedRequest.image.name === 'delhi_airport_optical.png', 'Test 7 Failed: Image name mismatch.');
  assert(formattedRequest.requestId === 'vqa-test-6', 'Test 7 Failed: RequestId propagation mismatch.');
  console.log('  ✓ PASS: 7. Correct worker request generated');

  // Test 8: Worker HTTP failure handled
  const mockServer500 = http.createServer((_req, res) => {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal CUDA OOM' }));
  });
  await new Promise<void>((resolve) => mockServer500.listen(51234, resolve));

  const testAdapter500 = new VqaSpecialistAdapter({ workerUrl: 'http://127.0.0.1:51234' });
  const server500Res = await testAdapter500.execute(validOpticalInput);
  assert(server500Res.status === 'failed', 'Test 8 Failed: 500 error must produce failed status.');
  assert(
    server500Res.rejectionReason?.includes('HTTP 500') === true,
    'Test 8 Failed: Rejection reason should specify HTTP 500.'
  );
  await new Promise<void>((resolve) => mockServer500.close(() => resolve()));
  console.log('  ✓ PASS: 8. Worker HTTP failure handled');

  // Test 9: Malformed worker response rejected
  const mockServerMalformed = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ badField: 'No answer here' }));
  });
  await new Promise<void>((resolve) => mockServerMalformed.listen(51235, resolve));

  const testAdapterMalformed = new VqaSpecialistAdapter({ workerUrl: 'http://127.0.0.1:51235' });
  const malformedRes = await testAdapterMalformed.execute(validOpticalInput);
  assert(malformedRes.status === 'failed', 'Test 9 Failed: Malformed output must be failed.');
  assert(
    malformedRes.rejectionReason?.includes('Malformed worker response') === true,
    'Test 9 Failed: Rejection reason should specify malformed response.'
  );
  await new Promise<void>((resolve) => mockServerMalformed.close(() => resolve()));
  console.log('  ✓ PASS: 9. Malformed worker response rejected');

  // Test 10: Worker timeout handled
  const mockServerHanging = http.createServer((_req, _res) => {
    // Deliberately never respond
  });
  await new Promise<void>((resolve) => mockServerHanging.listen(51236, resolve));

  const testAdapterTimeout = new VqaSpecialistAdapter({
    workerUrl: 'http://127.0.0.1:51236',
    timeoutMs: 100 // fast timeout for test
  });
  const timeoutRes = await testAdapterTimeout.execute(validOpticalInput);
  assert(timeoutRes.status === 'failed', 'Test 10 Failed: Timed out worker must result in failed status.');
  assert(
    timeoutRes.rejectionReason?.includes('timed out') === true ||
      timeoutRes.rejectionReason?.includes('unavailable') === true,
    'Test 10 Failed: Rejection reason should note timeout or unavailability.'
  );
  await new Promise<void>((resolve) => mockServerHanging.close(() => resolve()));
  console.log('  ✓ PASS: 10. Worker timeout handled');

  // Test 11: Valid real-looking response parsed correctly
  let capturedAuthHeader = '';
  const mockServerSuccess = http.createServer((req, res) => {
    capturedAuthHeader = req.headers['authorization'] || '';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        answerText: 'The image displays an airport runway with taxiway and apron markings.',
        confidence: 0.0,
        modelName: 'MBZUAI/geochat-7B',
        device: 'cuda',
        durationMs: 840,
        provenance: 'MODEL_GENERATED',
        validationState: 'validated',
        requestId: 'vqa-test-6'
      })
    );
  });
  await new Promise<void>((resolve) => mockServerSuccess.listen(51237, resolve));

  const testAdapterSuccess = new VqaSpecialistAdapter({ workerUrl: 'http://127.0.0.1:51237' });
  const successRes = await testAdapterSuccess.execute(validOpticalInput);
  assert(successRes.status === 'complete', 'Test 11 Failed: Success response should mark status "complete".');
  assert(
    successRes.answerText === 'The image displays an airport runway with taxiway and apron markings.',
    'Test 11 Failed: Answer text mismatch.'
  );
  assert(successRes.evidence.evidenceType === 'text', 'Test 11 Failed: Evidence type should be text.');
  assert(successRes.executionMetrics.modelName === 'MBZUAI/geochat-7B', 'Test 11 Failed: Model name mismatch.');
  assert(
    capturedAuthHeader.startsWith('Bearer satquery-geochat-worker-secret'),
    'Test 11 Failed: Authorization header must be sent.'
  );
  await new Promise<void>((resolve) => mockServerSuccess.close(() => resolve()));
  console.log('  ✓ PASS: 11. Valid real-looking response parsed correctly');

  // Test 12: No fake answer generated when worker is unavailable
  const offlineAdapter = new VqaSpecialistAdapter({
    workerUrl: 'http://127.0.0.1:59998',
    timeoutMs: 500
  });
  const offlineRes = await offlineAdapter.execute(validOpticalInput);
  assert(offlineRes.status === 'failed', 'Test 12 Failed: Offline worker must produce failed status.');
  assert(offlineRes.answerText === '', 'Test 12 Failed: Fake answer text must NEVER be generated.');
  assert(offlineRes.evidence.evidenceType === 'none', 'Test 12 Failed: Evidence must be "none".');
  assert(
    offlineRes.rejectionReason === 'GeoChat-7B inference worker is unavailable.',
    'Test 12 Failed: Rejection reason must be truthful worker unavailable message.'
  );
  console.log('  ✓ PASS: 12. No fake answer generated');

  // Test 13: Adapter lifecycle (uninitialized -> loading -> ready -> disposed)
  const lifecycleAdapter = new VqaSpecialistAdapter();
  assert(lifecycleAdapter.state === 'uninitialized', 'Test 13 Failed: Lifecycle must start at uninitialized.');
  await lifecycleAdapter.initialize();
  assert(lifecycleAdapter.state === 'ready', 'Test 13 Failed: Lifecycle must reach ready state.');
  await lifecycleAdapter.dispose();
  assert(lifecycleAdapter.state === 'disposed', 'Test 13 Failed: Lifecycle must reach disposed state.');
  const disposedRes = await lifecycleAdapter.execute(validOpticalInput);
  assert(disposedRes.status === 'failed', 'Test 13 Failed: Disposed adapter must fail execution.');
  assert(
    disposedRes.rejectionReason?.includes('disposed') === true,
    'Test 13 Failed: Rejection reason should specify disposed state.'
  );
  console.log('  ✓ PASS: 13. Adapter lifecycle verified');

  // Test 14: Model unavailable path truthful reporting
  assert(
    offlineRes.metadataNotes?.some((note) => note.includes('No simulated or placeholder answer')) === true,
    'Test 14 Failed: SIH26167 integrity guard note missing from metadata.'
  );
  assert(
    offlineRes.metadataNotes?.some((note) => note.includes('Inference worker unavailable')) === true,
    'Test 14 Failed: Truthful worker unavailable note missing.'
  );
  console.log('  ✓ PASS: 14. Model unavailable path');

  // Test 15: Device/runtime diagnostics
  const healthNull = await offlineAdapter.checkWorkerHealth();
  assert(healthNull === null, 'Test 15 Failed: Offline worker health check should return null.');
  const config = offlineAdapter.getConfig();
  assert(config.modelId === 'MBZUAI/geochat-7B', 'Test 15 Failed: Default modelId mismatch.');
  assert(config.loadMode === '4bit', 'Test 15 Failed: Default loadMode mismatch.');
  console.log('  ✓ PASS: 15. Device/runtime diagnostics');

  // Test 16: Authentication failure handled (HTTP 401)
  const mockServer401 = http.createServer((_req, res) => {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized: invalid token', code: 'UNAUTHORIZED' }));
  });
  await new Promise<void>((resolve) => mockServer401.listen(51238, resolve));

  const testAdapter401 = new VqaSpecialistAdapter({ workerUrl: 'http://127.0.0.1:51238', authKey: 'bad-key' });
  const authRes = await testAdapter401.execute(validOpticalInput);
  assert(authRes.status === 'failed', 'Test 16 Failed: 401 must produce failed status.');
  assert(
    authRes.rejectionReason?.includes('Authentication failed') === true,
    'Test 16 Failed: Rejection reason should note authentication failure.'
  );
  await new Promise<void>((resolve) => mockServer401.close(() => resolve()));
  console.log('  ✓ PASS: 16. Authentication failure handled (HTTP 401)');

  // Test 17: Worker readiness check endpoint
  const mockServerReadiness = http.createServer((req, res) => {
    if (req.url === '/readiness') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          readinessState: 'GPU_UNAVAILABLE',
          isReady: false,
          model_id: 'MBZUAI/geochat-7B',
          checkpoint: 'MBZUAI/geochat-7B',
          device: 'cpu',
          cuda_available: false,
          message: 'Host environment lacks NVIDIA CUDA GPU.'
        })
      );
    } else {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise<void>((resolve) => mockServerReadiness.listen(51239, resolve));

  const testAdapterReadiness = new VqaSpecialistAdapter({ workerUrl: 'http://127.0.0.1:51239' });
  const readiness = await testAdapterReadiness.checkWorkerReadiness();
  assert(readiness !== null, 'Test 17 Failed: Readiness response must not be null.');
  assert(readiness?.readinessState === 'GPU_UNAVAILABLE', 'Test 17 Failed: readinessState mismatch.');
  assert(readiness?.isReady === false, 'Test 17 Failed: isReady must be false.');
  await new Promise<void>((resolve) => mockServerReadiness.close(() => resolve()));
  console.log('  ✓ PASS: 17. Worker readiness check endpoint');

  // Test 18: RequestId and Provenance propagation (MODEL_GENERATED)
  const mockServerProvenance = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        answerText: 'Verified runway detected.',
        modelName: 'MBZUAI/geochat-7B',
        device: 'cuda',
        durationMs: 450,
        provenance: 'MODEL_GENERATED',
        validationState: 'validated',
        requestId: 'trace-vqa-test-18'
      })
    );
  });
  await new Promise<void>((resolve) => mockServerProvenance.listen(51240, resolve));

  const testAdapterProv = new VqaSpecialistAdapter({ workerUrl: 'http://127.0.0.1:51240' });
  const provRes = await testAdapterProv.execute({
    taskId: 'trace-vqa-test-18',
    taskType: 'vqa',
    query: 'Is there a runway?',
    images: [sampleOpticalImage]
  });
  assert(provRes.status === 'complete', 'Test 18 Failed: Must be complete.');
  assert(
    provRes.evidence.details?.provenance === 'MODEL_GENERATED',
    'Test 18 Failed: Provenance must be MODEL_GENERATED.'
  );
  assert(
    provRes.evidence.details?.requestId === 'trace-vqa-test-18',
    'Test 18 Failed: RequestId must match taskId.'
  );
  await new Promise<void>((resolve) => mockServerProvenance.close(() => resolve()));
  console.log('  ✓ PASS: 18. RequestId and Provenance propagation (MODEL_GENERATED)');

  // Test 19: Strict UNSUPPORTED_MODALITY rejection on SAR
  assert(
    sarRes.rejectionReason?.startsWith('UNSUPPORTED_MODALITY') === true,
    'Test 19 Failed: Rejection reason must start with UNSUPPORTED_MODALITY.'
  );
  console.log('  ✓ PASS: 19. Strict UNSUPPORTED_MODALITY rejection on SAR');

  console.log('\n--- All 19 SatQuery AI Phase 7 VQA Specialist Tests Passed Successfully! ---');
}

runStage6BTests().catch((err) => {
  console.error('Test execution exception:', err);
  process.exit(1);
});
