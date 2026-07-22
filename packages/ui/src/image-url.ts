/**
 * Image URL thumbnailing / formatting helper.
 *
 * Single domain: both originals and transforms live on cdn.pireel.com (R2 custom domain);
 * transforms use Cloudflare Image Transformations' built-in URL format:
 *   original:  cdn.pireel.com/<key>
 *   transform: cdn.pireel.com/cdn-cgi/image/width=W[,height=H,fit=cover],format=auto/<key>
 * Prereq: enable Images → Transformations on the zone, and allow cdn.pireel.com in allowed origins.
 *
 * Frontend display goes through imageThumb() with size presets; 'original' reads the original directly
 * (doesn't burn transform quota).
 *
 * Config: VITE_IMG_SOURCE_BASE. Unset → returns the input as-is (dev / not wired up).
 */

// Read from both sides: if process.env has the key *defined* (even ''), use it (workerd nodejs_compat /
// vitest / scripts; vi.stubEnv(key,'') simulates "unconfigured"); only fall back to import.meta.env
// (browser, injected by Vite) when it's undefined. Don't branch on process existence — TanStack Start
// dev injects a process global into the browser containing only TSS_*, which would read VITE_* as empty.
function readEnv(viteKey: string): string {
  const fromProcess =
    typeof process !== 'undefined' && process.env ? process.env[viteKey] : undefined;
  if (fromProcess !== undefined) return fromProcess;
  return (
    (import.meta as unknown as { env?: Record<string, string> }).env?.[viteKey] || ''
  );
}
/** Display CDN (cdn.pireel.com). Server-side reads should all go through here — don't read env directly. */
export function imgSourceBase(): string {
  return readEnv('VITE_IMG_SOURCE_BASE').replace(/\/$/, '');
}
const readSourceBase = imgSourceBase;

/** Whitelist of our own storage / CDN hosts — URLs on other hosts aren't transformed (external reference
 *  images, provider temp URLs, etc.). img.pireel.com is retired, kept here only to parse the key out of
 *  historical full URLs. */
const OUR_HOSTS = new Set(['cdn.pireel.com', 'img.pireel.com']);

/**
 * Normalize the input into an s3 key:
 *   - bare key (no protocol) → returned as the key directly
 *   - data: / blob: → null (can't transform)
 *   - full URL: whitelisted host → path as key; external host → null (no transform)
 */
function extractKey(input: string): string | null {
  if (!input) return null;
  if (/^(data|blob):/.test(input)) return null;
  // Site-relative paths ('/local-assets/…' and similar local-asset routes): these are URLs, not bare keys,
  // pass through as-is — stripping the leading slash would make the browser resolve against the current
  // page path and 404 the image (hit this in the OSS shell).
  if (input.startsWith('/')) return null;
  if (!input.includes('://')) {
    // bare key (new DB format: 'creations/u_x/cre_y-0.png')
    return input.replace(/^\//, '');
  }
  try {
    const u = new URL(input);
    if (!OUR_HOSTS.has(u.hostname)) return null;
    // Already a transform URL (/cdn-cgi/image/<opts>/<key>) → strip the prefix back to the bare key, avoiding double transform
    return u.pathname.replace(/^\//, '').replace(/^cdn-cgi\/image\/[^/]+\//, '');
  } catch {
    return null;
  }
}

/** Sizing rule: preset width/height ≥ 2× the max render size for that scenario (sharp on Retina).
 *  Render sizes are hard-coded, no runtime math — if you change a DOM size somewhere, come back and reconcile. */
export const IMAGE_PRESETS = {
  /** small inline pill icon, max render 28×28 → 2× = 56 */
  inline: { w: 56, h: 56 },
  /** list-row/grid thumbnail, max render 88×88 (chat image group), typically 36~64 → 2× ≈ 192 */
  thumb: { w: 192, h: 192 },
  /** aspect-preserving thumbnail (no crop, studio generation-panel output strip), height 112 → ~200 wide at 16:9 → 2× = 400 */
  strip: { w: 400, h: 0 },
  /** card cover (project/template/asset/landing), card can stretch to ~480 CSS px wide → 2× = 960 */
  list: { w: 960, h: 0 },
  /** pill-hover large image, lightbox startup thumbnail, max render ~512 wide → 2× = 1024 */
  preview: { w: 1024, h: 0 },
  /** canvas image strip (height 320, container width fluid, ~570 wide at 16:9) → 2× ≈ 1280 */
  canvas: { w: 1280, h: 0 },
} as const;

export type ImagePreset = keyof typeof IMAGE_PRESETS | 'original';

/**
 * Get a transform URL at a semantic size. Accepts:
 *   - bare s3 key (new DB format, e.g. 'creations/u_x/cre_y-0.png') → prefixed with the cdn host
 *   - full URL on OUR_HOSTS (historical data) → key extracted, then prefixed with the cdn host
 *   - external URL (reference image / provider temp link / dataURL) → returned as-is, no transform
 *
 * 'original' reads the original URL directly, no transform (full-size cases needn't burn transform quota).
 * SOURCE_BASE unset → returns the bare key (dev fallback, browser handles it).
 */
export function imageThumb(
  url: string | undefined | null,
  preset: ImagePreset,
): string {
  if (!url) return '';
  const key = extractKey(url);
  // Not our image (external URL) — skip transform, return as-is
  if (!key) return url;

  const sourceBase = readSourceBase().replace(/\/$/, '');
  if (!sourceBase) return key;

  if (preset === 'original') return `${sourceBase}/${key}`;
  const cfg = IMAGE_PRESETS[preset];
  const opts = [
    `width=${cfg.w}`,
    ...(cfg.h > 0 ? [`height=${cfg.h}`, 'fit=cover'] : []),
    'format=auto',
  ].join(',');
  // Cloudflare Image Transformations built-in URL format (same domain, no separate transform service)
  return `${sourceBase}/cdn-cgi/image/${opts}/${key}`;
}
