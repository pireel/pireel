import { beforeEach, expect, it, vi } from 'vitest';
import type { CaptionTaskRecord } from './caption-task-store';
const mock = vi.hoisted(() => ({ asr: vi.fn(), render: vi.fn(), visual: vi.fn(), files: new Map<string, File>() }));
vi.mock('./media', () => ({ transcribeFile: mock.asr, durableFileSig: async () => 'ugc-rendered' }));
vi.mock('./local-media', () => ({ saveLocalVideo: async (file: File, sig: string) => { mock.files.set(sig, file); return true; }, loadLocalVideo: async (sig: string) => mock.files.get(sig) ?? null }));
vi.mock('./caption-task-store', () => ({ loadCaptionMedia: async (_owner: string, sig: string) => mock.files.get(sig) ?? null }));
vi.mock('./client-export', () => ({ clientExportVideo: mock.render }));
vi.mock('./visual', () => ({ prepareVisualAnalysis: mock.visual }));
vi.mock('./web-fonts', () => ({ loadFont: async () => {} }));
import { exportUgcAdEdit, runUgcAdTask } from './ugc-ad-task-runner';
const fixture = (): CaptionTaskRecord => ({ id: 'ad', scene: 'ugc-ad', scope: 'owner', name: 'creator.mp4', sourceSig: 'source', width: 1080, height: 1920, durationSec: 12, stage: 'ready', updatedAt: 1, options: { layoutVersion: 2, presetId: 'clean', aspect: 'original', shortenPauses: false, broll: { assets: [], captions: true }, ugcAd: { productName: '晨光杯', claim: '容量 350ml', callToAction: '查看详情', hook: '', angle: 'demo' } } });
const hooks = () => ({ signal: new AbortController().signal, checkpoint: async () => {}, progress: vi.fn() });
beforeEach(() => { vi.clearAllMocks(); mock.files.clear(); mock.asr.mockResolvedValue([{ text: '这款晨光杯很方便', start: 0, end: 3 }]); mock.visual.mockResolvedValue({ prep: { frames: [{ timestamp: 4, base64: 'frame', mime: 'image/jpeg' }], segsAll: [{ start: 0, end: 8 }] } }); mock.render.mockResolvedValue(new Blob(['mp4'], { type: 'video/mp4' })); });
it('creates a native ad with narration captions and exact supplied claim and CTA', async () => {
  const source = new File(['source'], 'creator.mp4', { type: 'video/mp4' });
  const result = await runUgcAdTask(fixture(), source, hooks());
  expect(result.task.stage).toBe('completed');
  const document = result.task.document!;
  expect(document.timeline.tracks.some(track => track.type === 'caption')).toBe(true);
  const text = document.timeline.tracks.flatMap(track => track.clips).filter(clip => clip.kind === 'graphic').map(clip => clip.block.slots?.text);
  expect(text).toEqual(expect.arrayContaining(['这款晨光杯很方便', '容量 350ml', '查看详情']));
  expect(mock.render).toHaveBeenCalledOnce(); expect(mock.asr).toHaveBeenCalledOnce();
  expect(JSON.stringify(mock.render.mock.calls[0][0].comp)).toContain('查看详情');
  await exportUgcAdEdit(result.task, source, hooks());
  expect(mock.render).toHaveBeenCalledTimes(2); expect(mock.asr).toHaveBeenCalledOnce();
});
it('rejects an incomplete commercial brief before transcription or rendering', async () => {
  const task = fixture(); task.options.ugcAd!.callToAction = '';
  await expect(runUgcAdTask(task, new File(['s'], 'creator.mp4'), hooks())).rejects.toThrow('行动引导');
  expect(mock.asr).not.toHaveBeenCalled(); expect(mock.render).not.toHaveBeenCalled();
});

it('uses an uploaded product clip through the existing analysis/matching graph', async () => {
  const source = new File(['source'], 'creator.mp4', { type: 'video/mp4' });
  mock.files.set('footage', new File(['product'], 'cup.mp4', { type: 'video/mp4' }));
  const task = fixture(); task.options.broll!.assets = [{ id: 'asset', sig: 'footage', name: 'cup.mp4', kind: 'video', durationSec: 8, width: 1080, height: 1920 }];
  vi.stubGlobal('fetch', vi.fn(async url => Response.json(String(url).includes('/vlm') ? { desc: '晨光杯产品特写' } : { placements: [{ id: 'broll-0', candidateId: 'asset-0', start: 0, duration: 3 }] })));
  try {
    const result = await runUgcAdTask(task, source, hooks());
    expect(result.task.workflow?.steps.map(step => step.id)).toEqual(expect.arrayContaining(['analysis', 'match', 'broll', 'ugc-text', 'render']));
    expect(result.task.document?.timeline.tracks.find(track => track.role === 'broll')?.clips).toHaveLength(1);
    expect(mock.render.mock.calls[0][0].visualMediaClips).toHaveLength(1);
    expect(JSON.stringify(mock.render.mock.calls[0][0].comp)).toContain('查看详情');
    const calls = vi.mocked(fetch).mock.calls.length;
    await exportUgcAdEdit(result.task, source, hooks());
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(calls);
    expect(mock.render.mock.calls[1][0].visualMediaClips).toHaveLength(1);
    expect(JSON.stringify(mock.render.mock.calls[1][0].comp)).toContain('查看详情');
  } finally { vi.unstubAllGlobals(); }
});
