/**
 * parseMusicInput.ts
 *
 * Active single pipeline: raw text → ParsedScore (+ MusicPlan metadata for prompts).
 * Used by live preview (useMusicInput) and Generate (musicEngine).
 *
 * Note mode: normalizeMusicText → parseStrictNotes → groupIntoBars.
 * Prompt mode: promptToPlan → planToScore (not legacy CompositionPlan / patternGenerators).
 */

import { detectInputMode } from './detectInputMode';
import { normalizeMusicText } from './normalizeMusicText';
import { parseStrictNotes } from './parseStrictNotes';
import { groupIntoBars } from './groupIntoBars';
import { promptToPlan, describeMusicPlan } from './promptToPlan';
import { planToScore } from './planToScore';
import { scoreToCanonicalText } from './scoreToCanonicalText';
import {
  parsedScoreToMusicData,
  type ScoreExportMetadata,
} from './parsedScoreToMidiEvents';
import type { DetectedMode, HarmonyGenerationSettings, MusicData, ParsedScore, ParseIssue } from '../types/music';
import type { MusicPlan, PlanAssumption } from '../types/musicPlan';
import type { LlmMusicPlan } from '../types/llmMusicPlan';
import type { FieldMappingNote } from './localPlanner/mappingAudit';
import { DEFAULT_HARMONY_GENERATION } from './harmonySettings';

export interface PromptPlanOverride {
  plan: MusicPlan;
  confidence: number;
  assumptions: PlanAssumption[];
  source?: 'ollama' | 'fallback' | 'rules';
  plannerMessage?: string | null;
  llmPlan?: LlmMusicPlan | null;
  mappingAudit?: FieldMappingNote[];
  mappingAuditSummary?: string;
}

export interface ParseMusicInputOptions {
  bpm?: number;
  key?: string;
  mode?: 'major' | 'minor';
  beatsPerBar?: number;
  beatValue?: number;
  bars?: number;
  instrument?: number;
  /** Prompt-mode harmony generation (affects fingerprint). */
  harmonyGeneration?: HarmonyGenerationSettings;
  /** Skip promptToPlan when a planner or cached plan is supplied. */
  promptPlanOverride?: PromptPlanOverride;
}

export interface ParseMusicInputResult {
  detectedMode: DetectedMode;
  normalizedText: string;
  parsedScore: ParsedScore | null;
  previewData: MusicData | null;
  musicPlan: MusicPlan | null;
  planConfidence: number;
  assumptions: PlanAssumption[];
  issues: ParseIssue[];
  hasErrors: boolean;
  hasWarnings: boolean;
  canExport: boolean;
  exportMeta: ScoreExportMetadata | null;
}

export function parseMusicInput(
  rawText: string,
  options: ParseMusicInputOptions = {},
): ParseMusicInputResult {
  const trimmed = rawText.trim();

  if (!trimmed) {
    return emptyResult();
  }

  const opts = resolveOptions(options);
  const detectedMode = detectInputMode(trimmed);

  if (detectedMode.mode === 'abc-like') {
    return {
      detectedMode,
      normalizedText: trimmed,
      parsedScore: null,
      previewData: null,
      musicPlan: null,
      planConfidence: 0,
      assumptions: [],
      issues: [{
        severity: 'info',
        message: 'ABC notation detected. Switch to Prompt mode or convert to note format (e.g. "C4 q, E4 q").',
        location: 'input',
        stage: 'detect',
      }],
      hasErrors: false,
      hasWarnings: false,
      canExport: false,
      exportMeta: null,
    };
  }

  if (detectedMode.mode === 'prompt-text') {
    return runPromptPipeline(trimmed, detectedMode, opts, options);
  }

  return runNotePipeline(trimmed, detectedMode, opts);
}

function resolveOptions(options: ParseMusicInputOptions) {
  return {
    bpm: options.bpm ?? 120,
    key: options.key ?? 'C',
    mode: options.mode ?? 'major' as const,
    beatsPerBar: options.beatsPerBar ?? 4,
    beatValue: options.beatValue ?? 4,
    bars: options.bars ?? 4,
    instrument: options.instrument ?? 0,
    harmonyGeneration: options.harmonyGeneration ?? DEFAULT_HARMONY_GENERATION,
  };
}

