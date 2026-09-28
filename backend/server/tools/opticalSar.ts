/**
 * SatQuery AI - Stage 6G Optical-SAR Specialist Adapter (Backend Foundation)
 * SIH26167 | ISRO Space Technology
 *
 * Implements the worker-backed contract for Optical-SAR Cross-Modal Analysis.
 * Uses an isolated Python HTTP worker pattern consistent with Stage 6B–6F.
 * Truthful architecture: Stage 6A audit says this model is research_only and unverified.
 * Never fabricates cross-modal fusion predictions.
 */

import { BaseSpecialistAdapter } from './specialistAdapter.js';
import {
  SpecialistInput,
  SpecialistOutput,
  SpecialistEvidence
} from '../types/index.js';
import {
  getOpticalSarConfig,
  OpticalSarConfig,
  OpticalSarWorkerRequest,
  OpticalSarWorkerResponse,
  WorkerHealthResponse
} from './opticalSarConfig.js';

export class OpticalSarSpecialistAdapter extends BaseSpecialistAdapter {
  private config: OpticalSarConfig;

  constructor(customConfig?: Partial<OpticalSarConfig>) {
    super(
      'tool_optical_sar_specialist',
      'Remote Sensing Optical-SAR Cross-Modal Specialist',
      'optical_sar',
      ['OPTICAL', 'SAR']
    );
    this.config = { ...getOpticalSarConfig(), ...customConfig };
  }

