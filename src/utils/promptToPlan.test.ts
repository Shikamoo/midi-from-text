import { describe, expect, it } from 'vitest';
import { PROMPT_FIXTURES } from './__fixtures__/promptExamples';
import { promptToPlan } from './promptToPlan';
import { mapPromptLexicon } from './promptLexicon';

describe('promptToPlan', () => {
  it('is deterministic for the same input', () => {
    const prompt = 'loopable funky melody 100 BPM summer nu-disco';
    const first = promptToPlan(prompt);
    const second = promptToPlan(prompt);
    expect(first).toEqual(second);
  });

  for (const fixture of PROMPT_FIXTURES) {
    it(`maps "${fixture.prompt}"`, () => {
      const { plan, confidence, assumptions } = promptToPlan(fixture.prompt);
      const lexicon = mapPromptLexicon(fixture.prompt);
      const { expect: e } = fixture;

      if (e.tempo !== undefined) expect(plan.tempo).toBe(e.tempo);
      if (e.mode !== undefined) expect(plan.mode).toBe(e.mode);
      if (e.genre !== undefined) expect(plan.genre).toBe(e.genre);
      if (e.mood !== undefined) expect(plan.mood).toBe(e.mood);
      if (e.bars !== undefined) expect(plan.bars).toBe(e.bars);
      if (e.syncopation !== undefined) expect(plan.syncopation).toBe(e.syncopation);
      if (e.repetition !== undefined) expect(plan.repetition).toBe(e.repetition);

      if (e.minGroove !== undefined) expect(plan.groove).toBeGreaterThanOrEqual(e.minGroove);
      if (e.minBrightness !== undefined) expect(plan.brightness).toBeGreaterThanOrEqual(e.minBrightness);
      if (e.minEnergy !== undefined) expect(plan.energy).toBeGreaterThanOrEqual(e.minEnergy);
      if (e.minMotifStrength !== undefined) {
        expect(plan.motifStrength).toBeGreaterThanOrEqual(e.minMotifStrength);
      }
      if (e.maxVariationRate !== undefined) {
        expect(plan.variationRate).toBeLessThanOrEqual(e.maxVariationRate);
      }
      if (e.minChordToneBias !== undefined) {
        expect(plan.chordToneBias).toBeGreaterThanOrEqual(e.minChordToneBias);
      }
      if (e.minCadenceStrength !== undefined) {
        expect(plan.cadenceStrength).toBeGreaterThanOrEqual(e.minCadenceStrength);
      }
      if (e.minConfidence !== undefined) expect(confidence).toBeGreaterThanOrEqual(e.minConfidence);

      if (e.matchedPhrases) {
        for (const phrase of e.matchedPhrases) {
          expect(lexicon.matches.some((m) => m.phrase === phrase)).toBe(true);
        }
      }

      expect(assumptions.length).toBeGreaterThan(0);
      expect(assumptions.some((a) => a.confidence !== undefined)).toBe(true);
    });
  }

  it('combines adjectives instead of letting the last one win', () => {
    const darkOnly = promptToPlan('dark melody');
    const summerOnly = promptToPlan('summer melody');
    const combined = promptToPlan('dark summer melody');

    expect(combined.plan.brightness).toBeGreaterThan(darkOnly.plan.brightness);
    expect(combined.plan.brightness).toBeLessThan(summerOnly.plan.brightness);
    expect(combined.plan.energy).toBeGreaterThan(darkOnly.plan.energy);
  });
});
