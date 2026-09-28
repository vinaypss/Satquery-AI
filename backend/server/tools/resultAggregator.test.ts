import assert from 'node:assert/strict';
import {
  generateReportId,
  buildProvenanceChain,
  determineReportStatus,
  buildErrorSummary,
  buildResultReport
} from '../agent/resultAggregator.js';
import {
  ParsedQuery,
  RoutingDecisionResult,
  SpecialistOutput
} from '../types/index.js';

let passed = 0;
function check(condition: boolean, msg: string) {
  assert.ok(condition, msg);
  passed++;
  console.log(`  ✓ PASS: ${msg}`);
}

async function run() {
  console.log('--- Running SatQuery AI Stage 7 Result Aggregator & Reporting Tests ---');

  // 1. generateReportId tests
  const id1 = generateReportId();
  const id2 = generateReportId();
  check(typeof id1 === 'string', 'generateReportId returns a string');
  check(id1.startsWith('rpt_'), 'generateReportId starts with "rpt_" prefix');
  check(id1.length > 10, 'generateReportId has sufficient entropy/length');
  check(id1 !== id2, 'generateReportId produces unique IDs across invocations');

  // 2. buildProvenanceChain with null inputs
  const emptyChain = buildProvenanceChain(null, null, null);
  check(emptyChain.queryParsed === false, 'emptyChain.queryParsed is false');
  check(emptyChain.taskRouted === false, 'emptyChain.taskRouted is false');
  check(emptyChain.specialistExecuted === false, 'emptyChain.specialistExecuted is false');
  check(emptyChain.evidenceFabricated === false, 'emptyChain.evidenceFabricated is false (SIH26167 guarantee)');

  // 3. buildProvenanceChain with full pipeline objects
  const mockParsedQuery: ParsedQuery = {
    rawQuery: 'Where are the buildings?',
    taskType: 'grounding',
    confidence: 0.95,
    targetFeatures: ['buildings'],
    requestedObjects: ['buildings'],
    temporalIntent: false,
    comparisonIntent: false,
    modalityIntent: 'optical',
    requiresMultipleImages: false,
    explanation: 'Detects spatial objects.'
  };

  const mockRoutingDecision: RoutingDecisionResult = {
    taskId: 'task_001',
    selectedToolId: 'tool_grounding_specialist',
    taskType: 'grounding',
    routingStatus: 'routed',
    confidence: 0.95,
    reasoning: 'Routed to grounding tool.',
    requiredInputs: { singleImage: true, multipleImages: false, optical: true, sar: false },
    compatibilityStatus: 'compatible',
    compatibilityErrors: [],
    warnings: []
  };

  const mockSpecialistOutput: SpecialistOutput = {
    toolId: 'tool_grounding_specialist',
    status: 'complete',
    answerText: 'Detected 2 building structures.',
    evidence: {
      evidenceType: 'bounding_box',
      boxes: [
        { label: 'building', xmin: 0.1, ymin: 0.1, xmax: 0.4, ymax: 0.4, confidence: 0.88 }
      ]
    },
    executionMetrics: {
      modelName: 'IDEA-Research/grounding-dino-tiny',
      durationMs: 42,
      device: 'cuda'
    },
    metadataNotes: ['Real inference pass complete.']
  };

  const fullChain = buildProvenanceChain(mockParsedQuery, mockRoutingDecision, mockSpecialistOutput);
  check(fullChain.queryParsed === true, 'fullChain.queryParsed is true');
  check(fullChain.parsedTaskType === 'grounding', 'fullChain.parsedTaskType is "grounding"');
  check(fullChain.parseConfidence === 0.95, 'fullChain.parseConfidence matches input');
  check(fullChain.taskRouted === true, 'fullChain.taskRouted is true');
  check(fullChain.selectedToolId === 'tool_grounding_specialist', 'fullChain.selectedToolId matches router');
  check(fullChain.specialistExecuted === true, 'fullChain.specialistExecuted is true');
  check(fullChain.specialistStatus === 'complete', 'fullChain.specialistStatus is "complete"');
  check(fullChain.evidenceType === 'bounding_box', 'fullChain.evidenceType is "bounding_box"');
  check(fullChain.device === 'cuda', 'fullChain.device is "cuda"');
  check(fullChain.modelName === 'IDEA-Research/grounding-dino-tiny', 'fullChain.modelName matches');
  check(fullChain.inferenceMs === 42, 'fullChain.inferenceMs matches');
  check(fullChain.evidenceFabricated === false, 'fullChain.evidenceFabricated is strictly false');

  // 4. determineReportStatus permutations
  check(determineReportStatus(null, null, null, 'parse err') === 'parse_failed', 'returns parse_failed on explicit error');
  check(determineReportStatus(null, null, null) === 'parse_failed', 'returns parse_failed when parsedQuery is null');

  const rejectedRouting: RoutingDecisionResult = { ...mockRoutingDecision, routingStatus: 'rejected' };
  check(determineReportStatus(mockParsedQuery, rejectedRouting, null) === 'routing_failed', 'returns routing_failed when route is rejected');

  const uncertainRouting: RoutingDecisionResult = { ...mockRoutingDecision, routingStatus: 'uncertain' };
  check(determineReportStatus(mockParsedQuery, uncertainRouting, null) === 'routing_failed', 'returns routing_failed when route is uncertain');

  check(determineReportStatus(mockParsedQuery, mockRoutingDecision, null) === 'failed', 'returns failed when specialistOutput is null');

  const failedOutput: SpecialistOutput = { ...mockSpecialistOutput, status: 'failed' };
  check(determineReportStatus(mockParsedQuery, mockRoutingDecision, failedOutput) === 'failed', 'returns failed when output status is failed');

  const rejectedOutput: SpecialistOutput = { ...mockSpecialistOutput, status: 'rejected' };
  check(determineReportStatus(mockParsedQuery, mockRoutingDecision, rejectedOutput) === 'rejected', 'returns rejected when output status is rejected');

  check(determineReportStatus(mockParsedQuery, mockRoutingDecision, mockSpecialistOutput) === 'complete', 'returns complete when output status is complete');

  // 5. buildErrorSummary
  check(buildErrorSummary('complete', mockRoutingDecision, mockSpecialistOutput) === null, 'buildErrorSummary returns null for complete status');
  check(buildErrorSummary('failed', null, null, 'Custom network failure') === 'Custom network failure', 'buildErrorSummary respects custom error');
  check(typeof buildErrorSummary('parse_failed', null, null) === 'string', 'buildErrorSummary provides parse failure explanation');

  const compatErrorRouting: RoutingDecisionResult = {
    ...mockRoutingDecision,
    routingStatus: 'rejected',
    compatibilityErrors: ['SAR imagery not supported for grounding']
  };
  check(
    buildErrorSummary('routing_failed', compatErrorRouting, null)?.includes('SAR imagery not supported'),
    'buildErrorSummary includes compatibility errors'
  );

  const rejectionReasonOutput: SpecialistOutput = {
    ...mockSpecialistOutput,
    status: 'failed',
    rejectionReason: 'Worker unavailable on CPU host'
  };
  check(
    buildErrorSummary('failed', mockRoutingDecision, rejectionReasonOutput) === 'Worker unavailable on CPU host',
    'buildErrorSummary extracts rejectionReason'
  );

  // 6. buildResultReport end-to-end structure
  const report = buildResultReport({
    query: 'Where are the buildings?',
    parsedQuery: mockParsedQuery,
    routingDecision: mockRoutingDecision,
    specialistOutput: mockSpecialistOutput,
    pipelineMetrics: { parseMs: 2, routeMs: 3, executeMs: 45 }
  });

  check(report.reportId.startsWith('rpt_'), 'report.reportId starts with rpt_');
  check(report.status === 'complete', 'report.status is complete');
  check(report.query === 'Where are the buildings?', 'report.query matches');
  check(report.sihCompliance.zeroFabricatedEvidence === true, 'sihCompliance.zeroFabricatedEvidence is true');
  check(report.sihCompliance.provenanceVerified === true, 'sihCompliance.provenanceVerified is true for complete output');
  check(report.sihCompliance.modelAuditRef === 'SIH26167-STAGE6A', 'sihCompliance.modelAuditRef is SIH26167-STAGE6A');
  check(report.pipelineMetrics.totalMs === 50, 'report.pipelineMetrics.totalMs sums properly (2+3+45 = 50)');

  // 7. buildResultReport on failed output (unverified provenance)
  const failedReport = buildResultReport({
    query: 'Where are the buildings?',
    parsedQuery: mockParsedQuery,
    routingDecision: mockRoutingDecision,
    specialistOutput: failedOutput
  });
  check(failedReport.status === 'failed', 'failedReport.status is failed');
  check(failedReport.sihCompliance.zeroFabricatedEvidence === true, 'failedReport maintains zeroFabricatedEvidence guarantee');
  check(failedReport.sihCompliance.provenanceVerified === false, 'failedReport has provenanceVerified = false');

  console.log(`\n--- ALL ${passed} SatQuery AI Stage 7 Result Aggregator Tests Passed Successfully! ---`);
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
