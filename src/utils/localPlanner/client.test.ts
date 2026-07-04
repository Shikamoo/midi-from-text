import { describe, expect, it, vi, afterEach } from 'vitest';
import { planFromPromptAsync } from '../../planner/planFromPrompt';
import { MOCK_PLANNER_PLAN_RAW } from './__fixtures__/mockPlannerPlan';

describe('planner client fallback', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it('uses ollama plan when API succeeds', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        source: 'ollama',
        plan: MOCK_PLANNER_PLAN_RAW,
        model: 'llama3.1:8b',
      }),
    }) as unknown as typeof fetch;

    const result = await planFromPromptAsync('dark cinematic strings', { useLocalPlanner: true });
    expect(result.source).toBe('ollama');
    expect(result.llmPlan?.tempoBpm).toBe(92);
    expect(result.plan.tempo).toBe(92);
  });

  it('uses API fallback plan when ollama fails server-side', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        source: 'fallback',
        plan: MOCK_PLANNER_PLAN_RAW,
        warning: 'Ollama unavailable',
      }),
    }) as unknown as typeof fetch;

    const result = await planFromPromptAsync('dark cinematic strings', { useLocalPlanner: true });
    expect(result.source).toBe('fallback');
    expect(result.llmPlan?.tempoBpm).toBe(92);
    expect(result.plannerMessage).toMatch(/unavailable/i);
  });

  it('falls back to rule-based parser when fetch fails', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as typeof fetch;

    const result = await planFromPromptAsync('100 BPM C major melody', { useLocalPlanner: true });
    expect(result.source).toBe('rules');
    expect(result.plan.tempo).toBe(100);
    expect(result.llmPlan).toBeNull();
  });
});
