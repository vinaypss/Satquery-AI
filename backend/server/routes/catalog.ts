/**
 * Phase 4 Data Strategy: Express Catalog Routes
 * SIH26167 | SatQuery AI | ISRO / Department of Space
 */

import { Router, Request, Response } from 'express';
import {
  STACCatalogService,
  STACValidationError,
  STACUpstreamError
} from '../catalog/stacService.js';
import { CatalogSearchRequest } from '../types/catalog.js';
import { toSafeErrorMessage } from '../security/accessControl.js';

export const catalogRouter = Router();
const stacService = new STACCatalogService();

/**
 * GET /api/catalog/collections
 * Returns available satellite collections metadata
 */
catalogRouter.get('/collections', (_req: Request, res: Response) => {
  const collections = stacService.getAvailableCollections();
  res.status(200).json({
    status: 'success',
    collections
  });
});

/**
 * POST /api/catalog/search
 * Executes STAC query against Copernicus Data Space Ecosystem (CDSE)
 */
catalogRouter.post('/search', async (req: Request, res: Response) => {
  try {
    const searchRequest: CatalogSearchRequest = req.body;
    const response = await stacService.search(searchRequest);
    return res.status(200).json(response);
  } catch (error: any) {
    if (error instanceof STACValidationError) {
      return res.status(error.statusCode || 400).json({
        status: 'error',
        error: error.message,
        details: error.details
      });
    }

    if (error instanceof STACUpstreamError) {
      return res.status(error.statusCode || 502).json({
        status: 'error',
        error: error.message
      });
    }

    console.error('[catalog] search failure:', error);
    return res.status(500).json({
      status: 'error',
      error: toSafeErrorMessage('STAC catalog search')
    });
  }
});
