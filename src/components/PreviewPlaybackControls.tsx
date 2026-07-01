/**
 * PreviewPlaybackControls.tsx
 *
 * Compact preview-only tone and volume controls (text mode).
 */

import type { PreviewWaveform } from '../utils/musicPreviewPlayer';

interface Props {
  waveform: PreviewWaveform;
  volume: number;
  onWaveformChange: (waveform: PreviewWaveform) => void;
  onVolumeChange: (volume: number) => void;
  disabled?: boolean;
}

const WAVEFORM_OPTIONS: { id: PreviewWaveform; label: string }[] = [
  { id: 'sine', label: 'Sine' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'soft-saw', label: 'Soft saw' },
];

export function PreviewPlaybackControls({
  waveform,
  volume,
  onWaveformChange,
  onVolumeChange,
  disabled = false,
}: Props) {
  return (
    <div className="preview-controls" aria-label="Preview playback settings">
      <label className="preview-control">
        <span className="preview-control-label">Tone</span>
        <select
          className="preview-control-select"
          value={waveform}
          disabled={disabled}
          onChange={(e) => onWaveformChange(e.target.value as PreviewWaveform)}
          title="Preview instrument waveform"
        >
          {WAVEFORM_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
      <label className="preview-control preview-control-volume">
        <span className="preview-control-label">Vol</span>
        <input
          className="preview-control-slider"
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(volume * 100)}
          disabled={disabled}
          onChange={(e) => onVolumeChange(parseInt(e.target.value, 10) / 100)}
          title="Preview volume"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(volume * 100)}
        />
      </label>
    </div>
  );
}
