import { describe, expect, it } from 'vitest';
import { videoFrameTimelineBody, zoomForClipSpan, zoomMoves, zoomScaleAt, zoomStartScale, type ShotZoom, type VideoShot } from './composition-core';

/** Play the emitted timeline body against a GSAP-shaped recorder. */
function play(body: string): Array<{ m: 'set' | 'to'; vars: Record<string, unknown>; at: number }> {
  const calls: Array<{ m: 'set' | 'to'; vars: Record<string, unknown>; at: number }> = [];
  const tl = {
    set: (_sel: string, vars: Record<string, unknown>, at: number) => calls.push({ m: 'set', vars, at }),
    to: (_sel: string, vars: Record<string, unknown>, at: number) => calls.push({ m: 'to', vars, at }),
  };
  new Function('tl', body)(tl);
  return calls;
}

describe('zoom presets', () => {
  it('expands each preset into moves and evaluates the same curve', () => {
    const punch: ShotZoom = { preset: 'punch', atSec: 1, scale: 1.3 };
    expect(zoomMoves(punch, 5)).toEqual([{ at: 1, duration: 0.25, ease: 'power3.out', scale: 1.3 }]);
    expect(zoomScaleAt(punch, 0.5, 5)).toBe(1);
    expect(zoomScaleAt(punch, 1.25, 5)).toBeCloseTo(1.3, 6);
    expect(zoomScaleAt(punch, 4.9, 5)).toBeCloseTo(1.3, 6);

    const held: ShotZoom = { preset: 'punch', atSec: 1, durationSec: 2, scale: 1.3 };
    expect(zoomMoves(held, 5).map((move) => move.at)).toEqual([1, 2.75]);
    expect(zoomScaleAt(held, 3.5, 5)).toBe(1);

    const instant: ShotZoom = { preset: 'instant', atSec: 2, scale: 1.25 };
    expect(zoomScaleAt(instant, 1.99, 5)).toBe(1);
    expect(zoomScaleAt(instant, 2, 5)).toBe(1.25);

    const push: ShotZoom = { preset: 'slow-push', atSec: 0, scale: 1.2 };
    expect(zoomScaleAt(push, 2.5, 5)).toBeCloseTo(1.1, 6);
    expect(zoomScaleAt(push, 5, 5)).toBeCloseTo(1.2, 6);

    const inOut: ShotZoom = { preset: 'in-out', atSec: 0, durationSec: 2, scale: 1.2 };
    expect(zoomScaleAt(inOut, 1, 5)).toBeCloseTo(1.2, 6);
    expect(zoomScaleAt(inOut, 2, 5)).toBeCloseTo(1, 6);
    expect(zoomScaleAt(inOut, 4, 5)).toBe(1);
  });

  it('emits the push-in as tweens on the video layer in edited time and restores the framing at the clip end', () => {
    const shots: VideoShot[] = [
      { id: 'a', srcStart: 0, srcEnd: 4, treatment: 'full', zoom: { preset: 'punch', atSec: 1, scale: 1.3, anchorX: 0.5, anchorY: 0.3 } },
      { id: 'b', srcStart: 4, srcEnd: 8, treatment: 'full' },
    ];
    const calls = play(videoFrameTimelineBody(shots));
    const push = calls.find((call) => call.m === 'to' && Math.abs(call.at - 1) < 1e-6)!;
    expect(push.vars).toMatchObject({ scale: 1.3, ease: 'power3.out', duration: 0.25, xPercent: 0 });
    // anchorY 0.3: the layer shifts down so the point at 30% height stays still
    expect(push.vars.yPercent).toBeCloseTo((0.5 - 0.3) * 0.3 * 100, 3);
    const reset = calls.find((call) => call.m === 'set' && Math.abs(call.at - 4) < 1e-6)!;
    expect(reset.vars).toMatchObject({ scale: 1, xPercent: 0, yPercent: 0 });
  });

  it('a push-in ending at a hard cut leaves the next shot its own framing', () => {
    // a pushes in, then a jump cut (source 4 → 10) to a punched-in b, and c continues b's take.
    const shots: VideoShot[] = [
      { id: 'a', srcStart: 0, srcEnd: 4, treatment: 'full', zoom: { preset: 'slow-push', atSec: 0, scale: 1.15 } },
      { id: 'b', srcStart: 10, srcEnd: 14, treatment: 'punch-in' },
      { id: 'c', srcStart: 14, srcEnd: 18, treatment: 'punch-in' },
    ];
    const calls = play(videoFrameTimelineBody(shots));
    const atCut = calls.filter((call) => Math.abs(call.at - 4) < 1e-6);
    // The last write at the cut is b's framing, not a's framing restored over it.
    expect(atCut.at(-1)).toMatchObject({ m: 'set', vars: { scale: 1.221 } });
    expect(calls.some((call) => call.at > 4 && call.vars.scale === 1)).toBe(false);
  });

  it('glides the framing across a transition window instead of changing it at the cut', () => {
    const window = { id: 'tr', start: 3.7, end: 4.3, cut: 4, effect: 'circleopen' as const, dir: 'left' as const };
    const differing: VideoShot[] = [
      { id: 'a', srcStart: 0, srcEnd: 4, treatment: 'punch-in' },
      { id: 'b', srcStart: 4, srcEnd: 8, treatment: 'full' },
    ];
    const plain = play(videoFrameTimelineBody(differing)).find((call) => call.m === 'to')!;
    expect(plain.at).toBe(4);
    const glided = play(videoFrameTimelineBody(differing, undefined, [window])).find((call) => call.m === 'to')!;
    expect(glided.at).toBeCloseTo(3.7, 6);
    expect(glided.vars.duration).toBeCloseTo(0.6, 6);

    // A push-in that ends zoomed: no snap at the cut. Same framing on both sides → ease out across the window.
    const zoomed: VideoShot[] = [
      { id: 'a', srcStart: 0, srcEnd: 4, treatment: 'full', zoom: { preset: 'punch', atSec: 1, scale: 1.3 } },
      { id: 'b', srcStart: 4, srcEnd: 8, treatment: 'full' },
    ];
    const calls = play(videoFrameTimelineBody(zoomed, undefined, [window]));
    expect(calls.some((call) => call.m === 'set' && Math.abs(call.at - 4) < 1e-6)).toBe(false);
    const ease = calls.find((call) => call.m === 'to' && Math.abs(call.at - 3.7) < 1e-6)!;
    expect(ease.vars).toMatchObject({ scale: 1, xPercent: 0, yPercent: 0 });
    // Different framing on the far side: its glide alone carries the layer out of the zoom.
    const both = play(videoFrameTimelineBody([zoomed[0]!, { ...zoomed[1]!, treatment: 'punch-in' }], undefined, [window]));
    expect(both.filter((call) => Math.abs(call.at - 3.7) < 1e-6)).toHaveLength(1);
    expect(both.some((call) => call.m === 'set' && Math.abs(call.at - 4) < 1e-6)).toBe(false);
  });

  it('clamps the magnification and ignores a zoom on an empty span', () => {
    expect(zoomScaleAt({ preset: 'instant', atSec: 0, scale: 40 }, 1, 5)).toBe(4);
    expect(zoomMoves({ preset: 'punch', atSec: 0, scale: 1.3 }, 0)).toEqual([]);
  });
});

