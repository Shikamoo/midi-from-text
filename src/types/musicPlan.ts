/**
 * musicPlan.ts
 *
 * Structured music intent extracted from natural-language prompts.
 * Sits between raw prompt text and concrete note generation (planToScore).
 */

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
  /** Length of the seed motif in bars (1 or 2) */
  motifLength: number;
  /** GM program number 0–127 */
  instrument: number;
  /** Base note velocity 0–127 */
  velocity: number;
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
