/** @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest';
import type { Block } from '@pireel/studio-engine/composition';
import {
  DEFAULT_CODE_KIT_ELEMENT_BOX,
  DEFAULT_EDITABLE_ELEMENT_BOX,
  DEFAULT_KIT_ELEMENT_BOX,
  editableOverlaySafeArea,
  fitEditableBoxIntoSafeArea,
  normalizeElementForInsert,
  withEditableBlockGeometry,
} from './editable-block-geometry';

const block = (patch: Partial<Block> = {}): Block => ({
  id: 'block-1',
  templateId: 'custom',
  slots: { innerHtml: '<div class="card">Card</div>', timelineBody: '' },
  startSec: 0,
  durationSec: 3,
  trackIndex: 2,
  ...patch,
});

describe('editable block geometry', () => {
  it('repairs a boxless custom block so the canvas can render move and resize handles', () => {
    const repaired = withEditableBlockGeometry(block(), 1080, 1920);

    expect(repaired.box).toEqual(DEFAULT_EDITABLE_ELEMENT_BOX);
    expect(repaired.slots.timelineBody).toBe('');
    expect(repaired.slots.innerHtml).toContain('Card');
  });

  it('repairs a serialized zero-size box instead of treating it as editable', () => {
    const repaired = withEditableBlockGeometry(block({ box: { x: 0, y: 0, w: 0, h: 0 } }), 1080, 1920);

    expect(repaired.box).toEqual(DEFAULT_EDITABLE_ELEMENT_BOX);
  });

  it('gives generated kit blocks the same editable box as component-panel insertion', () => {
    const repaired = withEditableBlockGeometry(block({ templateId: 'kit:metricCard', slots: { props: { value: '42' } } }), 1080, 1920);

    expect(repaired.box).toEqual(DEFAULT_KIT_ELEMENT_BOX);
    expect(repaired.slots).toEqual({ props: { value: '42' } });
  });

  it('gives code blocks a taller readable viewport', () => {
    const repaired = withEditableBlockGeometry(block({ templateId: 'kit:code', slots: { props: { code: 'const ready = true;' } } }), 1080, 1920);

    expect(repaired.box).toEqual(DEFAULT_CODE_KIT_ELEMENT_BOX);
  });

  it('preserves existing geometry and intentional boxless caption/transition layers', () => {
    const boxed = block({ box: { x: 0.2, y: 0.1, w: 0.5, h: 0.3 } });
    const caption = block({ templateId: 'caption' });
    const transition = block({ templateId: 'transition' });

    expect(withEditableBlockGeometry(boxed, 1080, 1920)).toBe(boxed);
    expect(withEditableBlockGeometry(caption, 1080, 1920)).toBe(caption);
    expect(withEditableBlockGeometry(transition, 1080, 1920)).toBe(transition);
  });

  it('cleans up the offscreen measurement host when layout cannot be measured', () => {
    const before = document.body.childElementCount;
    const normalized = normalizeElementForInsert({ seedId: 'test', innerHtml: '<div>Card</div>' }, 1080, 1920);

    expect(normalized.box).toEqual(DEFAULT_EDITABLE_ELEMENT_BOX);
    expect(document.body.childElementCount).toBe(before);
  });

  it('falls back safely when a caller supplies invalid canvas dimensions', () => {
    const normalized = normalizeElementForInsert({ seedId: 'test', innerHtml: '<div>Card</div>' }, Number.NaN, 1920);

    expect(normalized.box).toEqual(DEFAULT_EDITABLE_ELEMENT_BOX);
    expect(normalized.innerHtml).toContain('Card');
  });

  it('keeps initial 9:16 picture-in-picture placement clear of device and platform chrome', () => {
    const safe = editableOverlaySafeArea(1080, 1920);
    const fitted = fitEditableBoxIntoSafeArea({ x: -0.08, y: 0, w: 0.95, h: 0.8 }, 1080, 1920);

    expect(safe).toEqual({ x: 0.07, y: 0.11, w: 0.86, h: 0.7 });
    expect(fitted.x).toBeGreaterThanOrEqual(safe.x);
    expect(fitted.y).toBeGreaterThanOrEqual(safe.y);
    expect(fitted.x + fitted.w).toBeLessThanOrEqual(safe.x + safe.w + 0.0001);
    expect(fitted.y + fitted.h).toBeLessThanOrEqual(safe.y + safe.h + 0.0001);
  });

  it('does not inset an intentional full-canvas background', () => {
    const full = { x: 0, y: 0, w: 1, h: 1 };
    expect(fitEditableBoxIntoSafeArea(full, 1080, 1920)).toBe(full);
  });

  it('measures SVG roots without producing NaN geometry', () => {
    const rect = (left: number, top: number, width: number, height: number) => ({
      left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}),
    }) as DOMRect;
    const measured = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      if (this instanceof SVGElement) return rect(120, 240, 320, 180);
      return rect(0, 0, 1080, 1920);
    });
    try {
      const normalized = normalizeElementForInsert({
        seedId: 'svg-card',
        innerHtml: '<svg width="320" height="180"><circle cx="90" cy="90" r="80" /></svg>',
      }, 1080, 1920);

      expect(Object.values(normalized.box).every(Number.isFinite)).toBe(true);
      expect(normalized.box.w).toBeGreaterThan(0);
      expect(normalized.box.h).toBeGreaterThan(0);
    } finally {
      measured.mockRestore();
    }
  });
});
