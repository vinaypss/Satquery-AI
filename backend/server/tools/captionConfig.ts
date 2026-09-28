/**
 * SatQuery AI - Phase 7 GeoChat-7B Caption Configuration & Worker Contracts
 * SIH26167 | ISRO Space Technology
 *
 * Provides configuration and request/response type definitions for the
 * Remote-Sensing Scene Captioning Specialist using MBZUAI/geochat-7B.
 */

import { getGeoChatConfig } from './vqaConfig.js';
import type { GeoChatConfig, WorkerHealthResponse, ReadinessResponse } from './vqaConfig.js';

export { getGeoChatConfig };
export type { GeoChatConfig, WorkerHealthResponse, ReadinessResponse };

export interface GeoChatCaptionWorkerRequest {
  task: 'caption';
  requestId?: string;
  image: {
    name?: string;
    mimeType?: string;
    dataUri?: string;
    path?: string;
    modality?: string;
  };
  prompt?: string;
  parameters?: {
    maxNewTokens?: number;
    temperature?: number;
    loadMode?: string;
  };
}

export interface GeoChatCaptionWorkerResponse {
  caption: string;
  rawCaption?: string;
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
