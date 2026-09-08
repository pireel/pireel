import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { CaptionTaskRecord } from './caption-task-store';
import { firstNarrativeAssetId } from '@pireel/studio-engine/composition';
const mocks = vi.hoisted(() => ({ asr: vi.fn(), translate: vi.fn(), render: vi.fn(), upload: vi.fn(), remote: vi.fn(), fetch: vi.fn(), wav: vi.fn() }));
const cache = new Map<string, File>();
vi.mock('./media', () => ({ fileSig: (file: File) => `${file.name}:${file.size}`, transcribeFile: mocks.asr, probeVideoFile: async () => ({ width: 1920, height: 1080, durationSec: 8, hasAudio: true }) }));
vi.mock('./local-media', () => ({ saveLocalVideo: async (file: File, sig: string) => { cache.set(sig, file); return true; }, loadLocalVideo: async (sig: string) => cache.get(sig) ?? null }));
vi.mock('@pireel/studio-engine/providers', () => ({ studioProviders: () => ({ translate: mocks.translate, uploads: { upload: mocks.upload } }) }));
vi.mock('./remote-media', () => ({ materializeRemoteMedia: mocks.remote }));
vi.mock('./audio-decode', () => ({ decodeAudioFile: async () => ({}), toMono: async () => new Float32Array(6 * 24000).fill(.2) }));
vi.mock('./time-stretch', () => ({ signalsmithStretch: vi.fn(), tiledStretch: () => async () => [new Float32Array(6 * 24000)] }));
vi.mock('./denoise', () => ({ encodeWavMono: mocks.wav }));
vi.mock('./client-export', () => ({ clientExportVideo: mocks.render }));
import { runDubbingTask } from './dubbing-task-runner';
const task = (): CaptionTaskRecord => ({ id: 'task', scope: 'owner', scene: 'dubbing', generationId: 'run', name: 'source.mp4', sourceSig: 'original', width: 1920, height: 1080, durationSec: 8, stage: 'ready', updatedAt: 0, options: { presetId: 'clean', aspect: 'original', shortenPauses: false, dubbing: { language: 'English', voiceId: 'voice', lipSync: false } } });
const file = new File(['video'], 'source.mp4', { type: 'video/mp4' });
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
beforeEach(() => {
  vi.clearAllMocks(); cache.clear();
  mocks.wav.mockImplementation((data: Float32Array) => new Blob([new Float32Array(data).buffer], { type: 'audio/wav' })); vi.stubGlobal('fetch', mocks.fetch);
  mocks.asr.mockResolvedValue([{ text: '你好', start: 1, end: 7 }]);
  mocks.translate.mockResolvedValue([{ index: 0, text: 'Hello' }]);
  mocks.fetch.mockImplementation(async () => response({ status: 'succeeded', asset: { url: 'https://own/speech.mp3', key: 'uploads/owner/speech.mp3', durationSec: 6 } }));
  mocks.render.mockResolvedValue(new Blob(['dubbed video'], { type: 'video/mp4' }));
  mocks.remote.mockImplementation(async () => ({ file: new File(['remote'], 'media.mp3'), sig: 'remote' }));
  mocks.upload.mockImplementation(async (_file, options) => ({ key: `uploads/owner/${options.filename}`, url: `https://own/${options.filename}` }));
});
afterEach(() => vi.unstubAllGlobals());
describe('standalone video dubbing', () => {
  it('replaces source audio, creates a native output, and reuses completed speech on retry', async () => {
    const records: CaptionTaskRecord[] = []; const hooks = { signal: new AbortController().signal, checkpoint: async (record: CaptionTaskRecord) => { records.push(structuredClone(record)); }, progress: vi.fn() };
    const result = await runDubbingTask(task(), file, hooks);
    expect(records.map((record) => record.stage)).toEqual(['transcribing', 'translating', 'voicing', 'voicing', 'aligning', 'rendering']);
    const render = mocks.render.mock.calls[0]![0];
    expect(render.comp.shots.every((shot: { src?: string }) => !shot.src || render.clipFiles.get(shot.src) === file)).toBe(true);
    expect(render.comp.shots.every((shot: { audioMuted: boolean }) => shot.audioMuted)).toBe(true);
    expect(render.comp.audioTracks[0]).toMatchObject({ role: 'narration', volumeDb: 0, durationSec: 8 });
    expect(result.task.sourceSig).toBe('original');
    expect(result.task.document!.assets[firstNarrativeAssetId(result.task.document!)!]?.locator.localSig).toBe(result.task.dubbing?.outputSig);
    await runDubbingTask(result.task, file, hooks);
    expect(mocks.fetch).toHaveBeenCalledOnce(); expect(mocks.asr).toHaveBeenCalledOnce(); expect(mocks.translate).toHaveBeenCalledOnce();
  });
  it('does not synthesize when translations are incomplete or the run is cancelled', async () => {
    mocks.translate.mockResolvedValueOnce([]);
    await expect(runDubbingTask(task(), file, { signal: new AbortController().signal, checkpoint: async () => {}, progress: vi.fn() })).rejects.toThrow('不完整');
    expect(mocks.fetch).not.toHaveBeenCalled();
    const controller = new AbortController(); controller.abort();
    await expect(runDubbingTask(task(), file, { signal: controller.signal, checkpoint: async () => {}, progress: vi.fn() })).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('persists a lip job before polling and uses its picture with our aligned voice', async () => {
    const source = task(); source.options.dubbing!.lipSync = true;
    mocks.fetch.mockImplementation(async (url) => String(url).includes('dubbing-speech') ? response({ status: 'succeeded', asset: { url: 'https://own/speech.mp3', key: 'uploads/owner/speech.mp3', durationSec: 6 } }) : String(url).includes('?id=') ? response({ status: 'succeeded', url: 'https://fal.media/output.mp4' }) : response({ id: 'lip-job', status: 'pending' }));
    const records: CaptionTaskRecord[] = [];
    await runDubbingTask(source, file, { signal: new AbortController().signal, checkpoint: async (record) => { records.push(structuredClone(record)); }, progress: vi.fn() });
    expect(records.some((record) => record.dubbing?.lipJobId === 'lip-job' && !record.dubbing.lipResultUrl)).toBe(true);
    expect(mocks.remote).toHaveBeenCalledWith('https://fal.media/output.mp4', expect.any(Object));
    expect(mocks.render.mock.calls[0]![0].comp.audioTracks[0].volumeDb).toBe(0);
  });
});

it('resumes long-script speech chunks without paying for completed parts again', async () => {
  const source = task(); source.durationSec = 14;
  source.options.dubbing!.script = 'a'.repeat(5001);
  mocks.asr.mockResolvedValue([{ text: '原文', start: 1, end: 13 }]);
  const saved: CaptionTaskRecord[] = [];
  const hooks = { signal: new AbortController().signal, checkpoint: async (record: CaptionTaskRecord) => { saved.push(structuredClone(record)); }, progress: vi.fn() };
  mocks.fetch.mockImplementationOnce(async () => response({ status: 'succeeded', asset: { url: 'https://own/part0.mp3', key: 'part0', durationSec: 6 } })).mockRejectedValueOnce(new Error('Connection lost'));
  await expect(runDubbingTask(source, file, hooks)).rejects.toThrow('Connection lost');
  expect(saved.at(-1)!.dubbing!.speechParts).toHaveLength(1);
  await runDubbingTask(saved.at(-1)!, file, hooks);
  const requests = mocks.fetch.mock.calls.map(([, init]) => JSON.parse(init.body));
  expect(requests.map((request) => request.chunkIndex)).toEqual([0, 1, 1]);
  expect(requests[0].text + requests[1].text).toBe(source.options.dubbing!.script);
  expect(mocks.render.mock.calls[0][0].comp.audioTracks[0].durationSec).toBe(14);
});

it('persists identified speakers and pauses before translation or TTS until voices are assigned', async () => {
  const source = task(); source.durationSec = 14;
  mocks.asr.mockResolvedValue([{ text: 'a', start: 0, end: 6, speaker: 'a' }, { text: 'b', start: 8, end: 14, speaker: 'b' }]);
  const saved: CaptionTaskRecord[] = [];
  await expect(runDubbingTask(source, file, { signal: new AbortController().signal, checkpoint: async (record) => { saved.push(structuredClone(record)); }, progress: vi.fn() })).rejects.toMatchObject({ code: 'dubbing_setup_required' });
  expect(saved.at(-1)).toMatchObject({ stage: 'ready', transcript: [{ speaker: 'a' }, { speaker: 'b' }] });
  expect(mocks.translate).not.toHaveBeenCalled(); expect(mocks.fetch).not.toHaveBeenCalled();
});
it('generates each speaker voice at the original turn times and preserves silence', async () => {
  const source = task(); source.durationSec = 14;
  source.options.dubbing!.speakerVoices = { 'speaker:a': 'voice-a', 'speaker:b': 'voice-b' };
  mocks.asr.mockResolvedValue([{ text: 'a', start: 0, end: 6, speaker: 'a' }, { text: 'b', start: 8, end: 14, speaker: 'b' }]);
  mocks.translate.mockResolvedValue([{ index: 0, text: 'Hello A' }, { index: 1, text: 'Hello B' }]);
  const hooks = { signal: new AbortController().signal, checkpoint: async () => {}, progress: vi.fn() };
  const result = await runDubbingTask(source, file, hooks);
  expect(mocks.fetch.mock.calls.map(([, init]) => JSON.parse(init.body).voiceId)).toEqual(['voice-a', 'voice-b']);
  const pcm = mocks.wav.mock.calls[0][0] as Float32Array;
  expect(pcm.length).toBe(14 * 24000); expect(pcm[24000]).toBeCloseTo(.2); expect(pcm[7 * 24000]).toBe(0); expect(pcm[9 * 24000]).toBeCloseTo(.2);
  await runDubbingTask(result.task, file, hooks);
  expect(mocks.fetch).toHaveBeenCalledTimes(2); expect(mocks.translate).toHaveBeenCalledOnce();
});
it('keeps multi-speaker lip sync out of the paid submission path', async () => {
  const source = task(); source.durationSec = 14; source.options.dubbing!.lipSync = true;
  source.options.dubbing!.speakerVoices = { 'speaker:a': 'voice-a', 'speaker:b': 'voice-b' };
  mocks.asr.mockResolvedValue([{ text: 'a', start: 0, end: 6, speaker: 'a' }, { text: 'b', start: 8, end: 14, speaker: 'b' }]);
  await expect(runDubbingTask(source, file, { signal: new AbortController().signal, checkpoint: async () => {}, progress: vi.fn() })).rejects.toMatchObject({ code: 'dubbing_setup_required' });
  expect(mocks.fetch).not.toHaveBeenCalled(); expect(mocks.upload).not.toHaveBeenCalled();
});

it('mixes overlapping speaker turns instead of overwriting either voice', async () => {
  const source = task(); source.durationSec = 9;
  source.options.dubbing!.speakerVoices = { 'speaker:a': 'voice-a', 'speaker:b': 'voice-b' };
  mocks.asr.mockResolvedValue([{ text: 'a', start: 0, end: 6, speaker: 'a' }, { text: 'b', start: 3, end: 9, speaker: 'b' }]);
  mocks.translate.mockResolvedValue([{ index: 0, text: 'Hello A' }, { index: 1, text: 'Hello B' }]);
  await runDubbingTask(source, file, { signal: new AbortController().signal, checkpoint: async () => {}, progress: vi.fn() });
  const pcm = mocks.wav.mock.calls[0][0] as Float32Array;
  expect(pcm[24000]).toBeCloseTo(.2); expect(pcm[4 * 24000]).toBeCloseTo(.4); expect(pcm[8 * 24000]).toBeCloseTo(.2);
});
