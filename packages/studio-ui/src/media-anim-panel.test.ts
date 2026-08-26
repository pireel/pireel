/** @vitest-environment jsdom */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MediaAnimPanel } from './media-anim-panel';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<{ root: ReturnType<typeof createRoot>; host: HTMLDivElement }> = [];

afterEach(() => {
  for (const item of mounted.splice(0)) {
    act(() => item.root.unmount());
    item.host.remove();
  }
});

describe('MediaAnimPanel', () => {
  it('keeps the selected media block alive while an animation option is clicked', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    mounted.push({ root, host });
    const onChange = vi.fn();

    act(() => {
      root.render(createElement(MediaAnimPanel, { anim: {}, onChange }));
    });

    let selectionCleared = false;
    const clearOnOutsideMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-block-selection-keep]')) return;
      selectionCleared = true;
    };
    document.addEventListener('mousedown', clearOnOutsideMouseDown);
    try {
      const slide = host.querySelectorAll<HTMLButtonElement>('button').item(2);
      expect(slide).not.toBeNull();
      act(() => slide?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
      expect(selectionCleared).toBe(false);
      act(() => slide?.click());
      expect(onChange).toHaveBeenCalledWith({ enter: 'slide' });
    } finally {
      document.removeEventListener('mousedown', clearOnOutsideMouseDown);
    }
  });
});
