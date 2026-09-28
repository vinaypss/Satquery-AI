import { Router, Request, Response } from 'express';
import { routeTask } from '../agent/router.js';
import { ParsedQuery, InputImageDescriptor } from '../types/index.js';
import { sanitizeImageArray, toSafeErrorMessage } from '../security/accessControl.js';

export const routeTaskRouter = Router();

routeTaskRouter.post('/', (req: Request, res: Response) => {
  try {
    const parsedQuery = req.body?.parsedQuery as ParsedQuery | undefined;
    // Routing is metadata-level (no worker contact, no bytes consumed), so
    // carriers are stripped but `data:` bytes are not required here.
    const sanitized = sanitizeImageArray(req.body?.images);
    if (sanitized.error) {
      res.status(400).json({
        valid: false,
        error: sanitized.error
      });
      return;
    }
    const images = sanitized.images as InputImageDescriptor[];

    if (!parsedQuery || typeof parsedQuery !== 'object') {
      res.status(400).json({
        valid: false,
        error: 'Invalid request: "parsedQuery" object is required.'
      });
      return;
    }

    const routingResult = routeTask(parsedQuery, images);

    res.status(200).json({
      valid: true,
      routingResult
    });
  } catch (error) {
    console.error('[route-task] routing failure:', error);
    res.status(500).json({
      valid: false,
      error: toSafeErrorMessage('agentic task routing')
    });
  }
});
