import { describe, expect, it } from 'vitest';
import type { PlannerMusicPlan } from './schema';
import { defaultMusicPlan } from './schema';
import { mapToGeneratorPlan } from './mapToGeneratorPlan';
import { buildMappingAudit, formatMappingAuditSummary } from './mappingAudit';
import { planToScore } from '../planToScore';
import { scoreTrackLayout, scoreNoteCount } from '../score/texture';
import { melodyMidiBounds } from '../score/melodyHelpers';
import { promptToPlan } from '../promptToPlan';

function plannerWith(overrides: Partial<PlannerMusicPlan>): PlannerMusicPlan {
  return { ...defaultMusicPlan('texture test'), ...overrides };
}

function melodyMidiRange(tokens: { pitch: string; midiNote: number }[]): { min: number; max: number } {
  const midis = tokens.filter((t) => t.pitch !== 'rest').map((t) => t.midiNote);
  expect(midis.length).toBeGreaterThan(0);
  return { min: Math.min(...midis), max: Math.max(...midis) };
}

describe('planner texture and register preservation', () => {
  it('maps distinct textures to different plannerIntent values', () => {
    const textures = ['monophonic', 'melody+bass', 'melody+chords', 'polyphonic'] as const;
    const intents = textures.map((texture) => {
      const { plan } = mapToGeneratorPlan(plannerWith({ texture }));
      return plan.plannerIntent?.texture;
    });
    expect(new Set(intents)).toEqual(new Set(textures));
  });

  it('preserves wide registerBias in plannerIntent (not collapsed to mid only)', () => {
    const { plan } = mapToGeneratorPlan(
      plannerWith({
        registerBias: 'wide',
        melodicRange: { min: 'C3', max: 'C6' },
      }),
    );
    expect(plan.plannerIntent?.registerBias).toBe('wide');
    expect(plan.register).toBe('mid');
    const bounds = melodyMidiBounds(plan);
    expect(bounds.max - bounds.min).toBeGreaterThan(24);
  });

  it('preserves phraseBars beyond 2 as motifLength', () => {
    const { plan } = mapToGeneratorPlan(
      plannerWith({ phraseBars: 6, totalBars: 8 }),
    );
    expect(plan.motifLength).toBe(6);
  });

  it('produces different score layouts per texture', () => {
    const base = {
      tempoBpm: 100,
      totalBars: 4,
      phraseBars: 2,
      keyCenter: 'C',
      scaleType: 'major',
    };
    const scores = (['monophonic', 'melody+bass', 'melody+chords', 'polyphonic'] as const).map(
      (texture) => {
        const { plan } = mapToGeneratorPlan(plannerWith({ ...base, texture }));
        return planToScore(plan);
      },
    );

    const layouts = scores.map(scoreTrackLayout);
    expect(layouts[0]).toMatchObject({ hasHarmony: false, hasBass: false });
    expect(layouts[1]).toMatchObject({ hasHarmony: false, hasBass: true });
    expect(layouts[2]).toMatchObject({ hasHarmony: true, hasBass: false });
    expect(layouts[3]).toMatchObject({ hasHarmony: true, hasBass: false });

    expect(scoreNoteCount(scores[0])).toBeLessThan(scoreNoteCount(scores[3]));
    expect(layouts[1].bassTokenCount).toBeGreaterThan(0);
    expect(layouts[2].harmonyTokenCount).toBeGreaterThan(0);
  });

  it('shifts melody register for low vs high registerBias', () => {
    const low = mapToGeneratorPlan(
      plannerWith({
        registerBias: 'low',
        melodicRange: { min: 'C3', max: 'G4' },
      }),
    ).plan;
    const high = mapToGeneratorPlan(
      plannerWith({
        registerBias: 'high',
        melodicRange: { min: 'C5', max: 'C6' },
      }),
    ).plan;

    const lowRange = melodyMidiRange(planToScore(low).tokens);
    const highRange = melodyMidiRange(planToScore(high).tokens);
    expect(lowRange.max).toBeLessThan(highRange.min);
  });

  it('builds mapping audit with preserved texture and register fields', () => {
    const planner = plannerWith({
      texture: 'polyphonic',
      registerBias: 'wide',
      rhythmDensity: 0.8,
      syncopation: 0.7,
    });
    const { plan } = mapToGeneratorPlan(planner);
    const audit = buildMappingAudit(planner, plan);
    const summary = formatMappingAuditSummary(audit);

    expect(audit.some((n) => n.field === 'texture' && n.disposition === 'preserved')).toBe(true);
    expect(summary).toContain('preserved');
    expect(summary).toContain('polyphonic');
  });

  it('keeps rule-based promptToPlan path without plannerIntent', () => {
    const { plan } = promptToPlan('100 BPM C major loopable melody');
    expect(plan.plannerIntent).toBeUndefined();
    const score = planToScore(plan);
    expect(score.harmonyTokens?.length).toBeGreaterThan(0);
    expect(score.bassTokens).toBeUndefined();
  });
});
