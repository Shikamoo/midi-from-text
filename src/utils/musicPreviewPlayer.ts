/**
 * musicPreviewPlayer.ts
 *
 * Lightweight Web Audio synth for previewing MusicData in the browser.
 * Configurable waveform and master volume — preview only, not export.
 */

import type { MusicData } from '../types/music';
import {
  beatToSeconds,
  buildPreviewNotes,
  midiToFrequency,
  previewDurationSeconds,
} from './musicPreviewSchedule';

const ATTACK_SEC = 0.012;
const RELEASE_SEC = 0.04;
const BASE_NOTE_GAIN = 0.22;

export type PreviewWaveform = 'sine' | 'triangle' | 'soft-saw';

export interface PreviewPlaybackOptions {
  waveform: PreviewWaveform;
  /** Melody / master preview volume 0–1 */
  volume: number;
  /** Harmony track preview volume 0–1 (preview only) */
  harmonyVolume: number;
}

export const DEFAULT_PREVIEW_PLAYBACK_OPTIONS: PreviewPlaybackOptions = {
  waveform: 'triangle',
  volume: 0.55,
  harmonyVolume: 0.55,
};

export function waveformOscType(waveform: PreviewWaveform): OscillatorType {
  return waveform === 'soft-saw' ? 'sawtooth' : waveform;
}

export function waveformGainScale(waveform: PreviewWaveform): number {
  return waveform === 'soft-saw' ? 0.42 : 1;
}

export function previewPeakGain(
  velocity: number,
  waveform: PreviewWaveform,
): number {
  return (Math.max(velocity, 1) / 127) * BASE_NOTE_GAIN * waveformGainScale(waveform);
}

export interface MusicPreviewPlayer {
  play(data: MusicData): Promise<void>;
  stop(): void;
  setOptions(options: PreviewPlaybackOptions): void;
  readonly isPlaying: boolean;
}

export function createMusicPreviewPlayer(
  onEnded: () => void,
): MusicPreviewPlayer {
  let ctx: AudioContext | null = null;
  let playing = false;
  let endTimer: ReturnType<typeof setTimeout> | null = null;
  const activeNodes: AudioNode[] = [];
  let masterGain: GainNode | null = null;
  let melodyGain: GainNode | null = null;
  let harmonyGain: GainNode | null = null;
  let options: PreviewPlaybackOptions = { ...DEFAULT_PREVIEW_PLAYBACK_OPTIONS };

  function getCtx(): AudioContext {
    if (!ctx || ctx.state === 'closed') {
      ctx = new AudioContext();
      masterGain = ctx.createGain();
      melodyGain = ctx.createGain();
      harmonyGain = ctx.createGain();
      masterGain.gain.value = 1;
      melodyGain.gain.value = options.volume;
      harmonyGain.gain.value = options.harmonyVolume;
      melodyGain.connect(masterGain);
      harmonyGain.connect(masterGain);
      masterGain.connect(ctx.destination);
    }
    return ctx;
  }

  function ensureGainBus(): { melody: GainNode; harmony: GainNode; master: GainNode } {
    const audioCtx = getCtx();
    if (!masterGain || !melodyGain || !harmonyGain) {
      masterGain = audioCtx.createGain();
      melodyGain = audioCtx.createGain();
      harmonyGain = audioCtx.createGain();
      masterGain.gain.value = 1;
      melodyGain.connect(masterGain);
      harmonyGain.connect(masterGain);
      masterGain.connect(audioCtx.destination);
    }
    melodyGain.gain.value = options.volume;
    harmonyGain.gain.value = options.harmonyVolume;
    return { melody: melodyGain, harmony: harmonyGain, master: masterGain };
  }

  function clearEndTimer() {
    if (endTimer !== null) {
      clearTimeout(endTimer);
      endTimer = null;
    }
  }

  function disconnectNodes() {
    for (const node of activeNodes) {
      try {
        node.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    activeNodes.length = 0;
  }

  function scheduleNote(
    audioCtx: AudioContext,
    output: AudioNode,
    anchor: number,
    midiNote: number,
    startBeat: number,
    durationBeats: number,
    velocity: number,
    bpm: number,
    playbackOptions: PreviewPlaybackOptions,
  ) {
    const startTime = anchor + beatToSeconds(startBeat, bpm);
    const noteDuration = Math.max(beatToSeconds(durationBeats, bpm), 0.02);
    const release = Math.min(RELEASE_SEC, noteDuration * 0.35);
    const sustainEnd = startTime + noteDuration - release;

    const osc = audioCtx.createOscillator();
    osc.type = waveformOscType(playbackOptions.waveform);
    osc.frequency.setValueAtTime(midiToFrequency(midiNote), startTime);

    const gain = audioCtx.createGain();
    const peak = previewPeakGain(velocity, playbackOptions.waveform);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0001), startTime + ATTACK_SEC);
    gain.gain.setValueAtTime(peak, Math.max(startTime + ATTACK_SEC, sustainEnd));
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + noteDuration);

    osc.connect(gain);
    gain.connect(output);
    activeNodes.push(osc, gain);

    osc.start(startTime);
    osc.stop(startTime + noteDuration + 0.01);
  }

  return {
    get isPlaying() {
      return playing;
    },

    setOptions(next: PreviewPlaybackOptions) {
      options = {
        waveform: next.waveform,
        volume: Math.max(0, Math.min(1, next.volume)),
        harmonyVolume: Math.max(0, Math.min(1, next.harmonyVolume)),
      };
      if (melodyGain) melodyGain.gain.value = options.volume;
      if (harmonyGain) harmonyGain.gain.value = options.harmonyVolume;
    },

    async play(data: MusicData) {
      this.stop();

      const notes = buildPreviewNotes(data);
      if (notes.length === 0) {
        onEnded();
        return;
      }

      const audioCtx = getCtx();
      await audioCtx.resume();
      const buses = ensureGainBus();

      const playbackOptions = { ...options };
      const anchor = audioCtx.currentTime + 0.05;

      for (const note of notes) {
        const output = note.trackIndex === 0 ? buses.melody : buses.harmony;
        scheduleNote(
          audioCtx,
          output,
          anchor,
          note.midiNote,
          note.startBeat,
          note.durationBeats,
          note.velocity,
          data.bpm,
          playbackOptions,
        );
      }

      playing = true;
      const totalMs = previewDurationSeconds(data) * 1000 + 80;
      endTimer = setTimeout(() => {
        endTimer = null;
        if (!playing) return;
        playing = false;
        disconnectNodes();
        onEnded();
      }, totalMs);
    },

    stop() {
      clearEndTimer();
      playing = false;
      disconnectNodes();
    },
  };
}
