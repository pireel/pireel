import { describe, expect, it } from 'vitest';
import { emptyComposition } from './composition-core';
import { compositionToEditorDocument } from './project-document';
import { addNarrativeDocumentClip, moveNarrativeDocumentClip, moveNarrativeDocumentClipToVisualTrack, reorderNarrativeDocumentClips } from './narrative-document-edit';

function emptyDocument() {
  return compositionToEditorDocument({ projectId: 'narrative-structure', composition: emptyComposition() }).document;
}

describe('native narrative structure edits', () => {
  it('inserts the first source into an empty primary lane, configures canvas and reuses its durable asset', () => {
    const first = addNarrativeDocumentClip({
      document: emptyDocument(),
      atSec: 0,
      sourceWidth: 1920,
      sourceHeight: 1080,
      shot: { id: 'first', src: 'blob:first', srcSig: 'first.mp4:10:1', srcStart: 0, srcEnd: 4, treatment: 'full' },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.document.canvas).toMatchObject({ width: 1920, height: 1080, configured: true });
    expect(first.document.semantics.primaryNarrativeAssetId).toBe(first.assetId);
    expect(first.document.assets[first.assetId!].locator).toEqual({ localSig: 'first.mp4:10:1' });

    const second = addNarrativeDocumentClip({
      document: first.document,
      atSec: 4,
      shot: { id: 'second', src: 'blob:second-runtime', srcSig: 'first.mp4:10:1', srcStart: 0, srcEnd: 2, treatment: 'full' },
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.assetId).toBe(first.assetId);
    expect(Object.values(second.document.assets).filter((asset) => asset.kind === 'video')).toHaveLength(1);
    expect(second.document.timeline.tracks.find((track) => track.role === 'primaryNarrative')?.clips).toMatchObject([
      { id: 'first', startFrame: 0, durationFrames: 120 },
      { id: 'second', startFrame: 120, durationFrames: 60 },
    ]);
  });

  it('preserves explicit gaps while reordering stable clip identities', () => {
    const document = emptyDocument();
    document.assets.video = { id: 'video', kind: 'video', locator: { remoteUrl: 'https://cdn.test/v.mp4' }, metadata: { durationSec: 8 } };
    const track = document.timeline.tracks.find((candidate) => candidate.role === 'primaryNarrative')!;
    track.clips = [
      { id: 'a', kind: 'narrative', assetId: 'video', startFrame: 30, durationFrames: 60, enabled: true, sourceInSec: 0, sourceOutSec: 2, properties: { treatment: 'full' } },
      { id: 'b', kind: 'narrative', assetId: 'video', startFrame: 120, durationFrames: 90, enabled: true, sourceInSec: 2, sourceOutSec: 5, properties: { treatment: 'full' } },
    ];
    const result = reorderNarrativeDocumentClips(document, ['b', 'a']);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks.find((candidate) => candidate.id === track.id)?.clips).toMatchObject([
      { id: 'b', startFrame: 30, durationFrames: 90 },
      { id: 'a', startFrame: 150, durationFrames: 60 },
    ]);
  });

  it('moves a primary clip to exact time and overwrites only the primary destination', () => {
    const first = addNarrativeDocumentClip({
      document: emptyDocument(), mode: 'overwrite', atSec: 0,
      shot: { id: 'first', src: 'https://cdn.test/first.mp4', srcStart: 0, srcEnd: 2, treatment: 'full' },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = addNarrativeDocumentClip({
      document: first.document, mode: 'overwrite', atSec: 5,
      shot: { id: 'second', src: 'https://cdn.test/second.mp4', srcStart: 0, srcEnd: 2, treatment: 'full' },
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    second.document.timeline.tracks.push({
      id: 'graphics', type: 'graphics', role: 'graphics', muted: false, hidden: false, locked: false, syncLocked: true, stackOrder: 2,
      clips: [{ id: 'card', kind: 'graphic', startFrame: 135, durationFrames: 90, enabled: true, block: { templateId: 'custom', slots: {} }, anchor: { type: 'timeline' } }],
    });

    const result = moveNarrativeDocumentClip({ document: second.document, clipId: 'first', atSec: 4 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks.find((track) => track.role === 'primaryNarrative')?.clips).toMatchObject([
      { id: 'first', startFrame: 120, durationFrames: 60 },
      { id: 'second', startFrame: 180, durationFrames: 30, sourceInSec: 1, sourceOutSec: 2 },
    ]);
    expect(result.document.timeline.tracks.find((track) => track.id === 'graphics')?.clips).toMatchObject([
      { id: 'card', startFrame: 135, durationFrames: 90 },
    ]);
  });

  it('promotes a primary clip into a native visual media track without changing its asset identity', () => {
    const inserted = addNarrativeDocumentClip({
      document: emptyDocument(), mode: 'overwrite', atSec: 0,
      shot: { id: 'primary-clip', src: 'https://cdn.test/primary.mp4', srcStart: 1, srcEnd: 4, treatment: 'full' },
    });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    const result = moveNarrativeDocumentClipToVisualTrack({
      document: inserted.document,
      clipId: 'primary-clip',
      atSec: 2,
      newTrack: { id: 'visual-above', name: 'Visual media', stackOrder: 3 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks.find((track) => track.role === 'primaryNarrative')?.clips).toEqual([]);
    expect(result.document.timeline.tracks.find((track) => track.id === 'visual-above')?.clips).toMatchObject([
      { id: 'primary-clip', kind: 'media', assetId: inserted.assetId, startFrame: 60, durationFrames: 90, sourceInSec: 1, sourceOutSec: 4 },
    ]);
    expect(result.assetId).toBe(inserted.assetId);
  });

  it('promotes primary footage into an existing graphics lane because both are visual lanes', () => {
    const inserted = addNarrativeDocumentClip({
      document: emptyDocument(), mode: 'overwrite', atSec: 0,
      shot: { id: 'primary-clip', src: 'https://cdn.test/primary.mp4', srcStart: 0, srcEnd: 2, treatment: 'full' },
    });
    expect(inserted.ok).toBe(true);
    if (!inserted.ok) return;
    inserted.document.timeline.tracks.push({
      id: 'mixed', type: 'graphics', role: 'graphics', muted: false, hidden: false, locked: false,
      syncLocked: false, stackOrder: 3, clips: [{
        id: 'title', kind: 'graphic', startFrame: 90, durationFrames: 30, enabled: true,
        anchor: { type: 'timeline' }, block: { templateId: 'custom', slots: {} },
      }],
    });

    const result = moveNarrativeDocumentClipToVisualTrack({
      document: inserted.document,
      clipId: 'primary-clip',
      atSec: 0,
      targetTrackId: 'mixed',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks.find((track) => track.id === 'mixed')?.clips.map((clip) => clip.kind)).toEqual([
      'media',
      'graphic',
    ]);
  });

  it('rolls insertion back when a sync-locked sibling lane is locked', () => {
    const document = emptyDocument();
    document.timeline.tracks.push({
      id: 'locked-graphics', type: 'graphics', muted: false, hidden: false, locked: true, syncLocked: true, stackOrder: 2,
      clips: [{ id: 'card', kind: 'graphic', startFrame: 0, durationFrames: 90, enabled: true, block: { templateId: 'custom', slots: {} }, anchor: { type: 'timeline' } }],
    });
    const result = addNarrativeDocumentClip({
      document,
      atSec: 0,
      shot: { id: 'blocked', src: 'https://cdn.test/blocked.mp4', srcStart: 0, srcEnd: 2, treatment: 'full' },
    });
    expect(result).toMatchObject({ ok: false, document, error: { code: 'track-locked', trackIds: ['locked-graphics'] } });
    expect(document.assets).toEqual({});
  });
});
