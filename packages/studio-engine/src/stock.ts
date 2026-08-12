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
export type StockProvider = 'pexels' | 'pixabay' | 'wikimedia';

export interface StockLicense {
  name: string;
  url: string;
}

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
  provider: StockProvider;
  /** Human-auditable provider page. Never persist only the transient CDN locator. */
  sourceUrl: string;
  license: StockLicense;
  /** Ready-to-display credit for search/import receipts. */
  credit: string;
  byteSize?: number;
}

export interface StockPage {
  items: StockItem[];
  page: number;
  hasMore: boolean;
  provider: StockProvider;
}

const hasCjk = (s: string) => /[一-鿿]/.test(s);

/* ============================ Pexels ============================ */

interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url?: string;
  photographer?: string;
  photographer_url?: string;
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
  url?: string;
  image?: string;
  user?: { name?: string; url?: string };
  video_files?: PexelsVideoFile[];
}

const PEXELS_LICENSE: StockLicense = {
  name: 'Pexels License',
  url: 'https://www.pexels.com/license/',
};

const PIXABAY_LICENSE: StockLicense = {
  name: 'Pixabay Content License',
  url: 'https://pixabay.com/service/license-summary/',
};

export function normalizePexelsPhoto(p: PexelsPhoto): StockItem | null {
  const url = p.src?.large2x ?? p.src?.original ?? p.src?.large;
  const thumb = p.src?.medium ?? p.src?.large ?? url;
  if (!url || !thumb) return null;
  const author = p.photographer ?? '';
  return {
    id: `px_${p.id}`,
    type: 'image',
    thumb,
    url,
    width: p.width,
    height: p.height,
    author,
    provider: 'pexels',
    sourceUrl: p.url ?? `https://www.pexels.com/photo/${p.id}/`,
    license: PEXELS_LICENSE,
    credit: author ? `Photo by ${author} on Pexels` : 'Photo from Pexels',
  };
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
    sourceUrl: v.url ?? `https://www.pexels.com/video/${v.id}/`,
    license: PEXELS_LICENSE,
    credit: v.user?.name ? `Video by ${v.user.name} on Pexels` : 'Video from Pexels',
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
        ? `https://api.pexels.com/v1/videos/search?query=${encodeURIComponent(q)}&page=${page}&per_page=${per}${locale}`
        : `https://api.pexels.com/v1/videos/popular?page=${page}&per_page=${per}`;
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
  pageURL?: string;
  tags?: string;
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
  pageURL?: string;
  tags?: string;
  duration?: number;
  user?: string;
  videos?: { large?: PixabayVideoVariant; medium?: PixabayVideoVariant; small?: PixabayVideoVariant; tiny?: PixabayVideoVariant };
}

