/**
 * Diversity review helpers for planner → generator mapping.
 *
 * Where diversity is still lost (see also diversity.test.ts):
 * - Planner output: Ollama may still converge on similar defaults despite prompts.
 * - Mapping layer: enums (mood, genre, density, syncopation, register, repetition) collapse continuous values.
 * - Generator constraints: motifLength capped at 1–2 bars; harmony texture not fully driven by planner texture.
 */

import type { MusicPlan } from '../../types/musicPlan';

export function generatorPlanFingerprint(plan: MusicPlan): string {
  return [
    plan.tempo,
    plan.key,
    plan.mode,
    plan.beatsPerBar,
    plan.beatValue,
    plan.bars,
    plan.mood,
    plan.genre,
    plan.contour,
    plan.density,
    plan.syncopation,
    plan.register,
    plan.repetition,
    plan.motifLength,
    plan.instrument,
    plan.velocity,
    plan.groove.toFixed(2),
    plan.brightness.toFixed(2),
    plan.energy.toFixed(2),
    plan.motifStrength.toFixed(2),
    plan.variationRate.toFixed(2),
    plan.chordToneBias.toFixed(2),
    plan.stepLeapBalance.toFixed(2),
    plan.cadenceStrength.toFixed(2),
  ].join('|');
}

/** Count how many fingerprint segments differ between two generator plans. */
export function generatorPlanDistance(a: MusicPlan, b: MusicPlan): number {
  const fa = generatorPlanFingerprint(a).split('|');
  const fb = generatorPlanFingerprint(b).split('|');
  let diff = 0;
  for (let i = 0; i < fa.length; i++) {
    if (fa[i] !== fb[i]) diff++;
  }
  return diff;
}

/** Minimum segment differences to consider plans "near-identical". */
export const NEAR_IDENTICAL_THRESHOLD = 4;

export function plansAreNearIdentical(a: MusicPlan, b: MusicPlan): boolean {
  return generatorPlanDistance(a, b) < NEAR_IDENTICAL_THRESHOLD;
}
