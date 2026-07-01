/**
 * noteCleanup.ts
 *
 * A small, pure note-cleanup pipeline applied to detected audio notes BEFORE
 * MIDI export.  None of these functions mutate their inputs; each returns a
 * fresh array.  Timing is expressed in quarter-note beats (the same unit used
 * by NoteEvent.startTick / NoteEvent.duration throughout the app).
 *
 * Design notes
 * ────────────
 * • This file contains NO React and NO DOM access — it is a pure transform
 *   layer that sits between analysis output (DetectedNotes) and the MIDI
 *   exporter.  Keeping it framework-free makes it trivially testable.
 * • Track separation is preserved: cleanupDetectedNotes() runs the same
 *   per-track pipeline independently on full / bass / upper note groups.
 * • Invariants guaranteed on output:
 *     – every note has duration ≥ MIN_DURATION_BEATS (never zero/negative)
 *     – every note has startTick ≥ 0
 *     – notes are sorted ascending by startTick
 */

import type { NoteEvent } from '../types/music';
import type { DetectedNotes } from '../types/audio';

// ─── Public option types ────────────────────────────────────────────────────

/** Quantization grid choices exposed in the UI. */
export type QuantizeGrid = 'off' | '1/16' | '1/8' | '1/4';

export interface CleanupOptions {
  /** Snap note starts & durations to this grid. 'off' disables quantization. */
  quantize: QuantizeGrid;
  /** Remove notes shorter than this many milliseconds. 0 disables removal. */
  minNoteMs: number;
  /** Merge adjacent same-pitch notes separated by a very small gap. */
  mergeRepeated: boolean;
  /** Extend notes toward the next note when the gap is small (legato). */
  legato: boolean;
}

export const DEFAULT_CLEANUP: CleanupOptions = {
  quantize: 'off',
  minNoteMs: 60,
  mergeRepeated: true,
  legato: false,
};

// ─── Internal constants ─────────────────────────────────────────────────────

/** Max gap (ms) for two same-pitch notes to be considered "repeated". */
const MERGE_GAP_MS = 45;

/** Largest gap (beats) legato will bridge — avoids fusing across real rests. */
const LEGATO_MAX_GAP_BEATS = 1.0;

/** Absolute floor so a note can never collapse to zero/negative length. */
const MIN_DURATION_BEATS = 1 / 256;

// ─── Quantization helper ────────────────────────────────────────────────────

/**
 * Convert a quantization grid choice to its length in quarter-note beats.
 * Returns null when quantization is off.
 *   1/4 → 1 beat, 1/8 → 0.5 beat, 1/16 → 0.25 beat
 */
export function gridToBeats(grid: QuantizeGrid): number | null {
  switch (grid) {
    case 'off':  return null;
    case '1/4':  return 1;
    case '1/8':  return 0.5;
    case '1/16': return 0.25;
  }
}

/** Convert a millisecond duration to beats at the given tempo. */
export function msToBeats(ms: number, bpm: number): number {
  return (ms * bpm) / 60_000;
}

// ─── Individual cleanup steps (pure) ────────────────────────────────────────

/** Drop notes whose duration is below `minBeats`. */
export function removeShortNotes(notes: NoteEvent[], minBeats: number): NoteEvent[] {
  if (minBeats <= 0) return notes.map((n) => ({ ...n }));
  return notes.filter((n) => n.duration >= minBeats).map((n) => ({ ...n }));
}

/**
 * Merge consecutive notes of the SAME pitch when the gap between them is
 * ≤ maxGapBeats. Overlapping same-pitch notes (negative gap) are also merged.
 * Assumes input is sorted ascending by startTick.
 */
export function mergeRepeatedNotes(notes: NoteEvent[], maxGapBeats: number): NoteEvent[] {
  const out: NoteEvent[] = [];
  for (const n of notes) {
    const last = out[out.length - 1];
    if (last && last.midiNote === n.midiNote && n.midiNote >= 0) {
      const gap = n.startTick - (last.startTick + last.duration);
      if (gap <= maxGapBeats) {
        const newEnd = Math.max(last.startTick + last.duration, n.startTick + n.duration);
        last.duration = newEnd - last.startTick;
        last.velocity = Math.max(last.velocity, n.velocity);
        continue;
      }
    }
    out.push({ ...n });
  }
  return out;
}

