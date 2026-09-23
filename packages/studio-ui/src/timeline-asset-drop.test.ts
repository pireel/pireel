import { describe, expect, it } from 'vitest';
import { brollTargetForRange } from './timeline-asset-drop';

const doc = (tracks: Parameters<typeof brollTargetForRange>[0]['timeline']['tracks']) => ({ canvas: { fps: 30 }, semantics: { primaryNarrativeTrackId: 'main' }, timeline: { tracks } });

describe('brollTargetForRange', () => {
  it('reuses the lowest B-roll lane that is free over the range', () => {
    const target = brollTargetForRange(doc([
      { id: 'main', type: 'visual', role: 'primary', stackOrder: 0, clips: [] },
      { id: 'b2', type: 'visual', role: 'broll', stackOrder: 2, clips: [] },
      { id: 'b1', type: 'visual', role: 'broll', stackOrder: 1, clips: [{ startFrame: 30, durationFrames: 60 }] },
    ]), 3, 4);
    expect(target).toEqual({ kind: 'visual', trackId: 'b1' });
  });
  it('opens a lane just above the spine when every B-roll lane is busy', () => {
    const target = brollTargetForRange(doc([
      { id: 'main', type: 'visual', role: 'primary', stackOrder: 0, clips: [] },
      { id: 'b1', type: 'visual', role: 'broll', stackOrder: 1, clips: [{ startFrame: 0, durationFrames: 300 }] },
      { id: 'cap', type: 'caption', stackOrder: 5, clips: [] },
    ]), 2, 3);
    expect(target).toEqual({ kind: 'visual-new', stackOrder: 0.5, slot: 0 });
  });
});
