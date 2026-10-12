import { describe, expect, it, vi } from 'vitest';
import { compositionToEditorDocument, emptyComposition } from '@pireel/studio-engine/composition';
import { emptyPlaybook, playbookSnapshot } from '@pireel/studio-engine/brand-playbook';
import { playbookAgentBrief } from '@pireel/studio-engine/brand-edit-params';
import { CoverSceneController, coverSceneFromDocument, coverSceneInput, withCoverScene, type CoverSceneHost } from './cover-scene';

function fixture() {
  let document = compositionToEditorDocument({ projectId: 'cover', videoSig: 'sig', composition: { ...emptyComposition(), video: { url: 'blob:source', durationSec: 12 }, shots: [{ id: 'speaker', srcStart: 2, srcEnd: 6, treatment: 'full' }] } }).document;
  const assetId = Object.keys(document.assets)[0];
  document.semantics.transcripts[assetId] = [{ start: 0, end: 1, text: 'Deleted wrong take' }, { start: 2, end: 6, text: 'Keep this useful explanation' }];
  const brand = playbookSnapshot(emptyPlaybook('b', 'Brand')); brand.blocks.cover = { design: 'SPECIAL COVER DESIGN: black type on white.', frame: 'Choose the current speaker’s clear face.' }; document.semantics.brand = brand;
  const analyze = vi.fn(async (_body: Record<string, unknown>) => JSON.stringify({ prompt: 'SPECIAL COVER DESIGN: black type on white. Use this video’s own speaker as the reference, with generous negative space and the words Useful explanation. Preserve identity and add no unsupported claims.', pick: 0 }));
  const start = vi.fn(async (_params: Record<string, unknown>) => ({ ok: true as const, ids: ['new-cover-job'] }));
  const poll = vi.fn(async () => ({ id: 'new-cover-job', status: 'succeeded' as const, prompt: 'Prompt stays outside chat', createdAt: 1, assets: [{ key: 'uploads/cover.jpg', url: 'https://cdn.example/cover.jpg', mime: 'image/jpeg' }] }));
  const host: CoverSceneHost = { document: () => document, save: async scene => { document = withCoverScene(document, scene); }, analyze, candidates: vi.fn(async (_id: string, times: number[]) => times.map(sourceSec => ({ sourceSec, base64: 'frame-bytes' }))), reference: vi.fn(async () => 'https://private.example/current-speaker.jpg'), start, poll, defaultModel: async () => 'nano-banana' };
  return { host, analyze, start, poll, assetId, document: () => document, controller: new CoverSceneController(host) };
}
describe('independent cover workflow', () => {
  it('runs the complete authorized workflow without a confirmation round and returns only status', async () => {
    const f = fixture(); const result = await f.controller.generate();
    expect(result).toEqual({ status: 'generating', available: false });
    expect(f.analyze.mock.calls[0][0]).toMatchObject({ action: 'cover-plan', lines: [{ text: 'Keep this useful explanation' }] });
    expect(f.start).toHaveBeenCalledTimes(1);
    expect(f.start.mock.calls[0][0]).toMatchObject({ model_id: 'nano-banana', n: 1, reference_images: ['https://private.example/current-speaker.jpg'] });
    expect(JSON.stringify(result)).not.toMatch(/SPECIAL|http|Useful|frame/);
    expect(coverSceneFromDocument(f.document())?.prompt).toContain('SPECIAL COVER DESIGN');
    expect(playbookAgentBrief(f.document().semantics.brand!)).not.toContain('SPECIAL COVER DESIGN');
    expect(await f.controller.refresh()).toEqual({ status: 'ready', available: true });
    expect(coverSceneFromDocument(f.document())?.images[0].url).toBe('https://cdn.example/cover.jpg');
  });
  it('coalesces concurrent requests and resumes the saved job without paying again', async () => {
    const f = fixture(); await Promise.all([f.controller.generate(), f.controller.generate()]);
    expect(f.start).toHaveBeenCalledTimes(1);
    const resumed = new CoverSceneController(f.host);
    expect(await resumed.generate()).toEqual({ status: 'ready', available: true });
    await resumed.generate(); expect(f.start).toHaveBeenCalledTimes(1); expect(f.analyze).toHaveBeenCalledTimes(1);
  });
  it('keeps failed generation unfinished and requires an explicit retry to start another job', async () => {
    const f = fixture(); f.start.mockResolvedValueOnce({ ok: false, kind: 'credits', need: 10, balance: 0 } as never);
    expect(await f.controller.generate()).toEqual({ status: 'failed', available: false });
    expect(coverSceneFromDocument(f.document())?.error).toBe('cover_insufficient_credits');
    await f.controller.generate(); expect(f.start).toHaveBeenCalledTimes(1);
    await f.controller.generate({ regenerate: true }); expect(f.start).toHaveBeenCalledTimes(2);
  });
  it('prepares a visually grounded brief without speech and selects only retained frames', async () => {
    const f = fixture(); const input = coverSceneInput(f.document());
    expect(input.times.every(time => time >= 2 && time < 6)).toBe(true);
    f.document().semantics.transcripts = {};
    expect(await f.controller.prepare()).toEqual({ status: 'prepared', available: false });
    expect(f.analyze.mock.calls[0][0]).toMatchObject({ lines: [] });
    expect(f.start).not.toHaveBeenCalled();
  });
  it('updates a ready cover when the retained spoken content changes', async () => {
    const f = fixture(); await f.controller.generate(); await f.controller.refresh();
    f.document().semantics.transcripts[f.assetId][1].text = 'A different final topic';
    await f.controller.generate(); expect(f.start).toHaveBeenCalledTimes(2);
    expect(coverSceneFromDocument(f.document())?.history).toHaveLength(1);
  });
});

