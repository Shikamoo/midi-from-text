/**
 * Orchestrates local planner with rule-based fallback.
 */

import type { MusicPlan, PlanAssumption, PlanDefaults, PlanParseResult } from '../types/musicPlan';
import type { PlannerMusicPlan } from '../utils/localPlanner/schema';
import { promptToPlan } from '../utils/promptToPlan';
import { mapToGeneratorPlan } from '../utils/localPlanner/mapToGeneratorPlan';
import { fetchMusicPlan, type PlannerClientResult } from './plannerClient';
import { isLocalPlannerEnabled } from './plannerConfig';

export interface PlanFromPromptOptions extends PlanDefaults {
  useLocalPlanner?: boolean;
  temperature?: number;
  seed?: number;
  variationBoost?: number;
}

export interface PlanFromPromptResult {
  plan: MusicPlan;
  confidence: number;
  assumptions: PlanAssumption[];
  llmPlan: PlannerMusicPlan | null;
  source: 'ollama' | 'fallback' | 'rules';
  plannerMessage: string | null;
  model: string | null;
}

export async function planFromPromptAsync(
  text: string,
  options: PlanFromPromptOptions = {},
): Promise<PlanFromPromptResult> {
  const trimmed = text.trim();
  const usePlanner = options.useLocalPlanner ?? isLocalPlannerEnabled();

  if (!usePlanner) {
    return ruleBasedResult(trimmed, options, null);
  }

  const plannerResult = await fetchMusicPlan({
    prompt: trimmed,
    bars: options.bars,
    temperature: options.temperature,
    seed: options.seed,
  });

  if (plannerResult.plan) {
    return plannerBasedResult(plannerResult.plan, options, plannerResult);
  }

  return ruleBasedResult(trimmed, options, plannerResult);
}

function plannerBasedResult(
  plannerPlan: PlannerMusicPlan,
  options: PlanFromPromptOptions,
  plannerResult: PlannerClientResult,
): PlanFromPromptResult {
  const { plan, assumptions } = mapToGeneratorPlan(plannerPlan, {
    tempo: options.tempo,
    key: options.key,
    mode: options.mode,
    beatsPerBar: options.beatsPerBar,
    beatValue: options.beatValue,
    bars: options.bars,
    instrument: options.instrument,
    seed: options.seed,
    variationBoost: options.variationBoost,
  });

  const source = plannerResult.source === 'ollama' ? 'ollama' : 'fallback';
  const message = plannerResult.warning ?? plannerResult.error;

  return {
    plan,
    confidence: source === 'ollama' ? 0.85 : 0.6,
    assumptions: [
      ...assumptions,
      {
        field: 'tempo',
        message: `Local planner (${source}): ${plannerPlan.style}`,
        confidence: source === 'ollama' ? 0.85 : 0.55,
        source,
      },
    ],
    llmPlan: plannerPlan,
    source,
    plannerMessage: message,
    model: plannerResult.model,
  };
}

function ruleBasedResult(
  text: string,
  options: PlanFromPromptOptions,
  plannerResult: PlannerClientResult | null,
): PlanFromPromptResult {
  const { plan, confidence, assumptions } = promptToPlan(text, options);
  const message = plannerResult?.error
    ? `Local planner unavailable — using rule-based parser. ${plannerResult.error}`
    : null;

  return {
    plan,
    confidence,
    assumptions,
    llmPlan: null,
    source: 'rules',
    plannerMessage: message,
    model: null,
  };
}

export function planFromPromptSync(text: string, options: PlanDefaults = {}): PlanParseResult {
  return promptToPlan(text, options);
}
