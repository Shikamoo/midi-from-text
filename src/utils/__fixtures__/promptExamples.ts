/**
 * Example prompts and expected plan traits for deterministic promptToPlan tests.
 */

export interface PromptFixtureExpectation {
  tempo?: number;
  mode?: 'major' | 'minor';
  genre?: string;
  mood?: string;
  bars?: number;
  syncopation?: string;
  repetition?: string;
  minGroove?: number;
  minBrightness?: number;
  minEnergy?: number;
  minMotifStrength?: number;
  maxVariationRate?: number;
  minChordToneBias?: number;
  minCadenceStrength?: number;
  minConfidence?: number;
  matchedPhrases?: string[];
}

export interface PromptFixture {
  prompt: string;
  expect: PromptFixtureExpectation;
}

export const PROMPT_FIXTURES: PromptFixture[] = [
  {
    prompt: 'loopable funky melody 100 BPM summer nu-disco',
    expect: {
      tempo: 100,
      mode: 'major',
      genre: 'nu-disco',
      mood: 'bright',
      bars: 4,
      syncopation: 'heavy',
      repetition: 'high',
      minGroove: 0.58,
      minBrightness: 0.58,
      minMotifStrength: 0.55,
      maxVariationRate: 0.48,
      minConfidence: 0.5,
      matchedPhrases: ['funky', 'nu-disco', 'summer', 'loopable', 'melody'],
    },
  },
  {
    prompt: 'dark cinematic piano motif',
    expect: {
      mode: 'minor',
      mood: 'dark',
      genre: 'classical',
      minCadenceStrength: 0.58,
      maxVariationRate: 0.52,
      minConfidence: 0.45,
      matchedPhrases: ['dark', 'cinematic', 'piano', 'motif'],
    },
  },
  {
    prompt: 'bouncy French house hook',
    expect: {
      genre: 'nu-disco',
      repetition: 'high',
      minGroove: 0.58,
      minEnergy: 0.58,
      minMotifStrength: 0.55,
      minConfidence: 0.45,
      matchedPhrases: ['bouncy', 'French house', 'hook'],
    },
  },
  {
    prompt: 'jazzy lo-fi chord melody',
    expect: {
      genre: 'jazz',
      mood: 'calm',
      minChordToneBias: 0.58,
      maxVariationRate: 0.52,
      minConfidence: 0.45,
      matchedPhrases: ['jazzy', 'lo-fi', 'chord melody', 'melody'],
    },
  },
];
