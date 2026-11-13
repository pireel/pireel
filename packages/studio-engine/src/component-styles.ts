// Import only the platform-neutral transforms. The full css-tree entry also loads the lexer
// and its Node createRequire() data files, which cannot be relocated by the Workers SSR runner.
import parse from 'css-tree/parser';
import generate from 'css-tree/generator';
import walk from 'css-tree/walker';
import type { CssNode, StyleSheet } from 'css-tree';

export interface ComponentStyleResult { html: string; warnings: string[] }
const cache = new Map<string, ComponentStyleResult>();
const MAX_CACHE_ENTRIES = 32;

const PLAIN_SELECTOR_PARTS = new Set(['TypeSelector', 'ClassSelector', 'IdSelector', 'AttributeSelector', 'PseudoClassSelector', 'PseudoElementSelector', 'Combinator']);

/**
 * Whether the sheet confines itself: only plain style rules, each selector naming the component
 * root (`:scope`) and stepping only down from it (descendant and child combinators, no functional
 * pseudo-classes, nothing nested or grouped). Every built-in caption and legacy `#id …` sheet is
 * like this. With `:scope` spelled as the root's own attribute selector such a sheet matches the
 * same elements with the same specificity as it does inside @scope.
 */
function anchoredToRoot(sheet: StyleSheet): boolean {
  let anchored = true;
  sheet.children.forEach((node) => {
    if (node.type !== 'Rule' || node.prelude.type !== 'SelectorList') { anchored = false; return; }
    node.block.children.forEach((child) => { if (child.type !== 'Declaration') anchored = false; });
    node.prelude.children.forEach((selector) => {
      if (selector.type !== 'Selector') { anchored = false; return; }
      let rooted = false;
      selector.children.forEach((part) => {
        if (!PLAIN_SELECTOR_PARTS.has(part.type)) anchored = false;
        else if (part.type === 'Combinator' && part.name !== ' ' && part.name !== '>') anchored = false;
        else if ((part.type === 'PseudoClassSelector' || part.type === 'PseudoElementSelector') && part.children) anchored = false;
        else if (part.type === 'PseudoClassSelector' && part.name.toLowerCase() === 'scope') rooted = true;
      });
      if (!rooted) anchored = false;
    });
  });
  return anchored;
}

/** The rendering boundary owns CSS scope. Source can use local selectors; legacy #id selectors
 * remain valid. CSS syntax is parsed once, empty rules are discarded, and every selector is confined
 * to the component subtree (including selector lists and nested grouping rules): by native @scope,
 * or, for a sheet that already anchors each selector to the component root, by that root's own
 * attribute selector. The browser weighs every @scope against every element it restyles, so one
 * per caption (1,470 of them in a 44-minute talk) cost gigabytes each time the document was
 * styled; the plain rules cost nothing. */
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
      // Source that was compiled before comes back in its own wrapper: take the rules out of it.
      const existing = sheet.children.size === 1 ? sheet.children.first : undefined;
      if (existing?.type === 'Atrule' && existing.name === 'scope' && existing.prelude && existing.block && scope.prelude
        && generate(existing.prelude) === generate(scope.prelude)) sheet.children = existing.block.children as StyleSheet['children'];
      // Inside @scope, a legacy #component selector does not select the scoping root.
      // Rebase only that ID selector in the AST (and the attribute form this compiler writes);
      // local child IDs, declaration hashes and quoted strings must keep their original meaning.
      // This also repairs built-in captions.
      walk(sheet, { visit: 'IdSelector', enter(node, item) {
        if (node.name === componentId && item) {
          item.data = { type: 'PseudoClassSelector', name: 'scope', children: null };
        }
      } });
      walk(sheet, { visit: 'AttributeSelector', enter(node, item) {
        if (node.name.name === 'id' && node.matcher === '=' && node.value && (node.value.type === 'String' ? node.value.value : node.value.name) === componentId && !node.flags && item) {
          item.data = { type: 'PseudoClassSelector', name: 'scope', children: null };
        }
      } });
      if (sheet.children.isEmpty) return '';
      if (anchoredToRoot(sheet)) {
        walk(sheet, { visit: 'PseudoClassSelector', enter(node, item) {
          if (node.name.toLowerCase() === 'scope' && !node.children && item) {
            item.data = { type: 'AttributeSelector', name: { type: 'Identifier', name: 'id' }, matcher: '=', value: { type: 'String', value: componentId }, flags: null };
          }
        } });
        return `<style${attributes}>${generate(sheet)}</style>`;
      }
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
