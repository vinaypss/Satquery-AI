/**
 * SatQuery AI - Evidence Export & Georeferencing Audit Tests
 * SIH26167 | ISRO / Department of Space | Team IMPOSTERS
 *
 * Verifies the geospatial integrity contract:
 *  - Pixel / normalized coordinates are NEVER presented as latitude/longitude.
 *  - GeoJSON is emitted only when valid image georeferencing exists.
 *  - Otherwise image-space JSON is exported and explicitly labeled non-geographic.
 */
import assert from 'node:assert/strict';
import {
  exportAnalysisEvidence,
  isValidGeographicBBox,
  extractBBoxFromString,
  asNormalizedBox,
  projectNormalizedBoxToGeographic
} from './exportEvidence.js';
import type {
  ResultReport,
  InputImageDescriptor
} from '../types/index.js';

let passed = 0;
function check(condition: boolean, msg: string) {
  assert.ok(condition, msg);
  passed++;
  console.log(`  ✓ PASS: ${msg}`);
}

function buildReport(boxes?: Array<Record<string, unknown>>): ResultReport {
  return {
    reportId: 'rpt_export_test_001',
    timestamp: '2026-09-23T00:00:00.000Z',
    query: 'Where are the buildings in this image?',
    status: 'complete',
    parsedQuery: null,
    routingDecision: null,
    specialistOutput: {
      toolId: 'tool_grounding_specialist',
      status: 'complete',
      answerText: 'Buildings detected.',
      evidence: {
        evidenceType: 'bounding_box' as const,
        boxes: (boxes ?? [
          { label: 'building', xmin: 0.1, ymin: 0.2, xmax: 0.6, ymax: 0.8, confidence: 0.93 }
        ]) as Array<{ label: string; xmin: number; ymin: number; xmax: number; ymax: number }>
      },
      executionMetrics: {
        modelName: 'Grounding DINO Tiny',
        durationMs: 10,
        device: 'test-mock'
      }
    },
    provenanceChain: {
      queryParsed: true,
      parsedTaskType: 'grounding',
      parseConfidence: 0.95,
      taskRouted: true,
      selectedToolId: 'tool_grounding_specialist',
      routingStatus: 'routed',
      specialistExecuted: true,
      specialistStatus: 'complete',
      evidenceType: 'bounding_box',
      device: 'test-mock',
      modelName: 'Grounding DINO Tiny',
      inferenceMs: 10,
      evidenceFabricated: false
    },
    errorSummary: null,
    pipelineMetrics: {
      parseMs: 1,
      routeMs: 1,
      executeMs: 10,
      totalMs: 12
    },
    sihCompliance: {
      zeroFabricatedEvidence: true,
      provenanceVerified: true,
      modelAuditRef: 'audit-test'
    }
  };
}

function buildGeoreferencedImage(): InputImageDescriptor {
  return {
    id: 'img_001',
    name: 'sentinel2_bengaluru.tiff',
    modality: 'OPTICAL',
    geographicArea: 'Bengaluru',
    coordinates: [77.5, 12.9, 77.7, 13.1],
    crs: 'EPSG:4326',
    metadata: {
      dimensions: { width: 1024, height: 1024 }
    }
  };
}

