import { describe, expect, it } from 'vitest';
import { mapToGeneratorPlan } from './mapToGeneratorPlan';
import { DIVERSITY_PROMPTS, DIVERSITY_PLANNER_PLANS } from './__fixtures__/diversityPrompts';
import {
  generatorPlanFingerprint,
  generatorPlanDistance,
  plansAreNearIdentical,
  NEAR_IDENTICAL_THRESHOLD,
} from './diversityReview';

describe('planner diversity mapping', () => {
  it('has 5 distinct diversity prompt fixtures', () => {
    expect(DIVERSITY_PROMPTS).toHaveLength(5);
    for (const prompt of DIVERSITY_PROMPTS) {
      expect(DIVERSITY_PLANNER_PLANS[prompt].prompt).toBe(prompt);
    }
  });

  it('maps diversity fixtures to non-identical generator plans', () => {
    const mapped = DIVERSITY_PROMPTS.map((prompt) =>
      mapToGeneratorPlan(DIVERSITY_PLANNER_PLANS[prompt]).plan,
    );

    const fingerprints = mapped.map(generatorPlanFingerprint);
    expect(new Set(fingerprints).size).toBe(DIVERSITY_PROMPTS.length);
  });

  it('does not collapse diversity fixtures to near-identical generator settings', () => {
    const mapped = DIVERSITY_PROMPTS.map((prompt) =>
      mapToGeneratorPlan(DIVERSITY_PLANNER_PLANS[prompt]).plan,
    );

    for (let i = 0; i < mapped.length; i++) {
      for (let j = i + 1; j < mapped.length; j++) {
        const distance = generatorPlanDistance(mapped[i], mapped[j]);
        expect(
          plansAreNearIdentical(mapped[i], mapped[j]),
          `pair ${DIVERSITY_PROMPTS[i]} vs ${DIVERSITY_PROMPTS[j]} distance=${distance} (threshold ${NEAR_IDENTICAL_THRESHOLD})`,
        ).toBe(false);
      }
    }
  });

  it('preserves key discriminating fields across fixtures', () => {
    const byPrompt = Object.fromEntries(
      DIVERSITY_PROMPTS.map((p) => [p, mapToGeneratorPlan(DIVERSITY_PLANNER_PLANS[p]).plan]),
    ) as Record<string, ReturnType<typeof mapToGeneratorPlan>['plan']>;

    expect(byPrompt['dark cinematic boss battle'].tempo).toBeGreaterThan(130);
    expect(byPrompt['calm reflective piano'].tempo).toBeLessThan(80);
    expect(byPrompt['calm reflective piano'].beatsPerBar).toBe(3);
    expect(byPrompt['dreamy ambient floating pad'].beatsPerBar).toBe(6);
    expect(byPrompt['tense stealth pulse'].beatsPerBar).toBe(2);
    expect(byPrompt['playful retro game loop'].mood).toBe('bright');
    expect(byPrompt['dark cinematic boss battle'].mood).toBe('dark');
  });
});
