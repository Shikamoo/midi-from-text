/**
 * ScoreViewer.tsx
 *
 * Renders a MusicXML string as interactive sheet music using
 * Open Sheet Music Display (OSMD).
 *
 * Design notes:
 *   - The OSMD instance is created inside a useEffect and destroyed on
 *     unmount / xmlContent change by clearing the container's innerHTML.
 *   - autoResize is enabled so the score reflows when the panel resizes.
 *   - Errors thrown during load/render are caught and shown inline.
 *   - The container gets a white background because OSMD renders with
 *     dark ink on a transparent background (matching sheet music convention).
 */

import { useEffect, useRef, useState } from 'react';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';

interface Props {
  /** Raw MusicXML string to render. Change triggers a full re-render. */
  xmlContent: string;
}

export function ScoreViewer({ xmlContent }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !xmlContent) return;

    let cancelled = false;
    setRenderError(null);
    setIsRendering(true);

    // Clear previous render
    container.innerHTML = '';

    const osmd = new OpenSheetMusicDisplay(container, {
      autoResize: true,
      backend: 'svg',
      drawTitle: true,
      drawComposer: true,
      drawCredits: false,
      drawPartNames: true,
      drawMeasureNumbers: true,
      followCursor: false,
    });

    osmd
      .load(xmlContent)
      .then(() => {
        if (cancelled) return;
        osmd.render();
        setIsRendering(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setRenderError(`Score rendering failed: ${msg}`);
        setIsRendering(false);
      });

    return () => {
      cancelled = true;
      container.innerHTML = '';
    };
  }, [xmlContent]);

  return (
    <div className="score-viewer-wrapper">
      {isRendering && (
        <div className="score-viewer-spinner">
          <span className="spinner" /> Rendering score…
        </div>
      )}

      {renderError && (
        <div className="score-viewer-error">
          <strong>Rendering error</strong>
          <p>{renderError}</p>
          <p className="score-viewer-error-hint">
            The file was parsed successfully — you can still export MIDI.
          </p>
        </div>
      )}

      {/* OSMD injects SVG directly into this div */}
      <div ref={containerRef} className="score-viewer" />
    </div>
  );
}
