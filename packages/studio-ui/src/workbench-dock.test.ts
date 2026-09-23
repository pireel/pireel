import { describe, expect, it } from 'vitest';
import { fitColumnWidths, parseColumnWidths, resizeColumnWidths } from './workbench-dock';

describe('three-column workbench sizing', () => {
  it('starts with independent editor and tools widths and ignores obsolete lock preferences', () => {
    expect(parseColumnWidths(null)).toEqual({ left: 320, right: 280 });
    expect(parseColumnWidths('{"lockedTabs":["assets","chat"]}')).toEqual({ left: 320, right: 280 });
    expect(parseColumnWidths('broken')).toEqual({ left: 320, right: 280 });
    expect(parseColumnWidths('{"left":20,"right":1000}')).toEqual({ left: 220, right: 786 });
  });

  it('preserves preferred widths on wide screens and fits both panels on narrow screens', () => {
    expect(fitColumnWidths({ left: 320, right: 280 }, 1000)).toEqual({ left: 320, right: 280 });
    const narrow = fitColumnWidths({ left: 500, right: 280 }, 520);
    expect(narrow).toEqual({ left: 300, right: 220 });
    expect(fitColumnWidths({ left: 320, right: 280 }, 360)).toEqual({ left: 180, right: 180 });
  });

  it('resizes from actual widths without letting flex compression cancel the drag', () => {
    const fitted = fitColumnWidths({ left: 320, right: 280 }, 580);
    const enlarged = resizeColumnWidths(fitted, 'left', fitted.left + 30, 580);
    expect(enlarged.left).toBeCloseTo(fitted.left + 30);
    expect(enlarged.left + enlarged.right).toBeCloseTo(580);
    expect(enlarged.right).toBeGreaterThanOrEqual(220);
    expect(resizeColumnWidths(enlarged, 'right', 1000, 580)).toEqual({ left: 220, right: 360 });
    expect(resizeColumnWidths(enlarged, 'left', 10, 580).left).toBe(220);
  });

  it('returns the unused space to preview when a sidebar is hidden', () => {
    expect(fitColumnWidths({ left: 320, right: 0 }, 500)).toEqual({ left: 320, right: 0 });
    expect(fitColumnWidths({ left: 0, right: 280 }, 500)).toEqual({ left: 0, right: 280 });
    expect(resizeColumnWidths({ left: 320, right: 0 }, 'left', 420, 500)).toEqual({ left: 420, right: 0 });
    expect(fitColumnWidths({ left: 320, right: 280 }, 0)).toEqual({ left: 0, right: 0 });
  });
});
