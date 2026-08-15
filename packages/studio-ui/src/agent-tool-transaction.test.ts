import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  type Composition,
  type EditorDocumentV2,
  compositionToEditorDocument,
  projectDocumentToComposition,
  runAgentTimelineTool,
} from '@pireel/studio-engine/composition';
import { buildChatSystem } from '@pireel/studio-engine/prompts';
import type { AgentToolCtx } from './agent-tool-runner';
import { classifyAsrResponse } from './media';

const providerMocks = vi.hoisted(() => ({ transcribe: vi.fn() }));
vi.mock('@pireel/studio-engine/providers', () => ({
  studioProviders: () => ({ transcriber: { transcribe: providerMocks.transcribe } }),
}));

async function runAtomicCompositionTool(ctx: AgentToolCtx, execute: () => Promise<{ ok: boolean; summary?: string; error?: string }>) {
  // agent-tool-runner also owns browser export tools; this unit only needs the transaction helper.
  // Supply the one harmless import-time DOM primitive before loading that module in Node.
  if (!('XMLSerializer' in globalThis)) {
    Object.assign(globalThis, { XMLSerializer: class { serializeToString() { return ''; } } });
  }
  const mod = await import('./agent-tool-runner');
  return mod.runAtomicCompositionTool(ctx, execute);
}

const composition = (): Composition => ({
  width: 1080,
  height: 1920,
  theme: 'general',
  video: null,
  blocks: [],
  shots: [{ id: 's1', srcStart: 0, srcEnd: 3, treatment: 'full' }],
});

function harness() {
  const compRef = { current: composition() };
  const documentRef = { current: compositionToEditorDocument({ projectId: 'test', composition: compRef.current }).document };
  const undoStackRef = { current: [] as EditorDocumentV2[] };
  const redoStackRef = { current: [documentRef.current] };
  const setDocument = (document: EditorDocumentV2, runtimeComposition?: Composition) => {
    documentRef.current = document;
    compRef.current = runtimeComposition ?? projectDocumentToComposition(document);
  };
  return { ctx: { compRef, documentRef, undoStackRef, redoStackRef, setDocument } as unknown as AgentToolCtx, compRef, documentRef, undoStackRef, redoStackRef };
}

