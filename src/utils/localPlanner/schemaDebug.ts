/**
 * Planner schema repair and validation debug helpers.
 */

import { z } from 'zod';
import {
  METERS,
  REGISTER_BIASES,
  TEXTURES,
  MusicPlanSchema,
  MusicPlanBoundarySchema,
  BOUNDARY_SEMANTIC_DEFAULTS,
  type PlannerMeter,
  type PlannerRegisterBias,
  type PlannerTexture,
  defaultMusicPlan,
  clampMusicPlan,
  type PlannerMusicPlan,
} from './schema.js';

export const SCHEMA_FIELD_KEYS = [
  'prompt', 'style', 'mood', 'tempoBpm', 'meter', 'keyCenter', 'scaleType',
  'phraseBars', 'totalBars', 'rhythmDensity', 'restDensity', 'syncopation',
  'harmonicComplexity', 'repetition', 'variation', 'consonance', 'melodicRange',
  'leapRate', 'motifShape', 'articulation', 'dynamics', 'texture', 'registerBias',
  'percussionEnergy', 'notes',
] as const;

export interface PlannerParseDebug {
  rawContent?: string;
  parsedJson?: unknown;
  repairedJson?: unknown;
  validationErrors?: string[];
  failedFields?: string[];
  primaryFailureField?: string;
  repairActions?: string[];
  retryAttempted?: boolean;
  retryPromptSize?: number;
  retryRawContent?: string;
  retrySucceeded?: boolean;
  injectedDefaults?: Record<string, string | string[]>;
}

export type PlannerParseResult =
  | { ok: true; plan: PlannerMusicPlan; debug: PlannerParseDebug }
  | { ok: false; debug: PlannerParseDebug };

