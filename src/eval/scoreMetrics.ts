/**
 * Score-level diversity metrics from ParsedScore (measurement only).
 */

import type { NoteToken, ParsedScore } from '../types/music';
import { extractBarTokens, barMidiSimilarity } from '../utils/score/phraseDevelopment';

export interface ScoreMetrics {
  pitchMin: number;
  pitchMax: number;
  pitchSpan: number;
  /** Pitched melody notes per beat. */
  noteDensity: number;
  /** Rest duration share of total beats (melody). */
  restDensity: number;
  avgInterval: number;
  maxInterval: number;
  /** Compact histogram: semitone steps → count. */
  intervalHistogram: string;
  /** Melody duration sequence (for cross-run comparison). */
  rhythmSignature: string;
  /** Mean MIDI similarity between bar i and bar i+phraseWindow. */
  motifRepetitionSim: number;
  /** Harmony pitched notes per bar. */
  harmonyNoteDensity: number;
  harmonyPitchSpan: number;
  totalBeats: number;
  barCount: number;
}

export function computeScoreMetrics(
  score: ParsedScore,
  phraseWindow = 2,
): ScoreMetrics {
  const melody = score.tokens;
  const totalBeats = melody.reduce((s, t) => s + t.duration, 0);
  const pitched = melody.filter((t) => t.pitch !== 'rest');
  const restBeats = melody
    .filter((t) => t.pitch === 'rest')
    .reduce((s, t) => s + t.duration, 0);

  const midis = pitched.map((t) => t.midiNote);
  const pitchMin = midis.length ? Math.min(...midis) : 0;
  const pitchMax = midis.length ? Math.max(...midis) : 0;

  const intervals = intervalSteps(pitched);
  const avgInterval = intervals.length
    ? intervals.reduce((a, b) => a + b, 0) / intervals.length
    : 0;
  const maxInterval = intervals.length ? Math.max(...intervals) : 0;

  const harmony = score.harmonyTokens ?? [];
  const harmonyPitched = harmony.filter((t) => t.pitch !== 'rest');
  const harmonyMidis = harmonyPitched.map((t) => t.midiNote);
  const barCount = score.bars.length || 1;

  return {
    pitchMin,
    pitchMax,
    pitchSpan: pitchMax - pitchMin,
    noteDensity: totalBeats > 0 ? pitched.length / totalBeats : 0,
    restDensity: totalBeats > 0 ? restBeats / totalBeats : 0,
    avgInterval,
    maxInterval,
    intervalHistogram: histogramIntervals(intervals),
    rhythmSignature: melody.map((t) => (t.pitch === 'rest' ? 'r' : t.duration)).join(','),
    motifRepetitionSim: motifRepetitionSimilarity(score, phraseWindow),
    harmonyNoteDensity: harmonyPitched.length / barCount,
    harmonyPitchSpan: harmonyMidis.length
      ? Math.max(...harmonyMidis) - Math.min(...harmonyMidis)
      : 0,
    totalBeats,
    barCount,
  };
}

export function intervalSteps(tokens: NoteToken[]): number[] {
  const midis = tokens.filter((t) => t.pitch !== 'rest').map((t) => t.midiNote);
  const steps: number[] = [];
  for (let i = 1; i < midis.length; i++) {
    steps.push(Math.abs(midis[i] - midis[i - 1]));
  }
  return steps;
}

export function histogramIntervals(steps: number[]): string {
  const bins = new Map<number, number>();
  for (const s of steps) {
    bins.set(s, (bins.get(s) ?? 0) + 1);
  }
  return [...bins.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([k, v]) => `${k}:${v}`)
    .join(';');
}

export function motifRepetitionSimilarity(
  score: ParsedScore,
  phraseWindow: number,
): number {
  if (phraseWindow < 1 || score.bars.length <= phraseWindow) return 1;

  let sum = 0;
  let count = 0;
  for (let i = 0; i < phraseWindow; i++) {
    const nextBar = i + phraseWindow;
    if (nextBar >= score.bars.length) break;
    const a = extractBarTokens(score.tokens, i, score.beatsPerBar);
    const b = extractBarTokens(score.tokens, nextBar, score.beatsPerBar);
    sum += barMidiSimilarity(a, b);
    count++;
  }
  return count > 0 ? sum / count : 1;
}

/** 0–1 similarity of melody rhythm signatures between two scores. */
export function rhythmPatternSimilarity(a: ScoreMetrics, b: ScoreMetrics): number {
  const da = a.rhythmSignature.split(',');
  const db = b.rhythmSignature.split(',');
  const len = Math.min(da.length, db.length);
  if (len === 0) return 0;
  let match = 0;
  for (let i = 0; i < len; i++) {
    if (da[i] === db[i]) match++;
  }
  return match / Math.max(da.length, db.length);
}

export interface PairwiseScoreComparison {
  rhythmSimilarity: number;
  motifRepetitionDelta: number;
  pitchSpanDelta: number;
  noteDensityDelta: number;
  restDensityDelta: number;
  avgIntervalDelta: number;
  harmonyDensityDelta: number;
}

export function compareScoreMetrics(
  a: ScoreMetrics,
  b: ScoreMetrics,
): PairwiseScoreComparison {
  return {
    rhythmSimilarity: rhythmPatternSimilarity(a, b),
    motifRepetitionDelta: b.motifRepetitionSim - a.motifRepetitionSim,
    pitchSpanDelta: b.pitchSpan - a.pitchSpan,
    noteDensityDelta: b.noteDensity - a.noteDensity,
    restDensityDelta: b.restDensity - a.restDensity,
    avgIntervalDelta: b.avgInterval - a.avgInterval,
    harmonyDensityDelta: b.harmonyNoteDensity - a.harmonyNoteDensity,
  };
}
