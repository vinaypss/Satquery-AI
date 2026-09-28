/**
 * SatQuery AI - Stage 6D / Phase 8 Grounding Specialist Configuration & Types
 * SIH26167 | ISRO Space Technology
 *
 * Configuration for the Visual Grounding Specialist using Grounding DINO Tiny.
 * Per Phase 8 specifications:
 * - Model: Grounding DINO Tiny (IDEA-Research/grounding-dino-tiny)
 * - Checkpoint: groundingdino_swint_ogc
 * - Architecture: Swin-T general-purpose text-guided detection with RS zero-shot transfer.
 * - IMPORTANT: Not remote-sensing specialized; evaluated as an open-vocabulary baseline.
 */

export interface GroundingConfig {
  modelId: string;
  checkpoint: string;
  workerUrl: string;
  authKey: string;
  timeoutMs: number;
  boxThreshold: number;
  textThreshold: number;
  coordinateFormat: 'normalized_xyxy' | 'pixel_xyxy';
  device: string;
}

export interface GroundingBoxCoordinates {
  xMin: number;
  yMin: number;
  xMax: number;
  yMax: number;
}

export interface GroundingDetectionItem {
  label: string;
  confidence: number;
  box: GroundingBoxCoordinates;
}

export interface GroundingWorkerRequest {
  task: 'grounding';
  requestId?: string;
  image: {
    name?: string;
    mimeType?: string;
    dataUri?: string;
    path?: string;
    modality?: string;
  };
  target: string;
  parameters?: {
    boxThreshold?: number;
    textThreshold?: number;
    coordinateFormat?: 'normalized_xyxy' | 'pixel_xyxy';
  };
}

export interface GroundingWorkerResponse {
  task: 'grounding';
  model: string;
  checkpoint?: string;
  status: 'success' | 'failed';
  provenance?: string;
  coordinateFormat: 'normalized_xyxy' | 'pixel_xyxy';
  imageDimensions?: {
    width: number;
    height: number;
  };
  detections: GroundingDetectionItem[];
  durationMs?: number;
  device?: string;
  requestId?: string;
  error?: string;
}

export interface WorkerHealthResponse {
  status: string;
  cuda_available: boolean;
  gpu_name: string;
  total_vram_gb: number;
  available_vram_gb: number;
  model_loaded: boolean;
  model_id: string;
  checkpoint?: string;
  device: string;
  message: string;
  load_error?: string | null;
}

export interface WorkerReadinessResponse {
  readinessState: 'RUNNABLE' | 'GPU_UNAVAILABLE' | 'MODEL_UNAVAILABLE' | 'MODEL_NOT_LOADABLE';
  isReady: boolean;
  model_id: string;
  checkpoint?: string;
  device: string;
  gpu_name: string;
  cuda_available: boolean;
  total_vram_gb: number;
  available_vram_gb: number;
  message: string;
  load_error?: string | null;
}

export const DEFAULT_GROUNDING_CONFIG: GroundingConfig = {
  modelId: 'IDEA-Research/grounding-dino-tiny',
  checkpoint: 'groundingdino_swint_ogc',
  workerUrl: process.env.GROUNDING_WORKER_URL || 'http://127.0.0.1:8002',
  authKey: process.env.GROUNDING_AUTH_KEY || process.env.GEOCHAT_AUTH_KEY || 'satquery-grounding-worker-secret',
  timeoutMs: 10000,
  boxThreshold: 0.35,
  textThreshold: 0.25,
  coordinateFormat: 'normalized_xyxy',
  device: 'cuda'
};

export function getGroundingConfig(): GroundingConfig {
  return {
    ...DEFAULT_GROUNDING_CONFIG,
    workerUrl: process.env.GROUNDING_WORKER_URL || DEFAULT_GROUNDING_CONFIG.workerUrl,
    authKey: process.env.GROUNDING_AUTH_KEY || process.env.GEOCHAT_AUTH_KEY || DEFAULT_GROUNDING_CONFIG.authKey,
    modelId: process.env.GROUNDING_MODEL_ID || DEFAULT_GROUNDING_CONFIG.modelId
  };
}
