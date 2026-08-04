import { describe, expect, it } from 'vitest';
import {
  type Clip,
  deleteAtEdited,
  deleteClipById,
  editedDuration,
  editedToSrc,
  finalizeCutSeams,
  narrationGaps,
  narrationRowMarks,
  removeEditedInterval,
  removeSrcRanges,
  restoreSrcRange,
  spans,
  splitAtEdited,
  srcToEdited,
  trimLeftAtEdited,
  trimRightAtEdited,
} from './trim';

interface Shot extends Clip {
  id: string;
  treatment: string;
}
const shot = (id: string, srcStart: number, srcEnd: number, treatment = 'full'): Shot => ({ id, srcStart, srcEnd, treatment });
const makeRight = (base: Shot, srcStart: number, srcEnd: number): Shot => ({ ...base, id: `${base.id}b`, srcStart, srcEnd });

describe('映射:edited ↔ src', () => {
  // 三段:[0,4)[10,12)[20,25) → 成片时长 4+2+5=11;源中间被剪掉的不计入
  const clips: Shot[] = [shot('a', 0, 4), shot('b', 10, 12), shot('c', 20, 25)];

  it('editedDuration = Σ 源长度', () => {
    expect(editedDuration(clips)).toBe(11);
  });

  it('spans 首尾相接', () => {
    expect(spans(clips).map((s) => [s.editedStart, s.editedEnd])).toEqual([
      [0, 4],
      [4, 6],
      [6, 11],
    ]);
  });

  it('editedToSrc:成片时间落到正确片段+源时间', () => {
    expect(editedToSrc(clips, 0)).toEqual({ index: 0, src: 0 });
    expect(editedToSrc(clips, 3)).toEqual({ index: 0, src: 3 });
    expect(editedToSrc(clips, 5)).toEqual({ index: 1, src: 11 }); // 成片5 → 第二段内 1s → 源10+1=11
    expect(editedToSrc(clips, 8)).toEqual({ index: 2, src: 22 }); // 成片8 → 第三段内 2s → 源20+2=22
  });

  it('editedToSrc 夹取越界', () => {
    expect(editedToSrc(clips, -3)).toEqual({ index: 0, src: 0 });
    expect(editedToSrc(clips, 99)).toEqual({ index: 2, src: 25 });
    expect(editedToSrc([], 5)).toBeNull();
  });

  it('srcToEdited:保留区内有值,被剪区间 null', () => {
    expect(srcToEdited(clips, 3)).toBe(3);
    expect(srcToEdited(clips, 11)).toBe(5); // 源11 → 成片5
    expect(srcToEdited(clips, 22)).toBe(8);
    expect(srcToEdited(clips, 7)).toBeNull(); // 源7 在 [4,10) 被剪区间
    expect(srcToEdited(clips, 30)).toBeNull();
  });
});

describe('增:splitAtEdited', () => {
  const clips: Shot[] = [shot('a', 0, 10)];
  it('播放头处一分为二,源区间拆开,内容不变(removed=null)', () => {
    const r = splitAtEdited(clips, 4, makeRight);
    expect(r.removed).toBeNull();
    expect(r.clips.map((c) => [c.srcStart, c.srcEnd])).toEqual([
      [0, 4],
      [4, 10],
    ]);
    expect(editedDuration(r.clips)).toBe(10); // 总时长不变
    expect(r.clips[1]!.id).toBe('ab'); // 右半新 id
  });
  it('贴边不切', () => {
    expect(splitAtEdited(clips, 0.01, makeRight).clips).toHaveLength(1);
  });
});

