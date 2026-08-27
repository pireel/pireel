/** @vitest-environment jsdom */

import { act, createElement, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { IntlProvider } from 'use-intl/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STUDIO_AUTO_SKILL_ID } from '@pireel/studio-engine/scenario-skills';
import { STUDIO_CREATE_SKILL_ACTION } from '@pireel/studio-engine/skill-actions';
import { Composer, type ComposerHandle } from './chat-composer';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (typeof Range.prototype.getClientRects !== 'function') {
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => [],
  });
}

const mounted: Array<{ root: ReturnType<typeof createRoot>; host: HTMLDivElement }> = [];

afterEach(() => {
  vi.useRealTimers();
  for (const item of mounted.splice(0)) {
    act(() => item.root.unmount());
    item.host.remove();
  }
});

function renderComposer(
  elements: Parameters<typeof Composer>[0]['elements'] = [],
) {
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
      elements,
      skillId: STUDIO_AUTO_SKILL_ID,
      scenarioSkills: [],
      onPickSkill: () => undefined,
      frame: null,
      frames: [],
      onPickFrame: () => undefined,
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
  it('enters Create Skill as an editable tag and waits for manual submit', async () => {
    const { host, methodsRef, onSubmit } = renderComposer();
    const editor = host.querySelector<HTMLElement>('[contenteditable="true"]')!;

    act(() => methodsRef.current!.beginCreateSkill({
      label: '创建 Skill',
      prompt: '提炼这次对话，保留关键判断。',
    }));

    const tag = editor.querySelector<HTMLElement>('[data-studio-action="create-skill"]')!;
    expect(tag).not.toBeNull();
    expect(tag.classList).toContain('sc-pill');
    expect(editor.textContent).toContain('提炼这次对话，保留关键判断。');
    expect(onSubmit).not.toHaveBeenCalled();

    await act(async () => {
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onSubmit).toHaveBeenCalledWith(
      [{ type: 'text', text: '提炼这次对话，保留关键判断。' }],
      { studioAction: STUDIO_CREATE_SKILL_ACTION },
    );
  });

  it('keeps Create Skill active for follow-up answers until explicitly cleared', async () => {
    const { host, methodsRef, onSubmit } = renderComposer();
    onSubmit.mockResolvedValue(true);
    const editor = host.querySelector<HTMLElement>('[contenteditable="true"]')!;
    act(() => methodsRef.current!.beginCreateSkill({ label: '创建 Skill', prompt: '先生成草稿。' }));

    await act(async () => {
      editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(editor.querySelector('[data-studio-action="create-skill"]')).not.toBeNull();
    expect(editor.textContent).toBe('✦创建 Skill ');

    act(() => methodsRef.current!.clearStudioAction());
    expect(editor.querySelector('[data-studio-action]')).toBeNull();
  });

  it('inserts an @ mention where the trigger was typed in the middle of text', () => {
    vi.useFakeTimers();
    const { host } = renderComposer([
      {
        id: 'chart-a',
        label: '数据图',
        kind: 'chart',
        isShot: false,
      },
    ]);
    const editor = host.querySelector<HTMLElement>('[contenteditable="true"]')!;
    const selection = window.getSelection()!;

    act(() => {
      editor.textContent = '前后';
      const beforeTrigger = document.createRange();
      beforeTrigger.setStart(editor.firstChild!, 1);
      beforeTrigger.collapse(true);
      selection.removeAllRanges();
      selection.addRange(beforeTrigger);
      editor.dispatchEvent(
        new KeyboardEvent('keydown', { key: '@', bubbles: true }),
      );

      editor.firstChild!.textContent = '前@后';
      const afterTrigger = document.createRange();
      afterTrigger.setStart(editor.firstChild!, 2);
      afterTrigger.collapse(true);
      selection.removeAllRanges();
      selection.addRange(afterTrigger);
      editor.dispatchEvent(
        new InputEvent('input', { bubbles: true, inputType: 'insertText' }),
      );
      vi.runAllTimers();
    });

    act(() => {
      editor.firstChild!.textContent = '前@数后';
      const afterQuery = document.createRange();
      afterQuery.setStart(editor.firstChild!, 3);
      afterQuery.collapse(true);
      selection.removeAllRanges();
      selection.addRange(afterQuery);
      editor.dispatchEvent(
        new InputEvent('input', { bubbles: true, inputType: 'insertText' }),
      );
    });

    const option = host.querySelector<HTMLButtonElement>(
      '[data-trigger-list] button',
    )!;
    expect(option).not.toBeNull();
    act(() => option.click());

    const mention = editor.querySelector<HTMLElement>(
      '[data-ref-id="chart-a"]',
    )!;
    expect(mention.previousSibling?.textContent).toBe('前');
    expect(mention.nextSibling?.textContent).toBe(' ');
    expect(mention.nextSibling?.nextSibling?.textContent).toBe('后');
  });

  it('keeps literal @ text intact when the picker is opened from the toolbar', () => {
    vi.useFakeTimers();
    const { host } = renderComposer([
      {
        id: 'chart-a',
        label: '数据图',
        kind: 'chart',
        isShot: false,
      },
    ]);
    const editor = host.querySelector<HTMLElement>('[contenteditable="true"]')!;
    const selection = window.getSelection()!;
    act(() => {
      editor.textContent = '邮箱 a@b';
      const range = document.createRange();
      range.setStart(editor.firstChild!, editor.textContent.length);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      editor.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    const trigger = host
      .querySelector('svg.lucide-at-sign')
      ?.closest<HTMLButtonElement>('button');
    expect(trigger).not.toBeNull();
    act(() => {
      trigger!.click();
      vi.runAllTimers();
    });
    act(() =>
      host.querySelector<HTMLButtonElement>('[data-trigger-list] button')!.click(),
    );

    const mention = editor.querySelector<HTMLElement>(
      '[data-ref-id="chart-a"]',
    )!;
    expect(mention.previousSibling?.textContent).toBe('邮箱 a@b');
  });

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
    expect(elementTag.classList).toContain('max-w-[160px]');
    expect(frameTag.classList).toContain('max-w-[160px]');
    expect(elementTag.classList).toContain('relative');
    expect(frameTag.classList).toContain('relative');
    expect(elementTag.querySelectorAll(':scope > span')).toHaveLength(1);
    expect(frameTag.querySelectorAll(':scope > span')).toHaveLength(2);
    expect(elementTag.title).toBe('@主标题');
    const elementRemove = elementTag.querySelector<HTMLButtonElement>('button[aria-label]')!;
    const frameRemove = frameTag.querySelector<HTMLButtonElement>('button[aria-label]')!;
    expect(elementRemove.classList).toContain('absolute');
    expect(frameRemove.classList).toContain('absolute');
    expect(elementRemove.classList).toContain('opacity-0');
    expect(frameRemove.classList).toContain('opacity-0');

    act(() => elementRemove.click());
    expect(host.querySelector('[data-ref-id="title-a"]')).toBeNull();
    expect(host.querySelector('[data-timeline-frame-id="frame-a"]')).not.toBeNull();

    act(() => frameRemove.click());
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
