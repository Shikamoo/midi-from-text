import type { MusicConfig } from '../types/music';
import { DEFAULT_CONFIG } from './musicEngine';
import { parsePrompt } from './promptParser';

/** Config fields that parsePrompt can extract — eligible for auto-populate and override tracking. */
export const PROMPT_POPULATABLE_FIELDS = [
  'bpm',
  'key',
  'musicalMode',
  'beatsPerBar',
  'beatValue',
  'bars',
  'instrument',
] as const;

export type PromptPopulatableField = (typeof PROMPT_POPULATABLE_FIELDS)[number];

export function isPromptPopulatableField(field: string): field is PromptPopulatableField {
  return (PROMPT_POPULATABLE_FIELDS as readonly string[]).includes(field);
}

/** Restore one settings field from parsed prompt text, or DEFAULT_CONFIG when absent. */
export function applyRelinkField(
  patch: Partial<MusicConfig>,
  field: PromptPopulatableField,
  parsed: Partial<MusicConfig>,
): void {
  switch (field) {
    case 'bpm':
      patch.bpm = parsed.bpm !== undefined ? parsed.bpm : DEFAULT_CONFIG.bpm;
      break;
    case 'key':
      patch.key = parsed.key !== undefined ? parsed.key : DEFAULT_CONFIG.key;
      break;
    case 'musicalMode':
      patch.musicalMode =
        parsed.musicalMode !== undefined ? parsed.musicalMode : DEFAULT_CONFIG.musicalMode;
      break;
    case 'beatsPerBar':
      patch.beatsPerBar =
        parsed.beatsPerBar !== undefined ? parsed.beatsPerBar : DEFAULT_CONFIG.beatsPerBar;
      break;
    case 'beatValue':
      patch.beatValue =
        parsed.beatValue !== undefined ? parsed.beatValue : DEFAULT_CONFIG.beatValue;
      break;
    case 'bars':
      patch.bars = parsed.bars !== undefined ? parsed.bars : DEFAULT_CONFIG.bars;
      break;
    case 'instrument':
      patch.instrument =
        parsed.instrument !== undefined ? parsed.instrument : DEFAULT_CONFIG.instrument;
      break;
  }
}

export function clearManualOverride(
  overrides: Partial<Record<PromptPopulatableField, boolean>>,
  field: PromptPopulatableField,
): void {
  delete overrides[field];
}

export function markManualOverridesFromPatch(
  overrides: Partial<Record<PromptPopulatableField, boolean>>,
  patch: Partial<MusicConfig>,
): void {
  for (const field of PROMPT_POPULATABLE_FIELDS) {
    if (patch[field] !== undefined) {
      overrides[field] = true;
    }
  }
}

/**
 * Pure simulation of relinkField state update — mirrors useMusicGenerator.relinkField.
 */
export function simulateRelinkFields(
  fields: readonly PromptPopulatableField[],
  promptText: string,
  currentOverrides: Partial<Record<PromptPopulatableField, boolean>>,
): {
  configPatch: Partial<MusicConfig>;
  newOverrides: Partial<Record<PromptPopulatableField, boolean>>;
} {
  const parsed: Partial<MusicConfig> = promptText.trim() ? parsePrompt(promptText) : {};
  const newOverrides = { ...currentOverrides };
  const configPatch: Partial<MusicConfig> = {};

  for (const field of fields) {
    clearManualOverride(newOverrides, field);
    applyRelinkField(configPatch, field, parsed);
  }

  return { configPatch, newOverrides };
}
