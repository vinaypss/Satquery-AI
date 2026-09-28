export interface UploadedImageFile {
  file: File;
  name: string;
  sizeBytes: number;
  format: string;
  mimeType: string;
  dataUri: string;
  previewUrl: string;
  isTiff?: boolean;
  validationStatus: 'VALID' | 'INVALID' | 'VALIDATING';
  validationErrors: string[];
  validationWarnings: string[];
  dimensions?: {
    width: number;
    height: number;
  };
  modality?: 'OPTICAL' | 'SAR' | 'MULTISPECTRAL';
  acquisitionDate?: string;
  geographicArea?: string;
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

export type RoutingStatus = 'routed' | 'rejected' | 'uncertain' | 'incompatible';
export type CompatibilityStatus = 'compatible' | 'incompatible' | 'uncertain' | 'rejected';

export interface RequiredInputsContract {
  singleImage: boolean;
  multipleImages: boolean;
  optical: boolean;
  sar: boolean;
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

export interface SpecialistOutput {
  toolId: string;
  status: SpecialistOutputStatus;
  answerText: string;
  evidence: SpecialistEvidence;
  rejectionReason?: string;
  executionMetrics: ExecutionMetrics;
  metadataNotes?: string[];
}

// ─── Stage 7: Result Integration & Reporting ─────────────────────────────────

export type ResultReportStatus =
  | 'complete'
  | 'failed'
  | 'rejected'
  | 'routing_failed'
  | 'parse_failed';

export interface ProvenanceChain {
  queryParsed: boolean;
  parsedTaskType: ParsedQueryTaskType | null;
  parseConfidence: number | null;
  taskRouted: boolean;
  selectedToolId: string | null;
  routingStatus: RoutingStatus | null;
  specialistExecuted: boolean;
  specialistStatus: SpecialistOutputStatus | null;
  evidenceType: SpecialistEvidenceType | null;
  device: string | null;
  modelName: string | null;
  inferenceMs: number | null;
  evidenceFabricated: false;
}

export interface PipelineMetrics {
  parseMs: number;
  routeMs: number;
  executeMs: number;
  totalMs: number;
}

export interface SihCompliance {
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

export interface InputImageDescriptor {
  id?: string;
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
  dataUri?: string;
  modality?: 'OPTICAL' | 'SAR' | 'MULTISPECTRAL';
  acquisitionDate?: string;
  geographicArea?: string;
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
  supportedModalities: ('OPTICAL' | 'SAR' | 'MULTISPECTRAL')[];
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
  modalities: ('OPTICAL' | 'SAR' | 'MULTISPECTRAL')[];
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
  specialists: Record<string, ModelAuditEntry>;
  verificationSummary: {
    totalAudited: number;
    verifiedCandidates: number;
    conditionallySuitable: number;
    researchOnly: number;
    unverifiedOrBlocked: number;
  };
}

export interface WorkspaceState {
  image: UploadedImageFile | null;
  query: string;
  parsedQuery: ParsedQuery | null;
  routingDecision: RoutingDecisionResult | null;
  executionResult: SpecialistOutput | null;
  report: ResultReport | null;
  isParsingQuery: boolean;
  isRouting: boolean;
  isExecuting: boolean;
  isAnalyzing: boolean;
  selectedTask: string | null;
  activeBottomTab: 'evidence' | 'metadata' | 'execution' | 'model_audit';
  error: string | null;
}
