/**
 * Planner-aware harmony context: scale intervals and accompaniment strategy.
 */

import type { NoteToken, ParsedScore, HarmonyVoicingRealized } from '../../types/music';
import type { MusicPlan } from '../../types/musicPlan';
import { resolvePlannerIntent } from '../localPlanner/mappingAudit';
import { resolvePlannerScale } from './scaleIntervals';
import type { ScaleContext } from './types';

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

export type HarmonyAccompanimentStyle =
  | 'diatonic-triads'
  | 'modal-triads'
  | 'open-fifths'
  | 'shell-voicing'
  | 'quartal-stack'
  | 'drone';

export type HarmonyVoicingDensity = 'light' | 'medium' | 'full';

export interface HarmonyContext {
  intervals: number[];
  scaleId: string;
  degreeCount: number;
  harmonyMode: string;
  accompanimentStyle: HarmonyAccompanimentStyle;
  voicingDensity: HarmonyVoicingDensity;
  omitRootWhenBass: boolean;
  /** When true, shell voicing may add the root above guide tones (no separate bass). */
  shellIncludeRoot: boolean;
  modalFallback: boolean;
  useDiatonicSevenths: boolean;
  texture: ReturnType<typeof resolvePlannerIntent>['texture'];
}

export function resolveVoicingDensity(
  texture: ReturnType<typeof resolvePlannerIntent>['texture'],
  harmonicComplexity: number,
): HarmonyVoicingDensity {
  if (texture === 'melody+chords') return 'light';
  if (texture === 'polyphonic') {
    if (harmonicComplexity > 0.65) return 'full';
    if (harmonicComplexity > 0.35) return 'medium';
    return 'light';
  }
  return 'medium';
}

function resolveAccompanimentStyle(
  scaleId: string,
  texture: ReturnType<typeof resolvePlannerIntent>['texture'],
  density: HarmonyVoicingDensity,
): HarmonyAccompanimentStyle {
  if (scaleId === 'major' || scaleId === 'minor') {
    if (texture === 'melody+chords') return 'open-fifths';
    if (density === 'full') return 'diatonic-triads';
    if (density === 'medium') return 'shell-voicing';
    return 'open-fifths';
  }

  if (scaleId === 'dorian' || scaleId === 'mixolydian') {
    if (texture === 'melody+chords') return 'open-fifths';
    if (density === 'full') return 'quartal-stack';
    if (density === 'medium') return 'shell-voicing';
    return 'open-fifths';
  }

  if (scaleId === 'major-pentatonic' || scaleId === 'minor-pentatonic') {
    return texture === 'polyphonic' && density === 'full' ? 'quartal-stack' : 'open-fifths';
  }

  return texture === 'melody+chords' ? 'open-fifths' : 'shell-voicing';
}

function resolveShellIncludeRoot(
  texture: ReturnType<typeof resolvePlannerIntent>['texture'],
  voicingDensity: HarmonyVoicingDensity,
  harmonicComplexity: number,
): boolean {
  return texture === 'polyphonic'
    && voicingDensity === 'medium'
    && harmonicComplexity > 0.55;
}

export function resolveHarmonyContext(plan: MusicPlan, scale: ScaleContext): HarmonyContext {
  if (!plan.plannerIntent) {
    const intervals = plan.mode === 'major' ? MAJOR : MINOR;
    return {
      intervals,
      scaleId: plan.mode,
      degreeCount: intervals.length,
      harmonyMode: plan.mode,
      accompanimentStyle: 'diatonic-triads',
      voicingDensity: 'full',
      omitRootWhenBass: false,
      shellIncludeRoot: false,
      modalFallback: false,
      useDiatonicSevenths: true,
      texture: 'melody+chords',
    };
  }

  const intent = plan.plannerIntent;
  const resolved = resolvePlannerScale(intent.scaleType, plan.mode);
  const scaleId = scale.scaleId ?? resolved.id;
  const intervals = resolved.intervals;
  const texture = intent.texture;
  const voicingDensity = resolveVoicingDensity(texture, intent.harmonicComplexity);
  const accompanimentStyle = resolveAccompanimentStyle(scaleId, texture, voicingDensity);
  const shellIncludeRoot = resolveShellIncludeRoot(texture, voicingDensity, intent.harmonicComplexity);

  if (scaleId === 'major' || scaleId === 'minor') {
    return {
      intervals,
      scaleId,
      degreeCount: intervals.length,
      harmonyMode: scaleId,
      accompanimentStyle,
      voicingDensity,
      omitRootWhenBass: true,
      shellIncludeRoot,
      modalFallback: false,
      useDiatonicSevenths: texture === 'polyphonic'
        && voicingDensity === 'full'
        && intent.harmonicComplexity > 0.55,
      texture,
    };
  }

  if (scaleId === 'dorian' || scaleId === 'mixolydian') {
    return {
      intervals,
      scaleId,
      degreeCount: intervals.length,
      harmonyMode: scaleId,
      accompanimentStyle,
      voicingDensity,
      omitRootWhenBass: true,
      shellIncludeRoot,
      modalFallback: true,
      useDiatonicSevenths: false,
      texture,
    };
  }

  if (scaleId === 'major-pentatonic' || scaleId === 'minor-pentatonic') {
    return {
      intervals,
      scaleId,
      degreeCount: intervals.length,
      harmonyMode: scaleId,
      accompanimentStyle,
      voicingDensity,
      omitRootWhenBass: true,
      shellIncludeRoot,
      modalFallback: true,
      useDiatonicSevenths: false,
      texture,
    };
  }

  const fallback = plan.mode === 'minor' ? MINOR : MAJOR;
  return {
    intervals: fallback,
    scaleId: plan.mode,
    degreeCount: fallback.length,
    harmonyMode: plan.mode,
    accompanimentStyle: texture === 'melody+chords' ? 'open-fifths' : 'shell-voicing',
    voicingDensity,
    omitRootWhenBass: true,
    shellIncludeRoot,
    modalFallback: true,
    useDiatonicSevenths: false,
    texture,
  };
}

