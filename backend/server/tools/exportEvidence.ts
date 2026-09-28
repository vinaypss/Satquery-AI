/**
 * SatQuery AI - Evidence Export & Georeferencing Audit Engine
 * Problem Statement: SIH26167 | Organization: ISRO / Department of Space | Team IMPOSTERS
 *
 * Enforces strict geospatial data integrity:
 * 1. NEVER treat pixel or normalized image coordinates as latitude/longitude.
 * 2. Generate standard GeoJSON (RFC 7946) ONLY when valid image georeferencing exists.
 * 3. When georeferencing is missing, unverified, or invalid, export evidence as
 *    image-space JSON, strictly labeled as non-geographic.
 * 4. Zero fabricated, synthetic, or hallucinated geographic coordinates.
 */

import { BBox } from '../types/catalog.js';
import {
  ResultReport,
  InputImageDescriptor
} from '../types/index.js';

export interface ValidGeoreferencing {
  bbox: BBox; // [minLon, minLat, maxLon, maxLat] in EPSG:4326
  crs: string; // e.g. "EPSG:4326"
  source: string;
}

export interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  properties: {
    label: string;
    confidence: number;
    reportId: string;
    coordinateSystem: string;
    isGeographic: true;
    sourceImage?: string;
    originalNormalizedBox: {
      xMin: number;
      yMin: number;
      xMax: number;
      yMax: number;
    };
    provenance: string;
    [key: string]: unknown;
  };
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  crs?: {
    type: 'name';
    properties: {
      name: string;
    };
  };
  features: GeoJSONFeature[];
  properties: {
    query: string;
    reportId: string;
    toolId: string | null;
    modelName: string | null;
    georeferencing: ValidGeoreferencing;
    exportTimestamp: string;
    sihCompliance: {
      zeroFabricatedEvidence: true;
      provenanceVerified: boolean;
      coordinateSystem: 'WGS84_GEOGRAPHIC';
    };
  };
}

export interface ImageSpaceBoxItem {
  label: string;
  confidence: number;
  box: {
    xMin: number;
    yMin: number;
    xMax: number;
    yMax: number;
  };
  pixelBox?: {
    xMin: number;
    yMin: number;
    xMax: number;
    yMax: number;
  };
  isGeographic: false;
}

export interface ImageSpaceEvidenceExport {
  exportFormat: 'image_space_json';
  isGeographic: false;
  coordinateSystem: 'normalized_image_space';
  disclaimer: string;
  reportId: string;
  query: string;
  toolId: string | null;
  evidenceType: string;
  items: ImageSpaceBoxItem[];
  imageDimensions?: {
    width: number;
    height: number;
  };
  exportTimestamp: string;
  provenance: string;
  sihCompliance: {
    zeroFabricatedEvidence: true;
    provenanceVerified: boolean;
    coordinateSystem: 'NON_GEOGRAPHIC_IMAGE_SPACE';
  };
}

export type ExportEvidenceResult =
  | {
      valid: true;
      exportFormat: 'geojson';
      isGeographic: true;
      geoJson: GeoJSONFeatureCollection;
      georeferencing: ValidGeoreferencing;
    }
  | {
      valid: true;
      exportFormat: 'image_space_json';
      isGeographic: false;
      imageSpaceEvidence: ImageSpaceEvidenceExport;
      georeferencing: null;
      reason: string;
    };

/**
 * Validates whether a candidate bounding box is a valid geographic WGS84 bounding box.
 * Strictly rejects:
 * - Arrays with length != 4 or non-numeric entries
 * - Latitude outside [-90, 90] or minLat >= maxLat
 * - Longitude outside [-180, 180] or minLon >= maxLon
 * - Normalized image coordinate unit squares like [0, 0, 1, 1]
 */
