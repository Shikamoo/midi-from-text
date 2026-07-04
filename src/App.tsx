import { useState, useEffect, useRef } from 'react';
import { useMusicGenerator } from './hooks/useMusicGenerator';
import { useMusicInput } from './hooks/useMusicInput';
import { useMusicXml } from './hooks/useMusicXml';
import { useAudioAnalysis } from './hooks/useAudioAnalysis';
import { useAudioPlayback } from './hooks/useAudioPlayback';
import { useHarmonyPlayback } from './hooks/useHarmonyPlayback';
import { useMusicPreviewPlayback } from './hooks/useMusicPreviewPlayback';
import { ModeToggle, type AppMode } from './components/ModeToggle';
import { SettingsPanel } from './components/SettingsPanel';
import { MusicInputPreview } from './components/MusicInputPreview';
import { PreviewPlaybackControls } from './components/PreviewPlaybackControls';
import { HarmonyControls } from './components/HarmonyControls';
import { StatusBar } from './components/StatusBar';
import { MusicXmlUploader } from './components/MusicXmlUploader';
import { AudioUploader } from './components/AudioUploader';
import { SourceModeSelector } from './components/SourceModeSelector';
import { CleanupControls } from './components/CleanupControls';
import { AudioAnalysisPanel } from './components/AudioAnalysisPanel';
import { ScoreViewer } from './components/ScoreViewer';
import { ScoreSummary } from './components/ScoreSummary';
import { LocalPlannerPanel } from './components/LocalPlannerPanel';
import { exportMidi, defaultMidiFilename } from './utils/midiExporter';
import { applyRepair, type RepairActionId } from './utils/repairMusicText';
import { scoreMidiFilename } from './utils/scoreToMusicData';
import { buildScoreSummary, scoreFingerprint } from './utils/scoreVerification';
import {
  applyHarmonyPlaybackFilter,
  harmonyGenerationFromConfig,
} from './utils/harmonySettings';
import {
  exportAudioMidi,
  exportBassOnlyMidi,
  exportOtherOnlyMidi,
} from './utils/audioMidiExporter';

// ── Preset examples ────────────────────────────────────────────────────────────

interface Preset { label: string; text: string }

const PROMPT_PRESETS: Preset[] = [
  { label: 'Nu-Disco Loop',  text: 'loopable funky melody, 100 BPM, summer nu-disco' },
  { label: 'Piano Arpeggio', text: '8 bars, C minor, 120 BPM, arpeggiated piano' },
  { label: 'Jazz Bass',      text: '4 bars, F major, 90 BPM, walking bassline, acoustic bass' },
  { label: 'Synth Melody',   text: '8 bars, D minor, 140 BPM, ascending melody, synth lead' },
  { label: 'Soft Strings',   text: '4 bars, G major, 72 BPM, chords, soft strings, legato' },
];

const NOTES_PRESETS: Preset[] = [
  { label: 'C Major Scale',  text: 'C4 q, D4 q, E4 q, F4 q | G4 q, A4 q, B4 q, C5 q' },
  { label: 'Minor Triad',    text: 'A3 h, C4 q, E4 q | A3 h, E4 h' },
  { label: 'Walking Bass',   text: 'C2 q, E2 q, G2 q, B2 q | A2 q, C3 q, E3 q, G3 q' },
  { label: 'Syncopated',     text: 'C4 q, R q, C4 e, C4 e, R q | G4 q, R q, G4 h' },
];

const PROMPT_PLACEHOLDER =
  '8 bars, C minor, 120 BPM, arpeggiated piano\n\n' +
  'Describe the music you want. You can mention key, tempo, bars,\n' +
  'time signature, and instrument.';

const NOTES_PLACEHOLDER =
  'C4 q, E4 q, G4 h | A4 q, G4 q, E4 h\n\n' +
  'Format: Pitch Duration — separated by commas. Bars separated by |.\n' +
  'Durations: w=whole  h=half  q=quarter  e=eighth  s=sixteenth\n' +
  'Dotted notes: C4 q.    Rests: R q';

// ── App ────────────────────────────────────────────────────────────────────────

