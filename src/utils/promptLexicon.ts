/**
 * promptLexicon.ts
 *
 * Central phrase → MusicPlan adjustment map. Extend PROMPT_LEXICON to add
 * new style cues. All matching is deterministic regex-based — no API calls.
 */

import type {
  Contour,
  Density,
  Genre,
  Mood,
  PlanDimension,
  Register,
  Repetition,
  Syncopation,
} from '../types/musicPlan';
import { PLAN_DIMENSION_DEFAULTS } from '../types/musicPlan';

// ─── Lexicon types ─────────────────────────────────────────────────────────────

export interface DimensionAdjustments {
  groove?: number;
  brightness?: number;
  energy?: number;
  motifStrength?: number;
  variationRate?: number;
  chordToneBias?: number;
  stepLeapBalance?: number;
  cadenceStrength?: number;
}

export interface EnumVotes {
  mood?: Partial<Record<Mood, number>>;
  genre?: Partial<Record<Genre, number>>;
  contour?: Partial<Record<Contour, number>>;
  density?: Partial<Record<Density, number>>;
  syncopation?: Partial<Record<Syncopation, number>>;
  register?: Partial<Record<Register, number>>;
  repetition?: Partial<Record<Repetition, number>>;
  mode?: Partial<Record<'major' | 'minor', number>>;
}

export interface LexiconEntry {
  /** Human label surfaced in assumptions */
  phrase: string;
  pattern: RegExp;
  /** Base confidence when this entry matches (0–1) */
  confidence: number;
  dimensions?: DimensionAdjustments;
  votes?: EnumVotes;
}

export interface LexiconMatch {
  phrase: string;
  confidence: number;
  entry: LexiconEntry;
}

export interface ResolvedEnum<T extends string> {
  value: T;
  confidence: number;
  sources: string[];
}

export interface LexiconMapResult {
  dimensions: Record<PlanDimension, number>;
  mood: ResolvedEnum<Mood> | null;
  genre: ResolvedEnum<Genre> | null;
  contour: ResolvedEnum<Contour> | null;
  density: ResolvedEnum<Density> | null;
  syncopation: ResolvedEnum<Syncopation> | null;
  register: ResolvedEnum<Register> | null;
  repetition: ResolvedEnum<Repetition> | null;
  mode: ResolvedEnum<'major' | 'minor'> | null;
  matches: LexiconMatch[];
}

const DIMENSION_BLEND = 0.38;

// ─── Lexicon entries (extend here) ───────────────────────────────────────────

