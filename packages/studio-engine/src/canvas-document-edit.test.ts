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
    video: { url: 'blob:runtime-main', durationSec: 8, sourceWidth: 1920, sourceHeight: 1080 },
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
    const mainClip = landscape.document.timeline.tracks
      .find((track) => track.id === landscape.document.semantics.primaryNarrativeTrackId)?.clips[0];
    expect(mainClip).toMatchObject({ id: 'main' });
    expect(mainClip).not.toHaveProperty('box');
    expect(landscapeCaptions.length).toBeLessThan(portraitCaptions.length);
    expect(landscape.document.timeline.tracks.find((track) => track.id === 'empty-graphics')).toMatchObject({
      hidden: true,
      syncLocked: false,
      stackOrder: 9,
      clips: [],
    });
    expect(initial.canvas).toMatchObject({ width: 1080, height: 1920, configured: true });
  });

  it('changes the canvas while preserving media aspect, relative centre, and unknown geometry', () => {
    const document = captionDocument();
    document.canvas = { ...document.canvas, width: 1920, height: 1080, configured: true };
    document.assets.insert = {
      id: 'insert', kind: 'video', locator: { remoteUrl: 'https://cdn.test/insert.mp4' },
      metadata: { durationSec: 3, width: 1920, height: 1080 },
    };
    document.assets.poster = {
      id: 'poster', kind: 'image', locator: { remoteUrl: 'https://cdn.test/poster.jpg' }, metadata: {},
    };
    document.timeline.tracks.push({
      id: 'visual-2', type: 'visual', role: 'broll', muted: false, hidden: false, locked: false,
      syncLocked: false, stackOrder: 2,
      clips: [
        {
          id: 'insert-clip', kind: 'media', assetId: 'insert', startFrame: 0, durationFrames: 90,
          enabled: true, sourceInSec: 0, sourceOutSec: 3,
          box: { x: 0.1, y: 0.2, w: 0.6, h: 0.6 },
          keyframes: { box: [{ frame: 30, x: 0.2, y: 0.1, w: 0.4, h: 0.8 }] },
        },
        {
          id: 'poster-clip', kind: 'media', assetId: 'poster', startFrame: 90, durationFrames: 30,
          enabled: true, sourceInSec: 0, sourceOutSec: 1, box: { x: 0.2, y: 0.2, w: 0.5, h: 0.5 },
        },
      ],
    });

    const result = applyCanvasDocumentEdit({
      projectId: 'canvas-test', document, width: 1080, height: 1920,
      mainTranscript: transcript, clipTranscripts: {},
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const narrative = result.document.timeline.tracks
      .find((track) => track.id === result.document.semantics.primaryNarrativeTrackId)!.clips[0];
    expect(narrative).toMatchObject({ id: 'main' });
    expect(narrative).not.toHaveProperty('box');
    const clips = result.document.timeline.tracks.find((track) => track.id === 'visual-2')!.clips;
    expect(clips[0]).toMatchObject({
      id: 'insert-clip',
      box: { x: 0.1, y: 0.4051, w: 0.6, h: 0.1898 },
      keyframes: { box: [{ frame: 30, x: 0.2, y: 0.3734, w: 0.4, h: 0.2531 }] },
    });
    expect(clips[1]).toMatchObject({
      id: 'poster-clip', box: { x: 0.2, y: 0.2, w: 0.5, h: 0.5 },
    });
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
