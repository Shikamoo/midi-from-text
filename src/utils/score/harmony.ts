/**
 * Deterministic diatonic harmony derived from a generated melody + MusicPlan.
 * Block chords per bar (or per half-bar when density is 2-per-bar).
 */

import { midiToPitch } from '../../types/music';
import type {
  Bar,
  HarmonyChordComplexity,
  HarmonyGenerationSettings,
  NoteEvent,
  NoteToken,
  ParsedScore,
} from '../../types/music';
import type { MusicPlan } from '../../types/musicPlan';
import {
  DEFAULT_HARMONY_GENERATION,
  effectiveHarmonyCadence,
  voicingWidthParams,
} from '../harmonySettings';
import {
  minVoicingMidiForDensity,
  penultimateHarmonyDegree,
  resolveHarmonyContext,
  type HarmonyContext,
} from './harmonyIntent';
import type { ScaleContext, StylePreset } from './types';

/** GM program for the harmony track when exporting prompt-generated scores. */
export const HARMONY_INSTRUMENT = 48; // String Ensemble

/** Diatonic chord qualities as semitone offsets from the chord root. */
const MAJOR_DIATONIC: Record<number, { triad: number[]; seventh: number[] }> = {
  0: { triad: [0, 4, 7], seventh: [0, 4, 7, 11] },
  1: { triad: [0, 3, 7], seventh: [0, 3, 7, 10] },
  2: { triad: [0, 3, 7], seventh: [0, 3, 7, 10] },
  3: { triad: [0, 4, 7], seventh: [0, 4, 7, 11] },
  4: { triad: [0, 4, 7], seventh: [0, 4, 7, 10] },
  5: { triad: [0, 3, 7], seventh: [0, 3, 7, 10] },
  6: { triad: [0, 3, 6], seventh: [0, 3, 6, 10] },
};

const MINOR_DIATONIC: Record<number, { triad: number[]; seventh: number[] }> = {
  0: { triad: [0, 3, 7], seventh: [0, 3, 7, 10] },
  1: { triad: [0, 3, 6], seventh: [0, 3, 6, 10] },
  2: { triad: [0, 4, 7], seventh: [0, 4, 7, 11] },
  3: { triad: [0, 3, 7], seventh: [0, 3, 7, 10] },
  4: { triad: [0, 3, 7], seventh: [0, 3, 7, 10] },
  5: { triad: [0, 4, 7], seventh: [0, 4, 7, 11] },
  6: { triad: [0, 4, 7], seventh: [0, 4, 7, 10] },
};

/** Modal seventh spellings for guide-tone shells (semitones from chord root). */
const DORIAN_SEVENTHS: number[][] = [
  [0, 3, 7, 10],
  [0, 3, 7, 10],
  [0, 4, 7, 11],
  [0, 4, 7, 11],
  [0, 3, 7, 10],
  [0, 3, 7, 10],
  [0, 4, 7, 10],
];

const MIXOLYDIAN_SEVENTHS: number[][] = [
  [0, 4, 7, 10],
  [0, 3, 7, 10],
  [0, 3, 6, 10],
  [0, 4, 7, 11],
  [0, 3, 7, 10],
  [0, 3, 7, 10],
  [0, 4, 7, 11],
];

export type GuideToneShellQuality = 'major7' | 'minor7' | 'dominant7' | 'unsupported';

export function classifyGuideToneShellQuality(
  thirdOffset: number,
  seventhOffset: number,
): GuideToneShellQuality {
  if (thirdOffset === 4 && seventhOffset === 11) return 'major7';
  if (thirdOffset === 3 && seventhOffset === 10) return 'minor7';
  if (thirdOffset === 4 && seventhOffset === 10) return 'dominant7';
  return 'unsupported';
}

