import { describe, expect, it } from 'vitest';
import parse from 'css-tree/parser';
import type { StyleSheet } from 'css-tree';
import { compileComponentStyles } from './component-styles';
import { assembleHtml } from './assemble';

function styleRoot(html: string) { return parse(/<style[^>]*>([\s\S]*?)<\/style>/.exec(html)![1]!) as StyleSheet; }

describe('renderer-owned component styles', () => {
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
  it('applies the same isolation to the actual assembled preview/export document', () => {
    const html = assembleHtml({ width: 640, height: 360, theme: 'general', video: null, shots: [], blocks: [
      { id: 'a', templateId: 'custom', startSec: 0, durationSec: 2, trackIndex: 1, slots: { innerHtml: '<b class="label">A</b><style>.label{color:red}</style>', timelineBody: '' } },
      { id: 'b', templateId: 'custom', startSec: 0, durationSec: 2, trackIndex: 2, slots: { innerHtml: '<b class="label">B</b><style>.label{color:blue}</style>', timelineBody: '' } },
    ] });
    expect(html).toContain('@scope ([id="a"])');
    expect(html).toContain('@scope ([id="b"])');
  });
});
