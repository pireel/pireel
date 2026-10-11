/**
 * A store-only ZIP archive (no compression: the media inside is already compressed), built as a
 * list of Blob parts so a package of large videos never needs one contiguous buffer. UTF-8 names
 * (general-purpose flag bit 11). Archives and entries are limited to 4 GB (no ZIP64).
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array, previous = 0): number {
  let crc = previous ^ 0xffffffff;
  for (let i = 0; i < data.length; i += 1) crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const LIMIT = 0xffffffff;
const enc = new TextEncoder();

export interface ZipEntry {
  /** Forward-slash path inside the archive. */
  path: string;
  data: Blob | Uint8Array<ArrayBuffer> | string;
}

async function crcOf(blob: Blob): Promise<number> {
  let crc = 0;
  const reader = blob.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return crc;
    crc = crc32(value, crc);
  }
}

/** DOS date/time for the entries (local time, 2-second resolution). */
function dosStamp(date: Date): { time: number; day: number } {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    day: ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

export async function zipStore(entries: readonly ZipEntry[], now = new Date()): Promise<Blob> {
  const { time, day } = dosStamp(now);
  const parts: BlobPart[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;
  for (const entry of entries) {
    const blob = entry.data instanceof Blob ? entry.data : new Blob([entry.data]);
    const size = blob.size;
    if (size > LIMIT || offset > LIMIT) throw new Error('Package is larger than 4 GB');
    const crc = await crcOf(blob);
    const name = enc.encode(entry.path);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // version needed
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, time, true);
    local.setUint16(12, day, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(local.buffer, name, blob);

    const record = new DataView(new ArrayBuffer(46));
    record.setUint32(0, 0x02014b50, true);
    record.setUint16(4, 20, true); // version made by
    record.setUint16(6, 20, true);
    record.setUint16(8, 0x0800, true);
    record.setUint16(10, 0, true);
    record.setUint16(12, time, true);
    record.setUint16(14, day, true);
    record.setUint32(16, crc, true);
    record.setUint32(20, size, true);
    record.setUint32(24, size, true);
    record.setUint16(28, name.length, true);
    record.setUint32(42, offset, true);
    const header = new Uint8Array(46 + name.length);
    header.set(new Uint8Array(record.buffer), 0);
    header.set(name, 46);
    central.push(header);
    offset += 30 + name.length + size;
  }
  const centralSize = central.reduce((sum, header) => sum + header.length, 0);
  if (offset > LIMIT) throw new Error('Package is larger than 4 GB');
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: 'application/zip' });
}
