// ─── Pitch & Duration primitives ───────────────────────────────────────────

/** MIDI pitch name with octave, e.g. "C4", "F#3", "Bb5" */
export type PitchName = string;

/** Duration symbol: w=whole, h=half, q=quarter, e=eighth, s=sixteenth */
export type DurationSymbol = 'w' | 'h' | 'q' | 'e' | 's';

/** Duration in quarter-note beats (q=1, h=2, w=4, e=0.5, s=0.25) */
export type DurationBeats = number;

// ─── A single played note ───────────────────────────────────────────────────

export interface NoteEvent {
  /** Note name or "rest" */
  pitch: PitchName | 'rest';
  /** MIDI note number 0-127, or -1 for rests */
  midiNote: number;
  /** Duration in beats */
  duration: DurationBeats;
  /** Tick offset from track start (set by engine) */
  startTick: number;
  /** Velocity 0-127 */
  velocity: number;
}

// ─── A track is a named sequence of note events ────────────────────────────

export interface Track {
  name: string;
  /** General MIDI program number 0-127 */
  instrument: number;
  notes: NoteEvent[];
}

// ─── The central music data shape used throughout the app ──────────────────

export interface MusicData {
  /** Beats per minute */
  bpm: number;
  /** e.g. "C", "F#", "Bb" */
  key: string;
  /** e.g. "minor" | "major" */
  mode: 'major' | 'minor';
  /** Numerator of time signature */
  beatsPerBar: number;
  /** Denominator of time signature as note value (4 = quarter note) */
  beatValue: number;
  /** Number of bars */
  bars: number;
  tracks: Track[];
}

// ─── User-facing music configuration (from UI controls) ────────────────────

/** Block-chord voicing spread for prompt-mode harmony generation. */
export type HarmonyVoicingWidth = 'tight' | 'normal' | 'wide';

/** Triads (default) or diatonic seventh chords for prompt-mode harmony. */
export type HarmonyChordComplexity = 'triads' | 'sevenths';

/** One or two block chords per bar in prompt-mode harmony. */
export type HarmonyChordDensity = '1-per-bar' | '2-per-bar';

/** How strongly harmony pulls toward cadential motion (especially penultimate). */
export type HarmonyCadenceStrength = 'soft' | 'medium' | 'strong';

/** Settings used when deriving harmony in the prompt pipeline. */
export interface HarmonyGenerationSettings {
  voicingWidth: HarmonyVoicingWidth;
  allowInversions: boolean;
  chordComplexity: HarmonyChordComplexity;
  /** Add a low root reinforcement under each block chord. */
  bassDoubling: boolean;
  /** Block chords per bar — default is one. */
  chordDensity: HarmonyChordDensity;
  /** Cadence pull multiplier — medium preserves plan-derived cadence weight. */
  cadenceStrength: HarmonyCadenceStrength;
}

export interface MusicConfig {
  mode: 'prompt' | 'notes';
  promptText: string;
  notesText: string;
  bpm: number;
  key: string;
  musicalMode: 'major' | 'minor';
  beatsPerBar: number;
  beatValue: number;
  bars: number;
  instrument: number;
  /** Prompt-mode harmony voicing (generation — affects fingerprint). */
  harmonyVoicingWidth: HarmonyVoicingWidth;
  /** Prompt-mode chord inversions (generation — affects fingerprint). */
  harmonyAllowInversions: boolean;
  /** Prompt-mode chord complexity (generation — affects fingerprint). */
  harmonyChordComplexity: HarmonyChordComplexity;
  /** Prompt-mode low root doubling under chords (generation — affects fingerprint). */
  harmonyBassDoubling: boolean;
  /** Prompt-mode chords per bar (generation — affects fingerprint). */
  harmonyChordDensity: HarmonyChordDensity;
  /** Prompt-mode cadence pull (generation — affects fingerprint). */
  harmonyCadenceStrength: HarmonyCadenceStrength;
}

// ─── Structured parser result ──────────────────────────────────────────────

export interface ParseError {
  /** Human-readable description of the problem */
  message: string;
  /** Where in the input the error occurred, e.g. "Bar 2, token 'C4q'" */
  location: string;
}

/**
 * Generic result type for all parsers.
 * - `ok` is true when value is non-null (partial success is allowed: ok=true with warnings).
 * - `value` is null only when no usable output was produced.
 * - `errors` are problems that prevented some notes from being parsed.
 * - `warnings` are non-fatal observations (beat mismatch, bar count, etc.).
 */
export interface ParseResult<T> {
  ok: boolean;
  value: T | null;
  errors: ParseError[];
  warnings: string[];
}

// ─── Legacy CompositionPlan (superseded by MusicPlan in musicPlan.ts) ──────
//
// Used only by the legacy promptParser.buildCompositionPlan →
// patternGenerators.generateFromPlan path. Active prompt mode uses
// promptToPlan → planToScore via parseMusicInput instead.

/** Which note pattern to generate */
export type PatternType = 'arpeggio' | 'chords' | 'melody' | 'bassline';

/** How long notes sound relative to their slot */
export type Articulation = 'normal' | 'staccato' | 'legato';

/** Melodic contour preference */
export type ContourDirection = 'ascending' | 'descending' | 'none';

export interface CompositionPlan {
  bpm: number;
  key: string;
  musicalMode: 'major' | 'minor';
  beatsPerBar: number;
  beatValue: number;
  bars: number;
  instrument: number;
  /** Pattern generator to use */
  pattern: PatternType;
  /** Note articulation */
  articulation: Articulation;
  /** Contour direction for arpeggios / melodies */
  direction: ContourDirection;
  /** Whether alternating notes leap up an octave */
  octaveJumps: boolean;
  /** Base note velocity 0-127 (driven by dynamics words like "soft"/"loud") */
  velocity: number;
}

