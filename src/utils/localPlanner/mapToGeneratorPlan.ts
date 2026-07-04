/**
 * Maps validated PlannerMusicPlan → generator MusicPlan (types/musicPlan.ts).
 */

import type {
  Density,
  Genre,
  Mood,
  MusicPlan,
  PlannerGenerationIntent,
  PlanAssumption,
  PlanDefaults,
  Register,
  Repetition,
  Syncopation,
} from '../../types/musicPlan';
import type { PlannerMusicPlan } from './schema';
import { buildMappingAudit, type FieldMappingNote } from './mappingAudit';
import { melodyIntentFieldsFromPlanner } from '../score/melodyIntent';
import { motifShapeToContour } from '../score/melodyIntent';

export interface MapToGeneratorOptions extends PlanDefaults {
  seed?: number;
  variationBoost?: number;
}

export interface MapToGeneratorResult {
  plan: MusicPlan;
  assumptions: PlanAssumption[];
  mappingAudit: FieldMappingNote[];
}

const STYLE_TO_GENRE: Array<[RegExp, Genre]> = [
  [/funk|disco|groove/i, 'funk'],
  [/nu-?disco/i, 'nu-disco'],
  [/jazz|swing|bebop/i, 'jazz'],
  [/classical|orchestral|baroque|romantic/i, 'classical'],
  [/pop|chart|radio/i, 'pop'],
  [/ambient|drone|atmospheric|pad/i, 'ambient'],
  [/retro|chiptune|8-?bit|game|lofi/i, 'generic'],
];

const MOOD_KEYWORDS: Array<[RegExp, Mood]> = [
  [/bright|happy|uplift|cheer|playful|sunny/i, 'bright'],
  [/dark|grim|brood|ominous|tense|sinister/i, 'dark'],
  [/calm|peace|soft|gentle|floating|dream/i, 'calm'],
  [/energetic|driving|intense|aggressive|hype|boss/i, 'energetic'],
];

const INSTRUMENT_HINTS: Array<[RegExp, number]> = [
  [/piano|keys|keyboard/i, 0],
  [/bass|bassline/i, 32],
  [/guitar|acoustic guitar/i, 24],
  [/synth|lead|electronic/i, 80],
  [/strings|violin|cello|orchestra/i, 48],
  [/brass|trumpet|horn/i, 56],
  [/flute|woodwind|clarinet/i, 73],
];

