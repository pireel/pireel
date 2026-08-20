import { describe, expect, it } from 'vitest';
import type { Composition } from './composition';
import { emptyEditorDocumentV2 } from './editor-document';
import { applyCompositionLayout, canvasSizeFollowingFirstVideo, canvasSizeFromInput, validateComposition } from './editing-primitives';

const comp = (): Composition => ({
  width: 1920,
  height: 1080,
  theme: 'general',
  video: null,
  blocks: [
    { id: 'b1', templateId: 'custom', slots: {}, startSec: 0, durationSec: 3, trackIndex: 1, box: { x: 0.1, y: 0.1, w: 0.3, h: 0.2 } },
    { id: 'b2', templateId: 'custom', slots: {}, startSec: 0, durationSec: 3, trackIndex: 2, box: { x: 0.5, y: 0.1, w: 0.3, h: 0.2 } },
  ],
  shots: [{ id: 's1', srcStart: 0, srcEnd: 5, treatment: 'full' }],
});

describe('canvasSizeFromInput', () => {
  it('supports product aliases and codec-safe custom sizes', () => {
    expect(canvasSizeFromInput({ preset: '9:16' })).toEqual({ width: 1080, height: 1920 });
    expect(canvasSizeFromInput({ width: 1001, height: 777 })).toEqual({ width: 1002, height: 778 });
    expect(canvasSizeFromInput({ width: 100, height: 777 })).toBeNull();
  });

  it('follows the first placed primary video and leaves later mixed ratios irrelevant', () => {
    const document = emptyEditorDocumentV2({ width: 1920, height: 1080, fps: 30 });
    document.assets.first = { id: 'first', kind: 'video', locator: { localSig: 'first' }, metadata: { width: 960, height: 1280 } };
    document.assets.later = { id: 'later', kind: 'video', locator: { localSig: 'later' }, metadata: { width: 1920, height: 1080 } };
    const primary = document.timeline.tracks.find((track) => track.id === document.semantics.primaryNarrativeTrackId)!;
    primary.clips.push({
      id: 'first-clip', kind: 'narrative', assetId: 'first', startFrame: 0, durationFrames: 90,
      enabled: true, sourceInSec: 0, sourceOutSec: 3, properties: { treatment: 'full' },
    });
    document.timeline.tracks.push({
      id: 'broll', type: 'visual', role: 'broll', name: 'B-roll', muted: false, hidden: false,
      locked: false, syncLocked: true, stackOrder: 1,
      clips: [{ id: 'later-clip', kind: 'media', assetId: 'later', startFrame: 0, durationFrames: 90, enabled: true, sourceInSec: 0, sourceOutSec: 3 }],
    });

    expect(canvasSizeFollowingFirstVideo(document)).toEqual({ width: 1080, height: 1440 });
  });
});

describe('applyCompositionLayout', () => {
  it('applies one normalized split transaction to video and blocks without mutating input', () => {
    const before = comp();
    const result = applyCompositionLayout(before, { layout: 'split-left-right', blockIds: ['b1', 'b2'], shotId: 's1', videoPosition: 'left' });
    expect('error' in result).toBe(false);
    if ('error' in result) return;
    expect(result.comp.shots![0]!.treatment).toBe('split-l');
    expect(result.comp.blocks[0]!.box).not.toEqual(before.blocks[0]!.box);
    expect(result.comp.blocks.every((b) => b.box && b.box.x >= 0 && b.box.x + b.box.w <= 1)).toBe(true);
    expect(before.shots![0]!.treatment).toBe('full');
  });

  it('rejects unknown stable ids as a whole', () => {
    expect(applyCompositionLayout(comp(), { layout: 'grid', blockIds: ['missing'] })).toEqual({ error: 'block not found: missing' });
  });
});

describe('validateComposition', () => {
  it('catches duplicate ids and renderer-invalid precise framing', () => {
    const value = comp();
    value.blocks.push({ ...value.blocks[0]! });
    value.shots![0] = { ...value.shots![0]!, treatment: 'split-l', preciseFraming: { scale: 2, anchorX: 0.5, anchorY: 0.5 } };
    const issues = validateComposition(value);
    expect(issues.some((x) => x.message.includes('duplicate id'))).toBe(true);
    expect(issues.some((x) => x.path.includes('preciseFraming'))).toBe(true);
  });
});
