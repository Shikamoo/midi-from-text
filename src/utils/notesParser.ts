/**
 * notesParser.ts
 *
 * Parses compact note notation into structured NoteEvent data.
 *
 * Syntax reference
 * ────────────────
 *   Pitch    : C4  D#3  Bb5  (letter A-G, optional accidental b/#, octave digit 0-8)
 *   Rest     : R   (or r — case-insensitive)
 *   Duration : w h q e s  (whole / half / quarter / eighth / sixteenth)
 *   Dotted   : append "." — e.g. "C4 q." → 1.5 beats
 *   Velocity : append ":N" — e.g. "C4 q:64" → velocity 64  (default 80)
 *   Separator: commas between notes, "|" between bars
 *
 * Examples
 * ────────
 *   C4 q, E4 q, G4 h
 *   C4 q, E4 q, G4 h | A4 q, G4 q, E4 h
 *   R q, C4 q., D4 e | G3 h:64, R h
 *
 * Active pipeline: parsePitch / parseDuration are used by parseStrictNotes
 * (via parseMusicInput). The legacy parseNotes entry point below is retained
 * but not wired into the app.
 */

import { DURATION_BEATS, pitchToMidi } from '../types/music';
import type { NoteEvent, DurationSymbol, ParseResult, ParseError } from '../types/music';

// ─── Public value shape ─────────────────────────────────────────────────────

export interface ParsedBar {
  /** 0-based bar index */
  index: number;
  notes: NoteEvent[];
  /** Total beats in this bar as parsed */
  totalBeats: number;
  /** Beats expected from time signature (0 = unchecked) */
  expectedBeats: number;
}

export interface NotesValue {
  /** All notes in order, flat */
  notes: NoteEvent[];
  /** Notes grouped by bar */
  bars: ParsedBar[];
}

export type NotesParseResult = ParseResult<NotesValue>;

// ─── Parse options ──────────────────────────────────────────────────────────

export interface NotesParseOptions {
  /** From time signature numerator — used to warn on beat-budget overrun/underrun */
  beatsPerBar?: number;
  /** From UI "Bars" field — warn if parsed bar count differs */
  bars?: number;
}

// ─── Token regex ─────────────────────────────────────────────────────────────
// Captures: (1) pitch token  (2) duration letter  (3) dot?  (4) velocity?

