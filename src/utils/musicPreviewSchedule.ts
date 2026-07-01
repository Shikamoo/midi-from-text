/**
 * musicPreviewSchedule.ts
 *
 * Pure helpers for scheduling in-browser preview playback from MusicData.
 * Uses the same beat-based timing as MIDI export (startTick / duration in beats).
 */

import type { MusicData } from '../types/music';

export interface PreviewNote {
  midiNote: number;
  /** Start offset from piece start, in quarter-note beats */
  startBeat: number;
  /** Note length in quarter-note beats */
  durationBeats: number;
  velocity: number;
  /** 0 = melody, 1+ = harmony / additional tracks */
  trackIndex: number;
}

/** Convert beat offset to seconds at the given BPM. */
export function beatToSeconds(beat: number, bpm: number): number {
  if (bpm <= 0) return 0;
  return (beat * 60) / bpm;
}

/** MIDI note number → frequency in Hz (A4 = 440). */
export function midiToFrequency(midiNote: number): number {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

/**
 * Collect playable notes from all tracks, sorted by start time.
 * Rests are omitted — their timing is preserved via subsequent note startBeat values.
 */
export function buildPreviewNotes(data: MusicData): PreviewNote[] {
  const notes: PreviewNote[] = [];

  for (const [trackIndex, track] of data.tracks.entries()) {
    for (const event of track.notes) {
      if (event.pitch === 'rest' || event.midiNote < 0) continue;
      notes.push({
        midiNote: event.midiNote,
        startBeat: event.startTick,
        durationBeats: event.duration,
        velocity: event.velocity,
        trackIndex,
      });
    }
  }

  return notes.sort(
    (a, b) => a.startBeat - b.startBeat || a.midiNote - b.midiNote,
  );
}

/** Total preview length in seconds, including rest gaps. */
export function previewDurationSeconds(data: MusicData): number {
  let maxEndBeat = 0;

  for (const track of data.tracks) {
    for (const event of track.notes) {
      maxEndBeat = Math.max(maxEndBeat, event.startTick + event.duration);
    }
  }

  return beatToSeconds(maxEndBeat, data.bpm);
}
