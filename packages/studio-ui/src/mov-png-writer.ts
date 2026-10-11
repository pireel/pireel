/**
 * A QuickTime movie of PNG frames: the one transparent-video format Premiere Pro, Final Cut Pro and
 * DaVinci Resolve all read, and one the browser can write (canvas → PNG, no codec needed).
 * Used for graphics exported to other editors: each graphic becomes a full-frame clip with alpha.
 *
 * Layout: ftyp, mdat (the PNG frames back to back), moov with one video track whose sample table
 * gives every frame the same duration. 32-bit chunk offsets, so a movie stays under 4 GB.
 */

const enc = new TextEncoder();

function box(type: string, ...payload: Uint8Array[]): Uint8Array {
  const size = 8 + payload.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  view.setUint32(0, size);
  out.set(enc.encode(type), 4);
  let at = 8;
  for (const part of payload) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function u32(...values: number[]): Uint8Array {
  const out = new Uint8Array(values.length * 4);
  const view = new DataView(out.buffer);
  values.forEach((value, index) => view.setUint32(index * 4, value >>> 0));
  return out;
}

function u16(...values: number[]): Uint8Array {
  const out = new Uint8Array(values.length * 2);
  const view = new DataView(out.buffer);
  values.forEach((value, index) => view.setUint16(index * 2, value & 0xffff));
  return out;
}

const bytes = (...values: number[]) => new Uint8Array(values);
const zeros = (length: number) => new Uint8Array(length);
/** Version (1 byte) + flags (3 bytes). */
const fullBox = (version = 0, flags = 0) => u32(((version & 0xff) << 24) | (flags & 0xffffff));
/** The identity transform matrix, 16.16 / 2.30 fixed point. */
const MATRIX = u32(0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000);

export interface MovPngOptions {
  width: number;
  height: number;
  fps: number;
}

/** Build the movie from encoded PNG frames, in order. */
export function writeMovPng(frames: readonly Uint8Array[], options: MovPngOptions): Uint8Array<ArrayBuffer> {
  const { width, height } = options;
  if (!frames.length) throw new Error('A movie needs at least one frame');
  // Timescale and frame duration as integers (29.97 → 30000 / 1001).
  const nominal = Math.round(options.fps);
  const ntsc = Math.abs(options.fps - nominal) > 1e-3;
  const timescale = ntsc ? nominal * 1000 : nominal * 100;
  const frameDuration = ntsc ? 1001 : 100;
  const count = frames.length;
  const duration = count * frameDuration;

  const ftyp = box('ftyp', enc.encode('qt  '), u32(0x20050300), enc.encode('qt  '));
  const mdatPayload = frames.reduce((sum, frame) => sum + frame.length, 0);
  const mdatHeader = u32(8 + mdatPayload);
  const mdatStart = ftyp.length + 8;

  const mvhd = box('mvhd', fullBox(), u32(0, 0, timescale, duration, 0x00010000), u16(0x0100), zeros(10), MATRIX, zeros(24), u32(2));
  const tkhd = box('tkhd', fullBox(0, 0x3), u32(0, 0, 1, 0, duration), zeros(8), u16(0, 0, 0, 0), MATRIX, u32(width * 0x10000, height * 0x10000));
  const mdhd = box('mdhd', fullBox(), u32(0, 0, timescale, duration), u16(0x7fff, 0));
  const hdlr = box('hdlr', fullBox(), enc.encode('mhlr'), enc.encode('vide'), zeros(12), bytes(0));
  const vmhd = box('vmhd', fullBox(0, 1), u16(0x40, 0x8000, 0x8000, 0x8000));
  const dref = box('dref', fullBox(), u32(1), box('alis', fullBox(0, 1)));
  const dinf = box('dinf', dref);

  // Sample description: the 'png ' codec at 32-bit depth (colour + alpha).
  const compressor = new Uint8Array(32);
  const label = enc.encode('PNG');
  compressor[0] = label.length;
  compressor.set(label, 1);
  const pngEntry = box('png ',
    zeros(6), u16(1), // reserved, data reference index
    u16(0, 0), enc.encode('appl'), u32(0, 512), // version, revision, vendor, temporal, spatial quality
    u16(width, height), u32(0x00480000, 0x00480000), u32(0), u16(1), // 72 dpi, data size, frame count
    compressor, u16(32), u16(0xffff), // depth 32 = alpha, default colour table
  );
  const stsd = box('stsd', fullBox(), u32(1), pngEntry);
  const stts = box('stts', fullBox(), u32(1, count, frameDuration));
  const stsc = box('stsc', fullBox(), u32(1, 1, count, 1));
  const stsz = box('stsz', fullBox(), u32(0, count, ...frames.map((frame) => frame.length)));
  const stco = box('stco', fullBox(), u32(1, mdatStart));
  const stbl = box('stbl', stsd, stts, stsc, stsz, stco);
  const dataHandler = box('hdlr', fullBox(), enc.encode('dhlr'), enc.encode('alis'), zeros(12), bytes(0));
  const minf = box('minf', vmhd, dataHandler, dinf, stbl);
  const mdia = box('mdia', mdhd, hdlr, minf);
  const trak = box('trak', tkhd, mdia);
  const moov = box('moov', mvhd, trak);

  const out = new Uint8Array(ftyp.length + 8 + mdatPayload + moov.length);
  let at = 0;
  out.set(ftyp, at); at += ftyp.length;
  out.set(mdatHeader, at); at += 4;
  out.set(enc.encode('mdat'), at); at += 4;
  for (const frame of frames) { out.set(frame, at); at += frame.length; }
  out.set(moov, at);
  return out;
}
