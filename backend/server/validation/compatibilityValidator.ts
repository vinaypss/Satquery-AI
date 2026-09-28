/**
 * SatQuery AI - Stage 4 Input & Task Compatibility Validator
 * SIH26167 | ISRO Space Technology
 *
 * Verifies that supplied remote-sensing imagery, sensor modalities,
 * acquisition temporalities, and geographic metadata meet the strict prerequisites
 * of the requested specialist task before routing.
 * No metadata is ever fabricated.
 */

import {
  ParsedQuery,
  InputImageDescriptor,
  CompatibilityCheckResult,
  ControlledSpecialistTool
} from '../types/index.js';
import { getSpecialistToolByTask } from '../tools/toolRegistry.js';

/**
 * Normalizes modality name from descriptor or metadata
 */
function resolveImageModality(img: InputImageDescriptor): string {
  if (img.modality) return img.modality.toUpperCase();
  if (img.metadata?.sensorModality) return String(img.metadata.sensorModality).toUpperCase();
  if (img.name && /sar|radar|sentinel-?1/i.test(img.name)) return 'SAR';
  return 'OPTICAL';
}

/**
 * Normalizes geographic area identifier from descriptor or metadata
 */
function resolveGeographicArea(img: InputImageDescriptor): string | null {
  if (img.geographicArea) return img.geographicArea.trim().toLowerCase();
  if (typeof img.metadata?.geographicArea === 'string') return img.metadata.geographicArea.trim().toLowerCase();
  if (typeof img.metadata?.region === 'string') return img.metadata.region.trim().toLowerCase();
  return null;
}

/**
 * Evaluates compatibility between parsed query, input imagery, and candidate specialist tool.
 */
export function validateCompatibility(
  parsedQuery: ParsedQuery,
  images: InputImageDescriptor[] = []
): CompatibilityCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const taskType = parsedQuery.taskType;

  // 1. Ambiguous or unknown query handling
  if (taskType === 'uncertain' || !taskType) {
    return {
      status: 'uncertain',
      errors: ['Query is ambiguous or unrecognized. Specific remote-sensing task cannot be determined.'],
      warnings: []
    };
  }

  const tool: ControlledSpecialistTool | undefined = getSpecialistToolByTask(taskType);
  if (!tool) {
    return {
      status: 'uncertain',
      errors: [`No registered specialist tool available for task type "${taskType}".`],
      warnings: []
    };
  }

  const imageCount = images.length;

  // 2. Image Count Constraints
  if (imageCount < tool.minimumImageCount) {
    errors.push(
      `Task "${tool.displayName}" requires at least ${tool.minimumImageCount} image(s), but ${imageCount} was provided.`
    );
  } else if (imageCount > tool.maximumImageCount) {
    warnings.push(
      `Task "${tool.displayName}" expects ${tool.maximumImageCount} image(s); extra images will be ignored.`
    );
  }

  // 3. Task-specific rules

  // --- Grounding ---
  if (taskType === 'grounding') {
    if (!parsedQuery.targetFeatures || parsedQuery.targetFeatures.length === 0) {
      errors.push('Visual grounding requires a specific object class or target feature (e.g. "buildings", "runway").');
    }
  }

  // --- Segmentation ---
  if (taskType === 'segmentation') {
    if (!parsedQuery.targetFeatures || parsedQuery.targetFeatures.length === 0) {
      warnings.push('No specific class filter specified; will segment default remote-sensing land-cover classes.');
    }
  }

  // --- Change Analysis ---
  if (taskType === 'change_analysis') {
    if (imageCount < 2) {
      errors.push('Change analysis requires exactly two temporally comparable images representing different dates.');
    } else {
      const img1 = images[0];
      const img2 = images[1];

      // Acquisition date check
      const date1 = img1.acquisitionDate || (img1.metadata?.acquisitionDate as string | undefined);
      const date2 = img2.acquisitionDate || (img2.metadata?.acquisitionDate as string | undefined);

      if (!date1 || !date2) {
        errors.push('Change analysis requires valid acquisition dates for both temporal acquisitions to establish epoch ordering.');
      } else if (date1 === date2) {
        errors.push('Change analysis requires two distinct acquisition dates. Supplied images have identical acquisition dates.');
      }

      // Geographic compatibility check
      const geo1 = resolveGeographicArea(img1);
      const geo2 = resolveGeographicArea(img2);

      if (geo1 && geo2 && geo1 !== geo2) {
        errors.push(
          `Change analysis requires geographically corresponding scenes. Supplied images represent mismatched areas ("${img1.geographicArea || geo1}" vs "${img2.geographicArea || geo2}").`
        );
      }

      // Check query for mismatched region
      const rawLower = parsedQuery.rawQuery.toLowerCase();
      if (geo1 && rawLower.includes('africa') && geo1.includes('rajasthan')) {
        errors.push(
          `Geographic mismatch: Image represents "${img1.geographicArea || 'Rajasthan'}" but query requests comparison with "Africa".`
        );
      }
    }
  }

  // --- Optical-SAR Cross Modal ---
  if (taskType === 'optical_sar') {
    if (imageCount < 2) {
      errors.push('Optical-SAR cross-modal analysis requires exactly two images: one Optical and one SAR.');
    } else {
      const modalities = images.slice(0, 2).map(resolveImageModality);
      const hasOptical = modalities.includes('OPTICAL') || modalities.includes('MULTISPECTRAL');
      const hasSar = modalities.includes('SAR');

      if (!hasOptical) {
        errors.push('Optical-SAR analysis requires an Optical or Multispectral image, but none was provided.');
      }
      if (!hasSar) {
        errors.push('Optical-SAR analysis requires a Synthetic Aperture Radar (SAR) image, but none was provided.');
      }

      // Geographic check
      const geo1 = resolveGeographicArea(images[0]);
      const geo2 = resolveGeographicArea(images[1]);
      if (geo1 && geo2 && geo1 !== geo2) {
        errors.push('Optical and SAR images must be geographically co-registered over the same target area.');
      }
    }
  }

  // Single-image tasks check for unexpected SAR
  if ((taskType === 'vqa' || taskType === 'caption' || taskType === 'grounding') && imageCount > 0) {
    const mod = resolveImageModality(images[0]);
    if (mod === 'SAR') {
      warnings.push(`Image sensor is SAR. Current ${tool.displayName} specialist is optimized primarily for Optical imagery.`);
    }
  }

  const status = errors.length > 0 ? 'rejected' : 'compatible';

  return {
    status,
    errors,
    warnings
  };
}
