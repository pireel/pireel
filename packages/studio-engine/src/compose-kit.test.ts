/**
 * The kit path's contract: what the model is told, and what we accept back.
 *
 * The parser is the risky half — a prompt change is visible, a parser that silently drops good
 * output is not. Everything here is about that failure mode.
 */

import { describe, expect, it } from 'vitest';
import { buildKitPrompt, parseKitResponse } from './compose';
import { BLOCK_SYSTEM, FRAGMENT_CONTRACT, L1_PROPS_SPEC, SPOKEN_EDITORIAL, buildHtmlSystem, buildKitSystem } from './prompts';
import { components } from '@pireel/studio-kit';

const seed = { id: 'b1', kind: 'custom', innerHtml: '', timelineBody: '' };
const KIT = buildKitSystem();

describe('the layer stack', () => {
  it('both paths share the base contract and the editorial layer', () => {
    for (const system of [KIT, buildHtmlSystem()]) {
      expect(system).toContain(FRAGMENT_CONTRACT);
      expect(system).toContain(SPOKEN_EDITORIAL);
    }
  });

  it('only the capability layer and the output contract differ', () => {
    expect(KIT).toContain(L1_PROPS_SPEC);
    expect(buildHtmlSystem()).not.toContain(L1_PROPS_SPEC);
    expect(KIT).toContain('```json');
    expect(buildHtmlSystem()).toContain('```html');
  });

  it('the preset decides the vocabulary', () => {
    // Pinned via the assembler, not by reading the preset: a preset naming components that never
    // reach the catalogue would be a silent capability loss.
    for (const id of Object.keys(components)) expect(KIT).toContain(`  ${id} — `);
  });
});

describe('the component path', () => {
  it('states the rules that keep the screen honest', () => {
    expect(KIT).toContain('VERBATIM');
    expect(KIT).toContain('null');
    expect(KIT).toContain("VIDEO's spoken language");
    expect(KIT).toContain("complete final state at time 0");
    expect(KIT).toContain("Frame controls HOW these reveals");
  });

  it('does not teach markup — that is what the components are for', () => {
    for (const leak of ['px', 'var(--', 'font-size', 'tl.from', 'gsap']) {
      expect(KIT, `component prompt leaks implementation: ${leak}`).not.toContain(leak);
    }
  });

  it('is a fraction of the free-form path — the components absorbed the rest', () => {
    expect(KIT.length).toBeLessThan(BLOCK_SYSTEM.length);
  });
});

describe('buildKitPrompt', () => {
  it('describes the box shape without the overflow warning (sizing is not the model\'s job)', () => {
    const p = buildKitPrompt({ block: { ...seed, boxPx: { w: 900, h: 400 } }, instruction: 'x' });
    expect(p).toContain('900×400px (wide)');
    expect(p).not.toContain('HARD CONSTRAINT');
    expect(p).toContain('Sizes are computed for you');
  });

  it('keeps the shared moment context — beats, neighbours, script', () => {
    const p = buildKitPrompt({
      block: { ...seed, durationSec: 4 },
      instruction: 'x',
      context: { script: 'the whole talk', neighbors: ['1. metric «THIS»'], beats: [{ text: '47% 复购', start: 0.2, end: 1.4 }] },
    });
    expect(p).toContain('the whole talk');
    expect(p).toContain('«THIS»');
    expect(p).toContain('47% 复购');
    expect(p).toContain('keep later content hidden until that beat');
    expect(p).toContain('NEVER the complete final state at time 0');
  });

  it('shows the current choice when editing, so unmentioned props survive', () => {
    const p = buildKitPrompt({ block: seed, instruction: 'make it red', current: { component: 'metric', props: { value: '47%' } } });
    expect(p).toContain('"component": "metric"');
    expect(p).toContain('Keep everything the instruction does not mention');
  });
});

