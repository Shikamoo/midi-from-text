/**
 * repairMusicText.ts
 *
 * Pure repair transforms for messy note input.
 * Each function returns updated text and/or a config patch — no UI, no side effects.
 */

import {
  normalizeMusicText,
  convertDurationWords,
  splitGroupedNotePairs,
} from './normalizeMusicText';

// ─── Public types ─────────────────────────────────────────────────────────────

export type RepairActionId =
  | 'auto-format'
  | 'split-grouped'
  | 'convert-duration-words'
  | 'apply-suggested-bars';

export interface RepairContext {
  settingsBars?: number;
  parsedBarCount?: number;
}

export interface RepairResult {
  /** Updated note text, when the repair modifies input */
  text?: string;
  /** Settings patch (e.g. bar count alignment) */
  configPatch?: { bars?: number };
}

// ─── Detection helpers (for offering repairs) ────────────────────────────────

const DURATION_WORD_RE =
  /\b(whole|half|quarter|(?:eighth|8th)|(?:sixteenth|16th))\b/i;

const NOTE_PAIR_RE = /\b([A-Ga-g][b#]?\d|[Rr])\s+([wWhHqQeEsS]\.?)/g;

/** True when spelled-out duration words appear in the text. */
export function hasDurationWords(text: string): boolean {
  return DURATION_WORD_RE.test(text);
}

/** Count note pairs in raw text. */
export function countNotePairs(text: string): number {
  return [...text.matchAll(NOTE_PAIR_RE)].length;
}

/** True when comma-splitting would change the text. */
export function needsGroupedSplit(raw: string): boolean {
  return splitGroupedNotePairs(raw) !== raw.trim();
}

/** True when full normalization would change the text. */
export function needsAutoFormat(raw: string): boolean {
  return normalizeMusicText(raw) !== raw.trim();
}

// ─── Repair actions ───────────────────────────────────────────────────────────

export function applyRepair(
  actionId: RepairActionId,
  raw: string,
  context: RepairContext = {},
): RepairResult {
  switch (actionId) {
    case 'auto-format':
      return { text: normalizeMusicText(raw) };

    case 'split-grouped':
      return { text: splitGroupedNotePairs(raw) };

    case 'convert-duration-words':
      return { text: convertDurationWords(raw) };

    case 'apply-suggested-bars': {
      const count = context.parsedBarCount;
      if (count && count > 0) {
        return { configPatch: { bars: count } };
      }
      return {};
    }

    default:
      return {};
  }
}

/** Human-readable labels for repair buttons */
export const REPAIR_LABELS: Record<RepairActionId, string> = {
  'auto-format':            'Auto-format input',
  'split-grouped':          'Split grouped notes',
  'convert-duration-words': 'Convert duration words',
  'apply-suggested-bars':   'Apply suggested bar count',
};
