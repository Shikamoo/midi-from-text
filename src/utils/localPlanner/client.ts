/**
 * Browser client for /api/plan and health check.
 */

import type { PlannerMusicPlan } from './schema';
import type { PlanApiRequest, PlanApiResponse, PlannerStatus } from './types';
import { isLocalPlannerEnabled } from './config';
import { checkOllamaAvailable, resolveOllamaConfig } from './ollamaClient';

export interface PlannerClientResult {
  status: PlannerStatus;
  plan: PlannerMusicPlan | null;
  source: 'ollama' | 'fallback' | null;
  model: string | null;
  error: string | null;
  warning: string | null;
}

export function getPlannerModelName(): string {
  return resolveOllamaConfig().model;
}

export async function fetchMusicPlan(request: PlanApiRequest): Promise<PlannerClientResult> {
  try {
    const res = await fetch('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    const data = await res.json() as PlanApiResponse;

    if (!data.ok) {
      return {
        status: 'fallback',
        plan: null,
        source: null,
        model: null,
        error: data.error,
        warning: null,
      };
    }

    return {
      status: data.source === 'ollama' ? 'ready' : 'fallback',
      plan: data.plan,
      source: data.source,
      model: data.model ?? getPlannerModelName(),
      error: null,
      warning: data.warning ?? null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Planner request failed';
    return {
      status: 'unavailable',
      plan: null,
      source: null,
      model: null,
      error: message,
      warning: null,
    };
  }
}

export async function checkPlannerHealth(): Promise<PlannerStatus> {
  if (!isLocalPlannerEnabled()) return 'disabled';

  try {
    const res = await fetch('/api/plan/health');
    if (!res.ok) return 'unavailable';
    const data = await res.json() as { ok?: boolean; ollama?: boolean };
    return data.ok && data.ollama ? 'available' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export { checkOllamaAvailable };