it('recovers a submitted cover request after its response was lost instead of charging again', async () => {
  const f = fixture(); f.start.mockRejectedValueOnce(new Error('network_lost'));
  expect(await f.controller.generate()).toEqual({ status: 'starting', available: false });
  const runId = coverSceneFromDocument(f.document())!.runId;
  f.host.recover = vi.fn(async (id: string) => id === runId ? { id: 'recovered-job', status: 'pending' as const, prompt: '', assets: [], createdAt: 1 } : null);
  const resumed = new CoverSceneController(f.host);
  expect(await resumed.generate()).toEqual({ status: 'ready', available: true });
  expect(f.start).toHaveBeenCalledTimes(1);
  expect(f.host.recover).toHaveBeenCalledWith(runId);
});

it('finishes the dedicated tool only after its actual image is available, with a compact receipt', async () => {
  const f = fixture();
  expect(await f.controller.complete()).toEqual({ status: 'ready', available: true });
  expect(f.start).toHaveBeenCalledTimes(1); expect(f.poll).toHaveBeenCalledTimes(1);
  expect(coverSceneFromDocument(f.document())?.phase).toBe('ready');
});

it('automatically prepares a complete prompt and reference without starting image generation', async () => {
  const f = fixture(); f.host.context = () => ({ request: 'Explain the useful idea clearly', direction: 'Lead with the benefit', locale: 'en' });
  await Promise.all([f.controller.prepare(), f.controller.prepare()]);
  const scene = coverSceneFromDocument(f.document())!;
  expect(scene).toMatchObject({ phase: 'prepared', promptVersion: 2, sourceSelection: 'auto', sourceFrame: { assetId: f.assetId } });
  expect(scene.prompt.length).toBeGreaterThan(100); expect(f.start).not.toHaveBeenCalled();
  expect(f.analyze).toHaveBeenCalledTimes(1);
  expect(f.analyze.mock.calls[0][0]).toMatchObject({ action: 'cover-plan', context: { direction: 'Lead with the benefit' }, brand: { cover: { design: expect.stringContaining('SPECIAL COVER DESIGN') } } });
  await f.controller.prepare(); expect(f.analyze).toHaveBeenCalledTimes(1);
});

