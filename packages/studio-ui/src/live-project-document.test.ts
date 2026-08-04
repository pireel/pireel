import { describe, expect, it } from 'vitest';
import { emptyComposition } from '@pireel/studio-engine/composition';
import {
  applyCompositionToLiveProject,
  applyCommandToLiveProject,
  applyDocumentToLiveProject,
  createLiveProjectDocumentSession,
  documentFromLiveComposition,
} from './live-project-document';

describe('canonical live project document', () => {
  it('advances V2 immediately when an existing Composition setter edits the canvas', () => {
    const session = createLiveProjectDocumentSession('project-1', emptyComposition());
    applyCompositionToLiveProject(session, { ...session.state.composition, width: 1920, height: 1080 });
    expect(session.state.document.canvas).toMatchObject({ width: 1920, height: 1080 });
    expect(session.state.composition.width).toBe(1920);
  });

  it('keeps runtime URLs outside V2 and resolves them again after a document undo', () => {
    const withVideo = {
      ...emptyComposition(),
      video: { url: 'blob:runtime-main', durationSec: 4 },
      shots: [{ id: 'main', srcStart: 0, srcEnd: 4, treatment: 'full' as const }],
    };
    const session = createLiveProjectDocumentSession('project-1', withVideo, { videoSig: 'main.mp4:42:7' });
    const snapshot = session.state.document;
    expect(Object.values(snapshot.assets)[0]!.locator).toEqual({ localSig: 'main.mp4:42:7' });
    applyCompositionToLiveProject(session, { ...withVideo, width: 720 }, { videoSig: 'main.mp4:42:7' });
    applyDocumentToLiveProject(session, snapshot);
    expect(session.state.composition.video?.url).toBe('blob:runtime-main');
    expect(JSON.stringify(snapshot)).not.toContain('blob:runtime-main');
  });

  it('restores a graphics-only V2 snapshot without requiring a main video', () => {
    const session = createLiveProjectDocumentSession('project-1', {
      ...emptyComposition(),
      blocks: [{ id: 'title', templateId: 'custom', slots: {}, startSec: 1, durationSec: 2, trackIndex: 1 }],
    });
    const snapshot = session.state.document;
    applyCompositionToLiveProject(session, { ...session.state.composition, blocks: [] });
    applyDocumentToLiveProject(session, snapshot);
    expect(session.state.composition.blocks).toHaveLength(1);
    expect(session.state.composition.video).toBeNull();
  });

  it('derives a caption-stripped save document without mutating live state', () => {
    const session = createLiveProjectDocumentSession('project-1', {
      ...emptyComposition(),
      blocks: [{ id: 'title', templateId: 'custom', slots: {}, startSec: 1, durationSec: 2, trackIndex: 1 }],
    });
    const before = session.state.document;
    const saved = documentFromLiveComposition(session, { ...session.state.composition, blocks: [] });
    expect(saved.timeline.tracks.flatMap((track) => track.clips)).toEqual([]);
    expect(session.state.document).toBe(before);
  });

  it('applies native V2 commands and preserves runtime media resolution', () => {
    const session = createLiveProjectDocumentSession('project-1', {
      ...emptyComposition(),
      video: { url: 'blob:runtime-main', durationSec: 4 },
      shots: [{ id: 'main', srcStart: 0, srcEnd: 4, treatment: 'full' as const }],
    }, { videoSig: 'main.mp4:42:7' });
    const result = applyCommandToLiveProject(session, {
      type: 'track.insert',
      track: { id: 'track_broll', type: 'visual', role: 'broll' },
    });
    expect(result.ok).toBe(true);
    expect(session.state.document.timeline.tracks.map((track) => track.id)).toContain('track_broll');
    expect(session.state.composition.video?.url).toBe('blob:runtime-main');
    applyCompositionToLiveProject(session, { ...session.state.composition, width: 720 }, { videoSig: 'main.mp4:42:7' });
    expect(session.state.document.timeline.tracks.map((track) => track.id)).toContain('track_broll');
  });

  it('does not publish a failed V2 command', () => {
    const session = createLiveProjectDocumentSession('project-1', emptyComposition());
    const before = session.state;
    const result = applyCommandToLiveProject(session, {
      type: 'track.remove',
      trackId: session.state.document.semantics.primaryNarrativeTrackId,
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'primary-track-required' } });
    expect(session.state).toBe(before);
  });
});
