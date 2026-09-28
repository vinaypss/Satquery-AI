import {
  ImageValidationResult,
  RemoteSensingImageInput
} from '../types/index.js';
import { validateFilename } from '../security/inputValidation.js';

export const DEFAULT_MAX_IMAGE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export const SUPPORTED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/tiff',
  'image/tif'
] as const;

export const SUPPORTED_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.tif',
  '.tiff'
] as const;

export interface ImageValidationOptions {
  maxSizeBytes?: number;
}

export type DetectedFormat = 'PNG' | 'JPEG' | 'WEBP' | 'TIFF' | 'UNKNOWN';

/**
 * Detect image signature from initial magic bytes.
 */
export function detectMagicBytes(buffer: Buffer): DetectedFormat {
  if (buffer.length < 4) {
    return 'UNKNOWN';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'PNG';
  }

  // JPEG: FF D8 FF
  if (
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'JPEG';
  }

  // WEBP: 'RIFF' .... 'WEBP'
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && // R
    buffer[1] === 0x49 && // I
    buffer[2] === 0x46 && // F
    buffer[3] === 0x46 && // F
    buffer[8] === 0x57 && // W
    buffer[9] === 0x45 && // E
    buffer[10] === 0x42 && // B
    buffer[11] === 0x50 // P
  ) {
    return 'WEBP';
  }

  // TIFF Little-Endian ("II*\0" => 49 49 2A 00)
  if (
    buffer[0] === 0x49 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x2a &&
    buffer[3] === 0x00
  ) {
    return 'TIFF';
  }

  // TIFF Big-Endian ("MM\0*" => 4D 4D 00 2A)
  if (
    buffer[0] === 0x4d &&
    buffer[1] === 0x4d &&
    buffer[2] === 0x00 &&
    buffer[3] === 0x2a
  ) {
    return 'TIFF';
  }

  return 'UNKNOWN';
}

function normalizeMime(mime: string): string {
  const clean = mime.trim().toLowerCase();
  if (clean === 'image/jpg') return 'image/jpeg';
  if (clean === 'image/tif') return 'image/tiff';
  return clean;
}

function getExpectedFormatFromMime(mime: string): DetectedFormat {
  const norm = normalizeMime(mime);
  if (norm === 'image/png') return 'PNG';
  if (norm === 'image/jpeg') return 'JPEG';
  if (norm === 'image/webp') return 'WEBP';
  if (norm === 'image/tiff') return 'TIFF';
  return 'UNKNOWN';
}

function getExpectedFormatFromExtension(filename: string): DetectedFormat {
  const lower = filename.trim().toLowerCase();
  if (lower.endsWith('.png')) return 'PNG';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'JPEG';
  if (lower.endsWith('.webp')) return 'WEBP';
  if (lower.endsWith('.tif') || lower.endsWith('.tiff')) return 'TIFF';
  return 'UNKNOWN';
}

/**
 * Validates a remote-sensing image input payload.
 * Checks file existence, MIME, extension, data URI, base64 integrity, magic bytes, and size limits.
 */
