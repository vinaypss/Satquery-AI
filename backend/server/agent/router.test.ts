/**
 * SatQuery AI - Stage 4 Agentic Task Router Test Suite
 * SIH26167 | ISRO Space Technology
 *
 * Verifies all 18 required routing and compatibility rules.
 */

import { routeTask, executeSpecialistTool, resetTaskCounter } from './router.js';
import { parseQuery } from './queryParser.js';
import { InputImageDescriptor } from '../types/index.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}${detail ? ` - ${detail}` : ''}`);
    failed++;
  }
}

export function runAllRouterTests() {
  console.log('\n--- Running SatQuery AI Stage 4 Agentic Router Tests ---\n');
  resetTaskCounter();

  // Common Mock Images
  const opticalImg1: InputImageDescriptor = {
    id: 'img-1',
    name: 'delhi_optical_2023.png',
    modality: 'OPTICAL',
    acquisitionDate: '2023-05-12',
    geographicArea: 'Delhi'
  };

  const opticalImg2: InputImageDescriptor = {
    id: 'img-2',
    name: 'delhi_optical_2024.png',
    modality: 'OPTICAL',
    acquisitionDate: '2024-05-18',
    geographicArea: 'Delhi'
  };

  const rajasthanImg: InputImageDescriptor = {
    id: 'img-raj',
    name: 'rajasthan_optical_2023.png',
    modality: 'OPTICAL',
    acquisitionDate: '2023-01-10',
    geographicArea: 'Rajasthan'
  };

  const sarImg1: InputImageDescriptor = {
    id: 'img-sar',
    name: 'delhi_sentinel1_sar.png',
    modality: 'SAR',
    acquisitionDate: '2023-05-12',
    geographicArea: 'Delhi'
  };

  // 1. VQA route
  {
    const pq = parseQuery('What is present in this image?').parsedQuery!;
    const res = routeTask(pq, [opticalImg1]);
    assert(
      res.routingStatus === 'routed' &&
      res.selectedToolId === 'tool_vqa_specialist' &&
      res.taskType === 'vqa',
      '1. VQA route selected tool_vqa_specialist'
    );
  }

  // 2. Caption route
  {
    const pq = parseQuery('Describe this satellite image.').parsedQuery!;
    const res = routeTask(pq, [opticalImg1]);
    assert(
      res.routingStatus === 'routed' &&
      res.selectedToolId === 'tool_caption_specialist' &&
      res.taskType === 'caption',
      '2. Caption route selected tool_caption_specialist'
    );
  }

  // 3. Grounding route
  {
    const pq = parseQuery('Where are the buildings?').parsedQuery!;
    const res = routeTask(pq, [opticalImg1]);
    assert(
      res.routingStatus === 'routed' &&
      res.selectedToolId === 'tool_grounding_specialist' &&
      res.taskType === 'grounding' &&
      res.compatibilityStatus === 'compatible',
      '3. Grounding route selected tool_grounding_specialist'
    );
  }

  // 4. Segmentation route
  {
    const pq = parseQuery('Segment the roads.').parsedQuery!;
    const res = routeTask(pq, [opticalImg1]);
    assert(
      res.routingStatus === 'routed' &&
      res.selectedToolId === 'tool_segmentation_specialist' &&
      res.taskType === 'segmentation',
      '4. Segmentation route selected tool_segmentation_specialist'
    );
  }

  // 5. Change-analysis route
  {
    const pq = parseQuery('What changed between these two images?').parsedQuery!;
    const res = routeTask(pq, [opticalImg1, opticalImg2]);
    assert(
      res.routingStatus === 'routed' &&
      res.selectedToolId === 'tool_change_specialist' &&
      res.taskType === 'change_analysis',
      '5. Change-analysis route selected tool_change_specialist'
    );
  }

  // 6. Optical-SAR route
  {
    const pq = parseQuery('Compare optical and SAR imagery.').parsedQuery!;
    const res = routeTask(pq, [opticalImg1, sarImg1]);
    assert(
      res.routingStatus === 'routed' &&
      res.selectedToolId === 'tool_optical_sar_specialist' &&
      res.taskType === 'optical_sar',
      '6. Optical-SAR route selected tool_optical_sar_specialist'
    );
  }

  // 7. Unknown task
  {
    const fakePq = {
      rawQuery: 'Random query',
      taskType: 'unknown_task' as any,
      confidence: 0.1,
      targetFeatures: [],
      requestedObjects: [],
      temporalIntent: false,
      comparisonIntent: false,
      modalityIntent: null,
      requiresMultipleImages: false,
      explanation: 'Unknown task'
    };
    const res = routeTask(fakePq, [opticalImg1]);
    assert(
      res.routingStatus === 'uncertain' && res.selectedToolId === null,
      '7. Unknown task routed to uncertain with null toolId'
    );
  }

  // 8. Ambiguous task
  {
    const pq = parseQuery('Analyze it').parsedQuery!;
    const res = routeTask(pq, [opticalImg1]);
    assert(
      res.routingStatus === 'uncertain' &&
      res.selectedToolId === null &&
      res.confidence <= 0.35,
      '8. Ambiguous task routed to uncertain with low confidence'
    );
  }

  // 9. Change analysis with one image
  {
    const pq = parseQuery('What changed between these images?').parsedQuery!;
    const res = routeTask(pq, [opticalImg1]);
    assert(
      res.routingStatus === 'rejected' &&
      res.compatibilityStatus === 'rejected' &&
      res.compatibilityErrors.some((e) => e.includes('two')),
      '9. Change analysis with single image is rejected'
    );
  }

  // 10. Change analysis with two compatible images
  {
    const pq = parseQuery('Show differences between the 2023 and 2024 images.').parsedQuery!;
    const res = routeTask(pq, [opticalImg1, opticalImg2]);
    assert(
      res.routingStatus === 'routed' &&
      res.compatibilityStatus === 'compatible' &&
      res.compatibilityErrors.length === 0,
      '10. Change analysis with two co-located temporal images is compatible'
    );
  }

  // 11. Change analysis with mismatched locations
  {
    const pq = parseQuery('What changed between these scenes?').parsedQuery!;
    const res = routeTask(pq, [opticalImg1, rajasthanImg]); // Delhi vs Rajasthan
    assert(
      res.routingStatus === 'rejected' &&
      res.compatibilityErrors.some((e) => e.includes('mismatched')),
      '11. Change analysis with geographically mismatched scenes is rejected'
    );
  }

  // 12. Optical-SAR without SAR
  {
    const pq = parseQuery('Compare the optical and SAR imagery.').parsedQuery!;
    const res = routeTask(pq, [opticalImg1, opticalImg2]); // Two opticals, no SAR
    assert(
      res.routingStatus === 'rejected' &&
      res.compatibilityErrors.some((e) => e.includes('SAR')),
      '12. Optical-SAR without SAR image is rejected'
    );
  }

  // 13. Optical-SAR without optical imagery
  {
    const sarImg2: InputImageDescriptor = {
      id: 'img-sar-2',
      name: 'sar_pass_2.png',
      modality: 'SAR',
      geographicArea: 'Delhi'
    };
    const pq = parseQuery('Compare optical and SAR imagery.').parsedQuery!;
    const res = routeTask(pq, [sarImg1, sarImg2]); // Two SARs, no optical
    assert(
      res.routingStatus === 'rejected' &&
      res.compatibilityErrors.some((e) => e.includes('Optical')),
      '13. Optical-SAR without optical image is rejected'
    );
  }

  // 14. Grounding without target feature
  {
    const badGroundingPq = {
      rawQuery: 'Where is the object?',
      taskType: 'grounding' as const,
      confidence: 0.8,
      targetFeatures: [], // Missing target
      requestedObjects: [],
      temporalIntent: false,
      comparisonIntent: false,
      modalityIntent: null,
      requiresMultipleImages: false,
      explanation: 'Grounding without specific target'
    };
    const res = routeTask(badGroundingPq, [opticalImg1]);
    assert(
      res.routingStatus === 'rejected' &&
      res.compatibilityErrors.some((e) => e.includes('specific object class')),
      '14. Grounding query missing target feature is rejected'
    );
  }

  // 15. Planned specialist must not execute
  {
    const pq = parseQuery('Where are the buildings?').parsedQuery!;
    const decision = routeTask(pq, [opticalImg1]);
    let caught = false;
    try {
      executeSpecialistTool(decision);
    } catch (err: any) {
      caught = err.message.includes('Execution Prohibited') && err.message.includes('planned');
    }
    assert(caught, '15. Execution guard strictly prohibits running planned specialist');
  }

  // 16. Routing confidence
  {
    const pqClean = parseQuery('Describe this satellite image.').parsedQuery!;
    const resClean = routeTask(pqClean, [opticalImg1]);
    const pqAmbig = parseQuery('Do this').parsedQuery!;
    const resAmbig = routeTask(pqAmbig, [opticalImg1]);
    assert(
      resClean.confidence >= 0.9 && resAmbig.confidence <= 0.35,
      '16. Deterministic confidence: high for valid compatible, low for ambiguous'
    );
  }

  // 17. Compatibility rejection
  {
    const pq = parseQuery('What changed between these images?').parsedQuery!;
    const res = routeTask(pq, []); // 0 images
    assert(
      res.routingStatus === 'rejected' &&
      res.compatibilityStatus === 'rejected' &&
      res.compatibilityErrors.length > 0,
      '17. Compatibility failure properly produces rejected routing contract'
    );
  }

  // 18. Successful compatible routing
  {
    const pq = parseQuery('Segment the roads.').parsedQuery!;
    const res = routeTask(pq, [opticalImg1]);
    assert(
      res.taskId.startsWith('task_') &&
      res.routingStatus === 'routed' &&
      res.selectedToolId === 'tool_segmentation_specialist' &&
      res.compatibilityStatus === 'compatible' &&
      res.requiredInputs.singleImage === true,
      '18. Successful compatible routing returns complete contract and toolId'
    );
  }

  console.log(`\nTest Summary: ${passed} passed, ${failed} failed out of ${passed + failed} total tests.\n`);
  return { passed, failed };
}

const result = runAllRouterTests();
if (result.failed > 0) {
  process.exit(1);
}
