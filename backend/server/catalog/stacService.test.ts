/**
 * Phase 4 Data Strategy Unit Tests
 * Tests STAC catalog service, validation, ranking, SSRF protection, and error handling.
 *
 * SIH26167 | SatQuery AI | ISRO / Department of Space
 */

import {
  BBox,
  calculateBBoxOverlap,
  isSafeAssetUrl,
  normalizeCollections,
  rankCatalogItems,
  STACCatalogService,
  STACUpstreamError,
  STACValidationError,
  validateBBox,
  validateDateRange
} from './stacService.js';
import { NormalizedCatalogItem } from '../types/catalog.js';

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(message);
  }
  passedTests++;
  console.log(`✅ PASS: ${message}`);
}

async function runTests() {
  console.log('========================================================');
  console.log('RUNNING PHASE 4 STAC CATALOG UNIT TESTS');
  console.log('========================================================\n');

  // Test 1: BBox Validation - Valid BBox
  {
    const bbox = validateBBox([77.5, 12.9, 77.7, 13.1]);
    assert(bbox.length === 4 && bbox[0] === 77.5 && bbox[3] === 13.1, 'validateBBox accepts valid coordinates');
  }

  // Test 2: BBox Validation - Invalid length & non-numbers
  {
    let caught = false;
    try {
      validateBBox([77.5, 12.9]);
    } catch (e: any) {
      caught = e instanceof STACValidationError;
    }
    assert(caught, 'validateBBox rejects array with invalid length');

    caught = false;
    try {
      validateBBox([77.5, 'invalid', 77.7, 13.1] as any);
    } catch (e: any) {
      caught = e instanceof STACValidationError;
    }
    assert(caught, 'validateBBox rejects non-numeric entries');
  }

  // Test 3: BBox Validation - Inverted bounds & out-of-range coords
  {
    let caught = false;
    try {
      validateBBox([80.0, 12.0, 70.0, 13.0]); // minLon > maxLon
    } catch (e: any) {
      caught = e instanceof STACValidationError;
    }
    assert(caught, 'validateBBox rejects minLon > maxLon');

    caught = false;
    try {
      validateBBox([-200, 12.0, 70.0, 13.0]); // lon < -180
    } catch (e: any) {
      caught = e instanceof STACValidationError;
    }
    assert(caught, 'validateBBox rejects longitude < -180');
  }

  // Test 4: Date Range Validation - Valid ISO dates
  {
    const range = validateDateRange('2024-01-01T00:00:00Z', '2024-01-15T23:59:59Z');
    assert(range.start.startsWith('2024-01-01') && range.end.startsWith('2024-01-15'), 'validateDateRange accepts valid date range');
  }

  // Test 5: Date Range Validation - startDate > endDate
  {
    let caught = false;
    try {
      validateDateRange('2024-02-01', '2024-01-01');
    } catch (e: any) {
      caught = e instanceof STACValidationError;
    }
    assert(caught, 'validateDateRange rejects startDate after endDate');
  }

  // Test 6: Collection Normalization - Aliases & Modality
  {
    const optical = normalizeCollections(['s2', 'SENTINEL-2-L1C']);
    assert(
      optical.includes('sentinel-2-l2a') && optical.includes('sentinel-2-l1c'),
      'normalizeCollections correctly maps user aliases s2 and SENTINEL-2-L1C'
    );

    const sarDefault = normalizeCollections(undefined, 'SAR');
    assert(sarDefault.includes('sentinel-1-grd'), 'normalizeCollections defaults to sentinel-1-grd for SAR modality');

    let caught = false;
    try {
      normalizeCollections(['landsat-9']);
    } catch (e: any) {
      caught = e instanceof STACValidationError;
    }
    assert(caught, 'normalizeCollections rejects unsupported collection');
  }

  // Test 7: Spatial Overlap Calculation - Full overlap
  {
    const queryBBox: BBox = [10, 10, 20, 20];
    const sceneBBox: BBox = [5, 5, 25, 25]; // Scene contains query completely
    const overlap = calculateBBoxOverlap(sceneBBox, queryBBox);
    assert(overlap === 100, `calculateBBoxOverlap returns 100% when scene completely encloses query (got ${overlap}%)`);
  }

  // Test 8: Spatial Overlap Calculation - Partial overlap
  {
    const queryBBox: BBox = [10, 10, 20, 20]; // area = 10 x 10 = 100
    const sceneBBox: BBox = [15, 10, 25, 20]; // overlap = [15..20, 10..20] -> 5 x 10 = 50
    const overlap = calculateBBoxOverlap(sceneBBox, queryBBox);
    assert(Math.abs(overlap - 50) < 0.1, `calculateBBoxOverlap returns 50% for half overlap (got ${overlap}%)`);
  }

  // Test 9: Spatial Overlap Calculation - Zero overlap
  {
    const queryBBox: BBox = [10, 10, 20, 20];
    const sceneBBox: BBox = [30, 30, 40, 40];
    const overlap = calculateBBoxOverlap(sceneBBox, queryBBox);
    assert(overlap === 0, 'calculateBBoxOverlap returns 0% for non-overlapping bounding boxes');
  }

  // Test 10: SSRF Asset Domain Security - Safe allowed URLs
  {
    const safeUrl1 = 'https://stac.dataspace.copernicus.eu/v1/assets/thumb.jpg';
    const safeUrl2 = 'https://datahub.creodias.eu/odata/v1/Assets(123)/$value';
    const safeUrl3 = 'https://download.dataspace.copernicus.eu/odata/v1/Products(456)/$value';
    assert(isSafeAssetUrl(safeUrl1), 'isSafeAssetUrl allows stac.dataspace.copernicus.eu');
    assert(isSafeAssetUrl(safeUrl2), 'isSafeAssetUrl allows datahub.creodias.eu');
    assert(isSafeAssetUrl(safeUrl3), 'isSafeAssetUrl allows download.dataspace.copernicus.eu');
  }

  // Test 11: SSRF Asset Domain Security - Blocks unsafe, local, and private URLs
  {
    assert(!isSafeAssetUrl('http://localhost:8080/secret'), 'isSafeAssetUrl blocks localhost');
    assert(!isSafeAssetUrl('http://127.0.0.1/admin'), 'isSafeAssetUrl blocks 127.0.0.1');
    assert(!isSafeAssetUrl('http://169.254.169.254/latest/meta-data'), 'isSafeAssetUrl blocks cloud metadata IP');
    assert(!isSafeAssetUrl('http://192.168.1.1/router'), 'isSafeAssetUrl blocks private 192.168.x IP');
    assert(!isSafeAssetUrl('http://10.0.0.1/internal'), 'isSafeAssetUrl blocks private 10.x IP');
    assert(!isSafeAssetUrl('file:///etc/passwd'), 'isSafeAssetUrl blocks file:// schema');
    assert(!isSafeAssetUrl('https://evil-attacker.com/malware.png'), 'isSafeAssetUrl blocks untrusted third-party domains');
  }

  // Test 12: Deterministic Ranking - Overlap > Cloud Cover > Proximity > Item ID
  {
    const midpoint = new Date('2024-01-10T00:00:00Z').getTime();
    const itemA: NormalizedCatalogItem = {
      itemId: 'ITEM_A',
      collection: 'sentinel-2-l2a',
      modality: 'OPTICAL',
      platform: 'Sentinel-2A',
      acquisitionDateTime: '2024-01-10T12:00:00Z',
      bbox: [10, 10, 20, 20],
      geometry: null,
      cloudCover: 30,
      spatialOverlapPct: 80, // Lower overlap
      thumbnailUrl: null,
      visualUrl: null,
      assets: {},
      provider: 'CDSE'
    };

    const itemB: NormalizedCatalogItem = {
      itemId: 'ITEM_B',
      collection: 'sentinel-2-l2a',
      modality: 'OPTICAL',
      platform: 'Sentinel-2B',
      acquisitionDateTime: '2024-01-09T12:00:00Z',
      bbox: [10, 10, 20, 20],
      geometry: null,
      cloudCover: 5,
      spatialOverlapPct: 100, // Higher overlap -> should rank first
      thumbnailUrl: null,
      visualUrl: null,
      assets: {},
      provider: 'CDSE'
    };

    const itemC: NormalizedCatalogItem = {
      itemId: 'ITEM_C',
      collection: 'sentinel-2-l2a',
      modality: 'OPTICAL',
      platform: 'Sentinel-2A',
      acquisitionDateTime: '2024-01-08T12:00:00Z',
      bbox: [10, 10, 20, 20],
      geometry: null,
      cloudCover: 50, // Same overlap as A, higher cloud -> should rank behind A
      spatialOverlapPct: 80,
      thumbnailUrl: null,
      visualUrl: null,
      assets: {},
      provider: 'CDSE'
    };

    const ranked = rankCatalogItems([itemA, itemB, itemC], midpoint);
    assert(ranked[0].itemId === 'ITEM_B', 'rankCatalogItems prioritizes higher spatial overlap first');
    assert(ranked[1].itemId === 'ITEM_A', 'rankCatalogItems prioritizes lower cloud cover when overlap is equal');
    assert(ranked[2].itemId === 'ITEM_C', 'rankCatalogItems places highest cloud scene last');
  }

  // Test 13: Mock STAC Service Search - Successful Multi-Item Ingestion
  {
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        type: 'FeatureCollection',
        features: [
          {
            id: 'S2_TEST_SCENE_1',
            collection: 'sentinel-2-l2a',
            bbox: [77.4, 12.8, 77.8, 13.2],
            properties: {
              datetime: '2024-01-05T05:30:00Z',
              platform: 'sentinel-2a',
              'eo:cloud_cover': 12.5
            },
            assets: {
              thumbnail: {
                href: 'https://datahub.creodias.eu/odata/v1/Assets(test-thumb)/$value'
              },
              TCI_10m: {
                alternate: {
                  https: {
                    href: 'https://download.dataspace.copernicus.eu/odata/v1/Products(test-prod)/TCI.jp2/$value'
                  }
                }
              }
            }
          }
        ]
      })
    }) as any;

    const service = new STACCatalogService({ fetchFn: mockFetch });
    const response = await service.search({
      bbox: [77.5, 12.9, 77.7, 13.1],
      startDate: '2024-01-01',
      endDate: '2024-01-10',
      collections: ['sentinel-2-l2a']
    });

    assert(response.status === 'success', 'STACCatalogService returns success for valid search');
    assert(response.returnedCount === 1, 'STACCatalogService returns 1 normalized item');
    assert(response.results[0].itemId === 'S2_TEST_SCENE_1', 'STACCatalogService normalizes item ID');
    assert(response.results[0].modality === 'OPTICAL', 'STACCatalogService detects OPTICAL modality');
    assert(response.results[0].thumbnailUrl !== null, 'STACCatalogService extracts safe thumbnail URL');
  }

  // Test 14: Mock STAC Service Search - Truthful Zero Results Handling (No Hallucination)
  {
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        type: 'FeatureCollection',
        features: []
      })
    }) as any;

    const service = new STACCatalogService({ fetchFn: mockFetch });
    const response = await service.search({
      bbox: [77.5, 12.9, 77.7, 13.1],
      startDate: '2024-01-01',
      endDate: '2024-01-10',
      collections: ['sentinel-2-l2a']
    });

    assert(response.status === 'no_results', 'STACCatalogService truthfully returns no_results when no scenes exist');
    assert(response.returnedCount === 0, 'returnedCount is 0 for empty search');
    assert(response.results.length === 0, 'results array is strictly empty (no synthetic hallucinated scenes)');
  }

  // Test 15: Mock STAC Service - Upstream HTTP Error (502)
  {
    const mockFetch = async () => ({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error on CDSE'
    }) as any;

    const service = new STACCatalogService({ fetchFn: mockFetch });
    let caught = false;
    try {
      await service.search({
        bbox: [77.5, 12.9, 77.7, 13.1],
        startDate: '2024-01-01',
        endDate: '2024-01-10'
      });
    } catch (e: any) {
      caught = e instanceof STACUpstreamError && e.statusCode === 502;
    }
    assert(caught, 'STACCatalogService truthfully throws STACUpstreamError (502) on upstream failure');
  }

  // Test 16: Mock STAC Service - Timeout Handling (504)
  {
    const mockFetch = async (_url: string, opts: any) => {
      return new Promise((_, reject) => {
        opts?.signal?.addEventListener('abort', () => {
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    };

    const service = new STACCatalogService({ fetchFn: mockFetch as any, timeoutMs: 50 });
    let caught = false;
    try {
      await service.search({
        bbox: [77.5, 12.9, 77.7, 13.1],
        startDate: '2024-01-01',
        endDate: '2024-01-10'
      });
    } catch (e: any) {
      caught = e instanceof STACUpstreamError && e.statusCode === 504;
    }
    assert(caught, 'STACCatalogService maps AbortError to STACUpstreamError with 504 Gateway Timeout');
  }

  // Test 17: Secondary Client Cloud Cover Filter
  {
    const mockFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        type: 'FeatureCollection',
        features: [
          {
            id: 'S2_HIGH_CLOUD',
            collection: 'sentinel-2-l2a',
            bbox: [77.4, 12.8, 77.8, 13.2],
            properties: { datetime: '2024-01-05T05:30:00Z', 'eo:cloud_cover': 85.0 },
            assets: {}
          },
          {
            id: 'S2_LOW_CLOUD',
            collection: 'sentinel-2-l2a',
            bbox: [77.4, 12.8, 77.8, 13.2],
            properties: { datetime: '2024-01-06T05:30:00Z', 'eo:cloud_cover': 15.0 },
            assets: {}
          }
        ]
      })
    }) as any;

    const service = new STACCatalogService({ fetchFn: mockFetch });
    const response = await service.search({
      bbox: [77.5, 12.9, 77.7, 13.1],
      startDate: '2024-01-01',
      endDate: '2024-01-10',
      maxCloudCover: 20
    });

    assert(response.returnedCount === 1, 'maxCloudCover filters out high cloud scenes');
    assert(response.results[0].itemId === 'S2_LOW_CLOUD', 'Only scene below maxCloudCover threshold is returned');
  }

  // Test 18: Collections Metadata API
  {
    const service = new STACCatalogService();
    const collections = service.getAvailableCollections();
    assert(collections.length === 4, 'getAvailableCollections returns 4 supported Sentinel collections');
    const ids = collections.map((c) => c.id);
    assert(ids.includes('sentinel-2-l2a') && ids.includes('sentinel-1-grd'), 'Includes Sentinel-2 L2A and Sentinel-1 GRD');
  }

  console.log(`\n========================================================`);
  console.log(`PHASE 4 UNIT TESTS COMPLETED: ${passedTests} / ${totalTests} PASSED`);
  console.log(`========================================================\n`);
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
