import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { CaptionTaskRecord } from './caption-task-store';
import { firstNarrativeAssetId } from '@pireel/studio-engine/composition';
const mocks = vi.hoisted(() => ({ script: vi.fn(), asr: vi.fn(), translate: vi.fn(), render: vi.fn(), upload: vi.fn(), remote: vi.fn(), fetch: vi.fn(), wav: vi.fn() }));
const cache = new Map<string, File>();
vi.mock('./media', () => ({ durableFileSig: async () => 'rendered-sig', fileSig: (file: File) => `${file.name}:${file.size}`, transcribeFile: mocks.asr, probeVideoFile: async () => ({ width: 1920, height: 1080, durationSec: 8, hasAudio: true }) }));
vi.mock('./local-media', () => ({ saveLocalVideo: async (file: File, sig: string) => { cache.set(sig, file); return true; }, loadLocalVideo: async (sig: string) => cache.get(sig) ?? null }));
// The dub script is written phrase by phrase; these tests have no word timing, so a turn is one phrase
// and the script reads straight from the translation mock (a missing row leaves the turn unwritten).
const dubbingScript = (...input: unknown[]) => mocks.script(...input);
const scriptFromTranslation = async (turns: { text: string }[][], language: string, options: unknown) => {
  const rows = await mocks.translate(turns.map((phrases, index) => ({ index, text: phrases.map(phrase => phrase.text).join('') })), language, options) as { index: number; text: string }[];
  return turns.map((phrases, index) => { const row = rows.find(entry => entry.index === index); return row ? phrases.map((_, at) => at ? '' : row.text) : []; });
};
vi.mock('@pireel/studio-engine/providers', () => ({ studioProviders: () => ({ translate: mocks.translate, dubbingScript, uploads: { upload: mocks.upload } }) }));
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
  mocks.script.mockImplementation(scriptFromTranslation);
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

