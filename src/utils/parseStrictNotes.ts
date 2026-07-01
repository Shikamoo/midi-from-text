/**
 * parseStrictNotes.ts
 *
 * Parses a normalized "C4 q, E4 q | G4 h" string into a flat NoteToken[]
 * plus structural metadata about where bar separators appeared.
 *
 * Delegates pitch and duration validation to the battle-tested helpers in
 * notesParser.ts so the two parsers stay in sync.
 *
 * Never throws — all problems are captured as ParseIssue entries.
 */

import { parsePitch, parseDuration } from './notesParser';
import type { NoteToken, ParseIssue } from '../types/music';

// ─── Public API ───────────────────────────────────────────────────────────────

export interface StrictParseResult {
  /** All parsed tokens in order */
  tokens: NoteToken[];
  /**
   * Token index boundaries from explicit "|" separators in the source.
   * Entry k means: after tokens[k] a bar separator was present.
   * Empty when the input had no "|" — groupIntoBars will auto-group by meter.
   */
  barBoundaries: number[];
  issues: ParseIssue[];
}

/** One token regex: (pitch/rest) (duration) (dot?) (:velocity?) */
const TOKEN_RE =
  /^([A-Za-z][b#]?\d?)\s+([wWhHqQeEsS])(\.?)(?::(\d{1,3}))?$/;

/**
 * Parse a normalized note string into NoteTokens.
 *
 * @param normalizedText  Output of normalizeMusicText — commas separate notes,
 *                        pipes separate bars.
 */
export function parseStrictNotes(normalizedText: string): StrictParseResult {
  const tokens: NoteToken[] = [];
  const barBoundaries: number[] = [];
  const issues: ParseIssue[] = [];

  const barStrings = normalizedText.split('|').map((s) => s.trim()).filter(Boolean);

  for (let barIdx = 0; barIdx < barStrings.length; barIdx++) {
    const barStr = barStrings[barIdx];
    const rawTokens = barStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (rawTokens.length === 0) {
      issues.push({
        severity: 'warning',
        message: 'Empty bar — no notes between bar separators.',
        location: `Bar ${barIdx + 1}`,
        stage: 'parse',
      });
    }

    for (const raw of rawTokens) {
      const result = parseSingleToken(raw, barIdx);
      if ('issue' in result) {
        issues.push(result.issue);
      } else {
        tokens.push(result.token);
      }
    }

    // Record the boundary after the last token of this bar (except the last bar)
    if (barIdx < barStrings.length - 1) {
      barBoundaries.push(tokens.length - 1);
    }
  }

  return { tokens, barBoundaries, issues };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

interface TokenOk  { token: NoteToken }
interface TokenErr { issue: ParseIssue }

function parseSingleToken(raw: string, barIdx: number): TokenOk | TokenErr {
  const match = raw.match(TOKEN_RE);
  if (!match) {
    return {
      issue: {
        severity: 'error',
        message:
          `Cannot parse "${raw}". ` +
          `Expected "Pitch Duration", e.g. "C4 q", "D#3 h.", or "R q". ` +
          `Make sure pitch and duration are separated by a single space.`,
        location: `Bar ${barIdx + 1}, token "${raw}"`,
        stage: 'parse',
      },
    };
  }

  const [, rawPitch, rawDur, dot, velStr] = match;

  const pitchResult = parsePitch(rawPitch);
  if ('error' in pitchResult) {
    return {
      issue: {
        severity: 'error',
        message: pitchResult.error,
        location: `Bar ${barIdx + 1}, token "${raw}"`,
        stage: 'parse',
      },
    };
  }

  const dotted = dot === '.';
  const durResult = parseDuration(rawDur, dotted);
  if ('error' in durResult) {
    return {
      issue: {
        severity: 'error',
        message: durResult.error,
        location: `Bar ${barIdx + 1}, token "${raw}"`,
        stage: 'parse',
      },
    };
  }

  const velocity = velStr
    ? Math.min(127, Math.max(0, parseInt(velStr, 10)))
    : 80;

  return {
    token: {
      pitch:    pitchResult.pitch,
      midiNote: pitchResult.midiNote,
      duration: durResult.duration,
      dotted,
      velocity,
      source:   raw,
    },
  };
}
