import type { PlannerMusicPlan } from '../utils/localPlanner/schema';
import { mapToGeneratorPlan, type MapToGeneratorOptions, type MapToGeneratorResult } from '../utils/localPlanner/mapToGeneratorPlan';

export type MapLlmPlanOptions = MapToGeneratorOptions;
export type MapLlmPlanResult = MapToGeneratorResult;

export function mapLlmPlanToMusicPlan(
  llm: PlannerMusicPlan,
  options: MapLlmPlanOptions = {},
): MapLlmPlanResult {
  return mapToGeneratorPlan(llm, options);
}
