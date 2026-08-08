import { describe, expect, it } from 'vitest';
import { emptyEditorDocumentV2 } from './editor-document';
import { applyMediaCropInput, applyMediaTransformInput } from './media-framing-edit';

function documentWithMedia() {
  const document = emptyEditorDocumentV2({ fps: 30 });
  document.assets.main = { id: 'main', kind: 'video', locator: { remoteUrl: 'https://cdn.test/main.mp4' }, metadata: { durationSec: 3 } };
  document.assets.broll = { id: 'broll', kind: 'image', locator: { remoteUrl: 'https://cdn.test/b.jpg' }, metadata: {} };
  document.semantics.primaryNarrativeAssetId = 'main';
  document.timeline.tracks[0]!.clips.push({
    id: 'narrative', kind: 'narrative', assetId: 'main', startFrame: 0, durationFrames: 90,
    enabled: true, sourceInSec: 0, sourceOutSec: 3,
    properties: { treatment: 'split-l', treatSize: 50, treatCrop: 50 },
  });
  document.timeline.tracks.push({
    id: 'visual', type: 'visual', role: 'broll', muted: false, hidden: false, locked: false,
    syncLocked: false, stackOrder: 2,
    clips: [{
      id: 'still', kind: 'media', assetId: 'broll', startFrame: 0, durationFrames: 90,
      enabled: true, sourceInSec: 0, sourceOutSec: 3,
    }],
  });
  return document;
}

describe('atomic media framing edits', () => {
  it('patches narrative transform while retaining the crop materialized from its legacy preset', () => {
    const result = applyMediaTransformInput(documentWithMedia(), {
      items: [{ clipId: 'narrative', scale: 1.2, offsetX: 0.1, offsetY: -0.2 }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const clip = result.document.timeline.tracks[0]!.clips[0]!;
    expect(clip.kind).toBe('narrative');
    if (clip.kind !== 'narrative') return;
    expect(clip.mediaFraming).toEqual({
      transform: { scale: 1.2, offsetX: 0.1, offsetY: -0.2 },
      crop: { top: 0, right: 0.25, bottom: 0, left: 0.25 },
      rounding: 0,
    });
  });

  it('patches ordinary visual crop and reset preserves the other atom', () => {
    const transformed = applyMediaTransformInput(documentWithMedia(), {
      items: [{ clipId: 'still', scale: 0.8, offsetX: 0.2 }],
    });
    expect(transformed.ok).toBe(true);
    if (!transformed.ok) return;
    const cropped = applyMediaCropInput(transformed.document, {
      items: [{ clipId: 'still', top: 0.1, right: 0.2, bottom: 0.15, left: 0.05 }],
    });
    expect(cropped.ok).toBe(true);
    if (!cropped.ok) return;
    const reset = applyMediaCropInput(cropped.document, { items: [{ clipId: 'still', reset: true }] });
    expect(reset.ok).toBe(true);
    if (!reset.ok) return;
    const clip = reset.document.timeline.tracks[1]!.clips[0]!;
    expect(clip.kind).toBe('media');
    if (clip.kind !== 'media') return;
    expect(clip.mediaFraming).toEqual({
      transform: { scale: 0.8, offsetX: 0.2, offsetY: 0 },
      crop: { top: 0, right: 0, bottom: 0, left: 0 },
      rounding: 0,
    });
  });

  it('rejects the whole batch when a later row is invalid', () => {
    const document = documentWithMedia();
    const result = applyMediaCropInput(document, {
      items: [
        { clipId: 'narrative', left: 0.1 },
        { clipId: 'still', left: 0.8, right: 0.3 },
      ],
    });
    expect(result).toMatchObject({ ok: false });
    expect(document.timeline.tracks[0]!.clips[0]!).not.toHaveProperty('mediaFraming');
  });
});
