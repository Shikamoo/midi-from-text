import { describe, expect, it } from 'vitest';
import { parseMusicInput, parseResultToMusicData } from './parseMusicInput';
import { generateMusic } from './musicEngine';
import { scoreToCanonicalText } from './scoreToCanonicalText';
import { parsedScoreToNoteEvents } from './parsedScoreToMidiEvents';
import { scoreFingerprint } from './scoreVerification';
import { DEFAULT_CONFIG } from './musicEngine';
import { applyHarmonyPlaybackFilter } from './harmonySettings';

const BASE_OPTS = {
  bpm: 120,
  key: 'C',
  musicalMode: 'major' as const,
  beatsPerBar: 4,
  beatValue: 4,
  bars: 4,
  instrument: 0,
};

function configFromOpts(mode: 'prompt' | 'notes', text: string) {
  return {
    ...DEFAULT_CONFIG,
    mode,
    promptText: mode === 'prompt' ? text : '',
    notesText: mode === 'notes' ? text : '',
    bpm: BASE_OPTS.bpm,
    key: BASE_OPTS.key,
    musicalMode: BASE_OPTS.musicalMode,
    beatsPerBar: BASE_OPTS.beatsPerBar,
    beatValue: BASE_OPTS.beatValue,
    bars: BASE_OPTS.bars,
    instrument: BASE_OPTS.instrument,
  };
}

