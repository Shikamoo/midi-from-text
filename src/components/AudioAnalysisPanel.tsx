/**
 * AudioAnalysisPanel.tsx
 *
 * Main visualization container for the audio-to-MIDI mode after analysis.
 * Composes three sections:
 *
 *   1. Summary row  — source mode, per-track note count, total duration, BPM
 *   2. Piano roll   — canvas-based multi-track view with zoom/scroll/hover
 *   3. Text list    — scrollable table of individual notes per track
 *
 * This component is purely presentational.  It receives the audio analysis
 * state via props and never touches detection or export logic.
 */

import { useState } from 'react';
import { PianoRoll } from './PianoRoll';
import { TRACK_COLORS } from '../utils/audioColors';
import type { PianoTrack } from '../utils/audioColors';
import type { NoteEvent, SourceMode } from '../types/music';
import type { DetectedNotes } from '../types/audio';

// ─── Playback info shape (supplied by App, which owns the playback hook) ────

export interface PlaybackInfo {
  isPlaying: boolean;
  hasAudio: boolean;
  currentTime: number;
  duration: number;
  onPlay: () => void;
  onPause: () => void;
  /** Beat position from PianoRoll click — panel converts to seconds via bpm. */
  onSeekBeat: (beat: number) => void;
}

// ─── Props ────────────────────────────────────────────────────────────────

interface Props {
  /** Raw detected notes — shown in the piano roll & note list. */
  notes: DetectedNotes;
  /** Cleaned/quantized notes — what actually gets exported. */
  cleanedNotes: DetectedNotes;
  sourceMode: SourceMode;
  bpm: number;
  beatsPerBar: number;
  analysedSource: string | null;
  /** Raw detected total. */
  totalNotes: number;
  /** Exported (cleaned) total. */
  exportedTotal: number;
  /** Playback state and callbacks from App, or null if not yet available. */
  playback: PlaybackInfo | null;
}

// ─── Source mode display label ─────────────────────────────────────────────

const SOURCE_MODE_LABELS: Record<SourceMode, string> = {
  'full-mix':   'Full mix',
  'bass-only':  'Bass stem only',
  'other-only': 'Other stem only',
  'split-both': 'Split and extract both (2-track)',
};

// ─── Component ────────────────────────────────────────────────────────────

