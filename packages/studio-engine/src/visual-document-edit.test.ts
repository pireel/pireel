import { describe, expect, it } from 'vitest';
import { emptyComposition } from './composition-core';
import { addNarrativeDocumentClip } from './narrative-document-edit';
import { compositionToEditorDocument, projectDocumentToComposition } from './project-document';
import { moveVisualDocumentClip } from './visual-document-edit';

function emptyDocument() {
  return compositionToEditorDocument({ projectId: 'visual-move', composition: emptyComposition() }).document;
}

describe('NLE-style visual document moves', () => {
  it('moves primary video to a new visual lane and prunes the overwritten destination range', () => {
    const first = addNarrativeDocumentClip({
      document: emptyDocument(), mode: 'overwrite', atSec: 0,
      shot: { id: 'primary', src: 'https://cdn.test/primary.mp4', srcStart: 0, srcEnd: 3, treatment: 'full' },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const result = moveVisualDocumentClip({
      document: first.document,
      clipId: 'primary',
      atSec: 4,
      target: { kind: 'visual-new', id: 'v2', stackOrder: 2 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks.find((track) => track.role === 'primaryNarrative')?.clips).toEqual([]);
    expect(result.document.timeline.tracks.find((track) => track.id === 'v2')?.clips).toMatchObject([
      { id: 'primary', kind: 'media', startFrame: 120, durationFrames: 90 },
    ]);
    expect(result.document.timeline.tracks.find((track) => track.id === 'v2')?.muted).toBe(false);
  });

  it('preserves canvas placement when a video moves between primary and ordinary visual lanes', () => {
    const document = emptyDocument();
    document.assets.video = { id: 'video', kind: 'video', locator: { remoteUrl: 'https://cdn.test/video.mp4' }, metadata: { durationSec: 3 } };
    document.semantics.primaryNarrativeAssetId = 'video';
    document.timeline.tracks[0]!.clips = [{
      id: 'placed', kind: 'narrative', assetId: 'video', startFrame: 0, durationFrames: 90,
      sourceInSec: 0, sourceOutSec: 3, box: { x: 0.1, y: 0.2, w: 0.6, h: 0.6 },
      mediaFraming: {
        transform: { scale: 1.15, offsetX: 0.08, offsetY: -0.03 },
        crop: { top: 0.02, right: 0.04, bottom: 0.06, left: 0.08 },
        rounding: 12,
      },
      properties: {
        treatment: 'punch-in', treatSize: 118,
        filter: { contrast: 1.1 }, volumeDb: -8, audioFadeInSec: 0.4, audioFadeOutSec: 0.6,
      },
      enabled: true,
    }];
    const out = moveVisualDocumentClip({
      document, clipId: 'placed', atSec: 1,
      target: { kind: 'visual-new', id: 'v2', stackOrder: 2 },
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.document.timeline.tracks.find((track) => track.id === 'v2')!.clips[0]).toMatchObject({
      kind: 'media', box: { x: 0.1, y: 0.2, w: 0.6, h: 0.6 },
      mediaFraming: { transform: { scale: 1.15, offsetX: 0.08, offsetY: -0.03 } },
      video: {
        treatment: 'punch-in', treatSize: 118,
        filter: { contrast: 1.1 }, volumeDb: -8, audioFadeInSec: 0.4, audioFadeOutSec: 0.6,
      },
    });
    const back = moveVisualDocumentClip({ document: out.document, clipId: 'placed', atSec: 0, target: { kind: 'primary' } });
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.document.timeline.tracks.find((track) => track.role === 'primaryNarrative')!.clips[0]).toMatchObject({
      kind: 'narrative', box: { x: 0.1, y: 0.2, w: 0.6, h: 0.6 },
      mediaFraming: { transform: { scale: 1.15, offsetX: 0.08, offsetY: -0.03 } },
      properties: {
        treatment: 'punch-in', treatSize: 118,
        filter: { contrast: 1.1 }, volumeDb: -8, audioFadeInSec: 0.4, audioFadeOutSec: 0.6,
      },
    });
  });

  it('preserves the primary asset identity and runtime source across a visual-lane round trip', () => {
    const first = addNarrativeDocumentClip({
      document: emptyDocument(), mode: 'overwrite', atSec: 0,
      shot: { id: 'primary', src: 'blob:primary-runtime', srcSig: 'primary-sig', srcStart: 0, srcEnd: 3, treatment: 'full' },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const assetId = first.document.semantics.primaryNarrativeAssetId!;
    const out = moveVisualDocumentClip({
      document: first.document,
      clipId: 'primary',
      atSec: 1,
      target: { kind: 'visual-new', id: 'v2', stackOrder: 2 },
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const back = moveVisualDocumentClip({ document: out.document, clipId: 'primary', atSec: 0, target: { kind: 'primary' } });
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.document.semantics.primaryNarrativeAssetId).toBe(assetId);
    expect(back.document.timeline.tracks.find((track) => track.role === 'primaryNarrative')?.clips[0]).toMatchObject({
      id: 'primary', assetId, kind: 'narrative',
    });
    const projected = projectDocumentToComposition(back.document, {
      resolveAssetUrl: (asset) => asset.id === assetId ? 'blob:primary-runtime' : undefined,
    });
    expect(projected).toMatchObject({
      video: { url: 'blob:primary-runtime' },
      shots: [{ id: 'primary', srcStart: 0, srcEnd: 3 }],
    });
    expect(projected.shots?.[0]?.src).toBeUndefined();
  });

  it('uses overwrite semantics on the destination visual lane and removes an emptied source lane', () => {
    const document = emptyDocument();
    document.assets = {
      a: { id: 'a', kind: 'video', locator: { remoteUrl: 'https://cdn.test/a.mp4' }, metadata: { durationSec: 10 } },
      b: { id: 'b', kind: 'video', locator: { remoteUrl: 'https://cdn.test/b.mp4' }, metadata: { durationSec: 10 } },
    };
    document.timeline.tracks.push(
      {
        id: 'source', type: 'visual', role: 'broll', muted: false, hidden: false, locked: false, syncLocked: true, stackOrder: 2,
        clips: [{ id: 'moving', kind: 'media', assetId: 'a', startFrame: 0, durationFrames: 90, enabled: true, sourceInSec: 0, sourceOutSec: 3 }],
      },
      {
        id: 'target', type: 'visual', role: 'broll', muted: false, hidden: false, locked: false, syncLocked: true, stackOrder: 1,
        clips: [{ id: 'covered', kind: 'media', assetId: 'b', startFrame: 60, durationFrames: 30, enabled: true, sourceInSec: 0, sourceOutSec: 1 }],
      },
    );
    const result = moveVisualDocumentClip({
      document,
      clipId: 'moving',
      atSec: 1,
      target: { kind: 'visual', trackId: 'target' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks.some((track) => track.id === 'source')).toBe(false);
    expect(result.document.timeline.tracks.find((track) => track.id === 'target')?.clips).toMatchObject([
      { id: 'moving', startFrame: 30, durationFrames: 90 },
    ]);
  });

  it('moves ordinary video back to the primary lane as a narrative clip', () => {
    const document = emptyDocument();
    document.assets.video = { id: 'video', kind: 'video', locator: { remoteUrl: 'https://cdn.test/video.mp4' }, metadata: { durationSec: 4 } };
    document.timeline.tracks.push({
      id: 'v2', type: 'visual', role: 'broll', muted: false, hidden: false, locked: false, syncLocked: true, stackOrder: 2,
      clips: [{ id: 'returning', kind: 'media', assetId: 'video', startFrame: 60, durationFrames: 60, enabled: true, sourceInSec: 1, sourceOutSec: 3 }],
    });
    const result = moveVisualDocumentClip({ document, clipId: 'returning', atSec: 0, target: { kind: 'primary' } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks.find((track) => track.role === 'primaryNarrative')?.clips).toMatchObject([
      { id: 'returning', kind: 'narrative', startFrame: 0, properties: { treatment: 'full' } },
    ]);
    expect(result.document.timeline.tracks.some((track) => track.id === 'v2')).toBe(false);
  });

  it('packs a primary move from frame zero without overwriting another clip', () => {
    const document = emptyDocument();
    document.assets.video = { id: 'video', kind: 'video', locator: { remoteUrl: 'https://cdn.test/video.mp4' }, metadata: { durationSec: 8 } };
    const primary = document.timeline.tracks.find((track) => track.role === 'primaryNarrative')!;
    primary.clips = [
      { id: 'a', kind: 'narrative', assetId: 'video', startFrame: 30, durationFrames: 60, enabled: true, sourceInSec: 0, sourceOutSec: 2, properties: { treatment: 'full' } },
      { id: 'b', kind: 'narrative', assetId: 'video', startFrame: 150, durationFrames: 90, enabled: true, sourceInSec: 2, sourceOutSec: 5, properties: { treatment: 'full' } },
    ];
    const result = moveVisualDocumentClip({
      document,
      clipId: 'b',
      atSec: 0,
      target: { kind: 'primary' },
      primaryOrder: ['b', 'a'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks.find((track) => track.id === primary.id)?.clips).toMatchObject([
      { id: 'b', startFrame: 0, durationFrames: 90 },
      { id: 'a', startFrame: 90, durationFrames: 60 },
    ]);
  });

  it('packs a detached video into primary without trimming its destination', () => {
    const document = emptyDocument();
    document.assets.video = { id: 'video', kind: 'video', locator: { remoteUrl: 'https://cdn.test/video.mp4' }, metadata: { durationSec: 8 } };
    const primary = document.timeline.tracks.find((track) => track.role === 'primaryNarrative')!;
    primary.clips = [
      { id: 'a', kind: 'narrative', assetId: 'video', startFrame: 30, durationFrames: 60, enabled: true, sourceInSec: 0, sourceOutSec: 2, properties: { treatment: 'full' } },
    ];
    document.timeline.tracks.push({
      id: 'v2', type: 'visual', role: 'broll', muted: false, hidden: false, locked: false, syncLocked: true, stackOrder: 2,
      clips: [{ id: 'b', kind: 'media', assetId: 'video', startFrame: 0, durationFrames: 90, enabled: true, sourceInSec: 2, sourceOutSec: 5 }],
    });
    const result = moveVisualDocumentClip({
      document,
      clipId: 'b',
      atSec: 0,
      target: { kind: 'primary' },
      primaryOrder: ['b', 'a'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks.find((track) => track.id === primary.id)?.clips).toMatchObject([
      { id: 'b', kind: 'narrative', startFrame: 0, durationFrames: 90 },
      { id: 'a', startFrame: 90, durationFrames: 60 },
    ]);
    expect(result.document.timeline.tracks.some((track) => track.id === 'v2')).toBe(false);
  });

  it('packs the remaining primary lane when a clip is detached', () => {
    const document = emptyDocument();
    document.assets.video = { id: 'video', kind: 'video', locator: { remoteUrl: 'https://cdn.test/video.mp4' }, metadata: { durationSec: 8 } };
    const primary = document.timeline.tracks.find((track) => track.role === 'primaryNarrative')!;
    primary.clips = [
      { id: 'a', kind: 'narrative', assetId: 'video', startFrame: 30, durationFrames: 60, enabled: true, sourceInSec: 0, sourceOutSec: 2, properties: { treatment: 'full' } },
      { id: 'b', kind: 'narrative', assetId: 'video', startFrame: 150, durationFrames: 90, enabled: true, sourceInSec: 2, sourceOutSec: 5, properties: { treatment: 'full' } },
    ];
    const result = moveVisualDocumentClip({
      document,
      clipId: 'a',
      atSec: 4,
      target: { kind: 'visual-new', id: 'v2', stackOrder: 2 },
      primaryOrder: ['b'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks.find((track) => track.id === primary.id)?.clips).toMatchObject([
      { id: 'b', startFrame: 0, durationFrames: 90 },
    ]);
    expect(result.document.timeline.tracks.find((track) => track.id === 'v2')?.clips).toMatchObject([
      { id: 'a', kind: 'media', startFrame: 120, durationFrames: 60 },
    ]);
  });

  it('keeps linked companions on one rigid time delta', () => {
    const document = emptyDocument();
    document.assets.video = { id: 'video', kind: 'video', locator: { remoteUrl: 'https://cdn.test/video.mp4' }, metadata: { durationSec: 4 } };
    document.assets.audio = { id: 'audio', kind: 'audio', locator: { remoteUrl: 'https://cdn.test/audio.mp3' }, metadata: { durationSec: 4 } };
    const primary = document.timeline.tracks.find((track) => track.role === 'primaryNarrative')!;
    primary.clips.push({
      id: 'lead', kind: 'narrative', assetId: 'video', startFrame: 30, durationFrames: 60, enabled: true,
      linkGroupId: 'av', sourceInSec: 0, sourceOutSec: 2, properties: { treatment: 'full' },
    });
    document.timeline.tracks.push({
      id: 'audio-track', type: 'audio', role: 'music', muted: false, hidden: false, locked: false, syncLocked: true, stackOrder: 0,
      clips: [{
        id: 'companion', kind: 'audio', assetId: 'audio', startFrame: 45, durationFrames: 60, enabled: true,
        linkGroupId: 'av', sourceInSec: 0.5, sourceOutSec: 2.5, properties: {}, anchor: { type: 'timeline' },
      }],
    });
    const result = moveVisualDocumentClip({
      document,
      clipId: 'lead',
      atSec: 3,
      target: { kind: 'visual-new', id: 'v2', stackOrder: 2 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks.find((track) => track.id === 'v2')?.clips[0]).toMatchObject({
      id: 'lead', startFrame: 90,
    });
    expect(result.document.timeline.tracks.find((track) => track.id === 'audio-track')?.clips[0]).toMatchObject({
      id: 'companion', startFrame: 105,
    });
  });

  it('splits a destination clip around the overwritten range', () => {
    const document = emptyDocument();
    document.assets.moving = { id: 'moving', kind: 'video', locator: { remoteUrl: 'https://cdn.test/moving.mp4' }, metadata: { durationSec: 2 } };
    document.assets.bed = { id: 'bed', kind: 'video', locator: { remoteUrl: 'https://cdn.test/bed.mp4' }, metadata: { durationSec: 10 } };
    document.timeline.tracks.push(
      {
        id: 'source', type: 'visual', role: 'broll', muted: false, hidden: false, locked: false, syncLocked: true, stackOrder: 2,
        clips: [{ id: 'moving-clip', kind: 'media', assetId: 'moving', startFrame: 0, durationFrames: 60, enabled: true, sourceInSec: 0, sourceOutSec: 2 }],
      },
      {
        id: 'target', type: 'visual', role: 'broll', muted: false, hidden: false, locked: false, syncLocked: true, stackOrder: 1,
        clips: [{ id: 'bed-clip', kind: 'media', assetId: 'bed', startFrame: 0, durationFrames: 300, enabled: true, sourceInSec: 0, sourceOutSec: 10 }],
      },
    );
    const result = moveVisualDocumentClip({
      document,
      clipId: 'moving-clip',
      atSec: 4,
      target: { kind: 'visual', trackId: 'target' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks.find((track) => track.id === 'target')?.clips).toMatchObject([
      { id: 'bed-clip', startFrame: 0, durationFrames: 120, sourceInSec: 0, sourceOutSec: 4 },
      { id: 'moving-clip', startFrame: 120, durationFrames: 60 },
      { id: 'bed-clip~split-180', startFrame: 180, durationFrames: 120, sourceInSec: 6, sourceOutSec: 10 },
    ]);
  });
});
