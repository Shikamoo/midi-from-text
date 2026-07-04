import { describe, expect, it } from 'vitest';
import {
  MusicPlanSchema,
  MusicPlanBoundarySchema,
  normalizeMusicPlan,
  clampMusicPlan,
  defaultMusicPlan,
  BOUNDARY_SEMANTIC_DEFAULTS,
} from './schema';
import { mapToGeneratorPlan } from './mapToGeneratorPlan';
import { fallbackMusicPlan } from './fallbackPlan';
import { MOCK_PLANNER_PLAN_RAW } from './__fixtures__/mockPlannerPlan';

describe('MusicPlanSchema', () => {
  it('validates a complete mock planner response', () => {
    expect(MusicPlanSchema.safeParse(MOCK_PLANNER_PLAN_RAW).success).toBe(true);
  });

  it('boundary schema accepts empty style that strict schema rejects', () => {
    const payload = { ...MOCK_PLANNER_PLAN_RAW, style: '' };
    expect(MusicPlanBoundarySchema.safeParse(payload).success).toBe(true);
    expect(MusicPlanSchema.safeParse(payload).success).toBe(false);
  });

  it('normalizes empty style to generic via boundary pipeline', () => {
    const plan = normalizeMusicPlan({ ...MOCK_PLANNER_PLAN_RAW, style: '' }, 'test');
    expect(plan.style).toBe(BOUNDARY_SEMANTIC_DEFAULTS.style);
  });

  it('clamps tempoBpm to 40..220', () => {
    const plan = normalizeMusicPlan({ ...MOCK_PLANNER_PLAN_RAW, tempoBpm: 300 }, 'test');
    expect(plan.tempoBpm).toBe(220);
  });

  it('clamps phraseBars and totalBars', () => {
    const plan = normalizeMusicPlan({
      ...MOCK_PLANNER_PLAN_RAW,
      phraseBars: 99,
      totalBars: 200,
    }, 'test');
    expect(plan.phraseBars).toBeLessThanOrEqual(16);
    expect(plan.totalBars).toBeLessThanOrEqual(64);
  });

  it('applies defaults via defaultMusicPlan', () => {
    const plan = defaultMusicPlan('playful synth');
    expect(plan.prompt).toBe('playful synth');
    expect(plan.meter).toBe('4/4');
    expect(plan.mood.length).toBeGreaterThan(0);
  });

  it('rejects invalid meter via normalize fallback', () => {
    const plan = normalizeMusicPlan({ ...MOCK_PLANNER_PLAN_RAW, meter: '7/8' }, 'test');
    expect(plan.meter).toBe('4/4');
  });

  it('normalizes mood string to array', () => {
    const plan = normalizeMusicPlan({ prompt: 'x', mood: 'dark' }, 'x');
    expect(plan.mood).toEqual(['dark']);
  });
});

describe('mapToGeneratorPlan', () => {
  it('maps planner output to generator MusicPlan', () => {
    const planner = normalizeMusicPlan(MOCK_PLANNER_PLAN_RAW, MOCK_PLANNER_PLAN_RAW.prompt);
    const { plan } = mapToGeneratorPlan(planner);
    expect(plan.tempo).toBe(92);
    expect(plan.key).toBe('D');
    expect(plan.mode).toBe('minor');
    expect(plan.bars).toBe(8);
  });
});

describe('fallbackMusicPlan', () => {
  it('derives a planner plan from rule-based parser', () => {
    const plan = fallbackMusicPlan('100 BPM C major melody', 4);
    expect(plan.tempoBpm).toBe(100);
    expect(plan.keyCenter).toBe('C');
    expect(plan.totalBars).toBe(4);
  });
});

describe('clampMusicPlan', () => {
  it('clamps numeric dimensions to 0..1', () => {
    const base = defaultMusicPlan('test');
    const clamped = clampMusicPlan({ ...base, rhythmDensity: 2, syncopation: -1 });
    expect(clamped.rhythmDensity).toBe(1);
    expect(clamped.syncopation).toBe(0);
  });
});
