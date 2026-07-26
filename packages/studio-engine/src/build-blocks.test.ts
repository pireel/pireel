import { describe, expect, it } from 'vitest';
import { chunkWordsByWidth, detectLang } from './caption-fx';
import { type AsrSegment, applyCaptionTranslations, captionBlocksFromAsr, clearCaptionTranslations, desegmentCues, sanitizeTranscriptSegs } from './build-blocks';
import { displayCues } from './captions-relay';
import { type VideoShot, renderBlock } from './composition';

/** Whole-source single shot (the workbench ensureShots convention). */
const oneShot = (dur: number): VideoShot[] => [{ id: 'sh1', srcStart: 0, srcEnd: dur, treatment: 'full' }];

const w = (text: string, start: number, end: number) => ({ text, start, end });

describe('chunkWordsByWidth(长句拆段——渲染期实时计算)', () => {
  it('短句不拆', () => {
    const groups = chunkWordsByWidth([w('今天', 0, 0.5), w('聊聊', 0.5, 1), w('剪辑', 1, 1.5)]);
    expect(groups).toHaveLength(1);
  });

  it('长句按视觉宽度断,每段 CJK ≤ 13 字口径,词无丢失顺序保持', () => {
    const words = Array.from({ length: 30 }, (_, i) => w('字', i * 0.2, i * 0.2 + 0.2));
    const groups = chunkWordsByWidth(words);
    expect(groups.length).toBeGreaterThanOrEqual(3); // 30 字 → 至少 3 段
    for (const g of groups) {
      expect(g.length).toBeLessThanOrEqual(13);
    }
    expect(groups.flat()).toEqual(words);
  });

  it('均衡断行(pretext 式):不出「13+3」孤尾,段宽贴近均分', () => {
    // 16 字 → 2 段:应 ~8+8,不是 13+3
    const words = Array.from({ length: 16 }, (_, i) => w('字', i, i + 1));
    const groups = chunkWordsByWidth(words);
    expect(groups).toHaveLength(2);
    expect(Math.abs(groups[0]!.length - groups[1]!.length)).toBeLessThanOrEqual(2);
  });

  it('标点在均宽边界附近优先断', () => {
    // 18 字,逗号在第 10 字尾(均宽边界 9 附近)→ 在逗号处断
    const words = [...Array.from({ length: 9 }, (_, i) => w('字', i, i + 1)), w('了,', 9, 10), ...Array.from({ length: 8 }, (_, i) => w('字', 10 + i, 11 + i))];
    const groups = chunkWordsByWidth(words);
    expect(groups).toHaveLength(2);
    expect(groups[0]![groups[0]!.length - 1]!.text).toBe('了,');
  });

  it('整句放得下 = 不拆;西文按半宽算', () => {
    expect(chunkWordsByWidth(Array.from({ length: 13 }, (_, i) => w('字', i, i + 1)))).toHaveLength(1);
    // 20 个拉丁词元 ≈ 10 视觉单位 < 13 → 不拆
    expect(chunkWordsByWidth(Array.from({ length: 20 }, (_, i) => w('a', i, i + 1)))).toHaveLength(1);
  });
});

