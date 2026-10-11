// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { buildCaptionBaseDocument } from '@pireel/studio-engine/caption-task';
import { applyDocumentTransaction } from '@pireel/studio-engine/document-transaction';
import type { CaptionTaskRecord } from './caption-task-store';
const mock = vi.hoisted(() => ({ props: null as any, seek: vi.fn(), play: vi.fn(), pause: vi.fn(), media: vi.fn() }));
vi.mock('./caption-task-store', () => ({ loadCaptionMedia: mock.media }));
vi.mock('./scene-canvas-preview', async () => { const React = await import('react'); return { SceneCanvasPreview: React.forwardRef((props: any, ref) => { mock.props = props; React.useImperativeHandle(ref, () => ({ seek: mock.seek, play: mock.play, pause: mock.pause })); return createElement('div', { 'data-native-preview': true }); }) }; });
import { SfxTimeline } from './sfx-timeline';
let root: Root; let container: HTMLDivElement; let task: CaptionTaskRecord;
const source = new File(['source'], 'source.mp4'); const sound = new File(['sound'], 'soft.wav'); const change = vi.fn();
const render = async () => act(async () => root.render(createElement(SfxTimeline, { task, source, locale: 'zh', disabled: false, onChange: document => { change(document); task = { ...task, document }; void render(); } })));
const button = (text: string) => [...container.querySelectorAll('button')].find(button => (button.getAttribute('aria-label') ?? button.textContent) === text)!;
beforeEach(async () => {
  vi.clearAllMocks(); mock.props = null; vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); let count = 0;
  vi.stubGlobal('URL', { createObjectURL: () => `blob:${++count}`, revokeObjectURL: vi.fn() }); mock.media.mockResolvedValue(sound);
  task = { id: 'sfx', generationId: 'version-1', scope: 'owner', scene: 'sfx', sourceSig: 'original', name: 'source.mp4', width: 640, height: 360, durationSec: 10, stage: 'completed', updatedAt: 1, options: { caption: {}, aspect: 'original', shortenPauses: false, sfx: { density: 'medium' } } };
  const base = buildCaptionBaseDocument({ projectId: task.id, sourceUrl: 'blob:old-original', sourceSig: task.sourceSig, width: task.width, height: task.height, durationSec: task.durationSec, transcript: [], options: task.options });
  const result = applyDocumentTransaction(base, { ops: [{ op: 'command', input: { command: { type: 'track.insert', track: { id: 'sfx-track', type: 'audio', role: 'sfx', name: '音效' } } } }, { op: 'audio.add', input: { toTrackId: 'sfx-track', clip: { id: 'sound', src: 'blob:old-sound', sig: 'sound-sig', label: 'soft.wav', role: 'sfx', startSec: 2, durationSec: .25, volumeDb: -22, fadeInSec: .01, fadeOutSec: .05 } } }] }, { projectId: task.id });
  if (!result.ok) throw new Error(result.error.message); task.document = result.document;
  container = document.createElement('div'); document.body.append(container); root = createRoot(container); await render();
  await vi.waitFor(async () => { await act(async () => {}); expect(mock.props).toBeTruthy(); });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it('loads original media plus independent sound and auditions the selected clip without changing the document', async () => {
  expect(mock.props.files.get(mock.props.composition.shots[0].src)).toBe(source);
  expect(mock.props.files.get(mock.props.composition.audioTracks[0].src)).toBe(sound);
  expect(container.querySelector('video')).toBeNull();
  await act(async () => button('轻提示 0:02.0').click()); expect(mock.seek).toHaveBeenLastCalledWith(2);
  await act(async () => button('试听选中音效').click());
  expect(mock.props.sourceVolume).toBe(0); expect(mock.play).toHaveBeenCalledOnce(); expect(change).not.toHaveBeenCalled();
  await act(async () => mock.props.onTime(2.4)); expect(mock.pause).toHaveBeenCalled(); expect(mock.props.sourceVolume).toBe(1);
});
it('edits level without showing removed controls or undo', async () => {
  await act(async () => button('轻提示 0:02.0').click());
  const volume = container.querySelector('[aria-label="选中音效音量"]') as HTMLInputElement;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(volume, '-8'); volume.dispatchEvent(new Event('input', { bubbles: true })); });
  expect(mock.props.composition.audioTracks[0].volumeDb).toBe(-8);
  for (const label of ['移除', '静音', '静音此处', '只听音效', '优化音源与混音', '撤销']) expect(button(label)).toBeUndefined();
  expect(container.querySelectorAll('[data-scene-playback]')).toHaveLength(1);
  expect(container.querySelector('[data-scene-player-actions] [aria-label="播放"]')).not.toBeNull();
  expect(container.querySelector('[data-scene-player-frame] [aria-label="播放"]')).toBeNull();
});
it('drags sound positions without changing duration and ignores click-sized pointer jitter', async () => {
  const lane = container.querySelector('[aria-label="音效轨道"]')!.parentElement!;
  vi.spyOn(lane, 'getBoundingClientRect').mockReturnValue({ width: 100 } as DOMRect);
  HTMLElement.prototype.setPointerCapture = vi.fn(); HTMLElement.prototype.releasePointerCapture = vi.fn();
  const pointer = async (type: string, x: number) => act(async () => {
    const event = new Event(type, { bubbles: true }); Object.assign(event, { button: 0, pointerId: 1, clientX: x });
    (container.querySelector('[aria-label="音效轨道"] button') as HTMLButtonElement).dispatchEvent(event);
  });
  await pointer('pointerdown', 20); await pointer('pointermove', 21); await pointer('pointerup', 21);
  expect(change).not.toHaveBeenCalled();
  await pointer('pointerdown', 20); await pointer('pointermove', 40); await pointer('pointerup', 40);
  expect(mock.props.composition.audioTracks[0].startSec).toBe(4); expect(mock.props.composition.audioTracks[0].durationSec).toBe(.25);
  expect(button('撤销')).toBeUndefined();
});

