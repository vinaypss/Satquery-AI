/**
 * SatQuery AI - Multimodal Remote Sensing Image Analysis
 * Problem Statement: SIH26167 | Organization: ISRO
 * Core Type Definitions (Stage 1 Foundation)
 */

export type AnalysisTaskType =
  | 'VQA'
  | 'CAPTION'
  | 'GROUNDING'
  | 'SEGMENTATION'
  | 'CHANGE_ANALYSIS'
  | 'OPTICAL_SAR';

export type ImageModality = 'OPTICAL' | 'SAR' | 'MULTISPECTRAL' | 'UNKNOWN';

export type ToolImplementationStatus =
  | 'IMPLEMENTED'
  | 'IMPLEMENTED_AND_TESTED'
  | 'PARTIALLY_IMPLEMENTED'
  | 'BLOCKED'
  | 'PLANNED'
  | 'FUTURE'
  | 'UNVERIFIED';

export interface HealthResponse {
  status: 'ok' | 'error';
  service: string;
  stage: string;
  timestamp?: string;
}

export interface SpecialistToolDefinition {
  id: string;
  name: string;
  taskType: AnalysisTaskType;
  description: string;
  acceptedModalities: ImageModality[];
  minImageCount: number;
  maxImageCount: number;
  temporalPairRequired: boolean;
  crossModalRequired: boolean;
  status: ToolImplementationStatus;
  version: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

export interface RemoteSensingImageMetadata {
  width?: number;
  height?: number;
  channels?: number;
  crs?: string;
  sensorModality?: ImageModality;
  acquisitionDate?: string;
  [key: string]: unknown;
}

export interface RemoteSensingImageInput {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  dataUri: string;
  metadata?: RemoteSensingImageMetadata;
}

export interface ImageValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  sanitizedImage?: RemoteSensingImageInput;
}

export interface ImageInputMetadata {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  extension: string;
  previewUrl?: string;
  modality?: ImageModality;
  acquisitionDate?: string;
  dimensions?: {
    width: number;
    height: number;
  };
}

export interface RouterDecision {
  detectedTask: AnalysisTaskType | null;
  requiredImageCount: number;
  detectedModality: ImageModality;
  requiredToolId: string | null;
  extractedTarget?: string;
  validationStatus: 'VALID' | 'INVALID' | 'PENDING';
  validationMessage?: string;
  routingReason?: string;
}

export interface AnalysisExecutionSummary {
  task: AnalysisTaskType | null;
  model: string | null;
  status: 'AWAITING_INPUT' | 'PENDING' | 'VALIDATING' | 'READY' | 'COMPLETED' | 'ERROR';
  executionTimeMs?: number;
  evidenceType?: 'BBOX' | 'MASK' | 'CHANGE_MAP' | 'TEXT' | 'NONE';
  timestamp?: string;
}

export type ParsedQueryTaskType =
  | 'vqa'
  | 'caption'
  | 'grounding'
  | 'segmentation'
  | 'change_analysis'
  | 'optical_sar'
  | 'uncertain';

export interface ParsedQuery {
  rawQuery: string;
  taskType: ParsedQueryTaskType;
  confidence: number;
  targetFeatures: string[];
  requestedObjects: string[];
  temporalIntent: boolean;
  comparisonIntent: boolean;
  modalityIntent: 'optical' | 'sar' | 'optical_sar' | null;
  requiresMultipleImages: boolean;
  explanation: string;
}

export interface QueryParseResult {
  valid: boolean;
  parsedQuery?: ParsedQuery;
  error?: string;
}

export type RoutingStatus = 'routed' | 'rejected' | 'uncertain' | 'incompatible';

export type CompatibilityStatus = 'compatible' | 'incompatible' | 'uncertain' | 'rejected';

export interface RequiredInputsContract {
  singleImage: boolean;
  multipleImages: boolean;
  optical: boolean;
  sar: boolean;
}

export interface ControlledSpecialistTool {
  toolId: string;
  taskType: ParsedQueryTaskType;
  displayName: string;
  supportedModalities: ImageModality[];
  minimumImageCount: number;
  maximumImageCount: number;
  requiresTemporalPair: boolean;
  requiresMultipleModalities: boolean;
  status: 'planned' | 'implemented' | 'blocked';
}

export interface RoutingDecisionResult {
  taskId: string;
  selectedToolId: string | null;
  taskType: ParsedQueryTaskType;
  routingStatus: RoutingStatus;
  confidence: number;
  reasoning: string;
  requiredInputs: RequiredInputsContract;
  compatibilityStatus: CompatibilityStatus;
  compatibilityErrors: string[];
  warnings: string[];
  executionBlockedReason?: string;
}

export interface InputImageDescriptor {
  id?: string;
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
  dataUri?: string;
  path?: string;
  modality?: ImageModality;
  acquisitionDate?: string;
  geographicArea?: string;
  coordinates?: [number, number] | [number, number, number, number];
  crs?: string;
  metadata?: Record<string, unknown>;
}

export interface RouteTaskRequest {
  parsedQuery: ParsedQuery;
  images: InputImageDescriptor[];
}

export interface CompatibilityCheckResult {
  status: CompatibilityStatus;
  errors: string[];
  warnings: string[];
}

export type AdapterLifecycleState = 'uninitialized' | 'loading' | 'ready' | 'failed' | 'disposed';

export type SpecialistOutputStatus = 'complete' | 'rejected' | 'failed';

export type SpecialistEvidenceType =
  | 'none'
  | 'text'
  | 'caption'
  | 'bounding_box'
  | 'segmentation_mask'
  | 'change_map'
  | 'modality_comparison';

export interface BoundingBoxEvidence {
  label: string;
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
  confidence?: number;
}

