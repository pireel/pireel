import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptionTaskRecord, CaptionTaskProgress } from './caption-task-store';
const mock = vi.hoisted(() => ({ transcribe: vi.fn(), clean: vi.fn(), render: vi.fn(), font: vi.fn(), translate: vi.fn() }));
vi.mock('@pireel/studio-engine/providers', () => ({ studioProviders: () => ({ translate: mock.translate }) }));
vi.mock('./media', () => ({ transcribeFile: mock.transcribe }));
vi.mock('./speech-silence', () => ({ detectSpeechSilenceCuts: mock.clean }));
vi.mock('./client-export', () => ({ clientExportVideo: mock.render }));
vi.mock('./web-fonts', () => ({ loadFont: mock.font }));
import { runCaptionTask } from './caption-task-runner';
const transcript = [{ text: 'Hello world', start: 0, end: 3, words: [{ text: 'Hello', start: 0, end: 1 }, { text: 'world', start: 2, end: 3 }] }];
const task = (): CaptionTaskRecord => ({ id: 'task', scope: 'account', name: 'video.mp4', sourceSig: 'sig', width: 1080, height: 1920, durationSec: 4, stage: 'ready', updatedAt: 0, options: { presetId: 'clean', aspect: 'original', shortenPauses: true } });
const file = new File(['test'], 'video.mp4', { type: 'video/mp4' });
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('document', { fonts: { ready: Promise.resolve() } });
  mock.translate.mockImplementation(async (rows) => rows.map((row: { index: number }) => ({ index: row.index, text: '你好世界' })));
  mock.transcribe.mockResolvedValue(transcript); mock.clean.mockResolvedValue([{ fromSec: 1, toSec: 2 }]);
  mock.render.mockResolvedValue(new Blob(['video'], { type: 'video/mp4' })); mock.font.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());
describe('standalone caption task execution', () => {
  it('reports observed stage work and leaves opaque recognition indeterminate', async () => {
    const observed: CaptionTaskProgress[] = [];
    mock.transcribe.mockImplementationOnce(async (_file, options) => { options.onPhase('recognizing'); return transcript; });
    mock.clean.mockImplementationOnce(async (_file, options) => { options.onProgress(20, 100); return []; });
    mock.render.mockImplementationOnce(async (options) => { options.onProgress(42, 100); return new Blob(['video']); });
    await runCaptionTask(task(), file, { signal: new AbortController().signal, checkpoint: async () => {}, progress: vi.fn(), stageProgress: (value) => observed.push(structuredClone(value)) });
    expect(observed.find((value) => value.transcribing?.detail === 'recognizing')?.transcribing?.fraction).toBeUndefined();
    expect(observed.some((value) => value.cleaning?.fraction === .2)).toBe(true);
    expect(observed.some((value) => value.rendering?.fraction === .42)).toBe(true);
    expect(Object.values(observed.at(-1)!).every((value) => value?.status === 'completed')).toBe(true);
  });
  it('runs without a workbench and produces a downloadable video with a native document', async () => {
    const records: CaptionTaskRecord[] = [];
    const result = await runCaptionTask(task(), file, { signal: new AbortController().signal, checkpoint: async (record) => { records.push(structuredClone(record)); }, progress: vi.fn() });
    expect(records.map((record) => record.stage)).toEqual(['transcribing', 'cleaning', 'styling', 'rendering']);
    expect(result.task.stage).toBe('completed'); expect(result.video.type).toBe('video/mp4');
    expect(result.task.document?.semantics.managedCaptionTrackId).toBeTruthy();
    expect(mock.render.mock.calls[0]![0].videoFile).toBe(file);
    const exported = mock.render.mock.calls[0]![0];
    expect(exported.comp.shots.every((shot: { src?: string }) => !shot.src || exported.clipFiles.get(shot.src) === file)).toBe(true);
    expect(records.at(-1)?.document).toBeTruthy();
  });
  it('checkpoints bilingual subtitles before rendering and reuses them on a retry', async () => {
    const source = task(); source.options.translationLanguage = '中文';
    const records: CaptionTaskRecord[] = [];
    const hooks = { signal: new AbortController().signal, checkpoint: async (record: CaptionTaskRecord) => { records.push(structuredClone(record)); }, progress: vi.fn() };
    const result = await runCaptionTask(source, file, hooks);
    expect(records.map((record) => record.stage)).toEqual(['transcribing', 'cleaning', 'translating', 'styling', 'rendering']);
    expect(records.find((record) => record.stage === 'styling')?.translation?.language).toBe('中文');
    expect(mock.render.mock.calls[0]![0].comp.captionStyle.sub.lang).toBe('中文');
    await runCaptionTask(result.task, file, hooks);
    expect(mock.translate).toHaveBeenCalledOnce();
  });
  it('does not render a partial bilingual result when translation fails', async () => {
    const source = task(); source.options.translationLanguage = '中文';
    mock.translate.mockResolvedValueOnce([]);
    await expect(runCaptionTask(source, file, { signal: new AbortController().signal, checkpoint: async () => {}, progress: vi.fn() })).rejects.toThrow('不完整');
    expect(mock.render).not.toHaveBeenCalled(); expect(source.transcript).toBeUndefined();
  });
  it('resumes cached transcript and cleanup without repeating those operations', async () => {
    await runCaptionTask({ ...task(), transcript, cuts: [] }, file, { signal: new AbortController().signal, checkpoint: async () => {}, progress: vi.fn() });
    expect(mock.transcribe).not.toHaveBeenCalled(); expect(mock.clean).not.toHaveBeenCalled(); expect(mock.render).toHaveBeenCalledOnce();
  });
  it('does not start a paid operation when already cancelled', async () => {
    const abort = new AbortController(); abort.abort();
    await expect(runCaptionTask(task(), file, { signal: abort.signal, checkpoint: async () => {}, progress: vi.fn() })).rejects.toMatchObject({ name: 'AbortError' });
    expect(mock.transcribe).not.toHaveBeenCalled();
  });
  it('never reports completion if cancellation arrives during rendering', async () => {
    const abort = new AbortController();
    mock.render.mockImplementationOnce(async () => { abort.abort(); return new Blob(['late video']); });
    await expect(runCaptionTask(task(), file, { signal: abort.signal, checkpoint: async () => {}, progress: vi.fn() })).rejects.toMatchObject({ name: 'AbortError' });
  });
});
