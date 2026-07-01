/**
 * ScoreExportSummary.tsx
 *
 * Compact post-generate verification: preview score matches export.
 */

import type { ScoreSummary } from '../utils/scoreVerification';

interface Props {
  summary: ScoreSummary;
  exportInSync: boolean;
  showStaleHint: boolean;
}

export function ScoreExportSummary({ summary, exportInSync, showStaleHint }: Props) {
  return (
    <div className="score-export-summary">
      <div className="meta-chips score-export-chips">
        <div className="meta-chip">
          <span className="meta-chip-label">Notes</span>
          <span className="meta-chip-value">{summary.noteCount}</span>
        </div>
        {summary.restCount > 0 && (
          <div className="meta-chip">
            <span className="meta-chip-label">Rests</span>
            <span className="meta-chip-value">{summary.restCount}</span>
          </div>
        )}
        <div className="meta-chip">
          <span className="meta-chip-label">Bars</span>
          <span className="meta-chip-value">{summary.barCount}</span>
        </div>
        <div className="meta-chip">
          <span className="meta-chip-label">Beats</span>
          <span className="meta-chip-value">{summary.totalBeats}</span>
        </div>
      </div>
      <p className={`score-export-status${exportInSync ? ' score-export-status-ok' : ''}`}>
        {exportInSync ? 'Export-ready — preview matches MIDI' : 'Preview changed — regenerate before export'}
      </p>
      {showStaleHint && !exportInSync && (
        <p className="score-export-hint">Edit detected since last Generate.</p>
      )}
    </div>
  );
}
