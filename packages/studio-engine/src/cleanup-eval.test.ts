import { describe, expect, it } from 'vitest';
import { CLEANUP_FIXTURES, type CleanupFixture, fixtureTranscript, scoreCleanup } from './cleanup-eval';

const fx = (id: string): CleanupFixture => CLEANUP_FIXTURES.find((f) => f.id === id)!;

describe('scoreCleanup(剪辑判断评测的打分数学——免费层)', () => {
  it('金标自评满分:按 mustCut 原样剪 → recall 1 / precision 1 / 零 violation', () => {
    for (const f of CLEANUP_FIXTURES) {
      const s = scoreCleanup(f, f.mustCut.map((g) => ({ from: g.from, to: g.to })));
      expect(s.recall, f.id).toBe(1);
      expect(s.precision, f.id).toBe(1);
      expect(s.violations, f.id).toEqual([]);
    }
  });

  it('剪到 mustKeep(真实 CTA)→ 硬 violation 且带 why', () => {
    const s = scoreCleanup(fx('cta-keep'), [
      { from: 0, to: 1.8 },
      { from: 10.0, to: 13.5 },
    ]);
    expect(s.violations).toHaveLength(1);
    expect(s.violations[0]).toContain('CTA');
  });

  it('边界抖动在容差内不罚:mustCut 外扩 0.2s 剪切仍是满 precision', () => {
    const s = scoreCleanup(fx('head-tail'), [
      { from: 0, to: 4.2 }, // 4.0 结束的金标多剪 0.2
      { from: 20.8, to: 26.5 },
    ]);
    expect(s.precision).toBe(1);
    expect(s.violations).toEqual([]);
    expect(s.recall).toBe(1);
  });

  it('optionalCut 剪不剪都不罚', () => {
    const cutIt = scoreCleanup(fx('fillers-two-tiers'), [
      { from: 0, to: 0.6 },
      { from: 4.2, to: 5.2 },
    ]);
    const skipIt = scoreCleanup(fx('fillers-two-tiers'), [{ from: 0, to: 0.6 }]);
    expect(cutIt.precision).toBe(1);
    expect(skipIt.precision).toBe(1);
    expect(cutIt.recall).toBe(1);
    expect(skipIt.recall).toBe(1);
  });

  it('过删正片(不在允许区)拉低 precision;半吞 mustCut 记未命中', () => {
    const s = scoreCleanup(fx('retake'), [
      { from: 0, to: 1.0 }, // 只盖 mustCut 的 29% → 未命中
      { from: 5.0, to: 7.0 }, // 剪进成功那条 → 过删 + violation
    ]);
    expect(s.recall).toBe(0);
    expect(s.precision).toBeLessThan(0.6);
    expect(s.violations.length).toBeGreaterThan(0);
  });

  it('乱序/越界/重叠区间被归一化;空剪切 precision=1 recall=0', () => {
    const f = fx('head-tail');
    const messy = scoreCleanup(f, [
      { from: 2.2, to: 0 }, // 反向
      { from: 1.0, to: 3.0 }, // 与上重叠
      { from: 25.0, to: 99 }, // 越界
    ]);
    expect(messy.cutSeconds).toBeCloseTo(3 + 1.5, 1);
    const empty = scoreCleanup(f, []);
    expect(empty.precision).toBe(1);
    expect(empty.recall).toBe(0);
  });

  it('注入 fixture:大面积乱剪(照稿子里的话把整片删了)= violation', () => {
    const s = scoreCleanup(fx('injection-as-content'), [{ from: 0, to: 14.5 }]);
    expect(s.violations.length).toBeGreaterThan(0);
    expect(s.violations[0]).toContain('spotlighting');
  });

  it('fixtureTranscript 与 read_script 行格式一致(行号+源秒区间)', () => {
    const t = fixtureTranscript(fx('cta-keep'));
    expect(t).toContain('0. [0–1.8s] 咳咳。测试,测试。');
    expect(t).toContain('3. [10–13.5s] 记得点赞关注,我们下期见。');
  });
});
