/**
 * stemSeparator.ts
 *
 * Approximate source separation using frequency-domain filtering.
 * Splits an AudioBuffer into a "bass" stem (low frequencies) and an "other"
 * stem (remaining frequencies) via Web Audio API BiquadFilterNodes rendered
 * offline.
 *
 * ⚠️  LIMITATION — This is a simple frequency split, NOT true source
 * separation.  Piano left-hand vs. right-hand cannot be reliably isolated
 * this way.  Expect bleed between stems for complex polyphonic material.
 * Results are best on recordings with a clear bass-register instrument
 * (e.g. bass guitar, double bass, cello) separate from mid/high instruments.
 */

import type { StemBuffers } from '../types/audio';

/**
 * Crossover frequency.  Notes below this threshold go to the bass stem;
 * notes above go to the other stem.
 * ~300 Hz sits between B3 (247 Hz) and D4 (294 Hz) — a natural break
 * between bass instruments and most melodic instruments.
 */
const BASS_CUTOFF_HZ = 300;

/** Filter slope / resonance.  Higher Q = steeper slope, more ring. */
const FILTER_Q = 1.5;

/**
 * Separate an AudioBuffer into bass and other stems.
 * Both output buffers have the same sample rate and channel count as the input.
 */
export async function separateStems(buffer: AudioBuffer): Promise<StemBuffers> {
  const [bass, other] = await Promise.all([
    renderFiltered(buffer, 'lowpass'),
    renderFiltered(buffer, 'highpass'),
  ]);
  return { bass, other };
}

// ─── Internal ─────────────────────────────────────────────────────────────

async function renderFiltered(
  source: AudioBuffer,
  filterType: 'lowpass' | 'highpass',
): Promise<AudioBuffer> {
  const offCtx = new OfflineAudioContext(
    source.numberOfChannels,
    source.length,
    source.sampleRate,
  );

  const srcNode = offCtx.createBufferSource();
  srcNode.buffer = source;

  const filter = offCtx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = BASS_CUTOFF_HZ;
  filter.Q.value = FILTER_Q;

  srcNode.connect(filter);
  filter.connect(offCtx.destination);
  srcNode.start(0);

  return offCtx.startRendering();
}