it('fits a long line by shortening it (twice, tighter the second time), then a faster native voice, before any post stretch', async () => {
  const source = task(); source.durationSec = 6;
  mocks.asr.mockResolvedValue([{ text: '这是一句比较长的话', start: 0, end: 2 }, { text: '下一句', start: 3.5, end: 5 }]);
  mocks.translate.mockResolvedValue([{ index: 0, text: 'This is a rather long sentence indeed' }, { index: 1, text: 'Next one' }]);
  const speechBodies: Array<Record<string, unknown>> = []; const fitBodies: Array<Record<string, any>> = [];
  // Available for line 1: until line 2 starts at 3.5 s.
  const durations = [4, 1.5, 3.8, 3.6, 3.4];
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
  expect(fitBodies).toHaveLength(2);
  expect(fitBodies[0].rows).toEqual([{ index: 0, source: '这是一句比较长的话', text: 'This is a rather long sentence indeed', seconds: 4, targetSeconds: 3.33 }]);
  expect(fitBodies[1].rows).toEqual([{ index: 0, source: '这是一句比较长的话', text: 'A long sentence', seconds: 3.8, targetSeconds: 2.98 }]);
  expect(speechBodies.map(body => [body.chunkIndex, body.attempt, body.speed, body.text])).toEqual([
    [0, 0, 1, 'This is a rather long sentence indeed'], [1, 0, 1, 'Next one'],
    [0, 1, 1, 'A long sentence'], [0, 3, 1, 'A long sentence'], [0, 2, 1.05, 'A long sentence'],
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

it('voices and places the dub phrase by phrase, where each phrase was said', async () => {
  const source = task();
  mocks.asr.mockResolvedValue([{ text: '大家好，今天收到了礼物。', start: 0, end: 6, words: [{ text: '大家好，', start: 0, end: 1.2 }, { text: '今天', start: 3, end: 3.8 }, { text: '收到了礼物。', start: 3.8, end: 6 }] }]);
  mocks.script.mockResolvedValue([['Hi everyone,', 'today a gift arrived.']]);
  const bodies: Array<Record<string, unknown>> = [];
  mocks.fetch.mockImplementation(async (_url: string, init?: RequestInit) => { bodies.push(JSON.parse(String(init?.body))); return response({ status: 'succeeded', asset: { url: `https://own/${bodies.length}.mp3`, key: `k${bodies.length}`, durationSec: 1 } }); });
  vi.spyOn(await import('./audio-decode'), 'toMono').mockImplementation(async () => new Float32Array(24000).fill(.2));
  const result = await generateDubbing(source, file, { signal: new AbortController().signal, checkpoint: async () => {}, progress: vi.fn() });
  expect(mocks.script.mock.calls[0][0]).toEqual([[{ text: '大家好，', seconds: 1.7 }, { text: '今天收到了礼物。', seconds: 3.5 }]]);
  expect(bodies.map(body => [body.chunkIndex, body.text])).toEqual([[0, 'Hi everyone,'], [1, 'today a gift arrived.']]);
  expect(result.task.dubbing?.translatedTurns).toEqual(['Hi everyone, today a gift arrived.']);
  // The second phrase starts at 3 s, where it was said; the pause between stays silent.
  const pcm = mocks.wav.mock.calls[0][0] as Float32Array;
  expect(pcm[Math.round(.5 * 24000)]).toBeCloseTo(.2); expect(pcm[Math.round(2 * 24000)]).toBe(0); expect(pcm[Math.round(3.5 * 24000)]).toBeCloseTo(.2);
  expect(result.task.dubbing?.fitNotes).toEqual([]);
});

it('speaks a line that cannot fit faster and cuts its end with a fade, reporting it instead of failing', async () => {
  const source = task();
  mocks.asr.mockResolvedValue([{ text: '还有一个包包', start: 7.3, end: 8 }]);
  mocks.translate.mockResolvedValue([{ index: 0, text: 'And there is also a bag' }]);
  mocks.fetch.mockImplementation(async (url: string) => String(url).includes('dubbing-fit')
    ? response({ rows: [{ index: 0, text: 'And a bag' }] })
    : response({ status: 'succeeded', asset: { url: 'https://own/s.mp3', key: 's', durationSec: 2 } }));
  vi.spyOn(await import('./audio-decode'), 'toMono').mockImplementation(async () => new Float32Array(2 * 24000).fill(.2));
  // Sped up as far as allowed (1.4x), the voice still outlasts the 0.7 s left before the picture ends.
  vi.spyOn(await import('./time-stretch'), 'tiledStretch').mockReturnValue(async () => [new Float32Array(Math.round(2 / 1.4 * 24000)).fill(.2)]);
  const result = await generateDubbing(source, file, { signal: new AbortController().signal, checkpoint: async () => {}, progress: vi.fn() });
  expect(result.task.dubbing?.fitNotes).toEqual([{ at: 7.3, kind: 'trimmed' }]);
  const pcm = mocks.wav.mock.calls[0][0] as Float32Array;
  expect(pcm.length).toBe(8 * 24000);
  // The cut fades to silence at the end of the picture.
  expect(Math.abs(pcm[pcm.length - 1])).toBeLessThan(.01); expect(pcm[Math.round(7.5 * 24000)]).not.toBe(0);
});

it('lets a line run a little into the next one, which starts that much later, instead of cutting it', async () => {
  const source = task();
  mocks.asr.mockResolvedValue([{ text: '第一句', start: 0, end: 2 }, { text: '第二句', start: 2.5, end: 4 }]);
  // One turn of two phrases (half a second apart).
  mocks.script.mockResolvedValue([['One', 'Two']]);
  // Line 1 needs 2.9 s but has 2.5 s before line 2: it runs 0.4 s over, so line 2 begins at 2.9 s.
  mocks.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    return String(url).includes('dubbing-fit')
      ? response({ rows: [{ index: 0, text: 'One' }] })
      : response({ status: 'succeeded', asset: { url: `https://own/${body.chunkIndex}-${body.attempt}.mp3`, key: `k${body.chunkIndex}-${body.attempt}`, durationSec: body.chunkIndex ? 1 : 2.9 } });
  });
  let decoded = 0;
  vi.spyOn(await import('./audio-decode'), 'toMono').mockImplementation(async () => new Float32Array(Math.round((decoded++ ? 1 : 2.9) * 24000)).fill(.2));
  vi.spyOn(await import('./time-stretch'), 'tiledStretch').mockReturnValue(async ({ channels, rate }: { channels: Float32Array[]; rate: number }) => [channels[0]!.slice(0, Math.round(channels[0]!.length / rate))]);
  const result = await generateDubbing(source, file, { signal: new AbortController().signal, checkpoint: async () => {}, progress: vi.fn() });
  expect(result.task.dubbing?.fitNotes).toEqual([]);
  const pcm = mocks.wav.mock.calls[0][0] as Float32Array;
  // Line 1 is still speaking at 2.7 s (past line 2's own start), and nothing is cut.
  expect(pcm[Math.round(2.7 * 24000)]).toBeCloseTo(.2);
});

it('speeds up lines back to back together when they only fit as a run, instead of cutting the later one', async () => {
  const source = task(); source.durationSec = 5;
  mocks.asr.mockResolvedValue([{ text: '第一句', start: 0, end: 2 }, { text: '第二句', start: 2.5, end: 4 }]);
  mocks.script.mockResolvedValue([['One', 'Two']]);
  // Each line keeps its length however it is re-voiced: 2.9 s and 3 s for 2.5 s each (the last line up to the picture's end).
  mocks.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    return String(url).includes('dubbing-fit')
      ? response({ rows: body.rows.map((row: { index: number; text: string }) => ({ index: row.index, text: row.text })) })
      : response({ status: 'succeeded', asset: { url: `https://own/${body.chunkIndex}-${body.attempt}.mp3`, key: `k${body.chunkIndex}-${body.attempt}`, durationSec: body.chunkIndex ? 3 : 2.9 } });
  });
  const mono = vi.spyOn(await import('./audio-decode'), 'toMono'); let decoded = 0;
  mono.mockImplementation(async () => new Float32Array(Math.round((decoded++ ? 3 : 2.9) * 24000)).fill(.2));
  vi.spyOn(await import('./time-stretch'), 'tiledStretch').mockReturnValue(async ({ channels, rate }: { channels: Float32Array[]; rate: number }) => [channels[0]!.slice(0, Math.round(channels[0]!.length / rate))]);
  const result = await generateDubbing(source, file, { signal: new AbortController().signal, checkpoint: async () => {}, progress: vi.fn() });
  expect(result.task.dubbing?.fitNotes?.map(note => note.kind)).toEqual(['faster', 'faster']);
});

