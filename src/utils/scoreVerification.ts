/**
 * scoreVerification.ts
 *
 * Lightweight checks that preview, canonical text, and export share one score.
 */

import type { ParsedScore } from '../types/music';

export interface ScoreSummary {
  noteCount: number;
  restCount: number;
  barCount: number;
  totalBeats: number;
  exportReady: boolean;
}

/** Deterministic fingerprint for comparing ParsedScore snapshots. */
export function scoreFingerprint(score: ParsedScore): string {
  const tokenSig = (tokens: typeof score.tokens) =>
    tokens.map(
      (t) => `${t.pitch}|${t.midiNote}|${t.duration}|${t.dotted ? 1 : 0}|${t.velocity}`,
    );

  return JSON.stringify({
    bpm: score.bpm,
    beatsPerBar: score.beatsPerBar,
    beatValue: score.beatValue,
    barCount: score.bars.length,
    tokens: tokenSig(score.tokens),
    harmony: score.harmonyTokens ? tokenSig(score.harmonyTokens) : undefined,
    harmonyGeneration: score.harmonyGeneration,
  });
}

export function scoresMatch(a: ParsedScore | null, b: ParsedScore | null): boolean {
  if (!a || !b) return false;
  return scoreFingerprint(a) === scoreFingerprint(b);
}

export function buildScoreSummary(
  score: ParsedScore | null,
  exportReady: boolean,
): ScoreSummary | null {
  if (!score) return null;

  const noteCount = score.tokens.filter((t) => t.pitch !== 'rest').length;
  const restCount = score.tokens.filter((t) => t.pitch === 'rest').length;
  const totalBeats = score.tokens.reduce((sum, t) => sum + t.duration, 0);

  return {
    noteCount,
    restCount,
    barCount: score.bars.length,
    totalBeats,
    exportReady,
  };
}