// ─── Audio source-mode & pitch-range (audio-to-MIDI pipeline) ─────────────

/**
 * Which audio source to run note detection on.
 * "split-both" separates bass vs. other stems and detects each separately,
 * producing a two-track MusicData for multi-track MIDI export.
 */
export type SourceMode = 'full-mix' | 'bass-only' | 'other-only' | 'split-both';

/**
 * Optional pitch-range filter applied after detection.
 * "auto" means no range restriction.
 * Bass ≈ MIDI 28–55 (E1–G3), mid-high ≈ MIDI 55–108 (G3–C8).
 */
export type PitchRangeFilter = 'bass' | 'mid-high' | 'auto';

// ─── Generation result ─────────────────────────────────────────────────────

export type GenerationStatus = 'idle' | 'generating' | 'ready' | 'error';

export interface GenerationResult {
  status: GenerationStatus;
  data: MusicData | null;
  error: string | null;
}

// ─── Instrument map (subset of GM) ─────────────────────────────────────────

export const GM_INSTRUMENTS: Record<number, string> = {
  0: 'Acoustic Grand Piano',
  4: 'Electric Piano',
  11: 'Vibraphone',
  24: 'Acoustic Guitar (nylon)',
  25: 'Acoustic Guitar (steel)',
  32: 'Acoustic Bass',
  40: 'Violin',
  48: 'String Ensemble',
  56: 'Trumpet',
  65: 'Alto Sax',
  73: 'Flute',
  80: 'Synth Lead',
};

export const DURATION_BEATS: Record<DurationSymbol, DurationBeats> = {
  w: 4,
  h: 2,
  q: 1,
  e: 0.5,
  s: 0.25,
};

/** Convert a pitch name to MIDI note number */
export function pitchToMidi(pitch: PitchName): number {
  const noteMap: Record<string, number> = {
    C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3,
    E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8,
    Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
  };
  const match = pitch.match(/^([A-G][b#]?)(\d)$/);
  if (!match) return -1;
  const [, name, octave] = match;
  const base = noteMap[name];
  if (base === undefined) return -1;
  return (parseInt(octave, 10) + 1) * 12 + base;
}

const SHARP_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Convert a MIDI note number to a sharp-spelled pitch name, e.g. 60 → "C4" */
export function midiToPitch(midi: number): PitchName {
  const safe = Math.round(midi);
  const name = SHARP_NOTE_NAMES[((safe % 12) + 12) % 12];
  const octave = Math.floor(safe / 12) - 1;
  return `${name}${octave}`;
}

// ─── Smart parsing pipeline types ─────────────────────────────────────────
//
// These types are used by the detect → normalize → parse → group pipeline
// (detectInputMode / normalizeMusicText / parseStrictNotes / groupIntoBars)
// and are separate from the existing NoteEvent / ParsedBar used in notesParser.

/** Canonical duration symbol, same values as DurationSymbol but named for the pipeline */
export type Duration = DurationSymbol;

/**
 * A single parsed note or rest produced by parseStrictNotes.
 * Lives before bar-grouping; carries its original source text for diagnostics.
 */
export interface NoteToken {
  pitch: PitchName | 'rest';
  midiNote: number;
  /** Duration in quarter-note beats */
  duration: number;
  /** Was the duration dotted (duration already includes the dot factor) */
  dotted: boolean;
  velocity: number;
  /** The raw token string this was parsed from, e.g. "C4 q." */
  source: string;
}

/**
 * A bar of NoteTokens produced by groupIntoBars.
 * Contains the bar's own validation issues so callers can render per-bar feedback.
 */
export interface Bar {
  /** 0-based bar index */
  index: number;
  notes: NoteToken[];
  totalBeats: number;
  /** Expected beats from time signature (0 = meter not checked) */
  expectedBeats: number;
  issues: ParseIssue[];
}

/**
 * Fully parsed and grouped score — the canonical intermediate between raw text
 * and MIDI export. Produced by the useMusicInput pipeline.
 */
export interface ParsedScore {
  bars: Bar[];
  /** Melody tokens in order, flat */
  tokens: NoteToken[];
  /**
   * Supporting harmony from the prompt pipeline: block triads, three tokens per bar
   * (root, third, fifth) with bar-length duration. Omitted for note-mode scores.
   */
  harmonyTokens?: NoteToken[];
  /** Generation settings used to produce harmonyTokens (prompt pipeline). */
  harmonyGeneration?: HarmonyGenerationSettings;
  bpm: number;
  beatsPerBar: number;
  beatValue: number;
}

/**
 * A structured issue from any stage of the parsing pipeline.
 * Richer than ParseError: includes severity and the pipeline stage of origin.
 */
export interface ParseIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  /** Human-readable location e.g. "Bar 2, token 'C4q'" */
  location: string;
  /** Which pipeline stage produced this issue */
  stage: 'detect' | 'normalize' | 'parse' | 'group' | 'validate' | 'plan' | 'generate';
}

/** Recognised input format variants */
export type InputMode =
  | 'strict-note-lines'    // one note per line: "C4 q\nE4 q"
  | 'grouped-note-stream'  // space-separated pairs: "C4 q E4 q G4 h"
  | 'prompt-text'          // free prose: "play a jazz melody at 120 bpm"
  | 'abc-like';            // ABC notation headers present

/** Result of detectInputMode */
export interface DetectedMode {
  mode: InputMode;
  /** 0–1 confidence, higher = more certain */
  confidence: number;
}
