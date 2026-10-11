import { describe, expect, it } from 'vitest';
import { validatePlaybook } from './brand-playbook';
import {
  SYNTHESIS_TECHNIQUES, VIEW, assembleBrand, captionGeometry, evenWindows, middleSentences, musicBed, parseBrandSynthesis, parseShotLog, parseWindows,
  pickPreviewShot, rowTimes, shotFacts, shotsOf, shotsSeen, spokenSentences, viewingWindows, type BrandSynthesis,
} from './brand-extract';

const words = [
  { text: '哎，', start: 0.1, end: 0.2 }, { text: '朋友们，', start: 0.8, end: 1.1 }, { text: '今天讲关税。', start: 1.2, end: 2 },
  { text: '第一点', start: 130, end: 131 }, { text: '是退税。', start: 131, end: 132 },
];

const answer = (patch: Record<string, unknown> = {}) => JSON.stringify({
  evidence: '1 条视频', portrait: '财经科普女主持。',
  captions: { on: true, preset: 'style-documentary', font: 'sans', bold: false, color: '#ffffff', stroke: { color: '#1a1a1a', width: 2 }, bg: null, animation: 'none', highlight: null, text: '单行短语。' },
  onScreenText: { font: 'web:smiley-sans', fontLike: '优设标题黑', text: '判决时用红色巨字强调结论。', refs: [{ video: 'v1', shot: 1 }, { video: 'v1', shot: 99 }] },
  logo: null,
  techniques: Object.fromEntries(SYNTHESIS_TECHNIQUES.map(id => [id, { text: `${id} 随内容变化，保持清晰直接。`, refs: [{ video: 'v1', shot: 2 }] }])),
  assets: [{ what: '片尾结束板', refs: [{ video: 'v1', shot: 3 }] }],
  skills: ['captions', 'graphics', 'voice-cleanup'],
  cover: { frame: '惊讶表情', design: '左人右题' },
  gaps: ['只有一条视频'],
  ...patch,
});
const context = { shots: { v1: [0, 1, 2, 3] }, logoCandidates: 1 };

describe('what is watched', () => {
  it('splits the transcript into sentences', () => {
    expect(spokenSentences(words).map(s => s.text)).toEqual(['哎，朋友们，今天讲关税。', '第一点是退税。']);
  });

  it('watches a short video whole, a long one by its opening, ending and middle windows', () => {
    expect(viewingWindows(150, [])).toEqual([[0, 150]]);
    expect(viewingWindows(694, [{ start: 300, end: 310 }])).toEqual([[0, 120], [300, 310], [634, 694]]);
    expect(middleSentences(spokenSentences(words), 694).map(s => s.text)).toEqual(['第一点是退税。']);
    expect(middleSentences(spokenSentences(words), 150)).toEqual([]);
    expect(evenWindows(120, 634)).toHaveLength(VIEW.windows);
  });

  it('cuts shots at the measured cuts and keeps those inside the windows', () => {
    const shots = shotsOf([5.8, 6.4, 200, 650], 694);
    expect(shots.map(s => [s.start, s.end])).toEqual([[0, 5.8], [5.8, 6.4], [6.4, 200], [200, 650], [650, 694]]);
    expect(shotsSeen(shots, [[0, 120], [634, 694]]).map(s => s.index)).toEqual([0, 1, 2, 3, 4]);
    expect(shotsSeen(shots, [[300, 310]]).map(s => s.index)).toEqual([3]);
    expect(rowTimes(shots[0]!)[0]).toBeNull();
    // A 0.6 s shot: its "+0.3 s" frame stops at the shot's end.
    expect(rowTimes(shots[1]!)).toEqual([5.5, 5.84, 6.1, 6.1]);
  });

  it('notes push-ins and punch-ins from the face size', () => {
    const shots = shotsOf([2, 4], 6);
    const facts = shotFacts(shots, shots, [{ t: 0.5, h: 0.2 }, { t: 1.5, h: 0.2 }, { t: 2.5, h: 0.3 }, { t: 3.5, h: 0.4 }], spokenSentences(words));
    expect(facts[0]!.line).toBe('哎，朋友们，今天讲关税。');
    expect(facts[1]!.atCut).toMatch(/jumps 0.20→0.30/);
    expect(facts[1]!.motion).toMatch(/grows 0.30→0.40/);
    expect(facts[2]!.face).toBe('none');
  });

  it('reads a music bed from the pauses against the speech', () => {
    expect(musicBed([-26, -25, -25, -24, -26], [-15, -16, -15, -14, -15])?.reading).toMatch(/a bed/);
    expect(musicBed([-60, -62, -61, -60, -59], [-15, -16, -15, -14, -15])?.reading).toMatch(/quiet/);
    expect(musicBed([-25], [-15])).toBeNull();
  });
});

