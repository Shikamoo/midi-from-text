/**
 * relinkField.test.ts
 *
 * Tests for the per-field settings relink behaviour added in useMusicGenerator.
 * The logic is: remove the field from manualSettingsOverrides, then apply the
 * value the current prompt provides (if any) — otherwise fall back to DEFAULT_CONFIG.
 *
 * Three scenarios per the requirements:
 *   1. Overridden field relinks to the prompt's extracted value.
 *   2. Overridden field resets to DEFAULT_CONFIG when the prompt provides no value.
 *   3. Unrelated manually-overridden fields are not affected.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../utils/musicEngine';
import {
  simulateRelinkFields,
  type PromptPopulatableField,
} from '../utils/promptPopulatableFields';

// ── Scenario 1: relink to prompt value ───────────────────────────────────────

describe('relinkField — relinks to prompt value when prompt provides one', () => {
  it('restores BPM from prompt after manual override', () => {
    const prompt = '8 bars, C minor, 90 BPM, piano';
    const overrides = { bpm: true };

    const { configPatch, newOverrides } = simulateRelinkFields(['bpm'], prompt, overrides);

    // Prompt says 90 → restored
    expect(configPatch.bpm).toBe(90);
    // Override cleared
    expect(newOverrides.bpm).toBeUndefined();
  });

  it('restores key from prompt after manual override', () => {
    const prompt = 'F minor 4 bars 120 BPM piano';
    const overrides = { key: true, musicalMode: true };

    const { configPatch, newOverrides } = simulateRelinkFields(
      ['key', 'musicalMode'],
      prompt,
      overrides,
    );

    expect(configPatch.key).toBe('F');
    expect(configPatch.musicalMode).toBe('minor');
    expect(newOverrides.key).toBeUndefined();
    expect(newOverrides.musicalMode).toBeUndefined();
  });

  it('restores bars from prompt after manual override', () => {
    const prompt = '8 bars synth lead 140 BPM';
    const overrides = { bars: true };

    const { configPatch, newOverrides } = simulateRelinkFields(['bars'], prompt, overrides);

    expect(configPatch.bars).toBe(8);
    expect(newOverrides.bars).toBeUndefined();
  });

  it('restores time signature (both fields) from prompt after manual override', () => {
    const prompt = '3/4 waltz 120 BPM piano';
    const overrides = { beatsPerBar: true, beatValue: true };

    const { configPatch, newOverrides } = simulateRelinkFields(
      ['beatsPerBar', 'beatValue'],
      prompt,
      overrides,
    );

    expect(configPatch.beatsPerBar).toBe(3);
    expect(configPatch.beatValue).toBe(4);
    expect(newOverrides.beatsPerBar).toBeUndefined();
    expect(newOverrides.beatValue).toBeUndefined();
  });
});

// ── Scenario 2: reset to default when prompt has no value ────────────────────

describe('relinkField — resets to DEFAULT_CONFIG when prompt has no value', () => {
  it('resets BPM to default when prompt has no BPM', () => {
    const prompt = 'calm piano melody'; // no BPM mentioned
    const overrides = { bpm: true };

    const { configPatch, newOverrides } = simulateRelinkFields(['bpm'], prompt, overrides);

    expect(configPatch.bpm).toBe(DEFAULT_CONFIG.bpm); // 120
    expect(newOverrides.bpm).toBeUndefined();
  });

  it('resets key to default when prompt has no key', () => {
    const prompt = 'energetic synth 8 bars'; // no key
    const overrides = { key: true };

    const { configPatch, newOverrides } = simulateRelinkFields(['key'], prompt, overrides);

    expect(configPatch.key).toBe(DEFAULT_CONFIG.key); // 'C'
    expect(newOverrides.key).toBeUndefined();
  });

  it('resets bars to default when prompt has no bar count', () => {
    const prompt = 'dark ambient piano 80 BPM'; // no bars
    const overrides = { bars: true };

    const { configPatch, newOverrides } = simulateRelinkFields(['bars'], prompt, overrides);

    expect(configPatch.bars).toBe(DEFAULT_CONFIG.bars); // 4
    expect(newOverrides.bars).toBeUndefined();
  });

  it('resets musicalMode to default when prompt has no mode keyword', () => {
    const prompt = '4 bars 120 BPM piano'; // no major/minor
    const overrides = { musicalMode: true };

    const { configPatch, newOverrides } = simulateRelinkFields(
      ['musicalMode'],
      prompt,
      overrides,
    );

    expect(configPatch.musicalMode).toBe(DEFAULT_CONFIG.musicalMode); // 'major'
    expect(newOverrides.musicalMode).toBeUndefined();
  });
});

// ── Scenario 3: unrelated overrides are untouched ────────────────────────────

describe('relinkField — unrelated overrides are not affected', () => {
  it('does not clear overrides for fields not being relinked', () => {
    const prompt = 'F minor 90 BPM 8 bars piano';
    // BPM, bars, and instrument are all overridden; we only relink BPM
    const overrides = { bpm: true, bars: true, instrument: true };

    const { configPatch, newOverrides } = simulateRelinkFields(['bpm'], prompt, overrides);

    // BPM relinked to prompt value
    expect(configPatch.bpm).toBe(90);
    expect(newOverrides.bpm).toBeUndefined();

    // bars and instrument overrides untouched
    expect(newOverrides.bars).toBe(true);
    expect(newOverrides.instrument).toBe(true);
    // No patch applied to bars or instrument
    expect(configPatch.bars).toBeUndefined();
    expect(configPatch.instrument).toBeUndefined();
  });

  it('relinking key does not affect BPM override', () => {
    const prompt = 'D minor piano 4 bars'; // no BPM
    const overrides = { key: true, bpm: true };

    const { configPatch, newOverrides } = simulateRelinkFields(
      ['key', 'musicalMode'] satisfies PromptPopulatableField[],
      prompt,
      overrides,
    );

    // key restored from prompt
    expect(configPatch.key).toBe('D');
    expect(configPatch.musicalMode).toBe('minor');
    expect(newOverrides.key).toBeUndefined();
    expect(newOverrides.musicalMode).toBeUndefined();

    // BPM override untouched — not patched
    expect(newOverrides.bpm).toBe(true);
    expect(configPatch.bpm).toBeUndefined();
  });

  it('relinking time signature does not clear other fields', () => {
    const prompt = '3/4 jazz 90 BPM'; // time sig and BPM present
    const overrides = { beatsPerBar: true, beatValue: true, bpm: true, key: true };

    const { configPatch, newOverrides } = simulateRelinkFields(
      ['beatsPerBar', 'beatValue'],
      prompt,
      overrides,
    );

    // Time sig restored
    expect(configPatch.beatsPerBar).toBe(3);
    expect(newOverrides.beatsPerBar).toBeUndefined();
    expect(newOverrides.beatValue).toBeUndefined();

    // BPM and key overrides untouched
    expect(newOverrides.bpm).toBe(true);
    expect(newOverrides.key).toBe(true);
    expect(configPatch.bpm).toBeUndefined();
    expect(configPatch.key).toBeUndefined();
  });
});
