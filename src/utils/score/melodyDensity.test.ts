import { describe, expect, it } from 'vitest';
import { planToScore } from '../planToScore';
import { applyMelodyDensityToPlan } from '../melodySettings';
import { HOUSE_PLAN_FIXTURE } from '../__fixtures__/scoreExamples';
import { extractBarTokens, barMidiSimilarity } from './phraseDevelopment';
import type { MusicPlan } from '../../types/musicPlan';

function pitchedMelodyCount(score: ReturnType<typeof planToScore>): number {
  return score.tokens.filter((t) => t.pitch !== 'rest').length;
}

function scoreForDensity(plan: MusicPlan, density: 'sparse' | 'normal' | 'busy') {
  return planToScore(applyMelodyDensityToPlan(plan, density));
}

describe('melody density', () => {
  const plan = HOUSE_PLAN_FIXTURE as MusicPlan;

  it('preserves current output at Normal', () => {
    const baseline = planToScore(plan);
    const normal = scoreForDensity(plan, 'normal');
    expect(normal.tokens).toEqual(baseline.tokens);
    expect(normal.harmonyTokens).toEqual(baseline.harmonyTokens);
  });

  it('generates more melody notes for Busy than Normal than Sparse', () => {
    const sparse = scoreForDensity(plan, 'sparse');
    const normal = scoreForDensity(plan, 'normal');
    const busy = scoreForDensity(plan, 'busy');

    const sparseCount = pitchedMelodyCount(sparse);
    const normalCount = pitchedMelodyCount(normal);
    const busyCount = pitchedMelodyCount(busy);

    expect(busyCount).toBeGreaterThan(normalCount);
    expect(normalCount).toBeGreaterThan(sparseCount);
  });

  it('does not change harmony density or voicing across melody density levels', () => {
    const normal = scoreForDensity(plan, 'normal');
    const sparse = scoreForDensity(plan, 'sparse');
    const busy = scoreForDensity(plan, 'busy');

    expect(sparse.harmonyTokens!.length).toBe(normal.harmonyTokens!.length);
    expect(busy.harmonyTokens!.length).toBe(normal.harmonyTokens!.length);
    expect(sparse.harmonyVoicingRealized).toEqual(normal.harmonyVoicingRealized);
    expect(busy.harmonyVoicingRealized).toEqual(normal.harmonyVoicingRealized);
    expect(sparse.harmonyNotesPerSlot).toBe(normal.harmonyNotesPerSlot);
  });

  it('keeps phrase contour recognizably related across density levels', () => {
    const normal = scoreForDensity(plan, 'normal');
    const sparse = scoreForDensity(plan, 'sparse');
    const busy = scoreForDensity(plan, 'busy');

    const sparseVsNormal = barMidiSimilarity(
      extractBarTokens(sparse.tokens, 0, sparse.beatsPerBar),
      extractBarTokens(normal.tokens, 0, normal.beatsPerBar),
    );
    const busyVsNormal = barMidiSimilarity(
      extractBarTokens(busy.tokens, 0, busy.beatsPerBar),
      extractBarTokens(normal.tokens, 0, normal.beatsPerBar),
    );
    expect(sparseVsNormal).toBeGreaterThan(0.45);
    expect(busyVsNormal).toBeGreaterThan(0.45);

    const normalMotifRepeat = barMidiSimilarity(
      extractBarTokens(normal.tokens, 0, normal.beatsPerBar),
      extractBarTokens(normal.tokens, 2, normal.beatsPerBar),
    );
    expect(normalMotifRepeat).toBeGreaterThan(0.5);
  });
});
