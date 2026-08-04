import { describe, expect, it } from 'vitest';
import { applyEditorCommand, emptyEditorDocumentV2 } from './editor-document';

describe('native V2 command surface', () => {
  it('patches and clears appearance/processing without touching tracks', () => {
    const initial = emptyEditorDocumentV2();
    const appearance = applyEditorCommand(initial, {
      type: 'appearance.patch',
      patch: { palette: { accent: '#f00' }, frameId: 'editorial' },
    });
    expect(appearance.ok).toBe(true);
    if (!appearance.ok) return;
    const processing = applyEditorCommand(appearance.document, {
      type: 'processing.patch',
      patch: { audioDenoise: { strength: 0.7 } },
    });
    expect(processing.ok).toBe(true);
    if (!processing.ok) return;
    const cleared = applyEditorCommand(processing.document, {
      type: 'processing.patch',
      patch: { audioDenoise: undefined },
    });
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;
    expect(cleared.document.processing).toBeUndefined();
    expect(cleared.document.appearance).toMatchObject({ palette: { accent: '#f00' }, frameId: 'editorial' });
    expect(cleared.document.timeline.tracks).toBe(initial.timeline.tracks);
  });

  it('inserts durable narrative and graphic identities through the dispatcher', () => {
    const initial = emptyEditorDocumentV2();
    const narrative = applyEditorCommand(initial, {
      type: 'narrative.insert',
      atFrame: 30,
      asset: {
        id: 'video-asset', kind: 'video', locator: { localSig: 'video.mp4:9:1' },
        metadata: { durationSec: 2, hasAudio: true },
      },
      clip: {
        id: 'narrative-1', kind: 'narrative', assetId: 'video-asset', durationFrames: 60,
        enabled: true, sourceInSec: 0, sourceOutSec: 2, properties: { treatment: 'full' },
      },
    });
    expect(narrative.ok).toBe(true);
    if (!narrative.ok) return;
    const lane = applyEditorCommand(narrative.document, {
      type: 'track.insert',
      track: { id: 'graphics-1', type: 'graphics', role: 'graphics', stackOrder: 2 },
    });
    expect(lane.ok).toBe(true);
    if (!lane.ok) return;
    const overlay = applyEditorCommand(lane.document, {
      type: 'overlay.insert',
      trackId: 'graphics-1',
      clip: {
        id: 'title-1', kind: 'graphic', startFrame: 30, durationFrames: 45, enabled: true,
        block: { templateId: 'custom', slots: { innerHtml: '<div>Title</div>', timelineBody: '' } },
        anchor: { type: 'timeline' },
      },
    });
    expect(overlay.ok).toBe(true);
    if (!overlay.ok) return;
    expect(overlay.document.timeline.tracks.find((track) => track.id === initial.semantics.primaryNarrativeTrackId)?.clips[0]).toMatchObject({ id: 'narrative-1', startFrame: 30 });
    expect(overlay.document.timeline.tracks.find((track) => track.id === 'graphics-1')?.clips[0]).toMatchObject({ id: 'title-1', startFrame: 30 });
  });

  it('rejects invalid processing atomically', () => {
    const initial = emptyEditorDocumentV2();
    const result = applyEditorCommand(initial, { type: 'processing.patch', patch: { audioDenoise: { strength: 2 } } });
    expect(result).toMatchObject({ ok: false, document: initial, error: { code: 'invalid-command' } });
  });
});
