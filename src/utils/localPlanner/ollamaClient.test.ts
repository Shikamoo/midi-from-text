import { describe, expect, it, vi, afterEach } from 'vitest';
import { planWithOllama } from './ollamaClient';
import { MOCK_PLANNER_PLAN_RAW } from './__fixtures__/mockPlannerPlan';

function ollamaChatResponse(content: unknown) {
  return {
    ok: true,
    json: async () => ({
      message: { content: typeof content === 'string' ? content : JSON.stringify(content) },
    }),
  };
}

describe('planWithOllama model repair retry', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('does not retry when first-pass output validates', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      ollamaChatResponse(MOCK_PLANNER_PLAN_RAW),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await planWithOllama({ prompt: 'dark cinematic strings' });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    if (result.ok) {
      expect(result.plan.tempoBpm).toBe(92);
      expect(result.debug?.retryAttempted).toBeUndefined();
    }
  });

  it('does not retry when empty semantic strings are fixed at the boundary', async () => {
    const invalidFirstPass = {
      ...MOCK_PLANNER_PLAN_RAW,
      style: '',
    };

    const fetchMock = vi.fn().mockResolvedValue(
      ollamaChatResponse(invalidFirstPass),
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await planWithOllama({ prompt: 'dark cinematic strings' });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    if (result.ok) {
      expect(result.plan.style).toBe('generic');
      expect(result.debug?.injectedDefaults?.style).toBe('generic');
      expect(result.debug?.retryAttempted).toBeUndefined();
    }
  });

  it('retries once with repair prompt when first-pass strict validation fails', async () => {
    const invalidFirstPass = {
      ...MOCK_PLANNER_PLAN_RAW,
      prompt: 123,
    };

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ollamaChatResponse(invalidFirstPass))
      .mockResolvedValueOnce(ollamaChatResponse(MOCK_PLANNER_PLAN_RAW));
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await planWithOllama({ prompt: 'dark cinematic strings' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.debug?.retryAttempted).toBe(true);
      expect(result.debug?.retrySucceeded).toBe(true);
      expect(result.debug?.retryPromptSize).toBeGreaterThan(0);
      expect(result.debug?.retryRawContent).toContain('"tempoBpm":92');
    }

    const retryBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(retryBody.messages[1]?.content).toMatch(/Return corrected JSON only/i);
    expect(retryBody.messages[1]?.content).toContain('prompt');
  });

  it('returns validation failure after repair retry still fails', async () => {
    const invalidPlan = {
      ...MOCK_PLANNER_PLAN_RAW,
      prompt: 123,
    };

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(ollamaChatResponse(invalidPlan))
      .mockResolvedValueOnce(ollamaChatResponse(invalidPlan));
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await planWithOllama({ prompt: 'dark cinematic strings' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('validation');
      expect(result.debug?.retryAttempted).toBe(true);
      expect(result.debug?.retrySucceeded).toBe(false);
      expect(result.debug?.retryRawContent).toBeDefined();
      expect(result.error).toMatch(/model repair retry/i);
    }
  });

  it('does not retry on connection errors', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => 'down' });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await planWithOllama({ prompt: 'test' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('connection');
  });
});