/** Semitone offsets for 3rd and 7th guide tones, or null when shells should fall back. */
export function guideToneShellSemitones(
  rootDegree: number,
  ctx: HarmonyContext,
): [number, number] | null {
  const degree = rootDegree % 7;

  if (ctx.scaleId === 'major' || ctx.harmonyMode === 'major') {
    const chord = MAJOR_DIATONIC[degree].seventh;
    return [chord[1], chord[3]];
  }
  if (ctx.scaleId === 'minor' || ctx.harmonyMode === 'minor') {
    const chord = MINOR_DIATONIC[degree].seventh;
    return [chord[1], chord[3]];
  }
  if (ctx.scaleId === 'dorian') {
    const chord = DORIAN_SEVENTHS[degree];
    return [chord[1], chord[3]];
  }
  if (ctx.scaleId === 'mixolydian') {
    const chord = MIXOLYDIAN_SEVENTHS[degree];
    return [chord[1], chord[3]];
  }
  return null;
}

interface WeightedDegree {
  degree: number;
  weight: number;
}

/** Derive one block chord per bar underneath the melody. */
export function deriveHarmony(
  melodyScore: Pick<ParsedScore, 'bars'>,
  plan: MusicPlan,
  scale: ScaleContext,
  preset: StylePreset,
  settings: HarmonyGenerationSettings = DEFAULT_HARMONY_GENERATION,
): NoteToken[] {
  const totalBars = melodyScore.bars.length;
  if (totalBars === 0) return [];

  const harmonyCtx = resolveHarmonyContext(plan, scale);
  const intervals = harmonyCtx.intervals;
  const rootPc = ((scale.rootMidi % 12) + 12) % 12;
  const voicingParams = voicingWidthParams(settings.voicingWidth);
  const harmonyCadence = effectiveHarmonyCadence(plan.cadenceStrength, settings);
  const tokens: NoteToken[] = [];
  let prevVoicing: number[] | null = null;
  let prevRootDegree = 0;
  const slotsPerBar = settings.chordDensity === '2-per-bar' ? 2 : 1;

  for (let barIndex = 0; barIndex < totalBars; barIndex++) {
    const bar = melodyScore.bars[barIndex];
    const isFinalBar = barIndex === totalBars - 1;
    const isPenultimate = barIndex === totalBars - 2;

    if (slotsPerBar === 1) {
      const block = buildHarmonyBlock(
        bar,
        barIndex,
        totalBars,
        plan,
        preset,
        rootPc,
        intervals,
        prevRootDegree,
        prevVoicing,
        isFinalBar,
        isPenultimate,
        plan.beatsPerBar,
        settings,
        voicingParams,
        harmonyCadence,
        undefined,
        harmonyCtx,
      );
      tokens.push(...block.tokens);
      prevVoicing = block.voicing;
      prevRootDegree = block.rootDegree;
      continue;
    }

    const halfBeat = plan.beatsPerBar / 2;
    const firstHalf = sliceBarByBeats(bar, 0, halfBeat);
    const secondHalf = sliceBarByBeats(bar, halfBeat, plan.beatsPerBar);
    const [firstRoot, secondRoot] = resolveTwoChordRoots(
      bar,
      firstHalf,
      secondHalf,
      barIndex,
      plan,
      preset,
      rootPc,
      intervals,
      prevRootDegree,
      isFinalBar,
      isPenultimate,
      settings.chordComplexity,
      harmonyCadence,
      harmonyCtx,
    );

    const firstBlock = buildHarmonyBlock(
      firstHalf,
      barIndex,
      totalBars,
      plan,
      preset,
      rootPc,
      intervals,
      prevRootDegree,
      prevVoicing,
      isFinalBar,
      false,
      halfBeat,
      settings,
      voicingParams,
      harmonyCadence,
      firstRoot,
      harmonyCtx,
    );
    tokens.push(...firstBlock.tokens);

    const secondBlock = buildHarmonyBlock(
      secondHalf,
      barIndex,
      totalBars,
      plan,
      preset,
      rootPc,
      intervals,
      firstRoot,
      firstBlock.voicing,
      isFinalBar,
      isPenultimate,
      halfBeat,
      settings,
      voicingParams,
      harmonyCadence,
      secondRoot,
      harmonyCtx,
    );
    tokens.push(...secondBlock.tokens);

    prevVoicing = secondBlock.voicing;
    prevRootDegree = secondRoot;
  }

  return tokens;
}