  getConfig(): OpticalSarConfig {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<OpticalSarConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  extractQuery(input: SpecialistInput): string {
    const raw = (input.query || '').trim();
    return raw.replace(/[?.!]+$/, '').trim();
  }

  formatWorkerRequest(input: SpecialistInput): OpticalSarWorkerRequest {
    const opticalImage = input.images.find(
  (image) => image.modality === 'OPTICAL' || image.modality === 'MULTISPECTRAL'
);

const sarImage = input.images.find(
  (image) => image.modality === 'SAR'
);

if (!opticalImage || !sarImage) {
  throw new Error(
    'Optical-SAR request formatting requires exactly one Optical/Multispectral image and one SAR image.'
  );
}

    const opticalPayload = {
      name: opticalImage.name,
      mimeType: opticalImage.mimeType || 'image/png',
      modality: opticalImage.modality || 'OPTICAL'
    } as OpticalSarWorkerRequest['opticalImage'];

    const sarPayload = {
      name: sarImage.name,
      mimeType: sarImage.mimeType || 'image/png',
      modality: sarImage.modality || 'SAR'
    } as OpticalSarWorkerRequest['sarImage'];

    if (opticalImage.dataUri) opticalPayload.dataUri = opticalImage.dataUri;
    if (sarImage.dataUri) sarPayload.dataUri = sarImage.dataUri;
    if (opticalImage.path) opticalPayload.path = opticalImage.path;
    if (sarImage.path) sarPayload.path = sarImage.path;

    return {
      task: 'optical_sar',
      opticalImage: opticalPayload,
      sarImage: sarPayload,
      geographicArea: opticalImage.geographicArea || sarImage.geographicArea || 'same-area',
      query: this.extractQuery(input),
      parameters: {
        requireGeographicCorrespondence: true,
        coordinateConvention: 'pixel_xyxy',
        imageOrdering: 'image1=optical, image2=sar'
      }
    };
  }

  async checkWorkerHealth(): Promise<WorkerHealthResponse | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${this.config.workerUrl}/health`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'online' }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!res.ok) return null;
      return (await res.json()) as WorkerHealthResponse;
    } catch {
      return null;
    }
  }

  async execute(input: SpecialistInput): Promise<SpecialistOutput> {
    const startTime = Date.now();

    if (this.state === 'disposed') {
      return this.createTruthfulOutput({
        startTime,
        status: 'failed',
        rejectionReason: 'Specialist adapter has been disposed.',
        notes: ['Adapter state is disposed. Reinitialization required.']
      });
    }

    if (this.state === 'uninitialized') {
      await this.initialize();
    }

    if (input.taskType !== this.supportedTask) {
      return this.createTruthfulOutput({
        startTime,
        status: 'rejected',
        rejectionReason: `Task type mismatch: Expected "${this.supportedTask}", received "${input.taskType}".`,
        notes: ['Optical-SAR route validation failed.']
      });
    }

    if (!input.images || input.images.length < 2) {
      return this.createTruthfulOutput({
        startTime,
        status: 'rejected',
        rejectionReason: 'Optical-SAR cross-modal analysis requires exactly two images.',
        notes: ['Input validation error: Missing required optical and SAR image pair.']
      });
    }

    if (input.images.length > 2) {
      return this.createTruthfulOutput({
        startTime,
        status: 'rejected',
        rejectionReason: 'Optical-SAR cross-modal analysis requires exactly two images.',
        notes: ['Input validation error: More than two images supplied.']
      });
    }

    const img1 = input.images[0];
    const img2 = input.images[1];

    const hasOptical = (img1.modality === 'OPTICAL' || img1.modality === 'MULTISPECTRAL') || (img2.modality === 'OPTICAL' || img2.modality === 'MULTISPECTRAL');
    const hasSar = img1.modality === 'SAR' || img2.modality === 'SAR';

    if (!hasOptical || !hasSar) {
      return this.createTruthfulOutput({
        startTime,
        status: 'rejected',
        rejectionReason: 'Optical-SAR analysis requires one Optical or Multispectral image and one SAR image.',
        notes: ['Input validation error: Optical/SAR pair incomplete.']
      });
    }

    const modalities = input.images.map((img) => img.modality);
    const opticalCount = modalities.filter((m) => m === 'OPTICAL' || m === 'MULTISPECTRAL').length;
    const sarCount = modalities.filter((m) => m === 'SAR').length;

    if (opticalCount !== 1 || sarCount !== 1) {
      return this.createTruthfulOutput({
        startTime,
        status: 'rejected',
        rejectionReason: 'Optical-SAR analysis requires exactly one Optical or Multispectral image and one SAR image.',
        notes: ['Input validation error: wrong modality pairing.']
      });
    }

    const geo1 = img1.geographicArea || (img1.metadata as Record<string, unknown> | undefined)?.geographicArea as string | undefined;
    const geo2 = img2.geographicArea || (img2.metadata as Record<string, unknown> | undefined)?.geographicArea as string | undefined;
    if (!geo1 || !geo2) {
      return this.createTruthfulOutput({
        startTime,
        status: 'rejected',
        rejectionReason: 'Optical-SAR cross-modal analysis requires geographic correspondence metadata.',
        notes: ['Input validation error: missing geographicArea metadata.']
      });
    }

    if (geo1 !== geo2) {
      return this.createTruthfulOutput({
        startTime,
        status: 'rejected',
        rejectionReason: 'Optical-SAR images must be geographically corresponding scenes.',
        notes: ['Compatibility validation error: geographicArea mismatch.']
      });
    }

    const query = this.extractQuery(input);
    if (!query || query.length === 0) {
      return this.createTruthfulOutput({
        startTime,
        status: 'rejected',
        rejectionReason: 'Empty query rejected: Optical-SAR analysis requires a non-empty semantic question.',
        notes: ['Input validation error: empty query.']
      });
    }

    try {
      const workerHealth = await this.checkWorkerHealth();
      if (!workerHealth || workerHealth.status !== 'online' || workerHealth.model_state !== 'ready') {
        return this.createTruthfulOutput({
          startTime,
          status: 'failed',
          rejectionReason: 'Optical-SAR inference worker is unavailable. No verified unified Optical-SAR inference model is available.',
          notes: [
            'Optical-SAR specialist selected: tool_optical_sar_specialist',
            'Optical-SAR adapter initialized in ready state.',
            `Stage 6A model identity: ${this.config.modelId}`,
            `Stage 6A checkpoint: ${this.config.checkpoint}`,
            `Worker health check returned offline / unavailable / not ready at ${this.config.workerUrl}`,
            'No fabricated cross-modal fusion evidence was generated.'
          ]
        });
      }

      const workerPayload = this.formatWorkerRequest(input);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const response = await fetch(`${this.config.workerUrl}/v1/optical-sar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workerPayload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let detail = response.statusText;
        try {
          const errJson = await response.json();
          detail = errJson.detail || errJson.error || response.statusText;
        } catch {
          // keep statusText
        }

        return this.createTruthfulOutput({
          startTime,
          status: 'failed',
          rejectionReason: `Optical-SAR worker returned HTTP ${response.status}: ${detail}`,
          notes: [
            'Optical-SAR specialist selected: tool_optical_sar_specialist',
            'Optical-SAR adapter initialized in ready state.',
            `Stage 6A model identity: ${this.config.modelId}`,
            `HTTP error returned by worker at ${this.config.workerUrl}`,
            'No fabricated cross-modal fusion result generated.'
          ]
        });
      }

      const raw = await response.json();
      if (!raw || typeof raw !== 'object' || raw.task !== 'optical_sar') {
        return this.createTruthfulOutput({
          startTime,
          status: 'failed',
          rejectionReason: 'Malformed worker response: missing expected optical_sar task field.',
          notes: ['Optical-SAR worker response schema validation failed.']
        });
      }

