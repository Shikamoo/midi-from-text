/**
 * audioColors.ts
 *
 * Track colour palette shared between PianoRoll and AudioAnalysisPanel.
 * Kept in its own file so the component files export only components
 * (satisfying the Fast Refresh constraint).
 */

import type { NoteEvent } from '../types/music';

/** A rendered piano-roll track. */
export interface PianoTrack {
  name: string;
  notes: NoteEvent[];
  /** Full-brightness CSS colour (used for labels, highlights). */
  color: string;
  /** Slightly transparent variant used for note body fill. */
  dimColor: string;
}

/** Canonical colours for the three source-mode tracks. */
export const TRACK_COLORS: Record<'bass' | 'other' | 'full', { color: string; dimColor: string }> = {
  bass:  { color: '#4fc3f7', dimColor: 'rgba(79,195,247,0.82)'  },
  other: { color: '#ffb74d', dimColor: 'rgba(255,183,77,0.82)'  },
  full:  { color: '#81c784', dimColor: 'rgba(129,199,132,0.82)' },
};
