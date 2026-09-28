/**
 * SatQuery AI - Stage 2 Remote Sensing Image Ingestion Test Suite
 * Covers mandatory 12 test cases for robust image ingestion.
 */

import { validateRemoteSensingImage } from './imageValidator.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}${detail ? ` - ${detail}` : ''}`);
    failed++;
  }
}

// Helpers to build valid test data URIs
function makeDataUri(mime: string, buffer: Buffer): string {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

// Minimal valid signatures
const PNG_BUFFER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const JPEG_BUFFER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const WEBP_BUFFER = Buffer.from([
  0x52, 0x49, 0x46, 0x46, // 'RIFF'
  0x1a, 0x00, 0x00, 0x00, // file length
  0x57, 0x45, 0x42, 0x50, // 'WEBP'
  0x56, 0x50, 0x38, 0x20  // 'VP8 '
]);
const TIFF_LE_BUFFER = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]); // Little-endian 'II*\0'
const TIFF_BE_BUFFER = Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08]); // Big-endian 'MM\0*'
const CORRUPT_BUFFER = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x12, 0x34, 0x56, 0x78]);

export function runAllTests() {
  console.log('\n--- Running SatQuery AI Stage 2 Image Ingestion Tests ---\n');

  // 1. Valid PNG
  {
    const res = validateRemoteSensingImage({
      name: 'sentinel2_optical.png',
      mimeType: 'image/png',
      dataUri: makeDataUri('image/png', PNG_BUFFER),
      sizeBytes: PNG_BUFFER.length
    });
    assert(res.valid && res.errors.length === 0, '1. Valid PNG accepted');
  }

  // 2. Valid JPEG
  {
    const res = validateRemoteSensingImage({
      name: 'landsat8_scene.jpg',
      mimeType: 'image/jpeg',
      dataUri: makeDataUri('image/jpeg', JPEG_BUFFER),
      sizeBytes: JPEG_BUFFER.length
    });
    assert(res.valid && res.errors.length === 0, '2. Valid JPEG accepted');
  }

  // 3. Valid WEBP
  {
    const res = validateRemoteSensingImage({
      name: 'cartosat_ortho.webp',
      mimeType: 'image/webp',
      dataUri: makeDataUri('image/webp', WEBP_BUFFER),
      sizeBytes: WEBP_BUFFER.length
    });
    assert(res.valid && res.errors.length === 0, '3. Valid WEBP accepted');
  }

  // 4. Valid TIFF signature (both Little-Endian and Big-Endian)
  {
    const resLE = validateRemoteSensingImage({
      name: 'risat1_sar_le.tif',
      mimeType: 'image/tiff',
      dataUri: makeDataUri('image/tiff', TIFF_LE_BUFFER),
      sizeBytes: TIFF_LE_BUFFER.length
    });
    const resBE = validateRemoteSensingImage({
      name: 'sentinel1_sar_be.tiff',
      mimeType: 'image/tiff',
      dataUri: makeDataUri('image/tiff', TIFF_BE_BUFFER),
      sizeBytes: TIFF_BE_BUFFER.length
    });
    assert(
      resLE.valid && resBE.valid && resLE.errors.length === 0 && resBE.errors.length === 0,
      '4. Valid TIFF signature accepted (LE & BE)'
    );
  }

  // 5. Unsupported MIME
  {
    const res = validateRemoteSensingImage({
      name: 'satellite.gif',
      mimeType: 'image/gif',
      dataUri: makeDataUri('image/gif', PNG_BUFFER),
      sizeBytes: PNG_BUFFER.length
    });
    assert(!res.valid && res.errors.some((e) => e.includes('Unsupported MIME')), '5. Unsupported MIME rejected');
  }

  // 6. Unsupported extension
  {
    const res = validateRemoteSensingImage({
      name: 'satellite_data.bmp',
      mimeType: 'image/png',
      dataUri: makeDataUri('image/png', PNG_BUFFER),
      sizeBytes: PNG_BUFFER.length
    });
    assert(!res.valid && res.errors.some((e) => e.includes('Unsupported or missing file extension')), '6. Unsupported extension rejected');
  }

  // 7. Missing image
  {
    const resNull = validateRemoteSensingImage(null);
    const resEmptyObj = validateRemoteSensingImage({});
    assert(!resNull.valid && !resEmptyObj.valid, '7. Missing image rejected');
  }

  // 8. Empty data URI
  {
    const res = validateRemoteSensingImage({
      name: 'empty.png',
      mimeType: 'image/png',
      dataUri: 'data:image/png;base64,',
      sizeBytes: 0
    });
    assert(!res.valid && res.errors.some((e) => e.includes('empty base64 content')), '8. Empty data URI rejected');
  }

  // 9. Invalid base64
  {
    const res = validateRemoteSensingImage({
      name: 'corrupt_b64.png',
      mimeType: 'image/png',
      dataUri: 'data:image/png;base64,???not_valid_b64$$$',
      sizeBytes: 100
    });
    assert(!res.valid && res.errors.some((e) => e.includes('Invalid base64 encoding')), '9. Invalid base64 rejected');
  }

  // 10. Corrupt image signature
  {
    const res = validateRemoteSensingImage({
      name: 'fake_png.png',
      mimeType: 'image/png',
      dataUri: makeDataUri('image/png', CORRUPT_BUFFER),
      sizeBytes: CORRUPT_BUFFER.length
    });
    assert(!res.valid && res.errors.some((e) => e.includes('magic bytes do not match')), '10. Corrupt image signature rejected');
  }

  // 11. File too large
  {
    // Test with custom max size (e.g. 50 bytes)
    const largeBuffer = Buffer.alloc(200, 0x00);
    // write PNG signature at start so signature passes but size fails
    PNG_BUFFER.copy(largeBuffer, 0);

    const res = validateRemoteSensingImage(
      {
        name: 'huge_raster.png',
        mimeType: 'image/png',
        dataUri: makeDataUri('image/png', largeBuffer),
        sizeBytes: largeBuffer.length
      },
      { maxSizeBytes: 50 } // 50 bytes limit for test
    );
    assert(!res.valid && res.errors.some((e) => e.includes('exceeds maximum allowed limit')), '11. File too large rejected');
  }

  // 12. Valid image accepted & metadata preserved (not invented)
  {
    const customMetadata = { sensorModality: 'OPTICAL' as const, crs: 'EPSG:4326' };
    const res = validateRemoteSensingImage({
      id: 'img-custom-001',
      name: 'chandrayaan_optical.png',
      mimeType: 'image/png',
      dataUri: makeDataUri('image/png', PNG_BUFFER),
      sizeBytes: PNG_BUFFER.length,
      metadata: customMetadata
    });

    const hasSanitized = res.valid && res.sanitizedImage?.id === 'img-custom-001';
    const preservedMetadata = res.sanitizedImage?.metadata?.sensorModality === 'OPTICAL';
    assert(
      hasSanitized && preservedMetadata,
      '12. Valid image accepted, sanitized, with user metadata preserved'
    );
  }

  console.log(`\nTest Summary: ${passed} passed, ${failed} failed out of ${passed + failed} total tests.\n`);
  return { passed, failed };
}

const result = runAllTests();
if (result.failed > 0) {
  process.exit(1);
}
