/**
 * planToScore.ts
 *
 * Generates a deterministic ParsedScore from a MusicPlan.
 * Canonical text and MIDI conversion live in dedicated score utilities.
 */

import type { ParsedScore } from '../types/music';
import type { MusicPlan } from '../types/musicPlan';
import {
  buildMotifSeed,
  buildScaleContext,
  groupTokensIntoBars,
  planSeed,
  tilePhrase,
} from './score/melodyHelpers';
import { deriveHarmony } from './score/harmony';
import { resolveHarmonyContext, measureHarmonyVoicing } from './score/harmonyIntent';
import { harmonyChordSlotsPerBar } from './harmonySettings';
import { resolveStylePreset } from './score/stylePresets';
import {
  deriveBassLine,
  resolveHarmonySettingsForTexture,
  shouldGenerateBass,
  shouldGenerateHarmony,
} from './score/texture';
import type { HarmonyGenerationSettings } from '../types/music';
import { DEFAULT_HARMONY_GENERATION } from './harmonySettings';

/** Generate a ParsedScore from a fully-specified MusicPlan. */
export function planToScore(
  plan: MusicPlan,
  harmonyGeneration: HarmonyGenerationSettings = DEFAULT_HARMONY_GENERATION,
): ParsedScore {
  const scale = buildScaleContext(plan);
  const preset = resolveStylePreset(plan);
  const seed = planSeed(plan);
  const seedMotif = buildMotifSeed(plan, scale, preset, seed);
  const phraseBars = tilePhrase(seedMotif, plan, scale, preset);
  const allTokens = phraseBars.flatMap((bar) => bar.tokens);
  const bars = groupTokensIntoBars(allTokens, plan.beatsPerBar);

  const melodyScore = {
    bars,
    tokens: allTokens,
    bpm: plan.tempo,
    beatsPerBar: plan.beatsPerBar,
    beatValue: plan.beatValue,
  };

  const resolvedHarmony = resolveHarmonySettingsForTexture(plan, harmonyGeneration);
  const harmonyCtx = resolveHarmonyContext(plan, scale);
  const slotsPerBar = harmonyChordSlotsPerBar(resolvedHarmony);

  const harmonyTokens = shouldGenerateHarmony(plan)
    ? deriveHarmony(melodyScore, plan, scale, preset, resolvedHarmony)
    : undefined;

  const harmonySlotCount = harmonyTokens
    ? melodyScore.bars.length * slotsPerBar
    : 0;
  const harmonyNotesPerSlot = harmonyTokens && harmonySlotCount > 0
    ? harmonyTokens.length / harmonySlotCount
    : undefined;
  const harmonyVoicingRealized = harmonyTokens
    ? measureHarmonyVoicing(harmonyTokens, harmonySlotCount, harmonyCtx, resolvedHarmony.bassDoubling)
    : undefined;

  const bassTokens = shouldGenerateBass(plan)
    ? deriveBassLine(melodyScore, plan, scale, preset)
    : undefined;

  return {
    ...melodyScore,
    harmonyTokens,
    bassTokens,
    harmonyGeneration: resolvedHarmony,
    harmonyNotesPerSlot,
    harmonyVoicingRealized,
  };
}

export { scoreToCanonicalText, tokensToCanonicalText } from './scoreToCanonicalText';
export { parsedScoreToMusicData, parsedScoreToNoteEvents } from './parsedScoreToMidiEvents';
export type { ScoreExportMetadata } from './parsedScoreToMidiEvents';
export {
  applyCadence,
  applyPenultimateSetup,
  buildMotif,
  buildRhythmPattern,
  chooseNextDegree,
  clampRegister,
  endsOnTonic,
  phraseArcDegree,
  restCount,
  varyMotif,
} from './score/melodyHelpers';
export { resolveStylePreset, STYLE_PRESETS } from './score/stylePresets';
