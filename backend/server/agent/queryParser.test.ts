/**
 * SatQuery AI - Stage 3 Query Parser Test Suite
 * SIH26167 | ISRO Space Technology
 *
 * Verifies all 15 required query understanding conditions.
 */

import { parseQuery, extractTargetFeatures } from './queryParser.js';

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

export function runAllQueryTests() {
  console.log('\n--- Running SatQuery AI Stage 3 Query Parser Tests ---\n');

  // 1. Empty query
  {
    const res1 = parseQuery('');
    const res2 = parseQuery('    ');
    assert(
      !res1.valid && !res2.valid && res1.error?.includes('cannot be empty'),
      '1. Empty query rejected with structured error'
    );
  }

  // 2. Caption query
  {
    const res = parseQuery('Describe this satellite image.');
    assert(
      res.valid &&
      res.parsedQuery?.taskType === 'caption' &&
      res.parsedQuery.confidence >= 0.9 &&
      !res.parsedQuery.requiresMultipleImages,
      '2. Caption query parsed correctly'
    );
  }

  // 3. VQA query
  {
    const res = parseQuery('What is present in this image?');
    assert(
      res.valid &&
      res.parsedQuery?.taskType === 'vqa' &&
      res.parsedQuery.confidence >= 0.85 &&
      !res.parsedQuery.requiresMultipleImages,
      '3. VQA query parsed correctly'
    );
  }

  // 4. Grounding buildings
  {
    const res = parseQuery('Where are the buildings?');
    assert(
      res.valid &&
      res.parsedQuery?.taskType === 'grounding' &&
      res.parsedQuery.targetFeatures.includes('buildings') &&
      res.parsedQuery.requestedObjects.includes('buildings'),
      '4. Grounding query for "buildings" correctly identified with target'
    );
  }

  // 5. Grounding runway
  {
    const res = parseQuery('Locate the runway.');
    assert(
      res.valid &&
      res.parsedQuery?.taskType === 'grounding' &&
      res.parsedQuery.targetFeatures.includes('runway'),
      '5. Grounding query for "runway" correctly identified with target'
    );
  }

  // 6. Segmentation roads
  {
    const res = parseQuery('Segment the roads.');
    assert(
      res.valid &&
      res.parsedQuery?.taskType === 'segmentation' &&
      res.parsedQuery.targetFeatures.includes('roads') &&
      !res.parsedQuery.requiresMultipleImages,
      '6. Segmentation query for "roads" correctly identified'
    );
  }

  // 7. Change analysis
  {
    const res = parseQuery('What changed between these two images?');
    assert(
      res.valid &&
      res.parsedQuery?.taskType === 'change_analysis' &&
      res.parsedQuery.temporalIntent === true &&
      res.parsedQuery.requiresMultipleImages === true,
      '7. Change analysis query detected with temporal and multi-image requirements'
    );
  }

  // 8. Optical-SAR
  {
    const res = parseQuery('Compare the optical and SAR images.');
    assert(
      res.valid &&
      res.parsedQuery?.taskType === 'optical_sar' &&
      res.parsedQuery.modalityIntent === 'optical_sar' &&
      res.parsedQuery.comparisonIntent === true &&
      res.parsedQuery.requiresMultipleImages === true,
      '8. Optical-SAR cross-modal query detected with cross-modal intent'
    );
  }

  // 9. Ambiguous query
  {
    const res = parseQuery('Analyze it');
    assert(
      res.valid &&
      res.parsedQuery?.taskType === 'uncertain' &&
      res.parsedQuery.confidence <= 0.3 &&
      res.parsedQuery.explanation.includes('ambiguous'),
      '9. Ambiguous query identified as uncertain with low confidence'
    );
  }

  // 10. Target extraction
  {
    const target1 = extractTargetFeatures('where are the residential buildings in this image?');
    const target2 = extractTargetFeatures('segment the agricultural water bodies');
    assert(
      target1[0] === 'residential buildings' && target2[0] === 'agricultural water bodies',
      '10. Accurate target feature extraction without extraneous context filler'
    );
  }

  // 11. Case normalization
  {
    const resUpper = parseQuery('WHERE ARE THE BUILDINGS?');
    const resLower = parseQuery('where are the buildings?');
    assert(
      resUpper.valid &&
      resLower.valid &&
      resUpper.parsedQuery?.taskType === resLower.parsedQuery?.taskType &&
      resUpper.parsedQuery?.targetFeatures[0] === resLower.parsedQuery?.targetFeatures[0],
      '11. Case normalization produces equivalent task and targets'
    );
  }

  // 12. Punctuation handling
  {
    const resPunct = parseQuery('Where are the buildings??!...');
    assert(
      resPunct.valid &&
      resPunct.parsedQuery?.taskType === 'grounding' &&
      resPunct.parsedQuery?.targetFeatures[0] === 'buildings',
      '12. Query handles excessive trailing and internal punctuation safely'
    );
  }

  // 13. Multi-image intent
  {
    const changeRes = parseQuery('Show differences between the 2023 and 2024 images.');
    const singleRes = parseQuery('Describe this satellite image.');
    assert(
      changeRes.parsedQuery?.requiresMultipleImages === true &&
      singleRes.parsedQuery?.requiresMultipleImages === false,
      '13. Multi-image intent correctly assigned based on task nature'
    );
  }

  // 14. Temporal intent
  {
    const temporalRes = parseQuery('Has this area become more urbanized over time?');
    const staticRes = parseQuery('Locate the runway.');
    assert(
      temporalRes.parsedQuery?.temporalIntent === true &&
      staticRes.parsedQuery?.temporalIntent === false,
      '14. Temporal intent correctly detected for multi-epoch queries'
    );
  }

  // 15. Comparison intent
  {
    const compRes1 = parseQuery('Compare optical and SAR imagery.');
    const compRes2 = parseQuery('What changed between the two dates?');
    const nonCompRes = parseQuery('Where are the buildings?');
    assert(
      compRes1.parsedQuery?.comparisonIntent === true &&
      compRes2.parsedQuery?.comparisonIntent === true &&
      nonCompRes.parsedQuery?.comparisonIntent === false,
      '15. Comparison intent correctly flagged for comparative workflows'
    );
  }

  console.log(`\nTest Summary: ${passed} passed, ${failed} failed out of ${passed + failed} total tests.\n`);
  return { passed, failed };
}

const result = runAllQueryTests();
if (result.failed > 0) {
  process.exit(1);
}
