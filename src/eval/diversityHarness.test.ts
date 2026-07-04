import { describe, expect, it } from 'vitest';
import {
  EVAL_PIPELINES,
  buildComparisons,
  metricsToCsvRow,
  recordsToCsv,
  runEvalPipeline,
  runFullEval,
  summarizeLayerImpact,
} from './diversityHarness';
import { computeScoreMetrics, rhythmPatternSimilarity } from './scoreMetrics';
import { planToScore } from '../utils/planToScore';
import { promptToPlan } from '../utils/promptToPlan';
import { DIVERSITY_PROMPTS } from '../utils/localPlanner/__fixtures__/diversityPrompts';

describe('diversity eval harness', () => {
  it('runs all pipeline modes for each fixture prompt', () => {
    const runs = runFullEval();
    expect(runs).toHaveLength(DIVERSITY_PROMPTS.length * EVAL_PIPELINES.length);
    for (const pipeline of EVAL_PIPELINES) {
      expect(runs.filter((r) => r.pipeline === pipeline)).toHaveLength(DIVERSITY_PROMPTS.length);
    }
  });

  it('computes score metrics from ParsedScore', () => {
    const { plan } = promptToPlan('loopable funky melody 100 BPM');
    const score = planToScore(plan);
    const m = computeScoreMetrics(score, plan.motifLength);
    expect(m.pitchSpan).toBeGreaterThan(0);
    expect(m.noteDensity).toBeGreaterThan(0);
    expect(m.rhythmSignature.length).toBeGreaterThan(0);
  });

  it('planner pipelines differ from legacy on at least one metric', () => {
    const prompt = DIVERSITY_PROMPTS[0];
    const legacy = runEvalPipeline(prompt, 'legacy');
    const planner = runEvalPipeline(prompt, 'planner_same_seed');
    const comparisons = buildComparisons([legacy, planner]);
    const row = comparisons.find(
      (c) => c.baseline === 'legacy' && c.compare === 'planner_same_seed',
    );
    expect(row).toBeDefined();
    const changed =
      row!.comparison.pitchSpanDelta !== 0 ||
      row!.comparison.noteDensityDelta !== 0 ||
      row!.comparison.harmonyDensityDelta !== 0 ||
      row!.comparison.rhythmSimilarity < 1;
    expect(changed).toBe(true);
  });

  it('different planner seeds produce measurable differences', () => {
    const prompt = DIVERSITY_PROMPTS[2];
    const same = runEvalPipeline(prompt, 'planner_same_seed');
    const diff = runEvalPipeline(prompt, 'planner_diff_seed');
    const comparisons = buildComparisons([same, diff]);
    const row = comparisons.find(
      (c) => c.baseline === 'planner_same_seed' && c.compare === 'planner_diff_seed',
    );
    expect(row).toBeDefined();
    expect(
      row!.comparison.rhythmSimilarity < 1 ||
      row!.comparison.avgIntervalDelta !== 0 ||
      row!.comparison.motifRepetitionDelta !== 0,
    ).toBe(true);
  });

  it('exports valid CSV rows', () => {
    const csv = recordsToCsv([metricsToCsvRow(runEvalPipeline(DIVERSITY_PROMPTS[0], 'legacy'))]);
    expect(csv.split('\n').length).toBeGreaterThanOrEqual(2);
    expect(csv).toContain('pitch_span');
  });

  it('summarizes layer impact across comparisons', () => {
    const impact = summarizeLayerImpact(buildComparisons(runFullEval()));
    expect(impact.length).toBeGreaterThanOrEqual(3);
    expect(impact.some((r) => r.comparison.includes('legacy'))).toBe(true);
  });

  it('rhythm similarity is 1 for identical scores', () => {
    const { plan } = promptToPlan('100 BPM C major');
    const score = planToScore(plan);
    const m = computeScoreMetrics(score);
    expect(rhythmPatternSimilarity(m, m)).toBe(1);
  });
});