describe('captionBlocksFromAsr(一句一块;拆段在渲染期,不落数据)', () => {
  it('长句也只产出一个块(拆段归渲染器),preset/yPct 透传', () => {
    const text = '这是一个非常非常长的句子它应该在渲染时被拆成好几段轮播';
    const blocks = captionBlocksFromAsr([{ start: 0, end: 10, text }], { preset: 'ln-clean', yPct: 93 });
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.templateId).toBe('caption');
    expect(blocks[0]!.slots.preset).toBe('ln-clean');
    expect(blocks[0]!.slots.yPct).toBe(93);
    expect(blocks[0]!.label).toBe(text);
  });

  it('空文本句被过滤', () => {
    expect(captionBlocksFromAsr([{ start: 0, end: 1, text: '  ' }])).toHaveLength(0);
  });

  it('窗口互斥:上一句尾部与下一句起点交叠时截断到下一句 start(词时间不动)', () => {
    const blocks = captionBlocksFromAsr([
      { start: 0.5, end: 2.0, text: '第一句字幕', words: [{ text: '第一句', start: 0.5, end: 1.1 }, { text: '字幕', start: 1.1, end: 2.0 }] },
      { start: 1.7, end: 3.5, text: '第二句接着说', words: [{ text: '第二句', start: 1.7, end: 2.4 }, { text: '接着说', start: 2.4, end: 3.5 }] },
    ]);
    const [a, b] = blocks as [(typeof blocks)[0], (typeof blocks)[0]];
    expect(a.startSec + a.durationSec).toBeCloseTo(b.startSec, 5); // 不再同屏(span2 的 0.3s 尾巴也被邻句截掉)
    expect(b.startSec + b.durationSec).toBeCloseTo(3.8, 5); // 末句无邻句,保留 span2 的 0.3s 收尾
    expect((a.slots.words as { end: number }[]).at(-1)!.end).toBe(2.0); // 词时间保持转写真值
  });

  it('双语副行:sub 随句进块并渲染成 .cap-sub;没配译文的句不渲染副行', () => {
    const blocks = captionBlocksFromAsr([
      { start: 0, end: 3, text: '大家好', sub: 'Hello everyone' },
      { start: 3, end: 6, text: '今天聊剪辑' },
    ]);
    expect(blocks[0]!.slots.sub).toBe('Hello everyone');
    expect(blocks[1]!.slots.sub).toBeUndefined();
    const r0 = renderBlock(blocks[0]!);
    expect(r0.innerHtml).toContain('cap-sub');
    // 译文行与主行同一套分词拆行:词落成 span(词间距走 flex gap,不再是整句文本节点)
    // Hello→everyone 是西文相邻词:带 .sp(词界追加距,英文不再"挤在一起")
    expect(r0.innerHtml).toContain('<span class="sp">Hello</span>');
    expect(r0.innerHtml).toContain('<span>everyone</span>');
    expect(r0.innerHtml).toContain('cap-sub-line');
    expect(renderBlock(blocks[1]!).innerHtml).not.toContain('cap-sub');
  });
});