export function penultimateHarmonyDegree(ctx: HarmonyContext, plan: MusicPlan): number {
  if (ctx.scaleId === 'mixolydian') return 4;
  if (ctx.scaleId === 'dorian') return 4;
  if (plan.mode === 'major' || ctx.harmonyMode === 'major') return 4;
  return 6;
}

export function accompanimentStyleLabel(style: HarmonyAccompanimentStyle): string {
  switch (style) {
    case 'diatonic-triads': return 'diatonic triads';
    case 'modal-triads': return 'modal triads';
    case 'open-fifths': return 'open fifths';
    case 'shell-voicing': return 'guide-tone shell (3rd+7th)';
    case 'quartal-stack': return 'quartal stack';
    case 'drone': return 'drone';
  }
}

export function voicingDensityLabel(density: HarmonyVoicingDensity): string {
  switch (density) {
    case 'light': return 'light';
    case 'medium': return 'medium';
    default: return 'full';
  }
}

export function accompanimentStyleNoteCount(
  style: HarmonyAccompanimentStyle,
  useSevenths: boolean,
): number {
  switch (style) {
    case 'open-fifths':
    case 'shell-voicing':
      return 2;
    case 'quartal-stack':
    case 'modal-triads':
    case 'diatonic-triads':
      return useSevenths ? 4 : 3;
    default:
      return useSevenths ? 4 : 3;
  }
}

export function minVoicingMidiForDensity(density: HarmonyVoicingDensity): number {
  switch (density) {
    case 'light': return 52;
    case 'medium': return 48;
    default: return 44;
  }
}

export function measureHarmonyVoicing(
  tokens: NoteToken[],
  slotCount: number,
  ctx: HarmonyContext,
  bassDoubling: boolean,
): HarmonyVoicingRealized {
  const pitched = tokens.filter((t) => t.pitch !== 'rest');
  const notesPerSlot = slotCount > 0 ? pitched.length / slotCount : 0;
  const lowRegisterNoteCount = pitched.filter((t) => t.midiNote < 52).length;

  return {
    style: ctx.accompanimentStyle,
    densityLevel: ctx.voicingDensity,
    averageChordNoteCount: notesPerSlot,
    rootOmittedWhenBass: bassDoubling && ctx.omitRootWhenBass,
    notesPerSlot,
    lowRegisterNoteCount,
  };
}

export function formatHarmonyVoicingRealizedSummary(
  realized: HarmonyVoicingRealized,
): string {
  const styleLabel = accompanimentStyleLabel(realized.style as HarmonyAccompanimentStyle);
  return [
    'Harmony voicing realized:',
    `  voicing style: ${styleLabel}`,
    `  average chord note count: ${realized.averageChordNoteCount.toFixed(1)}`,
    `  density level: ${voicingDensityLabel(realized.densityLevel)}`,
    `  root omitted when bass present: ${realized.rootOmittedWhenBass ? 'yes' : 'no'}`,
  ].join('\n');
}

export function buildHarmonyIntentSummary(
  plan: MusicPlan,
  scale: ScaleContext,
  score?: Pick<ParsedScore, 'harmonyTokens' | 'harmonyVoicingRealized' | 'bars'>,
): string {
  if (!plan.plannerIntent) {
    return 'Harmony intent realized: legacy plan.mode major/minor diatonic triads';
  }

  const ctx = resolveHarmonyContext(plan, scale);
  const lines = [
    'Harmony intent realized:',
    `  harmony mode: ${ctx.harmonyMode}`,
    `  scale: ${ctx.scaleId} (${ctx.intervals.length} tones)`,
    `  accompaniment: ${accompanimentStyleLabel(ctx.accompanimentStyle)}`,
    `  density level: ${voicingDensityLabel(ctx.voicingDensity)}`,
    `  texture: ${ctx.texture}`,
    `  modal fallback: ${ctx.modalFallback ? 'yes' : 'no'}`,
  ];

  if (score?.harmonyVoicingRealized) {
    lines.push('');
    lines.push(formatHarmonyVoicingRealizedSummary(score.harmonyVoicingRealized));
  }

  return lines.join('\n');
}
