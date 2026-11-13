/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import { useEditorPageMark } from './editor-page-mark';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: ReturnType<typeof createRoot>[] = [];
afterEach(() => { roots.splice(0).forEach((root) => act(() => root.unmount())); document.body.innerHTML = ''; });

function Surface({ active }: { active?: boolean }) {
  useEditorPageMark(active);
  return null;
}
function mount(active?: boolean) {
  const root = createRoot(document.body.appendChild(document.createElement('div')));
  roots.push(root);
  act(() => root.render(createElement(Surface, { active })));
  return root;
}
const marked = () => document.body.hasAttribute('data-editor-page');

it('marks the body while an editor surface is mounted, and until the last one is gone', () => {
  expect(marked()).toBe(false);
  const first = mount();
  const second = mount();
  expect(marked()).toBe(true);
  act(() => first.unmount());
  expect(marked()).toBe(true);
  act(() => second.unmount());
  expect(marked()).toBe(false);
});

it('leaves the body alone for a surface that is not editor-themed', () => {
  mount(false);
  expect(marked()).toBe(false);
});

it('keeps :has() out of ancestor positions in the editor theme', () => {
  // `body:has(.x) .y` restyles everything under <body> on every node added or removed; `body:has(.x)`
  // alone only looks at the body again.
  const css = readFileSync(join(import.meta.dirname, 'editor-theme.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const selectors = css.split('{').flatMap((chunk) => (chunk.split('}').pop() ?? '').split(',')).map((selector) => selector.trim()).filter(Boolean);
  expect(selectors.filter((selector) => /:has\([^)]*\)\s*[\s>+~]\s*\S/.test(selector))).toEqual([]);
  expect(selectors).toContain('html:not(.dark) body[data-editor-page] .editorial-theme');
});
