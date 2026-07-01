/**
 * InputRepairPanel.tsx
 *
 * Compact parse summary + one-click repair actions.
 * UI only — repair logic lives in repairMusicText.ts / inputDiagnostics.ts.
 */

import type { MusicInputResult } from '../hooks/useMusicInput';
import type { InputDiagnostics } from '../utils/inputDiagnostics';
import type { RepairActionId } from '../utils/repairMusicText';
import { describeMusicPlan } from '../utils/promptToPlan';

interface Props {
  rawText: string;
  input: MusicInputResult;
  diagnostics: InputDiagnostics;
  onRepair: (actionId: RepairActionId) => void;
}

export function InputRepairPanel({ rawText, input, diagnostics, onRepair }: Props) {
  const { stats, humanIssues, repairs, showNormalized } = diagnostics;
  const { musicPlan, planConfidence, normalizedText } = input;

  const errors = humanIssues.filter((i) => i.severity === 'error');
  const warnings = humanIssues.filter((i) => i.severity === 'warning');
  const infos = humanIssues.filter((i) => i.severity === 'info');

  return (
    <div className="repair-panel">
      <div className="repair-panel-header">
        <span className="repair-panel-title">Parse Summary</span>
        {!input.canExport && rawText.trim() && (
          <span className="repair-badge repair-badge-error">Export blocked</span>
        )}
        {input.canExport && rawText.trim() && (
          <span className="repair-badge repair-badge-ok">Ready</span>
        )}
      </div>

      {/* Stats row */}
      <div className="meta-chips repair-stats">
        <div className="meta-chip">
          <span className="meta-chip-label">Mode</span>
          <span className="meta-chip-value" title={`${Math.round(stats.modeConfidence * 100)}% confidence`}>
            {stats.modeLabel}
          </span>
        </div>
        <div className="meta-chip">
          <span className="meta-chip-label">Notes</span>
          <span className="meta-chip-value">{stats.noteCount}</span>
        </div>
        {stats.restCount > 0 && (
          <div className="meta-chip">
            <span className="meta-chip-label">Rests</span>
            <span className="meta-chip-value">{stats.restCount}</span>
          </div>
        )}
        <div className="meta-chip">
          <span className="meta-chip-label">Bars</span>
          <span className="meta-chip-value">{stats.barCount}</span>
        </div>
        <div className="meta-chip">
          <span className="meta-chip-label">Meter</span>
          <span className="meta-chip-value">{stats.meter}</span>
        </div>
      </div>

      {/* Plan one-liner (prompt path) */}
      {musicPlan && (
        <p className="repair-plan-line">
          {describeMusicPlan(musicPlan)}
          <span className="repair-plan-conf"> · {Math.round(planConfidence * 100)}%</span>
        </p>
      )}

      {/* Normalized text */}
      {normalizedText && (showNormalized || musicPlan) && (
        <details className="repair-normalized" open={showNormalized && !musicPlan}>
          <summary className="repair-normalized-summary">
            {musicPlan ? 'Generated notes' : 'Normalized text'}
          </summary>
          <pre className="canonical-notes">{normalizedText}</pre>
        </details>
      )}

      {/* Issues */}
      {(errors.length > 0 || warnings.length > 0 || infos.length > 0) && (
        <ul className="repair-issues">
          {errors.map((issue, i) => (
            <li key={`e${i}`} className="repair-issue repair-issue-error">{issue.message}</li>
          ))}
          {warnings.map((issue, i) => (
            <li key={`w${i}`} className="repair-issue repair-issue-warning">{issue.message}</li>
          ))}
          {infos.map((issue, i) => (
            <li key={`i${i}`} className="repair-issue repair-issue-info">{issue.message}</li>
          ))}
        </ul>
      )}

      {/* Repair actions */}
      {repairs.length > 0 && (
        <div className="repair-actions">
          {repairs.map((repair) => (
            <button
              key={repair.id}
              type="button"
              className="repair-btn"
              title={repair.description}
              onClick={() => onRepair(repair.id)}
            >
              {repair.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Shown when input is empty */
export function InputRepairEmpty() {
  return (
    <div className="preview-empty">
      <span className="preview-empty-icon">♫</span>
      <p className="preview-empty-title">No input yet</p>
      <p className="preview-empty-sub">
        Type a prompt or note sequence — the parser will detect the format and suggest fixes.
      </p>
    </div>
  );
}
