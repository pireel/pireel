/// <reference path="./css-tree-subpaths.d.ts" />
// Import only the platform-neutral transforms. The full css-tree entry also loads the lexer
// and its Node createRequire() data files, which cannot be relocated by the Workers SSR runner.
import parse from 'css-tree/parser';
import generate from 'css-tree/generator';
import walk from 'css-tree/walker';
import type { CssNode, StyleSheet } from 'css-tree';

export interface ComponentStyleResult { html: string; warnings: string[] }
const cache = new Map<string, ComponentStyleResult>();
const MAX_CACHE_ENTRIES = 32;

/** The rendering boundary owns CSS scope. Source can use local selectors; legacy #id selectors
 * remain valid. CSS syntax is parsed once, empty rules are discarded, and native @scope confines
 * every selector to the component subtree (including selector lists and nested grouping rules). */
export function compileComponentStyles(html: string, componentId: string): ComponentStyleResult {
  const key = `${componentId}\0${html}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const warnings: string[] = [];
  const anchor = `([id=${JSON.stringify(componentId)}])`;
  const scopedHtml = html.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (_tag, attributes: string, css: string) => {
    try {
      const recovered = new Map<CssNode, string>();
      const sheet = parse(css, { onParseError: (error, node) => recovered.set(node, error.message) }) as StyleSheet;
      // Use the parser's recovery nodes, not a CSS grammar validator. Preserve declarations
      // (including newer browser syntax) and discard only the affected rule when recovery crosses
      // a stylesheet boundary. Other valid rules survive; this never asks the model to regenerate.
      const ancestors: CssNode[] = [];
      const discarded = new Set<CssNode>();
      walk(sheet, {
        enter(node: CssNode) {
          const warning = recovered.get(node);
          if (warning && ancestors.at(-1)?.type !== 'Block') {
            // ancestors is the walk stack, so scan it back. (findLast is ES2023; this package targets ES2022.)
            let owner: CssNode | undefined;
            for (let i = ancestors.length - 1; i >= 0; i -= 1) {
              const parent = ancestors[i]!;
              if (parent.type === 'Rule' || parent.type === 'Atrule') { owner = parent; break; }
            }
            discarded.add(owner ?? node);
            warnings.push(`CSS rule omitted during rendering: ${warning}`);
          }
          ancestors.push(node);
        },
        leave() { ancestors.pop(); },
      });
      walk(sheet, { visit: 'Rule', leave(rule, item, list) {
        if ((discarded.has(rule) || rule.block.children.isEmpty) && item && list) list.remove(item);
      } });
      walk(sheet, { visit: 'Atrule', leave(rule, item, list) {
        if (discarded.has(rule) && item && list) list.remove(item);
      } });
      walk(sheet, { visit: 'Raw', leave(node, item, list) {
        if (discarded.has(node) && item && list) list.remove(item);
      } });
      if (sheet.children.isEmpty) return '';
      const wrapper = parse(`@scope ${anchor}{}`) as StyleSheet;
      const scope = wrapper.children.first;
      if (scope?.type !== 'Atrule' || !scope.block) throw new Error('Unable to construct component scope');
      const existing = sheet.children.size === 1 ? sheet.children.first : undefined;
      if (existing?.type === 'Atrule' && existing.name === 'scope' && existing.prelude && scope.prelude
        && generate(existing.prelude) === generate(scope.prelude)) return `<style${attributes}>${generate(sheet)}</style>`;
      scope.block.children = sheet.children;
      return `<style${attributes}>${generate(wrapper)}</style>`;
    } catch (error) {
      const detail = error as { reason?: string; message?: string; line?: number; column?: number };
      warnings.push(`CSS stylesheet omitted during rendering: ${detail.reason ?? detail.message ?? 'invalid stylesheet'}${detail.line ? ` at ${detail.line}:${detail.column ?? 1}` : ''}`);
      // Fail closed only for this style element; preserve the component and other styles.
      return '';
    }
  });
  const result = { html: scopedHtml, warnings };
  if (html.length <= 64_000) {
    if (cache.size >= MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
    cache.set(key, result);
  }
  return result;
}