async function run() {
  console.log('--- Running SatQuery AI Evidence Export & Georeferencing Audit Tests ---');

  // ─── 1. isValidGeographicBBox validation ─────────────────────────────────
  check(isValidGeographicBBox([77.5, 12.9, 77.7, 13.1]) === true, 'valid WGS84 bbox accepted');
  check(isValidGeographicBBox([-77.5, -13.1, -77.3, -12.9]) === true, 'valid bbox in western/southern hemisphere accepted');
  check(isValidGeographicBBox([77.7, 12.9, 77.5, 13.1]) === false, 'inverted longitude bbox rejected');
  check(isValidGeographicBBox([0, 0, 1, 1]) === false, 'normalized image unit box [0,0,1,1] REJECTED as geographic');
  // Range-valid values CAN be geographic (e.g. equatorial Atlantic). The audit rule is:
  // normalized/pixel coordinates must never be USED as lat/lon — enforced below by the
  // export decision (sections 5–9), which keys off valid image georeferencing, not bare ranges.
  check(isValidGeographicBBox([0.1, 0.2, 0.6, 0.8]) === true, 'range-valid bbox accepted as potentially geographic');
  check(isValidGeographicBBox([77.5, 12.9, 77.7]) === false, 'wrong-length array rejected');
  check(isValidGeographicBBox([77.5, 999, 77.7, 1000]) === false, 'out-of-range latitude rejected');
  check(isValidGeographicBBox([181, 12.9, 182, 13.1]) === false, 'out-of-range longitude rejected');
  check(isValidGeographicBBox([77.9, 13.1, 77.5, 12.9]) === false, 'inverted bbox rejected');
  check(isValidGeographicBBox('string') === false, 'non-array rejected');
  check(isValidGeographicBBox([77.5, 12.9, 77.7, 13.1, 42]) === false, '5-element array rejected');

  // ─── 2. extractBBoxFromString ────────────────────────────────────────────
  const parsed = extractBBoxFromString('BBox: [77.5, 12.9, 77.7, 13.1]');
  check(parsed !== null && parsed.length === 4, 'BBox string parsed');
  check(parsed !== null && parsed[0] === 77.5 && parsed[3] === 13.1, 'BBox string values correct');
  check(extractBBoxFromString('BBox: [0, 0, 1, 1]') === null, 'normalized BBox string rejected');
  check(extractBBoxFromString('no bbox here') === null, 'non-bbox string returns null');

  // ─── 3. asNormalizedBox pixel → normalized conversion ───────────────────
  const dims = { width: 512, height: 512 };
  const pixelToNorm = asNormalizedBox({ xMin: 128, yMin: 64, xMax: 384, yMax: 448 }, dims);
  check(
    Math.abs(pixelToNorm.xMin - 0.25) < 1e-9 &&
      Math.abs(pixelToNorm.yMin - 0.125) < 1e-9 &&
      Math.abs(pixelToNorm.xMax - 0.75) < 1e-9 &&
      Math.abs(pixelToNorm.yMax - 0.875) < 1e-9,
    'pixel coordinates converted to normalized coordinates via image dimensions'
  );
  const alreadyNorm = asNormalizedBox({ xMin: 0.1, yMin: 0.2, xMax: 0.6, yMax: 0.8 }, dims);
  check(alreadyNorm.xMin === 0.1 && alreadyNorm.xMax === 0.6, 'already-normalized box unchanged');
  const noDimsPixel = asNormalizedBox({ xMin: 128, yMin: 64, xMax: 384, yMax: 448 }, undefined);
  check(noDimsPixel.xMax === 1 && noDimsPixel.xMin === 1, 'pixel box without dimensions clamped into [0,1], never emitted as lon/lat');

  // ─── 4. projectNormalizedBoxToGeographic correctness ────────────────────
  const bbox: [number, number, number, number] = [77.5, 12.9, 77.7, 13.1];
  const ring = projectNormalizedBoxToGeographic({ xMin: 0, yMin: 0, xMax: 0.5, yMax: 0.5 }, bbox);
  check(ring.length === 5, 'polygon ring is a closed 5-point ring (RFC 7946)');
  check(
    Math.abs(ring[0][0] - 77.5) < 1e-7 && Math.abs(ring[0][1] - 13.0) < 1e-7,
    'ring[0] = SW corner of projected box (lonLeft, latBottom)'
  );
  check(
    Math.abs(ring[2][0] - 77.6) < 1e-7 && Math.abs(ring[2][1] - 13.1) < 1e-7,
    'ring[2] = NE corner at projected lon/lat midpoint'
  );
  check(
    Math.abs(ring[4][0] - ring[0][0]) < 1e-7 && Math.abs(ring[4][1] - ring[0][1]) < 1e-7,
    'ring closes on the SW corner (ring[4] === ring[0])'
  );
  for (const pt of ring) {
    check(
      pt[0] >= 77.5 && pt[0] <= 77.7 && pt[1] >= 12.9 && pt[1] <= 13.1,
      `projected point [${pt[0]}, ${pt[1]}] stays inside source geographic bbox`
    );
  }

  // ─── 5. GeoJSON export WITH valid georeferencing ────────────────────────
  const geoResult = exportAnalysisEvidence({
    report: buildReport(),
    image: buildGeoreferencedImage()
  });

  check(geoResult.valid === true, 'georeferenced export is valid');
  check(geoResult.exportFormat === 'geojson', 'georeferenced export uses geojson format');
  check(geoResult.isGeographic === true, 'georeferenced export marked isGeographic');
  if (geoResult.exportFormat === 'geojson') {
    check(geoResult.geoJson.type === 'FeatureCollection', 'output is a FeatureCollection');
    check(geoResult.geoJson.crs?.properties.name === 'EPSG:4326', 'CRS is declared as EPSG:4326');
    check(geoResult.geoJson.features.length === 1, 'one feature emitted per grounding box');
    const feature = geoResult.geoJson.features[0];
    check(feature.geometry.type === 'Polygon', 'feature geometry is a Polygon');
    check(feature.properties.isGeographic === true, 'feature properties declare isGeographic: true');
    check(feature.properties.coordinateSystem === 'EPSG:4326', 'feature coordinates are geographic WGS84');
    check(
      feature.geometry.coordinates[0].every(
        (pt) => pt[0] >= 77.5 && pt[0] <= 77.7 && pt[1] >= 12.9 && pt[1] <= 13.1
      ),
      'every GeoJSON vertex lies within the valid geographic bbox (NOT pixel/normalized units)'
    );
    // Grounding box (0.1,0.2)→(0.6,0.8) maps to lon [77.52, 77.62] and lat [12.94, 13.06]
    const sw = feature.geometry.coordinates[0][0];
    check(Math.abs(sw[0] - 77.52) < 1e-6, `projected SW lon ${sw[0]} matches expected 77.52`);
    check(Math.abs(sw[1] - 12.94) < 1e-6, `projected SW lat ${sw[1]} matches expected 12.94`);
  }

  // ─── 6. Pixel-space bbox WITH georeferencing ────────────────────────────
  // A pixel coordinate must be normalized before projection — it must NEVER
  // be written directly as a lon/lat (e.g. a 384px x value must not become lon 384).
  const pixelWithGeo = exportAnalysisEvidence({
    report: buildReport([
      { label: 'roof', xmin: 128, ymin: 64, xmax: 384, ymax: 448, confidence: 0.9 }
    ]),
    image: buildGeoreferencedImage()
  });
  check(pixelWithGeo.exportFormat === 'geojson', 'pixel box with georeferencing still exports as geojson');
  if (pixelWithGeo.exportFormat === 'geojson') {
    const f = pixelWithGeo.geoJson.features[0];
    const vertices = f.geometry.coordinates[0];
    check(
      vertices.every((pt) => pt[0] <= 77.7 && pt[1] <= 13.1),
      'pixel-derived vertices normalised then projected (nothing exceeds the geographic bbox)'
    );
    check(
      Math.abs(vertices[0][0] - 77.525) < 1e-6,
      'pixel x=128 of 1024 projects to lon 77.525 (never treated as an absolute lon)'
    );
  }

  // ─── 7. NO georeferencing → image-space JSON (non-geographic) ───────────
  const nonGeo = exportAnalysisEvidence({
    report: buildReport(),
    image: {
      id: 'img_plain',
      name: 'plain-png.png',
      modality: 'OPTICAL',
      metadata: { dimensions: { width: 800, height: 600 } }
    }
  });
  check(nonGeo.valid === true, 'non-georeferenced export is valid');
  check(nonGeo.exportFormat === 'image_space_json', 'non-georeferenced export uses image_space_json');
  check(nonGeo.isGeographic === false, 'non-georeferenced export marked isGeographic: false');
  check(nonGeo.georeferencing === null, 'georeferencing is null');
  if (nonGeo.exportFormat === 'image_space_json') {
    const result = nonGeo.imageSpaceEvidence;
    check(result.coordinateSystem === 'normalized_image_space', 'coordinate system labeled as normalized_image_space');
    check(result.disclaimer.includes('NON-GEOGRAPHIC'), 'disclaimer explicitly labels evidence as NON-GEOGRAPHIC');
    check(result.disclaimer.includes('NOT geographic latitude or longitude'), 'disclaimer states coords are not lat/lon');
    check(result.sihCompliance.coordinateSystem === 'NON_GEOGRAPHIC_IMAGE_SPACE', 'SIH compliance declares non-geographic CRS');
    check(result.items.length === 1, 'image-space export retains the detection box');
    check(result.items[0].box.xMin === 0.1, 'normalized xmin preserved as 0.1 (unit space, not geographic)');
    check(result.items[0].isGeographic === false, 'each item is flagged non-geographic');
    check(result.items[0].pixelBox === undefined, 'no pixelBox entry when coords were already normalized');
  }

  // ─── 8. Pixel-space box WITHOUT georeferencing ──────────────────────────
  const pixelNoGeo = exportAnalysisEvidence({
    report: buildReport([
      { label: 'roof', xmin: 128, ymin: 64, xmax: 384, ymax: 448, confidence: 0.9 }
    ]),
    image: {
      id: 'img_plain_px',
      name: 'plain-png.png',
      metadata: { dimensions: { width: 512, height: 512 } }
    }
  });
  check(pixelNoGeo.exportFormat === 'image_space_json', 'pixel box without georeferencing stays in image space');
  if (pixelNoGeo.exportFormat === 'image_space_json') {
    check(pixelNoGeo.imageSpaceEvidence.items[0].box.xMin === 0.25, 'pixel box normalized to 0.25 in image-space export');
    check(
      pixelNoGeo.imageSpaceEvidence.items[0].pixelBox?.xMax === 384,
      'original pixel values preserved under pixelBox for transparency'
    );
  }

  // ─── 9. GeoJSON NEVER emitted for non-georeferenced imagery ─────────────
  const noGeoJson = exportAnalysisEvidence({ report: buildReport(), image: null });
  check(noGeoJson.isGeographic === false, 'image with no metadata exports non-geographic');
  check(noGeoJson.exportFormat === 'image_space_json', 'no GeoJSON is fabricated for ungeoreferenced image');

  // ─── 10. georeferencingOverride takes priority ──────────────────────────
  const override = exportAnalysisEvidence({
    report: buildReport(),
    image: null,
    georeferencingOverride: { bbox: [78.0, 14.0, 78.2, 14.2], crs: 'EPSG:4326' }
  });
  check(override.exportFormat === 'geojson', 'explicit georeferencing override enables geojson');
  if (override.exportFormat === 'geojson') {
    check(override.georeferencing.source === 'explicit_override', 'override source recorded in provenance');
    check(override.geoJson.features.length >= 1, 'override GeoJSON feature collection built from source bbox');
  }

  // ─── 11. Invalid override + no image → stays non-geographic ─────────────
  const badOverride = exportAnalysisEvidence({
    report: buildReport(),
    image: null,
    georeferencingOverride: { bbox: [0, 0, 1, 1] }
  });
  check(badOverride.isGeographic === false, 'normalized override [0,0,1,1] rejected and images stays non-geographic');

  // ─── 12. Route-level response body shape (endpoint contract) ────────────
  const contractResult = exportAnalysisEvidence({
    report: buildReport()
  });
  check(
    'valid' in contractResult && 'isGeographic' in contractResult && 'exportFormat' in contractResult,
    'API response contract exposes valid/isGeographic/exportFormat discriminators'
  );

  console.log(`\n  → ${passed} evidence-export audit assertions passed.`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});