describe('Agent composition transaction boundary', () => {
  afterEach(() => {
    providerMocks.transcribe.mockReset();
    vi.unstubAllGlobals();
  });

  it('distinguishes ASR provider failure from genuine no-speech and exposes a useful tool error once', async () => {
    expect(classifyAsrResponse({ asr_ok: false, detail: 'dashscope_asr poll HTTP 503: busy' })).toBe('failed');
    expect(classifyAsrResponse({ asr_ok: false, detail: 'dashscope_asr returned no text' })).toBe('empty');

    const h = harness();
    Object.assign(h.ctx, {
      videoFileRef: { current: new File(['video'], 'talking-head.mp4', { type: 'video/mp4' }) },
      stepAsr: async () => { throw new Error('提取口播稿失败,稍后再试'); },
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => h.undoStackRef.current.push(h.documentRef.current),
    });
    if (!('XMLSerializer' in globalThis)) Object.assign(globalThis, { XMLSerializer: class { serializeToString() { return ''; } } });
    const { runStudioTool } = await import('./agent-tool-runner');
    const result = await runStudioTool(h.ctx, 'extract_asr', {});
    expect(result).toMatchObject({ ok: false, error: '提取口播稿失败,稍后再试' });

    const skill = readFileSync(new URL('../../../../src/lib/studio/scenario-skills/talking-head-edit/SKILL.md', import.meta.url), 'utf8');
    const execute = skill.slice(skill.indexOf('## Step 10: Execute with tool discipline'));
    expect(execute.indexOf('`remove_silence`')).toBeLessThan(execute.indexOf('`extract_asr`'));
    expect(execute).toContain('do not retry it in the same user request');
    expect(buildChatSystem(null)).toContain('the sole timeline mutation allowed before planning');
    expect(buildChatSystem(null)).toContain('do not call it again in the same user request');
  });

  it('transcribes a targeted registered audio asset without requiring a main video', async () => {
    const h = harness();
    const registered = runAgentTimelineTool(h.documentRef.current, 'register_media', {
      assets: [{ id: 'tts-audio', kind: 'audio', url: 'https://cdn.example/tts.mp3', durationSec: 12, transcriptText: '原始文稿' }],
    });
    const placed = runAgentTimelineTool(registered.document!, 'add_clips', {
      clips: [{ id: 'narration-clip', assetId: 'tts-audio', role: 'narration', startSec: 0 }],
    });
    h.ctx.setDocument(placed.document!);
    providerMocks.transcribe.mockResolvedValue([{ start: 0.2, end: 1.4, text: '实际发音', words: [{ start: 0.2, end: 0.8, text: '实际' }] }]);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Blob(['audio'], { type: 'audio/mpeg' }), {
      status: 200,
      headers: { 'content-type': 'audio/mpeg' },
    })));
    Object.assign(h.ctx, {
      resolveAssetUrl: (asset: { locator: { remoteUrl?: string } }) => asset.locator.remoteUrl,
      videoFileRef: { current: null },
      asrRef: { current: null },
      clipAsrRef: { current: {} },
      ensureClipTranscripts: async () => {},
      transcriptForAgent: () => 'AUDIO NARRATION: actual timing',
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => {},
    });
    if (!('XMLSerializer' in globalThis)) Object.assign(globalThis, { XMLSerializer: class { serializeToString() { return ''; } } });
    const { runStudioTool } = await import('./agent-tool-runner');
    const result = await runStudioTool(h.ctx, 'extract_asr', { clipId: 'narration-clip' });

    expect(result).toMatchObject({ ok: true, data: { assetId: 'tts-audio', transcript: 'AUDIO NARRATION: actual timing' } });
    expect(providerMocks.transcribe).toHaveBeenCalledWith(expect.objectContaining({ type: 'audio/mpeg' }));
    expect(h.documentRef.current.semantics.transcripts['tts-audio']).toEqual([
      { start: 0.2, end: 1.4, text: '实际发音', words: [{ start: 0.2, end: 0.8, text: '实际' }] },
    ]);
  });

  it('failed synchronous mutation rolls back state and both history lines', async () => {
    const h = harness();
    const redo = h.redoStackRef.current[0];
    const result = await runAtomicCompositionTool(h.ctx, async () => {
      h.undoStackRef.current.push(h.documentRef.current);
      h.redoStackRef.current = [];
      h.ctx.setDocument({ ...h.documentRef.current, canvas: { ...h.documentRef.current.canvas, width: 1920 } });
      return { ok: false, error: 'bad input' };
    });
    expect(result.ok).toBe(false);
    expect(h.compRef.current.width).toBe(1080);
    expect(h.undoStackRef.current).toEqual([]);
    expect(h.redoStackRef.current).toEqual([redo]);
  });

  it('invalid final composition rejects atomically; valid commit returns compact delta', async () => {
    const invalid = harness();
    const rejected = await runAtomicCompositionTool(invalid.ctx, async () => {
      const primary = invalid.documentRef.current.timeline.tracks[0]!;
      invalid.ctx.setDocument({
        ...invalid.documentRef.current,
        timeline: { tracks: [{ ...primary, clips: [...primary.clips, { ...primary.clips[0]! }] }] },
      });
      return { ok: true, summary: 'candidate' };
    });
    expect(rejected.ok).toBe(false);
    expect(invalid.compRef.current.shots).toHaveLength(1);

    const valid = harness();
    const committed = await runAtomicCompositionTool(valid.ctx, async () => {
      valid.ctx.setDocument({ ...valid.documentRef.current, canvas: { ...valid.documentRef.current.canvas, width: 1920, height: 1080 } });
      return { ok: true, summary: 'canvas' };
    });
    expect(committed.ok).toBe(true);
    expect((committed.data as { delta: { canvas: unknown } }).delta.canvas).toEqual({ from: [1080, 1920], to: [1920, 1080] });
  });

  it('rolls back a V2-only mutation which the compatibility composition cannot see', async () => {
    const h = harness();
    const before = h.documentRef.current;
    const result = await runAtomicCompositionTool(h.ctx, async () => {
      h.ctx.setDocument({
        ...h.documentRef.current,
        timeline: {
          tracks: [
            ...h.documentRef.current.timeline.tracks,
            { id: 'broll', type: 'visual', role: 'broll', muted: false, hidden: false, locked: false, syncLocked: true, stackOrder: 1, clips: [] },
          ],
        },
      });
      return { ok: false, error: 'later semantic step failed' };
    });
    expect(result.ok).toBe(false);
    expect(h.documentRef.current).toBe(before);
    expect(h.documentRef.current.timeline.tracks.map((track) => track.id)).not.toContain('broll');
  });

  it('browser cut_range commits through V2 and ripples a media lane invisible to Composition', async () => {
    const h = harness();
    h.compRef.current = {
      ...h.compRef.current,
      video: { url: 'blob:runtime-main', durationSec: 3 },
    };
    h.documentRef.current = compositionToEditorDocument({ projectId: 'test', composition: h.compRef.current, videoSig: 'main-sig' }).document;
    h.documentRef.current.assets['broll-asset'] = { id: 'broll-asset', kind: 'video', locator: { localSig: 'broll-sig' }, metadata: { durationSec: 1 } };
    h.documentRef.current.timeline.tracks.push({
      id: 'broll', type: 'visual', role: 'broll', muted: false, hidden: false, locked: false, syncLocked: true, stackOrder: 1,
      clips: [{ id: 'broll-clip', kind: 'media', assetId: 'broll-asset', startFrame: 60, durationFrames: 30, sourceInSec: 0, sourceOutSec: 1, enabled: true }],
    });
    Object.assign(h.ctx, {
      ensureShots: (c: Composition) => c.shots ?? [],
      pushUndoSnapshot: () => h.undoStackRef.current.push(h.documentRef.current),
      genIdsRef: { current: new Set<string>() },
      relayCaptionLayer: (blocks: Composition['blocks']) => blocks,
      asrRef: { current: null },
      clipAsrRef: { current: {} },
      setSelectedShotId: () => {},
      applyT: () => {},
    });
    if (!('XMLSerializer' in globalThis)) Object.assign(globalThis, { XMLSerializer: class { serializeToString() { return ''; } } });
    const { runStudioTool } = await import('./agent-tool-runner');
    const result = await runStudioTool(h.ctx, 'cut_range', { fromSec: 0, toSec: 1 });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(h.documentRef.current.timeline.tracks.find((track) => track.id === 'broll')?.clips[0]).toMatchObject({ startFrame: 30 });
  });

  it('browser shot properties commit directly to V2 without collapsing a native gap', async () => {
    const h = harness();
    h.documentRef.current.timeline.tracks[0]!.clips[0]!.startFrame = 45;
    h.documentRef.current.timeline.tracks.push({
      id: 'broll', type: 'visual', role: 'broll', muted: false, hidden: false, locked: false,
      syncLocked: false, stackOrder: 1, clips: [],
    });
    Object.assign(h.ctx, {
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => h.undoStackRef.current.push(h.documentRef.current),
    });
    if (!('XMLSerializer' in globalThis)) Object.assign(globalThis, { XMLSerializer: class { serializeToString() { return ''; } } });
    const { runStudioTool } = await import('./agent-tool-runner');
    const result = await runStudioTool(h.ctx, 'set_video_filter', { shotId: 's1', contrast: 1.25 });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(h.documentRef.current.timeline.tracks[0]!.clips[0]).toMatchObject({
      id: 's1', startFrame: 45, properties: { filter: { contrast: 1.25 } },
    });
    expect(h.documentRef.current.timeline.tracks.find((track) => track.id === 'broll')).toBeTruthy();
  });

  it('Chat add_block inserts an editable box instead of a boxless visual', async () => {
    const h = harness();
    Object.assign(h.ctx, {
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => h.undoStackRef.current.push(h.documentRef.current),
      setSelectedId: () => {},
      setSelectedShotId: () => {},
      applyT: () => {},
      tRef: { current: 0 },
      composeBlockChecked: async () => ({
        innerHtml: '<div>42</div>',
        timelineBody: '',
        note: 'created',
      }),
      noteOf: () => '',
    });
    if (!('XMLSerializer' in globalThis)) Object.assign(globalThis, { XMLSerializer: class { serializeToString() { return ''; } } });
    const { runStudioTool } = await import('./agent-tool-runner');
    const result = await runStudioTool(h.ctx, 'add_block', { instruction: 'show 42' });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(h.compRef.current.blocks).toHaveLength(1);
    expect(h.compRef.current.blocks[0]).toMatchObject({
      templateId: 'custom',
      box: { x: 0.14, y: 0.3, w: 0.72, h: 0.4 },
    });
  });

  it('async failure preserves a later manual edit and removes only the tool ghost snapshot', async () => {
    const h = harness();
    if (!('XMLSerializer' in globalThis)) Object.assign(globalThis, { XMLSerializer: class { serializeToString() { return ''; } } });
    const { runAtomicCompositionTool: run } = await import('./agent-tool-runner');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const pending = run(h.ctx, async () => {
      h.undoStackRef.current.push(h.documentRef.current); // raw tool snapshot
      h.redoStackRef.current = [];
      await gate;
      return { ok: false, error: 'provider failed' };
    });
    h.undoStackRef.current.push(h.documentRef.current); // manual edit snapshot
    h.ctx.setDocument({ ...h.documentRef.current, canvas: { ...h.documentRef.current.canvas, width: 1440 } });
    release();
    const result = await pending;
    expect(result.ok).toBe(false);
    expect(h.compRef.current.width).toBe(1440);
    expect(h.undoStackRef.current).toHaveLength(1);
  });
});
