import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { UIMessage } from 'ai';
import { resolveEditingRunConfig } from '@pireel/studio-engine/editing-run-config';
import { displayEditingTask, editingTaskRows, hasCurrentDirectorPreview, isInteractiveEditingTool, messagesForTask, unresolvedTaskFailure } from './editing-task-progress';
import { EditingTaskCard } from './editing-task-card';
import type { ChatTask } from './chat-task';
import type { FirstPassReport } from './first-pass';
import { setStudioLocale } from './i18n';
import { sanitizeRestored } from './chat-thread-store';
import { taskOf, resumeEditingTask } from './chat-task';

const config = resolveEditingRunConfig({ skills: ['rough-cut', 'captions', 'graphics', 'b-roll'] });
const task: ChatTask = { id: 'edit', goal: 'Edit the video', skills: config.skills, config, mode: 'one-click', state: 'running', source: { name: 'demo.mp4', durationSec: 122 } };
const report: FirstPassReport = { state: 'done', credits: 2, summary: '视频从 2:02 缩短到 0:56。', steps: [{ id: 'transcribe', status: 'done' }, { id: 'cleanup', status: 'done' }, { id: 'pauses', status: 'done' }, { id: 'captions', status: 'done' }, { id: 'denoise', status: 'skipped' }, { id: 'logo', status: 'skipped' }] };
const receipt = (id: string, state: 'input-available' | 'output-available' | 'output-error'): UIMessage => {
  const base = { type: 'dynamic-tool' as const, toolName: id, toolCallId: id, input: {} };
  const part = state === 'output-error' ? { ...base, state, errorText: 'raw internal error' } : state === 'output-available' ? { ...base, state, output: { ok: true } } : { ...base, state };
  return { id, role: 'assistant', parts: [part] };
};

