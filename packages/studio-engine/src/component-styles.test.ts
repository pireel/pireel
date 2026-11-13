import { describe, expect, it } from 'vitest';
import parse from 'css-tree/parser';
import type { StyleSheet } from 'css-tree';
import { compileComponentStyles } from './component-styles';
import { assembleHtml } from './assemble';
import { captionBlocksFromAsr } from './build-blocks';
import { ensureTemplatesRegistered } from './templates';

function styleRoot(html: string) { return parse(/<style[^>]*>([\s\S]*?)<\/style>/.exec(html)![1]!) as StyleSheet; }

describe('renderer-owned component styles', () => {
  it('rebases legacy component-root selectors without touching descendants, colors or strings', () => {
    const input = '<style>#title h1,#title .label{color:#abc;content:"#title"}#title{--ink:red}#child{color:blue}@media(min-width:1px){#title .label{font-size:120px}}</style>';
    const result = compileComponentStyles(input, 'title');
    expect(result.warnings).toEqual([]);
    expect(result.html).toContain(':scope h1,:scope .label');
    expect(result.html).toContain(':scope{--ink:red}');
    expect(result.html).toContain('#child{color:blue}');
    expect(result.html).toContain('color:#abc;content:"#title"');
    expect(result.html).toContain(':scope .label{font-size:120px}');
    expect(compileComponentStyles(result.html, 'title')).toEqual(result);
  });
  it('scopes selector lists, pseudo selectors and nested groups as one subtree', () => {
    const input = '<div>Text</div><style>.a, :is(.b,.c){color:red}@media (min-width:1px){.x{color:blue}}</style>';
    const result = compileComponentStyles(input, 'real-id');
    expect(result.warnings).toEqual([]);
    const root = styleRoot(result.html);
    expect(root.children.size).toBe(1);
    expect(root.children.first).toMatchObject({ type: 'Atrule', name: 'scope' });
    expect(result.html).toContain('.a,:is(.b,.c)');
  });
  it('discards every empty rule and is idempotent when source is reopened', () => {
    const result = compileComponentStyles('<style>#previous-placeholder{} .valid{color:red}</style>', 'current');
    expect(result.html).not.toContain('previous-placeholder');
    expect(compileComponentStyles(result.html, 'current')).toEqual(result);
  });
  it('preserves native implicit nesting and drops only the malformed rule that could escape the scope', () => {
    const nested = compileComponentStyles('<style>.wrap{color:red;.label{color:blue}@media (min-width:1px){&>.mark{width:2em}}}</style>', 'a');
    expect(nested.warnings).toEqual([]);
    expect(nested.html).toContain('.label{color:blue}');
    const escaped = compileComponentStyles('<style>.label{color:red}}body{color:blue}</style>', 'a');
    expect(escaped.warnings).not.toEqual([]);
    expect(escaped.html).toContain('.label{color:red}');
    expect(escaped.html).not.toContain('body{');
  });
  it('drops malformed rules while preserving the valid stylesheet', () => {
    const result = compileComponentStyles('<b>Text</b><style>???{color:red}.label{color:blue}</style>', 'current');
    expect(result.warnings[0]).toContain('Selector is expected');
    expect(result.html).toContain('<b>Text</b>');
    expect(result.html).toContain('.label{color:blue}');
    expect(result.html).not.toContain('???');
  });
  it('recovers stray stylesheet delimiters without letting them close the renderer scope', () => {
    for (const suffix of ['}', '}}', '@foo } body{color:blue}', '}body{color:blue}']) {
      const result = compileComponentStyles(`<style>.label{color:red}${suffix}</style>`, 'a');
      expect(result.html).toContain('.label{color:red}');
      const root = styleRoot(result.html);
      expect(root.children.size).toBe(1);
      expect(root.children.first).toMatchObject({ type: 'Atrule', name: 'scope' });
      expect(result.html).not.toContain('body{');
    }
  });
  it('writes a sheet anchored to the component root as plain rules under the root, without @scope', () => {
    const input = '<style>#cap .cap-root{position:absolute}#cap .w>.t::after,#cap .w.sp:hover{color:red}#cap{--ink:red}.theme #cap b{color:blue}</style>';
    const result = compileComponentStyles(input, 'cap');
    expect(result.warnings).toEqual([]);
    expect(result.html).toBe('<style>[id="cap"] .cap-root{position:absolute}[id="cap"] .w>.t::after,[id="cap"] .w.sp:hover{color:red}[id="cap"]{--ink:red}.theme [id="cap"] b{color:blue}</style>');
    // Reopened source, and source compiled when every sheet was wrapped, land on the same text.
    expect(compileComponentStyles(result.html, 'cap')).toEqual(result);
    expect(compileComponentStyles('<style>@scope ([id="cap"]){:scope .cap-root{position:absolute}:scope .w>.t::after,:scope .w.sp:hover{color:red}:scope{--ink:red}.theme :scope b{color:blue}}</style>', 'cap').html).toBe(result.html);
  });
  it('keeps @scope for anything that could reach outside the component or needs the scope to stay inside', () => {
    for (const css of [
      '#cap .w{color:red}.label{color:blue}', // a selector without the root
      '#cap~.next{color:red}', // a sibling of the root
      '#cap+.next .w{color:red}',
      '#cap :is(.a,.b){color:red}', // a functional pseudo-class
      '#cap .w:not(.sp){color:red}',
      '@media (min-width:1px){#cap .w{color:red}}', // a grouping rule
      '#cap .w{color:red;.t{color:blue}}', // a nested rule
      '#cap .w{color:red}@keyframes spin{to{rotate:1turn}}',
    ]) {
      const result = compileComponentStyles(`<style>${css}</style>`, 'cap');
      const root = styleRoot(result.html);
      expect(root.children.size, css).toBe(1);
      expect(root.children.first, css).toMatchObject({ type: 'Atrule', name: 'scope' });
      expect(compileComponentStyles(result.html, 'cap'), css).toEqual(result);
    }
  });
  it('gives the built-in captions plain rules: no scope per caption in the assembled document', () => {
    ensureTemplatesRegistered();
    const blocks = captionBlocksFromAsr([{ start: 0, end: 2, text: '第一句字幕' }, { start: 2, end: 4, text: '第二句字幕' }]);
    const html = assembleHtml({ width: 1920, height: 1080, theme: 'general', video: null, shots: [], blocks });
    expect(blocks.length).toBeGreaterThan(0);
    expect(html).not.toContain('@scope');
    for (const block of blocks) expect(html).toContain(`[id="${block.id}"] .cap-line{`);
  });
  it('applies the same isolation to the actual assembled preview/export document', () => {
    const html = assembleHtml({ width: 640, height: 360, theme: 'general', video: null, shots: [], blocks: [
      { id: 'a', templateId: 'custom', startSec: 0, durationSec: 2, trackIndex: 1, slots: { innerHtml: '<b class="label">A</b><style>.label{color:red}</style>', timelineBody: '' } },
      { id: 'b', templateId: 'custom', startSec: 0, durationSec: 2, trackIndex: 2, slots: { innerHtml: '<b class="label">B</b><style>.label{color:blue}</style>', timelineBody: '' } },
    ] });
    expect(html).toContain('@scope ([id="a"])');
    expect(html).toContain('@scope ([id="b"])');
  });
});
