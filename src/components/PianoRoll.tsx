/**
 * PianoRoll.tsx
 *
 * Canvas-based piano-roll visualizer for detected audio notes.
 *
 * Features
 * ────────
 * • Multiple tracks rendered in distinct colors on a shared time axis.
 * • Pitch labels (C octave markers) on the left.
 * • Bar/beat grid lines and bar numbers on the bottom.
 * • Zoom controls: Fit (auto-scale to view), zoom-in, zoom-out.
 * • Horizontal scroll via mouse-wheel (horizontal delta or vertical delta).
 * • Hover inspection: floating tooltip with pitch, MIDI number, timing, track.
 * • High-DPI (devicePixelRatio) aware for sharp rendering on retina displays.
 *
 * Architecture notes
 * ──────────────────
 * • All drawing is done in a single useEffect that fires whenever anything
 *   that affects the visual output changes.  This avoids stale-closure bugs.
 * • Audio buffers and note data are never mutated here — only read.
 * • The component is self-contained; callers only supply tracks + tempo info.
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import type { NoteEvent } from '../types/music';
import type { PianoTrack } from '../utils/audioColors';

export type { PianoTrack };

export interface PianoRollProps {
  tracks: PianoTrack[];
  bpm: number;
  beatsPerBar: number;
  /** Current playhead position in beats, or null if no audio is loaded. */
  playheadBeat?: number | null;
  /** Called with the beat position when the user clicks empty canvas space. */
  onSeek?: (beat: number) => void;
}

// ─── Layout constants ─────────────────────────────────────────────────────

const LABEL_W      = 44;   // px — left gutter for pitch labels
const TIME_AXIS_H  = 24;   // px — bottom gutter for bar numbers
const TOP_PAD      = 6;    // px — above topmost note row
const RIGHT_PAD    = 10;   // px — right of last note
const NOTE_GAP     = 1;    // px — vertical gap between adjacent pitch rows
const MIN_NOTE_H   = 3;    // px — minimum height of a note rectangle
const MAX_NOTE_H   = 16;   // px — maximum height of a note rectangle
const ZOOM_STEP    = 1.5;

// Black-key chromatic positions within an octave (0 = C)
const BLACK_KEY_POSITIONS = new Set([1, 3, 6, 8, 10]);

// ─── Component ────────────────────────────────────────────────────────────

