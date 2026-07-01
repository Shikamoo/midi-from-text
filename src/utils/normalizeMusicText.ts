/**
 * normalizeMusicText.ts
 *
 * Transforms messy note text into a clean, canonical comma-and-pipe format
 * that parseStrictNotes can tokenise without ambiguity.
 *
 * Transformations (applied in order)
 * ────────────────────────────────────
 * 1. Replace spelled-out duration aliases (quarter → q, eighth → e, …)
 * 2. Normalize bar separators: any whitespace-padded "|" → " | "
 * 3. Replace semicolons with commas
 * 4. Join one-note-per-line input into a flat comma-separated stream
 *    (or bar-separated stream when each line holds multiple pairs)
 * 5. Insert commas between adjacent "Pitch Dur" pairs that have no separator
 *    e.g. "C4 q E4 q G4 h" → "C4 q, E4 q, G4 h"
 * 6. Collapse redundant whitespace and repeated commas
 *
 * The function is pure and always returns a string — it never throws.
 */

// ─── Duration alias map ───────────────────────────────────────────────────────

const DURATION_ALIASES: [RegExp, string][] = [
  [/\bwhole\b/gi,              'w'],
  [/\bhalf\b/gi,               'h'],
  [/\bquarter\b/gi,            'q'],
  [/\b(?:eighth|8th)\b/gi,     'e'],
  [/\b(?:sixteenth|16th)\b/gi, 's'],
];

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Normalize messy note text into a canonical "C4 q, E4 q | G4 h" format.
 */
export function normalizeMusicText(raw: string): string {
  let text = raw;

  text = convertDurationWords(text);
  text = normalizeBarSeparators(text);
  text = text.replace(/;/g, ',');
  text = joinNoteLines(text);
  text = splitGroupedNotePairs(text);
  text = collapseWhitespace(text);

  return text;
}

/** Replace spelled-out duration aliases only (quarter → q, etc.). */
export function convertDurationWords(raw: string): string {
  return replaceDurationAliases(raw);
}

/** Insert commas between adjacent note pairs on the same line / segment. */
export function splitGroupedNotePairs(raw: string): string {
  let text = raw;
  text = insertCommasBetweenPairs(text);
  text = collapseWhitespace(text);
  return text;
}

// ─── Stage implementations ────────────────────────────────────────────────────

function replaceDurationAliases(text: string): string {
  let result = text;
  for (const [pattern, replacement] of DURATION_ALIASES) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Normalise ` | `, `|`, etc. to a consistent ` | ` with single spaces.
 * Does not touch `|` that already has correct spacing.
 */
function normalizeBarSeparators(text: string): string {
  return text.replace(/\s*\|\s*/g, ' | ');
}

/**
 * When the input has one note per line (or a few notes per line), collapse
 * the newlines into the canonical flat format:
 *   - 1 note/line  → join with ", "
 *   - ≥2 notes/line → treat each line as a bar, join with " | "
 *
 * Leaves the text unchanged when lines are already long (already a stream)
 * or when note-line density is low (likely prose).
 */
function joinNoteLines(text: string): string {
  if (!text.includes('\n')) return text;

  const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
  if (lines.length < 2) return text;

  // Count note pairs per line
  const PAIR_RE = /([A-Ga-g][b#]?\d|[Rr])\s+[wWhHqQeEsS]/g;
  const noteCounts = lines.map((l) => (l.match(PAIR_RE) ?? []).length);
  const totalNoteLines = noteCounts.filter((c) => c > 0).length;

  // Bail out if fewer than 70 % of lines look like note lines
  if (totalNoteLines / lines.length < 0.7) return text;

  const avgPerLine =
    noteCounts.reduce((a, b) => a + b, 0) / Math.max(totalNoteLines, 1);

  if (avgPerLine <= 1.5) {
    // One note per line → join with commas; strip trailing commas on each line first
    const cleaned = lines.map((l) => l.replace(/,\s*$/, ''));
    return cleaned.join(', ');
  } else {
    // Multiple notes per line → treat each line as a bar
    const cleaned = lines.map((l) => l.replace(/,\s*$/, ''));
    return cleaned.join(' | ');
  }
}

/**
 * Insert a comma between consecutive "Pitch Dur" pairs that have only
 * whitespace between them (i.e. no existing comma or bar separator).
 *
 * Algorithm: replace  <dur> <whitespace> <pitch> <whitespace><dur>
 *            with     <dur>, <pitch> <whitespace><dur>
 *
 * Runs in multiple passes until the string stabilises so that chains of
 * pairs like "A B C D E F" are fully separated in O(n) passes.
 *
 * Bar segments are processed independently to avoid crossing "|".
 */
function insertCommasBetweenPairs(text: string): string {
  // Split on bar separators, process each segment, then rejoin
  const BAR_SEP = /( \| )/;
  const parts = text.split(BAR_SEP);

  return parts
    .map((part, i) => {
      // Odd indices are the " | " separators themselves — pass through
      if (i % 2 === 1) return part;
      return insertCommasInSegment(part);
    })
    .join('');
}

/**
 * Regex that matches:
 *   group 1 — a duration symbol with optional dot and velocity (:NN)
 *   group 2 — whitespace (NOT preceded by comma or bar — that's handled by split)
 *   group 3 — a pitch or rest
 *   group 4 — whitespace + the next duration symbol (lookahead anchor)
 *
 * The lookahead anchor in group 4 ensures we only comma-separate when the
 * upcoming token is itself a valid note pair, not stray text.
 */
const PAIR_COMMA_RE =
  /([wWhHqQeEsS]\.?(?::\d{1,3})?)(\s+)([A-Ga-g][b#]?\d|[Rr])(\s+[wWhHqQeEsS])/g;

function insertCommasInSegment(segment: string): string {
  let prev: string;
  let result = segment;
  do {
    prev = result;
    // Replace each  <dur> <space> <pitch> <space><dur>
    // with          <dur>, <pitch> <space><dur>
    // (group 4 stays attached so the next pass can still match it)
    result = result.replace(PAIR_COMMA_RE, '$1, $3$4');
  } while (result !== prev);
  return result;
}

function collapseWhitespace(text: string): string {
  return text
    .replace(/ +/g, ' ')         // multiple spaces → one
    .replace(/,\s*,+/g, ',')     // multiple commas → one
    .replace(/,\s*\|/g, ' |')    // trailing comma before bar sep → remove comma
    .replace(/\|\s*,/g, '| ')    // leading comma after bar sep → remove comma
    .trim();
}
