import type { NoteToken } from '../../types/music';
import type { MusicPlan } from '../../types/musicPlan';

export interface RhythmSlot {
  duration: number;
  rest?: boolean;
  /** Downbeat or long-note accent for chord-tone placement */
  accent?: boolean;
}

export type PhraseShape = 'exact-repeat' | 'slight-variation' | 'call-response';

export interface MotifBar {
  rhythm: RhythmSlot[];
  degrees: number[];
  tokens: NoteToken[];
}

export interface StylePreset {
  id: 'funk' | 'nu-disco' | 'house' | 'cinematic-piano' | 'generic';
  hookDegrees: number[];
  rhythmPatterns: RhythmSlot[][];
  phraseShape: PhraseShape;
  turnaroundDegrees: number[];
  /** Target scale degrees per bar index (mod length) for 4-bar phrase arc */
  phraseArcDegrees: number[];
  /** Rest probability boost on offbeats (0–1) */
  syncopationBias: number;
}

export interface VaryMotifContext {
  plan: MusicPlan;
  preset: StylePreset;
  phraseShape: StylePreset['phraseShape'];
  barIndex: number;
  cycle: number;
  motifIndex: number;
  totalBars: number;
  scaleNotes: number[];
}

export interface ScaleContext {
  notes: number[];
  rootMidi: number;
}

export const MIN_MELODY_MIDI = 36;
export const MAX_MELODY_MIDI = 84;
export const CHORD_TONE_DEGREES = [0, 2, 4] as const;
