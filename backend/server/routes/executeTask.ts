/**
 * SatQuery AI - Stage 5 Task Execution Endpoint
 * SIH26167 | ISRO Space Technology
 *
 * Invokes the controlled specialist adapter contract.
 * Halts safely before model inference in Stage 5.
 */

import { Router, Request, Response } from 'express';
import { executeSpecialistTask } from '../tools/index.js';
import {
  ParsedQuery,
  RoutingDecisionResult,
  InputImageDescriptor,
  SpecialistInput
} from '../types/index.js';
import { sanitizeImageArray, toSafeErrorMessage } from '../security/accessControl.js';
import { sanitizeParsedQuery } from '../security/inputValidation.js';

export const executeTaskRouter = Router();

executeTaskRouter.post('/', async (req: Request, res: Response) => {
  try {
    const routingResult = (req.body?.routingResult || req.body?.routingDecision) as
      | RoutingDecisionResult
      | undefined;
    // Trust-boundary sanitization (see analyze.ts): image bytes must be
    // inline `data:` URIs; filesystem paths and remote URLs are rejected
    // before any worker contact. Forged `routingResult` objects cannot
    // escape the controlled registry: unregistered toolIds are rejected
    // by executeSpecialistTask, and adapters re-validate task + inputs.
    // NOTE: `workerUrl`/`authKey` are never read from the request body;
    // workers are always contacted at server-configured endpoints.
    const sanitized = sanitizeImageArray(req.body?.images, { requireDataUri: true });
    if (sanitized.error) {
      res.status(400).json({
        valid: false,
        error: sanitized.error
      });
      return;
    }
    const images = sanitized.images as InputImageDescriptor[];
    const parameters = (req.body?.parameters || {}) as Record<string, unknown>;

    // 1. Request parameter validation
    if (!routingResult || typeof routingResult !== 'object') {
      res.status(400).json({
        valid: false,
        error: 'Invalid request: "routingResult" or "routingDecision" is required.'
      });
      return;
    }

    // Strict parsedQuery shape enforcement (prevents type-confusion crashes
    // from forged objects; adapters receive only sanitized shapes).
    const queryShape = sanitizeParsedQuery(req.body?.parsedQuery);
    if (!queryShape.ok) {
      res.status(400).json({
        valid: false,
        error: queryShape.error
      });
      return;
    }
    const cleanQuery = queryShape.value as unknown as ParsedQuery;

    // 2. Prepare standardized specialist input
    const specialistInput: SpecialistInput = {
      taskId: routingResult.taskId || 'task_stage5',
      taskType: routingResult.taskType,
      query: cleanQuery.rawQuery,
      images,
      parameters: {
        ...parameters,
        targetFeatures: cleanQuery.targetFeatures,
        requestedObjects: cleanQuery.requestedObjects
      }
    };

    // 3. Dispatch to controlled execution controller
    const output = await executeSpecialistTask(routingResult, specialistInput);

    res.status(200).json({
      valid: true,
      output
    });
  } catch (error) {
    console.error('[execute-task] execution failure:', error);
    res.status(500).json({
      valid: false,
      error: toSafeErrorMessage('specialist task execution')
    });
  }
});