export const PROMPT_LEXICON: LexiconEntry[] = [
  {
    phrase: 'funky',
    pattern: /\bfunk(?:y)?\b|\bgroov(?:e|y)\b/i,
    confidence: 0.88,
    dimensions: { groove: 0.28, energy: 0.12, chordToneBias: 0.1, stepLeapBalance: 0.08 },
    votes: {
      genre: { funk: 1.4 },
      syncopation: { heavy: 1.1 },
      contour: { undulating: 0.7 },
      density: { medium: 0.6 },
    },
  },
  {
    phrase: 'nu-disco',
    pattern: /\bnu[\s-]?disco\b|\bdisco\b/i,
    confidence: 0.9,
    dimensions: { groove: 0.22, brightness: 0.18, energy: 0.14, chordToneBias: 0.08 },
    votes: {
      genre: { 'nu-disco': 1.5 },
      syncopation: { heavy: 0.9 },
      mood: { bright: 0.5 },
    },
  },
  {
    phrase: 'summer',
    pattern: /\bsummer(?:y)?\b|\bsunny\b|\bbeach\b|\btropical\b/i,
    confidence: 0.82,
    dimensions: { brightness: 0.26, energy: 0.12, groove: 0.08 },
    votes: {
      mood: { bright: 1.2 },
      mode: { major: 1.0 },
      genre: { 'nu-disco': 0.4, pop: 0.3 },
    },
  },
  {
    phrase: 'loopable',
    pattern: /\bloop(?:able)?\b|\brepeat(?:ing|able)?\b|\bostinato\b/i,
    confidence: 0.86,
    dimensions: { motifStrength: 0.28, variationRate: -0.22, cadenceStrength: 0.08 },
    votes: {
      repetition: { high: 1.3 },
    },
  },
  {
    phrase: 'hook',
    pattern: /\bhook\b|\bcatchy\b|\bearworm\b/i,
    confidence: 0.84,
    dimensions: { motifStrength: 0.24, variationRate: -0.12 },
    votes: {
      repetition: { high: 1.0 },
      genre: { pop: 0.6 },
    },
  },
  {
    phrase: 'bouncy',
    pattern: /\bbounc(?:y|ing)\b|\bbounce\b|\bspringy\b/i,
    confidence: 0.83,
    dimensions: { energy: 0.2, groove: 0.14, stepLeapBalance: 0.12, brightness: 0.1 },
    votes: {
      contour: { undulating: 0.9 },
      syncopation: { light: 0.5 },
      mood: { energetic: 0.6, bright: 0.4 },
    },
  },
  {
    phrase: 'dark',
    pattern: /\bdark\b|\bmoody\b|\bbrood(?:ing|y)?\b|\bominous\b|\bnoir\b/i,
    confidence: 0.87,
    dimensions: { brightness: -0.32, energy: -0.08, cadenceStrength: 0.1 },
    votes: {
      mood: { dark: 1.4 },
      mode: { minor: 1.0 },
      register: { low: 0.5 },
    },
  },
  {
    phrase: 'dreamy',
    pattern: /\bdream(?:y|like)?\b|\bethereal\b|\bhazy\b|\bfloating\b|\bspacious\b/i,
    confidence: 0.85,
    dimensions: { brightness: 0.08, energy: -0.18, variationRate: -0.1, stepLeapBalance: -0.12 },
    votes: {
      mood: { calm: 1.1, bright: 0.3 },
      density: { sparse: 0.9 },
      genre: { ambient: 0.7 },
      contour: { static: 0.5, undulating: 0.4 },
    },
  },
  {
    phrase: 'driving',
    pattern: /\bdriving\b|\bpumping\b|\brelentless\b|\bforward.?motion\b/i,
    confidence: 0.84,
    dimensions: { energy: 0.3, groove: 0.16, cadenceStrength: 0.08, stepLeapBalance: 0.06 },
    votes: {
      mood: { energetic: 1.2 },
      syncopation: { straight: 0.5, heavy: 0.4 },
      contour: { ascending: 0.6 },
      density: { medium: 0.5, dense: 0.4 },
    },
  },
  {
    phrase: 'jazzy',
    pattern: /\bjazz(?:y)?\b|\bswing\b|\bbebop\b|\bblues(?:y)?\b/i,
    confidence: 0.88,
    dimensions: { chordToneBias: 0.22, stepLeapBalance: 0.14, variationRate: 0.12 },
    votes: {
      genre: { jazz: 1.5 },
      syncopation: { light: 0.9, heavy: 0.3 },
      contour: { undulating: 0.6 },
    },
  },
  {
    phrase: 'lo-fi',
    pattern: /\blo[\s-]?fi\b|\blofi\b|\bdusty\b|\btape\b|\bwarm\b/i,
    confidence: 0.8,
    dimensions: { brightness: -0.1, energy: -0.14, groove: 0.06, variationRate: -0.08 },
    votes: {
      mood: { calm: 1.0 },
      density: { sparse: 0.7, medium: 0.4 },
      genre: { jazz: 0.5, ambient: 0.4 },
    },
  },
  {
    phrase: 'cinematic',
    pattern: /\bcinematic\b|\bfilm\b|\bscore\b|\bepic\b|\bdramatic\b/i,
    confidence: 0.82,
    dimensions: { cadenceStrength: 0.18, variationRate: 0.1, stepLeapBalance: 0.1, energy: 0.08 },
    votes: {
      mood: { dark: 0.7, calm: 0.4 },
      genre: { classical: 0.8, ambient: 0.5 },
      contour: { ascending: 0.5, descending: 0.4 },
      density: { medium: 0.6 },
    },
  },
  {
    phrase: 'French house',
    pattern: /\bfrench\s+house\b|\bfilter\s+house\b|\bdaft\b/i,
    confidence: 0.86,
    dimensions: { groove: 0.24, brightness: 0.14, energy: 0.18, motifStrength: 0.12 },
    votes: {
      genre: { 'nu-disco': 1.0, funk: 0.8, pop: 0.4 },
      syncopation: { heavy: 0.8 },
      mood: { energetic: 0.7, bright: 0.5 },
      repetition: { high: 0.6 },
    },
  },
  {
    phrase: 'motif',
    pattern: /\bmotif\b|\btheme\b|\bfigure\b|\bid[eé]e\s+fixe\b/i,
    confidence: 0.8,
    dimensions: { motifStrength: 0.22, variationRate: -0.08 },
    votes: {
      repetition: { medium: 0.6, high: 0.5 },
      density: { sparse: 0.4, medium: 0.5 },
    },
  },
  {
    phrase: 'chord melody',
    pattern: /\bchord\s+melod(?:y|ies)\b|\barpeggi(?:o|ated)?\b|\bharmonic\b/i,
    confidence: 0.83,
    dimensions: { chordToneBias: 0.28, stepLeapBalance: -0.1, motifStrength: 0.1 },
    votes: {
      density: { medium: 0.7 },
      contour: { undulating: 0.5, static: 0.4 },
    },
  },
  {
    phrase: 'melody',
    pattern: /\bmelod(?:y|ic)\b|\blead\b|\btune\b|\bline\b/i,
    confidence: 0.72,
    dimensions: { motifStrength: 0.08 },
    votes: {
      register: { mid: 0.8, high: 0.4 },
      contour: { undulating: 0.5 },
    },
  },
  {
    phrase: 'piano',
    pattern: /\bpiano\b|\bkeys\b|\bkeyboard\b/i,
    confidence: 0.9,
    votes: {
      register: { mid: 0.6 },
      mood: { calm: 0.3 },
    },
  },
  {
    phrase: 'bright',
    pattern: /\bbright\b|\bcheerful\b|\buplift(?:ing)?\b|\bhappy\b|\bplayful\b/i,
    confidence: 0.8,
    dimensions: { brightness: 0.24, energy: 0.1 },
    votes: { mood: { bright: 1.1 }, mode: { major: 0.6 } },
  },
  {
    phrase: 'calm',
    pattern: /\bcalm\b|\bsoft\b|\bgentle\b|\bpeaceful\b|\bchill\b|\bmellow\b|\brelax(?:ed|ing)?\b/i,
    confidence: 0.8,
    dimensions: { energy: -0.2, groove: -0.08, brightness: -0.05 },
    votes: { mood: { calm: 1.2 }, density: { sparse: 0.6 } },
  },
  {
    phrase: 'energetic',
    pattern: /\benergetic\b|\bupbeat\b|\bintense\b|\baggressive\b|\bpowerful\b/i,
    confidence: 0.8,
    dimensions: { energy: 0.26, groove: 0.1 },
    votes: { mood: { energetic: 1.2 }, density: { dense: 0.4 } },
  },
  {
    phrase: 'sparse',
    pattern: /\bsparse\b|\bminimal\b|\bspace(?:y|d)?\b|\bbreathing\b|\bfew\s+notes\b/i,
    confidence: 0.82,
    votes: { density: { sparse: 1.2 } },
    dimensions: { variationRate: -0.06 },
  },
  {
    phrase: 'dense',
    pattern: /\bdense\b|\bbusy\b|\bpacked\b|\bcomplex\b|\bintricate\b/i,
    confidence: 0.82,
    votes: { density: { dense: 1.2 } },
    dimensions: { variationRate: 0.1, stepLeapBalance: 0.08 },
  },
  {
    phrase: 'ascending',
    pattern: /\bascend(?:ing)?\b|\brising\b|\bupward\b|\bclimb(?:ing)?\b|\bsoar(?:ing)?\b/i,
    confidence: 0.85,
    votes: { contour: { ascending: 1.2 } },
  },
  {
    phrase: 'descending',
    pattern: /\bdescend(?:ing)?\b|\bfalling\b|\bdownward\b|\bdrop(?:ping)?\b/i,
    confidence: 0.85,
    votes: { contour: { descending: 1.2 } },
  },
  {
    phrase: 'static',
    pattern: /\bstatic\b|\bflat\b|\bpedal\b|\bdrone\b/i,
    confidence: 0.82,
    votes: { contour: { static: 1.1 } },
    dimensions: { variationRate: -0.12 },
  },
  {
    phrase: 'variation',
    pattern: /\bvary(?:ing|iation)?\b|\bevolv(?:e|ing)\b|\bdevelop(?:ing)?\b|\bthrough.?composed\b/i,
    confidence: 0.8,
    dimensions: { variationRate: 0.22, motifStrength: -0.08 },
    votes: { repetition: { low: 1.0 } },
  },
  {
    phrase: 'syncopated',
    pattern: /\bsyncop(?:at(?:ed|ion))?|\boff.?beat\b|\bshuffle\b|\bstaccato\b/i,
    confidence: 0.84,
    votes: { syncopation: { heavy: 1.0, light: 0.4 } },
    dimensions: { groove: 0.12 },
  },
  {
    phrase: 'straight',
    pattern: /\bstraight\b|\bon.?beat\b|\beven\b|\bsteady\b/i,
    confidence: 0.78,
    votes: { syncopation: { straight: 1.0 } },
  },
  {
    phrase: 'low register',
    pattern: /\blow\b|\bbass\b|\bbottom\b|\bdeep\b|\bsub\b/i,
    confidence: 0.75,
    votes: { register: { low: 1.0 } },
    dimensions: { brightness: -0.12 },
  },
  {
    phrase: 'high register',
    pattern: /\bhigh\b|\bsoprano\b|\bupper\b|\btreble\b/i,
    confidence: 0.75,
    votes: { register: { high: 1.0 } },
    dimensions: { brightness: 0.12 },
  },
  {
    phrase: 'pop',
    pattern: /\bpop\b|\bradio\b|\bchart\b/i,
    confidence: 0.78,
    votes: { genre: { pop: 1.1 } },
    dimensions: { motifStrength: 0.1 },
  },
  {
    phrase: 'ambient',
    pattern: /\bambient\b|\batmospher(?:e|ic)\b|\bpad\b|\bdrone\b/i,
    confidence: 0.8,
    votes: { genre: { ambient: 1.2 }, mood: { calm: 0.6 } },
    dimensions: { energy: -0.15, variationRate: -0.1 },
  },
  {
    phrase: 'classical',
    pattern: /\bclassical\b|\bbaroque\b|\bromantic\b|\borchestr(?:a|al)\b/i,
    confidence: 0.8,
    votes: { genre: { classical: 1.2 } },
    dimensions: { cadenceStrength: 0.12, chordToneBias: 0.08 },
  },
];

