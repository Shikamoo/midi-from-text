import type { PlannerMusicPlan, PlannerStatus } from '../types/llmMusicPlan';
import type { PlannerDebugInfo } from '../utils/localPlanner/types';
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
  melodyIntentSummary?: string | null;
  harmonyIntentSummary?: string | null;
  phraseDevelopmentSummary?: string | null;
  plannerDebug?: PlannerDebugInfo | null;
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
  melodyIntentSummary,
  harmonyIntentSummary,
  phraseDevelopmentSummary,
  plannerDebug,
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
            className="btn btn-tertiary planner-refresh"
            onClick={onRegenerate}
            disabled={isGenerating || promptEmpty}
            title="Re-run prompt interpretation only — does not change your Settings. Use 'Generate MIDI' to produce the final output."
          >
            {isGenerating ? <><span className="spinner" />Refreshing…</> : 'Refresh plan'}
          </button>
          <p className="planner-refresh-hint">
            Re-interprets the prompt · does not generate MIDI
          </p>
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
            {plannerDebug?.primaryFailureField && (
              <>
                <dt>Primary failure field</dt>
                <dd><code>{plannerDebug.primaryFailureField}</code></dd>
              </>
            )}
            {plannerDebug?.retryAttempted !== undefined && (
              <>
                <dt>Model repair retry</dt>
                <dd>
                  {plannerDebug.retryAttempted
                    ? plannerDebug.retrySucceeded ? 'Succeeded' : 'Attempted, failed'
                    : 'Not used'}
                </dd>
              </>
            )}
            {plannerDebug?.retryPromptSize !== undefined && (
              <>
                <dt>Retry prompt size</dt>
                <dd>{plannerDebug.retryPromptSize} chars</dd>
              </>
            )}
          </dl>
          {plannerDebug?.retryRawContent && (
            <>
              <p className="planner-debug-label">Model repair retry raw response</p>
              <pre className="planner-json planner-audit">{plannerDebug.retryRawContent}</pre>
            </>
          )}
          {plannerDebug?.rawContent && (
            <>
              <p className="planner-debug-label">Raw Ollama response (before schema parse)</p>
              <pre className="planner-json planner-audit">{plannerDebug.rawContent}</pre>
            </>
          )}
          {plannerDebug?.injectedDefaults && Object.keys(plannerDebug.injectedDefaults).length > 0 && (
            <>
              <p className="planner-debug-label">Injected semantic defaults</p>
              <ul className="planner-debug-list">
                {Object.entries(plannerDebug.injectedDefaults).map(([field, value]) => (
                  <li key={field}>
                    <code>{field}</code>
                    {' → '}
                    <code>{Array.isArray(value) ? JSON.stringify(value) : `"${value}"`}</code>
                  </li>
                ))}
              </ul>
            </>
          )}
          {plannerDebug?.repairActions && plannerDebug.repairActions.length > 0 && (
            <>
              <p className="planner-debug-label">Repair actions</p>
              <ul className="planner-debug-list">
                {plannerDebug.repairActions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            </>
          )}
          {plannerDebug?.validationErrors && plannerDebug.validationErrors.length > 0 && (
            <>
              <p className="planner-debug-label">Schema validation errors</p>
              <ul className="planner-debug-list planner-debug-errors">
                {plannerDebug.validationErrors.map((err) => (
                  <li key={err}><code>{err}</code></li>
                ))}
              </ul>
              {plannerDebug.failedFields && plannerDebug.failedFields.length > 1 && (
                <p className="planner-debug-hint">
                  Failed fields (by frequency): {plannerDebug.failedFields.join(', ')}
                </p>
              )}
            </>
          )}
          {plannerDebug?.repairedJson != null ? (
            <>
              <p className="planner-debug-label">Repaired JSON (pre-strict validation)</p>
              <pre className="planner-json planner-audit">{JSON.stringify(plannerDebug.repairedJson, null, 2)}</pre>
            </>
          ) : null}
          <p className="planner-debug-label">PlannerMusicPlan (validated)</p>
          <pre className="planner-json">{JSON.stringify(llmPlan, null, 2)}</pre>
          {mappingAuditSummary && (
            <>
              <p className="planner-debug-label">Mapping audit</p>
              <pre className="planner-json planner-audit">{mappingAuditSummary}</pre>
            </>
          )}
          {melodyIntentSummary && (
            <>
              <p className="planner-debug-label">Melody intent realized</p>
              <pre className="planner-json planner-audit">{melodyIntentSummary}</pre>
            </>
          )}
          {harmonyIntentSummary && (
            <>
              <p className="planner-debug-label">Harmony intent realized</p>
              <pre className="planner-json planner-audit">{harmonyIntentSummary}</pre>
            </>
          )}
          {phraseDevelopmentSummary && (
            <>
              <p className="planner-debug-label">Phrase development realized</p>
              <pre className="planner-json planner-audit">{phraseDevelopmentSummary}</pre>
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
