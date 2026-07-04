/**
 * Melody-specific planner intent helpers for generation and debug summaries.
 */

import { pitchToMidi } from '../../types/music';
import type { Contour, MusicPlan, PlannerGenerationIntent } from '../../types/musicPlan';
import type { PlannerMusicPlan } from '../localPlanner/schema';
import { resolvePlannerScale } from './scaleIntervals';
import type { ScaleContext } from './types';

export function motifShapeToContour(shape: string): Contour {
  const s = shape.toLowerCase();
  if (/ascend|rise|rising|climb|up/i.test(s)) return 'ascending';
  if (/descend|fall|drop|down/i.test(s)) return 'descending';
  if (/static|flat|pedal|drone/i.test(s)) return 'static';
  if (/undulat|wave|arch|see/i.test(s)) return 'undulating';
  return 'undulating';
}

export function effectiveContour(plan: MusicPlan): Contour {
  const shape = plan.plannerIntent?.motifShape;
  if (shape) return motifShapeToContour(shape);
  return plan.contour;
}

export function effectiveChordToneBias(plan: MusicPlan): number {
  return plan.plannerIntent?.consonance ?? plan.chordToneBias;
}

export function effectiveLeapRate(plan: MusicPlan): number {
  return plan.plannerIntent?.leapRate ?? plan.stepLeapBalance;
}

export function leapTendencyLabel(leapRate: number): string {
  if (leapRate < 0.35) return 'stepwise';
  if (leapRate > 0.65) return 'leapy';
  return 'balanced';
}

export function consonanceLabel(consonance: number): string {
  if (consonance > 0.65) return 'chord-tone heavy';
  if (consonance < 0.4) return 'passing-tone friendly';
  return 'mixed';
}

/** Map planner pitch strings → scale degree indices (0..maxDegree). */
export function resolvePitchAnchorDegrees(
  plan: MusicPlan,
  scale: ScaleContext,
): number[] {
  const anchors = plan.plannerIntent?.pitchAnchors ?? [];
  if (anchors.length === 0 || scale.notes.length === 0) return [];

  const maxDegree = scale.maxDegree ?? 6;
  return anchors.map((pitch) => {
    const midi = pitchToMidi(pitch);
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < scale.notes.length; i++) {
      const dist = Math.abs(scale.notes[i] - midi);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    return Math.min(maxDegree, bestIdx % (maxDegree + 1));
  });
}

export function buildMelodyIntentSummary(
  _planner: PlannerMusicPlan,
  plan: MusicPlan,
): string {
  const intent = plan.plannerIntent;
  if (!intent) {
    return 'Melody intent realized: legacy enums (no plannerIntent)';
  }

  const scale = resolvePlannerScale(intent.scaleType, plan.mode);
  const anchorsUsed = intent.pitchAnchors.length > 0;
  const contour = effectiveContour(plan);

  return [
    'Melody intent realized:',
    `  notes[]: ${anchorsUsed ? `used (${intent.pitchAnchors.length} anchors: ${intent.pitchAnchors.join(', ')})` : 'not used'}`,
    `  scale: ${scale.id} (${scale.intervals.length} tones)`,
    `  intervals: ${leapTendencyLabel(intent.leapRate)} (leapRate ${intent.leapRate.toFixed(2)})`,
    `  consonance: ${consonanceLabel(intent.consonance)} (${intent.consonance.toFixed(2)})`,
    `  contour: ${contour} from "${intent.motifShape}"`,
  ].join('\n');
}

export function melodyIntentFieldsFromPlanner(
  planner: PlannerMusicPlan,
): Pick<
  PlannerGenerationIntent,
  | 'scaleType'
  | 'leapRate'
  | 'consonance'
  | 'motifShape'
  | 'pitchAnchors'
> {
  return {
    scaleType: planner.scaleType,
    leapRate: planner.leapRate,
    consonance: planner.consonance,
    motifShape: planner.motifShape,
    pitchAnchors: planner.notes.length > 0 ? [...planner.notes] : [],
  };
}
