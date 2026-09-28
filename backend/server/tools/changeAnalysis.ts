/**
 * SatQuery AI - Stage 6F Change Analysis Specialist Adapter (Backend Foundation)
 * SIH26167 | ISRO Space Technology
 *
 * Implements the standard adapter contract for Bi-Temporal Change Analysis.
 * Uses an isolated Python HTTP worker pattern consistent with Stage 6E.
 * Never fabricates change maps.
 */

import { BaseSpecialistAdapter } from './specialistAdapter.js';
import {
  SpecialistInput,
  SpecialistOutput,
  SpecialistEvidence
} from '../types/index.js';
import {
  getChangeAnalysisConfig,
  ChangeAnalysisConfig,
  ChangeAnalysisWorkerRequest,
  ChangeAnalysisWorkerResponse,
  WorkerHealthResponse
} from './changeAnalysisConfig.js';

export class ChangeAnalysisSpecialistAdapter extends BaseSpecialistAdapter {
  private config: ChangeAnalysisConfig;

  constructor(customConfig?: Partial<ChangeAnalysisConfig>) {
    super(
      'tool_change_specialist',
      'Remote Sensing Bi-Temporal Change Analysis Specialist',
      'change_analysis',
      ['OPTICAL', 'MULTISPECTRAL', 'SAR']
    );
    this.config = { ...getChangeAnalysisConfig(), ...customConfig };
  }

  getConfig(): ChangeAnalysisConfig {
    return { ...this.config };
  }

