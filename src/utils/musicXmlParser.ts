/**
 * musicXmlParser.ts
 *
 * Parses a MusicXML string (score-partwise format) into the app's
 * intermediate MusicXMLScore model. Uses the browser's built-in DOMParser —
 * no external XML library required.
 *
 * Supported:
 *   - score-partwise (standard format)
 *   - Single- and multi-part scores
 *   - Single- and multi-staff parts (all staves merged per part)
 *   - Multi-voice via <backup>/<forward> beat repositioning
 *   - Variable time signatures (tracked per measure)
 *   - Tempo from <sound tempo="..."> or <metronome><per-minute>
 *   - Key from <key><fifths> + <mode>
 *   - GM instrument from <midi-instrument><midi-program>
 *   - Dotted / compound durations (via raw division count)
 *   - Dynamics (pp/p/mp/mf/f/ff etc.) → MIDI velocity
 *   - Ties via <tie type="start|stop"> → tieStart/tieStop flags
 *   - Voice tracking per note for tie disambiguation
 *
 * Not yet supported:
 *   - score-timewise format conversion
 *   - Grace notes (silently skipped — they have no <duration>)
 *   - Chord symbols / figured bass
 *   - Hairpin crescendo/decrescendo → velocity envelope
 *   - .mxl decompression (handled upstream in useMusicXml)
 */

import type {
  MusicXMLScore,
  MusicXMLPart,
  MusicXMLMeasure,
  MusicXMLNote,
  MusicXMLParseResult,
} from '../types/musicxml';
import { pitchToMidi } from '../types/music';

// ─── XML traversal helpers ───────────────────────────────────────────────────

/** First direct child element with the given tag name (case-insensitive). */
function child(el: Element, tag: string): Element | null {
  const lower = tag.toLowerCase();
  for (const c of Array.from(el.children)) {
    if (c.tagName.toLowerCase() === lower) return c;
  }
  return null;
}

/** All direct child elements with the given tag name. */
function children(el: Element, tag: string): Element[] {
  const lower = tag.toLowerCase();
  return Array.from(el.children).filter((c) => c.tagName.toLowerCase() === lower);
}

/** Text content of the first matching direct child, trimmed. */
function childText(el: Element, tag: string): string | null {
  return child(el, tag)?.textContent?.trim() ?? null;
}

// ─── Key signature helpers ────────────────────────────────────────────────────

const FIFTHS_TO_KEY: Map<number, string> = new Map([
  [0, 'C'], [1, 'G'], [2, 'D'], [3, 'A'], [4, 'E'], [5, 'B'], [6, 'F#'], [7, 'C#'],
  [-1, 'F'], [-2, 'Bb'], [-3, 'Eb'], [-4, 'Ab'], [-5, 'Db'], [-6, 'Gb'], [-7, 'Cb'],
]);

function fifthsToKey(fifths: number): string {
  return FIFTHS_TO_KEY.get(fifths) ?? 'C';
}

/** Convert alter value to sharp/flat suffix. */
function alterSuffix(alter: number): string {
  if (alter >= 1) return '#';
  if (alter <= -1) return 'b';
  return '';
}

// ─── Dynamics → velocity mapping ─────────────────────────────────────────────
// Values follow MuseScore's default dynamics-to-MIDI mapping.

const DYNAMICS_VELOCITY: Readonly<Record<string, number>> = {
  pppp: 10,
  ppp:  20,
  pp:   36,
  p:    54,
  mp:   68,
  mf:   80,
  f:    94,
  ff:  108,
  fff: 120,
  ffff: 127,
  fp:   54,   // forte-piano: loud attack, soft continuation (approximated as p)
  sf:   96,   // sforzando
  sfz:  96,
  fz:   96,
  rfz:  96,
};

// ─── Parse state ──────────────────────────────────────────────────────────────

interface ParseState {
  divisions: number;          // MusicXML divisions per quarter note
  beatsPerBar: number;
  beatValue: number;
  bpm: number;
  key: string;
  musicalMode: 'major' | 'minor';
  velocity: number;           // current dynamic velocity 0-127 (updated by <dynamics>)
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a MusicXML string into the app's MusicXMLScore model.
 *
 * Returns `{ ok: true, score }` on success (possibly with warnings),
 * or `{ ok: false, error }` on fatal failure.
 */
export function parseMusicXml(xmlString: string): MusicXMLParseResult {
  const warnings: string[] = [];

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(xmlString, 'application/xml');
  } catch {
    return { ok: false, score: null, error: 'DOMParser failed to parse the file.', warnings };
  }

  const parseErr = doc.querySelector('parsererror');
  if (parseErr) {
    const msg = parseErr.textContent?.split('\n')[0]?.trim() ?? 'XML parse error';
    return { ok: false, score: null, error: `XML syntax error: ${msg}`, warnings };
  }

  const root = doc.documentElement;
  const rootTag = root.tagName.toLowerCase();

