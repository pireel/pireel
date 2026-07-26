import { describe, expect, it } from 'vitest';
import { blendPcm, encodeWavMono } from './denoise';

describe('降噪烘焙纯件(混合与 WAV 编码)', () => {
  it('blendPcm:样本级干湿混合,strength 钳位 0..1', () => {
    const dry = new Float32Array([1, 0, -1, 0.5]);
    const wet = new Float32Array([0, 0, 0, 0]);
    expect([...blendPcm(dry, wet, 0.5)]).toEqual([0.5, 0, -0.5, 0.25]);
    expect([...blendPcm(dry, wet, 2)]).toEqual([0, 0, 0, 0]); // 钳到 1 = 全湿
    expect([...blendPcm(dry, wet, -1)]).toEqual([...dry]); // 钳到 0 = 全干
  });

  it('encodeWavMono:标准 44 字节头 + 16bit PCM,超界样本硬钳', async () => {
    const blob = encodeWavMono(new Float32Array([0, 1, -1, 2]), 48000);
    expect(blob.type).toBe('audio/wav');
    const v = new DataView(await blob.arrayBuffer());
    expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe('RIFF');
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getUint32(40, true)).toBe(8); // 4 样本 × 2 字节
    expect(v.getInt16(44, true)).toBe(0);
    expect(v.getInt16(46, true)).toBe(32767);
    expect(v.getInt16(48, true)).toBe(-32767);
    expect(v.getInt16(50, true)).toBe(32767); // 2.0 钳到 1
  });
});
