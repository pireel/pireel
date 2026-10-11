import { assembleBlockHtml } from '@pireel/studio-engine/assemble';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runServerTool } from '@pireel/studio-engine/server-tools';
import { STUDIO_PROJECT_CONTEXT_SCHEMA_VERSION } from '@pireel/studio-engine/project-dto';
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
  function captionHost(accent: 'keywords' | 'numbers' | 'current_word' | null) {
    const h = host({ skills: ['captions'], brand: { name: 'Brand', blocks: { captions: { on: true, accent, style: { preset: 'style-documentary', emphasis: '#FFB400', animation: 'none' } } } } as PlaybookSnapshot });
    const assetId = firstNarrativeAssetId(h.value.document())!;
    h.value.document().semantics.transcripts[assetId] = [{ start: 0, end: 3, text: '极客时间售价1999元' }];
    h.value.tool = async (name, args) => {
      h.calls.push([name, args]);
      const result = runServerTool(name, args, { id: 'p-test', title: 'Test', comp: emptyComposition(), document: h.value.document(), context: { schemaVersion: STUDIO_PROJECT_CONTEXT_SCHEMA_VERSION }, videoDurationSec: 10 });
      if (result.document) h.value.replaceDocument(result.document);
      return result.result;
    };
    h.value.applyCaptionPreset = async (preset, style) => { const { emphasis, ...rest } = style; const result = await h.value.tool('set_captions', { on: true, preset, ...rest, ...(emphasis ? { highlightColor: emphasis } : {}) }); if (!result.ok) throw Error(result.error); };
    return { ...h, assetId };
  }
  it('actually applies enabled brand word emphasis without replacing its subtitle look', async () => {
    const highlight = vi.fn(async () => [{ index: 0, text: '极客时间' }, { index: 0, text: '1999元' }]);
    setStudioProviders({ ...unavailableProviders(), autoHighlight: highlight });
    const { value, assetId } = captionHost('keywords');
    const { report } = await runFirstPass(value, () => {}, { steps: ['captions'] });
    expect(report.steps.find(step => step.id === 'captions')?.status).toBe('done');
    expect(highlight).toHaveBeenCalledWith([{ index: 0, text: '极客时间售价1999元' }], expect.objectContaining({ highlightMode: 'keywords' }));
    expect(value.document().appearance.captionStyle).toMatchObject({ preset: 'style-documentary', emphasis: '#FFB400', animation: 'none' });
    expect(Object.values(value.document().semantics.transcripts[assetId][0].wordDecorations ?? {}).filter(word => word.highlight === 'color').length).toBeGreaterThan(0);
    expect(report.captionHighlights?.[0]).toMatchObject({ applied: true, items: [{ index: 0, text: '极客时间' }, { index: 0, text: '1999元' }] });
    const rendered = value.document().timeline.tracks.flatMap(track => track.clips).filter(clip => clip.kind === 'caption').map(clip => assembleBlockHtml({ ...clip.block, id: clip.id, startSec: 0, durationSec: 3, trackIndex: 1 }, { ...emptyComposition(), captionStyle: value.document().appearance.captionStyle }).html).join('');
    expect(rendered).toContain('word-color');
    expect(rendered).toContain('--word-highlight:#FFB400');
  });
  it('does not claim emphasis is complete when a tool returns success without applying it', async () => {
    setStudioProviders({ ...unavailableProviders(), autoHighlight: async () => [{ index: 0, text: '1999元' }] });
    const { value } = captionHost('keywords');
    const tool = value.tool;
    value.tool = async (name, args) => args.highlights ? { ok: true } : tool(name, args);
    const { report } = await runFirstPass(value, () => {}, { steps: ['captions'] });
    expect(report.steps.find(step => step.id === 'captions')?.status).toBe('failed');
    expect(report.captionHighlights?.[0].applied).toBe(false);
  });
  it('reuses paid selections after a failed application instead of reselecting on resume', async () => {
    const highlight = vi.fn(async () => [{ index: 0, text: '1999元' }]);
    setStudioProviders({ ...unavailableProviders(), autoHighlight: highlight });
    const { value } = captionHost('keywords');
    const tool = value.tool;
    let fail = true;
    value.tool = async (name, args) => fail && args.highlights ? { ok: false, error: 'locked' } : tool(name, args);
    const first = await runFirstPass(value, () => {}, { steps: ['captions'] });
    expect(first.report.steps.find(step => step.id === 'captions')?.status).toBe('failed');
    expect(first.report.captionHighlights?.[0].applied).toBe(false);
    fail = false;
    const second = await runFirstPass(value, () => {}, { resume: first.report });
    expect(second.report.steps.find(step => step.id === 'captions')?.status).toBe('done');
    expect(highlight).toHaveBeenCalledTimes(1);
  });
  it('keeps a missing emphasis service unfinished and treats karaoke separately', async () => {
    setStudioProviders(unavailableProviders());
    const enabled = captionHost('keywords');
    expect((await runFirstPass(enabled.value, () => {}, { steps: ['captions'] })).report.steps.find(step => step.id === 'captions')?.status).toBe('failed');
    const off = captionHost(null);
    expect((await runFirstPass(off.value, () => {}, { steps: ['captions'] })).report.steps.find(step => step.id === 'captions')?.status).toBe('done');
    const karaoke = captionHost('current_word');
    await runFirstPass(karaoke.value, () => {}, { steps: ['captions'] });
    expect(karaoke.value.document().appearance.captionStyle?.animation).toBe('karaoke');
  });
  it('passes the numbers-only mode to selection and never applies an aborted result', async () => {
    const controller = new AbortController();
    const highlight = vi.fn(async () => { controller.abort(); return [{ index: 0, text: '1999元' }]; });
    setStudioProviders({ ...unavailableProviders(), autoHighlight: highlight });
    const { value, calls } = captionHost('numbers');
    const { report } = await runFirstPass(value, () => {}, { steps: ['captions'], signal: controller.signal });
    expect(highlight).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ highlightMode: 'numbers' }));
    expect(calls.some(([, args]) => !!args.highlights)).toBe(false);
    expect(report.steps.find(step => step.id === 'captions')?.status).toBe('pending');
  });
  it('runs the steps whose skills are on and skips the rest', async () => {
    setStudioProviders(unavailableProviders());
    const { value, calls } = host();
    const updates: FirstPassReport[] = [];
    const { report, note } = await runFirstPass(value, (next) => updates.push(next));
    expect(calls.map(([name]) => name)).toEqual(['get_transcript', 'remove_silence', 'remove_words', 'captions']);
    expect(calls[2]![1].wordIds).toHaveLength(1);
    const status = Object.fromEntries(report.steps.map((step) => [step.id, step.status]));
    // No speech clean-up service in this host (fillers still go); no voice cleanup skill; no brand logo or loudness.
    expect(status).toEqual({ transcribe: 'done', pauses: 'done', cleanup: 'failed', captions: 'done', denoise: 'skipped', logo: 'skipped', loudness: 'skipped' });
    expect(report.state).toBe('partial');
    expect(report.summary).toBeTruthy();
    expect(updates.at(-1)).toEqual(report);
    expect(note).toMatch(/Rough cut partial/);
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
    expect(baseline).toEqual({ graphics: [], 'b-roll': [], sound: ['hit'], zoom: [], transitions: [], emptyMusicTracks: [] });
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

  it('honors independent cleanup and pause switches without changing the original brand', async () => {
    setStudioProviders(unavailableProviders());
    const brand = { blocks: { sound: { pauses: 'moderate' } }, preferences: { cleanup: false, pauses: true } } as unknown as PlaybookSnapshot;
    const { value, calls } = host({ brand, skills: ['rough-cut'] });
    const { report } = await runFirstPass(value, () => {});
    expect(calls.map(([name]) => name)).toEqual(['get_transcript', 'remove_silence']);
    expect(report.steps.find(step => step.id === 'cleanup')?.status).toBe('skipped');
    expect(brand.preferences).toEqual({ cleanup: false, pauses: true });
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
    const { report } = await runFirstPass(value, () => {}, { signal: controller.signal, onLateUsage: (usage) => late.push(usage.credits!) });
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
    expect(report.state).toBe('partial');
    expect(note).toMatch(/Not fully completed.*pauses/);
  });

  it('blocks dependent work after transcription fails and never reports completion', async () => {
    setStudioProviders(unavailableProviders());
    const { value, calls } = host({ tool: async () => ({ ok: false, error: 'Failed to fetch' }) });
    const { report, note } = await runFirstPass(value, () => {});
    expect(report.state).toBe('failed');
    expect(report.steps.find(step => step.id === 'captions')?.status).toBe('pending');
    expect(calls.some(([name]) => name === 'captions')).toBe(false);
    expect(note).not.toContain('Rough cut done');
  });

  it('resumes checkpoints without repeating completed analysis or applied cleanup substeps', async () => {
    let analyses = 0;
    setStudioProviders({ ...unavailableProviders(), speechCleanup: async () => {
      analyses++;
      return { cuts: [{ seg: 0, text: '嗯，', keep: 0, kind: 'false-start', range: [0, 0.4] }], sensitive: [], unsure: [] };
    } });
    const controller = new AbortController();
    const { value, calls } = host({ skills: ['rough-cut'], tool: async (name, args) => {
      calls.push([name, args]);
      if (name === 'remove_words' && args.ranges) controller.abort();
      return { ok: true };
    } });
    const first = await runFirstPass(value, () => {}, { signal: controller.signal });
    expect(first.report.cleanup?.applied).toContain('repeats');
    calls.length = 0;
    const second = await runFirstPass(value, () => {}, { resume: first.report, steps: ['captions'] });
    expect(analyses).toBe(1);
    expect(calls.some(([name]) => name === 'get_transcript')).toBe(false);
    expect(calls.some(([name, args]) => name === 'remove_words' && args.ranges)).toBe(false);
    expect(second.report.state).toBe('done');
  });

  it('refuses to apply a checkpoint to a different source video', async () => {
    const { value, calls } = host();
    await expect(runFirstPass(value, () => {}, { resume: { sourceAssetId: 'different-source', state: 'stopped', credits: 0, steps: [] } })).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it('persists document changes before marking a step complete', async () => {
    setStudioProviders(unavailableProviders());
    let persisted = false;
    const { value } = host({ skills: [], persist: async () => { persisted = true; } });
    await runFirstPass(value, report => {
      if (report.steps.find(step => step.id === 'transcribe')?.status === 'done') expect(persisted).toBe(true);
    }, { steps: ['transcribe'] });
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
