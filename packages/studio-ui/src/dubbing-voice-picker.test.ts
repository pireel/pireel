// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { DubbingVoicePicker } from './dubbing-voice-picker';
import type { VoiceAsset } from './voice-card';
const voices: VoiceAsset[] = [
  { id: 'official', label: 'Narrator', source: 'system', language: 'en', selected: false, status: 'ready', sampleUrl: '/narrator.mp3' },
  { id: 'custom', label: 'My voice', source: 'cloned', language: 'en', selected: false, status: 'ready', sampleUrl: '/mine.mp3' },
];
let root: Root; let container: HTMLDivElement;
const onChange = vi.fn();
const audios: { pause: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn>; onplaying?: () => void; onended?: () => void }[] = [];
const render = async (disabled = false) => act(async () => root.render(createElement(DubbingVoicePicker, { voices, value: 'official', loading: false, disabled, locale: 'zh', language: 'en', onCreated: vi.fn(), onChange })));
const button = (name: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent) === name)!;
const click = async (name: string) => act(async () => button(name).click());
beforeEach(() => {
  vi.clearAllMocks(); audios.length = 0;
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ voices, customVoiceAccess: { allowed: true, cloneCredits: 100, designCredits: 100 } }))));
  vi.stubGlobal('Audio', class { pause = vi.fn(); play = vi.fn(async () => {}); constructor() { audios.push(this); } });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it('puts personal voices first and and selects a card without playing or changing account defaults', async () => {
  await render(); expect(button('我的')).toBeUndefined(); expect(button('官方')).toBeUndefined();
  const cards = container.querySelector('[aria-label="音色列表"]')!;
  expect(cards.firstElementChild?.querySelector('button')?.getAttribute('aria-label')).toBe('My voice');
  expect(cards.firstElementChild?.textContent).toContain('我的');
  expect(button('Narrator')).toBeTruthy();
  await click('My voice'); expect(onChange).toHaveBeenCalledWith('custom'); expect(audios).toHaveLength(0);
});
it('auditions one sample at a time without selecting it and stops when disabled or unmounted', async () => {
  await render(); await click('播放声音样本 · Narrator');
  await act(async () => audios[0].onplaying?.());
  await click('播放声音样本 · My voice');
  expect(audios[0].pause).toHaveBeenCalled(); expect(onChange).not.toHaveBeenCalled();
  await render(true); expect(audios[1].pause).toHaveBeenCalled(); expect(button('My voice').disabled).toBe(true);
  await render(); await click('播放声音样本 · Narrator');
  await act(async () => root.render(null)); expect(audios[2].pause).toHaveBeenCalled();
});

it('opens the existing clone flow without submitting a paid operation', async () => {
  await render(); await click('克隆音色');
  await vi.waitFor(async () => { await act(async () => {}); expect(document.querySelector('[role="dialog"] input[type="file"]')).not.toBeNull(); });
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.querySelector('textarea')).toBeNull();
  expect([...dialog.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === '创建克隆音色')?.disabled).toBe(true);
  expect(vi.mocked(fetch).mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true);
});
