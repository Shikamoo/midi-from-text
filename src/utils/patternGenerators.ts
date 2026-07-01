/**
 * patternGenerators.ts
 *
 * LEGACY — not used by the active parseMusicInput pipeline.
 *
 * Each generator turns a CompositionPlan into a flat NoteEvent[]. Prompt mode
 * now uses promptToPlan → planToScore instead. Kept for reference; no app
 * callers import generateFromPlan.
 */

import { midiToPitch } from '../types/music';
import type { CompositionPlan, NoteEvent } from '../types/music';

// ─── Music-theory primitives ────────────────────────────────────────────────

const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10];

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Diatonic chord progression as scale-degree indices (I – vi – IV – V). */
const PROGRESSION = [0, 5, 3, 4];

function scaleIntervals(mode: 'major' | 'minor'): number[] {
  return mode === 'major' ? MAJOR_INTERVALS : MINOR_INTERVALS;
}

/** Pitch class (0-11) of a key, resolving flats to their sharp equivalents. */
function keyToPitchClass(key: string): number {
  const enharmonic: Record<string, string> = {
    Cb: 'B', Db: 'C#', Eb: 'D#', Fb: 'E', Gb: 'F#', Ab: 'G#', Bb: 'A#',
  };
  const resolved = enharmonic[key] ?? key;
  const index = NOTE_NAMES.indexOf(resolved);
  return index < 0 ? 0 : index;
}

/** MIDI number of the key's root in a given octave (octave 4 → middle C area). */
function rootMidi(plan: CompositionPlan, octave: number): number {
  return keyToPitchClass(plan.key) + (octave + 1) * 12;
}

/**
 * Build a list of scale-tone MIDI numbers spanning `octaves` octaves, starting
 * at `octave`. e.g. 1 octave of C major → [60,62,64,65,67,69,71].
 */
function scaleMidiRange(plan: CompositionPlan, octave: number, octaves: number): number[] {
  const root = rootMidi(plan, octave);
  const intervals = scaleIntervals(plan.musicalMode);
  const out: number[] = [];
  for (let o = 0; o < octaves; o++) {
    for (const interval of intervals) {
      out.push(root + o * 12 + interval);
    }
  }
  return out;
}

// ─── Shared note helpers ─────────────────────────────────────────────────────

/** Apply articulation to a slot length, returning the sounding duration in beats. */
function articulate(slotBeats: number, articulation: CompositionPlan['articulation']): number {
  switch (articulation) {
    case 'staccato':
      return Math.max(0.05, slotBeats * 0.5);
    case 'legato':
      return slotBeats;
    default:
      // Tiny gap keeps notes from running together.
      return slotBeats * 0.95;
  }
}

function makeNote(midi: number, duration: number, startTick: number, velocity: number): NoteEvent {
  const clamped = Math.max(0, Math.min(127, Math.round(midi)));
  return {
    pitch: midiToPitch(clamped),
    midiNote: clamped,
    duration,
    startTick,
    velocity,
  };
}

/**
 * Place a repeating sequence of MIDI notes at fixed slots until the bars are
 * filled. Used by the single-line patterns (arpeggio, melody).
 */
function placeSequence(plan: CompositionPlan, sequence: number[], slotBeats: number): NoteEvent[] {
  const totalBeats = plan.bars * plan.beatsPerBar;
  const notes: NoteEvent[] = [];
  const dur = articulate(slotBeats, plan.articulation);
  let tick = 0;
  let step = 0;

  while (tick < totalBeats - 1e-9 && sequence.length > 0) {
    let midi = sequence[step % sequence.length];
    if (plan.octaveJumps && step % 2 === 1) midi += 12;
    notes.push(makeNote(midi, dur, tick, plan.velocity));
    tick += slotBeats;
    step++;
  }

  return notes;
}

function applyDirection(sequence: number[], direction: CompositionPlan['direction']): number[] {
  return direction === 'descending' ? [...sequence].reverse() : sequence;
}

