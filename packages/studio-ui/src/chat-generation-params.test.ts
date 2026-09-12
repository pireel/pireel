// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GenerationControls, GenerationCreditsBadge } from './chat-generation-params';

const mocks = vi.hoisted(() => ({ quote: vi.fn(() => null) }));
vi.mock('@pireel/ui/use-quote', () => ({ useQuote: mocks.quote }));
vi.mock('./shell-context', () => ({
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
      intent: 'image', params: { modelId: 'image-model', quality: 'high' },
      models: [{ id: 'image-model', name: 'Image' }], onChange, onUseTemplate: vi.fn(),
    })));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('replaces an unsupported quality with the selected model default', async () => {
    const onChange = vi.fn();
    await act(async () => root.render(createElement(GenerationControls, {
      intent: 'image', params: { modelId: 'image-model', quality: 'old-quality' },
      models: [{ id: 'image-model', name: 'Image' }], onChange, onUseTemplate: vi.fn(),
    })));
    expect(onChange).toHaveBeenCalledWith({ modelId: 'image-model', quality: 'medium' });
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
