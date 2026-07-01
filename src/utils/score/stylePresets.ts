import type { MusicPlan } from '../../types/musicPlan';
import type { RhythmSlot, StylePreset } from './types';

const FUNK_RHYTHMS: RhythmSlot[][] = [
  [
    { duration: 0.5, accent: true },
    { duration: 0.5 },
    { duration: 0.5, rest: true },
    { duration: 0.5 },
    { duration: 0.5 },
    { duration: 0.5, rest: true },
    { duration: 0.5 },
    { duration: 1, accent: true },
  ],
  [
    { duration: 0.5, accent: true },
    { duration: 0.5, rest: true },
    { duration: 0.5 },
    { duration: 0.5 },
    { duration: 0.5, accent: true },
    { duration: 0.5 },
    { duration: 0.5, rest: true },
    { duration: 1, accent: true },
  ],
];

const NU_DISCO_RHYTHMS: RhythmSlot[][] = [
  [
    { duration: 0.5, accent: true },
    { duration: 0.5 },
    { duration: 0.5 },
    { duration: 0.5, rest: true },
    { duration: 0.5 },
    { duration: 0.5, accent: true },
    { duration: 1 },
  ],
  [
    { duration: 0.5, accent: true },
    { duration: 0.5, rest: true },
    { duration: 0.5 },
    { duration: 0.5 },
    { duration: 0.5 },
    { duration: 0.5 },
    { duration: 0.5, accent: true },
    { duration: 0.5 },
  ],
];

const HOUSE_RHYTHMS: RhythmSlot[][] = [
  [
    { duration: 0.5, accent: true },
    { duration: 0.5, rest: true },
    { duration: 0.5 },
    { duration: 0.5 },
    { duration: 0.5, accent: true },
    { duration: 0.5, rest: true },
    { duration: 0.5 },
    { duration: 0.5 },
  ],
  [
    { duration: 1, accent: true },
    { duration: 0.5, rest: true },
    { duration: 0.5 },
    { duration: 0.5, accent: true },
    { duration: 0.5 },
    { duration: 1 },
  ],
];

const CINEMATIC_RHYTHMS: RhythmSlot[][] = [
  [
    { duration: 2, accent: true },
    { duration: 1 },
    { duration: 1, accent: true },
  ],
  [
    { duration: 1, accent: true },
    { duration: 0.5 },
    { duration: 0.5 },
    { duration: 2, accent: true },
  ],
];

export const STYLE_PRESETS: Record<StylePreset['id'], StylePreset> = {
  funk: {
    id: 'funk',
    hookDegrees: [0, 2, 3, 4, 3, 2, 0, 2],
    rhythmPatterns: FUNK_RHYTHMS,
    phraseShape: 'call-response',
    turnaroundDegrees: [4, 2, 0],
    phraseArcDegrees: [2, 3, 4, 0],
    syncopationBias: 0.85,
  },
  'nu-disco': {
    id: 'nu-disco',
    hookDegrees: [0, 2, 4, 3, 2, 4, 3, 0],
    rhythmPatterns: NU_DISCO_RHYTHMS,
    phraseShape: 'slight-variation',
    turnaroundDegrees: [4, 2, 0],
    phraseArcDegrees: [2, 4, 3, 0],
    syncopationBias: 0.75,
  },
  house: {
    id: 'house',
    hookDegrees: [0, 4, 3, 2, 4, 2, 3, 0],
    rhythmPatterns: HOUSE_RHYTHMS,
    phraseShape: 'call-response',
    turnaroundDegrees: [2, 4, 0],
    phraseArcDegrees: [2, 3, 5, 0],
    syncopationBias: 0.7,
  },
  'cinematic-piano': {
    id: 'cinematic-piano',
    hookDegrees: [0, 1, 2, 3, 4, 3, 2, 1],
    rhythmPatterns: CINEMATIC_RHYTHMS,
    phraseShape: 'slight-variation',
    turnaroundDegrees: [5, 4, 2, 0],
    phraseArcDegrees: [1, 3, 4, 0],
    syncopationBias: 0.15,
  },
  generic: {
    id: 'generic',
    hookDegrees: [0, 2, 1, 3, 4, 3, 2, 0],
    rhythmPatterns: [
      [
        { duration: 1, accent: true },
        { duration: 0.5 },
        { duration: 0.5, rest: true },
        { duration: 1, accent: true },
        { duration: 1 },
      ],
    ],
    phraseShape: 'slight-variation',
    turnaroundDegrees: [2, 0],
    phraseArcDegrees: [2, 3, 4, 0],
    syncopationBias: 0.35,
  },
};

/** Pick the best style preset for a plan (deterministic). */
export function resolveStylePreset(plan: MusicPlan): StylePreset {
  if (
    plan.instrument === 0 &&
    (plan.genre === 'classical' || plan.mood === 'dark' || plan.mood === 'calm') &&
    plan.cadenceStrength >= 0.52
  ) {
    return STYLE_PRESETS['cinematic-piano'];
  }

  if (plan.genre === 'funk') {
    return STYLE_PRESETS.funk;
  }

  if (
    plan.genre === 'nu-disco' &&
    plan.repetition === 'high' &&
    plan.energy >= 0.66 &&
    plan.groove >= 0.64
  ) {
    return STYLE_PRESETS.house;
  }

  if (plan.genre === 'nu-disco') {
    return STYLE_PRESETS['nu-disco'];
  }

  return STYLE_PRESETS.generic;
}

/** Resolve phrase shape from plan repetition + preset default. */
export function resolvePhraseShape(plan: MusicPlan, preset: StylePreset): StylePreset['phraseShape'] {
  if (plan.repetition === 'high' && plan.variationRate < 0.42) {
    return 'exact-repeat';
  }
  if (plan.repetition === 'low' || plan.variationRate > 0.62) {
    return 'call-response';
  }
  if (plan.motifStrength > 0.62 && preset.phraseShape === 'call-response') {
    return 'slight-variation';
  }
  return preset.phraseShape;
}
