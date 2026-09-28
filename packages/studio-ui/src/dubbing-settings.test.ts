// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DubbingSettings } from './dubbing-settings';
import type { DubbingOptions } from '@pireel/studio-engine/dubbing-task';

let root: Root; let container: HTMLDivElement;
const onChange = vi.fn();
const transcript = [{ start: 0, end: 1, text: '第一位', speaker: 'a' }, { start: 1, end: 2, text: '第二位', speaker: 'b' }];
const voices = [
  { id: 'narrator', label: '旁白', source: 'system', language: 'en', status: 'ready' },
  { id: 'personal', label: '我的声音', source: 'cloned', language: 'zh', status: 'ready' },
];
const render = async (value: DubbingOptions, workflow: boolean, disabled = false) => act(async () => root.render(createElement(DubbingSettings, {
  value, transcript, locale: 'zh', onChange, disabled, ...(workflow ? { showLanguage: false, autoSelectVoice: false } : {}),
})));
const button = (label: string) => [...container.querySelectorAll('button')].find(button => (button.getAttribute('aria-label') ?? button.textContent)?.trim() === label)!;
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ voices }))));
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it('keeps workflow voice selection explicit and maps each speaker without changing translation', async () => {
  const value = { language: 'English', voiceId: '', lipSync: false, speakerVoices: { 'speaker:b': 'narrator' } };
  await render(value, true);
  expect(container.querySelector('[aria-label="目标语言"]')).toBeNull();
  expect(button('我的声音')).toBeTruthy(); expect(onChange).not.toHaveBeenCalled();
  await act(async () => button('我的声音').click());
  expect(onChange).toHaveBeenLastCalledWith({ ...value, voiceId: 'personal', speakerVoices: { 'speaker:a': 'personal', 'speaker:b': 'narrator' } });
  const next = onChange.mock.calls.at(-1)![0]; await render(next, true);
  await act(async () => button('说话人 2').click());
  await act(async () => button('我的声音').click());
  expect(onChange).toHaveBeenLastCalledWith({ ...next, speakerVoices: { 'speaker:a': 'personal', 'speaker:b': 'personal' } });
});
it('retains the official scene default voice and prevents selection while processing', async () => {
  const value = { language: 'English', voiceId: '', lipSync: false };
  await render(value, false);
  expect(container.querySelector('[aria-label="目标语言"]')).not.toBeNull();
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ voiceId: 'personal' }));
  await render({ ...value, voiceId: 'personal' }, false, true); onChange.mockClear();
  expect((container.querySelector('[aria-label="目标语言"]') as HTMLButtonElement).disabled).toBe(true);
  expect(button('旁白').disabled).toBe(true);
  await act(async () => button('旁白').click()); expect(onChange).not.toHaveBeenCalled();
});
