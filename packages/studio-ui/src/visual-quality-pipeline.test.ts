import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FrameQualityObservation } from '@pireel/studio-engine/visual-quality';

const mocks = vi.hoisted(() => ({
  detectScenes: vi.fn(),
  extractThumbnails: vi.fn(),
  analyzeGeometryAndQuality: vi.fn(),
  analyzeQualityAtTimes: vi.fn(),
  extractPalette: vi.fn(),
}));

vi.mock('@pireel/studio-engine/video-edit/scene-detection', () => ({ detectScenes: mocks.detectScenes }));
vi.mock('@pireel/studio-engine/video-edit/thumbnails', () => ({ extractThumbnails: mocks.extractThumbnails }));
vi.mock('./geometry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./geometry')>()),
  analyzeGeometryAndQuality: mocks.analyzeGeometryAndQuality,
  analyzeQualityAtTimes: mocks.analyzeQualityAtTimes,
}));
vi.mock('./palette', () => ({ extractPalette: mocks.extractPalette }));
vi.mock('./media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./media')>()),
  fileSig: (file: File) => `${file.name}:${file.size}:${file.lastModified}`,
}));

const sample = (timeSec: number, quality: number): FrameQualityObservation => ({
  timeSec,
  sharpness: quality,
  exposure: quality,
  stability: quality,
});

describe('visual quality coarse-to-fine pipeline', () => {
  beforeEach(() => {
    mocks.detectScenes.mockResolvedValue([]);
    mocks.extractThumbnails.mockResolvedValue([]);
    mocks.extractPalette.mockResolvedValue(null);
    mocks.analyzeGeometryAndQuality.mockReset();
    mocks.analyzeQualityAtTimes.mockReset();
  });

  it('uses the bounded fine scan as final truth and rejects a transient severe failure', async () => {
    mocks.analyzeGeometryAndQuality.mockResolvedValue({
      frames: null,
      quality: Array.from({ length: 5 }, (_, index) => sample(index * 0.5, 0.86)),
    });
    mocks.analyzeQualityAtTimes.mockResolvedValue(
      Array.from({ length: 13 }, (_, index) => sample(index / 6, index === 6 ? 0.05 : 0.86)),
    );
    const { prepareVisualAnalysis } = await import('./visual');
    const result = await prepareVisualAnalysis(new File(['video'], 'dense-failure.mp4', { lastModified: 1 }), 2.1);

    expect(mocks.analyzeQualityAtTimes).toHaveBeenCalledOnce();
    const requestedTimes = mocks.analyzeQualityAtTimes.mock.calls[0]?.[1] as number[];
    expect(requestedTimes.length).toBeGreaterThan(5);
    expect(requestedTimes.length).toBeLessThanOrEqual(180);
    expect('prep' in result && result.prep.qualityWindows).toEqual([]);
  });

  it('applies strict thresholds to coarse observations when fine decoding fails', async () => {
    mocks.analyzeGeometryAndQuality.mockResolvedValue({
      frames: null,
      quality: Array.from({ length: 8 }, (_, index) => sample(index * 0.4, 0.4)),
    });
    mocks.analyzeQualityAtTimes.mockResolvedValue([]);
    const { prepareVisualAnalysis } = await import('./visual');
    const result = await prepareVisualAnalysis(new File(['video'], 'all-bad.mp4', { lastModified: 2 }), 3.2);

    expect(mocks.analyzeQualityAtTimes).toHaveBeenCalledOnce();
    expect('prep' in result && result.prep.qualityWindows).toEqual([]);
  });
});
