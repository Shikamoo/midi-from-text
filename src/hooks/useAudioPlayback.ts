/**
 * useAudioPlayback.ts
 *
 * Manages audio playback for a loaded audio file using the Web Audio API.
 * The hook is intentionally independent of the analysis pipeline — it does
 * its own decode so analysis can use a downsampled copy while playback uses
 * full-quality audio.
 *
 * currentTime is updated at ~60 fps via requestAnimationFrame during playback.
 * All heavy audio state lives in refs so only the values that the UI actually
 * needs to show (currentTime, status) live in React state.
 *
 * Invariants:
 *  - Calling play() while already playing restarts from the current offset.
 *  - Calling seek() while playing restarts from the new position.
 *  - When a source runs to its natural end, status returns to 'ready' and
 *    currentTime resets to 0 (ready to play again from the start).
 */

import { useState, useRef, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────

export type PlaybackStatus = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'error';

interface PlaybackState {
  status: PlaybackStatus;
  /** Current playback position in seconds. */
  currentTime: number;
  /** Total duration of the loaded audio in seconds. */
  duration: number;
  error: string | null;
}

const INITIAL: PlaybackState = {
  status: 'idle',
  currentTime: 0,
  duration: 0,
  error: null,
};

// ─── Hook ─────────────────────────────────────────────────────────────────

export function useAudioPlayback() {
  const [state, setState] = useState<PlaybackState>(INITIAL);

  // All audio state lives in refs to avoid unnecessary re-renders during RAF
  const ctxRef    = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  /** Position (seconds) from which the last play() started. */
  const offsetRef = useRef(0);
  /** AudioContext.currentTime when the last play() was called. */
  const startRef  = useRef(0);
  const rafRef    = useRef<number | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      killRaf();
      killSource();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== 'closed') void ctx.close();
    };
  }, []);

  // ── Internal helpers ────────────────────────────────────────────────────

  function getCtx(): AudioContext {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new AudioContext();
    }
    return ctxRef.current;
  }

  function killSource() {
    const src = sourceRef.current;
    if (src) {
      src.onended = null;       // disconnect before stop to suppress spurious onended
      try { src.stop(); } catch { /* already stopped is fine */ }
      sourceRef.current = null;
    }
  }

  function killRaf() {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }

  function startRaf() {
    function tick() {
      const ctx = ctxRef.current;
      const buf = bufferRef.current;
      if (!ctx || !buf) return;
      const ct = Math.min(offsetRef.current + (ctx.currentTime - startRef.current), buf.duration);
      setState((s) => ({ ...s, currentTime: ct }));
      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
  }

  /** Create a new source node and start it from `fromSeconds`. */
  function startSource(fromSeconds: number) {
    const buf = bufferRef.current;
    if (!buf) return;
    const ctx = getCtx();

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);

    const safeFrom = Math.max(0, Math.min(fromSeconds, buf.duration));
    src.start(0, safeFrom);

    offsetRef.current = safeFrom;
    startRef.current  = ctx.currentTime;
    sourceRef.current = src;

    src.onended = () => {
      // Guard: if sourceRef was replaced (killSource called first), ignore
      if (sourceRef.current !== src) return;
      killRaf();
      offsetRef.current  = 0;
      sourceRef.current  = null;
      setState({ status: 'ready', currentTime: 0, duration: buf.duration, error: null });
    };
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Decode the file at native quality for playback. Independent of the
   * analysis pipeline which uses a downsampled copy.
   */
  const loadFile = useCallback(async (file: File) => {
    killRaf();
    killSource();
    offsetRef.current = 0;
    setState({ status: 'loading', currentTime: 0, duration: 0, error: null });

    try {
      const arrayBuffer = await file.arrayBuffer();
      const ctx = getCtx();
      await ctx.resume();
      const buffer = await ctx.decodeAudioData(arrayBuffer);
      bufferRef.current = buffer;
      setState({ status: 'ready', currentTime: 0, duration: buffer.duration, error: null });
    } catch (err) {
      bufferRef.current = null;
      setState({
        status: 'error',
        currentTime: 0,
        duration: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const play = useCallback(async () => {
    if (!bufferRef.current) return;
    killRaf();
    killSource();
    const ctx = getCtx();
    await ctx.resume();
    startSource(offsetRef.current);
    setState((s) => ({ ...s, status: 'playing' }));
    startRaf();
  }, []);

  const pause = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || !sourceRef.current) return;
    killRaf();
    // Capture position before stopping
    offsetRef.current = Math.min(
      offsetRef.current + (ctx.currentTime - startRef.current),
      bufferRef.current?.duration ?? 0,
    );
    killSource();
    setState((s) => ({ ...s, status: 'paused', currentTime: offsetRef.current }));
  }, []);

  const seek = useCallback((seconds: number) => {
    const buf = bufferRef.current;
    if (!buf) return;
    const wasPlaying = !!sourceRef.current;
    const target = Math.max(0, Math.min(seconds, buf.duration));

    killRaf();
    killSource();
    offsetRef.current = target;
    setState((s) => ({ ...s, currentTime: target }));

    if (wasPlaying) {
      startSource(target);
      setState((s) => ({ ...s, status: 'playing' }));
      startRaf();
    }
  }, []);

  return {
    ...state,
    isPlaying: state.status === 'playing',
    hasAudio:  ['ready', 'playing', 'paused'].includes(state.status),
    loadFile,
    play,
    pause,
    seek,
  };
}
