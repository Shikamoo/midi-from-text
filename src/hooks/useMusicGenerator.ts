/**
 * useMusicGenerator.ts
 *
 * Commits parseMusicInput results on Generate — export uses the same ParsedScore.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { MusicConfig, MusicData, GenerationStatus } from '../types/music';
import type { LlmMusicPlan, PlannerStatus } from '../types/llmMusicPlan';
import type { PlannerDebugInfo } from '../utils/localPlanner/types';
import { generateMusic, DEFAULT_CONFIG } from '../utils/musicEngine';
import { parsePrompt } from '../utils/promptParser';
import { planFromPromptAsync } from '../planner/planFromPrompt';
import { checkPlannerHealth } from '../planner/plannerClient';
import { isLocalPlannerEnabled, DEFAULT_PLANNER_SEED, DEFAULT_PLANNER_TEMPERATURE } from '../planner/plannerConfig';
import type { PromptPlanOverride, PlanHardOverrides } from '../utils/parseMusicInput';
import { formatMappingAuditSummary, buildHarmonyIntentSummary } from '../utils/localPlanner/mappingAudit';
import { planToScore } from '../utils/planToScore';
import { buildScaleContext } from '../utils/score/melodyHelpers';
import { harmonyGenerationFromConfig } from '../utils/harmonySettings';

import {
  applyRelinkField,
  clearManualOverride,
  isPromptPopulatableField,
  markManualOverridesFromPatch,
  type PromptPopulatableField,
} from '../utils/promptPopulatableFields';

/** Hard client-side timeout before declaring a generation "timed out". */
const GENERATE_TIMEOUT_MS = 30_000;

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
  plannerDebug: PlannerDebugInfo | null;
  /**
   * Tracks which config fields were explicitly set by the user in the Settings
   * panel. These fields act as hard overrides that win over prompt-parsed values.
   */
  manualSettingsOverrides: Partial<Record<PromptPopulatableField, boolean>>;
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
    plannerDebug: null,
    manualSettingsOverrides: {},
  });

  const stateRef = useRef(state);
  stateRef.current = state;

  /** AbortController for the in-flight generate request. */
  const abortControllerRef = useRef<AbortController | null>(null);
  /** Monotonically increasing ID — used to discard stale results from superseded requests. */
  const generationIdRef = useRef(0);

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

  /**
   * Update config from the Settings panel. Marks each changed field as a
   * manual override so it wins over any value extracted from the prompt text.
   */
  const updateSettingsConfig = useCallback((patch: Partial<MusicConfig>) => {
    setState((prev) => {
      const newOverrides = { ...prev.manualSettingsOverrides };
      markManualOverridesFromPatch(newOverrides, patch);
      return {
        ...prev,
        config: { ...prev.config, ...patch },
        manualSettingsOverrides: newOverrides,
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
      };
    });
  }, []);

  // ── Auto-populate settings from prompt parse ─────────────────────────────
  // When the user types in the prompt, extract any musical values and sync
  // them to the Settings panel — but only for fields the user hasn't manually
  // overridden. This means the settings always reflect what the prompt says,
  // until the user explicitly changes a setting (which then wins).
  useEffect(() => {
    if (state.config.mode !== 'prompt') return;
    const text = state.config.promptText.trim();
    if (!text) return;

    const parsed = parsePrompt(text);
    const overrides = stateRef.current.manualSettingsOverrides;
    const patch: Partial<MusicConfig> = {};

    if (parsed.bpm !== undefined && !overrides.bpm) patch.bpm = parsed.bpm;
    if (parsed.key !== undefined && !overrides.key) patch.key = parsed.key;
    if (parsed.musicalMode !== undefined && !overrides.musicalMode) patch.musicalMode = parsed.musicalMode;
    if (parsed.beatsPerBar !== undefined && !overrides.beatsPerBar) patch.beatsPerBar = parsed.beatsPerBar;
    if (parsed.beatValue !== undefined && !overrides.beatValue) patch.beatValue = parsed.beatValue;
    if (parsed.bars !== undefined && !overrides.bars) patch.bars = parsed.bars;
    if (parsed.instrument !== undefined && !overrides.instrument) patch.instrument = parsed.instrument;

    if (Object.keys(patch).length > 0) {
      setState((prev) => ({
        ...prev,
        config: { ...prev.config, ...patch },
      }));
    }
  // Run when the prompt text or mode changes. Manual overrides are read from
  // stateRef to avoid stale closure; they are not deps here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.config.promptText, state.config.mode]);

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
    // Abort any in-flight request and record its ID before incrementing.
    if (abortControllerRef.current) {
      const prevId = generationIdRef.current;
      console.debug(`[generate] Aborting previous in-flight request (id=${prevId})`);
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const id = ++generationIdRef.current;

    console.debug(`[generate] Request started (id=${id})`);

    setState((prev) => ({
      ...prev,
      status: 'generating',
      error: null,
      plannerStatus:
        prev.useLocalPlanner && prev.config.mode === 'prompt' ? 'planning' : prev.plannerStatus,
    }));

    void (async () => {
      // Hard client-side timeout — fires regardless of what the network is doing.
      const timeoutId = setTimeout(() => {
        if (generationIdRef.current !== id) return;
        console.debug(`[generate] Request timed out (id=${id})`);
        controller.abort('timeout');
        setState((prev) =>
          prev.status === 'generating'
            ? {
                ...prev,
                status: 'timeout',
                error: 'This is taking longer than expected.',
                musicData: null,
              }
            : prev,
        );
      }, GENERATE_TIMEOUT_MS);

      try {
        const snapshot = stateRef.current;
        const usePlanner = snapshot.config.mode === 'prompt' && snapshot.useLocalPlanner;

        // Build hard overrides from the fields the user has explicitly set in Settings.
        const manualOverrides = snapshot.manualSettingsOverrides;
        const settingsOverrides: PlanHardOverrides = {};
        if (manualOverrides.bpm) settingsOverrides.tempo = snapshot.config.bpm;
        if (manualOverrides.key) settingsOverrides.key = snapshot.config.key;
        if (manualOverrides.musicalMode) settingsOverrides.mode = snapshot.config.musicalMode;
        if (manualOverrides.beatsPerBar) settingsOverrides.beatsPerBar = snapshot.config.beatsPerBar;
        if (manualOverrides.beatValue) settingsOverrides.beatValue = snapshot.config.beatValue;
        if (manualOverrides.bars) settingsOverrides.bars = snapshot.config.bars;
        if (manualOverrides.instrument) settingsOverrides.instrument = snapshot.config.instrument;

        let promptPlanOverride: PromptPlanOverride | undefined;
        let llmPlan = snapshot.llmPlan;
        let plannerMessage = snapshot.plannerMessage;
        let plannerWarning: string | null = null;
        let plannerSource: 'ollama' | 'fallback' | 'rules' | null = null;
        let plannerModel: string | null = null;
        let plannerStatus: PlannerStatus = snapshot.plannerStatus;
        let plannerDebug: PlannerDebugInfo | null = null;

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
            signal: controller.signal,
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
          plannerDebug = planResult.plannerDebug ?? null;

          let plannerPlan = planResult.plan;

          // Apply settings hard overrides to the planner plan so user settings
          // always win even when the LLM suggests different values.
          if (Object.keys(settingsOverrides).length > 0) {
            plannerPlan = { ...plannerPlan };
            if (settingsOverrides.tempo !== undefined) plannerPlan.tempo = settingsOverrides.tempo;
            if (settingsOverrides.key !== undefined) plannerPlan.key = settingsOverrides.key;
            if (settingsOverrides.mode !== undefined) plannerPlan.mode = settingsOverrides.mode;
            if (settingsOverrides.beatsPerBar !== undefined) plannerPlan.beatsPerBar = settingsOverrides.beatsPerBar;
            if (settingsOverrides.beatValue !== undefined) plannerPlan.beatValue = settingsOverrides.beatValue;
            if (settingsOverrides.bars !== undefined) plannerPlan.bars = settingsOverrides.bars;
            if (settingsOverrides.instrument !== undefined) plannerPlan.instrument = settingsOverrides.instrument;
          }

          promptPlanOverride = {
            plan: plannerPlan,
            confidence: planResult.confidence,
            assumptions: planResult.assumptions,
            source: planResult.source,
            plannerMessage: planResult.plannerMessage,
            llmPlan: planResult.llmPlan,
            mappingAudit: planResult.mappingAudit,
            mappingAuditSummary: planResult.mappingAudit
              ? formatMappingAuditSummary(planResult.mappingAudit)
              : undefined,
            melodyIntentSummary: planResult.melodyIntentSummary,
            harmonyIntentSummary: planResult.harmonyIntentSummary,
            phraseDevelopmentSummary: planResult.phraseDevelopmentSummary,
          };
        }

        // Discard stale results from superseded requests.
        if (generationIdRef.current !== id) {
          console.debug(`[generate] Stale result discarded (id=${id})`);
          return;
        }

        // If the signal was already aborted (timeout fired during sync work), stop here.
        if (controller.signal.aborted) {
          console.debug(`[generate] Request aborted before generateMusic (id=${id})`);
          return;
        }

        const result = generateMusic(snapshot.config, { promptPlanOverride, settingsOverrides });

        if (result.data && promptPlanOverride?.plan.plannerIntent) {
          const score = planToScore(
            promptPlanOverride.plan,
            harmonyGenerationFromConfig(snapshot.config),
          );
          promptPlanOverride = {
            ...promptPlanOverride,
            harmonyIntentSummary: buildHarmonyIntentSummary(
              promptPlanOverride.plan,
              buildScaleContext(promptPlanOverride.plan),
              score,
            ),
          };
        }

        // Final stale-guard before committing state.
        if (generationIdRef.current !== id) {
          console.debug(`[generate] Stale result discarded after generateMusic (id=${id})`);
          return;
        }

        if (result.error || !result.data) {
          console.debug(`[generate] Request failed (id=${id}):`, result.error);
          setState((prev) => ({
            ...prev,
            status: 'error',
            musicData: null,
            error: result.error ?? 'Unknown error',
            warnings: result.warnings,
            committedFingerprint: null,
            committedPlanOverride: null,
            plannerStatus: prev.useLocalPlanner ? 'fallback' : 'disabled',
            plannerMessage,
          }));
          return;
        }

        console.debug(`[generate] Request finished successfully (id=${id})`);
        const committedPlanOverride = promptPlanOverride ?? null;
        setState((prev) => ({
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
          plannerDebug,
        }));
      } catch (err) {
        // Discard errors from superseded requests.
        if (generationIdRef.current !== id) return;

        if (controller.signal.aborted) {
          // Timeout or abort-by-new-request — state is already set (timeout) or will be
          // overwritten by the new request. Either way, do not touch state here.
          console.debug(`[generate] Request aborted (id=${id})`);
          return;
        }

        const message = err instanceof Error ? err.message : 'Unexpected error during generation';
        console.error(`[generate] Request failed with exception (id=${id}):`, err);
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: message,
          musicData: null,
          warnings: [],
          committedFingerprint: null,
          committedPlanOverride: null,
        }));
      } finally {
        clearTimeout(timeoutId);
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    })();
  }, []);

  /**
   * Remove one or more fields from manualSettingsOverrides and restore their values
   * from the current prompt parse (if the prompt provides them) or from DEFAULT_CONFIG.
   *
   * Designed for the per-field "↺" relink button in the Settings panel.
   */
  const relinkField = useCallback((fields: string | readonly string[]) => {
    const fieldsArr = Array.isArray(fields) ? fields : [fields];
    setState((prev) => {
      const text = prev.config.mode === 'prompt' ? prev.config.promptText.trim() : '';
      const parsed: Partial<MusicConfig> = text ? parsePrompt(text) : {};

      const newOverrides = { ...prev.manualSettingsOverrides };
      const configPatch: Partial<MusicConfig> = {};

      for (const field of fieldsArr) {
        if (!isPromptPopulatableField(field)) continue;
        clearManualOverride(newOverrides, field);
        applyRelinkField(configPatch, field, parsed);
      }

      return {
        ...prev,
        config: { ...prev.config, ...configPatch },
        manualSettingsOverrides: newOverrides,
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
      };
    });
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
    updateSettingsConfig,
    relinkField,
    generate,
    reset,
    promptDetectionSummary,
    setUseLocalPlanner,
    setPlannerControls,
  };
}
