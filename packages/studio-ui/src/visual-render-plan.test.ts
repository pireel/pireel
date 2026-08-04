import { describe, expect, it } from 'vitest';
import { assembleHtml, editorDocumentRenderPlan, emptyComposition, emptyEditorDocumentV2 } from '@pireel/studio-engine/composition';
import { supplementalVisualMedia } from './visual-render-plan';

describe('supplemental visual render plan', () => {
  it('keeps native overlap/order and applies hidden/enabled/source gates', () => {
    const document = emptyEditorDocumentV2({ fps: 30 });
    document.assets.broll = { id: 'broll', kind: 'video', locator: { remoteUrl: 'https://cdn.test/b.mp4' }, metadata: { durationSec: 4 } };
    document.timeline.tracks.push({
      id: 'broll-track', type: 'visual', role: 'broll', muted: true, hidden: false, locked: false,
      syncLocked: false, stackOrder: 3, clips: [
        { id: 'on', kind: 'media', assetId: 'broll', startFrame: 60, durationFrames: 90, enabled: true, sourceInSec: 1, sourceOutSec: 4, fit: 'cover' },
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
    }]);
    const html = assembleHtml(emptyComposition(), undefined, [], visuals);
    expect(html).toContain('data-hf-timeline-media="1"');
    expect(html).toContain('window.__parentClock = true;');
    expect(html).toContain('data-source-in="1" data-source-out="4" data-source-rate="1"');
    expect(html).toContain('object-fit:cover');
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
