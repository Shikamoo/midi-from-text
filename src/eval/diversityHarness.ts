/**
 * Offline diversity evaluation harness (measurement only — no generator changes).
 */

import type { ParsedScore } from '../types/music';
import type { MusicPlan } from '../types/musicPlan';
import { planToScore } from '../utils/planToScore';
import { promptToPlan } from '../utils/promptToPlan';
import { mapToGeneratorPlan } from '../utils/localPlanner/mapToGeneratorPlan';
import {
  DIVERSITY_PROMPTS,
  DIVERSITY_PLANNER_PLANS,
} from '../utils/localPlanner/__fixtures__/diversityPrompts';
import {
  compareScoreMetrics,
  computeScoreMetrics,
  type PairwiseScoreComparison,
  type ScoreMetrics,
} from './scoreMetrics';

export const EVAL_PIPELINES = [
  'legacy',
  'planner_same_seed',
  'planner_diff_seed',
] as const;

export type EvalPipeline = (typeof EVAL_PIPELINES)[number];

export const EVAL_SEEDS = {
  legacy: null,
  planner_same_seed: 42,
  planner_diff_seed: 99,
} as const;

export interface EvalRunResult {
  prompt: string;
  pipeline: EvalPipeline;
  seed: number | null;
  plan: MusicPlan;
  score: ParsedScore;
  metrics: ScoreMetrics;
}

export interface EvalComparisonRow {
  prompt: string;
  baseline: EvalPipeline;
  compare: EvalPipeline;
  comparison: PairwiseScoreComparison;
}

export function runLegacyPipeline(prompt: string): { plan: MusicPlan; score: ParsedScore } {
  const { plan } = promptToPlan(prompt, { bars: 8 });
  return { plan, score: planToScore(plan) };
}

export function runPlannerPipeline(
  prompt: string,
  seed: number,
  variationBoost = 0,
): { plan: MusicPlan; score: ParsedScore } {
  const plannerPlan = DIVERSITY_PLANNER_PLANS[prompt as keyof typeof DIVERSITY_PLANNER_PLANS];
  if (!plannerPlan) {
    throw new Error(`No fixture planner plan for prompt: ${prompt}`);
  }
  const { plan } = mapToGeneratorPlan(plannerPlan, {
    bars: plannerPlan.totalBars,
    seed,
    variationBoost,
  });
  return { plan, score: planToScore(plan) };
}

export function runEvalPipeline(
  prompt: string,
  pipeline: EvalPipeline,
): EvalRunResult {
  let plan: MusicPlan;
  let score: ParsedScore;
  const seed = EVAL_SEEDS[pipeline];

  if (pipeline === 'legacy') {
    ({ plan, score } = runLegacyPipeline(prompt));
  } else if (pipeline === 'planner_same_seed') {
    ({ plan, score } = runPlannerPipeline(prompt, 42, 0));
  } else {
    ({ plan, score } = runPlannerPipeline(prompt, 99, 0.25));
  }

  const metrics = computeScoreMetrics(score, plan.motifLength);
  return { prompt, pipeline, seed, plan, score, metrics };
}

export function runFullEval(
  prompts: readonly string[] = DIVERSITY_PROMPTS,
): EvalRunResult[] {
  const rows: EvalRunResult[] = [];
  for (const prompt of prompts) {
    for (const pipeline of EVAL_PIPELINES) {
      rows.push(runEvalPipeline(prompt, pipeline));
    }
  }
  return rows;
}

export function buildComparisons(runs: EvalRunResult[]): EvalComparisonRow[] {
  const byKey = new Map<string, EvalRunResult>();
  for (const r of runs) {
    byKey.set(`${r.prompt}|${r.pipeline}`, r);
  }

  const pairs: Array<[EvalPipeline, EvalPipeline]> = [
    ['legacy', 'planner_same_seed'],
    ['legacy', 'planner_diff_seed'],
    ['planner_same_seed', 'planner_diff_seed'],
  ];

  const out: EvalComparisonRow[] = [];
  for (const prompt of [...new Set(runs.map((r) => r.prompt))]) {
    for (const [baseline, compare] of pairs) {
      const a = byKey.get(`${prompt}|${baseline}`);
      const b = byKey.get(`${prompt}|${compare}`);
      if (!a || !b) continue;
      out.push({
        prompt,
        baseline,
        compare,
        comparison: compareScoreMetrics(a.metrics, b.metrics),
      });
    }
  }
  return out;
}