describe('裁/删:返回被移除的成片区间', () => {
  const clips: Shot[] = [shot('a', 0, 4), shot('b', 10, 14)]; // 成片 [0,4)[4,8),总8

  it('trimLeft:剪掉所在片段左侧,removed=[段起, 播放头]', () => {
    const r = trimLeftAtEdited(clips, 5); // 第二段(成片4~8)内,播放头5
    expect(r.clips[1]!.srcStart).toBe(11); // 源10 + (5-4)=11
    expect(r.removed).toEqual([4, 5]);
    expect(editedDuration(r.clips)).toBe(7); // 8 - 1
  });

  it('trimRight:剪掉右侧,removed=[播放头, 段末]', () => {
    const r = trimRightAtEdited(clips, 2); // 第一段内
    expect(r.clips[0]!.srcEnd).toBe(2);
    expect(r.removed).toEqual([2, 4]);
    expect(editedDuration(r.clips)).toBe(6);
  });

  it('delete:移除所在片段,removed=整段成片区间;最后一段也可删除', () => {
    const r = deleteAtEdited(clips, 5);
    expect(r.clips.map((c) => c.id)).toEqual(['a']);
    expect(r.removed).toEqual([4, 8]);
    expect(deleteAtEdited([shot('a', 0, 4)], 1)).toEqual({ clips: [], removed: [0, 4] });
  });

  it('deleteClipById', () => {
    expect(deleteClipById(clips, 'a').clips.map((c) => c.id)).toEqual(['b']);
    expect(deleteClipById(clips, 'a').removed).toEqual([0, 4]);
    expect(deleteClipById([shot('only', 3, 7)], 'only')).toEqual({ clips: [], removed: [0, 4] });
  });
});

describe('块压缩:removeEditedInterval', () => {
  const mk = (startSec: number, durationSec: number, id = '') => ({ id, startSec, durationSec });

  it('之前不动 / 之后左移 / 落区间内丢弃', () => {
    const blocks = [mk(0, 1, 'before'), mk(5, 1, 'inside'), mk(8, 2, 'after')];
    const out = removeEditedInterval(blocks, 4, 7); // 抹掉 [4,7),gap=3
    expect(out.map((b) => b.id)).toEqual(['before', 'after']); // inside 丢
    expect(out.find((b) => b.id === 'before')!.startSec).toBe(0);
    expect(out.find((b) => b.id === 'after')!.startSec).toBe(5); // 8-3
  });

  it('跨左边界:切掉重叠,保留前段', () => {
    const out = removeEditedInterval([mk(2, 4, 'x')], 4, 7); // 块[2,6) 跨入 [4,7)
    const x = out.find((b) => b.id === 'x')!;
    expect(x.startSec).toBe(2);
    expect(x.durationSec).toBeCloseTo(2); // 保留 [2,4)
  });

  it('跨右边界:保留后段并左移到删点', () => {
    const out = removeEditedInterval([mk(5, 4, 'y')], 4, 7); // 块[5,9) 起点在被删区内
    const y = out.find((b) => b.id === 'y')!;
    expect(y.startSec).toBe(4); // 压缩到删点
    expect(y.durationSec).toBeCloseTo(2); // 保留 [7,9)
  });
});

import { removeEditedRange } from './trim';

describe('removeEditedRange(删成片区间,可跨片段)', () => {
  const mk = (base: Clip, srcStart: number, srcEnd: number): Clip => ({ ...base, srcStart, srcEnd });

  it('单片段中段:拆成左右两半', () => {
    const r = removeEditedRange<Clip>([{ srcStart: 0, srcEnd: 10 }], 3, 7, mk);
    expect(r.removed).toEqual([3, 7]);
    expect(r.clips).toEqual([
      { srcStart: 0, srcEnd: 3 },
      { srcStart: 7, srcEnd: 10 },
    ]);
  });

  it('跨多片段:中间整段删掉,两端裁剪', () => {
    // 成片 [0,4)+[4,8)+[8,12),删 [2,10) → 左半(源 0..2) + 右半(源 22..24)
    const clips: Clip[] = [
      { srcStart: 0, srcEnd: 4 },
      { srcStart: 10, srcEnd: 14 },
      { srcStart: 20, srcEnd: 24 },
    ];
    const r = removeEditedRange(clips, 2, 10, mk);
    expect(r.removed).toEqual([2, 10]);
    expect(r.clips).toEqual([
      { srcStart: 0, srcEnd: 2 },
      { srcStart: 22, srcEnd: 24 },
    ]);
  });

  it('区间越界夹取;全删产生合法空轨', () => {
    const clips: Clip[] = [{ srcStart: 0, srcEnd: 5 }];
    expect(removeEditedRange(clips, -3, 99, mk)).toEqual({ clips: [], removed: [0, 5] });
    const r = removeEditedRange(clips, 4, 99, mk); // 尾部夹取
    expect(r.removed).toEqual([4, 5]);
    expect(r.clips).toEqual([{ srcStart: 0, srcEnd: 4 }]);
  });

  it('零长/反向区间不动', () => {
    expect(removeEditedRange<Clip>([{ srcStart: 0, srcEnd: 5 }], 2, 2, mk).removed).toBeNull();
  });
});

