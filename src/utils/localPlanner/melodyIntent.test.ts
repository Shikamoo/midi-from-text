import { describe, expect, it } from 'vitest';
import { pitchToMidi } from '../../types/music';
import type { ParsedScore } from '../../types/music';
import { defaultMusicPlan } from './schema';
import type { PlannerMusicPlan } from './schema';
import { mapToGeneratorPlan } from './mapToGeneratorPlan';
import { buildMelodyIntentSummary } from './mappingAudit';
import { planToScore } from '../planToScore';
import { buildScaleContext } from '../score/melodyHelpers';
import { promptToPlan } from '../promptToPlan';
import { resolvePlannerScale } from '../score/scaleIntervals';

function plannerWith(overrides: Partial<PlannerMusicPlan>): PlannerMusicPlan {
  return { ...defaultMusicPlan('melody intent test'), ...overrides };
}

function maxMelodicInterval(tokens: ParsedScore['tokens']): number {
  const midis = tokens.filter((t) => t.pitch !== 'rest').map((t) => t.midiNote);
  let max = 0;
  for (let i = 1; i < midis.length; i++) {
    max = Math.max(max, Math.abs(midis[i] - midis[i - 1]));
  }
  return max;
}

function tokenMidiFingerprint(tokens: ParsedScore['tokens']): string {
  return tokens.filter((t) => t.pitch !== 'rest').map((t) => t.midiNote).join(',');
}

function barMeanMidi(score: ParsedScore, barIndex: number, beatsPerBar: number): number {
  let beat = 0;
  const start = barIndex * beatsPerBar;
  const end = start + beatsPerBar;
  const midis: number[] = [];
  for (const t of score.tokens) {
    if (t.pitch !== 'rest' && beat >= start && beat < end) midis.push(t.midiNote);
    beat += t.duration;
  }
  return midis.reduce((a, b) => a + b, 0) / Math.max(1, midis.length);
}

describe('planner melody intent', () => {
  it('resolves extended scale types beyond major/minor', () => {
    expect(resolvePlannerScale('dorian').id).toBe('dorian');
    expect(resolvePlannerScale('mixolydian').id).toBe('mixolydian');
    expect(resolvePlannerScale('major pentatonic').id).toBe('major-pentatonic');
    expect(resolvePlannerScale('minor pentatonic').id).toBe('minor-pentatonic');
  });

  it('uses different pitch palettes for dorian vs major pentatonic', () => {
    const base = { totalBars: 4, phraseBars: 2, keyCenter: 'C', texture: 'monophonic' as const };
    const dorian = mapToGeneratorPlan(
      plannerWith({ ...base, scaleType: 'dorian' }),
    ).plan;
    const pent = mapToGeneratorPlan(
      plannerWith({ ...base, scaleType: 'major pentatonic' }),
    ).plan;

    const dorianScale = buildScaleContext(dorian);
    const pentScale = buildScaleContext(pent);
    expect(dorianScale.scaleId).toBe('dorian');
    expect(pentScale.scaleId).toBe('major-pentatonic');

    const dorianScore = planToScore(dorian);
    const pentScore = planToScore(pent);
    expect(tokenMidiFingerprint(dorianScore.tokens)).not.toBe(
      tokenMidiFingerprint(pentScore.tokens),
    );
    expect(dorianScale.notes.length).not.toBe(pentScale.notes.length);
  });

  it('increases melodic leap size with higher leapRate', () => {
    const base = {
      totalBars: 4,
      phraseBars: 2,
      texture: 'monophonic' as const,
      scaleType: 'major',
      rhythmDensity: 0.75,
      syncopation: 0.6,
    };
    const stepwise = mapToGeneratorPlan(plannerWith({ ...base, leapRate: 0.05 })).plan;
    const leapy = mapToGeneratorPlan(plannerWith({ ...base, leapRate: 0.95 })).plan;

    const stepMax = maxMelodicInterval(planToScore(stepwise).tokens);
    const leapMax = maxMelodicInterval(planToScore(leapy).tokens);
    expect(leapMax).toBeGreaterThanOrEqual(stepMax);
    expect(tokenMidiFingerprint(planToScore(leapy).tokens)).not.toBe(
      tokenMidiFingerprint(planToScore(stepwise).tokens),
    );
  });

  it('biases toward chord tones when consonance is high', () => {
    const base = {
      totalBars: 4,
      phraseBars: 2,
      texture: 'monophonic' as const,
      scaleType: 'major',
      leapRate: 0.4,
    };
    const dissonant = mapToGeneratorPlan(plannerWith({ ...base, consonance: 0.15 })).plan;
    const consonant = mapToGeneratorPlan(plannerWith({ ...base, consonance: 0.95 })).plan;
    expect(tokenMidiFingerprint(planToScore(dissonant).tokens)).not.toBe(
      tokenMidiFingerprint(planToScore(consonant).tokens),
    );
  });

  it('anchors melody starts to planner notes[] when provided', () => {
    const { plan } = mapToGeneratorPlan(
      plannerWith({
        totalBars: 4,
        phraseBars: 1,
        texture: 'monophonic',
        notes: ['E4', 'G4'],
        scaleType: 'major',
        keyCenter: 'C',
      }),
    );
    const score = planToScore(plan);
    const first = score.tokens.find((t) => t.pitch !== 'rest');
    expect(first?.midiNote).toBe(pitchToMidi('E4'));
  });

  it('rises across bars when motifShape is ascending', () => {
    const { plan } = mapToGeneratorPlan(
      plannerWith({
        totalBars: 4,
        phraseBars: 1,
        texture: 'monophonic',
        motifShape: 'ascending arch',
        scaleType: 'major',
      }),
    );
    const score = planToScore(plan);
    const bar0 = barMeanMidi(score, 0, plan.beatsPerBar);
    const bar2 = barMeanMidi(score, 2, plan.beatsPerBar);
    expect(bar2).toBeGreaterThan(bar0);
  });

  it('builds melody intent summary for debug panel', () => {
    const planner = plannerWith({
      notes: ['C4', 'E4'],
      scaleType: 'dorian',
      leapRate: 0.8,
      consonance: 0.9,
      motifShape: 'rising line',
    });
    const { plan } = mapToGeneratorPlan(planner);
    const summary = buildMelodyIntentSummary(planner, plan);
    expect(summary).toContain('notes[]: used');
    expect(summary).toContain('dorian');
    expect(summary).toContain('leapy');
    expect(summary).toContain('chord-tone heavy');
    expect(summary).toContain('ascending');
  });

  it('leaves rule-based promptToPlan without planner melody fields', () => {
    const { plan } = promptToPlan('100 BPM C major melody');
    expect(plan.plannerIntent).toBeUndefined();
    const score = planToScore(plan);
    expect(score.tokens.length).toBeGreaterThan(0);
  });
});
