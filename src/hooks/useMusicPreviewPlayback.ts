/**
 * useMusicPreviewPlayback.ts
 *
 * React hook for in-browser synth preview of committed MusicData (text mode).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MusicData } from '../types/music';
import { buildPreviewNotes } from '../utils/musicPreviewSchedule';
import {
  createMusicPreviewPlayer,
  DEFAULT_PREVIEW_PLAYBACK_OPTIONS,
  type PreviewPlaybackOptions,
  type PreviewWaveform,
} from '../utils/musicPreviewPlayer';

export function useMusicPreviewPlayback() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopPreview, setLoopPreview] = useState(false);
  const [previewWaveform, setPreviewWaveform] = useState<PreviewWaveform>(
    DEFAULT_PREVIEW_PLAYBACK_OPTIONS.waveform,
  );
  const [previewVolume, setPreviewVolume] = useState(
    DEFAULT_PREVIEW_PLAYBACK_OPTIONS.volume,
  );
  const [previewHarmonyVolume, setPreviewHarmonyVolume] = useState(
    DEFAULT_PREVIEW_PLAYBACK_OPTIONS.harmonyVolume,
  );

  const loopRef = useRef(false);
  const dataRef = useRef<MusicData | null>(null);
  const gateRef = useRef(false);
  const optionsRef = useRef<PreviewPlaybackOptions>({ ...DEFAULT_PREVIEW_PLAYBACK_OPTIONS });
  const playerRef = useRef<ReturnType<typeof createMusicPreviewPlayer> | null>(null);

  loopRef.current = loopPreview;
  optionsRef.current = {
    waveform: previewWaveform,
    volume: previewVolume,
    harmonyVolume: previewHarmonyVolume,
  };

  function handleEnded() {
    if (
      loopRef.current &&
      gateRef.current &&
      dataRef.current &&
      buildPreviewNotes(dataRef.current).length > 0
    ) {
      playerRef.current?.setOptions(optionsRef.current);
      void playerRef.current?.play(dataRef.current);
      return;
    }
    setIsPlaying(false);
  }

  if (!playerRef.current) {
    playerRef.current = createMusicPreviewPlayer(handleEnded);
  }

  useEffect(() => {
    playerRef.current?.setOptions(optionsRef.current);
  }, [previewWaveform, previewVolume, previewHarmonyVolume]);

  useEffect(() => {
    const player = playerRef.current;
    return () => player?.stop();
  }, []);

  const setPlaybackGate = useCallback((enabled: boolean) => {
    gateRef.current = enabled;
  }, []);

  const play = useCallback(async (data: MusicData) => {
    dataRef.current = data;
    playerRef.current!.setOptions(optionsRef.current);
    setIsPlaying(true);
    await playerRef.current!.play(data);
  }, []);

  const stop = useCallback(() => {
    playerRef.current!.stop();
    setIsPlaying(false);
  }, []);

  const toggle = useCallback(
    async (data: MusicData | null, enabled: boolean) => {
      gateRef.current = enabled;
      if (playerRef.current!.isPlaying) {
        stop();
        return;
      }
      if (!enabled || !data) return;
      await play(data);
    },
    [play, stop],
  );

  return {
    isPlaying,
    loopPreview,
    setLoopPreview,
    previewWaveform,
    setPreviewWaveform,
    previewVolume,
    setPreviewVolume,
    previewHarmonyVolume,
    setPreviewHarmonyVolume,
    setPlaybackGate,
    play,
    stop,
    toggle,
  };
}
