// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptionTaskRecord } from './caption-task-store';
import type { runCaptionTask } from './caption-task-runner';
const mocks = vi.hoisted(() => ({ run: vi.fn(), remix: vi.fn(), source: vi.fn(), cache: vi.fn(), exportEdit: vi.fn(), sfxPreview: vi.fn() }));
vi.mock('./dubbing-task-runner', () => ({ runDubbingTask: mocks.run }));
vi.mock('./broll-export', () => ({ exportBrollEdit: mocks.exportEdit }));
vi.mock('./subtitle-removal-runner', () => ({ runSubtitleRemovalTask: mocks.run }));
vi.mock('./sfx-task-runner', () => ({ runSfxTask: mocks.run, exportSfxEdit: mocks.exportEdit }));
vi.mock('./sfx-timeline', () => ({ SfxTimeline: (props: any) => { mocks.sfxPreview(props); return createElement('div', { 'data-sfx-native-preview': true }, props.actions); } }));
vi.mock('./broll-task-runner', () => ({ runBrollTask: mocks.run }));
vi.mock('./ugc-ad-task-runner', () => ({ runUgcAdTask: mocks.run, exportUgcAdEdit: mocks.exportEdit }));
vi.mock('./caption-task-runner', () => ({ runCaptionTask: mocks.run, exportCaptionEdit: mocks.exportEdit }));
vi.mock('./caption-document-preview', () => ({ CaptionDocumentPreview: ({ task, actions }: { task: CaptionTaskRecord; actions: unknown }) => createElement('div', { 'data-caption-document-preview': task.generationId }, actions as never) }));
vi.mock('./caption-agent-remix', () => ({ createCaptionAgentRemix: mocks.remix }));
vi.mock('./current-user', () => ({ loadCurrentUser: async () => ({ user_id: 'owner', auth_method: 'session' }) }));
vi.mock('./local-media', () => ({ loadLocalVideo: mocks.source, saveLocalVideo: mocks.cache }));
vi.mock('./media', () => ({ fileSig: () => 'source', probeVideoFile: async () => ({ width: 1920, height: 1080, durationSec: 5, hasAudio: true }) }));
vi.mock('./web-fonts', async (original) => ({ ...await original<typeof import('./web-fonts')>(), ensureFontStylesheet: async () => {}, loadFont: async () => {} }));
vi.mock('./caption-project-cover', () => ({ captureCaptionFirstFrame: async () => 'data:image/jpeg;base64,first-frame' }));
vi.mock('@pireel/studio-engine/providers', () => ({ studioProviders: () => ({ translate: vi.fn(), autoHighlight: vi.fn() }) }));
import { CaptionTaskPage } from './caption-task-page';
import { saveCaptionTask, loadCaptionTask, listCaptionVersions, loadCaptionVersion } from './caption-task-store';
import { CAPTION_STAGE_NAMES } from './caption-task-progress';
let root: Root; let container: HTMLDivElement;
let runs: { task: CaptionTaskRecord; hooks: Parameters<typeof runCaptionTask>[2]; resolve: (value: Awaited<ReturnType<typeof runCaptionTask>>) => void; reject: (error: Error) => void }[];
const fixture = (): CaptionTaskRecord => ({ id: 'task', scope: 'owner', name: 'demo.mp4', sourceSig: 'source', width: 1920, height: 1080, durationSec: 5, stage: 'ready', updatedAt: 1, coverThumb: 'data:image/jpeg;base64,poster', options: { caption: {}, aspect: 'original', shortenPauses: false } });
const button = (name: string) => [...container.querySelectorAll('button')].find((element) => element.textContent?.trim() === name)!;
const click = async (element: HTMLElement) => { await act(async () => element.click()); };
const settled = async (check: () => void) => vi.waitFor(async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); check(); });
const choose = async (label: string, text: string) => {
  const trigger = container.querySelector<HTMLElement>(`[role="combobox"][aria-label="${label}"]`)!;
  await act(async () => trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) => item.textContent?.trim() === text)!;
  expect(option).toBeTruthy();
  await click(option);
};
beforeEach(async () => {
  vi.clearAllMocks(); runs = [];
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ measureText: (text: string) => ({ width: text.length * 24 }) } as never);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  let urlId = 0; vi.stubGlobal('URL', { createObjectURL: () => `blob:result-${++urlId}`, revokeObjectURL: vi.fn() });
  mocks.source.mockResolvedValue(new File(['source'], 'demo.mp4')); mocks.cache.mockResolvedValue(true); mocks.remix.mockResolvedValue('remixed');
  mocks.run.mockImplementation((task, _file, hooks) => new Promise((resolve, reject) => runs.push({ task, hooks, resolve, reject })));
  await saveCaptionTask(fixture());
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(createElement(CaptionTaskPage, { taskId: 'task', locale: 'zh', onBack: vi.fn(), onOpenEditor: vi.fn() })));
  await settled(() => expect(button('生成字幕视频')).toBeTruthy());
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function complete(index: number) {
  await act(async () => runs[index]!.resolve({ task: { ...runs[index]!.task, stage: 'completed', updatedAt: 10 + index }, video: new Blob([`video-${index}`], { type: 'video/mp4' }) }));
  await settled(() => { expect(button('生成新版本')).toBeTruthy(); expect(container.querySelector(runs[index]!.task.scene === 'sfx' ? '[data-sfx-native-preview]' : 'video[data-scene-video]')).not.toBeNull(); });
}
describe('caption versions and preview UI', () => {
  it('opens the own-footage scene, requires assets and dispatches its runner with captions', async () => {
    await act(async () => root.render(null));
    const source = { ...fixture(), scene: 'broll' as const, options: { ...fixture().options, broll: { assets: [], captions: true } } };
    await saveCaptionTask(source);
    await act(async () => root.render(createElement(CaptionTaskPage, { taskId: 'task', scene: 'broll', locale: 'zh', onBack: vi.fn(), onOpenEditor: vi.fn() })));
    await settled(() => expect(button('生成视频')).toBeTruthy());
    expect(button('生成视频').disabled).toBe(true);
    expect(container.textContent).toContain('我的素材');
    expect(container.textContent).not.toContain('音色');
    expect(container.textContent).not.toContain('双语字幕');
    await act(async () => root.render(null));
    await saveCaptionTask({ ...source, options: { ...source.options, broll: { captions: true, assets: [{ id: 'asset', sig: 'asset-sig', name: 'broll.mp4', kind: 'video', width: 1920, height: 1080, durationSec: 5 }] } } });
    await act(async () => root.render(createElement(CaptionTaskPage, { taskId: 'task', scene: 'broll', locale: 'zh', onBack: vi.fn(), onOpenEditor: vi.fn() })));
    await settled(() => expect(button('生成视频')?.disabled).toBe(false));
    await click(button('生成视频')); await settled(() => expect(runs).toHaveLength(1));
    expect(runs[0].task.scene).toBe('broll');
    expect(container.querySelector('[aria-label="配画面生成进度"]')).not.toBeNull();
    await complete(0);
  });
  it('exports a B-roll draft without opening regeneration confirmation or creating a version', async () => {
    await act(async () => root.render(null));
    const source = { ...fixture(), scene: 'broll' as const, stage: 'completed' as const, generationId: 'v1', draftOptions: fixture().options, options: { ...fixture().options, broll: { assets: [], captions: false } } };
    source.draftOptions=source.options;
    await saveCaptionTask(source,new Blob(['existing']));
    mocks.exportEdit.mockResolvedValue(new Blob(['export']));
    const download=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
    await act(async () => root.render(createElement(CaptionTaskPage, { taskId: 'task', scene: 'broll', locale: 'zh', onBack: vi.fn(), onOpenEditor: vi.fn() })));
    await settled(() => expect(button('导出')).toBeTruthy());
    const before=await listCaptionVersions('owner','task');
    await click(button('导出'));
    await settled(()=>expect(download).toHaveBeenCalledOnce());
    expect(mocks.exportEdit).toHaveBeenCalledOnce();expect(mocks.run).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(await listCaptionVersions('owner','task')).toEqual(before);
  });
  it('defaults to the first displayed voice, preserves changes, and dispatches the dubbing runner', async () => {
    await act(async () => root.render(null));
    vi.stubGlobal('fetch', vi.fn(async (url) => new Response(JSON.stringify(String(url).includes('dubbing-lipsync') ? { lipSyncAvailable: true } : { voices: [{ id: 'en-voice', label: 'English voice', source: 'system', language: 'en', languages: ['en'], status: 'ready', sampleUrl: 'https://example.test/sample.mp3' }, { id: 'my-clone', label: '我的克隆', source: 'cloned', language: 'zh', languages: ['zh'], status: 'ready' }, { id: 'zh-system', label: '中文官方', source: 'system', language: 'zh', languages: ['zh'], status: 'ready' }] }))));
    await saveCaptionTask({ ...fixture(), scene: 'dubbing', options: { ...fixture().options, dubbing: { language: 'English', voiceId: '', lipSync: true } } });
    await act(async () => root.render(createElement(CaptionTaskPage, { taskId: 'task', scene: 'dubbing', locale: 'zh', onBack: vi.fn(), onOpenEditor: vi.fn() })));
    await settled(() => expect(container.querySelector('button[aria-label="English voice"]')).not.toBeNull());
    await settled(() => expect(button('生成译制视频').disabled).toBe(false));
    expect(container.querySelector('button[aria-label="我的克隆"]')?.getAttribute('aria-pressed')).toBe('true');
    const voiceCards = container.querySelector('[aria-label="音色列表"]')!;
    expect(voiceCards.firstElementChild?.querySelector('button')?.getAttribute('aria-label')).toBe('我的克隆');
    expect(container.querySelector('button[aria-label="中文官方"]')).toBeNull();
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes('/voices')).every(([url]) => !String(url).includes('language='))).toBe(true);
    expect(container.querySelector('[aria-label="字幕位置"]')).not.toBeNull();
    expect(container.querySelector('[data-caption-appearance]')).not.toBeNull();
    expect(container.textContent).not.toContain('口型同步');
    await click(container.querySelector<HTMLButtonElement>('button[aria-label="English voice"]')!);
    const voiceList = container.querySelector('[aria-label="音色列表"]');
    const fetchCount = vi.mocked(fetch).mock.calls.length;
    await choose('目标语言', '日语');
    expect(vi.mocked(fetch).mock.calls).toHaveLength(fetchCount);
    expect(container.querySelector('[aria-label="音色列表"]')).toBe(voiceList);
    expect(container.querySelector('button[aria-label="English voice"]')?.getAttribute('aria-pressed')).toBe('true');
    await choose('目标语言', '英语');
    await click(button('生成译制视频')); await settled(() => expect(runs).toHaveLength(1));
    expect(runs[0]!.task.options.dubbing).toMatchObject({ lipSync: false, captions: true });
    expect(runs[0]!.task.scene).toBe('dubbing'); expect(runs[0]!.task.options.dubbing?.voiceId).toBe('en-voice');
    expect(container.querySelector('[aria-label="译制生成进度"]')).not.toBeNull();
    await complete(0);
    expect(container.querySelector('video[data-scene-video]')).not.toBeNull();
  });
  it('returns to speaker configuration without a failed version and saves per-speaker voices', async () => {
    await act(async () => root.render(null));
    vi.stubGlobal('fetch', vi.fn(async (url) => new Response(JSON.stringify(String(url).includes('dubbing-lipsync') ? { lipSyncAvailable: true } : { voices: [
      { id: 'first', label: 'First voice', source: 'system', language: 'en', status: 'ready' },
      { id: 'second', label: 'Second voice', source: 'system', language: 'en', status: 'ready' },
    ] }))));
    await saveCaptionTask({ ...fixture(), scene: 'dubbing', options: { ...fixture().options, dubbing: { language: 'English', voiceId: 'first', lipSync: false } } });
    await act(async () => root.render(createElement(CaptionTaskPage, { taskId: 'task', scene: 'dubbing', locale: 'zh', onBack: vi.fn(), onOpenEditor: vi.fn() })));
    await settled(() => expect(button('生成译制视频')).toBeTruthy());
    await click(button('生成译制视频')); await settled(() => expect(runs).toHaveLength(1));
    await act(async () => {
      await runs[0].hooks.checkpoint({ ...runs[0].task, stage: 'ready', transcript: [{ text: 'First says hello', speaker: 'a', start: 0, end: 2 }, { text: 'Second replies', speaker: 'b', start: 3, end: 5 }] });
      runs[0].reject(Object.assign(new Error('请选择每个人的音色'), { code: 'dubbing_setup_required' }));
    });
    await settled(() => expect(container.querySelector('[aria-label="说话人"]')).not.toBeNull());
    expect((await loadCaptionTask('owner', 'task'))?.stage).toBe('ready');
    expect(await listCaptionVersions('owner', 'task')).toHaveLength(0);
    expect(button('生成译制视频').disabled).toBe(true);
    expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')?.disabled).toBe(false);
    await click(container.querySelectorAll<HTMLButtonElement>('[aria-label="说话人"] button')[1]);
    await settled(() => expect(container.querySelector('button[aria-label="Second voice"]')).not.toBeNull());
    await click(container.querySelector<HTMLButtonElement>('button[aria-label="Second voice"]')!);
    expect(button('生成译制视频').disabled).toBe(false);
    await click(button('生成译制视频')); await settled(() => expect(runs).toHaveLength(2));
    expect(runs[1].task.options.dubbing?.speakerVoices).toMatchObject({ 'speaker:b': 'second' });
    await complete(1);
  });
  it('saves preview positioning to the draft and passes it to generation', async () => {
    const position = container.querySelector<HTMLElement>('[role="slider"][aria-label="字幕位置"]')!;
    await act(async () => position.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })));
    expect(position.getAttribute('aria-valuenow')).toBe('88');
    await vi.waitFor(async () => {
      let saved: CaptionTaskRecord | undefined;
      await act(async () => { saved = await loadCaptionTask('owner', 'task'); });
      expect(saved?.draftOptions?.caption.yPct).toBe(88);
    });
    await click(button('生成字幕视频')); await settled(() => expect(runs).toHaveLength(1));
    expect(runs[0]!.task.options.caption.yPct).toBe(88);
    expect(container.querySelector('[aria-label="字幕位置"]')).toBeNull();
    await complete(0);
  });
  it('places captions in the safe area by default and reads options saved in the old shape', async () => {
    expect(container.querySelector('[aria-label="字幕位置"]')?.getAttribute('aria-valuenow')).toBe('89');
    expect(container.querySelector('[data-caption-safe-area]')).toBeNull();
    await act(async () => root.render(null));
    await saveCaptionTask({ ...fixture(), options: { presetId: 'keywords', layoutVersion: 2, custom: { yPct: 70 }, aspect: 'original', shortenPauses: false } as never });
    await act(async () => root.render(createElement(CaptionTaskPage, { taskId: 'task', locale: 'zh', onBack: vi.fn(), onOpenEditor: vi.fn() })));
    await settled(() => expect(container.querySelector('video[data-scene-video]')).not.toBeNull());
    expect(container.querySelector('[aria-label="字幕位置"]')?.getAttribute('aria-valuenow')).toBe('70');
    const highlight = [...container.querySelectorAll('label')].find(label => label.textContent?.startsWith('自动高亮重点词'))!.querySelector('input')!;
    expect(highlight.checked).toBe(true);
  });
  it('previews the source before generation, pauses during processing, and preserves selectable versions', async () => {
    const sourceUrl = container.querySelector('video[data-scene-video]')!.getAttribute('src');
    expect(container.querySelector('[data-scene-playback]')).not.toBeNull();
    expect(container.querySelector('video[data-scene-video]')?.getAttribute('poster')).toBe('data:image/jpeg;base64,first-frame');
    await click(button('生成字幕视频'));
    await settled(() => expect(runs).toHaveLength(1));
    await act(async () => runs[0]!.hooks.stageProgress?.({ transcribing: { status: 'completed', fraction: 1 }, styling: { status: 'running', fraction: .42 } }));
    expect(container.querySelector('[aria-label="字幕生成进度"]')).not.toBeNull();
    expect(container.querySelector(`progress[aria-label="${CAPTION_STAGE_NAMES.styling[0]}"]`)?.getAttribute('value')).toBe('0.42');
    expect(container.querySelector('progress[aria-label="生成视频"]')).toBeNull();
    expect((container.querySelector('[data-scene-player-actions] button[aria-label="播放"]') as HTMLButtonElement).disabled).toBe(true);
    await complete(0);
    expect(container.querySelector('video[data-scene-video]')!.getAttribute('src')).not.toBe(sourceUrl);
    expect(container.querySelector('[aria-label="字幕生成进度"]')).toBeNull();
    await click(container.querySelector<HTMLButtonElement>('button[title="霓虹灯"]')!);
    expect(container.querySelector('video[data-scene-video]')!.getAttribute('src')).toBe(sourceUrl);
    await click(button('生成新版本'));
    expect(runs).toHaveLength(1);
    await click([...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((button) => button.textContent === '确认生成')!);
    await settled(() => expect(runs).toHaveLength(2));
    await complete(1);
    expect(runs[0]!.task.generationId).not.toBe(runs[1]!.task.generationId);
    expect(await listCaptionVersions('owner', 'task')).toHaveLength(2);
    await choose('视频版本', '版本 1');
    await settled(() => expect(container.querySelector('button[title="霓虹灯"]')!.className).not.toContain('ring-2'));
    expect(container.querySelector('a[download]')?.getAttribute('download')).toBe('demo-v1.mp4');
    await click(button('Agent Remix'));
    await settled(() => expect(mocks.remix).toHaveBeenCalled());
    expect(mocks.remix.mock.calls[0]![0].generationId).toBe(runs[0]!.task.generationId);
    expect((await loadCaptionVersion('owner', 'task', runs[1]!.task.generationId!))!.version.task.options.caption.preset).toBe('art-neon');
    await act(async () => root.render(null));
    await act(async () => root.render(createElement(CaptionTaskPage, { taskId: 'task', locale: 'zh', onBack: vi.fn(), onOpenEditor: vi.fn() })));
    await settled(() => expect(container.querySelector('[role="combobox"][aria-label="视频版本"]')?.textContent).toContain('版本 2'));
    expect(container.querySelector('video[data-scene-video]')).not.toBeNull();
  });
  it('generates captions without rendering and renders the video on download', async () => {
    await click(button('生成字幕视频')); await settled(() => expect(runs).toHaveLength(1));
    const document = { canvas: { width: 1080, height: 1920, fps: 30 } } as unknown as CaptionTaskRecord['document'];
    await act(async () => runs[0]!.resolve({ task: { ...runs[0]!.task, stage: 'completed', updatedAt: 10, document } }));
    await settled(() => expect(container.querySelector('[data-caption-document-preview]')?.getAttribute('data-caption-document-preview')).toBe(runs[0]!.task.generationId));
    expect(await listCaptionVersions('owner', 'task')).toHaveLength(0);
    expect(mocks.exportEdit).not.toHaveBeenCalled();
    mocks.exportEdit.mockResolvedValueOnce(new Blob(['rendered'], { type: 'video/mp4' }));
    await click(button('下载'));
    await settled(() => expect(mocks.exportEdit).toHaveBeenCalledOnce());
    expect(mocks.exportEdit.mock.calls[0]![0]).toMatchObject({ generationId: runs[0]!.task.generationId, document });
    await settled(async () => expect(await listCaptionVersions('owner', 'task')).toHaveLength(1));
    await settled(() => expect(container.querySelector('a[download]')?.getAttribute('download')).toBe('demo-v1.mp4'));
    expect(mocks.run).toHaveBeenCalledOnce();
  });
  it('keeps completed versions available when regeneration fails', async () => {
    await click(button('生成字幕视频')); await settled(() => expect(runs).toHaveLength(1)); await complete(0);
    await click(button('生成新版本'));
    expect(runs).toHaveLength(1);
    await click([...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find((button) => button.textContent === '确认生成')!); await settled(() => expect(runs).toHaveLength(2));
    await act(async () => runs[1]!.reject(new Error('Rendering failed')));
    await settled(() => expect(button('继续上次处理')).toBeTruthy());
    expect(await listCaptionVersions('owner', 'task')).toHaveLength(1);
    await choose('视频版本', '版本 1');
    await settled(() => expect(container.querySelector('video[data-scene-video]')).not.toBeNull());
  });
});

