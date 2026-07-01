/**
 * useMusicXml.ts
 *
 * React hook that manages the MusicXML import flow:
 *   File selected → XML read (or .mxl decompressed) → parsed → MusicData derived.
 *
 * State is completely separate from useMusicGenerator so the two flows
 * don't interfere with each other.
 *
 * .mxl support:
 *   Compressed .mxl files are decompressed with jszip (dynamic import so the
 *   ~100 KB library is only fetched when a .mxl file is actually selected).
 *   The .mxl container spec (META-INF/container.xml → rootfile) is followed.
 */

import { useState, useCallback } from 'react';
import type { MusicXMLParseResult } from '../types/musicxml';
import type { MusicData } from '../types/music';
import { parseMusicXml } from '../utils/musicXmlParser';
import { scoreToMusicData } from '../utils/scoreToMusicData';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MusicXmlStatus = 'idle' | 'loading' | 'ready' | 'error';
export type MusicXmlFileType = 'xml' | 'musicxml' | 'mxl';

export interface MusicXmlState {
  status: MusicXmlStatus;
  /** Original file name */
  fileName: string | null;
  /** File extension type, used for display */
  fileType: MusicXmlFileType | null;
  /** Raw XML string passed to OSMD for sheet music rendering */
  xmlContent: string | null;
  /** Full parse result (warnings include both parser and conversion warnings) */
  parseResult: MusicXMLParseResult | null;
  /** Converted MusicData ready for midiExporter */
  musicData: MusicData | null;
  /** Human-readable error (status === 'error') */
  error: string | null;
}

// ─── .mxl decompression ───────────────────────────────────────────────────────

/**
 * Decompress a .mxl file (ZIP-compressed MusicXML) and return the raw XML.
 * Follows the MXL container spec: reads META-INF/container.xml to locate
 * the rootfile, then extracts that file's content.
 */
async function readMxlFile(file: File): Promise<string> {
  // Dynamic import keeps jszip out of the initial bundle
  const { default: JSZip } = await import('jszip');

  let zip: InstanceType<typeof JSZip>;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to open .mxl archive: ${msg}`);
  }

  const containerFile = zip.file('META-INF/container.xml');
  if (!containerFile) {
    throw new Error('Invalid .mxl file: missing META-INF/container.xml');
  }

  let containerXml: string;
  try {
    containerXml = await containerFile.async('text');
  } catch {
    throw new Error('Invalid .mxl file: could not read META-INF/container.xml');
  }

  const containerDoc = new DOMParser().parseFromString(containerXml, 'application/xml');
  if (containerDoc.querySelector('parsererror')) {
    throw new Error('Invalid .mxl file: corrupt META-INF/container.xml');
  }

  // The rootfile element specifies the path to the MusicXML content
  const rootfileEl =
    containerDoc.querySelector('rootfile') ??
    containerDoc.querySelector('rootFile'); // some encoders use camelCase

  const rootfilePath = rootfileEl?.getAttribute('full-path');
  if (!rootfilePath) {
    throw new Error('Invalid .mxl file: no full-path found in container.xml rootfile element');
  }

  const musicXmlFile = zip.file(rootfilePath);
  if (!musicXmlFile) {
    // Some .mxl files use a path without a leading slash that differs in casing
    const match = Object.keys(zip.files).find(
      (k) => k.toLowerCase() === rootfilePath.toLowerCase(),
    );
    if (!match) {
      throw new Error(`Invalid .mxl file: rootfile "${rootfilePath}" not found in archive`);
    }
    return await zip.files[match].async('text');
  }

  return await musicXmlFile.async('text');
}

// ─── File type helper ─────────────────────────────────────────────────────────

function detectFileType(name: string): MusicXmlFileType | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.mxl')) return 'mxl';
  if (lower.endsWith('.musicxml')) return 'musicxml';
  if (lower.endsWith('.xml')) return 'xml';
  return null;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMusicXml() {
  const [state, setState] = useState<MusicXmlState>({
    status: 'idle',
    fileName: null,
    fileType: null,
    xmlContent: null,
    parseResult: null,
    musicData: null,
    error: null,
  });

  /**
   * Load and parse a MusicXML file (.musicxml, .xml, or .mxl).
   * Updates state through idle → loading → ready | error.
   */
  const loadFile = useCallback(async (file: File): Promise<void> => {
    const fileType = detectFileType(file.name);

    setState((prev) => ({
      ...prev,
      status: 'loading',
      fileName: file.name,
      fileType,
      xmlContent: null,
      parseResult: null,
      musicData: null,
      error: null,
    }));

    try {
      let xmlContent: string;

      if (fileType === 'mxl') {
        xmlContent = await readMxlFile(file);
      } else {
        xmlContent = await file.text();
      }

      const parseResult = parseMusicXml(xmlContent);

      if (!parseResult.ok || !parseResult.score) {
        setState((prev) => ({
          ...prev,
          status: 'error',
          xmlContent: null,
          parseResult,
          musicData: null,
          error: parseResult.error ?? 'Failed to parse MusicXML file.',
        }));
        return;
      }

      // Pass parseResult.warnings so conversion warnings are appended to it
      const musicData = scoreToMusicData(parseResult.score, parseResult.warnings);

      setState({
        status: 'ready',
        fileName: file.name,
        fileType,
        xmlContent,
        parseResult,
        musicData,
        error: null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState((prev) => ({
        ...prev,
        status: 'error',
        xmlContent: null,
        parseResult: null,
        musicData: null,
        error: message,
      }));
    }
  }, []);

  /** Clear all MusicXML state. */
  const reset = useCallback(() => {
    setState({
      status: 'idle',
      fileName: null,
      fileType: null,
      xmlContent: null,
      parseResult: null,
      musicData: null,
      error: null,
    });
  }, []);

  return { ...state, loadFile, reset };
}
