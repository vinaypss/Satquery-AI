/**
 * Phase 4 Data Strategy: STAC Catalog Search Service
 * Integrates Copernicus Data Space Ecosystem (CDSE) STAC API
 *
 * SIH26167 | SatQuery AI | ISRO / Department of Space
 */

import {
  BBox,
  CatalogSearchRequest,
  CatalogSearchResponse,
  CollectionMetadata,
  ModalityType,
  NormalizedCatalogItem,
  STACAssetSummary,
  SupportedCollection
} from '../types/catalog.js';

export type {
  BBox,
  CatalogSearchRequest,
  CatalogSearchResponse,
  CollectionMetadata,
  ModalityType,
  NormalizedCatalogItem,
  STACAssetSummary,
  SupportedCollection
};

export const CDSE_STAC_BASE_URL = 'https://stac.dataspace.copernicus.eu/v1';

export const ALLOWED_ASSET_DOMAINS = [
  'stac.dataspace.copernicus.eu',
  'dataspace.copernicus.eu',
  'datahub.creodias.eu',
  'download.dataspace.copernicus.eu',
  'zipper.dataspace.copernicus.eu',
  'catalogue.dataspace.copernicus.eu',
  'eodata.dataspace.copernicus.eu',
  'eodata.cloudferro.com',
  'identity.dataspace.copernicus.eu'
];

export const SUPPORTED_COLLECTIONS: CollectionMetadata[] = [
  {
    id: 'sentinel-2-l2a',
    title: 'Sentinel-2 Level-2A (Surface Reflectance)',
    description: 'Bottom-Of-Atmosphere (BOA) reflectance with atmospheric correction, 10m-60m resolution.',
    modality: 'OPTICAL',
    spatialResolution: '10m (VNIR), 20m (RedEdge/SWIR), 60m (Atmospheric)',
    constellation: 'Sentinel-2',
    instruments: ['MSI']
  },
  {
    id: 'sentinel-2-l1c',
    title: 'Sentinel-2 Level-1C (Top of Atmosphere)',
    description: 'Top-Of-Atmosphere (TOA) reflectance in cartographic geometry, 10m-60m resolution.',
    modality: 'OPTICAL',
    spatialResolution: '10m (VNIR), 20m (RedEdge/SWIR), 60m (Atmospheric)',
    constellation: 'Sentinel-2',
    instruments: ['MSI']
  },
  {
    id: 'sentinel-1-grd',
    title: 'Sentinel-1 Level-1 GRD (Ground Range Detected)',
    description: 'Calibrated SAR backscatter in dual polarization (VV, VH) detected ground range.',
    modality: 'SAR',
    spatialResolution: '10m-20m (Interferometric Wide Swath)',
    constellation: 'Sentinel-1',
    instruments: ['C-SAR']
  },
  {
    id: 'sentinel-1-slc',
    title: 'Sentinel-1 Level-1 SLC (Single Look Complex)',
    description: 'Phase-preserving complex SAR data for interferometry and coherence tracking.',
    modality: 'SAR',
    spatialResolution: '5m x 20m',
    constellation: 'Sentinel-1',
    instruments: ['C-SAR']
  }
];

export class STACValidationError extends Error {
  public details: string[];
  public statusCode: number;

  constructor(message: string, details: string[] = [], statusCode = 400) {
    super(message);
    this.name = 'STACValidationError';
    this.details = details;
    this.statusCode = statusCode;
  }
}

export class STACUpstreamError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode = 502) {
    super(message);
    this.name = 'STACUpstreamError';
    this.statusCode = statusCode;
  }
}

/**
 * SSRF Security Validator: Check if a URL uses HTTP/HTTPS and is from an allowlisted domain.
 * Blocks localhost, internal RFC1918 IPs, loopbacks, and non-http schemes.
 */
