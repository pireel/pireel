/** @vitest-environment jsdom */

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ChatTimelineFramePicker,
  formatTimelineFrameTime,
  shouldCollapseChatForTimelineFramePick,
} from './chat-timeline-frame-picker';

const mounted: Array<{ root: ReturnType<typeof createRoot>; host: HTMLDivElement }> = [];

afterEach(() => {
  for (const item of mounted.splice(0)) {
    act(() => item.root.unmount());
    item.host.remove();
  }
});

function renderPicker(props: Partial<Parameters<typeof ChatTimelineFramePicker>[0]> = {}) {
  const onActiveChange = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  act(() => {
    root.render(createElement(ChatTimelineFramePicker, {
      disabled: false,
      available: true,
      active: false,
      busy: false,
      count: 0,
      onActiveChange,
      ...props,
    }));
  });
  return { host, onActiveChange };
}

describe('ChatTimelineFramePicker', () => {
  it('arms the real-timeline mode without rendering a duplicate timeline dialog', () => {
    const { host, onActiveChange } = renderPicker();
    const button = host.querySelector('button')!;

    act(() => button.click());

    expect(onActiveChange).toHaveBeenCalledWith(true);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelector('input[type="range"]')).toBeNull();
  });

  it('lets Escape leave an active pick mode', () => {
    const { host, onActiveChange } = renderPicker({ active: true });
    const button = host.querySelector('button')!;
    button.focus();
    expect(document.activeElement).toBe(button);

    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));

    expect(onActiveChange).toHaveBeenCalledWith(false);
    expect(document.activeElement).not.toBe(button);
  });
});

describe('formatTimelineFrameTime', () => {
  it('formats a frame-aligned SMPTE-like timecode', () => {
    expect(formatTimelineFrameTime(61 + 12 / 30, 30)).toBe('01:01:12');
  });
});

describe('shouldCollapseChatForTimelineFramePick', () => {
  it('gets the chat out of the way only when the real timeline would be squeezed out', () => {
    expect(shouldCollapseChatForTimelineFramePick(375, 342)).toBe(true);
    expect(shouldCollapseChatForTimelineFramePick(700, 342)).toBe(true);
    expect(shouldCollapseChatForTimelineFramePick(720, 342)).toBe(false);
    expect(shouldCollapseChatForTimelineFramePick(1280, 760)).toBe(false);
  });
});
