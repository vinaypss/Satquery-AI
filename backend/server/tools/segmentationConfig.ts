/**
 * SatQuery AI - Stage 6E Segmentation Specialist Configuration & Types
 * SIH26167 | ISRO Space Technology
 *
 * Truthful configuration for the Segmentation Specialist backend foundation.
 * Model identity follows the existing Stage 6A audit:
 *   SegFormer-B0 (General Semantic Segmentation Baseline - ADE20K)
 *   nvidia/segformer-b0-finetuned-ade-512-512
 *
 * This is an audit-aligned, non-RS-specialized baseline model definition.
 */

export interface SegmentationConfig {
  modelId: string;
  checkpoint: string;
  workerUrl: string;
  timeoutMs: number;
  device: string;
}

export interface SegmentationImagePayload {
  name?: string;
  mimeType?: string;
  dataUri?: string;
  path?: string;
}

export interface SegmentationWorkerRequest {
  task: 'segmentation';
  image: SegmentationImagePayload;
  target: string;
  parameters?: {
    coordinateFormat?: 'normalized_xyxy' | 'pixel_xyxy';
  };
}

export interface SegmentationMask {
  encoding: 'base64';
  width: number;
  height: number;
  data: string;
}

export interface SegmentationWorkerResponse {
  task: 'segmentation';
  model: string;
  status: 'success' | 'failed' | 'unavailable' | 'loading' | 'ready';
  imageWidth: number;
  imageHeight: number;
  target: string;
  mask: SegmentationMask;
  confidence?: number;
  durationMs?: number;
  device?: string;
  error?: string;
}

export interface WorkerHealthResponse {
  status: 'online' | 'offline' | 'error';
  model_state: 'unavailable' | 'loading' | 'ready' | 'failed';
  model_loaded: boolean;
  model_id: string;
  checkpoint: string;
  cuda_available: boolean;
  gpu_name: string;
  total_vram_gb: number;
  available_vram_gb: number;
  device: string;
  message: string;
  load_error?: string | null;
}

export const DEFAULT_SEGMENTATION_CONFIG: SegmentationConfig = {
  modelId: 'nvidia/segformer-b0-finetuned-ade-512-512',
  checkpoint: 'nvidia/segformer-b0-finetuned-ade-512-512',
  workerUrl: process.env.SEGMENTATION_WORKER_URL || 'http://127.0.0.1:8003',
  timeoutMs: 10000,
  device: 'cuda'
};

export function getSegmentationConfig(): SegmentationConfig {
  return {
    ...DEFAULT_SEGMENTATION_CONFIG,
    workerUrl: process.env.SEGMENTATION_WORKER_URL || DEFAULT_SEGMENTATION_CONFIG.workerUrl
  };
}
