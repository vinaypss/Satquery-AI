import { Router, Request, Response } from 'express';
import { HealthResponse } from '../types/index.js';

export const healthRouter = Router();

healthRouter.get('/', (_req: Request, res: Response) => {
  const healthData: HealthResponse = {
    status: 'ok',
    service: 'SatQuery AI Backend',
    stage: 'Stage 1 Foundation',
    timestamp: new Date().toISOString()
  };

  res.status(200).json(healthData);
});
