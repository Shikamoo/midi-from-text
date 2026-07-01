/**
 * promptParser.ts
 *
 * Shared prompt field extraction for the active text pipeline.
 *
 * Active API: `parsePrompt` — used by promptToPlan (parseMusicInput) and
 * useMusicGenerator (status-bar detection summary).
 *
 * Legacy (not used by parseMusicInput): buildCompositionPlan, describePlan,
 * and the detect* style helpers below. Those fed CompositionPlan →
 * patternGenerators; the app now uses MusicPlan → planToScore instead.
 */

import type {
  MusicConfig,
  CompositionPlan,
  PatternType,
  Articulation,
  ContourDirection,
} from '../types/music';

// ─── Pattern matchers ──────────────────────────────────────────────────────

/** Match "120 bpm" / "120bpm" / "tempo 120" */
const BPM_RE = /(?:tempo\s+)?(\d{2,3})\s*bpm/i;

/** Match "4 bars" / "8 bar" / "16 bars" */
const BARS_RE = /(\d+)\s*bars?/i;

/** Match "C minor" / "F# major" / "Bb minor" */
const KEY_RE = /([A-G][b#]?)\s*(major|minor)/i;

/** Match "4/4" / "3/4" / "6/8" */
const TIMESIG_RE = /(\d+)\/(\d+)/;

/** Simple keyword → GM program map */
const INSTRUMENT_KEYWORDS: Array<[RegExp, number]> = [
  [/piano/i, 0],
  [/electric\s*piano/i, 4],
  [/vibraphone|vibes?/i, 11],
  [/nylon\s*guitar/i, 24],
  [/acoustic\s*guitar|guitar/i, 25],
  [/bass/i, 32],
  [/violin/i, 40],
  [/strings?|ensemble/i, 48],
  [/trumpet/i, 56],
  [/sax(?:ophone)?/i, 65],
  [/flute/i, 73],
  [/synth|lead/i, 80],
];

// ─── Pattern / style matchers ──────────────────────────────────────────────
//
// Each list is ordered by priority: the first match wins. Defaults are applied
// by buildCompositionPlan when nothing matches, so a vague prompt still works.

const PATTERN_KEYWORDS: Array<[RegExp, PatternType]> = [
  [/arpeggi/i, 'arpeggio'], // arpeggio, arpeggios, arpeggiated
  [/chord/i, 'chords'],
  [/bass\s*line|bassline/i, 'bassline'],
  [/melod|lead|tune/i, 'melody'],
];

const ARTICULATION_KEYWORDS: Array<[RegExp, Articulation]> = [
  [/staccato|short|plucky|detached/i, 'staccato'],
  [/legato|smooth|flowing|sustained/i, 'legato'],
];

const DIRECTION_KEYWORDS: Array<[RegExp, ContourDirection]> = [
  [/ascend|rising|upward|going up|climb/i, 'ascending'],
  [/descend|falling|downward|going down/i, 'descending'],
];

/** "octave jump(s)" / "octave leap(s)" / "jumping octaves" */
const OCTAVE_JUMP_RE = /octave\s*(jump|leap|skip)|jump.*octave|octaves/i;

/** Dynamics → base velocity (0-127) */
const DYNAMICS_KEYWORDS: Array<[RegExp, number]> = [
  [/soft|quiet|gentle|calm|mellow|delicate/i, 55],
  [/loud|strong|hard|aggressive|powerful|driving/i, 105],
];

const DEFAULT_VELOCITY = 80;

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Given a free-text prompt, extracts as many music config fields as possible.
 * Returns only the fields that were found; caller merges with defaults.
 */
export function parsePrompt(text: string): Partial<MusicConfig> {
  const result: Partial<MusicConfig> = {};

  const bpmMatch = text.match(BPM_RE);
  if (bpmMatch) result.bpm = parseInt(bpmMatch[1], 10);

  const barsMatch = text.match(BARS_RE);
  if (barsMatch) result.bars = parseInt(barsMatch[1], 10);

  const keyMatch = text.match(KEY_RE);
  if (keyMatch) {
    result.key = normalizeKey(keyMatch[1]);
    result.musicalMode = keyMatch[2].toLowerCase() as 'major' | 'minor';
  }

  const timeSigMatch = text.match(TIMESIG_RE);
  if (timeSigMatch) {
    result.beatsPerBar = parseInt(timeSigMatch[1], 10);
    result.beatValue = parseInt(timeSigMatch[2], 10);
  }

  for (const [pattern, program] of INSTRUMENT_KEYWORDS) {
    if (pattern.test(text)) {
      result.instrument = program;
      break;
    }
  }

  return result;
}

// ─── Legacy CompositionPlan style detection (unused by active pipeline) ────

function firstMatch<T>(text: string, table: Array<[RegExp, T]>, fallback: T): T {
  for (const [re, value] of table) {
    if (re.test(text)) return value;
  }
  return fallback;
}

export function detectPattern(text: string): PatternType {
  return firstMatch(text, PATTERN_KEYWORDS, 'melody');
}

export function detectArticulation(text: string): Articulation {
  return firstMatch(text, ARTICULATION_KEYWORDS, 'normal');
}

export function detectDirection(text: string): ContourDirection {
  return firstMatch(text, DIRECTION_KEYWORDS, 'none');
}

export function detectVelocity(text: string): number {
  return firstMatch(text, DYNAMICS_KEYWORDS, DEFAULT_VELOCITY);
}

// ─── Legacy CompositionPlan builder (superseded by promptToPlan) ───────────

/**
 * Turn a free-text prompt into a fully-specified CompositionPlan.
 *
 * @legacy Superseded by promptToPlan → MusicPlan. No app callers.
 *
 * Numeric / key / instrument settings come from `baseConfig` (the UI defaults),
 * with any values found in the prompt taking precedence. Style fields (pattern,
 * articulation, direction, octave jumps, dynamics) are read from the prompt
 * with sensible fallbacks, so a vague prompt produces a usable plan instead of
 * failing.
 */
export function buildCompositionPlan(text: string, baseConfig: MusicConfig): CompositionPlan {
  const extracted = parsePrompt(text);

  return {
    bpm: extracted.bpm ?? baseConfig.bpm,
    key: extracted.key ?? baseConfig.key,
    musicalMode: extracted.musicalMode ?? baseConfig.musicalMode,
    beatsPerBar: extracted.beatsPerBar ?? baseConfig.beatsPerBar,
    beatValue: extracted.beatValue ?? baseConfig.beatValue,
    bars: extracted.bars ?? baseConfig.bars,
    instrument: extracted.instrument ?? baseConfig.instrument,
    pattern: detectPattern(text),
    articulation: detectArticulation(text),
    direction: detectDirection(text),
    octaveJumps: OCTAVE_JUMP_RE.test(text),
    velocity: detectVelocity(text),
  };
}

/**
 * Short, human-readable description of a plan's musical style choices.
 *
 * @legacy Superseded by describeMusicPlan in promptToPlan.ts. No app callers.
 */
export function describePlan(plan: CompositionPlan): string {
  const parts: string[] = [plan.pattern];
  if (plan.direction !== 'none') parts.push(plan.direction);
  if (plan.articulation !== 'normal') parts.push(plan.articulation);
  if (plan.octaveJumps) parts.push('octave jumps');
  return parts.join(', ');
}

/**
 * Returns a short summary of what was detected in the prompt.
 *
 * @legacy Unused; useMusicGenerator builds its own summary via parsePrompt.
 */
export function promptSummary(parsed: Partial<MusicConfig>): string {
  const parts: string[] = [];
  if (parsed.bpm) parts.push(`${parsed.bpm} BPM`);
  if (parsed.key) parts.push(`${parsed.key} ${parsed.musicalMode ?? ''}`);
  if (parsed.bars) parts.push(`${parsed.bars} bars`);
  if (parsed.beatsPerBar) parts.push(`${parsed.beatsPerBar}/${parsed.beatValue} time`);
  if (parsed.instrument !== undefined) parts.push(`instrument #${parsed.instrument}`);
  return parts.length ? `Detected: ${parts.join(' · ')}` : 'No music details detected in prompt.';
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeKey(raw: string): string {
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase().replace('b', 'b').replace('#', '#');
}
