/** @vitest-environment jsdom */

import { act, createElement, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { IntlProvider } from 'use-intl/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STUDIO_AUTO_SKILL_ID } from '@pireel/studio-engine/scenario-skills';
import { Composer, type ComposerHandle } from './chat-composer';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<{ root: ReturnType<typeof createRoot>; host: HTMLDivElement }> = [];

afterEach(() => {
  vi.useRealTimers();
  for (const item of mounted.splice(0)) {
    act(() => item.root.unmount());
    item.host.remove();
  }
});

function renderComposer() {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const methodsRef = createRef<ComposerHandle>();
  const onSubmit = vi.fn();
  mounted.push({ root, host });
  act(() => {
    root.render(createElement(IntlProvider, { locale: 'zh', messages: {}, children: createElement(Composer, {
      placeholder: '输入',
      status: 'ready',
      elements: [],
      skillId: STUDIO_AUTO_SKILL_ID,
      scenarioSkills: [],
      onPickSkill: () => undefined,
      frame: null,
      frames: [],
      onPickFrame: () => undefined,
      onRemoveFrame: () => undefined,
      timelineFramePickActive: false,
      timelineFramePickBusy: false,
      timelineFramePickAvailable: true,
      onTimelineFramePickActiveChange: () => undefined,
      onSubmit,
      onStop: () => undefined,
      methodsRef,
    }) }));
  });
  return { host, methodsRef, onSubmit };
}

describe('Composer timeline-frame tags', () => {
  it('uses one compact tag system and lets both element and frame tags be removed', () => {
    const { host, methodsRef } = renderComposer();
    act(() => methodsRef.current!.insertElementPill({
      id: 'title-a',
      label: '主标题',
      kind: 'title',
      isShot: false,
    }));
    act(() => methodsRef.current!.beginTimelineFrameCapture({ id: 'frame-a', atSec: 1, fps: 30 }));

    const elementTag = host.querySelector<HTMLElement>('[data-ref-id="title-a"]')!;
    const frameTag = host.querySelector<HTMLElement>('[data-timeline-frame-id="frame-a"]')!;
    expect(elementTag.classList).toContain('sc-pill');
    expect(frameTag.classList).toContain('sc-pill');
    expect(elementTag.classList).toContain('h-6');
    expect(frameTag.classList).toContain('h-6');
    expect(elementTag.querySelector('button[aria-label]')).not.toBeNull();
    expect(frameTag.querySelector('button[aria-label]')).not.toBeNull();

    act(() => elementTag.querySelector<HTMLButtonElement>('button[aria-label]')!.click());
    expect(host.querySelector('[data-ref-id="title-a"]')).toBeNull();
    expect(host.querySelector('[data-timeline-frame-id="frame-a"]')).not.toBeNull();

    act(() => frameTag.querySelector<HTMLButtonElement>('button[aria-label]')!.click());
    expect(host.querySelector('[data-timeline-frame-id="frame-a"]')).toBeNull();
  });

  it('inserts at the saved caret, resolves loading in place, and keeps multiple picks', () => {
    const { host, methodsRef } = renderComposer();
    const editor = host.querySelector<HTMLElement>('[contenteditable="true"]')!;
    act(() => {
      editor.textContent = '前后';
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    });
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(editor.firstChild!, 1);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    act(() => editor.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));

    act(() => methodsRef.current!.beginTimelineFrameCapture({ id: 'frame-a', atSec: 1, fps: 30 }));
    const first = editor.querySelector<HTMLElement>('[data-timeline-frame-id="frame-a"]')!;
    expect(first.dataset.timelineFrameState).toBe('loading');
    expect(first.previousSibling?.textContent).toBe('前');
    expect(first.querySelector('.animate-spin')).not.toBeNull();

    act(() => methodsRef.current!.resolveTimelineFrameCapture({
      id: 'frame-a', atSec: 1, fps: 30, dataUrl: 'data:image/jpeg;base64,QQ==', width: 160, height: 90,
    }));
    expect(first.dataset.timelineFrameState).toBe('ready');
    expect(first.querySelector('img')?.getAttribute('src')).toBe('data:image/jpeg;base64,QQ==');

    act(() => methodsRef.current!.beginTimelineFrameCapture({ id: 'frame-b', atSec: 2, fps: 30 }));
    act(() => methodsRef.current!.resolveTimelineFrameCapture({
      id: 'frame-b', atSec: 2, fps: 30, dataUrl: 'data:image/jpeg;base64,Qg==', width: 90, height: 160,
    }));
    expect(editor.querySelectorAll('[data-timeline-frame-id]')).toHaveLength(2);
    expect(editor.querySelector('[data-timeline-frame-id="frame-a"]')).toBe(first);
  });

  it('serializes text and multiple frames in their visible DOM order', () => {
    const { host, methodsRef, onSubmit } = renderComposer();
    const editor = host.querySelector<HTMLElement>('[contenteditable="true"]')!;
    act(() => {
      editor.textContent = '前后';
      editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
    });
    const selection = window.getSelection()!;
    const range = document.createRange();
    range.setStart(editor.firstChild!, 1);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    act(() => editor.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));
    const frame = { id: 'frame-a', atSec: 1, fps: 30, dataUrl: 'data:image/jpeg;base64,QQ==', width: 160, height: 90 };
    act(() => methodsRef.current!.beginTimelineFrameCapture(frame));
    act(() => methodsRef.current!.resolveTimelineFrameCapture(frame));

    act(() => editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));

    expect(onSubmit).toHaveBeenCalledWith([
      { type: 'text', text: '前' },
      { type: 'timeline-frame', frame },
      { type: 'text', text: ' 后' },
    ]);
  });

  it('shows the captured image from a ready tag on hover', () => {
    vi.useFakeTimers();
    const { host, methodsRef } = renderComposer();
    const frame = { id: 'frame-hover', atSec: 1, fps: 30, dataUrl: 'data:image/jpeg;base64,QQ==', width: 160, height: 90 };
    act(() => methodsRef.current!.beginTimelineFrameCapture(frame));
    act(() => methodsRef.current!.resolveTimelineFrameCapture(frame));
    const tag = host.querySelector<HTMLElement>('[data-timeline-frame-id="frame-hover"]')!;

    act(() => {
      tag.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
      vi.advanceTimersByTime(300);
    });

    const preview = document.body.querySelector<HTMLDivElement>('.fixed.z-\\[1000\\]');
    expect(preview?.style.display).toBe('block');
    expect(preview?.querySelector('img')?.getAttribute('src')).toBe(frame.dataUrl);
  });
});
