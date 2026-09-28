import { Router, Request, Response } from 'express';
import { validateRemoteSensingImage } from '../validation/imageValidator.js';
import { sanitizeImageDescriptor, toSafeErrorMessage } from '../security/accessControl.js';

export const validateImageRouter = Router();

validateImageRouter.post('/', (req: Request, res: Response) => {
  try {
    const payload = req.body?.image || req.body;

    if (!payload || typeof payload !== 'object') {
      res.status(400).json({
        valid: false,
        errors: ['Missing image payload in request body.'],
        warnings: []
      });
      return;
    }

    // Strip filesystem carriers / identity fields before validation.
    // The validator itself additionally requires an inline `data:` URI.
    const sanitized = sanitizeImageDescriptor(payload).image;

    const result = validateRemoteSensingImage(sanitized);

    res.status(200).json(result);
  } catch (error) {
    console.error('[validate-image] validation failure:', error);
    res.status(500).json({
      valid: false,
      errors: [toSafeErrorMessage('image validation')],
      warnings: []
    });
  }
});
