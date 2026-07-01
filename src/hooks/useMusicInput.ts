/**
 * useMusicInput.ts
 *
 * React hook wrapping parseMusicInput for live preview.
 */

import { useMemo } from 'react';
import {
  parseMusicInput,
  type ParseMusicInputOptions,
  type ParseMusicInputResult,
} from '../utils/parseMusicInput';

export type MusicInputOptions = ParseMusicInputOptions;
export type MusicInputResult = ParseMusicInputResult;

export function useMusicInput(
  rawText: string,
  options: MusicInputOptions = {},
): MusicInputResult {
  const beatsPerBar = options.beatsPerBar ?? 4;
  const beatValue   = options.beatValue   ?? 4;
  const bpm         = options.bpm         ?? 120;
  const key         = options.key         ?? 'C';
  const mode        = options.mode        ?? 'major';
  const bars        = options.bars        ?? 4;
  const instrument  = options.instrument  ?? 0;
  const harmonyGeneration = options.harmonyGeneration;

  return useMemo(
    () =>
      parseMusicInput(rawText, {
        bpm,
        key,
        mode,
        beatsPerBar,
        beatValue,
        bars,
        instrument,
        harmonyGeneration,
      }),
    [rawText, beatsPerBar, beatValue, bpm, key, mode, bars, instrument, harmonyGeneration],
  );
}
