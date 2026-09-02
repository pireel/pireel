import { describe, expect, it } from 'vitest';
import {
  assembleHtml,
  editorDocumentRenderPlan,
  emptyComposition,
  emptyEditorDocumentV2,
  type SupplementalVisualMediaClip,
} from '@pireel/studio-engine/composition';
import {
  supplementalVisualAudioMixSegments,
  supplementalVisualAudioSpecs,
  supplementalVisualFileBindings,
  supplementalVisualMedia,
} from './visual-render-plan';

describe('supplemental visual render plan', () => {
  it('bridges local files to the exact native preview video nodes', () => {
    const primaryFile = { name: 'primary.mp4' };
    const insertedFile = { name: 'inserted.mp4' };
    const visual = (
      clipId: string,
      kind: SupplementalVisualMediaClip['kind'],
      source: string,
    ): SupplementalVisualMediaClip => ({
      clipId,
      trackId: 'visual-track',
      stackOrder: 1,
      kind,
      source,
      startSec: 0,
      endSec: 1,
      sourceInSec: 0,
      sourceOutSec: 1,
      fit: 'contain',
      muted: true,
    });
    const visuals = [
      visual('detached-primary', 'video', 'blob:primary'),
      visual('inserted-local', 'video', 'blob:inserted'),
      visual('remote', 'video', 'https://cdn.test/remote.mp4'),
      visual('still', 'image', 'blob:still'),
    ];

    expect(supplementalVisualFileBindings(
      visuals,
      ['blob:primary', undefined],
      primaryFile,
      new Map([['blob:inserted', insertedFile], ['blob:still', { name: 'still.jpg' }]]),
    )).toEqual([
      { id: 'hf-visual-detached-primary', file: primaryFile },
      { id: 'hf-visual-inserted-local', file: insertedFile },
    ]);
  });

  it('keeps native overlap/order and applies hidden/enabled/source gates', () => {
    const document = emptyEditorDocumentV2({ fps: 30 });
    document.assets.broll = { id: 'broll', kind: 'video', locator: { remoteUrl: 'https://cdn.test/b.mp4' }, metadata: { durationSec: 4 } };
    document.timeline.tracks.push({
      id: 'broll-track', type: 'graphics', role: 'graphics', muted: true, hidden: false, locked: false,
      syncLocked: false, stackOrder: 3, clips: [
        {
          id: 'label', kind: 'graphic', startFrame: 0, durationFrames: 30, enabled: true,
          anchor: { type: 'timeline' }, block: { templateId: 'custom', slots: {} },
        },
        {
          id: 'on', kind: 'media', assetId: 'broll', startFrame: 60, durationFrames: 90, enabled: true,
          sourceInSec: 1, sourceOutSec: 4, fit: 'cover', box: { x: 0.1, y: 0.2, w: 0.6, h: 0.5 },
          mediaFraming: {
            transform: { scale: 0.8, offsetX: 0.1, offsetY: -0.05 },
            crop: { top: 0, right: 0.2, bottom: 0, left: 0.1 },
            rounding: 10,
          },
          video: {
            treatment: 'full', filter: { brightness: 1.1 }, volumeDb: -6,
            audioFadeInSec: 0.5, audioFadeOutSec: 0.7,
          },
        },
        { id: 'off', kind: 'media', assetId: 'broll', startFrame: 180, durationFrames: 30, enabled: false, sourceInSec: 0, sourceOutSec: 1 },
      ],
    });
    document.timeline.tracks.push({
      id: 'hidden-track', type: 'visual', role: 'broll', muted: false, hidden: true, locked: false,
      syncLocked: false, stackOrder: 4, clips: [
        { id: 'hidden', kind: 'media', assetId: 'broll', startFrame: 0, durationFrames: 30, enabled: true, sourceInSec: 0, sourceOutSec: 1 },
      ],
    });
    const plan = editorDocumentRenderPlan(document, { resolveAssetUrl: (asset) => asset.locator.remoteUrl });
    const visuals = supplementalVisualMedia(plan);
    expect(visuals).toEqual([{
      clipId: 'on', trackId: 'broll-track', stackOrder: 3, kind: 'video', source: 'https://cdn.test/b.mp4',
      startSec: 2, endSec: 5, sourceInSec: 1, sourceOutSec: 4, fit: 'cover', muted: true,
      box: { x: 0.1, y: 0.2, w: 0.6, h: 0.5 },
      mediaFraming: {
        transform: { scale: 0.8, offsetX: 0.1, offsetY: -0.05 },
        crop: { top: 0, right: 0.2, bottom: 0, left: 0.1 },
        rounding: 10,
      },
      filter: { brightness: 1.1 }, volumeDb: -6, audioFadeInSec: 0.5, audioFadeOutSec: 0.7,
    }]);
    const html = assembleHtml(emptyComposition(), undefined, [], visuals);
    expect(html).toContain('data-hf-visual-clip="on"');
    expect(html).toContain('data-hf-timeline-media="1"');
    expect(html).toContain('window.__parentClock = true;');
    expect(html).toContain('data-source-in="1" data-source-out="4" data-source-rate="1"');
    expect(html).toContain('playsinline muted style=');
    expect(html).toContain('object-fit:cover');
    expect(html).toContain('left:10%;top:20%;width:60%;height:50%');
    expect(html).toContain('transform:translate(10%,-5%) scale(0.8)');
    expect(html).toContain('clip-path:inset(0% 20% 0% 10%)');
    expect(html).toContain('filter:brightness(1.1)');
  });

  it('routes ordinary video-lane sound through the parent engine with trim and mute semantics', () => {
    const visual: SupplementalVisualMediaClip = {
      clipId: 'detached', trackId: 'visual-track', stackOrder: 2, kind: 'video', source: 'blob:video',
      startSec: 4, endSec: 6, sourceInSec: 1, sourceOutSec: 5, fit: 'contain', muted: false,
      volumeDb: -6, audioFadeInSec: 1, audioFadeOutSec: 0.5,
    };
    const [spec] = supplementalVisualAudioSpecs([visual]);
    expect(spec).toMatchObject({ id: 'visual-audio:detached', url: 'blob:video', speed: 2 });
    expect(spec!.srcTimeAt(3.99)).toBeNull();
    expect(spec!.srcTimeAt(4.5)).toBe(2);
    expect(spec!.srcTimeAt(6)).toBeNull();
    expect(spec!.gainAt(4)).toBe(0);
    expect(spec!.gainAt(4.5)).toBeCloseTo(0.2506, 4);
    expect(spec!.gainAt(5)).toBeCloseTo(0.5012, 4);
    expect(spec!.gainAt(5.75)).toBeCloseTo(0.2506, 4);
    const [exportSegment] = supplementalVisualAudioMixSegments([visual]);
    expect(exportSegment).toMatchObject({
      clipId: 'detached', sourceInSec: 1, sourceOutSec: 5,
      timelineStart: 4, timelineEnd: 6, gain: expect.closeTo(0.5012, 4),
    });
    expect(exportSegment!.fadeAt?.(0.5)).toBeCloseTo(0.5, 4);
    expect(exportSegment!.fadeAt?.(1.75)).toBeCloseTo(0.5, 4);
    expect(supplementalVisualAudioSpecs([{ ...visual, muted: true }])[0]!.gainAt(4.5)).toBe(0);
    expect(supplementalVisualAudioSpecs([{ ...visual, kind: 'image' }])).toEqual([]);
  });

  it('renders resolved images as timed native layers without video clock metadata', () => {
    const document = emptyEditorDocumentV2({ fps: 24 });
    document.assets.still = { id: 'still', kind: 'image', locator: { remoteUrl: 'https://cdn.test/still.jpg' }, metadata: {} };
    document.timeline.tracks.push({
      id: 'still-track', type: 'visual', role: 'broll', muted: false, hidden: false, locked: false,
      syncLocked: false, stackOrder: 8, clips: [
        { id: 'still-clip', kind: 'media', assetId: 'still', startFrame: 12, durationFrames: 48, enabled: true, sourceInSec: 0, sourceOutSec: 2 },
      ],
    });

    const plan = editorDocumentRenderPlan(document, { resolveAssetUrl: (asset) => asset.locator.remoteUrl });
    const visuals = supplementalVisualMedia(plan);
    expect(visuals).toEqual([{
      clipId: 'still-clip', trackId: 'still-track', stackOrder: 8, kind: 'image', source: 'https://cdn.test/still.jpg',
      startSec: 0.5, endSec: 2.5, sourceInSec: 0, sourceOutSec: 2, fit: 'contain', muted: false,
    }]);

    const html = assembleHtml(emptyComposition(), undefined, [], visuals);
    expect(html).toContain('<img class="comp hf-native-visual"');
    expect(html).toContain('data-start="0.5" data-duration="2"');
    expect(html).not.toContain('data-hf-timeline-media="1"');
    expect(html).not.toContain('window.__parentClock = true;');
  });
});
