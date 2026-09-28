/**
 * SatQuery AI - Phase 7 Caption Specialist Adapter Tests (GeoChat-7B)
 * SIH26167 | ISRO Space Technology
 *
 * Tests the Remote-Sensing Scene Captioning specialist adapter:
 * 1. Empty caption request rejected
 * 2. Missing image rejected
 * 3. Multiple images rejected
 * 4. SAR rejected
 * 5. Invalid image rejected
 * 6. Valid optical input accepted
 * 7. Correct caption worker request generated
 * 8. Worker HTTP failure handled
 * 9. Worker timeout handled
 * 10. Malformed worker response rejected
 * 11. Empty caption rejected
 * 12. Valid caption response parsed correctly
 * 13. No fake caption generated
 * 14. Adapter lifecycle verified
 * 15. Model unavailable path verified
 * 16. Authentication failure handled (HTTP 401)
 * 17. Worker readiness check endpoint
 * 18. RequestId and Provenance propagation (MODEL_GENERATED)
 * 19. Strict UNSUPPORTED_MODALITY rejection on SAR
 */

import http from 'http';
import { CaptionSpecialistAdapter, cleanGeoChatCaption } from './caption.js';
import { SpecialistInput, InputImageDescriptor } from '../types/index.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAILED: ${message}`);
    process.exit(1);
  }
}

