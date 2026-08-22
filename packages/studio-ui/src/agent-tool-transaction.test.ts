import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  type Composition,
  type EditorDocumentV2,
  compositionToEditorDocument,
  emptyEditorDocumentV2,
  projectDocumentToComposition,
  runAgentTimelineTool,
} from '@pireel/studio-engine/composition';
import { buildChatSystem, buildHtmlSystem } from '@pireel/studio-engine/prompts';
import type { AgentToolCtx } from './agent-tool-runner';
import { classifyAsrResponse } from './media';
import { localAssetMentionId } from './chat-local-asset-mention';

const providerMocks = vi.hoisted(() => ({ transcribe: vi.fn() }));
const mediaMocks = vi.hoisted(() => ({ probeVideoFile: vi.fn() }));
const visualMocks = vi.hoisted(() => ({ analyzeVisual: vi.fn(), analyzeVisualGeometry: vi.fn() }));
const localMediaMocks = vi.hoisted(() => ({
  loadLocalVideo: vi.fn(),
  loadLocalFolderFile: vi.fn(),
  saveLocalVideo: vi.fn(),
}));
vi.mock('@pireel/studio-engine/providers', () => ({
  studioProviders: () => ({ transcriber: { transcribe: providerMocks.transcribe } }),
}));
vi.mock('./media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./media')>()),
  probeVideoFile: mediaMocks.probeVideoFile,
}));
vi.mock('./visual', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./visual')>()),
  analyzeVisual: visualMocks.analyzeVisual,
  analyzeVisualGeometry: visualMocks.analyzeVisualGeometry,
}));
vi.mock('./local-media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./local-media')>()),
  loadLocalVideo: localMediaMocks.loadLocalVideo,
  loadLocalFolderFile: localMediaMocks.loadLocalFolderFile,
  saveLocalVideo: localMediaMocks.saveLocalVideo,
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
  const asrRef = { current: null };
  const clipAsrRef = { current: {} };
  const setDocument = (document: EditorDocumentV2, runtimeComposition?: Composition) => {
    documentRef.current = document;
    compRef.current = runtimeComposition ?? projectDocumentToComposition(document);
  };
  return {
    ctx: { compRef, documentRef, undoStackRef, redoStackRef, asrRef, clipAsrRef, setDocument } as unknown as AgentToolCtx,
    compRef,
    documentRef,
    undoStackRef,
    redoStackRef,
  };
}