// ─── Mapper ────────────────────────────────────────────────────────────────────

/** Scan prompt text and accumulate combined style features from all matches. */
export function mapPromptLexicon(text: string): LexiconMapResult {
  const normalized = text.trim();
  const matches: LexiconMatch[] = [];

  const dimensionTotals: Record<PlanDimension, number> = { ...PLAN_DIMENSION_DEFAULTS };
  const dimensionWeights: Partial<Record<PlanDimension, number>> = {};

  const voteBuckets = {
    mood: {} as Partial<Record<Mood, { score: number; sources: string[] }>>,
    genre: {} as Partial<Record<Genre, { score: number; sources: string[] }>>,
    contour: {} as Partial<Record<Contour, { score: number; sources: string[] }>>,
    density: {} as Partial<Record<Density, { score: number; sources: string[] }>>,
    syncopation: {} as Partial<Record<Syncopation, { score: number; sources: string[] }>>,
    register: {} as Partial<Record<Register, { score: number; sources: string[] }>>,
    repetition: {} as Partial<Record<Repetition, { score: number; sources: string[] }>>,
    mode: {} as Partial<Record<'major' | 'minor', { score: number; sources: string[] }>>,
  };

  for (const entry of PROMPT_LEXICON) {
    if (!entry.pattern.test(normalized)) continue;

    matches.push({ phrase: entry.phrase, confidence: entry.confidence, entry });

    if (entry.dimensions) {
      for (const [rawKey, delta] of Object.entries(entry.dimensions)) {
        const key = rawKey as PlanDimension;
        const contribution = delta * entry.confidence * DIMENSION_BLEND;
        dimensionTotals[key] = clamp01(dimensionTotals[key] + contribution);
        dimensionWeights[key] = (dimensionWeights[key] ?? 0) + entry.confidence;
      }
    }

    if (entry.votes) {
      addVotes(voteBuckets.mood, entry.votes.mood, entry.phrase, entry.confidence);
      addVotes(voteBuckets.genre, entry.votes.genre, entry.phrase, entry.confidence);
      addVotes(voteBuckets.contour, entry.votes.contour, entry.phrase, entry.confidence);
      addVotes(voteBuckets.density, entry.votes.density, entry.phrase, entry.confidence);
      addVotes(voteBuckets.syncopation, entry.votes.syncopation, entry.phrase, entry.confidence);
      addVotes(voteBuckets.register, entry.votes.register, entry.phrase, entry.confidence);
      addVotes(voteBuckets.repetition, entry.votes.repetition, entry.phrase, entry.confidence);
      addVotes(voteBuckets.mode, entry.votes.mode, entry.phrase, entry.confidence);
    }
  }

  return {
    dimensions: dimensionTotals,
    mood: resolveVotes(voteBuckets.mood),
    genre: resolveVotes(voteBuckets.genre),
    contour: resolveVotes(voteBuckets.contour),
    density: resolveVotes(voteBuckets.density),
    syncopation: resolveVotes(voteBuckets.syncopation),
    register: resolveVotes(voteBuckets.register),
    repetition: resolveVotes(voteBuckets.repetition),
    mode: resolveVotes(voteBuckets.mode),
    matches,
  };
}

