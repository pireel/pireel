import { describe, expect, it } from 'vitest';
import { videoFrameTimelineBody, zoomMoves, zoomScaleAt, type ShotZoom, type VideoShot } from './composition-core';

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

  it('clamps the magnification and ignores a zoom on an empty span', () => {
    expect(zoomScaleAt({ preset: 'instant', atSec: 0, scale: 40 }, 1, 5)).toBe(4);
    expect(zoomMoves({ preset: 'punch', atSec: 0, scale: 1.3 }, 0)).toEqual([]);
  });
});
