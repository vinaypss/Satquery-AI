import { Router, Request, Response } from 'express';
import { parseQuery } from '../agent/queryParser.js';
import { toSafeErrorMessage } from '../security/accessControl.js';
import { validateQueryText } from '../security/inputValidation.js';

export const parseQueryRouter = Router();

parseQueryRouter.post('/', (req: Request, res: Response) => {
  try {
    // Strict prompt schema first (type + presence + length); the parser
    // itself re-validates as defense-in-depth.
    const queryCheck = validateQueryText(req.body?.query);
    if (!queryCheck.ok) {
      res.status(400).json({ valid: false, error: queryCheck.error });
      return;
    }

    const result = parseQuery(queryCheck.value);

    if (!result.valid) {
      res.status(400).json(result);
      return;
    }

    res.status(200).json(result);
  } catch (error) {
    console.error('[parse-query] parsing failure:', error);
    res.status(500).json({
      valid: false,
      error: toSafeErrorMessage('query parsing')
    });
  }
});
