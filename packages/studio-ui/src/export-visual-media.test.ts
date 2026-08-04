import { describe, expect, it } from 'vitest';
import type { SupplementalVisualMediaClip } from '@pireel/studio-engine/composition';
import { activeVisualMedia, drawSupplementalVisualMedia } from './export-visual-media';

const visual = (
  clipId: string,
  kind: 'image' | 'video',
  startSec: number,
  endSec: number,
  fit: 'contain' | 'cover',
): SupplementalVisualMediaClip => ({
  clipId,
  trackId: `track-${clipId}`,
  stackOrder: 1,
  kind,
  source: `${clipId}.media`,
  startSec,
  endSec,
  sourceInSec: 0,
  sourceOutSec: endSec - startSec,
  fit,
  muted: false,
});

describe('export visual media compositor', () => {
  it('uses half-open timeline windows', () => {
    const clips = [visual('a', 'image', 1, 2, 'contain')];
    expect(activeVisualMedia(clips, 0.999).map((clip) => clip.clipId)).toEqual([]);
    expect(activeVisualMedia(clips, 1).map((clip) => clip.clipId)).toEqual(['a']);
    expect(activeVisualMedia(clips, 2).map((clip) => clip.clipId)).toEqual([]);
  });

  it('draws image and video layers in plan order with contain/cover geometry', () => {
    const calls: unknown[][] = [];
    const ctx = {
      setTransform: (...args: unknown[]) => calls.push(['transform', ...args]),
      drawImage: (...args: unknown[]) => calls.push(['image', ...args.slice(1)]),
    } as unknown as CanvasRenderingContext2D;
    const image = { width: 200, height: 100 } as ImageBitmap;
    const videoSample = {
      draw: (_ctx: unknown, ...args: unknown[]) => calls.push(['video', ...args]),
    };

    drawSupplementalVisualMedia({
      ctx,
      visuals: [visual('still', 'image', 0, 3, 'contain'), visual('motion', 'video', 0, 3, 'cover')],
      timelineTime: 1,
      imageBitmaps: new Map([['still', image]]),
      videoSamples: new Map([['motion', {
        sourceWidth: 100,
        sourceHeight: 200,
        sample: videoSample as never,
      }]]),
      targetWidth: 100,
      targetHeight: 100,
      scaleX: 2,
      scaleY: 2,
    });

    expect(calls.filter((call) => call[0] === 'image' || call[0] === 'video')).toEqual([
      ['image', 0, 25, 100, 50],
      ['video', 0, -50, 100, 200],
    ]);
  });
});
