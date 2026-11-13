import { studioProviders } from '@pireel/studio-engine/providers';
/**
 * Google Fonts → inline @font-face (base64 data:).
 *
 * A foreignObject SVG rasterized as <img> can't load any external resource, so fonts must be embedded
 * as data: URIs. All 4 weights of Noto Sans SC ≈ 15-20MB (larger after base64), so an export fetches
 * only the subsets hit by "used code points ∩ each subset's unicode-range". A long talk still uses
 * most of them (a 44-minute recording: 1,075 distinct characters, 11 MB of rules), and an image
 * keeps its whole address in memory for as long as it lives, so each image carries only the rules
 * its own text asks for (fontRulesFor): a caption line needs a few hundred KB of them.
 */

import { registeredLocalFontFace } from './local-font-access';
import { DEFAULT_CJK_PARTNER_ID, fontStylesheetUrlFor, webFontIdOf } from '@pireel/studio-engine/font-library';
import { googleFontRowOf } from '@pireel/studio-engine/google-fonts';

export interface FontFace {
  family: string;
  style: string;
  weight: string;
  /** unicode-range parsed into a [start, end] list; no declaration = null (keep all). */
  ranges: [number, number][] | null;
  url: string;
}

/** One inlined @font-face rule, with what it serves kept beside its text. */
export interface InlineFontRule {
  family: string;
  style: string;
  /** One weight ("500") or a range ("100 900"), as the rule declares it. */
  weight: string;
  /** unicode-range as [start, end] pairs; null = the rule serves every character. */
  ranges: [number, number][] | null;
  css: string;
}

