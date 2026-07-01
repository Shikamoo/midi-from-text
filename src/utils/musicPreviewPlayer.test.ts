import { describe, expect, it } from 'vitest';
import {
  previewPeakGain,
  waveformGainScale,
  waveformOscType,
} from './musicPreviewPlayer';

describe('musicPreviewPlayer helpers', () => {
  it('maps waveforms to oscillator types', () => {
    expect(waveformOscType('sine')).toBe('sine');
    expect(waveformOscType('triangle')).toBe('triangle');
    expect(waveformOscType('soft-saw')).toBe('sawtooth');
  });

  it('soft saw uses a lower gain scale than sine/triangle', () => {
    expect(waveformGainScale('soft-saw')).toBeLessThan(waveformGainScale('sine'));
    expect(waveformGainScale('soft-saw')).toBeLessThan(waveformGainScale('triangle'));
  });

  it('previewPeakGain scales velocity and waveform', () => {
    const base = previewPeakGain(127, 'triangle');
    const softSaw = previewPeakGain(127, 'soft-saw');
    const quietVel = previewPeakGain(64, 'triangle');

    expect(softSaw).toBeLessThan(base);
    expect(quietVel).toBeLessThan(base);
  });
});
