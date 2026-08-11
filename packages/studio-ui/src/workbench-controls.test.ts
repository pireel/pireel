/** @vitest-environment jsdom */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExportOptRow } from './workbench-controls';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<{ root: ReturnType<typeof createRoot>; host: HTMLDivElement }> = [];

afterEach(() => {
  for (const item of mounted.splice(0)) {
    act(() => item.root.unmount());
    item.host.remove();
  }
});

describe('ExportOptRow', () => {
  it('keeps every option reachable by wrapping the chip group on narrow dialogs', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    mounted.push({ root, host });
    const onPick = vi.fn();

    act(() => {
      root.render(createElement(ExportOptRow, {
        label: '分辨率',
        value: 1080,
        options: [[2160, '4K'], [1440, '2K'], [1080, '1080p'], [720, '720p'], [540, '540p']],
        onPick,
      }));
    });

    const chipGroup = host.firstElementChild?.querySelector('div');
    expect(chipGroup?.className).toContain('flex-wrap');
    const buttons = [...host.querySelectorAll('button')];
    expect(buttons.map((button) => button.textContent)).toEqual(['4K', '2K', '1080p', '720p', '540p']);
    act(() => buttons.at(-1)?.click());
    expect(onPick).toHaveBeenCalledWith(540);
  });
});
