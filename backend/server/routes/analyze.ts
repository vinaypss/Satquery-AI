/**
 * SatQuery AI - Stage 7 Unified Analysis & Reporting Route
 * SIH26167 | ISRO / Department of Space | Team IMPOSTERS
 *
 * Coordinates the full analysis pipeline:
 *   1. parseQuery (Stage 3)
 *   2. routeTask & compatibilityCheck (Stage 4)
 *   3. executeSpecialistTask (Stage 5/6)
 *   4. buildResultReport (Stage 7)
 *
 * Emits a structured, truthful ResultReport capturing status, metrics,
 * provenance, and SIH26167 anti-fabrication compliance.
 */

import { Router, Request, Response } from 'express';
import { parseQuery } from '../agent/queryParser.js';
import { routeTask } from '../agent/router.js';
import { executeSpecialistTask } from '../tools/index.js';
import { buildResultReport } from '../agent/resultAggregator.js';
import { exportAnalysisEvidence } from '../tools/exportEvidence.js';
import {
  InputImageDescriptor,
  SpecialistInput,
  AnalyzeResponse
} from '../types/index.js';
import {
  sanitizeImageArray,
  sanitizeImageDescriptor,
  toSafeErrorMessage
} from '../security/accessControl.js';
import { validateQueryText } from '../security/inputValidation.js';

export const analyzeRouter = Router();

analyzeRouter.post('/', async (req: Request, res: Response) => {
  const overallStart = Date.now();

  try {
    const rawQuery = req.body?.query;
    // Trust-boundary sanitization: strip filesystem `path` carriers and
    // non-`data:` remote URLs before any downstream worker contact, and
    // drop client-supplied identity/privilege fields.
    const sanitized = sanitizeImageArray(req.body?.images, { requireDataUri: true });
    if (sanitized.error) {
      const response: AnalyzeResponse = {
        valid: false,
        error: sanitized.error
      };
      res.status(400).json(response);
      return;
    }
    const images = sanitized.images as InputImageDescriptor[];
    const parameters = (req.body?.parameters || {}) as Record<string, unknown>;

    // 1. Request validation (strict prompt schema: type + presence + length)
    const queryCheck = validateQueryText(rawQuery);
    if (!queryCheck.ok) {
      const response: AnalyzeResponse = {
        valid: false,
        error: queryCheck.error as string
      };
      res.status(400).json(response);
      return;
    }

    const query = queryCheck.value as string;

    // 2. Stage 3: Query Parsing
    const parseStart = Date.now();
    const parseResult = parseQuery(query);
    const parseMs = Math.max(1, Date.now() - parseStart);

    if (!parseResult.valid || !parseResult.parsedQuery) {
      const report = buildResultReport({
        query,
        parsedQuery: null,
        routingDecision: null,
        specialistOutput: null,
        pipelineMetrics: {
          parseMs,
          routeMs: 0,
          executeMs: 0,
          totalMs: Math.max(1, Date.now() - overallStart)
        },
        error: parseResult.error || 'Failed to parse natural-language query.'
      });

      const response: AnalyzeResponse = {
        valid: true,
        report
      };
      res.status(200).json(response);
      return;
    }

    const parsedQuery = parseResult.parsedQuery;

    // 3. Stage 4: Agentic Task Routing & Modality Compatibility
    const routeStart = Date.now();
    const routingDecision = routeTask(parsedQuery, images);
    const routeMs = Math.max(1, Date.now() - routeStart);

    if (routingDecision.routingStatus !== 'routed') {
      const report = buildResultReport({
        query,
        parsedQuery,
        routingDecision,
        specialistOutput: null,
        pipelineMetrics: {
          parseMs,
          routeMs,
          executeMs: 0,
          totalMs: Math.max(1, Date.now() - overallStart)
        }
      });

      const response: AnalyzeResponse = {
        valid: true,
        report
      };
      res.status(200).json(response);
      return;
    }

    // 4. Stage 5 / 6: Controlled Specialist Execution
    const execStart = Date.now();
    const specialistInput: SpecialistInput = {
      taskId: routingDecision.taskId || 'task_analyze',
      taskType: routingDecision.taskType,
      query: parsedQuery.rawQuery,
      images,
      parameters: {
        ...parameters,
        targetFeatures: parsedQuery.targetFeatures,
        requestedObjects: parsedQuery.requestedObjects
      }
    };

    const specialistOutput = await executeSpecialistTask(routingDecision, specialistInput);
    const executeMs = Math.max(1, Date.now() - execStart);

    // 5. Stage 7: Unified Result Integration & Reporting
    const report = buildResultReport({
      query,
      parsedQuery,
      routingDecision,
      specialistOutput,
      pipelineMetrics: {
        parseMs,
        routeMs,
        executeMs,
        totalMs: Math.max(1, Date.now() - overallStart)
      }
    });

    const response: AnalyzeResponse = {
      valid: true,
      report
    };
    res.status(200).json(response);
  } catch (error) {
    console.error('[analyze] unified pipeline failure:', error);
    res.status(500).json({
      valid: false,
      error: toSafeErrorMessage('unified analysis pipeline')
    });
  }
});

