/**
 * Pure melody-generation helpers used by planToScore.
 */

import { midiToPitch, pitchToMidi } from '../../types/music';
import type { Bar, NoteToken } from '../../types/music';
import type { MusicPlan } from '../../types/musicPlan';
import { resolvePhraseShape } from './stylePresets';
import { resolvePlannerScale } from './scaleIntervals';
import {
  effectiveChordToneBias,
  effectiveContour,
  effectiveLeapRate,
  resolvePitchAnchorDegrees,
} from './melodyIntent';
import {
  resolveMelodyDensityParams,
} from '../melodySettings';
import {
  developPhraseBar,
  phraseWindowSize,
  resolvePhraseStrategy,
} from './phraseDevelopment';
import type {
  MotifBar,
  RhythmSlot,
  ScaleContext,
  StylePreset,
  VaryMotifContext,
} from './types';
import {
  MAX_MELODY_MIDI,
  MIN_MELODY_MIDI,
} from './types';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const CONTOUR_ARC: Record<MusicPlan['contour'], number[]> = {
  ascending: [1, 2, 4, 0],
  descending: [4, 3, 2, 0],
  undulating: [2, 4, 3, 0],
  static: [2, 2, 3, 0],
};

const PASSING_TONE_DEGREES = [1, 3, 5, 6] as const;

const REGISTER_OCTAVE: Record<MusicPlan['register'], number> = {
  low: 3,
  mid: 4,
  high: 5,
};

/** Resolve phrase-arc target degree for a bar position (deterministic). */
export function phraseArcDegree(
  barIndex: number,
  totalBars: number,
  plan: MusicPlan,
  preset: StylePreset,
): number {
  const contour = effectiveContour(plan);
  const arc = preset.phraseArcDegrees.length > 0
    ? preset.phraseArcDegrees
    : CONTOUR_ARC[contour];
  const idx = totalBars >= 4 ? barIndex % 4 : barIndex % arc.length;
  return arc[idx % arc.length];
}

/** Melody MIDI bounds — uses planner melodic range when available. */
export function melodyMidiBounds(plan: MusicPlan): { min: number; max: number } {
  const intent = plan.plannerIntent;
  if (intent?.melodicRange) {
    let min = pitchToMidi(intent.melodicRange.min);
    let max = pitchToMidi(intent.melodicRange.max);
    if (min > max) [min, max] = [max, min];
    if (intent.registerBias === 'wide') {
      min = Math.max(24, min - 6);
      max = Math.min(96, max + 6);
    }
    return {
      min: Math.max(MIN_MELODY_MIDI, min),
      max: Math.min(MAX_MELODY_MIDI, max),
    };
  }
  const octave = REGISTER_OCTAVE[plan.register];
  return {
    min: Math.max(MIN_MELODY_MIDI, (octave + 1) * 12),
    max: Math.min(MAX_MELODY_MIDI, (octave + 2) * 12 + 11),
  };
}

// ─── Rhythm ────────────────────────────────────────────────────────────────────

/** Build one bar of rhythm from plan + style preset. */
export function buildRhythmPattern(
  plan: MusicPlan,
  preset: StylePreset,
  barOffset: number,
): RhythmSlot[] {
  const densityParams = resolveMelodyDensityParams(plan);
  if (densityParams) {
    return buildRhythmForDensity(plan, preset, barOffset, densityParams);
  }

  const intent = plan.plannerIntent;
  if (intent) {
    const activity = intent.rhythmDensity * (1 - intent.restDensity * 0.5);
    if (activity < 0.35) {
      return sparseRhythm(plan.beatsPerBar);
    }
    if (activity > 0.65) {
      return denseRhythm(plan.beatsPerBar);
    }
    const patterns = preset.rhythmPatterns;
    const base = patterns[barOffset % patterns.length].map((slot) => ({ ...slot }));
    if (intent.syncopationLevel > 0.55 || plan.groove > 0.58) {
      return applySyncopation(base, intent.syncopationLevel, barOffset);
    }
    if (intent.syncopationLevel < 0.25) {
      return [
        { duration: 0.5, accent: true },
        { duration: 0.5 },
        { duration: 1 },
        { duration: 0.5 },
        { duration: 0.5, accent: true },
        { duration: 1 },
      ];
    }
    return base;
  }

  const patterns = preset.rhythmPatterns;
  const base = patterns[barOffset % patterns.length].map((slot) => ({ ...slot }));

  if (plan.density === 'sparse') {
    return sparseRhythm(plan.beatsPerBar);
  }

  if (plan.density === 'dense' && preset.id === 'generic') {
    return denseRhythm(plan.beatsPerBar);
  }

  if (plan.syncopation === 'heavy' || plan.groove > 0.58 || preset.syncopationBias > 0.6) {
    return applySyncopation(base, preset.syncopationBias, barOffset);
  }

  if (plan.syncopation === 'light') {
    return [
      { duration: 0.5, accent: true },
      { duration: 0.5 },
      { duration: 1 },
      { duration: 0.5 },
      { duration: 0.5, accent: true },
      { duration: 1 },
    ];
  }

  return base;
}