export function normalizePixabayPhoto(p: PixabayPhoto, type: 'image' | 'sticker' = 'image'): StockItem | null {
  const url = p.largeImageURL ?? p.fullHDURL ?? p.webformatURL;
  const thumb = p.webformatURL ?? url;
  if (!url || !thumb) return null;
  const author = p.user ?? '';
  return {
    id: `pb_${p.id}`,
    type,
    thumb,
    url,
    width: p.imageWidth ?? 0,
    height: p.imageHeight ?? 0,
    author,
    provider: 'pixabay',
    sourceUrl: p.pageURL ?? `https://pixabay.com/images/id-${p.id}/`,
    license: PIXABAY_LICENSE,
    credit: author ? `${type === 'sticker' ? 'Graphic' : 'Image'} by ${author} on Pixabay` : `${type === 'sticker' ? 'Graphic' : 'Image'} from Pixabay`,
  };
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
    sourceUrl: v.pageURL ?? `https://pixabay.com/videos/id-${v.id}/`,
    license: PIXABAY_LICENSE,
    credit: v.user ? `Video by ${v.user} on Pixabay` : 'Video from Pixabay',
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

/* ============================ Wikimedia Commons ============================ */

interface WikimediaMetadataValue { value?: string }
interface WikimediaPage {
  pageid?: number;
  title?: string;
  index?: number;
  imageinfo?: Array<{
    size?: number;
    width?: number;
    height?: number;
    duration?: number;
    mime?: string;
    url?: string;
    thumburl?: string;
    descriptionurl?: string;
    extmetadata?: Record<string, WikimediaMetadataValue>;
  }>;
}

const stripHtml = (value: string | undefined): string => (value ?? '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const commonsLicenseAllowed = (name: string): boolean => {
  const value = name.toLowerCase();
  return value.includes('public domain') || value.includes('cc0') || value.startsWith('cc by');
};

export function normalizeWikimediaPage(page: WikimediaPage, requestedKind: StockKind): StockItem | null {
  const info = page.imageinfo?.[0];
  if (!page.pageid || !info?.url || !info.width || !info.height) return null;
  const isVideo = info.mime?.startsWith('video/') ?? false;
  if ((requestedKind === 'video') !== isVideo) return null;
  const metadata = info.extmetadata ?? {};
  const licenseName = stripHtml(metadata.LicenseShortName?.value || metadata.UsageTerms?.value);
  if (!licenseName || !commonsLicenseAllowed(licenseName)) return null;
  const author = stripHtml(metadata.Artist?.value).slice(0, 200);
  const licenseUrl = metadata.LicenseUrl?.value?.trim()
    || (licenseName.toLowerCase().includes('public domain')
      ? 'https://commons.wikimedia.org/wiki/Commons:Public_domain'
      : 'https://creativecommons.org/share-your-work/cclicenses/');
  const type: StockKind = isVideo ? 'video' : requestedKind === 'sticker' ? 'sticker' : 'image';
  const mediaLabel = isVideo ? 'Video' : type === 'sticker' ? 'Graphic' : 'Image';
  return {
    id: `wm_${page.pageid}`,
    type,
    thumb: info.thumburl ?? info.url,
    // Images use the requested 1600px derivative to cap import memory; videos need the original stream.
    url: isVideo ? info.url : info.thumburl ?? info.url,
    width: info.width,
    height: info.height,
    ...(info.duration ? { durationSec: info.duration } : {}),
    ...(info.size ? { byteSize: info.size } : {}),
    author,
    provider: 'wikimedia',
    sourceUrl: info.descriptionurl ?? `https://commons.wikimedia.org/?curid=${page.pageid}`,
    license: { name: licenseName, url: licenseUrl },
    credit: author ? `${mediaLabel} by ${author} on Wikimedia Commons` : `${mediaLabel} from Wikimedia Commons`,
  };
}

async function wikimediaSearch(q: string, type: StockKind, page: number, per: number): Promise<StockPage> {
  const query = type === 'video'
    ? `${q} filemime:video/webm`
    : type === 'sticker'
      ? `${q} icon transparent`
      : q;
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  for (const [key, value] of Object.entries({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '6',
    gsrlimit: String(per),
    gsroffset: String((page - 1) * per),
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|size|mime',
    iiurlwidth: '1600',
    iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|UsageTerms|Credit',
    format: 'json',
    formatversion: '2',
    origin: '*',
  })) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: { 'Api-User-Agent': 'Pireel/1.0 (https://pireel.com)' } });
  if (!response.ok) throw new Error(`wikimedia ${response.status}`);
  const body = (await response.json()) as { continue?: { gsroffset?: number }; query?: { pages?: WikimediaPage[] } };
  const items = (body.query?.pages ?? [])
    .sort((a, b) => (a.index ?? Number.MAX_SAFE_INTEGER) - (b.index ?? Number.MAX_SAFE_INTEGER))
    .map((candidate) => normalizeWikimediaPage(candidate, type))
    .filter((candidate): candidate is StockItem => !!candidate);
  return { items, page, hasMore: typeof body.continue?.gsroffset === 'number', provider: 'wikimedia' };
}

/* ============================ Entry ============================ */

/** Whether any stock provider is configured (for routes/frontend empty state). */
export function stockConfigured(): boolean {
  // Wikimedia Commons is the no-key, license-audited fallback.
  return true;
}

/**
 * Search stock media: images/videos prefer Pexels (steadier quality), Pixabay fallback;
 * stickers are Pixabay-only (Pexels has no vector category) — with no Pixabay key, returns an empty page (panel hides that section).
 * With no commercial-provider key, Wikimedia Commons is the license-audited fallback.
 */
export async function searchStock(q: string, type: StockKind, page = 1, per = 24): Promise<StockPage> {
  const pexels = process.env.PEXELS_API_KEY;
  const pixabay = process.env.PIXABAY_API_KEY;
  if (type === 'sticker') {
    if (pixabay) {
      try {
        const result = await pixabaySearch(pixabay, q, type, page, per);
        if (result.items.length) return result;
      } catch {
        // Fall through to the no-key Commons catalog.
      }
    }
    return wikimediaSearch(q, type, page, per);
  }
  if (pexels) {
    try {
      const result = await pexelsSearch(pexels, q, type, page, per);
      if (result.items.length) return result;
    } catch {
      // Provider outage or quota exhaustion must not remove all online search.
    }
  }
  if (pixabay) {
    try {
      const result = await pixabaySearch(pixabay, q, type, page, per);
      if (result.items.length) return result;
    } catch {
      // Fall through to Wikimedia Commons.
    }
  }
  return wikimediaSearch(q, type, page, per);
}
