import { WEB_FONTS, fontStylesheetUrlFor, webFontById, webFontCssUrl } from '@pireel/studio-engine/font-library';
import { googleFontRowOf } from '@pireel/studio-engine/google-fonts';
import { displayFontContext } from '@pireel/studio-engine/display-text-presets';

/**
 * Load the web font library's stylesheets into the CURRENT document (the studio page).
 *
 * The preview document links the fonts a composition uses on its own (assemble.ts). The parent
 * needs them too: caption line splitting measures text with the parent's canvas — a face missing
 * here would wrap differently from the preview. Chunked CSS means loading every stylesheet is
 * cheap: glyph blocks are fetched only when text in that face is actually rendered or measured.
 * (The font picker itself never renders a library face — it shows baked SVG previews.)
 */
const stylesheetReady = new Map<string, Promise<void>>();
const LOAD_TIMEOUT_MS = 15_000;

/** Link one library font's stylesheet; resolves once the CSS has been parsed (or failed), so a
 * following `document.fonts.load` sees its @font-face rules. Idempotent per id. */
export function ensureWebFontStylesheet(id: string): Promise<void> {
  const known = stylesheetReady.get(id);
  if (known) return known;
  if (typeof document === 'undefined') return Promise.resolve();
  const existing = document.querySelector<HTMLLinkElement>(`link[data-web-font="${id}"]`);
  const ready = new Promise<void>((resolve) => {
    if (existing) {
      // Already in the document (SSR markup or an earlier mount): sheet parsed = ready.
      if (existing.sheet) resolve();
      else {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => resolve(), { once: true });
      }
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = webFontCssUrl(id);
    link.dataset.webFont = id;
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true });
    document.head.appendChild(link);
  });
  stylesheetReady.set(id, ready);
  return ready;
}

/** Link the stylesheet any library or Google font id needs (builtin/local ids need none). Same
 *  idempotence as ensureWebFontStylesheet; Google faces key by their css2 URL. */
export function ensureFontStylesheet(fontId: string): Promise<void> {
  const row = googleFontRowOf(fontId);
  if (!row) {
    const webId = fontId.startsWith('web:') ? fontId.slice(4) : null;
    return webId ? ensureWebFontStylesheet(webId) : Promise.resolve();
  }
  const href = fontStylesheetUrlFor(fontId)!;
  const known = stylesheetReady.get(href);
  if (known) return known;
  if (typeof document === 'undefined') return Promise.resolve();
  const ready = new Promise<void>((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.googleFont = row.f;
    link.addEventListener('load', () => resolve(), { once: true });
    link.addEventListener('error', () => resolve(), { once: true });
    document.head.appendChild(link);
  });
  stylesheetReady.set(href, ready);
  return ready;
}

const previewLinked = new Set<string>();

/** A Google face's own name set in that face, for the picker row: css2 with `text=` returns a
 *  subset of just those glyphs (a few KB), so listing dozens of families costs almost nothing and
 *  never pulls a whole font. */
export function ensureGoogleFontPreview(family: string): void {
  if (typeof document === 'undefined' || previewLinked.has(family)) return;
  previewLinked.add(family);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}&text=${encodeURIComponent(family)}&display=swap`;
  link.dataset.googleFontPreview = family;
  document.head.appendChild(link);
}

/** loadWebFont for any library or Google id: link the sheet, then wait for the sample's glyphs. */
export async function loadFont(fontId: string, sample?: string): Promise<void> {
  const context = displayFontContext(fontId);
  if (!context || (!fontId.startsWith('web:') && !fontId.startsWith('google:'))) return;
  await ensureFontStylesheet(fontId);
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  const text = (sample?.trim() || context.label).slice(0, 2_000);
  await Promise.race([
    document.fonts.load(`16px "${context.family}"`, text).catch(() => {}),
    new Promise<void>((resolve) => setTimeout(resolve, LOAD_TIMEOUT_MS)),
  ]);
}

export function ensureWebFontStylesheets(): void {
  if (typeof document === 'undefined') return;
  for (const font of WEB_FONTS) void ensureWebFontStylesheet(font.id);
}


/** Fetch a library face for `sample` (defaults to the font's own label) so the UI can show a
 * loading state until the glyphs are actually on the device. Resolves on load, failure, or timeout
 * — never rejects; the preview keeps rendering with fallback glyphs meanwhile. */
export async function loadWebFont(id: string, sample?: string): Promise<void> {
  const font = webFontById(id);
  if (!font) return;
  await ensureWebFontStylesheet(id);
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  const text = (sample?.trim() || font.label.zh).slice(0, 2_000);
  await Promise.race([
    document.fonts.load(`16px "${font.family}"`, text).catch(() => {}),
    new Promise<void>((resolve) => setTimeout(resolve, LOAD_TIMEOUT_MS)),
  ]);
}

/** Ask the browser to fetch the glyph chunks a face needs for `text` (best-effort; canvas
 * measurement does not trigger font loading by itself). */
export function preloadWebFontGlyphs(family: string, text: string): void {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  void document.fonts.load(`16px "${family}"`, text.slice(0, 2_000)).catch(() => {});
}
