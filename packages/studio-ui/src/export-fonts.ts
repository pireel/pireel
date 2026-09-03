/**
 * Google Fonts → inline @font-face (base64 data:).
 *
 * A foreignObject SVG rasterized as <img> can't load any external resource, so fonts must be embedded
 * as data: URIs. All 4 weights of Noto Sans SC ≈ 15-20MB (larger after base64), unacceptable to splice
 * into the SVG string every frame → embed only the subsets hit by "used code points ∩ each subset's
 * unicode-range" (for common CJK that's just a few, ~a few hundred KB). The result string is cached and reused for the whole export.
 */

import { registeredLocalFontFace } from './local-font-access';
import { DEFAULT_CJK_PARTNER_ID, webFontCssUrl, webFontIdOf } from '@pireel/studio-engine/font-library';

export interface FontFace {
  family: string;
  style: string;
  weight: string;
  /** unicode-range parsed into a [start, end] list; no declaration = null (keep all). */
  ranges: [number, number][] | null;
  url: string;
}

/** The css2 request equivalent to the Google Fonts link in assembleHtml's head (kept in sync with assemble's STUDIO_FONTS_HREF). */
export const FONT_CSS_URL =
  'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700;900&family=Noto+Serif+SC:wght@700;900&family=IBM+Plex+Mono:wght@500;600&display=swap';

function parseRange(spec: string): [number, number] | null {
  const s = spec.trim().toUpperCase();
  // U+4E00-9FFF / U+2000 / U+4?? (wildcard)
  const m = /^U\+([0-9A-F?]+)(?:-([0-9A-F]+))?$/.exec(s);
  if (!m) return null;
  if (m[1].includes('?')) {
    const lo = parseInt(m[1].replace(/\?/g, '0'), 16);
    const hi = parseInt(m[1].replace(/\?/g, 'F'), 16);
    return [lo, hi];
  }
  const lo = parseInt(m[1], 16);
  return [lo, m[2] ? parseInt(m[2], 16) : lo];
}

export function parseFontFaces(css: string, baseUrl?: string): FontFace[] {
  const faces: FontFace[] = [];
  for (const block of css.match(/@font-face\s*\{[^}]*\}/g) ?? []) {
    const family = /font-family:\s*['"]([^'"]+)['"]/.exec(block)?.[1];
    // Google: `src: url(...)`. cn-font-split: `src:local("F"),url("./hash.woff2")format("woff2")` —
    // take the first url() wherever it sits and resolve it against the stylesheet's own URL.
    const rawUrl = /url\(\s*['"]?([^'")]+)['"]?\s*\)/.exec(/src:\s*([^;]+);/.exec(block)?.[1] ?? '')?.[1];
    const url = rawUrl && baseUrl ? new URL(rawUrl, baseUrl).toString() : rawUrl;
    if (!family || !url) continue;
    const style = /font-style:\s*([^;]+);/.exec(block)?.[1]?.trim() ?? 'normal';
    const weight = /font-weight:\s*([^;]+);/.exec(block)?.[1]?.trim() ?? '400';
    const rangeDecl = /unicode-range:\s*([^;]+);/.exec(block)?.[1];
    const ranges = rangeDecl
      ? (rangeDecl.split(',').map(parseRange).filter(Boolean) as [number, number][])
      : null;
    faces.push({ family, style, weight, ranges, url });
  }
  return faces;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

async function buildInlineLocalFontCss(
  families: string[],
  log: (m: string) => void,
): Promise<string> {
  const unique = [...new Set(families.map((family) => family.trim()).filter(Boolean))];
  if (!unique.length) return '';
  const parts = await Promise.all(unique.map(async (family) => {
    const face = registeredLocalFontFace(family);
    if (!face) {
      log(`local font unavailable for export: ${family}`);
      return '';
    }
    try {
      const blob = await face.blob();
      const bytes = await blob.arrayBuffer();
      const mime = blob.type || 'font/ttf';
      const cssFamily = family.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
      log(`local font embedded: ${family} · ${(bytes.byteLength / 1024 / 1024).toFixed(2)}MB`);
      return `@font-face{font-family:"${cssFamily}";font-style:normal;font-weight:100 900;src:url(data:${mime};base64,${toBase64(bytes)})}`;
    } catch {
      log(`local font bytes unavailable for export: ${family}`);
      return '';
    }
  }));
  return parts.filter(Boolean).join('\n');
}