it('rewrites neighbouring phrases of a sentence together, linked, so their join stays clean', async () => {
  const source = task();
  mocks.asr.mockResolvedValue([{ text: '里面是一个', start: 0, end: 1.5 }, { text: '会员卡。', start: 1.5, end: 3 }, { text: '下一句。', start: 3.5, end: 4.5 }]);
  mocks.script.mockResolvedValue([['Inside there is a', 'membership card.', 'Next.']]);
  const fits: Array<{ rows: Array<Record<string, unknown>> }> = [];
  mocks.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    if (String(url).includes('dubbing-fit')) { fits.push(body); return response({ rows: body.rows.map((row: { index: number; text: string }) => ({ index: row.index, text: row.text })) }); }
    return response({ status: 'succeeded', asset: { url: `https://own/${body.chunkIndex}-${body.attempt}.mp3`, key: `k${body.chunkIndex}-${body.attempt}`, durationSec: [1.8, 2.3, .8][body.chunkIndex] } });
  });
  let decoded = 0;
  vi.spyOn(await import('./audio-decode'), 'toMono').mockImplementation(async () => new Float32Array(Math.round([1.8, 2.3, .8][decoded++] * 24000)).fill(.2));
  vi.spyOn(await import('./time-stretch'), 'tiledStretch').mockReturnValue(async ({ channels, rate }: { channels: Float32Array[]; rate: number }) => [channels[0]!.slice(0, Math.round(channels[0]!.length / rate))]);
  await generateDubbing(source, file, { signal: new AbortController().signal, checkpoint: async () => {}, progress: vi.fn() });
  expect(fits[0].rows.map(row => ({ index: row.index, before: row.before, after: row.after, continues: row.continues }))).toEqual([
    { index: 0, before: undefined, after: undefined, continues: undefined },
    { index: 1, before: undefined, after: 'Next.', continues: 0 },
  ]);
});
