import { describe, expect, it } from 'vitest';
import { documentCaptionsOn, documentCaptionStyle } from './caption-state';
import { emptyEditorDocumentV2 } from './create';
import { projectNarrativeShots, projectOverlayBlockById } from './legacy-projection';
import { freeOverlayStackOrder } from './read-model';
import type { EditorDocumentV2, EditorTrack, GraphicTimelineClip } from './types';

function graphic(id: string, startFrame: number, durationFrames: number): GraphicTimelineClip {
  return {
    id,
    kind: 'graphic',
    startFrame,
    durationFrames,
    enabled: true,
    anchor: { kind: 'timeline' },
    block: { templateId: 'custom', slots: { innerHtml: `<div>${id}</div>`, timelineBody: '' }, box: { x: 0.1, y: 0.1, w: 0.5, h: 0.2 } },
  } as unknown as GraphicTimelineClip;
}

function lane(id: string, stackOrder: number, clips: GraphicTimelineClip[]): EditorTrack {
  return { id, type: 'graphics', name: id, stackOrder, clips, locked: false, hidden: false, muted: false } as unknown as EditorTrack;
}

function project(tracks: EditorTrack[]): EditorDocumentV2 {
  const document = emptyEditorDocumentV2({ width: 1080, height: 1920, fps: 30 });
  document.timeline.tracks.push(...tracks);
  return document;
}

describe('overlay reads on the document', () => {
  it('picks the first free stack order at or above the preferred one, counting only overlay clips in the window', () => {
    const document = project([
      lane('g2', 2, [graphic('a', 0, 60)]),
      lane('g3', 3, [graphic('b', 100, 60)]),
    ]);
    expect(freeOverlayStackOrder(document, 0, 30, 2)).toBe(3);
    expect(freeOverlayStackOrder(document, 60, 30, 2)).toBe(2);
    expect(freeOverlayStackOrder(document, 0, 200, 2)).toBe(4);
    expect(freeOverlayStackOrder(document, 0, 30, 5)).toBe(5);
  });

  it('projects one overlay clip as a block carrying its lane order and refuses non-overlay ids', () => {
    const document = project([lane('g4', 4, [graphic('a', 30, 90)])]);
    expect(projectOverlayBlockById(document, 'a')).toMatchObject({ id: 'a', startSec: 1, durationSec: 3, trackIndex: 4, templateId: 'custom' });
    expect(projectOverlayBlockById(document, 'missing')).toBeUndefined();
    expect(projectNarrativeShots(document)).toEqual([]);
  });

  it('reads the caption layer state from the appearance flag, falling back to persisted caption clips', () => {
    const off = project([]);
    expect(documentCaptionsOn(off)).toBe(false);
    off.appearance.captionStyle = { on: true, preset: 'ln-clean', yPct: 80 };
    expect(documentCaptionsOn(off)).toBe(true);
    expect(documentCaptionStyle(off)).toMatchObject({ preset: 'ln-clean', yPct: 80, scale: 1 });
  });
});
