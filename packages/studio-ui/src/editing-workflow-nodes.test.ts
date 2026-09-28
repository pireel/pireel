import { beforeEach, expect, it, vi } from 'vitest';
import type { CaptionTaskRecord } from './caption-task-store';
import { buildCaptionBaseDocument } from '@pireel/studio-engine/caption-task';
import { defaultEditingRecipe } from '@pireel/studio-engine/editing-capabilities';
import { workflowJson } from '@pireel/studio-engine/workflow-artifacts';
import { SceneWorkflowHost } from './scene-workflow-runtime';
import { editingWorkflowNodes } from './editing-workflow-nodes';
import type { EditorDocumentV2 } from '@pireel/studio-engine/composition';
const mock = vi.hoisted(() => ({ composer: vi.fn(), denoise: vi.fn(), silence: vi.fn(), remote: vi.fn() }));
const cache = new Map<string, File>();
vi.mock('./local-media', () => ({ loadLocalVideo: async (sig: string) => cache.get(sig) ?? null, saveLocalVideo: async (file: File, sig: string) => { cache.set(sig, file); return true; } }));
vi.mock('./speech-silence', () => ({ detectSpeechSilenceCuts: mock.silence }));
vi.mock('./audio-decode', () => ({ decodeVideoAudio: async () => ({}), decodeAudioFile: async () => ({}), toMono: async () => new Float32Array(48000 * 10).fill(.05) }));
vi.mock('./denoise', async importOriginal => ({ ...await importOriginal<object>(), denoiseWetPcm: mock.denoise }));
vi.mock('./remote-media', () => ({ materializeRemoteMedia: mock.remote }));
vi.mock('@pireel/studio-engine/providers', () => ({ studioProviders: () => ({ composer: { composeStream: mock.composer }, curatedAssets: { listSearchDocuments: async () => [{ assetId: 'sticker:coffee', scope: 'official', kind: 'image', origin: 'sticker', label: 'coffee', locator: { url: 'https://test/coffee.png' } }], semanticSearch: async () => ({ mode: 'semantic', results: [{ assetId: 'sticker:coffee', kind: 'image', score: .9 }] }) } }) }));
beforeEach(() => { vi.clearAllMocks(); cache.clear(); mock.silence.mockResolvedValue([{ fromSec: 1, toSec: 3 }]); mock.denoise.mockImplementation(async dry => dry.map((n: number) => n * .5)); mock.composer.mockResolvedValue('```html\n<div data-edit="title">A graphic</div>\n```\n```js\ntl.from(root, {opacity:0, duration:.3});\n```'); mock.remote.mockResolvedValue({ file: new File(['png'], 'coffee.png', { type: 'image/png' }), sig: 'coffee' }); });
async function fixture(transcriptValue?: import('@pireel/studio-engine/build-blocks').AsrSegment[]) {
  const task: CaptionTaskRecord = { id: 'task', scope: 'owner', sourceSig: 'source', name: 'source.mp4', width: 640, height: 360, durationSec: 10, stage: 'ready', updatedAt: 1, options: { caption: {}, aspect: 'original', shortenPauses: false } };
  const host = new SceneWorkflowHost(task, new File(['source'], task.name), { signal: new AbortController().signal, checkpoint: async () => {}, progress: () => {} });
  const media = await host.store.put('media', 'source', { sig: 'source', name: task.name, width: 640, height: 360, durationSec: 10 });
  const transcript = await host.store.put('transcript', 'source', transcriptValue ?? [{ text: '嗯', start: 0, end: .5, words: [{ text: '嗯', start: 0, end: .5 }] }, { text: 'Important coffee facts', start: 4, end: 8 }]);
  const document = await host.store.put('document', 'base', buildCaptionBaseDocument({ ...task, projectId: task.id, sourceUrl: '', transcript: [] }));
  const execute = async (capability: string, options: unknown, documentRef = document, extra: Record<string, unknown> = {}) => {
    const definition = { schemaVersion: 1 as const, id: 'test', version: 1, title: 'test', templateId: 'test', parameters: {}, trigger: { kind: 'manual' as const }, steps: [{ id: 'effect', capability, version: 1, dependsOn: [], arguments: Object.fromEntries(Object.entries({ media, transcript, document: documentRef, options, projectId: task.id, ...extra }).map(([key, value]) => [key, { kind: 'literal' as const, value: workflowJson(value) }])) }] };
    const result = await host.executeGraph(definition, editingWorkflowNodes(host)); const output = result.run.steps[0].artifact!.data;
    return { output, document: host.store.read<EditorDocumentV2>(output.document, 'document') };
  };
  return { host, execute, document };
}
it('rough cuts pause/filler ranges and keeps a native, correctly shortened document', async () => {
  const { execute } = await fixture(); const result = await execute('edit.rough-cut', defaultEditingRecipe().roughCut);
  expect(result.output.report).toMatchObject({ pauses: 1, fillers: 1, removedSec: 2.5 });
  expect(result.document.timeline.tracks.find(track => track.role === 'primaryNarrative')?.clips.length).toBeGreaterThan(1);
});
it('denoises into an independent narration track without touching the original media', async () => {
  const { execute } = await fixture(); const result = await execute('audio.cleanup', defaultEditingRecipe().cleanup);
  expect(result.document.timeline.tracks.some(track => track.role === 'narration' && track.clips.length)).toBe(true);
  expect(result.document.timeline.tracks.flatMap(track => track.clips).find(clip => clip.kind === 'narrative')).toMatchObject({ properties: { audioMuted: true } });
  expect(mock.denoise).toHaveBeenCalledOnce();
  await execute('audio.cleanup', defaultEditingRecipe().cleanup); expect(mock.denoise).toHaveBeenCalledOnce();
});
it('creates real sound and music assets on independent editable audio tracks', async () => {
  const { execute } = await fixture(); const sfx = await execute('audio.effects', defaultEditingRecipe().effects);
  expect(sfx.document.timeline.tracks.some(track => track.role === 'sfx')).toBe(true);
  cache.set('music', new File(['audio'], 'music.wav'));
  const music = await execute('audio.music', { ...defaultEditingRecipe().music, assetSig: 'music', name: 'My music' });
  expect(music.document.timeline.tracks.some(track => track.role === 'music')).toBe(true);
  expect([...cache.values()].some(file => file.type === 'audio/wav' && file.size > 1000)).toBe(true);
});
it('places floating images with native opacity and movement keyframes', async () => {
  const { execute } = await fixture(); const result = await execute('overlays.auto', { query: 'coffee', maxCount: 2 });
  expect(result.output.report).toMatchObject({ placed: 1 });
  const clip = result.document.timeline.tracks.find(track => track.name === '悬浮叠加')!.clips[0];
  expect(clip).toMatchObject({ kind: 'media', keyframes: { opacity: expect.any(Array), box: expect.any(Array) } });
});
it('generates editable graphics and arranges the frame around them', async () => {
  const { execute } = await fixture(); const graphic = await execute('graphics.generate', { instruction: 'Explain the concept', maxCount: 1 });
  expect(mock.composer).toHaveBeenCalled();
  expect(graphic.document.timeline.tracks.flatMap(track => track.clips).some(clip => clip.kind === 'graphic' && clip.block.templateId === 'custom')).toBe(true);
  const layout = await execute('layout.auto', { aspect: 'portrait', arrange: true }, graphic.output.document as never);
  expect(layout.document.canvas.height).toBeGreaterThan(layout.document.canvas.width);
  expect(layout.output.report).toMatchObject({ arranged: 1 });
});
it('camera motion changes native zoom and transitions instead of flattening the source', async () => {
  const { execute } = await fixture(); const result = await execute('camera.motion', { scale: 1.2, intervalSec: 4, transition: 'fade' });
  const clips = result.document.timeline.tracks.flatMap(track => track.clips).filter(clip => clip.kind === 'narrative');
  expect(clips).toHaveLength(3); expect(clips[0].properties.zoom?.scale).toBe(1.2); expect(clips[1].properties.transIn?.effect).toBe('fade');
});

