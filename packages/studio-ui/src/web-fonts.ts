import { WEB_FONTS, webFontById, webFontCssUrl } from '@pireel/studio-engine/font-library';

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

export function ensureWebFontStylesheets(): void {
  if (typeof document === 'undefined') return;
  for (const font of WEB_FONTS) void ensureWebFontStylesheet(font.id);
}

const LOAD_TIMEOUT_MS = 15_000;

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
