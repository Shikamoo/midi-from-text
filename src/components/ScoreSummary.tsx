/**
 * ScoreSummary.tsx
 *
 * Displays a compact summary of a parsed MusicXMLScore:
 *   title, composer, file type, part count, measure count, note count,
 *   tempo, key, time signature, and any parser/conversion warnings.
 *
 * Purely presentational — receives data as props, emits nothing.
 */

import type { MusicXMLScore } from '../types/musicxml';
import type { MusicXmlFileType } from '../hooks/useMusicXml';

interface Props {
  score: MusicXMLScore;
  warnings: string[];
  fileType: MusicXmlFileType | null;
}

const FILE_TYPE_LABEL: Record<MusicXmlFileType, string> = {
  musicxml: '.musicxml',
  xml: '.xml',
  mxl: '.mxl (compressed)',
};

export function ScoreSummary({ score, warnings, fileType }: Props) {
  return (
    <div className="score-summary">
      {/* Title & composer */}
      <div className="score-summary-header">
        <h3 className="score-summary-title">
          {score.title ?? 'Untitled Score'}
        </h3>
        {score.composer && (
          <p className="score-summary-composer">{score.composer}</p>
        )}
      </div>

      {/* Metadata chips */}
      <div className="score-summary-chips">
        {fileType && (
          <span className="chip chip-file">{FILE_TYPE_LABEL[fileType]}</span>
        )}
        <span className="chip chip-accent">
          {score.parts.length} {score.parts.length === 1 ? 'track' : 'tracks'}
        </span>
        <span className="chip">{score.totalMeasures} measures</span>
        <span className="chip">{score.noteCount} notes</span>
        <span className="chip">{score.bpm} BPM</span>
        <span className="chip">{score.key} {score.musicalMode}</span>
        <span className="chip">{score.beatsPerBar}/{score.beatValue}</span>
        {warnings.length > 0 && (
          <span className="chip chip-warning">
            {warnings.length} {warnings.length === 1 ? 'warning' : 'warnings'}
          </span>
        )}
      </div>

      {/* Part list (only for multi-part scores) */}
      {score.parts.length > 1 && (
        <div className="score-summary-parts">
          <span className="section-label">Tracks</span>
          <ul className="score-parts-list">
            {score.parts.map((part) => (
              <li key={part.id} className="score-part-item">
                <span className="score-part-name">{part.name}</span>
                <span className="score-part-meta">
                  {part.measures.reduce(
                    (n, m) => n + m.notes.filter((note) => note.pitch !== 'rest').length,
                    0,
                  )}{' '}
                  notes
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Parser + conversion warnings */}
      {warnings.length > 0 && (
        <div className="score-summary-warnings">
          {warnings.map((w, i) => (
            <div key={i} className="score-warning-item">
              ⚠ {w}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
