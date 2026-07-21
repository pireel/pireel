import { describe, expect, it } from 'vitest';
import { normalizePexelsPhoto, normalizePexelsVideo, normalizePixabayPhoto, normalizePixabayVideo } from './stock';

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
    const it_ = normalizePixabayPhoto({ id: 7, imageWidth: 1920, imageHeight: 1080, webformatURL: 'https://p/w.jpg', largeImageURL: 'https://p/l.jpg', user: 'Cid' })!;
    expect(it_).toMatchObject({ id: 'pb_7', type: 'image', url: 'https://p/l.jpg', thumb: 'https://p/w.jpg', provider: 'pixabay' });
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
