// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { setStudioLocale } from '@pireel/studio-ui/i18n';
import type { GenerationParams } from '@pireel/studio-ui/chat-generation-intent';
import { GenerationControls, GenerationCreditsBadge } from '@pireel/studio-ui/chat-generation-params';

const mocks = vi.hoisted(() => ({ quote: vi.fn(() => null) }));
vi.mock('@pireel/studio-ui/use-quote', () => ({ useQuote: mocks.quote }));
vi.mock('@pireel/studio-ui/shell-context', () => ({
  useStudioShell: () => ({ modelParams: {
    qualityConfigFor: () => ({ default: 'medium', options: [{ value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }] }),
    videoResolutionOptions: () => ['720p', '1080p'],
    videoDurationOptions: () => ['5', '10'],
  } }),
}));

describe('generation composer settings', () => {
  let root: Root;
  let host: HTMLDivElement;
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mocks.quote.mockClear();
    setStudioLocale('zh');
    HTMLElement.prototype.scrollIntoView = vi.fn();
    HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
    HTMLElement.prototype.releasePointerCapture = vi.fn();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('preserves a supported saved quality when image settings reopen', async () => {
    const onChange = vi.fn();
    await act(async () => root.render(createElement(GenerationControls, {
      intent: 'image', params: { modelId: 'gpt-image', quality: 'high', ratio: '9:16', imageSize: '1440x2560' },
      models: [{ id: 'gpt-image', name: 'Image' }], onChange, onUseTemplate: vi.fn(),
    })));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('replaces an unsupported quality with the selected model default', async () => {
    const onChange = vi.fn();
    await act(async () => root.render(createElement(GenerationControls, {
      intent: 'image', params: { modelId: 'gpt-image', quality: 'old-quality' },
      models: [{ id: 'gpt-image', name: 'Image' }], onChange, onUseTemplate: vi.fn(),
    })));
    expect(onChange).toHaveBeenCalledWith({ modelId: 'gpt-image', quality: 'medium', ratio: '9:16', imageSize: '1440x2560' });
  });

  it('keeps the image settings popover open while choosing a resolution from its portaled menu', async () => {
    let selected: GenerationParams = {};
    function Harness() {
      const [params, setParams] = useState<GenerationParams>({ modelId: 'gpt-image', ratio: '9:16', imageSize: '1440x2560', quality: 'medium' });
      selected = params;
      return createElement(GenerationControls, { intent: 'image', params, models: [{ id: 'gpt-image', name: 'GPT Image' }], onChange: setParams, onUseTemplate() {} });
    }
    await act(async () => root.render(createElement(Harness)));
    await act(async () => (host.querySelector('button[aria-label="生成参数"]') as HTMLButtonElement).click());
    const trigger = document.querySelector('[role=combobox][aria-label="分辨率"]')!;
    await act(async () => trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    const option = [...document.querySelectorAll('[role=option]')].find(element => element.textContent?.includes('4K')) as HTMLElement;
    expect(option).toBeTruthy();
    await act(async () => { option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); option.click(); });
    expect(selected.imageSize).toBe('2160x3840');
    expect(document.querySelector('[data-image-generation-fields]')).not.toBeNull();
  });

  it('quotes the same sound and square aspect choices sent to the video agent', async () => {
    await act(async () => root.render(createElement(GenerationCreditsBadge, {
      intent: 'video', params: { modelId: 'video-model', ratio: '1:1', generateAudio: true, durationSec: 10 },
      models: [{ id: 'video-model', name: 'Video' }],
    })));
    expect(mocks.quote).toHaveBeenLastCalledWith(expect.objectContaining({
      toolId: 'video-gen', params: expect.objectContaining({ generate_audio: true, aspect_ratio: '1:1', duration_sec: '10' }),
    }));
  });
});
