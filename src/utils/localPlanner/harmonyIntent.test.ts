import { describe, expect, it } from 'vitest';
import type { PlannerMusicPlan } from './schema';
import { defaultMusicPlan } from './schema';
import { mapToGeneratorPlan } from './mapToGeneratorPlan';
import { buildHarmonyIntentSummary } from './mappingAudit';
import { planToScore } from '../planToScore';
import { buildScaleContext } from '../score/melodyHelpers';
import { resolveHarmonyContext } from '../score/harmonyIntent';
import { promptToPlan } from '../promptToPlan';

function plannerWith(overrides: Partial<PlannerMusicPlan>): PlannerMusicPlan {
  return { ...defaultMusicPlan('harmony intent test'), ...overrides };
}

function harmonyMidiFingerprint(tokens: { pitch: string; midiNote: number }[] | undefined): string {
  if (!tokens) return '';
  return tokens.filter((t) => t.pitch !== 'rest').map((t) => t.midiNote % 12).join(',');
}

describe('planner harmony intent', () => {
  const chordBase = {
    totalBars: 4,
    phraseBars: 2,
    texture: 'melody+chords' as const,
    keyCenter: 'C',
  };

  it('uses planner scale intervals for harmony when plannerIntent is present', () => {
    const major = mapToGeneratorPlan(plannerWith({ ...chordBase, scaleType: 'major' })).plan;
    const dorian = mapToGeneratorPlan(plannerWith({ ...chordBase, scaleType: 'dorian' })).plan;

    const majorCtx = resolveHarmonyContext(major, buildScaleContext(major));
    const dorianCtx = resolveHarmonyContext(dorian, buildScaleContext(dorian));
    expect(majorCtx.modalFallback).toBe(false);
    expect(dorianCtx.modalFallback).toBe(true);
    expect(dorianCtx.accompanimentStyle).toBe('modal-triads');

    const majorHarmony = planToScore(major).harmonyTokens;
    const dorianHarmony = planToScore(dorian).harmonyTokens;
    expect(harmonyMidiFingerprint(majorHarmony)).not.toBe(
      harmonyMidiFingerprint(dorianHarmony),
    );
  });

  it('uses open fifths for pentatonic melody+chords', () => {
    const { plan } = mapToGeneratorPlan(
      plannerWith({ ...chordBase, scaleType: 'minor pentatonic' }),
    );
    const ctx = resolveHarmonyContext(plan, buildScaleContext(plan));
    expect(ctx.accompanimentStyle).toBe('open-fifths');

    const pentHarmony = planToScore(plan).harmonyTokens;
    const majorPlan = mapToGeneratorPlan(plannerWith({ ...chordBase, scaleType: 'major' })).plan;
    const majorHarmony = planToScore(majorPlan).harmonyTokens;
    expect(pentHarmony?.length).toBeGreaterThan(0);
    expect(harmonyMidiFingerprint(pentHarmony)).not.toBe(
      harmonyMidiFingerprint(majorHarmony),
    );
  });

  it('uses quartal stacks for polyphonic modal scales', () => {
    const { plan } = mapToGeneratorPlan(
      plannerWith({ ...chordBase, texture: 'polyphonic', scaleType: 'mixolydian' }),
    );
    const ctx = resolveHarmonyContext(plan, buildScaleContext(plan));
    expect(ctx.accompanimentStyle).toBe('quartal-stack');

    const summary = buildHarmonyIntentSummary(plan, buildScaleContext(plan));
    expect(summary).toContain('mixolydian');
    expect(summary).toContain('modal fallback: yes');
  });

  it('produces different harmony for major vs minor pentatonic', () => {
    const majorPent = mapToGeneratorPlan(
      plannerWith({ ...chordBase, scaleType: 'major pentatonic' }),
    ).plan;
    const minorPent = mapToGeneratorPlan(
      plannerWith({ ...chordBase, scaleType: 'minor pentatonic' }),
    ).plan;

    const a = harmonyMidiFingerprint(planToScore(majorPent).harmonyTokens);
    const b = harmonyMidiFingerprint(planToScore(minorPent).harmonyTokens);
    expect(a).not.toBe(b);
  });

  it('keeps legacy rule-based harmony on plan.mode major/minor', () => {
    const { plan } = promptToPlan('100 BPM C major jazzy chord melody');
    expect(plan.plannerIntent).toBeUndefined();
    const ctx = resolveHarmonyContext(plan, buildScaleContext(plan));
    expect(ctx.harmonyMode).toBe('major');
    expect(ctx.modalFallback).toBe(false);
    expect(planToScore(plan).harmonyTokens?.length).toBeGreaterThan(0);
  });
});