interface HarmonyBlockResult {
  tokens: NoteToken[];
  voicing: number[];
  rootDegree: number;
}

function buildHarmonyBlock(
  bar: Bar,
  barIndex: number,
  _totalBars: number,
  plan: MusicPlan,
  preset: StylePreset,
  rootPc: number,
  intervals: number[],
  prevRootDegree: number,
  prevVoicing: number[] | null,
  isFinalBar: boolean,
  isPenultimate: boolean,
  duration: number,
  settings: HarmonyGenerationSettings,
  voicingParams: ReturnType<typeof voicingWidthParams>,
  harmonyCadence: number,
  forcedRoot?: number,
  harmonyCtx?: HarmonyContext,
): HarmonyBlockResult {
  const ctx = harmonyCtx ?? resolveHarmonyContext(plan, { notes: [], rootMidi: rootPc + 60 });
  const rootDegree = forcedRoot ?? (isFinalBar
    ? 0
    : chooseChordRoot(
        bar,
        barIndex,
        plan,
        preset,
        rootPc,
        intervals,
        prevRootDegree,
        isPenultimate,
        settings.chordComplexity,
        harmonyCadence,
        ctx,
      ));

  const melodyFloor = lowestMelodyMidi(bar);
  let voicing = voiceAccompaniment(
    rootDegree,
    intervals,
    rootPc,
    melodyFloor,
    prevVoicing,
    settings,
    voicingParams,
    plan.mode,
    ctx,
  );

  if (settings.bassDoubling && ctx.omitRootWhenBass) {
    voicing = omitChordRoot(voicing, rootDegree, intervals, rootPc);
    if (voicing.length < 2) {
      voicing = voiceShell(
        rootDegree,
        intervals,
        rootPc,
        melodyFloor,
        prevVoicing,
        settings,
        voicingParams,
        ctx,
        true,
      );
    }
  }

  const harmonyVelocity = Math.max(
    40,
    Math.min(90, Math.round(plan.velocity * 0.62)),
  );

  const tokens: NoteToken[] = [];
  for (const midi of voicing) {
    tokens.push(makeHarmonyNote(midi, duration, harmonyVelocity));
  }

  if (settings.bassDoubling) {
    const bassMidi = placeBassRootDoubling(
      rootDegree,
      intervals,
      rootPc,
      voicing,
      voicingParams,
    );
    const bassVelocity = Math.max(35, Math.round(harmonyVelocity * 0.88));
    tokens.push(makeHarmonyNote(bassMidi, duration, bassVelocity));
  }

  return { tokens, voicing, rootDegree };
}