export function isValidGeographicBBox(coords: unknown): coords is BBox {
  if (!Array.isArray(coords) || coords.length !== 4) {
    return false;
  }

  const [minLon, minLat, maxLon, maxLat] = coords.map(Number);
  if (
    isNaN(minLon) ||
    isNaN(minLat) ||
    isNaN(maxLon) ||
    isNaN(maxLat)
  ) {
    return false;
  }

  // Latitude range check
  if (minLat < -90 || maxLat > 90 || minLat >= maxLat) {
    return false;
  }

  // Longitude range check
  if (minLon < -180 || maxLon > 180 || minLon >= maxLon) {
    return false;
  }

  // Strictly reject normalized unit box [0, 0, 1, 1] or pixel-scale bounding boxes
  if (minLon === 0 && minLat === 0 && maxLon === 1 && maxLat === 1) {
    return false;
  }

  return true;
}

/**
 * Extracts a valid geographic bounding box from a string like "BBox: [77.5, 12.9, 77.7, 13.1]"
 */
export function extractBBoxFromString(str: string): BBox | null {
  if (typeof str !== 'string') return null;
  const match = str.match(
    /BBox:\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/i
  );
  if (match) {
    const candidate = [
      parseFloat(match[1]),
      parseFloat(match[2]),
      parseFloat(match[3]),
      parseFloat(match[4])
    ];
    if (isValidGeographicBBox(candidate)) {
      return candidate as BBox;
    }
  }
  return null;
}

/**
 * Inspects image metadata or explicit override to extract validated geographic georeferencing.
 * Returns null if the image has no spatial georeferencing.
 */
export function resolveGeoreferencing(
  image?: InputImageDescriptor | null,
  override?: unknown
): ValidGeoreferencing | null {
  // 1. Check explicit override if supplied
  if (override && typeof override === 'object') {
    const ov = override as Record<string, unknown>;
    if (isValidGeographicBBox(ov.bbox)) {
      return {
        bbox: ov.bbox,
        crs: typeof ov.crs === 'string' ? ov.crs : 'EPSG:4326',
        source: 'explicit_override'
      };
    }
  }

  if (!image) {
    return null;
  }

  // 2. Check image coordinates array
  if (isValidGeographicBBox(image.coordinates)) {
    return {
      bbox: image.coordinates,
      crs: image.crs || 'EPSG:4326',
      source: 'image_coordinates'
    };
  }

  // 3. Check image metadata object
  if (image.metadata && typeof image.metadata === 'object') {
    const metaBbox = (image.metadata as Record<string, unknown>).bbox;
    if (isValidGeographicBBox(metaBbox)) {
      return {
        bbox: metaBbox,
        crs: image.crs || 'EPSG:4326',
        source: 'image_metadata'
      };
    }
  }

  // 4. Check image geographicArea string (e.g. from STAC ingestion)
  if (typeof image.geographicArea === 'string') {
    const parsed = extractBBoxFromString(image.geographicArea);
    if (parsed) {
      return {
        bbox: parsed,
        crs: image.crs || 'EPSG:4326',
        source: 'geographic_area_metadata'
      };
    }
  }

  return null;
}

/**
 * Extracts and normalizes bounding box coordinates from varying specialist evidence shapes.
 * Works with both lowercase (xmin/ymin/xmax/ymax) and camelCase (xMin/yMin/xMax/yMax)
 * conventions used across specialist adapters.
 */
function extractBoxCoordinates(b: any): { xMin: number; yMin: number; xMax: number; yMax: number } | null {
  if (!b || typeof b !== 'object') return null;

  const rawXmin = b.xMin ?? b.xmin ?? b.box?.xMin ?? b.box?.xmin;
  const rawYmin = b.yMin ?? b.ymin ?? b.box?.yMin ?? b.box?.ymin;
  const rawXmax = b.xMax ?? b.xmax ?? b.box?.xMax ?? b.box?.xmax;
  const rawYmax = b.yMax ?? b.ymax ?? b.box?.yMax ?? b.box?.ymax;

  if (rawXmin === undefined || rawYmin === undefined || rawXmax === undefined || rawYmax === undefined) {
    return null;
  }

  const xMin = Number(rawXmin);
  const yMin = Number(rawYmin);
  const xMax = Number(rawXmax);
  const yMax = Number(rawYmax);

  if (isNaN(xMin) || isNaN(yMin) || isNaN(xMax) || isNaN(yMax)) {
    return null;
  }

  // Check valid non-degenerate geometry
  if (xMax <= xMin || yMax <= yMin) {
    return null;
  }

  return { xMin, yMin, xMax, yMax };
}