describe('editing progress presentation', () => {
  it('requires an actual final picture inspection and invalidates it after another edit', () => {
    const preview = receipt('inspect_timeline', 'output-available');
    expect(hasCurrentDirectorPreview([receipt('apply_component', 'output-available')])).toBe(false);
    expect(hasCurrentDirectorPreview([preview, receipt('apply_component', 'output-available')])).toBe(false);
    expect(hasCurrentDirectorPreview([receipt('apply_component', 'output-available'), preview, receipt('save_edit_plan', 'output-available')])).toBe(true);
    expect(hasCurrentDirectorPreview([receipt('inspect_timeline', 'output-error')])).toBe(false);
  });
  it('preserves completed phases after reload even when another phase leaves the task incomplete', () => {
    const saved: ChatTask = { ...task, state: 'partial', reviewRequired: true,
      config: { ...config, visual: { ...config.visual, zoom: true, transitions: true } },
      roughCut: { callId: 'rough', report },
      fineCut: { state: 'done', items: [
        { id: 'graphics', status: 'done', count: 3 },
        { id: 'b-roll', status: 'stopped', count: 0 },
      ] },
    };
    const stored: UIMessage[] = [{ id: 'user', role: 'user', parts: [], metadata: { task: saved } },
      receipt('apply_component', 'output-available'), receipt('set_clip_framing', 'output-error'),
      receipt('add_transition', 'output-available'), receipt('inspect_timeline', 'output-available')];
    for (const state of ['partial', 'paused', 'done'] as const) {
      const before = { ...saved, state };
      const messages = sanitizeRestored(JSON.parse(JSON.stringify([{ ...stored[0], metadata: { task: before } }, ...stored.slice(1)])));
      const restored = displayEditingTask(taskOf(messages[0])!, messages);
      const rows = editingTaskRows(restored, restored.roughCut?.report, messages, false).finishing;
      expect(rows.find(row => row.id === 'graphics')).toMatchObject({ status: 'done', count: 3 });
      expect(rows.find(row => row.id === 'b-roll')?.status).toBe('pending');
      expect(rows.find(row => row.id === 'zoom')?.status).toBe('failed');
      expect(rows.find(row => row.id === 'transitions')?.status).toBe('done');
      expect(rows.find(row => row.id === 'review')?.status).toBe('done');
      expect(restored.state).not.toBe('done');
    }
    // Continuing the same task must not reuse a terminal icon while adding more components.
    expect(editingTaskRows({ ...saved, state: 'running' }, report, stored, false).finishing.find(row => row.id === 'graphics')?.status).toBe('running');
  });
  it('does not mistake observed additions for a saved phase completion or override a failed phase', () => {
    const fine = { items: [{ id: 'graphics' as const, status: 'done' as const, count: 1 }] };
    expect(editingTaskRows({ ...task, state: 'paused' }, report, [], false, fine).finishing.find(row => row.id === 'graphics')?.status).toBe('pending');
    const saved: ChatTask = { ...task, state: 'partial', fineCut: { state: 'done', ...fine } };
    expect(editingTaskRows(saved, report, [receipt('apply_component', 'output-error')], false).finishing.find(row => row.id === 'graphics')?.status).toBe('failed');
  });
  it('keeps MG in progress across multiple components, retries and gaps between model requests', () => {
    const fine = { items: [{ id: 'graphics' as const, status: 'running' as const, count: 1 }] };
    const snapshots = [
      [receipt('apply_component', 'output-available')],
      [receipt('apply_component', 'output-available'), receipt('compose_component', 'input-available')],
      [receipt('apply_component', 'output-available'), receipt('apply_component', 'output-error')],
      [receipt('apply_component', 'output-available'), receipt('apply_component', 'output-error'), receipt('apply_component', 'input-available')],
      [receipt('apply_component', 'output-available'), receipt('apply_component', 'output-error'), receipt('apply_component', 'output-available')],
    ];
    for (const messages of snapshots) {
      for (const live of [true, false]) expect(editingTaskRows(task, report, messages, live, fine).finishing.find(row => row.id === 'graphics')?.status).toBe('running');
    }
    const reviewed = { ...task, state: 'done' as const, review: { completed: true, items: [{ feature: 'graphics' as const, status: 'applied' as const, reason: '两处数字图形均已加入并核对画面。', count: 2 }] } };
    expect(editingTaskRows(reviewed, report, snapshots.at(-1)!, false, fine).finishing.find(row => row.id === 'graphics')).toMatchObject({ status: 'done', count: 2 });
  });
  it('does not show an unfinished footer or a red cross between requests while a retry is underway', () => {
    setStudioLocale('zh');
    const html = renderToStaticMarkup(createElement(EditingTaskCard, {
      task: { ...task, roughCut: { callId: 'rough', report } }, messages: [receipt('apply_component', 'output-error')], live: false,
      fine: { items: [{ id: 'graphics', status: 'running', count: 1 }] }, credits: 2, onContinue() {},
    }));
    expect(html).toContain('已添加 1 处');
    expect(html).not.toContain('未完成');
    expect(html).not.toContain('从当前进度继续');
  });
  it('removes stale rough-cut failure badges as soon as the same task resumes', () => {
    setStudioLocale('zh');
    const paused: ChatTask = { ...task, state: 'paused', roughCut: { callId: 'rough-old', report: { ...report, state: 'partial', summary: '部分工作尚未完成', steps: report.steps.map(step => step.id === 'pauses' ? { ...step, status: 'failed', detail: 'Module fetch failed' } : step) } } };
    const resumed = resumeEditingTask(paused);
    const html = renderToStaticMarkup(createElement(EditingTaskCard, { task: resumed, messages: [], live: true, credits: 1 }));
    expect(html).toContain('清理口播');
    expect(html).not.toContain('未完成');
    expect(html).not.toContain('Module fetch failed');
    expect(editingTaskRows(resumed, resumed.roughCut?.report, [], true).rough.find(row => row.id === 'cleanup')?.status).toBe('pending');
  });
  it('shows actual active work, not every enabled capability as running', () => {
    const rows = editingTaskRows(task, report, [receipt('compose_component', 'input-available')], true);
    expect(rows.rough).toEqual([{ id: 'transcribe', status: 'done' }, { id: 'cleanup', status: 'done', detail: undefined }]);
    expect(rows.finishing.find(row => row.id === 'graphics')?.status).toBe('running');
    expect(rows.finishing.find(row => row.id === 'b-roll')?.status).toBe('pending');
    expect(rows.finishing.some(row => ['logo', 'denoise', 'sound'].includes(row.id))).toBe(false);
    expect(editingTaskRows({ ...task, state: 'paused' }, report, [receipt('compose_component', 'input-available')], false).finishing.some(row => row.status === 'running')).toBe(false);
  });
  it('requires a successful retry to clear a failed operation', () => {
    expect(unresolvedTaskFailure([receipt('apply_component', 'output-error')])).toBe(true);
    expect(unresolvedTaskFailure([receipt('apply_component', 'output-error'), receipt('apply_component', 'output-available')])).toBe(false);
    expect(editingTaskRows({ ...task, state: 'partial' }, report, [receipt('apply_component', 'output-error')], false).finishing.find(row => row.id === 'graphics')?.status).toBe('failed');
    expect(unresolvedTaskFailure([{ id: 'brand', role: 'assistant', parts: [{ type: 'dynamic-tool', toolName: 'read_brand', toolCallId: 'brand', state: 'output-available', input: {}, output: { ok: false, error: 'no_brand' } }] }])).toBe(false);
    expect(displayEditingTask({ ...task, state: 'done' }, [receipt('apply_component', 'output-error')]).state).toBe('partial');
  });
  it('clears historical failures after a successful final review, but preserves later failures', () => {
    const failed = receipt('remove_silence', 'output-error');
    const reviewed: UIMessage = { id: 'reviewed', role: 'assistant', parts: [{ type: 'dynamic-tool', toolName: 'finish_edit', toolCallId: 'reviewed', state: 'output-available', input: {}, output: { ok: true, data: { review: { completed: true } } } }] };
    expect(unresolvedTaskFailure([failed])).toBe(true);
    expect(unresolvedTaskFailure([failed, reviewed])).toBe(false);
    expect(unresolvedTaskFailure([failed, reviewed, receipt('set_texts', 'output-error')])).toBe(true);
    expect(displayEditingTask({ ...task, state: 'done', roughCut: { callId: 'recovered', report } }, [failed, reviewed]).state).toBe('done');
  });
  it('does not label an inspection made before the last edit as a final preview check', () => {
    const before = [receipt('inspect_timeline', 'output-available'), receipt('apply_component', 'output-available')];
    expect(editingTaskRows(task, report, before, false).finishing.find(row => row.id === 'review')?.status).toBe('running');
    expect(editingTaskRows({ ...task, state: 'partial' }, report, before, false).finishing.find(row => row.id === 'review')?.status).toBe('pending');
    expect(editingTaskRows({ ...task, state: 'done' }, report, [...before, receipt('inspect_timeline', 'output-available')], false).finishing.find(row => row.id === 'review')?.status).toBe('done');
  });
  it('keeps decisions interactive and hides routine execution receipts', () => {
    for (const id of ['get_state', 'read_brand', 'read_skill', 'compose_component', 'apply_component', 'set_captions']) expect(isInteractiveEditingTool(id, true)).toBe(false);
    for (const id of ['ask_user', 'request_approval', 'export', 'generate_image']) expect(isInteractiveEditingTool(id, true)).toBe(true);
    expect(isInteractiveEditingTool('search_assets', true)).toBe(false);
    expect(isInteractiveEditingTool('search_assets', false)).toBe(true);
  });
  it('collects one task across continuations without absorbing a later request', () => {
    const owner = (id: string): UIMessage => ({ id, role: 'user', parts: [], metadata: { task: { ...task, id } } });
    const messages = [owner('edit'), receipt('rough_cut', 'output-available'), owner('edit'), receipt('apply_component', 'output-available'), owner('other'), receipt('set_captions', 'output-available')];
    expect(messagesForTask(messages, 'edit')).toEqual(messages.slice(0, 4));
  });
  it('renders two compact stages, a source card, and one continuation without technical errors', () => {
    setStudioLocale('zh');
    const value = { ...task, state: 'partial' as const, roughCut: { callId: 'rough', report } };
    const html = renderToStaticMarkup(createElement(EditingTaskCard, { task: value, messages: [receipt('apply_component', 'output-error')], live: false, credits: 2, onContinue() {} }));
    expect(html).toContain('demo.mp4'); expect(html).toContain('粗剪'); expect(html).toContain('精剪');
    expect(html).not.toContain('raw internal error'); expect(html).not.toContain('apply_component');
    expect(html.match(/从当前进度继续/g)).toHaveLength(1);
    expect(html).not.toContain('人声降噪'); expect(html).not.toContain('添加 Logo');
  });
});