function resolveTwoChordRoots(
  bar: Bar,
  firstHalf: Bar,
  secondHalf: Bar,
  barIndex: number,
  plan: MusicPlan,
  preset: StylePreset,
  rootPc: number,
  intervals: number[],
  prevRootDegree: number,
  isFinalBar: boolean,
  isPenultimate: boolean,
  chordComplexity: HarmonyChordComplexity,
  harmonyCadence: number,
  harmonyCtx: HarmonyContext,
): [number, number] {
  if (isFinalBar) return [0, 0];

  const firstRoot = chooseChordRoot(
    firstHalf,
    barIndex,
    plan,
    preset,
    rootPc,
    intervals,
    prevRootDegree,
    false,
    chordComplexity,
    harmonyCadence,
    harmonyCtx,
  );

  const secondCandidate = chooseChordRoot(
    secondHalf,
    barIndex,
    plan,
    preset,
    rootPc,
    intervals,
    firstRoot,
    isPenultimate,
    chordComplexity,
    harmonyCadence,
    harmonyCtx,
  );

  if (secondCandidate === firstRoot) {
    return [firstRoot, firstRoot];
  }

  const barDegrees = collectStrongMelodyDegrees(bar, rootPc, intervals);
  const secondDegrees = collectStrongMelodyDegrees(secondHalf, rootPc, intervals);
  const firstOnBar = scoreChordAgainstMelody(firstRoot, barDegrees, chordComplexity, harmonyCtx.degreeCount);
  const firstOnSecond = scoreChordAgainstMelody(firstRoot, secondDegrees, chordComplexity, harmonyCtx.degreeCount);
  const candidateOnSecond = scoreChordAgainstMelody(
    secondCandidate,
    secondDegrees,
    chordComplexity,
    harmonyCtx.degreeCount,
  );
  const changeMargin = 1.75 + harmonyCadence * 0.75;

  if (firstOnBar >= candidateOnSecond * 0.9 && firstOnSecond + changeMargin * 0.5 >= candidateOnSecond) {
    return [firstRoot, firstRoot];
  }

  if (candidateOnSecond >= firstOnSecond + changeMargin) {
    return [firstRoot, secondCandidate];
  }

  return [firstRoot, firstRoot];
}

function sliceBarByBeats(bar: Bar, startBeat: number, endBeat: number): Bar {
  const notes: NoteToken[] = [];
  let beat = 0;

  for (const note of bar.notes) {
    const noteStart = beat;
    const noteEnd = beat + note.duration;
    beat = noteEnd;

    if (noteEnd <= startBeat || noteStart >= endBeat) continue;

    const clipStart = Math.max(noteStart, startBeat);
    const clipEnd = Math.min(noteEnd, endBeat);
    const clippedDuration = clipEnd - clipStart;
    if (clippedDuration <= 0.001) continue;

    notes.push({ ...note, duration: clippedDuration });
  }

  return {
    ...bar,
    notes,
    totalBeats: endBeat - startBeat,
    expectedBeats: endBeat - startBeat,
    issues: [],
  };
}

function chooseChordRoot(
  bar: Bar,
  barIndex: number,
  plan: MusicPlan,
  preset: StylePreset,
  rootPc: number,
  intervals: number[],
  prevRootDegree: number,
  isPenultimate: boolean,
  chordComplexity: HarmonyChordComplexity,
  harmonyCadence: number,
  harmonyCtx?: HarmonyContext,
): number {
  const degreeCount = harmonyCtx?.degreeCount ?? 7;
  const strongDegrees = collectStrongMelodyDegrees(bar, rootPc, intervals);
  const styleHint = preset.turnaroundDegrees[barIndex % preset.turnaroundDegrees.length];
  const cadenceBoost = harmonyCadence * 2.5;

  let bestDegree = 0;
  let bestScore = -Infinity;

  for (let degree = 0; degree < degreeCount; degree++) {
    let score = scoreChordAgainstMelody(degree, strongDegrees, chordComplexity, degreeCount);

    if (degree === styleHint % degreeCount) {
      score += 1.2 + plan.chordToneBias * 0.8;
    }

    if (isPenultimate) {
      const penultimateTarget = harmonyCtx
        ? penultimateHarmonyDegree(harmonyCtx, plan)
        : (plan.mode === 'major' ? 4 : 6);
      if (degree === penultimateTarget) score += cadenceBoost;
      if (degree === 4 % degreeCount) score += cadenceBoost * 0.35;
    }

    const rootMotion = Math.min(
      Math.abs(degree - prevRootDegree),
      degreeCount - Math.abs(degree - prevRootDegree),
    );
    score -= rootMotion * 0.25;

    if (score > bestScore) {
      bestScore = score;
      bestDegree = degree;
    }
  }

  return bestDegree;
}

