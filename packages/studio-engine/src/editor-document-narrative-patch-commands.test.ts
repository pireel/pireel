import { describe, expect, it } from 'vitest';
import { applyEditorCommand, emptyEditorDocumentV2, type EditorDocumentV2 } from './editor-document';

function documentWithPartner(): EditorDocumentV2 {
  const document = emptyEditorDocumentV2({ fps: 30 });
  document.assets.main = { id: 'main', kind: 'video', locator: { localSig: 'main' }, metadata: { durationSec: 10 } };
  document.semantics.primaryNarrativeAssetId = 'main';
  document.timeline.tracks[0]!.clips = [{
    id: 'talk', kind: 'narrative', assetId: 'main', startFrame: 45, durationFrames: 300,
    sourceInSec: 0, sourceOutSec: 10, enabled: true,
    properties: { treatment: 'full', partnerBlockId: 'partner' },
  }];
  document.timeline.tracks.push({
    id: 'graphics', type: 'graphics', role: 'graphics', muted: false, hidden: false, locked: false,
    syncLocked: true, stackOrder: 2, clips: [{
      id: 'partner', kind: 'graphic', startFrame: 0, durationFrames: 30, enabled: true,
      anchor: { type: 'timeline' }, block: {
        templateId: 'custom', slots: { innerHtml: '<div>partner</div>', timelineBody: '' },
      },
    }],
  });
  document.timeline.tracks.push({
    id: 'future', type: 'visual', role: 'broll', muted: false, hidden: false, locked: false,
    syncLocked: false, stackOrder: 3, clips: [],
  });
  return document;
}

describe('V2 narrative patch command', () => {
  it('patches framing in place and aligns its partner to native gap geometry', () => {
    const document = documentWithPartner();
    const result = applyEditorCommand(document, {
      type: 'narrative.patch',
      updates: [{ clipId: 'talk', patch: { framing: { treatment: 'split-l', size: 40 } } }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks[0]!.clips[0]).toMatchObject({
      id: 'talk', startFrame: 45, durationFrames: 300,
      properties: { treatment: 'split-l', treatSize: 40 },
    });
    expect(result.document.timeline.tracks[1]!.clips[0]).toMatchObject({
      id: 'partner', startFrame: 45, durationFrames: 300,
      block: { box: { x: 0.5, y: 0.06, w: 0.46, h: 0.78 } },
    });
    expect(result.document.timeline.tracks[2]).toBe(document.timeline.tracks[2]);
  });

  it('batches normalized filter and audio updates without changing timeline geometry', () => {
    const document = documentWithPartner();
    const result = applyEditorCommand(document, {
      type: 'narrative.patch',
      updates: [{ clipId: 'talk', patch: { filter: { brightness: 1.2 }, audio: { volumeDb: -80, mute: true } } }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks[0]!.clips[0]).toMatchObject({
      startFrame: 45, durationFrames: 300,
      properties: { filter: { brightness: 1.2 }, volumeDb: -60, audioMuted: true },
    });
  });

  it('rejects the whole edit when a framing partner lane is locked', () => {
    const document = documentWithPartner();
    document.timeline.tracks[1]!.locked = true;
    const result = applyEditorCommand(document, {
      type: 'narrative.patch',
      updates: [{ clipId: 'talk', patch: { framing: { treatment: 'split-r' } } }],
    });
    expect(result).toMatchObject({ ok: false, document, error: { code: 'track-locked', trackIds: ['graphics'] } });
    expect(document.timeline.tracks[0]!.clips[0]).toMatchObject({ properties: { treatment: 'full' } });
  });

  it('changes the stable partner link and validates the referenced overlay identity', () => {
    const document = documentWithPartner();
    document.timeline.tracks[1]!.clips.push({
      id: 'other', kind: 'graphic', startFrame: 20, durationFrames: 40, enabled: true,
      anchor: { type: 'timeline' }, block: { templateId: 'custom', slots: {} },
    });
    const result = applyEditorCommand(document, {
      type: 'narrative.patch',
      updates: [{ clipId: 'talk', patch: { framing: { treatment: 'split-r' }, partnerBlockId: 'other' } }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.timeline.tracks[0]!.clips[0]).toMatchObject({ properties: { partnerBlockId: 'other' } });
    expect(result.document.timeline.tracks[1]!.clips.find((clip) => clip.id === 'other')).toMatchObject({
      startFrame: 45, durationFrames: 300,
    });
    expect(result.document.timeline.tracks[1]!.clips.find((clip) => clip.id === 'partner')).toMatchObject({
      startFrame: 0, durationFrames: 30,
    });

    const missing = applyEditorCommand(document, {
      type: 'narrative.patch',
      updates: [{ clipId: 'talk', patch: { partnerBlockId: 'missing' } }],
    });
    expect(missing).toMatchObject({ ok: false, document, error: { code: 'clip-not-found' } });
  });
});
