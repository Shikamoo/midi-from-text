import { GM_INSTRUMENTS } from '../types/music';
import type { MusicConfig } from '../types/music';

interface Props {
  config: MusicConfig;
  onChange: (patch: Partial<MusicConfig>) => void;
}

const KEY_OPTIONS = [
  'C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F',
  'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B',
];

export function SettingsPanel({ config, onChange }: Props) {
  return (
    <div className="settings-panel">
      <div className="settings-grid">
        {/* Tempo */}
        <label className="field">
          <span className="field-label">Tempo (BPM)</span>
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
        <label className="field">
          <span className="field-label">Key</span>
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
        <label className="field">
          <span className="field-label">Mode</span>
          <select
            className="field-input"
            value={config.musicalMode}
            onChange={(e) => onChange({ musicalMode: e.target.value as 'major' | 'minor' })}
          >
            <option value="major">Major</option>
            <option value="minor">Minor</option>
          </select>
        </label>

        {/* Time signature */}
        <label className="field">
          <span className="field-label">Time Signature</span>
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
        <label className="field">
          <span className="field-label">Bars</span>
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
        <label className="field">
          <span className="field-label">Instrument</span>
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
