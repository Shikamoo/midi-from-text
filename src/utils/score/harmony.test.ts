import { describe, expect, it } from 'vitest';
import { promptToPlan } from '../promptToPlan';
import { planToScore } from '../planToScore';
import { parsedScoreToMusicData } from '../parsedScoreToMidiEvents';
import { buildScaleContext } from './melodyHelpers';
import { resolveStylePreset } from './stylePresets';
import { deriveHarmony, harmonyTokensToNoteEvents } from './harmony';
import { HOUSE_PLAN_FIXTURE } from '../__fixtures__/scoreExamples';

describe('deriveHarmony', () => {
  it('is deterministic for the same melody and plan', () => {
    const plan = promptToPlan('loopable funky melody 100 BPM summer nu-disco').plan;
    const score = planToScore(plan);
    const scale = buildScaleContext(plan);
    const preset = resolveStylePreset(plan);

    const a = deriveHarmony(score, plan, scale, preset);
    const b = deriveHarmony(score, plan, scale, preset);

    expect(a).toEqual(b);
    expect(a.length).toBe(plan.bars * 3);
  });

  it('triads mode matches the legacy three-note-per-bar output', () => {
    const plan = HOUSE_PLAN_FIXTURE;
    const score = planToScore(plan);
    const scale = buildScaleContext(plan);
    const preset = resolveStylePreset(plan);

    const implicit = deriveHarmony(score, plan, scale, preset);
    const explicit = deriveHarmony(score, plan, scale, preset, {
      voicingWidth: 'normal',
      allowInversions: true,
      chordComplexity: 'triads',
      bassDoubling: false,
      chordDensity: '1-per-bar',
      cadenceStrength: 'medium',
    });

    expect(explicit).toEqual(implicit);
    expect(explicit).toHaveLength(plan.bars * 3);
  });

  it('ends on tonic triad in the final bar', () => {
    const plan = HOUSE_PLAN_FIXTURE;
    const score = planToScore(plan);
    const scale = buildScaleContext(plan);
    const preset = resolveStylePreset(plan);
    const harmony = deriveHarmony(score, plan, scale, preset);

    const finalTriad = harmony.slice(-3);
    const rootPc = scale.rootMidi % 12;
    const intervals = plan.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
    const tonicPcs = new Set([
      rootPc,
      (rootPc + intervals[2]) % 12,
      (rootPc + intervals[4]) % 12,
    ]);
    for (const note of finalTriad) {
      expect(tonicPcs.has(note.midiNote % 12)).toBe(true);
    }
  });

  it('voices chords below the melody register', () => {
    const plan = HOUSE_PLAN_FIXTURE;
    const score = planToScore(plan);

    for (let barIndex = 0; barIndex < score.bars.length; barIndex++) {
      const melodyMin = Math.min(
        ...score.bars[barIndex].notes
          .filter((n) => n.pitch !== 'rest')
          .map((n) => n.midiNote),
      );
      const triad = score.harmonyTokens!.slice(barIndex * 3, barIndex * 3 + 3);
      for (const note of triad) {
        expect(note.midiNote).toBeLessThan(melodyMin - 4);
      }
    }
  });

  it('uses one block chord per bar with bar-length duration', () => {
    const plan = HOUSE_PLAN_FIXTURE;
    const score = planToScore(plan);

    expect(score.harmonyTokens).toHaveLength(plan.bars * 3);
    for (const token of score.harmonyTokens!) {
      expect(token.duration).toBe(plan.beatsPerBar);
    }
  });

  it('harmonyTokensToNoteEvents aligns chord tones on bar downbeats', () => {
    const plan = HOUSE_PLAN_FIXTURE;
    const score = planToScore(plan);
    const events = harmonyTokensToNoteEvents(score.harmonyTokens!, plan.beatsPerBar, 3);

    expect(events).toHaveLength(plan.bars * 3);
    for (let bar = 0; bar < plan.bars; bar++) {
      const barEvents = events.filter((e) => e.startTick === bar * plan.beatsPerBar);
      expect(barEvents).toHaveLength(3);
    }
  });

  it('adds a harmony track to preview/export MusicData for prompt scores', () => {
    const plan = HOUSE_PLAN_FIXTURE;
    const score = planToScore(plan);
    const data = parsedScoreToMusicData(score, {
      key: plan.key,
      mode: plan.mode,
      instrument: plan.instrument,
    });

    expect(data.tracks).toHaveLength(2);
    expect(data.tracks[0].name).toBe('Melody');
    expect(data.tracks[1].name).toBe('Harmony');
    expect(data.tracks[1].notes.length).toBe(plan.bars * 3);
  });

  it('wide voicing sits lower than tight voicing for the same melody', () => {
    const plan = HOUSE_PLAN_FIXTURE;
    const score = planToScore(plan);
    const scale = buildScaleContext(plan);
    const preset = resolveStylePreset(plan);

    const tight = deriveHarmony(score, plan, scale, preset, {
      voicingWidth: 'tight',
      allowInversions: true,
      chordComplexity: 'triads',
      bassDoubling: false,
      chordDensity: '1-per-bar',
      cadenceStrength: 'medium',
    });
    const wide = deriveHarmony(score, plan, scale, preset, {
      voicingWidth: 'wide',
      allowInversions: true,
      chordComplexity: 'triads',
      bassDoubling: false,
      chordDensity: '1-per-bar',
      cadenceStrength: 'medium',
    });

    const tightAvg =
      tight.reduce((sum, t) => sum + t.midiNote, 0) / tight.length;
    const wideAvg =
      wide.reduce((sum, t) => sum + t.midiNote, 0) / wide.length;

    expect(wideAvg).toBeLessThan(tightAvg);
  });

  it('disabling inversions changes harmony output', () => {
    const plan = HOUSE_PLAN_FIXTURE;
    const score = planToScore(plan);
    const scale = buildScaleContext(plan);
    const preset = resolveStylePreset(plan);

    const withInversions = deriveHarmony(score, plan, scale, preset, {
      voicingWidth: 'normal',
      allowInversions: true,
      chordComplexity: 'triads',
      bassDoubling: false,
      chordDensity: '1-per-bar',
      cadenceStrength: 'medium',
    });
    const rootOnly = deriveHarmony(score, plan, scale, preset, {
      voicingWidth: 'normal',
      allowInversions: false,
      chordComplexity: 'triads',
      bassDoubling: false,
      chordDensity: '1-per-bar',
      cadenceStrength: 'medium',
    });

    expect(rootOnly).not.toEqual(withInversions);
  });

  it('sevenths mode is deterministic with four notes per bar', () => {
    const plan = HOUSE_PLAN_FIXTURE;
    const score = planToScore(plan);
    const scale = buildScaleContext(plan);
    const preset = resolveStylePreset(plan);
    const settings = {
      voicingWidth: 'normal' as const,
      allowInversions: true,
      chordComplexity: 'sevenths' as const,
      bassDoubling: false,
      chordDensity: '1-per-bar' as const,
      cadenceStrength: 'medium' as const,
    };

    const a = deriveHarmony(score, plan, scale, preset, settings);
    const b = deriveHarmony(score, plan, scale, preset, settings);

    expect(a).toEqual(b);
    expect(a).toHaveLength(plan.bars * 4);
  });

  it('sevenths stay below the melody and use compact spans', () => {
    const plan = HOUSE_PLAN_FIXTURE;
    const score = planToScore(plan);
    const scale = buildScaleContext(plan);
    const preset = resolveStylePreset(plan);
    const harmony = deriveHarmony(score, plan, scale, preset, {
      voicingWidth: 'normal',
      allowInversions: true,
      chordComplexity: 'sevenths',
      bassDoubling: false,
      chordDensity: '1-per-bar',
      cadenceStrength: 'medium',
    });

    for (let barIndex = 0; barIndex < score.bars.length; barIndex++) {
      const melodyMin = Math.min(
        ...score.bars[barIndex].notes
          .filter((n) => n.pitch !== 'rest')
          .map((n) => n.midiNote),
      );
      const chord = harmony.slice(barIndex * 4, barIndex * 4 + 4).map((n) => n.midiNote);
      expect(Math.max(...chord)).toBeLessThan(melodyMin - 4);
      expect(Math.max(...chord) - Math.min(...chord)).toBeLessThanOrEqual(18);
    }
  });

  it('sevenths final bar uses a diatonic tonic seventh in C major', () => {
    const plan = { ...HOUSE_PLAN_FIXTURE, key: 'C', mode: 'major' as const };
    const score = planToScore(plan);
    const scale = buildScaleContext(plan);
    const preset = resolveStylePreset(plan);
    const harmony = deriveHarmony(score, plan, scale, preset, {
      voicingWidth: 'normal',
      allowInversions: true,
      chordComplexity: 'sevenths',
      bassDoubling: false,
      chordDensity: '1-per-bar',
      cadenceStrength: 'medium',
    });

    const finalChord = harmony.slice(-4).map((n) => n.midiNote % 12).sort((a, b) => a - b);
    expect(finalChord).toEqual([0, 4, 7, 11]);
  });

  it('1-per-bar density matches legacy output when explicitly set', () => {
    const plan = HOUSE_PLAN_FIXTURE;
    const score = planToScore(plan);
    const scale = buildScaleContext(plan);
    const preset = resolveStylePreset(plan);
    const settings = {
      voicingWidth: 'normal' as const,
      allowInversions: true,
      chordComplexity: 'triads' as const,
      bassDoubling: false,
      chordDensity: '1-per-bar' as const,
      cadenceStrength: 'medium' as const,
    };

    expect(deriveHarmony(score, plan, scale, preset, settings)).toEqual(
      deriveHarmony(score, plan, scale, preset),
    );
  });

  it('2-per-bar density is deterministic with half-bar durations', () => {
    const plan = HOUSE_PLAN_FIXTURE;
    const score = planToScore(plan);
    const scale = buildScaleContext(plan);
    const preset = resolveStylePreset(plan);
    const settings = {
      voicingWidth: 'normal' as const,
      allowInversions: true,
      chordComplexity: 'triads' as const,
      bassDoubling: false,
      chordDensity: '2-per-bar' as const,
      cadenceStrength: 'medium' as const,
    };

    const a = deriveHarmony(score, plan, scale, preset, settings);
    const b = deriveHarmony(score, plan, scale, preset, settings);

    expect(a).toEqual(b);
    expect(a).toHaveLength(plan.bars * 2 * 3);
    for (const token of a) {
      expect(token.duration).toBe(plan.beatsPerBar / 2);
    }
  });

  it('2-per-bar export places second chord on the mid-bar downbeat', () => {
    const plan = HOUSE_PLAN_FIXTURE;
    const score = planToScore(plan, {
      voicingWidth: 'normal',
      allowInversions: true,
      chordComplexity: 'triads',
      bassDoubling: false,
      chordDensity: '2-per-bar',
      cadenceStrength: 'medium',
    });
    const events = harmonyTokensToNoteEvents(score.harmonyTokens!, plan.beatsPerBar, 3);
    const half = plan.beatsPerBar / 2;

    expect(events.filter((e) => e.startTick === 0)).toHaveLength(3);
    expect(events.filter((e) => e.startTick === half)).toHaveLength(3);
    expect(events.filter((e) => e.startTick === plan.beatsPerBar)).toHaveLength(3);
  });

  it('bass doubling off preserves prior note counts', () => {
    const plan = HOUSE_PLAN_FIXTURE;
    const score = planToScore(plan);
    const scale = buildScaleContext(plan);
    const preset = resolveStylePreset(plan);

    const without = deriveHarmony(score, plan, scale, preset, {
      voicingWidth: 'normal',
      allowInversions: true,
      chordComplexity: 'triads',
      bassDoubling: false,
      chordDensity: '1-per-bar',
      cadenceStrength: 'medium',
    });
    const implicit = deriveHarmony(score, plan, scale, preset);

    expect(without).toEqual(implicit);
    expect(without).toHaveLength(plan.bars * 3);
  });

  it('bass doubling adds one deterministic root note per bar below the voicing', () => {
    const plan = HOUSE_PLAN_FIXTURE;
    const score = planToScore(plan);
    const scale = buildScaleContext(plan);
    const preset = resolveStylePreset(plan);
    const settings = {
      voicingWidth: 'normal' as const,
      allowInversions: true,
      chordComplexity: 'triads' as const,
      bassDoubling: true,
      chordDensity: '1-per-bar' as const,
      cadenceStrength: 'medium' as const,
    };

    const a = deriveHarmony(score, plan, scale, preset, settings);
    const b = deriveHarmony(score, plan, scale, preset, settings);

    expect(a).toEqual(b);
    expect(a).toHaveLength(plan.bars * 4);

    const intervals = plan.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
    const rootPc = scale.rootMidi % 12;

    for (let barIndex = 0; barIndex < plan.bars; barIndex++) {
      const block = a.slice(barIndex * 4, barIndex * 4 + 4);
      const chord = block.slice(0, 3).map((n) => n.midiNote);
      const bass = block[3].midiNote;
      expect(bass).toBeLessThan(Math.min(...chord));
      expect(bass).toBeGreaterThanOrEqual(24);
    }

    const rootDegree = 0;
    const expectedRootPc = (rootPc + intervals[rootDegree]) % 12;
    const finalBass = a[a.length - 1].midiNote;
    expect(finalBass % 12).toBe(expectedRootPc);
  });

  it('bass doubling works with sevenths and exports all notes on the bar downbeat', () => {
    const plan = HOUSE_PLAN_FIXTURE;
    const score = planToScore(plan, {
      voicingWidth: 'normal',
      allowInversions: true,
      chordComplexity: 'sevenths',
      bassDoubling: true,
      chordDensity: '1-per-bar',
      cadenceStrength: 'medium',
    });
    const data = parsedScoreToMusicData(score, {
      key: plan.key,
      mode: plan.mode,
      instrument: plan.instrument,
    });

    expect(score.harmonyTokens).toHaveLength(plan.bars * 5);
    expect(data.tracks[1].notes).toHaveLength(plan.bars * 5);

    const events = harmonyTokensToNoteEvents(score.harmonyTokens!, plan.beatsPerBar, 5);
    for (let bar = 0; bar < plan.bars; bar++) {
      expect(events.filter((e) => e.startTick === bar * plan.beatsPerBar)).toHaveLength(5);
    }
  });

  it('medium cadence strength matches legacy harmony output', () => {
    const plan = HOUSE_PLAN_FIXTURE;
    const score = planToScore(plan);
    const scale = buildScaleContext(plan);
    const preset = resolveStylePreset(plan);
    const settings = {
      voicingWidth: 'normal' as const,
      allowInversions: true,
      chordComplexity: 'triads' as const,
      bassDoubling: false,
      chordDensity: '1-per-bar' as const,
      cadenceStrength: 'medium' as const,
    };

    expect(deriveHarmony(score, plan, scale, preset, settings)).toEqual(
      deriveHarmony(score, plan, scale, preset),
    );
  });

  it('strong cadence shifts penultimate harmony more than soft', () => {
    const plan = { ...HOUSE_PLAN_FIXTURE, cadenceStrength: 0.9 };
    const score = planToScore(plan);
    const scale = buildScaleContext(plan);
    const preset = resolveStylePreset(plan);
    const base = {
      voicingWidth: 'normal' as const,
      allowInversions: true,
      chordComplexity: 'triads' as const,
      bassDoubling: false,
      chordDensity: '1-per-bar' as const,
    };

    const soft = deriveHarmony(score, plan, scale, preset, { ...base, cadenceStrength: 'soft' });
    const strong = deriveHarmony(score, plan, scale, preset, { ...base, cadenceStrength: 'strong' });

    const penultimateStart = (plan.bars - 2) * 3;
    const triadPcs = (harmony: typeof soft) =>
      harmony.slice(penultimateStart, penultimateStart + 3).map((n) => n.midiNote % 12).sort((a, b) => a - b);

    expect(triadPcs(soft)).toEqual([0, 4, 7]);
    expect(triadPcs(strong)).toEqual([2, 7, 11]);
    expect(soft).not.toEqual(strong);
  });

  it('final bar stays on tonic across cadence strengths', () => {
    const plan = HOUSE_PLAN_FIXTURE;
    const score = planToScore(plan);
    const scale = buildScaleContext(plan);
    const preset = resolveStylePreset(plan);
    const base = {
      voicingWidth: 'normal' as const,
      allowInversions: true,
      chordComplexity: 'triads' as const,
      bassDoubling: false,
      chordDensity: '1-per-bar' as const,
    };

    for (const cadenceStrength of ['soft', 'medium', 'strong'] as const) {
      const harmony = deriveHarmony(score, plan, scale, preset, { ...base, cadenceStrength });
      const finalTriad = harmony.slice(-3).map((n) => n.midiNote % 12).sort((a, b) => a - b);
      expect(finalTriad).toEqual([0, 4, 7]);
    }
  });
});
