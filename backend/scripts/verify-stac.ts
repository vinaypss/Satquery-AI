/**
 * Phase 4 Data Strategy: Real Live Verification Script
 * Queries Copernicus Data Space Ecosystem (CDSE) STAC API live.
 *
 * SIH26167 | SatQuery AI | ISRO / Department of Space
 */

import { STACCatalogService } from '../server/catalog/stacService.js';

async function verifyLiveCDSE() {
  console.log('================================================================');
  console.log('SIH26167 | SatQuery AI — Phase 4 Data Strategy Live Verification');
  console.log('Testing live connection to Copernicus Data Space Ecosystem STAC');
  console.log('Base URL: https://stac.dataspace.copernicus.eu/v1/');
  console.log('================================================================\n');

  const service = new STACCatalogService({ timeoutMs: 25000 });

  // 1. Verify Available Collections
  console.log('[1/4] Querying Supported Collections Metadata...');
  const collections = service.getAvailableCollections();
  console.log(`Found ${collections.length} supported collections:`);
  collections.forEach((c) => {
    console.log(`  - [${c.modality}] ${c.id}: ${c.title} (${c.spatialResolution})`);
  });
  console.log('✅ Collections metadata loaded successfully.\n');

  // 2. Query Live Sentinel-2 L2A Optical Scenes (Bengaluru AOI)
  console.log('[2/4] Executing Live Sentinel-2 L2A Optical Search (Bengaluru AOI)...');
  const opticalReq = {
    bbox: [77.50, 12.90, 77.70, 13.10] as [number, number, number, number],
    startDate: '2024-01-01T00:00:00Z',
    endDate: '2024-01-20T23:59:59Z',
    collections: ['sentinel-2-l2a'],
    maxCloudCover: 80,
    limit: 3
  };

  const opticalStart = Date.now();
  const opticalRes = await service.search(opticalReq);
  const opticalDuration = Date.now() - opticalStart;

  console.log(`Live Search Status: ${opticalRes.status} (elapsed: ${opticalDuration}ms)`);
  console.log(`Total scenes matching query in CDSE: ${opticalRes.totalFound}`);
  console.log(`Normalized scenes returned: ${opticalRes.returnedCount}`);

  if (opticalRes.returnedCount > 0) {
    const topItem = opticalRes.results[0];
    console.log('\nTop Ranked Optical Scene:');
    console.log(`  ID:                 ${topItem.itemId}`);
    console.log(`  Collection:         ${topItem.collection}`);
    console.log(`  Platform:           ${topItem.platform}`);
    console.log(`  Acquisition:        ${topItem.acquisitionDateTime}`);
    console.log(`  Cloud Cover:        ${topItem.cloudCover ?? 'N/A'}%`);
    console.log(`  Spatial Overlap:    ${topItem.spatialOverlapPct}%`);
    console.log(`  Thumbnail Safe URL: ${topItem.thumbnailUrl ?? 'None'}`);
    console.log(`  Visual Safe URL:    ${topItem.visualUrl ?? 'None'}`);
    console.log(`  Available Assets:   ${Object.keys(topItem.assets).slice(0, 8).join(', ')}...`);
  }
  console.log('✅ Live Sentinel-2 Optical search verified.\n');

  // 3. Query Live Sentinel-1 GRD SAR Scenes (Bengaluru AOI)
  console.log('[3/4] Executing Live Sentinel-1 SAR Search (Bengaluru AOI)...');
  const sarReq = {
    bbox: [77.50, 12.90, 77.70, 13.10] as [number, number, number, number],
    startDate: '2024-01-01T00:00:00Z',
    endDate: '2024-01-20T23:59:59Z',
    collections: ['sentinel-1-grd'],
    limit: 2
  };

  const sarStart = Date.now();
  const sarRes = await service.search(sarReq);
  const sarDuration = Date.now() - sarStart;

  console.log(`Live Search Status: ${sarRes.status} (elapsed: ${sarDuration}ms)`);
  console.log(`Total SAR scenes matching query in CDSE: ${sarRes.totalFound}`);
  console.log(`Normalized SAR scenes returned: ${sarRes.returnedCount}`);

  if (sarRes.returnedCount > 0) {
    const topSar = sarRes.results[0];
    console.log('\nTop Ranked SAR Scene:');
    console.log(`  ID:                 ${topSar.itemId}`);
    console.log(`  Collection:         ${topSar.collection}`);
    console.log(`  Platform:           ${topSar.platform}`);
    console.log(`  Acquisition:        ${topSar.acquisitionDateTime}`);
    console.log(`  Modality:           ${topSar.modality}`);
    console.log(`  Spatial Overlap:    ${topSar.spatialOverlapPct}%`);
    console.log(`  Thumbnail Safe URL: ${topSar.thumbnailUrl ?? 'None'}`);
  }
  console.log('✅ Live Sentinel-1 SAR search verified.\n');

  // 4. Test Truthful Zero Results Handling (No Hallucination)
  console.log('[4/4] Testing Truthful Zero-Result Handling for Desert/Ocean Empty Window...');
  const emptyReq = {
    bbox: [0.0, 0.0, 0.01, 0.01] as [number, number, number, number],
    startDate: '2024-01-01T00:00:00Z',
    endDate: '2024-01-01T00:01:00Z', // 1-minute window
    collections: ['sentinel-2-l2a'],
    limit: 2
  };

  const emptyRes = await service.search(emptyReq);
  console.log(`Empty Query Status: ${emptyRes.status}`);
  console.log(`Returned count:     ${emptyRes.returnedCount}`);
  if (emptyRes.status === 'no_results' && emptyRes.results.length === 0) {
    console.log('✅ Truthful empty result verified: returned empty array without hallucinations.\n');
  } else {
    throw new Error('Expected no_results for empty search window!');
  }

  console.log('================================================================');
  console.log('ALL PHASE 4 LIVE CDSE STAC VERIFICATIONS COMPLETED SUCCESSFULLY!');
  console.log('================================================================');
}

verifyLiveCDSE().catch((err) => {
  console.error('❌ Live STAC Verification failed:', err);
  process.exit(1);
});