export function validateRemoteSensingImage(
  input: unknown,
  options: ImageValidationOptions = {}
): ImageValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const maxBytes = options.maxSizeBytes ?? DEFAULT_MAX_IMAGE_SIZE_BYTES;

  // 1. File existence & object structure
  if (!input || typeof input !== 'object') {
    return {
      valid: false,
      errors: ['Image payload is missing or not a valid object.'],
      warnings: []
    };
  }

  const raw = input as Partial<RemoteSensingImageInput>;

  if (!raw.name || typeof raw.name !== 'string' || raw.name.trim().length === 0) {
    errors.push('Image filename is required.');
  }

  if (!raw.mimeType || typeof raw.mimeType !== 'string' || raw.mimeType.trim().length === 0) {
    errors.push('Image MIME type is required.');
  }

  if (!raw.dataUri || typeof raw.dataUri !== 'string' || raw.dataUri.trim().length === 0) {
    errors.push('Image data URI is required.');
  }

  // Fast exit if mandatory fields are missing
  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      warnings
    };
  }

  // 1b. Filename safety (path traversal / control characters / reserved
  // symbols rejected with a generic error; the name is never echoed).
  const filenameError = validateFilename(raw.name);
  if (filenameError) {
    return {
      valid: false,
      errors: [filenameError],
      warnings
    };
  }

  const name = raw.name!.trim();
  const rawMime = raw.mimeType!.trim();
  const normalizedMime = normalizeMime(rawMime);
  const dataUri = raw.dataUri!.trim();

  // 2. MIME type check
  const isSupportedMime = SUPPORTED_MIME_TYPES.some(
    (m) => m.toLowerCase() === rawMime.toLowerCase()
  );
  if (!isSupportedMime) {
    errors.push(
      `Unsupported MIME type "${rawMime}". Supported types: image/png, image/jpeg, image/webp, image/tiff.`
    );
  }

  // 3. File extension check
  const lowerName = name.toLowerCase();
  const hasSupportedExt = SUPPORTED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
  if (!hasSupportedExt) {
    const extMatch = lowerName.lastIndexOf('.') !== -1 ? lowerName.substring(lowerName.lastIndexOf('.')) : 'none';
    errors.push(
      `Unsupported or missing file extension "${extMatch}". Supported extensions: .png, .jpg, .jpeg, .webp, .tif, .tiff.`
    );
  }

  // Extension vs MIME type consistency check
  const extFormat = getExpectedFormatFromExtension(name);
  const mimeFormat = getExpectedFormatFromMime(rawMime);
  if (extFormat !== 'UNKNOWN' && mimeFormat !== 'UNKNOWN' && extFormat !== mimeFormat) {
    warnings.push(
      `MIME type "${rawMime}" (${mimeFormat}) does not match file extension on "${name}" (${extFormat}).`
    );
  }

  // 4. Data URI structure validation
  // Format: data:<mime>;base64,<encoded-data>
  const dataUriMatch = dataUri.match(/^data:([^;,]+)(?:;charset=[^;,]+)?;base64,(.*)$/);
  if (!dataUriMatch) {
    errors.push(
      'Malformed data URI structure. Expected format: "data:<mime-type>;base64,<base64-data>".'
    );
    return {
      valid: false,
      errors,
      warnings
    };
  }

  const uriDeclaredMime = dataUriMatch[1].trim().toLowerCase();
  const base64Data = dataUriMatch[2].trim();

  if (uriDeclaredMime && normalizeMime(uriDeclaredMime) !== normalizedMime) {
    warnings.push(
      `Declared data URI MIME "${uriDeclaredMime}" differs from specified mimeType "${rawMime}".`
    );
  }

  // 5. Empty payload check before decoding
  if (base64Data.length === 0) {
    errors.push('Image data URI contains empty base64 content (0 bytes).');
    return {
      valid: false,
      errors,
      warnings
    };
  }

  // Base64 character set validation
  const base64Regex = /^[A-Za-z0-9+/=_\-\r\n\s]+$/;
  if (!base64Regex.test(base64Data)) {
    errors.push('Invalid base64 encoding: image payload contains illegal characters.');
    return {
      valid: false,
      errors,
      warnings
    };
  }

  // 6. Base64 decoding into Buffer
  let buffer: Buffer;
  try {
    buffer = Buffer.from(base64Data, 'base64');
  } catch {
    errors.push('Failed to decode base64 image data.');
    return {
      valid: false,
      errors,
      warnings
    };
  }

  if (buffer.length === 0) {
    errors.push('Decoded image payload is empty (0 bytes).');
    return {
      valid: false,
      errors,
      warnings
    };
  }

  // 7. File size limit check
  const maxMb = (maxBytes / (1024 * 1024)).toFixed(1);
  if (buffer.length > maxBytes) {
    const actualMb = (buffer.length / (1024 * 1024)).toFixed(2);
    errors.push(
      `File size (${actualMb} MB) exceeds maximum allowed limit of ${maxMb} MB.`
    );
  }

  if (typeof raw.sizeBytes === 'number' && raw.sizeBytes > maxBytes) {
    const claimedMb = (raw.sizeBytes / (1024 * 1024)).toFixed(2);
    if (!errors.some((e) => e.includes('exceeds maximum allowed limit'))) {
      errors.push(
        `Claimed file size (${claimedMb} MB) exceeds maximum allowed limit of ${maxMb} MB.`
      );
    }
  }

  // 8. Magic byte / signature validation
  const detectedSignature = detectMagicBytes(buffer);

  if (detectedSignature === 'UNKNOWN') {
    errors.push(
      'Corrupt or unrecognized image signature: magic bytes do not match any supported format (PNG, JPEG, WEBP, TIFF).'
    );
  } else if (mimeFormat !== 'UNKNOWN' && detectedSignature !== mimeFormat) {
    errors.push(
      `Image signature mismatch: file content has ${detectedSignature} signature but was declared as ${rawMime} (${mimeFormat}).`
    );
  }

  // Return validation result
  const isValid = errors.length === 0;

  if (!isValid) {
    return {
      valid: false,
      errors,
      warnings
    };
  }

  // Construct sanitized input object without fabricating unsupplied metadata
  const sanitizedImage: RemoteSensingImageInput = {
    id: raw.id && typeof raw.id === 'string' ? raw.id : `rs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    mimeType: rawMime,
    sizeBytes: buffer.length,
    dataUri,
    // Preserve metadata only if user provided it; do not invent
    ...(raw.metadata && typeof raw.metadata === 'object'
      ? { metadata: raw.metadata }
      : {})
  };

  return {
    valid: true,
    errors: [],
    warnings,
    sanitizedImage
  };
}