export default function App() {
  // ── Text-based flow (prompt / notes) ────────────────────────────────────────
  const {
    config,
    status,
    musicData,
    error,
    warnings,
    updateConfig,
    generate,
    promptDetectionSummary,
    committedFingerprint,
    useLocalPlanner,
    plannerStatus,
    llmPlan,
    plannerMessage,
    plannerWarning,
    plannerSource,
    plannerModel,
    plannerSeed,
    plannerTemperature,
    plannerVariation,
    committedPlanOverride,
    setUseLocalPlanner,
    setPlannerControls,
  } = useMusicGenerator();

  // ── MusicXML flow ───────────────────────────────────────────────────────────
  const xml = useMusicXml();

  // ── Audio-to-MIDI flow ───────────────────────────────────────────────────────
  const audio    = useAudioAnalysis();
  const playback = useAudioPlayback();
  const musicPreview = useMusicPreviewPlayback();
  const harmonyPlayback = useHarmonyPlayback();

  // ── Top-level mode ─────────────────────────────────────────────────────────
  const [appMode, setAppMode] = useState<AppMode>('prompt');
  const [exportError, setExportError] = useState<string | null>(null);

  // ── Space bar shortcut: play/pause in audio mode ──────────────────────────
  // A ref keeps the handler current without re-registering the listener on
  // every render (which would happen if we listed fast-changing playback
  // fields such as isPlaying or currentTime as effect deps).
  const playbackRef = useRef(playback);
  useEffect(() => { playbackRef.current = playback; });

  useEffect(() => {
    if (appMode !== 'audio') return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== 'Space' || e.repeat) return;
      const target = e.target as HTMLElement;
      const tag = target.tagName.toLowerCase();
      // Never steal Space from interactive elements
      if (['input', 'textarea', 'select', 'button'].includes(tag)) return;
      if (target.isContentEditable) return;

      const pb = playbackRef.current;
      if (!pb.hasAudio) return;

      e.preventDefault(); // prevent accidental page scroll
      if (pb.isPlaying) {
        pb.pause();
      } else {
        void pb.play();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  // Re-register only when mode changes; playback state is read via the ref.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appMode]);

  function handleAppModeChange(mode: AppMode) {
    musicPreview.stop();
    setAppMode(mode);
    setExportError(null);

    if (mode === 'prompt' || mode === 'notes') {
      // Sync the underlying MusicConfig mode so generate() uses the right parser
      updateConfig({ mode });
    }
    // Don't reset xmlState / audioState when switching — preserve loaded files
  }

  // ── Audio-flow handlers ────────────────────────────────────────────────────
  // Export always uses the cleaned/quantized notes (audio.cleanedNotes),
  // while the piano roll keeps showing the raw detected notes.
  function audioBaseFilename() {
    return audio.fileName ? audio.fileName.replace(/\.[^.]+$/, '') : 'audio-midi';
  }

  function handleAudioDownloadMain() {
    setExportError(null);
    const result = exportAudioMidi(audio.cleanedNotes, {
      sourceMode: audio.sourceMode,
      bpm: audio.bpm,
      beatsPerBar: audio.beatsPerBar,
      baseFilename: audioBaseFilename(),
    });
    if (!result.ok) setExportError(result.error);
  }

  function handleAudioDownloadBass() {
    const bass = audio.cleanedNotes.bassNotes;
    if (!bass || bass.length === 0) {
      setExportError('No bass-range notes to export after cleanup.');
      return;
    }
    setExportError(null);
    const result = exportBassOnlyMidi(bass, {
      bpm: audio.bpm,
      beatsPerBar: audio.beatsPerBar,
      baseFilename: audioBaseFilename(),
    });
    if (!result.ok) setExportError(result.error);
  }

  function handleAudioDownloadOther() {
    const other = audio.cleanedNotes.otherNotes;
    if (!other || other.length === 0) {
      setExportError('No upper-range notes to export after cleanup.');
      return;
    }
    setExportError(null);
    const result = exportOtherOnlyMidi(other, {
      bpm: audio.bpm,
      beatsPerBar: audio.beatsPerBar,
      baseFilename: audioBaseFilename(),
    });
    if (!result.ok) setExportError(result.error);
  }

  // ── Text-flow handlers ─────────────────────────────────────────────────────
  const isTextMode = appMode === 'prompt' || appMode === 'notes';
  const currentText = config.mode === 'prompt' ? config.promptText : config.notesText;

  const promptPlanOverride =
    config.mode === 'prompt' &&
    useLocalPlanner &&
    committedPlanOverride &&
    config.promptText.trim() === (committedPlanOverride.llmPlan?.prompt ?? config.promptText.trim())
      ? committedPlanOverride
      : undefined;

  const musicInput = useMusicInput(currentText, {
    bpm: config.bpm,
    key: config.key,
    mode: config.musicalMode,
    beatsPerBar: config.beatsPerBar,
    beatValue: config.beatValue,
    bars: config.bars,
    instrument: config.instrument,
    harmonyGeneration:
      config.mode === 'prompt' ? harmonyGenerationFromConfig(config) : undefined,
    promptPlanOverride,
  });

  const textInputIsEmpty = isTextMode && currentText.trim().length === 0;
  const textIsReady = isTextMode && status === 'ready' && musicData !== null;
  const exportInSync = Boolean(
    textIsReady &&
    committedFingerprint &&
    musicInput.parsedScore &&
    scoreFingerprint(musicInput.parsedScore) === committedFingerprint,
  );
  const canExportMidi = exportInSync && musicInput.canExport;
  const canPreviewMidi = canExportMidi;
  const scoreSummary = buildScoreSummary(musicInput.parsedScore, exportInSync);
  const isGenerating = isTextMode && status === 'generating';
  const hint = config.mode === 'prompt' ? promptDetectionSummary() : '';
  const presets = config.mode === 'prompt' ? PROMPT_PRESETS : NOTES_PRESETS;

  function handlePreset(text: string) {
    updateConfig(config.mode === 'prompt' ? { promptText: text } : { notesText: text });
  }

  function handleGenerate() {
    musicPreview.stop();
    setExportError(null);
    generate();
  }

  function previewMusicData() {
    if (!musicData) return null;
    return applyHarmonyPlaybackFilter(musicData, harmonyPlayback.chordsEnabled);
  }

  function handlePreviewToggle() {
    void musicPreview.toggle(previewMusicData(), canPreviewMidi);
  }

  useEffect(() => {
    musicPreview.setPreviewHarmonyVolume(harmonyPlayback.harmonyVolume);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [harmonyPlayback.harmonyVolume]);

  useEffect(() => {
    musicPreview.setPlaybackGate(canPreviewMidi);
    if (!canPreviewMidi) musicPreview.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPreviewMidi]);

  function handleRepair(actionId: RepairActionId) {
    const result = applyRepair(actionId, currentText, {
      settingsBars: config.bars,
      parsedBarCount: musicInput.parsedScore?.bars.length,
    });

    const patch: Partial<typeof config> = {};
    if (result.text !== undefined) {
      if (config.mode === 'prompt') patch.promptText = result.text;
      else patch.notesText = result.text;
    }
    if (result.configPatch?.bars !== undefined) {
      patch.bars = result.configPatch.bars;
    }
    if (Object.keys(patch).length > 0) updateConfig(patch);
  }

  function handleTextDownload() {
    if (!musicData || !exportInSync) return;
    setExportError(null);
    const exportData = applyHarmonyPlaybackFilter(musicData, harmonyPlayback.chordsEnabled);
    const filename = defaultMidiFilename(exportData);
    const result = exportMidi(exportData, filename);
    if (!result.ok) setExportError(result.error);
  }

  // ── MusicXML-flow handlers ─────────────────────────────────────────────────
  const xmlIsReady = appMode === 'musicxml' && xml.status === 'ready' && xml.musicData !== null;
  const xmlScore = xml.parseResult?.score ?? null;

  function handleXmlDownload() {
    if (!xml.musicData || !xmlScore) return;
    setExportError(null);
    const filename = scoreMidiFilename(xmlScore);
    const result = exportMidi(xml.musicData, filename);
    if (!result.ok) setExportError(result.error);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-brand">
            <span className="app-icon">♩</span>
            <h1 className="app-title">midi-from-text</h1>
          </div>
          <p className="app-subtitle">Type music. Import scores. Download MIDI.</p>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="app-main">
        <div className="panel">

          {/* Mode toggle */}
          <div className="panel-section">
            <span className="section-label">Input Mode</span>
            <ModeToggle mode={appMode} onChange={handleAppModeChange} />
          </div>

          {/* ── Text mode UI (prompt / notes) ── */}
          {(appMode === 'prompt' || appMode === 'notes') && (
            <>
              {/* Preset examples */}
              <div className="panel-section">
                <span className="section-label">Examples — click to load</span>
                <div className="preset-row">
                  {presets.map((p) => (
                    <button
                      key={p.label}
                      className="preset-btn"
                      onClick={() => handlePreset(p.text)}
                      title={p.text}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Text input */}
              <div className="panel-section">
                <span className="section-label">
                  {config.mode === 'prompt' ? 'Music Prompt' : 'Note Sequence'}
                </span>
                <textarea
                  className="music-input"
                  rows={config.mode === 'notes' ? 5 : 4}
                  placeholder={config.mode === 'prompt' ? PROMPT_PLACEHOLDER : NOTES_PLACEHOLDER}
                  value={config.mode === 'prompt' ? config.promptText : config.notesText}
                  onChange={(e) =>
                    updateConfig(
                      config.mode === 'prompt'
                        ? { promptText: e.target.value }
                        : { notesText: e.target.value }
                    )
                  }
                  spellCheck={config.mode === 'prompt'}
                />
              </div>

              {config.mode === 'prompt' && (
                <div className="panel-section">
                  <LocalPlannerPanel
                    enabled={useLocalPlanner}
                    onEnabledChange={setUseLocalPlanner}
                    status={plannerStatus}
                    message={plannerMessage}
                    warning={plannerWarning}
                    source={plannerSource}
                    model={plannerModel}
                    llmPlan={llmPlan}
                    generatorPlan={committedPlanOverride?.plan ?? null}
                    mappingAuditSummary={committedPlanOverride?.mappingAuditSummary ?? null}
                    melodyIntentSummary={committedPlanOverride?.melodyIntentSummary ?? null}
                    seed={plannerSeed}
                    temperature={plannerTemperature}
                    variation={plannerVariation}
                    onSeedChange={(seed) => setPlannerControls({ seed })}
                    onTemperatureChange={(temperature) => setPlannerControls({ temperature })}
                    onVariationChange={(variation) => setPlannerControls({ variation })}
                    onRegenerate={handleGenerate}
                    isGenerating={isGenerating}
                    promptEmpty={textInputIsEmpty}
                  />
                </div>
              )}

              {/* Settings */}
              <div className="panel-section">
                <span className="section-label">Settings</span>
                <SettingsPanel config={config} onChange={updateConfig} />
              </div>

              {/* Action buttons */}
              <div className="panel-section action-row">
                <button
                  className="btn btn-primary"
                  onClick={handleGenerate}
                  disabled={isGenerating || textInputIsEmpty}
                  title={textInputIsEmpty ? 'Enter a prompt or notes first' : undefined}
                >
                  {isGenerating ? (
                    <><span className="spinner" />Generating…</>
                  ) : (
                    'Generate'
                  )}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={handlePreviewToggle}
                  disabled={!canPreviewMidi && !musicPreview.isPlaying}
                  aria-describedby={textIsReady && !exportInSync ? 'export-stale-notice' : undefined}
                  title={
                    musicPreview.isPlaying
                      ? 'Stop preview playback'
                      : !textIsReady
                        ? 'Generate music first'
                        : !exportInSync
                          ? 'Preview changed — click Generate to refresh before playback'
                          : !musicInput.canExport
                            ? 'Fix parse errors before preview'
                            : 'Play generated music in browser'
                  }
                >
                  {musicPreview.isPlaying ? '■ Stop Preview' : '▶ Play Preview'}
                </button>
                <label
                  className="preview-loop-toggle"
                  title={
                    canPreviewMidi || musicPreview.isPlaying
                      ? 'Restart preview automatically when the sequence ends'
                      : 'Generate music first'
                  }
                >
                  <input
                    type="checkbox"
                    checked={musicPreview.loopPreview}
                    onChange={(e) => musicPreview.setLoopPreview(e.target.checked)}
                    disabled={!canPreviewMidi && !musicPreview.isPlaying}
                  />
                  <span>Loop Preview</span>
                </label>
                <PreviewPlaybackControls
                  waveform={musicPreview.previewWaveform}
                  volume={musicPreview.previewVolume}
                  onWaveformChange={musicPreview.setPreviewWaveform}
                  onVolumeChange={musicPreview.setPreviewVolume}
                  disabled={!canPreviewMidi && !musicPreview.isPlaying}
                />
                {config.mode === 'prompt' && (
                  <HarmonyControls
                    config={config}
                    chordsEnabled={harmonyPlayback.chordsEnabled}
                    harmonyVolume={harmonyPlayback.harmonyVolume}
                    onConfigChange={updateConfig}
                    onChordsEnabledChange={harmonyPlayback.setChordsEnabled}
                    onHarmonyVolumeChange={harmonyPlayback.setHarmonyVolume}
                    disabled={!canPreviewMidi && !musicPreview.isPlaying}
                  />
                )}
                {musicPreview.isPlaying && (
                  <span className="preview-playback-status" role="status">
                    {musicPreview.loopPreview ? 'looping' : 'previewing'}
                  </span>
                )}
                <button
                  className="btn btn-secondary"
                  onClick={handleTextDownload}
                  disabled={!canExportMidi}
                  aria-describedby={textIsReady && !exportInSync ? 'export-stale-notice' : undefined}
                  title={
                    !textIsReady
                      ? 'Generate music first'
                      : !exportInSync
                        ? 'Preview changed — click Generate to refresh before export'
                        : !musicInput.canExport
                          ? 'Fix parse errors before exporting'
                          : `Download ${defaultMidiFilename(musicData!)}`
                  }
                >
                  ↓ Download MIDI
                </button>
                {textIsReady && !exportInSync && (
                  <span id="export-stale-notice" className="export-stale-inline" role="status">
                    Preview changed — click Generate to refresh export
                  </span>
                )}
                {textIsReady && scoreSummary && (
                  <span className="action-hint">
                    {scoreSummary.noteCount} notes
                    {scoreSummary.restCount > 0 ? ` · ${scoreSummary.restCount} rests` : ''}
                    {' · '}{scoreSummary.barCount} bars
                    {exportInSync && (
                      <span className="export-ready-badge"> · export-ready</span>
                    )}
                  </span>
                )}
              </div>

              {/* Status / errors */}
              <div className="panel-section">
                <StatusBar
                  status={status}
                  error={error}
                  warnings={warnings}
                  hint={hint || (musicInput.musicPlan ? `Plan: ${musicInput.issues[0]?.message.replace('Prompt interpreted as: ', '') ?? ''}` : '')}
                />
                {exportError && (
                  <div className="export-error">
                    <strong>Export failed:</strong> {exportError}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ── MusicXML mode UI ── */}
          {appMode === 'musicxml' && (
            <>
              {/* File uploader */}
              <div className="panel-section">
                <span className="section-label">Upload Score</span>
                <MusicXmlUploader
                  onFile={xml.loadFile}
                  isLoading={xml.status === 'loading'}
                  fileName={xml.fileName}
                />
              </div>

              {/* Parse error */}
              {xml.status === 'error' && xml.error && (
                <div className="panel-section">
                  <div className="musicxml-parse-error">
                    <strong>Import failed</strong>
                    <p>{xml.error}</p>
                  </div>
                </div>
              )}

              {/* Parsed summary */}
              {xmlScore && xml.parseResult && (
                <div className="panel-section">
                  <span className="section-label">Parsed Score</span>
                  <ScoreSummary
                    score={xmlScore}
                    warnings={xml.parseResult.warnings}
                    fileType={xml.fileType}
                  />
                </div>
              )}

              {/* Action buttons */}
              <div className="panel-section action-row">
                <button
                  className="btn btn-secondary"
                  onClick={handleXmlDownload}
                  disabled={!xmlIsReady}
                  title={
                    xmlIsReady && xmlScore
                      ? `Download ${scoreMidiFilename(xmlScore)}`
                      : 'Load a valid MusicXML file first'
                  }
                >
                  ↓ Download MIDI
                </button>
                {xmlIsReady && xmlScore && (
                  <span className="action-hint">
                    {xmlScore.noteCount} notes · {xmlScore.totalMeasures} measures · {xmlScore.parts.length} {xmlScore.parts.length === 1 ? 'track' : 'tracks'}
                  </span>
                )}
              </div>

              {exportError && (
                <div className="panel-section">
                  <div className="export-error">
                    <strong>Export failed:</strong> {exportError}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Audio → MIDI mode UI ── */}
          {appMode === 'audio' && (
            <>
              {/* File uploader */}
              <div className="panel-section">
                <span className="section-label">Upload Audio</span>
                <AudioUploader
                  onFile={(f) => { void audio.loadFile(f); void playback.loadFile(f); }}
                  isLoading={audio.status === 'loading' || playback.status === 'loading'}
                  fileName={audio.fileName}
                  durationSeconds={audio.durationSeconds}
                />
              </div>

              {/* Source mode + settings */}
              <div className="panel-section">
                <SourceModeSelector
                  sourceMode={audio.sourceMode}
                  pitchRange={audio.pitchRange}
                  bpm={audio.bpm}
                  beatsPerBar={audio.beatsPerBar}
                  onSourceMode={audio.setSourceMode}
                  onPitchRange={audio.setPitchRange}
                  onBpm={audio.setBpm}
                  onBeatsPerBar={audio.setBeatsPerBar}
                />
              </div>

              {/* Analyse button + progress */}
              <div className="panel-section action-row">
                <button
                  className="btn btn-primary"
                  onClick={audio.analyse}
                  disabled={audio.isBusy || !audio.fileName}
                  title={!audio.fileName ? 'Upload an audio file first' : undefined}
                >
                  {audio.isBusy ? (
                    <><span className="spinner" />{audioStatusLabel(audio.status)}</>
                  ) : (
                    'Analyse'
                  )}
                </button>
                {/* Reset clears results so the user can re-configure without re-uploading */}
                {(audio.isReady || (audio.status === 'ready' && audio.analysedSource !== null)) && !audio.isBusy && (
                  <button
                    className="btn-link"
                    onClick={audio.reset}
                    title="Clear results — the audio file stays loaded so you can re-analyse"
                  >
                    ↺ Reset analysis
                  </button>
                )}
                {audio.isBusy && (
                  <div className="audio-progress-bar">
                    <div
                      className="audio-progress-fill"
                      style={{ width: `${audio.progress}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Errors */}
              {audio.status === 'error' && audio.error && (
                <div className="panel-section">
                  <div className="musicxml-parse-error">
                    <strong>Analysis failed</strong>
                    <p>{audio.error}</p>
                  </div>
                </div>
              )}

              {/* Warnings */}
              {audio.warnings.length > 0 && (
                <div className="panel-section">
                  {audio.warnings.map((w, i) => (
                    <div key={i} className="audio-warning">{w}</div>
                  ))}
                </div>
              )}

              {/* Results + export */}
              {audio.isReady && (
                <>
                  {/* Source badge */}
                  <div className="panel-section">
                    <div className="audio-source-badge">
                      <span className="audio-source-badge-label">Analysed source:</span>
                      <span className="audio-source-badge-value">{audio.analysedSource}</span>
                      <span className="audio-source-badge-count">{audio.totalNotes} notes detected</span>
                    </div>
                  </div>

                  {/* Cleanup & quantization */}
                  <div className="panel-section">
                    <span className="section-label">Cleanup &amp; quantization</span>
                    <CleanupControls options={audio.cleanup} onChange={audio.setCleanup} />
                  </div>

                  {/* BPM-changed-after-analysis warning */}
                  {audio.bpmMismatch && (
                    <div className="panel-section">
                      <div className="bpm-mismatch-warning">
                        <span className="bpm-mismatch-icon">⚠</span>
                        <span>
                          BPM changed from <strong>{audio.analysedBpm}</strong> to{' '}
                          <strong>{audio.bpm}</strong> after analysis. Cleanup thresholds
                          now use {audio.bpm} BPM, but detected note positions were stamped
                          at {audio.analysedBpm} BPM — timing in the exported MIDI will be
                          off. Re-analyse at the new BPM for accurate results.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Export buttons */}
                  <div className="panel-section">
                    <span className="section-label">Export</span>
                    <p className="audio-export-note">
                      Export uses cleaned/quantized notes
                      {' · '}
                      {audio.totalNotes} detected → {audio.cleanedTotal} exported
                    </p>
                    <div className="audio-export-row">
                      {/* Main export — disabled when cleanup removed all notes */}
                      <button
                        className="btn btn-secondary"
                        onClick={handleAudioDownloadMain}
                        disabled={audio.cleanedTotal === 0}
                        title={
                          audio.cleanedTotal === 0
                            ? 'No notes to export — adjust cleanup settings'
                            : audio.sourceMode === 'split-both'
                              ? 'Download 2-track (Format 1) MIDI'
                              : 'Download single-track MIDI'
                        }
                      >
                        ↓ {audio.sourceMode === 'split-both' ? '2-track MIDI' : 'Download MIDI'}
                      </button>

                      {/* Single-range exports — visible after split-both, disabled when empty after cleanup */}
                      {audio.sourceMode === 'split-both' && audio.notes.bassNotes !== null && (
                        <button
                          className="btn btn-secondary"
                          onClick={handleAudioDownloadBass}
                          disabled={!audio.cleanedNotes.bassNotes?.length}
                          title={
                            !audio.cleanedNotes.bassNotes?.length
                              ? 'No bass-range notes after cleanup'
                              : 'Download bass-range MIDI'
                          }
                        >
                          ↓ Bass range
                        </button>
                      )}
                      {audio.sourceMode === 'split-both' && audio.notes.otherNotes !== null && (
                        <button
                          className="btn btn-secondary"
                          onClick={handleAudioDownloadOther}
                          disabled={!audio.cleanedNotes.otherNotes?.length}
                          title={
                            !audio.cleanedNotes.otherNotes?.length
                              ? 'No upper-range notes after cleanup'
                              : 'Download upper-range MIDI'
                          }
                        >
                          ↓ Upper range
                        </button>
                      )}
                    </div>

                    {audio.sourceMode === 'split-both' && (
                      <p className="audio-export-hint">
                        Multi-track export: 2 tracks in a single Format&nbsp;1 MIDI file,
                        plus optional single-range downloads above.
                      </p>
                    )}
                  </div>
                </>
              )}

              {exportError && (
                <div className="panel-section">
                  <div className="export-error">
                    <strong>Export failed:</strong> {exportError}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Right panel ── */}
        <div className="preview-panel">
          {/* Text mode preview */}
          {isTextMode && (
            <MusicInputPreview
              rawText={currentText}
              input={musicInput}
              settings={{
                bars: config.bars,
                beatsPerBar: config.beatsPerBar,
                beatValue: config.beatValue,
              }}
              onRepair={handleRepair}
              textIsReady={textIsReady}
              exportInSync={exportInSync}
              scoreSummary={scoreSummary}
            />
          )}

          {/* MusicXML mode preview */}
          {appMode === 'musicxml' && (
            xml.xmlContent ? (
              <ScoreViewer xmlContent={xml.xmlContent} />
            ) : (
              <div className="preview-empty">
                <span className="preview-empty-icon">𝄞</span>
                <p className="preview-empty-title">No score loaded</p>
                <p className="preview-empty-sub">
                  {xml.status === 'error'
                    ? 'Fix the error on the left and try again.'
                    : 'Upload a .musicxml or .xml file to preview the sheet music here.'}
                </p>
              </div>
            )
          )}

          {/* Audio mode preview */}
          {appMode === 'audio' && (
            audio.isReady ? (
              <AudioAnalysisPanel
                notes={audio.notes}
                cleanedNotes={audio.cleanedNotes}
                sourceMode={audio.sourceMode}
                bpm={audio.bpm}
                beatsPerBar={audio.beatsPerBar}
                analysedSource={audio.analysedSource}
                totalNotes={audio.totalNotes}
                exportedTotal={audio.cleanedTotal}
                playback={playback.hasAudio ? {
                  isPlaying:  playback.isPlaying,
                  hasAudio:   playback.hasAudio,
                  currentTime: playback.currentTime,
                  duration:   playback.duration,
                  onPlay:     playback.play,
                  onPause:    playback.pause,
                  onSeekBeat: (beat) => playback.seek((beat / audio.bpm) * 60),
                } : null}
              />
            ) : (
              <div className="preview-empty">
                <span className="preview-empty-icon">♪</span>
                <p className="preview-empty-title">
                  {audio.status === 'ready' && audio.analysedSource !== null
                    ? 'No notes detected'
                    : 'No notes yet'}
                </p>
                <p className="preview-empty-sub">
                  {audio.status === 'error'
                    ? 'Fix the error on the left and try again.'
                    : audio.status === 'ready' && audio.analysedSource !== null
                      ? 'Analysis finished but found no detectable pitches. Try a different source mode, pitch-range filter, or BPM, then re-analyse.'
                      : audio.fileName
                        ? 'Choose a source mode and hit Analyse.'
                        : 'Upload an audio file, choose a source mode, then hit Analyse.'}
                </p>
              </div>
            )
          )}
        </div>
      </main>

      <footer className="app-footer">
        <span>midi-from-text · v0.3 · client-side only</span>
      </footer>
    </div>
  );
}

function audioStatusLabel(status: import('./types/audio').AudioStatus): string {
  switch (status) {
    case 'loading':    return 'Loading…';
    case 'separating': return 'Splitting by register…';
    case 'detecting':  return 'Detecting pitches…';
    default:           return 'Working…';
  }
}
