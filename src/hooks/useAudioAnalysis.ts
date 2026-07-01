/**
 * useAudioAnalysis.ts
 *
 * State machine for the audio-to-MIDI pipeline:
 *
 *   idle → loading (file dropped)
 *        → idle (file ready, awaiting user action)
 *        → separating (if sourceMode requires stems)
 *        → detecting (running YIN)
 *        → ready
 *        → error (at any step)
 *
 * Audio buffers are stored in a ref (not state) to avoid re-renders and
 * because AudioBuffer objects are mutable / non-serialisable.
 *
 * The stems are cached between calls: if the user re-analyses with a
 * different sourceMode, we re-use already-separated stems when available.
 */

import { useState, useRef, useCallback, useMemo } from 'react';
import { loadAudioFile } from '../utils/audioLoader';
import { separateStems } from '../utils/stemSeparator';
import { detectPitches } from '../utils/pitchDetector';
import { framesToNotes } from '../utils/audioToNotes';
import {
  cleanupDetectedNotes,
  countDetected,
  DEFAULT_CLEANUP,
  type CleanupOptions,
} from '../utils/noteCleanup';
import type { SourceMode, PitchRangeFilter, NoteEvent } from '../types/music';
import type { AudioStatus, DetectedNotes } from '../types/audio';

// ─── State shape ──────────────────────────────────────────────────────────

export interface AudioAnalysisState {
  status: AudioStatus;
  /** Original file name (null until a file is loaded). */
  fileName: string | null;
  /** Duration of the original file in seconds. */
  durationSeconds: number;
  /** Which source to analyse. */
  sourceMode: SourceMode;
  /** Pitch range filter. */
  pitchRange: PitchRangeFilter;
  /** BPM used for timing conversion. */
  bpm: number;
  /** Beats per bar for MusicData assembly. */
  beatsPerBar: number;
  /** Detected notes by stem. Populated after a successful analysis. */
  notes: DetectedNotes;
  /** Which source label was used for the last successful analysis. */
  analysedSource: string | null;
  /** Progress 0–100 during the "detecting" phase. */
  progress: number;
  /** Non-fatal warnings accumulated during the pipeline. */
  warnings: string[];
  /** Error message, set when status === 'error'. */
  error: string | null;
  /** Pre-export note-cleanup configuration. */
  cleanup: CleanupOptions;
}

const EMPTY_NOTES: DetectedNotes = {
  bassNotes: null,
  otherNotes: null,
  fullNotes: null,
};

