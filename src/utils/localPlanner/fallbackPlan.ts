/**
 * Build a PlannerMusicPlan from the existing rule-based parser (fallback path).
 */

import type { MusicPlan } from '../../types/musicPlan';
import { promptToPlan } from '../promptToPlan';
import type { PlannerMusicPlan } from './schema';
import { clampMusicPlan, defaultMusicPlan } from './schema';

export function fallbackMusicPlan(prompt: string, bars?: number): PlannerMusicPlan {
  const trimmed = prompt.trim();
  if (!trimmed) return defaultMusicPlan(prompt);

  const { plan } = promptToPlan(trimmed, { bars });
  return generatorPlanToPlannerMusicPlan(plan, trimmed);
}

/** Approximate inverse of mapToGeneratorPlan for API fallback responses. */
export function generatorPlanToPlannerMusicPlan(
  gen: MusicPlan,
  prompt: string,
): PlannerMusicPlan {
  const meter = gen.beatsPerBar === 3 ? '3/4'
    : gen.beatsPerBar === 6 && gen.beatValue === 8 ? '6/8'
      : gen.beatsPerBar === 2 ? '2/4'
        : '4/4';

  const texture = gen.genre === 'ambient' ? 'monophonic' : 'melody+chords';

  return clampMusicPlan({
    prompt,
    style: gen.genre === 'generic' ? 'generic' : gen.genre,
    mood: [gen.mood],
    tempoBpm: gen.tempo,
    meter,
    keyCenter: gen.key,
    scaleType: gen.mode,
    phraseBars: gen.motifLength,
    totalBars: gen.bars,
    rhythmDensity: densityToNumber(gen.density),
    restDensity: gen.density === 'sparse' ? 0.4 : gen.density === 'dense' ? 0.1 : 0.2,
    syncopation: syncopationToNumber(gen.syncopation, gen.groove),
    harmonicComplexity: gen.cadenceStrength,
    repetition: gen.motifStrength,
    variation: gen.variationRate,
    consonance: gen.chordToneBias,
    melodicRange: registerToRange(gen.register),
    leapRate: gen.stepLeapBalance,
    motifShape: gen.contour,
    articulation: 'legato',
    dynamics: gen.velocity < 65 ? 'soft' : gen.velocity > 95 ? 'loud' : 'medium',
    texture,
    registerBias: gen.register === 'low' ? 'low' : gen.register === 'high' ? 'high' : 'mid',
    percussionEnergy: gen.energy,
    notes: [],
  }, prompt);
}

function densityToNumber(d: MusicPlan['density']): number {
  if (d === 'sparse') return 0.3;
  if (d === 'dense') return 0.75;
  return 0.5;
}

function syncopationToNumber(s: MusicPlan['syncopation'], groove: number): number {
  if (s === 'heavy') return 0.75;
  if (s === 'light') return 0.45;
  return clamp01(groove * 0.5);
}

function registerToRange(r: MusicPlan['register']): { min: string; max: string } {
  if (r === 'low') return { min: 'C3', max: 'G4' };
  if (r === 'high') return { min: 'C4', max: 'C6' };
  return { min: 'C4', max: 'A5' };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