function addVotes<T extends string>(
  bucket: Partial<Record<T, { score: number; sources: string[] }>>,
  votes: Partial<Record<T, number>> | undefined,
  phrase: string,
  confidence: number,
): void {
  if (!votes) return;
  for (const [value, weight] of Object.entries(votes) as Array<[T, number]>) {
    const existing = bucket[value] ?? { score: 0, sources: [] };
    existing.score += weight * confidence;
    if (!existing.sources.includes(phrase)) {
      existing.sources.push(phrase);
    }
    bucket[value] = existing;
  }
}

function resolveVotes<T extends string>(
  bucket: Partial<Record<T, { score: number; sources: string[] }>>,
): ResolvedEnum<T> | null {
  const entries = Object.entries(bucket) as Array<[T, { score: number; sources: string[] }]>;
  if (entries.length === 0) return null;

  entries.sort((a, b) => {
    if (b[1].score !== a[1].score) return b[1].score - a[1].score;
    return a[0].localeCompare(b[0]);
  });

  const [value, top] = entries[0];
  const total = entries.reduce((sum, [, v]) => sum + v.score, 0);
  const confidence = total > 0 ? clamp01(top.score / total) : 0.5;

  return {
    value,
    confidence: Math.max(0.45, Math.min(0.98, 0.55 + confidence * 0.4)),
    sources: top.sources,
  };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