/**
 * Snap each note's start and duration to the grid.
 * Duration is floored to one grid unit so notes never vanish.
 */
export function quantizeNotes(notes: NoteEvent[], gridBeats: number): NoteEvent[] {
  return notes.map((n) => {
    const start = Math.max(0, Math.round(n.startTick / gridBeats) * gridBeats);
    const dur = Math.max(gridBeats, Math.round(n.duration / gridBeats) * gridBeats);
    return { ...n, startTick: start, duration: dur };
  });
}

/**
 * Extend each note toward the following note when the gap between them is
 * positive and ≤ maxGapBeats (legato). Long gaps (real rests) are left alone.
 * Assumes input is sorted ascending by startTick.
 */
export function applyLegato(notes: NoteEvent[], maxGapBeats: number): NoteEvent[] {
  const out = notes.map((n) => ({ ...n }));
  for (let i = 0; i < out.length - 1; i++) {
    const cur = out[i];
    const next = out[i + 1];
    const curEnd = cur.startTick + cur.duration;
    const gap = next.startTick - curEnd;
    if (gap > 0 && gap <= maxGapBeats) {
      // Safe: next starts strictly after cur's start, so duration stays positive
      cur.duration = next.startTick - cur.startTick;
    }
  }
  return out;
}

// ─── Per-track orchestration ────────────────────────────────────────────────

/**
 * Run the full cleanup pipeline on a single track's notes.
 * Order: sort → merge repeats → remove short → quantize → legato → guard.
 *
 * Merge runs before short-note removal so a fragmented sustained note (split
 * by brief confidence dips during detection) is re-joined before its length
 * is checked.
 */
export function cleanupTrack(
  notes: NoteEvent[],
  options: CleanupOptions,
  bpm: number,
): NoteEvent[] {
  let out = notes
    .filter((n) => n.pitch !== 'rest' && n.midiNote >= 0)
    .map((n) => ({ ...n }))
    .sort((a, b) => a.startTick - b.startTick);

  if (options.mergeRepeated) {
    out = mergeRepeatedNotes(out, msToBeats(MERGE_GAP_MS, bpm));
  }

  const minBeats = msToBeats(options.minNoteMs, bpm);
  if (minBeats > 0) {
    out = removeShortNotes(out, minBeats);
  }

  const grid = gridToBeats(options.quantize);
  if (grid !== null) {
    out = quantizeNotes(out, grid);
    // Quantization can collide starts; re-sort to keep ordering stable
    out.sort((a, b) => a.startTick - b.startTick);
  }

  if (options.legato) {
    out = applyLegato(out, LEGATO_MAX_GAP_BEATS);
  }

  // Final invariant guard — never emit zero/negative durations or negative starts
  return out.map((n) => ({
    ...n,
    startTick: Math.max(0, n.startTick),
    duration: Math.max(MIN_DURATION_BEATS, n.duration),
  }));
}

/**
 * Apply cleanup independently to each populated track, preserving the
 * full / bass / upper separation used by split-by-register mode.
 */
export function cleanupDetectedNotes(
  notes: DetectedNotes,
  options: CleanupOptions,
  bpm: number,
): DetectedNotes {
  return {
    fullNotes:  notes.fullNotes  ? cleanupTrack(notes.fullNotes,  options, bpm) : null,
    bassNotes:  notes.bassNotes  ? cleanupTrack(notes.bassNotes,  options, bpm) : null,
    otherNotes: notes.otherNotes ? cleanupTrack(notes.otherNotes, options, bpm) : null,
  };
}

/** Count total notes across all populated tracks. */
export function countDetected(notes: DetectedNotes): number {
  return (
    (notes.fullNotes?.length  ?? 0) +
    (notes.bassNotes?.length  ?? 0) +
    (notes.otherNotes?.length ?? 0)
  );
}
