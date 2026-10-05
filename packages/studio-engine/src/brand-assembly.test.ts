import { describe, expect, it } from 'vitest';
import type { BrandObservationSummary } from './brand-analysis';
import { assemblePlaybook, type PlaybookParts } from './brand-assembly';
import type { BrandEditSpec } from './brand-edit-spec';
import { METHOD_VERSION } from './brand-method';
import { validatePlaybook } from './brand-playbook';
import { parseStyleFacets, type Synthesis, type VideoReading } from './brand-reading';

const field = <T>(value: T, confidence = 0.8, source = 'measured') => ({ value, provenance: { source, confidence, videos: 4 } });
const spec = {
  usedVideos: ['v1', 'v2', 'v3', 'v4'],
  captions: { presence: field('always'), wordsPerPage: field(8), case: field('sentence') },
  audio: { targetLufs: field(-14.8) },
  cutting: { silence: field({ mode: 'aggressive', maxGapMs: 200 }), targetCpm: field([15.4, 25.6], 0.6) },
  textOverlays: { header: field({ enabled: false, box: null, examples: [] }) },
} as unknown as BrandEditSpec;
const summary = { captions: { bottomPct: 22, lineHeightPct: 3.5, widthPct: 70, xCenterPct: 50, evidence: { videos: ['v1', 'v2', 'v3'], confidence: 'high' } }, logo: null, intro: null, outro: null } as unknown as BrandObservationSummary;
const reading = (video: string): VideoReading => ({ video, portrait: 'Quick talk.', moments: [], notes: {}, look: { captionFill: '#ffffff', palette: [] }, facets: parseStyleFacets({ captionTreatment: 'stroke', accentRule: 'keywords', fontClass: 'heavy_sans' }) });
const synthesis: Synthesis = {
  blocks: {
    portrait: { text: '快节奏数码测评。', videos: [] },
    editing: { text: '说到价格时快推近。', videos: ['v1', 'v2', 'v3'] },
    motion_graphics: { text: '白底黑字数字卡弹入。', videos: ['v2', 'v3'] },
  },
  palette: { accent: '#ffd600' }, setAside: [], uncited: [],
};
const mg = { key: 'uploads/u/mg.jpg', kind: 'image' as const, width: 540, height: 960 };
const parts = (): PlaybookParts => ({
  id: 'pending', name: 'Mine', platform: 'douyin', locale: 'zh',
  videos: ['v1', 'v2', 'v3', 'v4'].map(id => ({ id, durationSec: 60 })),
  spec, summary, synthesis, heightPerWidth: 16 / 9, readings: ['v1', 'v2', 'v3'].map(reading),
  assets: { coverReferences: [], layoutReferences: [], motionReferences: [mg] },
});

describe('assemblePlaybook', () => {
  it('builds a valid brand: measurement owns the fixed blocks, the synthesis writes the prose', () => {
    const playbook = assemblePlaybook(parts());
    expect(() => validatePlaybook(playbook)).not.toThrow();
    expect(playbook.method).toBe(METHOD_VERSION);
    const b = playbook.blocks;
    expect(b.sound).toMatchObject({ lufs: -15, pauses: 'tight' });
    expect(b.captions).toMatchObject({ on: true, accent: 'keywords', style: { color: '#ffffff', strokeColor: '#000000', yPct: 22.7 } });
    expect(b.palette).toEqual({ accent: '#ffd600' });
    expect(b.editing).toEqual({ text: '说到价格时快推近。', evidence: { videos: ['v1', 'v2', 'v3'], confidence: 'high' } });
    expect(b.motion_graphics?.references).toEqual([mg]);
    expect(b.layout).toBeUndefined();
  });

  it('leaves out what measurement did not find', () => {
    const input = parts();
    input.spec = { ...spec, audio: { targetLufs: field(-14, 0.2, 'platform_default') }, cutting: { ...spec.cutting, silence: field({ mode: 'moderate', maxGapMs: 400 }, 0.2, 'platform_default') } } as unknown as BrandEditSpec;
    input.summary = { ...summary, captions: null } as unknown as BrandObservationSummary;
    const playbook = assemblePlaybook(input);
    expect(playbook.blocks.sound).toBeUndefined();
    expect(playbook.blocks.captions).toBeUndefined();
  });

  it('writes the cover in two parts from the covers, with the covers as references', () => {
    const cover = { key: 'uploads/u/c.jpg', kind: 'image' as const, width: 720, height: 960 };
    const playbook = assemblePlaybook({ ...parts(), cover: { frame: '惊讶表情，正对镜头。', headline: '一句反问，六字以内。', design: '人物在右，左侧黄色大字。', held: 3, total: 4, videos: ['v1'] }, assets: { ...parts().assets, coverReferences: [cover] } });
    expect(() => validatePlaybook(playbook)).not.toThrow();
    expect(playbook.blocks.cover).toEqual({ frame: '惊讶表情，正对镜头。', headline: '一句反问，六字以内。', design: '人物在右，左侧黄色大字。', evidence: { videos: ['v1'], confidence: 'high' }, references: [cover] });
    expect(assemblePlaybook({ ...parts(), assets: { ...parts().assets, coverReferences: [cover] } }).blocks.cover).toEqual({ references: [cover] });
  });

  it('takes the readings\' caption colour when the measured one is the outline', () => {
    const input = parts(); input.assets = { ...input.assets, captionColors: { color: '#0a080a', plate: null } };
    expect(assemblePlaybook(input).blocks.captions?.style?.color).toBe('#ffffff');
    input.assets = { ...input.assets, captionColors: { color: '#f4f4f0', plate: null } };
    expect(assemblePlaybook(input).blocks.captions?.style?.color).toBe('#f4f4f0');
  });

  it('takes the fonts read from the creator\'s text: captions render in theirs, the fonts block holds the title face only', () => {
    const playbook = assemblePlaybook({ ...parts(), fonts: { captions: { id: 'web:douyin-sans', look: '圆角黑体，粗', weight: 'bold' }, titles: { id: 'web:smiley-sans', look: '斜体窄黑体', actual: '得意黑' } } });
    expect(() => validatePlaybook(playbook)).not.toThrow();
    expect(playbook.blocks.captions?.style).toMatchObject({ font: 'web:douyin-sans', bold: true });
    expect(playbook.blocks.fonts).toEqual({ heading: 'web:smiley-sans', text: '斜体窄黑体，像 得意黑' });
    const fromCover = assemblePlaybook({ ...parts(), fonts: { cover: { id: 'web:ximaiti', look: '粗斜美术体' } } });
    expect(fromCover.blocks.fonts).toEqual({ heading: 'web:ximaiti', text: '粗斜美术体（作品里没有花字，取自封面大字）' });
  });

  it('sizes and places captions from the letters measured on pixels', () => {
    // Letters 6.25% of the frame tall ending at 93.5%: on a 16:9 canvas 1080 wide (608 tall) that is
    // a 43 px font (scale ≈ 0.67) whose line box ends a fifth of the font below the letters.
    const playbook = assemblePlaybook({ ...parts(), heightPerWidth: 9 / 16, assets: { ...parts().assets, captionInk: { heightPct: 6.25, bottomPct: 93.5 } } });
    expect(playbook.blocks.captions?.style).toMatchObject({ scale: 0.67, yPct: 94.9 });
  });
});

