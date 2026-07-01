/**
 * MusicXmlUploader.tsx
 *
 * Drop zone + file picker for MusicXML files.
 * Pure presentational component: delegates all file processing to the caller.
 * Validates extension client-side before calling onFile.
 */

import { useRef, useState } from 'react';

const ACCEPTED_EXTENSIONS = ['.musicxml', '.xml', '.mxl'];
const ACCEPT_ATTR = ACCEPTED_EXTENSIONS.join(',');

interface Props {
  /** Called with the selected File when the extension is valid. */
  onFile: (file: File) => void;
  /** Show a spinner and disable interaction while a file is being parsed. */
  isLoading: boolean;
  /** Currently loaded file name, shown below the drop zone. */
  fileName: string | null;
}

export function MusicXmlUploader({ onFile, isLoading, fileName }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [extError, setExtError] = useState<string | null>(null);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    const nameLower = file.name.toLowerCase();
    const valid = ACCEPTED_EXTENSIONS.some((ext) => nameLower.endsWith(ext));
    if (!valid) {
      setExtError(
        `"${file.name}" is not a supported file type. Please choose a .musicxml, .xml, or .mxl file.`,
      );
      return;
    }
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
    // Reset input so the same file can be re-selected
    e.target.value = '';
  }

  const zoneClass = [
    'musicxml-drop-zone',
    isDragOver ? 'drag-over' : '',
    isLoading ? 'loading' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="musicxml-uploader">
      <div
        className={zoneClass}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragOver(false)}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-label="Upload MusicXML file"
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
          <div className="musicxml-drop-content">
            <span className="spinner" />
            <span className="musicxml-drop-label">Parsing…</span>
          </div>
        ) : (
          <div className="musicxml-drop-content">
            <span className="musicxml-drop-icon" aria-hidden>𝄞</span>
            <span className="musicxml-drop-label">
              {fileName ? 'Drop a new file or click to browse' : 'Drop a MusicXML file here, or click to browse'}
            </span>
            <span className="musicxml-drop-hint">.musicxml · .xml · .mxl</span>
          </div>
        )}
      </div>

      {fileName && !isLoading && (
        <p className="musicxml-filename">
          <span className="musicxml-filename-icon">📄</span>
          {fileName}
        </p>
      )}

      {extError && (
        <p className="musicxml-ext-error">{extError}</p>
      )}
    </div>
  );
}