const INITIAL_STATE: AudioAnalysisState = {
  status: 'idle',
  fileName: null,
  durationSeconds: 0,
  sourceMode: 'full-mix',
  pitchRange: 'auto',
  bpm: 120,
  beatsPerBar: 4,
  notes: EMPTY_NOTES,
  analysedSource: null,
  progress: 0,
  warnings: [],
  error: null,
  cleanup: DEFAULT_CLEANUP,
};

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useAudioAnalysis() {
  const [state, setState] = useState<AudioAnalysisState>(INITIAL_STATE);

  // AudioBuffers live outside React state (heavy, mutable)
  const fullBufferRef  = useRef<AudioBuffer | null>(null);
  const bassBufferRef  = useRef<AudioBuffer | null>(null);
  const otherBufferRef = useRef<AudioBuffer | null>(null);

  // The BPM that was active when the last analysis ran.
  // Used to warn the user if they change BPM after analysis.
  const analysedBpmRef = useRef<number | null>(null);

  // ── Config setters (lightweight) ────────────────────────────────────────

  const setSourceMode = useCallback((sourceMode: SourceMode) => {
    setState((s) => ({ ...s, sourceMode }));
  }, []);

  const setPitchRange = useCallback((pitchRange: PitchRangeFilter) => {
    setState((s) => ({ ...s, pitchRange }));
  }, []);

  const setBpm = useCallback((bpm: number) => {
    setState((s) => ({ ...s, bpm }));
  }, []);

  const setBeatsPerBar = useCallback((beatsPerBar: number) => {
    setState((s) => ({ ...s, beatsPerBar }));
  }, []);

  const setCleanup = useCallback((partial: Partial<CleanupOptions>) => {
    setState((s) => ({ ...s, cleanup: { ...s.cleanup, ...partial } }));
  }, []);

  /**
   * Clear analysis results while keeping the loaded audio file and all
   * user configuration (source mode, BPM, pitch range, cleanup options).
   * The full audio buffer is retained so the user can re-analyse immediately
   * without re-uploading.  Stem caches are cleared to force a clean run.
   */
  const reset = useCallback(() => {
    bassBufferRef.current   = null;
    otherBufferRef.current  = null;
    analysedBpmRef.current  = null;
    setState((s) => ({
      ...s,
      status: s.fileName ? 'idle' : 'idle',
      notes: EMPTY_NOTES,
      analysedSource: null,
      progress: 0,
      warnings: [],
      error: null,
    }));
  }, []);

  // ── File loading ────────────────────────────────────────────────────────

  const loadFile = useCallback(async (file: File) => {
    setState((s) => ({
      ...s,
      status: 'loading',
      error: null,
      warnings: [],
      notes: EMPTY_NOTES,
      analysedSource: null,
      progress: 0,
    }));

    // Reset cached stems — they belong to the previous file
    bassBufferRef.current = null;
    otherBufferRef.current = null;
    fullBufferRef.current = null;

    try {
      const loaded = await loadAudioFile(file);
      fullBufferRef.current = loaded.buffer;

      const warnings: string[] = [];
      if (loaded.durationSeconds > 120) {
        warnings.push(`File is ${Math.round(loaded.durationSeconds)}s — only the first 120s will be analysed.`);
      }

      setState((s) => ({
        ...s,
        status: 'idle',
        fileName: loaded.fileName,
        durationSeconds: loaded.durationSeconds,
        warnings,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, []);

  // ── Analysis ────────────────────────────────────────────────────────────

  const analyse = useCallback(async () => {
    const full = fullBufferRef.current;
    if (!full) return;

    // Capture config at the moment the user clicks Analyse
    setState((s) => {
      void runAnalysis(s.sourceMode, s.pitchRange, s.bpm, full);
      return { ...s, status: 'detecting', progress: 0, error: null };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Internal pipeline ───────────────────────────────────────────────────

  async function runAnalysis(
    sourceMode: SourceMode,
    pitchRange: PitchRangeFilter,
    bpm: number,
    full: AudioBuffer,
  ) {
    try {
      const notes: DetectedNotes = { bassNotes: null, otherNotes: null, fullNotes: null };
      let analysedSource = '';

      if (sourceMode === 'full-mix') {
        setState((s) => ({ ...s, status: 'detecting' }));
        const frames = await detectPitches(full, (pct) =>
          setState((s) => ({ ...s, progress: pct })),
        );
        notes.fullNotes = framesToNotes(frames, bpm, pitchRange);
        analysedSource = 'Full mix';

      } else {
        // Ensure stems exist (cached if already separated)
        if (!bassBufferRef.current || !otherBufferRef.current) {
          setState((s) => ({ ...s, status: 'separating', progress: 0 }));
          const stems = await separateStems(full);
          bassBufferRef.current = stems.bass;
          otherBufferRef.current = stems.other;
        }

        const bass  = bassBufferRef.current!;
        const other = otherBufferRef.current!;

        setState((s) => ({ ...s, status: 'detecting', progress: 0 }));

        if (sourceMode === 'bass-only') {
          const frames = await detectPitches(bass, (pct) =>
            setState((s) => ({ ...s, progress: pct })),
          );
          const effectiveRange = pitchRange === 'auto' ? 'bass' : pitchRange;
          notes.bassNotes = framesToNotes(frames, bpm, effectiveRange);
          analysedSource = 'Bass range';

        } else if (sourceMode === 'other-only') {
          const frames = await detectPitches(other, (pct) =>
            setState((s) => ({ ...s, progress: pct })),
          );
          const effectiveRange = pitchRange === 'auto' ? 'mid-high' : pitchRange;
          notes.otherNotes = framesToNotes(frames, bpm, effectiveRange);
          analysedSource = 'Upper range';

        } else {
          // split-both: detect both register bands, progress tracks bass (0-50) then other (50-100)
          const bassFrames = await detectPitches(bass, (pct) =>
            setState((s) => ({ ...s, progress: Math.round(pct / 2) })),
          );
          notes.bassNotes = framesToNotes(bassFrames, bpm, 'bass');

          const otherFrames = await detectPitches(other, (pct) =>
            setState((s) => ({ ...s, progress: 50 + Math.round(pct / 2) })),
          );
          notes.otherNotes = framesToNotes(otherFrames, bpm, 'mid-high');
          analysedSource = 'Bass range + Upper range (2-track)';
        }
      }

      const totalNotes = countNotes(notes);
      const warnings: string[] = [];
      if (totalNotes === 0) {
        warnings.push('No notes were detected. Try a different source mode, pitch-range filter, or BPM.');
      } else if (totalNotes < 5) {
        warnings.push(`Only ${totalNotes} note(s) detected — result may be sparse. Check source mode and BPM.`);
      }

      if (sourceMode !== 'full-mix') {
        warnings.push('Register split only — not true source separation. Notes near the 300 Hz crossover may appear in both ranges.');
      }

      // Record the BPM used so we can warn if the user changes it post-analysis
      analysedBpmRef.current = bpm;

      setState((s) => ({
        ...s,
        status: 'ready',
        notes,
        analysedSource,
        progress: 100,
        warnings,
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  function countNotes(notes: DetectedNotes): number {
    return (
      (notes.fullNotes?.length  ?? 0) +
      (notes.bassNotes?.length  ?? 0) +
      (notes.otherNotes?.length ?? 0)
    );
  }

  function activeNotes(): NoteEvent[] {
    return (
      state.notes.fullNotes  ??
      state.notes.bassNotes  ??
      state.notes.otherNotes ??
      []
    );
  }

  // Cleaned notes are derived from raw notes + cleanup config + tempo.
  // Raw `state.notes` stay untouched so the piano roll still shows detection.
  const cleanedNotes = useMemo(
    () => cleanupDetectedNotes(state.notes, state.cleanup, state.bpm),
    [state.notes, state.cleanup, state.bpm],
  );

  return {
    ...state,
    loadFile,
    analyse,
    reset,
    setSourceMode,
    setPitchRange,
    setBpm,
    setBeatsPerBar,
    setCleanup,
    activeNotes,
    cleanedNotes,
    cleanedTotal:  countDetected(cleanedNotes),
    totalNotes:    countNotes(state.notes),
    isReady:       state.status === 'ready' && countNotes(state.notes) > 0,
    isBusy:        state.status === 'loading' || state.status === 'separating' || state.status === 'detecting',
    /** BPM used when the last analysis ran, or null if no analysis yet. */
    analysedBpm:   analysedBpmRef.current,
    /**
     * True when the user has changed BPM after a successful analysis.
     * Cleanup thresholds use the new BPM, but note timing positions were
     * stamped with the old BPM.  Re-analyse to fix timing.
     */
    bpmMismatch:   analysedBpmRef.current !== null && state.bpm !== analysedBpmRef.current,
  };
}
