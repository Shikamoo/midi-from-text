/**
 * scoreToCanonicalText.ts
 *
 * Single source of truth for rendering a ParsedScore as canonical note text.
 */

import type { NoteToken, ParsedScore } from '../types/music';

const EPS = 0.001;

/** Render tokens as canonical note text: "C4 q, E4 q | G4 h" */
export function tokensToCanonicalText(tokens: NoteToken[], beatsPerBar: number): string {
  if (tokens.length === 0) return '';

  const barStrings: string[] = [];
  let current: string[] = [];
  let beatBudget = 0;

  for (const token of tokens) {
    current.push(formatToken(token));
    beatBudget += token.duration;

    if (Math.abs(beatBudget - beatsPerBar) < EPS || beatBudget >= beatsPerBar - EPS) {
      barStrings.push(current.join(', '));
      current = [];
      beatBudget = 0;
    }
  }

  if (current.length > 0) {
    barStrings.push(current.join(', '));
  }

  return barStrings.join(' | ');
}

/** Render a full ParsedScore using its meter and token order. */
export function scoreToCanonicalText(score: ParsedScore): string {
  return tokensToCanonicalText(score.tokens, score.beatsPerBar);
}

function formatToken(token: NoteToken): string {
  const sym = beatsToDurationSymbol(token.duration);
  const pitch = token.pitch === 'rest' ? 'R' : token.pitch;
  const dotted = token.dotted ? '.' : '';
  const vel = token.velocity !== 80 ? `:${token.velocity}` : '';
  return `${pitch} ${sym}${dotted}${vel}`;
}

function beatsToDurationSymbol(beats: number): string {
  if (Math.abs(beats - 4) < EPS) return 'w';
  if (Math.abs(beats - 2) < EPS) return 'h';
  if (Math.abs(beats - 1.5) < EPS) return 'h';
  if (Math.abs(beats - 1) < EPS) return 'q';
  if (Math.abs(beats - 0.5) < EPS) return 'e';
  if (Math.abs(beats - 0.25) < EPS) return 's';
  return 'q';
}
