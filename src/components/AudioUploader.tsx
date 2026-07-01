/**
 * AudioUploader.tsx
 *
 * Drop-zone + file-picker for audio files.
 * Purely presentational: validates extension client-side, then delegates
 * to the caller via onFile.
 */

import { useRef, useState } from 'react';
import { validateAudioFile, MAX_AUDIO_SECONDS } from '../utils/audioLoader';

const ACCEPTED_EXTENSIONS = ['.wav', '.mp3', '.ogg', '.flac', '.m4a', '.aac', '.webm'];
const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.join(',');

interface Props {
  onFile: (file: File) => void;
  isLoading: boolean;
  fileName: string | null;
  durationSeconds: number;
}

export function AudioUploader({ onFile, isLoading, fileName, durationSeconds }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [extError, setExtError] = useState<string | null>(null);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    const err = validateAudioFile(file);
    if (err) { setExtError(err); return; }
    setExtError(null);
    onFile(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    if (!isLoading) handleFiles(e.dataTransfer.files);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!isLoading) setIsDragOver(true);
  }

  function handleClick() {
    if (!isLoading) inputRef.current?.click();
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    handleFiles(e.target.files);
    e.target.value = '';
  }

  const zoneClass = [
    'audio-drop-zone',
    isDragOver ? 'drag-over' : '',
    isLoading ? 'loading' : '',
  ].filter(Boolean).join(' ');

  const isTrimmed = durationSeconds > MAX_AUDIO_SECONDS;

  return (
    <div className="audio-uploader">
      <div
        className={zoneClass}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragOver(false)}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-label="Upload audio file"
        onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          style={{ display: 'none' }}
          onChange={handleInputChange}
        />

        {isLoading ? (
          <div className="audio-drop-content">
            <span className="spinner" />
            <span className="audio-drop-label">Loading audio…</span>
          </div>
        ) : (
          <div className="audio-drop-content">
            <span className="audio-drop-icon" aria-hidden>♪</span>
            <span className="audio-drop-label">
              {fileName
                ? 'Drop a new file or click to browse'
                : 'Drop an audio file here, or click to browse'}
            </span>
            <span className="audio-drop-hint">
              WAV · MP3 · OGG · FLAC · M4A · AAC
            </span>
          </div>
        )}
      </div>

      {fileName && !isLoading && (
        <p className="audio-filename">
          <span className="audio-filename-icon">🎵</span>
          {fileName}
          {durationSeconds > 0 && (
            <span className="audio-duration">
              &nbsp;({formatDuration(Math.min(durationSeconds, MAX_AUDIO_SECONDS))})
            </span>
          )}
        </p>
      )}

      {isTrimmed && !isLoading && (
        <p className="audio-trim-warning">
          File exceeds {MAX_AUDIO_SECONDS} s — only the first {MAX_AUDIO_SECONDS} s will be analysed.
        </p>
      )}

      {extError && (
        <p className="audio-ext-error">{extError}</p>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