export function PianoRoll({ tracks, bpm, beatsPerBar, playheadBeat, onSeek }: PianoRollProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);

  // pxPerBeat === null means "fit all notes in current width"
  const [pxPerBeat, setPxPerBeat] = useState<number | null>(null);
  const [scrollX,   setScrollX]   = useState(0);
  const [canvasW,   setCanvasW]   = useState(700);
  const [hovered,   setHovered]   = useState<HoveredNote | null>(null);
  const [pinned,    setPinned]     = useState<HoveredNote | null>(null);
  // Tracks mouse X (canvas-relative) to decide gutter vs timeline cursor.
  const [mouseX,    setMouseX]    = useState(LABEL_W);

  // Drag-to-pan state — kept in a ref to avoid triggering re-renders on every pixel
  const drag = useRef({ active: false, startX: 0, startScrollX: 0, moved: false });

  // ── Derived layout values ────────────────────────────────────────────────

  const allNotes = tracks.flatMap((t) => t.notes);

  const midiMin = allNotes.length > 0
    ? Math.max(0,   Math.min(...allNotes.map((n) => n.midiNote)) - 3)
    : 36;
  const midiMax = allNotes.length > 0
    ? Math.min(127, Math.max(...allNotes.map((n) => n.midiNote)) + 3)
    : 84;
  const midiRange = midiMax - midiMin + 1;

  const totalBeats = allNotes.length > 0
    ? Math.max(...allNotes.map((n) => n.startTick + n.duration))
    : beatsPerBar * 4;

  const contentW = canvasW - LABEL_W - RIGHT_PAD;

  const noteH = Math.max(MIN_NOTE_H, Math.min(MAX_NOTE_H,
    Math.floor((260 - TOP_PAD - TIME_AXIS_H) / midiRange),
  ));
  const contentH = noteH * midiRange;
  const canvasH  = contentH + TOP_PAD + TIME_AXIS_H;

  const effectivePxPerBeat = pxPerBeat ?? Math.max(2, contentW / Math.max(totalBeats, 1));
  const totalContentW      = totalBeats * effectivePxPerBeat;
  const maxScrollX         = Math.max(0, totalContentW - contentW);

  // ── Responsive width ─────────────────────────────────────────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setCanvasW(el.clientWidth));
    ro.observe(el);
    setCanvasW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // ── Coordinate helpers ────────────────────────────────────────────────────

  /** Canvas X coordinate for a beat position (taking scroll into account). */
  const beatToX = useCallback(
    (beat: number) => LABEL_W + beat * effectivePxPerBeat - scrollX,
    [effectivePxPerBeat, scrollX],
  );

  /** Canvas Y coordinate for the top edge of a MIDI note's row. */
  const midiToY = useCallback(
    (midi: number) => TOP_PAD + (midiMax - midi) * noteH,
    [midiMax, noteH],
  );

  /** Bounding box of a note in canvas pixels. */
  const noteBox = useCallback(
    (note: NoteEvent) => ({
      x: beatToX(note.startTick),
      y: midiToY(note.midiNote),
      w: Math.max(2, note.duration * effectivePxPerBeat - NOTE_GAP),
      h: noteH - NOTE_GAP,
    }),
    [beatToX, midiToY, effectivePxPerBeat, noteH],
  );

  // ── Canvas drawing ────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(canvasW * dpr);
    canvas.height = Math.round(canvasH * dpr);
    canvas.style.width  = `${canvasW}px`;
    canvas.style.height = `${canvasH}px`;
    ctx.scale(dpr, dpr);

    // ── 1. Background ──────────────────────────────────────────────────────
    ctx.fillStyle = '#0f1117';
    ctx.fillRect(0, 0, canvasW, canvasH);

    // ── 2. Piano key row backgrounds ───────────────────────────────────────
    for (let midi = midiMin; midi <= midiMax; midi++) {
      const y    = midiToY(midi);
      const isBlack = BLACK_KEY_POSITIONS.has(midi % 12);
      ctx.fillStyle = isBlack ? '#121620' : '#161c2c';
      ctx.fillRect(LABEL_W, y, contentW, noteH - NOTE_GAP);
    }

    // Clip drawing to the content rect so notes can't bleed into label gutters
    ctx.save();
    ctx.beginPath();
    ctx.rect(LABEL_W, TOP_PAD, contentW, contentH);
    ctx.clip();

    // ── 3. Vertical grid lines ─────────────────────────────────────────────
    const firstBar  = Math.floor(scrollX / (beatsPerBar * effectivePxPerBeat));
    const totalBars = Math.ceil(totalBeats / beatsPerBar) + 2;

    for (let bar = firstBar; bar <= firstBar + totalBars; bar++) {
      const xBar = beatToX(bar * beatsPerBar);
      if (xBar < LABEL_W || xBar > canvasW - RIGHT_PAD) continue;
      ctx.strokeStyle = '#2e3d58';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(xBar, TOP_PAD);
      ctx.lineTo(xBar, TOP_PAD + contentH);
      ctx.stroke();

      // Beat sub-divisions (lighter)
      for (let b = 1; b < beatsPerBar; b++) {
        const xBeat = beatToX(bar * beatsPerBar + b);
        if (xBeat < LABEL_W || xBeat > canvasW - RIGHT_PAD) continue;
        ctx.strokeStyle = '#1e2a3e';
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(xBeat, TOP_PAD);
        ctx.lineTo(xBeat, TOP_PAD + contentH);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // ── 4. Octave C horizontal lines ───────────────────────────────────────
    for (let midi = midiMin; midi <= midiMax; midi++) {
      if (midi % 12 !== 0) continue;
      const y = midiToY(midi);
      ctx.strokeStyle = '#3a4d6a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(LABEL_W, y);
      ctx.lineTo(canvasW - RIGHT_PAD, y);
      ctx.stroke();
    }

    // ── 5. Notes ───────────────────────────────────────────────────────────
    for (const track of tracks) {
      for (const note of track.notes) {
        const b = noteBox(note);
        // Skip entirely off-screen notes
        if (b.x + b.w < LABEL_W || b.x > canvasW - RIGHT_PAD) continue;

        ctx.fillStyle = track.dimColor;
        const rx = Math.max(LABEL_W, b.x);
        const rw = Math.min(b.w - (rx - b.x), canvasW - RIGHT_PAD - rx);
        if (rw <= 0) continue;
        ctx.fillRect(rx, b.y, rw, b.h);

        // Bright top-edge highlight for depth
        ctx.fillStyle = track.color;
        ctx.fillRect(rx, b.y, rw, Math.min(2, b.h));
      }
    }

    // ── 6. Hover / pinned note outlines ───────────────────────────────────
    const drawOutline = (note: NoteEvent, style: string, alpha: number, lw: number) => {
      const b = noteBox(note);
      const rx = Math.max(LABEL_W, b.x);
      const rw = Math.min(b.w - (rx - b.x), canvasW - RIGHT_PAD - rx);
      if (rw <= 0) return;
      ctx.strokeStyle = style;
      ctx.lineWidth = lw;
      ctx.globalAlpha = alpha;
      ctx.strokeRect(rx + 0.5, b.y + 0.5, rw - 1, b.h - 1);
      ctx.globalAlpha = 1;
    };

    if (hovered && hovered.note !== pinned?.note) {
      drawOutline(hovered.note, '#ffffff', 0.55, 1);
    }
    if (pinned) {
      drawOutline(pinned.note, '#ffffff', 0.95, 2);
    }

    // ── Playhead ──────────────────────────────────────────────────────────
    if (playheadBeat !== null && playheadBeat !== undefined) {
      const px = beatToX(playheadBeat);
      if (px >= LABEL_W && px < canvasW - RIGHT_PAD) {
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(px, TOP_PAD);
        ctx.lineTo(px, TOP_PAD + contentH);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    ctx.restore(); // end clip

    // ── 7. Left pitch label column (opaque background + labels) ───────────
    ctx.fillStyle = '#0f1117';
    ctx.fillRect(0, 0, LABEL_W, canvasH);

    // Octave C labels
    ctx.font = `bold 10px 'JetBrains Mono', monospace`;
    ctx.textAlign = 'right';
    for (let midi = midiMin; midi <= midiMax; midi++) {
      if (midi % 12 !== 0) continue;
      const y       = midiToY(midi);
      const octave  = Math.floor(midi / 12) - 1;
      const labelY  = y + noteH / 2 + 3.5;
      ctx.fillStyle = '#8090b0';
      ctx.fillText(`C${octave}`, LABEL_W - 5, labelY);
    }

    // ── 8. Bottom time axis ────────────────────────────────────────────────
    const axisY = TOP_PAD + contentH;
    ctx.fillStyle = '#0f1117';
    ctx.fillRect(0, axisY, canvasW, TIME_AXIS_H);

    // Border line
    ctx.strokeStyle = '#2a3348';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LABEL_W, axisY);
    ctx.lineTo(canvasW, axisY);
    ctx.stroke();

    ctx.font = `10px 'JetBrains Mono', monospace`;
    ctx.textAlign = 'center';

    for (let bar = firstBar; bar <= firstBar + totalBars; bar++) {
      const x = beatToX(bar * beatsPerBar);
      if (x < LABEL_W || x > canvasW - RIGHT_PAD) continue;
      ctx.fillStyle = '#6b7a9a';
      ctx.fillText(String(bar + 1), x, axisY + 15);
      ctx.fillStyle = '#2a3348';
      ctx.fillRect(x - 0.5, axisY, 1, 4);
    }

    // ── 9. Top-left corner cover ───────────────────────────────────────────
    ctx.fillStyle = '#0f1117';
    ctx.fillRect(0, 0, LABEL_W, TOP_PAD);

  }, [
    canvasW, canvasH, tracks, effectivePxPerBeat, scrollX, hovered, pinned,
    midiMin, midiMax, noteH, contentH, contentW, totalBeats, beatsPerBar,
    beatToX, midiToY, noteBox, playheadBeat,
  ]);

  // ── Escape key: clear pinned note ────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPinned(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Hit-test helper ──────────────────────────────────────────────────────

  const hitTest = useCallback((clientX: number, clientY: number): HoveredNote | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mx   = clientX - rect.left;
    const my   = clientY - rect.top;
    if (mx < LABEL_W) return null;

    for (const track of [...tracks].reverse()) {
      for (const note of track.notes) {
        const b = noteBox(note);
        if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) {
          return { note, trackName: track.name, color: track.color, canvasX: mx, canvasY: my };
        }
      }
    }
    return null;
  }, [tracks, noteBox]);

  // ── Interaction: wheel scroll ─────────────────────────────────────────────

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY * 0.6;
    setScrollX((prev) => Math.max(0, Math.min(maxScrollX, prev + delta)));
  }

  // ── Interaction: drag-to-pan + hover ──────────────────────────────────────

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    e.preventDefault();
    drag.current = { active: true, startX: e.clientX, startScrollX: scrollX, moved: false };
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (drag.current.active) {
      const dx = e.clientX - drag.current.startX;
      if (Math.abs(dx) > 3) {
        drag.current.moved = true;
        setScrollX(Math.max(0, Math.min(maxScrollX, drag.current.startScrollX - dx)));
      }
      return; // don't update hover/mouseX while dragging
    }

    const canvas = canvasRef.current;
    if (canvas) setMouseX(e.clientX - canvas.getBoundingClientRect().left);

    const hit = hitTest(e.clientX, e.clientY);
    setHovered(hit);
  }

  function handleMouseUp(e: React.MouseEvent) {
    if (!drag.current.active) return;
    const wasDrag = drag.current.moved;
    drag.current = { active: false, startX: 0, startScrollX: 0, moved: false };

    if (!wasDrag) {
      const hit = hitTest(e.clientX, e.clientY);
      if (hit) {
        // Click on a note → pin/unpin tooltip
        setPinned((prev) => (prev?.note === hit.note ? null : hit));
      } else {
        // Click on empty area → unpin AND seek (if handler provided)
        setPinned(null);
        if (onSeek) {
          const canvas = canvasRef.current;
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            if (mx >= LABEL_W) {
              const beat = (mx - LABEL_W + scrollX) / effectivePxPerBeat;
              onSeek(Math.max(0, beat));
            }
          }
        }
      }
    }
  }

  function handleMouseLeave() {
    drag.current.active = false;
    drag.current.moved  = false;
    setHovered(null);
  }

  // ── Zoom handlers ────────────────────────────────────────────────────────

  function handleFit() {
    setPxPerBeat(null);
    setScrollX(0);
  }

  function handleZoomIn() {
    setPxPerBeat((p) => (p ?? effectivePxPerBeat) * ZOOM_STEP);
  }

  function handleZoomOut() {
    setPxPerBeat((p) => Math.max(1, (p ?? effectivePxPerBeat) / ZOOM_STEP));
  }

  // Cursor: grabbing while dragging; 'default' in the pitch-label gutter
  // (not seekable) when seek is active; crosshair on a note; grab otherwise.
  const isDragging = drag.current.active && drag.current.moved;
  const inGutter   = !!onSeek && mouseX < LABEL_W;
  const cursor     = isDragging ? 'grabbing' : inGutter ? 'default' : hovered ? 'crosshair' : 'grab';

  // Playhead out-of-view indicator: show a directional arrow in the toolbar.
  // Use != null to catch both null and undefined (playheadBeat is an optional prop).
  const playheadPx        = playheadBeat != null ? playheadBeat * effectivePxPerBeat : null;
  const playheadOffscreen = playheadPx !== null && (playheadPx < scrollX || playheadPx > scrollX + contentW)
    ? (playheadPx < scrollX ? 'left' : 'right')
    : null;

  // Determine the tooltip to show: pinned takes priority, else hovered
  const tooltipNote = pinned ?? hovered;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="piano-roll-outer">
      {/* Toolbar */}
      <div className="pr-toolbar">
        <div className="pr-zoom-group">
          <button className="pr-btn" onClick={handleFit} title="Fit all notes in view">Fit</button>
          <button className="pr-btn" onClick={handleZoomIn}  title="Zoom in">＋</button>
          <button className="pr-btn" onClick={handleZoomOut} title="Zoom out">－</button>
        </div>
        <span className="pr-zoom-info">{Math.round(effectivePxPerBeat * 10) / 10} px/beat</span>
        {pinned && (
          <button
            className="pr-btn pr-btn-unpin"
            onClick={() => setPinned(null)}
            title="Clear pinned note (Esc)"
          >
            × unpin
          </button>
        )}
        <span className="pr-scroll-hint">
          {onSeek
            ? 'click note = inspect · click timeline = seek · drag or scroll = pan'
            : totalContentW > contentW + 4
              ? 'drag or scroll to pan'
              : 'click note to pin'}
        </span>
        {/* Playhead out-of-view indicator */}
        {playheadOffscreen && (
          <span className="pr-playhead-offscreen" title="Playhead is outside the visible area — scroll to follow">
            {playheadOffscreen === 'left' ? '◀' : '▶'} playhead
          </span>
        )}
        {/* Track legend */}
        <div className="pr-legend">
          {tracks.map((t) => (
            <span key={t.name} className="pr-legend-item">
              <span className="pr-legend-dot" style={{ background: t.color }} />
              {t.name}
            </span>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="pr-canvas-container"
        onWheel={handleWheel}
        style={{ position: 'relative' }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          style={{ display: 'block', cursor }}
        />

        {/* Tooltip — pinned (persistent) or hover (transient) */}
        {tooltipNote && (
          <NoteTooltip
            note={tooltipNote.note}
            trackName={tooltipNote.trackName}
            color={tooltipNote.color}
            canvasX={tooltipNote.canvasX}
            canvasY={tooltipNote.canvasY}
            bpm={bpm}
            pinned={!!pinned}
          />
        )}
      </div>
    </div>
  );
}

// ─── Hover tooltip ────────────────────────────────────────────────────────

interface HoveredNote {
  note: NoteEvent;
  trackName: string;
  color: string;
  canvasX: number;
  canvasY: number;
}

interface TooltipProps extends HoveredNote {
  bpm: number;
  pinned: boolean;
}

function NoteTooltip({ note, trackName, color, canvasX, canvasY, bpm, pinned }: TooltipProps) {
  const secPerBeat = 60 / bpm;
  const startSec   = note.startTick * secPerBeat;
  const durSec     = note.duration  * secPerBeat;

  const style: React.CSSProperties = {
    left: canvasX + 14,
    top:  Math.max(4, canvasY - 10),
    borderColor: color,
  };

  return (
    <div className={`pr-tooltip${pinned ? ' pr-tooltip-pinned' : ''}`} style={style}>
      {pinned && <div className="prt-pin-badge">📌 pinned — Esc to clear</div>}
      <div className="prt-pitch" style={{ color }}>
        {note.pitch}
        <span className="prt-midi">MIDI {note.midiNote}</span>
      </div>
      <div className="prt-row">Start&nbsp; {note.startTick.toFixed(2)} b ({startSec.toFixed(2)} s)</div>
      <div className="prt-row">Dur&nbsp;&nbsp;&nbsp; {note.duration.toFixed(2)} b ({durSec.toFixed(2)} s)</div>
      <div className="prt-track" style={{ borderColor: color }}>
        <span className="prt-dot" style={{ background: color }} />{trackName}
      </div>
    </div>
  );
}
