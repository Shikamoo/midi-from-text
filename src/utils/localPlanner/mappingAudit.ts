/**
 * Summarize how planner fields survive mapping into generator MusicPlan.
 */

import type { MusicPlan, PlannerGenerationIntent } from '../../types/musicPlan';
import type { PlannerMusicPlan } from './schema';

export type MappingDisposition = 'preserved' | 'approximated' | 'dropped';

export interface FieldMappingNote {
  field: string;
  disposition: MappingDisposition;
  detail: string;
}

export function buildMappingAudit(
  planner: PlannerMusicPlan,
  plan: MusicPlan,
): FieldMappingNote[] {
  const intent = plan.plannerIntent;
  const notes: FieldMappingNote[] = [];

  notes.push({
    field: 'prompt',
    disposition: 'preserved',
    detail: plan.plannerIntent ? 'echoed in plannerIntent context' : 'via tempo/key/bars',
  });
  notes.push({
    field: 'tempoBpm',
    disposition: 'preserved',
    detail: `→ tempo ${plan.tempo}`,
  });
  notes.push({
    field: 'meter',
    disposition: 'preserved',
    detail: `→ ${plan.beatsPerBar}/${plan.beatValue}`,
  });
  notes.push({
    field: 'keyCenter / scaleType',
    disposition: 'preserved',
    detail: `→ ${plan.key} ${plan.mode}`,
  });
  notes.push({
    field: 'totalBars / phraseBars',
    disposition: 'preserved',
    detail: `→ bars ${plan.bars}, motifLength ${plan.motifLength}`,
  });

  notes.push({
    field: 'texture',
    disposition: intent ? 'preserved' : 'dropped',
    detail: intent
      ? `→ plannerIntent.texture ${intent.texture}`
      : 'not set (defaults to melody+chords in generation)',
  });
  notes.push({
    field: 'registerBias / melodicRange',
    disposition: intent ? 'preserved' : 'approximated',
    detail: intent
      ? `→ registerBias ${intent.registerBias}, range ${intent.melodicRange.min}–${intent.melodicRange.max}`
      : `→ register enum ${plan.register}`,
  });
  notes.push({
    field: 'rhythmDensity / restDensity',
    disposition: intent ? 'preserved' : 'approximated',
    detail: intent
      ? `→ rhythm ${intent.rhythmDensity.toFixed(2)}, rest ${intent.restDensity.toFixed(2)}`
      : `→ density enum ${plan.density}`,
  });
  notes.push({
    field: 'syncopation',
    disposition: intent ? 'preserved' : 'approximated',
    detail: intent
      ? `→ syncopationLevel ${intent.syncopationLevel.toFixed(2)}, groove ${plan.groove.toFixed(2)}`
      : `→ syncopation enum ${plan.syncopation}`,
  });
  notes.push({
    field: 'repetition / variation',
    disposition: intent ? 'preserved' : 'approximated',
    detail: intent
      ? `→ repetition ${intent.repetitionLevel.toFixed(2)}, variation ${intent.variationLevel.toFixed(2)}`
      : `→ repetition enum ${plan.repetition}, variationRate ${plan.variationRate.toFixed(2)}`,
  });
  notes.push({
    field: 'harmonicComplexity / consonance',
    disposition: intent ? 'preserved' : 'approximated',
    detail: intent
      ? `→ harmonicComplexity ${intent.harmonicComplexity.toFixed(2)}`
      : `→ chordToneBias ${plan.chordToneBias.toFixed(2)}`,
  });

  notes.push({
    field: 'style / mood[]',
    disposition: 'approximated',
    detail: `→ genre ${plan.genre}, mood ${plan.mood}`,
  });
  notes.push({
    field: 'motifShape / articulation / dynamics',
    disposition: 'approximated',
    detail: `→ contour ${plan.contour}, velocity ${plan.velocity}`,
  });
  notes.push({
    field: 'notes[]',
    disposition: planner.notes.length > 0 ? 'preserved' : 'dropped',
    detail: planner.notes.length > 0 ? `${planner.notes.length} pitch hints` : 'empty (not used by generator)',
  });

  return notes;
}

export function formatMappingAuditSummary(notes: FieldMappingNote[]): string {
  const groups: Record<MappingDisposition, string[]> = {
    preserved: [],
    approximated: [],
    dropped: [],
  };
  for (const n of notes) {
    groups[n.disposition].push(`${n.field}: ${n.detail}`);
  }
  const lines = ['Mapping audit:'];
  for (const kind of ['preserved', 'approximated', 'dropped'] as const) {
    if (groups[kind].length === 0) continue;
    lines.push(`  ${kind}: ${groups[kind].join('; ')}`);
  }
  return lines.join('\n');
}

export function summarizePlannerMapping(
  planner: PlannerMusicPlan,
  plan: MusicPlan,
): string {
  return formatMappingAuditSummary(buildMappingAudit(planner, plan));
}

/** Default intent synthesized from legacy enums (rule-based path). */
export function defaultIntentFromPlan(plan: MusicPlan): PlannerGenerationIntent {
  const densityToRhythm = plan.density === 'sparse' ? 0.3 : plan.density === 'dense' ? 0.75 : 0.5;
  const syncLevel = plan.syncopation === 'heavy' ? 0.75 : plan.syncopation === 'light' ? 0.4 : 0.2;
  const repLevel = plan.repetition === 'high' ? 0.75 : plan.repetition === 'low' ? 0.3 : 0.55;
  const registerBias: PlannerGenerationIntent['registerBias'] =
    plan.register === 'low' ? 'low' : plan.register === 'high' ? 'high' : 'mid';

  return {
    texture: 'melody+chords',
    registerBias,
    rhythmDensity: densityToRhythm,
    restDensity: plan.density === 'sparse' ? 0.35 : 0.2,
    syncopationLevel: Math.max(syncLevel, plan.groove * 0.5),
    repetitionLevel: repLevel,
    variationLevel: plan.variationRate,
    harmonicComplexity: plan.cadenceStrength,
    melodicRange: registerBias === 'low'
      ? { min: 'C3', max: 'G4' }
      : registerBias === 'high'
        ? { min: 'C4', max: 'C6' }
        : { min: 'C4', max: 'A5' },
  };
}

export function resolvePlannerIntent(plan: MusicPlan): PlannerGenerationIntent {
  return plan.plannerIntent ?? defaultIntentFromPlan(plan);
}
