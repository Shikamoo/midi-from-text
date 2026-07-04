/**
 * Phrase-level motif memory and development across tiled bars.
 * Active when MusicPlan.plannerIntent is set; legacy path uses varyMotif unchanged.
 */

import type { NoteToken } from '../../types/music';
import type { MusicPlan } from '../../types/musicPlan';
import { buildRhythmPattern, clampRegister } from './melodyHelpers';
import type { MotifBar, RhythmSlot, VaryMotifContext } from './types';

export type PhraseDevelopmentStrategy =
  | 'seed'
  | 'exact-repeat'
  | 'rhythmic-variation'
  | 'interval-variation'
  | 'sequence'
  | 'inversion-lite'
  | 'call-response';

export interface PhraseDevelopmentContext extends VaryMotifContext {
  phraseWindow: number;
  strategy: PhraseDevelopmentStrategy;
  maxDegree?: number;
}

export function phraseWindowSize(plan: MusicPlan): number {
  return Math.max(1, plan.motifLength);
}

/** Fingerprint for motif identity checks (degrees + rhythm skeleton). */
export function motifFingerprint(bar: MotifBar): string {
  const rhythm = bar.rhythm.map((s) => (s.rest ? 'r' : s.duration.toFixed(2))).join(',');
  return `${bar.degrees.join('-')}|${rhythm}`;
}

export function resolvePhraseStrategy(
  plan: MusicPlan,
  barIndex: number,
  cycle: number,
  motifIndex: number,
): PhraseDevelopmentStrategy {
  const window = phraseWindowSize(plan);
  if (cycle === 0 && barIndex < window) return 'seed';

  const intent = plan.plannerIntent;
  if (!intent) return 'interval-variation';

  const rep = intent.repetitionLevel;
  const variation = intent.variationLevel;

  if (rep > 0.72 && variation < 0.22) return 'exact-repeat';
  if (rep > 0.58 && variation < 0.32 && cycle % 2 === 0) return 'exact-repeat';

  const phase = (cycle * window + motifIndex + barIndex) % 6;

  if (variation > 0.62) {
    if (phase % 3 === 0) return 'call-response';
    if (phase % 3 === 1) return 'sequence';
    return 'inversion-lite';
  }

  if (variation > 0.38) {
    return phase % 2 === 0 ? 'rhythmic-variation' : 'interval-variation';
  }

  if (rep > 0.55) return phase % 2 === 0 ? 'exact-repeat' : 'rhythmic-variation';
  return 'interval-variation';
}

export function strategyLabel(strategy: PhraseDevelopmentStrategy): string {
  switch (strategy) {
    case 'seed': return 'seed motif';
    case 'exact-repeat': return 'exact repeat';
    case 'rhythmic-variation': return 'rhythmic variation';
    case 'interval-variation': return 'interval variation';
    case 'sequence': return 'sequence';
    case 'inversion-lite': return 'inversion-lite';
    case 'call-response': return 'call-response';
  }
}

export function developPhraseBar(
  seedBar: MotifBar,
  ctx: PhraseDevelopmentContext,
): MotifBar {
  switch (ctx.strategy) {
    case 'seed':
    case 'exact-repeat':
      return cloneMotifBar(seedBar);
    case 'rhythmic-variation':
      return applyRhythmicVariation(seedBar, ctx);
    case 'interval-variation':
      return applyIntervalVariation(seedBar, ctx, 1);
    case 'sequence':
      return applySequence(seedBar, ctx);
    case 'inversion-lite':
      return applyInversionLite(seedBar, ctx);
    case 'call-response':
      return applyCallResponse(seedBar, ctx);
    default:
      return cloneMotifBar(seedBar);
  }
}

