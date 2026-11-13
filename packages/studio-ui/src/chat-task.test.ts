import { describe, expect, it } from 'vitest';
import type { UIMessage } from 'ai';
import { MAX_TASK_TOOL_TIMINGS, latestTask, patchTask, resumeTaskHint, resumeEditingTask, taskOf, taskToolTimings, unfinishedRoughCut, withTaskUsage, withToolTimings, type ChatTask, type ChatToolTiming } from '@pireel/studio-ui/chat-task';
import { compactStudioChatMessagesForModel, createStudioTurnLedger, effectiveStudioTurnMessages, recordStudioTurnToolResult, sanitizeRestored } from '@pireel/studio-ui/chat-thread-store';

const task = (id: string): ChatTask => ({ id, goal: 'Edit the full video', skills: ['captions', 'graphics'], mode: 'one-click', state: 'running' });
const user = (id: string, value: ChatTask): UIMessage => ({ id, role: 'user', parts: [{ type: 'text', text: id }], metadata: { task: value } });

describe('durable editing task', () => {
  it('keeps late usage on its originating task, even after another task starts', () => {
    const messages = [user('u1', task('original')), user('u2', task('new'))];
    const apply = (messages: UIMessage[]) => patchTask(messages, 'original', current => withTaskUsage(current, 'call-1', { source: 'server', reference: 'asr-1', credits: 3 }));
    const updated = apply(apply(messages));
    expect(taskOf(updated[0])?.lateUsage).toEqual({ 'asr-1': 3 });
    expect(latestTask(updated)?.lateUsage).toBeUndefined();
  });

  it('updates the latest continuation without rewriting previous model receipts', () => {
    const original = user('u1', task('same'));
    const updated = patchTask([original, user('u2', task('same'))], 'same', current => ({ ...current, state: 'paused' }));
    expect(updated[0]).toBe(original);
    expect(taskOf(updated[1])?.state).toBe('paused');
  });

  it('restores an interrupted run as paused without automatically restarting', () => {
    const restored = sanitizeRestored([user('u1', task('a')), {
      id: 'a1', role: 'assistant', parts: [{ type: 'dynamic-tool', toolName: 'rough_cut', toolCallId: 'c1', state: 'input-available', input: {} }],
    }]);
    expect(latestTask(restored)?.state).toBe('paused');
    expect(restored[1]?.parts[0]).toMatchObject({ state: 'output-error' });
  });

  it('checkpoints completed receipts even while the SDK still shows the tool as running', () => {
    const ledger = createStudioTurnLedger();
    recordStudioTurnToolResult(ledger, { toolId: 'rough_cut', toolCallId: 'c1', input: {}, output: { ok: true }, canMutate: true });
    const messages: UIMessage[] = [{ id: 'a1', role: 'assistant', parts: [{ type: 'dynamic-tool', toolName: 'rough_cut', toolCallId: 'c1', state: 'input-available', input: {} }] }];
    const saved = effectiveStudioTurnMessages(messages, ledger);
    expect(saved).toHaveLength(1);
    expect(saved[0]!.parts[0]).toMatchObject({ state: 'output-available', output: { ok: true } });
  });
  it('resets only unfinished rough-cut states when continuing without losing completed checkpoints', () => {
    const paused: ChatTask = { ...task('same'), state: 'paused', roughCut: { callId: 'failed-call', report: {
      state: 'partial', credits: 1, summary: '部分工作尚未完成', sourceAssetId: 'source',
      steps: [{ id: 'transcribe', status: 'done', detail: '16 句' }, { id: 'pauses', status: 'failed', detail: 'Outdated module' }, { id: 'cleanup', status: 'done', detail: '3 fillers' }, { id: 'captions', status: 'pending' }, { id: 'loudness', status: 'skipped' }],
      cleanup: { source: { applied: ['fillers'], analysis: { cuts: [], unsure: [], sensitive: [] } } },
    } } };
    const resumed = resumeEditingTask(paused);
    expect(resumed.state).toBe('running');
    expect(resumed.roughCut?.report.state).toBe('running');
    expect(resumed.roughCut?.report.summary).toBeUndefined();
    expect(resumed.roughCut?.report.steps).toEqual([
      { id: 'transcribe', status: 'done', detail: '16 句' }, { id: 'pauses', status: 'pending' }, { id: 'cleanup', status: 'done', detail: '3 fillers' }, { id: 'captions', status: 'pending' }, { id: 'loudness', status: 'skipped' },
    ]);
    expect(resumed.roughCut?.report.credits).toBe(1);
    expect(resumed.roughCut?.report.cleanup).toEqual(paused.roughCut?.report.cleanup);
    expect(paused.roughCut?.report.steps[1]).toMatchObject({ status: 'failed', detail: 'Outdated module' });
    const finished = { ...paused, roughCut: { callId: 'success', report: { ...paused.roughCut!.report, state: 'done' as const, steps: [{ id: 'pauses' as const, status: 'done' as const }] } } };
    expect(resumeEditingTask(finished).roughCut).toBe(finished.roughCut);
  });

  it('retains the original goal and exact unfinished steps for a continuation', () => {
    const current: ChatTask = { ...task('a'), roughCut: { callId: 'c1', report: { state: 'partial', credits: 4, steps: [{ id: 'transcribe', status: 'done' }, { id: 'captions', status: 'failed', detail: 'not applied' }] } } };
    expect(unfinishedRoughCut(current)).toBe(true);
    expect(resumeTaskHint(current)).toContain('Edit the full video');
    expect(resumeTaskHint(current)).toContain('captions, graphics');
    expect(resumeTaskHint(current)).toContain('"status":"failed"');
    expect(unfinishedRoughCut({ ...current, roughCut: { ...current.roughCut!, report: { state: 'done', credits: 4, steps: [{ id: 'captions', status: 'done' }] } } })).toBe(false);
  });
});

