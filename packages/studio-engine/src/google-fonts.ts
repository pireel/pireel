/**
 * Google Fonts as a font source: `google:<Family>` ids over the offline catalog snapshot.
 *
 * The self-hosted library (font-library.ts) stays the home of CJK display faces; Google supplies
 * the long tail of Latin faces and the CJK families the library does not carry. A Google face is
 * loaded through the css2 endpoint and, like a local face, gets the library's CJK partner behind
 * it so Han glyphs never fall back to the system body font. This module must not import
 * font-library (font-library imports it to build stylesheet URLs).
 */
import { GOOGLE_FONTS, type GoogleFontRow } from './google-fonts-catalog';

export type { GoogleFontRow } from './google-fonts-catalog';

export const GOOGLE_FONT_PREFIX = 'google:';

const BY_KEY = new Map(GOOGLE_FONTS.map((row) => [row.f.toLowerCase(), row]));

/** `google:<family>` → the catalog row (family matched case-insensitively); null for anything else. */
export function googleFontRowOf(value: unknown): GoogleFontRow | null {
  if (typeof value !== 'string' || !value.startsWith(GOOGLE_FONT_PREFIX)) return null;
  return BY_KEY.get(value.slice(GOOGLE_FONT_PREFIX.length).trim().toLowerCase()) ?? null;
}

export function googleFontFontId(row: GoogleFontRow): `google:${string}` {
  return `${GOOGLE_FONT_PREFIX}${row.f}`;
}

/** Canonical id for a family the user or agent typed loosely; null when Google does not carry it. */
export function resolveGoogleFontReference(value: unknown): `google:${string}` | null {
  const row = googleFontRowOf(value);
  return row ? googleFontFontId(row) : null;
}

/** The css2 request that loads every upright weight of the family (variable fonts as one range). */
export function googleFontCssUrl(row: GoogleFontRow): string {
  const weights = row.v ? `${row.w[0]}..${row.w[row.w.length - 1]}` : row.w.join(';');
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(row.f).replace(/%20/g, '+')}:wght@${weights}&display=swap`;
}

/** Quoted family for a CSS stack. */
export function googleFontFamilyCss(value: unknown): string | null {
  const row = googleFontRowOf(value);
  return row ? `"${row.f.replaceAll('"', '\\"')}"` : null;
}

export const SCRIPT_BIT = { latin: 1, 'zh-Hans': 2, 'zh-Hant': 4, ja: 8, ko: 16 } as const;
export type FontScript = keyof typeof SCRIPT_BIT;
export type FontCategory = GoogleFontRow['c'];

export interface FontSearchHit {
  /** The id every text surface accepts: web:<id> (library) or google:<Family>. */
  id: string;
  family: string;
  /** Library faces carry their Chinese label; Google faces repeat the family. */
  label: string;
  source: 'library' | 'google';
  category?: FontCategory;
  scripts: FontScript[];
  weights?: number[];
  variable?: boolean;
}

export interface FontSearchOptions {
  script?: FontScript;
  category?: FontCategory;
  limit?: number;
}

function scriptsOf(bits: number): FontScript[] {
  return (Object.keys(SCRIPT_BIT) as FontScript[]).filter((key) => bits & SCRIPT_BIT[key]);
}

/** Faces carrying ANY of the given script bits (SCRIPT_BIT values OR-ed), optionally matched on a family
 *  substring, in popularity order. The picker lists a locale's natural faces this way: 2|4 for a Chinese
 *  UI, 1 for a Latin UI. */
export function googleFontsForScripts(bits: number, query = '', limit = 24): GoogleFontRow[] {
  const needle = query.trim().toLowerCase();
  const out: GoogleFontRow[] = [];
  for (const row of GOOGLE_FONTS) {
    if (!(row.s & bits)) continue;
    if (needle && !row.f.toLowerCase().includes(needle)) continue;
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}

/** Search the Google snapshot by family substring, optionally narrowed by script and category, ranked by
 *  Google popularity. An empty query lists the most used families that pass the filters. The library
 *  half of a combined search lives in font-library.ts (it needs WEB_FONTS). */
export function searchGoogleFonts(query: string, options: FontSearchOptions = {}): FontSearchHit[] {
  const needle = query.trim().toLowerCase();
  const scriptBit = options.script ? SCRIPT_BIT[options.script] : 0;
  const limit = Math.min(Math.max(options.limit ?? 12, 1), 40);
  const hits: FontSearchHit[] = [];
  for (const row of GOOGLE_FONTS) {
    if (scriptBit && !(row.s & scriptBit)) continue;
    if (options.category && row.c !== options.category) continue;
    if (needle && !row.f.toLowerCase().includes(needle)) continue;
    hits.push({ id: googleFontFontId(row), family: row.f, label: row.f, source: 'google', category: row.c, scripts: scriptsOf(row.s), weights: row.w, ...(row.v ? { variable: true } : {}) });
    if (hits.length >= limit) break;
  }
  return hits;
}
