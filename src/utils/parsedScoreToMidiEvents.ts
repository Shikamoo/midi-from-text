/**
 * parsedScoreToMidiEvents.ts
 *
 * Converts ParsedScore → NoteEvent[] / MusicData for preview and MIDI export.
 * No regeneration — maps the score as-is.
 */

import type { MusicData, NoteEvent, ParsedScore, Track } from '../types/music';
import { HARMONY_INSTRUMENT, harmonyTokensToNoteEvents } from './score/harmony';
import { harmonyNotesPerChord } from './harmonySettings';

export interface ScoreExportMetadata {
  key: string;
  mode: 'major' | 'minor';
  instrument: number;
  /** GM program for the harmony track (prompt pipeline). Defaults to string ensemble. */
  harmonyInstrument?: number;
}

/** Flatten score tokens into timed note events (includes rests). */
export function parsedScoreToNoteEvents(score: ParsedScore): NoteEvent[] {
  let tick = 0;

  return score.tokens.map((token) => {
    const event: NoteEvent = {
      pitch: token.pitch,
      midiNote: token.midiNote,
      duration: token.duration,
      startTick: tick,
      velocity: token.velocity,
    };
    tick += token.duration;
    return event;
  });
}

/** Build MusicData from an existing ParsedScore — used by preview and export. */
export function parsedScoreToMusicData(
  score: ParsedScore,
  meta: ScoreExportMetadata,
): MusicData {
  const tracks: Track[] = [
    {
      name: 'Melody',
      instrument: meta.instrument,
      notes: parsedScoreToNoteEvents(score),
    },
  ];

  if (score.harmonyTokens && score.harmonyTokens.length > 0) {
    tracks.push({
      name: 'Harmony',
      instrument: meta.harmonyInstrument ?? HARMONY_INSTRUMENT,
      notes: harmonyTokensToNoteEvents(
        score.harmonyTokens,
        score.beatsPerBar,
        harmonyNotesPerChord(score.harmonyGeneration),
      ),
    });
  }

  return {
    bpm: score.bpm,
    key: meta.key,
    mode: meta.mode,
    beatsPerBar: score.beatsPerBar,
    beatValue: score.beatValue,
    bars: score.bars.length,
    tracks,
  };
}
