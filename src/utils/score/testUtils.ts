import { midiToPitch } from '../../types/music';
import type { NoteToken } from '../../types/music';

export function makeNote(midi: number, duration: number, velocity: number): NoteToken {
  const clamped = Math.max(0, Math.min(127, Math.round(midi)));
  const pitch = midiToPitch(clamped);
  return {
    pitch,
    midiNote: clamped,
    duration,
    dotted: false,
    velocity,
    source: '',
  };
}