const PITCH_RE = /^[A-Ga-g](?:#|b)?-?\d$/;

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function clampNumber(value: unknown, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return (min + max) / 2;
  return clamp(n, min, max);
}

function clampInt(value: unknown, min: number, max: number): number {
  return Math.round(clampNumber(value, min, max));
}

function normalizeKey(key: string): string {
  const m = key.trim().match(/^([A-Ga-g])([#b]?)/);
  if (!m) return 'C';
  return `${m[1].toUpperCase()}${m[2] === 'b' ? 'b' : m[2]}`;
}

function normalizePitch(pitch: string, fallback: string): string {
  const trimmed = pitch.trim();
  if (!PITCH_RE.test(trimmed)) return fallback;
  const m = trimmed.match(/^([A-Ga-g])([#b]?)-?(\d)$/);
  if (!m) return fallback;
  return `${m[1].toUpperCase()}${m[2]}${m[3]}`;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '').replace(/and/g, '+');
}

function coerceEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): { value: T; coerced: boolean } {
  if (typeof value !== 'string') return { value: fallback, coerced: value !== undefined };
  const trimmed = value.trim();
  if (!trimmed) return { value: fallback, coerced: true };

  const exact = allowed.find((item) => item.toLowerCase() === trimmed.toLowerCase());
  if (exact) return { value: exact, coerced: exact !== trimmed };

  const token = normalizeToken(trimmed);
  const fuzzy = allowed.find((item) => normalizeToken(item) === token);
  if (fuzzy) return { value: fuzzy, coerced: true };

  return { value: fallback, coerced: true };
}

/** Extract JSON from raw Ollama content (plain JSON, markdown fences, or double-encoded string). */
export function extractJsonFromString(content: string): { value: unknown; action?: string } | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  const candidates: string[] = [trimmed];

  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  if (fenceMatch?.[1]) candidates.unshift(fenceMatch[1].trim());

  const braceStart = trimmed.indexOf('{');
  const braceEnd = trimmed.lastIndexOf('}');
  if (braceStart >= 0 && braceEnd > braceStart) {
    candidates.push(trimmed.slice(braceStart, braceEnd + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (typeof parsed === 'string' && parsed.trim().startsWith('{')) {
        try {
          return { value: JSON.parse(parsed) as unknown, action: 'parsed double-encoded JSON string' };
        } catch {
          continue;
        }
      }
      return { value: parsed };
    } catch {
      // try next candidate
    }
  }

  return null;
}

export function formatZodValidationErrors(error: z.ZodError): {
  messages: string[];
  fields: string[];
  primaryField?: string;
} {
  const fieldCounts = new Map<string, number>();
  const messages: string[] = [];

  for (const issue of error.issues) {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    fieldCounts.set(path, (fieldCounts.get(path) ?? 0) + 1);
    const received = 'received' in issue ? ` (received: ${JSON.stringify(issue.received)})` : '';
    messages.push(`${path}: ${issue.message}${received}`);
  }

  const fields = [...fieldCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([field]) => field);

  return {
    messages,
    fields,
    primaryField: fields[0],
  };
}

function stripUnknownFields(obj: Record<string, unknown>): { stripped: Record<string, unknown>; removed: string[] } {
  const allowed = new Set<string>(SCHEMA_FIELD_KEYS);
  const stripped: Record<string, unknown> = {};
  const removed: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (allowed.has(key)) stripped[key] = value;
    else removed.push(key);
  }
  return { stripped, removed };
}

const SEMANTIC_BOUNDARY_FIELDS = new Set([
  'style', 'scaleType', 'motifShape', 'articulation', 'dynamics', 'mood',
]);

const NUMERIC_01 = [
  'rhythmDensity', 'restDensity', 'syncopation', 'harmonicComplexity',
  'repetition', 'variation', 'consonance', 'leapRate', 'percussionEnergy',
] as const;

/** Coerce enums, numbers, and shapes; fill safe defaults; strip unknown fields. */
export function repairMusicPlanRaw(
  raw: unknown,
  promptFallback: string,
): { repaired: Record<string, unknown>; actions: string[] } {
  const actions: string[] = [];
  const defaults = defaultMusicPlan(promptFallback);

  if (typeof raw !== 'object' || raw === null) {
    actions.push('non-object response replaced with defaults shell');
    return { repaired: { prompt: promptFallback || defaults.prompt }, actions };
  }

  const { stripped, removed } = stripUnknownFields(raw as Record<string, unknown>);
  if (removed.length > 0) actions.push(`stripped unknown fields: ${removed.join(', ')}`);

  const obj: Record<string, unknown> = { ...stripped };

  if (!obj.prompt && promptFallback) {
    obj.prompt = promptFallback;
    actions.push('filled missing prompt from request');
  }

  if (typeof obj.mood === 'string') {
    obj.mood = [obj.mood];
    actions.push('coerced mood string to array');
  }
  if (Array.isArray(obj.mood)) {
    const mood = obj.mood.filter((m) => typeof m === 'string' && m.trim().length > 0) as string[];
    obj.mood = mood;
    if (mood.length === 0) {
      actions.push('passed empty mood array to boundary normalization');
    }
  }

  for (const field of NUMERIC_01) {
    if (obj[field] !== undefined) {
      const before = obj[field];
      obj[field] = clampNumber(obj[field], 0, 1);
      if (before !== obj[field]) actions.push(`coerced ${field} to 0..1`);
    }
  }

  if (obj.tempoBpm !== undefined) {
    const before = obj.tempoBpm;
    obj.tempoBpm = clampInt(obj.tempoBpm, 40, 220);
    if (before !== obj.tempoBpm) actions.push('coerced tempoBpm to integer range 40..220');
  }

  if (obj.phraseBars !== undefined) obj.phraseBars = clampInt(obj.phraseBars, 1, 16);
  if (obj.totalBars !== undefined) obj.totalBars = clampInt(obj.totalBars, 1, 64);

  if (typeof obj.keyCenter === 'string') obj.keyCenter = normalizeKey(obj.keyCenter);

  if (obj.meter !== undefined) {
    const meter = coerceEnum(obj.meter, METERS, '4/4');
    obj.meter = meter.value;
    if (meter.coerced) actions.push(`coerced meter to "${meter.value}"`);
  }

  if (obj.texture !== undefined) {
    const texture = coerceEnum(obj.texture, TEXTURES, 'melody+chords');
    obj.texture = texture.value;
    if (texture.coerced) actions.push(`coerced texture to "${texture.value}"`);
  }

  if (obj.registerBias !== undefined) {
    const registerBias = coerceEnum(obj.registerBias, REGISTER_BIASES, 'mid');
    obj.registerBias = registerBias.value;
    if (registerBias.coerced) actions.push(`coerced registerBias to "${registerBias.value}"`);
  }

  if (obj.melodicRange !== undefined) {
    if (typeof obj.melodicRange === 'object' && obj.melodicRange !== null) {
      const range = obj.melodicRange as Record<string, unknown>;
      obj.melodicRange = {
        min: typeof range.min === 'string' ? normalizePitch(range.min, defaults.melodicRange.min) : defaults.melodicRange.min,
        max: typeof range.max === 'string' ? normalizePitch(range.max, defaults.melodicRange.max) : defaults.melodicRange.max,
      };
      actions.push('normalized melodicRange pitches');
    } else {
      obj.melodicRange = defaults.melodicRange;
      actions.push('replaced invalid melodicRange with default');
    }
  }

  if (!Array.isArray(obj.notes)) {
    obj.notes = [];
    if (obj.notes !== undefined) actions.push('replaced invalid notes with empty array');
  }

  for (const key of SCHEMA_FIELD_KEYS) {
    if (obj[key] === undefined && key in defaults && !SEMANTIC_BOUNDARY_FIELDS.has(key)) {
      obj[key] = (defaults as Record<string, unknown>)[key];
      actions.push(`filled missing ${key} with default`);
    }
  }

  for (const field of ['style', 'scaleType', 'motifShape', 'articulation', 'dynamics'] as const) {
    if (typeof obj[field] === 'number') {
      obj[field] = String(obj[field]);
      actions.push(`coerced ${field} number to string`);
    }
  }

  return { repaired: obj, actions };
}

function isEmptyString(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim().length === 0);
}

/** Convert permissive boundary values into strict internal defaults; record injections. */
export function normalizeBoundarySemantics(
  boundary: Record<string, unknown>,
): { normalized: Record<string, unknown>; injectedDefaults: Record<string, string | string[]>; actions: string[] } {
  const normalized = { ...boundary };
  const injectedDefaults: Record<string, string | string[]> = {};
  const actions: string[] = [];

  for (const field of ['style', 'scaleType', 'motifShape', 'articulation', 'dynamics'] as const) {
    if (isEmptyString(normalized[field])) {
      const defaultValue = BOUNDARY_SEMANTIC_DEFAULTS[field];
      normalized[field] = defaultValue;
      injectedDefaults[field] = defaultValue;
      actions.push(`injected default for ${field}: "${defaultValue}"`);
    }
  }

  if (typeof normalized.mood === 'string') {
    normalized.mood = [normalized.mood];
  }
  if (Array.isArray(normalized.mood)) {
    const mood = normalized.mood.filter((m) => typeof m === 'string' && m.trim().length > 0) as string[];
    if (mood.length === 0) {
      normalized.mood = [...BOUNDARY_SEMANTIC_DEFAULTS.mood];
      injectedDefaults.mood = [...BOUNDARY_SEMANTIC_DEFAULTS.mood];
      actions.push('injected default for mood: ["neutral"]');
    } else {
      normalized.mood = mood;
    }
  } else {
    normalized.mood = [...BOUNDARY_SEMANTIC_DEFAULTS.mood];
    injectedDefaults.mood = [...BOUNDARY_SEMANTIC_DEFAULTS.mood];
    actions.push('injected default for mood: ["neutral"]');
  }

  return { normalized, injectedDefaults, actions };
}

function prepRaw(raw: Record<string, unknown>, promptFallback: string): Record<string, unknown> {
  const obj = { ...raw };
  if (!obj.prompt && promptFallback) obj.prompt = promptFallback;
  if (typeof obj.mood === 'string') obj.mood = [obj.mood];
  if (Array.isArray(obj.mood)) {
    obj.mood = obj.mood.filter((m) => typeof m === 'string' && m.trim().length > 0);
  }
  for (const field of NUMERIC_01) {
    if (obj[field] !== undefined) obj[field] = clampNumber(obj[field], 0, 1);
  }
  if (obj.tempoBpm !== undefined) obj.tempoBpm = clampNumber(obj.tempoBpm, 40, 220);
  if (obj.phraseBars !== undefined) obj.phraseBars = clampInt(obj.phraseBars, 1, 16);
  if (obj.totalBars !== undefined) obj.totalBars = clampInt(obj.totalBars, 1, 64);
  if (typeof obj.keyCenter === 'string') obj.keyCenter = normalizeKey(obj.keyCenter);
  if (!METERS.includes(obj.meter as PlannerMeter)) obj.meter = '4/4';
  if (!TEXTURES.includes(obj.texture as PlannerTexture)) obj.texture = 'melody+chords';
  if (!REGISTER_BIASES.includes(obj.registerBias as PlannerRegisterBias)) obj.registerBias = 'mid';
  if (!Array.isArray(obj.notes)) obj.notes = [];
  return obj;
}

function parseThroughPipeline(
  prepped: Record<string, unknown>,
): {
  ok: true;
  plan: PlannerMusicPlan;
  injectedDefaults: Record<string, string | string[]>;
  actions: string[];
} | {
  ok: false;
  boundaryError?: z.ZodError;
  strictError?: z.ZodError;
  injectedDefaults: Record<string, string | string[]>;
  actions: string[];
} {
  const boundaryResult = MusicPlanBoundarySchema.safeParse(prepped);
  if (!boundaryResult.success) {
    return { ok: false, boundaryError: boundaryResult.error, injectedDefaults: {}, actions: [] };
  }

  const { normalized, injectedDefaults, actions } = normalizeBoundarySemantics(
    boundaryResult.data as Record<string, unknown>,
  );
  const strictResult = MusicPlanSchema.safeParse(normalized);
  if (strictResult.success) {
    return {
      ok: true,
      plan: strictResult.data,
      injectedDefaults,
      actions,
    };
  }

  return {
    ok: false,
    strictError: strictResult.error,
    injectedDefaults,
    actions,
  };
}

export function tryNormalizeMusicPlan(
  raw: unknown,
  promptFallback = '',
  rawContent?: string,
): PlannerParseResult {
  const debug: PlannerParseDebug = {};
  if (rawContent !== undefined) debug.rawContent = rawContent;

  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    debug.rawContent = raw;
    const extracted = extractJsonFromString(raw);
    if (!extracted) {
      debug.validationErrors = ['Response was not valid JSON'];
      return { ok: false, debug };
    }
    parsed = extracted.value;
    if (extracted.action) debug.repairActions = [extracted.action];
    debug.parsedJson = parsed;
  } else {
    debug.parsedJson = parsed;
  }

  const { repaired, actions } = repairMusicPlanRaw(parsed, promptFallback);
  debug.repairedJson = repaired;
  debug.repairActions = [...(debug.repairActions ?? []), ...actions];

  const prepped = prepRaw(repaired, promptFallback);
  const pipeline = parseThroughPipeline(prepped);
  if (pipeline.ok) {
    if (Object.keys(pipeline.injectedDefaults).length > 0) {
      debug.injectedDefaults = pipeline.injectedDefaults;
    }
    debug.repairActions = [...(debug.repairActions ?? []), ...pipeline.actions];
    return {
      ok: true,
      plan: clampMusicPlan(pipeline.plan, promptFallback),
      debug,
    };
  }

  const merged = prepRaw(
    { ...defaultMusicPlan(promptFallback), ...prepped },
    promptFallback,
  );
  const mergedPipeline = parseThroughPipeline(merged);
  if (mergedPipeline.ok) {
    debug.repairActions?.push('merged remaining gaps with defaults before strict validation');
    debug.repairActions = [...(debug.repairActions ?? []), ...mergedPipeline.actions];
    if (Object.keys(mergedPipeline.injectedDefaults).length > 0) {
      debug.injectedDefaults = {
        ...(debug.injectedDefaults ?? {}),
        ...mergedPipeline.injectedDefaults,
      };
    }
    return {
      ok: true,
      plan: clampMusicPlan(mergedPipeline.plan, promptFallback),
      debug,
    };
  }

  const error = pipeline.boundaryError ?? pipeline.strictError ?? mergedPipeline.boundaryError ?? mergedPipeline.strictError;
  const formatted = formatZodValidationErrors(error!);
  debug.validationErrors = formatted.messages;
  debug.failedFields = formatted.fields;
  debug.primaryFailureField = formatted.primaryField;

  return { ok: false, debug };
}

/** Coerce enums and shapes before validation; never throws. */
export function normalizeMusicPlan(raw: unknown, promptFallback = ''): PlannerMusicPlan {
  const result = tryNormalizeMusicPlan(raw, promptFallback);
  if (result.ok) return result.plan;
  const merged = tryNormalizeMusicPlan(
    { ...defaultMusicPlan(promptFallback), ...(result.debug.repairedJson as object ?? {}) },
    promptFallback,
  );
  if (merged.ok) return merged.plan;
  return clampMusicPlan(defaultMusicPlan(promptFallback), promptFallback);
}
