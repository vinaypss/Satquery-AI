/**
 * SatQuery AI - Strict Input Validation
 * SECURITY PHASE 6: Input Validation + Injection Protection
 *
 * Centralized, server-side validation for every user-controlled input path.
 * Frontend validation (if any) is never trusted; all checks below run on
 * the server before business logic.
 *
 * Verified sink inventory (why each rule exists):
 * - No SQL engine, no shell execution, no eval: SQL/command injection have
 *   no sink, but hostile strings are still rejected-or-neutralized so they
 *   can never reach a future sink or confuse downstream consumers.
 * - No server-side filesystem writes; filenames are validated because they
 *   are echoed in responses and forwarded to Python workers.
 * - Python workers open `path` carriers and fetch http(s) `dataUri`s: the
 *   Node boundary (accessControl.ts) strips/rejects those, and the workers
 *   apply equivalent validation (defense-in-depth, Phase 6).
 * - API responses are JSON consumed by React (which escapes text nodes);
 *   no `dangerouslySetInnerHTML`/`innerHTML` exists in the frontend.
 *
 * Security rule: dangerous input is REJECTED with a generic error, never
 * silently transformed into something different. The rejected value itself
 * is never echoed back (no exploit payloads in errors or logs).
 */

/** Maximum natural-language prompt length (generous for legit queries). */
export const MAX_QUERY_LENGTH = 2000;

/** Maximum filename length. */
export const MAX_FILENAME_LENGTH = 255;

/**
 * Characters/sequences forbidden in user-supplied filenames:
 * path separators, null bytes, ASCII control characters, parent-directory
 * traversal, and Windows-reserved symbols.
 */
const UNSAFE_FILENAME_PATTERN = /[\/\\\x00-\x1F\x7F<>:"|?*]/;
const PARENT_TRAVERSAL_PATTERN = /(^|[\/\\])\.\.([\/\\]|$)/;

export interface QueryValidation {
  ok: boolean;
  value?: string;
  error?: string;
}

/**
 * Strict natural-language prompt validation. Type + presence + length.
 * Content is intentionally NOT allowlisted: prompts are opaque text for a
 * rule-based parser with no shell/SQL/eval sink, so over-blocking would
 * only break legitimate remote-sensing questions.
 */
export function validateQueryText(raw: unknown): QueryValidation {
  if (typeof raw !== 'string') {
    return { ok: false, error: 'Invalid request: "query" must be a string.' };
  }
  const value = raw.trim();
  if (value.length === 0) {
    return { ok: false, error: 'Invalid request: "query" must not be empty.' };
  }
  if (value.length > MAX_QUERY_LENGTH) {
    return {
      ok: false,
      error: `Invalid request: "query" exceeds the maximum length of ${MAX_QUERY_LENGTH} characters.`
    };
  }
  return { ok: true, value };
}

/**
 * Filename safety check. Returns a generic error (the offending name is
 * never echoed). Extension/MIME/content checks stay in imageValidator.
 */
export function validateFilename(name: unknown): string | null {
  if (typeof name !== 'string') {
    return 'Invalid filename: name must be a string.';
  }
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_FILENAME_LENGTH) {
    return 'Invalid filename: name must be 1-255 characters.';
  }
  if (UNSAFE_FILENAME_PATTERN.test(trimmed) || PARENT_TRAVERSAL_PATTERN.test(trimmed)) {
    return 'Unsafe filename: names must not contain path separators, control characters, parent-directory references, or reserved symbols.';
  }
  return null;
}

/**
 * Produces a safe server-side filename from untrusted input (basename +
 * unsafe characters replaced). Provided for any future code path that
 * persists uploads; current code rejects unsafe names instead of storing.
 */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() || 'upload';
  const cleaned = base.replace(/[^\w.\- ]+/g, '_').replace(/^\.+/, '').trim();
  const fallback = cleaned.length > 0 ? cleaned : 'upload';
  return fallback.length > MAX_FILENAME_LENGTH
    ? fallback.slice(0, MAX_FILENAME_LENGTH)
    : fallback;
}

/** Strict allowlist for model-audit task identifiers (prevents ID probing). */
const VALID_TASK_TYPES = [
  'vqa',
  'caption',
  'grounding',
  'segmentation',
  'change_analysis',
  'optical_sar'
] as const;

export type ValidTaskType = (typeof VALID_TASK_TYPES)[number];

/** Returns true only for exact allowlist matches (no coercion, no prefix). */
export function isValidTaskType(value: unknown): value is ValidTaskType {
  return typeof value === 'string' && (VALID_TASK_TYPES as readonly string[]).includes(value);
}

export interface ParsedQueryValidation {
  ok: boolean;
  /** Sanitized copy safe for adapters (string arrays filtered to strings). */
  value?: Record<string, unknown>;
  error?: string;
}

function filterStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((entry): entry is string => typeof entry === 'string');
}

/**
 * Strict shape validation for client-supplied `parsedQuery` objects
 * (execute-task trusts this object, so its shape is enforced here rather
 * than crashing adapters on type confusion). Unknown properties are
 * dropped; non-string array entries are dropped (never transformed).
 */
export function sanitizeParsedQuery(raw: unknown): ParsedQueryValidation {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'Invalid request: "parsedQuery" object is required.' };
  }
  const source = raw as Record<string, unknown>;
  if (typeof source.rawQuery !== 'string' || source.rawQuery.trim().length === 0) {
    return { ok: false, error: 'Invalid request: "parsedQuery.rawQuery" must be a non-empty string.' };
  }
  if (typeof source.taskType !== 'string') {
    return { ok: false, error: 'Invalid request: "parsedQuery.taskType" must be a string.' };
  }

  const value: Record<string, unknown> = {
    rawQuery: source.rawQuery,
    taskType: source.taskType
  };

  if (typeof source.confidence === 'number' && Number.isFinite(source.confidence)) {
    value.confidence = source.confidence;
  }
  const targetFeatures = filterStringArray(source.targetFeatures);
  if (targetFeatures !== null) value.targetFeatures = targetFeatures;
  const requestedObjects = filterStringArray(source.requestedObjects);
  if (requestedObjects !== null) value.requestedObjects = requestedObjects;
  if (typeof source.temporalIntent === 'boolean') value.temporalIntent = source.temporalIntent;
  if (typeof source.comparisonIntent === 'boolean') value.comparisonIntent = source.comparisonIntent;
  if (
    source.modalityIntent === 'optical' ||
    source.modalityIntent === 'sar' ||
    source.modalityIntent === 'optical_sar' ||
    source.modalityIntent === null
  ) {
    value.modalityIntent = source.modalityIntent;
  }
  if (typeof source.requiresMultipleImages === 'boolean') {
    value.requiresMultipleImages = source.requiresMultipleImages;
  }
  if (typeof source.explanation === 'string') {
    value.explanation = source.explanation.slice(0, MAX_QUERY_LENGTH);
  }

  return { ok: true, value };
}
