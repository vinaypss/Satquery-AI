/**
 * SatQuery AI - Stage 3 Natural-Language Query Understanding Module
 * SIH26167 | ISRO Space Technology
 *
 * Deterministic, rule-based query parser that transforms natural-language
 * remote-sensing queries into structured task representations for agentic routing.
 * No external AI model calls or hallucinations.
 */

import { ParsedQuery, ParsedQueryTaskType, QueryParseResult } from '../types/index.js';

// Generic ambiguous phrases that lack remote-sensing analytical substance
const AMBIGUOUS_PATTERNS = [
  /^do this$/i,
  /^analyze it$/i,
  /^analyze$/i,
  /^find the object$/i,
  /^tell me something$/i,
  /^hello$/i,
  /^hi$/i,
  /^test$/i,
  /^what about this$/i,
  /^run analysis$/i,
  /^help$/i,
  /^something$/i,
  /^it$/i
];

/**
 * Normalizes query string: trims, collapses multi-spaces, removes edge punctuation
 */
export function normalizeQuery(query: string): string {
  return query
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Strips common punctuation from text for token-matching purposes
 */
function cleanPunctuation(text: string): string {
  return text.replace(/[?!.,;:"'()[\]{}]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Extracts specific object/feature targets from user queries.
 * Strips leading task verbs and trailing filler phrases.
 */
export function extractTargetFeatures(cleanLower: string): string[] {
  let target = cleanPunctuation(cleanLower).toLowerCase();

  // Strip common query prefix trigger phrases
  const prefixes = [
    /^where (are|is) (the|all|any)?\s*/i,
    /^locate (the|all|any)?\s*/i,
    /^find (the|all|any)?\s*/i,
    /^pinpoint (the|all|any)?\s*/i,
    /^show (where|the|all)?\s*/i,
    /^detect (the|all|any)?\s*/i,
    /^segment (the|all|any)?\s*/i,
    /^delineate (the|all|any)?\s*/i,
    /^extract regions for (the|all)?\s*/i,
    /^mask (the|all|any)?\s*/i,
    /^are there (any|the)?\s*/i,
    /^is there (a|an|any)?\s*/i,
    /^does the image contain (any|a|an)?\s*/i,
    /^how many\s*/i,
    /^what is the count of\s*/i
  ];

  for (const prefix of prefixes) {
    if (prefix.test(target)) {
      target = target.replace(prefix, '').trim();
      break;
    }
  }

  // Strip trailing context phrases
  target = target
    .replace(/\s+(in this image|in the image|in this satellite image|in the scene|here|visible|present)$/i, '')
    .trim();

  // If the extracted target is empty or a generic pronoun/placeholder, do not treat as a valid target
  const nonTargets = [
    'it',
    'this',
    'something',
    'object',
    'the object',
    'image',
    'scene',
    'satellite image',
    'anything'
  ];

  if (!target || nonTargets.includes(target.toLowerCase())) {
    return [];
  }

  return [target.toLowerCase()];
}

/**
 * Deterministic query parser for SatQuery AI.
 */
export function parseQuery(queryInput: unknown): QueryParseResult {
  // 1. Validation: reject empty or non-string queries
  if (typeof queryInput !== 'string') {
    return {
      valid: false,
      error: 'Query must be a valid string.'
    };
  }

  const rawQuery = normalizeQuery(queryInput);
  if (rawQuery.length === 0) {
    return {
      valid: false,
      error: 'Query cannot be empty or whitespace-only.'
    };
  }

  const cleanNoPunct = cleanPunctuation(rawQuery).toLowerCase();
  const lowerQuery = rawQuery.toLowerCase();

  // 2. Ambiguity check: detect overly vague requests
  for (const pattern of AMBIGUOUS_PATTERNS) {
    if (pattern.test(cleanNoPunct)) {
      return {
        valid: true,
        parsedQuery: {
          rawQuery,
          taskType: 'uncertain',
          confidence: 0.2,
          targetFeatures: [],
          requestedObjects: [],
          temporalIntent: false,
          comparisonIntent: false,
          modalityIntent: null,
          requiresMultipleImages: false,
          explanation: 'Query is ambiguous. Please specify what you want to analyze.'
        }
      };
    }
  }

  // Check for Optical + SAR cross-modal queries
  const isOpticalSar =
    /optical.*(and|\+|vs|with).*sar/i.test(lowerQuery) ||
    /sar.*(and|\+|vs|with).*optical/i.test(lowerQuery) ||
    /radar.*(and|\+|vs|with).*optical/i.test(lowerQuery) ||
    /optical.*(and|\+|vs|with).*radar/i.test(lowerQuery) ||
    /\boptical_sar\b/i.test(lowerQuery);

  if (isOpticalSar) {
    const targets = extractTargetFeatures(cleanNoPunct);
    return {
      valid: true,
      parsedQuery: {
        rawQuery,
        taskType: 'optical_sar',
        confidence: 0.95,
        targetFeatures: targets,
        requestedObjects: targets,
        temporalIntent: false,
        comparisonIntent: true,
        modalityIntent: 'optical_sar',
        requiresMultipleImages: true,
        explanation: 'The query requests cross-modal analysis comparing optical and SAR/radar imagery.'
      }
    };
  }

  // Check for Change Analysis queries
  const isChangeAnalysis =
    /\b(changed?|changes|difference|differences|diff)\b/i.test(cleanNoPunct) ||
    /before\s+and\s+after/i.test(lowerQuery) ||
    /between\s+(these|the|two)\s+(images|scenes|rasters)/i.test(lowerQuery) ||
    /between\s+(the\s+)?\d{4}\s+and\s+(the\s+)?\d{4}/i.test(lowerQuery) ||
    /\b(temporal|urban growth|deforestation over time)\b/i.test(lowerQuery) ||
    /has this area become/i.test(lowerQuery);

  if (isChangeAnalysis) {
    const targets = extractTargetFeatures(cleanNoPunct);
    return {
      valid: true,
      parsedQuery: {
        rawQuery,
        taskType: 'change_analysis',
        confidence: 0.95,
        targetFeatures: targets,
        requestedObjects: targets,
        temporalIntent: true,
        comparisonIntent: true,
        modalityIntent: null,
        requiresMultipleImages: true,
        explanation: 'The query requests bi-temporal change analysis between multi-temporal images.'
      }
    };
  }

  // Check for Segmentation queries
  const isSegmentation =
    /\b(segment|segmentation|segments|delineate|delineation|pixel-wise|pixelwise|mask|masks)\b/i.test(cleanNoPunct) ||
    /extract\s+regions?/i.test(lowerQuery) ||
    /land-cover\s+map/i.test(lowerQuery);

  if (isSegmentation) {
    const targets = extractTargetFeatures(cleanNoPunct);
    return {
      valid: true,
      parsedQuery: {
        rawQuery,
        taskType: 'segmentation',
        confidence: 0.95,
        targetFeatures: targets,
        requestedObjects: targets,
        temporalIntent: false,
        comparisonIntent: false,
        modalityIntent: null,
        requiresMultipleImages: false,
        explanation: 'The query requests spatial pixel-wise segmentation masks for specified classes.'
      }
    };
  }

  // Check for Grounding / Localization queries
  const isGrounding =
    /\b(where are|where is|locate|find|pinpoint|bounding box|bounding region|show where)\b/i.test(cleanNoPunct) ||
    /^detect\b/i.test(cleanNoPunct);

  if (isGrounding) {
    const targets = extractTargetFeatures(cleanNoPunct);
    return {
      valid: true,
      parsedQuery: {
        rawQuery,
        taskType: 'grounding',
        confidence: 0.95,
        targetFeatures: targets,
        requestedObjects: targets,
        temporalIntent: false,
        comparisonIntent: false,
        modalityIntent: null,
        requiresMultipleImages: false,
        explanation: 'The query asks for the location of a specific object class.'
      }
    };
  }

  // Check for Caption / Scene description queries
  const isCaption =
    /\b(describe|caption|summarize|summary|overview)\b/i.test(cleanNoPunct) ||
    /tell me about this image/i.test(lowerQuery) ||
    /what is in this (satellite )?image/i.test(lowerQuery);

  if (isCaption) {
    return {
      valid: true,
      parsedQuery: {
        rawQuery,
        taskType: 'caption',
        confidence: 0.95,
        targetFeatures: [],
        requestedObjects: [],
        temporalIntent: false,
        comparisonIntent: false,
        modalityIntent: null,
        requiresMultipleImages: false,
        explanation: 'The query requests a scene-level textual summary of the remote-sensing imagery.'
      }
    };
  }

  // Check for VQA queries
  const isVqa =
    /\b(what is|what are|are there|is there|does the image contain|how many|can you see|identify)\b/i.test(cleanNoPunct) ||
    cleanNoPunct.endsWith('?') ||
    cleanNoPunct.startsWith('what') ||
    cleanNoPunct.startsWith('how') ||
    cleanNoPunct.startsWith('is') ||
    cleanNoPunct.startsWith('are');

  if (isVqa) {
    const targets = extractTargetFeatures(cleanNoPunct);
    return {
      valid: true,
      parsedQuery: {
        rawQuery,
        taskType: 'vqa',
        confidence: 0.9,
        targetFeatures: targets,
        requestedObjects: targets,
        temporalIntent: false,
        comparisonIntent: false,
        modalityIntent: null,
        requiresMultipleImages: false,
        explanation: 'The query asks a visual question regarding visual contents or features in the image.'
      }
    };
  }

  // If query does not match any recognized remote sensing pattern, return uncertain
  return {
    valid: true,
    parsedQuery: {
      rawQuery,
      taskType: 'uncertain',
      confidence: 0.25,
      targetFeatures: [],
      requestedObjects: [],
      temporalIntent: false,
      comparisonIntent: false,
      modalityIntent: null,
      requiresMultipleImages: false,
      explanation: 'Query is ambiguous. Please specify what you want to analyze.'
    }
  };
}
