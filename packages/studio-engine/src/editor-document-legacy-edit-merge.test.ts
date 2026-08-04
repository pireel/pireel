import { describe, expect, it } from 'vitest';
import {
  applyEditorCommand,
  type Composition,
  emptyComposition,
  normalizeProjectDocument,
  projectDocumentToLegacyComposition,
  type EditorDocumentV2,
} from './composition';

function editThroughLegacy(document: EditorDocumentV2, edit: (composition: Composition) => Composition) {
  const composition = projectDocumentToLegacyComposition({ projectId: 'project-1', value: document });
  return normalizeProjectDocument({
    projectId: 'project-1',
    value: edit(composition),
    previousDocument: document,
  }).document;
}

describe('V1 compatibility edit merge', () => {
  it('preserves an empty native V2 track and its flags across an unrelated V1 edit', () => {
    const initial = normalizeProjectDocument({ projectId: 'project-1', value: emptyComposition() }).document;
    const inserted = applyEditorCommand(initial, {
      type: 'track.insert',
      track: { id: 'track_broll', type: 'visual', role: 'broll', name: 'B-roll', locked: true, syncLocked: false },
    });
    expect(inserted.ok).toBe(true);
    const edited = editThroughLegacy(inserted.document, (composition) => ({ ...composition, width: 1920 }));
    expect(edited.timeline.tracks.find((track) => track.id === 'track_broll')).toMatchObject({
      clips: [],
      locked: true,
      syncLocked: false,
      name: 'B-roll',
    });
  });

  it('keeps media clips and narrative gaps that V1 cannot represent', () => {
    const initial = normalizeProjectDocument({
      projectId: 'project-1',
      value: {
        ...emptyComposition(),
        video: { url: 'https://cdn.example/main.mp4', durationSec: 4 },
        shots: [{ id: 'main', srcStart: 0, srcEnd: 4, treatment: 'full' as const }],
      },
      videoSig: 'main.mp4:42:7',
    }).document;
    const primaryId = initial.semantics.primaryNarrativeTrackId;
    const withNativeState: EditorDocumentV2 = {
      ...initial,
      assets: {
        ...initial.assets,
        asset_broll: { id: 'asset_broll', kind: 'video', locator: { remoteUrl: 'https://cdn.example/broll.mp4' }, metadata: { durationSec: 2 } },
      },
      timeline: {
        tracks: [
          ...initial.timeline.tracks.map((track) => track.id === primaryId
            ? { ...track, clips: track.clips.map((clip) => ({ ...clip, startFrame: 45 })) }
            : track),
          {
            id: 'track_broll', type: 'visual', role: 'broll', muted: false, hidden: false,
            locked: false, syncLocked: true, stackOrder: 2,
            clips: [{ id: 'broll-1', kind: 'media', assetId: 'asset_broll', startFrame: 60, durationFrames: 60, enabled: true, sourceInSec: 0, sourceOutSec: 2 }],
          },
        ],
      },
    };
    const edited = editThroughLegacy(withNativeState, (composition) => ({ ...composition, width: 720 }));
    expect(edited.timeline.tracks.find((track) => track.id === primaryId)?.clips[0]?.startFrame).toBe(45);
    expect(edited.timeline.tracks.find((track) => track.id === 'track_broll')?.clips[0]).toMatchObject({ id: 'broll-1', kind: 'media' });
    expect(edited.assets.asset_broll).toBeDefined();
  });

  it('still removes a visible clip intentionally deleted through V1', () => {
    const initial = normalizeProjectDocument({
      projectId: 'project-1',
      value: {
        ...emptyComposition(),
        blocks: [{ id: 'title', templateId: 'custom', slots: {}, startSec: 0, durationSec: 2, trackIndex: 1 }],
      },
    }).document;
    const edited = editThroughLegacy(initial, (composition) => ({ ...composition, blocks: [] }));
    expect(edited.timeline.tracks.flatMap((track) => track.clips)).toEqual([]);
  });

  it('preserves a custom primary track identity', () => {
    const initial = normalizeProjectDocument({ projectId: 'project-1', value: emptyComposition() }).document;
    const custom: EditorDocumentV2 = {
      ...initial,
      timeline: { tracks: initial.timeline.tracks.map((track) => ({ ...track, id: 'dialogue-a' })) },
      semantics: { ...initial.semantics, primaryNarrativeTrackId: 'dialogue-a' },
    };
    const edited = editThroughLegacy(custom, (composition) => ({ ...composition, height: 1080 }));
    expect(edited.semantics.primaryNarrativeTrackId).toBe('dialogue-a');
    expect(edited.timeline.tracks.map((track) => track.id)).toContain('dialogue-a');
    expect(edited.timeline.tracks.map((track) => track.id)).not.toContain('track_primary_narrative');
  });

  it('does not churn a custom primary asset when persistence strips the runtime video field', () => {
    const initial = normalizeProjectDocument({
      projectId: 'project-1',
      value: {
        ...emptyComposition(),
        video: { url: 'blob:runtime-main', durationSec: 4 },
        shots: [{ id: 'main', srcStart: 0, srcEnd: 4, treatment: 'full' as const }],
      },
      videoSig: 'main.mp4:42:7',
    }).document;
    const generatedAssetId = initial.semantics.primaryNarrativeAssetId!;
    const customAssetId = 'asset_primary_custom';
    const custom: EditorDocumentV2 = {
      ...initial,
      assets: {
        [customAssetId]: { ...initial.assets[generatedAssetId]!, id: customAssetId },
      },
      timeline: {
        tracks: initial.timeline.tracks.map((track) => ({
          ...track,
          clips: track.clips.map((clip) => 'assetId' in clip ? { ...clip, assetId: customAssetId } : clip),
        })),
      },
      semantics: { ...initial.semantics, primaryNarrativeAssetId: customAssetId },
    };
    const previousProjection: Composition = {
      ...projectDocumentToLegacyComposition({ projectId: 'project-1', value: custom }),
      video: { url: 'blob:runtime-main', durationSec: 4 },
    };
    const edited = normalizeProjectDocument({
      projectId: 'project-1',
      value: { ...previousProjection, video: null },
      videoSig: 'main.mp4:42:7',
      previousDocument: custom,
      previousProjection,
    }).document;
    expect(edited.semantics.primaryNarrativeAssetId).toBe(customAssetId);
    expect(edited.timeline.tracks[0]?.clips[0]).toMatchObject({ assetId: customAssetId });
  });
});
