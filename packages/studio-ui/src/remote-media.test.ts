import { beforeEach, describe, expect, it, vi } from 'vitest';

const localMediaMocks = vi.hoisted(() => ({
  saveLocalStream: vi.fn(),
  saveLocalVideo: vi.fn(),
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
});