describe('export pipeline consistency', () => {
  it('grouped-note input: canonical text matches ParsedScore', () => {
    const text = 'C4 q E4 q G4 h A4 q G4 q E4 h';
    const result = parseMusicInput(text, {
      ...BASE_OPTS,
      mode: BASE_OPTS.musicalMode,
    });

    expect(result.parsedScore).not.toBeNull();
    expect(result.normalizedText).toBe(scoreToCanonicalText(result.parsedScore!));
    expect(result.previewData?.tracks[0].notes.length).toBe(result.parsedScore!.tokens.length);
  });

  it('prompt-text input: preview and generate share fingerprint', () => {
    const prompt = 'loopable funky melody 100 BPM summer nu-disco';
    const live = parseMusicInput(prompt, { ...BASE_OPTS, mode: BASE_OPTS.musicalMode });
    const generated = generateMusic(configFromOpts('prompt', prompt));

    expect(live.parsedScore).not.toBeNull();
    expect(live.parsedScore?.harmonyTokens?.length).toBeGreaterThan(0);
    expect(live.previewData?.tracks).toHaveLength(2);
    expect(generated.committedFingerprint).toBe(scoreFingerprint(live.parsedScore!));
    expect(live.normalizedText).toBe(scoreToCanonicalText(live.parsedScore!));
  });

  it('explicit bar separators preserve bar boundaries in canonical text', () => {
    const text = 'C4 q, E4 q, G4 h | A4 q, G4 q, E4 h';
    const result = parseMusicInput(text, { ...BASE_OPTS, mode: BASE_OPTS.musicalMode });

    expect(result.normalizedText).toContain(' | ');
    expect(result.parsedScore?.bars.length).toBe(2);
    expect(result.normalizedText).toBe(scoreToCanonicalText(result.parsedScore!));
  });

  it('auto-grouped bars fill meter without explicit pipes', () => {
    const text = 'C4 q, D4 q, E4 q, F4 q, G4 q, A4 q, B4 q, C5 q';
    const result = parseMusicInput(text, { ...BASE_OPTS, mode: BASE_OPTS.musicalMode });

    expect(result.parsedScore?.bars.length).toBe(2);
    expect(result.normalizedText).toBe(scoreToCanonicalText(result.parsedScore!));
  });

  it('parsedScoreToNoteEvents preserves tempo timing and rests', () => {
    const text = 'C4 q, R q, E4 h | G4 h, R h';
    const result = parseMusicInput(text, { ...BASE_OPTS, mode: BASE_OPTS.musicalMode });
    const events = parsedScoreToNoteEvents(result.parsedScore!);

    expect(events).toHaveLength(result.parsedScore!.tokens.length);
    expect(events[1].pitch).toBe('rest');
    expect(events[1].startTick).toBe(1);
    expect(events[2].startTick).toBe(2);
    expect(events[0].duration).toBe(1);
  });

  it('parseResultToMusicData matches live previewData fingerprint', () => {
    const text = 'C4 q, E4 q, G4 h | A4 q, G4 q, E4 h';
    const result = parseMusicInput(text, { ...BASE_OPTS, mode: BASE_OPTS.musicalMode });
    const fromHelper = parseResultToMusicData(result);
    const fromPreview = result.previewData;

    expect(fromHelper).toEqual(fromPreview);
    expect(fromHelper?.bpm).toBe(result.parsedScore?.bpm);
    expect(fromHelper?.bars).toBe(result.parsedScore?.bars.length);
  });

  it('generateMusic does not regenerate via legacy notesParser', () => {
    const text = 'C4 q, R q, C4 e, C4 e, R q | G4 q, R q, G4 h';
    const live = parseMusicInput(text, { ...BASE_OPTS, mode: 'minor' });
    const generated = generateMusic({
      ...configFromOpts('notes', text),
      musicalMode: 'minor',
    });

    expect(generated.data?.tracks[0].notes.length).toBe(live.previewData?.tracks[0].notes.length);
    expect(generated.committedFingerprint).toBe(
      live.parsedScore ? scoreFingerprint(live.parsedScore) : null,
    );
  });

  it('chords-off export filter does not change score fingerprint', () => {
    const prompt = 'loopable funky melody 100 BPM summer nu-disco';
    const generated = generateMusic(configFromOpts('prompt', prompt));
    expect(generated.data).not.toBeNull();

    const filtered = applyHarmonyPlaybackFilter(generated.data!, false);
    expect(filtered.tracks).toHaveLength(1);
    expect(generated.committedFingerprint).not.toBeNull();
  });

  it('voicing width changes fingerprint until regenerate', () => {
    const prompt = 'loopable funky melody 100 BPM summer nu-disco';
    const generated = generateMusic(configFromOpts('prompt', prompt));
    const widePreview = parseMusicInput(prompt, {
      ...BASE_OPTS,
      mode: BASE_OPTS.musicalMode,
      harmonyGeneration: { voicingWidth: 'wide', allowInversions: true, chordComplexity: 'triads', bassDoubling: false, chordDensity: '1-per-bar', cadenceStrength: 'medium' },
    });

    expect(widePreview.parsedScore).not.toBeNull();
    expect(scoreFingerprint(widePreview.parsedScore!)).not.toBe(generated.committedFingerprint);
  });

  it('seventh chords change fingerprint until regenerate', () => {
    const prompt = 'loopable funky melody 100 BPM summer nu-disco';
    const generated = generateMusic(configFromOpts('prompt', prompt));
    const seventhPreview = parseMusicInput(prompt, {
      ...BASE_OPTS,
      mode: BASE_OPTS.musicalMode,
      harmonyGeneration: {
        voicingWidth: 'normal',
        allowInversions: true,
        chordComplexity: 'sevenths',
        bassDoubling: false,
        chordDensity: '1-per-bar',
        cadenceStrength: 'medium',
      },
    });

    expect(seventhPreview.parsedScore?.harmonyTokens).toHaveLength(
      (seventhPreview.parsedScore?.bars.length ?? 0) * 4,
    );
    expect(scoreFingerprint(seventhPreview.parsedScore!)).not.toBe(generated.committedFingerprint);
  });

  it('bass doubling changes fingerprint until regenerate', () => {
    const prompt = 'loopable funky melody 100 BPM summer nu-disco';
    const generated = generateMusic(configFromOpts('prompt', prompt));
    const bassPreview = parseMusicInput(prompt, {
      ...BASE_OPTS,
      mode: BASE_OPTS.musicalMode,
      harmonyGeneration: {
        voicingWidth: 'normal',
        allowInversions: true,
        chordComplexity: 'triads',
        bassDoubling: true,
        chordDensity: '1-per-bar',
        cadenceStrength: 'medium',
      },
    });

    expect(bassPreview.parsedScore?.harmonyTokens).toHaveLength(
      (bassPreview.parsedScore?.bars.length ?? 0) * 4,
    );
    expect(scoreFingerprint(bassPreview.parsedScore!)).not.toBe(generated.committedFingerprint);
  });

  it('2-per-bar density changes fingerprint until regenerate', () => {
    const prompt = 'loopable funky melody 100 BPM summer nu-disco';
    const generated = generateMusic(configFromOpts('prompt', prompt));
    const densePreview = parseMusicInput(prompt, {
      ...BASE_OPTS,
      mode: BASE_OPTS.musicalMode,
      harmonyGeneration: {
        voicingWidth: 'normal',
        allowInversions: true,
        chordComplexity: 'triads',
        bassDoubling: false,
        chordDensity: '2-per-bar',
        cadenceStrength: 'medium',
      },
    });

    expect(densePreview.parsedScore?.harmonyTokens?.length).toBe(
      (densePreview.parsedScore?.bars.length ?? 0) * 2 * 3,
    );
    expect(scoreFingerprint(densePreview.parsedScore!)).not.toBe(generated.committedFingerprint);
  });

  it('cadence strength changes fingerprint until regenerate', () => {
    const prompt = 'loopable funky melody 100 BPM summer nu-disco';
    const generated = generateMusic(configFromOpts('prompt', prompt));
    const strongPreview = parseMusicInput(prompt, {
      ...BASE_OPTS,
      mode: BASE_OPTS.musicalMode,
      harmonyGeneration: {
        voicingWidth: 'normal',
        allowInversions: true,
        chordComplexity: 'triads',
        bassDoubling: false,
        chordDensity: '1-per-bar',
        cadenceStrength: 'strong',
      },
    });

    expect(strongPreview.parsedScore).not.toBeNull();
    expect(scoreFingerprint(strongPreview.parsedScore!)).not.toBe(generated.committedFingerprint);
  });
});
