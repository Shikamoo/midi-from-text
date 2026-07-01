/**
 * midiExporter.ts
 *
 * Converts the app's internal MusicData shape into a downloadable .mid file
 * using the midi-writer-js library.
 *
 * Design notes
 * ─────────────
 * • This file is the ONLY place that knows about midi-writer-js.
 *   Everything else in the app uses MusicData / NoteEvent.
 * • Timing uses absolute ticks (NoteEvent.tick) rather than delta/wait, so
 *   note ordering doesn't matter and rests require no special handling.
 * • Multi-track: MusicData can have multiple tracks; each becomes a separate
 *   MidiWriter.Track. The Writer receives them as an array → MIDI Format 1.
 * • Velocity: our internal range is 0-127; midi-writer-js expects 1-100.
 * • Instrument: our internal GM programs are 0-indexed; midi-writer-js
 *   ProgramChangeEvent writes the value directly as the MIDI program byte,
 *   so we pass our 0-indexed number straight through.
 */

import MidiWriter from 'midi-writer-js';
import type { MusicData, NoteEvent, Track } from '../types/music';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Quarter-note resolution used by midi-writer-js (matches HEADER_CHUNK_DIVISION 0x0080) */
const TICKS_PER_BEAT = 128;

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ExportResult {
  ok: true;
  filename: string;
}

export interface ExportError {
  ok: false;
  error: string;
}

export type MidiExportResult = ExportResult | ExportError;

/**
 * Build a MIDI file from MusicData and trigger a browser download.
 *
 * @param data     - The music to export.
 * @param filename - Desired filename (defaults to a key-mode-bpm string).
 * @returns        - `{ ok: true, filename }` or `{ ok: false, error }`.
 */
export function exportMidi(data: MusicData, filename?: string): MidiExportResult {
  const resolvedFilename = filename ?? defaultMidiFilename(data);

  try {
    const midiTracks = data.tracks.map((track, index) =>
      buildMidiTrack(track, data, index === 0),
    );

    const writer = new MidiWriter.Writer(midiTracks);
    const bytes = writer.buildFile();

    // Copy into a plain Uint8Array<ArrayBuffer> so TypeScript's strict BlobPart
    // typing is satisfied (buildFile returns Uint8Array<ArrayBufferLike>).
    const safe = new Uint8Array(bytes.byteLength);
    safe.set(bytes);
    const blob = new Blob([safe], { type: 'audio/midi' });

    triggerDownload(blob, resolvedFilename);
    return { ok: true, filename: resolvedFilename };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `MIDI export failed: ${message}` };
  }
}

/**
 * Generates a descriptive default filename from the music metadata.
 * E.g. "C-minor-120bpm.mid"
 */
export function defaultMidiFilename(data: MusicData): string {
  // Sanitise key: "F#" → "Fsharp", "Bb" → "Bflat"
  const key = data.key.replace('#', 'sharp').replace('b', 'flat');
  return `${key}-${data.mode}-${data.bpm}bpm.mid`;
}

// ─── Internal: track builder ─────────────────────────────────────────────────

function buildMidiTrack(
  track: Track,
  data: MusicData,
  isPrimaryTrack: boolean,
): InstanceType<typeof MidiWriter.Track> {
  const midiTrack = new MidiWriter.Track();

  // Tempo and time signature live on the first track (standard MIDI practice)
  if (isPrimaryTrack) {
    midiTrack.setTempo(data.bpm);
    // midiclockspertick=24, notespermidiclock=8 are standard defaults
    midiTrack.setTimeSignature(data.beatsPerBar, data.beatValue, 24, 8);
  }

  midiTrack.addTrackName(track.name);

  // GM program change (0-indexed, written directly as MIDI program byte)
  midiTrack.addEvent(
    new MidiWriter.ProgramChangeEvent({ instrument: clamp(track.instrument, 0, 127) }),
  );

  // Sort by startTick for deterministic output (absolute positioning handles
  // gaps between notes, so rests don't need explicit NoteEvents)
  const noteEvents = [...track.notes]
    .filter((n) => n.pitch !== 'rest')
    .sort((a, b) => a.startTick - b.startTick)
    .map((n) => buildNoteEvent(n));

  if (noteEvents.length > 0) {
    midiTrack.addEvent(noteEvents);
  }

  return midiTrack;
}

// ─── Internal: note event builder ────────────────────────────────────────────

function buildNoteEvent(note: NoteEvent): InstanceType<typeof MidiWriter.NoteEvent> {
  // Absolute start tick in MIDI ticks
  const tick = Math.round(note.startTick * TICKS_PER_BEAT);

  // Duration as explicit tick count: 'T{n}' is parsed directly by midi-writer-js
  const durationTicks = Math.max(1, Math.round(note.duration * TICKS_PER_BEAT));
  const duration = `T${durationTicks}` as const;

  // Velocity: our range 0-127, midi-writer-js range 1-100
  const velocity = Math.max(1, Math.min(100, Math.round((note.velocity / 127) * 100)));

  return new MidiWriter.NoteEvent({
    pitch: [note.pitch as string],
    duration,
    tick,
    velocity,
  });
}

// ─── Internal: download helper ───────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  // Must be in the DOM for Firefox
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoke asynchronously to let the browser begin the download first
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── Utility ─────────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