describe('model answers are checked', () => {
  it('keeps windows inside the middle, in order, without overlaps', () => {
    const raw = JSON.stringify({ windows: [{ start: 300, end: 310, why: 'a' }, { start: 305, end: 315, why: 'overlap' }, { start: 10, end: 20, why: 'opening' }, { start: 200, end: 211, why: 'b' }] });
    expect(parseWindows(raw, 120, 634).map(w => w.start)).toEqual([200, 300]);
    expect(() => parseWindows('{"windows":[]}', 120, 634)).toThrow(/no usable window/);
  });

  it('wants every watched shot logged, and drops a caption box it cannot use', () => {
    const shots = Array.from({ length: 10 }, (_, at) => ({ shot: at, picture: 'host', what: '主持人', source: 'own_shoot', enter: 'hard_cut', motion: 'none', text: '' }));
    const log = parseShotLog(JSON.stringify({ shots, captions: { present: true, fill: '#ffffff', box: { frame: 3, x: 0.3, y: 0.85, w: 0.4, h: 0.06 } }, overlays: [{ crop: 0, is: 'platform_watermark', what: 'B 站水印' }] }), 'v1', shots.map(s => s.shot), 12, 1);
    expect(log.captions.box?.frame).toBe(3);
    expect(log.overlays[0]!.is).toBe('platform_watermark');
    expect(parseShotLog(JSON.stringify({ shots, captions: { present: true, box: { frame: 40, x: 0, y: 0, w: 1, h: 1 } } }), 'v1', shots.map(s => s.shot), 12, 1).captions.box).toBeUndefined();
    expect(() => parseShotLog(JSON.stringify({ shots: shots.slice(0, 3), captions: { present: false } }), 'v1', shots.map(s => s.shot), 12, 0)).toThrow(/covers 3 of 10/);
  });


  it('takes ids only from the catalogs and refs only to logged shots', () => {
    const brand = parseBrandSynthesis(answer(), context);
    expect(brand.onScreenText.refs).toEqual([{ video: 'v1', shot: 1 }]);
    expect(brand.skills).toEqual(['captions', 'graphics']);
    expect(() => parseBrandSynthesis(answer({ captions: { on: true, preset: 'made-up', font: 'sans', animation: 'none', color: '#ffffff' } }), context)).toThrow(/catalogs/);
    const missing = JSON.parse(answer()) as { techniques: Record<string, unknown> };
    delete missing.techniques.transitions;
    expect(() => parseBrandSynthesis(JSON.stringify(missing), context)).toThrow(/missing transitions/);
  });

  it('accepts free prose and still reads saved synthesis answers from the old method', () => {
    const prose = '观点部分留给主持人。讲到数字时，用与内容相称的图形把关系讲清楚。';
    const fresh = JSON.parse(answer());
    fresh.techniques.graphics = { text: prose, refs: [{ video: 'v1', shot: 2 }] };
    expect(parseBrandSynthesis(JSON.stringify(fresh), context).techniques.graphics).toEqual({ text: prose, refs: [{ video: 'v1', shot: 2 }] });
    fresh.techniques.graphics = { use: '用', degree: '只在解释数字时出现', looks: '白底黑字', refs: [{ video: 'v1', shot: 2 }] };
    expect(parseBrandSynthesis(JSON.stringify(fresh), context).techniques.graphics.text).toBe('只在解释数字时出现。 白底黑字。');
  });

  it('accepts the unified style and explicit preferences without requiring the old technique checklist', () => {
    const value = JSON.parse(answer());
    delete value.techniques;
    value.style = { text: '图形跟随新内容，保持深色底和清楚的层级。', refs: [{ video: 'v1', shot: 2 }] };
    value.preferences = { pauses: true, cleanup: true, denoise: false, broll: true, graphics: true, sound: false, transitions: false, zoom: false, headlines: true };
    const synthesis = parseBrandSynthesis(JSON.stringify(value), context);
    expect(synthesis.style?.text).toBe(value.style.text);
    expect(synthesis.preferences?.zoom).toBe(false);
    const brand = assembleBrand({ id: 'b', name: 'Brand', platform: 'upload', locale: 'zh', videos: [], synthesis, measured: { lufs: null, pauses: null }, references: {} });
    expect(validatePlaybook(brand).style?.text).toBe(value.style.text);
    expect(brand.preferences?.broll).toBe(true);
    // The withdrawn layout flag in saved synthesis does not reactivate the unreleased feature.
    expect(synthesis.preferences?.layout).toBeUndefined();
    value.preferences.layout = true;
    expect(parseBrandSynthesis(JSON.stringify(value), context).preferences?.layout).toBeUndefined();
    value.preferences.zoom = 'sometimes';
    expect(() => parseBrandSynthesis(JSON.stringify(value), context)).toThrow(/preference/);
  });

  it('takes a logo only from the candidates', () => {
    expect(parseBrandSynthesis(answer({ logo: { candidate: 0, corner: 'top-left', widthPct: 10 } }), context).logo).toEqual({ candidate: 0, corner: 'top-left', widthPct: 10 });
    expect(parseBrandSynthesis(answer({ logo: { candidate: 3, corner: 'top-left', widthPct: 10 } }), context).logo).toBeNull();
  });
});

