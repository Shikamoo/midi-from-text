import { describe, expect, it } from 'vitest';
import { promptToPlan } from '../promptToPlan';
import { planToScore } from '../planToScore';
import {
  chooseNextDegree,
  phraseArcDegree,
  buildMotif,
  applyCadence,
  applyPenultimateSetup,
  endsOnTonic,
} from './melodyHelpers';
import { buildScaleContext } from './melodyHelpers';
import { resolveStylePreset, STYLE_PRESETS } from './stylePresets';
import { CHORD_TONE_DEGREES } from './types';

describe('melodyHelpers', () => {
  it('phraseArcDegree rises through bar 2 then resolves on bar 4', () => {
    const { plan } = promptToPlan('loopable nu-disco hook');
    const preset = STYLE_PRESETS['nu-disco'];

    const bar0 = phraseArcDegree(0, 4, plan, preset);
    const bar2 = phraseArcDegree(2, 4, plan, preset);
    const bar3 = phraseArcDegree(3, 4, plan, preset);

    expect(bar2).toBeGreaterThanOrEqual(bar0);
    expect(bar3).toBe(0);
  });

  it('chooseNextDegree recovers stepwise after a leap', () => {
    const { plan } = promptToPlan('funky melody');
    const preset = STYLE_PRESETS.funk;
    const slot = { duration: 0.5 };

    const afterLeap = chooseNextDegree(5, 3, 2, 6, slot, plan, preset, 2, 0, 4, buildScaleContext(plan));
    expect(Math.abs(afterLeap - 5)).toBe(1);
  });

  it('chooseNextDegree allows passing tones on weak beats', () => {
    const { plan } = promptToPlan('jazzy lo-fi chord melody');
    const lowBiasPlan = { ...plan, chordToneBias: 0.35 };
    const preset = STYLE_PRESETS.generic;
    const weakSlot = { duration: 0.5 };

    const next = chooseNextDegree(2, 1, 2, 6, weakSlot, lowBiasPlan, preset, 3, 1, 4, buildScaleContext(lowBiasPlan));
    const isPassingOrStep = Math.abs(next - 2) <= 1;
    const isNonChordTone = !CHORD_TONE_DEGREES.includes(next as (typeof CHORD_TONE_DEGREES)[number]);
    expect(isPassingOrStep || isNonChordTone).toBe(true);
  });

  it('applyPenultimateSetup approaches turnaround degrees before cadence', () => {
    const { plan } = promptToPlan('loopable nu-disco hook');
    const preset = resolveStylePreset(plan);
    const scale = buildScaleContext(plan);
    const bar = buildMotif(plan, scale, preset, 0, 42);

    const prepared = applyPenultimateSetup(bar, plan, scale, preset);
    const lastPitched = [...prepared.tokens].reverse().find((t) => t.pitch !== 'rest');
    expect(lastPitched).toBeDefined();
    const approachDegree = preset.turnaroundDegrees[preset.turnaroundDegrees.length - 2];
    const expectedMidi = scale.notes[approachDegree % scale.notes.length];
    expect(lastPitched!.midiNote).toBe(expectedMidi);
  });

  it('applyCadence ends on tonic with loop-friendly hold', () => {
    const { plan } = promptToPlan('loopable funky melody');
    const preset = resolveStylePreset(plan);
    const scale = buildScaleContext(plan);
    const bar = buildMotif(plan, scale, preset, 3, 99);
    const cadenced = applyCadence(bar, plan, scale, preset);

    expect(endsOnTonic(cadenced.tokens, scale.rootMidi)).toBe(true);
    const last = [...cadenced.tokens].reverse().find((t) => t.pitch !== 'rest');
    expect(last!.duration).toBeGreaterThanOrEqual(0.5);
  });

  it('planToScore remains deterministic after melody improvements', () => {
    const prompt = 'loopable funky melody 100 BPM summer nu-disco';
    const plan = promptToPlan(prompt).plan;
    const a = planToScore(plan);
    const b = planToScore(plan);
    expect(a.tokens.map((t) => t.source)).toEqual(b.tokens.map((t) => t.source));
  });
});
