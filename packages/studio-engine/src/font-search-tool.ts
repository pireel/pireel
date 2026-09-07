/** search_fonts — one pure body shared by every surface (MCP server-direct, offline executor, browser runner). */
import { searchFonts } from './font-library';
import type { FontCategory, FontScript, FontSearchHit } from './google-fonts';

const SCRIPTS = new Set<string>(['latin', 'zh-Hans', 'zh-Hant', 'ja', 'ko']);
const CATEGORIES = new Set<string>(['sans', 'serif', 'display', 'handwriting', 'mono']);

export interface FontSearchToolResult {
  ok: true;
  summary: string;
  data: { query: string; fonts: FontSearchHit[]; usageHint: string };
  /** Bridge/MCP result shapes are open records. */
  [key: string]: unknown;
}

export function searchFontsTool(input: Record<string, unknown>): FontSearchToolResult {
  const query = typeof input.query === 'string' ? input.query.trim().slice(0, 120) : '';
  const script = typeof input.script === 'string' && SCRIPTS.has(input.script) ? (input.script as FontScript) : undefined;
  const category = typeof input.category === 'string' && CATEGORIES.has(input.category) ? (input.category as FontCategory) : undefined;
  const limit = typeof input.limit === 'number' && Number.isFinite(input.limit) ? Math.round(input.limit) : undefined;
  const fonts = searchFonts(query, { ...(script ? { script } : {}), ...(category ? { category } : {}), ...(limit ? { limit } : {}) });
  return {
    ok: true,
    summary: fonts.length ? `${fonts.length} fonts` : 'no font matched',
    data: {
      query,
      fonts,
      usageHint: 'Use the id verbatim as a font value (set_texts/add_texts fontFamily, set_captions font, compose_component/compose_block_brief fontFamily). Library faces cover Chinese; a Google face renders Chinese through the library partner face automatically.',
    },
  };
}
