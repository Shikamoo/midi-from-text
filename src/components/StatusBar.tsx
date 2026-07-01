import type { GenerationStatus } from '../types/music';

interface Props {
  status: GenerationStatus;
  error: string | null;
  warnings: string[];
  hint?: string;
}

export function StatusBar({ status, error, warnings, hint }: Props) {
  if (status === 'idle' && !hint) return null;

  return (
    <div className={`status-bar status-${status}`}>
      {status === 'generating' && (
        <span className="status-message">
          <span className="spinner" /> Generating music…
        </span>
      )}
      {status === 'ready' && (
        <span className="status-message success">
          ✓ Music generated — click <strong>Download MIDI</strong> to save your file.
        </span>
      )}
      {status === 'error' && error && (
        <span className="status-message error">
          ✕ {error}
        </span>
      )}
      {status === 'idle' && hint && (
        <span className="status-message hint">{hint}</span>
      )}
      {warnings.map((w, i) => (
        <span key={i} className="status-message warning">
          ⚠ {w}
        </span>
      ))}
    </div>
  );
}
