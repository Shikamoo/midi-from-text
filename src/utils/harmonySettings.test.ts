import { describe, expect, it } from 'vitest';
import type { MusicData } from '../types/music';
import {
  applyHarmonyPlaybackFilter,
  DEFAULT_HARMONY_GENERATION,
  cadenceStrengthScale,
  effectiveHarmonyCadence,
  harmonyNotesPerChord,
  harmonyChordSlotsPerBar,
  voicingWidthParams,
} from './harmonySettings';

function sampleMusicData(trackCount: number): MusicData {
  const tracks = Array.from({ length: trackCount }, (_, i) => ({
    name: i === 0 ? 'Melody' : 'Harmony',
    instrument: i === 0 ? 0 : 48,
    notes: [
      {
        pitch: 'C4' as const,
        midiNote: 60,
        duration: 1,
        startTick: 0,
        velocity: 80,
      },
    ],
  }));

  return {
    bpm: 120,
    key: 'C',
    mode: 'major',
    beatsPerBar: 4,
    beatValue: 4,
    bars: 1,
    tracks,
  };
}

describe('harmonySettings', () => {
  it('defaults match current first-version harmony behavior', () => {
    expect(DEFAULT_HARMONY_GENERATION).toEqual({
      voicingWidth: 'normal',
      allowInversions: true,
      chordComplexity: 'triads',
      bassDoubling: false,
      chordDensity: '1-per-bar',
      cadenceStrength: 'medium',
    });
    expect(voicingWidthParams('normal')).toEqual({
      melodyGapSemitones: 6,
      baseOctave: 3,
      spanWeight: 0.15,
    });
  });

  it('applyHarmonyPlaybackFilter keeps melody when chords are disabled', () => {
    const data = sampleMusicData(2);
    const filtered = applyHarmonyPlaybackFilter(data, false);

    expect(filtered.tracks).toHaveLength(1);
    expect(filtered.tracks[0].name).toBe('Melody');
    expect(filtered).not.toBe(data);
    expect(data.tracks).toHaveLength(2);
  });

  it('cadence strength scales plan cadence for harmony only', () => {
    expect(cadenceStrengthScale('medium')).toBe(1);
    expect(cadenceStrengthScale('soft')).toBeLessThan(1);
    expect(cadenceStrengthScale('strong')).toBeGreaterThan(1);
    expect(effectiveHarmonyCadence(0.6, { ...DEFAULT_HARMONY_GENERATION, cadenceStrength: 'medium' })).toBe(0.6);
    expect(effectiveHarmonyCadence(0.6, { ...DEFAULT_HARMONY_GENERATION, cadenceStrength: 'soft' })).toBeCloseTo(0.24);
    expect(effectiveHarmonyCadence(0.6, { ...DEFAULT_HARMONY_GENERATION, cadenceStrength: 'strong' })).toBeCloseTo(0.99);
  });

  it('harmonyNotesPerChord includes optional bass root', () => {
    const base = {
      voicingWidth: 'normal' as const,
      allowInversions: true,
      chordDensity: '1-per-bar' as const,
      cadenceStrength: 'medium' as const,
    };
    expect(harmonyNotesPerChord({ ...base, chordComplexity: 'triads', bassDoubling: false })).toBe(3);
    expect(harmonyNotesPerChord({ ...base, chordComplexity: 'triads', bassDoubling: true })).toBe(4);
    expect(harmonyNotesPerChord({ ...base, chordComplexity: 'sevenths', bassDoubling: true })).toBe(5);
  });

  it('harmonyChordSlotsPerBar reflects density setting', () => {
    const base = {
      voicingWidth: 'normal' as const,
      allowInversions: true,
      chordComplexity: 'triads' as const,
      bassDoubling: false,
      cadenceStrength: 'medium' as const,
    };
    expect(harmonyChordSlotsPerBar({ ...base, chordDensity: '1-per-bar' })).toBe(1);
    expect(harmonyChordSlotsPerBar({ ...base, chordDensity: '2-per-bar' })).toBe(2);
  });

  it('applyHarmonyPlaybackFilter is a no-op when chords stay enabled', () => {
    const data = sampleMusicData(2);
    expect(applyHarmonyPlaybackFilter(data, true)).toBe(data);
  });
});
