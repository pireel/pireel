import { describe, expect, it } from 'vitest';
import { emptyComposition } from './composition-core';
import { applyGeneratedDraftDocument } from './generated-draft-document-edit';
import { normalizeProjectDocument } from './project-document';

function baseDocument() {
  const composition = {
    ...emptyComposition(),
    video: { url: 'https://cdn.example/main.mp4', durationSec: 12 },
    shots: [{ id: 'old-shot', srcStart: 0, srcEnd: 12, treatment: 'full' as const }],
  };
  return normalizeProjectDocument({ projectId: 'generated-draft', value: composition }).document;
}

describe('applyGeneratedDraftDocument', () => {
  it('replaces generated domains while retaining native lanes and primary asset identity', () => {
    const base = baseDocument();
    const primaryAssetId = base.semantics.primaryNarrativeAssetId!;
    const document = {
      ...base,
      timeline: {
        tracks: [
          ...base.timeline.tracks,
          { id: 'visual-broll', type: 'visual' as const, role: 'broll' as const, muted: false, hidden: false, locked: false, syncLocked: false, stackOrder: 4, clips: [] },
          { id: 'custom-empty', type: 'graphics' as const, role: 'graphics' as const, muted: true, hidden: false, locked: false, syncLocked: false, stackOrder: 9, clips: [] },
          { id: 'audio-empty', type: 'audio' as const, role: 'music' as const, muted: false, hidden: false, locked: false, syncLocked: false, stackOrder: 0, clips: [] },
        ],
      },
    };
    const draft = {
      ...emptyComposition(),
      video: { url: 'blob:runtime-main', durationSec: 12 },
      shots: [
        { id: 'shot-a', srcStart: 0, srcEnd: 4, treatment: 'full' as const },
        { id: 'shot-b', srcStart: 5, srcEnd: 9, treatment: 'punch-in' as const },
      ],
      blocks: [{ id: 'planned', templateId: 'custom', slots: { spec: 'number' }, startSec: 1, durationSec: 2, trackIndex: 1, label: 'Planned' }],
    };

    const result = applyGeneratedDraftDocument({ projectId: 'generated-draft', document, draft });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const primary = result.document.timeline.tracks.find((track) => track.id === result.document.semantics.primaryNarrativeTrackId)!;
    expect(primary.clips.map((clip) => clip.id)).toEqual(['shot-a', 'shot-b']);
    expect(primary.clips.every((clip) => 'assetId' in clip && clip.assetId === primaryAssetId)).toBe(true);
    expect(result.document.timeline.tracks.find((track) => track.id === 'visual-broll')).toEqual(document.timeline.tracks.find((track) => track.id === 'visual-broll'));
    expect(result.document.timeline.tracks.find((track) => track.id === 'audio-empty')).toEqual(document.timeline.tracks.find((track) => track.id === 'audio-empty'));
    expect(result.document.timeline.tracks.find((track) => track.id === 'custom-empty')?.clips).toEqual([]);
    expect(result.document.timeline.tracks.some((track) => track.type === 'graphics' && track.clips.some((clip) => clip.id === 'planned'))).toBe(true);
  });

  it('rolls the whole draft back when a replaced lane is locked', () => {
    const base = baseDocument();
    const document = {
      ...base,
      timeline: {
        tracks: base.timeline.tracks.map((track) => track.id === base.semantics.primaryNarrativeTrackId ? { ...track, locked: true } : track),
      },
    };
    const result = applyGeneratedDraftDocument({
      projectId: 'generated-draft',
      document,
      draft: { ...emptyComposition(), shots: [] },
    });
    expect(result).toMatchObject({ ok: false, document, error: { code: 'track-locked' } });
  });
});