export interface SpecialistEvidence {
  evidenceType: SpecialistEvidenceType;
  text?: string;
  caption?: string;
  boxes?: BoundingBoxEvidence[];
  maskUrl?: string;
  changeMapUrl?: string;
  modalityComparison?: Record<string, unknown>;
  details?: Record<string, unknown>;
}

export interface ExecutionMetrics {
  modelName: string;
  durationMs: number;
  device: string;
}

export interface SpecialistInput {
  taskId: string;
  taskType: ParsedQueryTaskType;
  query: string;
  images: InputImageDescriptor[];
  parameters?: Record<string, unknown>;
}

export interface SpecialistOutput {
  toolId: string;
  status: SpecialistOutputStatus;
  answerText: string;
  evidence: SpecialistEvidence;
  rejectionReason?: string;
  executionMetrics: ExecutionMetrics;
  metadataNotes?: string[];
}

// ─── Stage 7: Result Integration & Reporting ────────────────────────────────

export type ResultReportStatus =
  | 'complete'
  | 'failed'
  | 'rejected'
  | 'routing_failed'
  | 'parse_failed';

export interface ProvenanceChain {
  /** Stage: query was parsed by the rule-based parser */
  queryParsed: boolean;
  parsedTaskType: ParsedQueryTaskType | null;
  parseConfidence: number | null;
  /** Stage: task was routed to a controlled specialist */
  taskRouted: boolean;
  selectedToolId: string | null;
  routingStatus: RoutingStatus | null;
  /** Stage: specialist adapter executed */
  specialistExecuted: boolean;
  specialistStatus: SpecialistOutputStatus | null;
  evidenceType: SpecialistEvidenceType | null;
  device: string | null;
  modelName: string | null;
  inferenceMs: number | null;
  /** Anti-fabrication invariant — always false per SIH26167 */
  evidenceFabricated: false;
}

export interface PipelineMetrics {
  parseMs: number;
  routeMs: number;
  executeMs: number;
  totalMs: number;
}

export interface SihCompliance {
  /** Always true — zero fabricated evidence per SIH26167 contract */
  zeroFabricatedEvidence: true;
  provenanceVerified: boolean;
  modelAuditRef: string;
}

export interface ResultReport {
  reportId: string;
  timestamp: string;
  query: string;
  status: ResultReportStatus;
  parsedQuery: ParsedQuery | null;
  routingDecision: RoutingDecisionResult | null;
  specialistOutput: SpecialistOutput | null;
  provenanceChain: ProvenanceChain;
  errorSummary: string | null;
  pipelineMetrics: PipelineMetrics;
  sihCompliance: SihCompliance;
}

export interface AnalyzeRequest {
  query: string;
  images: InputImageDescriptor[];
  parameters?: Record<string, unknown>;
}

export interface AnalyzeResponse {
  valid: boolean;
  report?: ResultReport;
  error?: string;
}

export interface SpecialistAdapter {
  readonly toolId: string;
  readonly name: string;
  readonly supportedTask: ParsedQueryTaskType;
  readonly supportedModalities: ImageModality[];
  readonly state: AdapterLifecycleState;
  initialize(): Promise<void>;
  execute(input: SpecialistInput): Promise<SpecialistOutput>;
  dispose(): Promise<void>;
}

export interface ExecuteTaskRequest {
  images?: InputImageDescriptor[];
  parsedQuery: ParsedQuery;
  routingResult: RoutingDecisionResult;
  parameters?: Record<string, unknown>;
}

export interface ExecuteTaskResponse {
  valid: boolean;
  output?: SpecialistOutput;
  error?: string;
}

export type ModelDeploymentStatus =
  | 'verified_candidate'
  | 'conditionally_suitable'
  | 'unverified'
  | 'blocked_by_environment'
  | 'research_only'
  | 'not_suitable';

export interface ModelAuditEntry {
  taskType: ParsedQueryTaskType;
  displayName: string;
  modelName: string;
  repository: string;
  checkpoint: string;
  taskCapability: string;
  supportedModalities: ImageModality[];
  expectedImageCount: number;
  requiredMetadata: string[];
  trainingFineTuningContext: string;
  inferenceFramework: string;
  minimumRecommendedHardware: string;
  estimatedMemoryRequirement: string;
  license: string;
  licenseNotes: string;
  checkpointAvailability: 'available' | 'unverified' | 'requires external verification' | 'restricted';
  deploymentStatus: ModelDeploymentStatus;
  confidence: number;
  verificationNotes: string;
  risks: string[];
  fallbackModel: string;
  fallbackNotes: string;
}

export interface ModelAuditMatrixSummary {
  task: string;
  taskType: ParsedQueryTaskType;
  primaryCandidate: string;
  backup: string;
  modalities: ImageModality[];
  images: number;
  checkpoint: string;
  license: string;
  hardware: string;
  deploymentStatus: ModelDeploymentStatus;
  confidence: number;
  verificationState: string;
}

export interface ModelAuditResponse {
  valid: boolean;
  timestamp: string;
  sihProblemId: string;
  environmentAudit: {
    primaryDevelopmentMachine: {
      type: string;
      os: string;
      graphics: string;
      cudaSupport: boolean;
      status: string;
      notes: string;
    };
    gpuTestEnvironment: {
      platform: string;
      gpu: string;
      vram: string;
      status: string;
      notes: string;
    };
  };
  matrix: ModelAuditMatrixSummary[];
  specialists: Record<Exclude<ParsedQueryTaskType, 'uncertain'>, ModelAuditEntry>;
  verificationSummary: {
    totalAudited: number;
    verifiedCandidates: number;
    conditionallySuitable: number;
    researchOnly: number;
    unverifiedOrBlocked: number;
  };
}


