import { describe, expect, it } from 'vitest';
import type { PlannerMusicPlan } from '../localPlanner/schema';
import { defaultMusicPlan } from '../localPlanner/schema';
import { mapToGeneratorPlan } from '../localPlanner/mapToGeneratorPlan';
import { planToScore } from '../planToScore';
import {
  classifyGuideToneShellQuality,
  guideToneShellSemitones,
} from './harmony';
import { resolveHarmonyContext } from './harmonyIntent';
import { buildScaleContext } from './melodyHelpers';

function plannerWith(overrides: Partial<PlannerMusicPlan>): PlannerMusicPlan {
  return { ...defaultMusicPlan('guide-tone shell test'), ...overrides };
}

function shellContext(scaleType: string, texture: 'polyphonic' = 'polyphonic', harmonicComplexity = 0.5) {
  const { plan } = mapToGeneratorPlan(
    plannerWith({
      totalBars: 4,
      phraseBars: 2,
      texture,
      keyCenter: 'C',
      scaleType,
      harmonicComplexity,
    }),
  );
  return resolveHarmonyContext(plan, buildScaleContext(plan));
}

describe('guide-tone shell voicing', () => {
  it('classifies major7, minor7, and dominant7 guide-tone pairs', () => {
    expect(classifyGuideToneShellQuality(4, 11)).toBe('major7');
    expect(classifyGuideToneShellQuality(3, 10)).toBe('minor7');
    expect(classifyGuideToneShellQuality(4, 10)).toBe('dominant7');
  });

  it('returns diatonic 3rd+7th offsets for major-key degrees', () => {
    const ctx = shellContext('major');

    expect(guideToneShellSemitones(0, ctx)).toEqual([4, 11]);
    expect(guideToneShellSemitones(1, ctx)).toEqual([3, 10]);
    expect(guideToneShellSemitones(4, ctx)).toEqual([4, 10]);

    expect(classifyGuideToneShellQuality(...guideToneShellSemitones(0, ctx)!)).toBe('major7');
    expect(classifyGuideToneShellQuality(...guideToneShellSemitones(1, ctx)!)).toBe('minor7');
    expect(classifyGuideToneShellQuality(...guideToneShellSemitones(4, ctx)!)).toBe('dominant7');
  });

  it('distinguishes chord quality better than 3rd+5th shells would', () => {
    const ctx = shellContext('major');
    const guidePairs = [0, 1, 4].map((degree) => guideToneShellSemitones(degree, ctx)!.join(','));
    const triadFifthPairs = [0, 1, 4].map((degree) => {
      const third = degree === 1 || degree === 2 || degree === 5 || degree === 6 ? 3 : 4;
      return `${third},7`;
    });

    expect(new Set(guidePairs).size).toBe(3);
    expect(new Set(triadFifthPairs).size).toBe(2);
    expect(guidePairs).not.toEqual(triadFifthPairs);
  });

  it('uses guide-tone shells for polyphonic medium major (not 3rd+5th)', () => {
    const { plan } = mapToGeneratorPlan(
      plannerWith({
        totalBars: 4,
        phraseBars: 2,
        texture: 'polyphonic',
        keyCenter: 'C',
        scaleType: 'major',
        harmonicComplexity: 0.5,
      }),
    );
    const ctx = resolveHarmonyContext(plan, buildScaleContext(plan));
    expect(ctx.accompanimentStyle).toBe('shell-voicing');

    const score = planToScore(plan);
    const finalSlot = score.harmonyTokens!.slice(-2);
    const pcs = finalSlot.map((t) => t.midiNote % 12).sort((a, b) => a - b);

    expect(pcs).toEqual([4, 11]);
    expect(pcs).not.toContain(7);
  });

  it('keeps melody+chords on open fifths (lightest support)', () => {
    const { plan } = mapToGeneratorPlan(
      plannerWith({
        totalBars: 4,
        phraseBars: 2,
        texture: 'melody+chords',
        keyCenter: 'C',
        scaleType: 'major',
      }),
    );
    const ctx = resolveHarmonyContext(plan, buildScaleContext(plan));
    expect(ctx.accompanimentStyle).toBe('open-fifths');
    const score = planToScore(plan);
    expect(score.harmonyVoicingRealized?.averageChordNoteCount).toBeLessThanOrEqual(2);
  });

  it('falls back to open fifths for pentatonic scales without seventh spelling', () => {
    const ctx = shellContext('major pentatonic');
    expect(guideToneShellSemitones(0, ctx)).toBeNull();
  });

  it('supports dorian and mixolydian guide-tone shells', () => {
    const dorian = shellContext('dorian');
    const mixo = shellContext('mixolydian');

    expect(guideToneShellSemitones(0, dorian)).toEqual([3, 10]);
    expect(guideToneShellSemitones(0, mixo)).toEqual([4, 10]);
    expect(classifyGuideToneShellQuality(...guideToneShellSemitones(0, mixo)!)).toBe('dominant7');
  });
});