export function buildPhraseDevelopmentSummary(plan: MusicPlan): string {
  if (!plan.plannerIntent) {
    return 'Phrase development realized: legacy phrase shape (no plannerIntent)';
  }

  const window = phraseWindowSize(plan);
  const intent = plan.plannerIntent;
  const cycle1Bar = resolvePhraseStrategy(plan, window, 1, 0);
  const repeatLabel = intent.repetitionLevel > 0.65 ? 'high repeat' : intent.repetitionLevel < 0.35 ? 'low repeat' : 'balanced repeat';
  const variationLabel = intent.variationLevel > 0.55 ? 'high variation' : intent.variationLevel < 0.3 ? 'low variation' : 'moderate variation';

  return [
    'Phrase development realized:',
    `  phrase window: ${window} bar(s)`,
    `  motif strategy (cycle 2): ${strategyLabel(cycle1Bar)}`,
    `  repetition: ${repeatLabel} (${intent.repetitionLevel.toFixed(2)})`,
    `  variation: ${variationLabel} (${intent.variationLevel.toFixed(2)})`,
  ].join('\n');
}

function cloneMotifBar(bar: MotifBar): MotifBar {
  return {
    rhythm: bar.rhythm.map((s) => ({ ...s })),
    degrees: [...bar.degrees],
    tokens: bar.tokens.map((t) => ({ ...t })),
  };
}

function applyRhythmicVariation(bar: MotifBar, ctx: PhraseDevelopmentContext): MotifBar {
  const altRhythm = buildRhythmPattern(ctx.plan, ctx.preset, ctx.barIndex + ctx.cycle + 1);
  const rhythm = blendRhythm(bar.rhythm, altRhythm, ctx.plan.plannerIntent?.variationLevel ?? 0.5);
  const tokens = retokenizeBar(bar.degrees, rhythm, bar.tokens, ctx);
  return { rhythm, degrees: [...bar.degrees], tokens };
}

function applyIntervalVariation(
  bar: MotifBar,
  ctx: PhraseDevelopmentContext,
  steps: number,
): MotifBar {
  const variation = ctx.plan.plannerIntent?.variationLevel ?? ctx.plan.variationRate;
  const changeCount = variation > 0.55 ? 2 : 1;
  const degrees = [...bar.degrees];
  const maxDegree = maxScaleDegree(ctx);

  for (let c = 0; c < changeCount; c++) {
    const idx = (ctx.motifIndex + ctx.cycle + c) % Math.max(1, degrees.length);
    const direction = (ctx.barIndex + c) % 2 === 0 ? steps : -steps;
    degrees[idx] = clampDegree(degrees[idx] + direction, maxDegree);
  }

  const tokens = retokenizeBar(degrees, bar.rhythm, bar.tokens, ctx);
  return { rhythm: bar.rhythm.map((s) => ({ ...s })), degrees, tokens };
}

function applySequence(bar: MotifBar, ctx: PhraseDevelopmentContext): MotifBar {
  const step = (ctx.cycle % 2) + 1;
  const maxDegree = maxScaleDegree(ctx);
  const degrees = bar.degrees.map((d) => clampDegree(d + step, maxDegree));
  const tokens = retokenizeBar(degrees, bar.rhythm, bar.tokens, ctx);
  return { rhythm: bar.rhythm.map((s) => ({ ...s })), degrees, tokens };
}

function applyInversionLite(bar: MotifBar, ctx: PhraseDevelopmentContext): MotifBar {
  if (bar.degrees.length === 0) return cloneMotifBar(bar);
  const maxDegree = maxScaleDegree(ctx);
  const anchor = bar.degrees[Math.floor(bar.degrees.length / 2)];
  const degrees = bar.degrees.map((d) => clampDegree(anchor - (d - anchor), maxDegree));
  const tokens = retokenizeBar(degrees, bar.rhythm, bar.tokens, ctx);
  return { rhythm: bar.rhythm.map((s) => ({ ...s })), degrees, tokens };
}

