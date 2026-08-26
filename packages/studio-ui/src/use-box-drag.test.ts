import { describe, expect, it } from 'vitest';
import { customBlock, mediaBlock, titleBlock } from '@pireel/studio-engine/composition';
import { scalesProportionallyOnCanvas, snapCanvasRotation, visualCornerScaleFactor } from './use-box-drag';

describe('canvas block transform interaction', () => {
  it('keeps visual media and Motion components proportional while ordinary titles can reflow', () => {
    expect(scalesProportionallyOnCanvas(mediaBlock({ startSec: 0, durationSec: 2 }))).toBe(true);
    expect(scalesProportionallyOnCanvas(titleBlock({ text: '普通标题', startSec: 0, durationSec: 2 }))).toBe(false);
    expect(scalesProportionallyOnCanvas(customBlock({ innerHtml: '', timelineBody: '', startSec: 0, durationSec: 2 }))).toBe(true);
  });

  it('magnetizes cardinal angles and uses 15-degree steps while Shift is held', () => {
    expect(snapCanvasRotation(2.8, false)).toBe(0);
    expect(snapCanvasRotation(87.2, false)).toBe(90);
    expect(snapCanvasRotation(84, false)).toBe(84);
    expect(snapCanvasRotation(37, true)).toBe(30);
  });

  it('lets either pointer axis contribute to proportional media scaling', () => {
    expect(visualCornerScaleFactor({ w: 0.5, h: 0.2 }, 0.1, 0, 1, 1)).toBeCloseTo(Math.sqrt(1.2), 6);
    expect(visualCornerScaleFactor({ w: 0.5, h: 0.2 }, 0, 0.08, 1, 1)).toBeCloseTo(Math.sqrt(1.4), 6);
  });
});
