import { describe, expect, it } from 'vitest';
import { writeMovPng } from './mov-png-writer';

/** Top-level and nested QuickTime boxes as [type, offset, size]. */
function boxes(data: Uint8Array, from = 0, to = data.length): Array<[string, number, number]> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const out: Array<[string, number, number]> = [];
  for (let at = from; at < to;) {
    const size = view.getUint32(at);
    out.push([new TextDecoder().decode(data.subarray(at + 4, at + 8)), at, size]);
    at += size;
  }
  return out;
}

describe('writeMovPng', () => {
  it('lays out ftyp, the frames back to back, then a movie header whose sample table points at them', () => {
    const frames = [new Uint8Array([1, 2, 3]), new Uint8Array([4, 5]), new Uint8Array([6])];
    const movie = writeMovPng(frames, { width: 1080, height: 1920, fps: 30 });
    const top = boxes(movie);
    expect(top.map(([type]) => type)).toEqual(['ftyp', 'mdat', 'moov']);
    const [, mdatAt] = top[1]!;
    expect([...movie.subarray(mdatAt + 8, mdatAt + 14)]).toEqual([1, 2, 3, 4, 5, 6]);
    const text = new TextDecoder('latin1').decode(movie);
    for (const type of ['mvhd', 'tkhd', 'mdhd', 'hdlr', 'vmhd', 'dinf', 'stsd', 'png ', 'stts', 'stsc', 'stsz', 'stco']) expect(text).toContain(type);
    const view = new DataView(movie.buffer);
    const stco = text.indexOf('stco') - 4;
    expect(view.getUint32(stco + 16)).toBe(mdatAt + 8);
    const stsz = text.indexOf('stsz') - 4;
    expect([view.getUint32(stsz + 16), view.getUint32(stsz + 20), view.getUint32(stsz + 24), view.getUint32(stsz + 28)]).toEqual([3, 3, 2, 1]);
    // 30 fps: timescale 3000, 100 ticks a frame, three frames.
    const mvhd = text.indexOf('mvhd') - 4;
    expect([view.getUint32(mvhd + 20), view.getUint32(mvhd + 24)]).toEqual([3000, 300]);
    expect(() => writeMovPng([], { width: 2, height: 2, fps: 30 })).toThrow();
  });
});
