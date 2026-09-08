// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ extract: vi.fn(), load: vi.fn(), file: vi.fn(), patch: vi.fn() }));
vi.mock('@pireel/studio-engine/video-edit/thumbnails', () => ({ extractThumbnails: mocks.extract }));
vi.mock('./local-media', () => ({ loadLocalVideo: mocks.file }));
vi.mock('./caption-task-store', () => ({ loadCaptionTask: mocks.load, patchCaptionProjectMetadata: mocks.patch }));
import { ensureCaptionProjectCover } from './caption-project-cover';
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('URL', { revokeObjectURL: vi.fn() });
  mocks.load.mockResolvedValue({ sourceSig: 'source', durationSec: 10 });
  mocks.file.mockResolvedValue(new File(['video'], 'source.mp4'));
  mocks.extract.mockResolvedValue([{ blob: new Blob(['jpeg'], { type: 'image/jpeg' }), url: 'blob:temporary-frame' }]);
  mocks.patch.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());
describe('caption project cover backfill', () => {
  it('coalesces requests and persists image bytes instead of a temporary object URL', async () => {
    const first = ensureCaptionProjectCover('owner', 'project');
    const second = ensureCaptionProjectCover('owner', 'project');
    expect(first).toBe(second);
    const cover = await first;
    expect(cover).toMatch(/^data:image\/jpeg;base64,/);
    expect(mocks.extract).toHaveBeenCalledOnce();
    expect(mocks.patch).toHaveBeenCalledWith('owner', 'project', { coverThumb: cover });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:temporary-frame');
  });
  it('uses cached covers and leaves missing or archived projects untouched', async () => {
    mocks.load.mockResolvedValueOnce({ coverThumb: 'data:image/jpeg;base64,cached' });
    expect(await ensureCaptionProjectCover('owner', 'cached')).toBe('data:image/jpeg;base64,cached');
    mocks.load.mockResolvedValueOnce(undefined);
    expect(await ensureCaptionProjectCover('owner', 'archived')).toBeUndefined();
    mocks.file.mockResolvedValueOnce(null);
    expect(await ensureCaptionProjectCover('owner', 'missing-source')).toBeUndefined();
    expect(mocks.extract).not.toHaveBeenCalled(); expect(mocks.patch).not.toHaveBeenCalled();
  });
});
