// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { emptyComposition, type Block } from '@pireel/studio-engine/composition';
import { setStudioLocale } from '@pireel/studio-ui/i18n';
import { StudioTimeline } from '@pireel/studio-ui/studio-timeline';

const block = { id: 'title', templateId: 'custom', slots: {}, startSec: 1, durationSec: 2, trackIndex: 1, label: 'Title' } as Block;

describe('timeline block trims', () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    setStudioLocale('en');
    HTMLElement.prototype.setPointerCapture = vi.fn();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('previews a trim while dragging and reports it once, on release', async () => {
    const onResizeBlock = vi.fn();
    const noop = () => {};
    await act(async () => root.render(createElement(StudioTimeline, {
      comp: { ...emptyComposition(), blocks: [block] },
      playing: false, locateSignal: 0, pps: 100, onPps: noop, snapEnabled: false,
      selectedShotIds: new Set<string>(), selectedBlockIds: new Set<string>(),
      onSeek: noop, onScrub: noop, onSelect: noop, onSelectShot: noop, onBoxSelectShots: noop, onSelectBlock: noop,
      onBoxSelectBlocks: noop, onDeselectAll: noop, onMoveBlock: noop, onResizeBlock, onReorderTracks: noop,
    })));
    const chip = () => [...host.querySelectorAll<HTMLElement>('div')].find((element) => element.style.left === '100px' && element.querySelectorAll(':scope > span.cursor-ew-resize').length === 2)!;
    expect(chip().style.width).toBe('200px');
    const rightEdge = chip().querySelectorAll(':scope > span.cursor-ew-resize')[1]!;
    await act(async () => {
      rightEdge.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 300, button: 0, buttons: 1 }));
    });
    for (const clientX of [340, 380, 420]) {
      await act(async () => { window.dispatchEvent(new PointerEvent('pointermove', { clientX, buttons: 1 })); });
    }
    // The drag flushes pointer moves once per animation frame.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(onResizeBlock).not.toHaveBeenCalled();
    expect(Number.parseFloat(chip().style.width)).toBeGreaterThan(200);
    await act(async () => { window.dispatchEvent(new PointerEvent('pointerup', { clientX: 420 })); });
    expect(onResizeBlock).toHaveBeenCalledTimes(1);
    expect(onResizeBlock.mock.calls[0]![0]).toBe('title');
    expect(onResizeBlock.mock.calls[0]![1]).toBe(1);
    expect(onResizeBlock.mock.calls[0]![2]).toBeCloseTo(3.2, 1);
  });
});