function buildRhythmForDensity(
  plan: MusicPlan,
  preset: StylePreset,
  barOffset: number,
  densityParams: NonNullable<ReturnType<typeof resolveMelodyDensityParams>>,
): RhythmSlot[] {
  const activity = densityParams.rhythmDensity * (1 - densityParams.restDensity * 0.5);
  if (activity < 0.35) {
    return sparseRhythm(plan.beatsPerBar);
  }
  if (activity > 0.65) {
    let slots = denseRhythm(plan.beatsPerBar);
    if (densityParams.shortenDurations) {
      slots = shortenRhythmSlots(slots);
    }
    return slots;
  }

  const patterns = preset.rhythmPatterns;
  let base = patterns[barOffset % patterns.length].map((slot) => ({ ...slot }));
  if (densityParams.shortenDurations) {
    base = shortenRhythmSlots(base);
  }
  const syncBias = plan.plannerIntent?.syncopationLevel ?? preset.syncopationBias;
  if (syncBias > 0.55 || plan.groove > 0.58) {
    base = applySyncopation(base, syncBias, barOffset);
  }
  if (densityParams.weakBeatExtraNotes) {
    base = addWeakBeatFillers(base);
  }
  return base;
}

function shortenRhythmSlots(slots: RhythmSlot[]): RhythmSlot[] {
  const out: RhythmSlot[] = [];
  for (const slot of slots) {
    if (slot.rest || slot.duration <= 0.5) {
      out.push({ ...slot });
      continue;
    }
    const half = slot.duration / 2;
    out.push({ ...slot, duration: half, accent: slot.accent });
    out.push({ duration: half });
  }
  return out;
}

function addWeakBeatFillers(slots: RhythmSlot[]): RhythmSlot[] {
  return slots.map((slot, i) => {
    if (slot.rest && i % 2 === 1) {
      return { duration: slot.duration };
    }
    return slot;
  });
}

function sparseRhythm(beatsPerBar: number): RhythmSlot[] {
  if (beatsPerBar >= 4) {
    return [
      { duration: 2, accent: true },
      { duration: 1, rest: true },
      { duration: 1, accent: true },
    ];
  }
  return [{ duration: 1, accent: true }, { duration: 1, rest: true }];
}

function denseRhythm(beatsPerBar: number): RhythmSlot[] {
  const slots: RhythmSlot[] = [];
  for (let i = 0; i < beatsPerBar * 2; i++) {
    slots.push({
      duration: 0.5,
      rest: i % 5 === 3,
      accent: i % 4 === 0,
    });
  }
  return slots;
}

function applySyncopation(
  pattern: RhythmSlot[],
  bias: number,
  barOffset: number,
): RhythmSlot[] {
  return pattern.map((slot, i) => {
    if (slot.rest) return slot;
    const offbeat = i % 2 === 1;
    if (offbeat && ((i + barOffset) % 3 === 0) && bias > 0.55) {
      return { ...slot, rest: true };
    }
    return slot;
  });
}

// ─── Degrees & motif ─────────────────────────────────────────────────────────