describe('a trimmed or split clip plays the zoom frames it played before', () => {
  const same = (zoom: ShotZoom, length: number, from: number, to: number) => {
    const part = zoomForClipSpan(zoom, length, from, to);
    for (let t = from; t < to; t += 0.1) expect(zoomScaleAt(part, t - from, to - from), `${zoom.preset} [${from},${to}) at ${t.toFixed(1)}`).toBeCloseTo(zoomScaleAt(zoom, t, length), 4);
  };
  const cases: ShotZoom[] = [
    { preset: 'slow-push', atSec: 1, scale: 1.15 },
    { preset: 'slow-push', atSec: 1, durationSec: 4, scale: 1.2 },
    { preset: 'instant', atSec: 2, scale: 1.25 },
    { preset: 'instant', atSec: 2, durationSec: 3, scale: 1.25 },
    { preset: 'punch', atSec: 0.5, scale: 1.25 },
  ];
  it('the head part, the tail part and a middle part all match', () => {
    for (const zoom of cases) {
      same(zoom, 10, 0, 5);
      same(zoom, 10, 5, 10);
      same(zoom, 10, 3, 7);
      same(zoom, 10, 0.2, 9.5);
    }
  });
  it('a part the move never reaches has no zoom; one after a return to the framing has none either', () => {
    expect(zoomForClipSpan({ preset: 'slow-push', atSec: 6, scale: 1.15 }, 10, 0, 5)).toBeUndefined();
    expect(zoomForClipSpan({ preset: 'instant', atSec: 1, durationSec: 2, scale: 1.25 }, 10, 5, 10)).toBeUndefined();
  });
  it('a split mid-push continues from the scale reached', () => {
    const second = zoomForClipSpan({ preset: 'slow-push', atSec: 1, scale: 1.15 }, 9, 5, 9)!;
    expect(second.atSec).toBe(0);
    expect(second.fromScale).toBeCloseTo(1 + 0.15 * 0.5, 4);
    expect(zoomStartScale(second)).toBeCloseTo(1.075, 4);
  });
});