export function AudioAnalysisPanel({
  notes,
  cleanedNotes,
  sourceMode,
  bpm,
  beatsPerBar,
  analysedSource,
  totalNotes,
  exportedTotal,
  playback,
}: Props) {
  const [listExpanded,  setListExpanded]  = useState(true);
  const [previewMode,   setPreviewMode]   = useState<'raw' | 'cleaned'>('raw');

  // The visualized notes depend on the preview toggle.
  // Export always uses cleanedNotes (unchanged).
  const visNotes = previewMode === 'raw' ? notes : cleanedNotes;

  // Build track lists
  function buildTracks(src: DetectedNotes): PianoTrack[] {
    const out: PianoTrack[] = [];
    if (src.fullNotes?.length)  out.push({ name: 'Full mix',    notes: src.fullNotes,  ...TRACK_COLORS.full  });
    if (src.bassNotes?.length)  out.push({ name: 'Bass range',  notes: src.bassNotes,  ...TRACK_COLORS.bass  });
    if (src.otherNotes?.length) out.push({ name: 'Upper range', notes: src.otherNotes, ...TRACK_COLORS.other });
    return out;
  }

  const rawTracks = buildTracks(notes);
  const tracks    = buildTracks(visNotes);   // what the piano roll shows

  // Compute total duration in beats → seconds
  const allNotes = [
    ...(notes.fullNotes  ?? []),
    ...(notes.bassNotes  ?? []),
    ...(notes.otherNotes ?? []),
  ];
  const totalBeats   = allNotes.length > 0
    ? Math.max(...allNotes.map((n) => n.startTick + n.duration))
    : 0;
  const totalSeconds = (totalBeats / bpm) * 60;

  if (rawTracks.length === 0) return null;

  // Playhead beat: convert playback seconds → beats using analysis BPM
  const playheadBeat: number | null =
    playback?.hasAudio ? (playback.currentTime / 60) * bpm : null;

  return (
    <div className="aap-root">
      {/* ── Summary row ──────────────────────────────────────────────────── */}
      <div className="aap-summary">
        <SummaryChip label="Source"   value={analysedSource ?? SOURCE_MODE_LABELS[sourceMode]} />
        <SummaryChip label="Detected" value={String(totalNotes)} />
        <SummaryChip label="Exported" value={String(exportedTotal)} />
        <SummaryChip label="Preview"  value={previewMode === 'raw' ? 'Raw' : 'Cleaned'} />
        <SummaryChip label="Duration" value={formatDuration(totalSeconds)} />
        <SummaryChip label="BPM"      value={String(bpm)} />
        {playback?.hasAudio && (
          <SummaryChip
            label="Playback"
            value={`${fmtTime(playback.currentTime)} / ${fmtTime(playback.duration)}`}
          />
        )}
        {sourceMode === 'split-both' && (
          <SummaryChip label="MIDI format" value="Format 1 (2 tracks)" />
        )}
      </div>

      {/* ── Export note ────────────────────────────────────────────────────── */}
      <div className="aap-export-note">
        <span className="aap-export-note-icon">↓</span>
        <span>
          Export uses cleaned/quantized notes —{' '}
          <strong>{totalNotes}</strong> detected →{' '}
          <strong>{exportedTotal}</strong> exported
        </span>
      </div>

      {/* ── Register-split notice ─────────────────────────────────────────── */}
      {sourceMode !== 'full-mix' && (
        <div className="aap-register-notice">
          <span className="aap-register-notice-icon">ℹ</span>
          <span>
            Register split only — not true instrument isolation. Notes near the
            300 Hz crossover may appear in both bands. On piano recordings,
            expect overlap between left- and right-hand parts.
          </span>
        </div>
      )}

      {/* ── Playback + preview controls ───────────────────────────────────── */}
      <div className="aap-controls-row">
        {/* Playback bar — only shown when audio decoded successfully */}
        {playback !== null && (
          <div className="aap-playback-bar">
            <button
              className="aap-play-btn"
              onClick={playback.isPlaying ? playback.onPause : playback.onPlay}
              title={playback.isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {playback.isPlaying ? '⏸' : '▶'}
            </button>
            <span className="aap-play-time">
              {fmtTime(playback.currentTime)}
              <span className="aap-play-dur"> / {fmtTime(playback.duration)}</span>
            </span>
          </div>
        )}

        {/* Preview toggle */}
        <div className="aap-preview-toggle" role="group" aria-label="Preview mode">
          <button
            className={`aap-preview-btn${previewMode === 'raw' ? ' active' : ''}`}
            onClick={() => setPreviewMode('raw')}
          >
            Raw notes
          </button>
          <button
            className={`aap-preview-btn${previewMode === 'cleaned' ? ' active' : ''}`}
            onClick={() => setPreviewMode('cleaned')}
          >
            Cleaned / exported
          </button>
        </div>
      </div>

      {/* ── Piano roll ────────────────────────────────────────────────────── */}
      <div className="aap-roll-wrapper">
        {tracks.length === 0 && previewMode === 'cleaned' ? (
          <div className="aap-cleaned-empty">
            <span className="aap-cleaned-empty-icon">⚠</span>
            <span>
              Cleanup removed all notes. Switch to <strong>Raw notes</strong> to
              inspect them, or relax the cleanup settings above.
            </span>
          </div>
        ) : (
          <PianoRoll
            tracks={tracks}
            bpm={bpm}
            beatsPerBar={beatsPerBar}
            playheadBeat={playheadBeat}
            onSeek={playback !== null ? playback.onSeekBeat : undefined}
          />
        )}
      </div>

      {/* ── Text note list (collapsible) ──────────────────────────────────── */}
      <div className="aap-list-section">
        <button
          className="aap-list-toggle"
          onClick={() => setListExpanded((v) => !v)}
        >
          <span>{listExpanded ? '▾' : '▸'}</span>
          <span>Note list</span>
          <span className="aap-list-count">
            ({previewMode === 'raw' ? totalNotes : exportedTotal} {previewMode === 'raw' ? 'raw' : 'exported'})
          </span>
        </button>

        {listExpanded && (
          <div className="aap-list-body">
            {(previewMode === 'raw' ? rawTracks : tracks).map((track) => (
              <NoteTable
                key={track.name}
                track={track}
                bpm={bpm}
                rawCount={rawCountFor(track.name, notes)}
                exportedCount={exportedCountFor(track.name, cleanedNotes)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Summary chip ─────────────────────────────────────────────────────────

function SummaryChip({
  label,
  value,
  color,
}: { label: string; value: string; color?: string }) {
  return (
    <div className="aap-chip">
      <span className="aap-chip-label">{label}</span>
      <span className="aap-chip-value" style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}

// ─── Per-track note table ─────────────────────────────────────────────────

interface NoteTableProps {
  track: PianoTrack;
  bpm: number;
  /** Always the raw-detection count (independent of preview mode). */
  rawCount: number;
  /** Always the cleaned/exported count (independent of preview mode). */
  exportedCount: number;
}

function NoteTable({ track, bpm, rawCount, exportedCount }: NoteTableProps) {
  const [showAll, setShowAll] = useState(false);
  const secPerBeat = 60 / bpm;
  const visible = showAll ? track.notes : track.notes.slice(0, 50);

  return (
    <div className="aap-track-table">
      <div className="aap-track-table-header">
        <span className="aap-track-badge" style={{ background: track.color }}>
          {track.name}
        </span>
        <span className="aap-track-count">
          {rawCount} detected · {exportedCount} exported
        </span>
      </div>
      <div className="aap-table-grid">
        <div className="aap-col-header">Pitch</div>
        <div className="aap-col-header">MIDI</div>
        <div className="aap-col-header">Start (b)</div>
        <div className="aap-col-header">Start (s)</div>
        <div className="aap-col-header">Dur (b)</div>
        <div className="aap-col-header">Dur (s)</div>
        {visible.map((note, i) => (
          <NoteRow key={i} note={note} secPerBeat={secPerBeat} color={track.color} />
        ))}
      </div>
      {!showAll && track.notes.length > 50 && (
        <button className="aap-show-more" onClick={() => setShowAll(true)}>
          Show all {track.notes.length} notes…
        </button>
      )}
    </div>
  );
}

function NoteRow({ note, secPerBeat, color }: { note: NoteEvent; secPerBeat: number; color: string }) {
  return (
    <>
      <div className="aap-cell aap-cell-pitch" style={{ color }}>{note.pitch}</div>
      <div className="aap-cell">{note.midiNote}</div>
      <div className="aap-cell">{note.startTick.toFixed(2)}</div>
      <div className="aap-cell">{(note.startTick * secPerBeat).toFixed(2)}</div>
      <div className="aap-cell">{note.duration.toFixed(2)}</div>
      <div className="aap-cell">{(note.duration * secPerBeat).toFixed(2)}</div>
    </>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

/** Map a display track name to its raw-detection note count. */
function rawCountFor(trackName: string, raw: DetectedNotes): number {
  switch (trackName) {
    case 'Full mix':    return raw.fullNotes?.length  ?? 0;
    case 'Bass range':  return raw.bassNotes?.length  ?? 0;
    case 'Upper range': return raw.otherNotes?.length ?? 0;
    default:            return 0;
  }
}

/** Map a display track name to its cleaned (exported) note count. */
function exportedCountFor(trackName: string, cleaned: DetectedNotes): number {
  switch (trackName) {
    case 'Full mix':    return cleaned.fullNotes?.length  ?? 0;
    case 'Bass range':  return cleaned.bassNotes?.length  ?? 0;
    case 'Upper range': return cleaned.otherNotes?.length ?? 0;
    default:            return 0;
  }
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

/** Format seconds as M:SS for the compact playback time display. */
function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
