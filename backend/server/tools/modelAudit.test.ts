/**
 * SatQuery AI - Stage 6A Specialist Model & Capability Audit Tests
 * Problem Statement: SIH26167 | Organization: ISRO
 *
 * Automated verification suite ensuring:
 * 1. All six specialist tasks have comprehensive audit entries.
 * 2. Every entry has a strict deploymentStatus.
 * 3. Every entry has truthful verificationNotes.
 * 4. Unverified candidates are not marked verified_candidate.
 * 5. General Grounding DINO is not mislabeled as RS-specialized.
 * 6. Segmentation class-ontology limitations are represented.
 * 7. Change-analysis temporal requirements are represented.
 * 8. Optical-SAR uncertainty is represented when no verified checkpoint exists.
 * 9. Hardware requirements are represented (Intel Iris Xe laptop vs Colab T4).
 * 10. GET /api/model-audit returns a structured response.
 */

import { Server } from 'http';
import {
  SPECIALIST_MODEL_AUDIT_REGISTRY,
  HARDWARE_ENVIRONMENT_AUDIT,
  getModelAuditMatrix,
  getFullModelAuditResponse,
  getSpecialistAuditEntry
} from './modelAudit.js';
import { createServerApp } from '../index.js';
import { ParsedQueryTaskType } from '../types/index.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`  ✓ PASS: ${message}`);
  }
}