it('uses the edited full prompt verbatim and the manually selected exact frame, including after reopening', async () => {
  const f = fixture(); await f.controller.prepare();
  const prompt = 'My complete custom prompt: keep the real speaker on the left, use a white background and black type. No extra lettering.';
  const frame = { assetId: f.assetId, sourceSec: 5, timelineSec: 3, url: 'data:image/jpeg;base64,not-for-storage' };
  await f.controller.updateDraft({ prompt, sourceFrame: frame });
  expect(JSON.stringify(coverSceneFromDocument(f.document()))).not.toContain('data:image');
  const reopened = new CoverSceneController(f.host); await reopened.prepare();
  expect(f.analyze).toHaveBeenCalledTimes(1);
  await reopened.generate({ regenerate: true });
  expect(f.host.reference).toHaveBeenLastCalledWith(f.assetId, 5, undefined);
  expect(f.start.mock.calls[0][0].prompt).toBe(prompt);
  await expect(reopened.updateDraft({ sourceFrame: { assetId: f.assetId, sourceSec: 0 } })).rejects.toThrow();
});

it('allows a fully manual prompt and reference when automatic preparation fails, without rewriting them', async () => {
  const f = fixture(); f.analyze.mockRejectedValueOnce(new Error('planner_unavailable'));
  await f.controller.prepare();
  const prompt = 'Use the selected reference exactly, with simple typography and a neutral background.';
  await f.controller.updateDraft({ prompt, sourceFrame: { assetId: f.assetId, sourceSec: 4 } });
  await f.controller.generate({ regenerate: true });
  expect(f.analyze).toHaveBeenCalledTimes(1);
  expect(f.start.mock.calls[0][0].prompt).toBe(prompt);
  expect(f.host.reference).toHaveBeenLastCalledWith(f.assetId, 4, undefined);
});

it('excludes disabled footage and ungrounded partial speech from the prompt context', () => {
  const f = fixture();
  f.document().semantics.transcripts[f.assetId] = [{ start: 0, end: 6, text: 'Uncut take with claims removed by the edit' }];
  expect(coverSceneInput(f.document()).lines).toEqual([]);
  const clip = f.document().timeline.tracks.flatMap(track => track.clips).find(clip => clip.kind === 'narrative')!;
  clip.enabled = false;
  expect(coverSceneInput(f.document()).assetId).toBeUndefined();
});


it('reuses generated references across reload and switches back to a video frame when selected', async () => {
  const f = fixture(); await f.controller.complete();
  const image = coverSceneFromDocument(f.document())!.images[0];
  await f.controller.updateDraft({ referenceImage: image });
  const reopened = new CoverSceneController(f.host); await reopened.prepare();
  expect(coverSceneFromDocument(f.document())?.referenceImage).toEqual(image);
  await reopened.generate({ regenerate: true });
  expect(f.start.mock.calls.at(-1)![0].reference_images).toEqual(['https://private.example/current-speaker.jpg', image.url]);
  expect(f.host.reference).toHaveBeenCalledTimes(2);
  await reopened.refresh();
  await reopened.updateDraft({ sourceFrame: { assetId: f.assetId, sourceSec: 5 } });
  expect(coverSceneFromDocument(f.document())?.referenceImage).toBeUndefined();
  await reopened.generate({ regenerate: true });
  expect(f.start.mock.calls.at(-1)![0].reference_images).toEqual(['https://private.example/current-speaker.jpg']);
});

it('puts explicit character consistency in the editable default prompt without changing later manual edits', async () => {
  const f = fixture(); await f.controller.prepare();
  expect(coverSceneFromDocument(f.document())?.prompt).toContain('不得换脸');
  await f.controller.updateDraft({ prompt: 'My intentional custom prompt' });
  await f.controller.prepare();
  expect(coverSceneFromDocument(f.document())?.prompt).toBe('My intentional custom prompt');
});

it('persists the chosen resolution and uses the same size/quality in cover generation after reopening', async () => {
  const f = fixture(); f.host.defaultModel = async () => 'gpt-image';
  await f.controller.prepare();
  await f.controller.updateDraft({ modelId: 'gpt-image', size: '3840x2160', quality: 'high' });
  const reopened = new CoverSceneController(f.host); await reopened.prepare();
  await reopened.generate();
  expect(f.start.mock.calls[0][0]).toMatchObject({ model_id: 'gpt-image', size: '3840x2160', quality: 'high' });
  expect(coverSceneFromDocument(f.document())).toMatchObject({ modelId: 'gpt-image', size: '3840x2160', quality: 'high' });
});

