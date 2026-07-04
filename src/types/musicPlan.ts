import type { MelodyDensity } from './music';

// ─── Enumerated musical attributes ───────────────────────────────────────────

export type Mood =
  | 'bright'
  | 'dark'
  | 'calm'
  | 'energetic'
  | 'neutral';

export type Genre =
  | 'funk'
  | 'nu-disco'
  | 'jazz'
  | 'classical'
  | 'pop'
  | 'ambient'
  | 'generic';

export type Contour =
  | 'ascending'
  | 'descending'
  | 'undulating'
  | 'static';

export type Density = 'sparse' | 'medium' | 'dense';

export type Syncopation = 'straight' | 'light' | 'heavy';

/** Target octave register for the generated melody */
export type Register = 'low' | 'mid' | 'high';

/** How strongly the motif repeats across bars */
export type Repetition = 'low' | 'medium' | 'high';

/** Planner texture — preserved when mapped from local planner */
export type PlannerTexture =
  | 'monophonic'
  | 'melody+bass'
  | 'melody+chords'
  | 'polyphonic';

export type PlannerRegisterBias = 'low' | 'mid' | 'high' | 'wide';

/**
 * High-fidelity planner dimensions passed into generation.
 * Omitted by rule-based promptToPlan — legacy enums drive output instead.
 */
export interface PlannerGenerationIntent {
  texture: PlannerTexture;
  registerBias: PlannerRegisterBias;
  rhythmDensity: number;
  restDensity: number;
  syncopationLevel: number;
  repetitionLevel: number;
  variationLevel: number;
  harmonicComplexity: number;
  melodicRange: { min: string; max: string };
  /** Raw planner scaleType — drives interval set when present */
  scaleType: string;
  /** 0 = stepwise, 1 = wide leaps */
  leapRate: number;
  /** 0 = passing tones ok, 1 = chord tones preferred */
  consonance: number;
  /** Raw planner motifShape text */
  motifShape: string;
  /** Optional pitch anchors from planner notes[] */
  pitchAnchors: string[];
}

/** Continuous musical dimensions (0 = low, 1 = high) */
export type PlanDimension =
  | 'groove'
  | 'brightness'
  | 'energy'
  | 'motifStrength'
  | 'variationRate'
  | 'chordToneBias'
  | 'stepLeapBalance'
  | 'cadenceStrength';

export const PLAN_DIMENSION_DEFAULTS: Record<PlanDimension, number> = {
  groove: 0.5,
  brightness: 0.5,
  energy: 0.5,
  motifStrength: 0.5,
  variationRate: 0.5,
  chordToneBias: 0.5,
  stepLeapBalance: 0.4,
  cadenceStrength: 0.5,
};

// ─── Core plan ─────────────────────────────────────────────────────────────────

/**
 * A fully-specified, typed music plan derived from a natural-language prompt.
 * Every field has a concrete value — defaults are applied by promptToPlan when
 * the prompt does not mention them explicitly.
 */
export interface MusicPlan {
  tempo: number;
  key: string;
  mode: 'major' | 'minor';
  beatsPerBar: number;
  beatValue: number;
  bars: number;
  mood: Mood;
  genre: Genre;
  contour: Contour;
  density: Density;
  syncopation: Syncopation;
  register: Register;
  repetition: Repetition;
  /** Length of the seed motif in bars (1–16 when from planner; legacy parser uses 1–2) */
  motifLength: number;
  /** GM program number 0–127 */
  instrument: number;
  /** Base note velocity 0–127 */
  velocity: number;
  /** Local-planner intent — when set, generation prefers these over coarse enums */
  plannerIntent?: PlannerGenerationIntent;
  /** Syncopation / pocket feel (0–1) */
  groove: number;
  /** Tonal brightness / register lift (0–1) */
  brightness: number;
  /** Perceived intensity and drive (0–1) */
  energy: number;
  /** How hook-like and memorable the seed motif is (0–1) */
  motifStrength: number;
  /** How much the phrase evolves bar-to-bar (0–1) */
  variationRate: number;
  /** Preference for chord tones over passing tones (0–1) */
  chordToneBias: number;
  /** Stepwise motion vs leaps (0 = steps, 1 = leaps) */
  stepLeapBalance: number;
  /** Strength of phrase endings / cadences (0–1) */
  cadenceStrength: number;
  /** User UI melody density — melody generation only; does not affect harmony. */
  userMelodyDensity?: MelodyDensity;
}

// ─── Parser result ─────────────────────────────────────────────────────────────

/** A single assumption recorded when a default was applied or inferred */
export interface PlanAssumption {
  field: keyof MusicPlan | 'bars' | 'loop';
  message: string;
  /** 0–1 confidence for this specific inference */
  confidence?: number;
  /** Matched phrase or rule that triggered the inference */
  source?: string;
}

/** Output of promptToPlan */
export interface PlanParseResult {
  plan: MusicPlan;
  /** 0–1 confidence that the prompt was understood as music intent */
  confidence: number;
  /** Human-readable list of defaults and inferences applied */
  assumptions: PlanAssumption[];
}

/** Defaults used when the prompt omits a field */
export interface PlanDefaults {
  tempo?: number;
  key?: string;
  mode?: 'major' | 'minor';
  beatsPerBar?: number;
  beatValue?: number;
  bars?: number;
  instrument?: number;
}
