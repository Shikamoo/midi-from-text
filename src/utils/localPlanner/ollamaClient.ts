/**
 * Ollama structured-output client for local music planning.
 */

import type { PlannerMusicPlan } from './schema.js';
import {
  tryNormalizeMusicPlan,
  extractJsonFromString,
  musicPlanJsonSchema,
  type PlannerParseDebug,
} from './schema.js';
import {
  buildPlannerSystemPrompt,
  buildPlannerUserMessage,
  buildRepairUserMessage,
} from './prompts.js';
import { resolveOllamaConfig, isPlannerDebugEnabled, type OllamaPlannerConfig } from './config.js';

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
  debug?: PlannerParseDebug;
}

export interface OllamaPlanFailure {
  ok: false;
  code: 'timeout' | 'connection' | 'invalid_json' | 'validation' | 'empty' | 'model_missing' | 'unknown';
  error: string;
  debug?: PlannerParseDebug;
}

export type OllamaPlanOutcome = OllamaPlanSuccess | OllamaPlanFailure;

type ParseFailureCode = 'invalid_json' | 'validation' | 'empty';

interface ParsedContentFailure {
  ok: false;
  code: ParseFailureCode;
  error: string;
  debug: PlannerParseDebug;
}

interface ParsedContentSuccess {
  ok: true;
  plan: PlannerMusicPlan;
  debug: PlannerParseDebug;
}

type ParsedContentOutcome = ParsedContentSuccess | ParsedContentFailure;

export async function planWithOllama(
  request: PlannerRequest,
  config: OllamaPlannerConfig = resolveOllamaConfig(),
): Promise<OllamaPlanOutcome> {
  const temperature = request.temperature ?? config.defaultTemperature;
  const debugEnabled = isPlannerDebugEnabled();

  const first = await requestStructuredPlan(request, config, temperature, debugEnabled);
  if (first.ok) return first;

  if (first.code !== 'validation') return first;

  const retry = await requestModelRepairRetry(
    request,
    config,
    temperature,
    debugEnabled,
    first.debug ?? {},
  );

  if (retry.ok) return retry;

  return {
    ok: false,
    code: 'validation',
    error: buildValidationErrorMessage(retry.debug),
    debug: retry.debug,
  };
}

function buildValidationErrorMessage(debug?: PlannerParseDebug): string {
  const base = debug?.retryAttempted
    ? 'Ollama returned invalid planner JSON after model repair retry.'
    : 'Ollama returned invalid planner JSON.';
  if (!debug?.primaryFailureField) return base;
  return `${base} Most frequent failure: ${debug.primaryFailureField}.`;
}

async function requestStructuredPlan(
  request: PlannerRequest,
  config: OllamaPlannerConfig,
  temperature: number,
  debugEnabled: boolean,
): Promise<OllamaPlanOutcome> {
  const messages = [
    { role: 'system', content: buildPlannerSystemPrompt() },
    {
      role: 'user',
      content: buildPlannerUserMessage(request.prompt, {
        bars: request.bars,
        temperature,
        seed: request.seed,
      }),
    },
  ];

  const fetchOutcome = await postOllamaChat(messages, config, temperature);
  if (!fetchOutcome.ok) return fetchOutcome;

  const parsed = parseOllamaContent(
    fetchOutcome.content,
    request.prompt,
    debugEnabled,
    'initial',
  );
  if (!parsed.ok) {
    if (debugEnabled) logValidationFailure(parsed.debug, 'initial');
    return {
      ok: false,
      code: parsed.code,
      error: parsed.code === 'invalid_json'
        ? 'Ollama response was not valid JSON.'
        : formatValidationFailure(parsed.debug),
      debug: parsed.debug,
    };
  }

  applySeedVariation(parsed.plan, request.seed);
  return buildSuccessOutcome(parsed, debugEnabled);
}

