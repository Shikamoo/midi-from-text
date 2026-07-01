/**
 * CleanupControls.tsx
 *
 * Presentational controls for the pre-export note-cleanup pipeline.
 * Owns no state — all values come from props and changes are reported via
 * onChange.  The actual cleanup logic lives in utils/noteCleanup.ts.
 */

import type { CleanupOptions, QuantizeGrid } from '../utils/noteCleanup';

interface Props {
  options: CleanupOptions;
  onChange: (partial: Partial<CleanupOptions>) => void;
}

const QUANTIZE_OPTIONS: { id: QuantizeGrid; label: string }[] = [
  { id: 'off',  label: 'Off' },
  { id: '1/4',  label: '1/4 note' },
  { id: '1/8',  label: '1/8 note' },
  { id: '1/16', label: '1/16 note' },
];

export function CleanupControls({ options, onChange }: Props) {
  return (
    <div className="cleanup-controls">
      <div className="cleanup-grid">
        {/* Quantize */}
        <div className="field">
          <label className="field-label">Quantize</label>
          <select
            className="field-input"
            value={options.quantize}
            onChange={(e) => onChange({ quantize: e.target.value as QuantizeGrid })}
          >
            {QUANTIZE_OPTIONS.map((q) => (
              <option key={q.id} value={q.id}>{q.label}</option>
            ))}
          </select>
        </div>

        {/* Minimum note length */}
        <div className="field">
          <label className="field-label">Min note length (ms)</label>
          <input
            className="field-input"
            type="number"
            min={0}
            max={2000}
            step={10}
            value={options.minNoteMs}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!Number.isNaN(v)) onChange({ minNoteMs: Math.max(0, Math.min(2000, v)) });
            }}
          />
        </div>
      </div>

      {/* Toggles */}
      <div className="cleanup-toggles">
        <label className="cleanup-toggle">
          <input
            type="checkbox"
            checked={options.mergeRepeated}
            onChange={(e) => onChange({ mergeRepeated: e.target.checked })}
          />
          <span>
            Merge repeated same-pitch notes
            <span className="cleanup-toggle-hint">joins fragments with a tiny gap</span>
          </span>
        </label>

        <label className="cleanup-toggle">
          <input
            type="checkbox"
            checked={options.legato}
            onChange={(e) => onChange({ legato: e.target.checked })}
          />
          <span>
            Legato smoothing
            <span className="cleanup-toggle-hint">extend notes toward the next when the gap is small</span>
          </span>
        </label>
      </div>
    </div>
  );
}
