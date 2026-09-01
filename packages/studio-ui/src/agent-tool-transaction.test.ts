import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { GeneratedBlockValidationError } from './compose-result';
import { classifyAsrResponse } from './media';
import { localAssetMentionId } from './chat-local-asset-mention';
import { resolveInteraction } from './interaction-store';

const providerMocks = vi.hoisted(() => ({ transcribe: vi.fn() }));
const mediaMocks = vi.hoisted(() => ({ probeVideoFile: vi.fn() }));
const visualMocks = vi.hoisted(() => ({ analyzeVisual: vi.fn(), analyzeVisualGeometry: vi.fn() }));
const editorialReviewMocks = vi.hoisted(() => ({
  reviewEditorialCandidates: vi.fn(),
  editorialOpeningEvidence: vi.fn(),
  compareEditorialOpenings: vi.fn(),
}));
const speechMocks = vi.hoisted(() => ({
  assessLocalSpeechAudio: vi.fn(),
  detectSpeechSilenceCuts: vi.fn(),
}));
const progressMocks = vi.hoisted(() => ({
  setToolProgress: vi.fn(),
  clearToolProgress: vi.fn(),
}));
const localMediaMocks = vi.hoisted(() => {
  const loadLocalVideo = vi.fn();
  return {
    loadLocalVideo,
    loadLocalAssetFile: vi.fn(() => loadLocalVideo()),
    loadLocalFolderFile: vi.fn(),
    saveLocalVideo: vi.fn(),
  };
});
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
vi.mock('./editorial-review', () => ({
  reviewEditorialCandidates: editorialReviewMocks.reviewEditorialCandidates,
  editorialOpeningEvidence: editorialReviewMocks.editorialOpeningEvidence,
  compareEditorialOpenings: editorialReviewMocks.compareEditorialOpenings,
}));
vi.mock('./speech-silence', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./speech-silence')>()),
  assessLocalSpeechAudio: speechMocks.assessLocalSpeechAudio,
  detectSpeechSilenceCuts: speechMocks.detectSpeechSilenceCuts,
}));
vi.mock('./local-media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./local-media')>()),
  loadLocalVideo: localMediaMocks.loadLocalVideo,
  loadLocalAssetFile: localMediaMocks.loadLocalAssetFile,
  loadLocalFolderFile: localMediaMocks.loadLocalFolderFile,
  saveLocalVideo: localMediaMocks.saveLocalVideo,
}));
vi.mock('./tool-progress', () => ({
  setToolProgress: progressMocks.setToolProgress,
  clearToolProgress: progressMocks.clearToolProgress,
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

const localEntry = (
  assetId: string,
  contentSig: string,
  label: string,
  kind: 'video' | 'image' | 'audio',
) => ({ assetId, contentSig, sig: contentSig, label, kind, createdAt: 1 });

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
    ctx: {
      compRef,
      documentRef,
      undoStackRef,
      redoStackRef,
      asrRef,
      clipAsrRef,
      localTranscriptCacheRef: { current: new Map() },
      setDocument,
      pickVideoFile: async () => {},
    } as unknown as AgentToolCtx,
    compRef,
    documentRef,
    undoStackRef,
    redoStackRef,
  };
}

describe('Agent composition transaction boundary', () => {
  beforeEach(() => {
    speechMocks.assessLocalSpeechAudio.mockResolvedValue({
      classification: 'speech-likely', hasAudio: true, audible: true, speechLikely: true,
      audibleSec: 4, speechSec: 1, speechFraction: 0.25,
    });
    editorialReviewMocks.editorialOpeningEvidence.mockImplementation((file, sourceId, label, candidates) => ({
      file, sourceId, label, candidate: candidates[0],
    }));
    editorialReviewMocks.compareEditorialOpenings.mockImplementation(async (evidence) => ({
      comparisonSummary: 'Compared together.',
      contenders: evidence.map((row: { sourceId: string; candidate: { candidateId: string; openingFrameScore: number; openingFrameSec?: number } }, index: number) => ({
        sourceId: row.sourceId,
        candidateId: row.candidate.candidateId,
        rank: index + 1,
        openingFrameScore: row.candidate.openingFrameScore,
        openingFrameSec: row.candidate.openingFrameSec,
        rationale: 'shared comparison',
      })),
    }));
  });

  afterEach(() => {
    providerMocks.transcribe.mockReset();
    mediaMocks.probeVideoFile.mockReset();
    visualMocks.analyzeVisual.mockReset();
    visualMocks.analyzeVisualGeometry.mockReset();
    editorialReviewMocks.reviewEditorialCandidates.mockReset();
    editorialReviewMocks.editorialOpeningEvidence.mockReset();
    editorialReviewMocks.compareEditorialOpenings.mockReset();
    speechMocks.assessLocalSpeechAudio.mockReset();
    speechMocks.detectSpeechSilenceCuts.mockReset();
    localMediaMocks.loadLocalVideo.mockReset();
    localMediaMocks.loadLocalAssetFile.mockReset();
    localMediaMocks.loadLocalAssetFile.mockImplementation(() => localMediaMocks.loadLocalVideo());
    localMediaMocks.loadLocalFolderFile.mockReset();
    localMediaMocks.saveLocalVideo.mockReset();
    progressMocks.setToolProgress.mockReset();
    progressMocks.clearToolProgress.mockReset();
    vi.unstubAllGlobals();
  });

  it('derives generated-video ratio and resolution from the active canvas', async () => {
    const { adaptiveGeneratedVideoSpec } = await import('./agent-tool-runner');
    expect(adaptiveGeneratedVideoSpec(1080, 1920)).toEqual({ aspectRatio: '9:16', resolution: '1080p' });
    expect(adaptiveGeneratedVideoSpec(1280, 720)).toEqual({ aspectRatio: '16:9', resolution: '720p' });
    expect(adaptiveGeneratedVideoSpec(640, 640)).toEqual({ aspectRatio: '1:1', resolution: '480p' });
  });

  it('treats already-filled primary clips and an already-configured canvas as successful no-ops', async () => {
    const h = harness();
    h.documentRef.current = {
      ...h.documentRef.current,
      canvas: { ...h.documentRef.current.canvas, configured: true },
    };

    const fill = runAgentTimelineTool(h.documentRef.current, 'set_clip_properties', {
      items: [{ clipId: 's1', fit: 'cover' }],
    });
    expect(fill).toMatchObject({
      ok: true,
      data: { unchangedPrimaryFillClipIds: ['s1'] },
    });

    Object.assign(h.ctx, {
      projectId: 'test',
      pushUndoSnapshot: () => h.undoStackRef.current.push(h.documentRef.current),
    });
    const { classifyStudioReviewFailure, runStudioTool } = await import('./agent-tool-runner');
    const canvas = await runStudioTool(h.ctx, 'set_canvas', { preset: 'portrait' });
    expect(canvas).toMatchObject({
      ok: true,
      data: { canvas: { width: 1080, height: 1920 }, changed: false },
    });
    expect(classifyStudioReviewFailure(new TypeError('Failed to fetch'), 'request')).toEqual({
      code: 'review_network_error',
      phase: 'request',
      retryable: true,
      detail: 'Failed to fetch',
    });
  });

  it('atomically replaces a prepared primary montage without retaining frame slivers', async () => {
    const h = harness();
    let document = runAgentTimelineTool(h.documentRef.current, 'register_media', {
      assets: [
        { id: 'old-video', kind: 'video', url: 'https://cdn.example/old.mp4', durationSec: 5 },
        { id: 'new-video', kind: 'video', url: 'https://cdn.example/new.mp4', durationSec: 5 },
        { id: 'narration', kind: 'audio', url: 'https://cdn.example/narration.mp3', durationSec: 5 },
      ],
    }).document!;
    document = runAgentTimelineTool(document, 'add_clips', {
      clips: [
        { id: 'old-picture', role: 'primary', assetId: 'old-video', startSec: 0, sourceInSec: 0, sourceOutSec: 5 },
        { id: 'voice', role: 'narration', assetId: 'narration', startSec: 0, sourceInSec: 0, sourceOutSec: 5 },
      ],
    }).document!;
    h.documentRef.current = document;
    h.compRef.current = projectDocumentToComposition(document);
    Object.assign(h.ctx, {
      projectId: 'test',
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => {},
    });
    const { runStudioTool } = await import('./agent-tool-runner');
    const result = await runStudioTool(h.ctx, 'add_clips', {
      __replacePrimaryTrack: true,
      clips: [{
        id: 'new-picture', role: 'primary', assetId: 'new-video', startSec: 1 / 30,
        sourceInSec: 0, sourceOutSec: 149 / 30,
      }],
    });

    expect(result.ok).toBe(true);
    const primary = h.documentRef.current.timeline.tracks.find((track) => track.role === 'primaryNarrative')!;
    expect(primary.clips).toHaveLength(1);
    expect(primary.clips[0]).toMatchObject({ id: 'new-picture', startFrame: 1, durationFrames: 149 });
    expect(primary.clips.some((clip) => clip.id === 'old-picture')).toBe(false);
    expect(h.documentRef.current.timeline.tracks.find((track) => track.role === 'narration')?.clips).toHaveLength(1);
  });

  it('returns the stable value for an ask_user voice choice', async () => {
    const h = harness();
    const { runStudioTool } = await import('./agent-tool-runner');
    const pending = runStudioTool(h.ctx, 'ask_user', {
      question: '选择声音',
      options: [
        { label: '带货女声', description: '直接、有活力', value: 'voice-commerce', previewUrl: '/api/studio/voice-preview?voiceId=system%3Acommerce' },
        { label: '温和男声', description: '克制、平稳', value: 'voice-warm', previewUrl: 'https://cdn.example/warm.mp3' },
      ],
    }, { surface: 'chat' });
    await Promise.resolve();
    resolveInteraction(['带货女声']);

    await expect(pending).resolves.toMatchObject({
      ok: true,
      data: { selected: ['带货女声'], selectedValues: ['voice-commerce'], multiSelect: false },
    });
  });

  it('does not upload, generate, or charge when the exact Foley batch is rejected', async () => {
    const h = harness();
    Object.assign(h.ctx, { localAssetIndexRef: { current: [] } });
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({
      ok: true,
      quote: { totalCredits: 2, items: [{ durationSec: 7, credits: 2 }] },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { runStudioTool } = await import('./agent-tool-runner');
    const pending = runStudioTool(h.ctx, 'generate_foley', {
      items: [{
        sourceUrl: 'https://cdn.example/unboxing.mp4',
        sourceInSec: 2,
        sourceOutSec: 9,
        prompt: 'Close cardboard flap opening, paper friction, one seal release',
        name: 'Cardboard unboxing close',
        eventType: 'unboxing',
        material: 'cardboard',
      }],
    }, { surface: 'chat' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    resolveInteraction('rejected');

    await expect(pending).resolves.toMatchObject({
      ok: true,
      data: { decision: 'rejected' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/studio/foley', expect.objectContaining({
      body: JSON.stringify({ action: 'quote', durations: [7] }),
    }));
  });

  it('generates speech directly without parking on a second approval card', async () => {
    const h = harness();
    // The derived-cache L2 probes fetch first (miss); route by URL so those probes stay inert.
    const fetchMock = vi.fn().mockImplementation((url: unknown) => Promise.resolve(
      String(url).startsWith('/api/studio/derived-cache')
        ? Response.json({ ok: true, payload: null })
        : Response.json({
            ok: true,
            asset: {
              id: 'speech-direct', kind: 'audio', key: 'speech.mp3', url: 'https://cdn.example/speech.mp3', mime: 'audio/mpeg',
              model: 'speech-2.8-hd', voiceId: 'system:Chinese (Mandarin)_Reliable_Executive', voiceLabel: 'Reliable Executive',
              transcriptText: '现在就试试看。', charCount: 8, durationSec: 2.4, estimatedDurationSec: 2.5,
            },
          }),
    ));
    vi.stubGlobal('fetch', fetchMock);
    const { runStudioTool } = await import('./agent-tool-runner');
    const result = await runStudioTool(h.ctx, 'generate_speech', {
      text: '现在就试试看。',
      voiceId: 'system:Chinese (Mandarin)_Reliable_Executive',
      instruction: '自然、直接，不要播音腔',
      emotion: 'calm',
      pauseStyle: 'spacious',
      pauses: [{ afterText: '现在就', durationSec: 0.5 }],
    }, { surface: 'chat' });

    expect(result).toMatchObject({
      ok: true,
      data: { asset: { id: 'speech-direct' } },
    });
    const speechCalls = fetchMock.mock.calls.filter(([url]) => String(url) === '/api/studio/speech');
    expect(speechCalls).toHaveLength(1);
    expect(String(speechCalls[0]?.[1]?.body)).not.toContain('"action":"quote"');
    expect(String(speechCalls[0]?.[1]?.body)).toContain('"pauseStyle":"spacious"');
  });

  it('marks rejected approval receipts as a hard agent-turn boundary', async () => {
    const { studioToolResultStopsAgentTurn } = await import('./agent-tool-runner');
    expect(studioToolResultStopsAgentTurn({ ok: true, data: { decision: 'rejected' } })).toBe(true);
    expect(studioToolResultStopsAgentTurn({ ok: true, data: { decision: 'approved' } })).toBe(false);
    expect(studioToolResultStopsAgentTurn({ ok: false, data: { decision: 'rejected' } })).toBe(false);
  });

  it('also generates speech directly from the bridge execution surface', async () => {
    const h = harness();
    const fetchMock = vi.fn().mockImplementation((url: unknown) => Promise.resolve(
      String(url).startsWith('/api/studio/derived-cache')
        ? Response.json({ ok: true, payload: null })
        : Response.json({
            ok: true,
            asset: {
              id: 'speech-1', kind: 'audio', key: 'speech.mp3', url: 'https://cdn.example/speech.mp3', mime: 'audio/mpeg',
              model: 'speech-2.8-hd', voiceId: 'system:Chinese (Mandarin)_Reliable_Executive', voiceLabel: 'Reliable Executive',
              transcriptText: '现在就试试看。', charCount: 8, durationSec: 2.4, estimatedDurationSec: 2.5,
            },
          }),
    ));
    vi.stubGlobal('fetch', fetchMock);
    const { runStudioTool } = await import('./agent-tool-runner');
    const result = await runStudioTool(h.ctx, 'generate_speech', {
      text: '现在就试试看。',
      voiceId: 'system:Chinese (Mandarin)_Reliable_Executive',
    }, { surface: 'bridge' });

    expect(result).toMatchObject({
      ok: true,
      data: { asset: { id: 'speech-1' }, voiceLabel: 'Reliable Executive' },
    });
    const speechCalls = fetchMock.mock.calls.filter(([url]) => String(url) === '/api/studio/speech');
    expect(speechCalls).toHaveLength(1);
    expect(String(speechCalls[0]?.[1]?.body)).not.toContain('"action":"quote"');
  });

  it('routes designed voices through the shared voice API', async () => {
    const h = harness();
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({
      ok: true,
      voice: {
        id: 'voice-designed-1',
        label: 'Warm narrator',
        source: 'designed',
        language: 'en',
        status: 'ready',
      },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { runStudioTool } = await import('./agent-tool-runner');

    await expect(runStudioTool(h.ctx, 'design_voice', {
      prompt: 'Warm, credible English narrator',
      language: 'en',
      name: 'Warm narrator',
    }, { surface: 'chat' })).resolves.toMatchObject({
      ok: true,
      data: { voice: { id: 'voice-designed-1', source: 'designed' } },
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/studio/voices', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        action: 'design',
        prompt: 'Warm, credible English narrator',
        language: 'en',
        name: 'Warm narrator',
      }),
    }));
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
    const result = await runStudioTool(h.ctx, 'read_script', {});
    expect(result).toMatchObject({ ok: false, error: '提取口播稿失败,稍后再试' });

    const skill = readFileSync(new URL('../../../../src/lib/studio/scenario-skills/talking-head-edit/SKILL.md', import.meta.url), 'utf8');
    const execute = skill.slice(skill.indexOf('## Step 10: Execute with tool discipline'));
    expect(execute).toContain('After Approve, run `remove_silence` first');
    expect(execute).toContain('do not retry it in the same user request');
    expect(buildChatSystem(null)).toContain('run remove_silence before transcript-driven edits');
    expect(buildChatSystem(null)).not.toContain('planning artifact');
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

  it('places a project-library asset in a fresh output without a separate register_media retry', async () => {
    const h = harness();
    h.ctx.setDocument(emptyEditorDocumentV2({ width: 1920, height: 1080, fps: 30 }));
    const assetId = 'shared-product-video';
    const sig = 'product.mp4:120:8';
    const video = new File(['full-source-video'], 'product.mp4', { type: 'video/mp4', lastModified: 8 });
    localMediaMocks.loadLocalAssetFile.mockResolvedValue(video);
    mediaMocks.probeVideoFile.mockResolvedValue({ durationSec: 121.5, width: 1080, height: 1920, hasAudio: true });
    const prepareLocalAssetRuntime = vi.fn().mockResolvedValue({ ok: true, prepared: true, file: video });
    const pickVideoFile = vi.fn().mockResolvedValue(undefined);
    Object.assign(h.ctx, {
      localAssetIndexRef: { current: [localEntry(assetId, sig, '商品展示', 'video')] },
      prepareLocalAssetRuntime,
      pickVideoFile,
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => h.undoStackRef.current.push(h.documentRef.current),
    });
    if (!('XMLSerializer' in globalThis)) Object.assign(globalThis, { XMLSerializer: class { serializeToString() { return ''; } } });
    const { runStudioTool } = await import('./agent-tool-runner');
    const result = await runStudioTool(h.ctx, 'add_clips', {
      clips: [{ assetId: `local:${assetId}`, startSec: 0, role: 'primary' }],
    }, { surface: 'chat' });

    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(result.summary).toBe('添加片段');
    expect(h.documentRef.current.assets[assetId]).toMatchObject({
      id: assetId,
      kind: 'video',
      locator: { localSig: sig },
      metadata: { durationSec: 121.5, width: 1080, height: 1920, hasAudio: true },
    });
    expect(h.documentRef.current.canvas).toMatchObject({ width: 1080, height: 1920, configured: true });
    expect(prepareLocalAssetRuntime).toHaveBeenCalledWith(
      expect.objectContaining({ id: assetId }),
      { asPrimary: false },
    );
    expect(pickVideoFile).not.toHaveBeenCalled();
    expect(h.documentRef.current.timeline.tracks
      .flatMap((track) => track.clips)
      .find((clip) => 'assetId' in clip && clip.assetId === assetId))
      .toMatchObject({ durationFrames: 3645, sourceOutSec: 121.5 });
  });

  it('mounts every montage source as a peer when several videos are placed together', async () => {
    const h = harness();
    h.ctx.setDocument(emptyEditorDocumentV2({ width: 1920, height: 1080, fps: 30 }));
    const first = new File(['first'], 'first.mov', { type: 'video/quicktime', lastModified: 1 });
    const second = new File(['second'], 'second.mov', { type: 'video/quicktime', lastModified: 2 });
    mediaMocks.probeVideoFile
      .mockResolvedValueOnce({ durationSec: 4, width: 1080, height: 1920, hasAudio: true })
      .mockResolvedValueOnce({ durationSec: 4, width: 1920, height: 1080, hasAudio: true });
    const pickVideoFile = vi.fn().mockResolvedValue(undefined);
    const prepareLocalAssetRuntime = vi.fn(async (
      asset: { id: string },
      _options?: { asPrimary?: boolean },
    ) => ({
      ok: true,
      prepared: true,
      file: asset.id === 'first-video' ? first : second,
    }));
    Object.assign(h.ctx, {
      localAssetIndexRef: {
        current: [
          localEntry('first-video', 'first:sig', '第一段', 'video'),
          localEntry('second-video', 'second:sig', '第二段', 'video'),
        ],
      },
      prepareLocalAssetRuntime,
      pickVideoFile,
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => {},
    });
    const { runStudioTool, unplannedReviewAtSecs } = await import('./agent-tool-runner');

    const result = await runStudioTool(h.ctx, 'add_clips', {
      clips: [
        { assetId: 'local:first-video', role: 'primary', startSec: 0 },
        { assetId: 'local:second-video', role: 'primary', startSec: 4 },
      ],
    });

    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(h.documentRef.current.semantics).not.toHaveProperty('primaryNarrativeAssetId');
    expect(h.documentRef.current.canvas).toMatchObject({ width: 1080, height: 1920 });
    expect(prepareLocalAssetRuntime.mock.calls.map(([asset, options]) => [asset.id, options])).toEqual([
      ['first-video', { asPrimary: false }],
      ['second-video', { asPrimary: false }],
    ]);
    expect(pickVideoFile).not.toHaveBeenCalled();
    const withText = runAgentTimelineTool(h.documentRef.current, 'add_texts', {
      items: [{ id: 'hook', text: '轻花字', startSec: 0.2, durationSec: 3.6 }],
    });
    expect(withText.ok).toBe(true);
    expect(unplannedReviewAtSecs(withText.document!)).toEqual([2, 6]);
  });

  it('lists project-local assets without exposing device storage locators', async () => {
    const h = harness();
    const assetId = 'shared-product-video';
    const sig = 'private-folder/product.mp4:120:8';
    Object.assign(h.ctx, {
      localAssetIndexRef: { current: [localEntry(assetId, sig, '商品展示', 'video')] },
      t: (key: string) => key,
    });
    const { runStudioTool } = await import('./agent-tool-runner');
    const result = await runStudioTool(h.ctx, 'list_assets', { scope: 'mine' });

    expect(result).toMatchObject({
      ok: true,
      data: {
        assets: [{ id: `local:${assetId}`, kind: 'video', label: '商品展示' }],
        placementRequiredForInspection: false,
        usageHint: expect.stringContaining('analyze_visual/read_script while unplaced'),
      },
    });
    expect(JSON.stringify((result as { data?: { assets?: unknown } }).data?.assets))
      .not.toMatch(/contentSig|localSig|private-folder|locator/);
  });

  it('accepts an old redundant register_media call with only a project-local asset id', async () => {
    const h = harness();
    const assetId = 'shared-product-video';
    const sig = 'product.mp4:120:8';
    Object.assign(h.ctx, {
      localAssetIndexRef: { current: [localEntry(assetId, sig, '商品展示', 'video')] },
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => h.undoStackRef.current.push(h.documentRef.current),
    });
    const { runStudioTool } = await import('./agent-tool-runner');
    const result = await runStudioTool(h.ctx, 'register_media', {
      assets: [{ id: assetId }],
    });

    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(h.documentRef.current.assets[assetId]).toMatchObject({
      id: assetId,
      kind: 'video',
      label: '商品展示',
      locator: { localSig: sig },
    });
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
    expect(skill).toContain('meaningful new visual anchor roughly every 5–10 seconds');
    expect(skill).toContain('Compile those decisions directly into the timeline');
    expect(skill).not.toContain('picture-change contract');
    expect(skill).toContain('roughly every 5–10 seconds');
    expect(skill).toContain('never loop or stretch one short clip as wallpaper');
    expect(skill).toContain('inspect local images with `inspect_images`, then place them by assetId');

    const componentSystem = buildHtmlSystem({ componentIds: [] });
    expect(componentSystem).toContain('participating in a video scene');
    expect(componentSystem).toContain('A decisive typographic beat MAY be type-only');
    expect(componentSystem).toContain('not a dashboard widget');
  });

  it('pins every explicitly prepared local image even when its native handle is currently readable', async () => {
    const h = harness();
    const sig = 'platform-data.jpg:12:7';
    const assetId = 'asset-platform-data';
    const image = new File(['image-bytes'], 'platform-data.jpg', { type: 'image/jpeg', lastModified: 7 });
    localMediaMocks.loadLocalVideo.mockResolvedValue(image);
    Object.assign(h.ctx, {
      projectId: 'test',
      localAssetIndexRef: { current: [localEntry(assetId, sig, '平台数据', 'image')] },
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => {},
      t: (key: string) => key,
    });
    if (!('XMLSerializer' in globalThis)) Object.assign(globalThis, { XMLSerializer: class { serializeToString() { return ''; } } });
    const { runStudioTool } = await import('./agent-tool-runner');
    const result = await runStudioTool(h.ctx, 'prepare_local_image', { assetId });
    const legacyResult = await runStudioTool(h.ctx, 'prepare_local_image', { sig });

    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(legacyResult.ok, JSON.stringify(legacyResult)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('contentSig');
    expect(localMediaMocks.loadLocalFolderFile).not.toHaveBeenCalled();
    expect(localMediaMocks.saveLocalVideo).toHaveBeenCalledWith(image, sig, undefined, {
      pinned: true,
      binding: { projectId: 'test', assetId },
    });
  });

  it('inspects local image pixels before timeline placement without uploading them to the media library', async () => {
    const h = harness();
    const sig = 'conversion-chart.png:18:9';
    const assetId = 'asset-conversion-chart';
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
      projectId: 'test',
      localAssetIndexRef: { current: [localEntry(assetId, sig, '转化率数据', 'image')] },
      resolveAssetUrl: () => null,
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => {},
    });
    if (!('XMLSerializer' in globalThis)) Object.assign(globalThis, { XMLSerializer: class { serializeToString() { return ''; } } });
    const { runStudioTool } = await import('./agent-tool-runner');
    const mentionId = localAssetMentionId(assetId);
    const result = await runStudioTool(h.ctx, 'inspect_images', { refs: [mentionId] });

    expect(result).toMatchObject({
      ok: true,
      data: {
        images: [{ ref: `local:${assetId}`, label: '转化率数据', description: expect.stringContaining('12% to 31%') }],
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
    const assetId = 'asset-slow-reference';
    const image = new File(['image-pixels'], 'slow-reference.png', { type: 'image/png', lastModified: 9 });
    localMediaMocks.loadLocalVideo.mockResolvedValue(image);
    vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise(() => {})));
    Object.assign(h.ctx, {
      projectId: 'test',
      localAssetIndexRef: { current: [localEntry(assetId, sig, '慢速图片', 'image')] },
      resolveAssetUrl: () => null,
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => {},
    });
    if (!('XMLSerializer' in globalThis)) Object.assign(globalThis, { XMLSerializer: class { serializeToString() { return ''; } } });
    const { runStudioTool } = await import('./agent-tool-runner');
    const controller = new AbortController();
    const pending = runStudioTool(h.ctx, 'inspect_images', { refs: [localAssetMentionId(assetId)] }, { signal: controller.signal, surface: 'chat' });

    controller.abort();

    await expect(pending).resolves.toMatchObject({ ok: false, error: '已停止' });
  });

  it('transcribes an unplaced local video when a model mirrors its @ reference token into assetId', async () => {
    const h = harness();
    const sig = 'viral-reference.mp4:240:12';
    const assetId = 'asset-viral-reference';
    const video = new File(['video-with-speech'], 'viral-reference.mp4', { type: 'video/mp4', lastModified: 12 });
    localMediaMocks.loadLocalVideo.mockResolvedValue(video);
    mediaMocks.probeVideoFile.mockResolvedValue({ durationSec: 30, width: 1080, height: 1920, hasAudio: true });
    providerMocks.transcribe.mockResolvedValue([{ start: 0.2, end: 2.4, text: '先用结果抓住观众' }]);
    Object.assign(h.ctx, {
      projectId: 'test',
      localAssetIndexRef: { current: [localEntry(assetId, sig, '爆款参考视频', 'video')] },
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => {},
    });
    const assetIdsBefore = Object.keys(h.documentRef.current.assets);
    if (!('XMLSerializer' in globalThis)) Object.assign(globalThis, { XMLSerializer: class { serializeToString() { return ''; } } });
    const { runStudioTool } = await import('./agent-tool-runner');
    const result = await runStudioTool(h.ctx, 'read_script', { assetId: localAssetMentionId(assetId) });

    expect(result).toMatchObject({
      ok: true,
      data: {
        localAssetId: assetId,
        label: '爆款参考视频',
        kind: 'video',
        durationSec: 30,
        transcript: expect.stringContaining('先用结果抓住观众'),
      },
    });
    expect(providerMocks.transcribe).toHaveBeenCalledWith(video, expect.anything());
    expect(localMediaMocks.saveLocalVideo).toHaveBeenCalledWith(video, sig, undefined, {
      pinned: false,
      binding: { projectId: 'test', assetId },
    });
    expect(h.ctx.localTranscriptCacheRef.current.get(assetId)).toEqual([
      { start: 0.2, end: 2.4, text: '先用结果抓住观众' },
    ]);
    expect(Object.keys(h.documentRef.current.assets)).toEqual(assetIdsBefore);
  });

  it('reuses an unplaced local transcript after that asset becomes the primary source', async () => {
    const h = harness();
    h.ctx.setDocument(emptyEditorDocumentV2({ width: 1920, height: 1080, fps: 30 }));
    const assetId = 'asset-promoted-speaker';
    const sig = 'promoted-speaker.mp4:240:12';
    const video = new File(['video-with-speech'], 'promoted-speaker.mp4', { type: 'video/mp4', lastModified: 12 });
    const transcript = [{
      start: 0.2,
      end: 2.4,
      text: '先用结果抓住观众',
      words: [{ start: 0.2, end: 0.6, text: '先' }],
    }];
    localMediaMocks.loadLocalAssetFile.mockResolvedValue(video);
    mediaMocks.probeVideoFile.mockResolvedValue({ durationSec: 30, width: 1080, height: 1920, hasAudio: true });
    providerMocks.transcribe.mockResolvedValue(transcript);
    const setAsrSentences = vi.fn();
    Object.assign(h.ctx, {
      projectId: 'test',
      localAssetIndexRef: { current: [localEntry(assetId, sig, '待晋升口播', 'video')] },
      prepareLocalAssetRuntime: vi.fn().mockResolvedValue({ ok: true, prepared: true, file: video }),
      pickVideoFile: vi.fn().mockResolvedValue(undefined),
      setAsrSentences,
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => {},
    });
    const { runStudioTool } = await import('./agent-tool-runner');

    const read = await runStudioTool(h.ctx, 'read_script', { assetId: localAssetMentionId(assetId) });
    expect(read.ok, JSON.stringify(read)).toBe(true);
    const placed = await runStudioTool(h.ctx, 'add_clips', {
      clips: [{ assetId: localAssetMentionId(assetId), role: 'primary', startSec: 0 }],
    });
    expect(placed.ok, JSON.stringify(placed)).toBe(true);
    const words = await runStudioTool(h.ctx, 'list_words', { sentenceIndexes: [0] }, { surface: 'chat' });

    expect(words).toMatchObject({ ok: true, summary: '定位精确词语' });
    expect((words.data as { words: unknown[] }).words).toHaveLength(1);
    expect(providerMocks.transcribe).toHaveBeenCalledTimes(1);
    expect(h.ctx.asrRef.current).toEqual(transcript);
    expect(h.documentRef.current.semantics.transcripts[assetId]).toEqual(transcript);
    expect(setAsrSentences).toHaveBeenCalledWith(transcript);
  });

  it('persists transcript state when a placed local video is referenced with its list_assets id', async () => {
    const h = harness();
    h.ctx.setDocument(emptyEditorDocumentV2({ width: 1080, height: 1920, fps: 30 }));
    const assetId = 'asset-placed-speaker';
    const sig = 'placed-speaker.mp4:240:12';
    const registered = runAgentTimelineTool(h.documentRef.current, 'register_media', {
      assets: [{ id: assetId, kind: 'video', localSig: sig, durationSec: 18, width: 1080, height: 1920, hasAudio: true }],
    });
    const placed = runAgentTimelineTool(registered.document!, 'add_clips', {
      clips: [{ id: 'placed-speaker-clip', assetId, role: 'primary', startSec: 0, durationSec: 18 }],
    });
    h.ctx.setDocument(placed.document!);
    const video = new File(['video-with-speech'], 'placed-speaker.mp4', { type: 'video/mp4', lastModified: 12 });
    localMediaMocks.loadLocalAssetFile.mockResolvedValue(video);
    mediaMocks.probeVideoFile.mockResolvedValue({ durationSec: 18, width: 1080, height: 1920, hasAudio: true });
    providerMocks.transcribe.mockResolvedValue([{ start: 0.2, end: 2.4, text: '这段口播必须写回项目' }]);
    const setAsrSentences = vi.fn();
    Object.assign(h.ctx, {
      projectId: 'test',
      localAssetIndexRef: { current: [localEntry(assetId, sig, '已放置口播', 'video')] },
      videoFileRef: { current: null },
      setAsrSentences,
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => {},
    });
    const { runStudioTool } = await import('./agent-tool-runner');

    const result = await runStudioTool(h.ctx, 'read_script', { assetId: `local:${assetId}` });

    expect(result).toMatchObject({
      ok: true,
      data: { assetId, transcript: expect.stringContaining('这段口播必须写回项目') },
    });
    expect(localMediaMocks.loadLocalAssetFile).toHaveBeenCalledWith('test', expect.objectContaining({ assetId }));
    expect(h.documentRef.current.semantics.transcripts[assetId]).toEqual([
      { start: 0.2, end: 2.4, text: '这段口播必须写回项目' },
    ]);
    expect(h.ctx.asrRef.current).toEqual([
      { start: 0.2, end: 2.4, text: '这段口播必须写回项目' },
    ]);
    expect(setAsrSentences).toHaveBeenCalled();
  });

  it('lazily heals the exact legacy five-second primary placeholder after probing the real source', async () => {
    const h = harness();
    h.ctx.setDocument(emptyEditorDocumentV2({ width: 1080, height: 1920, fps: 30 }));
    const assetId = 'asset-legacy-placeholder';
    const sig = 'legacy-placeholder.mp4:240:12';
    const registered = runAgentTimelineTool(h.documentRef.current, 'register_media', {
      assets: [{ id: assetId, kind: 'video', localSig: sig }],
    });
    const placed = runAgentTimelineTool(registered.document!, 'add_clips', {
      clips: [{ id: 'legacy-placeholder-clip', assetId, role: 'primary', startSec: 0 }],
    });
    h.ctx.setDocument(placed.document!);
    expect(h.documentRef.current.timeline.tracks.flatMap((track) => track.clips)[0])
      .toMatchObject({ durationFrames: 150, sourceOutSec: 5 });
    const video = new File(['legacy-video'], 'legacy-placeholder.mp4', { type: 'video/mp4', lastModified: 12 });
    localMediaMocks.loadLocalAssetFile.mockResolvedValue(video);
    mediaMocks.probeVideoFile.mockResolvedValue({ durationSec: 121.5, width: 1080, height: 1920, hasAudio: true });
    providerMocks.transcribe.mockResolvedValue([{ start: 0.2, end: 2.4, text: '恢复旧项目的完整口播' }]);
    Object.assign(h.ctx, {
      projectId: 'test',
      localAssetIndexRef: { current: [localEntry(assetId, sig, '旧项目口播', 'video')] },
      videoFileRef: { current: null },
      setAsrSentences: vi.fn(),
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => {},
    });
    const { runStudioTool } = await import('./agent-tool-runner');

    const result = await runStudioTool(h.ctx, 'read_script', { assetId: `local:${assetId}` });

    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(h.documentRef.current.timeline.tracks.flatMap((track) => track.clips)[0])
      .toMatchObject({ durationFrames: 3645, sourceOutSec: 121.5 });
    expect(h.documentRef.current.assets[assetId]?.metadata.durationSec).toBe(121.5);
  });

  it('removes silence from a placed local primary asset without relying on the legacy main-file ref', async () => {
    const h = harness();
    h.ctx.setDocument(emptyEditorDocumentV2({ width: 1080, height: 1920, fps: 30 }));
    const assetId = 'asset-local-primary';
    const sig = 'local-primary.mp4:240:12';
    const registered = runAgentTimelineTool(h.documentRef.current, 'register_media', {
      assets: [{ id: assetId, kind: 'video', localSig: sig, durationSec: 18, width: 1080, height: 1920, hasAudio: true }],
    });
    const placed = runAgentTimelineTool(registered.document!, 'add_clips', {
      clips: [{ id: 'local-primary-clip', assetId, role: 'primary', startSec: 0, durationSec: 18 }],
    });
    h.ctx.setDocument(placed.document!);
    const video = new File(['video-with-pauses'], 'local-primary.mp4', { type: 'video/mp4', lastModified: 12 });
    localMediaMocks.loadLocalAssetFile.mockResolvedValue(video);
    speechMocks.detectSpeechSilenceCuts.mockResolvedValue([{ fromSec: 4, toSec: 6 }]);
    const videoFileRef = { current: null as File | null };
    Object.assign(h.ctx, {
      projectId: 'test',
      localAssetIndexRef: { current: [localEntry(assetId, sig, '本地口播原片', 'video')] },
      videoFileRef,
      setSelectedShotId: vi.fn(),
      applyT: vi.fn(),
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => {},
    });
    const { runStudioTool } = await import('./agent-tool-runner');

    const result = await runStudioTool(h.ctx, 'remove_silence', {});

    expect(result).toMatchObject({ ok: true, data: { removedTotalSec: 2 } });
    expect(localMediaMocks.loadLocalAssetFile).toHaveBeenCalledWith('test', expect.objectContaining({ assetId }));
    expect(speechMocks.detectSpeechSilenceCuts).toHaveBeenCalledWith(video, expect.any(Object));
    expect(videoFileRef.current).toBe(video);
  });

  it('asks for access restoration instead of timeline placement when an unplaced local source is unavailable', async () => {
    const h = harness();
    const sig = 'offline-reference.mp4:240:12';
    const assetId = 'asset-offline-reference';
    localMediaMocks.loadLocalAssetFile.mockResolvedValueOnce(null);
    Object.assign(h.ctx, {
      projectId: 'test',
      localAssetIndexRef: { current: [localEntry(assetId, sig, '离线参考视频', 'video')] },
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => {},
    });
    const assetIdsBefore = Object.keys(h.documentRef.current.assets);
    const { runStudioTool } = await import('./agent-tool-runner');

    const result = await runStudioTool(h.ctx, 'read_script', { assetId: `local:${assetId}` });

    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('restore access in Materials') });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('Do not place the asset on the timeline') });
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
      projectId: 'test',
      localAssetIndexRef: { current: [localEntry('asset-noise-only', sig, '环境噪声素材', 'video')] },
      prepareLocalAssetRuntime: async () => ({ ok: true }),
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => {},
    });
    if (!('XMLSerializer' in globalThis)) Object.assign(globalThis, { XMLSerializer: class { serializeToString() { return ''; } } });
    const { runStudioTool } = await import('./agent-tool-runner');
    const observed = await runStudioTool(h.ctx, 'read_script', { localSig: sig });
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
      projectId: 'test',
      localAssetIndexRef: { current: [localEntry('asset-product-demo', sig, '产品演示', 'video')] },
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
        localAssetId: 'asset-product-demo',
        label: '产品演示',
        durationSec: 18,
        hasAudio: true,
        audioAssessment: 'speech-likely',
        speechLikely: true,
        sceneCutsSec: [6],
        segments: [{ description: 'Hands demonstrate the product.' }],
        instruction: expect.stringContaining('Descriptive content observations only'),
      },
    });
    expect(Object.keys(h.documentRef.current.assets)).toEqual(assetIdsBefore);
    expect(Object.values(h.documentRef.current.assets).some((asset) => asset.locator.localSig === sig)).toBe(false);
  });

  it('skips local speech assessment when a visual-only workflow will discard source audio', async () => {
    const h = harness();
    const sig = 'muted-ad-footage.mp4:120:14';
    const video = new File(['video-bytes'], 'muted-ad-footage.mp4', { type: 'video/mp4', lastModified: 14 });
    localMediaMocks.loadLocalVideo.mockResolvedValue(video);
    mediaMocks.probeVideoFile.mockResolvedValue({ durationSec: 15, width: 1080, height: 1920, hasAudio: true });
    visualMocks.analyzeVisual.mockResolvedValue({
      cuts: [5],
      segments: [{ start: 0, end: 15, label: { content: 'product', person: 'none', safe: 'top', hasText: false, desc: 'Product demonstration.' } }],
    });
    Object.assign(h.ctx, {
      projectId: 'test',
      localAssetIndexRef: { current: [localEntry('asset-muted-ad', sig, '广告画面素材', 'video')] },
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => {},
    });
    const { runStudioTool } = await import('./agent-tool-runner');
    const result = await runStudioTool(h.ctx, 'analyze_visual', {
      assetId: 'asset-muted-ad',
      assessAudio: false,
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        localAssetId: 'asset-muted-ad',
        hasAudio: true,
        audioAssessment: 'skipped-source-audio',
      },
    });
    expect(speechMocks.assessLocalSpeechAudio).not.toHaveBeenCalled();
    expect(providerMocks.transcribe).not.toHaveBeenCalled();
  });

  it('uses the local audio-track probe before ASR for an unplaced silent video', async () => {
    const h = harness();
    const sig = 'silent-product.mp4:90:7';
    const video = new File(['silent-video'], 'silent-product.mp4', { type: 'video/mp4', lastModified: 7 });
    localMediaMocks.loadLocalVideo.mockResolvedValue(video);
    mediaMocks.probeVideoFile.mockResolvedValue({ durationSec: 9, width: 960, height: 1280, hasAudio: false });
    Object.assign(h.ctx, {
      projectId: 'test',
      localAssetIndexRef: { current: [localEntry('asset-silent-product', sig, '静音商品素材', 'video')] },
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => {},
    });
    const { runStudioTool } = await import('./agent-tool-runner');
    const result = await runStudioTool(h.ctx, 'read_script', { localSig: sig });

    expect(result).toMatchObject({
      ok: true,
      data: {
        localAssetId: 'asset-silent-product',
        hasAudio: false,
        speechDetected: false,
        audioAssessment: 'no-audio-track',
      },
    });
    expect(providerMocks.transcribe).not.toHaveBeenCalled();
  });

  it('stops locally classified noise before cloud transcription', async () => {
    const h = harness();
    const sig = 'fan-noise.mp4:95:8';
    const video = new File(['fan-noise'], 'fan-noise.mp4', { type: 'video/mp4', lastModified: 8 });
    localMediaMocks.loadLocalVideo.mockResolvedValue(video);
    mediaMocks.probeVideoFile.mockResolvedValue({ durationSec: 10, width: 960, height: 1280, hasAudio: true });
    speechMocks.assessLocalSpeechAudio.mockResolvedValueOnce({
      classification: 'non-speech-or-noise', hasAudio: true, audible: true, speechLikely: false,
      audibleSec: 10, speechSec: 0, speechFraction: 0,
    });
    Object.assign(h.ctx, {
      projectId: 'test',
      localAssetIndexRef: { current: [localEntry('asset-fan-noise', sig, '风扇噪音素材', 'video')] },
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => {},
    });
    const { runStudioTool } = await import('./agent-tool-runner');
    const result = await runStudioTool(h.ctx, 'read_script', { localSig: sig });

    expect(result).toMatchObject({
      ok: true,
      data: { audioAssessment: 'non-speech-or-noise', speechDetected: false, defaultSourceAudio: 'muted' },
    });
    expect(providerMocks.transcribe).not.toHaveBeenCalled();
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
      projectId: 'test',
      localAssetIndexRef: { current: [localEntry('asset-speaker', sig, '口播原片', 'video')] },
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
        instruction: expect.stringContaining('Technical measurements only'),
      },
    });
    expect((result as { data?: Record<string, unknown> }).data).not.toHaveProperty('segments');
    expect(visualMocks.analyzeVisualGeometry).toHaveBeenCalled();
    expect(visualMocks.analyzeVisual).not.toHaveBeenCalled();
  });

  it('compares temporal candidates under an explicit editorial brief', async () => {
    const h = harness();
    const sig = 'female-lead.mp4:160:8';
    const video = new File(['video-bytes'], 'female-lead.mp4', { type: 'video/mp4', lastModified: 8 });
    localMediaMocks.loadLocalVideo.mockResolvedValue(video);
    mediaMocks.probeVideoFile.mockResolvedValue({ durationSec: 20, width: 1080, height: 1920, hasAudio: true });
    visualMocks.analyzeVisualGeometry.mockResolvedValue({
      cuts: [],
      segments: [{ start: 0, end: 20, label: { content: 'broll', person: 'center', safe: 'top', hasText: false, desc: '' } }],
      qualityWindows: [{
        rank: 1, startSec: 4, endSec: 6, score: 88, sharpness: 0.9, exposure: 0.86, stability: 0.87, sampleCount: 4,
        worstFrameScore: 84, edgeScore: 86, hardFailureFraction: 0,
      }],
    });
    editorialReviewMocks.reviewEditorialCandidates.mockResolvedValue({
      brief: 'Confident, restrained female-lead footage; compare hook and ending suitability.',
      comparisonSummary: 'The intentional pose is stronger than the preparatory walk.',
      candidates: [{
        candidateId: 'candidate-1', startSec: 4, endSec: 6, rank: 1, verdict: 'strong', score: 92,
        action: 'walks forward and settles her gaze', rationale: 'complete confident action',
        openingFrameScore: 96, openingFrameSec: 5.2, openingFrameState: 'closed-mouth frontal portrait',
        roleFit: [{ role: 'hook', score: 94 }], issues: [],
        scoreBreakdown: { subjectClarity: 92, aestheticFit: 90, composition: 88, temporalCompleteness: 94, editability: 95 },
        actionPhases: [], rejectedRanges: [], entryState: '', exitState: '', cameraMotion: '', subjectPlacement: '', bestUse: '',
      }],
    });
    Object.assign(h.ctx, {
      projectId: 'test',
      localAssetIndexRef: { current: [localEntry('asset-female-lead', sig, '人物素材', 'video')] },
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => {},
    });
    const { runStudioTool } = await import('./agent-tool-runner');
    const result = await runStudioTool(h.ctx, 'analyze_visual', {
      assetId: 'asset-female-lead',
      mode: 'editorial',
      brief: 'Confident, restrained female-lead footage; compare hook and ending suitability.',
      maxCandidates: 4,
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        analysisMode: 'editorial-candidates',
        editorialComparisonSummary: expect.stringContaining('intentional pose'),
        editorialCandidates: [{ candidateId: 'candidate-1', verdict: 'strong', roleFit: [{ role: 'hook' }] }],
        instruction: expect.stringContaining('Do not run another visual review after placement'),
      },
    });
    expect(editorialReviewMocks.reviewEditorialCandidates).toHaveBeenCalledWith(
      video,
      expect.arrayContaining([expect.objectContaining({ startSec: 4, endSec: 6 })]),
      expect.stringContaining('Confident'),
      expect.objectContaining({ maxCandidates: 4 }),
    );
    expect(visualMocks.analyzeVisual).not.toHaveBeenCalled();
    expect(speechMocks.assessLocalSpeechAudio).not.toHaveBeenCalled();
  });

  it('reviews all editorial sources once through one bounded-concurrency batch', async () => {
    const h = harness();
    const first = new File(['first'], 'first.mp4', { type: 'video/mp4', lastModified: 1 });
    const second = new File(['second'], 'second.mp4', { type: 'video/mp4', lastModified: 2 });
    localMediaMocks.loadLocalAssetFile.mockImplementation(async (...args: unknown[]) => {
      const entry = args[1] as { assetId?: string } | undefined;
      return entry?.assetId === 'asset-first' ? first : second;
    });
    mediaMocks.probeVideoFile.mockResolvedValue({ durationSec: 12, width: 1080, height: 1920, hasAudio: true });
    const visualTimeline = {
      cuts: [],
      segments: [{ start: 0, end: 12, label: { content: 'broll', person: 'center', safe: 'top', hasText: false, desc: '' } }],
      qualityWindows: [{
        rank: 1, startSec: 3, endSec: 5, score: 88, sharpness: 0.9, exposure: 0.86, stability: 0.87,
        sampleCount: 4, worstFrameScore: 84, edgeScore: 86, hardFailureFraction: 0,
      }],
    };
    visualMocks.analyzeVisualGeometry.mockImplementation(async (
      _file: File,
      _duration: number,
      onProgress: (done: number, total: number) => void,
    ) => {
      onProgress(1, 2);
      onProgress(2, 2);
      return visualTimeline;
    });
    let started = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    editorialReviewMocks.reviewEditorialCandidates.mockImplementation(async () => {
      started += 1;
      await gate;
      return {
        brief: 'Choose complete, polished performance ranges.',
        comparisonSummary: 'One usable performance range.',
        candidates: [{
          candidateId: 'candidate-1', startSec: 3, endSec: 5, rank: 1, verdict: 'usable', score: 88,
          contentRole: 'person-primary',
          action: 'settles into a pose', rationale: 'complete action', openingFrameScore: 88,
          openingFrameSec: 3.2, openingFrameState: 'stable', roleFit: [{ role: 'body', score: 88 }], issues: [],
          scoreBreakdown: { subjectClarity: 88, aestheticFit: 88, composition: 88, temporalCompleteness: 88, editability: 88 },
          actionPhases: [], rejectedRanges: [], entryState: '', exitState: '', cameraMotion: '', subjectPlacement: '', bestUse: '',
          cutOptions: [{ durationSec: 2, startSec: 3, endSec: 5, score: 88, reason: 'complete action' }],
        }],
      };
    });
    editorialReviewMocks.compareEditorialOpenings.mockImplementation(async (evidence) => ({
      comparisonSummary: '第二段在共同对比中开场更强。',
      contenders: [
        {
          sourceId: evidence[1].sourceId,
          candidateId: evidence[1].candidate.candidateId,
          rank: 1,
          openingFrameScore: 96,
          openingFrameSec: 3.4,
          rationale: 'cleaner immediate presence',
        },
        {
          sourceId: evidence[0].sourceId,
          candidateId: evidence[0].candidate.candidateId,
          rank: 2,
          openingFrameScore: 84,
          openingFrameSec: 3.2,
          rationale: 'usable later',
        },
      ],
    }));
    Object.assign(h.ctx, {
      projectId: 'test',
      localAssetIndexRef: { current: [
        localEntry('asset-first', 'first:sig', '第一段', 'video'),
        localEntry('asset-second', 'second:sig', '第二段', 'video'),
      ] },
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => {},
    });
    const { runStudioTool } = await import('./agent-tool-runner');
    const pending = runStudioTool(h.ctx, 'analyze_visual', {
      mode: 'editorial',
      brief: 'Choose complete, polished performance ranges.',
      items: [{ assetId: 'asset-first' }, { assetId: 'asset-second' }],
    });
    await vi.waitFor(() => expect(started).toBe(2));
    release();
    const result = await pending;

    expect(result).toMatchObject({
      ok: true,
      data: {
        analysisMode: 'editorial-batch',
        acceptedDurationSec: 4,
        items: [
          { ok: true, localAssetId: 'asset-first', editorialCandidates: [{ verdict: 'usable', openingComparisonRank: 2, openingFrameScore: 84 }] },
          { ok: true, localAssetId: 'asset-second', editorialCandidates: [{ verdict: 'usable', openingComparisonRank: 1, openingFrameScore: 96 }] },
        ],
        openingComparison: {
          contenders: [
            { sourceId: 'asset-second', rank: 1, openingFrameScore: 96 },
            { sourceId: 'asset-first', rank: 2, openingFrameScore: 84 },
          ],
        },
        instruction: expect.stringContaining('shared cross-source visual comparison'),
      },
    });
    expect(visualMocks.analyzeVisualGeometry).toHaveBeenCalledTimes(2);
    expect(editorialReviewMocks.reviewEditorialCandidates).toHaveBeenCalledTimes(2);
    expect(editorialReviewMocks.compareEditorialOpenings).toHaveBeenCalledOnce();
    const fractions = progressMocks.setToolProgress.mock.calls
      .map(([progress]) => progress.frac as number)
      .filter((value) => typeof value === 'number');
    expect(fractions.length).toBeGreaterThan(2);
    expect(fractions.every((value, index) => index === 0 || value >= fractions[index - 1]!)).toBe(true);
    expect(fractions.at(-1)).toBe(1);
    expect(progressMocks.setToolProgress).toHaveBeenCalledWith(expect.objectContaining({
      id: 'analyze_visual',
      text: expect.stringContaining('第一段'),
    }));
    expect(progressMocks.setToolProgress).toHaveBeenLastCalledWith(expect.objectContaining({
      frac: 1,
      items: [
        expect.objectContaining({ label: '第一段', frac: 1 }),
        expect.objectContaining({ label: '第二段', frac: 1 }),
      ],
    }));
    expect(progressMocks.clearToolProgress).toHaveBeenCalledTimes(1);
  });

  it('requires a concrete brief for editorial candidate review', async () => {
    const h = harness();
    Object.assign(h.ctx, { projectId: 'test', genIdsRef: { current: new Set<string>() }, pushUndoSnapshot: () => {} });
    const { runStudioTool } = await import('./agent-tool-runner');
    const result = await runStudioTool(h.ctx, 'analyze_visual', { mode: 'editorial' });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('requires a concrete brief') });
    expect(visualMocks.analyzeVisualGeometry).not.toHaveBeenCalled();
    expect(editorialReviewMocks.reviewEditorialCandidates).not.toHaveBeenCalled();
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
    const cached = await runStudioTool(h.ctx, 'read_script', { assetId: 'tts-audio' });
    expect(cached).toMatchObject({ ok: true, data: { assetId: 'tts-audio', transcript: expect.stringContaining('原始文稿') } });
    expect(providerMocks.transcribe).not.toHaveBeenCalled();

    const result = await runStudioTool(h.ctx, 'read_script', { assetId: 'tts-audio', measuredTiming: true });

    expect(result).toMatchObject({
      ok: true,
      data: { assetId: 'tts-audio', durationSec: 12.4, transcript: expect.stringContaining('实际发音') },
    });
    expect(providerMocks.transcribe).toHaveBeenCalledWith(expect.objectContaining({ type: 'audio/mpeg' }), expect.anything());
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

    const result = await runStudioTool(h.ctx, 'read_script', { clipId: 'speaker-clip' });

    expect(result, result.ok ? undefined : result.error).toMatchObject({
      ok: true,
      data: { assetId: 'speaker-video', durationSec: 18, transcript: expect.stringContaining('这是视频里的口播') },
    });
    expect(providerMocks.transcribe).toHaveBeenCalledWith(expect.objectContaining({ type: 'video/mp4' }), expect.anything());
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

  it('Chat add_block inserts an editable box and ignores a stray scene id when no Director Plan exists', async () => {
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
    const result = await runStudioTool(h.ctx, 'add_block', { instruction: 'show 42', sceneId: 'output-ma' });
    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(h.compRef.current.blocks).toHaveLength(1);
    expect(h.compRef.current.blocks[0]).toMatchObject({
      templateId: 'custom',
      box: { x: 0.14, y: 0.3, w: 0.72, h: 0.4 },
    });
  });

  it('returns actionable generated-block lint failures with the complete retry input', async () => {
    const h = harness();
    Object.assign(h.ctx, {
      genIdsRef: { current: new Set<string>() },
      pushUndoSnapshot: () => h.undoStackRef.current.push(h.documentRef.current),
      tRef: { current: 0 },
      composeBlockChecked: async () => {
        throw new GeneratedBlockValidationError('生成的动态图形没通过检查: letter-spacing 超限', ['letter-spacing 超限']);
      },
      noteOf: () => '',
    });
    const { runStudioTool } = await import('./agent-tool-runner');
    const input = {
      instruction: '做一个关系图', atSec: 8.8, durationSec: 3,
      placement: { xPct: 12, yPct: 18, widthPct: 70, heightPct: 24 },
      backdrop: '人物在画面右侧',
    };
    const result = await runStudioTool(h.ctx, 'add_block', input);
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining('letter-spacing'),
      data: {
        code: 'generated-block-static-checks',
        issues: ['letter-spacing 超限'],
        retryInput: input,
        retryHint: expect.stringContaining('preserve every original timing'),
      },
    });
    expect(h.compRef.current.blocks).toHaveLength(0);
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
