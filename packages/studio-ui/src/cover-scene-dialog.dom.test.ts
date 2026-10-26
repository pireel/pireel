/** @vitest-environment jsdom */
import { beforeEach as configureHttpHost, afterEach as restoreHttpHost } from 'vitest';
import { studioProviders, setStudioProviders } from '@pireel/studio-engine/providers';
let previousHttpHost: ReturnType<typeof studioProviders>;
configureHttpHost(() => {
  previousHttpHost = studioProviders();
  setStudioProviders({ ...previousHttpHost, request: (input, init) => init === undefined ? fetch(input) : fetch(input, init) });
});
restoreHttpHost(() => setStudioProviders(previousHttpHost));
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoverSceneDialog, CoverToolCard, TimelineCoverPlaceholder } from '@pireel/studio-ui/cover-scene-dialog';
import { ChatCoverEntry } from '@pireel/studio-ui/chat-cover-controls';
import { renderToStaticMarkup } from 'react-dom/server';
import { setStudioLocale } from '@pireel/studio-ui/i18n';
import type { CoverScene } from '@pireel/studio-ui/cover-scene';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const roots: ReturnType<typeof createRoot>[] = [];
beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }); vi.stubGlobal('URL', class extends URL { static createObjectURL() { return 'blob:reference-preview'; } static revokeObjectURL() {} }); setStudioLocale('zh'); vi.stubGlobal('fetch', vi.fn(async () => Response.json({ models: [{ id: 'nano-banana', name: 'Nano Banana' }], credits: 10 }))); });
afterEach(() => { roots.splice(0).forEach(root => act(() => root.unmount())); document.body.innerHTML = ''; vi.unstubAllGlobals(); vi.clearAllMocks(); });
const image = { key: 'new-cover', url: 'https://cdn.example/new.jpg', label: 'New' };
const old = { key: 'old-cover', url: 'https://cdn.example/old.jpg', label: 'Previous version' };
const scene: CoverScene = { version: 1, runId: 'one', phase: 'ready', headline: ['PRIVATE COPY'], prompt: 'PRIVATE GENERATION PROMPT', promptVersion: 2, sourceFrame: { assetId: 'speaker', sourceSec: 2, timelineSec: 0 }, modelId: 'nano-banana', size: '3:4', images: [image], history: [old] };
const inputs = {
  onPrepare: vi.fn(async () => {}), onSaveDraft: vi.fn(async () => {}),
  onLoadFrames: vi.fn(async () => ({ fps: 30, durationSec: 4, ranges: [{ assetId: 'speaker', startSec: 0, endSec: 4, sourceInSec: 2, sourceOutSec: 6 }], frames: [{ assetId: 'speaker', sourceSec: 2, timelineSec: 0, url: 'data:image/jpeg;base64,first' }, { assetId: 'speaker', sourceSec: 5, timelineSec: 3, url: 'data:image/jpeg;base64,last' }] })),
  onPreviewFrame: vi.fn(async (_frame: { assetId: string; sourceSec: number }) => new Blob(['frame'], { type: 'image/jpeg' })),
};
async function mount(component: ReturnType<typeof createElement>) { const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); roots.push(root); await act(async () => root.render(component)); return host; }

