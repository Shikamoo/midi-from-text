import { describe, expect, it } from 'vitest';
import {
  extractJsonFromString,
  repairMusicPlanRaw,
  tryNormalizeMusicPlan,
  formatZodValidationErrors,
  normalizeBoundarySemantics,
} from './schemaDebug';
import { MusicPlanSchema, MusicPlanBoundarySchema, BOUNDARY_SEMANTIC_DEFAULTS } from './schema';
import { MOCK_PLANNER_PLAN_RAW } from './__fixtures__/mockPlannerPlan';

describe('extractJsonFromString', () => {
  it('parses plain JSON objects', () => {
    const result = extractJsonFromString('{"prompt":"test","tempoBpm":120}');
    expect(result?.value).toEqual({ prompt: 'test', tempoBpm: 120 });
  });

  it('parses JSON inside markdown fences', () => {
    const result = extractJsonFromString('```json\n{"prompt":"x"}\n```');
    expect(result?.value).toEqual({ prompt: 'x' });
  });

  it('parses double-encoded JSON strings', () => {
    const inner = JSON.stringify({ prompt: 'nested' });
    const result = extractJsonFromString(JSON.stringify(inner));
    expect(result?.value).toEqual({ prompt: 'nested' });
    expect(result?.action).toMatch(/double-encoded/);
  });
});

describe('repairMusicPlanRaw', () => {
  it('strips unknown fields and fills defaults', () => {
    const { repaired, actions } = repairMusicPlanRaw(
      { ...MOCK_PLANNER_PLAN_RAW, extraField: 'remove-me', mood: 'dark' },
      'fallback prompt',
    );
    expect(repaired).not.toHaveProperty('extraField');
    expect(repaired.mood).toEqual(['dark']);
    expect(actions.some((a) => a.includes('stripped unknown fields'))).toBe(true);
  });

  it('coerces fuzzy texture enum values', () => {
    const { repaired, actions } = repairMusicPlanRaw(
      { ...MOCK_PLANNER_PLAN_RAW, texture: 'melody and chords' },
      MOCK_PLANNER_PLAN_RAW.prompt,
    );
    expect(repaired.texture).toBe('melody+chords');
    expect(actions.some((a) => a.includes('coerced texture'))).toBe(true);
  });
});

describe('normalizeBoundarySemantics', () => {
  it('injects defaults for empty semantic strings', () => {
    const { normalized, injectedDefaults, actions } = normalizeBoundarySemantics({
      prompt: 'test',
      style: '',
      scaleType: '   ',
      motifShape: null,
      articulation: '',
      dynamics: '',
    });

    expect(normalized.style).toBe('generic');
    expect(normalized.scaleType).toBe('major');
    expect(normalized.motifShape).toBe('undulating');
    expect(normalized.articulation).toBe('legato');
    expect(normalized.dynamics).toBe('medium');
    expect(injectedDefaults).toEqual({
      style: 'generic',
      scaleType: 'major',
      motifShape: 'undulating',
      articulation: 'legato',
      dynamics: 'medium',
      mood: ['neutral'],
    });
    expect(actions.length).toBe(6);
  });

  it('injects mood default for empty array', () => {
    const { normalized, injectedDefaults } = normalizeBoundarySemantics({
      prompt: 'test',
      mood: [],
    });

    expect(normalized.mood).toEqual(['neutral']);
    expect(injectedDefaults.mood).toEqual(['neutral']);
  });
});

describe('MusicPlanBoundarySchema', () => {
  it('accepts empty semantic strings that strict schema rejects', () => {
    const boundary = MusicPlanBoundarySchema.safeParse({
      ...MOCK_PLANNER_PLAN_RAW,
      style: '',
      scaleType: '',
      motifShape: '',
      articulation: '',
      dynamics: '',
      mood: [],
    });
    expect(boundary.success).toBe(true);

    const strict = MusicPlanSchema.safeParse(boundary.success ? boundary.data : {});
    expect(strict.success).toBe(false);
  });
});

describe('tryNormalizeMusicPlan', () => {
  it('repairs near-valid planner JSON before strict validation', () => {
    const result = tryNormalizeMusicPlan(
      {
        ...MOCK_PLANNER_PLAN_RAW,
        meter: '7/8',
        texture: 'Melody+Chords',
        registerBias: 'WIDE',
      },
      MOCK_PLANNER_PLAN_RAW.prompt,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.meter).toBe('4/4');
      expect(result.plan.texture).toBe('melody+chords');
      expect(result.plan.registerBias).toBe('wide');
    }
  });

  it('accepts empty boundary strings and produces strict internal defaults', () => {
    const result = tryNormalizeMusicPlan(
      {
        ...MOCK_PLANNER_PLAN_RAW,
        style: '',
        scaleType: '',
        motifShape: '',
        articulation: '',
        dynamics: '',
        mood: [],
      },
      MOCK_PLANNER_PLAN_RAW.prompt,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.style).toBe(BOUNDARY_SEMANTIC_DEFAULTS.style);
      expect(result.plan.scaleType).toBe(BOUNDARY_SEMANTIC_DEFAULTS.scaleType);
      expect(result.plan.mood).toEqual([...BOUNDARY_SEMANTIC_DEFAULTS.mood]);
      expect(result.debug.injectedDefaults?.style).toBe('generic');
      expect(result.debug.injectedDefaults?.mood).toEqual(['neutral']);
    }
  });

  it('does not regress on already-valid outputs', () => {
    const result = tryNormalizeMusicPlan(MOCK_PLANNER_PLAN_RAW, MOCK_PLANNER_PLAN_RAW.prompt);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan.style).toBe('cinematic ambient orchestral');
      expect(result.plan.mood).toEqual(['dark', 'floating', 'tense']);
      expect(result.debug.injectedDefaults).toBeUndefined();
    }
  });

  it('returns readable validation errors when non-semantic validation fails', () => {
    const result = tryNormalizeMusicPlan(
      { ...MOCK_PLANNER_PLAN_RAW, prompt: 123 },
      MOCK_PLANNER_PLAN_RAW.prompt,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.debug.validationErrors?.length).toBeGreaterThan(0);
      expect(result.debug.primaryFailureField).toBeDefined();
    }
  });

  it('parses JSON-like string responses', () => {
    const json = JSON.stringify({ ...MOCK_PLANNER_PLAN_RAW, texture: 'polyphonic' });
    const result = tryNormalizeMusicPlan(json, MOCK_PLANNER_PLAN_RAW.prompt);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.texture).toBe('polyphonic');
  });
});

describe('formatZodValidationErrors', () => {
  it('lists field paths and picks the primary failure field', () => {
    const parsed = MusicPlanSchema.safeParse({ prompt: '', mood: [] });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const formatted = formatZodValidationErrors(parsed.error);
      expect(formatted.messages.length).toBeGreaterThan(0);
      expect(formatted.primaryField).toBeDefined();
    }
  });
});