/** Choose the next scale degree with phrase arc, leap recovery, and passing tones. */
export function chooseNextDegree(
  prevDegree: number | null,
  prevInterval: number | null,
  pitchedIndex: number,
  pitchedTotal: number,
  rhythmSlot: RhythmSlot,
  plan: MusicPlan,
  preset: StylePreset,
  hookIndex: number,
  barIndex: number,
  totalBars: number,
  scale: ScaleContext,
): number {
  const chordToneBias = effectiveChordToneBias(plan);
  const leapRate = effectiveLeapRate(plan);
  const densityParams = resolveMelodyDensityParams(plan);
  const passingThreshold = densityParams?.passingToneThreshold ?? 0.7;
  const passingMinLeap = densityParams?.passingToneMinLeap ?? 2;
  const maxDegree = scale.maxDegree ?? 6;
  const hook = preset.hookDegrees[hookIndex % preset.hookDegrees.length];
  const arcTarget = phraseArcDegree(barIndex, totalBars, plan, preset);
  const accent = isAccent(rhythmSlot, pitchedIndex, pitchedTotal);
  const weakBeat = isWeakBeat(rhythmSlot, pitchedIndex, pitchedTotal);
  const anchorDegrees = plan.plannerIntent ? resolvePitchAnchorDegrees(plan, scale) : [];

  if (prevDegree === null) {
    if (anchorDegrees.length > 0) {
      const anchor = anchorDegrees[(barIndex + pitchedIndex) % anchorDegrees.length];
      return applyPlacementBias(anchor, accent, weakBeat, plan, maxDegree);
    }
    const start = accent ? nearestChordTone(hook, maxDegree) : clampDegree(hook, maxDegree);
    return start;
  }

  if (prevInterval !== null && Math.abs(prevInterval) >= 2) {
    const recoveryDir = prevInterval > 0 ? -1 : 1;
    const recovered = clampDegree(prevDegree + recoveryDir, maxDegree);
    if (weakBeat && chordToneBias < 0.68) {
      return recovered;
    }
    return accent && chordToneBias > 0.45
      ? nearestChordTone(recovered, maxDegree)
      : recovered;
  }

  if (plan.motifStrength > 0.58 && pitchedIndex % 2 === 0) {
    let motifTarget = preset.hookDegrees[hookIndex % preset.hookDegrees.length];
    if (anchorDegrees.length > 0) {
      motifTarget = anchorDegrees[hookIndex % anchorDegrees.length];
    }
    if (Math.abs(motifTarget - prevDegree) <= 2) {
      return applyPlacementBias(motifTarget, accent, weakBeat, plan, maxDegree);
    }
  }

  const blend = phraseBlendWeight(barIndex, totalBars, plan);
  const target = Math.round(hook * (1 - blend) + arcTarget * blend);
  const toTarget = target - prevDegree;
  const stepDir = toTarget === 0 ? 0 : toTarget > 0 ? 1 : -1;
  let next = prevDegree;

  const nearPhraseEnd = totalBars >= 4 && barIndex >= totalBars - 2;
  const leapThreshold = plan.plannerIntent ? 0.42 : 0.54;
  const leapSize = leapRate > 0.68 ? 4 : leapRate > 0.52 ? 3 : 2;
  const expressiveLeap =
    !nearPhraseEnd &&
    leapRate > leapThreshold &&
    pitchedIndex === Math.max(1, pitchedTotal - 2) &&
    Math.abs(toTarget) >= 3 &&
    accent;

  if (expressiveLeap) {
    next = prevDegree + (toTarget > 0 ? leapSize : -leapSize);
  } else if (leapRate > 0.72 && Math.abs(toTarget) >= 2 && accent && !nearPhraseEnd) {
    next = prevDegree + (toTarget > 0 ? 2 : -2);
  } else if (toTarget === 0 && pitchedIndex > 0) {
    const allowNeighbor = densityParams?.neighborOnWeakBeats ?? true;
    if (allowNeighbor || !weakBeat) {
      next = prevDegree + neighborOffset(pitchedIndex, barIndex, leapRate);
    }
  } else if (weakBeat && Math.abs(toTarget) >= passingMinLeap && chordToneBias < passingThreshold) {
    next = passingToneBetween(prevDegree, target, maxDegree);
  } else if (leapRate < 0.32 && Math.abs(toTarget) > 1) {
    next = prevDegree + stepDir;
  } else {
    next = prevDegree + stepDir;
  }

  if (weakBeat && chordToneBias < 0.72) {
    return clampDegree(next, maxDegree);
  }

  if (accent && chordToneBias > 0.4) {
    next = nearestChordTone(next, maxDegree);
  }

  return clampDegree(next, maxDegree);
}

