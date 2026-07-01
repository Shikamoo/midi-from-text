/**
 * audio.ts
 *
 * Types used exclusively by the audio-to-MIDI pipeline.
 * Kept separate from music.ts so the symbolic (text/MusicXML) flows
 * never need to know about audio buffers or pitch frames.
 */

import type { NoteEvent, SourceMode, PitchRangeFilter } from './music';

// ─── Pitch detection output ────────────────────────────────────────────────

/** A single analysed audio frame from the YIN pitch detector. */
export interface PitchFrame {
  /** Centre-time of the frame in seconds from audio start. */
  timeSeconds: number;
  /** Detected fundamental frequency in Hz, or null if no pitch found. */
  frequency: number | null;
  /** Confidence score 0–1 (higher = more reliable). */
  confidence: number;
}

// ─── Loaded audio ──────────────────────────────────────────────────────────

export interface LoadedAudio {
  /** Decoded PCM buffer (may be resampled for performance). */
  buffer: AudioBuffer;
  /** Original file name. */
  fileName: string;
  /** Duration in seconds (of the original file). */
  durationSeconds: number;
  /** Sample rate of the buffer (may differ from original after resampling). */
  sampleRate: number;
}

// ─── Stem buffers ─────────────────────────────────────────────────────────

export interface StemBuffers {
  /** Low-frequency content (≤ BASS_CUTOFF_HZ). Approximation only. */
  bass: AudioBuffer;
  /** High-frequency content (> BASS_CUTOFF_HZ). Approximation only. */
  other: AudioBuffer;
}

// ─── Analysis state ───────────────────────────────────────────────────────

export type AudioStatus =
  | 'idle'
  | 'loading'
  | 'separating'
  | 'detecting'
  | 'ready'
  | 'error';

/** Configuration the user sets before hitting Analyse. */
export interface AudioAnalysisConfig {
  sourceMode: SourceMode;
  pitchRange: PitchRangeFilter;
  bpm: number;
  beatsPerBar: number;
}

/**
 * Detected note sets produced by the analysis.
 * Exactly one field is non-null depending on sourceMode:
 *   full-mix   → fullNotes
 *   bass-only  → bassNotes
 *   other-only → otherNotes
 *   split-both → bassNotes + otherNotes
 */
export interface DetectedNotes {
  bassNotes: NoteEvent[] | null;
  otherNotes: NoteEvent[] | null;
  fullNotes: NoteEvent[] | null;
}