function collectStrongMelodyDegrees(
  bar: Bar,
  rootPc: number,
  intervals: number[],
): WeightedDegree[] {
  const result: WeightedDegree[] = [];
  let beat = 0;
  let pitchedIndex = 0;
  const pitchedTotal = bar.notes.filter((n) => n.pitch !== 'rest').length;

  for (const note of bar.notes) {
    if (note.pitch === 'rest') {
      beat += note.duration;
      continue;
    }

    const degree = midiToScaleDegree(note.midiNote, rootPc, intervals);
    if (degree < 0) {
      beat += note.duration;
      pitchedIndex++;
      continue;
    }

    let weight = 1;
    if (pitchedIndex === 0 || beat < 0.01) weight += 2;
    if (note.duration >= 1) weight += 1.5;
    if (note.duration >= 2) weight += 1;
    if (pitchedIndex === pitchedTotal - 1) weight += 0.5;

    result.push({ degree, weight });
    beat += note.duration;
    pitchedIndex++;
  }

  return result;
}

function scoreChordAgainstMelody(
  rootDegree: number,
  strongDegrees: WeightedDegree[],
  chordComplexity: HarmonyChordComplexity,
  degreeCount = 7,
): number {
  const chordTones = chordToneDegrees(rootDegree, chordComplexity, degreeCount);
  let score = 0;

  for (const { degree, weight } of strongDegrees) {
    if (chordTones.includes(degree)) {
      score += weight;
    }
  }

  return score;
}

function chordToneDegrees(
  rootDegree: number,
  chordComplexity: HarmonyChordComplexity,
  degreeCount = 7,
): number[] {
  const n = degreeCount;
  const thirdOffset = Math.min(2, n - 1);
  const fifthOffset = Math.min(4, n - 1);
  const triad = [
    rootDegree % n,
    (rootDegree + thirdOffset) % n,
    (rootDegree + fifthOffset) % n,
  ];
  if (chordComplexity === 'triads') return triad;
  return [...triad, (rootDegree + Math.min(6, n - 1)) % n];
}

function voiceAccompaniment(
  rootDegree: number,
  intervals: number[],
  rootPc: number,
  melodyFloorMidi: number,
  prevVoicing: number[] | null,
  settings: HarmonyGenerationSettings,
  params: ReturnType<typeof voicingWidthParams>,
  mode: MusicPlan['mode'],
  ctx: HarmonyContext,
): number[] {
  const registerParams = {
    ...params,
    minVoicingMidi: minVoicingMidiForDensity(ctx.voicingDensity),
    baseOctave: ctx.voicingDensity === 'light' ? params.baseOctave + 1 : params.baseOctave,
  };

  if (ctx.accompanimentStyle === 'open-fifths') {
    return voiceOpenFifths(
      rootDegree, intervals, rootPc, melodyFloorMidi, prevVoicing, registerParams,
    );
  }
  if (ctx.accompanimentStyle === 'shell-voicing') {
    return voiceShell(
      rootDegree, intervals, rootPc, melodyFloorMidi, prevVoicing, settings, registerParams, ctx,
      settings.bassDoubling,
    );
  }
  if (ctx.accompanimentStyle === 'quartal-stack') {
    return voiceQuartalStack(
      rootDegree, intervals, rootPc, melodyFloorMidi, prevVoicing, registerParams,
    );
  }
  if (settings.chordComplexity === 'sevenths' && ctx.useDiatonicSevenths) {
    return voiceSeventh(
      rootDegree, intervals, rootPc, melodyFloorMidi, prevVoicing, settings, registerParams, mode,
    );
  }
  return voiceTriad(
    rootDegree, intervals, rootPc, melodyFloorMidi, prevVoicing, settings, registerParams,
  );
}

type VoicingParams = ReturnType<typeof voicingWidthParams> & {
  minVoicingMidi?: number;
};