describe('displayCues(铺设期派生:剪辑后词流 → 一屏一行,列表与视频同一份)', () => {
  const longText = '这是一个非常非常长的句子它应该在铺设的时候被切成好几条独立的字幕';
  it('长句切成多条 cue:文本可拼回/ref 指回源句词范围/时间贴词', () => {
    const cues = displayCues(oneShot(10), [{ start: 0, end: 10, text: longText }], {});
    expect(cues.length).toBeGreaterThanOrEqual(2);
    expect(cues.map((c) => c.text).join('')).toBe(longText);
    for (const c of cues) {
      expect(c.cue).toBe(true);
      expect(c.ref).toBeDefined();
      expect(c.ref!.seg).toBe(0);
    }
    expect(cues[0]!.ref!.w0).toBe(0);
    for (let i = 1; i < cues.length; i++) expect(cues[i]!.ref!.w0).toBe(cues[i - 1]!.ref!.w1 + 1);
  });
  it('剪辑切走 cue 中段词:存活词并成连续流重切,不留孤词碎片(收到/了极 事故的回归钉)', () => {
    // 句子 0–10s,词均摊;剪辑只保留 0–1.2s 和 8.8–10s 两段 → 存活词在成片时间上无缝相接,应重切成完整 cue 而不是两个孤片
    const words = Array.from({ length: 20 }, (_, i) => ({ text: '字', start: i * 0.5, end: i * 0.5 + 0.5 }));
    const shots: VideoShot[] = [
      { id: 'a', srcStart: 0, srcEnd: 1.0, treatment: 'full' },
      { id: 'b', srcStart: 9.0, srcEnd: 10, treatment: 'full' },
    ];
    const cues = displayCues(shots, [{ start: 0, end: 10, text: words.map((w) => w.text).join(''), words }], {});
    expect(cues.length).toBe(1); // 2+2 个存活字合成一条 cue(时间压缩无跳变 → 同组 → 一屏)
    expect(cues[0]!.text).toBe('字字字字');
    expect(cues[0]!.ref!.w0).toBe(0);
    expect(cues[0]!.ref!.w1).toBe(19); // 词范围横跨源句(中段被剪),回写键仍指真实源词序
  });
  it('译文解析:整句译文按词数占比分配到各 cue(下行跟上行同节奏);精确 per-cue key 压过分配', () => {
    const cues = displayCues(oneShot(3), [{ start: 0, end: 3, text: '大家好', sub: 'Hello everyone' }], {});
    expect(cues).toHaveLength(1);
    expect(cues[0]!.sub).toBe('Hello everyone'); // 单 cue 句:整句译文原样落这条
    // 多 cue 句:译文按每条 cue 的源词占比切片,拼回≈原译文,且不是每条都挂整句
    const sub = 'one two three four five six seven eight nine ten eleven twelve';
    const long = displayCues(oneShot(10), [{ start: 0, end: 10, text: longText, sub }], {});
    expect(long.length).toBeGreaterThanOrEqual(2);
    for (const c of long) expect(c.sub).toBeTruthy();
    expect(long.map((c) => c.sub).join(' ')).toBe(sub);
    expect(long[0]!.sub).not.toBe(sub);
    // 精确 per-cue key(BYO/单行手改)压过自己那片,别的 cue 仍吃分配
    const key = `${long[0]!.ref!.w0}:${long[0]!.ref!.w1}`;
    const withCueSub = displayCues(oneShot(10), [{ start: 0, end: 10, text: longText, sub, cueSubs: { [key]: 'manual piece' } }], {});
    expect(withCueSub[0]!.sub).toBe('manual piece');
    expect(withCueSub[1]!.sub).toBe(long[1]!.sub);
  });
  it('译文解析:不校验剪辑时效——剪切后整句译文照常分配到存活 cue;片段区间译文按组命中', () => {
    const words = Array.from({ length: 20 }, (_, i) => ({ text: '字', start: i * 0.5, end: i * 0.5 + 0.5 }));
    const seg = { start: 0, end: 10, text: words.map((w) => w.text).join(''), words };
    const cut: VideoShot[] = [
      { id: 'a', srcStart: 0, srcEnd: 1.0, treatment: 'full' },
      { id: 'b', srcStart: 9.0, srcEnd: 10, treatment: 'full' },
    ];
    // 剪切后整句 sub 不隐藏:直接分配给存活 cue(存了什么显示什么,重不重翻用户自己定)
    const kept = displayCues(cut, [{ ...seg, sub: 'whole tr' }], {});
    expect(kept).toHaveLength(1);
    expect(kept[0]!.sub).toBe('whole tr');
    // 面板对被劈开句子按组回写的区间译文(key=组的 w0:w1)命中该组并分配
    const ranged = displayCues(cut, [{ ...seg, cueSubs: { '0:19': 'fragment tr' } }], {});
    expect(ranged[0]!.sub).toBe('fragment tr');
  });
});

describe('displayCues 几何驱动的 cue 尺寸(画布跟原视频,恒单行)', () => {
  it('横屏画布(1920 宽):英文整句单行 cue(~42 字符),不再 3-4 词碎块', () => {
    const en = 'The most important piece of advice I would give to founders is do not overthink it';
    const cues = displayCues(oneShot(10), [{ start: 0, end: 10, text: en, lang: 'en' }], {}, { canvasW: 1920 });
    expect(cues.length).toBeLessThanOrEqual(3);
    for (const c of cues) expect(c.words.length).toBeGreaterThanOrEqual(4);
    // 每条渲染恒单行(几何预算=盒宽,空格已入账)
    for (const b of captionBlocksFromAsr(cues)) {
      const r = renderBlock({ ...b, slots: { ...b.slots, canvasW: 1920 } }); // assemble 烘 canvasW 进 slots,测试手动补
      expect((r.innerHtml.match(/class="cap-line"/g) ?? []).length).toBe(1);
    }
  });
  it('竖屏画布(1080 宽):中文 ~11 字单行;英文短块(短视频口径)', () => {
    const zh = '这是一个非常非常长的句子它应该在铺设的时候被切成好几条独立的字幕';
    const zhCues = displayCues(oneShot(10), [{ start: 0, end: 10, text: zh, lang: 'zh' }], {}, { canvasW: 1080 });
    for (const c of zhCues) expect([...c.text].length).toBeLessThanOrEqual(13);
    for (const b of captionBlocksFromAsr(zhCues)) {
      expect((renderBlock(b).innerHtml.match(/class="cap-line"/g) ?? []).length).toBe(1);
    }
  });
});

