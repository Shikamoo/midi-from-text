import { describe, expect, it } from 'vitest';
import type { MusicData } from '../types/music';
import {
  beatToSeconds,
  buildPreviewNotes,
  midiToFrequency,
  previewDurationSeconds,
} from './musicPreviewSchedule';

function sampleData(notes: MusicData['tracks'][0]['notes'], bpm = 120): MusicData {
  return {
    bpm,
    key: 'C',
    mode: 'major',
    beatsPerBar: 4,
    beatValue: 4,
    bars: 2,
    tracks: [{ name: 'Track 1', instrument: 0, notes }],
  };
}

describe('musicPreviewSchedule', () => {
  it('beatToSeconds converts quarter-note beats at BPM', () => {
    expect(beatToSeconds(1, 120)).toBeCloseTo(0.5);
    expect(beatToSeconds(4, 60)).toBeCloseTo(4);
  });

  it('midiToFrequency maps A4 to 440 Hz', () => {
    expect(midiToFrequency(69)).toBeCloseTo(440);
    expect(midiToFrequency(60)).toBeCloseTo(261.63, 1);
  });

  it('buildPreviewNotes skips rests but keeps later note timing', () => {
    const data = sampleData([
      { pitch: 'C4', midiNote: 60, duration: 1, startTick: 0, velocity: 90 },
      { pitch: 'rest', midiNote: -1, duration: 1, startTick: 1, velocity: 0 },
      { pitch: 'E4', midiNote: 64, duration: 2, startTick: 2, velocity: 90 },
    ]);

    const notes = buildPreviewNotes(data);
    expect(notes).toHaveLength(2);
    expect(notes[0].startBeat).toBe(0);
    expect(notes[1].startBeat).toBe(2);
    expect(notes[1].durationBeats).toBe(2);
  });

  it('previewDurationSeconds includes rest gaps via event end beats', () => {
    const data = sampleData([
      { pitch: 'C4', midiNote: 60, duration: 1, startTick: 0, velocity: 90 },
      { pitch: 'rest', midiNote: -1, duration: 1, startTick: 1, velocity: 0 },
      { pitch: 'G4', midiNote: 67, duration: 2, startTick: 2, velocity: 90 },
    ]);

    // 4 beats total at 120 BPM → 2 seconds
    expect(previewDurationSeconds(data)).toBeCloseTo(2);
  });

  it('buildPreviewNotes merges notes from all tracks', () => {
    const data: MusicData = {
      bpm: 100,
      key: 'C',
      mode: 'major',
      beatsPerBar: 4,
      beatValue: 4,
      bars: 1,
      tracks: [
        {
          name: 'A',
          instrument: 0,
          notes: [
            { pitch: 'C4', midiNote: 60, duration: 1, startTick: 0, velocity: 80 },
          ],
        },
        {
          name: 'B',
          instrument: 32,
          notes: [
            { pitch: 'E4', midiNote: 64, duration: 1, startTick: 1, velocity: 70 },
          ],
        },
      ],
    };

    const notes = buildPreviewNotes(data);
    expect(notes.map((n) => n.midiNote)).toEqual([60, 64]);
    expect(notes.map((n) => n.trackIndex)).toEqual([0, 1]);
  });
});
