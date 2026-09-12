import { describe, expect, it } from 'vitest';
import { collapsedComponentRetryIndexes, studioToolFailureText } from './chat-component-retries';
import type { ToolPartLike } from './chat-tool-parts';

const attempt = (id: string, state = 'output-error', ok = false): ToolPartLike => ({
  type: 'tool-apply_component', state, input: { clipId: id }, output: { ok }, errorText: ok ? undefined : 'invalid CSS',
});

describe('component retry presentation', () => {
  it('shows only the last attempt in a retry chain while retaining source history', () => {
    const parts = [attempt('g1'), { type: 'text', text: 'Fixing the source.' }, attempt('g1'), attempt('g1', 'output-available', true)];
    const original = JSON.stringify(parts);
    expect([...collapsedComponentRetryIndexes(parts)]).toEqual([0, 1, 2]);
    expect(JSON.stringify(parts)).toBe(original);
  });
  it('keeps the final failure, separate targets and successful operations visible', () => {
    expect([...collapsedComponentRetryIndexes([attempt('g1'), attempt('g1')])]).toEqual([0]);
    expect([...collapsedComponentRetryIndexes([attempt('g1'), attempt('g2')])]).toEqual([]);
    expect([...collapsedComponentRetryIndexes([attempt('g1', 'output-available', true), attempt('g1')])]).toEqual([]);
    expect([...collapsedComponentRetryIndexes([attempt('g1'), { type: 'tool-remove_clips' }, attempt('g1')])]).toEqual([]);
  });
  it('supersedes a failure with an in-progress retry or the hosted fallback on the same target', () => {
    const fallback = { ...attempt('g1', 'input-available'), input: { clipId: 'g1', generate: true } };
    expect([...collapsedComponentRetryIndexes([attempt('g1'), fallback])]).toEqual([0]);
    expect([...collapsedComponentRetryIndexes([attempt('g1')])]).toEqual([]);
  });
  it('passes concrete repair diagnostics to the model rather than only a generic error', () => {
    const text = studioToolFailureText('Fix data.issues', { blockId: 'g1', issues: ['font-size 4px is too small'], detail: 'apply_block failed', secretFixture: 'omit unrelated data' });
    expect(text).toContain('font-size 4px is too small');
    expect(text).toContain('g1');
    expect(text).not.toContain('secretFixture');
    expect(studioToolFailureText('Stopped')).toBe('Stopped');
  });
});