describe('removeSrcRanges(口播稿驱动:删一批源时间区间)', () => {
  it('源区间跨越"已被剪开"的两个 clip → 两段都删干净', () => {
    // 源 [0,10) 已剪成 [0,4)+[6,10)(中间 4..6 早删了);再删源 [3,8):
    // 命中 clip1 的 [3,4) 和 clip2 的 [6,8) → 剩 [0,3)+[8,10),成片 5s
    const clips: Shot[] = [shot('a', 0, 4), shot('b', 6, 10)];
    const r = removeSrcRanges(clips, [[3, 8]], makeRight);
    expect(r.clips.map((c) => [c.srcStart, c.srcEnd])).toEqual([
      [0, 3],
      [8, 10],
    ]);
    expect(editedDuration(r.clips)).toBeCloseTo(5);
    expect(r.removed.length).toBe(2);
  });

  it('多个源区间乱序给:结果与顺序无关,removed 按发生顺序可依次压块', () => {
    const clips: Shot[] = [shot('a', 0, 10)];
    // 删 [7,8) 和 [2,3)(乱序):剩 0-2,3-7,8-10 = 8s
    const r = removeSrcRanges(clips, [[7, 8], [2, 3]], makeRight);
    expect(editedDuration(r.clips)).toBeCloseTo(8);
    expect(r.clips.map((c) => [c.srcStart, c.srcEnd])).toEqual([
      [0, 2],
      [3, 7],
      [8, 10],
    ]);
    // removed 是"删那一刀之前"的成片坐标:先删 [7,8),再删 [2,3)(此时坐标未受第一刀影响,因为在它前面)
    expect(r.removed).toEqual([
      [7, 8],
      [2, 3],
    ]);
  });

  it('已经不在片子里的源区间 = no-op', () => {
    const clips: Shot[] = [shot('a', 5, 10)];
    const r = removeSrcRanges(clips, [[0, 4.9]], makeRight);
    expect(r.removed).toHaveLength(0);
    expect(r.clips).toBe(clips);
  });
});

describe('restoreSrcRange(恢复已删的源区间)', () => {
  const make = (a: number, b: number): Shot => shot('new', a, b);

  it('缺口贴着前一段 → 并回去(srcEnd 外扩),不产生新镜', () => {
    // 源 [3,5) 被删:[0,3)+[5,10);恢复 [3,5) → 并进前段成 [0,5)+[5,10)
    const clips: Shot[] = [shot('a', 0, 3), shot('b', 5, 10)];
    const out = restoreSrcRange(clips, 3, 5, make);
    expect(out.map((c) => [c.srcStart, c.srcEnd])).toEqual([
      [0, 5],
      [5, 10],
    ]);
    expect(out[0]!.id).toBe('a');
  });

  it('两头都不贴(独立缺口)→ 按 srcStart 插新镜', () => {
    const clips: Shot[] = [shot('a', 0, 2), shot('b', 8, 10)];
    const out = restoreSrcRange(clips, 4, 6, make);
    expect(out.map((c) => [c.srcStart, c.srcEnd])).toEqual([
      [0, 2],
      [4, 6],
      [8, 10],
    ]);
    expect(out[1]!.id).toBe('new');
  });

  it('区间部分已在片子里 → 只恢复缺口部分;全在 = 原样返回', () => {
    const clips: Shot[] = [shot('a', 0, 4), shot('b', 6, 10)];
    const out = restoreSrcRange(clips, 2, 8, make); // 缺口只有 [4,6)
    expect(editedDuration(out)).toBeCloseTo(10);
    expect(restoreSrcRange(clips, 1, 3, make)).toBe(clips);
  });

  it('canMerge 拦住的镜不外扩(带 partner 的镜),走插新镜', () => {
    const clips: Shot[] = [{ ...shot('a', 0, 3), treatment: 'split-l' }, shot('b', 5, 10)];
    const out = restoreSrcRange(clips, 3, 5, make, (c) => c.treatment === 'full');
    // a 不许并(canMerge false),b 的 srcStart 贴 5?缺口 [3,5) 的右端贴 b → b 外扩
    expect(out.map((c) => [c.srcStart, c.srcEnd])).toEqual([
      [0, 3],
      [3, 10],
    ]);
  });
});