      const workerRes = raw as OpticalSarWorkerResponse;

      // --- SUCCESS PATH: genuine CUDA dual-stream forward pass completed ---
      if (workerRes.status === 'success' && workerRes.evidence !== null) {
        const evidence: SpecialistEvidence = {
          evidenceType: 'modality_comparison',
          modalityComparison: workerRes.evidence as Record<string, unknown>,
          details: {
            task: workerRes.task,
            model: workerRes.model,
            status: workerRes.status,
            deploymentStatus: workerRes.deploymentStatus,
            device: workerRes.device,
            durationMs: workerRes.durationMs,
            inferenceStatus: 'complete',
            confidence: (workerRes.evidence as Record<string, unknown>)?.confidence,
            metrics: (workerRes.evidence as Record<string, unknown>)?.metrics
          }
        };

        const modalityEvidence = workerRes.evidence as Record<string, unknown>;
        const alignment = (modalityEvidence?.metrics as Record<string, unknown> | undefined)?.allWeatherFeatureAlignment;
        const correlation = (modalityEvidence?.metrics as Record<string, unknown> | undefined)?.crossModalCorrelation;

        return {
          toolId: this.toolId,
          status: 'complete',
          answerText: modalityEvidence?.summary as string || (
            `Optical-SAR cross-modal fusion complete. ` +
            `Feature alignment: ${alignment ?? 'n/a'}, ` +
            `Cross-modal correlation: ${correlation ?? 'n/a'}.`
          ),
          evidence,
          executionMetrics: {
            modelName: this.config.modelId,
            durationMs: Math.max(1, Date.now() - startTime),
            device: workerRes.device || 'cuda'
          },
          metadataNotes: [
            'Optical-SAR specialist selected: tool_optical_sar_specialist',
            'Optical-SAR adapter initialized in ready state.',
            `Stage 6A model identity: ${this.config.modelId}`,
            `Dual-stream forward pass completed on ${workerRes.device || 'cuda'}.`,
            `Provenance: MODEL_GENERATED (genuine CUDA inference).`,
            'No fabricated cross-modal fusion evidence.'
          ]
        };
      }

      // --- UNAVAILABLE PATH: research_only / not loaded ---
      const evidence: SpecialistEvidence = {
        evidenceType: 'none',
        details: {
          task: workerRes.task,
          model: workerRes.model,
          status: workerRes.status,
          deploymentStatus: workerRes.deploymentStatus,
          device: workerRes.device,
          durationMs: workerRes.durationMs,
          error: workerRes.error
        }
      };

      return {
        toolId: this.toolId,
        status: 'failed',
        answerText: '',
        evidence,
        rejectionReason: workerRes.error || 'No verified unified Optical-SAR inference model is available.',
        executionMetrics: {
          modelName: this.config.modelId,
          durationMs: Math.max(1, Date.now() - startTime),
          device: workerRes.device || this.config.device
        },
        metadataNotes: [
          'Optical-SAR specialist selected: tool_optical_sar_specialist',
          'Optical-SAR adapter initialized in ready state.',
          `Stage 6A model identity: ${this.config.modelId}`,
          `Stage 6A deployment_status: research_only`,
          'No fake Optical-SAR fusion result generated; evidence remains null.'
        ]
      };
    } catch (networkError) {
      const isTimeout = networkError instanceof Error && networkError.name === 'AbortError';
      const rejectionReason = isTimeout
        ? `Optical-SAR inference worker timed out after ${this.config.timeoutMs}ms.`
        : 'Optical-SAR inference worker is unavailable.';

      return this.createTruthfulOutput({
        startTime,
        status: 'failed',
        rejectionReason,
        notes: [
          'Optical-SAR specialist selected: tool_optical_sar_specialist',
          'Optical-SAR adapter initialized in ready state.',
          `Stage 6A model identity: ${this.config.modelId}`,
          `Stage 6A checkpoint: ${this.config.checkpoint}`,
          `Worker health or endpoint check failed at ${this.config.workerUrl}`,
          'No fabricated cross-modal fusion evidence generated.'
        ]
      });
    }
  }

  private createTruthfulOutput(params: {
    startTime: number;
    status: 'failed' | 'rejected';
    rejectionReason: string;
    notes: string[];
  }): SpecialistOutput {
    const durationMs = Math.max(1, Date.now() - params.startTime);
    return {
      toolId: this.toolId,
      status: params.status,
      answerText: '',
      evidence: {
        evidenceType: 'none'
      },
      rejectionReason: params.rejectionReason,
      executionMetrics: {
        modelName: this.config.modelId,
        durationMs,
        device: 'none'
      },
      metadataNotes: params.notes
    };
  }
}
