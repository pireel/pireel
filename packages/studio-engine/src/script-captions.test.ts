import { describe, expect, it } from 'vitest';
import { planScriptCaptionSegments, splitScriptLines } from './script-captions';

describe('script captions for a silent montage', () => {
  it('splits explicit lines, or sentences when the script is one block', () => {
    expect(splitScriptLines('第一句\n\n第二句 \n第三句')).toEqual(['第一句', '第二句', '第三句']);
    expect(splitScriptLines('脖子手臂腿都要防晒。以色列IBR原料！按周期坚持？')).toEqual(['脖子手臂腿都要防晒。', '以色列IBR原料！', '按周期坚持？']);
    expect(splitScriptLines('One sentence. Another one! A third?')).toEqual(['One sentence.', 'Another one!', 'A third?']);
  });

  it('times lines proportionally across the montage and snaps each inside one shot on its source clock', () => {
    const plan = planScriptCaptionSegments(
      [
        { src: 'a', srcStart: 10, srcEnd: 14 }, // 0–4
        { src: 'b', srcStart: 2, srcEnd: 8 }, //   4–10
      ],
      ['短句', '这是一条长得多的句子占更多时间', '结尾'],
    );
    expect(plan.lineCount).toBe(3);
    const all = [...(plan.clips.a ?? []), ...(plan.clips.b ?? [])];
    expect(all).toHaveLength(3);
    // The first line is short and lands in shot a, on a's source clock (10–14).
    expect(plan.clips.a![0]).toMatchObject({ text: '短句' });
    expect(plan.clips.a![0]!.start).toBeGreaterThanOrEqual(10);
    expect(plan.clips.a![0]!.end).toBeLessThanOrEqual(14);
    // The long middle line takes most of the time and sits inside shot b (2–8), never across the cut.
    const middle = all.find((segment) => segment.text.startsWith('这是一条'))!;
    expect(middle.start).toBeGreaterThanOrEqual(2);
    expect(middle.end).toBeLessThanOrEqual(8);
    expect(middle.end - middle.start).toBeGreaterThan(2.5);
    // The last line closes at the end of the montage.
    expect(plan.clips.b![plan.clips.b!.length - 1]!.end).toBeCloseTo(8, 2);
    expect(plan.main).toEqual([]);
  });

  it('keeps a source that appears twice ordered on its own clock and routes main-video slices to main', () => {
    const plan = planScriptCaptionSegments(
      [
        { srcStart: 0, srcEnd: 3 }, // main video slice
        { src: 'a', srcStart: 5, srcEnd: 8 },
        { src: 'a', srcStart: 5, srcEnd: 8 }, // same take reused (overlapping source window)
      ],
      ['一', '二', '三'],
    );
    expect(plan.main).toHaveLength(1);
    expect(plan.clips.a).toHaveLength(2);
    expect(plan.clips.a![1]!.start).toBeGreaterThan(plan.clips.a![0]!.end);
  });

  it('never produces a sub-readable caption even for a tiny line', () => {
    const plan = planScriptCaptionSegments([{ src: 'a', srcStart: 0, srcEnd: 10 }], ['一', '一段长得多得多得多得多得多得多得多得多的句子']);
    expect(plan.clips.a![0]!.end - plan.clips.a![0]!.start).toBeGreaterThanOrEqual(0.6);
  });

  it('returns an empty plan without picture or lines', () => {
    expect(planScriptCaptionSegments([], ['x']).lineCount).toBe(0);
    expect(planScriptCaptionSegments([{ src: 'a', srcStart: 0, srcEnd: 3 }], []).lineCount).toBe(0);
  });
});
