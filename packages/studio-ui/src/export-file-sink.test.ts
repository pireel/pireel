import { describe, expect, it } from 'vitest';
import { BufferTarget } from 'mediabunny';
import {
  exportAudioPacketLimit, exportFileReadable, exportSavedToChosenFile, exportVideoPacketLimit, openExportFileSink, releaseExportFile,
} from './export-file-sink';

describe('export file sink', () => {
  it('assembles the file in memory where the browser has no writable file storage', async () => {
    const sink = await openExportFileSink({ mime: 'video/mp4', extension: 'mp4' });
    expect(sink.streamed).toBe(false);
    expect(sink.target).toBeInstanceOf(BufferTarget);
    await sink.discard();
  });

  it('treats a plain in-memory export as neither saved to a chosen file nor backed by a private one', async () => {
    const blob = new Blob(['video'], { type: 'video/mp4' });
    expect(exportSavedToChosenFile(blob)).toBe(false);
    expect(await exportFileReadable(blob)).toBe(true);
    expect(() => releaseExportFile(blob)).not.toThrow();
    expect(() => releaseExportFile(null)).not.toThrow();
  });

  it('reports a kept export whose file is gone as unreadable', async () => {
    const gone = { slice: () => ({ arrayBuffer: () => Promise.reject(new DOMException('gone', 'NotFoundError')) }) } as unknown as Blob;
    expect(await exportFileReadable(gone)).toBe(false);
  });

  it('reserves index room above what a track of that length holds', () => {
    // One packet a frame for the picture.
    expect(exportVideoPacketLimit(81_000)).toBeGreaterThan(81_000);
    // Measured in Chrome: 60 s of 48 kHz AAC is 2816 packets, 120 s is 5628.
    expect(exportAudioPacketLimit(60)).toBeGreaterThan(2816);
    expect(exportAudioPacketLimit(120)).toBeGreaterThan(5628);
    expect(exportAudioPacketLimit(0)).toBeGreaterThan(0);
    expect(Number.isInteger(exportAudioPacketLimit(44.1 * 60))).toBe(true);
  });
});