describe('independent cover scene interaction', () => {
  it('automatically prepares the full prompt and reference on open, without generating an image or showing title/auto controls', async () => {
    const generate = vi.fn(async () => {}); const prepare = vi.fn(async () => {});
    function Harness() { const [open, setOpen] = useState(false); return createElement('div', {}, createElement(ChatCoverEntry, { onGenerate: () => setOpen(true) }), createElement(CoverSceneDialog, { ...inputs, open, scene: { ...scene, phase: 'prepared' }, applied: null, busy: false, onClose: () => setOpen(false), onPrepare: prepare, onGenerate: generate, onApply: async () => {} })); }
    const host = await mount(createElement(Harness));
    await act(async () => host.querySelector('button')!.click());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 125)); });
    expect(document.querySelector('[role=dialog]')).not.toBeNull();
    expect(prepare).toHaveBeenCalledTimes(1);
    expect((document.querySelector('textarea') as HTMLTextAreaElement).value).toBe(scene.prompt);
    expect(document.querySelector('img[alt="当前参考图"]')).not.toBeNull();
    expect(document.body.textContent).not.toContain('封面标题');
    expect(document.querySelector('input[type=checkbox]')).toBeNull();
    expect(generate).not.toHaveBeenCalled();
    const button = [...document.querySelectorAll('[role=dialog] button')].find(button => button.textContent === '生成封面') as HTMLButtonElement;
    await act(async () => button.click());
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ prompt: scene.prompt, sourceFrame: scene.sourceFrame }));
  });
  it('scrubs the Studio filmstrip with the keyboard and generates from that exact frame', async () => {
    const save = vi.fn(async () => {}); const generate = vi.fn(async () => {});
    await mount(createElement(CoverSceneDialog, { ...inputs, open: true, scene: { ...scene, phase: 'prepared' }, applied: null, busy: false, onClose() {}, onSaveDraft: save, onGenerate: generate, onApply: async () => {} }));
    const slider = document.querySelector('[role=slider]') as HTMLElement;
    for (let i = 0; i < 3; i++) await act(async () => { slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true })); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 125)); });
    expect(save).toHaveBeenLastCalledWith({ sourceFrame: { assetId: 'speaker', sourceSec: 5, timelineSec: 3 } });
    expect(inputs.onPreviewFrame).toHaveBeenLastCalledWith({ assetId: 'speaker', sourceSec: 5 });
    const button = [...document.querySelectorAll('[role=dialog] button')].find(button => button.textContent === '生成封面') as HTMLButtonElement;
    await act(async () => button.click());
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ sourceFrame: { assetId: 'speaker', sourceSec: 5, timelineSec: 3 } }));
  });
  it.each([[1080, 1920, '9:16'], [1920, 1080, '16:9'], [1080, 1080, '1:1'], [1440, 1080, '4:3']])('selects the %s×%s video aspect before a cover draft exists', async (width, height, ratio) => {
    await mount(createElement(CoverSceneDialog, { ...inputs, open: true, scene: null, canvas: { width: Number(width), height: Number(height) }, applied: null, busy: false, onClose() {}, onGenerate: async () => {}, onApply: async () => {} }));
    expect(document.querySelector('[aria-label="画面比例"]')?.textContent).toContain(ratio);
    expect(inputs.onSaveDraft).not.toHaveBeenCalled();
  });
  it('uses a saved explicit aspect instead of replacing it with the video aspect', async () => {
    await mount(createElement(CoverSceneDialog, { ...inputs, open: true, scene, canvas: { width: 1080, height: 1920 }, applied: null, busy: false, onClose() {}, onGenerate: async () => {}, onApply: async () => {} }));
    expect(document.querySelector('[aria-label="画面比例"]')?.textContent).toContain('3:4');
  });
  it('compares historical covers and applies the selected version inside the scene', async () => {
    const apply = vi.fn(async () => {});
    await mount(createElement(CoverSceneDialog, { ...inputs, open: true, scene, applied: null, busy: false, onClose() {}, onGenerate: async () => {}, onApply: apply }));
    const previous = document.querySelector('button[aria-label="Previous version"]') as HTMLButtonElement;
    await act(async () => previous.click());
    expect((document.querySelector('img[alt="封面预览"]') as HTMLImageElement).src).toBe(old.url);
    const applyButton = [...document.querySelectorAll('button')].find(button => button.textContent?.includes('应用为封面')) as HTMLButtonElement;
    await act(async () => applyButton.click()); expect(apply).toHaveBeenCalledWith(old);
  });

  it('moves a generated result into the left reference form and restores it when reopened', async () => {
    const save = vi.fn(async () => {});
    await mount(createElement(CoverSceneDialog, { ...inputs, open: true, scene, applied: null, busy: false, onClose() {}, onSaveDraft: save, onGenerate: async () => {}, onApply: async () => {} }));
    const button = [...document.querySelectorAll('button')].find(button => button.textContent === '用作参考图') as HTMLButtonElement;
    await act(async () => button.click());
    expect(save).toHaveBeenCalledWith({ referenceImage: image });
    roots.splice(0).forEach(root => act(() => root.unmount()));
    await mount(createElement(CoverSceneDialog, { ...inputs, open: true, scene: { ...scene, referenceImage: image }, applied: null, busy: false, onClose() {}, onGenerate: async () => {}, onApply: async () => {} }));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 125)); });
    expect((document.querySelector('img[alt="当前参考图"]') as HTMLImageElement).src).toBe('blob:reference-preview');
    expect((document.querySelector('img[alt="构图参考图"]') as HTMLImageElement).src).toBe(image.url);
    expect((document.querySelector('img[alt="封面预览"]') as HTMLImageElement).src).toBe(image.url);
  });
  it('restores the saved reference when a touch scroll cancels frame scrubbing', async () => {
    const save = vi.fn(async () => {});
    await mount(createElement(CoverSceneDialog, { ...inputs, open: true, scene: { ...scene, referenceImage: image }, applied: null, busy: false, onClose() {}, onSaveDraft: save, onGenerate: async () => {}, onApply: async () => {} }));
    const slider = document.querySelector('[role=slider]') as HTMLElement;
    slider.setPointerCapture = vi.fn();
    await act(async () => { slider.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 100 })); });
    await act(async () => { slider.dispatchEvent(new Event('pointercancel', { bubbles: true })); });
    expect((document.querySelector('img[alt="构图参考图"]') as HTMLImageElement).src).toBe(image.url);
    expect(save).not.toHaveBeenCalled();
  });
  it('displays the exact brand covers alongside identity and optional prior-result references', async () => {
    await mount(createElement(CoverSceneDialog, { ...inputs, open: true, scene: { ...scene, brandReferences: [{ key: 'brand', url: 'https://cdn.example/brand.jpg' }], referenceImage: old }, applied: null, busy: false, onClose() {}, onGenerate: async () => {}, onApply: async () => {} }));
    expect((document.querySelector('img[alt="品牌封面参考 1"]') as HTMLImageElement).src).toBe('https://cdn.example/brand.jpg');
    expect(document.body.textContent).toContain('2 · 品牌封面');
    expect(document.body.textContent).toContain('3 · 构图参考');
  });
  it('shows only a compact status card in the main chat', () => {
    const html = renderToStaticMarkup(createElement(CoverToolCard, { scene, onOpen() {} }));
    expect(html).toContain('封面已生成'); expect(html).toContain('打开封面');
    expect(html).not.toMatch(/PRIVATE|https:|<img/);
  });
  it('opens the scene from an untimed timeline-front placeholder', async () => {
    const open = vi.fn(); const host = await mount(createElement(TimelineCoverPlaceholder, { cover: image, onOpen: open }));
    act(() => host.querySelector('button')!.click()); expect(open).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-timeline-cover-placeholder]')).not.toBeNull();
    expect(host.textContent).toContain('封面占位');
  });
});
