import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { CaptionTaskRecord } from './caption-task-store';
import { firstNarrativeAssetId } from '@pireel/studio-engine/composition';
const mocks = vi.hoisted(() => ({ asr: vi.fn(), translate: vi.fn(), render: vi.fn(), upload: vi.fn(), remote: vi.fn(), fetch: vi.fn(), wav: vi.fn() }));
const cache = new Map<string, File>();
vi.mock('./media', () => ({ durableFileSig: async () => 'rendered-sig', fileSig: (file: File) => `${file.name}:${file.size}`, transcribeFile: mocks.asr, probeVideoFile: async () => ({ width: 1920, height: 1080, durationSec: 8, hasAudio: true }) }));
vi.mock('./local-media', () => ({ saveLocalVideo: async (file: File, sig: string) => { cache.set(sig, file); return true; }, loadLocalVideo: async (sig: string) => cache.get(sig) ?? null }));
vi.mock('@pireel/studio-engine/providers', () => ({ studioProviders: () => ({ translate: mocks.translate, uploads: { upload: mocks.upload } }) }));
vi.mock('./remote-media', () => ({ materializeRemoteMedia: mocks.remote }));
vi.mock('./audio-decode', () => ({ decodeAudioFile: async () => ({}), toMono: async () => new Float32Array(6 * 24000).fill(.2) }));
vi.mock('./time-stretch', () => ({ signalsmithStretch: vi.fn(), tiledStretch: () => async () => [new Float32Array(6 * 24000)] }));
vi.mock('./denoise', () => ({ encodeWavMono: mocks.wav }));
vi.mock('./client-export', () => ({ clientExportVideo: mocks.render }));
import { runDubbingTask as generateDubbing } from './dubbing-task-runner';
import { exportCaptionEdit } from './caption-task-runner';
import type { SceneWorkflowHooks } from './scene-workflow-runtime';
/** Generation, then the download-time render, as the scene page does. */
async function runDubbingTask(source: CaptionTaskRecord, input: File, hooks: SceneWorkflowHooks) {
  const generated = await generateDubbing(source, input, hooks);
  return { ...generated, video: await exportCaptionEdit(generated.task, input, hooks) };
}
const task = (): CaptionTaskRecord => ({ id: 'task', scope: 'owner', scene: 'dubbing', generationId: 'run', name: 'source.mp4', sourceSig: 'original', width: 1920, height: 1080, durationSec: 8, stage: 'ready', updatedAt: 0, options: { caption: {}, aspect: 'original', shortenPauses: false, dubbing: { language: 'English', voiceId: 'voice', lipSync: false } } });
const file = new File(['video'], 'source.mp4', { type: 'video/mp4' });
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
beforeEach(() => {
  vi.clearAllMocks(); cache.clear();
  mocks.wav.mockImplementation((data: Float32Array) => new Blob([new Float32Array(data).buffer], { type: 'audio/wav' })); vi.stubGlobal('fetch', mocks.fetch);
  mocks.asr.mockImplementation(async (_file, options) => {
    // Real transcription reports progress even when it returns a cached result.
    options?.onPhase?.('checking');
    await Promise.resolve();
    options?.onPhase?.('recognizing');
    options?.onPhase?.('aligning');
    return [{ text: '你好', start: 1, end: 7 }];
  });
  mocks.translate.mockResolvedValue([{ index: 0, text: 'Hello' }]);
  mocks.fetch.mockImplementation(async () => response({ status: 'succeeded', asset: { url: 'https://own/speech.mp3', key: 'uploads/owner/speech.mp3', durationSec: 6 } }));
  mocks.render.mockResolvedValue(new Blob(['dubbed video'], { type: 'video/mp4' }));
  mocks.remote.mockImplementation(async () => ({ file: new File(['remote'], 'media.mp3'), sig: 'remote' }));
  mocks.upload.mockImplementation(async (_file, options) => ({ key: `uploads/owner/${options.filename}`, url: `https://own/${options.filename}` }));
});
afterEach(() => vi.unstubAllGlobals());
describe('standalone video dubbing', () => {
  it('renders captions aligned to the dubbed audio and reuses them when changing styles', async () => {
    const source = task(); source.options.dubbing!.captions = true;
    mocks.asr.mockImplementation(async (input, options) => {
      options.onPhase('recognizing');
      return input.type === 'audio/wav' ? [{ text: 'Hello world', start: 1, end: 7, words: [{ text: 'Hello', start: 1, end: 3 }, { text: 'world', start: 3, end: 7 }] }] : [{ text: '你好世界', start: 1, end: 7 }];
    });
    const hooks = { signal: new AbortController().signal, checkpoint: async () => {}, progress: vi.fn() };
    const first = await runDubbingTask(source, file, hooks);
    const comp = mocks.render.mock.calls[0][0].comp;
    expect(JSON.stringify(comp)).toContain('Hello world');
    expect(JSON.stringify(comp)).not.toContain('你好世界');
    expect(comp.audioTracks[0].role).toBe('narration');
    expect(first.task.dubbing?.captionTranscript?.[0].text).toBe('Hello world');
    first.task.options.caption = { preset: 'style-outline' };
    await runDubbingTask(first.task, file, hooks);
    expect(mocks.asr).toHaveBeenCalledTimes(2);
    expect(mocks.fetch).toHaveBeenCalledOnce();
  });
  it('replaces source audio, creates a native output, and reuses completed speech on retry', async () => {
    const records: CaptionTaskRecord[] = []; const hooks = { signal: new AbortController().signal, checkpoint: async (record: CaptionTaskRecord) => { records.push(structuredClone(record)); }, progress: vi.fn() };
    const result = await runDubbingTask(task(), file, hooks);
    expect(result.task.transcript).toEqual([{ text: '你好', start: 1, end: 7 }]);
    expect(records.find((record) => record.stage === 'translating')?.transcript).toEqual(result.task.transcript);
    expect([...new Set(records.map(record => record.stage))].filter(stage => stage !== 'ready')).toEqual(['transcribing', 'translating', 'voicing', 'aligning']);
    expect(result.task.workflow?.definition.id).toBe('official-dubbing');
    const render = mocks.render.mock.calls[0]![0];
    expect(render.audio).toHaveLength(1);
    expect(render.audio[0].clip).toEqual(render.comp.audioTracks[0]);
    expect(render.audio[0].file.type).toBe('audio/wav');
    expect(render.audio[0].file.size).toBeGreaterThan(0);
    expect(render.comp.shots.every((shot: { src?: string }) => !shot.src || render.clipFiles.get(shot.src) === file)).toBe(true);
    expect(render.comp.shots.every((shot: { audioMuted: boolean }) => shot.audioMuted)).toBe(true);
    expect(render.comp.audioTracks[0]).toMatchObject({ role: 'narration', volumeDb: 0, durationSec: 8 });
    expect(result.task.sourceSig).toBe('original');
    expect(result.task.document!.assets[firstNarrativeAssetId(result.task.document!)!]?.locator.localSig).toBe('original');
    expect(result.task.document!.timeline.tracks.some(track => track.role === 'narration')).toBe(true);
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
  it('reuses translation and speech when lip sync fails and the next version disables it', async () => {
    const source = task(); source.options.dubbing!.lipSync = true;
    mocks.fetch.mockImplementation(async (url) => String(url).includes('dubbing-speech')
      ? response({ status: 'succeeded', asset: { url: 'https://own/speech.mp3', key: 'uploads/owner/speech.mp3', durationSec: 6 } })
      : String(url).includes('?id=') ? response({ status: 'failed', error: '未检测到清晰人脸' }) : response({ id: 'lip-job', status: 'pending' }));
    let saved = source;
    const hooks = { signal: new AbortController().signal, checkpoint: async (record: CaptionTaskRecord) => { saved = structuredClone(record); }, progress: vi.fn() };
    await expect(runDubbingTask(source, file, hooks)).rejects.toThrow('未检测到清晰人脸');
    saved.generationId = 'new-version'; saved.options.dubbing!.lipSync = false;
    const requestCount = mocks.fetch.mock.calls.length;
    const result = await runDubbingTask(saved, file, hooks);
    expect(result.task.stage).toBe('completed');
    expect(mocks.asr).toHaveBeenCalledOnce(); expect(mocks.translate).toHaveBeenCalledOnce();
    expect(mocks.fetch).toHaveBeenCalledTimes(requestCount);
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
  expect(new Set(requests.map(request => request.runId)).size).toBe(1);
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

it('keeps a single speaker at natural pace on each line instead of stretching over the pauses', async () => {
  const source = task(); source.durationSec = 20;
  mocks.asr.mockResolvedValue([{ text: '第一句', start: 0, end: 1.5 }, { text: '第二句', start: 10, end: 11.5 }]);
  mocks.translate.mockResolvedValue([{ index: 0, text: 'First line' }, { index: 1, text: 'Second line' }]);
  mocks.fetch.mockImplementation(async () => response({ status: 'succeeded', asset: { url: 'https://own/speech.mp3', key: 'uploads/owner/speech.mp3', durationSec: 2 } }));
  const stretch = await import('./time-stretch');
  const mono = vi.spyOn(await import('./audio-decode'), 'toMono').mockImplementation(async () => new Float32Array(2 * 24000).fill(.2));
  try { await generateDubbing(source, file, { signal: new AbortController().signal, checkpoint: async () => {}, progress: vi.fn() }); } finally { mono.mockRestore(); }
  const pcm = mocks.wav.mock.calls[0][0] as Float32Array;
  // Each line starts where it was spoken, at its own length; the pause between stays silent.
  expect(pcm[Math.round(.5 * 24000)]).toBeCloseTo(.2); expect(pcm[Math.round(5 * 24000)]).toBe(0); expect(pcm[Math.round(10.5 * 24000)]).toBeCloseTo(.2);
  expect(stretch.signalsmithStretch).not.toHaveBeenCalled();
});

it('fits a long line by shortening it, then a faster native voice, before any post stretch', async () => {
  const source = task(); source.durationSec = 6;
  mocks.asr.mockResolvedValue([{ text: '这是一句比较长的话', start: 0, end: 2 }, { text: '下一句', start: 3.5, end: 5 }]);
  mocks.translate.mockResolvedValue([{ index: 0, text: 'This is a rather long sentence indeed' }, { index: 1, text: 'Next one' }]);
  const speechBodies: Array<Record<string, unknown>> = []; const fitBodies: Array<Record<string, any>> = [];
  // Available for line 1: until line 2 starts at 3.5 s.
  const durations = [4, 1.5, 3.8, 3.4];
  mocks.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    if (String(url).includes('dubbing-fit')) { fitBodies.push(body); return response({ rows: [{ index: 0, text: 'A long sentence' }], usage: { source: 'server', reference: 'fit', credits: 1 } }); }
    speechBodies.push(body);
    return response({ status: 'succeeded', asset: { url: `https://own/${speechBodies.length}.mp3`, key: `uploads/owner/${speechBodies.length}.mp3`, durationSec: durations[speechBodies.length - 1] } });
  });
  const mono = vi.spyOn(await import('./audio-decode'), 'toMono').mockImplementationOnce(async () => new Float32Array(Math.round(3.4 * 24000)).fill(.2)).mockImplementationOnce(async () => new Float32Array(Math.round(1.5 * 24000)).fill(.2));
  const stretch = await import('./time-stretch');
  try { await generateDubbing(source, file, { signal: new AbortController().signal, checkpoint: async () => {}, progress: vi.fn() }); } finally { mono.mockRestore(); }
  // Shorten first: only the line that runs past its moment and the silence after it (3 s available).
  expect(fitBodies).toHaveLength(1);
  expect(fitBodies[0].rows).toEqual([{ index: 0, source: '这是一句比较长的话', text: 'This is a rather long sentence indeed', seconds: 4, targetSeconds: 3.33 }]);
  expect(speechBodies.map(body => [body.chunkIndex, body.attempt, body.speed, body.text])).toEqual([
    [0, 0, 1, 'This is a rather long sentence indeed'], [1, 0, 1, 'Next one'],
    [0, 1, 1, 'A long sentence'], [0, 2, 1.11, 'A long sentence'],
  ]);
  expect(stretch.signalsmithStretch).not.toHaveBeenCalled();
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

it('changes speech language without reusing another language’s audio for identical text', async () => {
  const source = task(); source.options.dubbing!.script = 'Hello';
  const hooks = { signal: new AbortController().signal, checkpoint: async () => {}, progress: vi.fn() };
  const result = await runDubbingTask(source, file, hooks);
  const french = structuredClone(result.task); french.generationId = 'next-run'; french.options.dubbing!.language = 'French';
  await runDubbingTask(french, file, hooks);
  expect(mocks.fetch.mock.calls.map(([, init]) => JSON.parse(init.body).language)).toEqual(['en', 'fr']);
});
it('uses inserted script edits for TTS and does not trust a stale speech signature', async () => {
  const source = task(); source.options.dubbing!.script = 'Hello';
  const hooks = { signal: new AbortController().signal, checkpoint: async () => {}, progress: vi.fn() };
  const first = await runDubbingTask(source, file, hooks);
  const definition = structuredClone(first.task.workflow!.definition);
  const { GENERIC_WORKFLOW_CAPABILITIES } = await import('@pireel/studio-engine/workflow-generic');
  definition.steps.splice(2, 0, { id: 'rewrite', capability: 'llm.transform', version: 1, dependsOn: ['translate'], arguments: { value: { kind: 'step', stepId: 'translate', key: 'value' }, instruction: { kind: 'literal', value: 'Edit the spoken text' }, schema: { kind: 'literal', value: { type: 'object', properties: {}, additionalProperties: true } } } });
  for (const step of definition.steps.filter(step => ['speech', 'align'].includes(step.id))) {
    step.arguments.plan = { kind: 'step', stepId: 'rewrite', key: 'value' }; step.dependsOn = [...step.dependsOn.filter(id => id !== 'translate'), 'rewrite'];
  }
  const result = await runDubbingTask(first.task, file, { ...hooks, definition, nodes: [{ capability: { ...GENERIC_WORKFLOW_CAPABILITIES[0], environments: ['browser'] }, execute: async args => {
    const plan = structuredClone(args.value) as unknown as { parts: { text: string }[] };
    plan.parts[0].text = 'Changed after review';
    return { status: 'completed', summary: 'Changed', artifact: { kind: 'value', data: { value: plan as never } } };
  } }] });
  expect(JSON.parse(mocks.fetch.mock.calls[1][1].body).text).toBe('Changed after review');
  expect(result.task.dubbing?.translatedText).toBe('Changed after review');
  expect(result.task.dubbing?.alignedAudioSig).not.toBe(first.task.dubbing?.alignedAudioSig);
});
