import { afterEach, describe, expect, it } from 'vitest';
import { compositionToEditorDocument, emptyComposition, type EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { firstNarrativeAssetId } from '@pireel/studio-engine/editor-document/read-model';
import { setStudioProviders, studioProviders, unavailableProviders } from '@pireel/studio-engine/providers';
import type { PlaybookSnapshot } from '@pireel/studio-engine/brand-playbook';
import type { WorkflowUsage } from '@pireel/studio-engine/workflow';
import { documentIsEdited, runFirstPass, type FirstPassHost, type FirstPassReport } from './first-pass';

function documentWithSpeech(): EditorDocumentV2 {
  const composition = { ...emptyComposition(), width: 1080, height: 1920, video: { url: 'blob:x', durationSec: 10 }, shots: [{ id: 'source-video', srcStart: 0, srcEnd: 10, treatment: 'full' as const }] };
  const document = compositionToEditorDocument({ projectId: 'p-test', videoSig: 'sig', composition }).document;
  const assetId = firstNarrativeAssetId(document)!;
  const words = [['嗯，', 0, 0.4], ['今', 1, 1.2], ['天', 1.2, 1.4], ['讲', 1.4, 1.6]] as const;
  document.semantics.transcripts[assetId] = [{ start: 0, end: 1.6, text: '嗯，今天讲', words: words.map(([text, start, end]) => ({ text, start, end })) }];
  return document;
}

function host(overrides: Partial<FirstPassHost> = {}) {
  const calls: [string, Record<string, unknown>][] = [];
  let document = documentWithSpeech();
  const value: FirstPassHost = {
    document: () => document,
    brand: null,
    skills: ['rough-cut', 'captions'],
    tool: async (name, args) => {
      calls.push([name, args]);
      return name === 'remove_silence' ? { ok: true, data: { cuts: [{}, {}] } } : { ok: true };
    },
    setUsageSink: () => {},
    applyCaptionPreset: async () => { calls.push(['captions', {}]); },
    captionsOn: () => true,
    replaceDocument: (next) => { document = next; return true; },
    patchLoudness: () => true,
    primaryFile: async () => null,
    measureLoudness: async () => null,
    ...overrides,
  };
  return { value, calls };
}

const original = studioProviders();
afterEach(() => setStudioProviders(original));

describe('first pass', () => {
  it('runs the steps whose skills are on and skips the rest', async () => {
    setStudioProviders(unavailableProviders());
    const { value, calls } = host();
    const updates: FirstPassReport[] = [];
    const { report, note } = await runFirstPass(value, (next) => updates.push(next));
    expect(calls.map(([name]) => name)).toEqual(['get_transcript', 'remove_silence', 'remove_words', 'captions']);
    expect(calls[2]![1].wordIds).toHaveLength(1);
    const status = Object.fromEntries(report.steps.map((step) => [step.id, step.status]));
    // No speech clean-up service in this host (fillers still go); no voice cleanup skill; no brand logo or loudness.
    expect(status).toEqual({ transcribe: 'done', pauses: 'done', cleanup: 'done', captions: 'done', denoise: 'skipped', logo: 'skipped', loudness: 'skipped' });
    expect(report.state).toBe('done');
    expect(report.summary).toBeTruthy();
    expect(updates.at(-1)).toEqual(report);
    expect(note).toMatch(/Rough cut done/);
  });

  it('keeps natural pauses, cuts repeats with the pause after them and masks sensitive words', async () => {
    setStudioProviders({ ...unavailableProviders(), speechCleanup: async () => ({
      cuts: [{ seg: 0, text: '嗯，', keep: 0, kind: 'false-start', range: [0, 0.4] }],
      sensitive: [{ seg: 0, text: '天讲', range: [1.2, 1.6] }],
      unsure: [],
    }) });
    const brand = { name: 'b', blocks: { sound: { pauses: 'natural', text: '' } } } as unknown as PlaybookSnapshot;
    const { value, calls } = host({ brand, skills: ['rough-cut'] });
    const { report, note } = await runFirstPass(value, () => {});
    expect(report.steps.find((step) => step.id === 'pauses')!.status).toBe('skipped');
    expect(calls.map(([name]) => name)).toEqual(['get_transcript', 'remove_words', 'remove_words', 'mask_words']);
    expect(calls[1]![1].ranges).toEqual([[0, 0.75]]);
    expect(calls[3]![1].wordIds).toHaveLength(2);
    expect(report.steps.find((step) => step.id === 'cleanup')!.status).toBe('done');
    expect(note).toMatch(/masked 1 sensitive words/);
  });

  it('still cuts fillers when the clean-up call fails, and says so', async () => {
    setStudioProviders({ ...unavailableProviders(), speechCleanup: async () => { throw new Error('upstream busy'); } });
    const { value, calls } = host({ skills: ['rough-cut'] });
    const { report } = await runFirstPass(value, () => {});
    expect(calls.some(([name, args]) => name === 'remove_words' && args.wordIds)).toBe(true);
    expect(report.steps.find((step) => step.id === 'cleanup')).toMatchObject({ status: 'failed' });
    expect(report.steps.find((step) => step.id === 'cleanup')!.detail).toMatch(/upstream busy/);
  });

  it('records the fine-cut clips the project has when it ends', async () => {
    setStudioProviders(unavailableProviders());
    const document = documentWithSpeech();
    document.timeline.tracks.push({ id: 'fx', type: 'audio', role: 'sfx', name: 'SFX', hidden: false, muted: false, locked: false, syncLocked: true, stackOrder: 0, clips: [{ id: 'hit', kind: 'audio', anchor: { type: 'timeline' }, assetId: 'a', startFrame: 0, durationFrames: 10, sourceInSec: 0, sourceOutSec: 0.3, enabled: true, properties: { volumeDb: 0, fadeInSec: 0, fadeOutSec: 0 } }] } as never);
    const { value } = host({ document: () => document, skills: [] });
    const { baseline } = await runFirstPass(value, () => {});
    expect(baseline).toEqual({ graphics: [], 'b-roll': [], sound: ['hit'] });
  });

  it('stops between steps, and runs just the steps asked for when called again', async () => {
    setStudioProviders(unavailableProviders());
    const controller = new AbortController();
    const { value, calls } = host({
      tool: async (name, args) => {
        calls.push([name, args]);
        if (name === 'remove_silence') controller.abort();
        return name === 'remove_silence' ? { ok: true, data: { cuts: [{}] } } : { ok: true };
      },
    });
    const first = await runFirstPass(value, () => {}, { signal: controller.signal });
    expect(first.stopped).toBe(true);
    expect(first.report.state).toBe('stopped');
    // The step under way finished and kept its result; nothing after it ran.
    expect(first.report.steps.find((step) => step.id === 'pauses')!.status).toBe('done');
    expect(first.report.steps.find((step) => step.id === 'cleanup')!.status).toBe('pending');
    expect(calls.map(([name]) => name)).toEqual(['get_transcript', 'remove_silence']);
    expect(first.note).toMatch(/Not run: cleanup, captions — call rough_cut with steps \["cleanup","captions"\]/);

    calls.length = 0;
    const second = await runFirstPass(value, () => {}, { steps: ['cleanup', 'captions'] });
    expect(second.stopped).toBe(false);
    expect(calls.map(([name]) => name)).toEqual(['get_transcript', 'remove_words', 'captions']);
    expect(second.report.steps.find((step) => step.id === 'pauses')!.status).toBe('skipped');
  });

  it('skips a step the brand does not set even when it is asked for', async () => {
    setStudioProviders(unavailableProviders());
    const { value } = host({ skills: [] });
    const { report } = await runFirstPass(value, () => {}, { steps: ['loudness'] });
    expect(report.steps.find((step) => step.id === 'loudness')).toMatchObject({ status: 'skipped' });
  });

  it('stops at once during a slow step, leaving it to run again', async () => {
    setStudioProviders(unavailableProviders());
    const controller = new AbortController();
    const { value } = host({
      // A slow analysis that honours the stop signal, as the tool executor does.
      tool: (name, _args, signal) => name !== 'remove_silence' ? Promise.resolve({ ok: true }) : new Promise((_, reject) => {
        signal?.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')));
        setTimeout(() => controller.abort(), 5);
      }),
    });
    const started = Date.now();
    const { report, stopped } = await runFirstPass(value, () => {}, { signal: controller.signal });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(stopped).toBe(true);
    expect(report.steps.find((step) => step.id === 'pauses')).toEqual({ id: 'pauses', status: 'pending' });
  });

  it('hands usage billed after a stop to the card as late credits', async () => {
    setStudioProviders(unavailableProviders());
    const controller = new AbortController();
    let sink: ((usage: WorkflowUsage) => void) | null = null;
    let bill: ((usage: WorkflowUsage) => void) | null = null;
    const { value } = host({
      setUsageSink: (next) => { sink = next; },
      // Transcription keeps running after the stop; its bill reaches the listener taken at the call.
      tool: (name, _args, signal) => name !== 'get_transcript' ? Promise.resolve({ ok: true }) : new Promise((_, reject) => {
        bill = sink;
        signal?.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')));
        setTimeout(() => controller.abort(), 5);
      }),
    });
    const late: number[] = [];
    const { report } = await runFirstPass(value, () => {}, { signal: controller.signal, onLateUsage: (credits) => late.push(credits) });
    bill!({ source: 'server', reference: 'asr', credits: 3 });
    expect(report.credits).toBe(0);
    expect(late).toEqual([3]);
  });

  it('reports a failed step and goes on', async () => {
    setStudioProviders(unavailableProviders());
    const { value } = host({ tool: async (name) => (name === 'remove_silence' ? { ok: false, error: 'no bytes' } : { ok: true }) });
    const { report, note } = await runFirstPass(value, () => {});
    expect(report.steps.find((step) => step.id === 'pauses')).toMatchObject({ status: 'failed', detail: 'no bytes' });
    expect(report.steps.find((step) => step.id === 'captions')!.status).toBe('done');
    expect(note).toMatch(/Failed and not applied: pauses/);
  });

  it('tells an imported source from an edited project', () => {
    const fresh = documentWithSpeech();
    expect(documentIsEdited(fresh)).toBe(false);
    expect(documentIsEdited({ ...fresh, appearance: { ...fresh.appearance, captionStyle: { on: true } } })).toBe(true);
    const trimmed = structuredClone(fresh);
    const story = trimmed.timeline.tracks.find((track) => track.id === trimmed.semantics.primaryNarrativeTrackId)!;
    (story.clips[0] as { sourceInSec: number }).sourceInSec = 1;
    expect(documentIsEdited(trimmed)).toBe(true);
  });
});
