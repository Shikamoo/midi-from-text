/**
 * Planner-aware harmony context: scale intervals and accompaniment strategy.
 */

import type { MusicPlan } from '../../types/musicPlan';
import { resolvePlannerIntent } from '../localPlanner/mappingAudit';
import { resolvePlannerScale } from './scaleIntervals';
import type { ScaleContext } from './types';

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

export type HarmonyAccompanimentStyle =
  | 'diatonic-triads'
  | 'modal-triads'
  | 'open-fifths'
  | 'quartal-stack'
  | 'drone';

export interface HarmonyContext {
  intervals: number[];
  scaleId: string;
  degreeCount: number;
  harmonyMode: string;
  accompanimentStyle: HarmonyAccompanimentStyle;
  modalFallback: boolean;
  useDiatonicSevenths: boolean;
  texture: ReturnType<typeof resolvePlannerIntent>['texture'];
}

export function resolveHarmonyContext(plan: MusicPlan, scale: ScaleContext): HarmonyContext {
  if (!plan.plannerIntent) {
    const intervals = plan.mode === 'major' ? MAJOR : MINOR;
    return {
      intervals,
      scaleId: plan.mode,
      degreeCount: intervals.length,
      harmonyMode: plan.mode,
      accompanimentStyle: 'diatonic-triads',
      modalFallback: false,
      useDiatonicSevenths: true,
      texture: 'melody+chords',
    };
  }

  const intent = plan.plannerIntent;
  const resolved = resolvePlannerScale(intent.scaleType, plan.mode);
  const scaleId = scale.scaleId ?? resolved.id;
  const intervals = resolved.intervals;
  const texture = intent.texture;

  if (scaleId === 'major' || scaleId === 'minor') {
    return {
      intervals,
      scaleId,
      degreeCount: intervals.length,
      harmonyMode: scaleId,
      accompanimentStyle: texture === 'polyphonic' ? 'diatonic-triads' : 'diatonic-triads',
      modalFallback: false,
      useDiatonicSevenths: texture === 'polyphonic' && intent.harmonicComplexity > 0.55,
      texture,
    };
  }

  if (scaleId === 'dorian' || scaleId === 'mixolydian') {
    return {
      intervals,
      scaleId,
      degreeCount: intervals.length,
      harmonyMode: scaleId,
      accompanimentStyle: texture === 'polyphonic' ? 'quartal-stack' : 'modal-triads',
      modalFallback: true,
      useDiatonicSevenths: false,
      texture,
    };
  }

  if (scaleId === 'major-pentatonic' || scaleId === 'minor-pentatonic') {
    return {
      intervals,
      scaleId,
      degreeCount: intervals.length,
      harmonyMode: scaleId,
      accompanimentStyle: texture === 'polyphonic' ? 'quartal-stack' : 'open-fifths',
      modalFallback: true,
      useDiatonicSevenths: false,
      texture,
    };
  }

  const fallback = plan.mode === 'minor' ? MINOR : MAJOR;
  return {
    intervals: fallback,
    scaleId: plan.mode,
    degreeCount: fallback.length,
    harmonyMode: plan.mode,
    accompanimentStyle: 'diatonic-triads',
    modalFallback: true,
    useDiatonicSevenths: false,
    texture,
  };
}

export function penultimateHarmonyDegree(ctx: HarmonyContext, plan: MusicPlan): number {
  if (ctx.scaleId === 'mixolydian') return 4;
  if (ctx.scaleId === 'dorian') return 4;
  if (plan.mode === 'major' || ctx.harmonyMode === 'major') return 4;
  return 6;
}

export function accompanimentStyleLabel(style: HarmonyAccompanimentStyle): string {
  switch (style) {
    case 'diatonic-triads': return 'diatonic triads';
    case 'modal-triads': return 'modal triads';
    case 'open-fifths': return 'open fifths';
    case 'quartal-stack': return 'quartal stack';
    case 'drone': return 'drone';
  }
}

export function buildHarmonyIntentSummary(plan: MusicPlan, scale: ScaleContext): string {
  if (!plan.plannerIntent) {
    return 'Harmony intent realized: legacy plan.mode major/minor diatonic triads';
  }

  const ctx = resolveHarmonyContext(plan, scale);
  return [
    'Harmony intent realized:',
    `  harmony mode: ${ctx.harmonyMode}`,
    `  scale: ${ctx.scaleId} (${ctx.intervals.length} tones)`,
    `  accompaniment: ${accompanimentStyleLabel(ctx.accompanimentStyle)}`,
    `  texture: ${ctx.texture}`,
    `  modal fallback: ${ctx.modalFallback ? 'yes' : 'no'}`,
  ].join('\n');
}
