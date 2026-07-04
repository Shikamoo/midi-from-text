import { describe, expect, it } from 'vitest';
import type { PlannerMusicPlan } from '../localPlanner/schema';
import { defaultMusicPlan } from '../localPlanner/schema';
import { mapToGeneratorPlan } from '../localPlanner/mapToGeneratorPlan';
import { planToScore } from '../planToScore';
import { promptToPlan } from '../promptToPlan';
import { computeScoreMetrics } from '../../eval/scoreMetrics';
import { buildHarmonyIntentSummary } from './harmonyIntent';
import { buildScaleContext } from './melodyHelpers';

function plannerWith(overrides: Partial<PlannerMusicPlan>): PlannerMusicPlan {
  return { ...defaultMusicPlan('harmony voicing test'), ...overrides };
}

function harmonyNotesPerSlot(score: ReturnType<typeof planToScore>): number {
  expect(score.harmonyVoicingRealized).toBeDefined();
  return score.harmonyVoicingRealized!.averageChordNoteCount;
}

function lowHarmonyMidiCount(score: ReturnType<typeof planToScore>): number {
  return score.harmonyVoicingRealized?.lowRegisterNoteCount ?? 0;
}

describe('harmony voicing density', () => {
  const chordBase = {
    totalBars: 4,
    phraseBars: 2,
    texture: 'melody+chords' as const,
    keyCenter: 'C',
    scaleType: 'major',
  };

  it('uses fewer notes per slot in melody+chords than polyphonic full texture', () => {
    const lightPlan = mapToGeneratorPlan(plannerWith({ ...chordBase })).plan;
    const fullPlan = mapToGeneratorPlan(
      plannerWith({ ...chordBase, texture: 'polyphonic', harmonicComplexity: 0.8 }),
    ).plan;

    const lightScore = planToScore(lightPlan);
    const fullScore = planToScore(fullPlan);

    expect(harmonyNotesPerSlot(lightScore)).toBeLessThanOrEqual(2);
    expect(harmonyNotesPerSlot(fullScore)).toBeGreaterThan(harmonyNotesPerSlot(lightScore));
  });

  it('keeps low-register harmony sparser in lighter melody+chords texture', () => {
    const lightPlan = mapToGeneratorPlan(plannerWith({ ...chordBase })).plan;
    const fullPlan = mapToGeneratorPlan(
      plannerWith({ ...chordBase, texture: 'polyphonic', harmonicComplexity: 0.8 }),
    ).plan;
    const lightScore = planToScore(lightPlan);
    const fullScore = planToScore(fullPlan);

    expect(harmonyNotesPerSlot(lightScore)).toBeLessThanOrEqual(2);
    expect(lowHarmonyMidiCount(lightScore)).toBeLessThanOrEqual(lowHarmonyMidiCount(fullScore));
    const lightMin = Math.min(...(lightScore.harmonyTokens ?? []).map((t) => t.midiNote));
    const fullMin = Math.min(...(fullScore.harmonyTokens ?? []).map((t) => t.midiNote));
    expect(lightMin).toBeGreaterThanOrEqual(fullMin);
  });

  it('reduces harmony note density in melody+chords vs polyphonic', () => {
    const lightPlan = mapToGeneratorPlan(plannerWith({ ...chordBase })).plan;
    const polyPlan = mapToGeneratorPlan(
      plannerWith({ ...chordBase, texture: 'polyphonic', harmonicComplexity: 0.5 }),
    ).plan;

    const lightMetrics = computeScoreMetrics(planToScore(lightPlan));
    const polyMetrics = computeScoreMetrics(planToScore(polyPlan));

    expect(lightMetrics.harmonyNoteDensity).toBeLessThan(polyMetrics.harmonyNoteDensity);
  });

  it('preserves legacy full triads when plannerIntent is absent', () => {
    const { plan } = promptToPlan('100 BPM C major loopable melody');
    expect(plan.plannerIntent).toBeUndefined();

    const score = planToScore(plan);
    expect(score.harmonyTokens?.length).toBe(plan.bars * 3);
    expect(harmonyNotesPerSlot(score)).toBe(3);
  });

  it('omits chord root from upper structure when bass doubling is enabled with planner intent', () => {
    const plan = mapToGeneratorPlan(plannerWith({ ...chordBase })).plan;
    const score = planToScore(plan, {
      voicingWidth: 'normal',
      allowInversions: true,
      chordComplexity: 'triads',
      bassDoubling: true,
      chordDensity: '1-per-bar',
      cadenceStrength: 'medium',
    });

    expect(score.harmonyVoicingRealized?.rootOmittedWhenBass).toBe(true);
    expect(harmonyNotesPerSlot(score)).toBeLessThanOrEqual(3);
  });

  it('includes harmony voicing realized summary in debug output', () => {
    const plan = mapToGeneratorPlan(plannerWith({ ...chordBase })).plan;
    const score = planToScore(plan);
    const summary = buildHarmonyIntentSummary(plan, buildScaleContext(plan), score);

    expect(summary).toContain('Harmony voicing realized:');
    expect(summary).toContain('voicing style:');
    expect(summary).toContain('average chord note count:');
    expect(summary).toContain('density level: light');
    expect(summary).toContain('root omitted when bass present:');
  });
});