  if (rootTag === 'score-timewise') {
    return {
      ok: false,
      score: null,
      error: 'score-timewise format is not supported. Please convert to score-partwise and try again.',
      warnings,
    };
  }

  if (rootTag !== 'score-partwise') {
    return {
      ok: false,
      score: null,
      error: `Unexpected root element <${root.tagName}>. Expected <score-partwise>.`,
      warnings,
    };
  }

  // ── Title / composer ───────────────────────────────────────────────────────
  const workEl = child(root, 'work');
  const title =
    (workEl ? childText(workEl, 'work-title') : null) ??
    childText(root, 'movement-title');

  let composer: string | null = null;
  const identEl = child(root, 'identification');
  if (identEl) {
    for (const creatorEl of children(identEl, 'creator')) {
      if ((creatorEl.getAttribute('type') ?? '').toLowerCase() === 'composer') {
        composer = creatorEl.textContent?.trim() ?? null;
        break;
      }
    }
  }

  // ── Part list ─────────────────────────────────────────────────────────────
  const partListEl = child(root, 'part-list');
  if (!partListEl) {
    return { ok: false, score: null, error: 'No <part-list> found in the score.', warnings };
  }

  const partInfoMap = new Map<string, { name: string; instrument: number }>();
  for (const spEl of children(partListEl, 'score-part')) {
    const id = spEl.getAttribute('id') ?? '';
    const name = childText(spEl, 'part-name') ?? id;

    // MusicXML programs are 1-indexed; convert to 0-indexed
    let instrument = 0;
    const midiInstEl = child(spEl, 'midi-instrument');
    if (midiInstEl) {
      const prog = childText(midiInstEl, 'midi-program');
      if (prog !== null) instrument = Math.max(0, parseInt(prog, 10) - 1);
    }
    partInfoMap.set(id, { name, instrument });
  }

  // ── Global parse state ────────────────────────────────────────────────────
  const globalState: ParseState = {
    divisions: 1,
    beatsPerBar: 4,
    beatValue: 4,
    bpm: 120,
    key: 'C',
    musicalMode: 'major',
    velocity: 80, // mf default
  };

  // ── Parse each <part> ─────────────────────────────────────────────────────
  const parts: MusicXMLPart[] = [];

  for (const partEl of children(root, 'part')) {
    const id = partEl.getAttribute('id') ?? '';
    const info = partInfoMap.get(id) ?? { name: id, instrument: 0 };

    const state: ParseState = { ...globalState };
    const measures: MusicXMLMeasure[] = [];

    for (const measureEl of children(partEl, 'measure')) {
      measures.push(parseMeasure(measureEl, state, warnings));
    }

    if (parts.length === 0) {
      Object.assign(globalState, state);
    }

    parts.push({ id, name: info.name, instrument: info.instrument, measures });
  }

  if (parts.length === 0) {
    return { ok: false, score: null, error: 'No <part> elements found in the score.', warnings };
  }

  // ── Score summary ─────────────────────────────────────────────────────────
  const totalMeasures = Math.max(...parts.map((p) => p.measures.length));
  const noteCount = parts.reduce(
    (sum, p) =>
      sum + p.measures.reduce(
        (s2, m) => s2 + m.notes.filter((n) => n.pitch !== 'rest').length,
        0,
      ),
    0,
  );

  const score: MusicXMLScore = {
    title,
    composer,
    parts,
    beatsPerBar: globalState.beatsPerBar,
    beatValue: globalState.beatValue,
    bpm: Math.round(globalState.bpm),
    key: globalState.key,
    musicalMode: globalState.musicalMode,
    totalMeasures,
    noteCount,
  };

  return { ok: true, score, error: null, warnings };
}

// ─── Measure parser ───────────────────────────────────────────────────────────

function parseMeasure(
  measureEl: Element,
  state: ParseState,
  warnings: string[],
): MusicXMLMeasure {
  const number = parseInt(measureEl.getAttribute('number') ?? '1', 10);
  const notes: MusicXMLNote[] = [];

  // Beat cursor in quarter-note beats.
  // <backup> rewinds it; <forward> advances it; chord notes do not advance it.
  let cursor = 0;

  for (const el of Array.from(measureEl.children)) {
    const tag = el.tagName.toLowerCase();

    if (tag === 'attributes') {
      applyAttributes(el, state);
    } else if (tag === 'direction') {
      applyDirection(el, state);
    } else if (tag === 'note') {
      const note = parseNote(el, state, cursor, warnings);
      if (note !== null) {
        notes.push(note);
        if (!note.isChordNote) cursor += note.duration;
      }
    } else if (tag === 'backup') {
      const dur = parseInt(childText(el, 'duration') ?? '0', 10);
      cursor = Math.max(0, cursor - dur / state.divisions);
    } else if (tag === 'forward') {
      const dur = parseInt(childText(el, 'duration') ?? '0', 10);
      cursor += dur / state.divisions;
    }
  }

  return { number, notes, beatsPerBar: state.beatsPerBar, beatValue: state.beatValue };
}