/**
 * Fetch a Google Fonts resource, same-origin proxy FIRST: Google's `/l/font` (text= subset)
 * endpoint doesn't reliably send Access-Control-Allow-Origin, so a direct browser fetch CORS-fails
 * even in normal Chrome — the `/api/media/fetch` proxy fetches it server-side (no CORS, works in
 * restricted in-app browsers too, and read-through-caches font binaries into R2). Direct fetch is
 * the fallback for shells with no backend (OSS). Returns null if both fail (degrade to system fonts).
 */
async function fetchFont(url: string): Promise<Response | null> {
  try {
    const r = await fetch(`/api/media/fetch?url=${encodeURIComponent(url)}`);
    if (r.ok) return r;
  } catch {
    /* proxy unreachable (e.g. OSS shell, no backend) → try direct */
  }
  try {
    const r = await fetch(url);
    if (r.ok) return r;
  } catch {
    /* external host blocked / CORS / offline → give up */
  }
  return null;
}

const rangeDecl = (f: FontFace) => (f.ranges
  ? `unicode-range:${f.ranges.map(([a, b]) => (a === b ? `U+${a.toString(16)}` : `U+${a.toString(16)}-${b.toString(16)}`)).join(',')};`
  : '');

/** Library ("花字") web fonts: same unicode-range hit test over cn-font-split's chunked CSS, chunks
 *  inlined as data: URIs. A 13MB face costs only the blocks the used glyphs fall in. */
async function buildInlineWebFontCss(
  webFontIds: string[],
  used: Set<number>,
  log: (m: string) => void,
): Promise<string> {
  const ids = [...new Set(webFontIds.map((id) => webFontIdOf(id) ?? '').filter(Boolean))];
  if (!ids.length) return '';
  const parts = await Promise.all(ids.map(async (id) => {
    const cssUrl = webFontCssUrl(id);
    const res = await fetchFont(cssUrl);
    if (!res) {
      log(`web font css unavailable for export: ${id}`);
      return '';
    }
    const faces = parseFontFaces(await res.text(), cssUrl);
    const kept = faces.filter((f) => !f.ranges || f.ranges.some(([lo, hi]) => { for (const cp of used) if (cp >= lo && cp <= hi) return true; return false; }));
    const rules = await Promise.all(kept.map(async (f) => {
      const buf = await fetchFont(f.url).then((response) => response?.arrayBuffer() ?? null).catch(() => null);
      if (!buf) return '';
      return `@font-face{font-family:"${f.family}";font-style:${f.style};font-weight:${f.weight};src:url(data:font/woff2;base64,${toBase64(buf)}) format('woff2');${rangeDecl(f)}}`;
    }));
    log(`web font embedded: ${id} · ${rules.filter(Boolean).length} of ${faces.length} chunks`);
    return rules.filter(Boolean).join('\n');
  }));
  return parts.filter(Boolean).join('\n');
}

/**
 * Build inline font CSS: fetch css2 → keep subsets hit by usedText's code points → fetch each woff2 and base64 it.
 * Returns an @font-face string ready to drop into an SVG <style>.
 */
