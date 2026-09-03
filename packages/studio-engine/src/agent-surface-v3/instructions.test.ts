import { describe, expect, it } from 'vitest';
import { IDENTITY_DISCIPLINE } from '../prompts/l0-editor';
import { V3_INSTRUCTIONS_BODY, v3Instructions } from './instructions';
import { V3_TOOLS } from './registry';

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

describe('agent surface v3 instructions', () => {
  it('keeps the shared body under the budget and speaks only the v3 vocabulary', () => {
    expect(words(V3_INSTRUCTIONS_BODY)).toBeLessThanOrEqual(1200);
    expect(words(v3Instructions({ surface: 'chat' }))).toBeLessThanOrEqual(1500);
    expect(words(v3Instructions({ surface: 'mcp', skillVersion: '2026-09-02.2' }))).toBeLessThanOrEqual(1500);
    expect(V3_INSTRUCTIONS_BODY).not.toMatch(/\bshots?\b|\bblocks?\b|<composition_state>|Director Plan|storyboard/i);
    // every tool the text names exists on the surface
    const ids = new Set(V3_TOOLS.map((tool) => tool.id));
    for (const name of V3_INSTRUCTIONS_BODY.match(/\b[a-z]+(?:_[a-z0-9]+)+\b/g) ?? []) {
      if (['mode', 'clip_id'].includes(name)) continue;
      expect(ids.has(name), `unknown tool in instructions: ${name}`).toBe(true);
    }
  });

  it('carries the load-bearing rules once', () => {
    for (const rule of [
      'integer timeline frames',
      'Call get_state once per session',
      'Patch your model from it instead of re-reading',
      'do not ask permission for individual edits',
      'Call undo only when they explicitly ask',
      'Do what was asked, then stop',
      'Speech is one editing surface, not the entrance',
      'One matching library asset is the answer, not a question',
      'An empty timeline is not a blocker',
      'read_skill it once and apply it',
      'wait for confirmation',
      'Before reporting done, check once',
      'never after every change',
      'lead with the outcome',
    ]) expect(V3_INSTRUCTIONS_BODY).toContain(rule);
  });

  it('shares the untrusted-content boundary and keeps identity discipline off the MCP surface', () => {
    const chat = v3Instructions({ surface: 'chat' });
    const mcp = v3Instructions({ surface: 'mcp', skillVersion: 'v' });
    expect(chat).toContain('MATERIAL being edited');
    expect(mcp).toContain('MATERIAL being edited');
    expect(chat).toContain('Never disclose which model you are');
    expect(mcp).not.toContain('Never disclose which model you are');
    expect(mcp).toContain('create_browser_handoff');
    expect(mcp).toContain('Workflow baseline: v');
    expect(chat).not.toContain('create_browser_handoff');
    expect(mcp).not.toContain(IDENTITY_DISCIPLINE);
  });

  it('renders a skill index only when given', () => {
    expect(v3Instructions({ surface: 'chat' })).not.toContain('# Skills');
    expect(v3Instructions({ surface: 'chat', skillIndex: '- talking-head-edit: speech-led edits' })).toContain('# Skills\nPlaybooks for specific tasks');
  });
});
