/**
 * The kit path's contract: what the model is told, and what we accept back.
 *
 * The parser is the risky half — a prompt change is visible, a parser that silently drops good
 * output is not. Everything here is about that failure mode.
 */

import { describe, expect, it } from 'vitest';
import { buildKitPrompt, parseKitResponse } from './compose';
import { BLOCK_SYSTEM, FRAGMENT_CONTRACT, L1_PROPS_SPEC, SPOKEN_EDITORIAL, buildHtmlSystem, buildKitSystem, withStyleDirection } from './prompts';
import { assembleKitTheme, frameVoice } from './briefs';
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

  it('the theme voice goes last, so switching themes invalidates only the tail', () => {
    const withVoice = buildKitSystem({ voice: 'Cool, precise, conclusion-first.' });
    expect(withVoice.startsWith(KIT)).toBe(true);
    expect(withVoice).toContain('Cool, precise, conclusion-first.');
    expect(withVoice).toContain('never overrides');
  });

  it('an unknown preset falls back rather than failing generation', () => {
    expect(buildKitSystem({ presetId: 'no-such-preset' })).toBe(KIT);
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

describe('style direction', () => {
  it('adds nothing when no theme is attached', () => {
    expect(withStyleDirection(KIT, '')).toBe(KIT);
    expect(withStyleDirection(KIT, undefined)).toBe(KIT);
  });

  it('an authored voice wins over the playbook lead', () => {
    expect(frameVoice({ title: 'T', body: '# T\n\nlead prose.\n\n## Typography\n- 64px', voice: 'authored' })).toBe('authored');
  });

  it('falls back to the lead paragraph, never the implementation sections', () => {
    const v = frameVoice({ title: 'T', body: '# Boardroom\n\nCool white paper, navy ink.\n\nSecond para about surfaces.\n\n## Typography\n- Action titles: 64-90px' });
    expect(v).toBe('Cool white paper, navy ink.');
    expect(v).not.toContain('64-90px');
    expect(v).not.toContain('Second para');
  });

  it('strips token names and declarations out of the voice', () => {
    // A model that only fills props must never be handed CSS — it will try to use it.
    const v = frameVoice({ title: 'T', body: '# M\n\nThe ONLY color is `--accent` red, on a `background:var(--paper)` page with `heavy` borders.' });
    expect(v).not.toContain('--accent');
    expect(v).not.toContain('var(--paper)');
    expect(v).toContain('heavy borders'); // plain emphasis survives, unwrapped
  });

  it('every shipped frame yields a voice with no CSS in it', async () => {
    const { frameRegistry } = await import('@pireel/studio-frames/vite');
    for (const f of frameRegistry.list()) {
      const v = frameVoice({ title: f.title, body: f.body });
      expect(v.length, `${f.id} has no lead prose`).toBeGreaterThan(40);
      for (const leak of ['var(--', 'px;', '{', '}']) expect(v, `${f.id} voice leaks ${leak}`).not.toContain(leak);
    }
  });

  it('the kit theme carries the voice and no token table', () => {
    const t = assembleKitTheme({ title: 'Boardroom', body: '# B\n\nCool white paper.\n\n## Token semantics\n- --paper cool white' })!;
    expect(t).toContain('Boardroom');
    expect(t).toContain('Cool white paper.');
    expect(t).not.toContain('--paper');
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
