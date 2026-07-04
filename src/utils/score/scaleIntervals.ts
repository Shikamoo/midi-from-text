/**
 * Planner scaleType → semitone intervals from root.
 */

export interface ResolvedScale {
  id: string;
  intervals: number[];
  /** Inclusive max scale-degree index (0-based, one octave). */
  maxDegree: number;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const MIXOLYDIAN = [0, 2, 4, 5, 7, 9, 10];
const MAJOR_PENTATONIC = [0, 2, 4, 7, 9];
const MINOR_PENTATONIC = [0, 3, 5, 7, 10];

export function resolvePlannerScale(
  scaleType: string,
  fallbackMode: 'major' | 'minor' = 'major',
): ResolvedScale {
  const s = scaleType.trim().toLowerCase();

  if (/major pentatonic|pentatonic major|maj pent/i.test(s)) {
    return { id: 'major-pentatonic', intervals: MAJOR_PENTATONIC, maxDegree: 4 };
  }
  if (/minor pentatonic|pentatonic minor|min pent/i.test(s)) {
    return { id: 'minor-pentatonic', intervals: MINOR_PENTATONIC, maxDegree: 4 };
  }
  if (/dorian/i.test(s)) {
    return { id: 'dorian', intervals: DORIAN, maxDegree: 6 };
  }
  if (/mixolydian/i.test(s)) {
    return { id: 'mixolydian', intervals: MIXOLYDIAN, maxDegree: 6 };
  }
  if (/minor|aeolian|phrygian|locrian|harmonic|melodic/i.test(s)) {
    return { id: 'minor', intervals: MINOR, maxDegree: 6 };
  }
  if (/major|ionian|lydian/i.test(s)) {
    return { id: 'major', intervals: MAJOR, maxDegree: 6 };
  }

  const intervals = fallbackMode === 'minor' ? MINOR : MAJOR;
  return { id: fallbackMode, intervals, maxDegree: intervals.length - 1 };
}

export function chordToneDegreesForScale(maxDegree: number): number[] {
  if (maxDegree <= 4) return [0, 2, maxDegree];
  return [0, 2, 4];
}
