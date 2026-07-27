import { describe, expect, it } from 'vitest';
import {
  AUDIO_DEFAULT_DB,
  AUDIO_FADE_IN_SEC,
  AUDIO_MIN_LEN_SEC,
  type AudioClip,
  audioClipDefaults,
  audioClipGainAt,
  audioClipSrcTimeAt,
  audioClipWindow,
  audioTrimPatch,
  splitAudioClipAt,
  patchAudioClip,
} from './audio-tracks';
import { dbToGain, fadeShape } from './composition';

const clip = (over: Partial<AudioClip> = {}): AudioClip => ({ id: 'a1', src: 'blob:x', ...over });

describe('音轨片段(多轨 NLE 语义:无循环/无 duck,位置+淡入淡出+变速)', () => {
  it('窗口=起点+曲长/速度,一遍播完不循环;起点前后增益 0、源时间 null', () => {
    const c = clip({ startSec: 10, durationSec: 30 });
    expect(audioClipWindow(c, 120)).toEqual({ start: 10, end: 40 });
    expect(audioClipGainAt(c, 5, 120)).toBe(0);
    expect(audioClipSrcTimeAt(c, 5)).toBeNull();
    expect(audioClipSrcTimeAt(c, 15)).toBe(5);
    expect(audioClipSrcTimeAt(c, 41)).toBeNull(); // 播完即止
    expect(audioClipGainAt(c, 41, 120)).toBe(0);
  });

  it('变速:窗口按速度缩放,timeline→source 映射乘 speed', () => {
    const c = clip({ startSec: 10, durationSec: 30, speed: 2 });
    expect(audioClipWindow(c, 120)).toEqual({ start: 10, end: 25 }); // 30s 素材 2x = 15s
    expect(audioClipSrcTimeAt(c, 20)).toBe(20); // (20-10)*2
    const slow = clip({ durationSec: 10, speed: 0.5 });
    expect(audioClipWindow(slow, 120)).toEqual({ start: 0, end: 20 });
    expect(audioClipSrcTimeAt(slow, 10)).toBe(5);
  });

  it('增益:默认 -18dB 档位,淡入以窗口起点为原点、淡出贴窗口末尾', () => {
    const c = clip({ startSec: 10, durationSec: 30, fadeOutSec: 2 });
    const base = dbToGain(AUDIO_DEFAULT_DB);
    expect(audioClipGainAt(c, 10 + AUDIO_FADE_IN_SEC / 2, 120)).toBeCloseTo(base / 2, 5);
    expect(audioClipGainAt(c, 20, 120)).toBeCloseTo(base, 5);
    expect(audioClipGainAt(c, 39, 120)).toBeCloseTo(base / 2, 5); // 窗口尾 40,淡出 2s → 39 处一半
  });

  it('audioTrimPatch:左把手连 in 点一起走(尾巴不动)、右把手改 out 点;都夹在素材边界与最短长度内', () => {
    const c = clip({ startSec: 10, durationSec: 30 }); // 时间轴 10→40
    // 左把手右移 5s:起点 15,in 点 5(尾巴仍在 40)
    expect(audioTrimPatch(c, 'left', 15)).toMatchObject({ startSec: 15, inSec: 5 });
    // 左把手左拖超出素材头:in 已是 0,顶到 10 不能再往左
    expect(audioTrimPatch(c, 'left', 2).startSec).toBe(10);
    // 右把手左移到 25:out 点 15
    expect(audioTrimPatch(c, 'right', 25)).toMatchObject({ outSec: 15 });
    // 右把手右拖超出素材尾:顶到 40
    expect(audioTrimPatch(c, 'right', 99).outSec).toBe(30);
    // 最短长度守住
    expect(audioTrimPatch(c, 'right', 10).outSec).toBeCloseTo(AUDIO_MIN_LEN_SEC, 5);
    // 变速下,时间轴位移换算回源秒要乘速度
    const fast = clip({ startSec: 10, durationSec: 30, speed: 2 });
    expect(audioTrimPatch(fast, 'left', 12)).toMatchObject({ startSec: 12, inSec: 4 });
  });

  it('剪过的片段:窗口=(out−in)/速度,源时间从 in 起、到 out 止', () => {
    const c = clip({ startSec: 10, durationSec: 30, inSec: 5, outSec: 20 });
    expect(audioClipWindow(c, 120)).toEqual({ start: 10, end: 25 });
    expect(audioClipSrcTimeAt(c, 10)).toBe(5);
    expect(audioClipSrcTimeAt(c, 24.9)).toBeCloseTo(19.9, 5);
    expect(audioClipSrcTimeAt(c, 25)).toBeNull(); // out 点即止
    expect(audioClipGainAt(c, 26, 120)).toBe(0);
  });

  it('淡化=smoothstep 平滑曲线(时间轴画的就是这条增益曲线),两端相切于 0/1、中点仍是一半', () => {
    const c = clip({ startSec: 0, durationSec: 30, fadeInSec: 2, fadeOutSec: 2 });
    const base = dbToGain(AUDIO_DEFAULT_DB);
    expect(fadeShape(0)).toBe(0);
    expect(fadeShape(1)).toBe(1);
    expect(fadeShape(0.5)).toBe(0.5);
    // 平滑:1/4 处比线性更低(缓入),3/4 处比线性更高(缓出)
    expect(fadeShape(0.25)).toBeLessThan(0.25);
    expect(fadeShape(0.75)).toBeGreaterThan(0.75);
    expect(audioClipGainAt(c, 1, 60)).toBeCloseTo(base * 0.5, 5);
    expect(audioClipGainAt(c, 0.5, 60)).toBeCloseTo(base * fadeShape(0.25), 5);
    expect(audioClipGainAt(c, 29, 60)).toBeCloseTo(base * 0.5, 5); // 尾端对称
  });

  it('淡入淡出永不重叠:淡入吃片段长度、淡出吃剩下的;拉长片段后存的值原样恢复', () => {
    // 2s 的短片段 + 默认 0.8/1.5 → 相加 2.3s 会叠在一起
    const short = clip({ durationSec: 2 });
    const ds = audioClipDefaults(short);
    expect(ds.fadeInSec).toBe(0.8);
    expect(ds.fadeOutSec).toBeCloseTo(1.2, 5); // 2 − 0.8
    expect(ds.fadeInSec + ds.fadeOutSec).toBeCloseTo(2, 5);
    // 存的值没被改写:片段变长(或剪短的 out 点还原)后照旧
    expect(audioClipDefaults(clip({ durationSec: 30 })).fadeOutSec).toBe(1.5);
    // 变速缩短时间轴长度时同样夹紧
    expect(audioClipDefaults(clip({ durationSec: 2, speed: 2 })).fadeInSec).toBe(0.8); // span 1s… 淡入先吃
    const fast = audioClipDefaults(clip({ durationSec: 2, speed: 2, fadeInSec: 5 }));
    expect(fast.fadeInSec).toBe(1);
    expect(fast.fadeOutSec).toBe(0);
  });

  it('左端裁剪后音频不会在片段内滑动:起点与入点同一精度落库(0.01)', () => {
    const c = clip({ startSec: 10, durationSec: 30 });
    const p = audioTrimPatch(c, 'left', 15.037);
    const saved = patchAudioClip(c, p);
    // 落库后 起点位移 与 入点前进 必须相等(差值即为音频在片段内的滑动量)
    const moved = (saved.startSec ?? 0) - 10;
    const consumed = saved.inSec ?? 0;
    expect(Math.abs(moved - consumed)).toBeLessThan(0.011);
  });

  it('splitAudioClipAt:切点变成前半的出点/后半的入点,时间轴上纹丝不动;内侧淡化归零;太靠边不切', () => {
    const c = clip({ startSec: 10, durationSec: 30 });
    const r = splitAudioClipAt(c, 20, () => 'a2')!;
    expect(r).toBeTruthy();
    const [head, tail] = r;
    expect(head.outSec).toBe(10); // (20−10)×1 源秒
    expect(tail.id).toBe('a2');
    expect(tail.startSec).toBe(20);
    expect(tail.inSec).toBe(10);
    expect(tail.outSec).toBeUndefined(); // 到素材尾 = 不落字段
    // 两半接起来仍覆盖原窗口,中间没有空隙
    expect(audioClipWindow(head, 120)).toEqual({ start: 10, end: 20 });
    expect(audioClipWindow(tail, 120)).toEqual({ start: 20, end: 40 });
    // 切口两侧不该有淡化
    expect(head.fadeOutSec).toBe(0);
    expect(tail.fadeInSec).toBe(0);
    expect(audioClipDefaults(head).fadeInSec).toBe(0.8); // 外侧淡化保留
    // 贴边不切
    expect(splitAudioClipAt(c, 10.05, () => 'x')).toBeNull();
    expect(splitAudioClipAt(c, 39.95, () => 'x')).toBeNull();
  });

  it('patchAudioClip:默认值摘字段(-18dB/淡入0.8/淡出1.5/speed 1 不落库),钳位后仍等默认也摘', () => {
    const c = clip({ sig: 's', label: '轻快', durationSec: 30 });
    const same = patchAudioClip(c, { volumeDb: AUDIO_DEFAULT_DB, speed: 1, fadeInSec: AUDIO_FADE_IN_SEC });
    expect(same).toEqual({ id: 'a1', src: 'blob:x', sig: 's', label: '轻快', durationSec: 30 });
    const changed = patchAudioClip(c, { volumeDb: -24.04, speed: 1.256, fadeOutSec: 3, startSec: 12.34 });
    expect(changed.volumeDb).toBe(-24);
    expect(changed.speed).toBe(1.26);
    expect(changed.fadeOutSec).toBe(3);
    expect(changed.startSec).toBe(12.34); // 0.01 精度:与 in/out 同口径,左端裁剪才不会让音频在片段内滑动
    const clamped = patchAudioClip(c, { speed: 9 });
    expect(clamped.speed).toBe(2);
  });
});