function voiceShell(
  rootDegree: number,
  intervals: number[],
  rootPc: number,
  melodyFloorMidi: number,
  prevVoicing: number[] | null,
  settings: HarmonyGenerationSettings,
  params: VoicingParams,
  ctx: HarmonyContext,
  forceGuideTonesOnly = false,
): number[] {
  const guideOffsets = guideToneShellSemitones(rootDegree, ctx);
  if (!guideOffsets) {
    return voiceOpenFifths(
      rootDegree, intervals, rootPc, melodyFloorMidi, prevVoicing, params,
    );
  }

  const rootMidi = degreeToMidi(rootDegree % intervals.length, intervals, rootPc, params.baseOctave);
  const guideNotes = guideOffsets
    .map((offset) => rootMidi + offset)
    .sort((a, b) => a - b);

  const includeRoot = !forceGuideTonesOnly
    && !settings.bassDoubling
    && ctx.shellIncludeRoot;
  const notes = includeRoot ? [rootMidi, ...guideNotes] : guideNotes;
  const candidates = buildInversionCandidates(notes, settings.allowInversions);
  return pickBestVoicing(candidates, melodyFloorMidi, prevVoicing, params, notes.length);
}

function omitChordRoot(
  voicing: number[],
  rootDegree: number,
  intervals: number[],
  rootPc: number,
): number[] {
  const rootPcTarget = (rootPc + intervals[rootDegree % intervals.length]) % 12;
  const filtered = voicing.filter((midi) => (midi % 12) !== rootPcTarget);
  return filtered.length > 0 ? filtered : voicing;
}

function voiceOpenFifths(
  rootDegree: number,
  intervals: number[],
  rootPc: number,
  melodyFloorMidi: number,
  prevVoicing: number[] | null,
  params: VoicingParams,
): number[] {
  const n = intervals.length;
  const root = degreeToMidi(rootDegree % n, intervals, rootPc, params.baseOctave);
  const fifthDegree = (rootDegree + Math.max(2, Math.floor(n / 2))) % n;
  const fifth = degreeToMidi(fifthDegree, intervals, rootPc, params.baseOctave);
  return pickBestVoicing([[root, fifth]], melodyFloorMidi, prevVoicing, params, 2);
}

function voiceQuartalStack(
  rootDegree: number,
  intervals: number[],
  rootPc: number,
  melodyFloorMidi: number,
  prevVoicing: number[] | null,
  params: VoicingParams,
): number[] {
  const n = intervals.length;
  const root = degreeToMidi(rootDegree % n, intervals, rootPc, params.baseOctave);
  const fourth = degreeToMidi((rootDegree + 1) % n, intervals, rootPc, params.baseOctave);
  const fifthDegree = (rootDegree + Math.max(2, Math.floor(n / 2))) % n;
  const fifth = degreeToMidi(fifthDegree, intervals, rootPc, params.baseOctave);
  const notes = [root, fourth, fifth].sort((a, b) => a - b);
  return pickBestVoicing([notes], melodyFloorMidi, prevVoicing, params, notes.length);
}

function midiToScaleDegree(
  midi: number,
  rootPc: number,
  intervals: number[],
): number {
  const pc = ((midi % 12) + 12) % 12;
  const rel = ((pc - rootPc) + 12) % 12;
  const idx = intervals.indexOf(rel);
  if (idx >= 0) return idx;

  let best = -1;
  let bestDist = 99;
  for (let d = 0; d < intervals.length; d++) {
    const dist = Math.min(
      Math.abs(rel - intervals[d]),
      12 - Math.abs(rel - intervals[d]),
    );
    if (dist < bestDist) {
      bestDist = dist;
      best = d;
    }
  }
  return bestDist <= 1 ? best : -1;
}

function lowestMelodyMidi(bar: Bar): number {
  let min = 127;
  for (const note of bar.notes) {
    if (note.pitch !== 'rest' && note.midiNote < min) {
      min = note.midiNote;
    }
  }
  return min === 127 ? 72 : min;
}

