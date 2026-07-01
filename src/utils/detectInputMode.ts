/**
 * detectInputMode.ts
 *
 * Heuristically identifies which input format the user has entered so the
 * normalizer and parser can handle it without manual reformatting.
 *
 * Modes
 * ─────
 *   strict-note-lines   — one "Pitch Dur" pair per line, e.g. "C4 q\nE4 q"
 *   grouped-note-stream — multiple pairs on the same line, e.g. "C4 q E4 q G4 h"
 *   prompt-text         — free English prose, e.g. "play a jazz melody at 120 bpm"
 *   abc-like            — ABC notation with X:/T:/K: header fields
 */

import type { DetectedMode, InputMode } from '../types/music';

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Detect the most likely input mode for a music text string.
 * Returns the best-match mode with a confidence value 0–1.
 */
export function detectInputMode(text: string): DetectedMode {
  const trimmed = text.trim();
  if (!trimmed) return { mode: 'prompt-text', confidence: 0 };

  const scores: { mode: InputMode; score: number }[] = [
    { mode: 'abc-like',           score: scoreAbcLike(trimmed) },
    { mode: 'strict-note-lines',  score: scoreStrictNoteLines(trimmed) },
    { mode: 'grouped-note-stream',score: scoreGroupedNoteStream(trimmed) },
    { mode: 'prompt-text',        score: scorePromptText(trimmed) },
  ];

  scores.sort((a, b) => b.score - a.score);

  const best = scores[0];
  const total = scores.reduce((s, m) => s + m.score, 0);
  const confidence = total > 0 ? best.score / total : 0.25;

  return { mode: best.mode, confidence };
}

// ─── Shared patterns ──────────────────────────────────────────────────────────

/** Matches a complete "Pitch Duration" or "R Duration" pair */
const NOTE_PAIR_RE = /\b([A-Ga-g][b#]?\d|[Rr])\s+([wWhHqQeEsS]\.?)/g;

/** Matches any pitch name standing alone */
const PITCH_ONLY_RE = /\b[A-Ga-g][b#]?\d\b/g;

// ─── Scorers ─────────────────────────────────────────────────────────────────

/** ABC notation is identified by its mandatory X:, T:, K: header fields */
function scoreAbcLike(text: string): number {
  let score = 0;
  if (/^X:\s*\d/m.test(text)) score += 4;
  if (/^T:/m.test(text))       score += 2;
  if (/^K:/m.test(text))       score += 2;
  // ABC body: bar lines combined with note letter-only notation (no octave digit)
  if (/\|/.test(text) && /[A-Ga-g][',]/.test(text)) score += 2;
  return score;
}

/**
 * Strict-note-lines: most lines contain exactly one "Pitch Dur" token.
 * Score is high when the average tokens-per-line is low and note-line ratio is high.
 */
function scoreStrictNoteLines(text: string): number {
  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
  if (lines.length < 2) return 0; // single-line input is never "note lines"

  const NOTE_LINE_RE = /^([A-Ga-g][b#]?\d|[Rr])\s+[wWhHqQeEsS]/;
  const noteLineCount = lines.filter((l) => NOTE_LINE_RE.test(l)).length;
  const ratio = noteLineCount / lines.length;

  if (ratio < 0.5) return 0;

  // Penalise lines with many pairs (those look more like grouped streams)
  const totalPairs = (text.match(NOTE_PAIR_RE) || []).length;
  const avgPerLine = totalPairs / Math.max(lines.length, 1);
  const densityPenalty = avgPerLine > 2 ? 0.5 : 1;

  return ratio * 3 * densityPenalty;
}

/**
 * Grouped-note-stream: multiple "Pitch Dur" pairs appear on the same line,
 * possibly across few lines, without ABC headers.
 */
function scoreGroupedNoteStream(text: string): number {
  const pairs = [...(text.match(NOTE_PAIR_RE) || [])];
  if (pairs.length < 2) return 0;

  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
  const avgPerLine = pairs.length / Math.max(lines.length, 1);

  let score = 0;
  if (avgPerLine >= 2) score += 2;
  if (avgPerLine >= 3) score += 1;
  if (!/^X:/m.test(text)) score += 1; // not ABC
  // Not prose: low ratio of ordinary English words to note tokens
  const wordCount = text.split(/\s+/).length;
  const noteRatio = pairs.length / wordCount;
  if (noteRatio > 0.4) score += 1;

  return score;
}

/**
 * Prompt-text: English words dominate over note tokens;
 * musical keywords like "melody" or "arpeggio" are strong signals.
 */
function scorePromptText(text: string): number {
  const wordCount = text.split(/\s+/).length;
  const pitchCount = (text.match(PITCH_ONLY_RE) || []).length;
  const noteRatio = pitchCount / wordCount;

  let score = 0;
  if (
    /\b(play|melody|chord|bass|arpeggio|key|bpm|tempo|rhythm|beat|bar|measure|instrument|jazz|classical|soft|loud)\b/i
      .test(text)
  )
    score += 3;
  if (wordCount > 5 && noteRatio < 0.3) score += 2;
  if (/[.!?]/.test(text)) score += 1;

  return score;
}
