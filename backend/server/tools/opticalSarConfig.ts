/**
 * SatQuery AI - Stage 6G Optical-SAR Specialist Configuration & Types
 * SIH26167 | ISRO Space Technology
 *
 * Truthful configuration for the backend Optical-SAR foundation.
 * Model identity follows the existing Stage 6A audit:
 *   Dual-Stream Multimodal Optical-SAR Fusion Architecture
 *   none verified for general inference (requires external verification)
 */

export interface OpticalSarConfig {
  modelId: string;
  checkpoint: string;
  workerUrl: string;
  timeoutMs: number;
  device: string;
}

export interface OpticalSarImagePayload {
  name?: string;
  mimeType?: string;
  dataUri?: string;
  path?: string;
  modality?: 'OPTICAL' | 'MULTISPECTRAL' | 'SAR';
}

export interface OpticalSarWorkerRequest {
  task: 'optical_sar';
  opticalImage: OpticalSarImagePayload;
  sarImage: OpticalSarImagePayload;
  geographicArea?: string;
  query: string;
  parameters?: {
    requireGeographicCorrespondence?: boolean;
    coordinateConvention?: 'pixel_xyxy' | 'normalized_xyxy';
    imageOrdering?: 'image1=optical, image2=sar';
  };
}

export interface OpticalSarWorkerResponse {
  task: 'optical_sar';
  model: string;
  status: 'success' | 'failed' | 'unavailable' | 'research_only' | 'ready' | 'loading';
  deploymentStatus: 'research_only' | 'unverified' | 'failed';
  evidence: null | Record<string, unknown>;
  device: string;
  durationMs: number;
  error?: string;
}

export interface WorkerHealthResponse {
  status: 'online' | 'offline' | 'error';
  model_state: 'unavailable' | 'loading' | 'ready' | 'failed' | 'research_only';
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

export const DEFAULT_OPTICAL_SAR_CONFIG: OpticalSarConfig = {
  modelId: 'Dual-Stream Multimodal Optical-SAR Fusion Architecture',
  checkpoint: 'none verified for general inference (requires external verification)',
  workerUrl: process.env.OPTICAL_SAR_WORKER_URL || 'http://127.0.0.1:8005',
  timeoutMs: 10000,
  device: 'cpu'
};

export function getOpticalSarConfig(): OpticalSarConfig {
  return {
    ...DEFAULT_OPTICAL_SAR_CONFIG,
    workerUrl: process.env.OPTICAL_SAR_WORKER_URL || DEFAULT_OPTICAL_SAR_CONFIG.workerUrl
  };
}