it('offers a fresh SFX attempt instead of resuming an unresolved paid receipt, retaining cached work', async () => {
  await act(async () => root.render(null));
  const task: CaptionTaskRecord = { ...fixture(), scene: 'sfx', stage: 'failed', generationId: 'failed-run', options: { ...fixture().options, sfx: { density: 'medium' } }, transcript: [{ start: 1, end: 3, text: 'Example' }], error: '上次操作结果尚未确认，已停止自动重试以避免重复计费。',
    workflow: { steps: [{ id: 'sfx-plan', status: 'failed', inputKey: 'plan-key' }] } as CaptionTaskRecord['workflow'],
    workflowData: { artifacts: {}, partials: {}, receipts: {
      'transcript-key': { status: 'completed', runId: 'failed-run', idempotencyKey: 'asr', outputs: {} },
      'plan-key': { status: 'running', runId: 'failed-run', idempotencyKey: 'sfx', usage: [{ source: 'server', reference: 'charged-request', credits: 1 }] },
    } },
  };
  await saveCaptionTask(task);
  await act(async () => root.render(createElement(CaptionTaskPage, { taskId: task.id, scene: 'sfx', locale: 'zh', onBack: vi.fn(), onOpenEditor: vi.fn() })));
  await settled(() => expect(button('重新匹配音效')).toBeTruthy());
  expect(button('继续上次处理')).toBeUndefined(); expect(container.textContent).toContain('可能产生匹配费用');
  expect(mocks.run).not.toHaveBeenCalled();
  await click(button('重新匹配音效')); await settled(() => expect(runs).toHaveLength(1));
  expect(runs[0].task.generationId).not.toBe(task.generationId);
  expect(runs[0].task.transcript).toEqual(task.transcript);
  expect(runs[0].task.workflowData).toEqual(task.workflowData);
  await complete(0);
});