describe('desegmentCues(提取期切 cue 短命方案的反向合并)', () => {
  it('连续 cue 段按句末标点合并回句子;非 cue 段原样透传(同引用)', () => {
    const cueSegs: AsrSegment[] = [
      { cue: true, start: 0, end: 1, text: '今天收到', words: [{ text: '今天', start: 0, end: 0.5 }, { text: '收到', start: 0.5, end: 1 }] },
      { cue: true, start: 1, end: 2, text: '了一个礼物。', words: [{ text: '了', start: 1, end: 1.2 }, { text: '一个', start: 1.2, end: 1.6 }, { text: '礼物。', start: 1.6, end: 2 }] },
      { cue: true, start: 2.5, end: 3.5, text: '这是一张纸。', words: [{ text: '这是', start: 2.5, end: 3 }, { text: '一张纸。', start: 3, end: 3.5 }] },
    ];
    const out = desegmentCues(cueSegs);
    expect(out).toHaveLength(2);
    expect(out[0]!.text).toBe('今天收到了一个礼物。');
    expect(out[0]!.words).toHaveLength(5);
    expect(out[0]!.cue).toBeUndefined();
    expect(out[1]!.text).toBe('这是一张纸。');
    const plain: AsrSegment[] = [{ start: 0, end: 2, text: '一句话。' }];
    expect(desegmentCues(plain)).toBe(plain); // 无 cue 标记 = 同一个数组引用直接返回
  });
});

describe('cue 块渲染(静态单行,不轮播)', () => {
  it('派生 cue 进块带 slots.cue/ref 与确定性 id;渲染只有一个 cap-line、flex-wrap:wrap、无第二段轮播', () => {
    const cues = displayCues(oneShot(10), [{ start: 0, end: 10, text: '这是一个非常非常长的句子它应该在铺设的时候被切成好几条独立的字幕' }], {});
    const blocks = captionBlocksFromAsr(cues);
    expect(blocks.length).toBe(cues.length);
    for (const b of blocks) {
      expect(b.slots.cue).toBe(true);
      expect(b.id.startsWith('capd_')).toBe(true);
    }
    expect(new Set(blocks.map((b) => b.id)).size).toBe(blocks.length); // 确定性 id 且互不相同
    expect(captionBlocksFromAsr(cues).map((b) => b.id)).toEqual(blocks.map((b) => b.id)); // 再派生一次 id 稳定
    const r = renderBlock(blocks[0]!);
    expect(r.innerHtml).toContain('cap-stack'); // cue = 堆叠容器(每行独立底板)
    expect(r.innerHtml).toContain('-s0');
    expect(r.innerHtml).not.toContain('-s1'); // 默认字号下 cue 恰好一行
    expect(r.timelineBody).not.toContain('autoAlpha: 0'); // 无轮播隐藏,行常显、块窗口门控
    // 大字号触发多行:行仍全部同时可见(堆叠),时间线依旧无轮播
    const big = { ...blocks[0]!, slots: { ...blocks[0]!.slots, scale: 2.4 } };
    const rb = renderBlock(big);
    expect(rb.innerHtml).toContain('-s1'); // 切出第二行
    expect(rb.innerHtml).toContain('cap-stack');
    expect(rb.timelineBody).not.toContain('autoAlpha: 0'); // 多行也不轮播
  });
  it('legacy 整句块(无 cue 标记)保持旧轮播路径:多段 + 时间线切换', () => {
    const legacy: AsrSegment[] = [{ start: 0, end: 10, text: '这是一个非常非常长的句子它应该在渲染的时候被拆成好几段轮播展示' }];
    const r = renderBlock(captionBlocksFromAsr(legacy)[0]!);
    expect(r.innerHtml).toContain('-s1'); // 仍然拆出多段
    expect(r.innerHtml).toContain('flex-wrap:nowrap');
    expect(r.timelineBody).toContain('-s1'); // 轮播 set 仍在
  });
});