function phraseBlendWeight(barIndex: number, totalBars: number, plan: MusicPlan): number {
  const base = totalBars >= 4 ? 0.35 + (barIndex % 4) * 0.12 : 0.25;
  const contour = effectiveContour(plan);
  if (contour === 'static') return base * 0.5;
  if (contour === 'ascending' || contour === 'descending') return Math.min(0.72, base + 0.15);
  return base;
}

function applyPlacementBias(
  degree: number,
  accent: boolean,
  weakBeat: boolean,
  plan: MusicPlan,
  maxDegree = 6,
): number {
  const chordToneBias = effectiveChordToneBias(plan);
  const clamped = clampDegree(degree, maxDegree);
  if (weakBeat && chordToneBias < 0.72) return clamped;
  if (accent && chordToneBias > 0.4) return nearestChordTone(clamped, maxDegree);
  return clamped;
}

function passingToneBetween(from: number, to: number, maxDegree = 6): number {
  const mid = Math.round((from + to) / 2);
  const candidate = clampDegree(mid, maxDegree);
  if (PASSING_TONE_DEGREES.includes(candidate as (typeof PASSING_TONE_DEGREES)[number])) {
    return candidate;
  }
  return from + (to > from ? 1 : -1);
}

function isWeakBeat(slot: RhythmSlot, pitchedIndex: number, pitchedTotal: number): boolean {
  return !isAccent(slot, pitchedIndex, pitchedTotal);
}

function neighborOffset(pitchedIndex: number, barIndex: number, leapRate: number): number {
  const pattern = leapRate > 0.55 ? [0, 2, -2, 0, 1, -1] : [0, 1, -1, 0, 1, -1];
  const barFlip = barIndex % 2 === 1 ? -1 : 1;
  return pattern[pitchedIndex % pattern.length] * barFlip;
}

function isAccent(slot: RhythmSlot, pitchedIndex: number, pitchedTotal: number): boolean {
  if (slot.accent) return true;
  if (slot.duration >= 1) return true;
  return pitchedIndex === 0 || pitchedIndex === pitchedTotal - 1;
}

function nearestChordTone(degree: number, maxDegree = 6): number {
  const tones = chordToneDegreesForScale(maxDegree);
  let best = tones[0];
  let bestDist = 99;
  for (const tone of tones) {
    const dist = Math.abs(tone - degree);
    if (dist < bestDist) {
      bestDist = dist;
      best = tone;
    }
  }
  return best;
}

function chordToneDegreesForScale(maxDegree: number): number[] {
  if (maxDegree <= 4) return [0, 2, maxDegree];
  return [0, 2, 4];
}

function clampDegree(degree: number, maxDegree = 6): number {
  return Math.max(0, Math.min(maxDegree, degree));
}

// ─── Motif build / vary / cadence ────────────────────────────────────────────

/** Build a single motif bar (rhythm + degrees + tokens). */
export function buildMotif(
  plan: MusicPlan,
  scale: ScaleContext,
  preset: StylePreset,
  barOffset: number,
  seed: number,
): MotifBar {
  const rhythm = buildRhythmPattern(plan, preset, barOffset);
  const degrees: number[] = [];
  let prev: number | null = null;
  let prevInterval: number | null = null;
  let hookIndex = (seed + barOffset * 2) % preset.hookDegrees.length;
  let pitchedIndex = 0;
  const pitchedTotal = rhythm.filter((s) => !s.rest).length;

  for (const slot of rhythm) {
    if (slot.rest) continue;
    const degree = chooseNextDegree(
      prev,
      prevInterval,
      pitchedIndex,
      pitchedTotal,
      slot,
      plan,
      preset,
      hookIndex,
      barOffset,
      plan.bars,
      scale,
    );
    if (prev !== null) {
      prevInterval = degree - prev;
    }
    degrees.push(degree);
    prev = degree;
    hookIndex++;
    pitchedIndex++;
  }

  const tokens = rhythmToTokens(rhythm, degrees, scale.notes, plan);
  return { rhythm, degrees, tokens };
}