/**
 * POST /api/analyze/export-evidence
 * Audits and exports ResultReport evidence.
 *
 * Geospatial integrity contract (SIH26167 / ISRO GIS):
 *  - Pixel & normalized image coordinates are NEVER presented as latitude/longitude.
 *  - Standard GeoJSON (RFC 7946) is generated ONLY when valid image georeferencing
 *    (WGS84 BBox + CRS) exists.
 *  - Without valid georeferencing, evidence is exported as image-space JSON explicitly
 *    marked isGeographic: false with a clear NON-GEOGRAPHIC disclaimer.
 */
analyzeRouter.post('/export-evidence', (req: Request, res: Response) => {
  try {
    const report = req.body?.report;
    if (!report || !report.specialistOutput) {
      res.status(400).json({ valid: false, error: 'A valid ResultReport with specialistOutput is required.' });
      return;
    }

    // Strip filesystem carriers / identity fields from the export image.
    // Export is a stateless audit of the supplied report: it never reads
    // stored objects, so there is no cross-user resource to leak.
    const exportImage = req.body?.image
      ? sanitizeImageDescriptor(req.body.image).image as InputImageDescriptor
      : null;
    const georeferencingOverride = req.body?.georeferencingOverride ?? undefined;

    const result = exportAnalysisEvidence({
      report,
      image: exportImage,
      georeferencingOverride
    });

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(result);
  } catch (error) {
    console.error('[analyze] export-evidence failure:', error);
    res.status(500).json({ valid: false, error: toSafeErrorMessage('evidence export') });
  }
});

/**
 * POST /api/analyze/export-geojson
 * Deprecated convenience alias: returns standard GeoJSON ONLY for georeferenced imagery.
 * For non-georeferenced imagery returns image-space JSON (isGeographic: false).
 */
analyzeRouter.post('/export-geojson', (req: Request, res: Response) => {
  try {
    const report = req.body?.report;
    if (!report || !report.specialistOutput) {
      res.status(400).json({ valid: false, error: 'A valid ResultReport with specialistOutput is required.' });
      return;
    }

    const exportImage = req.body?.image
      ? sanitizeImageDescriptor(req.body.image).image as InputImageDescriptor
      : null;
    const georeferencingOverride = req.body?.georeferencingOverride ?? undefined;

    const result = exportAnalysisEvidence({
      report,
      image: exportImage,
      georeferencingOverride
    });

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json(result);
  } catch (error) {
    console.error('[analyze] export-geojson failure:', error);
    res.status(500).json({ valid: false, error: toSafeErrorMessage('GeoJSON export') });
  }
});
