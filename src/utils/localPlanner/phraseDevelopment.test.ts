import { describe, expect, it } from 'vitest';
import type { PlannerMusicPlan } from './schema';
import { defaultMusicPlan } from './schema';
import { mapToGeneratorPlan } from './mapToGeneratorPlan';
import { buildPhraseDevelopmentSummary } from './mappingAudit';
import { planToScore } from '../planToScore';
import {
  barMidiSimilarity,
  extractBarTokens,
  motifFingerprint,
  resolvePhraseStrategy,
} from '../score/phraseDevelopment';
import { promptToPlan } from '../promptToPlan';

function plannerWith(overrides: Partial<PlannerMusicPlan>): PlannerMusicPlan {
  return { ...defaultMusicPlan('phrase development test'), ...overrides };
}

describe('planner phrase development', () => {
  const base = {
    totalBars: 8,
    keyCenter: 'C',
    scaleType: 'major',
    texture: 'monophonic' as const,
  };

  it('repeats share motif identity across phrase window cycles', () => {
    const { plan } = mapToGeneratorPlan(
      plannerWith({
        ...base,
        phraseBars: 2,
        repetition: 0.85,
        variation: 0.15,
      }),
    );
    const score = planToScore(plan);
    const bar0 = extractBarTokens(score.tokens, 0, plan.beatsPerBar);
    const bar2 = extractBarTokens(score.tokens, 2, plan.beatsPerBar);
    expect(barMidiSimilarity(bar0, bar2)).toBeGreaterThan(0.85);
    expect(motifFingerprint({ rhythm: [], degrees: [], tokens: bar0 })).toBeDefined();
  });

  it('higher variation changes more notes than low variation', () => {
    const lowVar = mapToGeneratorPlan(
      plannerWith({ ...base, phraseBars: 2, repetition: 0.5, variation: 0.1 }),
    ).plan;
    const highVar = mapToGeneratorPlan(
      plannerWith({ ...base, phraseBars: 2, repetition: 0.45, variation: 0.85 }),
    ).plan;

    const lowScore = planToScore(lowVar);
    const highScore = planToScore(highVar);
    const lowSim = barMidiSimilarity(
      extractBarTokens(lowScore.tokens, 0, lowVar.beatsPerBar),
      extractBarTokens(lowScore.tokens, 2, lowVar.beatsPerBar),
    );
    const highSim = barMidiSimilarity(
      extractBarTokens(highScore.tokens, 0, highVar.beatsPerBar),
      extractBarTokens(highScore.tokens, 2, highVar.beatsPerBar),
    );
    expect(highSim).toBeLessThan(lowSim);
  });

  it('phraseBars changes development window and cycle strategy', () => {
    const shortWindow = mapToGeneratorPlan(
      plannerWith({ ...base, phraseBars: 2, variation: 0.5 }),
    ).plan;
    const longWindow = mapToGeneratorPlan(
      plannerWith({ ...base, phraseBars: 4, totalBars: 8, variation: 0.5 }),
    ).plan;

    expect(shortWindow.motifLength).toBe(2);
    expect(longWindow.motifLength).toBe(4);
    expect(resolvePhraseStrategy(shortWindow, 2, 1, 0)).not.toBe('seed');
    expect(resolvePhraseStrategy(longWindow, 4, 1, 0)).not.toBe('seed');

    const shortScore = planToScore(shortWindow);
    const longScore = planToScore(longWindow);
    const shortBar2 = extractBarTokens(shortScore.tokens, 2, shortWindow.beatsPerBar);
    const longBar4 = extractBarTokens(longScore.tokens, 4, longWindow.beatsPerBar);
    expect(shortBar2.length).toBeGreaterThan(0);
    expect(longBar4.length).toBeGreaterThan(0);
  });

  it('builds phrase development summary for debug', () => {
    const { plan } = mapToGeneratorPlan(
      plannerWith({ ...base, phraseBars: 3, repetition: 0.7, variation: 0.4 }),
    );
    const summary = buildPhraseDevelopmentSummary(plan);
    expect(summary).toContain('phrase window: 3');
    expect(summary).toContain('repetition');
    expect(summary).toContain('variation');
  });

  it('keeps legacy promptToPlan on varyMotif path', () => {
    const { plan } = promptToPlan('100 BPM C major loopable melody');
    expect(plan.plannerIntent).toBeUndefined();
    expect(buildPhraseDevelopmentSummary(plan)).toContain('legacy');
    const a = planToScore(plan);
    const b = planToScore(plan);
    expect(a.tokens.map((t) => t.midiNote)).toEqual(b.tokens.map((t) => t.midiNote));
  });
});