// ─── Attribute updater ────────────────────────────────────────────────────────

function applyAttributes(attrEl: Element, state: ParseState): void {
  const divisionsText = childText(attrEl, 'divisions');
  if (divisionsText !== null) {
    const d = parseInt(divisionsText, 10);
    if (d > 0) state.divisions = d;
  }

  const keyEl = child(attrEl, 'key');
  if (keyEl) {
    const fifthsText = childText(keyEl, 'fifths');
    if (fifthsText !== null) state.key = fifthsToKey(parseInt(fifthsText, 10));
    const modeText = childText(keyEl, 'mode');
    if (modeText !== null) state.musicalMode = modeText.toLowerCase() === 'minor' ? 'minor' : 'major';
  }

  const timeEl = child(attrEl, 'time');
  if (timeEl) {
    const beats = childText(timeEl, 'beats');
    const beatType = childText(timeEl, 'beat-type');
    if (beats !== null) state.beatsPerBar = parseInt(beats, 10);
    if (beatType !== null) state.beatValue = parseInt(beatType, 10);
  }
}

// ─── Direction / tempo / dynamics updater ────────────────────────────────────

function applyDirection(dirEl: Element, state: ParseState): void {
  // <sound tempo="..."> — most reliable tempo source
  const soundEl = child(dirEl, 'sound');
  if (soundEl) {
    const tempoAttr = soundEl.getAttribute('tempo');
    if (tempoAttr !== null) {
      const bpm = parseFloat(tempoAttr);
      if (bpm > 0) state.bpm = bpm;
    }
  }

  const dtEl = child(dirEl, 'direction-type');
  if (dtEl) {
    // <metronome><per-minute> — fallback tempo source
    const metroEl = child(dtEl, 'metronome');
    if (metroEl) {
      const perMin = childText(metroEl, 'per-minute');
      if (perMin !== null) {
        const bpm = parseFloat(perMin);
        // Only apply if <sound tempo> hasn't already updated bpm in this direction
        if (bpm > 0 && soundEl === null) state.bpm = bpm;
      }
    }

    // <dynamics> — update velocity for subsequent notes
    const dynamicsEl = child(dtEl, 'dynamics');
    if (dynamicsEl && dynamicsEl.children.length > 0) {
      const mark = dynamicsEl.children[0].tagName.toLowerCase();
      const velocity = DYNAMICS_VELOCITY[mark];
      if (velocity !== undefined) {
        state.velocity = velocity;
      }
    }
  }
}

// ─── Note parser ──────────────────────────────────────────────────────────────

function parseNote(
  noteEl: Element,
  state: ParseState,
  cursor: number,
  _warnings: string[],
): MusicXMLNote | null {
  const isChordNote = child(noteEl, 'chord') !== null;
  const isRest = child(noteEl, 'rest') !== null;
  const isGrace = child(noteEl, 'grace') !== null;

  // Grace notes have no <duration> — skip to avoid distorting beat accounting
  if (isGrace) return null;

  const durationText = childText(noteEl, 'duration');
  const durationDivisions = durationText !== null ? parseInt(durationText, 10) : 0;
  const durationBeats = state.divisions > 0 ? durationDivisions / state.divisions : 1;

  // Voice — used as part of the tie-matching key in scoreToMusicData
  const voiceText = childText(noteEl, 'voice');
  const voice = voiceText !== null ? parseInt(voiceText, 10) : 1;

  // Ties — parse <tie type="start|stop"> child elements
  let tieStart = false;
  let tieStop = false;
  for (const tieEl of children(noteEl, 'tie')) {
    const t = tieEl.getAttribute('type');
    if (t === 'start') tieStart = true;
    if (t === 'stop') tieStop = true;
  }

  if (isRest) {
    return {
      pitch: 'rest',
      midiNote: -1,
      duration: durationBeats,
      startBeat: cursor,
      velocity: state.velocity,
      isChordNote,
      voice,
      tieStart: false,
      tieStop: false,
    };
  }

  const pitchEl = child(noteEl, 'pitch');
  if (!pitchEl) return null;

  const step = childText(pitchEl, 'step') ?? 'C';
  const octave = parseInt(childText(pitchEl, 'octave') ?? '4', 10);
  const alterText = childText(pitchEl, 'alter');
  const alter = alterText !== null ? Math.round(parseFloat(alterText)) : 0;

  const pitch = `${step}${alterSuffix(alter)}${octave}`;
  const midiNote = pitchToMidi(pitch);

  return {
    pitch,
    midiNote: midiNote >= 0 ? midiNote : -1,
    duration: durationBeats,
    startBeat: cursor,
    velocity: state.velocity,
    isChordNote,
    voice,
    tieStart,
    tieStop,
  };
}