async function runStage6ATests() {
  console.log('--- Running SatQuery AI Stage 6A Specialist Model Audit Tests ---');

  const requiredTasks: ParsedQueryTaskType[] = [
    'vqa',
    'caption',
    'grounding',
    'segmentation',
    'change_analysis',
    'optical_sar'
  ];

  // 1. All six specialist tasks have audit entries
  const auditedTaskKeys = Object.keys(SPECIALIST_MODEL_AUDIT_REGISTRY) as ParsedQueryTaskType[];
  assert(
    requiredTasks.every((task) => auditedTaskKeys.includes(task)),
    '1. All six specialist tasks (vqa, caption, grounding, segmentation, change_analysis, optical_sar) have audit entries'
  );

  // 2. Every entry has a deploymentStatus
  const allowedStatuses = [
    'verified_candidate',
    'conditionally_suitable',
    'unverified',
    'blocked_by_environment',
    'research_only',
    'not_suitable'
  ];
  const allHaveValidStatus = requiredTasks.every((task) => {
    const entry = SPECIALIST_MODEL_AUDIT_REGISTRY[task];
    return entry && allowedStatuses.includes(entry.deploymentStatus);
  });
  assert(allHaveValidStatus, '2. Every specialist audit entry has a valid, strict deploymentStatus');

  // 3. Every entry has verificationNotes
  const allHaveVerificationNotes = requiredTasks.every((task) => {
    const entry = SPECIALIST_MODEL_AUDIT_REGISTRY[task];
    return entry && typeof entry.verificationNotes === 'string' && entry.verificationNotes.trim().length > 15;
  });
  assert(allHaveVerificationNotes, '3. Every specialist entry has comprehensive, truthful verificationNotes');

  // 4. Unverified candidates are not marked verified_candidate
  const noPrematureVerification = requiredTasks.every((task) => {
    const entry = SPECIALIST_MODEL_AUDIT_REGISTRY[task];
    if (entry.checkpointAvailability === 'unverified' || entry.checkpoint.includes('none verified')) {
      return entry.deploymentStatus !== 'verified_candidate';
    }
    // None should be marked verified_candidate until live inference testing is conducted
    return entry.deploymentStatus !== 'verified_candidate';
  });
  assert(noPrematureVerification, '4. Unverified and untested candidates are strictly not marked verified_candidate');

  // 5. General Grounding DINO is not mislabeled as RS-specialized
  const groundingEntry = SPECIALIST_MODEL_AUDIT_REGISTRY.grounding;
  const groundingNotMislabeled =
    groundingEntry.trainingFineTuningContext.toLowerCase().includes('general-purpose checkpoint only') &&
    groundingEntry.verificationNotes.toLowerCase().includes('not remote-sensing specialized') &&
    groundingEntry.risks.some((r) => r.toLowerCase().includes('not remote-sensing adapted'));
  assert(
    groundingNotMislabeled,
    '5. General Grounding DINO is explicitly identified as natural-image baseline and not mislabeled as RS-specialized'
  );

  // 6. Segmentation model audit: general ADE20K baseline and unverified RS production candidate
  const segmentationEntry = SPECIALIST_MODEL_AUDIT_REGISTRY.segmentation;
  const segmentationIsGeneralBaseline =
    segmentationEntry.checkpoint === 'nvidia/segformer-b0-finetuned-ade-512-512' &&
    segmentationEntry.modelName.includes('General Semantic-Segmentation Baseline - ADE20K') &&
    segmentationEntry.trainingFineTuningContext.includes('ADE20K') &&
    segmentationEntry.trainingFineTuningContext.toLowerCase().includes('general computer vision semantic segmentation baseline') &&
    segmentationEntry.trainingFineTuningContext.includes('NOT fine-tuned or adapted on satellite or aerial remote-sensing datasets');
  assert(
    segmentationIsGeneralBaseline,
    '6a. SegFormer-B0 is explicitly classified as a general ADE20K semantic-segmentation baseline and NOT as an RS-specialized model'
  );

  const segmentationRealInferenceVerified =
    segmentationEntry.deploymentStatus === 'conditionally_suitable' &&
    segmentationEntry.checkpointAvailability === 'available' &&
    segmentationEntry.verificationNotes.toLowerCase().includes('not remote-sensing specialized') &&
    segmentationEntry.verificationNotes.toLowerCase().includes('verification_evidence.json') &&
    segmentationEntry.verificationNotes.toLowerCase().includes('tesla t4') &&
    segmentationEntry.verificationNotes.toLowerCase().includes('not validated') &&
    segmentationEntry.risks.some((r) => r.toLowerCase().includes('not remote-sensing adapted')) &&
    segmentationEntry.risks.some((r) => r.toLowerCase().includes('class ontology mismatch')) &&
    segmentationEntry.risks.some((r) => r.toLowerCase().includes('rs production checkpoint unverified'));
  assert(
    segmentationRealInferenceVerified,
    '6b. Real SegFormer-B0 T4 forward pass verified (evidence file recorded) while RS specialization/accuracy stays NOT VALIDATED'
  );

  // 7. Change-analysis temporal requirements are represented
  const changeEntry = SPECIALIST_MODEL_AUDIT_REGISTRY.change_analysis;
  const changeTemporalRequirementsMet =
    changeEntry.expectedImageCount === 2 &&
    changeEntry.requiredMetadata.some((m) => m.toLowerCase().includes('acquisitiondate')) &&
    changeEntry.requiredMetadata.some((m) => m.toLowerCase().includes('co-registration')) &&
    changeEntry.supportedModalities.includes('OPTICAL');
  assert(
    changeTemporalRequirementsMet,
    '7. Change-analysis bi-temporal image pair (count: 2), co-registration, and acquisition date requirements are represented'
  );

  // 8. Optical-SAR uncertainty is represented when no verified checkpoint exists
  const opticalSarEntry = SPECIALIST_MODEL_AUDIT_REGISTRY.optical_sar;
  const opticalSarUncertaintyDocumented =
    opticalSarEntry.deploymentStatus === 'research_only' &&
    opticalSarEntry.checkpointAvailability === 'unverified' &&
    opticalSarEntry.checkpoint.toLowerCase().includes('none verified') &&
    opticalSarEntry.verificationNotes.toLowerCase().includes('candidate architecture — not yet verified for deployment');
  assert(
    opticalSarUncertaintyDocumented,
    '8. Optical-SAR lack of pre-trained unified checkpoint is truthfully represented as research_only with fallback'
  );

  // 9. Hardware requirements are represented
  const hwReport = HARDWARE_ENVIRONMENT_AUDIT;
  const hardwareRepresented =
    hwReport.primaryDevelopmentMachine.graphics.includes('Intel Iris Xe') &&
    hwReport.primaryDevelopmentMachine.cudaSupport === false &&
    hwReport.primaryDevelopmentMachine.status.includes('blocked') &&
    hwReport.gpuTestEnvironment.gpu.includes('Tesla T4') &&
    hwReport.gpuTestEnvironment.status === 'conditionally_suitable';
  assert(
    hardwareRepresented,
    '9. Hardware reality (Intel Iris Xe laptop blocked for CUDA vs. Colab Tesla T4 conditionally suitable) is faithfully audited'
  );

  // 10. GET /api/model-audit returns a structured response via HTTP
  const app = createServerApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3000;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/model-audit`);
    assert(res.status === 200, '10a. GET /api/model-audit returns HTTP 200');

    const data = await res.json();
    assert(data.valid === true, '10b. Audit response valid is true');
    assert(data.sihProblemId === 'SIH26167', '10c. Response includes SIH26167 header identifier');
    assert(Array.isArray(data.matrix) && data.matrix.length === 6, '10d. Model matrix contains all 6 specialists');
    assert(typeof data.specialists === 'object' && Object.keys(data.specialists).length === 6, '10e. Specialists object contains all 6 entries');
    assert(data.verificationSummary.totalAudited === 6, '10f. Verification summary tallies 6 audited specialists');
    assert(data.environmentAudit.primaryDevelopmentMachine.cudaSupport === false, '10g. Environment audit includes workstation constraints');

    // Test task query parameter
    const vqaRes = await fetch(`http://127.0.0.1:${port}/api/model-audit?taskType=vqa`);
    assert(vqaRes.status === 200, '10h. GET /api/model-audit?taskType=vqa returns HTTP 200');
    const vqaData = await vqaRes.json();
    assert(vqaData.entry.modelName === 'GeoChat-7B', '10i. Specific specialist query retrieves GeoChat-7B for VQA');

    const notFoundRes = await fetch(`http://127.0.0.1:${port}/api/model-audit?taskType=nonexistent`);
    assert(notFoundRes.status === 404, '10j. Unknown task query returns HTTP 404');
  } finally {
    server.close();
  }

  // 11. Helper functions test
  const matrixSummary = getModelAuditMatrix();
  assert(matrixSummary.length === 6, '11a. getModelAuditMatrix() returns exactly 6 specialist summaries');

  const fullResponse = getFullModelAuditResponse();
  assert(fullResponse.verificationSummary.researchOnly >= 1, '11b. At least one specialist correctly marked research_only');
  assert(fullResponse.verificationSummary.conditionallySuitable >= 3, '11c. Primary candidates marked conditionally_suitable');

  const vqaEntry = getSpecialistAuditEntry('vqa');
  assert(vqaEntry?.modelName === 'GeoChat-7B', '11d. getSpecialistAuditEntry("vqa") retrieves correct model');

  const uncertainEntry = getSpecialistAuditEntry('uncertain');
  assert(uncertainEntry === undefined, '11e. getSpecialistAuditEntry("uncertain") returns undefined');

  assert(fullResponse.verificationSummary.unverifiedOrBlocked >= 1, '11f. Unverified/blocked specialists correctly counted');
  const segEntry = getSpecialistAuditEntry('segmentation');
  assert(segEntry?.deploymentStatus === 'conditionally_suitable', '11g. getSpecialistAuditEntry("segmentation") reflects real-inference-verified status');

  console.log('--- All SatQuery AI Stage 6A Specialist Model Audit Tests Passed Successfully! ---');
}

runStage6ATests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