/** Apply phrase-level variation to a motif bar. */
export function varyMotif(bar: MotifBar, ctx: VaryMotifContext): MotifBar {
  if (ctx.cycle === 0 && ctx.barIndex < ctx.plan.motifLength) {
    return bar;
  }

  const shape = ctx.phraseShape;
  const isDevelopBar = ctx.totalBars >= 4 && ctx.barIndex === 2 && shape !== 'exact-repeat';

  if (shape === 'exact-repeat') {
    return { ...bar, tokens: bar.tokens.map((t) => ({ ...t })), degrees: [...bar.degrees] };
  }

  if (isDevelopBar) {
    return developBar(bar, ctx);
  }

  if (shape === 'call-response' && ctx.barIndex % 2 === 1) {
    return callResponseBar(bar, ctx);
  }

  const slots = bar.tokens.map((t) => ({ ...t }));
  const degrees = [...bar.degrees];

  if (shape === 'slight-variation' || shape === 'call-response') {
    const intent = ctx.plan.plannerIntent;
    const variationCount = intent
      ? (intent.variationLevel > 0.55 ? 2 : intent.variationLevel > 0.3 ? 1 : 0)
      : (ctx.plan.variationRate > 0.55 ? 2 : 1);
    for (let v = 0; v < variationCount; v++) {
      const targetIdx = findPitchedIndex(
        slots,
        (ctx.barIndex + ctx.cycle + v) % Math.max(1, degrees.length),
      );
      if (targetIdx < 0 || slots[targetIdx].pitch === 'rest') continue;

      const degIdx = mapTokenToDegreeIndex(slots, targetIdx);
      if (degIdx < 0) continue;

      const step = ctx.plan.stepLeapBalance > 0.55 ? 2 : 1;
      const direction = (ctx.barIndex + v) % 2 === 0 ? step : -step;
      degrees[degIdx] = clampDegree(degrees[degIdx] + direction);
      slots[targetIdx] = retokenize(slots[targetIdx], degrees[degIdx], ctx.scaleNotes, ctx.plan);
    }
  }

  return { rhythm: bar.rhythm, degrees, tokens: slots.map((t) => clampRegister(t, ctx.plan)) };
}

/** Bar 3 of a 4-bar phrase: lift contour while keeping rhythm. */
function developBar(bar: MotifBar, ctx: VaryMotifContext): MotifBar {
  const lift = effectiveContour(ctx.plan) === 'descending' ? -1 : 1;
  const degrees = bar.degrees.map((d) => clampDegree(d + lift));
  const tokens = bar.tokens.map((token, i) => {
    if (token.pitch === 'rest') return { ...token };
    const degIdx = mapTokenToDegreeIndex(bar.tokens, i);
    if (degIdx < 0) return { ...token };
    return retokenize(token, degrees[degIdx], ctx.scaleNotes, ctx.plan);
  });
  return { ...bar, degrees, tokens: tokens.map((t) => clampRegister(t, ctx.plan)) };
}

function callResponseBar(bar: MotifBar, ctx: VaryMotifContext): MotifBar {
  const degrees = bar.degrees.map((d) => clampDegree(d - (ctx.plan.mode === 'minor' ? 1 : 2)));
  const tokens = bar.tokens.map((token, i) => {
    if (token.pitch === 'rest') return { ...token };
    const degIdx = mapTokenToDegreeIndex(bar.tokens, i);
    if (degIdx < 0) return { ...token };
    const lowered = degrees[degIdx];
    return retokenize(token, lowered, ctx.scaleNotes, ctx.plan);
  });
  return { ...bar, degrees, tokens: tokens.map((t) => clampRegister(t, ctx.plan)) };
}

