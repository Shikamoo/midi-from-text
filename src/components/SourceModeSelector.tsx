/**
 * SourceModeSelector.tsx
 *
 * UI for selecting the audio source mode and pitch-range filter before
 * the analysis step.  Also lets the user set BPM and time signature.
 *
 * Kept as a pure presentational component — all state is owned by the caller.
 */

import type { SourceMode, PitchRangeFilter } from '../types/music';

// ─── Source mode options ──────────────────────────────────────────────────

interface SourceOption {
  id: SourceMode;
  label: string;
  description: string;
}

const SOURCE_OPTIONS: SourceOption[] = [
  {
    id: 'full-mix',
    label: 'Full mix',
    description: 'Detect notes from the unfiltered audio.',
  },
  {
    id: 'bass-only',
    label: 'Bass stem only',
    description: 'Low-pass ≤ 300 Hz bass band. Note detection runs on the bass stem only.',
  },
  {
    id: 'other-only',
    label: 'Other stem only',
    description: 'High-pass > 300 Hz upper band. Note detection runs on the non-bass stem only.',
  },
  {
    id: 'split-both',
    label: 'Split and extract both',
    description: 'Separate bass and upper detection → two-track MIDI export.',
  },
];

// ─── Pitch range options ──────────────────────────────────────────────────

interface RangeOption {
  id: PitchRangeFilter;
  label: string;
}

const RANGE_OPTIONS: RangeOption[] = [
  { id: 'auto',     label: 'Auto (no filter)' },
  { id: 'bass',     label: 'Bass range (E1–G3)' },
  { id: 'mid-high', label: 'Mid/high range (G3–C8)' },
];

// ─── Props ────────────────────────────────────────────────────────────────

interface Props {
  sourceMode: SourceMode;
  pitchRange: PitchRangeFilter;
  bpm: number;
  beatsPerBar: number;
  onSourceMode: (m: SourceMode) => void;
  onPitchRange: (r: PitchRangeFilter) => void;
  onBpm: (bpm: number) => void;
  onBeatsPerBar: (b: number) => void;
}

// ─── Component ────────────────────────────────────────────────────────────

export function SourceModeSelector({
  sourceMode,
  pitchRange,
  bpm,
  beatsPerBar,
  onSourceMode,
  onPitchRange,
  onBpm,
  onBeatsPerBar,
}: Props) {
  return (
    <div className="source-mode-selector">
      {/* Source mode cards */}
      <div className="source-mode-group">
        <span className="section-label">Source mode</span>
        <div className="source-mode-cards">
          {SOURCE_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              className={`source-mode-card${sourceMode === opt.id ? ' active' : ''}`}
              onClick={() => onSourceMode(opt.id)}
              title={opt.description}
              type="button"
            >
              <span className="source-mode-card-label">{opt.label}</span>
              <span className="source-mode-card-desc">{opt.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Pitch-range filter + settings row */}
      <div className="source-settings-row">
        {/* Pitch range */}
        <div className="field">
          <label className="field-label">Pitch range filter</label>
          <select
            className="field-input"
            value={pitchRange}
            onChange={(e) => onPitchRange(e.target.value as PitchRangeFilter)}
          >
            {RANGE_OPTIONS.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        </div>

        {/* BPM */}
        <div className="field">
          <label className="field-label">Tempo (BPM)</label>
          <input
            className="field-input"
            type="number"
            min={20}
            max={300}
            value={bpm}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!Number.isNaN(v)) onBpm(Math.max(20, Math.min(300, v)));
            }}
          />
        </div>

        {/* Beats per bar */}
        <div className="field">
          <label className="field-label">Beats / bar</label>
          <input
            className="field-input"
            type="number"
            min={2}
            max={12}
            value={beatsPerBar}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!Number.isNaN(v)) onBeatsPerBar(Math.max(2, Math.min(12, v)));
            }}
          />
        </div>
      </div>

      {/* How it works hint */}
      <div className="source-approx-warning">
        <span className="source-approx-icon">⚠</span>
        <span>
          Approximate pre-processing only — not true source separation.
          A 300 Hz crossover splits bass from upper register; piano melody vs.
          accompaniment and classical left-hand vs. right-hand cannot be
          reliably isolated. Best for recordings with a distinct bass
          instrument (bass guitar, double bass, cello) separate from melody.
        </span>
      </div>
    </div>
  );
}