it('keeps native SFX edits in a persisted draft and exports that draft without modifying the saved version', async () => {
  await act(async () => root.render(null));
  const { buildCaptionBaseDocument } = await import('@pireel/studio-engine/caption-task');
  const task: CaptionTaskRecord = { ...fixture(), scene: 'sfx', stage: 'completed', generationId: 'sfx-version', options: { ...fixture().options, sfx: { density: 'high' } } };
  task.document = buildCaptionBaseDocument({ projectId: task.id, sourceUrl: 'blob:source', sourceSig: task.sourceSig, width: task.width, height: task.height, durationSec: task.durationSec, transcript: [], options: task.options });
  await saveCaptionTask(task, new Blob(['version']));
  await act(async () => root.render(createElement(CaptionTaskPage, { taskId: task.id, scene: 'sfx', locale: 'zh', onBack: vi.fn(), onOpenEditor: vi.fn() })));
  await settled(() => expect(mocks.sfxPreview).toHaveBeenCalled());
  expect(container.querySelector('video[data-scene-video]')).toBeNull();
  const edited = structuredClone(task.document); edited.appearance.captionStyle = { on: false, scale: 1.1 };
  await act(async () => mocks.sfxPreview.mock.calls.at(-1)![0].onChange(edited));
  await vi.waitFor(async () => expect((await loadCaptionTask('owner', task.id))?.draftDocument).toEqual(edited));
  expect((await loadCaptionVersion('owner', task.id, 'sfx-version'))!.version.task.document).toEqual(task.document);
  mocks.exportEdit.mockResolvedValue(new Blob(['edited-export'])); vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  await click(button('导出')); await settled(() => expect(mocks.exportEdit).toHaveBeenCalled());
  expect(mocks.exportEdit.mock.calls[0][0].document).toEqual(edited); expect(mocks.run).not.toHaveBeenCalled();
  expect(await listCaptionVersions('owner', task.id)).toHaveLength(1);
});