it('shows branded cover work and preserves its delivery after reload', () => {
  const covered: ChatTask = { ...task, skills: [...task.skills, 'cover'], config: { ...config, skills: [...config.skills, 'cover'], brand: { ...config.brand!, blocks: { cover: { design: 'A strong portrait with a concise headline.' } } } } };
  const row = (current: ChatTask, messages: UIMessage[] = []) => editingTaskRows(current, report, messages, false).finishing.find(item => item.id === 'cover');
  expect(row(covered)?.status).toBe('pending');
  const generation: UIMessage = { id: 'cover', role: 'assistant', parts: [{ type: 'dynamic-tool', toolName: 'generate_image', toolCallId: 'cover', state: 'output-available', input: { purpose: 'cover' }, output: { ok: true, data: { ids: ['cover-job'] } } }] };
  expect(row(covered, [generation])?.status).toBe('running');
  const delivered: ChatTask = { ...covered, state: 'done', review: { completed: true, items: [], cover: { status: 'generated', reason: '封面已核对，标题与本视频内容一致。', url: 'https://cdn.example/cover.png' } } };
  expect(row(JSON.parse(JSON.stringify(delivered)))?.status).toBe('done');
  setStudioLocale('zh');
  const html = renderToStaticMarkup(createElement(EditingTaskCard, { task: delivered, messages: [], live: false, credits: 0, onContinue() {} }));
  expect(html).toContain('制作品牌封面');
  expect(html).not.toContain('查看封面原图');
  expect(html).not.toContain('https://cdn.example/cover.png');
});