export async function buildInlineFontCss(
  usedText: string,
  log: (m: string) => void = () => {},
  localFamilies: string[] = [],
  webFontIds: string[] = [],
): Promise<string> {
  const t0 = performance.now();
  // DOM textContent keeps formatting newlines even when the composition has no visible text.
  // Asking Google Fonts for text="\n" returns unusable dynamic-subset URLs in some UAs and makes
  // a video-only frame wait on a set of doomed font requests. Whitespace has no glyph to embed.
  const glyphText = usedText.replace(/\s+/gu, '');
  if (!glyphText) {
    log('font inlining skipped: no visible glyphs');
    return '';
  }
  const usedCodePoints = new Set<number>();
  for (const ch of glyphText) usedCodePoints.add(ch.codePointAt(0)!);
  // A local (usually Latin-only) face is rendered with the CJK partner behind it (see
  // font-library): the export must carry the partner's glyph blocks too.
  const webIds = localFamilies.length ? [...webFontIds, `web:${DEFAULT_CJK_PARTNER_ID}`] : webFontIds;
  const [localCss, webCss] = await Promise.all([
    buildInlineLocalFontCss(localFamilies, log),
    buildInlineWebFontCss(webIds, usedCodePoints, log),
  ]);
  // Exact subset: text= makes Google's server cut glyphs per character (a few hundred KB per CJK subset →
  // tens of KB total). The inline string is part of every changed frame's SVG data URI, so its size
  // multiplies directly into per-frame parse cost.
  // Include both cases (CSS text-transform can demand the other-case glyphs absent from textContent);
  // charset too large (URL limit) or request fails → fall back to the unicode-range hit method (old behavior).
  const uniq = [...new Set([...(glyphText + glyphText.toUpperCase() + glyphText.toLowerCase())])].join('');
  let res: Response | null = null;
  if (uniq.length > 0 && uniq.length <= 600) {
    res = await fetchFont(`${FONT_CSS_URL}&text=${encodeURIComponent(uniq)}`);
    if (res) log(`font exact subset: ${uniq.length} chars`);
  }
  if (!res) res = await fetchFont(FONT_CSS_URL);
  if (!res) {
    // Google Fonts unreachable even via the proxy (offline / OSS shell). Degrade to NO inlined fonts
    // instead of throwing: the frame/export still renders with system fallback fonts. A hard
    // "Failed to fetch" here used to kill capture_frame outright.
    log('font CSS fetch failed — falling back to system fonts (no inlining)');
    return [webCss, localCss].filter(Boolean).join('\n');
  }
  const faces = parseFontFaces(await res.text());

  const used = new Set<number>();
  for (const ch of glyphText) used.add(ch.codePointAt(0)!);
  const hit = (f: FontFace) =>
    !f.ranges || f.ranges.some(([lo, hi]) => { for (const cp of used) if (cp >= lo && cp <= hi) return true; return false; });

  const kept = faces.filter(hit);
  log(`font subset: ${kept.length} of ${faces.length} @font-face rules kept`);

  // Google commonly points several declared weights at the same exact-subset binary. Fetch each URL
  // once, then reuse the immutable bytes while preserving the separate @font-face declarations.
  const buffers = new Map<string, Promise<ArrayBuffer | null>>();
  const loadFont = (url: string) => {
    const known = buffers.get(url);
    if (known) return known;
    const pending = fetchFont(url)
      .then((response) => response?.arrayBuffer() ?? null)
      .catch(() => null);
    buffers.set(url, pending);
    return pending;
  };
  const parts = await Promise.all(
    kept.map(async (f) => {
      const buf = await loadFont(f.url);
      if (!buf) return ''; // one woff2 failing (blocked/flaky) shouldn't kill the whole capture/export
      return `@font-face{font-family:'${f.family}';font-style:${f.style};font-weight:${f.weight};src:url(data:font/woff2;base64,${toBase64(buf)}) format('woff2');${rangeDecl(f)}}`;
    }),
  );
  const css = [parts.filter(Boolean).join('\n'), webCss, localCss].filter(Boolean).join('\n');
  log(`font inlining done: ${(css.length / 1024 / 1024).toFixed(2)}MB css · ${((performance.now() - t0) / 1000).toFixed(2)}s`);
  return css;
}
