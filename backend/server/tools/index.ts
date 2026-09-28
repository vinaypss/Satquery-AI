/**
 * SatQuery AI - Stage 5 Controlled Specialist Registry & Execution Controller
 * SIH26167 | ISRO Space Technology
 *
 * Exposes all six specialist adapters from a controlled registry and provides
 * safe, auditable execution control.
 * In Stage 5, every specialist safely stops before model inference.
 */

import {
  SpecialistAdapter,
  ParsedQueryTaskType,
  RoutingDecisionResult,
  SpecialistInput,
  SpecialistOutput
} from '../types/index.js';

import { VqaSpecialistAdapter } from './vqa.js';
import { CaptionSpecialistAdapter } from './caption.js';
import { GroundingSpecialistAdapter } from './grounding.js';
import { SegmentationSpecialistAdapter } from './segmentation.js';
import { ChangeAnalysisSpecialistAdapter } from './changeAnalysis.js';
import { OpticalSarSpecialistAdapter } from './opticalSar.js';

// Export all adapter classes
export {
  BaseSpecialistAdapter
} from './specialistAdapter.js';
export { VqaSpecialistAdapter } from './vqa.js';
export { CaptionSpecialistAdapter } from './caption.js';
export { GroundingSpecialistAdapter } from './grounding.js';
export { SegmentationSpecialistAdapter } from './segmentation.js';
export { ChangeAnalysisSpecialistAdapter } from './changeAnalysis.js';
export { OpticalSarSpecialistAdapter } from './opticalSar.js';

// Singleton registry of the 6 controlled specialist adapters
const vqaAdapter = new VqaSpecialistAdapter();
const captionAdapter = new CaptionSpecialistAdapter();
const groundingAdapter = new GroundingSpecialistAdapter();
const segmentationAdapter = new SegmentationSpecialistAdapter();
const changeAdapter = new ChangeAnalysisSpecialistAdapter();
const opticalSarAdapter = new OpticalSarSpecialistAdapter();

export const SPECIALIST_ADAPTER_REGISTRY: Record<string, SpecialistAdapter> = {
  [vqaAdapter.toolId]: vqaAdapter,
  [captionAdapter.toolId]: captionAdapter,
  [groundingAdapter.toolId]: groundingAdapter,
  [segmentationAdapter.toolId]: segmentationAdapter,
  [changeAdapter.toolId]: changeAdapter,
  [opticalSarAdapter.toolId]: opticalSarAdapter
};

export const TASK_TO_ADAPTER_MAP: Partial<Record<ParsedQueryTaskType, SpecialistAdapter>> = {
  vqa: vqaAdapter,
  caption: captionAdapter,
  grounding: groundingAdapter,
  segmentation: segmentationAdapter,
  change_analysis: changeAdapter,
  optical_sar: opticalSarAdapter
};

/**
 * Retrieve a specialist adapter by its unique tool identifier.
 */
export function getSpecialistAdapter(toolId: string): SpecialistAdapter | undefined {
  return SPECIALIST_ADAPTER_REGISTRY[toolId];
}

/**
 * Retrieve a specialist adapter by its supported task type.
 */
export function getSpecialistAdapterByTask(task: ParsedQueryTaskType): SpecialistAdapter | undefined {
  return TASK_TO_ADAPTER_MAP[task];
}

/**
 * List all 6 controlled specialist adapters.
 */
export function getAllSpecialistAdapters(): SpecialistAdapter[] {
  return Object.values(SPECIALIST_ADAPTER_REGISTRY);
}

/**
 * Controlled execution controller.
 * Validates the Stage 4 routing decision and dispatches to the controlled specialist adapter.
 * At Stage 5, every specialist stops before model inference and returns a truthful output.
 */
export async function executeSpecialistTask(
  routingDecision: RoutingDecisionResult,
  input: SpecialistInput
): Promise<SpecialistOutput> {
  const startTime = Date.now();

  // 1. Verify routing decision exists
  if (!routingDecision) {
    return {
      toolId: 'unknown',
      status: 'failed',
      answerText: '',
      evidence: { evidenceType: 'none' },
      rejectionReason: 'Execution rejected: Missing routing decision.',
      executionMetrics: {
        modelName: 'none (unimplemented)',
        durationMs: 1,
        device: 'none'
      },
      metadataNotes: ['Execution controller halted: No routing decision provided.']
    };
  }

  // 2. Verify routing status is valid
  if (routingDecision.routingStatus !== 'routed') {
    return {
      toolId: routingDecision.selectedToolId || 'unknown',
      status: 'rejected',
      answerText: '',
      evidence: { evidenceType: 'none' },
      rejectionReason: `Execution rejected: Routing status is "${routingDecision.routingStatus}". Reason: ${routingDecision.reasoning}`,
      executionMetrics: {
        modelName: 'none (unimplemented)',
        durationMs: 1,
        device: 'none'
      },
      metadataNotes: routingDecision.compatibilityErrors.length > 0
        ? routingDecision.compatibilityErrors
        : ['Routing was not confirmed. Execution aborted.']
    };
  }

  // 3. Verify selected tool exists
  if (!routingDecision.selectedToolId) {
    return {
      toolId: 'none',
      status: 'rejected',
      answerText: '',
      evidence: { evidenceType: 'none' },
      rejectionReason: 'Execution rejected: No specialist tool was selected by the router.',
      executionMetrics: {
        modelName: 'none (unimplemented)',
        durationMs: 1,
        device: 'none'
      }
    };
  }

  // 4. Verify tool is in the controlled registry (prevent arbitrary execution)
  const adapter = getSpecialistAdapter(routingDecision.selectedToolId);
  if (!adapter) {
    return {
      toolId: routingDecision.selectedToolId,
      status: 'failed',
      answerText: '',
      evidence: { evidenceType: 'none' },
      rejectionReason: `Execution rejected: Tool "${routingDecision.selectedToolId}" is not registered in the controlled specialist registry.`,
      executionMetrics: {
        modelName: 'none (unimplemented)',
        durationMs: 1,
        device: 'none'
      }
    };
  }

  // 5. Verify compatibility is satisfied
  if (routingDecision.compatibilityStatus !== 'compatible') {
    return {
      toolId: adapter.toolId,
      status: 'rejected',
      answerText: '',
      evidence: { evidenceType: 'none' },
      rejectionReason: `Execution rejected: Input compatibility check returned "${routingDecision.compatibilityStatus}".`,
      executionMetrics: {
        modelName: 'none (unimplemented)',
        durationMs: 1,
        device: 'none'
      },
      metadataNotes: routingDecision.compatibilityErrors
    };
  }

  // 6. Invoke adapter contract (Stage 5 safely stops before inference)
  return await adapter.execute(input);
}
