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
      globalAlpha: 1,
      save: () => calls.push(['save']),
      restore: () => calls.push(['restore']),
      beginPath: () => calls.push(['begin']),
      rect: (...args: unknown[]) => calls.push(['rect', ...args]),
      clip: () => calls.push(['clip']),
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

  it('interpolates visual box/opacity keyframes and clips drawing to the resolved region', () => {
    const calls: unknown[][] = [];
    const ctx = {
      globalAlpha: 1,
      save: () => calls.push(['save']), restore: () => calls.push(['restore']),
      beginPath: () => calls.push(['begin']), rect: (...args: unknown[]) => calls.push(['rect', ...args]), clip: () => calls.push(['clip']),
      setTransform: (...args: unknown[]) => calls.push(['transform', ...args]),
      drawImage: (...args: unknown[]) => calls.push(['image', ...args.slice(1)]),
    } as unknown as CanvasRenderingContext2D;
    const moving = {
      ...visual('moving', 'image', 10, 14, 'cover'),
      box: { x: 0, y: 0, w: 0.5, h: 1 },
      opacity: 0.4,
      keyframes: {
        box: [{ atSec: 2, x: 0.5, y: 0, w: 0.5, h: 1 }],
        opacity: [{ atSec: 2, value: 1 }],
      },
    };
    drawSupplementalVisualMedia({
      ctx, visuals: [moving], timelineTime: 11,
      imageBitmaps: new Map([['moving', { width: 100, height: 100 } as ImageBitmap]]), videoSamples: new Map(),
      targetWidth: 200, targetHeight: 100, scaleX: 1, scaleY: 1,
    });
    expect(calls).toContainEqual(['rect', 50, 0, 100, 100]);
    expect(calls).toContainEqual(['image', 50, 0, 100, 100]);
    expect((ctx as unknown as { globalAlpha: number }).globalAlpha).toBeCloseTo(0.7);
  });

  it('applies the same atomic transform/crop/rounding geometry during export', () => {
    const calls: unknown[][] = [];
    const ctx = {
      globalAlpha: 1,
      save: () => calls.push(['save']), restore: () => calls.push(['restore']),
      beginPath: () => calls.push(['begin']), clip: () => calls.push(['clip']),
      rect: (...args: unknown[]) => calls.push(['rect', ...args]),
      roundRect: (...args: unknown[]) => calls.push(['roundRect', ...args]),
      setTransform: (...args: unknown[]) => calls.push(['setTransform', ...args]),
      translate: (...args: unknown[]) => calls.push(['translate', ...args]),
      scale: (...args: unknown[]) => calls.push(['scale', ...args]),
      drawImage: (...args: unknown[]) => calls.push(['image', ...args.slice(1)]),
    } as unknown as CanvasRenderingContext2D;
    const framed = {
      ...visual('framed', 'image', 0, 3, 'cover'),
      mediaFraming: {
        transform: { scale: 0.5, offsetX: 0.25, offsetY: -0.1 },
        crop: { top: 0.1, right: 0.2, bottom: 0, left: 0.05 },
        rounding: 12,
      },
    };
    drawSupplementalVisualMedia({
      ctx, visuals: [framed], timelineTime: 1,
      imageBitmaps: new Map([['framed', { width: 100, height: 100 } as ImageBitmap]]),
      videoSamples: new Map(), targetWidth: 100, targetHeight: 100, scaleX: 1, scaleY: 1,
    });
    expect(calls).toContainEqual(['translate', 75, 40]);
    expect(calls).toContainEqual(['scale', 0.5, 0.5]);
    expect(calls).toContainEqual(['translate', -50, -50]);
    expect(calls).toContainEqual(['roundRect', 5, 10, 75, 90, 12]);
  });
});
