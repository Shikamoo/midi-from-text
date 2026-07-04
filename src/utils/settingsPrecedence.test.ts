/**
 * settingsPrecedence.test.ts
 *
 * Tests for the source-of-truth precedence rule:
 *   prompt values < settings overrides
 *
 * Three scenarios are verified:
 *   1. Prompt-only  — no settings override; prompt-extracted values are used.
 *   2. Settings-only — no prompt value; settings default/override is used.
 *   3. Both present  — settings override wins over the prompt-extracted value.
 */
import { describe, expect, it } from 'vitest';
import { promptToPlan, type PlanHardOverrides } from './promptToPlan';
import { parseMusicInput } from './parseMusicInput';
import { generateMusic, DEFAULT_CONFIG } from './musicEngine';
import type { MusicConfig } from '../types/music';

// ─── promptToPlan level ─────────────────────────────────────────────────────

describe('promptToPlan — precedence', () => {
  // 1. Prompt-only: no hard overrides → extracted prompt values win
  describe('prompt-only (no settings override)', () => {
    it('uses BPM from prompt when no hard override is set', () => {
      const { plan } = promptToPlan('jazz piano 90 BPM 4 bars');
      expect(plan.tempo).toBe(90);
    });

    it('uses key from prompt when no hard override is set', () => {
      const { plan } = promptToPlan('F minor 8 bars piano');
      expect(plan.key).toBe('F');
      expect(plan.mode).toBe('minor');
    });

    it('uses bars from prompt when no hard override is set', () => {
      const { plan } = promptToPlan('8 bars synth lead 120 BPM');
      expect(plan.bars).toBe(8);
    });

    it('uses time signature from prompt when no hard override is set', () => {
      const { plan } = promptToPlan('waltz 3/4 120 BPM');
      expect(plan.beatsPerBar).toBe(3);
    });
  });

  // 2. Settings-only: hard overrides for fields that prompt does not mention
  describe('settings-only (no prompt value for these fields)', () => {
    it('uses settings BPM as default when prompt has no BPM', () => {
      const { plan } = promptToPlan(
        'calm piano melody',   // no BPM in prompt
        { tempo: 75 },         // settings default
      );
      expect(plan.tempo).toBe(75);
    });

    it('uses settings key as default when prompt has no key', () => {
      const { plan } = promptToPlan(
        'energetic synth lead',  // no key in prompt
        { key: 'D', mode: 'major' },
      );
      expect(plan.key).toBe('D');
      expect(plan.mode).toBe('major');
    });

    it('uses settings bars as default when prompt has no bar count', () => {
      const { plan } = promptToPlan(
        'funky groove piano',  // no bars in prompt
        { bars: 16 },
      );
      expect(plan.bars).toBe(16);
    });
  });

  // 3. Both present: settings hard override wins over prompt-extracted value
  describe('both present — settings win', () => {
    it('settings BPM overrides prompt BPM', () => {
      const hardOverrides: PlanHardOverrides = { tempo: 130 };
      const { plan, assumptions } = promptToPlan(
        'funky groove 90 BPM',   // prompt says 90
        {},
        hardOverrides,           // settings say 130
      );
      expect(plan.tempo).toBe(130);
      // An assumption should note the override
      const tempoAssumption = assumptions.find((a) => a.field === 'tempo');
      expect(tempoAssumption?.source).toBe('settings override');
    });

    it('settings key overrides prompt key', () => {
      const hardOverrides: PlanHardOverrides = { key: 'Bb', mode: 'major' };
      const { plan } = promptToPlan(
        'C minor piano 120 BPM',  // prompt says C minor
        {},
        hardOverrides,            // settings say Bb major
      );
      expect(plan.key).toBe('Bb');
      expect(plan.mode).toBe('major');
    });

    it('settings bars override prompt bars', () => {
      const hardOverrides: PlanHardOverrides = { bars: 4 };
      const { plan } = promptToPlan(
        '16 bars epic orchestral',  // prompt says 16
        {},
        hardOverrides,              // settings say 4
      );
      expect(plan.bars).toBe(4);
    });

    it('settings time signature overrides prompt time signature', () => {
      const hardOverrides: PlanHardOverrides = { beatsPerBar: 3, beatValue: 4 };
      const { plan } = promptToPlan(
        'march 4/4 120 BPM',  // prompt says 4/4
        {},
        hardOverrides,        // settings say 3/4
      );
      expect(plan.beatsPerBar).toBe(3);
    });

    it('settings instrument overrides prompt instrument', () => {
      const hardOverrides: PlanHardOverrides = { instrument: 40 }; // Violin
      const { plan } = promptToPlan(
        'piano melody 120 BPM',  // prompt implies piano (0)
        {},
        hardOverrides,           // settings say violin (40)
      );
      expect(plan.instrument).toBe(40);
    });

    it('only overrides the explicitly set fields — unset fields still use prompt values', () => {
      const hardOverrides: PlanHardOverrides = { tempo: 100 }; // only BPM overridden
      const { plan } = promptToPlan(
        'F minor 8 bars piano 120 BPM',
        {},
        hardOverrides,
      );
      // BPM: settings win (100, not prompt's 120)
      expect(plan.tempo).toBe(100);
      // Key: no override, prompt value used
      expect(plan.key).toBe('F');
      expect(plan.mode).toBe('minor');
      // Bars: no override, prompt value used
      expect(plan.bars).toBe(8);
    });
  });
});