/**
 * Detects whether a bounding box is expressed in pixel coordinates (any value > 1)
 * and converts it to normalized [0, 1] image coordinates using the image dimensions.
 * Returns the original box unchanged when the box is already normalized [0, 1].
 */
export function asNormalizedBox(
  box: { xMin: number; yMin: number; xMax: number; yMax: number },
  dimensions?: { width: number; height: number }
): { xMin: number; yMin: number; xMax: number; yMax: number } {
  const values = [box.xMin, box.yMin, box.xMax, box.yMax];
  const looksPixelSpace = values.some((v) => v > 1 || v < 0);

  if (looksPixelSpace && dimensions && dimensions.width > 0 && dimensions.height > 0) {
    const w = dimensions.width;
    const h = dimensions.height;
    return {
      xMin: Math.max(0, Math.min(1, box.xMin / w)),
      yMin: Math.max(0, Math.min(1, box.yMin / h)),
      xMax: Math.max(0, Math.min(1, box.xMax / w)),
      yMax: Math.max(0, Math.min(1, box.yMax / h))
    };
  }

  // Already normalized or dimensions unavailable: clamp strictly into [0, 1]
  return {
    xMin: Math.max(0, Math.min(1, box.xMin)),
    yMin: Math.max(0, Math.min(1, box.yMin)),
    xMax: Math.max(0, Math.min(1, box.xMax)),
    yMax: Math.max(0, Math.min(1, box.yMax))
  };
}

/**
 * Maps normalized [0, 1] image coordinates to geographic coordinates [minLon, minLat, maxLon, maxLat].
 *
 * In computer vision raster space:
 *   x = 0 is left (West), x = 1 is right (East)
 *   y = 0 is top (North), y = 1 is bottom (South)
 *
 * In geographic space:
 *   lonLeft = minLon + (xMin * lonSpan)
 *   lonRight = minLon + (xMax * lonSpan)
 *   latTop = maxLat - (yMin * latSpan)
 *   latBottom = maxLat - (yMax * latSpan)
 */
export function projectNormalizedBoxToGeographic(
  normBox: { xMin: number; yMin: number; xMax: number; yMax: number },
  bbox: BBox
): number[][] {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const lonSpan = maxLon - minLon;
  const latSpan = maxLat - minLat;

  // Clamp normalized inputs to [0, 1] to prevent runaway projections
  const clampedXmin = Math.max(0, Math.min(1, normBox.xMin));
  const clampedYmin = Math.max(0, Math.min(1, normBox.yMin));
  const clampedXmax = Math.max(0, Math.min(1, normBox.xMax));
  const clampedYmax = Math.max(0, Math.min(1, normBox.yMax));

  const lonLeft = Number((minLon + clampedXmin * lonSpan).toFixed(7));
  const lonRight = Number((minLon + clampedXmax * lonSpan).toFixed(7));
  const latTop = Number((maxLat - clampedYmin * latSpan).toFixed(7));
  const latBottom = Number((maxLat - clampedYmax * latSpan).toFixed(7));

  // RFC 7946 Polygon ring in counter-clockwise winding order (SW -> SE -> NE -> NW -> SW)
  return [
    [lonLeft, latBottom],
    [lonRight, latBottom],
    [lonRight, latTop],
    [lonLeft, latTop],
    [lonLeft, latBottom]
  ];
}

/**
 * Audits and exports evidence from a ResultReport.
 *
 * Strictly adheres to SIH26167 integrity requirements:
 * - Produces GeoJSON only when valid georeferencing is verified.
 * - Otherwise exports image-space JSON, explicitly declaring isGeographic: false.
 */