async function runStage6CTests() {
  console.log('--- Running SatQuery AI Stage 6C Remote-Sensing Caption Specialist Tests ---');

  const sampleOpticalImage: InputImageDescriptor = {
    id: 'img-optical-cap-1',
    name: 'delhi_airport_optical.png',
    mimeType: 'image/png',
    modality: 'OPTICAL',
    acquisitionDate: '2024-05-12',
    geographicArea: 'Delhi Airport',
    dataUri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  };

  const sampleSarImage: InputImageDescriptor = {
    id: 'img-sar-cap-1',
    name: 'delhi_sar.tif',
    mimeType: 'image/tiff',
    modality: 'SAR',
    acquisitionDate: '2024-05-12',
    geographicArea: 'Delhi Airport'
  };

  const sampleOpticalImage2: InputImageDescriptor = {
    id: 'img-optical-cap-2',
    name: 'delhi_airport_optical_t2.png',
    mimeType: 'image/png',
    modality: 'OPTICAL',
    acquisitionDate: '2024-11-20',
    geographicArea: 'Delhi Airport'
  };

  // Test 1: Empty caption request rejected
  const adapter = new CaptionSpecialistAdapter({ workerUrl: 'http://127.0.0.1:59999' });
  const emptyQueryInput: SpecialistInput = {
    taskId: 'cap-test-1',
    taskType: 'caption',
    query: '   ',
    images: [sampleOpticalImage]
  };
  const emptyQueryRes = await adapter.execute(emptyQueryInput);
  assert(emptyQueryRes.status === 'rejected', 'Test 1 Failed: Empty query should be rejected.');
  assert(
    emptyQueryRes.rejectionReason?.includes('Empty caption request rejected') === true,
    'Test 1 Failed: Rejection reason should specify empty caption query.'
  );
  console.log('  ✓ PASS: 1. Empty caption request rejected');

  // Test 2: Missing image rejected
  const missingImageInput: SpecialistInput = {
    taskId: 'cap-test-2',
    taskType: 'caption',
    query: 'Describe this scene in detail.',
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
    taskId: 'cap-test-3',
    taskType: 'caption',
    query: 'Describe these two scenes.',
    images: [sampleOpticalImage, sampleOpticalImage2]
  };
  const multiImageRes = await adapter.execute(multiImageInput);
  assert(multiImageRes.status === 'rejected', 'Test 3 Failed: Multiple images should be rejected.');
  assert(
    multiImageRes.rejectionReason?.includes('Multiple images rejected') === true,
    'Test 3 Failed: Rejection reason should specify multiple images rejected.'
  );
  console.log('  ✓ PASS: 3. Multiple images rejected');

  // Test 4: SAR rejected
  const sarInput: SpecialistInput = {
    taskId: 'cap-test-4',
    taskType: 'caption',
    query: 'Describe this radar image.',
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

  // Test 5: Invalid image rejected
  const invalidMimeInput: SpecialistInput = {
    taskId: 'cap-test-5',
    taskType: 'caption',
    query: 'Describe this scene.',
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
    taskId: 'cap-test-6',
    taskType: 'caption',
    query: 'Describe this satellite scene in detail.',
    images: [sampleOpticalImage]
  };
  assert(adapter.supportedModalities.includes('OPTICAL'), 'Test 6 Failed: Must support OPTICAL.');
  console.log('  ✓ PASS: 6. Valid optical input accepted');

  // Test 7: Correct caption worker request generated
  const formattedRequest = adapter.formatWorkerRequest(validOpticalInput);
  assert(formattedRequest.task === 'caption', 'Test 7 Failed: Task should be caption.');
  assert(
    formattedRequest.prompt === 'Describe this satellite scene in detail.',
    'Test 7 Failed: Prompt mismatch.'
  );
  assert(formattedRequest.image.name === 'delhi_airport_optical.png', 'Test 7 Failed: Image name mismatch.');
  assert(formattedRequest.requestId === 'cap-test-6', 'Test 7 Failed: RequestId mismatch.');
  console.log('  ✓ PASS: 7. Correct caption worker request generated');

  // Test 8: Worker HTTP failure handled
  const mockServer500 = http.createServer((_req, res) => {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal CUDA OOM during caption generation' }));
  });
  await new Promise<void>((resolve) => mockServer500.listen(51241, resolve));

  const testAdapter500 = new CaptionSpecialistAdapter({ workerUrl: 'http://127.0.0.1:51241' });
  const server500Res = await testAdapter500.execute(validOpticalInput);
  assert(server500Res.status === 'failed', 'Test 8 Failed: 500 error must produce failed status.');
  assert(
    server500Res.rejectionReason?.includes('HTTP 500') === true,
    'Test 8 Failed: Rejection reason should specify HTTP 500.'
  );
  await new Promise<void>((resolve) => mockServer500.close(() => resolve()));
  console.log('  ✓ PASS: 8. Worker HTTP failure handled');

  // Test 9: Worker timeout handled
  const mockServerHanging = http.createServer((_req, _res) => {
    // Deliberately never respond
  });
  await new Promise<void>((resolve) => mockServerHanging.listen(51242, resolve));

  const testAdapterTimeout = new CaptionSpecialistAdapter({
    workerUrl: 'http://127.0.0.1:51242',
    timeoutMs: 100 // fast timeout for test
  });
  const timeoutRes = await testAdapterTimeout.execute(validOpticalInput);
  assert(timeoutRes.status === 'failed', 'Test 9 Failed: Timed out worker must result in failed status.');
  assert(
    timeoutRes.rejectionReason?.includes('timed out') === true ||
      timeoutRes.rejectionReason?.includes('unavailable') === true,
    'Test 9 Failed: Rejection reason should note timeout or unavailability.'
  );
  await new Promise<void>((resolve) => mockServerHanging.close(() => resolve()));
  console.log('  ✓ PASS: 9. Worker timeout handled');

  // Test 10: Malformed worker response rejected
  const mockServerMalformed = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ wrongField: 'Not a caption' }));
  });
  await new Promise<void>((resolve) => mockServerMalformed.listen(51243, resolve));

  const testAdapterMalformed = new CaptionSpecialistAdapter({ workerUrl: 'http://127.0.0.1:51243' });
  const malformedRes = await testAdapterMalformed.execute(validOpticalInput);
  assert(malformedRes.status === 'failed', 'Test 10 Failed: Malformed output must be failed.');
  assert(
    malformedRes.rejectionReason?.includes('Malformed worker response') === true,
    'Test 10 Failed: Rejection reason should specify malformed response.'
  );
  await new Promise<void>((resolve) => mockServerMalformed.close(() => resolve()));
  console.log('  ✓ PASS: 10. Malformed worker response rejected');

  // Test 11: Empty caption rejected
  const mockServerEmptyCaption = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        caption: '   ',
        modelName: 'MBZUAI/geochat-7B',
        device: 'cuda'
      })
    );
  });
  await new Promise<void>((resolve) => mockServerEmptyCaption.listen(51244, resolve));

  const testAdapterEmpty = new CaptionSpecialistAdapter({ workerUrl: 'http://127.0.0.1:51244' });
  const emptyRes = await testAdapterEmpty.execute(validOpticalInput);
  assert(emptyRes.status === 'failed', 'Test 11 Failed: Empty caption must produce failed status.');
  assert(
    emptyRes.rejectionReason?.includes('empty caption') === true,
    'Test 11 Failed: Rejection reason should specify empty caption.'
  );
  await new Promise<void>((resolve) => mockServerEmptyCaption.close(() => resolve()));
  console.log('  ✓ PASS: 11. Empty caption rejected');

  // Test 12: Valid caption response parsed correctly
  let capturedAuthHeader = '';
  const mockServerSuccess = http.createServer((req, res) => {
    capturedAuthHeader = req.headers['authorization'] || '';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        caption: 'The satellite scene depicts a large airport complex with an active dual runway system, taxiways, and passenger terminal buildings.',
        confidence: 0.0,
        modelName: 'MBZUAI/geochat-7B',
        device: 'cuda',
        durationMs: 1420,
        provenance: 'MODEL_GENERATED',
        validationState: 'validated',
        requestId: 'cap-test-6'
      })
    );
  });
  await new Promise<void>((resolve) => mockServerSuccess.listen(51245, resolve));

  const testAdapterSuccess = new CaptionSpecialistAdapter({ workerUrl: 'http://127.0.0.1:51245' });
  const successRes = await testAdapterSuccess.execute(validOpticalInput);
  assert(successRes.status === 'complete', 'Test 12 Failed: Success response should mark status "complete".');
  assert(
    successRes.answerText === 'The satellite scene depicts a large airport complex with an active dual runway system, taxiways, and passenger terminal buildings.',
    'Test 12 Failed: Caption text mismatch.'
  );
  assert(successRes.evidence.evidenceType === 'text', 'Test 12 Failed: Evidence type should be text.');
  assert(successRes.executionMetrics.modelName === 'MBZUAI/geochat-7B', 'Test 12 Failed: Model name mismatch.');
  assert(
    capturedAuthHeader.startsWith('Bearer satquery-geochat-worker-secret'),
    'Test 12 Failed: Authorization header must be sent.'
  );
  await new Promise<void>((resolve) => mockServerSuccess.close(() => resolve()));
  console.log('  ✓ PASS: 12. Valid caption response parsed correctly');

  // Test 13: No fake caption generated when worker is unavailable
  const offlineAdapter = new CaptionSpecialistAdapter({
    workerUrl: 'http://127.0.0.1:59998',
    timeoutMs: 500
  });
  const offlineRes = await offlineAdapter.execute(validOpticalInput);
  assert(offlineRes.status === 'failed', 'Test 13 Failed: Offline worker must produce failed status.');
  assert(offlineRes.answerText === '', 'Test 13 Failed: Fake caption must NEVER be generated.');
  assert(offlineRes.evidence.evidenceType === 'none', 'Test 13 Failed: Evidence must be "none".');
  assert(
    offlineRes.rejectionReason?.includes('GeoChat captioning worker is unavailable.') === true,
    'Test 13 Failed: Rejection reason must be truthful worker unavailable message.'
  );
  console.log('  ✓ PASS: 13. No fake caption generated');

  // Test 14: Adapter lifecycle verified
  const lifecycleAdapter = new CaptionSpecialistAdapter();
  assert(lifecycleAdapter.state === 'uninitialized', 'Test 14 Failed: Lifecycle must start at uninitialized.');
  await lifecycleAdapter.initialize();
  assert(lifecycleAdapter.state === 'ready', 'Test 14 Failed: Lifecycle must reach ready state.');
  await lifecycleAdapter.dispose();
  assert(lifecycleAdapter.state === 'disposed', 'Test 14 Failed: Lifecycle must reach disposed state.');
  const disposedRes = await lifecycleAdapter.execute(validOpticalInput);
  assert(disposedRes.status === 'failed', 'Test 14 Failed: Disposed adapter must fail execution.');
  assert(
    disposedRes.rejectionReason?.includes('disposed') === true,
    'Test 14 Failed: Rejection reason should specify disposed state.'
  );
  console.log('  ✓ PASS: 14. Adapter lifecycle verified');

  // Test 15: Model unavailable path verified
  assert(
    offlineRes.metadataNotes?.some((note) => note.includes('No simulated or placeholder caption')) === true,
    'Test 15 Failed: SIH26167 integrity guard note missing from metadata.'
  );
  assert(
    offlineRes.metadataNotes?.some((note) => note.includes('AI Studio / local dev environment: real GeoChat inference unavailable')) === true,
    'Test 15 Failed: AI Studio CPU-only environment note missing.'
  );
  assert(
    offlineRes.metadataNotes?.some((note) => note.includes('Google Colab T4 environment: verified benchmark environment')) === true,
    'Test 15 Failed: Colab T4 verified benchmark note missing.'
  );
  assert(
    offlineRes.metadataNotes?.some((note) => note.includes('Inference worker unavailable')) === true,
    'Test 15 Failed: Truthful worker unavailable note missing.'
  );
  console.log('  ✓ PASS: 15. Model unavailable path verified');

  // Test 16: Authentication failure handled (HTTP 401)
  const mockServer401 = http.createServer((_req, res) => {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized: invalid token', code: 'UNAUTHORIZED' }));
  });
  await new Promise<void>((resolve) => mockServer401.listen(51246, resolve));

  const testAdapter401 = new CaptionSpecialistAdapter({ workerUrl: 'http://127.0.0.1:51246', authKey: 'bad-key' });
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
  await new Promise<void>((resolve) => mockServerReadiness.listen(51247, resolve));

  const testAdapterReadiness = new CaptionSpecialistAdapter({ workerUrl: 'http://127.0.0.1:51247' });
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
        caption: 'A dense urban scene with roads and buildings.',
        modelName: 'MBZUAI/geochat-7B',
        device: 'cuda',
        durationMs: 520,
        provenance: 'MODEL_GENERATED',
        validationState: 'validated',
        requestId: 'trace-cap-test-18'
      })
    );
  });
  await new Promise<void>((resolve) => mockServerProvenance.listen(51248, resolve));

  const testAdapterProv = new CaptionSpecialistAdapter({ workerUrl: 'http://127.0.0.1:51248' });
  const provRes = await testAdapterProv.execute({
    taskId: 'trace-cap-test-18',
    taskType: 'caption',
    query: 'Describe this scene.',
    images: [sampleOpticalImage]
  });
  assert(provRes.status === 'complete', 'Test 18 Failed: Must be complete.');
  assert(
    provRes.evidence.details?.provenance === 'MODEL_GENERATED',
    'Test 18 Failed: Provenance must be MODEL_GENERATED.'
  );
  assert(
    provRes.evidence.details?.requestId === 'trace-cap-test-18',
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

  // -----------------------------------------------------------------------
  // Tests 20-24: cleanGeoChatCaption() unit tests + rawOutput provenance
  // -----------------------------------------------------------------------

  // Test 20: Grounding tokens stripped from caption
  const groundingRaw = '{<80><8><100><24>|<90>}<delim>{<57><0><69><16>|<90>}';
  const cleaned20 = cleanGeoChatCaption(groundingRaw);
  assert(cleaned20 === '', 'Test 20 Failed: Grounding-only output must clean to empty string.');
  console.log('  ✓ PASS: 20. Grounding tokens stripped from caption');

  // Test 21: Natural-language text preserved after cleanup
  const plainText = 'A high-resolution satellite image of an airport terminal.';
  const cleaned21 = cleanGeoChatCaption(plainText);
  assert(cleaned21 === plainText, 'Test 21 Failed: Plain text must be preserved exactly.');
  console.log('  ✓ PASS: 21. Natural-language text preserved after cleanup');

  // Test 22: Mixed output — tokens removed, text survives
  const mixedRaw =
    'The scene shows a harbor {<80><8><100><24>|<90>}<delim>{<57><0><69><16>|<90>} with docked vessels.';
  const cleaned22 = cleanGeoChatCaption(mixedRaw);
  assert(
    cleaned22.includes('harbor') && cleaned22.includes('vessels'),
    'Test 22 Failed: Natural-language parts must survive mixed token cleanup.'
  );
  assert(
    !cleaned22.includes('{<') && !cleaned22.includes('<delim>'),
    'Test 22 Failed: Grounding tokens must be absent from cleaned output.'
  );
  console.log('  ✓ PASS: 22. Mixed output: tokens removed, text preserved');

  // Test 23: Token-only caption → empty string (adapter rejects it truthfully)
  const tokenOnly = '{<10><20><30><40>|<0>}<delim>{<50><60><70><80>|<45>}';
  assert(
    cleanGeoChatCaption(tokenOnly) === '',
    'Test 23 Failed: Token-only caption must clean to empty string.'
  );
  console.log('  ✓ PASS: 23. Token-only caption cleans to empty string (would be rejected)');

  // Test 24: rawOutput stored in evidence.details when worker returns rawCaption
  const mockServerRaw = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        caption: 'Farmland with field boundaries.',
        rawCaption:
          'Farmland with field boundaries. {<80><8><100><24>|<90>}<delim>{<57><0><69><16>|<90>}',
        modelName: 'MBZUAI/geochat-7B',
        device: 'cuda',
        durationMs: 480,
        provenance: 'MODEL_GENERATED',
        validationState: 'validated',
        requestId: 'raw-cap-test-24'
      })
    );
  });
  await new Promise<void>((resolve) => mockServerRaw.listen(51260, resolve));
  const adapterRaw = new CaptionSpecialistAdapter({ workerUrl: 'http://127.0.0.1:51260' });
  const rawRes = await adapterRaw.execute({
    taskId: 'raw-cap-test-24',
    taskType: 'caption',
    query: 'Describe the scene.',
    images: [sampleOpticalImage]
  });
  assert(rawRes.status === 'complete', 'Test 24 Failed: Status must be complete.');
  assert(
    typeof rawRes.evidence.details?.rawOutput === 'string',
    'Test 24 Failed: rawOutput must be a string in evidence.details.'
  );
  assert(
    (rawRes.evidence.details?.rawOutput as string).includes('{<80>'),
    'Test 24 Failed: rawOutput must contain the original grounding tokens.'
  );
  assert(
    !rawRes.answerText.includes('{<'),
    'Test 24 Failed: answerText must not contain grounding tokens.'
  );
  await new Promise<void>((resolve) => mockServerRaw.close(() => resolve()));
  console.log('  ✓ PASS: 24. rawOutput stored in evidence.details; answerText is clean');

  console.log('\n--- All 24 SatQuery AI Phase 7 Caption Specialist Tests Passed Successfully! ---');
}

runStage6CTests().catch((err) => {
  console.error('Test execution exception:', err);
  process.exit(1);
});
