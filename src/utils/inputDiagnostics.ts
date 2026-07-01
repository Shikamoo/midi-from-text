/**
 * inputDiagnostics.ts
 *
 * Builds human-readable parse feedback, input stats, and repair offers
 * from raw text + pipeline results. Pure — no React.
 */

import type { ParseIssue, InputMode, DetectedMode, ParsedScore } from '../types/music';
import type { MusicPlan } from '../types/musicPlan';
import {
  type RepairActionId,
  REPAIR_LABELS,
  countNotePairs,
  hasDurationWords,
  needsAutoFormat,
  needsGroupedSplit,
} from './repairMusicText';

/** Minimal pipeline output needed for diagnostics (keeps utils free of React). */
export interface PipelineSnapshot {
  detectedMode: DetectedMode;
  normalizedText: string;
  parsedScore: ParsedScore | null;
  musicPlan: MusicPlan | null;
  issues: ParseIssue[];
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface InputStats {
  noteCount: number;
  restCount: number;
  barCount: number;
  meter: string;
  mode: InputMode;
  modeLabel: string;
  modeConfidence: number;
}

export interface RepairOffer {
  id: RepairActionId;
  label: string;
  description: string;
}

export interface InputDiagnostics {
  stats: InputStats;
  humanIssues: ParseIssue[];
  repairs: RepairOffer[];
  suggestedBarCount: number | null;
  showNormalized: boolean;
}

export interface DiagnosticsSettings {
  bars: number;
  beatsPerBar: number;
  beatValue: number;
}

// ─── Mode labels ──────────────────────────────────────────────────────────────

const MODE_LABELS: Record<InputMode, string> = {
  'strict-note-lines':   'One note per line',
  'grouped-note-stream': 'Grouped note stream',
  'prompt-text':         'Text prompt',
  'abc-like':            'ABC notation',
};

// ─── Public API ───────────────────────────────────────────────────────────────

export function buildInputDiagnostics(
  rawText: string,
  result: PipelineSnapshot,
  settings: DiagnosticsSettings,
): InputDiagnostics {
  const stats = buildStats(rawText, result, settings);
  const suggestedBarCount = computeSuggestedBarCount(result, settings.bars);
  const humanIssues = buildHumanIssues(rawText, result, settings, suggestedBarCount);
  const repairs = buildRepairOffers(rawText, result, settings, suggestedBarCount);

  return {
    stats,
    humanIssues,
    repairs,
    suggestedBarCount,
    showNormalized: Boolean(result.normalizedText && result.normalizedText !== rawText.trim()),
  };
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function buildStats(
  _rawText: string,
  result: PipelineSnapshot,
  settings: DiagnosticsSettings,
): InputStats {
  const tokens = result.parsedScore?.tokens ?? [];
  const noteCount = tokens.filter((t) => t.pitch !== 'rest').length;
  const restCount = tokens.filter((t) => t.pitch === 'rest').length;
  const barCount = result.parsedScore?.bars.length ?? 0;
  const meter = `${result.parsedScore?.beatsPerBar ?? settings.beatsPerBar}/${result.parsedScore?.beatValue ?? settings.beatValue}`;

  return {
    noteCount,
    restCount,
    barCount,
    meter,
    mode: result.detectedMode.mode,
    modeLabel: MODE_LABELS[result.detectedMode.mode],
    modeConfidence: result.detectedMode.confidence,
  };
}

// ─── Human-readable issues ────────────────────────────────────────────────────

function buildHumanIssues(
  rawText: string,
  result: PipelineSnapshot,
  settings: DiagnosticsSettings,
  suggestedBarCount: number | null,
): ParseIssue[] {
  const issues: ParseIssue[] = [];
  const trimmed = rawText.trim();
  const isNotePath = !result.musicPlan && result.detectedMode.mode !== 'abc-like';

  // Friendly versions of pipeline errors
  for (const issue of result.issues) {
    issues.push({
      ...issue,
      message: humanizeParseMessage(issue.message, issue.location),
    });
  }

  if (isNotePath && trimmed) {
    const pairs = countNotePairs(trimmed);
    const lines = trimmed.split('\n').filter((l) => l.trim()).length || 1;
    const avgPerLine = pairs / lines;

    if (
      result.detectedMode.mode === 'grouped-note-stream' &&
      avgPerLine >= 2 &&
      needsGroupedSplit(trimmed)
    ) {
      issues.push({
        severity: 'info',
        message: `Detected ${Math.round(pairs)} note pair${pairs !== 1 ? 's' : ''} on one line; split automatically?`,
        location: 'input',
        stage: 'detect',
      });
    }

    if (needsAutoFormat(trimmed) && trimmed !== result.normalizedText) {
      issues.push({
        severity: 'info',
        message: 'Input can be auto-formatted to canonical note syntax (commas, bar separators).',
        location: 'input',
        stage: 'normalize',
      });
    }

    if (hasDurationWords(trimmed)) {
      issues.push({
        severity: 'info',
        message: 'Spelled-out durations detected (e.g. "quarter", "eighth") — convert to symbols?',
        location: 'input',
        stage: 'normalize',
      });
    }
  }

  if (
    suggestedBarCount !== null &&
    suggestedBarCount !== settings.bars &&
    isNotePath
  ) {
    issues.push({
      severity: 'warning',
      message: `Bars setting says ${settings.bars}, but parsed ${suggestedBarCount} bar${suggestedBarCount !== 1 ? 's' : ''}.`,
      location: 'settings',
      stage: 'validate',
    });
  }

  // De-duplicate by message
  const seen = new Set<string>();
  return issues.filter((i) => {
    if (seen.has(i.message)) return false;
    seen.add(i.message);
    return true;
  });
}

function humanizeParseMessage(message: string, location: string): string {
  if (message.includes('Cannot parse') && message.includes('Expected "Pitch Duration"')) {
    const tokenMatch = location.match(/token "([^"]+)"/);
    const token = tokenMatch?.[1] ?? 'entry';
    return `"${token}" is not valid note syntax — use "Pitch Duration" like C4 q or R q.`;
  }
  if (message.includes('not a valid pitch')) {
    return message.replace(/^"/, '').replace(/" is not a valid pitch/, ' is not a valid pitch name');
  }
  if (message.includes('overfull') || message.includes('underfull')) {
    return message.replace('Bar ', 'Bar ').replace('is overfull', 'has too many beats').replace('is underfull', 'is too short');
  }
  if (message.includes('No notes found')) {
    return 'No notes found — enter at least one note pair like C4 q.';
  }
  return message;
}

// ─── Repair offers ────────────────────────────────────────────────────────────

function buildRepairOffers(
  rawText: string,
  result: PipelineSnapshot,
  settings: DiagnosticsSettings,
  suggestedBarCount: number | null,
): RepairOffer[] {
  const offers: RepairOffer[] = [];
  const trimmed = rawText.trim();
  const isNotePath = !result.musicPlan && result.detectedMode.mode !== 'abc-like';

  if (!isNotePath || !trimmed) return offers;

  if (needsAutoFormat(trimmed)) {
    offers.push({
      id: 'auto-format',
      label: REPAIR_LABELS['auto-format'],
      description: 'Normalize commas, bar lines, spacing, and line breaks.',
    });
  }

  if (needsGroupedSplit(trimmed)) {
    offers.push({
      id: 'split-grouped',
      label: REPAIR_LABELS['split-grouped'],
      description: 'Insert commas between note pairs on the same line.',
    });
  }

  if (hasDurationWords(trimmed)) {
    offers.push({
      id: 'convert-duration-words',
      label: REPAIR_LABELS['convert-duration-words'],
      description: 'Replace "quarter", "eighth", etc. with q, e, h, w, s.',
    });
  }

  if (suggestedBarCount !== null && suggestedBarCount !== settings.bars) {
    offers.push({
      id: 'apply-suggested-bars',
      label: REPAIR_LABELS['apply-suggested-bars'],
      description: `Update Bars setting from ${settings.bars} to ${suggestedBarCount}.`,
    });
  }

  return offers;
}

function computeSuggestedBarCount(
  result: PipelineSnapshot,
  _settingsBars: number,
): number | null {
  const parsed = result.parsedScore?.bars.length;
  if (parsed && parsed > 0) return parsed;
  return null;
}
