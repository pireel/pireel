import { describe, expect, it } from 'vitest';
import { assembleHtml, cutTransitions, emptyComposition, videoFrameTimelineBody, videoShotTimelineSpans, type VideoShot } from './composition';
import { editorDocumentRenderPlan, emptyEditorDocumentV2 } from './editor-document';

describe('EditorDocumentV2 render plan', () => {
  it('preserves native gaps, empty lanes and deterministic stack order', () => {
    const document = emptyEditorDocumentV2({ fps: 30 });
    document.assets.main = { id: 'main', kind: 'video', locator: { localSig: 'sig' }, metadata: { durationSec: 4 } };
    document.timeline.tracks[0]!.stackOrder = 2;
    document.timeline.tracks[0]!.clips = [{
      id: 'talk', kind: 'narrative', assetId: 'main', startFrame: 60, durationFrames: 120,
      sourceInSec: 0, sourceOutSec: 4, properties: { treatment: 'full' }, enabled: true,
    }];
    document.timeline.tracks.push({
      id: 'broll', type: 'visual', role: 'broll', muted: false, hidden: false, locked: false,
      syncLocked: false, stackOrder: 1, clips: [],
    });
    document.timeline.tracks.push({
      id: 'graphics', type: 'graphics', role: 'graphics', muted: false, hidden: false, locked: false,
      syncLocked: true, stackOrder: 3, clips: [{
        id: 'title', kind: 'graphic', startFrame: 240, durationFrames: 30, enabled: true,
        anchor: { type: 'timeline' }, block: { templateId: 'custom', slots: { innerHtml: '<b>x</b>', timelineBody: '' } },
      }],
    });

    const plan = editorDocumentRenderPlan(document, { resolveAssetUrl: (asset) => `runtime:${asset.id}` });
    expect(plan.tracks.map((track) => track.id)).toEqual(['broll', document.semantics.primaryNarrativeTrackId, 'graphics']);
    expect(plan.tracks[0]!.clips).toEqual([]);
    expect(plan.narrative[0]).toMatchObject({
      clipId: 'talk', startFrame: 60, endFrame: 180, startSec: 2, endSec: 6,
      resolvedSource: 'runtime:main',
    });
    expect(plan.durationFrames).toBe(180);
    expect(plan.durationSec).toBe(6);
    expect(plan.tracks.find((track) => track.id === 'graphics')?.clips).toEqual([]);
  });

  it('clips supporting tracks at the primary-picture boundary', () => {
    const document = emptyEditorDocumentV2({ fps: 30 });
    document.assets.main = { id: 'main', kind: 'video', locator: { localSig: 'main' }, metadata: { durationSec: 3 } };
    document.timeline.tracks[0]!.clips = [{
      id: 'picture', kind: 'narrative', assetId: 'main', startFrame: 0, durationFrames: 90,
      sourceInSec: 0, sourceOutSec: 3, properties: { treatment: 'full' }, enabled: true,
    }];
    document.timeline.tracks.push({
      id: 'captions', type: 'caption', role: 'managedCaptions', muted: false, hidden: false,
      locked: false, syncLocked: true, stackOrder: 1, clips: [{
        id: 'tail-caption', kind: 'caption', startFrame: 75, durationFrames: 45, enabled: true,
        managed: true, anchor: { type: 'timeline' }, block: { templateId: 'caption', slots: {} },
      }],
    });
    document.semantics.managedCaptionTrackId = 'captions';

    const plan = editorDocumentRenderPlan(document);
    expect(plan.durationSec).toBe(3);
    expect(plan.tracks.find((track) => track.id === 'captions')?.clips[0]).toMatchObject({
      startSec: 2.5,
      endSec: 3,
      durationSec: 0.5,
    });
  });

  it('keeps an empty primary lane valid while other tracks determine duration', () => {
    const document = emptyEditorDocumentV2({ fps: 24 });
    document.timeline.tracks.push({
      id: 'graphics', type: 'graphics', role: 'graphics', muted: false, hidden: false, locked: false,
      syncLocked: true, stackOrder: 1, clips: [{
        id: 'card', kind: 'graphic', startFrame: 24, durationFrames: 48, enabled: true,
        anchor: { type: 'timeline' }, block: { templateId: 'custom', slots: { innerHtml: '', timelineBody: '' } },
      }],
    });
    const plan = editorDocumentRenderPlan(document);
    expect(plan.narrative).toEqual([]);
    expect(plan.durationSec).toBe(3);
  });

  it('places framing at native starts and forbids transitions across a real gap', () => {
    const shots: VideoShot[] = [
      { id: 'a', srcStart: 0, srcEnd: 2, treatment: 'full' },
      { id: 'b', srcStart: 2, srcEnd: 4, treatment: 'punch-in', transIn: { prevId: 'a', effect: 'fade', durationSec: 0.5 } },
    ];
    const placements = [
      { shotId: 'a', startSec: 1, endSec: 3 },
      { shotId: 'b', startSec: 4, endSec: 6 },
    ];
    expect(videoFrameTimelineBody(shots, placements)).toMatch(/\), 4\);/);
    expect(cutTransitions(shots, placements)).toEqual([]);
    expect(cutTransitions(shots, [placements[0]!, { ...placements[1]!, startSec: 3, endSec: 5 }])).toMatchObject([{ cut: 3, shotId: 'b' }]);
  });

  it('places the primary video box independently from source framing', () => {
    const shots: VideoShot[] = [{ id: 'a', srcStart: 0, srcEnd: 2, treatment: 'punch-in' }];
    const body = videoFrameTimelineBody(shots, [{
      shotId: 'a', startSec: 0, endSec: 2, box: { x: 0.1, y: 0.2, w: 0.6, h: 0.6 },
    }]);
    expect(body.match(/tl\.set\('#vidEl'/g)).toHaveLength(2);
    expect(body).toContain("left: '10%'");
    expect(body).toContain("top: '20%'");
    expect(body).toContain("width: '60%'");
    expect(body).toContain('scale: 1.221');
  });

  it('treats an explicit placement list as authoritative instead of reviving omitted shots', () => {
    const shots: VideoShot[] = [
      { id: 'stale', srcStart: 0, srcEnd: 2, treatment: 'full' },
      { id: 'live', srcStart: 2, srcEnd: 4, treatment: 'punch-in' },
    ];
    expect(videoShotTimelineSpans(shots, [{ shotId: 'live', startSec: 5, endSec: 7 }])).toMatchObject([
      { clip: { id: 'live' }, editedStart: 5, editedEnd: 7 },
    ]);
    expect(videoShotTimelineSpans(shots, [
      { shotId: 'stale', startSec: 8, endSec: 10 },
      { shotId: 'live', startSec: 5, endSec: 7 },
    ]).map((span) => span.clip.id)).toEqual(['live', 'stale']);
    expect(videoFrameTimelineBody(shots, [])).toBe('');
    expect(assembleHtml({ ...emptyComposition(), shots }, undefined, [])).not.toContain('id="vidEl"');
  });
});