const TOKEN_RE = /^([A-Za-z][b#]?\d?)\s+([wWhHqQeEsS])(\.?)(?::(\d{1,3}))?$/;

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Top-level entry point.
 * Returns a `ParseResult<NotesValue>` with structured errors and warnings.
 * Never throws — all errors are captured in the result.
 *
 * @legacy Superseded by parseStrictNotes → groupIntoBars in parseMusicInput. No app callers.
 */
export function parseNotes(
  text: string,
  options: NotesParseOptions = {},
): NotesParseResult {
  const { beatsPerBar = 0, bars: expectedBars = 0 } = options;

  const allErrors: ParseError[] = [];
  const allWarnings: string[] = [];
  const parsedBars: ParsedBar[] = [];
  const allNotes: NoteEvent[] = [];

  const barStrings = text
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);

  if (barStrings.length === 0) {
    return {
      ok: false,
      value: null,
      errors: [{ message: 'No notes found. Enter at least one note.', location: 'input' }],
      warnings: [],
    };
  }

  let globalTick = 0;

  for (let i = 0; i < barStrings.length; i++) {
    const { bar, errors, warnings } = parseBar(barStrings[i], i, globalTick, beatsPerBar);
    allErrors.push(...errors);
    allWarnings.push(...warnings);
    parsedBars.push(bar);
    allNotes.push(...bar.notes);
    globalTick += bar.totalBeats;
  }

  // Warn if bar count doesn't match the "Bars" setting
  if (expectedBars > 0 && parsedBars.length !== expectedBars) {
    const pl = (n: number) => `${n} bar${n !== 1 ? 's' : ''}`;
    allWarnings.push(
      `You entered ${pl(parsedBars.length)} but the Bars setting is ${expectedBars}. ` +
        `The exported file will contain ${pl(parsedBars.length)}.`,
    );
  }

  const hasNotes = allNotes.length > 0;

  return {
    ok: hasNotes,
    value: hasNotes ? { notes: allNotes, bars: parsedBars } : null,
    errors: allErrors,
    warnings: allWarnings,
  };
}

// ─── Pitch parser ─────────────────────────────────────────────────────────────

export interface PitchParseOk {
  pitch: string;
  midiNote: number;
}

/**
 * Parse and validate a raw pitch token.
 * Returns `{ pitch, midiNote }` on success or `{ error }` on failure.
 */
export function parsePitch(raw: string): PitchParseOk | { error: string } {
  // Rest
  if (/^[Rr]$/.test(raw)) return { pitch: 'rest', midiNote: -1 };

  const match = raw.match(/^([A-Ga-g])([b#]?)(\d)$/);
  if (!match) {
    return {
      error:
        `"${raw}" is not a valid pitch. ` +
        `Use a note letter (A–G), optional accidental (b or #), and an octave digit — e.g. C4, D#3, Bb5. ` +
        `Use R for a rest.`,
    };
  }

  const [, letter, accidental, octaveStr] = match;
  const pitch = letter.toUpperCase() + accidental + octaveStr;
  const midiNote = pitchToMidi(pitch);

  if (midiNote < 0 || midiNote > 127) {
    return { error: `"${pitch}" is outside the MIDI range (0–127). Try a different octave.` };
  }

  return { pitch, midiNote };
}

// ─── Duration parser ──────────────────────────────────────────────────────────

export interface DurationParseOk {
  duration: number;
}

/**
 * Parse a duration symbol and optional dot.
 * Returns `{ duration }` (in beats) or `{ error }`.
 */
export function parseDuration(sym: string, dotted: boolean): DurationParseOk | { error: string } {
  const normalized = sym.toLowerCase() as DurationSymbol;
  const base = DURATION_BEATS[normalized];

  if (base === undefined) {
    return {
      error: `"${sym}" is not a valid duration. Use w (whole), h (half), q (quarter), e (eighth), or s (sixteenth).`,
    };
  }

  return { duration: dotted ? base * 1.5 : base };
}

// ─── Bar parser ───────────────────────────────────────────────────────────────

interface BarParseResult {
  bar: ParsedBar;
  errors: ParseError[];
  warnings: string[];
}

function parseBar(
  barStr: string,
  barIndex: number,
  startTick: number,
  beatsPerBar: number,
): BarParseResult {
  const errors: ParseError[] = [];
  const warnings: string[] = [];
  const notes: NoteEvent[] = [];
  let localTick = startTick;

  const tokens = barStr
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    errors.push({ message: 'Bar is empty.', location: `Bar ${barIndex + 1}` });
  }

  for (const token of tokens) {
    const result = parseToken(token, localTick);
    if ('error' in result) {
      errors.push({ message: result.error, location: `Bar ${barIndex + 1}, token "${token}"` });
    } else {
      notes.push(result.note);
      localTick += result.note.duration;
    }
  }

  const totalBeats = notes.reduce((sum, n) => sum + n.duration, 0);

  // Beat-budget check
  if (beatsPerBar > 0 && notes.length > 0) {
    const diff = totalBeats - beatsPerBar;
    const EPSILON = 0.001;
    if (Math.abs(diff) > EPSILON) {
      const direction = diff > 0 ? 'overfull' : 'underfull';
      warnings.push(
        `Bar ${barIndex + 1} is ${direction}: ` +
          `has ${formatBeats(totalBeats)} but expects ${formatBeats(beatsPerBar)} ` +
          `(${formatBeats(Math.abs(diff))} ${diff > 0 ? 'too many' : 'short'}).`,
      );
    }
  }

  return {
    bar: { index: barIndex, notes, totalBeats, expectedBeats: beatsPerBar },
    errors,
    warnings,
  };
}

// ─── Token parser ─────────────────────────────────────────────────────────────

interface TokenParseOk {
  note: NoteEvent;
}

function parseToken(token: string, startTick: number): TokenParseOk | { error: string } {
  const match = token.match(TOKEN_RE);
  if (!match) {
    return {
      error:
        `Cannot parse "${token}". ` +
        `Expected "Pitch Duration" — e.g. "C4 q", "D#3 h.", or "R q". ` +
        `Make sure pitch and duration are separated by a space.`,
    };
  }

  const [, rawPitch, rawDur, dot, velStr] = match;

  const pitchResult = parsePitch(rawPitch);
  if ('error' in pitchResult) return { error: pitchResult.error };

  const durResult = parseDuration(rawDur, dot === '.');
  if ('error' in durResult) return { error: durResult.error };

  const velocity = velStr
    ? Math.min(127, Math.max(0, parseInt(velStr, 10)))
    : 80;

  return {
    note: {
      pitch: pitchResult.pitch,
      midiNote: pitchResult.midiNote,
      duration: durResult.duration,
      startTick,
      velocity,
    },
  };
}

// ─── Display helpers ──────────────────────────────────────────────────────────

const DURATION_LABELS: ReadonlyMap<number, string> = new Map([
  [4,    'whole'],
  [3,    'dotted half'],
  [2,    'half'],
  [1.5,  'dotted quarter'],
  [1,    'quarter'],
  [0.75, 'dotted eighth'],
  [0.5,  'eighth'],
  [0.25, 'sixteenth'],
]);

export function durationLabel(beats: number): string {
  return DURATION_LABELS.get(beats) ?? `${beats} beats`;
}

export function noteEventLabel(n: NoteEvent): string {
  if (n.pitch === 'rest') return `Rest — ${durationLabel(n.duration)}`;
  return `${n.pitch}  ${durationLabel(n.duration)}  vel ${n.velocity}`;
}

function formatBeats(beats: number): string {
  const rounded = Math.round(beats * 100) / 100;
  return `${rounded} beat${rounded !== 1 ? 's' : ''}`;
}
