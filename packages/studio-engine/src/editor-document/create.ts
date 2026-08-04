import type { ThemeId } from '../theme';
import { DEFAULT_TIMELINE_FPS, isFinitePositive } from './time';
import { EDITOR_DOCUMENT_VERSION, type EditorDocumentV2, type EditorTrack, type EditorTrackRole } from './types';

export interface EmptyEditorDocumentOptions {
  width?: number;
  height?: number;
  fps?: number;
  theme?: ThemeId;
}

/** Native V2 project creation. A semantic primary track exists, but media and clips do not. */
export function emptyEditorDocumentV2(options: EmptyEditorDocumentOptions = {}): EditorDocumentV2 {
  const fps = isFinitePositive(options.fps) ? Math.min(240, Math.max(1, Math.round(options.fps))) : DEFAULT_TIMELINE_FPS;
  const primaryNarrativeTrackId = 'track_primary_narrative';
  return {
    version: EDITOR_DOCUMENT_VERSION,
    canvas: {
      width: isFinitePositive(options.width) ? Math.round(options.width) : 1080,
      height: isFinitePositive(options.height) ? Math.round(options.height) : 1920,
      fps,
      configured: false,
    },
    appearance: { theme: options.theme ?? 'general' },
    assets: {},
    timeline: {
      tracks: [{
        id: primaryNarrativeTrackId,
        type: 'visual',
        role: 'primaryNarrative',
        name: 'Primary narrative',
        muted: false,
        hidden: false,
        locked: false,
        syncLocked: true,
        stackOrder: 0,
        clips: [],
      }],
    },
    semantics: {
      primaryNarrativeTrackId,
      transcripts: {},
      scenes: [],
    },
  };
}

export function editorTrackByRole(document: EditorDocumentV2, role: EditorTrackRole): EditorTrack | undefined {
  return document.timeline.tracks.find((track) => track.role === role);
}

export function primaryNarrativeTrack(document: EditorDocumentV2): EditorTrack | undefined {
  return document.timeline.tracks.find((track) => track.id === document.semantics.primaryNarrativeTrackId);
}