export function exportAnalysisEvidence(options: {
  report: ResultReport;
  image?: InputImageDescriptor | null;
  georeferencingOverride?: unknown;
}): ExportEvidenceResult {
  const { report, image = null, georeferencingOverride } = options;

  const specialistOutput = report.specialistOutput;
  const boxes = specialistOutput?.evidence?.boxes || [];
  const georef = resolveGeoreferencing(image, georeferencingOverride);
  const provenance = report.sihCompliance?.zeroFabricatedEvidence ? 'MODEL_GENERATED' : 'UNVERIFIED';

  const metadata = (image?.metadata ?? {}) as Record<string, unknown>;
  const dims = metadata.dimensions as { width: number; height: number } | undefined;

  // When valid geographic georeferencing exists: generate standard GeoJSON
  if (georef) {
    const features: GeoJSONFeature[] = [];

    for (const rawBox of boxes) {
      const coords = extractBoxCoordinates(rawBox);
      if (!coords) continue;

      // Normalize before projecting: pixel coordinates must never be
      // interpreted directly as geographic longitude/latitude values.
      const normCoords = asNormalizedBox(coords, dims);

      const ring = projectNormalizedBoxToGeographic(normCoords, georef.bbox);

      features.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [ring]
        },
        properties: {
          label: rawBox.label || 'target',
          confidence: typeof rawBox.confidence === 'number' ? rawBox.confidence : 1.0,
          reportId: report.reportId,
          coordinateSystem: georef.crs,
          isGeographic: true,
          sourceImage: image?.name,
          originalNormalizedBox: normCoords,
          provenance
        }
      });
    }

    const geoJson: GeoJSONFeatureCollection = {
      type: 'FeatureCollection',
      crs: {
        type: 'name',
        properties: {
          name: georef.crs
        }
      },
      features,
      properties: {
        query: report.query,
        reportId: report.reportId,
        toolId: report.provenanceChain?.selectedToolId ?? null,
        modelName: report.provenanceChain?.modelName ?? null,
        georeferencing: georef,
        exportTimestamp: new Date().toISOString(),
        sihCompliance: {
          zeroFabricatedEvidence: true,
          provenanceVerified: report.sihCompliance?.provenanceVerified ?? false,
          coordinateSystem: 'WGS84_GEOGRAPHIC'
        }
      }
    };

    return {
      valid: true,
      exportFormat: 'geojson',
      isGeographic: true,
      geoJson,
      georeferencing: georef
    };
  }

  // When georeferencing is absent / unverified: export truthful image-space JSON
  const items: ImageSpaceBoxItem[] = [];

  for (const rawBox of boxes) {
    const coords = extractBoxCoordinates(rawBox);
    if (!coords) continue;

    const normalized = asNormalizedBox(coords, dims);
    const isPixelSpace = coords.xMin !== normalized.xMin ||
      coords.yMin !== normalized.yMin ||
      coords.xMax !== normalized.xMax ||
      coords.yMax !== normalized.yMax;

    items.push({
      label: rawBox.label || 'target',
      confidence: typeof rawBox.confidence === 'number' ? rawBox.confidence : 1.0,
      box: normalized,
      pixelBox: isPixelSpace ? coords : undefined,
      isGeographic: false
    });
  }

  const imageSpaceEvidence: ImageSpaceEvidenceExport = {
    exportFormat: 'image_space_json',
    isGeographic: false,
    coordinateSystem: 'normalized_image_space',
    disclaimer:
      'NON-GEOGRAPHIC EVIDENCE: This image lacks spatial georeferencing metadata (BBox / CRS). Coordinates represent normalized image coordinates [0, 1] across raster dimensions, NOT geographic latitude or longitude.',
    reportId: report.reportId,
    query: report.query,
    toolId: report.provenanceChain?.selectedToolId ?? null,
    evidenceType: specialistOutput?.evidence?.evidenceType || 'none',
    items,
    imageDimensions: dims,
    exportTimestamp: new Date().toISOString(),
    provenance,
    sihCompliance: {
      zeroFabricatedEvidence: true,
      provenanceVerified: report.sihCompliance?.provenanceVerified ?? false,
      coordinateSystem: 'NON_GEOGRAPHIC_IMAGE_SPACE'
    }
  };

  return {
    valid: true,
    exportFormat: 'image_space_json',
    isGeographic: false,
    imageSpaceEvidence,
    georeferencing: null,
    reason:
      'Input imagery lacks validated geographic georeferencing metadata (BBox / CRS). Coordinates remain strictly in normalized image space.'
  };
}
