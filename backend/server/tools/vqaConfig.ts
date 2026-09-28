/**
 * SatQuery AI - Phase 7 GeoChat-7B Model Configuration
 * SIH26167 | ISRO Space Technology
 *
 * Provides configuration-driven model settings for Remote-Sensing VQA.
 * Uses environment variables with safe, documented defaults.
 * Model loading is observable; no silent heavy downloads occur on startup.
 */

export interface GeoChatConfig {
  /**
   * HTTP endpoint of the isolated GeoChat-7B inference worker.
   * Default: http://127.0.0.1:8088
   */
  workerUrl: string;

  /**
   * Hugging Face model identifier for the primary remote-sensing VLM.
   * Default: MBZUAI/geochat-7B
   */
  modelId: string;

  /**
   * Shared secret authentication key for worker HTTP communication.
   */
  authKey: string;

  /**
   * Execution device target: 'cuda' | 'cpu'.
   * GeoChat-7B requires CUDA for practical inference.
   */
  device: string;

  /**
   * Model quantization mode.
   * On Tesla T4 (15 GB VRAM), '4bit' (NF4) is required to prevent OOM.
   */
  loadMode: '4bit' | 'float16' | 'bfloat16' | 'cpu';

  /**
   * Maximum new generation tokens for VQA responses.
   * Default: 512
   */
  maxNewTokens: number;

  /**
   * Decoding temperature for deterministic VQA output.
   * Default: 0.2
   */
  temperature: number;

  /**
   * HTTP request timeout in milliseconds when communicating with the worker.
   * Default: 15000 ms (15 s)
   */
  timeoutMs: number;
}

/**
 * Retrieves the current GeoChat configuration from environment variables.
 */
export function getGeoChatConfig(): GeoChatConfig {
  return {
    workerUrl: process.env.GEOCHAT_WORKER_URL || 'http://127.0.0.1:8088',
    modelId: process.env.GEOCHAT_MODEL_ID || 'MBZUAI/geochat-7B',
    authKey: process.env.GEOCHAT_AUTH_KEY || 'satquery-geochat-worker-secret',
    device: process.env.GEOCHAT_DEVICE || 'cuda',
    loadMode: (process.env.GEOCHAT_LOAD_MODE as GeoChatConfig['loadMode']) || '4bit',
    maxNewTokens: parseInt(process.env.GEOCHAT_MAX_NEW_TOKENS || '512', 10),
    temperature: parseFloat(process.env.GEOCHAT_TEMPERATURE || '0.2'),
    timeoutMs: parseInt(process.env.GEOCHAT_TIMEOUT_MS || '15000', 10)
  };
}

export interface GeoChatVqaWorkerRequest {
  task: 'vqa';
  requestId?: string;
  image: {
    name?: string;
    mimeType?: string;
    dataUri?: string;
    path?: string;
    modality?: string;
  };
  question: string;
  parameters?: {
    maxNewTokens?: number;
    temperature?: number;
    loadMode?: string;
  };
}

export interface GeoChatVqaWorkerResponse {
  answerText: string;
  confidence?: number;
  modelName: string;
  checkpoint?: string;
  device?: string;
  durationMs?: number;
  tokensGenerated?: number;
  quantization?: string;
  provenance?: string;
  validationState?: string;
  requestId?: string;
}

export interface WorkerHealthResponse {
  status: string;
  cuda_available: boolean;
  gpu_name?: string;
  total_vram_gb?: number;
  available_vram_gb?: number;
  model_loaded: boolean;
  model_id: string;
  device?: string;
  load_mode?: string;
  message?: string;
  load_error?: string | null;
}

export interface ReadinessResponse {
  readinessState: 'RUNNABLE' | 'GPU_UNAVAILABLE' | 'MODEL_UNAVAILABLE' | 'MODEL_NOT_LOADABLE' | string;
  isReady: boolean;
  model_id: string;
  checkpoint: string;
  device: string;
  gpu_name?: string;
  cuda_available: boolean;
  total_vram_gb?: number;
  available_vram_gb?: number;
  message: string;
  load_error?: string | null;
}
