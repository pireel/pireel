import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CaptionTaskRecord } from './caption-task-store';
const mocks = vi.hoisted(() => ({ files: new Map<string, File>(), asr: vi.fn(), render: vi.fn(), backup: vi.fn(), probe: vi.fn() }));
vi.mock('./media', () => ({ probeVideoFile: mocks.probe, durableFileSig: async () => 'clean-output', transcribeFile: mocks.asr }));
vi.mock('./local-media', () => ({ loadLocalVideo: async (sig: string) => mocks.files.get(sig) ?? null, saveLocalVideo: async (file: File, sig: string) => { mocks.files.set(sig, file); return true; } }));
vi.mock('./caption-task-store', () => ({ loadCaptionMedia: async (_scope: string, sig: string) => mocks.files.get(sig) ?? null }));
vi.mock('./remote-media', () => ({ materializeRemoteMedia: async () => ({ file: new File(['clean'], 'clean.mp4', { type: 'video/mp4' }), sig: 'temporary' }) }));
vi.mock('./client-export', () => ({ clientExportVideo: mocks.render }));
vi.mock('@pireel/studio-engine/providers', () => ({ studioProviders: () => ({ sceneProjects: { owner: async () => 'owner' }, vault: { backup: mocks.backup } }) }));
import { runSubtitleRemovalTask } from './subtitle-removal-runner';
const fixture = (): CaptionTaskRecord => ({ id: 'removal', scene: 'subtitle-removal', scope: 'owner', generationId: 'first', name: 'source.mp4', sourceSig: 'source', width: 640, height: 360, durationSec: 20, stage: 'ready', updatedAt: 1, options: { presetId: 'clean', aspect: 'original', shortenPauses: false, subtitleRemoval: { mode: 'auto' } } });
const hooks = () => ({ signal: new AbortController().signal, checkpoint: async () => {}, progress: vi.fn() });
beforeEach(() => { vi.clearAllMocks(); mocks.files.clear(); mocks.backup.mockResolvedValue(true); mocks.probe.mockResolvedValue({ width: 640, height: 360, durationSec: 20, hasAudio: true }); });
afterEach(() => vi.unstubAllGlobals());
it.each([undefined, 'watermark', 'all'] as const)('uses the clean result without ASR or re-encoding for %s', async kind => {
  const fetch = vi.fn(async (_url, request) => JSON.parse(request.body).action === 'finish' ? Response.json({ status: 'completed' }) : Response.json({ status: 'saving', url: 'https://output.test/video.mp4', durationSec: 20, usage: { source: 'server', reference: 'erase1', credits: 5 } })); vi.stubGlobal('fetch', fetch);
  const task = fixture(); if (kind) task.options.subtitleRemoval = { kind, mode: 'auto' };
  const result = await runSubtitleRemovalTask(task, new File(['source'], 'source.mp4'), hooks());
  expect(await result.video.text()).toBe('clean'); expect(result.task.stage).toBe('completed');
  expect(Object.values(result.task.document!.assets).map(asset => asset.locator.localSig)).toContain('clean-output');
  expect(result.task.sourceSig).toBe('source'); expect(result.task.document!.timeline.tracks.some(track => track.type === 'caption')).toBe(false);
  expect(mocks.backup).toHaveBeenCalledWith(expect.any(File), 'clean-output'); expect(mocks.asr).not.toHaveBeenCalled(); expect(mocks.render).not.toHaveBeenCalled();
  const count = fetch.mock.calls.length;
  await runSubtitleRemovalTask(result.task, new File(['source'], 'source.mp4'), hooks());
  expect(fetch).toHaveBeenCalledTimes(count);
});
it('continues with the original request identity after a lost response', async () => {
  let attempt = 0; const ids: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_url, request) => { const body = JSON.parse(request.body); if (body.action === 'finish') return Response.json({ status: 'completed' }); ids.push(body.requestId); if (++attempt === 1) throw new Error('lost response'); return Response.json({ status: 'saving', url: 'https://output.test/video.mp4' }); }));
  let saved = fixture(); const source = new File(['source'], 'source.mp4');
  await expect(runSubtitleRemovalTask(saved, source, { ...hooks(), checkpoint: async task => { saved = structuredClone(task); } })).rejects.toThrow('lost response');
  await runSubtitleRemovalTask(saved, source, hooks());
  expect(ids).toHaveLength(2); expect(ids[0]).toBe(ids[1]);
});
it('rejects truncated or silent results instead of saving them as successful versions', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ status: 'saving', url: 'https://output.test/video.mp4' })));
  for (const output of [{ width: 640, height: 360, durationSec: 5, hasAudio: true }, { width: 640, height: 360, durationSec: 20, hasAudio: false }]) {
    mocks.probe.mockResolvedValueOnce({ ...output, durationSec: 20, hasAudio: true }).mockResolvedValueOnce(output);
    await expect(runSubtitleRemovalTask(fixture(), new File(['s'], 'source.mp4'), hooks())).rejects.toThrow(/时长|音轨/);
  }
  expect(mocks.backup).not.toHaveBeenCalled();
});