export function isSafeAssetUrl(rawUrl: string | null | undefined): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;

  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Check for IP or loopback patterns
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('169.254.')
    ) {
      return false;
    }

    // Check 172.16.0.0 – 172.31.255.255
    const octets = hostname.split('.');
    if (octets.length === 4 && octets.every((o) => /^\d+$/.test(o))) {
      const first = parseInt(octets[0], 10);
      const second = parseInt(octets[1], 10);
      if (first === 172 && second >= 16 && second <= 31) {
        return false;
      }
    }

    // Check domain allowlist
    return ALLOWED_ASSET_DOMAINS.some(
      (allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`)
    );
  } catch {
    return false;
  }
}

/**
 * Validates bounding box coordinates.
 */
export function validateBBox(bbox: unknown): BBox {
  if (!Array.isArray(bbox) || bbox.length !== 4) {
    throw new STACValidationError('Bounding box must be an array of 4 numbers: [minLon, minLat, maxLon, maxLat].');
  }

  const [minLon, minLat, maxLon, maxLat] = bbox.map(Number);

  if (isNaN(minLon) || isNaN(minLat) || isNaN(maxLon) || isNaN(maxLat)) {
    throw new STACValidationError('All bounding box coordinates must be valid numbers.');
  }

  if (minLon < -180 || maxLon > 180) {
    throw new STACValidationError('Longitude must be between -180 and 180 degrees.');
  }

  if (minLat < -90 || maxLat > 90) {
    throw new STACValidationError('Latitude must be between -90 and 90 degrees.');
  }

  if (minLon > maxLon) {
    throw new STACValidationError('minLon cannot be greater than maxLon.');
  }

  if (minLat > maxLat) {
    throw new STACValidationError('minLat cannot be greater than maxLat.');
  }

  return [minLon, minLat, maxLon, maxLat];
}

/**
 * Validates temporal filtering range.
 */
export function validateDateRange(startDate: unknown, endDate: unknown): { start: string; end: string } {
  if (!startDate || typeof startDate !== 'string') {
    throw new STACValidationError('startDate is required and must be an ISO 8601 string.');
  }
  if (!endDate || typeof endDate !== 'string') {
    throw new STACValidationError('endDate is required and must be an ISO 8601 string.');
  }

  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime())) {
    throw new STACValidationError(`Invalid startDate format: "${startDate}".`);
  }
  if (isNaN(end.getTime())) {
    throw new STACValidationError(`Invalid endDate format: "${endDate}".`);
  }

  if (start.getTime() > end.getTime()) {
    throw new STACValidationError('startDate must be before or equal to endDate.');
  }

  return {
    start: start.toISOString(),
    end: end.toISOString()
  };
}

/**
 * Maps requested collections and modalities to valid CDSE collection IDs.
 */
export function normalizeCollections(collections?: string[], modality?: ModalityType): SupportedCollection[] {
  const collectionAliases: Record<string, SupportedCollection> = {
    'sentinel-2': 'sentinel-2-l2a',
    'sentinel-2-l2a': 'sentinel-2-l2a',
    's2-l2a': 'sentinel-2-l2a',
    's2': 'sentinel-2-l2a',
    'sentinel-2-l1c': 'sentinel-2-l1c',
    's2-l1c': 'sentinel-2-l1c',
    'sentinel-1': 'sentinel-1-grd',
    'sentinel-1-grd': 'sentinel-1-grd',
    's1-grd': 'sentinel-1-grd',
    's1': 'sentinel-1-grd',
    'sentinel-1-slc': 'sentinel-1-slc',
    's1-slc': 'sentinel-1-slc'
  };

  const normalized = new Set<SupportedCollection>();

  if (collections && collections.length > 0) {
    for (const raw of collections) {
      const key = raw.toLowerCase().trim();
      const mapped = collectionAliases[key];
      if (!mapped) {
        throw new STACValidationError(
          `Unsupported collection "${raw}". Supported: sentinel-2-l2a, sentinel-2-l1c, sentinel-1-grd, sentinel-1-slc.`
        );
      }
      normalized.add(mapped);
    }
  } else {
    // Default by modality
    if (modality === 'OPTICAL') {
      normalized.add('sentinel-2-l2a');
    } else if (modality === 'SAR') {
      normalized.add('sentinel-1-grd');
    } else {
      // Modality 'ALL' or unspecified
      normalized.add('sentinel-2-l2a');
      normalized.add('sentinel-1-grd');
    }
  }

  return Array.from(normalized);
}

/**
 * Calculates spatial intersection percentage between scene BBox and query BBox.
 */
export function calculateBBoxOverlap(sceneBBox: BBox, queryBBox: BBox): number {
  const [sMinLon, sMinLat, sMaxLon, sMaxLat] = sceneBBox;
  const [qMinLon, qMinLat, qMaxLon, qMaxLat] = queryBBox;

  const interMinLon = Math.max(sMinLon, qMinLon);
  const interMaxLon = Math.min(sMaxLon, qMaxLon);
  const interMinLat = Math.max(sMinLat, qMinLat);
  const interMaxLat = Math.min(sMaxLat, qMaxLat);

  if (interMinLon >= interMaxLon || interMinLat >= interMaxLat) {
    return 0;
  }

  const interArea = (interMaxLon - interMinLon) * (interMaxLat - interMinLat);
  const queryArea = (qMaxLon - qMinLon) * (qMaxLat - qMinLat);

  if (queryArea <= 0) return 0;
  const pct = (interArea / queryArea) * 100;
  return Math.min(100, Math.round(pct * 100) / 100);
}

/**
 * Deterministic ranking engine:
 * 1. Spatial overlap % descending (scenes with larger query AOI coverage first)
 * 2. Cloud cover ascending (for optical scenes, lower cloud first)
 * 3. Date proximity to target range midpoint (closer to target center date first)
 * 4. Item ID ascending (stable lexicographical tie-breaker)
 */
export function rankCatalogItems(
  items: NormalizedCatalogItem[],
  targetMidpointMs: number
): NormalizedCatalogItem[] {
  return [...items].sort((a, b) => {
    // 1. Spatial overlap descending
    if (Math.abs(b.spatialOverlapPct - a.spatialOverlapPct) > 0.001) {
      return b.spatialOverlapPct - a.spatialOverlapPct;
    }

    // 2. Cloud cover ascending for optical scenes (treat null as 0)
    const aCloud = a.cloudCover ?? (a.modality === 'SAR' ? 0 : 100);
    const bCloud = b.cloudCover ?? (b.modality === 'SAR' ? 0 : 100);
    if (Math.abs(aCloud - bCloud) > 0.01) {
      return aCloud - bCloud;
    }

    // 3. Proximity to target date midpoint
    const aDateDiff = Math.abs(new Date(a.acquisitionDateTime).getTime() - targetMidpointMs);
    const bDateDiff = Math.abs(new Date(b.acquisitionDateTime).getTime() - targetMidpointMs);
    if (aDateDiff !== bDateDiff) {
      return aDateDiff - bDateDiff;
    }

    // 4. Deterministic tie-breaker: item ID
    return a.itemId.localeCompare(b.itemId);
  });
}

/**
 * Normalizes raw STAC feature into standard SatQuery NormalizedCatalogItem.
 */
export function normalizeSTACFeature(
  feature: any,
  queryBBox: BBox
): NormalizedCatalogItem {
  const collection = feature.collection || 'unknown';
  const isSar =
    collection.includes('sentinel-1') ||
    feature.properties?.instruments?.includes('sar') ||
    feature.properties?.instruments?.includes('c-sar');
  const modality: 'OPTICAL' | 'SAR' = isSar ? 'SAR' : 'OPTICAL';

  const sceneBBox: BBox = Array.isArray(feature.bbox) && feature.bbox.length === 4
    ? [feature.bbox[0], feature.bbox[1], feature.bbox[2], feature.bbox[3]]
    : [0, 0, 0, 0];

  const spatialOverlapPct = calculateBBoxOverlap(sceneBBox, queryBBox);

  // Parse cloud cover
  let cloudCover: number | null = null;
  if (feature.properties && typeof feature.properties['eo:cloud_cover'] === 'number') {
    cloudCover = feature.properties['eo:cloud_cover'];
  }

  // Extract safe assets and thumbnails
  const rawAssets = feature.assets || {};
  const sanitizedAssets: Record<string, STACAssetSummary> = {};
  let thumbnailUrl: string | null = null;
  let visualUrl: string | null = null;

  for (const [key, val] of Object.entries<any>(rawAssets)) {
    if (!val) continue;

    let href = typeof val.href === 'string' ? val.href : '';
    // Check if alternate https exists
    if (!isSafeAssetUrl(href) && val.alternate?.https?.href) {
      if (isSafeAssetUrl(val.alternate.https.href)) {
        href = val.alternate.https.href;
      }
    }

    if (isSafeAssetUrl(href)) {
      sanitizedAssets[key] = {
        href,
        type: val.type,
        title: val.title,
        roles: val.roles
      };

      if (!thumbnailUrl && (key === 'thumbnail' || val.roles?.includes('thumbnail') || val.roles?.includes('overview'))) {
        thumbnailUrl = href;
      }

      if (!visualUrl && (key === 'visual' || key === 'TCI_10m' || key === 'TCI_20m' || val.roles?.includes('visual'))) {
        visualUrl = href;
      }
    }
  }

  return {
    itemId: feature.id || 'unknown',
    collection,
    modality,
    platform: feature.properties?.platform || feature.properties?.constellation || (isSar ? 'Sentinel-1' : 'Sentinel-2'),
    acquisitionDateTime: feature.properties?.datetime || feature.properties?.start_datetime || new Date().toISOString(),
    bbox: sceneBBox,
    geometry: feature.geometry || null,
    cloudCover,
    spatialOverlapPct,
    thumbnailUrl,
    visualUrl,
    assets: sanitizedAssets,
    provider: 'Copernicus Data Space Ecosystem (CDSE)'
  };
}

export interface STACServiceOptions {
  fetchFn?: typeof fetch;
  stacBaseUrl?: string;
  timeoutMs?: number;
}

export class STACCatalogService {
  private fetchFn: typeof fetch;
  private stacBaseUrl: string;
  private timeoutMs: number;

  constructor(options: STACServiceOptions = {}) {
    this.fetchFn = options.fetchFn || globalThis.fetch;
    this.stacBaseUrl = options.stacBaseUrl || CDSE_STAC_BASE_URL;
    this.timeoutMs = options.timeoutMs || 15000;
  }

  public getAvailableCollections(): CollectionMetadata[] {
    return SUPPORTED_COLLECTIONS;
  }

  public async search(request: CatalogSearchRequest): Promise<CatalogSearchResponse> {
    const startTime = Date.now();

    // 1. Validate inputs
    const bbox = validateBBox(request.bbox);
    const dateRange = validateDateRange(request.startDate, request.endDate);
    const collections = normalizeCollections(request.collections, request.modality);

    let maxCloudCover: number | undefined = undefined;
    if (request.maxCloudCover !== undefined && request.maxCloudCover !== null) {
      const parsedCloud = Number(request.maxCloudCover);
      if (isNaN(parsedCloud) || parsedCloud < 0 || parsedCloud > 100) {
        throw new STACValidationError('maxCloudCover must be a number between 0 and 100.');
      }
      maxCloudCover = parsedCloud;
    }

    const limit = Math.max(1, Math.min(100, Number(request.limit) || 10));

    // 2. Build STAC query payload
    const searchBody: Record<string, any> = {
      collections,
      bbox,
      datetime: `${dateRange.start}/${dateRange.end}`,
      limit
    };

    // Apply cloud cover query if optical collection is searched
    const hasOptical = collections.some((c) => c.startsWith('sentinel-2'));
    if (hasOptical && maxCloudCover !== undefined) {
      searchBody.query = {
        'eo:cloud_cover': {
          lte: maxCloudCover
        }
      };
    }

    // 3. Execute request to STAC API with timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let upstreamResponse: Response;
    try {
      upstreamResponse = await this.fetchFn(`${this.stacBaseUrl}/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/geo+json, application/json'
        },
        body: JSON.stringify(searchBody),
        signal: controller.signal
      });
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new STACUpstreamError(`Upstream STAC API timed out after ${this.timeoutMs}ms.`, 504);
      }
      throw new STACUpstreamError(`Failed to connect to CDSE STAC service: ${err.message}`, 502);
    } finally {
      clearTimeout(timer);
    }

    if (!upstreamResponse.ok) {
      const errorText = await upstreamResponse.text().catch(() => '');
      throw new STACUpstreamError(
        `CDSE STAC API returned HTTP ${upstreamResponse.status}: ${errorText.slice(0, 300)}`,
        502
      );
    }

    const stacJson = await upstreamResponse.json();
    const rawFeatures: any[] = Array.isArray(stacJson.features) ? stacJson.features : [];

    // 4. Normalize and filter items
    let normalized = rawFeatures.map((f) => normalizeSTACFeature(f, bbox));

    // Secondary client-side cloud cover filter for strict adherence
    if (maxCloudCover !== undefined) {
      normalized = normalized.filter((item) => {
        if (item.modality === 'SAR') return true;
        if (item.cloudCover === null) return true;
        return item.cloudCover <= maxCloudCover!;
      });
    }

    // 5. Deterministic Ranking
    const midpointMs = (new Date(dateRange.start).getTime() + new Date(dateRange.end).getTime()) / 2;
    const ranked = rankCatalogItems(normalized, midpointMs);

    const executionTimeMs = Date.now() - startTime;

    return {
      status: ranked.length > 0 ? 'success' : 'no_results',
      totalFound: rawFeatures.length,
      returnedCount: ranked.length,
      results: ranked,
      querySummary: {
        bbox,
        dateRange,
        collections,
        modality: request.modality || (collections.length === 1 && collections[0].startsWith('sentinel-1') ? 'SAR' : 'OPTICAL'),
        maxCloudCover,
        executionTimeMs
      }
    };
  }
}