function voiceTriad(
  rootDegree: number,
  intervals: number[],
  rootPc: number,
  melodyFloorMidi: number,
  prevVoicing: number[] | null,
  settings: HarmonyGenerationSettings,
  params: VoicingParams,
): number[] {
  const n = intervals.length;
  const baseRoot = degreeToMidi(rootDegree % n, intervals, rootPc, params.baseOctave);
  const third = degreeToMidi((rootDegree + 2) % n, intervals, rootPc, params.baseOctave);
  const fifth = degreeToMidi((rootDegree + Math.min(4, n - 1)) % n, intervals, rootPc, params.baseOctave);

  const rootPosition = [baseRoot, third, fifth];
  const candidates = buildInversionCandidates(rootPosition, settings.allowInversions);

  return pickBestVoicing(candidates, melodyFloorMidi, prevVoicing, params, 3);
}

function voiceSeventh(
  rootDegree: number,
  intervals: number[],
  rootPc: number,
  melodyFloorMidi: number,
  prevVoicing: number[] | null,
  settings: HarmonyGenerationSettings,
  params: VoicingParams,
  mode: MusicPlan['mode'],
): number[] {
  const table = mode === 'major' ? MAJOR_DIATONIC : MINOR_DIATONIC;
  const semitones = table[rootDegree % 7].seventh;
  const rootMidi = degreeToMidi(rootDegree, intervals, rootPc, params.baseOctave);
  const rootPosition = semitones.map((offset) => rootMidi + offset);
  const candidates = buildInversionCandidates(rootPosition, settings.allowInversions);

  return pickBestVoicing(candidates, melodyFloorMidi, prevVoicing, params, 4);
}

function buildInversionCandidates(notes: number[], allowInversions: boolean): number[][] {
  if (!allowInversions || notes.length <= 1) {
    return [notes];
  }

  const candidates: number[][] = [notes];
  for (let inversion = 1; inversion < notes.length; inversion++) {
    const bass = notes[inversion];
    const upper = [
      ...notes.slice(inversion + 1),
      ...notes.slice(0, inversion).map((n) => n + 12),
    ];
    candidates.push([bass, ...upper]);
  }
  return candidates;
}

function pickBestVoicing(
  candidates: number[][],
  melodyFloorMidi: number,
  prevVoicing: number[] | null,
  params: VoicingParams,
  chordSize: number,
): number[] {
  const ceiling = melodyFloorMidi - params.melodyGapSemitones;
  const minVoicingMidi = params.minVoicingMidi ?? 36;
  const maxComfortSpan = chordSize >= 4
    ? params.melodyGapSemitones + 10
    : chordSize <= 2 ? 16 : 24;

  let best = candidates[0];
  let bestCost = Infinity;

  for (const candidate of candidates) {
    const shifted = shiftVoicingBelowCeiling(candidate, ceiling, minVoicingMidi);
    const cost = voicingCost(shifted, prevVoicing, params.spanWeight, maxComfortSpan, minVoicingMidi);
    if (cost < bestCost) {
      bestCost = cost;
      best = shifted;
    }
  }

  return best.sort((a, b) => a - b);
}

function shiftVoicingBelowCeiling(
  voicing: number[],
  ceiling: number,
  _minVoicingMidi = 36,
): number[] {
  const out = [...voicing];
  while (Math.max(...out) > ceiling) {
    for (let i = 0; i < out.length; i++) {
      out[i] -= 12;
    }
  }
  while (Math.min(...out) < 36) {
    for (let i = 0; i < out.length; i++) {
      out[i] += 12;
    }
  }
  return out.map((m) => Math.max(36, Math.min(84, m)));
}