/** What one run of drawn text asks of the fonts. */
export interface FontRequest {
  /** The computed family list, in order; generic and system names are simply not found. */
  families: string[];
  weight: number;
  style: string;
  text: string;
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

/**
 * Markup that touches one inlined face with every glyph the export will draw, per face.
 *
 * Each exported frame is a fresh SVG image document; its data: @font-face rules decode lazily, on
 * first layout of text in that face. A frame painted before a face finished decoding shows the
 * fallback font — the whole first frame, and later one character in one frame when a chunk (one
 * unicode-range rule) is first reached mid-video. Rasterizing these once up front, and keeping the
 * images until the export ends, holds every rule decoded in the browser's memory, so real frames
 * only meet warm rules. One image per face keeps each of them small.
 */
export function fontWarmups(rules: readonly InlineFontRule[], text: string): { rules: InlineFontRule[]; markup: string }[] {
  const faces = new Map<string, InlineFontRule[]>();
  for (const rule of rules) {
    const key = `${rule.family}|${rule.style}|${rule.weight}`;
    const face = faces.get(key);
    if (face) face.push(rule);
    else faces.set(key, [rule]);
  }
  if (!faces.size) return [];
  const glyphs = [...new Set([...text.replace(/\s+/gu, '')])].join('').slice(0, 2_000);
  const sample = (glyphs + glyphs.toUpperCase() + glyphs.toLowerCase())
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return [...faces.values()].map((face) => {
    const { family, style, weight } = face[0]!;
    // A range like "200 700" needs one concrete weight to request; the middle keeps a variable face honest.
    const range = /^(\d+)\s+(\d+)$/.exec(weight);
    const w = range ? Math.round((Number(range[1]) + Number(range[2])) / 2) : weight;
    return {
      rules: face,
      markup: `<div xmlns="http://www.w3.org/1999/xhtml" style="position:absolute;left:0;top:0;width:100%;font-size:24px;line-height:1;white-space:pre-wrap;word-break:break-all;opacity:0.01;"><span style="font-family:'${family.replaceAll("'", '')}';font-style:${style};font-weight:${w};">${sample}</span></div>`,
    };
  });
}

/** The rules as one stylesheet. */
export function fontRulesCss(rules: readonly InlineFontRule[]): string {
  return rules.map((rule) => rule.css).join('\n');
}

const WEIGHT_NAMES: Record<string, number> = { normal: 400, bold: 700 };

function weightSpan(weight: string): [number, number] {
  const parts = weight.trim().split(/\s+/).map((part) => WEIGHT_NAMES[part] ?? Number(part));
  const low = Number.isFinite(parts[0]) ? parts[0]! : 400;
  const high = Number.isFinite(parts[1]) ? parts[1]! : low;
  return [Math.min(low, high), Math.max(low, high)];
}

/** The declared weights the browser would draw `wanted` with, by the CSS font matching order:
 *  a face that covers it; else for 400–500 the next heavier up to 500, then lighter, then heavier;
 *  below 400 lighter first, above 500 heavier first. */
export function matchedFontWeights(declared: readonly string[], wanted: number): string[] {
  const spans = [...new Set(declared)].map((weight) => ({ weight, span: weightSpan(weight) }));
  const covering = spans.filter(({ span }) => span[0] <= wanted && wanted <= span[1]);
  if (covering.length) return covering.map(({ weight }) => weight);
  const nearest = (side: 'lighter' | 'heavier', limit = Infinity) => {
    const pool = spans.filter(({ span }) => (side === 'lighter' ? span[1] < wanted : span[0] > wanted && span[0] <= limit));
    if (!pool.length) return [];
    const edge = side === 'lighter' ? Math.max(...pool.map(({ span }) => span[1])) : Math.min(...pool.map(({ span }) => span[0]));
    return pool.filter(({ span }) => (side === 'lighter' ? span[1] : span[0]) === edge).map(({ weight }) => weight);
  };
  const order = wanted < 400
    ? [nearest('lighter'), nearest('heavier')]
    : wanted > 500
      ? [nearest('heavier'), nearest('lighter')]
      : [nearest('heavier', 500), nearest('lighter'), nearest('heavier')];
  return order.find((found) => found.length) ?? [];
}

const SPACE = 0x20;
const STYLE_ORDER: Record<string, string[]> = {
  normal: ['normal', 'oblique', 'italic'],
  italic: ['italic', 'oblique', 'normal'],
  oblique: ['oblique', 'italic', 'normal'],
};
const styleKind = (style: string) => (/^italic/i.test(style.trim()) ? 'italic' : /^oblique/i.test(style.trim()) ? 'oblique' : 'normal');

/**
 * The rules an image needs to draw `requests`, in their original order: for every family a run
 * names, the style and weight the browser's own matching would pick among that family's rules, and
 * of those only the rules holding one of the run's characters (in either case, for text-transform).
 * Every family in the list is served, since a face may lack a glyph its range promises.
 *
 * The rule holding the space character always comes along: the browser takes a line's height and
 * baseline from the first font of the list that has a space, so a run of Chinese alone, drawn
 * without it, measured against the next font and sat a few pixels off.
 */
export function fontRulesFor(rules: readonly InlineFontRule[], requests: readonly FontRequest[]): InlineFontRule[] {
  const byFamily = new Map<string, InlineFontRule[]>();
  for (const rule of rules) {
    const key = rule.family.toLowerCase();
    const family = byFamily.get(key);
    if (family) family.push(rule);
    else byFamily.set(key, [rule]);
  }
  const needed = new Set<InlineFontRule>();
  for (const request of requests) {
    const glyphs = request.text.replace(/\s+/gu, '');
    if (!glyphs) continue;
    const points = new Set<number>([SPACE]);
    for (const char of glyphs + glyphs.toUpperCase() + glyphs.toLowerCase()) points.add(char.codePointAt(0)!);
    for (const name of request.families) {
      const family = byFamily.get(name.toLowerCase());
      if (!family) continue;
      const kinds = STYLE_ORDER[styleKind(request.style)]!;
      const kind = kinds.find((candidate) => family.some((rule) => styleKind(rule.style) === candidate));
      const styled = family.filter((rule) => styleKind(rule.style) === kind);
      const weights = new Set(matchedFontWeights(styled.map((rule) => rule.weight), request.weight));
      for (const rule of styled) {
        if (!weights.has(rule.weight) || needed.has(rule)) continue;
        if (!rule.ranges) { needed.add(rule); continue; }
        for (const point of points) {
          if (rule.ranges.some(([low, high]) => point >= low && point <= high)) { needed.add(rule); break; }
        }
      }
    }
  }
  return rules.filter((rule) => needed.has(rule));
}

/** A computed font-family value as names: `"Noto Sans SC", system-ui` → ['Noto Sans SC', 'system-ui']. */
export function fontFamilyNames(value: string): string[] {
  const names: string[] = [];
  for (const match of value.matchAll(/\s*(?:"([^"]*)"|'([^']*)'|([^,]+))\s*(?:,|$)/g)) {
    const name = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    if (name) names.push(name);
  }
  return names;
}

/** The font properties read off an element, or one of its generated boxes. */
export interface FontStyleRead {
  fontFamily: string;
  fontWeight: string;
  fontStyle: string;
  content?: string;
}

const SILENT_TAGS = /^(script|style|template|noscript)$/i;
const PRINTABLE_ASCII = Array.from({ length: 95 }, (_, index) => String.fromCharCode(32 + index)).join('');

/**
 * What the text drawn under `elements` asks of the fonts: one request per distinct family list,
 * weight and style, with every character drawn that way. `generated` also reads the ::before and
 * ::after boxes (only worth its cost when a stylesheet gives one a text); a counter or attr() there
 * may print anything, so it asks for the whole printable ASCII range.
 */
export function fontRequestsIn(
  elements: readonly Element[],
  styleOf: (element: Element, pseudo?: string) => FontStyleRead,
  generated = false,
): FontRequest[] {
  const requests = new Map<string, FontRequest>();
  const ask = (style: FontStyleRead, text: string) => {
    if (!text.trim()) return;
    const weight = WEIGHT_NAMES[style.fontWeight] ?? (Number(style.fontWeight) || 400);
    const key = `${style.fontFamily}|${weight}|${style.fontStyle}`;
    const request = requests.get(key);
    if (request) request.text += text;
    else requests.set(key, { families: fontFamilyNames(style.fontFamily), weight, style: style.fontStyle, text });
  };
  const visit = (element: Element) => {
    if (SILENT_TAGS.test(element.tagName)) return;
    let own = '';
    for (const child of Array.from(element.childNodes)) {
      if (child.nodeType === 3) own += child.nodeValue ?? '';
      else if (child.nodeType === 1) visit(child as Element);
    }
    if (own.trim()) ask(styleOf(element), own);
    if (!generated) return;
    for (const pseudo of ['::before', '::after']) {
      const style = styleOf(element, pseudo);
      const content = style.content ?? '';
      if (!content || content === 'none' || content === 'normal') continue;
      const quoted = [...content.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g)].map((match) => match[1] ?? match[2] ?? '').join('');
      ask(style, /\b(?:counters?|attr)\(/.test(content) ? quoted + PRINTABLE_ASCII : quoted);
    }
  };
  for (const element of elements) visit(element);
  return [...requests.values()];
}

/** Whether any stylesheet of the document gives a ::before or ::after box a text of its own. */
export function documentGeneratesText(document: Document): boolean {
  const inRules = (rules: CSSRuleList): boolean => {
    for (const rule of Array.from(rules)) {
      const style = (rule as CSSStyleRule).style as CSSStyleDeclaration | undefined;
      const selector = (rule as CSSStyleRule).selectorText as string | undefined;
      if (style && selector && /:(?:before|after)\b/.test(selector)) {
        const content = style.getPropertyValue('content').trim();
        if (/["'][^"']|\b(?:counters?|attr)\(/.test(content)) return true;
      }
      const nested = (rule as CSSGroupingRule).cssRules as CSSRuleList | undefined;
      if (nested?.length && inRules(nested)) return true;
    }
    return false;
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      if (inRules(sheet.cssRules)) return true;
    } catch {
      // A stylesheet from another origin cannot be read; it cannot be inlined into the image either.
    }
  }
  return false;
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

async function buildInlineLocalFonts(
  families: string[],
  log: (m: string) => void,
): Promise<InlineFontRule[]> {
  const unique = [...new Set(families.map((family) => family.trim()).filter(Boolean))];
  if (!unique.length) return [];
  const parts = await Promise.all(unique.map(async (family): Promise<InlineFontRule | null> => {
    const face = registeredLocalFontFace(family);
    if (!face) {
      log(`local font unavailable for export: ${family}`);
      return null;
    }
    try {
      const blob = await face.blob();
      const bytes = await blob.arrayBuffer();
      const mime = blob.type || 'font/ttf';
      const cssFamily = family.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
      log(`local font embedded: ${family} · ${(bytes.byteLength / 1024 / 1024).toFixed(2)}MB`);
      const css = `@font-face{font-family:"${cssFamily}";font-style:normal;font-weight:100 900;src:url(data:${mime};base64,${toBase64(bytes)})}`;
      return { family, style: 'normal', weight: '100 900', ranges: null, css };
    } catch {
      log(`local font bytes unavailable for export: ${family}`);
      return null;
    }
  }));
  return parts.filter((rule): rule is InlineFontRule => rule !== null);
}

/**
 * Fetch a Google Fonts resource, same-origin proxy FIRST: Google's `/l/font` (text= subset)
 * endpoint doesn't reliably send Access-Control-Allow-Origin, so a direct browser fetch CORS-fails
 * even in normal Chrome — the host media proxy fetches it server-side (no CORS, works in
 * restricted in-app browsers too, and read-through-caches font binaries into R2). Direct fetch is
 * the fallback for shells with no backend (OSS). Returns null if both fail (degrade to system fonts).
 */
async function fetchFontOnce(url: string): Promise<Response | null> {
  try {
    const r = await fetch(studioProviders().mediaProxyUrl?.(url) ?? url);
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

/** A chunked library face is dozens of small requests per export; one dropped connection used to
 *  silently lose every glyph in that chunk (the text fell back to the system face for those
 *  characters only, which reads as "the font came out half wrong"). Retry before giving up. */
async function fetchFont(url: string, attempts = 3): Promise<Response | null> {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const res = await fetchFontOnce(url);
    if (res) return res;
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
  }
  return null;
}

const rangeDecl = (f: FontFace) => (f.ranges
  ? `unicode-range:${f.ranges.map(([a, b]) => (a === b ? `U+${a.toString(16)}` : `U+${a.toString(16)}-${b.toString(16)}`)).join(',')};`
  : '');

const inlineRule = (f: FontFace, css: string): InlineFontRule => ({ family: f.family, style: f.style, weight: f.weight, ranges: f.ranges, css });

/** Library ("花字") web fonts: same unicode-range hit test over cn-font-split's chunked CSS, chunks
 *  inlined as data: URIs. A 13MB face costs only the blocks the used glyphs fall in. */
async function buildInlineWebFonts(
  webFontIds: string[],
  used: Set<number>,
  log: (m: string) => void,
): Promise<InlineFontRule[]> {
  // Library ids and google:<Family> ids alike: each resolves to one stylesheet whose @font-face rules are subset-tested.
  const ids = [...new Set(webFontIds.filter((id) => webFontIdOf(id) !== null || googleFontRowOf(id) !== null))];
  if (!ids.length) return [];
  const parts = await Promise.all(ids.map(async (id) => {
    const cssUrl = fontStylesheetUrlFor(id)!;
    const res = await fetchFont(cssUrl);
    if (!res) {
      log(`web font css unavailable for export: ${id}`);
      return [];
    }
    const faces = parseFontFaces(await res.text(), cssUrl);
    const kept = faces.filter((f) => !f.ranges || f.ranges.some(([lo, hi]) => { for (const cp of used) if (cp >= lo && cp <= hi) return true; return false; }));
    const rules = await Promise.all(kept.map(async (f) => {
      const buf = await fetchFont(f.url).then((response) => response?.arrayBuffer() ?? null).catch(() => null);
      if (!buf) {
        log(`web font chunk FAILED (glyphs in it fall back): ${id} ${f.url.split('/').pop()}`);
        return null;
      }
      return inlineRule(f, `@font-face{font-family:"${f.family}";font-style:${f.style};font-weight:${f.weight};src:url(data:font/woff2;base64,${toBase64(buf)}) format('woff2');${rangeDecl(f)}}`);
    }));
    const embedded = rules.filter((rule): rule is InlineFontRule => rule !== null);
    log(`web font embedded: ${id} · ${embedded.length} of ${faces.length} chunks`);
    return embedded;
  }));
  return parts.flat();
}

/**
 * Build the inline font rules: fetch css2 → keep subsets hit by usedText's code points → fetch each woff2 and base64 it.
 * Each rule is an @font-face ready to drop into an SVG <style>; an image takes the ones its text asks for.
 */
export async function buildInlineFonts(
  usedText: string,
  log: (m: string) => void = () => {},
  localFamilies: string[] = [],
  webFontIds: string[] = [],
): Promise<InlineFontRule[]> {
  const t0 = performance.now();
  // DOM textContent keeps formatting newlines even when the composition has no visible text.
  // Asking Google Fonts for text="\n" returns unusable dynamic-subset URLs in some UAs and makes
  // a video-only frame wait on a set of doomed font requests. Whitespace has no glyph to embed.
  const glyphText = usedText.replace(/\s+/gu, '');
  if (!glyphText) {
    log('font inlining skipped: no visible glyphs');
    return [];
  }
  const usedCodePoints = new Set<number>();
  for (const ch of glyphText) usedCodePoints.add(ch.codePointAt(0)!);
  // A local (usually Latin-only) face is rendered with the CJK partner behind it (see
  // font-library): the export must carry the partner's glyph blocks too.
  // Local and Google faces both render with the CJK partner behind them: the export must carry its glyph blocks.
  const partnerNeeded = localFamilies.length > 0 || webFontIds.some((id) => googleFontRowOf(id) !== null);
  const webIds = partnerNeeded ? [...webFontIds, `web:${DEFAULT_CJK_PARTNER_ID}`] : webFontIds;
  const [localRules, webRules] = await Promise.all([
    buildInlineLocalFonts(localFamilies, log),
    buildInlineWebFonts(webIds, usedCodePoints, log),
  ]);
  // Exact subset: text= makes Google's server cut glyphs per character (a few hundred KB per CJK subset →
  // tens of KB total). A rule is part of every changed frame's SVG data URI that draws with it, so its
  // size multiplies directly into per-frame parse cost.
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
    // "Failed to fetch" here used to kill inspect_timeline outright.
    log('font CSS fetch failed — falling back to system fonts (no inlining)');
    return [...webRules, ...localRules];
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
      if (!buf) return null; // one woff2 failing (blocked/flaky) shouldn't kill the whole capture/export
      return inlineRule(f, `@font-face{font-family:'${f.family}';font-style:${f.style};font-weight:${f.weight};src:url(data:font/woff2;base64,${toBase64(buf)}) format('woff2');${rangeDecl(f)}}`);
    }),
  );
  const rules = [...parts.filter((rule): rule is InlineFontRule => rule !== null), ...webRules, ...localRules];
  const size = rules.reduce((sum, rule) => sum + rule.css.length, 0);
  log(`font inlining done: ${(size / 1024 / 1024).toFixed(2)}MB css · ${((performance.now() - t0) / 1000).toFixed(2)}s`);
  return rules;
}
