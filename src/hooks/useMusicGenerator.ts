/**
 * useMusicGenerator.ts
 *
 * Commits parseMusicInput results on Generate — export uses the same ParsedScore.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { MusicConfig, MusicData, GenerationStatus } from '../types/music';
import type { LlmMusicPlan, PlannerStatus } from '../types/llmMusicPlan';
import { generateMusic, DEFAULT_CONFIG } from '../utils/musicEngine';
import { parsePrompt } from '../utils/promptParser';
import { planFromPromptAsync } from '../planner/planFromPrompt';
import { checkPlannerHealth } from '../planner/plannerClient';
import { isLocalPlannerEnabled, DEFAULT_PLANNER_SEED, DEFAULT_PLANNER_TEMPERATURE } from '../planner/plannerConfig';
import type { PromptPlanOverride } from '../utils/parseMusicInput';

export interface MusicGeneratorState {
  config: MusicConfig;
  status: GenerationStatus;
  musicData: MusicData | null;
  error: string | null;
  warnings: string[];
  committedFingerprint: string | null;
  useLocalPlanner: boolean;
  plannerStatus: PlannerStatus;
  llmPlan: LlmMusicPlan | null;
  plannerMessage: string | null;
  plannerWarning: string | null;
  plannerSource: 'ollama' | 'fallback' | 'rules' | null;
  plannerModel: string | null;
  plannerSeed: number;
  plannerTemperature: number;
  plannerVariation: number;
  committedPlanOverride: PromptPlanOverride | null;
}

export function useMusicGenerator() {
  const [state, setState] = useState<MusicGeneratorState>({
    config: { ...DEFAULT_CONFIG },
    status: 'idle',
    musicData: null,
    error: null,
    warnings: [],
    committedFingerprint: null,
    useLocalPlanner: isLocalPlannerEnabled(),
    plannerStatus: isLocalPlannerEnabled() ? 'checking' : 'disabled',
    llmPlan: null,
    plannerMessage: null,
    plannerWarning: null,
    plannerSource: null,
    plannerModel: null,
    plannerSeed: DEFAULT_PLANNER_SEED,
    plannerTemperature: DEFAULT_PLANNER_TEMPERATURE,
    plannerVariation: 0,
    committedPlanOverride: null,
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (!state.useLocalPlanner) return;

    let cancelled = false;
    setState((prev) => ({ ...prev, plannerStatus: 'checking' }));

    void checkPlannerHealth().then((status) => {
      if (!cancelled) {
        setState((prev) => ({
          ...prev,
          plannerStatus: status === 'available' ? 'available' : 'unavailable',
        }));
      }
    });

    return () => { cancelled = true; };
  }, [state.useLocalPlanner]);

  const updateConfig = useCallback((patch: Partial<MusicConfig>) => {
    setState((prev) => ({
      ...prev,
      config: { ...prev.config, ...patch },
      status: 'idle',
      musicData: null,
      error: null,
      warnings: [],
      committedFingerprint: null,
      committedPlanOverride: null,
      llmPlan: null,
      plannerMessage: null,
      plannerWarning: null,
      plannerSource: null,
      plannerModel: null,
    }));
  }, []);

  const setUseLocalPlanner = useCallback((enabled: boolean) => {
    setState((prev) => ({
      ...prev,
      useLocalPlanner: enabled,
      plannerStatus: enabled ? 'checking' : 'disabled',
      status: 'idle',
      musicData: null,
      committedFingerprint: null,
      committedPlanOverride: null,
      llmPlan: null,
      plannerMessage: null,
      plannerWarning: null,
      plannerSource: null,
      plannerModel: null,
    }));
  }, []);

  const setPlannerControls = useCallback((patch: {
    seed?: number;
    temperature?: number;
    variation?: number;
  }) => {
    setState((prev) => ({
      ...prev,
      plannerSeed: patch.seed ?? prev.plannerSeed,
      plannerTemperature: patch.temperature ?? prev.plannerTemperature,
      plannerVariation: patch.variation ?? prev.plannerVariation,
    }));
  }, []);

  const generate = useCallback(() => {
    setState((prev) => ({
      ...prev,
      status: 'generating',
      plannerStatus:
        prev.useLocalPlanner && prev.config.mode === 'prompt' ? 'planning' : prev.plannerStatus,
    }));

    void (async () => {
      const snapshot = stateRef.current;
      const usePlanner = snapshot.config.mode === 'prompt' && snapshot.useLocalPlanner;

      let promptPlanOverride: PromptPlanOverride | undefined;
      let llmPlan = snapshot.llmPlan;
      let plannerMessage = snapshot.plannerMessage;
      let plannerWarning: string | null = null;
      let plannerSource: 'ollama' | 'fallback' | 'rules' | null = null;
      let plannerModel: string | null = null;
      let plannerStatus: PlannerStatus = snapshot.plannerStatus;

      if (usePlanner) {
        const planResult = await planFromPromptAsync(snapshot.config.promptText, {
          useLocalPlanner: true,
          tempo: snapshot.config.bpm,
          key: snapshot.config.key,
          mode: snapshot.config.musicalMode,
          beatsPerBar: snapshot.config.beatsPerBar,
          beatValue: snapshot.config.beatValue,
          bars: snapshot.config.bars,
          instrument: snapshot.config.instrument,
          temperature: snapshot.plannerTemperature,
          seed: snapshot.plannerSeed,
          variationBoost: snapshot.plannerVariation,
        });

        llmPlan = planResult.llmPlan;
        plannerMessage = planResult.plannerMessage;
        plannerWarning = planResult.source === 'fallback' ? planResult.plannerMessage : null;
        plannerSource = planResult.source;
        plannerModel = planResult.model;
        plannerStatus = planResult.source === 'ollama'
          ? 'ready'
          : planResult.source === 'fallback' || planResult.plannerMessage
            ? 'fallback'
            : snapshot.plannerStatus;

        promptPlanOverride = {
          plan: planResult.plan,
          confidence: planResult.confidence,
          assumptions: planResult.assumptions,
          source: planResult.source,
          plannerMessage: planResult.plannerMessage,
          llmPlan: planResult.llmPlan,
        };
      }

      const result = generateMusic(snapshot.config, { promptPlanOverride });

      setState((prev) => {
        if (result.error || !result.data) {
          return {
            ...prev,
            status: 'error',
            musicData: null,
            error: result.error ?? 'Unknown error',
            warnings: result.warnings,
            committedFingerprint: null,
            committedPlanOverride: null,
            plannerStatus: prev.useLocalPlanner ? 'fallback' : 'disabled',
            plannerMessage,
          };
        }

        const committedPlanOverride = promptPlanOverride ?? null;

        return {
          ...prev,
          status: 'ready',
          musicData: result.data,
          error: null,
          warnings: result.warnings,
          committedFingerprint: result.committedFingerprint,
          llmPlan,
          plannerMessage,
          plannerWarning,
          plannerSource,
          plannerModel,
          plannerStatus,
          committedPlanOverride,
        };
      });
    })();
  }, []);

  const reset = useCallback(() => {
    setState((prev) => ({
      ...prev,
      status: 'idle',
      musicData: null,
      error: null,
      warnings: [],
      committedFingerprint: null,
      committedPlanOverride: null,
      llmPlan: null,
      plannerMessage: null,
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
    setUseLocalPlanner,
    setPlannerControls,
  };
}
