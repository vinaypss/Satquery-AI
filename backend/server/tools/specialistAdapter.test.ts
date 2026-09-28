/**
 * SatQuery AI - Stage 5 Specialist Adapter & Execution Framework Tests
 * SIH26167 | ISRO Space Technology
 *
 * Validates the adapter lifecycle, controlled tool registry, execution controller,
 * error handling, and truthful non-inference contracts for all 6 specialists.
 */

import {
  VqaSpecialistAdapter,
  CaptionSpecialistAdapter,
  GroundingSpecialistAdapter,
  SegmentationSpecialistAdapter,
  ChangeAnalysisSpecialistAdapter,
  OpticalSarSpecialistAdapter,
  SPECIALIST_ADAPTER_REGISTRY,
  getSpecialistAdapter,
  getSpecialistAdapterByTask,
  getAllSpecialistAdapters,
  executeSpecialistTask
} from './index.js';

import {
  SpecialistInput,
  RoutingDecisionResult,
  InputImageDescriptor
} from '../types/index.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`FAILED: ${message}`);
    process.exit(1);
  }
}

async function runStage5Tests() {
  console.log('--- Running SatQuery AI Stage 5 Specialist Adapter Tests ---');

  const sampleOpticalImage: InputImageDescriptor = {
    id: 'img-optical-1',
    name: 'delhi_optical.png',
    modality: 'OPTICAL',
    acquisitionDate: '2024-05-12',
    geographicArea: 'Delhi'
  };

  const sampleSarImage: InputImageDescriptor = {
    id: 'img-sar-1',
    name: 'delhi_sar.tif',
    modality: 'SAR',
    acquisitionDate: '2024-05-12',
    geographicArea: 'Delhi'
  };

  const sampleTemporalImage2: InputImageDescriptor = {
    id: 'img-optical-2',
    name: 'delhi_optical_t2.png',
    modality: 'OPTICAL',
    acquisitionDate: '2024-11-20',
    geographicArea: 'Delhi'
  };

  // Test 1: Adapter lifecycle starts as uninitialized
  const vqaAdapter = new VqaSpecialistAdapter();
  assert(vqaAdapter.state === 'uninitialized', 'Test 1 Failed: Adapter lifecycle should start as "uninitialized".');
  console.log('  ✓ PASS: 1. Adapter lifecycle starts as uninitialized');

  // Test 2: Adapter initializes safely
  await vqaAdapter.initialize();
  assert(vqaAdapter.state === 'ready', 'Test 2 Failed: Adapter state should be "ready" after initialization.');
  console.log('  ✓ PASS: 2. Adapter initializes safely');

  // Test 3: Correct task type is accepted
  const validVqaInput: SpecialistInput = {
    taskId: 'task-test-01',
    taskType: 'vqa',
    query: 'Is there a runway visible?',
    images: [sampleOpticalImage]
  };
  const vqaOutput = await vqaAdapter.execute(validVqaInput);
  assert(vqaOutput.toolId === 'tool_vqa_specialist', 'Test 3 Failed: ToolId mismatch.');
  assert(vqaOutput.status === 'failed', 'Test 3 Failed: Stage 5 status must be "failed" (not implemented).');
  console.log('  ✓ PASS: 3. Correct task type is accepted');

  // Test 4: Incorrect task type is rejected
  const mismatchedInput: SpecialistInput = {
    taskId: 'task-test-02',
    taskType: 'change_analysis',
    query: 'What changed here?',
    images: [sampleOpticalImage]
  };
  const mismatchedOutput = await vqaAdapter.execute(mismatchedInput);
  assert(mismatchedOutput.status === 'rejected', 'Test 4 Failed: Task type mismatch should be rejected.');
  assert(
    mismatchedOutput.rejectionReason?.includes('Task type mismatch') === true,
    'Test 4 Failed: Mismatch rejection reason should mention task mismatch.'
  );
  console.log('  ✓ PASS: 4. Incorrect task type is rejected');

  // Test 5: Missing image is rejected
  const noImageInput: SpecialistInput = {
    taskId: 'task-test-03',
    taskType: 'vqa',
    query: 'Are there buildings?',
    images: []
  };
  const noImageOutput = await vqaAdapter.execute(noImageInput);
  assert(noImageOutput.status === 'rejected', 'Test 5 Failed: Empty image list should be rejected.');
  assert(
    noImageOutput.rejectionReason?.includes('at least 1 image') === true,
    'Test 5 Failed: Rejection reason should specify image requirement.'
  );
  console.log('  ✓ PASS: 5. Missing image is rejected');

  // Test 6: Invalid input is rejected (e.g. empty query for VQA)
  const emptyQueryInput: SpecialistInput = {
    taskId: 'task-test-04',
    taskType: 'vqa',
    query: '   ',
    images: [sampleOpticalImage]
  };
  const emptyQueryOutput = await vqaAdapter.execute(emptyQueryInput);
  assert(emptyQueryOutput.status === 'rejected', 'Test 6 Failed: Empty query should be rejected.');
  console.log('  ✓ PASS: 6. Invalid input is rejected');

  // Test 7: Controlled registry resolves the correct tool
  const groundingTool = getSpecialistAdapter('tool_grounding_specialist');
  assert(groundingTool !== undefined, 'Test 7 Failed: tool_grounding_specialist not found in registry.');
  assert(groundingTool?.supportedTask === 'grounding', 'Test 7 Failed: Supported task mismatch.');
  const byTaskTool = getSpecialistAdapterByTask('grounding');
  assert(byTaskTool?.toolId === 'tool_grounding_specialist', 'Test 7 Failed: getSpecialistAdapterByTask mismatch.');
  console.log('  ✓ PASS: 7. Controlled registry resolves the correct tool');

  // Test 8: Unknown tool cannot execute
  const unknownRouting: RoutingDecisionResult = {
    taskId: 'task-unknown',
    selectedToolId: 'tool_nonexistent_xyz',
    taskType: 'grounding',
    routingStatus: 'routed',
    confidence: 0.95,
    reasoning: 'Routing simulated',
    requiredInputs: { singleImage: true, multipleImages: false, optical: true, sar: false },
    compatibilityStatus: 'compatible',
    compatibilityErrors: [],
    warnings: []
  };
  const unknownOutput = await executeSpecialistTask(unknownRouting, validVqaInput);
  assert(unknownOutput.status === 'failed', 'Test 8 Failed: Unknown tool should fail execution.');
  assert(
    unknownOutput.rejectionReason?.includes('not registered') === true,
    'Test 8 Failed: Rejection reason should mention not registered.'
  );
  console.log('  ✓ PASS: 8. Unknown tool cannot execute');

  // Test 9: Unregistered tool cannot execute
  const nullToolRouting: RoutingDecisionResult = {
    taskId: 'task-null-tool',
    selectedToolId: null,
    taskType: 'uncertain',
    routingStatus: 'routed',
    confidence: 0.35,
    reasoning: 'Ambiguous query',
    requiredInputs: { singleImage: true, multipleImages: false, optical: true, sar: false },
    compatibilityStatus: 'compatible',
    compatibilityErrors: [],
    warnings: []
  };
  const nullToolOutput = await executeSpecialistTask(nullToolRouting, validVqaInput);
  assert(nullToolOutput.status === 'rejected', 'Test 9 Failed: Null tool routing must be rejected.');
  console.log('  ✓ PASS: 9. Unregistered tool cannot execute');

  // Test 10: Planned/unimplemented specialist cannot claim success
  const groundingRouting: RoutingDecisionResult = {
    taskId: 'task-grounding-valid',
    selectedToolId: 'tool_grounding_specialist',
    taskType: 'grounding',
    routingStatus: 'routed',
    confidence: 0.95,
    reasoning: 'Locate request',
    requiredInputs: { singleImage: true, multipleImages: false, optical: true, sar: false },
    compatibilityStatus: 'compatible',
    compatibilityErrors: [],
    warnings: []
  };
  const groundingInput: SpecialistInput = {
    taskId: 'task-grounding-valid',
    taskType: 'grounding',
    query: 'Where are the buildings?',
    images: [sampleOpticalImage],
    parameters: { targetFeatures: ['buildings'] }
  };
  const groundingOutput = await executeSpecialistTask(groundingRouting, groundingInput);
  assert(groundingOutput.status !== 'complete', 'Test 10 Failed: Stage 5 specialist must NOT claim complete/success.');
  assert(groundingOutput.status === 'failed', 'Test 10 Failed: Stage 5 specialist must return "failed".');
  console.log('  ✓ PASS: 10. Planned/unimplemented specialist cannot claim success');

  // Test 11: Specialist output follows the standardized schema
  assert(typeof groundingOutput.toolId === 'string', 'Test 11 Failed: toolId missing or invalid.');
  assert(typeof groundingOutput.status === 'string', 'Test 11 Failed: status missing or invalid.');
  assert(typeof groundingOutput.answerText === 'string', 'Test 11 Failed: answerText missing.');
  assert(typeof groundingOutput.evidence === 'object', 'Test 11 Failed: evidence object missing.');
  assert(typeof groundingOutput.executionMetrics === 'object', 'Test 11 Failed: executionMetrics missing.');
  console.log('  ✓ PASS: 11. Specialist output follows the standardized schema');

  // Test 12: Execution metrics are present
  assert(
    groundingOutput.executionMetrics.modelName.includes('unimplemented') ||
      groundingOutput.executionMetrics.modelName.includes('grounding-dino'),
    'Test 12 Failed: modelName must indicate unimplemented or grounding-dino.'
  );
  assert(
    typeof groundingOutput.executionMetrics.durationMs === 'number' &&
      groundingOutput.executionMetrics.durationMs >= 0,
    'Test 12 Failed: durationMs must be a non-negative number.'
  );
  assert(
    typeof groundingOutput.executionMetrics.device === 'string',
    'Test 12 Failed: device must be a string.'
  );
  console.log('  ✓ PASS: 12. Execution metrics are present');

  // Test 13: No fabricated evidence is returned
  assert(groundingOutput.evidence.evidenceType === 'none', 'Test 13 Failed: evidenceType must be "none".');
  assert(!groundingOutput.evidence.boxes, 'Test 13 Failed: boxes must not be fabricated.');
  assert(!groundingOutput.evidence.maskUrl, 'Test 13 Failed: maskUrl must not be fabricated.');
  assert(!groundingOutput.evidence.changeMapUrl, 'Test 13 Failed: changeMapUrl must not be fabricated.');
  assert(groundingOutput.answerText === '', 'Test 13 Failed: answerText must be empty.');
  console.log('  ✓ PASS: 13. No fabricated evidence is returned');

  // Test 14: Dispose changes lifecycle correctly
  const disposableAdapter = new VqaSpecialistAdapter();
  await disposableAdapter.initialize();
  assert(disposableAdapter.state === 'ready', 'Test 14 Failed: Should be ready.');
  await disposableAdapter.dispose();
  assert(disposableAdapter.state === 'disposed', 'Test 14 Failed: Should be disposed.');
  const disposedOutput = await disposableAdapter.execute(validVqaInput);
  assert(disposedOutput.status === 'failed', 'Test 14 Failed: Disposed adapter should fail execution.');
  assert(
    disposedOutput.rejectionReason?.includes('disposed') === true,
    'Test 14 Failed: Reason must mention disposed.'
  );
  console.log('  ✓ PASS: 14. Dispose changes lifecycle correctly');

  // Test 15: All six specialist adapters are registered
  const allAdapters = getAllSpecialistAdapters();
  assert(allAdapters.length === 6, `Test 15 Failed: Expected 6 adapters, got ${allAdapters.length}.`);
  const registeredIds = Object.keys(SPECIALIST_ADAPTER_REGISTRY);
  assert(registeredIds.includes('tool_vqa_specialist'), 'Test 15 Failed: missing vqa');
  assert(registeredIds.includes('tool_caption_specialist'), 'Test 15 Failed: missing caption');
  assert(registeredIds.includes('tool_grounding_specialist'), 'Test 15 Failed: missing grounding');
  assert(registeredIds.includes('tool_segmentation_specialist'), 'Test 15 Failed: missing segmentation');
  assert(registeredIds.includes('tool_change_specialist'), 'Test 15 Failed: missing change');
  assert(registeredIds.includes('tool_optical_sar_specialist'), 'Test 15 Failed: missing optical_sar');
  console.log('  ✓ PASS: 15. All six specialist adapters are registered');

  // Test 16: VQA adapter contract
  const vqa = new VqaSpecialistAdapter();
  assert(vqa.supportedTask === 'vqa', 'Test 16 Failed: task mismatch');
  assert(vqa.toolId === 'tool_vqa_specialist', 'Test 16 Failed: toolId mismatch');
  const vqaRes = await vqa.execute({
    taskId: 'vqa-01',
    taskType: 'vqa',
    query: 'Is there water visible?',
    images: [sampleOpticalImage]
  });
  assert(vqaRes.status === 'failed' && vqaRes.evidence.evidenceType === 'none', 'Test 16 Failed: vqa execute');
  console.log('  ✓ PASS: 16. VQA adapter contract');

  // Test 17: Caption adapter contract
  const caption = new CaptionSpecialistAdapter();
  assert(caption.supportedTask === 'caption', 'Test 17 Failed: task mismatch');
  assert(caption.toolId === 'tool_caption_specialist', 'Test 17 Failed: toolId mismatch');
  const captionRes = await caption.execute({
    taskId: 'cap-01',
    taskType: 'caption',
    query: 'Describe this scene.',
    images: [sampleOpticalImage]
  });
  assert(captionRes.status === 'failed' && captionRes.evidence.evidenceType === 'none', 'Test 17 Failed: caption execute');
  console.log('  ✓ PASS: 17. Caption adapter contract');

  // Test 18: Grounding adapter contract
  const grounding = new GroundingSpecialistAdapter();
  assert(grounding.supportedTask === 'grounding', 'Test 18 Failed: task mismatch');
  assert(grounding.toolId === 'tool_grounding_specialist', 'Test 18 Failed: toolId mismatch');
  const groundingRes = await grounding.execute({
    taskId: 'grd-01',
    taskType: 'grounding',
    query: 'Find the runway.',
    images: [sampleOpticalImage],
    parameters: { targetFeatures: ['runway'] }
  });
  assert(groundingRes.status === 'failed' && groundingRes.evidence.evidenceType === 'none', 'Test 18 Failed: grounding execute');
  console.log('  ✓ PASS: 18. Grounding adapter contract');

  // Test 19: Segmentation adapter contract
  const segmentation = new SegmentationSpecialistAdapter();
  assert(segmentation.supportedTask === 'segmentation', 'Test 19 Failed: task mismatch');
  assert(segmentation.toolId === 'tool_segmentation_specialist', 'Test 19 Failed: toolId mismatch');
  const segRes = await segmentation.execute({
    taskId: 'seg-01',
    taskType: 'segmentation',
    query: 'Segment roads.',
    images: [sampleOpticalImage]
  });
  assert(segRes.status === 'failed' && segRes.evidence.evidenceType === 'none', 'Test 19 Failed: seg execute');
  console.log('  ✓ PASS: 19. Segmentation adapter contract');

  // Test 20: Change analysis adapter contract
  const change = new ChangeAnalysisSpecialistAdapter();
  assert(change.supportedTask === 'change_analysis', 'Test 20 Failed: task mismatch');
  assert(change.toolId === 'tool_change_specialist', 'Test 20 Failed: toolId mismatch');
  // Rejects 1 image
  const changeFail = await change.execute({
    taskId: 'chg-01',
    taskType: 'change_analysis',
    query: 'What changed?',
    images: [sampleOpticalImage]
  });
  assert(changeFail.status === 'rejected', 'Test 20 Failed: change analysis requires 2 images');
  // Accepts 2 images and safely halts before inference
  const changePass = await change.execute({
    taskId: 'chg-02',
    taskType: 'change_analysis',
    query: 'What changed?',
    images: [sampleOpticalImage, sampleTemporalImage2]
  });
  assert(changePass.status === 'failed' && changePass.evidence.evidenceType === 'none', 'Test 20 Failed: change pass');
  console.log('  ✓ PASS: 20. Change analysis adapter contract');

  // Test 21: Optical-SAR adapter contract
  const opticalSar = new OpticalSarSpecialistAdapter();
  assert(opticalSar.supportedTask === 'optical_sar', 'Test 21 Failed: task mismatch');
  assert(opticalSar.toolId === 'tool_optical_sar_specialist', 'Test 21 Failed: toolId mismatch');
  // Rejects without SAR
  const opticalSarFail = await opticalSar.execute({
    taskId: 'opsar-01',
    taskType: 'optical_sar',
    query: 'Compare optical and SAR.',
    images: [sampleOpticalImage, sampleTemporalImage2]
  });
  assert(opticalSarFail.status === 'rejected', 'Test 21 Failed: must reject missing SAR');
  // Accepts optical + SAR and safely halts before inference
  const opticalSarPass = await opticalSar.execute({
    taskId: 'opsar-02',
    taskType: 'optical_sar',
    query: 'Compare optical and SAR.',
    images: [sampleOpticalImage, sampleSarImage]
  });
  assert(opticalSarPass.status === 'failed' && opticalSarPass.evidence.evidenceType === 'none', 'Test 21 Failed: opticalSar pass');
  console.log('  ✓ PASS: 21. Optical-SAR adapter contract');

  console.log('Test Summary: 21 passed, 0 failed out of 21 total tests.');
}

runStage5Tests().catch((err) => {
  console.error('Stage 5 test runner failed:', err);
  process.exit(1);
});
