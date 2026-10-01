import { describe, expect, it } from 'vitest';
import { crc32, zipStore } from './zip-store';

describe('zipStore', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('writes stored entries with a central directory that points back at them', async () => {
    const blob = await zipStore([
      { path: 'Pkg/README.txt', data: 'hello' },
      { path: 'Pkg/media/a.bin', data: new Uint8Array([9, 8, 7]) },
    ], new Date(2026, 9, 1, 12, 30, 10));
    const data = new Uint8Array(await blob.arrayBuffer());
    const view = new DataView(data.buffer);
    const end = data.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    const centralAt = view.getUint32(end + 16, true);
    expect(view.getUint32(centralAt, true)).toBe(0x02014b50);
    // The second entry's local header, found through the central directory, holds its bytes uncompressed.
    const secondCentral = centralAt + 46 + 'Pkg/README.txt'.length;
    const local = view.getUint32(secondCentral + 42, true);
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    expect(view.getUint16(local + 8, true)).toBe(0);
    const nameLength = view.getUint16(local + 26, true);
    expect(new TextDecoder().decode(data.subarray(local + 30, local + 30 + nameLength))).toBe('Pkg/media/a.bin');
    expect([...data.subarray(local + 30 + nameLength, local + 33 + nameLength)]).toEqual([9, 8, 7]);
    expect(view.getUint32(local + 14, true)).toBe(crc32(new Uint8Array([9, 8, 7])));
  });
});
