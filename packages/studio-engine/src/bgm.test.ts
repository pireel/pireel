import { describe, expect, it } from 'vitest';
import {
  BGM_DEFAULT_DB,
  BGM_DUCK_DB,
  BGM_DUCK_RAMP_SEC,
  BGM_FADE_IN_SEC,
  type BgmTrack,
  bgmGainAt,
  bgmSrcTimeAt,
  duckFactorAt,
  mergeSpeechSpans,
  patchBgm,
} from './bgm';
import { dbToGain } from './composition';

const bed = (over: Partial<BgmTrack> = {}): BgmTrack => ({ src: 'blob:x', ...over });

describe('BGM 音床包络(双端同源纯函数)', () => {
  it('mergeSpeechSpans:词距 ≤1.2s 并成一个说话窗(音床不在词间抽动);乱序/空段被清理', () => {
    const spans = mergeSpeechSpans([
      { start: 5, end: 5.4 },
      { start: 0.5, end: 1.0 },
      { start: 1.8, end: 2.2 }, // 与上一段 gap 0.8 → 并
      { start: 3, end: 3 }, // 空段丢
    ]);
    expect(spans).toEqual([
      { start: 0.5, end: 2.2 },
      { start: 5, end: 5.4 },
    ]);
  });

  it('duckFactorAt:窗内=duck 增益、窗外=1、边缘线性斜坡且在开口说话前就开始压', () => {
    const spans = [{ start: 10, end: 20 }];
    const ducked = dbToGain(BGM_DUCK_DB);
    expect(duckFactorAt(15, spans)).toBeCloseTo(ducked, 5);
    expect(duckFactorAt(5, spans)).toBe(1);
    // 说话开始前半个斜坡处:已在往下压(介于两者之间)
    const pre = duckFactorAt(10 - BGM_DUCK_RAMP_SEC / 2, spans);
    expect(pre).toBeGreaterThan(ducked);
    expect(pre).toBeLessThan(1);
  });

  it('bgmGainAt:默认 -18dB 床位 + 头尾 fade + 说话时叠 duck;时间轴外=0', () => {
    const spans = [{ start: 10, end: 20 }];
    const base = dbToGain(BGM_DEFAULT_DB);
    // 中段无说话:纯床位
    expect(bgmGainAt(bed(), 30, 60, spans)).toBeCloseTo(base, 5);
    // 说话中:床位×duck
    expect(bgmGainAt(bed(), 15, 60, spans)).toBeCloseTo(base * dbToGain(BGM_DUCK_DB), 5);
    // 开头 fade-in 半程
    expect(bgmGainAt(bed(), BGM_FADE_IN_SEC / 2, 60, [])).toBeCloseTo(base / 2, 5);
    // 出界
    expect(bgmGainAt(bed(), -1, 60, [])).toBe(0);
    expect(bgmGainAt(bed(), 61, 60, [])).toBe(0);
    // duck:false 不压
    expect(bgmGainAt(bed({ duck: false }), 15, 60, spans)).toBeCloseTo(base, 5);
  });

  it('bgmSrcTimeAt:loop=模长回绕(扣掉 offset);不 loop 播完返回 null;不知时长按平移', () => {
    const b = bed({ durationSec: 30, offsetSec: 5 });
    expect(bgmSrcTimeAt(b, 10)).toBe(15);
    expect(bgmSrcTimeAt(b, 26)).toBe(6); // 5 + (26 % 25)
    const once = bed({ durationSec: 30, loop: false });
    expect(bgmSrcTimeAt(once, 10)).toBe(10);
    expect(bgmSrcTimeAt(once, 31)).toBeNull();
    expect(bgmGainAt(once, 31, 60, [])).toBe(0); // 播完的不 loop 床增益也是 0
    expect(bgmSrcTimeAt(bed(), 7)).toBe(7); // durationSec 未知
  });

  it('patchBgm:默认值摘字段(-18dB/duck on/loop on 不落库);显式偏离才存;null 语义由调用方清 bgm 字段', () => {
    const cur = bed({ sig: 's1', label: '轻快', durationSec: 30 });
    const same = patchBgm(cur, { volumeDb: BGM_DEFAULT_DB, duck: true, loop: true });
    expect(same).toEqual({ src: 'blob:x', sig: 's1', label: '轻快', durationSec: 30 });
    const changed = patchBgm(cur, { volumeDb: -24.06, duck: false });
    expect(changed.volumeDb).toBe(-24.1);
    expect(changed.duck).toBe(false);
    expect('loop' in changed).toBe(false);
  });
});
