/**
 * ModeToggle.tsx
 *
 * Three-tab toggle for the app's top-level input mode:
 *   Prompt | Notes | MusicXML
 *
 * AppMode is defined here (not in MusicConfig) so it can include 'musicxml'
 * without coupling the text-generation hook to the import flow.
 */

export type AppMode = 'prompt' | 'notes' | 'musicxml' | 'audio';

interface Props {
  mode: AppMode;
  onChange: (mode: AppMode) => void;
}

const TABS: { id: AppMode; label: string }[] = [
  { id: 'prompt',   label: 'Prompt' },
  { id: 'notes',    label: 'Notes' },
  { id: 'musicxml', label: 'MusicXML' },
  { id: 'audio',    label: 'Audio → MIDI' },
];

export function ModeToggle({ mode, onChange }: Props) {
  return (
    <div className="mode-toggle" role="tablist" aria-label="Input mode">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={mode === tab.id}
          className={`mode-tab${mode === tab.id ? ' active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
