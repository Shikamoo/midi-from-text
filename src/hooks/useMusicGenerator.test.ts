/**
 * Generation state-machine tests.
 *
 * These tests cover the core invariants the hook enforces without requiring a
 * React renderer:
 *  - success always clears loading (status → 'ready', data non-null)
 *  - error always clears loading   (status → 'error', error message set)
 *  - timeout clears loading        (AbortController aborts fetch, status → 'timeout')
 *  - second generate supersedes first (stale results via AbortSignal)
 *
 * Because the test environment is Node (no DOM/jsdom), we test the underlying
 * utility functions that the hook composes rather than the hook itself.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { generateMusic, DEFAULT_CONFIG } from '../utils/musicEngine';
import { planFromPromptAsync } from '../planner/planFromPrompt';
import { fetchMusicPlan } from '../utils/localPlanner/client';
import type { MusicConfig } from '../types/music';

// ─── Helpers ────────────────────────────────────────────────────────────────

const NOTES_CONFIG: MusicConfig = {
  ...DEFAULT_CONFIG,
  mode: 'notes',
  notesText: 'C4 q, D4 q, E4 q, F4 q | G4 q, A4 q, B4 q, C5 q',
};

const EMPTY_CONFIG: MusicConfig = {
  ...DEFAULT_CONFIG,
  mode: 'notes',
  notesText: '',
};

// ─── generateMusic: success clears loading ──────────────────────────────────

describe('generateMusic — success', () => {
  it('returns non-null data and null error on valid input', () => {
    const result = generateMusic(NOTES_CONFIG, {});
    // Loading state would transition 'generating' → 'ready'.
    expect(result.data).not.toBeNull();
    expect(result.error).toBeNull();
    expect(result.committedFingerprint).toBeTruthy();
  });
});

// ─── generateMusic: error clears loading ────────────────────────────────────

describe('generateMusic — error', () => {
  it('returns null data and non-null error on empty/invalid input', () => {
    const result = generateMusic(EMPTY_CONFIG, {});
    // Loading state would transition 'generating' → 'error'.
    expect(result.data).toBeNull();
    expect(result.error).not.toBeNull();
  });
});

// ─── fetchMusicPlan: abort signal respected ─────────────────────────────────

describe('fetchMusicPlan — abort signal', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns unavailable when signal is already aborted', async () => {
    // Mock a fetch that rejects immediately when the signal is already aborted,
    // or waits for the abort event otherwise — mirrors browser fetch() semantics.
    globalThis.fetch = vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
      if (opts?.signal?.aborted) {
        return Promise.reject(new DOMException('Aborted', 'AbortError'));
      }
      return new Promise((_resolve, reject) => {
        opts?.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    }) as unknown as typeof fetch;

    const controller = new AbortController();
    controller.abort(); // abort immediately — simulates timeout firing before fetch resolves

    const result = await fetchMusicPlan({ prompt: 'jazz piano', bars: 4 }, controller.signal);

    // When aborted, the catch block maps it to 'unavailable' so generation falls
    // back to rule-based planning — it never leaves loading stuck.
    expect(result.status).toBe('unavailable');
    expect(result.plan).toBeNull();
  });

  it('returns a plan when fetch succeeds (no abort)', async () => {
    const mockPlan = {
      style: 'jazz',
      tempoBpm: 110,
      key: 'C',
      mode: 'major',
      timeSignature: '4/4',
      bars: 4,
      instruments: [{ role: 'melody', midiProgram: 0, octave: 4, dynamics: 'mp' }],
      melody: [],
      harmony: [],
      rhythm: { pattern: 'swing', swingRatio: 0.6, subdivision: 8 },
      structure: { intro: 0, verse: 4, chorus: 0, bridge: 0, outro: 0 },
      dynamics: { overall: 'mp', crescendo: [], accent: [] },
      articulation: { legato: false, staccato: false, accent: false },
      development: { motif: '', variation: '', climax: 0, resolution: 0 },
      texture: 'sparse',
      expressiveness: 0.5,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, source: 'ollama', plan: mockPlan, model: 'test' }),
    }) as unknown as typeof fetch;

    const result = await fetchMusicPlan({ prompt: 'jazz piano', bars: 4 });
    expect(result.status).toBe('ready');
    expect(result.plan).not.toBeNull();
  });
});

// ─── planFromPromptAsync: timeout / abort propagation ───────────────────────

describe('planFromPromptAsync — abort propagation', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('falls back to rule-based result when signal aborts during fetch', async () => {
    // Simulate a hung fetch that resolves only after the abort signal fires.
    globalThis.fetch = vi.fn().mockImplementation((_url: string, opts?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        opts?.signal?.addEventListener('abort', () => {
          reject(new DOMException('AbortError', 'AbortError'));
        });
        // Never resolves on its own — simulates a stalled server.
      });
    }) as unknown as typeof fetch;

    const controller = new AbortController();
    // Abort after a tiny delay to let the async path start.
    setTimeout(() => controller.abort(), 10);

    const result = await planFromPromptAsync('100 BPM jazz piano 4 bars', {
      useLocalPlanner: true,
      signal: controller.signal,
    });

    // fetchMusicPlan catches the AbortError and returns { status: 'unavailable', plan: null }.
    // planFromPromptAsync then falls back to rule-based planning — it never hangs.
    expect(result.source).toBe('rules');
    expect(result.plan).not.toBeNull();
  });
});

// ─── Second generate supersedes first (stale-result guard) ──────────────────

describe('stale-result guard', () => {
  it('aborting a controller while a second is active does not affect second result', async () => {
    const controller1 = new AbortController();
    const controller2 = new AbortController();

    const firstFetchPromise = new Promise<void>(() => {
      // Intentionally pending — first request waits until aborted.
    });

    let firstFetchCalled = false;
    let secondFetchCalled = false;

    globalThis.fetch = vi.fn()
      .mockImplementationOnce(async (_url: string, opts?: RequestInit) => {
        firstFetchCalled = true;
        // Wait until explicitly resolved or aborted.
        await new Promise<void>((resolve, reject) => {
          firstFetchPromise.then(resolve);
          opts?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')));
        });
        return { ok: true, json: async () => ({ ok: true, source: 'ollama', plan: null }) };
      })
      .mockImplementationOnce(async () => {
        secondFetchCalled = true;
        return {
          ok: true,
          json: async () => ({ ok: true, source: 'rules', plan: null }),
        };
      }) as unknown as typeof fetch;

    // Fire first request and abort it before resolving.
    const first = fetchMusicPlan({ prompt: 'piano', bars: 4 }, controller1.signal);
    await Promise.resolve(); // yield to let fetch start
    controller1.abort();    // simulate: new generate() aborts the previous

    const firstResult = await first;

    // Fire second request — must not be affected by the first abort.
    const secondResult = await fetchMusicPlan({ prompt: 'piano', bars: 4 }, controller2.signal);

    expect(firstFetchCalled).toBe(true);
    expect(secondFetchCalled).toBe(true);
    expect(firstResult.status).toBe('unavailable'); // aborted → unavailable → hook discards stale result
    expect(secondResult.status).not.toBe('unavailable'); // second is independent
  });
});
