import { audioClipGainAt } from '@pireel/studio-engine/audio-tracks';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const LEGACY_SFX_OPTIONS = { style: 'soft' as const, maxCount: 4, volumeDb: -18, captions: false };
import type { CaptionTaskRecord } from './caption-task-store';
const mock = vi.hoisted(() => ({ asr: vi.fn(), render: vi.fn(), files: new Map<string, File>(), backup: vi.fn() }));
vi.mock('./media', () => ({ transcribeFile: mock.asr, durableFileSig: async () => 'sfx-output' }));
vi.mock('./local-media', () => ({ saveLocalVideo: async (file: File, sig: string) => { mock.files.set(sig, file); return true; }, loadLocalVideo: async (sig: string) => mock.files.get(sig) ?? null }));
vi.mock('./caption-task-store', () => ({ loadCaptionMedia: async (_scope: string, sig: string) => mock.files.get(sig) ?? null }));
vi.mock('./audio-decode', () => ({ decodeAudioFile: async () => ({}), toMono: async () => Float32Array.from({ length: 144000 }, (_, i) => .4 * Math.sin(i * .12)), decodeVideoAudio: async () => ({ numberOfChannels: 1, sampleRate: 1000, getChannelData: () => Float32Array.from({ length: 20000 }, (_, i) => .2 * Math.sin(i * .5)) }) }));
vi.mock('./sfx-library-media', () => ({ loadSfxLibrarySound: async () => Float32Array.from({ length: 14400 }, (_, i) => .5 * Math.sin(i * .12)) }));
vi.mock('./client-export', () => ({ clientExportVideo: mock.render }));
vi.mock('./web-fonts', () => ({ loadFont: async () => {} }));
vi.mock('@pireel/studio-engine/providers', () => ({ studioProviders: () => ({ sceneProjects: { owner: async () => 'owner' }, vault: { backup: mock.backup } }) }));
import { runSfxTask, exportSfxEdit } from './sfx-task-runner';
const fixture = (): CaptionTaskRecord => ({ id: 'sfx', scene: 'sfx', scope: 'owner', name: 'source.mp4', sourceSig: 'source', width: 640, height: 360, durationSec: 20, stage: 'ready', updatedAt: 1, options: { caption: {}, aspect: 'original', shortenPauses: false, sfx: { ...LEGACY_SFX_OPTIONS } } });
const hooks = () => ({ signal: new AbortController().signal, checkpoint: async () => {}, progress: vi.fn() });
beforeEach(() => {
  vi.clearAllMocks(); mock.files.clear(); mock.backup.mockResolvedValue(true);
  mock.asr.mockResolvedValue([{ start: 1, end: 3, text: '第一，保持专注' }, { start: 11, end: 13, text: '最后，记得休息' }]);
  mock.render.mockResolvedValue(new Blob(['mp4'], { type: 'video/mp4' }));
});
afterEach(() => vi.unstubAllGlobals());
it('creates independent audible SFX, keeps narration, backs up derived audio and skips captions by default', async () => {
  const task = fixture(); const original = structuredClone(task); const source = new File(['source'], 'source.mp4');
  const result = await runSfxTask(task, source, hooks());
  expect(task).toEqual(original); expect(result.task.scene).toBe('sfx'); expect(result.task.workflow?.definition.id).toBe('official-auto-sfx');
  expect(result.task.workflow?.steps.map(step => step.id)).toEqual(['transcript', 'compose', 'sfx']);
  expect(mock.render).not.toHaveBeenCalled(); expect(result.video).toBeUndefined();
  await exportSfxEdit(result.task, source, hooks());
  const rendered = mock.render.mock.calls[0][0];
  expect(rendered.videoFile).toBe(source); expect(rendered.comp.shots[0]).toMatchObject({ srcStart: 0, srcEnd: 20 });
  expect(rendered.audio).toHaveLength(2);
  expect(rendered.audio.map((item: { clip: { startSec: number } }) => item.clip.startSec)).toEqual([1, 11]);
  expect(rendered.audio[0].file.type).toBe('audio/wav'); expect(rendered.audio[0].file.size).toBeGreaterThan(44);
  expect(audioClipGainAt(rendered.audio[0].clip, 1.1, 20)).toBeCloseTo(10 ** (-18 / 20)); expect(mock.backup).toHaveBeenCalled();
  expect(result.task.document?.timeline.tracks.find(track => track.role === 'sfx')?.clips).toHaveLength(2);
});
it('reuses ASR when changing sound settings, and pure export does not plan, charge or alter history', async () => {
  const source = new File(['source'], 'source.mp4');
  const first = await runSfxTask(fixture(), source, hooks());
  first.task.options.sfx = { ...LEGACY_SFX_OPTIONS, style: 'whoosh', volumeDb: -25, maxCount: 1 };
  const second = await runSfxTask(first.task, source, hooks());
  const before = structuredClone(second.task); mock.backup.mockClear();
  await exportSfxEdit(second.task, source, hooks());
  expect(mock.asr).toHaveBeenCalledOnce(); expect(mock.render.mock.calls[0][0].audio).toHaveLength(1);
  expect(mock.render.mock.calls[0][0].audio[0].clip.volumeDb).toBe(-25);
  expect(mock.backup).not.toHaveBeenCalled(); expect(second.task).toEqual(before);
});
it('supports optional captions and rejects bad configuration before recognition', async () => {
  const task = fixture(); task.options.sfx = { ...LEGACY_SFX_OPTIONS, captions: true };
  const result = await runSfxTask(task, new File(['s'], 'source.mp4'), hooks());
  expect(result.task.workflow?.steps.map(step => step.id)).toContain('captions');
  task.options.sfx = { ...LEGACY_SFX_OPTIONS, maxCount: 1.5 }; mock.asr.mockClear();
  await expect(runSfxTask(task, new File(['s'], 'source.mp4'), hooks())).rejects.toThrow('音效配置'); expect(mock.asr).not.toHaveBeenCalled();
});
it('lets AI independently match sound and volume per cue, caches the plan and includes density in its identity', async () => {
  const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => Response.json({ placements: [{ cueId: 0, start: 1, style: 'soft', volumeDb: -18, soundId: 'confirmation-001', intensity: 'gentle' }, { cueId: 1, start: 11, style: 'whoosh', volumeDb: -18, soundId: 'maximize-003', intensity: 'emphasis' }], usage: { source: 'server', reference: 'sfx-llm', credits: 1 } }));
  vi.stubGlobal('fetch', fetch);
  const task = fixture(); task.options.sfx = { density: 'medium' }; const source = new File(['s'], 'source.mp4');
  const result = await runSfxTask(task, source, hooks()); await exportSfxEdit(result.task, source, hooks());
  const rendered = mock.render.mock.calls[0][0];
  expect(rendered.audio.map((item: { clip: { label: string } }) => item.clip.label)).toEqual(['confirmation-001--gentle.wav', 'maximize-003--emphasis.wav']);
  expect(rendered.audio.map((item: { clip: { volumeDb: number } }) => item.clip.volumeDb)).toEqual([0, 0]);
  expect(JSON.parse(fetch.mock.calls[0][1]!.body as string).density).toBe('medium');
  await runSfxTask(result.task, source, hooks()); expect(fetch).toHaveBeenCalledOnce(); expect(mock.asr).toHaveBeenCalledOnce();
  result.task.options.sfx = { density: 'low' }; const low = await runSfxTask(result.task, source, hooks()); expect(fetch).toHaveBeenCalledTimes(2);
  await exportSfxEdit(low.task, source, hooks()); expect(mock.render.mock.calls[1][0].audio).toHaveLength(2);
});
it('keeps the original when AI selects silence and never substitutes a rule-based plan on failure', async () => {
  const fetch = vi.fn(async () => Response.json({ placements: [] })); vi.stubGlobal('fetch', fetch);
  const task = fixture(); task.options.sfx = { density: 'high' };
  const first = await runSfxTask(task, new File(['s'], 'source.mp4'), hooks());
  await exportSfxEdit(first.task, new File(['s'], 'source.mp4'), hooks()); expect(mock.render.mock.calls[0][0].audio).toEqual([]);
  fetch.mockResolvedValueOnce(Response.json({ error: 'AI 匹配失败' }, { status: 502 })); task.options.sfx = { density: 'low' };
  await expect(runSfxTask(task, new File(['s'], 'source.mp4'), hooks())).rejects.toThrow('AI 匹配失败');
  expect(mock.render).toHaveBeenCalledOnce(); expect(first.task.document).toBeTruthy();
});

