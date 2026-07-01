import type { MusicData, NoteEvent } from '../types/music';
import { durationLabel } from '../utils/notesParser';

interface Props {
  data: MusicData;
}

// ─── Group flat notes into display bars by beat budget ───────────────────────

interface DisplayBar {
  index: number;
  notes: NoteEvent[];
  totalBeats: number;
}

function groupIntoBars(notes: NoteEvent[], beatsPerBar: number): DisplayBar[] {
  if (beatsPerBar <= 0) {
    return [{ index: 0, notes, totalBeats: notes.reduce((s, n) => s + n.duration, 0) }];
  }

  const bars: DisplayBar[] = [];
  let barIndex = 0;
  let budget = 0;
  let current: NoteEvent[] = [];

  for (const note of notes) {
    current.push(note);
    budget += note.duration;

    if (Math.abs(budget - beatsPerBar) < 0.001 || budget >= beatsPerBar) {
      bars.push({ index: barIndex, notes: current, totalBeats: budget });
      barIndex++;
      current = [];
      budget = 0;
    }
  }

  if (current.length > 0) {
    bars.push({ index: barIndex, notes: current, totalBeats: budget });
  }

  return bars;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function NoteRow({ note, globalIndex }: { note: NoteEvent; globalIndex: number }) {
  const isRest = note.pitch === 'rest';
  return (
    <li className={`note-item${isRest ? ' rest' : ''}`}>
      <span className="note-index">#{globalIndex + 1}</span>
      {!isRest && (
        <span className="note-midi" title={`MIDI note ${note.midiNote}`}>
          {note.midiNote}
        </span>
      )}
      <span className="note-label">
        {isRest ? 'Rest' : note.pitch}
        <span className="note-dur">{durationLabel(note.duration)}</span>
      </span>
      {!isRest && (
        <span className="note-vel" title="Velocity">
          vel {note.velocity}
        </span>
      )}
      <span className="note-tick">tick {note.startTick % 1 === 0 ? note.startTick : note.startTick.toFixed(2)}</span>
    </li>
  );
}

function BarGroup({ bar, startIndex }: { bar: DisplayBar; startIndex: number }) {
  const beatLabel = `${Math.round(bar.totalBeats * 100) / 100} beat${bar.totalBeats !== 1 ? 's' : ''}`;
  return (
    <div className="bar-group">
      <div className="bar-header">
        <span className="bar-label">Bar {bar.index + 1}</span>
        <span className="bar-beats">{beatLabel}</span>
      </div>
      <ol className="note-list" start={startIndex + 1}>
        {bar.notes.map((note, i) => (
          <NoteRow key={i} note={note} globalIndex={startIndex + i} />
        ))}
      </ol>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function NotePreview({ data }: Props) {
  const track = data.tracks[0];
  const bars = groupIntoBars(track.notes, data.beatsPerBar);
  const noteCount = track.notes.filter((n) => n.pitch !== 'rest').length;
  const restCount = track.notes.filter((n) => n.pitch === 'rest').length;

  let globalIndex = 0;

  return (
    <div className="note-preview">
      {/* Header row */}
      <div className="note-preview-header">
        <span className="note-preview-title">Note Preview</span>
        <span className="note-count-badge">{track.notes.length} events</span>
      </div>

      {/* Metadata chips */}
      <div className="meta-chips">
        <div className="meta-chip">
          <span className="meta-chip-label">Key</span>
          <span className="meta-chip-value">{data.key} {data.mode}</span>
        </div>
        <div className="meta-chip">
          <span className="meta-chip-label">Tempo</span>
          <span className="meta-chip-value">{data.bpm} BPM</span>
        </div>
        <div className="meta-chip">
          <span className="meta-chip-label">Bars</span>
          <span className="meta-chip-value">{data.bars}</span>
        </div>
        <div className="meta-chip">
          <span className="meta-chip-label">Time</span>
          <span className="meta-chip-value">{data.beatsPerBar}/{data.beatValue}</span>
        </div>
        <div className="meta-chip">
          <span className="meta-chip-label">Notes</span>
          <span className="meta-chip-value">{noteCount}</span>
        </div>
        {restCount > 0 && (
          <div className="meta-chip">
            <span className="meta-chip-label">Rests</span>
            <span className="meta-chip-value">{restCount}</span>
          </div>
        )}
      </div>

      {/* Note list */}
      <div className="note-preview-body">
        {track.notes.length === 0 ? (
          <p className="note-preview-empty">No notes to display.</p>
        ) : (
          bars.map((bar) => {
            const barStart = globalIndex;
            globalIndex += bar.notes.length;
            return <BarGroup key={bar.index} bar={bar} startIndex={barStart} />;
          })
        )}
      </div>
    </div>
  );
}
