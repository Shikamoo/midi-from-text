/**
 * pitchDetector.ts
 *
 * Fundamental-frequency estimator based on the YIN algorithm.
 *
 * Reference:
 *   De Cheveigné, A. & Kawahara, H. (2002). YIN, a fundamental frequency
 *   estimator for speech and music. Journal of the Acoustical Society of
 *   America, 111(4), 1917–1930.
 *
 * Design notes
 * ────────────
 * • Works on a mono Float32Array obtained by mixing all channels together.
 * • Audio is assumed to already be resampled to a low sample rate (≈11 025 Hz)
 *   by audioLoader.ts before being passed here.  That makes per-frame
 *   computation fast enough for synchronous JS (~300 ms for 60 s @ 11 025 Hz).
 * • Each WINDOW_SIZE-sample frame produces one PitchFrame.  Frames overlap
 *   with hop size HOP_SIZE so rapid pitch changes are captured.
 * • Processing is split into batches and yields to the event loop between
 *   batches so the UI stays responsive.
 */

import type { PitchFrame } from '../types/audio';

// ─── Detection parameters ─────────────────────────────────────────────────

/** Minimum detectable fundamental (Hz). Below = sub-bass / noise. */
const MIN_FREQ_HZ = 40;
/** Maximum detectable fundamental (Hz). At 11 025 Hz sr this is fine up to ~5 000 Hz. */
const MAX_FREQ_HZ = 2_000;

/** Frame size (samples). 1 024 @ 11 025 Hz ≈ 93 ms — good for bass detection. */
const WINDOW_SIZE = 1_024;
/** Overlap hop (samples). 256 @ 11 025 Hz ≈ 23 ms resolution. */
const HOP_SIZE = 256;

/** Aperiodicity threshold: frames with d'(τ) < threshold are voiced. */
const YIN_THRESHOLD = 0.15;

/** Minimum confidence to report a pitch (confidence = 1 - d'(τ_best)). */
export const MIN_CONFIDENCE = 0.5;

/** Number of frames processed per JS event-loop tick. */
const BATCH_SIZE = 30;

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Run YIN pitch detection on an AudioBuffer.
 * Yields to the browser between frame batches.
 *
 * @param buffer      - Source audio (ideally pre-resampled to ~11 025 Hz).
 * @param onProgress  - Optional callback receiving progress 0–100.
 * @returns           - One PitchFrame per analysis window.
 */
export async function detectPitches(
  buffer: AudioBuffer,
  onProgress?: (pct: number) => void,
): Promise<PitchFrame[]> {
  const mono = mixToMono(buffer);
  const sr = buffer.sampleRate;

  const maxLag = Math.min(Math.floor(sr / MIN_FREQ_HZ), Math.floor(WINDOW_SIZE / 2) - 1);
  const minLag = Math.max(1, Math.ceil(sr / MAX_FREQ_HZ));

  const frames: PitchFrame[] = [];
  let offset = 0;
  let batchFrameCount = 0;

  while (offset + WINDOW_SIZE <= mono.length) {
    const slice = mono.subarray(offset, offset + WINDOW_SIZE);
    const timeSeconds = (offset + WINDOW_SIZE / 2) / sr;
    frames.push({ timeSeconds, ...yinEstimate(slice, sr, minLag, maxLag) });

    offset += HOP_SIZE;
    batchFrameCount++;

    if (batchFrameCount % BATCH_SIZE === 0) {
      onProgress?.(Math.round((offset / mono.length) * 100));
      await yieldTick();
    }
  }

  onProgress?.(100);
  return frames;
}

// ─── YIN core ─────────────────────────────────────────────────────────────

function yinEstimate(
  frame: Float32Array,
  sampleRate: number,
  minLag: number,
  maxLag: number,
): { frequency: number | null; confidence: number } {
  const halfW = Math.floor(frame.length / 2);
  const cmnd = computeCMND(frame, halfW, maxLag);

  // Find first τ below threshold (then walk to local minimum)
  let tauEst = -1;
  for (let tau = minLag; tau <= maxLag; tau++) {
    if (cmnd[tau] < YIN_THRESHOLD) {
      while (tau + 1 <= maxLag && cmnd[tau + 1] < cmnd[tau]) tau++;
      tauEst = tau;
      break;
    }
  }

  if (tauEst === -1) return { frequency: null, confidence: 0 };

  const refinedTau = parabolicInterpolation(cmnd, tauEst);
  const frequency = sampleRate / refinedTau;
  const confidence = Math.max(0, 1 - (cmnd[tauEst] ?? 1));

  return { frequency, confidence };
}

/**
 * Compute the Cumulative Mean Normalized Difference function.
 * cmnd[0] = 1 by convention; cmnd[τ] for τ ≥ 1 follows the YIN paper.
 */
function computeCMND(frame: Float32Array, halfW: number, maxLag: number): Float32Array {
  const cmnd = new Float32Array(maxLag + 1);
  cmnd[0] = 1;
  let runningSum = 0;

  for (let tau = 1; tau <= maxLag; tau++) {
    let diff = 0;
    for (let j = 0; j < halfW; j++) {
      const delta = frame[j] - frame[j + tau];
      diff += delta * delta;
    }
    runningSum += diff;
    cmnd[tau] = runningSum === 0 ? 0 : (diff * tau) / runningSum;
  }

  return cmnd;
}

/** Refine τ to sub-sample accuracy via parabolic interpolation. */
function parabolicInterpolation(arr: Float32Array, idx: number): number {
  if (idx <= 0 || idx >= arr.length - 1) return idx;
  const a = arr[idx - 1];
  const b = arr[idx];
  const c = arr[idx + 1];
  const denom = 2 * (a - 2 * b + c);
  if (Math.abs(denom) < 1e-12) return idx;
  return idx + (a - c) / denom;
}

// ─── Utilities ────────────────────────────────────────────────────────────

function mixToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) {
    // Return a copy so we never accidentally mutate the original buffer data
    return buffer.getChannelData(0).slice();
  }
  const length = buffer.length;
  const mono = new Float32Array(length);
  const gain = 1 / buffer.numberOfChannels;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const ch_data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mono[i] += ch_data[i] * gain;
    }
  }
  return mono;
}

function yieldTick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
