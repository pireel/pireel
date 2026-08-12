import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizePexelsPhoto, normalizePexelsVideo, normalizePixabayPhoto, normalizePixabayVideo, normalizeWikimediaPage, searchStock, stockConfigured } from './stock';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('stock 归一(Pexels)', () => {
  it('图:large2x 做正片、medium 做缩略', () => {
    const it_ = normalizePexelsPhoto({
      id: 1,
      width: 4000,
      height: 6000,
      photographer: 'Ann',
      src: { large2x: 'https://x/2x.jpg', medium: 'https://x/m.jpg' },
    })!;
    expect(it_).toMatchObject({ id: 'px_1', type: 'image', url: 'https://x/2x.jpg', thumb: 'https://x/m.jpg', author: 'Ann', provider: 'pexels' });
    expect(it_).toMatchObject({
      sourceUrl: 'https://www.pexels.com/photo/1/',
      license: { name: 'Pexels License', url: 'https://www.pexels.com/license/' },
    });
  });
  it('图:缺可用尺寸 → null', () => {
    expect(normalizePexelsPhoto({ id: 2, width: 0, height: 0, src: {} })).toBeNull();
  });
  it('视频:挑「高度 ≥720 里最小」的 mp4,不拉 4K', () => {
    const v = normalizePexelsVideo({
      id: 3,
      width: 3840,
      height: 2160,
      duration: 12,
      image: 'https://x/poster.jpg',
      user: { name: 'Bob' },
      video_files: [
        { link: 'https://x/2160.mp4', file_type: 'video/mp4', height: 2160, width: 3840 },
        { link: 'https://x/720.mp4', file_type: 'video/mp4', height: 720, width: 1280 },
        { link: 'https://x/1080.mp4', file_type: 'video/mp4', height: 1080, width: 1920 },
        { link: 'https://x/240.mp4', file_type: 'video/mp4', height: 240, width: 426 },
      ],
    })!;
    expect(v.url).toBe('https://x/720.mp4');
    expect(v.durationSec).toBe(12);
    expect(v.type).toBe('video');
    expect(v.sourceUrl).toBe('https://www.pexels.com/video/3/');
  });
  it('视频:全低清 → 取最大档;没 poster → null', () => {
    const v = normalizePexelsVideo({
      id: 4,
      width: 640,
      height: 360,
      image: 'https://x/p.jpg',
      video_files: [
        { link: 'https://x/240.mp4', file_type: 'video/mp4', height: 240 },
        { link: 'https://x/360.mp4', file_type: 'video/mp4', height: 360 },
      ],
    })!;
    expect(v.url).toBe('https://x/360.mp4');
    expect(normalizePexelsVideo({ id: 5, width: 1, height: 1, video_files: [{ link: 'https://x/a.mp4', file_type: 'video/mp4', height: 720 }] })).toBeNull();
  });
});

describe('stock 归一(Pixabay)', () => {
  it('图:largeImageURL 优先', () => {
    const it_ = normalizePixabayPhoto({ id: 7, pageURL: 'https://pixabay.com/photos/example-7/', imageWidth: 1920, imageHeight: 1080, webformatURL: 'https://p/w.jpg', largeImageURL: 'https://p/l.jpg', user: 'Cid' })!;
    expect(it_).toMatchObject({ id: 'pb_7', type: 'image', url: 'https://p/l.jpg', thumb: 'https://p/w.jpg', provider: 'pixabay' });
    expect(it_).toMatchObject({
      sourceUrl: 'https://pixabay.com/photos/example-7/',
      license: { name: 'Pixabay Content License', url: 'https://pixabay.com/service/license-summary/' },
    });
  });
  it('贴纸:同图片归一但 type=sticker', () => {
    const it_ = normalizePixabayPhoto({ id: 10, webformatURL: 'https://p/s.png', user: 'Eve' }, 'sticker')!;
    expect(it_).toMatchObject({ id: 'pb_10', type: 'sticker', url: 'https://p/s.png' });
  });
  it('视频:medium 优先,缺 thumbnail 用 tiny 的;都没有 → null', () => {
    const v = normalizePixabayVideo({
      id: 8,
      duration: 30,
      user: 'Dee',
      videos: { medium: { url: 'https://p/m.mp4', width: 1280, height: 720 }, tiny: { thumbnail: 'https://p/t.jpg' } },
    })!;
    expect(v).toMatchObject({ id: 'pb_8', url: 'https://p/m.mp4', thumb: 'https://p/t.jpg', durationSec: 30 });
    expect(normalizePixabayVideo({ id: 9, videos: { medium: { url: 'https://p/m.mp4' } } })).toBeNull();
  });
});

describe('stock 在线搜索', () => {
  it('Pexels 视频使用当前 v1 endpoint，并保留来源与许可元数据', async () => {
    vi.stubEnv('PEXELS_API_KEY', 'test-key');
    vi.stubEnv('PIXABAY_API_KEY', '');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      videos: [{
        id: 42,
        width: 1920,
        height: 1080,
        duration: 8,
        url: 'https://www.pexels.com/video/city-42/',
        image: 'https://images.pexels.com/poster.jpg',
        user: { name: 'Lin' },
        video_files: [{ link: 'https://videos.pexels.com/720.mp4', file_type: 'video/mp4', width: 1280, height: 720 }],
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const page = await searchStock('city', 'video', 1, 1);

    expect(fetchMock.mock.calls[0]?.[0]).toContain('https://api.pexels.com/v1/videos/search?');
    expect(page.items[0]).toMatchObject({
      id: 'px_42',
      sourceUrl: 'https://www.pexels.com/video/city-42/',
      credit: 'Video by Lin on Pexels',
      license: { name: 'Pexels License' },
    });
  });

  it('无商业 provider key 时使用 Commons，并只接受带可审计自由许可的结果', async () => {
    vi.stubEnv('PEXELS_API_KEY', '');
    vi.stubEnv('PIXABAY_API_KEY', '');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      continue: { gsroffset: 12 },
      query: {
        pages: [{
          pageid: 99,
          title: 'File:Phone.jpg',
          imageinfo: [{
            size: 1234,
            width: 2400,
            height: 1600,
            mime: 'image/jpeg',
            url: 'https://upload.wikimedia.org/original.jpg',
            thumburl: 'https://upload.wikimedia.org/1600.jpg',
            descriptionurl: 'https://commons.wikimedia.org/wiki/File:Phone.jpg',
            extmetadata: {
              Artist: { value: '<a href="/wiki/User:Lin">Lin</a>' },
              LicenseShortName: { value: 'CC BY-SA 4.0' },
              LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
            },
          }],
        }],
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    expect(stockConfigured()).toBe(true);
    const page = await searchStock('smartphone', 'image', 1, 12);

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('commons.wikimedia.org/w/api.php');
    expect(page).toMatchObject({ provider: 'wikimedia', hasMore: true });
    expect(page.items[0]).toMatchObject({
      id: 'wm_99',
      url: 'https://upload.wikimedia.org/1600.jpg',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Phone.jpg',
      author: 'Lin',
      license: { name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0' },
    });
  });

  it('Commons 丢弃没有明确自由许可的媒体', () => {
    expect(normalizeWikimediaPage({
      pageid: 1,
      imageinfo: [{
        width: 100,
        height: 100,
        mime: 'image/jpeg',
        url: 'https://upload.wikimedia.org/a.jpg',
        extmetadata: { LicenseShortName: { value: 'All rights reserved' } },
      }],
    }, 'image')).toBeNull();
  });
});