describe('地基:语言/说话人/翻译标记/持久化清洗', () => {
  it('detectLang:文字系统检测(zh/en/ja/ko;混排取主导;空文本 undefined)', () => {
    expect(detectLang('今天我们聊聊剪辑的科学')).toBe('zh');
    expect(detectLang('The quick brown fox jumps over the lazy dog')).toBe('en');
    expect(detectLang('今日は動画編集の話をします')).toBe('ja');
    expect(detectLang('오늘은 영상 편집 이야기')).toBe('ko');
    expect(detectLang('...!!!')).toBeUndefined();
  });
  it('applyCaptionTranslations(共享写入器):整句 sub / 按范围 cueSubs / 删除 / subLang 标记随写随清', () => {
    const segs: AsrSegment[] = [
      { start: 0, end: 2, text: '第一句' },
      { start: 2, end: 4, text: '第二句' },
    ];
    const w1 = applyCaptionTranslations(segs, [{ index: 0, text: 'First' }], 'English');
    expect(w1[0]!.sub).toBe('First');
    expect(w1[0]!.subLang).toBe('English');
    expect(w1[1]!.subLang).toBeUndefined();
    const w2 = applyCaptionTranslations(w1, [{ index: 1, w0: 0, w1: 2, text: 'cue tr' }], 'English');
    expect(w2[1]!.cueSubs).toEqual({ '0:2': 'cue tr' });
    expect(w2[1]!.subLang).toBe('English');
    // 删除唯一译文 → subLang 一并摘掉(没有内容就没有语言)
    const w3 = applyCaptionTranslations(w2, [{ index: 0, text: '' }], 'English');
    expect(w3[0]!.sub).toBeUndefined();
    expect(w3[0]!.subLang).toBeUndefined();
    // clear 清全部
    const w4 = clearCaptionTranslations(w2);
    for (const s of w4) {
      expect(s.sub).toBeUndefined();
      expect(s.cueSubs).toBeUndefined();
      expect(s.subLang).toBeUndefined();
    }
  });
  it('sanitizeTranscriptSegs:剥掉派生标记(cue/ref/词 si);干净输入原引用直返', () => {
    const clean: AsrSegment[] = [{ start: 0, end: 2, text: '干净句子', words: [{ text: '干净', start: 0, end: 1 }], lang: 'zh' }];
    expect(sanitizeTranscriptSegs(clean)).toBe(clean);
    const dirty = [
      { start: 0, end: 2, text: '带派生标记', cue: true, ref: { src: null, seg: 0, w0: 0, w1: 1 }, words: [{ text: '带', start: 0, end: 1, si: 0 }] },
    ] as unknown as AsrSegment[];
    const out = sanitizeTranscriptSegs(dirty);
    expect(out[0]!.cue).toBeUndefined();
    expect((out[0] as unknown as Record<string, unknown>).ref).toBeUndefined();
    expect((out[0]!.words![0] as unknown as Record<string, unknown>).si).toBeUndefined();
    expect(out[0]!.text).toBe('带派生标记');
  });
  it('displayCues:换语言后的陈旧译文被隐藏;未标记语言的译文(legacy/BYO)照常显示', () => {
    const shots = oneShot(3);
    const seg: AsrSegment = { start: 0, end: 3, text: '大家好', sub: 'Hello', subLang: 'English' };
    expect(displayCues(shots, [seg], {}, { subLang: 'English' })[0]!.sub).toBe('Hello');
    expect(displayCues(shots, [seg], {}, { subLang: '日本語' })[0]!.sub).toBeUndefined(); // 目标已切日语,英文旧译不硬顶
    const unstamped: AsrSegment = { start: 0, end: 3, text: '大家好', sub: 'Hello' };
    expect(displayCues(shots, [unstamped], {}, { subLang: '日本語' })[0]!.sub).toBe('Hello'); // 未标记 = 不假设过时
  });
  it('desegmentCues:合并保留 lang/speaker(取首段)', () => {
    const out = desegmentCues([
      { cue: true, start: 0, end: 1, text: '你好', lang: 'zh', speaker: 'A', words: [{ text: '你好', start: 0, end: 1 }] },
      { cue: true, start: 1, end: 2, text: '世界。', lang: 'zh', speaker: 'A', words: [{ text: '世界。', start: 1, end: 2 }] },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.lang).toBe('zh');
    expect(out[0]!.speaker).toBe('A');
  });
});
