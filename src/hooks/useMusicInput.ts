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
  const melodyDensity = options.melodyDensity ?? 'normal';
  // Serialize hard overrides so the memo dep is a stable primitive
  const settingsOverridesKey = JSON.stringify(options.settingsOverrides ?? null);

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
        melodyDensity,
        promptPlanOverride: options.promptPlanOverride,
        settingsOverrides: options.settingsOverrides,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawText, beatsPerBar, beatValue, bpm, key, mode, bars, instrument, harmonyGeneration, melodyDensity, options.promptPlanOverride, settingsOverridesKey],
  );
}
