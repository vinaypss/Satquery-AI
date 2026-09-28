/**
 * SatQuery AI - Stage 5 Specialist Adapter Base Interface
 * SIH26167 | ISRO Space Technology
 *
 * Defines the standard adapter contract and lifecycle for remote-sensing
 * specialist capabilities.
 * In Stage 5, specialists are ONLY adapters/interfaces.
 * No actual model inference is executed.
 */

import {
  SpecialistAdapter,
  AdapterLifecycleState,
  ParsedQueryTaskType,
  ImageModality,
  SpecialistInput,
  SpecialistOutput
} from '../types/index.js';

export abstract class BaseSpecialistAdapter implements SpecialistAdapter {
  readonly toolId: string;
  readonly name: string;
  readonly supportedTask: ParsedQueryTaskType;
  readonly supportedModalities: ImageModality[];
  protected _state: AdapterLifecycleState = 'uninitialized';

  constructor(
    toolId: string,
    name: string,
    supportedTask: ParsedQueryTaskType,
    supportedModalities: ImageModality[]
  ) {
    this.toolId = toolId;
    this.name = name;
    this.supportedTask = supportedTask;
    this.supportedModalities = supportedModalities;
  }

  get state(): AdapterLifecycleState {
    return this._state;
  }

  /**
   * Initializes the specialist adapter interface.
   * Transitions lifecycle: uninitialized -> loading -> ready
   */
  async initialize(): Promise<void> {
    if (this._state === 'ready') {
      return;
    }
    this._state = 'loading';
    // Clean transition to ready state for Stage 5 adapter contract
    this._state = 'ready';
  }

  /**
   * Disposes of adapter resources.
   * Transitions lifecycle: ready -> disposed
   */
  async dispose(): Promise<void> {
    this._state = 'disposed';
  }

  /**
   * Executes the adapter contract.
   * In Stage 5, validates inputs and stops before model inference.
   */
  abstract execute(input: SpecialistInput): Promise<SpecialistOutput>;

  /**
   * Helper to construct a standardized, truthful failed/not-implemented output.
   * Never fabricates results or claims successful inference.
   */
  protected createUnimplementedOutput(
    startTime: number,
    rejectionReason = 'Specialist model execution is not implemented in Stage 5.',
    status: 'failed' | 'rejected' = 'failed',
    metadataNotes: string[] = ['Stage 5 execution stopped: model inference not implemented.']
  ): SpecialistOutput {
    const durationMs = Math.max(1, Date.now() - startTime);

    return {
      toolId: this.toolId,
      status,
      answerText: '',
      evidence: {
        evidenceType: 'none'
      },
      rejectionReason,
      executionMetrics: {
        modelName: 'none (unimplemented)',
        durationMs,
        device: 'none'
      },
      metadataNotes
    };
  }
}