export function mapToGeneratorPlan(
  planner: PlannerMusicPlan,
  options: MapToGeneratorOptions = {},
): MapToGeneratorResult {
  const assumptions: PlanAssumption[] = [];
  const seedMix = seedVariation(options.seed, options.variationBoost);

  const { beatsPerBar, beatValue } = meterToTimeSig(planner.meter);
  const mode = scaleToMode(planner.scaleType);
  const mood = resolveMood(planner.mood);
  const genre = resolveGenre(planner.style, planner.mood.join(' '));
  const contour = motifShapeToContour(planner.motifShape);
  const density = densitiesToEnum(planner.rhythmDensity, planner.restDensity);
  const syncopation = syncopationToEnum(planner.syncopation);
  const register = registerBiasToRegister(planner.registerBias, planner.melodicRange);
  const repetition = repetitionToEnum(planner.repetition);
  const instrument = resolveInstrument(planner.style, planner.texture, options.instrument);

  const variationRate = clamp01(planner.variation + seedMix * 0.08);
  const motifStrength = clamp01(planner.repetition * 0.85 + (1 - variationRate) * 0.15);
  const groove = clamp01(planner.syncopation * 0.7 + planner.percussionEnergy * 0.3);
  const brightness = moodToBrightness(mood, planner.mood, planner.registerBias);
  const energy = clamp01(planner.percussionEnergy * 0.55 + planner.rhythmDensity * 0.45);
  const chordToneBias = clamp01(planner.consonance * 0.6 + planner.harmonicComplexity * 0.4);
  const stepLeapBalance = clamp01(planner.leapRate);
  const cadenceStrength = clamp01(
    planner.harmonicComplexity * 0.5 + planner.consonance * 0.35 + 0.15,
  );

  const bars = options.bars ?? planner.totalBars;
  const motifLength = clampInt(planner.phraseBars, 1, Math.min(16, bars));
  const velocity = dynamicsToVelocity(planner.dynamics, energy);

  const plannerIntent: PlannerGenerationIntent = {
    texture: planner.texture,
    registerBias: planner.registerBias,
    rhythmDensity: planner.rhythmDensity,
    restDensity: planner.restDensity,
    syncopationLevel: planner.syncopation,
    repetitionLevel: planner.repetition,
    variationLevel: variationRate,
    harmonicComplexity: planner.harmonicComplexity,
    melodicRange: { ...planner.melodicRange },
    ...melodyIntentFieldsFromPlanner(planner),
  };

  assumptions.push({
    field: 'tempo',
    message: `Planner tempo: ${planner.tempoBpm} BPM · texture ${planner.texture}`,
    confidence: 0.85,
    source: 'local-planner',
  });

  const plan: MusicPlan = {
    tempo: planner.tempoBpm,
    key: options.key ?? planner.keyCenter,
    mode: options.mode ?? mode,
    beatsPerBar: options.beatsPerBar ?? beatsPerBar,
    beatValue: options.beatValue ?? beatValue,
    bars,
    mood,
    genre,
    contour,
    density,
    syncopation,
    register,
    repetition,
    motifLength,
    instrument: options.instrument ?? instrument,
    velocity,
    groove,
    brightness,
    energy,
    motifStrength,
    variationRate,
    chordToneBias,
    stepLeapBalance,
    cadenceStrength,
    plannerIntent,
  };

  if (planner.articulation.toLowerCase().includes('staccato')) {
    plan.velocity = Math.min(plan.velocity, 75);
  }

  return {
    plan,
    assumptions,
    mappingAudit: buildMappingAudit(planner, plan),
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function clampInt(n: number, min: number, max: number): number {
  return Math.round(Math.max(min, Math.min(max, n)));
}

function seedVariation(seed?: number, boost?: number): number {
  if (seed === undefined && boost === undefined) return 0;
  const s = (seed ?? 0) + (boost ?? 0) * 1000;
  return ((Math.sin(s * 12.9898) * 43758.5453) % 1 + 1) % 1;
}

function meterToTimeSig(meter: PlannerMusicPlan['meter']) {
  switch (meter) {
    case '3/4': return { beatsPerBar: 3, beatValue: 4 };
    case '6/8': return { beatsPerBar: 6, beatValue: 8 };
    case '2/4': return { beatsPerBar: 2, beatValue: 4 };
    default: return { beatsPerBar: 4, beatValue: 4 };
  }
}

function scaleToMode(scaleType: string): 'major' | 'minor' {
  if (/minor|aeolian|dorian|phrygian|locrian|harmonic|melodic/i.test(scaleType)) return 'minor';
  return 'major';
}

function resolveMood(moods: string[]): Mood {
  const text = moods.join(' ');
  for (const [re, mood] of MOOD_KEYWORDS) {
    if (re.test(text)) return mood;
  }
  return 'neutral';
}

function resolveGenre(style: string, extra: string): Genre {
  const text = `${style} ${extra}`;
  for (const [re, genre] of STYLE_TO_GENRE) {
    if (re.test(text)) return genre;
  }
  return 'generic';
}

function densitiesToEnum(rhythm: number, rest: number): Density {
  const activity = rhythm * (1 - rest * 0.5);
  if (activity < 0.35) return 'sparse';
  if (activity > 0.65) return 'dense';
  return 'medium';
}

function syncopationToEnum(value: number): Syncopation {
  if (value < 0.33) return 'straight';
  if (value > 0.66) return 'heavy';
  return 'light';
}

function registerBiasToRegister(
  bias: PlannerMusicPlan['registerBias'],
  range: PlannerMusicPlan['melodicRange'],
): Register {
  if (bias === 'low') return 'low';
  if (bias === 'high') return 'high';
  if (bias === 'wide') return 'mid';
  const minOct = octaveFromPitch(range.min);
  const maxOct = octaveFromPitch(range.max);
  const center = (minOct + maxOct) / 2;
  if (center < 3.5) return 'low';
  if (center > 5) return 'high';
  return 'mid';
}

function octaveFromPitch(pitch: string): number {
  const m = pitch.match(/(\d)$/);
  return m ? parseInt(m[1], 10) : 4;
}

function repetitionToEnum(value: number): Repetition {
  if (value < 0.35) return 'low';
  if (value > 0.65) return 'high';
  return 'medium';
}

function moodToBrightness(
  mood: Mood,
  tags: string[],
  registerBias: PlannerMusicPlan['registerBias'],
): number {
  let b = 0.5;
  if (mood === 'bright') b = 0.75;
  if (mood === 'dark') b = 0.25;
  if (mood === 'calm') b = 0.55;
  if (mood === 'energetic') b = 0.65;
  if (/cinematic|epic/i.test(tags.join(' '))) b += 0.1;
  if (registerBias === 'wide') b += 0.05;
  return clamp01(b);
}

function dynamicsToVelocity(dynamics: string, energy: number): number {
  const d = dynamics.toLowerCase();
  let base = 80;
  if (/piano|soft|quiet|pp|mp/i.test(d)) base = 58;
  if (/forte|loud|ff|f\b/i.test(d)) base = 105;
  return Math.round(clamp01(energy * 0.35 + 0.65) * base);
}

function resolveInstrument(style: string, texture: PlannerMusicPlan['texture'], fallback = 0): number {
  const text = `${style} ${texture}`;
  for (const [re, program] of INSTRUMENT_HINTS) {
    if (re.test(text)) return program;
  }
  if (texture === 'melody+bass') return 32;
  return fallback;
}