function runPromptPipeline(
  text: string,
  detectedMode: DetectedMode,
  defaults: ReturnType<typeof resolveOptions>,
  options: ParseMusicInputOptions,
): ParseMusicInputResult {
  const override = options.promptPlanOverride;
  const { plan, confidence, assumptions } = override
    ? { plan: override.plan, confidence: override.confidence, assumptions: override.assumptions }
    : promptToPlan(text, {
        tempo: defaults.bpm,
        key: defaults.key,
        mode: defaults.mode,
        beatsPerBar: defaults.beatsPerBar,
        beatValue: defaults.beatValue,
        bars: defaults.bars,
        instrument: defaults.instrument,
      });

  return buildPromptParseResult(text, detectedMode, plan, confidence, assumptions, defaults, {
    source: override?.source,
    plannerMessage: override?.plannerMessage,
  });
}

/** Build a prompt-mode parse result from an existing MusicPlan. */
export function buildPromptParseResult(
  _text: string,
  detectedMode: DetectedMode,
  plan: MusicPlan,
  confidence: number,
  assumptions: PlanAssumption[],
  defaults: ReturnType<typeof resolveOptions>,
  meta: { source?: 'ollama' | 'fallback' | 'rules'; plannerMessage?: string | null } = {},
): ParseMusicInputResult {
  const score = planToScore(plan, defaults.harmonyGeneration);
  const normalizedText = scoreToCanonicalText(score);
  const exportMeta: ScoreExportMetadata = {
    key: plan.key,
    mode: plan.mode,
    instrument: plan.instrument,
  };
  const previewData = parsedScoreToMusicData(score, exportMeta);

  const sourceLabel = meta.source === 'ollama'
    ? 'Local planner'
    : meta.source === 'fallback'
      ? 'Planner fallback'
      : 'Prompt interpreted as';
  const issues: ParseIssue[] = [
    {
      severity: 'info',
      message: `${sourceLabel}: ${describeMusicPlan(plan)}`,
      location: 'input',
      stage: 'plan',
    },
    ...(meta.plannerMessage
      ? [{
          severity: 'warning' as const,
          message: meta.plannerMessage,
          location: 'planner',
          stage: 'plan' as const,
        }]
      : []),
    ...assumptions.map((a) => ({
      severity: 'info' as const,
      message: a.message,
      location: String(a.field),
      stage: 'plan' as const,
    })),
  ];

  return {
    detectedMode,
    normalizedText,
    parsedScore: score,
    previewData,
    musicPlan: plan,
    planConfidence: confidence,
    assumptions,
    issues,
    hasErrors: false,
    hasWarnings: issues.some((i) => i.severity === 'warning'),
    canExport: true,
    exportMeta,
  };
}

function runNotePipeline(
  text: string,
  detectedMode: DetectedMode,
  opts: ReturnType<typeof resolveOptions>,
): ParseMusicInputResult {
  const normalizedText = normalizeMusicText(text);
  const parseResult = parseStrictNotes(normalizedText);
  const { bars, issues: groupIssues } = groupIntoBars(parseResult, {
    beatsPerBar: opts.beatsPerBar,
  });

  const allIssues: ParseIssue[] = [...parseResult.issues, ...groupIssues];

  const parsedScore: ParsedScore | null =
    parseResult.tokens.length > 0
      ? {
          bars,
          tokens: parseResult.tokens,
          bpm: opts.bpm,
          beatsPerBar: opts.beatsPerBar,
          beatValue: opts.beatValue,
        }
      : null;

  const exportMeta: ScoreExportMetadata | null = parsedScore
    ? { key: opts.key, mode: opts.mode, instrument: opts.instrument }
    : null;

  const previewData = parsedScore && exportMeta
    ? parsedScoreToMusicData(parsedScore, exportMeta)
    : null;

  const displayText = parsedScore
    ? scoreToCanonicalText(parsedScore)
    : normalizedText;

  return {
    detectedMode,
    normalizedText: displayText,
    parsedScore,
    previewData,
    musicPlan: null,
    planConfidence: 0,
    assumptions: [],
    issues: allIssues,
    hasErrors: allIssues.some((i) => i.severity === 'error'),
    hasWarnings: allIssues.some((i) => i.severity === 'warning'),
    canExport: parsedScore !== null && !allIssues.some((i) => i.severity === 'error'),
    exportMeta,
  };
}

function emptyResult(): ParseMusicInputResult {
  return {
    detectedMode: { mode: 'prompt-text', confidence: 0 },
    normalizedText: '',
    parsedScore: null,
    previewData: null,
    musicPlan: null,
    planConfidence: 0,
    assumptions: [],
    issues: [],
    hasErrors: false,
    hasWarnings: false,
    canExport: false,
    exportMeta: null,
  };
}

/** Build MusicData from a parse result — no second pass through generators. */
export function parseResultToMusicData(result: ParseMusicInputResult): MusicData | null {
  if (!result.parsedScore || !result.exportMeta) return null;
  return parsedScoreToMusicData(result.parsedScore, result.exportMeta);
}
