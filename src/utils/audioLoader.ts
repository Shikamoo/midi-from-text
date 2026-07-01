/**
 * audioLoader.ts
 *
 * Loads an audio file (WAV, MP3, OGG, FLAC, M4A) via the Web Audio API and
 * optionally resamples it to a lower sample rate for faster pitch detection.
 *
 * Design notes
 * ────────────
 * • Only one AudioContext is created per call (closed immediately after use).
 * • Resampling is done offline via OfflineAudioContext, which is much faster
 *   than real-time playback.
 * • The target sample rate (11 025 Hz) is the Nyquist-safe floor for detecting
 *   pitches up to ~5 500 Hz — well above the highest note we expect to find.
 */

import type { LoadedAudio } from '../types/audio';

/** Audio longer than this will be truncated with a warning. */
export const MAX_AUDIO_SECONDS = 120;

/**
 * Target sample rate for the pitch-detection buffer.
 * Lower = faster YIN, but cannot detect notes above sampleRate/2 Hz.
 * 11 025 Hz → max detectable ≈ 5 512 Hz (well above piano top C ≈ 4 186 Hz).
 */
const TARGET_SAMPLE_RATE = 11_025;

const ACCEPTED_EXTENSIONS = [
  '.wav', '.wave',
  '.mp3',
  '.ogg', '.oga',
  '.flac',
  '.m4a', '.aac',
  '.webm',
];

/** Validate the file extension. Returns null if OK, error string otherwise. */
export function validateAudioFile(file: File): string | null {
  const lower = file.name.toLowerCase();
  const ok = ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
  if (!ok) {
    return `"${file.name}" is not a supported audio format. Accepted: WAV, MP3, OGG, FLAC, M4A, AAC.`;
  }
  return null;
}

/**
 * Decode and optionally resample an audio file.
 *
 * @param file - Audio File from a drag-drop or file-picker event.
 * @returns    - Decoded + resampled LoadedAudio, or throws on failure.
 */
export async function loadAudioFile(file: File): Promise<LoadedAudio> {
  const arrayBuffer = await file.arrayBuffer();

  // Decode at the native sample rate first
  const decodeCtx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuffer);
  } catch (err) {
    await decodeCtx.close();
    throw new Error(
      `Could not decode "${file.name}". The format may be unsupported by your browser. (${err instanceof Error ? err.message : String(err)})`,
    );
  }
  await decodeCtx.close();

  const originalDuration = decoded.duration;

  // Trim to MAX_AUDIO_SECONDS before resampling to save memory/time
  const trimmedBuffer = decoded.duration > MAX_AUDIO_SECONDS
    ? await trimBuffer(decoded, MAX_AUDIO_SECONDS)
    : decoded;

  // Resample down for faster pitch detection
  const resampled = await resampleBuffer(trimmedBuffer, TARGET_SAMPLE_RATE);

  return {
    buffer: resampled,
    fileName: file.name,
    durationSeconds: originalDuration,
    sampleRate: resampled.sampleRate,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

async function trimBuffer(buffer: AudioBuffer, maxSeconds: number): Promise<AudioBuffer> {
  const trimmedLength = Math.floor(maxSeconds * buffer.sampleRate);
  const offCtx = new OfflineAudioContext(
    buffer.numberOfChannels,
    trimmedLength,
    buffer.sampleRate,
  );
  const src = offCtx.createBufferSource();
  src.buffer = buffer;
  src.connect(offCtx.destination);
  src.start(0);
  return offCtx.startRendering();
}

async function resampleBuffer(buffer: AudioBuffer, targetRate: number): Promise<AudioBuffer> {
  if (buffer.sampleRate <= targetRate) return buffer;

  const ratio = targetRate / buffer.sampleRate;
  const targetLength = Math.ceil(buffer.length * ratio);

  const offCtx = new OfflineAudioContext(
    buffer.numberOfChannels,
    targetLength,
    targetRate,
  );
  const src = offCtx.createBufferSource();
  src.buffer = buffer;
  src.connect(offCtx.destination);
  src.start(0);
  return offCtx.startRendering();
}