describe('tool timings of a task', () => {
  const timing = (tool: string, at: number, ms = 100): ChatToolTiming => ({ tool, at, ms, ok: true });

  it('saves what the task held when the thread opened, then what was measured since', () => {
    const opened = [user('u1', { ...task('edit'), toolTimings: [timing('rough_cut', 1)] })];
    const held = taskToolTimings(opened);
    const measured = new Map([['edit', [timing('inspect_timeline', 2, 7000), timing('set_look', 3)]]]);
    const saved = withToolTimings(opened, held, measured);
    expect(taskOf(saved[0])?.toolTimings?.map((entry) => entry.tool)).toEqual(['rough_cut', 'inspect_timeline', 'set_look']);
    // The live messages are not touched.
    expect(taskOf(opened[0])?.toolTimings).toHaveLength(1);
  });

  it('adds nothing twice when the copy being saved already carries them', () => {
    const opened = [user('u1', task('edit'))];
    const held = taskToolTimings(opened);
    const measured = new Map([['edit', [timing('add_clips', 5)]]]);
    const once = withToolTimings(opened, held, measured);
    expect(taskOf(withToolTimings(once, held, measured)[0])?.toolTimings).toEqual([timing('add_clips', 5)]);
  });

  it('writes to the latest continuation of the task and leaves other tasks alone', () => {
    const messages = [user('u1', task('edit')), user('u2', task('other')), user('u3', task('edit'))];
    const saved = withToolTimings(messages, new Map(), new Map([['edit', [timing('get_state', 9)]]]));
    expect(saved[0]).toBe(messages[0]);
    expect(saved[1]).toBe(messages[1]);
    expect(taskOf(saved[2])?.toolTimings).toHaveLength(1);
    expect(withToolTimings(messages, new Map(), new Map([['edit', []]]))).toBe(messages);
  });

  it('keeps the latest calls of a task that makes more than the list holds', () => {
    const many = Array.from({ length: MAX_TASK_TOOL_TIMINGS + 5 }, (_, index) => timing('set_clip_properties', index));
    const saved = withToolTimings([user('u1', task('edit'))], new Map(), new Map([['edit', many]]));
    expect(taskOf(saved[0])?.toolTimings).toHaveLength(MAX_TASK_TOOL_TIMINGS);
    expect(taskOf(saved[0])?.toolTimings?.at(-1)?.at).toBe(MAX_TASK_TOOL_TIMINGS + 4);
  });

  it('does not send them with a request', () => {
    const messages = [user('u1', { ...task('edit'), toolTimings: [timing('rough_cut', 1)] }), user('u2', task('plain'))];
    const sent = compactStudioChatMessagesForModel(messages);
    expect(taskOf(sent[0])).toEqual(task('edit'));
    expect(sent[1]).toBe(messages[1]);
  });
});