describe('Agent composition transaction boundary', () => {
  afterEach(() => {
    providerMocks.transcribe.mockReset();
    mediaMocks.probeVideoFile.mockReset();
    visualMocks.analyzeVisual.mockReset();
    visualMocks.analyzeVisualGeometry.mockReset();
    localMediaMocks.loadLocalVideo.mockReset();
    localMediaMocks.loadLocalFolderFile.mockReset();
    localMediaMocks.saveLocalVideo.mockReset();
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
    expect(execute).toContain('After Approve, run `remove_silence` first');
    expect(execute).toContain('do not retry it in the same user request');
    expect(buildChatSystem(null)).toContain('Before Approve, do not call set_director_plan, remove_silence');
    expect(buildChatSystem(null)).toContain('do not call it again in the same user request');
    expect(buildChatSystem(null)).toContain('Build one cross-media evidence map before approval');
    expect(buildChatSystem(null)).toContain('repetition used only to fill uncovered time is a planning failure');
    expect(buildChatSystem(null)).toContain('compare actual clip ownership and media coverage');
  });

  it('prepares every referenced device-local media asset before clips are committed', async () => {
    const h = harness();
    const registered = runAgentTimelineTool(h.documentRef.current, 'register_media', {
      assets: [
        { id: 'local-video', kind: 'video', localSig: 'video:sig', durationSec: 8 },
        { id: 'local-image', kind: 'image', localSig: 'image:sig' },
        { id: 'local-audio', kind: 'audio', localSig: 'audio:sig', durationSec: 6 },
      ],
    });
    expect(registered.ok).toBe(true);
    if (!registered.document) throw new Error('registration did not return a document');
    h.ctx.setDocument(registered.document);
    const prepareLocalAssetRuntime = vi.fn().mockResolvedValue({ ok: true, prepared: true });
    Object.assign(h.ctx, {
      prepareLocalAssetRuntime,
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => h.undoStackRef.current.push(h.documentRef.current),
    });
    if (!('XMLSerializer' in globalThis)) Object.assign(globalThis, { XMLSerializer: class { serializeToString() { return ''; } } });
    const { runStudioTool } = await import('./agent-tool-runner');
    const result = await runStudioTool(h.ctx, 'add_clips', {
      clips: [
        { assetId: 'local-video', startSec: 0, durationSec: 4 },
        { assetId: 'local-image', startSec: 4, durationSec: 4 },
        { assetId: 'local-audio', startSec: 0, durationSec: 6, role: 'narration' },
      ],
    });

    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(prepareLocalAssetRuntime.mock.calls.map(([asset]) => asset.id)).toEqual([
      'local-video',
      'local-image',
      'local-audio',
    ]);
    expect(
      h.documentRef.current.timeline.tracks
        .flatMap((track) => track.clips)
        .filter((clip) => 'assetId' in clip && typeof clip.assetId === 'string' && clip.assetId.startsWith('local-')),
    ).toHaveLength(3);
  });

  it('does not mutate the timeline when device-local bytes cannot be restored', async () => {
    const h = harness();
    const registered = runAgentTimelineTool(h.documentRef.current, 'register_media', {
      assets: [{ id: 'missing-video', kind: 'video', localSig: 'missing:sig', durationSec: 8 }],
    });
    expect(registered.ok).toBe(true);
    if (!registered.document) throw new Error('registration did not return a document');
    h.ctx.setDocument(registered.document);
    const before = h.documentRef.current;
    Object.assign(h.ctx, {
      prepareLocalAssetRuntime: vi.fn().mockResolvedValue({ ok: false, error: 'restore local access' }),
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => h.undoStackRef.current.push(h.documentRef.current),
    });
    if (!('XMLSerializer' in globalThis)) Object.assign(globalThis, { XMLSerializer: class { serializeToString() { return ''; } } });
    const { runStudioTool } = await import('./agent-tool-runner');
    const result = await runStudioTool(h.ctx, 'add_clips', {
      clips: [{ assetId: 'missing-video', startSec: 0, durationSec: 4 }],
    });

    expect(result).toMatchObject({
      ok: false,
      error: 'restore local access',
      data: { assetId: 'missing-video', availability: 'metadata-only' },
    });
    expect(h.documentRef.current).toBe(before);
    expect(h.undoStackRef.current).toHaveLength(0);
  });

  it('keeps speech edits visually directed without an implicit Smart Select frame', () => {
    const skill = readFileSync(new URL('../../../../src/lib/studio/scenario-skills/talking-head-edit/SKILL.md', import.meta.url), 'utf8');
    expect(skill).not.toContain('Smart Select');
    expect(skill).not.toContain('attach `editorial-pulse`');
    expect(skill).toContain('picture-change contract');
    expect(skill).toContain('roughly every 5–10 seconds');
    expect(skill).toContain('never loop or stretch one short clip as wallpaper');
    expect(skill).toContain('local image sig → `inspect_images`');

    const componentSystem = buildHtmlSystem({ componentIds: [] });
    expect(componentSystem).toContain('participating in a video scene');
    expect(componentSystem).toContain('A decisive typographic beat MAY be type-only');
    expect(componentSystem).toContain('not a dashboard widget');
  });

  it('pins every explicitly prepared local image even when its native handle is currently readable', async () => {
    const h = harness();
    const sig = 'platform-data.jpg:12:7';
    const image = new File(['image-bytes'], 'platform-data.jpg', { type: 'image/jpeg', lastModified: 7 });
    localMediaMocks.loadLocalVideo.mockResolvedValue(image);
    Object.assign(h.ctx, {
      localAssetIndexRef: { current: [{ sig, label: '平台数据', kind: 'image', createdAt: 1 }] },
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => {},
      t: (key: string) => key,
    });
    if (!('XMLSerializer' in globalThis)) Object.assign(globalThis, { XMLSerializer: class { serializeToString() { return ''; } } });
    const { runStudioTool } = await import('./agent-tool-runner');
    const result = await runStudioTool(h.ctx, 'prepare_local_image', { sig });

    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(localMediaMocks.loadLocalFolderFile).not.toHaveBeenCalled();
    expect(localMediaMocks.saveLocalVideo).toHaveBeenCalledWith(image, sig, undefined, { pinned: true });
  });

  it('inspects local image pixels before timeline placement without uploading them to the media library', async () => {
    const h = harness();
    const sig = 'conversion-chart.png:18:9';
    const image = new File(['image-pixels'], 'conversion-chart.png', { type: 'image/png', lastModified: 9 });
    localMediaMocks.loadLocalVideo.mockResolvedValue(image);
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 1600, height: 900, close: vi.fn() }));
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: vi.fn() }),
        toBlob: (callback: (blob: Blob | null) => void) => callback(new Blob(['compressed-pixels'], { type: 'image/jpeg' })),
      }),
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      frames: [{ atSec: 0, scene: 'A line chart shows conversion rising from 12% to 31%, with the final value emphasized in blue.', issues: [] }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    Object.assign(h.ctx, {
      localAssetIndexRef: { current: [{ sig, label: '转化率数据', kind: 'image', createdAt: 1 }] },
      resolveAssetUrl: () => null,
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => {},
    });
    if (!('XMLSerializer' in globalThis)) Object.assign(globalThis, { XMLSerializer: class { serializeToString() { return ''; } } });
    const { runStudioTool } = await import('./agent-tool-runner');
    const mentionId = localAssetMentionId(sig);
    const result = await runStudioTool(h.ctx, 'inspect_images', { refs: [mentionId] });

    expect(result).toMatchObject({
      ok: true,
      data: {
        images: [{ ref: sig, label: '转化率数据', description: expect.stringContaining('12% to 31%') }],
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/studio/review');
    expect(JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit)?.body))).toMatchObject({ mode: 'assets' });
    expect(localMediaMocks.saveLocalVideo).not.toHaveBeenCalled();
  });

  it('stops image inspection while local pixels are still being prepared', async () => {
    const h = harness();
    const sig = 'slow-reference.png:18:9';
    const image = new File(['image-pixels'], 'slow-reference.png', { type: 'image/png', lastModified: 9 });
    localMediaMocks.loadLocalVideo.mockResolvedValue(image);
    vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise(() => {})));
    Object.assign(h.ctx, {
      localAssetIndexRef: { current: [{ sig, label: '慢速图片', kind: 'image', createdAt: 1 }] },
      resolveAssetUrl: () => null,
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => {},
    });
    if (!('XMLSerializer' in globalThis)) Object.assign(globalThis, { XMLSerializer: class { serializeToString() { return ''; } } });
    const { runStudioTool } = await import('./agent-tool-runner');
    const controller = new AbortController();
    const pending = runStudioTool(h.ctx, 'inspect_images', { refs: [localAssetMentionId(sig)] }, { signal: controller.signal, surface: 'chat' });

    controller.abort();

    await expect(pending).resolves.toMatchObject({ ok: false, error: '已停止' });
  });

  it('transcribes an unplaced local video when a model mirrors its @ reference token into assetId', async () => {
    const h = harness();
    const sig = 'viral-reference.mp4:240:12';
    const video = new File(['video-with-speech'], 'viral-reference.mp4', { type: 'video/mp4', lastModified: 12 });
    localMediaMocks.loadLocalVideo.mockResolvedValue(video);
    mediaMocks.probeVideoFile.mockResolvedValue({ durationSec: 30, width: 1080, height: 1920, hasAudio: true });
    providerMocks.transcribe.mockResolvedValue([{ start: 0.2, end: 2.4, text: '先用结果抓住观众' }]);
    Object.assign(h.ctx, {
      localAssetIndexRef: { current: [{ sig, label: '爆款参考视频', kind: 'video', createdAt: 1 }] },
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => {},
    });
    const assetIdsBefore = Object.keys(h.documentRef.current.assets);
    if (!('XMLSerializer' in globalThis)) Object.assign(globalThis, { XMLSerializer: class { serializeToString() { return ''; } } });
    const { runStudioTool } = await import('./agent-tool-runner');
    const result = await runStudioTool(h.ctx, 'extract_asr', { assetId: localAssetMentionId(sig) });

    expect(result).toMatchObject({
      ok: true,
      data: {
        localSig: sig,
        label: '爆款参考视频',
        kind: 'video',
        durationSec: 30,
        transcript: expect.stringContaining('先用结果抓住观众'),
      },
    });
    expect(providerMocks.transcribe).toHaveBeenCalledWith(video);
    expect(localMediaMocks.saveLocalVideo).toHaveBeenCalledWith(video, sig, undefined, { pinned: false });
    expect(Object.keys(h.documentRef.current.assets)).toEqual(assetIdsBefore);
  });

  it('treats provider no-fragment as a speech-free observation and mutes that local source on placement', async () => {
    const h = harness();
    h.ctx.setDocument(emptyEditorDocumentV2({ width: 1080, height: 1920, fps: 30 }));
    const sig = 'noise-only.mp4:240:12';
    const video = new File(['noise'], 'noise-only.mp4', { type: 'video/mp4', lastModified: 12 });
    localMediaMocks.loadLocalVideo.mockResolvedValue(video);
    mediaMocks.probeVideoFile.mockResolvedValue({ durationSec: 6, width: 960, height: 1280, hasAudio: true });
    providerMocks.transcribe.mockRejectedValue(new Error('SUCCESS_WITH_NO_VALID_FRAGMENT'));
    Object.assign(h.ctx, {
      localAssetIndexRef: { current: [{ sig, label: '环境噪声素材', kind: 'video', createdAt: 1 }] },
      prepareLocalAssetRuntime: async () => ({ ok: true }),
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => {},
    });
    if (!('XMLSerializer' in globalThis)) Object.assign(globalThis, { XMLSerializer: class { serializeToString() { return ''; } } });
    const { runStudioTool } = await import('./agent-tool-runner');
    const observed = await runStudioTool(h.ctx, 'extract_asr', { localSig: sig });
    expect(observed).toMatchObject({ ok: true, data: { speechDetected: false, defaultSourceAudio: 'muted' } });

    const registered = await runStudioTool(h.ctx, 'register_media', {
      assets: [{ id: 'noise', kind: 'video', localSig: sig, durationSec: 6, width: 960, height: 1280 }],
    });
    expect(registered.ok).toBe(true);
    const placed = await runStudioTool(h.ctx, 'add_clips', {
      clips: [{ id: 'noise-clip', assetId: 'noise', role: 'primary', startSec: 0, durationSec: 6 }],
    });
    expect(placed.ok).toBe(true);
    expect(h.documentRef.current.timeline.tracks.flatMap((track) => track.clips).find((clip) => clip.id === 'noise-clip'))
      .toMatchObject({ properties: { audioMuted: true } });
  });

  it('analyzes an unplaced local video by sig before Director planning', async () => {
    const h = harness();
    const sig = 'product-demo.mp4:120:4';
    const video = new File(['video-bytes'], 'product-demo.mp4', { type: 'video/mp4', lastModified: 4 });
    localMediaMocks.loadLocalVideo.mockResolvedValue(video);
    mediaMocks.probeVideoFile.mockResolvedValue({ durationSec: 18, width: 1080, height: 1920, hasAudio: true });
    visualMocks.analyzeVisual.mockResolvedValue({
      cuts: [6],
      segments: [{ start: 0, end: 18, label: { content: 'broll', person: 'none', safe: 'top', hasText: false, desc: 'Hands demonstrate the product.' } }],
    });
    Object.assign(h.ctx, {
      localAssetIndexRef: { current: [{ sig, label: '产品演示', kind: 'video', createdAt: 1 }] },
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => {},
    });
    const assetIdsBefore = Object.keys(h.documentRef.current.assets);
    if (!('XMLSerializer' in globalThis)) Object.assign(globalThis, { XMLSerializer: class { serializeToString() { return ''; } } });
    const { runStudioTool } = await import('./agent-tool-runner');
    const result = await runStudioTool(h.ctx, 'analyze_visual', { localSig: sig });

    expect(result).toMatchObject({
      ok: true,
      data: {
        localSig: sig,
        label: '产品演示',
        durationSec: 18,
        sceneCutsSec: [6],
        segments: [{ description: 'Hands demonstrate the product.' }],
      },
    });
    expect(Object.keys(h.documentRef.current.assets)).toEqual(assetIdsBefore);
    expect(Object.values(h.documentRef.current.assets).some((asset) => asset.locator.localSig === sig)).toBe(false);
  });

  it('uses local geometry without semantic VLM output for framing-only analysis', async () => {
    const h = harness();
    const sig = 'speaker.mp4:80:5';
    const video = new File(['video-bytes'], 'speaker.mp4', { type: 'video/mp4', lastModified: 5 });
    localMediaMocks.loadLocalVideo.mockResolvedValue(video);
    mediaMocks.probeVideoFile.mockResolvedValue({ durationSec: 12, width: 1080, height: 1920, hasAudio: true });
    visualMocks.analyzeVisualGeometry.mockResolvedValue({
      cuts: [4],
      segments: [{
        start: 0,
        end: 12,
        label: { content: 'talkinghead', person: 'center', safe: 'full', hasText: false, desc: '' },
        geom: {
          subject: { x: 0.25, y: 0.1, w: 0.4, h: 0.8 },
          face: { x: 0.35, y: 0.15, w: 0.15, h: 0.15 },
          rects: [{ x: 0.68, y: 0.12, w: 0.27, h: 0.65 }],
        },
      }],
    });
    Object.assign(h.ctx, {
      localAssetIndexRef: { current: [{ sig, label: '口播原片', kind: 'video', createdAt: 1 }] },
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => {},
    });
    const { runStudioTool } = await import('./agent-tool-runner');
    const result = await runStudioTool(h.ctx, 'analyze_visual', { localSig: sig, mode: 'geometry' });

    expect(result).toMatchObject({
      ok: true,
      data: {
        analysisMode: 'local-geometry',
        sceneCutsSec: [4],
        subjectTracks: [{ subject: { coordinateSpace: 'source-normalized' } }],
      },
    });
    expect((result as { data?: Record<string, unknown> }).data).not.toHaveProperty('segments');
    expect(visualMocks.analyzeVisualGeometry).toHaveBeenCalled();
    expect(visualMocks.analyzeVisual).not.toHaveBeenCalled();
  });

  it('transcribes a targeted registered audio asset without requiring a main video', async () => {
    const h = harness();
    const registered = runAgentTimelineTool(h.documentRef.current, 'register_media', {
      assets: [{ id: 'tts-audio', kind: 'audio', url: 'https://cdn.example/tts.mp3', transcriptText: '原始文稿' }],
    });
    h.ctx.setDocument(registered.document!);
    mediaMocks.probeVideoFile.mockResolvedValue({ durationSec: 12.4, width: 0, height: 0, hasAudio: true });
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
    const result = await runStudioTool(h.ctx, 'extract_asr', { assetId: 'tts-audio' });

    expect(result).toMatchObject({
      ok: true,
      data: { assetId: 'tts-audio', durationSec: 12.4, transcript: expect.stringContaining('实际发音') },
    });
    expect(providerMocks.transcribe).toHaveBeenCalledWith(expect.objectContaining({ type: 'audio/mpeg' }));
    expect(h.documentRef.current.assets['tts-audio']?.metadata).toMatchObject({ durationSec: 12.4, hasAudio: true });
    expect(h.documentRef.current.semantics.transcripts['tts-audio']).toEqual([
      { start: 0.2, end: 1.4, text: '实际发音', words: [{ start: 0.2, end: 0.8, text: '实际' }] },
    ]);
    const placed = runAgentTimelineTool(h.documentRef.current, 'add_clips', {
      clips: [{ id: 'narration-clip', assetId: 'tts-audio', role: 'narration', startSec: 0 }],
    });
    expect(placed.document!.timeline.tracks.find((track) => track.role === 'narration')?.clips[0]).toMatchObject({
      id: 'narration-clip',
      durationFrames: 372,
      sourceOutSec: 12.4,
    });
  });

  it('transcribes a targeted registered video clip after get_transcript reports no stored transcript', async () => {
    const h = harness();
    h.ctx.setDocument(emptyEditorDocumentV2({ width: 1080, height: 1920, fps: 30 }));
    const registered = runAgentTimelineTool(h.documentRef.current, 'register_media', {
      assets: [{ id: 'speaker-video', kind: 'video', url: 'https://cdn.example/speaker.mp4', durationSec: 18, width: 1080, height: 1920, hasAudio: true }],
    });
    const placed = runAgentTimelineTool(registered.document!, 'add_clips', {
      clips: [{ id: 'speaker-clip', assetId: 'speaker-video', role: 'primary', startSec: 0, durationSec: 18 }],
    });
    h.ctx.setDocument(placed.document!);
    providerMocks.transcribe.mockResolvedValue([{ start: 0.4, end: 2.1, text: '这是视频里的口播' }]);
    mediaMocks.probeVideoFile.mockResolvedValue({ durationSec: 18, width: 1080, height: 1920, hasAudio: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Blob(['video'], { type: 'video/mp4' }), {
      status: 200,
      headers: { 'content-type': 'video/mp4' },
    })));
    Object.assign(h.ctx, {
      resolveAssetUrl: (asset: { locator: { remoteUrl?: string } }) => asset.locator.remoteUrl,
      videoFileRef: { current: null },
      asrRef: { current: null },
      setAsrSentences: vi.fn(),
      clipAsrRef: { current: {} },
      transcriptForAgent: () => 'VIDEO TRANSCRIPT: 这是视频里的口播',
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => {},
    });
    if (!('XMLSerializer' in globalThis)) Object.assign(globalThis, { XMLSerializer: class { serializeToString() { return ''; } } });
    const { runStudioTool } = await import('./agent-tool-runner');
    const before = await runStudioTool(h.ctx, 'get_transcript', { clipId: 'speaker-clip' });
    expect(before).toMatchObject({ ok: false, error: 'no transcript for the selected source' });

    const result = await runStudioTool(h.ctx, 'extract_asr', { clipId: 'speaker-clip' });

    expect(result, result.ok ? undefined : result.error).toMatchObject({
      ok: true,
      data: { assetId: 'speaker-video', durationSec: 18, transcript: expect.stringContaining('这是视频里的口播') },
    });
    expect(providerMocks.transcribe).toHaveBeenCalledWith(expect.objectContaining({ type: 'video/mp4' }));
    expect(h.documentRef.current.semantics.transcripts['speaker-video']).toEqual([
      { start: 0.4, end: 2.1, text: '这是视频里的口播' },
    ]);
    const stored = await runStudioTool(h.ctx, 'get_transcript', { clipId: 'speaker-clip' });
    expect(stored).toMatchObject({
      ok: true,
      data: { transcripts: [{ assetId: 'speaker-video', segments: [{ text: '这是视频里的口播' }] }] },
    });
  });

  it('analyzes the only B-roll video in an audio-led project without a mounted main video', async () => {
    const h = harness();
    h.ctx.setDocument(emptyEditorDocumentV2({ width: 1080, height: 1920, fps: 30 }));
    const registered = runAgentTimelineTool(h.documentRef.current, 'register_media', {
      assets: [
        { id: 'demo-video', kind: 'video', url: 'https://cdn.example/demo.mp4' },
        // Re-registering the same underlying local/cloud source must not turn one video into an
        // ambiguous visual-analysis choice.
        { id: 'demo-video-alias', kind: 'video', url: 'https://cdn.example/demo.mp4' },
      ],
    });
    const placed = runAgentTimelineTool(registered.document!, 'add_clips', {
      clips: [{ id: 'demo-clip', assetId: 'demo-video', role: 'broll', startSec: 0 }],
    });
    h.ctx.setDocument(placed.document!);
    mediaMocks.probeVideoFile.mockResolvedValue({ durationSec: 30, width: 1280, height: 720, hasAudio: true });
    visualMocks.analyzeVisual.mockResolvedValue({
      cuts: [8.5],
      segments: [{
        start: 0,
        end: 30,
        label: { content: 'broll', person: 'center', safe: 'right', hasText: false, desc: 'AI demonstration video' },
      }],
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Blob(['video'], { type: 'video/mp4' }), {
      status: 200,
      headers: { 'content-type': 'video/mp4' },
    })));
    Object.assign(h.ctx, {
      resolveAssetUrl: (asset: { locator: { remoteUrl?: string } }) => asset.locator.remoteUrl,
      videoFileRef: { current: null },
      clipFilesRef: { current: new Map<string, File>() },
      currentVideo: () => null,
      stepVisual: async () => { throw new Error('mounted-primary path must not run'); },
      visualRef: { current: null },
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => {},
    });
    if (!('XMLSerializer' in globalThis)) Object.assign(globalThis, { XMLSerializer: class { serializeToString() { return ''; } } });
    const { runStudioTool } = await import('./agent-tool-runner');
    const result = await runStudioTool(h.ctx, 'analyze_visual', {});

    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(result).toMatchObject({
      ok: true,
      data: {
        assetId: 'demo-video',
        sceneCutsSec: [8.5],
        segments: [{ content: 'broll', description: 'AI demonstration video' }],
      },
    });
    expect(visualMocks.analyzeVisual).toHaveBeenCalledWith(expect.objectContaining({ type: 'video/mp4' }), 30, expect.any(Function));
    expect(h.documentRef.current.assets['demo-video']?.metadata).toMatchObject({ durationSec: 30, width: 1280, height: 720, hasAudio: true });
  });

  it('keeps simultaneous visual evidence on separate lanes and lays media clips out directly', async () => {
    const h = harness();
    h.ctx.setDocument(emptyEditorDocumentV2({ width: 1920, height: 1080, fps: 30 }));
    const registered = runAgentTimelineTool(h.documentRef.current, 'register_media', {
      assets: [
        { id: 'proof-xhs', kind: 'image', url: 'https://cdn.example/xhs.jpg' },
        { id: 'proof-x', kind: 'image', url: 'https://cdn.example/x.jpg' },
        { id: 'proof-video-account', kind: 'image', url: 'https://cdn.example/video-account.jpg' },
      ],
    });
    const placed = runAgentTimelineTool(registered.document!, 'add_clips', {
      clips: [
        { id: 'clip-xhs', assetId: 'proof-xhs', startSec: 2, durationSec: 4 },
        { id: 'clip-x', assetId: 'proof-x', startSec: 2, durationSec: 4 },
        { id: 'clip-video-account', assetId: 'proof-video-account', startSec: 2, durationSec: 4 },
      ],
    });
    expect(placed.ok, JSON.stringify(placed)).toBe(true);
    h.ctx.setDocument(placed.document!);
    const visualTracks = h.documentRef.current.timeline.tracks.filter((track) => track.role === 'broll');
    expect(visualTracks).toHaveLength(3);
    expect(visualTracks.flatMap((track) => track.clips.map((clip) => clip.id)).sort()).toEqual([
      'clip-video-account', 'clip-x', 'clip-xhs',
    ]);

    Object.assign(h.ctx, {
      ensureShots: (c: Composition) => c.shots ?? [],
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => h.undoStackRef.current.push(h.documentRef.current),
      setSelectedShotId: () => {},
    });
    if (!('XMLSerializer' in globalThis)) Object.assign(globalThis, { XMLSerializer: class { serializeToString() { return ''; } } });
    const { runStudioTool } = await import('./agent-tool-runner');
    const result = await runStudioTool(h.ctx, 'apply_layout', {
      layout: 'split-left-right',
      blockIds: ['clip-xhs', 'clip-x', 'clip-video-account'],
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    const clips = h.documentRef.current.timeline.tracks
      .flatMap((track) => track.clips)
      .filter((clip) => ['clip-xhs', 'clip-x', 'clip-video-account'].includes(clip.id));
    expect(clips.every((clip) => clip.kind === 'media' && clip.box)).toBe(true);
    const xs = clips.map((clip) => clip.kind === 'media' ? clip.box!.x : -1).sort((a, b) => a - b);
    expect(xs[0]).toBeLessThan(xs[1]!);
    expect(xs[1]).toBeLessThan(xs[2]!);
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

  it('stops a pending add_block without letting its late result mutate the timeline', async () => {
    const h = harness();
    let release!: (value: { innerHtml: string; timelineBody: string; note: string }) => void;
    const generated = new Promise<{ innerHtml: string; timelineBody: string; note: string }>((resolve) => {
      release = resolve;
    });
    Object.assign(h.ctx, {
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => h.undoStackRef.current.push(h.documentRef.current),
      setSelectedId: () => {},
      setSelectedShotId: () => {},
      applyT: () => {},
      tRef: { current: 0 },
      composeBlockChecked: () => generated,
      noteOf: () => '',
    });
    if (!('XMLSerializer' in globalThis)) Object.assign(globalThis, { XMLSerializer: class { serializeToString() { return ''; } } });
    const { runStudioTool } = await import('./agent-tool-runner');
    const controller = new AbortController();
    const pending = runStudioTool(h.ctx, 'add_block', { instruction: 'show 42' }, { signal: controller.signal, surface: 'chat' });

    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    release({ innerHtml: '<div>late</div>', timelineBody: '', note: 'late' });
    await Promise.resolve();

    expect(h.compRef.current.blocks).toHaveLength(0);
    expect(h.undoStackRef.current).toHaveLength(0);
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