it('keeps an ending graphic inside the source duration instead of extending the video', async () => {
  const { execute } = await fixture([{ text: 'Ending point', start: 9.5, end: 10 }]);
  const result = await execute('graphics.generate', { instruction: 'Explain', maxCount: 1 });
  const graphic = result.document.timeline.tracks.flatMap(track => track.clips).find(clip => clip.kind === 'graphic')!;
  expect(graphic.startFrame + graphic.durationFrames).toBeLessThanOrEqual(10 * result.document.canvas.fps);
  expect(mock.composer.mock.calls[0][0].block.durationSec).toBe(.5);
});

it('authors MG in the planned area and completes linked framing even when previewing only MG', async () => {
  const { frameContentPlan } = await import('@pireel/studio-engine/editing-plan');
  const { host, execute, document } = await fixture();
  const canvas = host.store.read<EditorDocumentV2>(document, 'document').canvas;
  const value = frameContentPlan({ sourceKey: 'source', durationSec: 10, beats: [{ id: 'explain', text: 'Coffee facts', start: 4, end: 8, purpose: 'explain', visual: 'graphic', description: 'Explain caffeine as a diagram', reason: 'Explain mechanism' }, { id: 'summary', text: 'Summary', start: 0, end: 3, purpose: 'summary', visual: 'speaker', description: '', reason: '' }].sort((a, b) => a.start - b.start) as never }, canvas, true, { x: .04, y: .8, w: .92, h: .15 });
  const plan = await host.store.put('edit-plan', 'framing-plan', value);
  const graphic = await execute('graphics.generate', defaultEditingRecipe().graphics, document, { plan });
  expect(mock.composer.mock.calls[0][0].block.boxPx).toEqual({ w: Math.round(value.beats.find(beat => beat.id === 'explain')!.payload!.w * canvas.width), h: Math.round(value.beats.find(beat => beat.id === 'explain')!.payload!.h * canvas.height) });
  expect(mock.composer.mock.calls[0][0].instruction).toContain('Explain caffeine as a diagram');
  expect(graphic.document.timeline.tracks.find(track => track.id === 'editorial-presenter')?.clips[0]).toMatchObject({ linkGroupId: 'editorial-explain', fit: 'contain', video: { audioMuted: true } });
  const framed = await execute('layout.auto', defaultEditingRecipe().layout, graphic.output.document as never, { plan });
  expect(framed.document.timeline.tracks.filter(track => track.id === 'editorial-presenter')).toHaveLength(1);
  const camera = await execute('camera.motion', defaultEditingRecipe().camera, graphic.output.document as never, { plan });
  const moving = camera.document.timeline.tracks.flatMap(track => track.clips).filter(clip => clip.kind === 'narrative' && clip.properties.zoom);
  expect(moving).toHaveLength(1); expect(moving[0].startFrame).toBe(0);
  expect(moving[0].durationFrames).toBe(3 * canvas.fps);
});