async function requestModelRepairRetry(
  request: PlannerRequest,
  config: OllamaPlannerConfig,
  temperature: number,
  debugEnabled: boolean,
  firstDebug: PlannerParseDebug,
): Promise<OllamaPlanOutcome> {
  const invalidJson = firstDebug.repairedJson ?? firstDebug.parsedJson ?? firstDebug.rawContent ?? {};
  const validationErrors = firstDebug.validationErrors ?? ['Unknown validation failure'];
  const repairPrompt = buildRepairUserMessage(invalidJson, validationErrors);

  const retryDebug: PlannerParseDebug = {
    ...firstDebug,
    retryAttempted: true,
    retryPromptSize: repairPrompt.length,
    retrySucceeded: false,
  };

  if (debugEnabled) {
    console.warn('[local-planner][debug] attempting model repair retry');
    console.warn(`[local-planner][debug] repair prompt size: ${repairPrompt.length} chars`);
  }

  const messages = [
    { role: 'system', content: buildPlannerSystemPrompt() },
    { role: 'user', content: repairPrompt },
  ];

  const fetchOutcome = await postOllamaChat(messages, config, temperature);
  if (!fetchOutcome.ok) {
    return { ...fetchOutcome, debug: retryDebug };
  }

  retryDebug.retryRawContent = fetchOutcome.content;

  const parsed = parseOllamaContent(
    fetchOutcome.content,
    request.prompt,
    debugEnabled,
    'retry',
  );

  if (!parsed.ok) {
    if (debugEnabled) logValidationFailure(parsed.debug, 'retry');
    return {
      ok: false,
      code: parsed.code,
      error: parsed.code === 'invalid_json'
        ? 'Model repair retry was not valid JSON.'
        : formatValidationFailure({ ...retryDebug, ...parsed.debug }),
      debug: { ...retryDebug, ...parsed.debug, retryAttempted: true, retrySucceeded: false },
    };
  }

  retryDebug.retrySucceeded = true;
  applySeedVariation(parsed.plan, request.seed);

  if (debugEnabled) {
    console.info('[local-planner][debug] model repair retry succeeded');
  }

  return buildSuccessOutcome(
    { ok: true, plan: parsed.plan, debug: { ...retryDebug, ...parsed.debug } },
    debugEnabled,
  );
}

type FetchSuccess = { ok: true; content: string };
type FetchFailure = OllamaPlanFailure;

async function postOllamaChat(
  messages: Array<{ role: string; content: string }>,
  config: OllamaPlannerConfig,
  temperature: number,
): Promise<FetchSuccess | FetchFailure> {
  const url = `${config.baseUrl}/api/chat`;
  const body = {
    model: config.model,
    stream: false,
    format: musicPlanJsonSchema(),
    messages,
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

    return { ok: true, content };
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

function parseOllamaContent(
  content: string,
  promptFallback: string,
  debugEnabled: boolean,
  phase: 'initial' | 'retry',
): ParsedContentOutcome {
  if (debugEnabled) {
    console.info(`[local-planner][debug] raw Ollama message.content (${phase}, before schema parse):`);
    console.info(content);
  }

  let parseDebug: PlannerParseDebug = { rawContent: content };
  const extracted = extractJsonFromString(content);
  if (!extracted) {
    return {
      ok: false,
      code: 'invalid_json',
      error: 'Ollama response was not valid JSON.',
      debug: { ...parseDebug, validationErrors: ['Response was not valid JSON'] },
    };
  }

  parseDebug = {
    rawContent: content,
    parsedJson: extracted.value,
    repairActions: extracted.action ? [extracted.action] : undefined,
  };

  const result = tryNormalizeMusicPlan(extracted.value, promptFallback, content);
  const debug = mergeDebug(parseDebug, result.debug);

  if (result.ok) {
    if (debugEnabled && debug.repairActions?.length) {
      console.info(`[local-planner][debug] repair actions (${phase}):`, debug.repairActions);
    }
    return { ok: true, plan: result.plan, debug };
  }

  return {
    ok: false,
    code: 'validation',
    error: formatValidationFailure(debug),
    debug,
  };
}

function buildSuccessOutcome(
  parsed: ParsedContentSuccess,
  debugEnabled: boolean,
): OllamaPlanSuccess {
  const hasDebug = debugEnabled
    || (parsed.debug.repairActions?.length ?? 0) > 0
    || parsed.debug.retryAttempted;
  return {
    ok: true,
    plan: parsed.plan,
    debug: hasDebug ? parsed.debug : undefined,
  };
}

function applySeedVariation(plan: PlannerMusicPlan, seed: number | undefined): void {
  if (seed !== undefined) {
    plan.variation = Math.min(1, plan.variation + ((seed % 1000) / 1000) * 0.12);
  }
}

function mergeDebug(base: PlannerParseDebug, next: PlannerParseDebug): PlannerParseDebug {
  return {
    ...base,
    ...next,
    rawContent: base.rawContent ?? next.rawContent,
    repairActions: [...(base.repairActions ?? []), ...(next.repairActions ?? [])],
  };
}

function formatValidationFailure(debug: PlannerParseDebug): string {
  const first = debug.validationErrors?.[0];
  const fieldHint = debug.primaryFailureField ? ` (field: ${debug.primaryFailureField})` : '';
  return first
    ? `Planner output failed validation${fieldHint}: ${first}`
    : 'Planner output failed validation.';
}

function logValidationFailure(debug: PlannerParseDebug, phase: 'initial' | 'retry'): void {
  console.warn(`[local-planner][debug] schema validation failed (${phase}):`);
  for (const line of debug.validationErrors ?? []) console.warn(`  ${line}`);
  if (debug.primaryFailureField) {
    console.warn(`[local-planner][debug] primary failing field: ${debug.primaryFailureField}`);
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
