/**
 * promptToPlan.ts
 *
 * Active prompt pipeline: natural-language text → MusicPlan (used by parseMusicInput).
 * Reuses parsePrompt from promptParser.ts for numeric/key/instrument extraction.
 *
 * Example: "loopable funky melody, 100 BPM, summer nu-disco"
 *   → tempo 100, genre funk/nu-disco, mood bright, repetition high, bars 4
 */

import type {
  MusicPlan,
  PlanAssumption,
  PlanDefaults,
  PlanParseResult,
  Mood,
  Genre,
  Contour,
  Density,
  Syncopation,
  Register,
  Repetition,
  PlanDimension,
} from '../types/musicPlan';
import { PLAN_DIMENSION_DEFAULTS } from '../types/musicPlan';
import { mapPromptLexicon } from './promptLexicon';
import type { ResolvedEnum } from './promptLexicon';
import { parsePrompt } from './promptParser';

/**
 * Explicit settings values that always win over prompt-extracted values.
 * Pass the fields the user has manually set in the Settings panel.
 * Any field present here overrides whatever the prompt says for that dimension.
 */
export type PlanHardOverrides = {
  tempo?: number;
  key?: string;
  mode?: 'major' | 'minor';
  beatsPerBar?: number;
  beatValue?: number;
  bars?: number;
  instrument?: number;
};

const LOOPABLE_RE = /\bloop(?:able)?\b|\brepeat(?:ing)?\b|\bhook\b/i;
const MELODY_RE = /\bmelod|lead|tune|line\b/i;

const DEFAULT_VELOCITY = 80;
const DYNAMICS: Array<[RegExp, number]> = [
  [/soft|quiet|gentle|mellow|delicate/i, 55],
  [/loud|strong|hard|aggressive|powerful|driving/i, 105],
];

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse a natural-language prompt into a MusicPlan.
 * Applies defaults for any field not found in the text and records each
 * assumption so the UI can surface them.
 *
 * @param hardOverrides - Settings fields explicitly set by the user. These
 *   always win over both the prompt-extracted value and defaults. Pass the
 *   fields from the Settings panel that the user has manually changed.
 */
