/**
 * 在线素材(stock)—— 服务端数据层(参考 Google Vids 的 Stock & web 面板:
 * 创作者缺 b-roll 时面板里现搜现插,一切服务当前视频)。
 *
 * Provider:Pexels 优先、Pixabay 兜底(都是免费 key、可商用、无需署名——
 * 许可最省心的两家;key 在 .env:PEXELS_API_KEY / PIXABAY_API_KEY)。
 * 本文件只做纯归一(可单测)+ fetch 封装;路由在 routes/api/studio/stock.ts。
 * 插入走直链(两家 CDN 都允许热链);导出容器侧按公网 URL 拉取。
 */

/** sticker = 透明底贴图(Pixabay image_type=vector 的 PNG 渲染),插入时当图片用 */
export type StockKind = 'image' | 'video' | 'sticker';

export interface StockItem {
  id: string;
  type: StockKind;
  /** 网格缩略图(小图,面板展示用) */
  thumb: string;
  /** 插入 composition 用的正片直链(图 ≈2x 大图 / 视频挑 ≥720p 的 mp4) */
  url: string;
  width: number;
  height: number;
  durationSec?: number;
  /** 作者名(许可不强制署名,但展示是礼貌) */
  author: string;
  provider: 'pexels' | 'pixabay';
}

export interface StockPage {
  items: StockItem[];
  page: number;
  hasMore: boolean;
  provider: 'pexels' | 'pixabay';
}

const hasCjk = (s: string) => /[一-鿿]/.test(s);

/* ============================ Pexels ============================ */

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  photographer?: string;
  src?: { original?: string; large2x?: string; large?: string; medium?: string };
}
interface PexelsVideoFile {
  link?: string;
  file_type?: string;
  width?: number;
  height?: number;
}
interface PexelsVideo {
  id: number;
  width: number;
  height: number;
  duration?: number;
  image?: string;
  user?: { name?: string };
  video_files?: PexelsVideoFile[];
}

export function normalizePexelsPhoto(p: PexelsPhoto): StockItem | null {
  const url = p.src?.large2x ?? p.src?.original ?? p.src?.large;
  const thumb = p.src?.medium ?? p.src?.large ?? url;
  if (!url || !thumb) return null;
  return { id: `px_${p.id}`, type: 'image', thumb, url, width: p.width, height: p.height, author: p.photographer ?? '', provider: 'pexels' };
}

/** 视频挑档:优先「高度 ≥720 里最小的」mp4(够 1080 竖屏画中画,别拉 4K 浪费带宽),没有就取最大档。 */
export function normalizePexelsVideo(v: PexelsVideo): StockItem | null {
  const mp4s = (v.video_files ?? []).filter((f) => f.link && (f.file_type ?? '').includes('mp4') && f.height);
  if (!mp4s.length || !v.image) return null;
  const good = mp4s.filter((f) => (f.height ?? 0) >= 720).sort((a, b) => (a.height ?? 0) - (b.height ?? 0));
  const pick = good[0] ?? mp4s.sort((a, b) => (b.height ?? 0) - (a.height ?? 0))[0]!;
  return {
    id: `px_${v.id}`,
    type: 'video',
    thumb: v.image,
    url: pick.link!,
    width: pick.width ?? v.width,
    height: pick.height ?? v.height,
    ...(v.duration ? { durationSec: v.duration } : {}),
    author: v.user?.name ?? '',
    provider: 'pexels',
  };
}

async function pexelsSearch(key: string, q: string, type: 'image' | 'video', page: number, per: number): Promise<StockPage> {
  const locale = hasCjk(q) ? '&locale=zh-CN' : '';
  const url =
    type === 'image'
      ? q
        ? `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&page=${page}&per_page=${per}${locale}`
        : `https://api.pexels.com/v1/curated?page=${page}&per_page=${per}`
      : q
        ? `https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&page=${page}&per_page=${per}${locale}`
        : `https://api.pexels.com/videos/popular?page=${page}&per_page=${per}`;
  const r = await fetch(url, { headers: { Authorization: key } });
  if (!r.ok) throw new Error(`pexels ${r.status}`);
  const j = (await r.json()) as { photos?: PexelsPhoto[]; videos?: PexelsVideo[]; next_page?: string };
  const items =
    type === 'image'
      ? (j.photos ?? []).map(normalizePexelsPhoto)
      : (j.videos ?? []).map(normalizePexelsVideo);
  return { items: items.filter((x): x is StockItem => !!x), page, hasMore: !!j.next_page, provider: 'pexels' };
}

