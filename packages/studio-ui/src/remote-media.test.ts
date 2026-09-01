import { beforeEach, describe, expect, it, vi } from 'vitest';

const localMediaMocks = vi.hoisted(() => ({
  saveLocalStream: vi.fn(),
  saveLocalVideo: vi.fn(),
  loadLocalVideo: vi.fn(),
  deleteLocalVideo: vi.fn(),
  alignFileToSig: vi.fn((file: File) => file),
}));

vi.mock('./local-media', () => localMediaMocks);

import { materializeRemoteMedia } from './remote-media';

describe('remote media materialization', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localMediaMocks.saveLocalStream.mockReset();
    localMediaMocks.saveLocalVideo.mockReset();
    localMediaMocks.loadLocalVideo.mockReset();
    localMediaMocks.deleteLocalVideo.mockReset();
    localMediaMocks.alignFileToSig.mockClear();
  });

  it('streams known-size media into OPFS without constructing a response Blob', async () => {
    const bytes = new TextEncoder().encode('streamed-video');
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }), {
      headers: { 'content-length': String(bytes.byteLength), 'content-type': 'video/mp4' },
    });
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', { storage: {} });
    vi.stubGlobal('fetch', vi.fn(async () => response));
    const blobSpy = vi.spyOn(Response.prototype, 'blob');
    const stored = new File([bytes], 'clip.mp4', { type: 'video/mp4', lastModified: 0 });
    localMediaMocks.saveLocalStream.mockResolvedValue(stored);

    const result = await materializeRemoteMedia('/clip.mp4', { name: 'clip.mp4' });

    expect(result.file).toBe(stored);
    expect(localMediaMocks.saveLocalStream).toHaveBeenCalledWith(
      response.body,
      expect.stringMatching(/clip\.mp4:14:0$/),
      expect.objectContaining({ expectedSize: 14, type: 'video/mp4' }),
    );
    expect(blobSpy).not.toHaveBeenCalled();
  });

  it('treats an absent content-length as size UNKNOWN, not zero (proxied chunked responses)', async () => {
    // Number(null) === 0 once turned every same-origin-proxy materialization into
    // "expected 0, received more than 0" and killed the client export.
    const bytes = new TextEncoder().encode('proxied-narration');
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }), { headers: { 'content-type': 'audio/mpeg' } });
    response.headers.delete('content-length');
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', { storage: {} });
    vi.stubGlobal('fetch', vi.fn(async () => response));
    const temporary = new File([bytes], 'audio', { type: 'audio/mpeg', lastModified: 0 });
    const durable = new File([bytes], 'audio-durable', { type: 'audio/mpeg', lastModified: 0 });
    localMediaMocks.saveLocalStream.mockResolvedValue(temporary);
    localMediaMocks.saveLocalVideo.mockResolvedValue(true);
    localMediaMocks.loadLocalVideo.mockResolvedValue(durable);

    const result = await materializeRemoteMedia('/narration.mp3', { name: 'narration.mp3', type: 'audio/mpeg' });

    expect(localMediaMocks.saveLocalStream).toHaveBeenCalledWith(
      response.body,
      expect.stringMatching(/^\.remote-/),
      expect.objectContaining({ expectedSize: null }),
    );
    expect(result.sig).toMatch(new RegExp(`:${bytes.byteLength}:0$`));
    // The temporary-backed File must never escape: its backing entry is deleted right after,
    // and OPFS Files read lazily — the export mixer would hit NotFoundError at mux time.
    expect(result.file).toBe(durable);
    expect(localMediaMocks.deleteLocalVideo).toHaveBeenCalled();
  });
});
