/**
 * SatQuery AI - Stage 6F Change Analysis Specialist Configuration & Types
 * SIH26167 | ISRO Space Technology
 *
 * Truthful configuration for the backend change-analysis foundation.
 * Identity follows the existing Stage 6A audit:
 *   TinyCD (Lightweight Bi-Temporal Change Detection)
 *   TinyCD-LEVIR_CD.pth / TinyCD-WHU_CD.pth
 */

export interface ChangeAnalysisConfig {
  modelId: string;
  checkpoint: string;
  workerUrl: string;
  timeoutMs: number;
  device: string;
}

export interface ChangeAnalysisImagePayload {
  name?: string;
  mimeType?: string;
  dataUri?: string;
  path?: string;
}

export interface ChangeAnalysisWorkerRequest {
  task: 'change_analysis';
  image1: ChangeAnalysisImagePayload;
  image2: ChangeAnalysisImagePayload;
  acquisitionDate1: string;
  acquisitionDate2: string;
  geographicArea?: string;
  parameters?: {
    coordinateConvention?: 'pixel_xyxy' | 'normalized_xyxy';
    imageOrdering?: 'image1=t1, image2=t2';
    requireRegistration?: boolean;
    requireSameSpatialDimensions?: boolean;
    requireGeographicCorrespondence?: boolean;
  };
}

export interface ChangeAnalysisMask {
  encoding: 'base64';
  width: number;
  height: number;
  data: string;
}

export interface ChangeAnalysisStatistics {
  changedPixels: number;
  totalPixels: number;
  changedPercentage: number;
}

export interface ChangeAnalysisWorkerResponse {
  task: 'change_analysis';
  model: string;
  status: 'success' | 'failed' | 'unavailable' | 'loading' | 'ready' | 'blocked';
  imageWidth: number;
  imageHeight: number;
  changeMask: ChangeAnalysisMask;
  changeStatistics: ChangeAnalysisStatistics;
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

export const DEFAULT_CHANGE_ANALYSIS_CONFIG: ChangeAnalysisConfig = {
  modelId: 'TinyCD (Lightweight Bi-Temporal Change Detection)',
  checkpoint: 'TinyCD-LEVIR_CD.pth / TinyCD-WHU_CD.pth',
  workerUrl: process.env.CHANGE_ANALYSIS_WORKER_URL || 'http://127.0.0.1:8004',
  timeoutMs: 10000,
  device: 'cpu'
};

export function getChangeAnalysisConfig(): ChangeAnalysisConfig {
  return {
    ...DEFAULT_CHANGE_ANALYSIS_CONFIG,
    workerUrl: process.env.CHANGE_ANALYSIS_WORKER_URL || DEFAULT_CHANGE_ANALYSIS_CONFIG.workerUrl
  };
}
