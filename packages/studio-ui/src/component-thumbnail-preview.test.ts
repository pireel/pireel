/** @vitest-environment jsdom */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Block, Composition } from '@pireel/studio-engine/composition';
import { ElementTile, type LibraryItem } from './asset-card';
import { BlockPreviewFrame } from './block-preview-card';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<{ root: ReturnType<typeof createRoot>; host: HTMLDivElement }> = [];

afterEach(() => {
  for (const item of mounted.splice(0)) {
    act(() => item.root.unmount());
    item.host.remove();
  }
});

function mount(node: ReturnType<typeof createElement>) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  act(() => root.render(node));
  return host;
}

describe('component thumbnail previews', () => {
  it('renders a generated poster instead of mounting an iframe in the asset grid', () => {
    const item: LibraryItem = {
      id: 'kit:metric',
      kind: 'element',
      origin: 'preset',
      thumbSrc: 'official/components/v1/kit/metric-deadbeef0000.png',
      label: 'Metric',
      createdAt: 0,
      deletable: false,
    };
    const host = mount(createElement(ElementTile, { item, width: 120, height: 68 }));

    expect(host.querySelector('img')?.getAttribute('src')).toContain('metric-deadbeef0000.png');
    expect(host.querySelector('iframe')).toBeNull();
  });

  it('marks the live preview ready and starts its entrance once after iframe load', () => {
    const comp: Composition = { width: 1920, height: 1080, theme: 'general', video: null, blocks: [], shots: [] };
    const block: Block = {
      id: 'preview',
      templateId: 'custom',
      slots: { innerHtml: '<div>Preview</div>', timelineBody: '' },
      startSec: 0,
      durationSec: 4,
      trackIndex: 2,
    };
    const onReady = vi.fn();
    const host = mount(createElement(BlockPreviewFrame, { comp, block, width: 320, animate: 'manual', playOnReady: true, showLoading: true, onReady }));
    const iframe = host.querySelector('iframe')!;
    const postMessage = vi.spyOn(iframe.contentWindow!, 'postMessage');
    postMessage.mockClear();
    expect(host.querySelector('[data-preview-loading]')).not.toBeNull();

    act(() => iframe.dispatchEvent(new Event('load')));

    expect(onReady).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith({ type: 'hf-loop', on: true, once: true }, '*');
    expect(host.querySelector('[data-preview-loading]')).toBeNull();
  });
});
