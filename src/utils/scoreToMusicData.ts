/**
 * scoreToMusicData.ts
 *
 * Converts a parsed MusicXMLScore into the app's internal MusicData shape
 * so it can be exported to MIDI via the existing midiExporter pipeline.
 *
 * Mapping:
 *   - Each MusicXMLPart → one Track
 *   - Notes from all measures are flattened; startTick is computed from
 *     the cumulative beat offset of each measure + the note's startBeat.
 *   - Variable time signatures are handled per measure.
 *   - Chord notes (isChordNote=true) share the same startTick as the
 *     preceding note; the MIDI exporter places them at the same tick.
 *
 * Tie handling:
 *   - Notes with tieStop=true extend the duration of the matching pending note
 *     (keyed by pitch + voice) instead of emitting a new NoteEvent.
 *   - Chains (start → stop+start → stop) are followed correctly across measures.
 *   - Unmatched tieStop notes (no prior tieStart found) fall back to normal
 *     note-on behaviour and are counted; the total is reported as a warning.
 *
 * Dynamics:
 *   - Velocity is taken directly from MusicXMLNote.velocity (set by the parser
 *     from <dynamics> markings). No additional transformation is applied here.
 */

import type { MusicXMLScore } from '../types/musicxml';
import type { MusicData, Track, NoteEvent } from '../types/music';

// ─── Tie key ─────────────────────────────────────────────────────────────────

/**
 * Unique key used to match a tie-stop note with its preceding tie-start note.
 * We use pitch + voice so that two notes with the same pitch in different voices
 * (e.g. SATB or piano grands) don't accidentally merge each other's ties.
 */
function tieKey(pitch: string, voice: number): string {
  return `${pitch}|v${voice}`;
}

// ─── Conversion ───────────────────────────────────────────────────────────────

/**
 * Convert a parsed MusicXMLScore to the app's internal MusicData.
 *
 * @param score    - The parsed score.
 * @param warnings - Optional array; conversion warnings are pushed into it.
 *                   Pass `parseResult.warnings` to accumulate all warnings
 *                   (parser + conversion) in one place.
 */
export function scoreToMusicData(score: MusicXMLScore, warnings: string[] = []): MusicData {
  const tracks: Track[] = score.parts.map((part) => {
    const notes: NoteEvent[] = [];

    // Map from tieKey → index in `notes` of the pending tie-start note.
    // When we encounter a tieStop, we extend that note's duration instead of
    // emitting a new NoteEvent.
    const pendingTies = new Map<string, number>();
    let unmatchedTieStops = 0;

    let measureOffset = 0;

    for (const measure of part.measures) {
      for (const note of measure.notes) {
        const startTick = measureOffset + note.startBeat;
        const key = tieKey(note.pitch, note.voice);

        // ── Tie continuation ────────────────────────────────────────────────
        if (note.tieStop && note.pitch !== 'rest') {
          const pendingIdx = pendingTies.get(key);

          if (pendingIdx !== undefined) {
            // Extend the pending note's duration by this note's duration
            notes[pendingIdx].duration += note.duration;

            if (note.tieStart) {
              // Middle of a tie chain: keep pendingTies pointing to the same
              // extended note so the *next* tieStop can extend it further.
              // (No change to pendingTies[key] needed.)
            } else {
              // End of tie chain: the pending slot is now released
              pendingTies.delete(key);
            }
            continue; // Do not emit a new NoteEvent for this continuation
          } else {
            // No matching tieStart found — treat as a normal note, report later
            unmatchedTieStops++;
          }
        }

        // ── Emit a new NoteEvent ─────────────────────────────────────────────
        const noteEvent: NoteEvent = {
          pitch: note.pitch,
          midiNote: note.midiNote,
          duration: note.duration,
          startTick,
          velocity: note.velocity,
        };

        notes.push(noteEvent);

        if (note.tieStart && note.pitch !== 'rest') {
          // Register this note as a pending tie-start for its pitch+voice
          pendingTies.set(key, notes.length - 1);
        } else if (!note.tieStop) {
          // Plain note: clear any stale pending tie for this pitch+voice
          // (shouldn't happen in well-formed files, but defensive)
          pendingTies.delete(key);
        }
      }

      measureOffset += measure.beatsPerBar;
    }

    if (unmatchedTieStops > 0) {
      warnings.push(
        `${part.name}: ${unmatchedTieStops} tie-stop note${unmatchedTieStops > 1 ? 's' : ''} had no matching tie-start (multi-voice or cross-staff ties may not be fully supported).`,
      );
    }

    return {
      name: part.name,
      instrument: part.instrument,
      notes,
    } satisfies Track;
  });

  return {
    bpm: score.bpm,
    key: score.key,
    mode: score.musicalMode,
    beatsPerBar: score.beatsPerBar,
    beatValue: score.beatValue,
    bars: score.totalMeasures,
    tracks,
  } satisfies MusicData;
}

// ─── Filename helper ──────────────────────────────────────────────────────────

/**
 * Generate a descriptive MIDI filename from a MusicXML score's metadata.
 * E.g. "Moonlight-Sonata-C-minor-50bpm.mid"
 */
export function scoreMidiFilename(score: MusicXMLScore): string {
  const safeName = score.title
    ? score.title
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 40)
    : null;

  const key = score.key.replace('#', 'sharp').replace('b', 'flat');
  const base = safeName
    ? `${safeName}-${key}-${score.musicalMode}`
    : `${key}-${score.musicalMode}-${score.bpm}bpm`;

  return `${base}.mid`;
}
