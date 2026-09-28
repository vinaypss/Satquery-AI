/**
 * SatQuery AI - Stage 6A Specialist Model Audit Route
 * Problem Statement: SIH26167 | Organization: ISRO
 * Exposes the verified model-capability audit for the 6 specialist workflows.
 */

import { Router, Request, Response } from 'express';
import { getFullModelAuditResponse, getSpecialistAuditEntry } from '../tools/modelAudit.js';
import { ParsedQueryTaskType } from '../types/index.js';
import { isValidTaskType } from '../security/inputValidation.js';

export const modelAuditRouter = Router();

/**
 * GET /api/model-audit
 * Returns the comprehensive model audit report, hardware assessment,
 * and specialist capability matrix.
 */
modelAuditRouter.get('/', (req: Request, res: Response) => {
  try {
    const taskTypeQuery = req.query.taskType as string | undefined;

    // Strict allowlist: only exact known task identifiers are looked up.
    if (taskTypeQuery) {
      if (!isValidTaskType(taskTypeQuery)) {
        return res.status(404).json({
          valid: false,
          error: 'No model audit entry found for the requested taskType.'
        });
      }
      const entry = getSpecialistAuditEntry(taskTypeQuery as ParsedQueryTaskType);
      if (!entry) {
        return res.status(404).json({
          valid: false,
          error: `No model audit entry found for taskType: "${taskTypeQuery}"`
        });
      }
      return res.status(200).json({
        valid: true,
        entry
      });
    }

    const auditResponse = getFullModelAuditResponse();
    return res.status(200).json(auditResponse);
  } catch (error) {
    console.error('Error serving model audit:', error);
    return res.status(500).json({
      valid: false,
      error: 'Internal server error while retrieving model audit.'
    });
  }
});