  updateConfig(newConfig: Partial<ChangeAnalysisConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  extractTemporalQuery(input: SpecialistInput): { target: string } {
    const raw = (input.query || '').trim();
    return { target: raw.replace(/[?.!]+$/, '').trim() };
  }

  formatWorkerRequest(input: SpecialistInput): ChangeAnalysisWorkerRequest {
    const img1 = input.images[0];
    const img2 = input.images[1];

    const image1 = {
      name: img1.name,
      mimeType: img1.mimeType || 'image/png'
    } as ChangeAnalysisWorkerRequest['image1'];

    const image2 = {
      name: img2.name,
      mimeType: img2.mimeType || 'image/png'
    } as ChangeAnalysisWorkerRequest['image2'];

    if (img1.dataUri) image1.dataUri = img1.dataUri;
    if (img2.dataUri) image2.dataUri = img2.dataUri;
    if (img1.path) image1.path = img1.path;
    if (img2.path) image2.path = img2.path;

    return {
      task: 'change_analysis',
      image1,
      image2,
      acquisitionDate1: img1.acquisitionDate || (img1.metadata?.acquisitionDate as string | undefined) || '',
      acquisitionDate2: img2.acquisitionDate || (img2.metadata?.acquisitionDate as string | undefined) || '',
      geographicArea: img1.geographicArea || img2.geographicArea || 'same-area',
      parameters: {
        coordinateConvention: 'pixel_xyxy',
        imageOrdering: 'image1=t1, image2=t2',
        requireRegistration: true,
        requireSameSpatialDimensions: true,
        requireGeographicCorrespondence: true
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
        notes: ['Change-analysis route validation failed.']
      });
    }

    if (!input.images || input.images.length < 2) {
      return this.createTruthfulOutput({
        startTime,
        status: 'rejected',
        rejectionReason: 'Change analysis requires exactly two images.',
        notes: ['Input validation error: Missing required second temporal acquisition image.']
      });
    }

    if (input.images.length > 2) {
      return this.createTruthfulOutput({
        startTime,
        status: 'rejected',
        rejectionReason: 'Change analysis requires exactly two images. More than two images supplied.',
        notes: ['Input validation error: Change analysis only supports an image pair.']
      });
    }

    const img1 = input.images[0];
    const img2 = input.images[1];

    const supportedMimes = ['image/png', 'image/jpeg', 'image/webp', 'image/tiff'];
    if (img1.mimeType && !supportedMimes.includes(img1.mimeType.toLowerCase())) {
      return this.createTruthfulOutput({
        startTime,
        status: 'rejected',
        rejectionReason: `Unsupported image format in image1: "${img1.mimeType}". Supported: PNG, JPEG, WebP, TIFF.`,
        notes: ['Input validation error: Unsupported MIME type for image1.']
      });
    }

    if (img2.mimeType && !supportedMimes.includes(img2.mimeType.toLowerCase())) {
      return this.createTruthfulOutput({
        startTime,
        status: 'rejected',
        rejectionReason: `Unsupported image format in image2: "${img2.mimeType}". Supported: PNG, JPEG, WebP, TIFF.`,
        notes: ['Input validation error: Unsupported MIME type for image2.']
      });
    }

    const hasName1 = typeof img1.name === 'string' && img1.name.trim().length > 0;
    const hasId1 = typeof img1.id === 'string' && img1.id.trim().length > 0;
    const hasCarrier1 = Boolean((typeof img1.dataUri === 'string' && img1.dataUri.trim().length > 0) || (typeof img1.path === 'string' && img1.path.trim().length > 0));
    if ((!hasName1 && !hasId1) || (!hasName1 && hasId1 && !hasCarrier1)) {
      return this.createTruthfulOutput({
        startTime,
        status: 'rejected',
        rejectionReason: 'Invalid image1: Image must provide a real name or id and a non-empty dataUri/path carrier where appropriate.',
        notes: ['Input validation error: Empty or invalid image1 descriptor.']
      });
    }

    const hasName2 = typeof img2.name === 'string' && img2.name.trim().length > 0;
    const hasId2 = typeof img2.id === 'string' && img2.id.trim().length > 0;
    const hasCarrier2 = Boolean((typeof img2.dataUri === 'string' && img2.dataUri.trim().length > 0) || (typeof img2.path === 'string' && img2.path.trim().length > 0));
    if ((!hasName2 && !hasId2) || (!hasName2 && hasId2 && !hasCarrier2)) {
      return this.createTruthfulOutput({
        startTime,
        status: 'rejected',
        rejectionReason: 'Invalid image2: Image must provide a real name or id and a non-empty dataUri/path carrier where appropriate.',
        notes: ['Input validation error: Empty or invalid image2 descriptor.']
      });
    }

    const date1 = img1.acquisitionDate || (img1.metadata?.acquisitionDate as string | undefined);
    const date2 = img2.acquisitionDate || (img2.metadata?.acquisitionDate as string | undefined);
    if (!date1 || !date1.trim()) {
      return this.createTruthfulOutput({
        startTime,
        status: 'rejected',
        rejectionReason: 'Change analysis requires a valid acquisitionDate for image1.',
        notes: ['Input validation error: Missing acquisitionDate1 metadata.']
      });
    }

    if (!date2 || !date2.trim()) {
      return this.createTruthfulOutput({
        startTime,
        status: 'rejected',
        rejectionReason: 'Change analysis requires a valid acquisitionDate for image2.',
        notes: ['Input validation error: Missing acquisitionDate2 metadata.']
      });
    }

    if (date1 === date2) {
      return this.createTruthfulOutput({
        startTime,
        status: 'rejected',
        rejectionReason: 'Change analysis requires two distinct acquisition dates.',
        notes: ['Input validation error: image1 and image2 acquisition dates are identical.']
      });
    }

    const geo1 = img1.geographicArea || (img1.metadata?.geographicArea as string | undefined);
    const geo2 = img2.geographicArea || (img2.metadata?.geographicArea as string | undefined);
    if (geo1 && geo2 && geo1 !== geo2) {
      return this.createTruthfulOutput({
        startTime,
        status: 'rejected',
        rejectionReason: 'Change analysis requires geographically corresponding scenes.',
        notes: ['Compatibility validation error: image1 and image2 geographicArea mismatch.']
      });
    }

    try {
      const workerHealth = await this.checkWorkerHealth();
      if (!workerHealth || workerHealth.status !== 'online' || workerHealth.model_state !== 'ready') {
        return this.createTruthfulOutput({
          startTime,
          status: 'failed',
          rejectionReason: 'Change-analysis inference worker is unavailable.',
          notes: [
            'Change-analysis specialist selected: tool_change_specialist',
            'Change-analysis adapter initialized in ready state.',
            `TinyCD model loading requested: ${this.config.modelId}`,
            `Worker health check returned offline / unavailable / not ready at ${this.config.workerUrl}`,
            'No synthetic or fake change masks generated.'
          ]
        });
      }

      const workerPayload = this.formatWorkerRequest(input);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      const response = await fetch(`${this.config.workerUrl}/v1/change-analysis`, {
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
          rejectionReason: `Change-analysis worker returned HTTP ${response.status}: ${detail}`,
          notes: [
            'Change-analysis specialist selected: tool_change_specialist',
            'Change-analysis adapter initialized in ready state.',
            `TinyCD model loading requested: ${this.config.modelId}`,
            `HTTP error returned by worker at ${this.config.workerUrl}`,
            'No fabricated change masks or statistics were generated.'
          ]
        });
      }

      const raw = await response.json();
      if (!raw || typeof raw !== 'object' || raw.task !== 'change_analysis' || raw.status !== 'success') {
        return this.createTruthfulOutput({
          startTime,
          status: 'failed',
          rejectionReason: 'Malformed worker response: missing expected change-analysis task/status contract.',
          notes: ['Change-analysis worker response schema validation failed.']
        });
      }

      const workerRes = raw as ChangeAnalysisWorkerResponse;
      if (!workerRes.changeMask || !workerRes.changeMask.data || workerRes.changeMask.encoding !== 'base64') {
        return this.createTruthfulOutput({
          startTime,
          status: 'failed',
          rejectionReason: 'Missing change mask or invalid change mask encoding in worker response.',
          notes: ['Mask validation failed: expected base64 changeMask representation.']
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

      if (workerRes.changeMask.width !== workerRes.imageWidth || workerRes.changeMask.height !== workerRes.imageHeight) {
        return this.createTruthfulOutput({
          startTime,
          status: 'failed',
          rejectionReason: 'Invalid mask dimensions: changeMask dimensions must match imageWidth and imageHeight.',
          notes: ['Mask dimension validation failed.']
        });
      }

      if (!Number.isFinite(workerRes.changeStatistics.changedPixels) || !Number.isFinite(workerRes.changeStatistics.totalPixels) || !Number.isFinite(workerRes.changeStatistics.changedPercentage)) {
        return this.createTruthfulOutput({
          startTime,
          status: 'failed',
          rejectionReason: 'Invalid change statistics: expected numeric changedPixels, totalPixels, and changedPercentage.',
          notes: ['Change statistics validation failed.']
        });
      }

      if (workerRes.changeStatistics.changedPixels > workerRes.changeStatistics.totalPixels) {
        return this.createTruthfulOutput({
          startTime,
          status: 'failed',
          rejectionReason: 'Invalid statistics: changedPixels cannot exceed totalPixels.',
          notes: ['Change statistics validation failed.']
        });
      }

      if (workerRes.changeStatistics.changedPercentage < 0 || workerRes.changeStatistics.changedPercentage > 100) {
        return this.createTruthfulOutput({
          startTime,
          status: 'failed',
          rejectionReason: 'Invalid statistics: changedPercentage must be between 0 and 100.',
          notes: ['Change statistics validation failed.']
        });
      }

      const evidence: SpecialistEvidence = {
        evidenceType: 'change_map',
        details: {
          task: workerRes.task,
          model: workerRes.model,
          status: workerRes.status,
          imageWidth: workerRes.imageWidth,
          imageHeight: workerRes.imageHeight,
          changeMask: {
            encoding: workerRes.changeMask.encoding,
            width: workerRes.changeMask.width,
            height: workerRes.changeMask.height,
            data: workerRes.changeMask.data
          },
          changeStatistics: {
            changedPixels: workerRes.changeStatistics.changedPixels,
            totalPixels: workerRes.changeStatistics.totalPixels,
            changedPercentage: workerRes.changeStatistics.changedPercentage
          },
          durationMs: workerRes.durationMs,
          device: workerRes.device
        }
      };

      return {
        toolId: this.toolId,
        status: 'complete',
        answerText: `Change analysis requested between two temporal acquisitions; worker returned evidence from ${workerRes.model}.`,
        evidence,
        executionMetrics: {
          modelName: workerRes.model || this.config.modelId,
          durationMs: workerRes.durationMs || Math.max(1, Date.now() - startTime),
          device: workerRes.device || this.config.device
        },
        metadataNotes: [
          'Change-analysis specialist selected: tool_change_specialist',
          'Change-analysis adapter initialized in ready state.',
          `TinyCD model identity: ${this.config.modelId}`,
          'No fake change mask or changed-pixel statistics generated.'
        ]
      };
    } catch (networkError) {
      const isTimeout = networkError instanceof Error && networkError.name === 'AbortError';
      const rejectionReason = isTimeout
        ? `Change-analysis inference worker timed out after ${this.config.timeoutMs}ms.`
        : 'Change-analysis inference worker is unavailable.';

      return this.createTruthfulOutput({
        startTime,
        status: 'failed',
        rejectionReason,
        notes: [
          'Change-analysis specialist selected: tool_change_specialist',
          'Change-analysis adapter initialized in ready state.',
          `TinyCD model loading requested: ${this.config.modelId}`,
          'AI Studio / local dev environment: real change-analysis inference unavailable.',
          `Worker health or endpoint check failed at ${this.config.workerUrl}`,
          'No simulated or placeholder change masks were generated.'
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
