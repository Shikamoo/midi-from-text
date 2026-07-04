/**
 * musicEngine.ts
 *
 * Commits the shared parseMusicInput pipeline — no secondary regeneration.
 */

import type { MusicConfig, MusicData } from '../types/music';
import { parseMusicInput, parseResultToMusicData, type PromptPlanOverride, type PlanHardOverrides } from './parseMusicInput';
import { scoreFingerprint } from './scoreVerification';
import { DEFAULT_HARMONY_GENERATION, harmonyGenerationFromConfig } from './harmonySettings';
import { DEFAULT_MELODY_DENSITY } from './melodySettings';

export const DEFAULT_CONFIG: MusicConfig = {
  mode: 'prompt',
  promptText: '',
  notesText: '',
  bpm: 120,
  key: 'C',
  musicalMode: 'major',
  beatsPerBar: 4,
  beatValue: 4,
  bars: 4,
  instrument: 0,
  harmonyVoicingWidth: DEFAULT_HARMONY_GENERATION.voicingWidth,
  harmonyAllowInversions: DEFAULT_HARMONY_GENERATION.allowInversions,
  harmonyChordComplexity: DEFAULT_HARMONY_GENERATION.chordComplexity,
  harmonyBassDoubling: DEFAULT_HARMONY_GENERATION.bassDoubling,
  harmonyChordDensity: DEFAULT_HARMONY_GENERATION.chordDensity,
  harmonyCadenceStrength: DEFAULT_HARMONY_GENERATION.cadenceStrength,
  melodyDensity: DEFAULT_MELODY_DENSITY,
};

export interface EngineResult {
  data: MusicData | null;
  error: string | null;
  warnings: string[];
  /** Fingerprint of the committed ParsedScore — compare to live preview for sync */
  committedFingerprint: string | null;
}

/** Optional planner output — when set, prompt mode skips rule-based promptToPlan. */
export interface GenerateMusicOptions {
  promptPlanOverride?: PromptPlanOverride;
  /** Settings fields explicitly set by the user — override prompt-parsed values. */
  settingsOverrides?: PlanHardOverrides;
}

export function generateMusic(
  rawConfig: MusicConfig,
  options: GenerateMusicOptions = {},
): EngineResult {
  const text = rawConfig.mode === 'prompt' ? rawConfig.promptText : rawConfig.notesText;

  if (!text.trim()) {
    return {
      data: null,
      error: rawConfig.mode === 'prompt'
        ? 'Prompt is empty. Describe the music you want, or switch to Notes mode.'
        : 'Notes input is empty. Enter some notes or switch to Prompt mode.',
      warnings: [],
      committedFingerprint: null,
    };
  }

  const input = parseMusicInput(text, {
    bpm: rawConfig.bpm,
    key: rawConfig.key,
    mode: rawConfig.musicalMode,
    beatsPerBar: rawConfig.beatsPerBar,
    beatValue: rawConfig.beatValue,
    bars: rawConfig.bars,
    instrument: rawConfig.instrument,
    harmonyGeneration: harmonyGenerationFromConfig(rawConfig),
    melodyDensity: rawConfig.melodyDensity,
    promptPlanOverride: options.promptPlanOverride,
    settingsOverrides: options.settingsOverrides,
  });

  if (input.hasErrors) {
    const errors = input.issues.filter((i) => i.severity === 'error').map((i) => i.message);
    return {
      data: null,
      error: errors.join('\n') || 'Parse failed.',
      warnings: input.issues.filter((i) => i.severity === 'warning').map((i) => i.message),
      committedFingerprint: null,
    };
  }

  if (!input.parsedScore || !input.canExport) {
    return {
      data: null,
      error: 'No valid score to export.',
      warnings: input.issues.filter((i) => i.severity === 'warning').map((i) => i.message),
      committedFingerprint: null,
    };
  }

  const data = parseResultToMusicData(input);
  if (!data) {
    return {
      data: null,
      error: 'Failed to build export data from parsed score.',
      warnings: [],
      committedFingerprint: null,
    };
  }

  const warnings = [
    ...input.issues.filter((i) => i.severity === 'warning').map((i) => i.message),
    ...input.issues.filter((i) => i.severity === 'info' && i.stage === 'plan').map((i) => i.message),
  ];

  return {
    data,
    error: null,
    warnings,
    committedFingerprint: scoreFingerprint(input.parsedScore),
  };
}

export function musicSummary(data: MusicData): string {
  const totalNotes = data.tracks.reduce((sum, t) => sum + t.notes.length, 0);
  return (
    `${data.bpm} BPM · ${data.key} ${data.mode} · ` +
    `${data.beatsPerBar}/${data.beatValue} · ${data.bars} bars · ${totalNotes} events`
  );
}
