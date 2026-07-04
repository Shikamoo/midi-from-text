/**
 * POST /api/plan handler — always returns a usable plan when possible.
 */

import type { PlanApiRequest, PlanApiResponse } from './types.js';
import { planWithOllama, resolveOllamaConfig } from './ollamaClient.js';
import { isPlannerServerEnabled } from './config.js';
import { defaultMusicPlan, clampMusicPlan } from './schema.js';

export async function handlePlanRequest(body: PlanApiRequest): Promise<PlanApiResponse> {
  if (!isPlannerServerEnabled()) {
    return { ok: false, error: 'Local planner is disabled.', code: 'disabled' };
  }

  const prompt = body.prompt?.trim();
  if (!prompt) {
    return { ok: false, error: 'Prompt is required.', code: 'validation' };
  }

  const config = resolveOllamaConfig();
  const result = await planWithOllama(
    { prompt, bars: body.bars, temperature: body.temperature, seed: body.seed },
    config,
  );

  if (result.ok) {
    return { ok: true, source: 'ollama', plan: result.plan, model: config.model };
  }

  console.warn(`[local-planner] fallback: ${result.code} — ${result.error}`);
  const plan = clampMusicPlan({
    ...defaultMusicPlan(prompt),
    ...(body.bars !== undefined ? { totalBars: body.bars } : {}),
  }, prompt);
  return {
    ok: true,
    source: 'fallback',
    plan,
    model: config.model,
    warning: userFriendlyWarning(result.code, result.error),
  };
}

function userFriendlyWarning(
  code: string,
  error: string,
): string {
  switch (code) {
    case 'connection': return `Ollama unavailable — using rule-based plan. ${error}`;
    case 'timeout': return `Planner timed out — using rule-based plan.`;
    case 'model_missing': return `Model missing — using rule-based plan. ${error}`;
    case 'invalid_json':
    case 'validation':
    case 'empty': return `Invalid planner output — using rule-based plan.`;
    default: return `Planner failed — using rule-based plan. ${error}`;
  }
}

export async function readJsonBody<T>(req: {
  on: (event: string, cb: (chunk?: Buffer) => void) => void;
}): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk?: Buffer) => { if (chunk) chunks.push(chunk); });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve(text ? JSON.parse(text) as T : {} as T);
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}
