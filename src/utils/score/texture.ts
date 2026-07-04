/**
 * Texture-aware accompaniment: bass lines and harmony settings from planner intent.
 */

import { midiToPitch, pitchToMidi } from '../../types/music';
import type {
  HarmonyGenerationSettings,
  NoteToken,
  ParsedScore,
} from '../../types/music';
import type { MusicPlan } from '../../types/musicPlan';
import { resolvePlannerIntent } from '../localPlanner/mappingAudit';
import type { ScaleContext, StylePreset } from './types';

export const BASS_INSTRUMENT = 32;

export function resolveHarmonySettingsForTexture(
  plan: MusicPlan,
  base: HarmonyGenerationSettings,
): HarmonyGenerationSettings {
  const intent = resolvePlannerIntent(plan);
  if (intent.texture === 'polyphonic') {
    return {
      ...base,
      chordDensity: '2-per-bar',
      chordComplexity: intent.harmonicComplexity > 0.55 ? 'sevenths' : base.chordComplexity,
      voicingWidth: intent.harmonicComplexity > 0.7 ? 'wide' : base.voicingWidth,
    };
  }
  if (intent.texture === 'melody+chords' && intent.harmonicComplexity > 0.65) {
    return { ...base, chordComplexity: 'sevenths' };
  }
  return base;
}

export function shouldGenerateHarmony(plan: MusicPlan): boolean {
  const texture = resolvePlannerIntent(plan).texture;
  return texture === 'melody+chords' || texture === 'polyphonic';
}

export function shouldGenerateBass(plan: MusicPlan): boolean {
  return resolvePlannerIntent(plan).texture === 'melody+bass';
}

/** Simple diatonic bass: root per bar (or two roots when syncopation is high). */
export function deriveBassLine(
  melodyScore: Pick<ParsedScore, 'bars'>,
  plan: MusicPlan,
  scale: ScaleContext,
  _preset: StylePreset,
): NoteToken[] {
  const intent = resolvePlannerIntent(plan);
  const tokens: NoteToken[] = [];
  const rootPc = ((scale.rootMidi % 12) + 12) % 12;
  const twoHits = intent.syncopationLevel > 0.5 && plan.beatsPerBar >= 4;

  for (let barIndex = 0; barIndex < melodyScore.bars.length; barIndex++) {
    const bar = melodyScore.bars[barIndex];
    const degree = inferBassDegree(bar, barIndex, plan.bars);
    const bassRoot = scale.notes[degree % scale.notes.length];
      const bassMidi = snapBassRegister(bassRoot, intent);

    if (twoHits) {
      const half = plan.beatsPerBar / 2;
      tokens.push(makeBassNote(bassMidi, half, plan.velocity - 18));
      const altDegree = (degree + 2) % scale.notes.length;
      const altMidi = snapBassRegister(scale.notes[altDegree], intent);
      tokens.push(makeBassNote(altMidi, half, plan.velocity - 22));
    } else {
      tokens.push(makeBassNote(bassMidi, plan.beatsPerBar, plan.velocity - 15));
    }
    void rootPc;
  }

  return tokens;
}

function inferBassDegree(
  bar: ParsedScore['bars'][number],
  barIndex: number,
  totalBars: number,
): number {
  const pitched = bar.notes.filter((t) => t.pitch !== 'rest');
  if (pitched.length > 0) {
    const deg = Math.min(6, Math.floor((pitched[0].midiNote % 12) / 2));
    return deg;
  }
  if (barIndex === totalBars - 1) return 0;
  return barIndex % 4 === 2 ? 4 : 0;
}

function snapBassRegister(
  referenceMidi: number,
  intent: ReturnType<typeof resolvePlannerIntent>,
): number {
  let target = referenceMidi - 24;
  if (intent.registerBias === 'low') target -= 12;
  if (intent.registerBias === 'wide') target -= 6;

  const minMidi = intent.melodicRange.min
    ? Math.min(pitchToMidi(intent.melodicRange.min), 48) - 12
    : 28;
  while (target < minMidi) target += 12;
  while (target > 60) target -= 12;
  return Math.max(28, Math.min(60, target));
}

function makeBassNote(midi: number, duration: number, velocity: number): NoteToken {
  const clamped = Math.max(0, Math.min(127, Math.round(midi)));
  return {
    pitch: midiToPitch(clamped),
    midiNote: clamped,
    duration,
    dotted: false,
    velocity: Math.max(40, velocity),
    source: 'bass',
  };
}

/** Count non-rest notes on a score (melody + optional tracks). */
export function scoreNoteCount(score: ParsedScore): number {
  let n = score.tokens.filter((t) => t.pitch !== 'rest').length;
  if (score.harmonyTokens) {
    n += score.harmonyTokens.filter((t) => t.pitch !== 'rest').length;
  }
  if (score.bassTokens) {
    n += score.bassTokens.filter((t) => t.pitch !== 'rest').length;
  }
  return n;
}

export function scoreTrackLayout(score: ParsedScore): {
  hasHarmony: boolean;
  hasBass: boolean;
  harmonyTokenCount: number;
  bassTokenCount: number;
} {
  return {
    hasHarmony: Boolean(score.harmonyTokens && score.harmonyTokens.length > 0),
    hasBass: Boolean(score.bassTokens && score.bassTokens.length > 0),
    harmonyTokenCount: score.harmonyTokens?.length ?? 0,
    bassTokenCount: score.bassTokens?.length ?? 0,
  };
}
