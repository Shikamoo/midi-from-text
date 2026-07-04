/**
 * MelodyControls.tsx
 *
 * User-facing melody density for prompt-mode generation.
 */

import type { MelodyDensity, MusicConfig } from '../types/music';

interface Props {
  config: MusicConfig;
  onConfigChange: (patch: Partial<MusicConfig>) => void;
  disabled?: boolean;
}

const DENSITY_OPTIONS: { id: MelodyDensity; label: string }[] = [
  { id: 'sparse', label: 'Sparse' },
  { id: 'normal', label: 'Normal' },
  { id: 'busy', label: 'Busy' },
];

export function MelodyControls({ config, onConfigChange, disabled = false }: Props) {
  return (
    <label
      className="preview-control"
      title="Controls how active or sparse the melody is."
    >
      <span className="preview-control-label">Melody Density</span>
      <select
        className="preview-control-select"
        value={config.melodyDensity}
        disabled={disabled}
        aria-describedby="melody-density-help"
        onChange={(e) =>
          onConfigChange({ melodyDensity: e.target.value as MelodyDensity })
        }
      >
        {DENSITY_OPTIONS.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
      <span id="melody-density-help" className="preview-control-hint">
        Controls how active or sparse the melody is.
      </span>
    </label>
  );
}
