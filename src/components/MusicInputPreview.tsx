/**
 * MusicInputPreview.tsx
 *
 * Live preview panel: parse summary, repair actions, and note list.
 * Preview always reflects the live ParsedScore — same source as export after Generate.
 */

import { useMemo } from 'react';
import type { MusicInputResult } from '../hooks/useMusicInput';
import type { RepairActionId } from '../utils/repairMusicText';
import type { ScoreSummary } from '../utils/scoreVerification';
import { buildInputDiagnostics } from '../utils/inputDiagnostics';
import { InputRepairPanel, InputRepairEmpty } from './InputRepairPanel';
import { NotePreview } from './NotePreview';
import { ScoreExportSummary } from './ScoreExportSummary';

interface Props {
  rawText: string;
  input: MusicInputResult;
  settings: { bars: number; beatsPerBar: number; beatValue: number };
  onRepair: (actionId: RepairActionId) => void;
  textIsReady: boolean;
  exportInSync: boolean;
  scoreSummary: ScoreSummary | null;
}

export function MusicInputPreview({
  rawText,
  input,
  settings,
  onRepair,
  textIsReady,
  exportInSync,
  scoreSummary,
}: Props) {
  const diagnostics = useMemo(
    () => buildInputDiagnostics(rawText, input, settings),
    [rawText, input, settings],
  );

  if (!rawText.trim()) {
    return <InputRepairEmpty />;
  }

  return (
    <div className="input-preview">
      <InputRepairPanel
        rawText={rawText}
        input={input}
        diagnostics={diagnostics}
        onRepair={onRepair}
      />

      {textIsReady && scoreSummary && (
        <ScoreExportSummary
          summary={scoreSummary}
          exportInSync={exportInSync}
          showStaleHint={textIsReady}
        />
      )}

      {/* Prompt plan assumptions (compact) */}
      {input.musicPlan && input.assumptions.length > 0 && (
        <details className="repair-assumptions">
          <summary className="repair-normalized-summary">
            Plan assumptions ({input.assumptions.length})
          </summary>
          <ul className="assumption-list">
            {input.assumptions.map((a, i) => (
              <li key={i} className="assumption-item">
                {a.message}
                {a.confidence !== undefined && (
                  <span className="assumption-conf">
                    {' '}· {Math.round(a.confidence * 100)}%
                  </span>
                )}
                {a.source && (
                  <span className="assumption-source"> ({a.source})</span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Note list — always from live ParsedScore previewData */}
      {input.previewData ? (
        <NotePreview data={input.previewData} />
      ) : (
        <div className="preview-empty preview-empty-inline">
          <p className="preview-empty-sub">
            {input.hasErrors
              ? 'Fix parse errors above — use a repair action or edit the input.'
              : 'No notes parsed yet.'}
          </p>
        </div>
      )}
    </div>
  );
}