export function promptToPlan(
  text: string,
  defaults: PlanDefaults = {},
  hardOverrides: PlanHardOverrides = {},
): PlanParseResult {
  const trimmed = text.trim();
  const extracted = parsePrompt(trimmed);
  const lexicon = mapPromptLexicon(trimmed);
  const assumptions: PlanAssumption[] = [];
  let matchCount = lexicon.matches.length;

  function infer<T extends string>(
    field: keyof MusicPlan | 'bars' | 'loop',
    resolved: ResolvedEnum<T> | null,
    fallback: T,
    label: string,
  ): T {
    if (resolved) {
      matchCount++;
      assumptions.push({
        field,
        message: `${label}: ${resolved.value}`,
        confidence: resolved.confidence,
        source: resolved.sources.join(', '),
      });
      return resolved.value;
    }
    assumptions.push({
      field,
      message: `Default ${label}: ${fallback}`,
      confidence: 0.45,
    });
    return fallback;
  }

  function recordDimension(field: PlanDimension, value: number): void {
    const defaultVal = PLAN_DIMENSION_DEFAULTS[field];
    const delta = Math.abs(value - defaultVal);
    if (delta < 0.06) return;

    const sources = lexicon.matches
      .filter((m) => m.entry.dimensions?.[field] !== undefined)
      .map((m) => m.phrase);

    assumptions.push({
      field,
      message: `${field}: ${formatDimension(value)}`,
      confidence: clampConfidence(0.55 + delta * 0.8),
      source: sources.length > 0 ? sources.join(', ') : undefined,
    });
  }

  // ── Numeric / structural fields — settings hard overrides win, then prompt, then defaults ──

  let tempo: number;
  if (hardOverrides.tempo !== undefined) {
    tempo = hardOverrides.tempo;
    assumptions.push({ field: 'tempo', message: `Settings: ${tempo} BPM`, confidence: 1.0, source: 'settings override' });
  } else if (extracted.bpm) {
    tempo = extracted.bpm;
    matchCount++;
    assumptions.push({ field: 'tempo', message: `tempo: ${extracted.bpm} BPM`, confidence: 0.95, source: 'explicit BPM' });
  } else {
    tempo = defaults.tempo ?? 120;
    assumptions.push({ field: 'tempo', message: `Default tempo: ${tempo} BPM`, confidence: 0.45 });
  }

  let key: string;
  if (hardOverrides.key !== undefined) {
    key = hardOverrides.key;
    assumptions.push({ field: 'key', message: `Settings: key ${key}`, confidence: 1.0, source: 'settings override' });
  } else if (extracted.key) {
    key = extracted.key;
    matchCount++;
    assumptions.push({ field: 'key', message: `key: ${extracted.key}`, confidence: 0.95, source: 'explicit key' });
  } else {
    key = defaults.key ?? 'C';
    assumptions.push({ field: 'key', message: `Default key: ${key}`, confidence: 0.45 });
  }

  let mode: 'major' | 'minor';
  if (hardOverrides.mode !== undefined) {
    mode = hardOverrides.mode;
    assumptions.push({ field: 'mode', message: `Settings: ${mode}`, confidence: 1.0, source: 'settings override' });
  } else if (extracted.musicalMode) {
    mode = extracted.musicalMode;
    matchCount++;
    assumptions.push({ field: 'mode', message: `mode: ${extracted.musicalMode}`, confidence: 0.95, source: 'explicit mode' });
  } else if (lexicon.mode) {
    mode = lexicon.mode.value;
    matchCount++;
    assumptions.push({ field: 'mode', message: `mode: ${lexicon.mode.value}`, confidence: lexicon.mode.confidence, source: lexicon.mode.sources.join(', ') });
  } else {
    mode = defaults.mode ?? 'major';
    assumptions.push({ field: 'mode', message: `Default mode: ${mode}`, confidence: 0.45 });
  }

  let beatsPerBar: number;
  if (hardOverrides.beatsPerBar !== undefined) {
    beatsPerBar = hardOverrides.beatsPerBar;
    assumptions.push({ field: 'beatsPerBar', message: `Settings: ${beatsPerBar}/${hardOverrides.beatValue ?? 4} time`, confidence: 1.0, source: 'settings override' });
  } else if (extracted.beatsPerBar) {
    beatsPerBar = extracted.beatsPerBar;
    matchCount++;
    assumptions.push({ field: 'beatsPerBar', message: `meter: ${extracted.beatsPerBar}/${extracted.beatValue ?? 4}`, confidence: 0.95, source: 'explicit meter' });
  } else {
    beatsPerBar = defaults.beatsPerBar ?? 4;
    assumptions.push({ field: 'beatsPerBar', message: `Default meter: ${beatsPerBar}/4`, confidence: 0.45 });
  }

  const beatValue = hardOverrides.beatValue ?? extracted.beatValue ?? defaults.beatValue ?? 4;

  let bars: number;
  if (hardOverrides.bars !== undefined) {
    bars = hardOverrides.bars;
    assumptions.push({ field: 'bars', message: `Settings: ${bars} bars`, confidence: 1.0, source: 'settings override' });
  } else if (extracted.bars) {
    bars = extracted.bars;
    matchCount++;
    assumptions.push({ field: 'bars', message: `${extracted.bars} bars`, confidence: 0.95, source: 'explicit bar count' });
  } else if (LOOPABLE_RE.test(trimmed) || (lexicon.repetition?.value === 'high')) {
    bars = 4;
    matchCount++;
    assumptions.push({
      field: 'bars',
      message: 'loopable → 4-bar phrase',
      confidence: lexicon.repetition?.confidence ?? 0.78,
      source: lexicon.repetition?.sources.join(', ') ?? 'loopable',
    });
  } else {
    bars = defaults.bars ?? 4;
    assumptions.push({ field: 'bars', message: `Default length: ${bars} bars`, confidence: 0.45 });
  }

  // Only snap loopable when bars weren't set by settings override
  if (hardOverrides.bars === undefined &&
      (LOOPABLE_RE.test(trimmed) || lexicon.repetition?.value === 'high') &&
      bars !== 4 && bars !== 8) {
    const snapped = bars <= 6 ? 4 : 8;
    assumptions.push({ field: 'loop', message: `Loopable phrase snapped to ${snapped} bars`, confidence: 0.82, source: 'loopable' });
    bars = snapped;
  }

  let instrument: number;
  if (hardOverrides.instrument !== undefined) {
    instrument = hardOverrides.instrument;
    assumptions.push({ field: 'instrument', message: `Settings: instrument #${instrument}`, confidence: 1.0, source: 'settings override' });
  } else if (extracted.instrument !== undefined) {
    instrument = extracted.instrument;
    matchCount++;
    assumptions.push({ field: 'instrument', message: `instrument #${extracted.instrument}`, confidence: 0.92, source: 'explicit instrument' });
  } else {
    instrument = defaults.instrument ?? 0;
    assumptions.push({ field: 'instrument', message: 'Default instrument: Acoustic Grand Piano', confidence: 0.45 });
  }

  // ── Style fields from lexicon (combined, not first-match-wins) ────────────
  const mood = infer('mood', lexicon.mood, 'neutral' as Mood, 'mood');
  const genre = infer('genre', lexicon.genre, 'generic' as Genre, 'genre');

  let contour = infer('contour', lexicon.contour, 'undulating' as Contour, 'contour');
  if (!lexicon.contour && MELODY_RE.test(trimmed) && (genre === 'funk' || genre === 'nu-disco')) {
    contour = 'undulating';
    assumptions.push({
      field: 'contour',
      message: 'contour: undulating (funky melody)',
      confidence: 0.72,
      source: 'melody + groove genre',
    });
  }

  const density = infer('density', lexicon.density, 'medium' as Density, 'density');

  let syncopation = infer('syncopation', lexicon.syncopation, 'straight' as Syncopation, 'syncopation');
  if (!lexicon.syncopation) {
    if (genre === 'funk' || genre === 'nu-disco' || lexicon.dimensions.groove > 0.62) {
      syncopation = 'heavy';
      assumptions.push({
        field: 'syncopation',
        message: 'syncopation: heavy (groove genre)',
        confidence: clampConfidence(0.6 + lexicon.dimensions.groove * 0.35),
        source: genre !== 'generic' ? genre : 'groove',
      });
    } else if (genre === 'jazz') {
      syncopation = 'light';
      assumptions.push({
        field: 'syncopation',
        message: 'syncopation: light (jazz)',
        confidence: 0.78,
        source: 'jazz',
      });
    }
  }

  const register = infer('register', lexicon.register, 'mid' as Register, 'register');

  let repetition = infer('repetition', lexicon.repetition, 'medium' as Repetition, 'repetition');
  if (!lexicon.repetition && LOOPABLE_RE.test(trimmed)) {
    repetition = 'high';
    assumptions.push({
      field: 'repetition',
      message: 'repetition: high (loopable)',
      confidence: 0.84,
      source: 'loopable',
    });
  }

  // Motif strength can nudge repetition when not explicitly set
  if (!lexicon.repetition && lexicon.dimensions.motifStrength > 0.62 && repetition === 'medium') {
    repetition = 'high';
    assumptions.push({
      field: 'repetition',
      message: 'repetition: high (strong motif)',
      confidence: clampConfidence(lexicon.dimensions.motifStrength),
      source: 'motifStrength',
    });
  }

  const dimensions = { ...lexicon.dimensions };
  for (const dim of Object.keys(PLAN_DIMENSION_DEFAULTS) as PlanDimension[]) {
    recordDimension(dim, dimensions[dim]);
  }

  let motifLength: number;
  if (density === 'sparse' || dimensions.variationRate < 0.35) {
    motifLength = 1;
    assumptions.push({
      field: 'motifLength',
      message: 'Sparse / low variation → 1-bar motif',
      confidence: 0.72,
    });
  } else if (bars >= 8 || dimensions.motifStrength > 0.65) {
    motifLength = 2;
    assumptions.push({
      field: 'motifLength',
      message: 'Long phrase / strong motif → 2-bar seed',
      confidence: 0.7,
    });
  } else {
    motifLength = 2;
    assumptions.push({
      field: 'motifLength',
      message: 'Default motif length: 2 bars',
      confidence: 0.45,
    });
  }

  let velocity = DEFAULT_VELOCITY;
  for (const [re, vel] of DYNAMICS) {
    if (re.test(trimmed)) {
      velocity = vel;
      matchCount++;
      assumptions.push({
        field: 'velocity',
        message: `velocity: ${vel}`,
        confidence: 0.8,
        source: 'dynamics keyword',
      });
      break;
    }
  }

  velocity = Math.round(
    clamp(velocity * (0.75 + dimensions.energy * 0.5), 40, 127),
  );

  if (mood === 'calm') velocity = Math.min(velocity, 65);
  if (mood === 'energetic' || dimensions.energy > 0.7) {
    velocity = Math.max(velocity, 88);
  }

  const plan: MusicPlan = {
    tempo,
    key,
    mode,
    beatsPerBar,
    beatValue,
    bars,
    mood,
    genre,
    contour,
    density,
    syncopation,
    register,
    repetition,
    motifLength,
    instrument,
    velocity,
    groove: dimensions.groove,
    brightness: dimensions.brightness,
    energy: dimensions.energy,
    motifStrength: dimensions.motifStrength,
    variationRate: dimensions.variationRate,
    chordToneBias: dimensions.chordToneBias,
    stepLeapBalance: dimensions.stepLeapBalance,
    cadenceStrength: dimensions.cadenceStrength,
  };

  const confidence = computeConfidence(trimmed, matchCount, assumptions);

  return { plan, confidence, assumptions };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function computeConfidence(text: string, matchCount: number, assumptions: PlanAssumption[]): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  const inferred = assumptions.filter((a) => (a.confidence ?? 0) >= 0.6);
  const musicSignal = (matchCount + inferred.length * 0.5) / Math.max(words * 0.35, 1);
  const lowConfDefaults = assumptions.filter((a) => (a.confidence ?? 1) < 0.5).length;
  const assumptionPenalty = lowConfDefaults * 0.035;
  const avgInference = assumptions.length > 0
    ? assumptions.reduce((sum, a) => sum + (a.confidence ?? 0.5), 0) / assumptions.length
    : 0.5;

  return clampConfidence(
    0.28 + musicSignal * 0.12 + avgInference * 0.35 - assumptionPenalty,
  );
}

function formatDimension(value: number): string {
  if (value < 0.34) return 'low';
  if (value > 0.66) return 'high';
  return 'medium';
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function clampConfidence(n: number): number {
  return clamp(n, 0.15, 0.98);
}

/** Short human-readable summary of a plan for UI chips */
export function describeMusicPlan(plan: MusicPlan): string {
  const styleTags: string[] = [];

  if (plan.groove > 0.65) styleTags.push('groovy');
  if (plan.energy > 0.68) styleTags.push('driving');
  if (plan.brightness > 0.68) styleTags.push('bright');
  if (plan.brightness < 0.32) styleTags.push('dark tone');
  if (plan.motifStrength > 0.65) styleTags.push('hooky');
  if (plan.chordToneBias > 0.65) styleTags.push('harmonic');

  return [
    `${plan.tempo} BPM`,
    `${plan.key} ${plan.mode}`,
    plan.genre !== 'generic' ? plan.genre : null,
    plan.mood !== 'neutral' ? plan.mood : null,
    ...styleTags,
    `${plan.bars} bars`,
    plan.syncopation !== 'straight' ? `${plan.syncopation} syncopation` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
