import { useEffect } from 'react';

const MARK = 'data-editor-page';
let mounted = 0;

/**
 * Marks <body> while an editor-themed surface is on the page. The light theme reaches menus and
 * dialogs portaled to the body through this mark (see editor-theme.css).
 *
 * The stylesheet used to ask the page instead, with `body:has(.studio-editorial) .editorial-theme`.
 * A `:has()` in an ancestor position makes the browser restyle everything under <body> whenever any
 * node is added or removed: in a 44-minute project (about 24,000 elements, 1,470 captions) each
 * filmstrip tile scrolling into the timeline cost 100–600 ms, 8 s over a dozen clicks and scrolls.
 * An attribute is a fact the browser can check without looking at the whole page.
 */
export function useEditorPageMark(active = true): void {
  useEffect(() => {
    if (!active) return;
    mounted += 1;
    document.body.setAttribute(MARK, '');
    return () => {
      mounted -= 1;
      if (!mounted) document.body.removeAttribute(MARK);
    };
  }, [active]);
}