export function metricsToCsvRow(r: EvalRunResult): Record<string, string | number> {
  const m = r.metrics;
  return {
    prompt: r.prompt,
    pipeline: r.pipeline,
    seed: r.seed ?? '',
    texture: r.plan.plannerIntent?.texture ?? 'legacy',
    motif_length: r.plan.motifLength,
    pitch_min: m.pitchMin,
    pitch_max: m.pitchMax,
    pitch_span: m.pitchSpan,
    note_density: round(m.noteDensity),
    rest_density: round(m.restDensity),
    avg_interval: round(m.avgInterval),
    max_interval: m.maxInterval,
    interval_histogram: m.intervalHistogram,
    motif_repetition_sim: round(m.motifRepetitionSim),
    harmony_note_density: round(m.harmonyNoteDensity),
    harmony_pitch_span: m.harmonyPitchSpan,
    bar_count: m.barCount,
  };
}

export function comparisonToCsvRow(c: EvalComparisonRow): Record<string, string | number> {
  const p = c.comparison;
  return {
    prompt: c.prompt,
    baseline: c.baseline,
    compare: c.compare,
    rhythm_similarity: round(p.rhythmSimilarity),
    motif_repetition_delta: round(p.motifRepetitionDelta),
    pitch_span_delta: p.pitchSpanDelta,
    note_density_delta: round(p.noteDensityDelta),
    rest_density_delta: round(p.restDensityDelta),
    avg_interval_delta: round(p.avgIntervalDelta),
    harmony_density_delta: round(p.harmonyDensityDelta),
  };
}

export function recordsToCsv(records: Record<string, string | number>[]): string {
  if (records.length === 0) return '';
  const headers = Object.keys(records[0]);
  const escape = (v: string | number) => {
    const s = String(v);
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    headers.join(','),
    ...records.map((row) => headers.map((h) => escape(row[h] ?? '')).join(',')),
  ];
  return lines.join('\n') + '\n';
}

function round(n: number, digits = 4): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function summarizeLayerImpact(comparisons: EvalComparisonRow[]): Array<{
  comparison: string;
  avgPitchSpanDelta: number;
  avgNoteDensityDelta: number;
  avgRestDensityDelta: number;
  avgIntervalDelta: number;
  avgHarmonyDensityDelta: number;
  avgRhythmSimilarity: number;
}> {
  const groups = new Map<string, EvalComparisonRow[]>();
  for (const c of comparisons) {
    const key = `${c.baseline}_vs_${c.compare}`;
    const list = groups.get(key) ?? [];
    list.push(c);
    groups.set(key, list);
  }

  return [...groups.entries()].map(([comparison, rows]) => {
    const mean = (fn: (c: EvalComparisonRow) => number) =>
      rows.reduce((s, r) => s + Math.abs(fn(r)), 0) / rows.length;
    return {
      comparison,
      avgPitchSpanDelta: round(mean((r) => r.comparison.pitchSpanDelta)),
      avgNoteDensityDelta: round(mean((r) => r.comparison.noteDensityDelta)),
      avgRestDensityDelta: round(mean((r) => r.comparison.restDensityDelta)),
      avgIntervalDelta: round(mean((r) => r.comparison.avgIntervalDelta)),
      avgHarmonyDensityDelta: round(mean((r) => r.comparison.harmonyDensityDelta)),
      avgRhythmSimilarity: round(
        rows.reduce((s, r) => s + r.comparison.rhythmSimilarity, 0) / rows.length,
      ),
    };
  });
}
