/**
 * HarmonyControls.tsx
 *
 * Compact harmony controls for prompt-mode text generation.
 */

import type { HarmonyCadenceStrength, HarmonyChordComplexity, HarmonyChordDensity, HarmonyVoicingWidth, MusicConfig } from '../types/music';

interface Props {
  config: MusicConfig;
  chordsEnabled: boolean;
  harmonyVolume: number;
  onConfigChange: (patch: Partial<MusicConfig>) => void;
  onChordsEnabledChange: (enabled: boolean) => void;
  onHarmonyVolumeChange: (volume: number) => void;
  disabled?: boolean;
  showGenerationControls?: boolean;
}

const VOICING_OPTIONS: { id: HarmonyVoicingWidth; label: string }[] = [
  { id: 'tight', label: 'Tight' },
  { id: 'normal', label: 'Normal' },
  { id: 'wide', label: 'Wide' },
];

const DENSITY_OPTIONS: { id: HarmonyChordDensity; label: string }[] = [
  { id: '1-per-bar', label: '1/bar' },
  { id: '2-per-bar', label: '2/bar' },
];

const CADENCE_OPTIONS: { id: HarmonyCadenceStrength; label: string }[] = [
  { id: 'soft', label: 'Soft' },
  { id: 'medium', label: 'Medium' },
  { id: 'strong', label: 'Strong' },
];

const COMPLEXITY_OPTIONS: { id: HarmonyChordComplexity; label: string }[] = [
  { id: 'triads', label: 'Triads' },
  { id: 'sevenths', label: 'Sevenths' },
];

export function HarmonyControls({
  config,
  chordsEnabled,
  harmonyVolume,
  onConfigChange,
  onChordsEnabledChange,
  onHarmonyVolumeChange,
  disabled = false,
  showGenerationControls = true,
}: Props) {
  return (
    <div className="preview-controls harmony-controls" aria-label="Harmony settings">
      <label className="preview-control preview-control-checkbox" title="Include chord track in preview and MIDI export">
        <input
          type="checkbox"
          checked={chordsEnabled}
          disabled={disabled}
          onChange={(e) => onChordsEnabledChange(e.target.checked)}
        />
        <span className="preview-control-label">Chords</span>
      </label>

      {chordsEnabled && (
        <label className="preview-control preview-control-volume" title="Harmony preview volume (does not affect MIDI export)">
          <span className="preview-control-label">Chord vol</span>
          <input
            className="preview-control-slider"
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(harmonyVolume * 100)}
            disabled={disabled}
            onChange={(e) => onHarmonyVolumeChange(parseInt(e.target.value, 10) / 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(harmonyVolume * 100)}
          />
        </label>
      )}

      {showGenerationControls && (
        <>
          <label className="preview-control" title="Triads or diatonic sevenths — regenerate after changing">
            <span className="preview-control-label">Type</span>
            <select
              className="preview-control-select"
              value={config.harmonyChordComplexity}
              disabled={disabled}
              onChange={(e) =>
                onConfigChange({
                  harmonyChordComplexity: e.target.value as HarmonyChordComplexity,
                })
              }
            >
              {COMPLEXITY_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="preview-control" title="Chord spread — regenerate after changing">
            <span className="preview-control-label">Voicing</span>
            <select
              className="preview-control-select"
              value={config.harmonyVoicingWidth}
              disabled={disabled}
              onChange={(e) =>
                onConfigChange({ harmonyVoicingWidth: e.target.value as HarmonyVoicingWidth })
              }
            >
              {VOICING_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="preview-control" title="Chords per bar — regenerate after changing">
            <span className="preview-control-label">Density</span>
            <select
              className="preview-control-select"
              value={config.harmonyChordDensity}
              disabled={disabled}
              onChange={(e) =>
                onConfigChange({
                  harmonyChordDensity: e.target.value as HarmonyChordDensity,
                })
              }
            >
              {DENSITY_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="preview-control" title="Cadence pull near phrase endings — regenerate after changing">
            <span className="preview-control-label">Cadence</span>
            <select
              className="preview-control-select"
              value={config.harmonyCadenceStrength}
              disabled={disabled}
              onChange={(e) =>
                onConfigChange({
                  harmonyCadenceStrength: e.target.value as HarmonyCadenceStrength,
                })
              }
            >
              {CADENCE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <label className="preview-control preview-control-checkbox" title="Allow chord inversions — regenerate after changing">
            <input
              type="checkbox"
              checked={config.harmonyAllowInversions}
              disabled={disabled}
              onChange={(e) => onConfigChange({ harmonyAllowInversions: e.target.checked })}
            />
            <span className="preview-control-label">Inversions</span>
          </label>
          <label className="preview-control preview-control-checkbox" title="Low root reinforcement under each chord — regenerate after changing">
            <input
              type="checkbox"
              checked={config.harmonyBassDoubling}
              disabled={disabled}
              onChange={(e) => onConfigChange({ harmonyBassDoubling: e.target.checked })}
            />
            <span className="preview-control-label">Bass x2</span>
          </label>
        </>
      )}
    </div>
  );
}
