import { describe, expect, it } from 'vitest';
import { applyEditorCommand, emptyEditorDocumentV2 } from './editor-document';

describe('EditorDocument V2 canvas command', () => {
  it('marks an explicit canvas as configured without mutating the prior snapshot', () => {
    const document = emptyEditorDocumentV2({ width: 1080, height: 1920, fps: 30 });
    const result = applyEditorCommand(document, {
      type: 'canvas.patch',
      patch: { width: 1080, height: 1920 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(document.canvas).toEqual({ width: 1080, height: 1920, fps: 30, configured: false });
    expect(result.document.canvas).toEqual({ width: 1080, height: 1920, fps: 30, configured: true });

    const noOp = applyEditorCommand(result.document, {
      type: 'canvas.patch',
      patch: { width: 1080, height: 1920 },
    });
    expect(noOp.ok).toBe(true);
    if (!noOp.ok) return;
    expect(noOp.document).toBe(result.document);
  });

  it('rejects invalid dimensions atomically', () => {
    const document = emptyEditorDocumentV2();
    const result = applyEditorCommand(document, {
      type: 'canvas.patch',
      patch: { width: 1080.5, height: 0 },
    });
    expect(result).toMatchObject({ ok: false, document, error: { code: 'invalid-range', path: 'canvas' } });
  });

  it('leaves default media to the compositor fit when the canvas ratio changes', () => {
    const document = emptyEditorDocumentV2({ width: 1920, height: 1080, fps: 30 });
    document.assets.main = {
      id: 'main', kind: 'video', locator: { remoteUrl: 'https://cdn.test/main.mp4' }, metadata: { width: 1920, height: 1080 },
    };
    document.timeline.tracks[0]!.clips.push({
      id: 'shot', kind: 'narrative', assetId: 'main', startFrame: 0, durationFrames: 90,
      enabled: true, sourceInSec: 0, sourceOutSec: 3, properties: { treatment: 'full' },
    });
    const result = applyEditorCommand(document, {
      type: 'canvas.patch', patch: { width: 1080, height: 1920 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks[0]!.clips[0]).toBe(document.timeline.tracks[0]!.clips[0]);
    expect(result.document.timeline.tracks[0]!.clips[0]).not.toHaveProperty('box');
    expect(result.receipt.affectedTrackIds).toEqual([]);

    const restored = applyEditorCommand(result.document, {
      type: 'canvas.patch', patch: { width: 1920, height: 1080 },
    });
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    expect(restored.document.timeline.tracks[0]!.clips[0]).toBe(document.timeline.tracks[0]!.clips[0]);
  });

  it('keeps the relative centre when a default-fit clip was moved', () => {
    const document = emptyEditorDocumentV2({ width: 1920, height: 1080, fps: 30 });
    document.assets.main = {
      id: 'main', kind: 'video', locator: { remoteUrl: 'https://cdn.test/main.mp4' }, metadata: { width: 1920, height: 1080 },
    };
    document.timeline.tracks[0]!.clips.push({
      id: 'shot', kind: 'narrative', assetId: 'main', startFrame: 0, durationFrames: 90,
      enabled: true, sourceInSec: 0, sourceOutSec: 3, properties: { treatment: 'full' },
      box: { x: 0.1, y: 0.2, w: 1, h: 1 },
    });
    const result = applyEditorCommand(document, {
      type: 'canvas.patch', patch: { width: 1080, height: 1920 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks[0]!.clips[0]).toBe(document.timeline.tracks[0]!.clips[0]);
    expect(result.document.timeline.tracks[0]!.clips[0]).toMatchObject({
      box: { x: 0.1, y: 0.2, w: 1, h: 1 },
    });
  });

  it('scales custom media and its box keyframes uniformly around their relative centres', () => {
    const document = emptyEditorDocumentV2({ width: 1920, height: 1080, fps: 30 });
    document.assets.insert = {
      id: 'insert', kind: 'video', locator: { remoteUrl: 'https://cdn.test/insert.mp4' }, metadata: { width: 1920, height: 1080 },
    };
    document.timeline.tracks[0]!.clips.push({
      id: 'insert-clip', kind: 'media', assetId: 'insert', startFrame: 0, durationFrames: 90,
      enabled: true, sourceInSec: 0, sourceOutSec: 3,
      box: { x: 0.1, y: 0.2, w: 0.6, h: 0.6 },
      keyframes: { box: [{ frame: 30, x: 0.2, y: 0.1, w: 0.4, h: 0.8 }] },
    });
    const result = applyEditorCommand(document, {
      type: 'canvas.patch', patch: { width: 1080, height: 1920 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks[0]!.clips[0]).toMatchObject({
      box: { x: 0.1, y: 0.4051, w: 0.6, h: 0.1898 },
      keyframes: { box: [{ frame: 30, x: 0.2, y: 0.3734, w: 0.4, h: 0.2531 }] },
    });
  });

  it('leaves media geometry untouched when the source dimensions are unknown', () => {
    const document = emptyEditorDocumentV2({ width: 1920, height: 1080, fps: 30 });
    document.assets.poster = {
      id: 'poster', kind: 'image', locator: { remoteUrl: 'https://cdn.test/poster.jpg' }, metadata: {},
    };
    document.timeline.tracks[0]!.clips.push({
      id: 'poster-clip', kind: 'media', assetId: 'poster', startFrame: 0, durationFrames: 90,
      enabled: true, sourceInSec: 0, sourceOutSec: 3,
      box: { x: 0.2, y: 0.2, w: 0.5, h: 0.5 },
      keyframes: { box: [{ frame: 30, x: 0.1, y: 0.3, w: 0.7, h: 0.4 }] },
    });
    const result = applyEditorCommand(document, {
      type: 'canvas.patch', patch: { width: 1080, height: 1920 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks[0]!.clips[0]).toBe(document.timeline.tracks[0]!.clips[0]);
    expect(result.receipt.affectedTrackIds).toEqual([]);
  });

  it('does not touch media geometry when only the canvas resolution changes', () => {
    const document = emptyEditorDocumentV2({ width: 1920, height: 1080, fps: 30 });
    document.assets.main = {
      id: 'main', kind: 'video', locator: { remoteUrl: 'https://cdn.test/main.mp4' }, metadata: { width: 1920, height: 1080 },
    };
    document.timeline.tracks[0]!.clips.push({
      id: 'shot', kind: 'narrative', assetId: 'main', startFrame: 0, durationFrames: 90,
      enabled: true, sourceInSec: 0, sourceOutSec: 3, properties: { treatment: 'full' },
      box: { x: 0.1, y: 0.2, w: 0.6, h: 0.6 },
    });
    const result = applyEditorCommand(document, {
      type: 'canvas.patch', patch: { width: 1280, height: 720 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks[0]!.clips[0]).toBe(document.timeline.tracks[0]!.clips[0]);
    expect(result.receipt.affectedTrackIds).toEqual([]);
  });
});
