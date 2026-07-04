/** Env resolution for local Ollama planner (browser + Node). */

export interface OllamaPlannerConfig {
  baseUrl: string;
  model: string;
  timeoutMs: number;
  defaultTemperature: number;
}

export function isLocalPlannerEnabled(): boolean {
  const flag = readEnv().VITE_ENABLE_LOCAL_PLANNER;
  return flag === 'true' || flag === '1';
}

export function resolveOllamaConfig(env: Record<string, string | undefined> = readEnv()): OllamaPlannerConfig {
  return {
    baseUrl: (env.VITE_OLLAMA_BASE_URL ?? env.OLLAMA_BASE_URL ?? 'http://localhost:11434').replace(/\/$/, ''),
    model: env.VITE_OLLAMA_MODEL ?? env.OLLAMA_MODEL ?? 'llama3.1:8b',
    timeoutMs: Number(env.VITE_OLLAMA_TIMEOUT_MS ?? env.OLLAMA_TIMEOUT_MS ?? 20_000),
    defaultTemperature: Number(env.VITE_OLLAMA_TEMPERATURE ?? env.OLLAMA_TEMPERATURE ?? 0),
  };
}

export function isPlannerServerEnabled(env: Record<string, string | undefined> = readEnv()): boolean {
  const flag = env.ENABLE_LOCAL_PLANNER ?? env.VITE_ENABLE_LOCAL_PLANNER ?? 'true';
  return flag !== 'false' && flag !== '0';
}

function readEnv(): Record<string, string | undefined> {
  if (typeof process !== 'undefined' && process.env) {
    return process.env as Record<string, string | undefined>;
  }
  return (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env;
}

/** Low default — structured JSON schema handles shape; 0 maximizes adherence. */
export const DEFAULT_PLANNER_TEMPERATURE = 0;
export const DEFAULT_PLANNER_SEED = 42;

export function isPlannerDebugEnabled(env: Record<string, string | undefined> = readEnv()): boolean {
  const flag = env.VITE_PLANNER_DEBUG ?? env.PLANNER_DEBUG ?? 'false';
  return flag === 'true' || flag === '1';
}
