/**
 * Local planner MusicPlan schema (LLM output).
 * Distinct from generator MusicPlan in types/musicPlan.ts.
 */

import { z } from 'zod';

export const METERS = ['4/4', '3/4', '6/8', '2/4'] as const;
export const TEXTURES = ['monophonic', 'melody+bass', 'melody+chords', 'polyphonic'] as const;
export const REGISTER_BIASES = ['low', 'mid', 'high', 'wide'] as const;

export type PlannerMeter = (typeof METERS)[number];
export type PlannerTexture = (typeof TEXTURES)[number];
export type PlannerRegisterBias = (typeof REGISTER_BIASES)[number];

const PITCH_RE = /^[A-Ga-g](?:#|b)?-?\d$/;

export const MusicPlanSchema = z.object({
  prompt: z.string().min(1).max(2000),
  style: z.string().min(1).max(120).default('generic'),
  mood: z.array(z.string().min(1).max(40)).min(1).max(8).default(['neutral']),
  tempoBpm: z.number().min(40).max(220).default(120),
  meter: z.enum(METERS).default('4/4'),
  keyCenter: z.string().min(1).max(4).default('C'),
  scaleType: z.string().min(1).max(40).default('major'),
  phraseBars: z.number().int().min(1).max(16).default(2),
  totalBars: z.number().int().min(1).max(64).default(4),
  rhythmDensity: z.number().min(0).max(1).default(0.5),
  restDensity: z.number().min(0).max(1).default(0.2),
  syncopation: z.number().min(0).max(1).default(0.35),
  harmonicComplexity: z.number().min(0).max(1).default(0.45),
  repetition: z.number().min(0).max(1).default(0.55),
  variation: z.number().min(0).max(1).default(0.45),
  consonance: z.number().min(0).max(1).default(0.7),
  melodicRange: z.object({
    min: z.string().regex(PITCH_RE, 'Expected pitch like C4'),
    max: z.string().regex(PITCH_RE, 'Expected pitch like C5'),
  }).default({ min: 'C4', max: 'C6' }),
  leapRate: z.number().min(0).max(1).default(0.35),
  motifShape: z.string().min(1).max(80).default('undulating'),
  articulation: z.string().min(1).max(40).default('legato'),
  dynamics: z.string().min(1).max(40).default('medium'),
  texture: z.enum(TEXTURES).default('melody+chords'),
  registerBias: z.enum(REGISTER_BIASES).default('mid'),
  percussionEnergy: z.number().min(0).max(1).default(0.4),
  notes: z.array(z.string().max(40)).max(64).default([]),
});

/** Planner JSON shape (LLM / API). Not the generator MusicPlan in types/musicPlan.ts */
export type PlannerMusicPlan = z.infer<typeof MusicPlanSchema>;

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

const NUMERIC_01 = [
  'rhythmDensity', 'restDensity', 'syncopation', 'harmonicComplexity',
  'repetition', 'variation', 'consonance', 'leapRate', 'percussionEnergy',
] as const;

/** Safe defaults for a new planner plan. */
export function defaultMusicPlan(prompt = ''): PlannerMusicPlan {
  return clampMusicPlan(
    MusicPlanSchema.parse({ prompt: prompt.trim() || 'untitled' }),
    prompt,
  );
}

/** Coerce enums and shapes before validation. */
export function normalizeMusicPlan(raw: unknown, promptFallback = ''): PlannerMusicPlan {
  const prepped = prepRaw(raw, promptFallback);
  const parsed = MusicPlanSchema.safeParse(prepped);
  if (parsed.success) {
    return clampMusicPlan(parsed.data, promptFallback);
  }
  return clampMusicPlan(
    MusicPlanSchema.parse({ ...defaultMusicPlan(promptFallback), ...(prepped as object) }),
    promptFallback,
  );
}

/** Clamp numeric fields and enforce cross-field bounds. */
export function clampMusicPlan(
  plan: PlannerMusicPlan,
  promptFallback = '',
): PlannerMusicPlan {
  const prompt = (plan.prompt || promptFallback || 'untitled').trim();
  const totalBars = clampInt(plan.totalBars, 1, 64);
  const phraseBars = clampInt(plan.phraseBars, 1, Math.min(16, totalBars));

  const meter = METERS.includes(plan.meter as PlannerMeter) ? plan.meter : '4/4';
  const texture = TEXTURES.includes(plan.texture as PlannerTexture) ? plan.texture : 'melody+chords';
  const registerBias = REGISTER_BIASES.includes(plan.registerBias as PlannerRegisterBias)
    ? plan.registerBias
    : 'mid';

  return {
    ...plan,
    prompt,
    style: plan.style?.trim() || 'generic',
    mood: Array.isArray(plan.mood) && plan.mood.length > 0 ? plan.mood : ['neutral'],
    tempoBpm: Math.round(clampNumber(plan.tempoBpm, 40, 220)),
    meter,
    keyCenter: normalizeKey(plan.keyCenter ?? 'C'),
    phraseBars,
    totalBars: Math.max(totalBars, phraseBars),
    rhythmDensity: clampNumber(plan.rhythmDensity, 0, 1),
    restDensity: clampNumber(plan.restDensity, 0, 1),
    syncopation: clampNumber(plan.syncopation, 0, 1),
    harmonicComplexity: clampNumber(plan.harmonicComplexity, 0, 1),
    repetition: clampNumber(plan.repetition, 0, 1),
    variation: clampNumber(plan.variation, 0, 1),
    consonance: clampNumber(plan.consonance, 0, 1),
    leapRate: clampNumber(plan.leapRate, 0, 1),
    percussionEnergy: clampNumber(plan.percussionEnergy, 0, 1),
    melodicRange: {
      min: normalizePitch(plan.melodicRange?.min ?? 'C4', 'C4'),
      max: normalizePitch(plan.melodicRange?.max ?? 'C6', 'C6'),
    },
    texture,
    registerBias,
    notes: Array.isArray(plan.notes) ? plan.notes : [],
  };
}

function prepRaw(raw: unknown, promptFallback: string): unknown {
  if (typeof raw !== 'object' || raw === null) {
    return { prompt: promptFallback || 'untitled' };
  }
  const obj = { ...(raw as Record<string, unknown>) };
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

/** JSON Schema for Ollama `format` field. */
export function musicPlanJsonSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      prompt: { type: 'string' },
      style: { type: 'string' },
      mood: { type: 'array', items: { type: 'string' } },
      tempoBpm: { type: 'integer' },
      meter: { type: 'string', enum: [...METERS] },
      keyCenter: { type: 'string' },
      scaleType: { type: 'string' },
      phraseBars: { type: 'integer' },
      totalBars: { type: 'integer' },
      rhythmDensity: { type: 'number' },
      restDensity: { type: 'number' },
      syncopation: { type: 'number' },
      harmonicComplexity: { type: 'number' },
      repetition: { type: 'number' },
      variation: { type: 'number' },
      consonance: { type: 'number' },
      melodicRange: {
        type: 'object',
        properties: { min: { type: 'string' }, max: { type: 'string' } },
        required: ['min', 'max'],
      },
      leapRate: { type: 'number' },
      motifShape: { type: 'string' },
      articulation: { type: 'string' },
      dynamics: { type: 'string' },
      texture: { type: 'string', enum: [...TEXTURES] },
      registerBias: { type: 'string', enum: [...REGISTER_BIASES] },
      percussionEnergy: { type: 'number' },
      notes: { type: 'array', items: { type: 'string' } },
    },
    required: [
      'prompt', 'style', 'mood', 'tempoBpm', 'meter', 'keyCenter', 'scaleType',
      'phraseBars', 'totalBars', 'rhythmDensity', 'restDensity', 'syncopation',
      'harmonicComplexity', 'repetition', 'variation', 'consonance', 'melodicRange',
      'leapRate', 'motifShape', 'articulation', 'dynamics', 'texture', 'registerBias',
      'percussionEnergy', 'notes',
    ],
  };
}
