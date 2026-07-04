/**
 * API types for POST /api/plan
 */

import type { PlannerMusicPlan } from './schema.js';
import type { PlannerParseDebug } from './schemaDebug.js';

export type { PlannerParseDebug as PlannerDebugInfo } from './schemaDebug.js';

export type PlannerStatus =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'unavailable'
  | 'planning'
  | 'fallback'
  | 'ready'
  | 'error';

export interface PlanApiRequest {
  prompt: string;
  bars?: number;
  temperature?: number;
  seed?: number;
}

export interface PlanApiSuccess {
  ok: true;
  source: 'ollama' | 'fallback';
  plan: PlannerMusicPlan;
  model?: string;
  warning?: string;
  debug?: PlannerParseDebug;
}

export interface PlanApiDisabled {
  ok: false;
  error: string;
  code: 'disabled' | 'validation';
}

export type PlanApiResponse = PlanApiSuccess | PlanApiDisabled;
