import type { PlannerMusicPlan, PlannerStatus } from '../types/llmMusicPlan';
import type { MusicPlan } from '../types/musicPlan';
import { isLocalPlannerEnabled } from '../planner/plannerConfig';
import { getPlannerModelName } from '../planner/plannerClient';

interface LocalPlannerPanelProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  status: PlannerStatus;
  message: string | null;
  warning: string | null;
  source: 'ollama' | 'fallback' | 'rules' | null;
  model: string | null;
  llmPlan: PlannerMusicPlan | null;
  generatorPlan: MusicPlan | null;
  mappingAuditSummary?: string | null;
  seed: number;
  temperature: number;
  variation: number;
  onSeedChange: (seed: number) => void;
  onTemperatureChange: (temperature: number) => void;
  onVariationChange: (variation: number) => void;
  onRegenerate: () => void;
  isGenerating: boolean;
  promptEmpty: boolean;
}

function statusLabel(status: PlannerStatus): string {
  switch (status) {
    case 'disabled': return 'Disabled';
    case 'checking': return 'Checking…';
    case 'available': return 'Available';
    case 'unavailable': return 'Unavailable';
    case 'planning': return 'Planning…';
    case 'fallback': return 'Fallback';
    case 'ready': return 'Ready';
    case 'error': return 'Error';
    default: return status;
  }
}

function statusClass(status: PlannerStatus): string {
  if (status === 'available' || status === 'ready') return 'planner-status-ok';
  if (status === 'fallback' || status === 'unavailable') return 'planner-status-warn';
  if (status === 'error') return 'planner-status-error';
  return 'planner-status-neutral';
}

export function LocalPlannerPanel({
  enabled,
  onEnabledChange,
  status,
  message,
  warning,
  source,
  model,
  llmPlan,
  generatorPlan,
  mappingAuditSummary,
  seed,
  temperature,
  variation,
  onSeedChange,
  onTemperatureChange,
  onVariationChange,
  onRegenerate,
  isGenerating,
  promptEmpty,
}: LocalPlannerPanelProps) {
  const featureAvailable = isLocalPlannerEnabled();
  const displayModel = model ?? getPlannerModelName();

  return (
    <div className="local-planner-panel">
      <div className="local-planner-header">
        <label className="local-planner-toggle" title="Use Ollama for high-level music planning">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onEnabledChange(e.target.checked)}
            disabled={!featureAvailable}
          />
          <span>Use local planner</span>
        </label>
        <span className={`planner-status-badge ${statusClass(status)}`} role="status">
          {statusLabel(status)}
        </span>
      </div>

      {!featureAvailable && (
        <p className="planner-hint">
          Set <code>VITE_ENABLE_LOCAL_PLANNER=true</code> in <code>.env.local</code> and restart dev server.
        </p>
      )}

      {enabled && (warning || message) && (
        <p className="planner-message" role="status">{warning ?? message}</p>
      )}

      {enabled && (
        <div className="planner-controls">
          <label className="planner-control">
            <span>Seed</span>
            <input
              type="number"
              min={0}
              max={99999}
              value={seed}
              onChange={(e) => onSeedChange(Number(e.target.value) || 0)}
            />
          </label>
          <label className="planner-control">
            <span>Temperature</span>
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={temperature}
              onChange={(e) => onTemperatureChange(Number(e.target.value))}
            />
          </label>
          <label className="planner-control">
            <span>Variation</span>
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={variation}
              onChange={(e) => onVariationChange(Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            className="btn btn-secondary planner-regenerate"
            onClick={onRegenerate}
            disabled={isGenerating || promptEmpty}
          >
            Regenerate plan
          </button>
        </div>
      )}

      {enabled && llmPlan && (
        <details className="planner-debug">
          <summary>Planner debug</summary>
          <dl className="planner-debug-meta">
            <dt>Source</dt>
            <dd>{source ?? '—'}</dd>
            <dt>Model</dt>
            <dd>{displayModel}</dd>
            {warning && (
              <>
                <dt>Warning</dt>
                <dd>{warning}</dd>
              </>
            )}
          </dl>
          <p className="planner-debug-label">PlannerMusicPlan (validated)</p>
          <pre className="planner-json">{JSON.stringify(llmPlan, null, 2)}</pre>
          {mappingAuditSummary && (
            <>
              <p className="planner-debug-label">Mapping audit</p>
              <pre className="planner-json planner-audit">{mappingAuditSummary}</pre>
            </>
          )}
          {generatorPlan && (
            <>
              <p className="planner-debug-label">Generator MusicPlan (mapped)</p>
              <pre className="planner-json">{JSON.stringify(generatorPlan, null, 2)}</pre>
            </>
          )}
        </details>
      )}
    </div>
  );
}
