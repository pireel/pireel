import { WEB_FONTS, webFontCssUrl } from '@pireel/studio-engine/font-library';

/**
 * Load the web font library's stylesheets into the CURRENT document (the studio page).
 *
 * The preview document links the fonts a composition uses on its own (assemble.ts). The parent
 * needs them too: the picker renders each family in its own face, and caption line splitting
 * measures text with the parent's canvas — a face missing here would wrap differently from the
 * preview. Chunked CSS means loading every stylesheet is cheap: glyph blocks are fetched only when
 * text in that face is actually rendered or measured.
 */
const loaded = new Set<string>();

export function ensureWebFontStylesheets(): void {
  if (typeof document === 'undefined') return;
  for (const font of WEB_FONTS) {
    const href = webFontCssUrl(font.id);
    if (loaded.has(href) || document.querySelector(`link[data-web-font="${font.id}"]`)) {
      loaded.add(href);
      continue;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.dataset.webFont = font.id;
    document.head.appendChild(link);
    loaded.add(href);
  }
}

/** Ask the browser to fetch the glyph chunks a face needs for `text` (best-effort; canvas
 * measurement does not trigger font loading by itself). */
export function preloadWebFontGlyphs(family: string, text: string): void {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  void document.fonts.load(`16px "${family}"`, text.slice(0, 2_000)).catch(() => {});
}
