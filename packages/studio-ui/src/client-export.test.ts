import { describe, expect, it } from 'vitest';
import { EMPTY_VIDEO_GROUND, paintExportFrameBase } from './client-export';

type Pixel = string | null;
type FakeLayer = { pixels: Pixel[] };

function fakeFrame(initial: Pixel[]) {
  const pixels = [...initial];
  const calls: string[] = [];
  let fillStyle = '';
  const ctx = {
    get fillStyle() {
      return fillStyle;
    },
    set fillStyle(value: string | CanvasGradient | CanvasPattern) {
      fillStyle = String(value);
    },
    setTransform: (...args: number[]) => calls.push(`transform:${args.join(',')}`),
    clearRect: () => {
      calls.push('clear');
      pixels.fill(null);
    },
    fillRect: () => {
      calls.push(`fill:${fillStyle}`);
      pixels.fill(fillStyle);
    },
    drawImage: (source: FakeLayer) => {
      calls.push('draw');
      source.pixels.forEach((pixel, index) => {
        // Canvas source-over: a fully transparent source pixel leaves the destination untouched.
        if (pixel !== null) pixels[index] = pixel;
      });
    },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, pixels, calls };
}

const transparent = (length: number): FakeLayer => ({ pixels: Array<Pixel>(length).fill(null) });

describe('client export frame compositing', () => {
  it('clears the previous native frame and paints a black timeline gap', () => {
    const frame = fakeFrame(['previous-video', 'previous-video']);

    paintExportFrameBase(
      frame.ctx,
      2,
      1,
      transparent(2) as unknown as CanvasImageSource,
      transparent(2) as unknown as CanvasImageSource,
    );

    expect(frame.calls).toEqual([
      'transform:1,0,0,1,0,0',
      'clear',
      `fill:${EMPTY_VIDEO_GROUND}`,
      'draw',
      'draw',
    ]);
    expect(frame.pixels).toEqual([EMPTY_VIDEO_GROUND, EMPTY_VIDEO_GROUND]);
  });

  it('does not leave a dark previous-frame backing around a transparent component card', () => {
    const frame = fakeFrame(['previous-video', 'previous-video']);
    const component = { pixels: ['card', null] } as FakeLayer;

    paintExportFrameBase(
      frame.ctx,
      2,
      1,
      transparent(2) as unknown as CanvasImageSource,
      transparent(2) as unknown as CanvasImageSource,
    );
    frame.ctx.drawImage(component as unknown as CanvasImageSource, 0, 0);

    expect(frame.pixels).toEqual(['card', EMPTY_VIDEO_GROUND]);
    expect(frame.calls.indexOf('clear')).toBeLessThan(frame.calls.lastIndexOf('draw'));
  });

  it('lets the theme background and video cover the black ground in composition order', () => {
    const frame = fakeFrame(['previous-video', 'previous-video']);
    const background = { pixels: ['theme', 'theme'] } as FakeLayer;
    const video = { pixels: [null, 'video'] } as FakeLayer;

    paintExportFrameBase(
      frame.ctx,
      2,
      1,
      background as unknown as CanvasImageSource,
      video as unknown as CanvasImageSource,
    );

    expect(frame.pixels).toEqual(['theme', 'video']);
  });
});
