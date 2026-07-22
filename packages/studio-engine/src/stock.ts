/**
 * Online stock media — server-side data layer (modeled on Google Vids' Stock &
 * web panel: when a creator lacks b-roll, they search and insert from the panel,
 * all in service of the current video).
 *
 * Providers: Pexels first, Pixabay fallback (both free key, commercial-use, no
 * attribution required — the two most license-friendly; keys in .env:
 * PEXELS_API_KEY / PIXABAY_API_KEY). This file only does pure normalization
 * (unit-testable) + fetch wrapping; routing lives in routes/api/studio/stock.ts.
 * Insertion uses direct links (both CDNs allow hotlinking); the export container
 * pulls by public URL.
 */

/** sticker = transparent-background graphic (PNG render of Pixabay image_type=vector), inserted as an image */
export type StockKind = 'image' | 'video' | 'sticker';

export interface StockItem {
  id: string;
  type: StockKind;
  /** Grid thumbnail (small, for panel display) */
  thumb: string;
  /** Direct link to the full asset for inserting into the composition (image ≈2x large / video picks an mp4 ≥720p) */
  url: string;
  width: number;
  height: number;
  durationSec?: number;
  /** Author name (license doesn't require attribution, but showing it is polite) */
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

/** Video variant pick: prefer the smallest mp4 with height ≥720 (enough for a 1080 vertical PiP, don't waste bandwidth on 4K); fall back to the largest. */
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
  // medium (≈720-1080) is enough; else step up to large, then down to small
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
  // sticker = vector image (webformat renders to a transparent-background PNG, no white box in the frame)
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

/* ============================ Entry ============================ */

/** Whether any stock provider is configured (for routes/frontend empty state). */
export function stockConfigured(): boolean {
  return !!(process.env.PEXELS_API_KEY || process.env.PIXABAY_API_KEY);
}

/**
 * Search stock media: images/videos prefer Pexels (steadier quality), Pixabay fallback;
 * stickers are Pixabay-only (Pexels has no vector category) — with no Pixabay key, returns an empty page (panel hides that section).
 * With no key at all, throws no_stock_provider.
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