/* ============================ Pixabay ============================ */

interface PixabayPhoto {
  id: number;
  imageWidth?: number;
  imageHeight?: number;
  webformatURL?: string;
  largeImageURL?: string;
  fullHDURL?: string;
  user?: string;
}
interface PixabayVideoVariant {
  url?: string;
  width?: number;
  height?: number;
  thumbnail?: string;
}
interface PixabayVideo {
  id: number;
  duration?: number;
  user?: string;
  videos?: { large?: PixabayVideoVariant; medium?: PixabayVideoVariant; small?: PixabayVideoVariant; tiny?: PixabayVideoVariant };
}

export function normalizePixabayPhoto(p: PixabayPhoto, type: 'image' | 'sticker' = 'image'): StockItem | null {
  const url = p.largeImageURL ?? p.fullHDURL ?? p.webformatURL;
  const thumb = p.webformatURL ?? url;
  if (!url || !thumb) return null;
  return { id: `pb_${p.id}`, type, thumb, url, width: p.imageWidth ?? 0, height: p.imageHeight ?? 0, author: p.user ?? '', provider: 'pixabay' };
}

export function normalizePixabayVideo(v: PixabayVideo): StockItem | null {
  // medium(≈720-1080)够用;没有再升 large、降 small
  const pick = v.videos?.medium ?? v.videos?.large ?? v.videos?.small;
  const thumb = pick?.thumbnail ?? v.videos?.tiny?.thumbnail;
  if (!pick?.url || !thumb) return null;
  return {
    id: `pb_${v.id}`,
    type: 'video',
    thumb,
    url: pick.url,
    width: pick.width ?? 0,
    height: pick.height ?? 0,
    ...(v.duration ? { durationSec: v.duration } : {}),
    author: v.user ?? '',
    provider: 'pixabay',
  };
}

async function pixabaySearch(key: string, q: string, type: StockKind, page: number, per: number): Promise<StockPage> {
  const lang = hasCjk(q) ? '&lang=zh' : '';
  const base = type === 'video' ? 'https://pixabay.com/api/videos/' : 'https://pixabay.com/api/';
  // 贴纸 = vector 图(webformat 渲染成透明底 PNG,插进画面不带白底)
  const extra = type === 'sticker' ? '&image_type=vector' : '';
  const r = await fetch(`${base}?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&page=${page}&per_page=${per}&safesearch=true${lang}${extra}`);
  if (!r.ok) throw new Error(`pixabay ${r.status}`);
  const j = (await r.json()) as { totalHits?: number; hits?: unknown[] };
  const hits = j.hits ?? [];
  const items =
    type === 'video'
      ? (hits as PixabayVideo[]).map(normalizePixabayVideo)
      : (hits as PixabayPhoto[]).map((p) => normalizePixabayPhoto(p, type === 'sticker' ? 'sticker' : 'image'));
  return { items: items.filter((x): x is StockItem => !!x), page, hasMore: page * per < (j.totalHits ?? 0), provider: 'pixabay' };
}

/* ============================ 入口 ============================ */

/** 有没有配任何 stock 源(给路由/前端判空态)。 */
export function stockConfigured(): boolean {
  return !!(process.env.PEXELS_API_KEY || process.env.PIXABAY_API_KEY);
}

/**
 * 搜在线素材:图/视频 Pexels 优先(质量更稳)、Pixabay 兜底;
 * 贴纸只有 Pixabay 有(Pexels 无 vector 类目),没配 Pixabay key 返回空页(面板隐藏该区)。
 * 都没 key 抛 no_stock_provider。
 */
export async function searchStock(q: string, type: StockKind, page = 1, per = 24): Promise<StockPage> {
  const pexels = process.env.PEXELS_API_KEY;
  const pixabay = process.env.PIXABAY_API_KEY;
  if (!pexels && !pixabay) throw new Error('no_stock_provider');
  if (type === 'sticker') {
    if (!pixabay) return { items: [], page, hasMore: false, provider: 'pixabay' };
    return pixabaySearch(pixabay, q, type, page, per);
  }
  if (pexels) return pexelsSearch(pexels, q, type, page, per);
  return pixabaySearch(pixabay!, q, type, page, per);
}
