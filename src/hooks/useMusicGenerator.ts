/**
 * useMusicGenerator.ts
 *
 * Commits parseMusicInput results on Generate — export uses the same ParsedScore.
 */

import { useState, useCallback } from 'react';
import type { MusicConfig, MusicData, GenerationStatus } from '../types/music';
import { generateMusic, DEFAULT_CONFIG } from '../utils/musicEngine';
import { parsePrompt } from '../utils/promptParser';

export interface MusicGeneratorState {
  config: MusicConfig;
  status: GenerationStatus;
  musicData: MusicData | null;
  error: string | null;
  warnings: string[];
  committedFingerprint: string | null;
}

export function useMusicGenerator() {
  const [state, setState] = useState<MusicGeneratorState>({
    config: { ...DEFAULT_CONFIG },
    status: 'idle',
    musicData: null,
    error: null,
    warnings: [],
    committedFingerprint: null,
  });

  const updateConfig = useCallback((patch: Partial<MusicConfig>) => {
    setState((prev) => ({
      ...prev,
      config: { ...prev.config, ...patch },
      status: 'idle',
      musicData: null,
      error: null,
      warnings: [],
      committedFingerprint: null,
    }));
  }, []);

  const generate = useCallback(() => {
    setState((prev) => ({ ...prev, status: 'generating' }));

    setTimeout(() => {
      setState((prev) => {
        const result = generateMusic(prev.config);

        if (result.error || !result.data) {
          return {
            ...prev,
            status: 'error',
            musicData: null,
            error: result.error ?? 'Unknown error',
            warnings: result.warnings,
            committedFingerprint: null,
          };
        }

        return {
          ...prev,
          status: 'ready',
          musicData: result.data,
          error: null,
          warnings: result.warnings,
          committedFingerprint: result.committedFingerprint,
        };
      });
    }, 0);
  }, []);

  const reset = useCallback(() => {
    setState((prev) => ({
      ...prev,
      status: 'idle',
      musicData: null,
      error: null,
      warnings: [],
      committedFingerprint: null,
    }));
  }, []);

  const promptDetectionSummary = useCallback((): string => {
    if (state.config.mode !== 'prompt' || !state.config.promptText.trim()) return '';
    const detected = parsePrompt(state.config.promptText);
    const parts: string[] = [];
    if (detected.bpm) parts.push(`${detected.bpm} BPM`);
    if (detected.key) parts.push(`${detected.key} ${detected.musicalMode ?? ''}`);
    if (detected.bars) parts.push(`${detected.bars} bars`);
    if (detected.beatsPerBar) parts.push(`${detected.beatsPerBar}/${detected.beatValue}`);
    if (detected.instrument !== undefined) parts.push(`instrument #${detected.instrument}`);
    return parts.length ? `Detected in prompt: ${parts.join(' · ')}` : '';
  }, [state.config.mode, state.config.promptText]);

  return {
    ...state,
    updateConfig,
    generate,
    reset,
    promptDetectionSummary,
  };
}