it('blocks replay of an unresolved attempt but completes an explicit new attempt without repeating ASR', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ error: 'AI 音效匹配未完成，请重试。', usage: { source: 'server', reference: 'charged-failed', credits: 1 } }, { status: 502 })).mockResolvedValue(Response.json({ placements: [] }));
  vi.stubGlobal('fetch', fetch);
  const task = fixture(); task.options.sfx = { density: 'medium' }; const source = new File(['s'], 'source.mp4');
  let saved: CaptionTaskRecord = task;
  await expect(runSfxTask(task, source, { ...hooks(), checkpoint: async value => { saved = structuredClone(value); } })).rejects.toThrow('AI 音效匹配');
  const failed = structuredClone(saved);
  await expect(runSfxTask(failed, source, hooks())).rejects.toThrow('结果尚未确认');
  expect(fetch).toHaveBeenCalledOnce();
  const completed = await runSfxTask({ ...failed, generationId: 'explicit-retry' }, source, hooks());
  expect(completed.task.stage).toBe('completed'); expect(fetch).toHaveBeenCalledTimes(2); expect(mock.asr).toHaveBeenCalledOnce();
  expect(Object.values(failed.workflowData!.receipts).some(receipt => receipt.usage?.some(usage => usage.reference === 'charged-failed'))).toBe(true);
});
it('upgrades old sounds locally while preserving source, timing, mute state and the original document', async () => {
  const source = new File(['source'], 'source.mp4'); const result = await runSfxTask(fixture(), source, hooks());
  const old = structuredClone(result.task.document!); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const { optimizeSfxAudio } = await import('./sfx-audio-render');
  const next = await optimizeSfxAudio(result.task, source, new AbortController().signal);
  expect(result.task.document).toEqual(old); expect(fetch).not.toHaveBeenCalled();
  const track = next.timeline.tracks.find(track => track.role === 'sfx')!;
  expect(track.clips.map(clip => clip.startFrame)).toEqual(old.timeline.tracks.find(track => track.role === 'sfx')!.clips.map(clip => clip.startFrame));
  expect(track.clips).toHaveLength(2);
  expect(Object.values(next.assets).some(asset => asset.label?.includes('--normal.wav'))).toBe(true);
});
it('renders all three closely spaced list accents without a client-side density filter', async () => {
  const starts = [1, 1.3, 1.6];
  mock.asr.mockResolvedValueOnce([{ start: 1, end: 3, text: '第一，第二，第三', words: starts.map((start, i) => ({ start, end: start + .2, text: String(i) })) }]);
  const fetch = vi.fn(async () => Response.json({ placements: starts.map((start, wordId) => ({ cueId: 0, wordId, start, style: 'soft', volumeDb: -18, soundId: 'confirmation-001', intensity: 'normal' })) }));
  vi.stubGlobal('fetch', fetch);
  const task = fixture(); task.options.sfx = { density: 'low' };
  const listed = await runSfxTask(task, new File(['s'], 'source.mp4'), hooks()); await exportSfxEdit(listed.task, new File(['s'], 'source.mp4'), hooks());
  const audio = mock.render.mock.calls[0][0].audio;
  expect(audio).toHaveLength(3);
  expect(audio.map((item: { clip: { startSec: number } }) => item.clip.startSec)).toEqual(starts);
  expect(audio.every((item: { clip: { label: string } }) => item.clip.label === 'confirmation-001--normal.wav')).toBe(true);
});

