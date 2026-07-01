/**
 * Harmony control types — generation vs playback settings.
 *
 * Generation settings affect deriveHarmony / planToScore and score fingerprint.
 * Playback settings affect preview and export assembly only (no regenerate).
 */

import type { HarmonyCadenceStrength, HarmonyGenerationSettings, HarmonyVoicingWidth, MusicData } from '../types/music';

export type { HarmonyGenerationSettings, HarmonyVoicingWidth as VoicingWidth, HarmonyCadenceStrength };

/** Preview/export assembly — does not change ParsedScore or fingerprint. */
export interface HarmonyPlaybackSettings {
  chordsEnabled: boolean;
  /** Preview-only mix for the harmony track (0–1). */
  harmonyVolume: number;
}

export const DEFAULT_HARMONY_GENERATION: HarmonyGenerationSettings = {
  voicingWidth: 'normal',
  allowInversions: true,
  chordComplexity: 'triads',
  bassDoubling: false,
  chordDensity: '1-per-bar',
  cadenceStrength: 'medium',
};

/** Scale applied to plan.cadenceStrength inside harmony derivation only. */
export function cadenceStrengthScale(strength: HarmonyCadenceStrength): number {
  switch (strength) {
    case 'soft':
      return 0.4;
    case 'strong':
      return 1.65;
    default:
      return 1;
  }
}

/** Effective cadence weight for harmony root selection. */
export function effectiveHarmonyCadence(
  planCadenceStrength: number,
  generation: HarmonyGenerationSettings = DEFAULT_HARMONY_GENERATION,
): number {
  return planCadenceStrength * cadenceStrengthScale(generation.cadenceStrength);
}

/** Notes per chord block (chord tones + optional bass root). */
export function harmonyNotesPerChord(
  generation: HarmonyGenerationSettings = DEFAULT_HARMONY_GENERATION,
): number {
  const chordNotes = generation.chordComplexity === 'sevenths' ? 4 : 3;
  return chordNotes + (generation.bassDoubling ? 1 : 0);
}

/** Block chord slots emitted per bar. */
export function harmonyChordSlotsPerBar(
  generation: HarmonyGenerationSettings = DEFAULT_HARMONY_GENERATION,
): number {
  return generation.chordDensity === '2-per-bar' ? 2 : 1;
}

/** @deprecated Use harmonyNotesPerChord */
export const harmonyNotesPerBar = harmonyNotesPerChord;

export const DEFAULT_HARMONY_PLAYBACK: HarmonyPlaybackSettings = {
  chordsEnabled: true,
  harmonyVolume: 0.55,
};

export function voicingWidthParams(width: HarmonyVoicingWidth): {
  melodyGapSemitones: number;
  baseOctave: number;
  spanWeight: number;
} {
  switch (width) {
    case 'tight':
      return { melodyGapSemitones: 8, baseOctave: 3, spanWeight: 0.35 };
    case 'wide':
      return { melodyGapSemitones: 4, baseOctave: 2, spanWeight: 0.08 };
    default:
      return { melodyGapSemitones: 6, baseOctave: 3, spanWeight: 0.15 };
  }
}

/** Drop the harmony track for melody-only preview or MIDI export. */
export function applyHarmonyPlaybackFilter(
  data: MusicData,
  chordsEnabled: boolean,
): MusicData {
  if (chordsEnabled || data.tracks.length <= 1) return data;
  return { ...data, tracks: [data.tracks[0]] };
}

export function harmonyGenerationFromConfig(config: {
  harmonyVoicingWidth: HarmonyVoicingWidth;
  harmonyAllowInversions: boolean;
  harmonyChordComplexity: import('../types/music').HarmonyChordComplexity;
  harmonyBassDoubling: boolean;
  harmonyChordDensity: import('../types/music').HarmonyChordDensity;
  harmonyCadenceStrength: import('../types/music').HarmonyCadenceStrength;
}): HarmonyGenerationSettings {
  return {
    voicingWidth: config.harmonyVoicingWidth,
    allowInversions: config.harmonyAllowInversions,
    chordComplexity: config.harmonyChordComplexity,
    bassDoubling: config.harmonyBassDoubling,
    chordDensity: config.harmonyChordDensity,
    cadenceStrength: config.harmonyCadenceStrength,
  };
}