/** Penultimate bar: approach dominant/subdominant before final cadence. */
export function applyPenultimateSetup(
  bar: MotifBar,
  plan: MusicPlan,
  scale: ScaleContext,
  preset: StylePreset,
): MotifBar {
  const slots = bar.tokens.map((t) => ({ ...t }));
  const pitched = slots
    .map((t, i) => (t.pitch !== 'rest' ? i : -1))
    .filter((i) => i >= 0);

  if (pitched.length === 0) return bar;

  const approach = preset.turnaroundDegrees.length >= 2
    ? preset.turnaroundDegrees.slice(0, -1)
    : [4, 2];
  const tailCount = Math.min(approach.length, pitched.length);

  for (let t = 0; t < tailCount; t++) {
    const slotIdx = pitched[pitched.length - tailCount + t];
    const degree = approach[t];
    const midi = scale.notes[degree % scale.notes.length];
    slots[slotIdx] = clampRegister(
      makeNote(midi, slots[slotIdx].duration, plan.velocity + 2),
      plan,
    );
  }

  return {
    rhythm: bar.rhythm,
    degrees: [...bar.degrees],
    tokens: slots,
  };
}

/** Turnaround cadence on the final loop bar — resolve toward tonic. */
export function applyCadence(
  bar: MotifBar,
  plan: MusicPlan,
  scale: ScaleContext,
  preset: StylePreset,
): MotifBar {
  const slots = bar.tokens.map((t) => ({ ...t }));
  const pitched = slots
    .map((t, i) => (t.pitch !== 'rest' ? i : -1))
    .filter((i) => i >= 0);

  if (pitched.length === 0) return bar;

  const turnaround = preset.turnaroundDegrees;
  const tailCount = Math.min(turnaround.length, pitched.length);

  for (let t = 0; t < tailCount; t++) {
    const slotIdx = pitched[pitched.length - tailCount + t];
    const degree = turnaround[t];
    const midi = scale.notes[degree % scale.notes.length];
    const isFinal = t === tailCount - 1;
    const vel = plan.velocity + (isFinal ? 10 : 4);
    let duration = slots[slotIdx].duration;
    if (isFinal && plan.cadenceStrength > 0.5 && duration < 1) {
      duration = Math.min(2, duration + 0.5);
    }
    slots[slotIdx] = makeNote(midi, duration, vel);
  }

  const lastIdx = pitched[pitched.length - 1];
  const tonic = scale.notes[0];
  const holdDuration = plan.cadenceStrength > 0.55
    ? Math.max(slots[lastIdx].duration, 1)
    : slots[lastIdx].duration;
  slots[lastIdx] = clampRegister(makeNote(tonic, holdDuration, plan.velocity + 10), plan);
  slots[lastIdx].source = formatSource(slots[lastIdx]);

  return {
    rhythm: bar.rhythm,
    degrees: [...bar.degrees],
    tokens: slots.map((t) => clampRegister(t, plan)),
  };
}

/** Keep generated notes in a practical MIDI range. */
export function clampRegister(token: NoteToken, plan?: MusicPlan): NoteToken {
  if (token.pitch === 'rest') return token;

  const bounds = plan ? melodyMidiBounds(plan) : { min: MIN_MELODY_MIDI, max: MAX_MELODY_MIDI };
  let midi = token.midiNote;
  while (midi < bounds.min) midi += 12;
  while (midi > bounds.max) midi -= 12;
  midi = Math.max(bounds.min, Math.min(bounds.max, midi));

  if (midi === token.midiNote) return token;
  const pitch = midiToPitch(midi);
  const updated = { ...token, midiNote: midi, pitch };
  updated.source = formatSource(updated);
  return updated;
}

// ─── Phrase assembly ─────────────────────────────────────────────────────────

export function buildMotifSeed(
  plan: MusicPlan,
  scale: ScaleContext,
  preset: StylePreset,
  seed: number,
): MotifBar[] {
  const bars: MotifBar[] = [];
  for (let b = 0; b < plan.motifLength; b++) {
    bars.push(buildMotif(plan, scale, preset, b, seed));
  }
  return bars;
}