it('generates a missing sound once, reuses it at multiple moments and preserves its full duration in export', async () => {
  const generate = { prompt: 'wood door creak', reason: 'No wood sounds', durationSec: 3 };
  const fetch = vi.fn(async (url: string) => url.endsWith('sfx-plan')
    ? Response.json({ placements: [1, 11].map((start, cueId) => ({ cueId, start, style: 'soft', volumeDb: -18, intensity: 'normal', generate })) })
    : url === '/api/studio/sfx'
      ? Response.json({ asset: { id: 'cre_' + 'a'.repeat(32), durationSec: 3 }, usage: { credits: 3, reference: 'generated-one', source: 'server' } })
      : new Response('mp3', { headers: { 'Content-Type': 'audio/mpeg' } }));
  vi.stubGlobal('fetch', fetch);
  const task = fixture(); task.options.sfx = { density: 'medium' };
  const source = new File(['s'], 'source.mp4');
  const result = await runSfxTask(task, source, hooks());
  expect(fetch.mock.calls.filter(([url]) => url === '/api/studio/sfx')).toHaveLength(1);
  expect(fetch.mock.calls.filter(([url]) => url.includes('?asset='))).toHaveLength(1);
  await exportSfxEdit(result.task, source, hooks());
  const audio = mock.render.mock.calls[0][0].audio;
  expect(audio).toHaveLength(2);
  expect(audio.every((row: { clip: { durationSec: number } }) => row.clip.durationSec > 2.9)).toBe(true);
  expect(Object.values(result.task.workflowData!.receipts).flatMap(row => row.usage ?? []).filter(row => row.reference === 'generated-one')).toHaveLength(1);
  const calls = fetch.mock.calls.length;
  await exportSfxEdit(result.task, source, hooks());
  expect(fetch).toHaveBeenCalledTimes(calls);
});
it('continues an uncertain generation using its original request ID without repeating planning', async () => {
  const generate = { prompt: 'wood door creak', reason: 'No wood sounds', durationSec: 3 };
  let attempts = 0;
  const fetch = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith('sfx-plan')) return Response.json({ placements: [{ cueId: 0, start: 1, style: 'soft', volumeDb: -18, intensity: 'normal', generate }] });
    if (url === '/api/studio/sfx') {
      if (++attempts === 1) throw new Error('network disconnected');
      return Response.json({ asset: { id: 'cre_' + 'b'.repeat(32), durationSec: 3 } });
    }
    return new Response('mp3', { headers: { 'Content-Type': 'audio/mpeg' } });
  });
  vi.stubGlobal('fetch', fetch);
  const task = fixture(); task.options.sfx = { density: 'medium' }; task.generationId = 'same-run';
  let saved = task; const source = new File(['s'], 'source.mp4');
  await expect(runSfxTask(task, source, { ...hooks(), checkpoint: async value => { saved = structuredClone(value); } })).rejects.toThrow('disconnected');
  const completed = await runSfxTask(saved, source, hooks());
  const requests = fetch.mock.calls.filter(([url]) => url === '/api/studio/sfx').map(([, options]) => JSON.parse(options!.body as string).requestId);
  expect(requests).toHaveLength(2); expect(requests[0]).toBe(requests[1]);
  expect(fetch.mock.calls.filter(([url]) => url.endsWith('sfx-plan'))).toHaveLength(1);
  expect(completed.task.stage).toBe('completed');
});
