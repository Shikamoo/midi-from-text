/**
 * User-facing melody density — affects melody generation only (not harmony).
 */

import type { MusicPlan } from '../types/musicPlan';

export type MelodyDensity = 'sparse' | 'normal' | 'busy';

export const DEFAULT_MELODY_DENSITY: MelodyDensity = 'normal';

export interface MelodyDensityParams {
  rhythmDensity: number;
  restDensity: number;
  /** Lower = more passing/neighbor tones allowed on weak beats. */
  passingToneThreshold: number;
  /** Minimum |target − prev| scale steps before inserting a passing tone. */
  passingToneMinLeap: number;
  /** Allow neighbor motion when holding on a weak beat. */
  neighborOnWeakBeats: boolean;
  /** Split longer slots into shorter durations. */
  shortenDurations: boolean;
  /** Turn selected weak-beat rests into pitched slots. */
  weakBeatExtraNotes: boolean;
}

const SPARSE_PARAMS: MelodyDensityParams = {
  rhythmDensity: 0.3,
  restDensity: 0.35,
  passingToneThreshold: 0.58,
  passingToneMinLeap: 3,
  neighborOnWeakBeats: false,
  shortenDurations: false,
  weakBeatExtraNotes: false,
};

const BUSY_PARAMS: MelodyDensityParams = {
  rhythmDensity: 0.75,
  restDensity: 0.1,
  passingToneThreshold: 0.82,
  passingToneMinLeap: 1,
  neighborOnWeakBeats: true,
  shortenDurations: true,
  weakBeatExtraNotes: true,
};

export function melodyDensityParams(density: MelodyDensity): MelodyDensityParams | null {
  switch (density) {
    case 'sparse': return SPARSE_PARAMS;
    case 'busy': return BUSY_PARAMS;
    default: return null;
  }
}

export function resolveMelodyDensityParams(plan: MusicPlan): MelodyDensityParams | null {
  if (!plan.userMelodyDensity || plan.userMelodyDensity === 'normal') return null;
  return melodyDensityParams(plan.userMelodyDensity);
}

/** Apply UI melody density to a plan before score generation. Normal leaves the plan unchanged. */
export function applyMelodyDensityToPlan(plan: MusicPlan, density: MelodyDensity): MusicPlan {
  if (density === 'normal') return plan;

  const params = melodyDensityParams(density)!;
  const densityEnum = density === 'sparse' ? 'sparse' : 'dense';

  return {
    ...plan,
    userMelodyDensity: density,
    density: densityEnum,
    plannerIntent: plan.plannerIntent
      ? {
          ...plan.plannerIntent,
          rhythmDensity: params.rhythmDensity,
          restDensity: params.restDensity,
        }
      : plan.plannerIntent,
  };
}

export function melodyDensityFromConfig(config: { melodyDensity: MelodyDensity }): MelodyDensity {
  return config.melodyDensity ?? DEFAULT_MELODY_DENSITY;
}