describe('parseKitResponse', () => {
  it('reads note + fenced choice', () => {
    const r = parseKitResponse('已选用数字卡。\n\n```json\n{"component":"metric","props":{"value":"47%"}}\n```');
    expect(r.note).toBe('已选用数字卡。');
    expect(r.choice).toEqual({ component: 'metric', props: { value: '47%' } });
  });

  it('accepts an unfenced object — models drop the fence often enough to matter', () => {
    expect(parseKitResponse('{"component":"kpi","props":{}}').choice?.component).toBe('kpi');
  });

  it('accepts a bare fence with no language tag', () => {
    expect(parseKitResponse('note\n```\n{"component":"title","props":{"title":"Hi"}}\n```').choice?.component).toBe('title');
  });

  it('reads null as a deliberate "no graphic here" — and marks it as such', () => {
    const r = parseKitResponse('nothing worth showing\n```json\nnull\n```');
    expect(r.choice).toBeNull();
    expect(r.declined).toBe(true);
    expect(parseKitResponse('null').declined).toBe(true); // bare, unfenced
  });

  it('junk degrades to null WITHOUT the declined mark — a hiccup is not a veto', () => {
    // Conflating the two turned every malformed output into "the model said no", which
    // deleted placeholders on transient failures. Callers regenerate on !declined nulls.
    for (const junk of ['', 'just prose', '```json\n{oops\n```', '```json\n[]\n```', '```json\n{"props":{}}\n```']) {
      const r = parseKitResponse(junk);
      expect(r.choice).toBeNull();
      expect(r.declined, `"${junk.slice(0, 20)}" must not read as a veto`).toBe(false);
    }
  });

  it('missing props is a component with defaults, not a rejection', () => {
    expect(parseKitResponse('```json\n{"component":"metric"}\n```').choice).toEqual({ component: 'metric', props: {} });
  });

  it('leaves prop validation to the component — a bad enum reaches the schema gate, not a throw', () => {
    const r = parseKitResponse('```json\n{"component":"metric","props":{"variant":"nope","value":"1"}}\n```');
    expect(r.choice?.props.variant).toBe('nope');
    expect(components.metric.parse!(r.choice!.props).variant).toBe('hero-number');
  });
});

describe('custom escape — built-ins are a library, not a cage', () => {
  it('the contract offers all three answers', async () => {
    const { buildKitSystem } = await import('./prompts');
    const sys = buildKitSystem();
    expect(sys).toContain('{"custom": true}');
    expect(sys).toContain('custom is an escape, not a style choice');
  });

  it('{"custom": true} parses as its own answer — not a veto, not a hiccup', () => {
    const r = parseKitResponse('这段是个层级图,组件装不下。\n```json\n{"custom": true}\n```');
    expect(r.custom).toBe(true);
    expect(r.declined).toBe(false);
    expect(r.choice).toBeNull();
  });

  it('the three nulls stay distinct', () => {
    expect(parseKitResponse('```json\nnull\n```')).toMatchObject({ declined: true, custom: false });
    expect(parseKitResponse('```json\n{"custom": true}\n```')).toMatchObject({ declined: false, custom: true });
    expect(parseKitResponse('```json\n{broken\n```')).toMatchObject({ declined: false, custom: false });
  });
});

describe('两路共享同一份动态图形词汇(派生,不许各说各话)', () => {
  it('HTML 路径带 HOUSE MOTION GRAPHIC TYPES,内容与 kit 目录同源', () => {
    const html = buildHtmlSystem();
    expect(html).toContain('HOUSE MOTION GRAPHIC TYPES');
    for (const id of Object.keys(components)) expect(html).toContain(`  ${id} — `);
    expect(html).toContain('floor of consistency, not a ceiling'); // 词汇是地板不是天花板
  });
});

describe('编辑判断认识手法名(brief 点名 → 按模式执行)', () => {
  it('两条生成路径都带 NAMED MOVES 段', () => {
    for (const sys of [buildKitSystem(), buildHtmlSystem()]) {
      expect(sys).toContain('NAMED MOVES');
      expect(sys).toContain('HANDOFF');
      expect(sys).toContain("execute the pattern, don't reinterpret it");
    }
  });
});