// ─── parseMusicInput level ───────────────────────────────────────────────────

describe('parseMusicInput — settingsOverrides precedence', () => {
  it('prompt-only: uses BPM from prompt text', () => {
    const result = parseMusicInput('C major 90 BPM 4 bars piano', {
      bpm: 120, // config default
    });
    // Without settingsOverrides, promptToPlan extracts 90 from the prompt
    expect(result.musicPlan?.tempo).toBe(90);
  });

  it('settings override: settings BPM wins over prompt BPM', () => {
    const result = parseMusicInput('C major 90 BPM 4 bars piano', {
      bpm: 120,
      settingsOverrides: { tempo: 130 }, // user explicitly set 130
    });
    expect(result.musicPlan?.tempo).toBe(130);
  });

  it('settings override: settings key wins over prompt key', () => {
    const result = parseMusicInput('F minor piano 4 bars 120 BPM', {
      key: 'C',
      settingsOverrides: { key: 'G', mode: 'major' },
    });
    expect(result.musicPlan?.key).toBe('G');
    expect(result.musicPlan?.mode).toBe('major');
  });
});

// ─── generateMusic level ─────────────────────────────────────────────────────

describe('generateMusic — settingsOverrides precedence', () => {
  const BASE: MusicConfig = {
    ...DEFAULT_CONFIG,
    mode: 'prompt',
    promptText: 'D minor 90 BPM 4 bars piano',
  };

  it('prompt-only: generates at BPM extracted from prompt', () => {
    const result = generateMusic(BASE);
    expect(result.data).not.toBeNull();
    // The MIDI data should reflect what promptToPlan extracted
    expect(result.data?.bpm).toBe(90);
  });

  it('settings override: generates at BPM from settingsOverrides, ignoring prompt', () => {
    const result = generateMusic(BASE, { settingsOverrides: { tempo: 140 } });
    expect(result.data).not.toBeNull();
    expect(result.data?.bpm).toBe(140);
  });

  it('settings override: generates in key from settingsOverrides, ignoring prompt', () => {
    const result = generateMusic(BASE, { settingsOverrides: { key: 'E', mode: 'major' } });
    expect(result.data).not.toBeNull();
    expect(result.data?.key).toBe('E');
    expect(result.data?.mode).toBe('major');
  });

  it('settings override: generates with bars from settingsOverrides, ignoring prompt', () => {
    const promptWith4Bars: MusicConfig = { ...BASE, promptText: '8 bars D minor piano 120 BPM' };
    const result = generateMusic(promptWith4Bars, { settingsOverrides: { bars: 2 } });
    expect(result.data).not.toBeNull();
    expect(result.data?.bars).toBe(2);
  });
});
