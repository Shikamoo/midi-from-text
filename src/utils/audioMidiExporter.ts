/**
 * audioMidiExporter.ts
 *
 * Builds MusicData from detected audio notes and delegates the actual file
 * writing to midiExporter.ts (which is the only place that knows about
 * midi-writer-js).
 *
 * Export variants
 * ───────────────
 * exportAudioMidi()
 *   • Exports a single MIDI file whose content depends on sourceMode:
 *     – full-mix   → 1 track (piano)
 *     – bass-only  → 1 track (acoustic bass)
 *     – other-only → 1 track (piano)
 *     – split-both → 2 tracks (bass + piano), Format 1 multi-track MIDI
 *
 * exportBassOnlyMidi() / exportOtherOnlyMidi()
 *   • Available after a "split-both" analysis so the user can download each
 *     stem separately as well.
 */

import type { NoteEvent, MusicData, Track, SourceMode } from '../types/music';
import type { DetectedNotes } from '../types/audio';
import { exportMidi, type MidiExportResult } from './midiExporter';

// General MIDI program numbers
const GM_PIANO = 0;           // Acoustic Grand Piano
const GM_ACOUSTIC_BASS = 32; // Acoustic Bass

// ─── Public API ───────────────────────────────────────────────────────────

export interface AudioExportOptions {
  sourceMode: SourceMode;
  bpm: number;
  beatsPerBar: number;
  /** Custom filename without extension. Defaults to "audio-midi". */
  baseFilename?: string;
}

/**
 * Export the main MIDI file for the current sourceMode.
 * For "split-both" this produces a two-track (Format 1) MIDI file.
 */
export function exportAudioMidi(
  notes: DetectedNotes,
  opts: AudioExportOptions,
): MidiExportResult {
  const data = buildMusicData(notes, opts);
  if (!data) return { ok: false, error: 'No detected notes to export.' };
  const base = opts.baseFilename ?? 'audio-midi';
  const suffix = sourceSuffix(opts.sourceMode);
  return exportMidi(data, `${base}${suffix}.mid`);
}

/** Export bass track only (useful after a split-both analysis). */
export function exportBassOnlyMidi(
  bassNotes: NoteEvent[],
  opts: Omit<AudioExportOptions, 'sourceMode'>,
): MidiExportResult {
  const data = buildFromSingleTrack(bassNotes, 'Bass', GM_ACOUSTIC_BASS, opts);
  const base = opts.baseFilename ?? 'audio-midi';
  return exportMidi(data, `${base}-bass.mid`);
}

/** Export other/upper track only (useful after a split-both analysis). */
export function exportOtherOnlyMidi(
  otherNotes: NoteEvent[],
  opts: Omit<AudioExportOptions, 'sourceMode'>,
): MidiExportResult {
  const data = buildFromSingleTrack(otherNotes, 'Upper', GM_PIANO, opts);
  const base = opts.baseFilename ?? 'audio-midi';
  return exportMidi(data, `${base}-upper.mid`);
}

// ─── Internal builders ────────────────────────────────────────────────────

function buildMusicData(
  notes: DetectedNotes,
  opts: AudioExportOptions,
): MusicData | null {
  const { sourceMode, bpm, beatsPerBar } = opts;
  const tracks: Track[] = [];

  switch (sourceMode) {
    case 'full-mix': {
      if (!notes.fullNotes?.length) return null;
      tracks.push(makeTrack('Full Mix', GM_PIANO, notes.fullNotes));
      break;
    }
    case 'bass-only': {
      if (!notes.bassNotes?.length) return null;
      tracks.push(makeTrack('Bass', GM_ACOUSTIC_BASS, notes.bassNotes));
      break;
    }
    case 'other-only': {
      if (!notes.otherNotes?.length) return null;
      tracks.push(makeTrack('Upper', GM_PIANO, notes.otherNotes));
      break;
    }
    case 'split-both': {
      const hasBass  = (notes.bassNotes?.length  ?? 0) > 0;
      const hasOther = (notes.otherNotes?.length ?? 0) > 0;
      if (!hasBass && !hasOther) return null;
      if (hasBass)  tracks.push(makeTrack('Bass',  GM_ACOUSTIC_BASS, notes.bassNotes!));
      if (hasOther) tracks.push(makeTrack('Upper', GM_PIANO,         notes.otherNotes!));
      break;
    }
  }

  if (tracks.length === 0) return null;

  const totalBeats = Math.max(
    ...tracks.flatMap((t) => t.notes.map((n) => n.startTick + n.duration)),
    0,
  );
  const bars = Math.max(1, Math.ceil(totalBeats / beatsPerBar));

  return {
    bpm,
    key: 'C',
    mode: 'major',
    beatsPerBar,
    beatValue: 4,
    bars,
    tracks,
  };
}

function buildFromSingleTrack(
  notes: NoteEvent[],
  name: string,
  instrument: number,
  opts: Omit<AudioExportOptions, 'sourceMode'>,
): MusicData {
  const { bpm, beatsPerBar } = opts;
  const totalBeats = Math.max(
    ...notes.map((n) => n.startTick + n.duration),
    0,
  );
  const bars = Math.max(1, Math.ceil(totalBeats / beatsPerBar));
  return {
    bpm,
    key: 'C',
    mode: 'major',
    beatsPerBar,
    beatValue: 4,
    bars,
    tracks: [makeTrack(name, instrument, notes)],
  };
}

function makeTrack(name: string, instrument: number, notes: NoteEvent[]): Track {
  return { name, instrument, notes };
}

function sourceSuffix(mode: SourceMode): string {
  switch (mode) {
    case 'full-mix':   return '-full';
    case 'bass-only':  return '-bass';
    case 'other-only': return '-upper';
    case 'split-both': return '-split';
  }
}