export function tilePhrase(
  seedMotif: MotifBar[],
  plan: MusicPlan,
  scale: ScaleContext,
  preset: StylePreset,
): MotifBar[] {
  const phraseShape = resolvePhraseShape(plan, preset);
  const usePhraseDevelopment = Boolean(plan.plannerIntent);
  const phraseWindow = phraseWindowSize(plan);
  const result: MotifBar[] = [];

  for (let barIndex = 0; barIndex < plan.bars; barIndex++) {
    const motifIndex = barIndex % seedMotif.length;
    const cycle = Math.floor(barIndex / phraseWindow);
    const seedBar = seedMotif[motifIndex];

    let bar: MotifBar;
    if (usePhraseDevelopment) {
      const strategy = resolvePhraseStrategy(plan, barIndex, cycle, motifIndex);
      bar = developPhraseBar(seedBar, {
        plan,
        preset,
        phraseShape,
        barIndex,
        cycle,
        motifIndex,
        totalBars: plan.bars,
        scaleNotes: scale.notes,
        phraseWindow,
        strategy,
        maxDegree: scale.maxDegree,
      });
    } else {
      const legacyCycle = Math.floor(barIndex / seedMotif.length);
      bar =
        legacyCycle === 0 && barIndex < seedMotif.length
          ? seedBar
          : varyMotif(seedBar, {
              plan,
              preset,
              phraseShape,
              barIndex,
              cycle: legacyCycle,
              motifIndex,
              totalBars: plan.bars,
              scaleNotes: scale.notes,
            });
    }

    const isPenultimate = plan.bars >= 4 && barIndex === plan.bars - 2;
    if (isPenultimate) {
      bar = applyPenultimateSetup(bar, plan, scale, preset);
    }

    const isLoopEnd = plan.bars >= 4 && barIndex === plan.bars - 1;
    if (isLoopEnd) {
      bar = applyCadence(bar, plan, scale, preset);
    }

    result.push(bar);
  }

  return result;
}

// ─── Scale & tokens ──────────────────────────────────────────────────────────

export function buildScaleContext(plan: MusicPlan): ScaleContext {
  const brightnessShift = Math.round((plan.brightness - 0.5) * 4);
  const intent = plan.plannerIntent;
  const resolved = intent
    ? resolvePlannerScale(intent.scaleType, plan.mode)
    : resolvePlannerScale(plan.mode, plan.mode);
  const intervals = resolved.intervals;

  if (!intent) {
    const root =
      keyToPitchClass(plan.key) +
      (REGISTER_OCTAVE[plan.register] + 1) * 12 +
      brightnessShift;

    const notes: number[] = [];
    for (let o = 0; o < 2; o++) {
      for (const iv of intervals) {
        notes.push(root + o * 12 + iv);
      }
    }

    const filtered = notes.filter((m) => m >= MIN_MELODY_MIDI && m <= MAX_MELODY_MIDI);
    return {
      notes: filtered.length > 0 ? filtered : notes,
      rootMidi: root,
      scaleId: resolved.id,
      maxDegree: resolved.maxDegree,
    };
  }

  const bounds = melodyMidiBounds(plan);
  const centerMidi = Math.round((bounds.min + bounds.max) / 2);
  const root =
    intent.registerBias === 'wide'
      ? centerMidi - 12 + (intervals[0] ?? 0)
      : keyToPitchClass(plan.key) +
        (REGISTER_OCTAVE[plan.register] + 1) * 12 +
        brightnessShift;

  const notes: number[] = [];
  for (let o = -1; o < 3; o++) {
    for (const iv of intervals) {
      notes.push(root + o * 12 + iv);
    }
  }

  const filtered = notes.filter((m) => m >= bounds.min && m <= bounds.max);
  const fallback = notes.filter((m) => m >= MIN_MELODY_MIDI && m <= MAX_MELODY_MIDI);
  return {
    notes: filtered.length > 0 ? filtered : fallback,
    rootMidi: root,
    scaleId: resolved.id,
    maxDegree: resolved.maxDegree,
  };
}

function keyToPitchClass(key: string): number {
  const enharmonic: Record<string, string> = {
    Cb: 'B', Db: 'C#', Eb: 'D#', Fb: 'E', Gb: 'F#', Ab: 'G#', Bb: 'A#',
  };
  const resolved = enharmonic[key] ?? key;
  const idx = NOTE_NAMES.indexOf(resolved);
  return idx < 0 ? 0 : idx;
}

function rhythmToTokens(
  rhythm: RhythmSlot[],
  degrees: number[],
  scale: number[],
  plan: MusicPlan,
): NoteToken[] {
  const tokens: NoteToken[] = [];
  let degreeIdx = 0;

  for (const slot of rhythm) {
    if (slot.rest) {
      tokens.push(makeRest(slot.duration, plan.velocity));
      continue;
    }
    const degree = degrees[degreeIdx++];
    const midi = scale[degree % scale.length];
    tokens.push(clampRegister(makeNote(midi, slot.duration, plan.velocity), plan));
  }

  return tokens;
}

