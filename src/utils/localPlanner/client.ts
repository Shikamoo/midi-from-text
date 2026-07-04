/**
 * Browser client for /api/plan and health check.
 */

import type { PlannerMusicPlan } from './schema';
import type { PlanApiRequest, PlanApiResponse, PlannerStatus, PlannerDebugInfo } from './types';
import { isLocalPlannerEnabled } from './config';
import { checkOllamaAvailable, resolveOllamaConfig } from './ollamaClient';

export interface PlannerClientResult {
  status: PlannerStatus;
  plan: PlannerMusicPlan | null;
  source: 'ollama' | 'fallback' | null;
  model: string | null;
  error: string | null;
  warning: string | null;
  debug: PlannerDebugInfo | null;
}

export function getPlannerModelName(): string {
  return resolveOllamaConfig().model;
}

export async function fetchMusicPlan(
  request: PlanApiRequest,
  signal?: AbortSignal,
): Promise<PlannerClientResult> {
  try {
    const res = await fetch('/api/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
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
        debug: null,
      };
    }

    return {
      status: data.source === 'ollama' ? 'ready' : 'fallback',
      plan: data.plan,
      source: data.source,
      model: data.model ?? getPlannerModelName(),
      error: null,
      warning: data.warning ?? null,
      debug: data.debug ?? null,
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
      debug: null,
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
