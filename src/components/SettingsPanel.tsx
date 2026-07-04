import { GM_INSTRUMENTS } from '../types/music';
import type { MusicConfig } from '../types/music';

interface Props {
  config: MusicConfig;
  onChange: (patch: Partial<MusicConfig>) => void;
  /**
   * Fields whose current value was auto-populated from the prompt text
   * (not manually set by the user). These receive a "(from prompt)" label.
   */
  autoPopulatedFields?: ReadonlySet<string>;
  /**
   * Fields the user has manually overridden in the Settings panel.
   * Each of these shows a small relink/reset button.
   */
  overriddenFields?: ReadonlySet<string>;
  /**
   * Fields the current prompt text provides a value for, regardless of
   * override status. Used to compute the relink button tooltip.
   */
  promptParsedFields?: ReadonlySet<string>;
  /**
   * Called when the user clicks a field's relink button. The argument is
   * one field name or an array of field names to clear together (e.g.
   * ['beatsPerBar', 'beatValue'] for time signature).
   */
  onRelinkField?: (fields: string | readonly string[]) => void;
}

const KEY_OPTIONS = [
  'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F',
  'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B',
];

// ── Sub-components ────────────────────────────────────────────────────────────

interface RelinkButtonProps {
  /** Show the button only when the field is actively overridden. */
  overridden: boolean;
  /** Whether the current prompt provides a value for this field. */
  hasPromptValue: boolean;
  onRelink: () => void;
}

function RelinkButton({ overridden, hasPromptValue, onRelink }: RelinkButtonProps) {
  if (!overridden) return null;
  const label = hasPromptValue ? 'Use prompt value again' : 'Reset to default';
  return (
    <button
      type="button"
      className="field-relink-btn"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.preventDefault();
        onRelink();
      }}
    >
      ↺
    </button>
  );
}

interface FieldLabelProps {
  label: string;
  fromPrompt: boolean;
  overridden: boolean;
  hasPromptValue: boolean;
  onRelink: () => void;
}

function FieldLabel({ label, fromPrompt, overridden, hasPromptValue, onRelink }: FieldLabelProps) {
  return (
    <span className="field-label">
      {label}
      {fromPrompt && (
        <span
          className="field-from-prompt"
          title="Auto-populated from your prompt — change it here to override"
        >
          from prompt
        </span>
      )}
      <RelinkButton
        overridden={overridden}
        hasPromptValue={hasPromptValue}
        onRelink={onRelink}
      />
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SettingsPanel({
  config,
  onChange,
  autoPopulatedFields,
  overriddenFields,
  promptParsedFields,
  onRelinkField,
}: Props) {
  const fromPrompt  = (field: string) => autoPopulatedFields?.has(field)  ?? false;
  const isOverridden = (field: string) => overriddenFields?.has(field)     ?? false;
  const hasPromptVal = (field: string) => promptParsedFields?.has(field)   ?? false;

  const relink = (fields: string | readonly string[]) => onRelinkField?.(fields);

  return (
    <div className="settings-panel">
      <p className="settings-override-note" title="Values you set here always take priority over anything written in the prompt.">
        Settings override prompt values.
      </p>
      <div className="settings-grid">
        {/* Tempo */}
        <label
          className="field"
          title="Beats per minute. Set this to lock the tempo regardless of what the prompt says."
        >
          <FieldLabel
            label="Tempo (BPM)"
            fromPrompt={fromPrompt('bpm')}
            overridden={isOverridden('bpm')}
            hasPromptValue={hasPromptVal('bpm')}
            onRelink={() => relink('bpm')}
          />
          <input
            type="number"
            className="field-input"
            min={20}
            max={300}
            value={config.bpm}
            onChange={(e) => onChange({ bpm: Number(e.target.value) })}
          />
        </label>

        {/* Key */}
        <label
          className="field"
          title="Root key. Set this to lock the key regardless of what the prompt says."
        >
          <FieldLabel
            label="Key"
            fromPrompt={fromPrompt('key')}
            overridden={isOverridden('key')}
            hasPromptValue={hasPromptVal('key')}
            onRelink={() => relink('key')}
          />
          <select
            className="field-input"
            value={config.key}
            onChange={(e) => onChange({ key: e.target.value })}
          >
            {KEY_OPTIONS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </label>

        {/* Mode */}
        <label
          className="field"
          title="Major or minor tonality. Set this to lock the mode regardless of what the prompt says."
        >
          <FieldLabel
            label="Mode"
            fromPrompt={fromPrompt('musicalMode')}
            overridden={isOverridden('musicalMode')}
            hasPromptValue={hasPromptVal('musicalMode')}
            onRelink={() => relink('musicalMode')}
          />
          <select
            className="field-input"
            value={config.musicalMode}
            onChange={(e) => onChange({ musicalMode: e.target.value as 'major' | 'minor' })}
          >
            <option value="major">Major</option>
            <option value="minor">Minor</option>
          </select>
        </label>

        {/* Time signature — beatsPerBar and beatValue are always relinked together */}
        <label
          className="field"
          title="Time signature. Set this to lock the meter regardless of what the prompt says."
        >
          <FieldLabel
            label="Time Signature"
            fromPrompt={fromPrompt('beatsPerBar') || fromPrompt('beatValue')}
            overridden={isOverridden('beatsPerBar') || isOverridden('beatValue')}
            hasPromptValue={hasPromptVal('beatsPerBar') || hasPromptVal('beatValue')}
            onRelink={() => relink(['beatsPerBar', 'beatValue'])}
          />
          <div className="timesig-row">
            <select
              className="field-input timesig-part"
              value={config.beatsPerBar}
              onChange={(e) => onChange({ beatsPerBar: Number(e.target.value) })}
            >
              {[2, 3, 4, 5, 6, 7, 9, 12].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <span className="timesig-slash">/</span>
            <select
              className="field-input timesig-part"
              value={config.beatValue}
              onChange={(e) => onChange({ beatValue: Number(e.target.value) })}
            >
              {[4, 8, 16].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </label>

        {/* Bars */}
        <label
          className="field"
          title="Number of bars to generate. Set this to lock the length regardless of what the prompt says."
        >
          <FieldLabel
            label="Bars"
            fromPrompt={fromPrompt('bars')}
            overridden={isOverridden('bars')}
            hasPromptValue={hasPromptVal('bars')}
            onRelink={() => relink('bars')}
          />
          <input
            type="number"
            className="field-input"
            min={1}
            max={128}
            value={config.bars}
            onChange={(e) => onChange({ bars: Number(e.target.value) })}
          />
        </label>

        {/* Instrument */}
        <label
          className="field"
          title="MIDI instrument (General MIDI program). Set this to lock the instrument regardless of what the prompt says."
        >
          <FieldLabel
            label="Instrument"
            fromPrompt={fromPrompt('instrument')}
            overridden={isOverridden('instrument')}
            hasPromptValue={hasPromptVal('instrument')}
            onRelink={() => relink('instrument')}
          />
          <select
            className="field-input"
            value={config.instrument}
            onChange={(e) => onChange({ instrument: Number(e.target.value) })}
          >
            {Object.entries(GM_INSTRUMENTS).map(([prog, name]) => (
              <option key={prog} value={prog}>{name}</option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