import { srcToEditedLoose } from './trim';

describe('多源主轨:源域运算只匹配本源(inSource 谓词)', () => {
  interface MShot extends Clip {
    id: string;
    treatment: string;
    src?: string;
  }
  const m = (id: string, a: number, b: number): MShot => ({ id, srcStart: a, srcEnd: b, treatment: 'full' });
  const clip = (id: string, a: number, b: number): MShot => ({ id, srcStart: a, srcEnd: b, treatment: 'full', src: 'blob:clip' });
  const inMain = (c: MShot) => !c.src;
  const mkR = (base: MShot, a: number, b: number): MShot => ({ ...base, id: `${base.id}b`, srcStart: a, srcEnd: b });
  // 主轨:[口播 0-2][插入段 0-4(它自己的时间轴!)][口播 2-4] → 成片 0-2 / 2-6 / 6-8
  const mixed = (): MShot[] => [m('a', 0, 2), clip('x', 0, 4), m('b', 2, 4)];

  it('srcToEditedLoose:口播源时间越过插入段窗口映射,不撞插入段的数值区间', () => {
    expect(srcToEditedLoose(mixed(), 1, inMain)).toBeCloseTo(1);
    expect(srcToEditedLoose(mixed(), 2.5, inMain)).toBeCloseTo(6.5); // 不带谓词会错落进插入段(2.5<4)
    expect(srcToEditedLoose(mixed(), 99, inMain)).toBeCloseTo(8);
  });

  it('srcToEdited:同口径', () => {
    expect(srcToEdited(mixed(), 3, inMain)).toBeCloseTo(7);
    expect(srcToEdited(mixed(), 5, inMain)).toBeNull();
  });

  it('removeSrcRanges:删口播源区间不误伤插入段', () => {
    const r = removeSrcRanges(mixed(), [[1, 3]], mkR, inMain);
    const x = r.clips.find((c) => c.src);
    expect(x).toBeTruthy();
    expect([x!.srcStart, x!.srcEnd]).toEqual([0, 4]); // 插入段原封不动
    expect(editedDuration(r.clips)).toBeCloseTo(6); // 8 - 删掉的 2s 口播
    expect(r.clips.filter((c) => !c.src).map((c) => [c.srcStart, c.srcEnd])).toEqual([
      [0, 1],
      [3, 4],
    ]);
  });

  it('restoreSrcRange:恢复口播缺口,插入段锚在原前驱之后', () => {
    const cut: MShot[] = [m('a', 0, 1), clip('x', 0, 4), m('b', 3, 4)];
    const out = restoreSrcRange(cut, 1, 3, (a, b) => m('new', a, b), () => true, inMain);
    // a 外扩到 [0,3](缺口贴 a 的末端),插入段仍紧跟 a 之后
    expect(out.map((c) => c.id)).toEqual(['a', 'x', 'b']);
    expect(out[0]!.srcEnd).toBeCloseTo(3);
    expect(editedDuration(out)).toBeCloseTo(8); // 6 + 恢复的 2s 口播
  });

  it('restoreSrcRange:片头的插入段保持在片头', () => {
    const cut: MShot[] = [clip('x', 0, 4), m('a', 2, 4)];
    const out = restoreSrcRange(cut, 0, 2, (a, b) => m('new', a, b), () => true, inMain);
    expect(out[0]!.id).toBe('x');
    expect(out.filter((c) => !c.src).map((c) => [c.srcStart, c.srcEnd])).toEqual([[0, 4]]);
  });

  it('restoreSrcRange:两个插入段分属不同前驱,恢复后各归各的前驱(不被甩到片尾)', () => {
    // 主 [0,1)·插入X·主 [3,4)·插入Y;删的口播缺口 [1,3) 贴 a 末端,a 合并外扩(srcStart 不变)
    const cut: MShot[] = [m('a', 0, 1), clip('x', 0, 4), m('b', 3, 4), clip('y', 0, 5)];
    const out = restoreSrcRange(cut, 1, 3, (a, b) => m('new', a, b), () => true, inMain);
    expect(out.map((c) => c.id)).toEqual(['a', 'x', 'b', 'y']); // 顺序不乱,y 没跳到别处
    expect(out[0]!.srcStart).toBeCloseTo(0); // 前驱合并只改 srcEnd,srcStart 稳 → 锚点仍命中
    expect(out[0]!.srcEnd).toBeCloseTo(3);
  });

  it('restoreSrcRange:恢复插入独立新镜时,插入段仍锚在原前驱之后(新镜不抢锚、外源不孤儿)', () => {
    // 主 [0,2)·插入X·主 [8,10);恢复源缺口 [4,6) 两头都不贴 → 插新镜;X 的前驱是 a(srcStart 0)
    const cut: MShot[] = [m('a', 0, 2), clip('x', 0, 3), m('b', 8, 10)];
    const out = restoreSrcRange(cut, 4, 6, (a, b) => m('new', a, b), () => true, inMain);
    const ids = out.map((c) => c.id);
    expect(ids.indexOf('x')).toBe(ids.indexOf('a') + 1); // X 紧跟 a,没被甩尾
    expect(ids).toContain('new'); // 新镜插进主源序列
    expect(ids[ids.length - 1]).not.toBe('x'); // 兜底"挂末尾"分支没被误触发
  });

  it('restoreSrcRange:缺口贴后继(next-merge 压低前驱 srcStart)时,插入段仍锚在原前驱之后', () => {
    // 主 [5,10)·插入X·主 [20,25);恢复 [2,5) 贴 a 的开头 → a.srcStart 5→2,锚点值变了,靠区间包含仍命中
    const cut: MShot[] = [m('a', 5, 10), clip('x', 0, 4), m('b', 20, 25)];
    const out = restoreSrcRange(cut, 2, 5, (a, b) => m('new', a, b), () => true, inMain);
    expect(out.map((c) => c.id)).toEqual(['a', 'x', 'b']); // X 不被甩到片尾
    expect(out[0]!.srcStart).toBeCloseTo(2);
    expect(out[0]!.srcEnd).toBeCloseTo(10);
  });
});