// ─── Pattern: arpeggio ───────────────────────────────────────────────────────

/** Broken triad (1-3-5-8) cycled as eighth notes. */
function generateArpeggio(plan: CompositionPlan): NoteEvent[] {
  const root = rootMidi(plan, 4);
  const intervals = scaleIntervals(plan.musicalMode);
  const chordTones = [intervals[0], intervals[2], intervals[4], 12].map((i) => root + i);
  return placeSequence(plan, applyDirection(chordTones, plan.direction), 0.5);
}

// ─── Pattern: chords ─────────────────────────────────────────────────────────

/** Block diatonic triads, one chord per bar, following the I-vi-IV-V loop. */
function generateChords(plan: CompositionPlan): NoteEvent[] {
  const scale = scaleMidiRange(plan, 4, 2); // two octaves so degree+4 always fits
  const totalBeats = plan.bars * plan.beatsPerBar;
  const chordSlot = plan.beatsPerBar;
  const dur = articulate(chordSlot, plan.articulation);
  const notes: NoteEvent[] = [];
  let tick = 0;
  let bar = 0;

  while (tick < totalBeats - 1e-9) {
    const degree = PROGRESSION[bar % PROGRESSION.length];
    const triad = [degree, degree + 2, degree + 4].map((d) => scale[d % scale.length]);
    for (const midi of triad) {
      notes.push(makeNote(midi, dur, tick, plan.velocity));
    }
    tick += chordSlot;
    bar++;
  }

  return notes;
}

// ─── Pattern: melody ─────────────────────────────────────────────────────────

/** Stepwise single-line melody in quarter notes over a two-octave scale. */
function generateMelody(plan: CompositionPlan): NoteEvent[] {
  if (plan.direction === 'ascending' || plan.direction === 'descending') {
    const scale = scaleMidiRange(plan, 4, 2);
    return placeSequence(plan, applyDirection(scale, plan.direction), 1);
  }

  // Gentle zig-zag motif over a single octave for an undirected "melody".
  const oneOctave = scaleMidiRange(plan, 4, 1);
  const motif = [0, 2, 1, 3, 2, 4, 3, 1];
  const sequence = motif.map((d) => oneOctave[d % oneOctave.length]);
  return placeSequence(plan, sequence, 1);
}

// ─── Pattern: bassline ───────────────────────────────────────────────────────

/** Low root notes in quarter notes, following the chord progression per bar. */
function generateBassline(plan: CompositionPlan): NoteEvent[] {
  const lowScale = scaleMidiRange(plan, 2, 1);
  const totalBeats = plan.bars * plan.beatsPerBar;
  const slot = 1;
  const dur = articulate(slot, plan.articulation);
  const notes: NoteEvent[] = [];
  let tick = 0;
  let beatInBar = 0;
  let bar = 0;
  let step = 0;

  while (tick < totalBeats - 1e-9) {
    const degree = PROGRESSION[bar % PROGRESSION.length];
    let midi = lowScale[degree % lowScale.length];
    if (plan.octaveJumps && step % 2 === 1) midi += 12;
    notes.push(makeNote(midi, dur, tick, plan.velocity));

    tick += slot;
    beatInBar += slot;
    step++;
    if (beatInBar >= plan.beatsPerBar - 1e-9) {
      beatInBar = 0;
      bar++;
    }
  }

  return notes;
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

/**
 * Turn a CompositionPlan into note events by delegating to the right generator.
 * Always returns at least one note for any valid plan (never throws).
 *
 * @legacy Superseded by planToScore. No app callers.
 */
export function generateFromPlan(plan: CompositionPlan): NoteEvent[] {
  switch (plan.pattern) {
    case 'arpeggio':
      return generateArpeggio(plan);
    case 'chords':
      return generateChords(plan);
    case 'bassline':
      return generateBassline(plan);
    case 'melody':
    default:
      return generateMelody(plan);
  }
}
