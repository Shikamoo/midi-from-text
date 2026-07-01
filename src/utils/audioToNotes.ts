/**
 * audioToNotes.ts
 *
 * Converts a stream of PitchFrames (from the YIN detector) into a list of
 * NoteEvents compatible with the rest of the app's MusicData pipeline.
 *
 * Algorithm
 * ─────────
 * 1. Discard frames with frequency = null or confidence < threshold.
 * 2. Convert each frame's frequency to a MIDI note number (rounded).
 * 3. Group consecutive frames that stay within ±1 semitone into a segment.
 * 4. Discard segments shorter than MIN_NOTE_SECONDS.
 * 5. Apply optional pitch-range filter (bass / mid-high / auto).
 * 6. Convert segment timing to beats using the user-supplied BPM.
 * 7. Build NoteEvent objects using midiToPitch() for the pitch name.
 */

import type { PitchFrame } from '../types/audio';
import type { NoteEvent, PitchRangeFilter } from '../types/music';
import { midiToPitch } from '../types/music';
import { MIN_CONFIDENCE } from './pitchDetector';

// ─── Constants ────────────────────────────────────────────────────────────

/** Segments shorter than this are discarded as noise. */
const MIN_NOTE_SECONDS = 0.06;

/** Pitch-range boundaries in MIDI note numbers. */
const BASS_MIDI_MIN = 28;   // E1 ≈ 41 Hz
const BASS_MIDI_MAX = 55;   // G3 ≈ 196 Hz
const MIDHIGH_MIDI_MIN = 55; // G3
const MIDHIGH_MIDI_MAX = 108; // C8 ≈ 4 186 Hz

/** Default velocity for detected notes (no dynamics information available). */
const DEFAULT_VELOCITY = 80;

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Convert YIN pitch frames to NoteEvent[].
 *
 * @param frames      - Output of detectPitches().
 * @param bpm         - Beats per minute (used to convert seconds → beats).
 * @param pitchRange  - Filter to apply after detection.
 * @param velocity    - MIDI velocity for all events (0-127).
 */
export function framesToNotes(
  frames: PitchFrame[],
  bpm: number,
  pitchRange: PitchRangeFilter,
  velocity = DEFAULT_VELOCITY,
): NoteEvent[] {
  const beatsPerSecond = bpm / 60;
  const segments = extractSegments(frames, pitchRange);

  return segments
    .filter((seg) => seg.durationSeconds >= MIN_NOTE_SECONDS)
    .map((seg) => ({
      pitch: midiToPitch(seg.midiNote),
      midiNote: seg.midiNote,
      duration: seg.durationSeconds * beatsPerSecond,
      startTick: seg.startSeconds * beatsPerSecond,
      velocity,
    }));
}

// ─── Internal ─────────────────────────────────────────────────────────────

interface Segment {
  midiNote: number;
  startSeconds: number;
  durationSeconds: number;
}

function extractSegments(frames: PitchFrame[], pitchRange: PitchRangeFilter): Segment[] {
  const segments: Segment[] = [];
  let currentMidi: number | null = null;
  let segStart = 0;

  const commit = (endTime: number) => {
    if (currentMidi !== null) {
      segments.push({
        midiNote: currentMidi,
        startSeconds: segStart,
        durationSeconds: endTime - segStart,
      });
      currentMidi = null;
    }
  };

  for (const frame of frames) {
    if (frame.frequency === null || frame.confidence < MIN_CONFIDENCE) {
      commit(frame.timeSeconds);
      continue;
    }

    const rawMidi = freqToMidi(frame.frequency);
    if (rawMidi < 0 || rawMidi > 127) {
      commit(frame.timeSeconds);
      continue;
    }

    const midi = Math.round(rawMidi);

    if (!isInRange(midi, pitchRange)) {
      commit(frame.timeSeconds);
      continue;
    }

    if (currentMidi === null) {
      currentMidi = midi;
      segStart = frame.timeSeconds;
    } else if (Math.abs(midi - currentMidi) > 1) {
      // Pitch jumped — close previous segment, open new one
      commit(frame.timeSeconds);
      currentMidi = midi;
      segStart = frame.timeSeconds;
    }
    // else: same segment continues
  }

  // Close final segment
  if (frames.length > 0) {
    commit(frames[frames.length - 1].timeSeconds);
  }

  return segments;
}

function freqToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

function isInRange(midi: number, filter: PitchRangeFilter): boolean {
  switch (filter) {
    case 'bass':     return midi >= BASS_MIDI_MIN && midi <= BASS_MIDI_MAX;
    case 'mid-high': return midi >= MIDHIGH_MIDI_MIN && midi <= MIDHIGH_MIDI_MAX;
    case 'auto':     return true;
  }
}
