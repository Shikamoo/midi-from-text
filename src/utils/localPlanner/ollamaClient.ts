/**
 * Ollama structured-output client for local music planning.
 */

import type { PlannerMusicPlan } from './schema.js';
import { normalizeMusicPlan, musicPlanJsonSchema } from './schema.js';
import { buildPlannerSystemPrompt, buildPlannerUserMessage } from './prompts.js';
import { resolveOllamaConfig, type OllamaPlannerConfig } from './config.js';

export { resolveOllamaConfig };

export interface PlannerRequest {
  prompt: string;
  bars?: number;
  temperature?: number;
  seed?: number;
}

export interface OllamaPlanSuccess {
  ok: true;
  plan: PlannerMusicPlan;
}

export interface OllamaPlanFailure {
  ok: false;
  code: 'timeout' | 'connection' | 'invalid_json' | 'validation' | 'empty' | 'model_missing' | 'unknown';
  error: string;
}

export type OllamaPlanOutcome = OllamaPlanSuccess | OllamaPlanFailure;

export async function planWithOllama(
  request: PlannerRequest,
  config: OllamaPlannerConfig = resolveOllamaConfig(),
): Promise<OllamaPlanOutcome> {
  const temperature = request.temperature ?? config.defaultTemperature;

  for (let attempt = 0; attempt < 2; attempt++) {
    const outcome = await callOllamaOnce(request, config, temperature);
    if (outcome.ok) return outcome;
    if (outcome.code !== 'invalid_json' && outcome.code !== 'validation' && outcome.code !== 'empty') {
      return outcome;
    }
    console.warn(`[local-planner] parse failed (attempt ${attempt + 1}/2): ${outcome.error}`);
  }

  return {
    ok: false,
    code: 'validation',
    error: 'Ollama returned invalid planner JSON after retry.',
  };
}

async function callOllamaOnce(
  request: PlannerRequest,
  config: OllamaPlannerConfig,
  temperature: number,
): Promise<OllamaPlanOutcome> {
  const url = `${config.baseUrl}/api/chat`;
  const body = {
    model: config.model,
    stream: false,
    format: musicPlanJsonSchema(),
    messages: [
      { role: 'system', content: buildPlannerSystemPrompt() },
      {
        role: 'user',
        content: buildPlannerUserMessage(request.prompt, {
          bars: request.bars,
          temperature,
          seed: request.seed,
        }),
      },
    ],
    options: { temperature },
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const isModelMissing = response.status === 404 || /model.*not found/i.test(text);
      return {
        ok: false,
        code: isModelMissing ? 'model_missing' : 'connection',
        error: isModelMissing
          ? `Model "${config.model}" not found. Run: ollama pull ${config.model}`
          : `Ollama returned ${response.status}${text ? `: ${text.slice(0, 160)}` : ''}`,
      };
    }

    const payload = await response.json() as { message?: { content?: string } };
    const content = payload.message?.content?.trim();
    if (!content) {
      return { ok: false, code: 'empty', error: 'Ollama returned an empty response.' };
    }

    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      return { ok: false, code: 'invalid_json', error: 'Ollama response was not valid JSON.' };
    }

    try {
      const plan = normalizeMusicPlan(raw, request.prompt);
      if (request.seed !== undefined) {
        plan.variation = Math.min(1, plan.variation + ((request.seed % 1000) / 1000) * 0.12);
      }
      return { ok: true, plan };
    } catch (err) {
      return {
        ok: false,
        code: 'validation',
        error: err instanceof Error ? err.message : 'Planner output failed validation.',
      };
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        ok: false,
        code: 'timeout',
        error: `Ollama timed out after ${config.timeoutMs}ms.`,
      };
    }
    const message = err instanceof Error ? err.message : 'Unknown Ollama error';
    if (/fetch failed|ECONNREFUSED|ENOTFOUND/i.test(message)) {
      return {
        ok: false,
        code: 'connection',
        error: `Ollama is not reachable at ${config.baseUrl}. Start it with: ollama serve`,
      };
    }
    return { ok: false, code: 'unknown', error: message };
  } finally {
    clearTimeout(timer);
  }
}

export async function checkOllamaAvailable(
  config: OllamaPlannerConfig = resolveOllamaConfig(),
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`${config.baseUrl}/api/tags`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
