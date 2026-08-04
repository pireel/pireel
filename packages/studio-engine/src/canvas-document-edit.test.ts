import { describe, expect, it } from 'vitest';
import type { AsrSegment } from './build-blocks';
import { applyCanvasDocumentEdit } from './canvas-document-edit';
import { emptyComposition } from './composition-core';
import { compositionToEditorDocument } from './project-document';

const words = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen'
  .split(' ')
  .map((text, index) => ({ text, start: index * 0.4, end: index * 0.4 + 0.3 }));
const transcript: AsrSegment[] = [{
  start: 0,
  end: 7.2,
  text: words.map((word) => word.text).join(' '),
  words,
}];

function captionDocument() {
  const composition = {
    ...emptyComposition(),
    video: { url: 'blob:runtime-main', durationSec: 8 },
    shots: [{ id: 'main', srcStart: 0, srcEnd: 8, treatment: 'full' as const }],
    blocks: [{ id: 'old-caption', templateId: 'caption', slots: {}, startSec: 0, durationSec: 7.2, trackIndex: 1 }],
  };
  const document = compositionToEditorDocument({
    projectId: 'canvas-test',
    composition,
    videoSig: 'main-sig',
  }).document;
  document.timeline.tracks.push({
    id: 'empty-graphics',
    type: 'graphics',
    muted: false,
    hidden: true,
    locked: false,
    syncLocked: false,
    stackOrder: 9,
    clips: [],
  });
  return document;
}

describe('atomic V2 canvas edit', () => {
  it('reflows managed captions while preserving unrelated lane identity and flags', () => {
    const initial = captionDocument();
    const portrait = applyCanvasDocumentEdit({
      projectId: 'canvas-test',
      document: initial,
      width: 1080,
      height: 1920,
      mainTranscript: transcript,
      clipTranscripts: {},
    });
    expect(portrait.ok).toBe(true);
    if (!portrait.ok) return;
    const portraitCaptions = portrait.document.timeline.tracks
      .find((track) => track.id === portrait.document.semantics.managedCaptionTrackId)!.clips;

    const landscape = applyCanvasDocumentEdit({
      projectId: 'canvas-test',
      document: portrait.document,
      width: 1920,
      height: 1080,
      mainTranscript: transcript,
      clipTranscripts: {},
    });
    expect(landscape.ok).toBe(true);
    if (!landscape.ok) return;
    const landscapeCaptions = landscape.document.timeline.tracks
      .find((track) => track.id === landscape.document.semantics.managedCaptionTrackId)!.clips;
    expect(landscape.document.canvas).toMatchObject({ width: 1920, height: 1080, configured: true });
    expect(landscapeCaptions.length).toBeLessThan(portraitCaptions.length);
    expect(landscape.document.timeline.tracks.find((track) => track.id === 'empty-graphics')).toMatchObject({
      hidden: true,
      syncLocked: false,
      stackOrder: 9,
      clips: [],
    });
    expect(initial.canvas).toMatchObject({ width: 1080, height: 1920, configured: true });
  });

  it('rolls the dimensions back when caption reflow touches a locked lane', () => {
    const document = captionDocument();
    document.timeline.tracks.find((track) => track.id === document.semantics.managedCaptionTrackId)!.locked = true;
    const result = applyCanvasDocumentEdit({
      projectId: 'canvas-test',
      document,
      width: 1920,
      height: 1080,
      mainTranscript: transcript,
      clipTranscripts: {},
    });
    expect(result).toMatchObject({ ok: false, document, error: { code: 'track-locked' } });
    expect(document.canvas).toMatchObject({ width: 1080, height: 1920 });
  });
});
