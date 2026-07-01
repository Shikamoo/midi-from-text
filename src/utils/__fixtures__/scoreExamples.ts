/**
 * Prompt → canonical note fixtures for planToScore regression tests.
 */

export interface ScoreFixture {
  prompt: string;
  /** Expected style preset id */
  presetId: 'funk' | 'nu-disco' | 'house' | 'cinematic-piano' | 'generic';
  /** Exact canonical note text (deterministic snapshot) */
  canonical: string;
  minRests?: number;
  bars?: number;
}

export const SCORE_FIXTURES: ScoreFixture[] = [
  {
    prompt: 'loopable funky melody 100 BPM summer nu-disco',
    presetId: 'nu-disco',
    canonical:
      'G#4 e:85, F#4 e:85, F4 e:85, R e:85, D#4 e:85, F4 e:85, F4 q:85 | C#4 e:85, R e:85, D#4 e:85, F4 e:85, F#4 e:85, R e:85, F4 e:85, F4 e:85 | A#4 e:85, G#4 e:85, F#4 e:85, R e:85, F4 e:85, G#4 e:87, F4 q:87 | C#4 e:85, R e:85, D#4 e:85, F4 e:85, G#4 e:89, R e:85, F4 e:89, C#4 q:95',
    minRests: 4,
    bars: 4,
  },
  {
    prompt: 'dark cinematic piano motif',
    presetId: 'cinematic-piano',
    canonical:
      'D#4 h, D#4 q, C4 q | D#4 q, F4 e, D#4 e, D#4 h | G#4 h:82, G4 q:82, D#4 q:82 | G#4 q:84, G4 e:84, D#4 e:84, C4 h:90',
    bars: 4,
  },
  {
    prompt: 'bouncy French house hook',
    presetId: 'nu-disco',
    canonical:
      'E4 e:88, F4 e:88, F4 e:88, R e:88, E4 e:88, C4 e:88, C4 q:88 | E4 e:88, R e:88, D4 e:88, C4 e:88, D4 e:88, R e:88, E4 e:88, E4 e:88 | F4 e:88, G4 e:88, G4 e:88, R e:88, F4 e:88, G4 e:90, E4 q:90 | E4 e:88, R e:88, D4 e:88, C4 e:88, G4 e:92, R e:88, E4 e:92, C4 e:98',
    minRests: 4,
    bars: 4,
  },
  {
    prompt: 'jazzy lo-fi chord melody',
    presetId: 'generic',
    canonical:
      'G4 e:65, F4 e:65, E4 q:65, D4 e:65, E4 e:65, C4 q:65 | E4 e:65, D4 e:65, E4 q:65, E4 e:65, C4 e:65, C4 q:65 | A4 e:65, G4 e:65, F4 q:65, E4 e:65, F4 e:65, E4 q:67 | E4 e:65, D4 e:65, E4 q:65, E4 e:65, E4 e:69, C4 q:75',
    bars: 4,
  },
];

/** Direct plan fixture to exercise the house preset without prompt ambiguity. */
export const HOUSE_PLAN_FIXTURE = {
  tempo: 120,
  key: 'C',
  mode: 'major' as const,
  beatsPerBar: 4,
  beatValue: 4,
  bars: 4,
  mood: 'energetic' as const,
  genre: 'nu-disco' as const,
  contour: 'undulating' as const,
  density: 'medium' as const,
  syncopation: 'heavy' as const,
  register: 'mid' as const,
  repetition: 'high' as const,
  motifLength: 2,
  instrument: 80,
  velocity: 90,
  groove: 0.72,
  brightness: 0.58,
  energy: 0.7,
  motifStrength: 0.68,
  variationRate: 0.35,
  chordToneBias: 0.62,
  stepLeapBalance: 0.48,
  cadenceStrength: 0.6,
};

export const FUNK_PLAN_FIXTURE = {
  ...HOUSE_PLAN_FIXTURE,
  genre: 'funk' as const,
  groove: 0.78,
  syncopation: 'heavy' as const,
};
