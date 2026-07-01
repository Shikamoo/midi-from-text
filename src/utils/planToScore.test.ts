import { describe, expect, it } from 'vitest';
import { promptToPlan } from './promptToPlan';
import {
  planToScore,
  tokensToCanonicalText,
  resolveStylePreset,
  buildRhythmPattern,
  chooseNextDegree,
  clampRegister,
} from './planToScore';
import {
  buildScaleContext,
  endsOnTonic,
  restCount,
} from './score/melodyHelpers';
import { STYLE_PRESETS } from './score/stylePresets';
import {
  FUNK_PLAN_FIXTURE,
  HOUSE_PLAN_FIXTURE,
  SCORE_FIXTURES,
} from './__fixtures__/scoreExamples';
import { makeNote } from './score/testUtils';

describe('planToScore', () => {
  it('is deterministic for the same prompt', () => {
    const prompt = 'loopable funky melody 100 BPM summer nu-disco';
    const plan = promptToPlan(prompt).plan;
    const first = tokensToCanonicalText(planToScore(plan).tokens, plan.beatsPerBar);
    const second = tokensToCanonicalText(planToScore(plan).tokens, plan.beatsPerBar);
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(0);
  });

  for (const fixture of SCORE_FIXTURES) {
    it(`generates stable canonical notes for "${fixture.prompt}"`, () => {
      const { plan } = promptToPlan(fixture.prompt);
      const preset = resolveStylePreset(plan);
      const score = planToScore(plan);
      const canonical = tokensToCanonicalText(score.tokens, plan.beatsPerBar);
      const scale = buildScaleContext(plan);

      expect(preset.id).toBe(fixture.presetId);
      expect(canonical).toBe(fixture.canonical);
      if (fixture.bars !== undefined) expect(plan.bars).toBe(fixture.bars);
      if (fixture.minRests !== undefined) {
        expect(restCount(score.tokens)).toBeGreaterThanOrEqual(fixture.minRests);
      }

      expect(endsOnTonic(score.tokens, scale.rootMidi)).toBe(true);

      for (const token of score.tokens) {
        if (token.pitch === 'rest') continue;
        expect(token.midiNote).toBeGreaterThanOrEqual(36);
        expect(token.midiNote).toBeLessThanOrEqual(84);
      }
    });
  }

  it('uses house preset for high-energy loop hooks', () => {
    const preset = resolveStylePreset(HOUSE_PLAN_FIXTURE);
    expect(preset.id).toBe('house');
    const score = planToScore(HOUSE_PLAN_FIXTURE);
    expect(restCount(score.tokens)).toBeGreaterThanOrEqual(6);
    expect(endsOnTonic(score.tokens, buildScaleContext(HOUSE_PLAN_FIXTURE).rootMidi)).toBe(true);
  });

  it('uses funk preset with syncopated rests', () => {
    const preset = resolveStylePreset(FUNK_PLAN_FIXTURE);
    expect(preset.id).toBe('funk');
    const rhythm = buildRhythmPattern(FUNK_PLAN_FIXTURE, preset, 0);
    expect(rhythm.some((s) => s.rest)).toBe(true);
    const score = planToScore(FUNK_PLAN_FIXTURE);
    expect(restCount(score.tokens)).toBeGreaterThanOrEqual(4);
  });

  it('chooseNextDegree favors stepwise motion with hook recall', () => {
    const plan = promptToPlan('funky melody').plan;
    const preset = STYLE_PRESETS.funk;
    const first = chooseNextDegree(
      null, null, 0, 6, { duration: 0.5, accent: true }, plan, preset, 0, 0, 4,
    );
    const second = chooseNextDegree(
      first, 1, 1, 6, { duration: 0.5 }, plan, preset, 1, 0, 4,
    );
    expect(Math.abs(second - first)).toBeLessThanOrEqual(2);
  });

  it('clampRegister keeps notes in practical MIDI range', () => {
    const low = clampRegister(makeNote(20, 1, 80));
    const high = clampRegister(makeNote(100, 1, 80));
    expect(low.midiNote).toBeGreaterThanOrEqual(36);
    expect(high.midiNote).toBeLessThanOrEqual(84);
  });

  it('4-bar loops end with a longer tonic resolution', () => {
    const { plan } = promptToPlan('loopable nu-disco hook');
    const score = planToScore(plan);
    const lastBarStart = (plan.bars - 1) * plan.beatsPerBar;
    let beat = 0;
    let lastPitched = score.tokens[0];
    for (const token of score.tokens) {
      if (token.pitch !== 'rest' && beat >= lastBarStart) {
        lastPitched = token;
      }
      beat += token.duration;
    }
    const scale = buildScaleContext(plan);
    expect(lastPitched.midiNote % 12).toBe(scale.rootMidi % 12);
    expect(lastPitched.duration).toBeGreaterThanOrEqual(0.5);
  });

  it('planToScore includes harmony without changing melody canonical output', () => {
    const prompt = 'loopable funky melody 100 BPM summer nu-disco';
    const plan = promptToPlan(prompt).plan;
    const score = planToScore(plan);
    const canonical = tokensToCanonicalText(score.tokens, plan.beatsPerBar);

    expect(score.harmonyTokens?.length).toBe(plan.bars * 3);
    expect(canonical.length).toBeGreaterThan(0);
    expect(score.tokens).toEqual(
      planToScore(plan).tokens,
    );
  });
});