it('shows actual brand pixels to planning and generates the entire cover once with identity first', async () => {
  const f = fixture();
  f.document().semantics.brand!.blocks.cover!.referenceKeys = ['brand-a.jpg', 'brand-b.jpg'];
  f.host.brandReferences = vi.fn(async (keys: string[]) => keys.map(key => ({ key, url: `https://cdn.example/${key}`, base64: `pixels-${key}`, mime: 'image/jpeg' })));
  await f.controller.prepare();
  const body = f.analyze.mock.calls[0][0];
  expect(body.candidateCount).toBe(8);
  expect(body.images).toHaveLength(10);
  expect((body.images as Record<string, unknown>[]).slice(-2)).toEqual([
    { role: 'brand cover 1: style only', base64: 'pixels-brand-a.jpg', mime: 'image/jpeg' },
    { role: 'brand cover 2: style only', base64: 'pixels-brand-b.jpg', mime: 'image/jpeg' },
  ]);
  expect(JSON.stringify(coverSceneFromDocument(f.document()))).not.toContain('pixels-brand');
  expect(coverSceneFromDocument(f.document())!.prompt).toContain('一次性生成完整');
  expect(coverSceneFromDocument(f.document())!.prompt).toContain('允许自然调整表情');
  await f.controller.complete();
  expect(f.start).toHaveBeenCalledTimes(1);
  expect(f.start.mock.calls[0][0]).toMatchObject({ n: 1, reference_images: ['https://private.example/current-speaker.jpg', 'https://cdn.example/brand-a.jpg', 'https://cdn.example/brand-b.jpg'] });
  await f.controller.updateDraft({ referenceImage: coverSceneFromDocument(f.document())!.images[0] });
  await f.controller.generate({ regenerate: true });
  expect(f.start.mock.calls[1][0].reference_images).toEqual(['https://private.example/current-speaker.jpg', 'https://cdn.example/brand-a.jpg', 'https://cdn.example/brand-b.jpg', 'https://cdn.example/cover.jpg']);
});

it('never selects a brand creator as the new video’s person', async () => {
  const f = fixture(); f.document().semantics.brand!.blocks.cover!.referenceKeys = ['brand.jpg'];
  f.host.brandReferences = async keys => keys.map(key => ({ key, url: 'https://cdn.example/brand.jpg', base64: 'brand-pixels', mime: 'image/jpeg' }));
  f.analyze.mockResolvedValueOnce(JSON.stringify({ prompt: 'Compose a complete cover around the current video and its presenter with clear typography.', pick: 8 }));
  expect(await f.controller.generate()).toMatchObject({ status: 'failed' });
  expect(f.start).not.toHaveBeenCalled();
});

it('does not silently generate without a selected brand’s actual references', async () => {
  const f = fixture(); f.document().semantics.brand!.blocks.cover!.referenceKeys = ['missing.jpg'];
  f.host.brandReferences = async () => { throw new Error('offline'); };
  expect(await f.controller.generate()).toMatchObject({ status: 'failed' });
  expect(coverSceneFromDocument(f.document())?.error).toBe('cover_brand_reference_unavailable');
  expect(f.start).not.toHaveBeenCalled();
});

it('loads missing brand references into a saved manual draft without rewriting its prompt', async () => {
  const f = fixture(); f.document().semantics.brand!.blocks.cover!.referenceKeys = ['brand.jpg'];
  f.host.brandReferences = vi.fn(async (keys: string[]) => keys.map(key => ({ key, url: 'https://cdn.example/brand.jpg', base64: 'pixels', mime: 'image/jpeg' })));
  await f.controller.prepare(); await f.controller.updateDraft({ prompt: 'My complete prompt and intended composition' });
  const saved = coverSceneFromDocument(f.document())!; delete saved.brandReferences;
  await f.host.save(saved);
  await new CoverSceneController(f.host).prepare();
  expect(f.analyze).toHaveBeenCalledTimes(1);
  expect(coverSceneFromDocument(f.document())?.prompt).toBe('My complete prompt and intended composition');
  expect(coverSceneFromDocument(f.document())?.brandReferences).toEqual([{ key: 'brand.jpg', url: 'https://cdn.example/brand.jpg' }]);
});