function retokenize(
  token: NoteToken,
  degree: number,
  scaleNotes: number[],
  plan?: MusicPlan,
): NoteToken {
  const midi = scaleNotes[degree % scaleNotes.length];
  return clampRegister(makeNote(midi, token.duration, token.velocity), plan);
}

function findPitchedIndex(tokens: NoteToken[], nth: number): number {
  let count = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].pitch === 'rest') continue;
    if (count === nth) return i;
    count++;
  }
  return -1;
}

function mapTokenToDegreeIndex(tokens: NoteToken[], tokenIndex: number): number {
  let deg = 0;
  for (let i = 0; i < tokenIndex; i++) {
    if (tokens[i].pitch !== 'rest') deg++;
  }
  return tokens[tokenIndex].pitch === 'rest' ? -1 : deg;
}

function makeNote(midi: number, duration: number, velocity: number): NoteToken {
  const clamped = Math.max(0, Math.min(127, Math.round(midi)));
  const pitch = midiToPitch(clamped);
  const token: NoteToken = {
    pitch,
    midiNote: clamped,
    duration,
    dotted: false,
    velocity,
    source: '',
  };
  token.source = formatSource(token);
  return token;
}

function makeRest(duration: number, velocity: number): NoteToken {
  const token: NoteToken = {
    pitch: 'rest',
    midiNote: -1,
    duration,
    dotted: false,
    velocity,
    source: '',
  };
  token.source = formatSource(token);
  return token;
}

export function formatSource(token: NoteToken): string {
  const sym = beatsToDurationSymbol(token.duration);
  const pitch = token.pitch === 'rest' ? 'R' : token.pitch;
  const vel = token.velocity !== 80 ? `:${token.velocity}` : '';
  const dotted = token.dotted ? '.' : '';
  return `${pitch} ${sym}${dotted}${vel}`;
}

export function beatsToDurationSymbol(beats: number): string {
  if (Math.abs(beats - 4) < 0.01) return 'w';
  if (Math.abs(beats - 2) < 0.01) return 'h';
  if (Math.abs(beats - 1.5) < 0.01) return 'h';
  if (Math.abs(beats - 1) < 0.01) return 'q';
  if (Math.abs(beats - 0.5) < 0.01) return 'e';
  if (Math.abs(beats - 0.25) < 0.01) return 's';
  return 'q';
}

export function groupTokensIntoBars(tokens: NoteToken[], beatsPerBar: number): Bar[] {
  const bars: Bar[] = [];
  let current: NoteToken[] = [];
  let beatBudget = 0;
  let barIndex = 0;
  const EPS = 0.001;

  for (const token of tokens) {
    current.push(token);
    beatBudget += token.duration;

    if (Math.abs(beatBudget - beatsPerBar) < EPS || beatBudget >= beatsPerBar - EPS) {
      bars.push({
        index: barIndex,
        notes: current,
        totalBeats: beatBudget,
        expectedBeats: beatsPerBar,
        issues: [],
      });
      barIndex++;
      current = [];
      beatBudget = 0;
    }
  }

  if (current.length > 0) {
    bars.push({
      index: barIndex,
      notes: current,
      totalBeats: beatBudget,
      expectedBeats: beatsPerBar,
      issues: [],
    });
  }

  return bars;
}

export function planSeed(plan: MusicPlan): number {
  let h = 0;
  const s = `${plan.key}${plan.mode}${plan.genre}${plan.tempo}${plan.bars}${plan.contour}${plan.groove}${plan.energy}${plan.motifStrength}`;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Last pitched note should share pitch class with scale root for loop closure. */
export function endsOnTonic(tokens: NoteToken[], rootMidi: number): boolean {
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i].pitch === 'rest') continue;
    return tokens[i].midiNote % 12 === rootMidi % 12;
  }
  return false;
}

/** Count intentional rests — groove presets should include some. */
export function restCount(tokens: NoteToken[]): number {
  return tokens.filter((t) => t.pitch === 'rest').length;
}
