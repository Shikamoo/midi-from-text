/**
 * groupIntoBars.ts
 *
 * Groups a flat NoteToken[] into Bar[] using one of two strategies:
 *
 *   Explicit  — the source had "|" separators; respect those boundaries and
 *               only validate each bar's beat total against the meter.
 *
 *   Auto      — no "|" separators; pack tokens into bars greedily until each
 *               bar reaches beatsPerBar, then start a new one.
 *
 * Both strategies emit per-bar ParseIssues for under/over-full bars.
 */

import type { NoteToken, Bar, ParseIssue } from '../types/music';
import type { StrictParseResult } from './parseStrictNotes';

// ─── Public API ───────────────────────────────────────────────────────────────

export interface GroupOptions {
  beatsPerBar: number;
}

export interface GroupResult {
  bars: Bar[];
  issues: ParseIssue[];
}

/**
 * Group tokens into bars.
 *
 * @param parseResult  Output of parseStrictNotes.
 * @param options      Meter info (beatsPerBar).
 */
export function groupIntoBars(
  parseResult: StrictParseResult,
  options: GroupOptions,
): GroupResult {
  const { tokens, barBoundaries } = parseResult;

  if (tokens.length === 0) {
    return { bars: [], issues: [] };
  }

  return barBoundaries.length > 0
    ? groupByExplicitBoundaries(tokens, barBoundaries, options.beatsPerBar)
    : groupByMeter(tokens, options.beatsPerBar);
}

// ─── Explicit-boundary grouping ───────────────────────────────────────────────

/**
 * Reconstruct bars from barBoundaries (token indices after which a "|" appeared).
 * e.g. barBoundaries = [2, 5] with 8 tokens → bars: [0..2], [3..5], [6..7]
 */
function groupByExplicitBoundaries(
  tokens: NoteToken[],
  barBoundaries: number[],
  beatsPerBar: number,
): GroupResult {
  const bars: Bar[] = [];
  const allIssues: ParseIssue[] = [];

  // Convert boundary token indices into slice ranges
  const starts = [0, ...barBoundaries.map((b) => b + 1)];
  const ends   = [...barBoundaries.map((b) => b + 1), tokens.length];

  for (let i = 0; i < starts.length; i++) {
    const slice = tokens.slice(starts[i], ends[i]);
    const { bar, issues } = buildBar(i, slice, beatsPerBar);
    bars.push(bar);
    allIssues.push(...issues);
  }

  return { bars, issues: allIssues };
}

// ─── Meter-based auto-grouping ────────────────────────────────────────────────

/**
 * Pack tokens greedily into bars of exactly beatsPerBar beats.
 * When a token would overflow the current bar, flush the current bar first.
 * Any remainder tokens become the final (possibly underfull) bar.
 *
 * When beatsPerBar is 0 or negative, all tokens become one bar (no meter check).
 */
function groupByMeter(tokens: NoteToken[], beatsPerBar: number): GroupResult {
  if (beatsPerBar <= 0) {
    const total = tokens.reduce((s, t) => s + t.duration, 0);
    return {
      bars: [{ index: 0, notes: tokens, totalBeats: total, expectedBeats: 0, issues: [] }],
      issues: [],
    };
  }

  const bars: Bar[] = [];
  const allIssues: ParseIssue[] = [];

  let current: NoteToken[] = [];
  let currentBeats = 0;
  const EPSILON = 0.001;

  for (const token of tokens) {
    const wouldExceed = currentBeats + token.duration > beatsPerBar + EPSILON;

    if (wouldExceed && current.length > 0) {
      // Flush bar before adding overflowing token
      const { bar, issues } = buildBar(bars.length, current, beatsPerBar);
      bars.push(bar);
      allIssues.push(...issues);
      current = [];
      currentBeats = 0;
    }

    current.push(token);
    currentBeats += token.duration;

    // Exact fill — flush immediately
    if (Math.abs(currentBeats - beatsPerBar) <= EPSILON) {
      const { bar, issues } = buildBar(bars.length, current, beatsPerBar);
      bars.push(bar);
      allIssues.push(...issues);
      current = [];
      currentBeats = 0;
    }
  }

  // Flush remaining tokens as the last bar
  if (current.length > 0) {
    const { bar, issues } = buildBar(bars.length, current, beatsPerBar);
    bars.push(bar);
    allIssues.push(...issues);
  }

  return { bars, issues: allIssues };
}

// ─── Shared bar builder ───────────────────────────────────────────────────────

interface BarBuildResult {
  bar: Bar;
  issues: ParseIssue[];
}

function buildBar(index: number, notes: NoteToken[], expectedBeats: number): BarBuildResult {
  const totalBeats = notes.reduce((s, n) => s + n.duration, 0);
  const issues: ParseIssue[] = [];
  const EPSILON = 0.001;

  if (expectedBeats > 0 && notes.length > 0) {
    const diff = totalBeats - expectedBeats;
    if (Math.abs(diff) > EPSILON) {
      const direction = diff > 0 ? 'overfull' : 'underfull';
      const by = Math.abs(diff);
      issues.push({
        severity: 'warning',
        message:
          `Bar ${index + 1} is ${direction}: ` +
          `${formatBeats(totalBeats)} present, ${formatBeats(expectedBeats)} expected ` +
          `(${formatBeats(by)} ${diff > 0 ? 'too many' : 'short'}).`,
        location: `Bar ${index + 1}`,
        stage: 'group',
      });
    }
  }

  return {
    bar: { index, notes, totalBeats, expectedBeats, issues },
    issues,
  };
}

function formatBeats(beats: number): string {
  const r = Math.round(beats * 100) / 100;
  return `${r} beat${r !== 1 ? 's' : ''}`;
}