function voicingCost(
  voicing: number[],
  prevVoicing: number[] | null,
  spanWeight: number,
  maxComfortSpan = 24,
  minVoicingMidi = 36,
): number {
  const span = Math.max(...voicing) - Math.min(...voicing);
  const lowClusterPenalty = minVoicingMidi >= 52
    ? voicing.filter((m) => m < minVoicingMidi).length * 4
    : 0;

  if (!prevVoicing) {
    let cost = span + lowClusterPenalty;
    if (span > maxComfortSpan) cost += (span - maxComfortSpan) * 0.6;
    return cost;
  }

  const sortedPrev = [...prevVoicing].sort((a, b) => a - b);
  const sortedNext = [...voicing].sort((a, b) => a - b);
  const pairs = Math.min(sortedPrev.length, sortedNext.length);
  let motion = 0;
  for (let i = 0; i < pairs; i++) {
    motion += Math.abs(sortedNext[i] - sortedPrev[i]);
  }
  motion += Math.abs(sortedNext.length - sortedPrev.length) * 2;

  let cost = motion + span * spanWeight + lowClusterPenalty;
  if (span > maxComfortSpan) cost += (span - maxComfortSpan) * 0.6;
  return cost;
}

function degreeToMidi(
  degree: number,
  intervals: number[],
  rootPc: number,
  octave: number,
): number {
  const pc = (rootPc + intervals[degree % intervals.length]) % 12;
  return pc + (octave + 1) * 12;
}

const MIN_BASS_MIDI = 36;
const MIN_GAP_BELOW_VOICING = 8;
const ABSOLUTE_MIN_BASS_MIDI = 24;

/** Place a chord-root bass note clearly below the voiced chord. */
export function placeBassRootDoubling(
  rootDegree: number,
  intervals: number[],
  rootPc: number,
  voicing: number[],
  params: ReturnType<typeof voicingWidthParams>,
): number {
  const voicingMin = Math.min(...voicing);
  const targetCeiling = voicingMin - MIN_GAP_BELOW_VOICING;
  const chordRootPc = (rootPc + intervals[rootDegree % intervals.length]) % 12;

  let bass = degreeToMidi(rootDegree, intervals, rootPc, params.baseOctave - 1);
  while (bass > targetCeiling) {
    bass -= 12;
  }

  bass = snapToPitchClassAtOrBelow(Math.min(bass, targetCeiling), chordRootPc);
  while (bass < ABSOLUTE_MIN_BASS_MIDI) {
    bass += 12;
  }
  while (bass > targetCeiling) {
    bass -= 12;
  }

  const preferredFloor = targetCeiling < MIN_BASS_MIDI
    ? ABSOLUTE_MIN_BASS_MIDI
    : MIN_BASS_MIDI;
  if (bass < preferredFloor && bass + 12 <= targetCeiling) {
    bass += 12;
  }

  return Math.max(ABSOLUTE_MIN_BASS_MIDI, Math.min(84, bass));
}

function snapToPitchClassAtOrBelow(ceiling: number, pitchClass: number): number {
  let midi = ceiling - ((ceiling % 12) - pitchClass + 12) % 12;
  if (midi > ceiling) midi -= 12;
  return midi;
}

function makeHarmonyNote(midi: number, duration: number, velocity: number): NoteToken {
  const clamped = Math.max(0, Math.min(127, Math.round(midi)));
  return {
    pitch: midiToPitch(clamped),
    midiNote: clamped,
    duration,
    dotted: false,
    velocity,
    source: 'harmony',
  };
}

/** Convert block-chord tokens into timed note events for export. */
export function harmonyTokensToNoteEvents(
  harmonyTokens: NoteToken[],
  beatsPerBar: number,
  notesPerChord = 3,
): NoteEvent[] {
  const events: NoteEvent[] = [];
  let tick = 0;

  for (let i = 0; i < harmonyTokens.length; i += notesPerChord) {
    const chunk = harmonyTokens.slice(i, i + notesPerChord);
    if (chunk.length === 0) continue;

    const startTick = tick;
    const duration = chunk[0].duration;

    for (const token of chunk) {
      if (token.pitch === 'rest') continue;
      events.push({
        pitch: token.pitch,
        midiNote: token.midiNote,
        duration: token.duration,
        startTick,
        velocity: token.velocity,
      });
    }

    tick += duration;
    void beatsPerBar;
  }

  return events;
}