describe('the brand', () => {
  it('sizes captions from the measured letters', () => {
    expect(captionGeometry({ x: 0.3, w: 0.4 }, { top: 0.86, bottom: 0.9 }, 9 / 16)).toEqual({ scale: 0.43, xPct: 50, yPct: 90.9, wPct: 46 });
  });

  it('assembles a valid schema-3 brand: fixed values, one block per technique, notes', () => {
    const synthesis: BrandSynthesis = parseBrandSynthesis(answer(), context);
    const asset = { key: 'uploads/u/ref.jpg', kind: 'image' as const, width: 852, height: 480 };
    const brand = assembleBrand({
      id: 'brand_1', name: '小Lin说', platform: 'bilibili', locale: 'zh', videos: [{ id: 'v1', durationSec: 694 }], synthesis,
      measured: { lufs: -12.6, pauses: 'tight', captions: { scale: 0.64, xPct: 50, yPct: 92.7, wPct: 40 } },
      references: { overlay_text: [asset], graphics: [asset] }, coverReferences: ['uploads/u/cover.jpg'],
    });
    expect(() => validatePlaybook(brand)).not.toThrow();
    expect(brand.blocks.captions?.style).toMatchObject({ preset: 'style-documentary', color: '#ffffff', strokeColor: '#1a1a1a', strokeWidth: 2, scale: 0.64, yPct: 92.7 });
    expect(brand.blocks.sound).toMatchObject({ lufs: -12.5, pauses: 'tight' });
    expect(brand.blocks.transitions?.text).toBe('transitions 随内容变化，保持清晰直接。');
    expect(brand.blocks.graphics?.references).toEqual([asset]);
    expect(brand.blocks.assets?.text).toBe('- 片尾结束板');
    expect(brand.blocks.cover?.referenceKeys).toEqual(['uploads/u/cover.jpg']);
    expect(brand.notes).toEqual({ evidence: '1 条视频', gaps: ['只有一条视频'] });
  });

  it('shows the brand on a plain speaker shot at the usual framing', () => {
    const log = parseShotLog(JSON.stringify({ shots: [
      { shot: 0, picture: 'broll', what: '', source: 'news_footage', enter: 'hard_cut', motion: 'none', text: '' },
      { shot: 1, picture: 'host', what: '', source: 'own_shoot', enter: 'hard_cut', motion: 'none', text: '标题' },
      { shot: 2, picture: 'host', what: '', source: 'own_shoot', enter: 'hard_cut', motion: 'none', text: '' },
    ], captions: { present: true } }), 'v1', [0, 1, 2], 12, 0);
    const facts = [{ shot: 0, start: 0, end: 2, line: '' }, { shot: 1, start: 2, end: 5, line: '', faceH: [0.25, 0.25] as [number, number] }, { shot: 2, start: 5, end: 9, line: '', faceH: [0.26, 0.26] as [number, number] }];
    expect(pickPreviewShot([{ id: 'v1', log, facts }])).toEqual({ video: 'v1', t: 7, clean: false });
  });
});
