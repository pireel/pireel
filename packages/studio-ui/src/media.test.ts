import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  extractAudio: vi.fn(),
  upload: vi.fn(),
}));

vi.mock('@pireel/studio-engine/video-edit/extract-audio', () => ({
  extractAudio: mocks.extractAudio,
}));

vi.mock('@pireel/studio-engine/providers', () => ({
  studioProviders: () => ({ uploads: { upload: mocks.upload } }),
}));

vi.mock('mediabunny', () => ({
  ALL_FORMATS: {},
  BlobSource: class {},
  Input: class {
    async getPrimaryVideoTrack() {
      return { displayWidth: 1920, displayHeight: 1080 };
    }
    async getPrimaryAudioTrack() {
      return null;
    }
    async computeDuration() {
      return 5;
    }
    async getFirstTimestamp() {
      return 0;
    }
    async dispose() {}
  },
}));

import { transcribeFile } from './media';

describe('local ASR preflight', () => {
  beforeEach(() => {
    mocks.extractAudio.mockReset();
    mocks.upload.mockReset();
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    });
    mocks.extractAudio.mockResolvedValue(new Blob(['audio'], { type: 'audio/mp4' }));
    mocks.upload.mockResolvedValue({ url: 'https://upload.example/audio.m4a' });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(
      JSON.stringify({ asr_ok: false, detail: 'returned no text' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )));
  });

  afterEach(() => vi.unstubAllGlobals());

  it('returns a cached empty transcript without extracting or uploading a video that has no audio track', async () => {
    const file = new File(['silent-video'], 'silent.mp4', { type: 'video/mp4', lastModified: 1 });
    await expect(transcribeFile(file)).resolves.toEqual([]);
    await expect(transcribeFile(file)).resolves.toEqual([]);

    expect(mocks.extractAudio).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
