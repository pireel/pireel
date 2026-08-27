import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  extractAudio: vi.fn(),
  extractThumbnails: vi.fn(),
  extractThumbnailsFromUrl: vi.fn(),
  upload: vi.fn(),
}));

vi.mock('@pireel/studio-engine/video-edit/extract-audio', () => ({
  extractAudio: mocks.extractAudio,
}));

vi.mock('@pireel/studio-engine/video-edit/thumbnails', () => ({
  extractThumbnails: mocks.extractThumbnails,
  extractThumbnailsFromUrl: mocks.extractThumbnailsFromUrl,
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

import {
  extractFilmstripAtTimestamps,
  filmstripSourceRangeForTimelineWindow,
  filmstripTimestampsForRanges,
  transcribeFile,
} from './media';

describe('filmstrip source demand', () => {
  it('publishes the first decoded frame before the extraction batch finishes', async () => {
    let releaseBatch!: () => void;
    mocks.extractThumbnails.mockImplementationOnce(async (_file, _timestamps, options) => {
      options.onThumb({ timestamp: 1.5, url: 'blob:first' });
      await new Promise<void>((resolve) => { releaseBatch = resolve; });
      options.onThumb({ timestamp: 2.5, url: 'blob:second' });
    });
    const seen: number[] = [];

    const pending = extractFilmstripAtTimestamps(
      new File(['video'], 'video.mp4', { type: 'video/mp4' }),
      [1.5, 2.5],
      (frame) => seen.push(frame.t),
    );
    await vi.waitFor(() => expect(seen).toEqual([1.5]));
    releaseBatch();

    await expect(pending).resolves.toEqual([
      { t: 1.5, url: 'blob:first' },
      { t: 2.5, url: 'blob:second' },
    ]);
    expect(seen).toEqual([1.5, 2.5]);
  });

  it('maps only the visible part of a trimmed timeline clip back to source time', () => {
    expect(filmstripSourceRangeForTimelineWindow(40, 50, 1_000, 1_010, 42, 45)).toEqual({
      startSec: 1_002,
      endSec: 1_005,
    });
    expect(filmstripSourceRangeForTimelineWindow(40, 50, 1_000, 1_010, 10, 20)).toBeNull();
  });

  it('samples only surviving source ranges instead of the trimmed prefix', () => {
    expect(filmstripTimestampsForRanges([{ startSec: 1_000, endSec: 1_005 }])).toEqual([
      1_000.5,
      1_001.5,
      1_002.5,
      1_003.5,
      1_004.5,
    ]);
  });

  it('skips removed source gaps and keeps bucket keys stable across small trims', () => {
    expect(filmstripTimestampsForRanges([
      { startSec: 10.2, endSec: 12.8 },
      { startSec: 1_000.2, endSec: 1_002.8 },
    ])).toEqual([10.5, 11.5, 12.5, 1_000.5, 1_001.5, 1_002.5]);
    expect(filmstripTimestampsForRanges([{ startSec: 1_000.3, endSec: 1_002.7 }])).toEqual([
      1_000.5,
      1_001.5,
      1_002.5,
    ]);
  });

  it('caps long used ranges without sampling removed time', () => {
    const timestamps = filmstripTimestampsForRanges([{ startSec: 500, endSec: 800 }]);
    expect(timestamps).toHaveLength(60);
    expect(timestamps[0]).toBeGreaterThanOrEqual(500);
    expect(timestamps.at(-1)).toBeLessThan(800);
  });
});

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
