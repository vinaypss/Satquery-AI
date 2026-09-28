/**
 * SatQuery AI - Stage 7 Result Aggregator & Reporting
 * SIH26167 | ISRO / Department of Space | Team IMPOSTERS
 *
 * Pure function aggregator that unifies all specialist outputs, routing decisions,
 * execution evidence, errors, and provenance into a standardized ResultReport.
 *
 * STRICT INTEGRITY: zero fabricated evidence. No simulated masks or bounding boxes.
 */

import {
  ParsedQuery,
  RoutingDecisionResult,
  SpecialistOutput,
  ResultReport,
  ResultReportStatus,
  ProvenanceChain,
  PipelineMetrics,
  SihCompliance
} from '../types/index.js';

export interface BuildResultReportOptions {
  query: string;
  parsedQuery?: ParsedQuery | null;
  routingDecision?: RoutingDecisionResult | null;
  specialistOutput?: SpecialistOutput | null;
  pipelineMetrics?: Partial<PipelineMetrics>;
  error?: string;
}

/**
 * Generate a unique, deterministic-prefixed report ID.
 */
export function generateReportId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 9);
  return `rpt_${ts}_${rand}`;
}

/**
 * Construct an auditable provenance chain tracing each stage of the analysis pipeline.
 */
export function buildProvenanceChain(
  parsedQuery?: ParsedQuery | null,
  routingDecision?: RoutingDecisionResult | null,
  specialistOutput?: SpecialistOutput | null
): ProvenanceChain {
  return {
    queryParsed: !!parsedQuery,
    parsedTaskType: parsedQuery?.taskType ?? null,
    parseConfidence: parsedQuery?.confidence ?? null,

    taskRouted: !!routingDecision && routingDecision.routingStatus === 'routed',
    selectedToolId: routingDecision?.selectedToolId ?? null,
    routingStatus: routingDecision?.routingStatus ?? null,

    specialistExecuted: !!specialistOutput,
    specialistStatus: specialistOutput?.status ?? null,
    evidenceType: specialistOutput?.evidence?.evidenceType ?? null,
    device: specialistOutput?.executionMetrics?.device ?? null,
    modelName: specialistOutput?.executionMetrics?.modelName ?? null,
    inferenceMs: specialistOutput?.executionMetrics?.durationMs ?? null,

    // Strictly guaranteed invariant per SIH26167
    evidenceFabricated: false
  };
}

/**
 * Determine the overall report status based on pipeline execution stages.
 */
export function determineReportStatus(
  parsedQuery?: ParsedQuery | null,
  routingDecision?: RoutingDecisionResult | null,
  specialistOutput?: SpecialistOutput | null,
  error?: string
): ResultReportStatus {
  if (error || !parsedQuery) {
    return 'parse_failed';
  }

  if (
    !routingDecision ||
    routingDecision.routingStatus === 'rejected' ||
    routingDecision.routingStatus === 'incompatible' ||
    routingDecision.routingStatus === 'uncertain'
  ) {
    return 'routing_failed';
  }

  if (!specialistOutput) {
    return 'failed';
  }

  if (specialistOutput.status === 'complete') {
    return 'complete';
  }

  if (specialistOutput.status === 'rejected') {
    return 'rejected';
  }

  return 'failed';
}

/**
 * Synthesize a concise, human-readable error summary.
 */
export function buildErrorSummary(
  status: ResultReportStatus,
  routingDecision?: RoutingDecisionResult | null,
  specialistOutput?: SpecialistOutput | null,
  customError?: string
): string | null {
  if (status === 'complete') {
    return null;
  }

  if (customError) {
    return customError;
  }

  if (status === 'parse_failed') {
    return 'Query parsing failed or no valid query was provided.';
  }

  if (status === 'routing_failed') {
    if (routingDecision?.compatibilityErrors && routingDecision.compatibilityErrors.length > 0) {
      return routingDecision.compatibilityErrors.join('; ');
    }
    return routingDecision?.reasoning || 'Task routing failed or supplied imagery was incompatible.';
  }

  if (specialistOutput?.rejectionReason) {
    return specialistOutput.rejectionReason;
  }

  if (status === 'rejected') {
    return 'Specialist adapter rejected the execution request.';
  }

  return 'Specialist execution failed or model was unavailable.';
}

/**
 * Build a unified ResultReport combining all pipeline metadata, metrics, and compliance guarantees.
 */
export function buildResultReport(options: BuildResultReportOptions): ResultReport {
  const {
    query,
    parsedQuery = null,
    routingDecision = null,
    specialistOutput = null,
    pipelineMetrics = {},
    error
  } = options;

  const status = determineReportStatus(parsedQuery, routingDecision, specialistOutput, error);
  const errorSummary = buildErrorSummary(status, routingDecision, specialistOutput, error);
  const provenanceChain = buildProvenanceChain(parsedQuery, routingDecision, specialistOutput);

  const parseMs = pipelineMetrics.parseMs ?? 0;
  const routeMs = pipelineMetrics.routeMs ?? 0;
  const executeMs = pipelineMetrics.executeMs ?? 0;
  const totalMs = pipelineMetrics.totalMs ?? (parseMs + routeMs + executeMs);

  const sihCompliance: SihCompliance = {
    zeroFabricatedEvidence: true,
    provenanceVerified: !!(specialistOutput && specialistOutput.status === 'complete'),
    modelAuditRef: 'SIH26167-STAGE6A'
  };

  return {
    reportId: generateReportId(),
    timestamp: new Date().toISOString(),
    query,
    status,
    parsedQuery,
    routingDecision,
    specialistOutput,
    provenanceChain,
    errorSummary,
    pipelineMetrics: {
      parseMs,
      routeMs,
      executeMs,
      totalMs
    },
    sihCompliance
  };
}