describe('finalizeCutSeams(多段剪切的缝位回执)', () => {
  // 剪口播回执要说"最终时间轴"的话:多段从后往前删,每段记录的是它删除当刻的位置,
  // 之后应用的更早剪切会把它左移——不换算,chat 列表点击定位就会落在错的地方。
  it('后段缝位左移 = 减去时间轴上更早剪掉的总长', () => {
    // 处理顺序(降序):先删 [20,22),再删 [5,7.5) → 20s 处的缝最终在 20-2.5=17.5
    const out = finalizeCutSeams([
      { at: 20, len: 2 },
      { at: 5, len: 2.5, text: '嗯这个' },
    ]);
    expect(out).toEqual([
      { atSec: 5, removedSec: 2.5, text: '嗯这个' },
      { atSec: 17.5, removedSec: 2 },
    ]);
  });

  it('单段不位移,秒数四舍五入到 0.1', () => {
    expect(finalizeCutSeams([{ at: 3.14159, len: 0.87 }])).toEqual([{ atSec: 3.1, removedSec: 0.9 }]);
  });
});

describe('narrationRowMarks(read_script 的现状标注)', () => {
  // agent 之眼必须读现状:剪完再读若仍是原始源表,agent 会盲发同一批 ranges、
  // 汇报编辑器对不上的数字(真机事故)。行保稳定源时间戳,标注携带编辑状态。
  const segs = [
    { start: 0, end: 9 },     // 存活
    { start: 11.7, end: 12.4 }, // 句0→1 间隙 2.7s
    { start: 15.1, end: 15.9 }, // 句1→2 间隙 2.7s
  ];
  const pred = (c: { src?: string }) => !c.src;

  it('未剪:无前缀,≥0.8s 的句间隙标原始时长', () => {
    const shots = [{ srcStart: 0, srcEnd: 20 }];
    const m = narrationRowMarks(segs, shots, pred as never);
    expect(m.rows[0]).toEqual({ prefix: '', gapNote: ' (+2.7s gap after)' });
    expect(m.rows[2]!.gapNote).toBe(''); // 尾行无后隙(时长未知,不产 tail)
    expect(m.tail).toBe('');
  });

  it('收紧过的间隙标 CUT + 留白量;整句剪光标 REMOVED;部分剪标 kept', () => {
    // 剪掉 [9.2,11.5](两头各留 0.2s)+ 整删句2 + 句0 尾巴删 2s
    const shots = [
      { srcStart: 0, srcEnd: 7 },
      { srcStart: 9, srcEnd: 9.2 },
      { srcStart: 11.5, srcEnd: 15.1 },
    ];
    const m = narrationRowMarks(segs, shots, pred as never);
    expect(m.rows[0]!.prefix).toBe('[partly cut, 7s kept] ');
    expect(m.rows[0]!.gapNote).toBe(' (+2.7s gap after — CUT, 0.4s kept)');
    expect(m.rows[2]!.prefix).toBe('[REMOVED] ');
  });

  it('空 shots(处女时间轴)= 间隙位置照标(无剪切状态),句子不标死', () => {
    const m = narrationRowMarks(segs, [], pred as never);
    expect(m.rows.every((x) => x.prefix === '')).toBe(true); // 不许把没剪过的句子标成 REMOVED
    expect(m.rows[0]!.gapNote).toBe(' (+2.7s gap after)'); // 停顿盘点在剪之前就可用
  });

  it('句内停顿(词级时间戳)标注精确源区间,可与句后间隙并列;收紧后翻 CUT', () => {
    // 真机事故:模型称句内停顿 cut_narration 处理不了、要用 cut_range 瞎摸——根因是句级
    // 时间戳定位不了句中,读稿必须把词间 ≥0.8s 的停顿连同 a–b 源区间一起交出去。
    const withWords = [
      { start: 35.6, end: 45.1, words: [
        { start: 35.6, end: 37.9 },  // “还有一个包包”
        { start: 39.5, end: 45.1 },  // “一个水杯…” — 中间停 1.6s
      ] },
      { start: 47.4, end: 52 },      // 句后间隙 2.3s
    ];
    const virgin = narrationRowMarks(withWords, [], pred as never);
    expect(virgin.rows[0]!.gapNote).toBe(' (1.6s pause inside at 37.9–39.5s; +2.3s gap after)');
    // 收紧句内停顿(两头各留 0.2s)后:句内翻 CUT,句子整体标部分剪
    const shots = [
      { srcStart: 35.6, srcEnd: 38.1 },
      { srcStart: 39.3, srcEnd: 52 },
    ];
    const cut = narrationRowMarks(withWords, shots, pred as never);
    expect(cut.rows[0]!.gapNote).toBe(' (1.6s pause inside at 37.9–39.5s — CUT, 0.4s kept; +2.3s gap after)');
  });

  it('头尾死气独立成行:头=0→首句,尾要有片长才产;与面板同一份盘点(narrationGaps)', () => {
    // 指南让 agent 第一件事查 pre/post-roll,但此前标注只有句间/句内——看得见所有间隙,
    // 唯独看不见指南点名的那两处。头尾走同一 CUT 语义。
    const late = [{ start: 2.1, end: 9 }, { start: 11.7, end: 12.4 }];
    const m = narrationRowMarks(late, [], pred as never, 15);
    expect(m.head).toBe('(+2.1s dead air at the head, 0–2.1s)');
    expect(m.tail).toBe('(+2.6s dead air at the tail, 12.4–15s)');
    const g = narrationGaps(late, 15);
    expect(g.filter((x) => x.edge).length).toBe(2); // 面板消费的同一枚举
    const cutHead = narrationRowMarks(late, [{ srcStart: 2, srcEnd: 15 }], pred as never, 15);
    expect(cutHead.head).toBe('(+2.1s dead air at the head, 0–2.1s — CUT, 0.1s kept)');
  });
});
