import { describe, expect, it } from 'vitest';
import { emptyComposition } from './composition-core';
import { applyOverlayDocumentEdits, removeOverlayDocumentClips } from './overlay-document-edit';
import { compositionToEditorDocument, projectDocumentToComposition } from './project-document';

function documentWithOverlays() {
  const composition = {
    ...emptyComposition(),
    blocks: [
      { id: 'lower', templateId: 'custom', slots: { innerHtml: '<div>lower</div>' }, startSec: 1, durationSec: 2, trackIndex: 2, box: { x: 0.1, y: 0.1, w: 0.3, h: 0.2 } },
      { id: 'upper', templateId: 'custom', slots: { innerHtml: '<div>upper</div>' }, startSec: 4, durationSec: 2, trackIndex: 6, box: { x: 0.5, y: 0.5, w: 0.3, h: 0.2 } },
    ],
  };
  const document = compositionToEditorDocument({ projectId: 'overlay-test', composition }).document;
  document.timeline.tracks.push({
    id: 'empty-graphics', type: 'graphics', muted: false, hidden: true, locked: false,
    syncLocked: false, stackOrder: 20, clips: [],
  });
  return document;
}

describe('stable-id overlay document edits', () => {
  it('changes timing/placement without remapping lanes, then prunes lanes emptied by removal', () => {
    const document = documentWithOverlays();
    const trackByClip = new Map(document.timeline.tracks.flatMap((track) => track.clips.map((clip) => [clip.id, track.id])));
    const patched = applyOverlayDocumentEdits({
      document,
      updates: [
        { clipId: 'lower', startSec: 3.5, durationSec: 1.25 },
        { clipId: 'upper', block: { box: { x: 0.2, y: 0.3, w: 0.3, h: 0.2 } } },
      ],
    });
    expect(patched.ok).toBe(true);
    if (!patched.ok) return;
    expect(patched.document.timeline.tracks.find((track) => track.id === trackByClip.get('lower'))!.clips[0]).toMatchObject({
      id: 'lower', startFrame: 105, durationFrames: 38,
    });
    expect(patched.document.timeline.tracks.find((track) => track.id === trackByClip.get('upper'))!.clips[0]).toMatchObject({
      id: 'upper', block: { box: { x: 0.2, y: 0.3 } },
    });

    const removed = removeOverlayDocumentClips({
      document: patched.document,
      clipIds: ['lower', 'upper'],
    });
    expect(removed.ok).toBe(true);
    if (!removed.ok) return;
    expect(projectDocumentToComposition(removed.document).blocks).toEqual([]);
    expect(removed.document.timeline.tracks.find((track) => track.id === trackByClip.get('lower'))).toBeUndefined();
    expect(removed.document.timeline.tracks.find((track) => track.id === trackByClip.get('upper'))).toBeUndefined();
    expect(removed.document.timeline.tracks.find((track) => track.id === 'empty-graphics')).toBeUndefined();
  });

  it('returns the original document when a removal batch includes a locked lane', () => {
    const document = documentWithOverlays();
    document.timeline.tracks.find((track) => track.clips.some((clip) => clip.id === 'upper'))!.locked = true;
    const result = removeOverlayDocumentClips({
      document,
      clipIds: ['lower', 'upper'],
    });
    expect(result).toMatchObject({ ok: false, document, error: { code: 'track-locked' } });
    expect(document.timeline.tracks.flatMap((track) => track.clips.map((clip) => clip.id))).toEqual(expect.arrayContaining(['lower', 'upper']));
  });

  it('keeps native display text editable instead of converting it to a custom Motion Graphic', () => {
    const document = documentWithOverlays();
    const nativeText = document.timeline.tracks
      .flatMap((track) => track.clips)
      .find((clip) => clip.id === 'lower');
    if (!nativeText || nativeText.kind !== 'graphic') throw new Error('fixture must contain a graphic');
    nativeText.block.templateId = 'title';

    const converted = applyOverlayDocumentEdits({
      document,
      updates: [{ clipId: 'lower', block: { templateId: 'custom', slots: { innerHtml: '<div>replacement</div>' } } }],
    });
    expect(converted).toMatchObject({
      ok: false,
      document,
      error: { code: 'invalid-command', path: 'updates[0].block.templateId' },
    });
    expect(nativeText.block).toMatchObject({ templateId: 'title', slots: { innerHtml: '<div>lower</div>' } });

    const restyled = applyOverlayDocumentEdits({
      document,
      updates: [{ clipId: 'lower', block: { slots: { color: '#f7f1e7' } } }],
    });
    expect(restyled.ok).toBe(true);
    if (!restyled.ok) return;
    const updated = restyled.document.timeline.tracks.flatMap((track) => track.clips).find((clip) => clip.id === 'lower');
    expect(updated).toMatchObject({ kind: 'graphic', block: { templateId: 'title', slots: { color: '#f7f1e7' } } });
  });
});