function applyCallResponse(bar: MotifBar, ctx: PhraseDevelopmentContext): MotifBar {
  const maxDegree = maxScaleDegree(ctx);
  const shift = ctx.plan.mode === 'minor' ? 1 : 2;
  const degrees = bar.degrees.map((d) => clampDegree(d - shift, maxDegree));
  const tokens = retokenizeBar(degrees, bar.rhythm, bar.tokens, ctx);
  return { rhythm: bar.rhythm.map((s) => ({ ...s })), degrees, tokens };
}

function blendRhythm(base: RhythmSlot[], alt: RhythmSlot[], variation: number): RhythmSlot[] {
  const len = Math.max(base.length, alt.length);
  const out: RhythmSlot[] = [];
  for (let i = 0; i < len; i++) {
    const a = base[i % base.length];
    const b = alt[i % alt.length];
    if (!a) { out.push({ ...b }); continue; }
    if (!b) { out.push({ ...a }); continue; }
    out.push(variation > 0.5 && i % 2 === 1 ? { ...b } : { ...a });
  }
  return out;
}

function retokenizeBar(
  degrees: number[],
  rhythm: RhythmSlot[],
  reference: NoteToken[],
  ctx: PhraseDevelopmentContext,
): NoteToken[] {
  const tokens: NoteToken[] = [];
  let degIdx = 0;
  let refIdx = 0;

  for (const slot of rhythm) {
    if (slot.rest) {
      tokens.push({
        pitch: 'rest',
        midiNote: -1,
        duration: slot.duration,
        dotted: false,
        velocity: ctx.plan.velocity,
        source: 'rest',
      });
      continue;
    }

    const degree = degrees[degIdx % degrees.length];
    const ref = reference[refIdx] ?? reference[reference.length - 1];
    const midi = ctx.scaleNotes[degree % ctx.scaleNotes.length];
    tokens.push(clampRegister(
      {
        pitch: ref.pitch === 'rest' ? 'C4' : ref.pitch,
        midiNote: midi,
        duration: slot.duration,
        dotted: ref.dotted,
        velocity: ref.velocity,
        source: 'phrase-dev',
      },
      ctx.plan,
    ));
    degIdx++;
    refIdx++;
  }

  return tokens;
}

function maxScaleDegree(ctx: PhraseDevelopmentContext): number {
  return ctx.maxDegree ?? 6;
}

function clampDegree(degree: number, maxDegree = 6): number {
  return Math.max(0, Math.min(maxDegree, degree));
}

/** Compare pitched MIDI sequences between two bars (0–1 similarity). */
export function barMidiSimilarity(
  tokensA: NoteToken[],
  tokensB: NoteToken[],
): number {
  const midisA = tokensA.filter((t) => t.pitch !== 'rest').map((t) => t.midiNote);
  const midisB = tokensB.filter((t) => t.pitch !== 'rest').map((t) => t.midiNote);
  const len = Math.min(midisA.length, midisB.length);
  if (len === 0) return 0;
  let matches = 0;
  for (let i = 0; i < len; i++) {
    if (midisA[i] === midisB[i]) matches++;
  }
  return matches / len;
}

export function extractBarTokens(
  tokens: NoteToken[],
  barIndex: number,
  beatsPerBar: number,
): NoteToken[] {
  const start = barIndex * beatsPerBar;
  const end = start + beatsPerBar;
  const out: NoteToken[] = [];
  let beat = 0;

  for (const token of tokens) {
    const tokenStart = beat;
    const tokenEnd = beat + token.duration;
    if (tokenEnd > start && tokenStart < end) {
      out.push(token);
    }
    beat = tokenEnd;
  }

  return out;
}

export function countBarDifferences(
  tokensA: NoteToken[],
  tokensB: NoteToken[],
): number {
  const midisA = tokensA.filter((t) => t.pitch !== 'rest').map((t) => t.midiNote);
  const midisB = tokensB.filter((t) => t.pitch !== 'rest').map((t) => t.midiNote);
  const len = Math.max(midisA.length, midisB.length);
  let diff = 0;
  for (let i = 0; i < len; i++) {
    if (midisA[i] !== midisB[i]) diff++;
  }
  return diff;
}
