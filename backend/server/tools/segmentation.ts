/**
 * SatQuery AI - Stage 6E Segmentation Specialist Adapter (Backend Foundation)
 * SIH26167 | ISRO Space Technology
 *
 * Implements the standard adapter contract for Remote Sensing Semantic Segmentation.
 * Uses an isolated Python HTTP worker pattern consistent with Stage 6D grounding.
 * Never fabricates segmentation masks.
 */

import { BaseSpecialistAdapter } from './specialistAdapter.js';
import {
  SpecialistInput,
  SpecialistOutput,
  SpecialistEvidence
} from '../types/index.js';
import {
  getSegmentationConfig,
  SegmentationConfig,
  SegmentationWorkerRequest,
  SegmentationWorkerResponse,
  WorkerHealthResponse
} from './segmentationConfig.js';

export class SegmentationSpecialistAdapter extends BaseSpecialistAdapter {
  private config: SegmentationConfig;

  constructor(customConfig?: Partial<SegmentationConfig>) {
    super(
      'tool_segmentation_specialist',
      'Remote Sensing Semantic Segmentation Specialist',
      'segmentation',
      ['OPTICAL']
    );
    this.config = { ...getSegmentationConfig(), ...customConfig };
  }

  getConfig(): SegmentationConfig {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<SegmentationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  extractTargetQuery(input: SpecialistInput): string {
    const raw = (input.query || '').trim();
    if (!raw) return '';
    return raw.replace(/[?.!]+$/, '').trim();
  }

  formatWorkerRequest(input: SpecialistInput): SegmentationWorkerRequest {
    const image = input.images[0];
    const imagePayload = {
      name: image.name,
      mimeType: image.mimeType || 'image/png'
    } as SegmentationWorkerRequest['image'];

    if (image.dataUri) imagePayload.dataUri = image.dataUri;
    if (image.path) imagePayload.path = image.path;

    return {
      task: 'segmentation',
      image: imagePayload,
      target: this.extractTargetQuery(input),
      parameters: {
        coordinateFormat: 'pixel_xyxy'
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
        notes: ['Segmentation route validation failed.']
      });
    }

    if (!input.images || input.images.length === 0) {
      return this.createTruthfulOutput({
        startTime,
        status: 'rejected',
        rejectionReason: 'Missing image: Semantic segmentation requires exactly one image.',
        notes: ['Input validation error: No remote-sensing imagery provided in request.']
      });
    }

    if (input.images.length > 1) {
      return this.createTruthfulOutput({
        startTime,
        status: 'rejected',
        rejectionReason: 'Multiple images rejected: Semantic segmentation supports exactly one image.',
        notes: ['Input validation error: More than one image supplied.']
      });
    }

    const image = input.images[0];
    if (image.modality === 'SAR') {
      return this.createTruthfulOutput({
        startTime,
        status: 'rejected',
        rejectionReason: 'SAR imagery is not supported by the current SegFormer general optical segmentation baseline.',
        notes: ['Modality check: segmentation baseline accepts optical input only.']
      });
    }

    const supportedMimes = ['image/png', 'image/jpeg', 'image/webp', 'image/tiff'];
    if (image.mimeType && !supportedMimes.includes(image.mimeType.toLowerCase())) {
      return this.createTruthfulOutput({
        startTime,
        status: 'rejected',
        rejectionReason: `Unsupported image format: "${image.mimeType}". Supported: PNG, JPEG, WebP, TIFF.`,
        notes: ['Input validation error: Unsupported MIME type.']
      });
    }

    const hasName = typeof image.name === 'string' && image.name.trim().length > 0;
    const hasId = typeof image.id === 'string' && image.id.trim().length > 0;
    const hasCarrier = Boolean((typeof image.dataUri === 'string' && image.dataUri.trim().length > 0) || (typeof image.path === 'string' && image.path.trim().length > 0));
    if ((!hasName && !hasId) || (!hasName && hasId && !hasCarrier)) {
      return this.createTruthfulOutput({
        startTime,
        status: 'rejected',
        rejectionReason: 'Invalid image: Image must provide a real identifier or name and, if no name is present, a non-empty carrier such as dataUri or path.',
        notes: ['Input validation error: Empty or invalid image descriptor.']
      });
    }

    const target = this.extractTargetQuery(input);
    if (!target || target.trim().length === 0) {
      return this.createTruthfulOutput({
        startTime,
        status: 'rejected',
        rejectionReason: 'Empty target text rejected: Segmentation specialist requires a non-empty target/class query.',
        notes: ['Input validation error: Empty or whitespace target query string.']
      });
    }

    try {
      const workerHealth = await this.checkWorkerHealth();
      if (!workerHealth || workerHealth.status !== 'online' || workerHealth.model_state !== 'ready') {
        return this.createTruthfulOutput({
          startTime,
          status: 'failed',
          rejectionReason: 'Segmentation inference worker is unavailable.',
          notes: [
            'Segmentation specialist selected: tool_segmentation_specialist',
            'Segmentation adapter initialized in ready state.',
            `Segmentation model loading requested: ${this.config.modelId}`,
            `Worker health check returned offline / unavailable / not ready at ${this.config.workerUrl}`,
            'No synthetic or fake masks generated.'
          ]
        });
      }

      const workerPayload = this.formatWorkerRequest(input);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const response = await fetch(`${this.config.workerUrl}/v1/segmentation`, {
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
          rejectionReason: `Segmentation worker returned HTTP ${response.status}: ${detail}`,
          notes: [
            'Segmentation specialist selected: tool_segmentation_specialist',
            'Segmentation adapter initialized in ready state.',
            `Segmentation model loading requested: ${this.config.modelId}`,
            `HTTP error returned by worker at ${this.config.workerUrl}`,
            'No fabricated masks or fallback masks generated.'
          ]
        });
      }

      const raw = await response.json();
      if (!raw || typeof raw !== 'object' || raw.task !== 'segmentation' || raw.status !== 'success') {
        return this.createTruthfulOutput({
          startTime,
          status: 'failed',
          rejectionReason: 'Malformed worker response: missing expected segmentation task/status contract.',
          notes: ['Segmentation worker response schema validation failed.']
        });
      }

      const workerRes = raw as SegmentationWorkerResponse;
      if (!workerRes.mask || !workerRes.mask.data || workerRes.mask.encoding !== 'base64') {
        return this.createTruthfulOutput({
          startTime,
          status: 'failed',
          rejectionReason: 'Missing mask or invalid mask encoding in worker response.',
          notes: ['Mask validation failed: expected base64 mask representation.']
        });
      }

      if (!Number.isFinite(workerRes.imageWidth) || !Number.isFinite(workerRes.imageHeight) || workerRes.imageWidth <= 0 || workerRes.imageHeight <= 0) {
        return this.createTruthfulOutput({
          startTime,
          status: 'failed',
          rejectionReason: 'Invalid image dimensions: width and height must be positive integers.',
          notes: ['Mask/image dimension validation failed.']
        });
      }

      if (typeof workerRes.confidence === 'number' && (workerRes.confidence < 0 || workerRes.confidence > 1)) {
        return this.createTruthfulOutput({
          startTime,
          status: 'failed',
          rejectionReason: `Invalid confidence score: Expected number between 0 and 1, got ${workerRes.confidence}.`,
          notes: ['Confidence validation failed.']
        });
      }

      const evidence: SpecialistEvidence = {
        evidenceType: 'segmentation_mask',
        details: {
          task: workerRes.task,
          model: workerRes.model,
          status: workerRes.status,
          imageWidth: workerRes.imageWidth,
          imageHeight: workerRes.imageHeight,
          target: workerRes.target,
          mask: {
            encoding: workerRes.mask.encoding,
            width: workerRes.mask.width,
            height: workerRes.mask.height,
            data: workerRes.mask.data
          },
          confidence: workerRes.confidence
        }
      };

      return {
        toolId: this.toolId,
        status: 'complete',
        answerText: `Segmentation requested for target "${target}"; worker returned evidence from ${workerRes.model}.`,
        evidence,
        executionMetrics: {
          modelName: workerRes.model || this.config.modelId,
          durationMs: workerRes.durationMs || Math.max(1, Date.now() - startTime),
          device: workerRes.device || this.config.device
        },
        metadataNotes: [
          'Segmentation specialist selected: tool_segmentation_specialist',
          'Segmentation adapter initialized in ready state.',
          `General Semantic Segmentation Baseline (ADE20K) model loading requested: ${this.config.modelId}`,
          'No fake mask or synthetic segmentation output generated.'
        ]
      };
    } catch (networkError) {
      const isTimeout = networkError instanceof Error && networkError.name === 'AbortError';
      const rejectionReason = isTimeout
        ? `Segmentation inference worker timed out after ${this.config.timeoutMs}ms.`
        : 'Segmentation inference worker is unavailable.';

      return this.createTruthfulOutput({
        startTime,
        status: 'failed',
        rejectionReason,
        notes: [
          'Segmentation specialist selected: tool_segmentation_specialist',
          'Segmentation adapter initialized in ready state.',
          `Segmentation model loading requested: ${this.config.modelId}`,
          'AI Studio / local dev environment: real segmentation inference unavailable.',
          `Worker health or endpoint check failed at ${this.config.workerUrl}`,
          'No simulated or placeholder masks were generated.'
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
