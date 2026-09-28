/**
 * SatQuery AI - Stage 4 Agentic Task Router
 * SIH26167 | ISRO Space Technology
 *
 * Deterministically orchestrates input validation, query understanding, and controlled
 * specialist tool selection.
 * In Stage 4, execution STOPS before specialist invocation.
 * Planned tools are cataloged but MUST NEVER be executed.
 */

import {
  ParsedQuery,
  InputImageDescriptor,
  RoutingDecisionResult,
  RoutingStatus,
  RequiredInputsContract,
  ControlledSpecialistTool
} from '../types/index.js';
import { getSpecialistToolByTask } from '../tools/toolRegistry.js';
import { validateCompatibility } from '../validation/compatibilityValidator.js';

let taskCounter = 0;

/**
 * Resets task ID counter for deterministic testing
 */
export function resetTaskCounter(): void {
  taskCounter = 0;
}

/**
 * Generates an auditable task ID
 */
function generateTaskId(): string {
  taskCounter++;
  return `task_${String(taskCounter).padStart(3, '0')}`;
}

/**
 * Routes a parsed query and remote-sensing image input into a specialist tool selection.
 * Stops prior to model execution.
 */
export function routeTask(
  parsedQuery: ParsedQuery,
  images: InputImageDescriptor[] = []
): RoutingDecisionResult {
  const taskId = generateTaskId();
  const taskType = parsedQuery.taskType;

  // 1. Identify Candidate Specialist Tool
  const tool: ControlledSpecialistTool | undefined = getSpecialistToolByTask(taskType);

  // 2. Derive Required Inputs Contract
  const requiredInputs: RequiredInputsContract = {
    singleImage: tool ? tool.minimumImageCount === 1 && tool.maximumImageCount === 1 : false,
    multipleImages: tool ? tool.minimumImageCount >= 2 : false,
    optical: tool ? tool.supportedModalities.includes('OPTICAL') || tool.supportedModalities.includes('MULTISPECTRAL') : false,
    sar: tool ? tool.supportedModalities.includes('SAR') : false
  };

  // 3. Handle Ambiguous / Uncertain Queries
  if (taskType === 'uncertain' || !tool) {
    return {
      taskId,
      selectedToolId: null,
      taskType: taskType || 'uncertain',
      routingStatus: 'uncertain',
      confidence: Math.min(parsedQuery.confidence || 0.25, 0.5),
      reasoning: 'Query is ambiguous or lacks recognized remote-sensing task triggers. Router cannot dispatch to a specialist.',
      requiredInputs,
      compatibilityStatus: 'uncertain',
      compatibilityErrors: ['Query could not be mapped to any registered specialist capability.'],
      warnings: [],
      executionBlockedReason: 'Execution halted: Task type is uncertain.'
    };
  }

  // 4. Validate Compatibility
  const compatibility = validateCompatibility(parsedQuery, images);

  // 5. Determine Routing Status and Confidence
  let routingStatus: RoutingStatus;
  let confidence: number;
  let reasoning: string;

  if (compatibility.status === 'rejected') {
    routingStatus = 'rejected';
    // Rejection confidence represents certainty of incompatibility
    confidence = 0.35;
    reasoning = `Imagery inputs failed compatibility checks for ${tool.displayName}: ${compatibility.errors.join(' ')}`;
  } else {
    routingStatus = 'routed';
    // High confidence: 0.90–1.00 when parsedQuery is clean and inputs are fully compatible
    confidence = Math.max(0.9, parsedQuery.confidence);
    if (compatibility.warnings.length > 0) {
      confidence = 0.85; // Moderate when warnings are present
    }
    reasoning = `The parsed query indicates "${taskType}" intent. Assigned specialist: "${tool.displayName}". All input constraints satisfied.`;
  }

  // 6. Assemble Final Routing Contract
  return {
    taskId,
    selectedToolId: tool.toolId,
    taskType,
    routingStatus,
    confidence,
    reasoning,
    requiredInputs,
    compatibilityStatus: compatibility.status,
    compatibilityErrors: compatibility.errors,
    warnings: compatibility.warnings,
    executionBlockedReason: 'Specialist execution not implemented in Stage 4. Tool status: planned.'
  };
}

/**
 * Execution Guard:
 * Strictly prevents execution of planned specialist tools in Stage 4.
 */
export function executeSpecialistTool(decision: RoutingDecisionResult): never {
  throw new Error(
    `Execution Prohibited: Specialist "${decision.selectedToolId || 'unknown'}" is in status "planned". Stage 4 strictly limits pipeline to routing decision only.`
  );
}