it('keeps Continue for generated SFX because the server can reconcile its request', async () => {
  await act(async () => root.render(null));
  const task: CaptionTaskRecord = { ...fixture(), scene: 'sfx', stage: 'failed', generationId: 'failed-run', options: { ...fixture().options, sfx: { density: 'medium' } }, transcript: [{ start: 1, end: 3, text: 'Example' }],
    workflow: { definition: { steps: [{ id: 'sfx-generate', capability: 'sfx.generate' }] }, steps: [{ id: 'sfx-generate', status: 'failed', inputKey: 'generate-key' }] } as CaptionTaskRecord['workflow'],
    workflowData: { artifacts: {}, partials: {}, receipts: { 'generate-key': { status: 'running', runId: 'failed-run', idempotencyKey: 'sfx-generate' } } },
  };
  await saveCaptionTask(task);
  await act(async () => root.render(createElement(CaptionTaskPage, { taskId: task.id, scene: 'sfx', locale: 'zh', onBack: vi.fn(), onOpenEditor: vi.fn() })));
  await settled(() => expect(button('继续上次处理')).toBeTruthy());
  expect(button('重新匹配音效')).toBeUndefined(); expect(mocks.run).not.toHaveBeenCalled();
});

it('exposes removal settings without caption styling and disables generation until the service is configured', async () => {
  await act(async () => root.render(null));
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ available: false })));
  await saveCaptionTask({ ...fixture(), scene: 'subtitle-removal', options: { ...fixture().options, subtitleRemoval: { mode: 'auto' } } });
  await act(async () => root.render(createElement(CaptionTaskPage, { taskId: 'task', scene: 'subtitle-removal', locale: 'zh', onBack: vi.fn(), onOpenEditor: vi.fn() })));
  await settled(() => expect(container.textContent).toContain('擦除模式暂未开通'));
  expect(button('开始擦除').disabled).toBe(true);
  expect(container.querySelector('[aria-label="擦除范围"]')).not.toBeNull();
  expect(container.textContent).not.toContain('AI 去停顿'); expect(container.querySelector('[aria-label="翻译语言"]')).toBeNull();
});

