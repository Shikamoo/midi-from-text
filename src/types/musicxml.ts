// ─── MusicXML-specific data model ────────────────────────────────────────────
//
// These types represent the parsed intermediate form of a MusicXML file.
// They sit between raw XML and the app's internal MusicData shape.
// The conversion MusicXMLScore → MusicData happens in scoreToMusicData.ts.

import type { PitchName, DurationBeats } from './music';

// ─── Note-level ───────────────────────────────────────────────────────────────

/** A single note or rest parsed from a MusicXML measure. */
export interface MusicXMLNote {
  /** Pitch name (e.g. "C4", "F#3") or "rest" */
  pitch: PitchName | 'rest';
  /** MIDI note number 0-127, or -1 for rests */
  midiNote: number;
  /** Duration in quarter-note beats */
  duration: DurationBeats;
  /** Beat offset within the measure (0 = start of measure) */
  startBeat: number;
  /** Velocity 0-127 derived from dynamics markings; defaults to 80 (mf) */
  velocity: number;
  /**
   * True when this note shares a start position with the preceding note
   * (i.e. it appeared after a <chord/> element in the source). Chord notes
   * do not advance the beat cursor.
   */
  isChordNote: boolean;
  /** Voice number from <voice> element (1-based). Used for tie disambiguation. */
  voice: number;
  /** This note starts a tie — its sound should continue into the next note. */
  tieStart: boolean;
  /** This note is a tie continuation — merge its duration with the preceding same-pitch note. */
  tieStop: boolean;
}

// ─── Measure-level ────────────────────────────────────────────────────────────

export interface MusicXMLMeasure {
  /** 1-based measure number from the source */
  number: number;
  notes: MusicXMLNote[];
  /** Beats per bar as it applies to this measure (may change mid-score) */
  beatsPerBar: number;
  beatValue: number;
}

// ─── Part-level ───────────────────────────────────────────────────────────────

export interface MusicXMLPart {
  /** The id attribute of the <part> element, e.g. "P1" */
  id: string;
  /** Human-readable part name from <part-name> */
  name: string;
  /** GM program number 0-indexed (0 = piano). Parsed from <midi-program>. */
  instrument: number;
  measures: MusicXMLMeasure[];
}

// ─── Score-level ──────────────────────────────────────────────────────────────

export interface MusicXMLScore {
  /** From <work-title> or <movement-title>, null if absent */
  title: string | null;
  /** From <creator type="composer">, null if absent */
  composer: string | null;
  parts: MusicXMLPart[];
  /** Initial time signature numerator */
  beatsPerBar: number;
  /** Initial time signature denominator */
  beatValue: number;
  /** Tempo in BPM (from <sound tempo="..."> or <per-minute>, defaults to 120) */
  bpm: number;
  /** Key name e.g. "C", "F#", "Bb" */
  key: string;
  musicalMode: 'major' | 'minor';
  /** Max measure count across all parts */
  totalMeasures: number;
  /** Total non-rest notes across all parts */
  noteCount: number;
}

// ─── Parse result ─────────────────────────────────────────────────────────────

export interface MusicXMLParseResult {
  ok: boolean;
  score: MusicXMLScore | null;
  error: string | null;
  warnings: string[];
}