it('preserves the combined targets when selecting and moving a fixed removal region', async () => {
  await act(async () => root.render(null));
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ available: true, modes: { subtitles: true, watermark: true, all: true, people: false } })));
  await saveCaptionTask({ ...fixture(), scene: 'subtitle-removal', options: { ...fixture().options, subtitleRemoval: { mode: 'auto' } } });
  await act(async () => root.render(createElement(CaptionTaskPage, { taskId: 'task', scene: 'subtitle-removal', locale: 'zh', onBack: vi.fn(), onOpenEditor: vi.fn() })));
  await settled(() => expect(button('开始擦除').disabled).toBe(false));
  await choose('擦除内容', '字幕与水印'); await choose('擦除范围', '限定区域');
  const overlay = container.querySelector<HTMLElement>('[aria-label="擦除区域"]')!;
  await act(async () => overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })));
  await click(button('开始擦除')); await settled(() => expect(runs).toHaveLength(1));
  expect(runs[0].task.options.subtitleRemoval).toMatchObject({ kind: 'all', mode: 'region', targets: ['subtitle', 'watermark'] });
  expect(runs[0].task.options.subtitleRemoval!.region!.y).toBeCloseTo(.71);
  await complete(0);
});

it('opens UGC ad settings and sends the verified brief to its own runner', async () => {
  await act(async () => root.render(null));
  const task: CaptionTaskRecord = { ...fixture(), scene: 'ugc-ad', options: { ...fixture().options, ugcAd: { productName: '', claim: '', callToAction: '', hook: '', angle: 'demo' }, broll: { assets: [], captions: true } } };
  await saveCaptionTask(task);
  await act(async () => root.render(createElement(CaptionTaskPage, { taskId: 'task', scene: 'ugc-ad', locale: 'zh', onBack: vi.fn(), onOpenEditor: vi.fn() })));
  await settled(() => expect(button('生成广告')).toBeTruthy());
  expect(button('生成广告').disabled).toBe(true);
  expect(container.querySelector('[aria-label="UGC 广告设置"]')).not.toBeNull();
  expect(container.textContent).toContain('商品画面（可选）');
  await act(async () => root.render(null));
  const ready = { ...task, options: { ...task.options, ugcAd: { ...task.options.ugcAd!, productName: '晨光杯', callToAction: '查看详情' } } };
  await saveCaptionTask(ready);
  await act(async () => root.render(createElement(CaptionTaskPage, { taskId: 'task', scene: 'ugc-ad', locale: 'zh', onBack: vi.fn(), onOpenEditor: vi.fn() })));
  await settled(() => expect(button('生成广告').disabled).toBe(false));
  await click(button('生成广告')); await settled(() => expect(runs).toHaveLength(1));
  expect(runs[0].task.scene).toBe('ugc-ad');
  expect(runs[0].task.options.ugcAd).toMatchObject({ productName: '晨光杯', callToAction: '查看详情' });
  expect(runs[0].task.options.broll?.assets).toEqual([]);
  await complete(0);
});

it('passes PiP position, size and framing choices into the official runner', async () => {
  await act(async () => root.render(null));
  await saveCaptionTask({ ...fixture(), scene: 'pip', options: { ...fixture().options, broll: { captions: false, pip: { template: 'presenter' }, assets: [{ id: 'asset', sig: 'footage', name: 'product.mp4', kind: 'video', durationSec: 5, width: 1920, height: 1080 }] } } });
  await act(async () => root.render(createElement(CaptionTaskPage, { taskId: 'task', scene: 'pip', locale: 'zh', onBack: vi.fn(), onOpenEditor: vi.fn() })));
  await settled(() => expect(button('生成视频')).toBeTruthy());
  await choose('小窗位置', '左下'); await choose('小窗大小', '大'); await choose('素材画面', '完整显示');
  await click(button('生成视频')); await settled(() => expect(runs).toHaveLength(1));
  expect(runs[0].task.options.broll?.pip).toEqual({ template: 'presenter', position: 'bottom-left', size: 'large', mediaFit: 'contain' });
  await complete(0);
});
