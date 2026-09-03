import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import {
  assistantEditorialCapacityShortfall,
  assistantHasOpenOrInterruptedInteraction,
  assistantMessageHasRenderableOutput,
  assistantMessageSuggestsContinuation,
  assistantWorkDurationMs,
  assistantWorkFold,
  canRunVisualReview,
  createStudioTurnLedger,
  compactStudioChatMessages,
  compactStudioChatMessagesForModel,
  effectiveStudioTurnMessages,
  MAX_STUDIO_TOOL_CALLS_PER_USER_TURN,
  recordStudioTurnToolResult,
  reserveStudioTurnToolCall,
  shouldBlockStudioTurnUndo,
  isRecoverableStudioChatError,
  sanitizeRestored,
  stampLatestAssistantWorkDuration,
} from './chat-thread-store';
import { analyzeVisualSourceLabel } from './chat-tool-parts';

const assistant = (parts: UIMessage['parts']): UIMessage => ({
  id: 'assistant-1',
  role: 'assistant',
  parts,
});

describe('sanitizeRestored', () => {
  it('removes leaked provider tool markup from persisted assistant text', () => {
    const [message] = sanitizeRestored([assistant([
      { type: 'text', text: '先处理。<｜｜DSML｜｜tool_calls><｜｜DSML｜｜invoke name="resize_block">x</｜｜DSML｜｜tool_calls>完成。' },
    ])]);
    expect((message!.parts[0] as { text: string }).text).toBe('先处理。完成。');
  });
});

describe('compactStudioChatMessages', () => {
  it('keeps every visible text fragment when later tool calls stream in', () => {
    const [message] = compactStudioChatMessages([assistant([
      { type: 'text', text: '让我先检查素材。' },
      { type: 'step-start' },
      { type: 'tool-list_assets', toolCallId: 'list-1', state: 'output-available', input: {}, output: {} },
      { type: 'text', text: '我需要再分析画面和参数。' },
      { type: 'tool-analyze_visual', toolCallId: 'vision-1', state: 'output-available', input: {}, output: {} },
      { type: 'reasoning', text: 'private chain' },
      { type: 'text', text: '已按旅行画面完成剪辑。' },
    ] as UIMessage['parts'])]);

    expect(message!.parts.map((part) => (part as { type: string }).type)).toEqual([
      'text',
      'tool-list_assets',
      'text',
      'tool-analyze_visual',
      'text',
    ]);
    expect(message!.parts
      .filter((part) => (part as { type: string }).type === 'text')
      .map((part) => (part as { text: string }).text)).toEqual([
      '让我先检查素材。',
      '我需要再分析画面和参数。',
      '已按旅行画面完成剪辑。',
    ]);
    expect((message!.parts.at(-1) as { text: string }).text).toBe('已按旅行画面完成剪辑。');
  });

  it('preserves a direct assistant answer when no tool was used', () => {
    const [message] = compactStudioChatMessages([assistant([{ type: 'text', text: '直接回答。' }])]);
    expect(message!.parts).toEqual([{ type: 'text', text: '直接回答。' }]);
  });
});

describe('assistantWorkFold', () => {
  const completedTurn = assistant([
    { type: 'text', text: '我先检查素材。' },
    { type: 'step-start' },
    { type: 'tool-list_assets', toolCallId: 'list-1', state: 'output-available', input: {}, output: {} },
    { type: 'reasoning', text: 'private chain' },
    { type: 'text', text: '素材已经检查并完成剪辑。' },
  ] as UIMessage['parts']);

  it('folds only a completed work log that is followed by a final summary', () => {
    expect(assistantWorkFold(completedTurn, true)).toEqual({
      lastWorkPartIndex: 2,
    });
    expect(assistantWorkFold(completedTurn, false)).toBeNull();
  });

  it('keeps direct answers and unfinished tool turns unfolded', () => {
    expect(assistantWorkFold(assistant([{ type: 'text', text: '直接回答。' }]), true)).toBeNull();
    expect(assistantWorkFold(assistant([
      { type: 'text', text: '正在处理。' },
      { type: 'tool-list_assets', toolCallId: 'list-1', state: 'output-available', input: {}, output: {} },
    ] as UIMessage['parts']), true)).toBeNull();
    expect(assistantWorkFold(assistant([
      { type: 'tool-analyze_visual', toolCallId: 'visual-1', state: 'output-available', input: {}, output: {} },
      { type: 'text', text: '画面已经选好。现在执行。' },
    ] as UIMessage['parts']), true)).toBeNull();
  });
});

describe('assistant work duration', () => {
  const completedParts = [
    { type: 'tool-list_assets', toolCallId: 'list-1', state: 'output-available', input: {}, output: {} },
    { type: 'text', text: '完成。' },
  ] as UIMessage['parts'];

  it('derives elapsed time from the preceding user request and then persists it', () => {
    const messages: UIMessage[] = [
      { id: 'user-1', role: 'user', metadata: { workStartedAt: 10_000 }, parts: [{ type: 'text', text: '开始' }] },
      assistant(completedParts),
    ];
    expect(assistantWorkDurationMs(messages, 1, 28_400)).toBe(18_400);
    const stamped = stampLatestAssistantWorkDuration(messages, 28_400);
    expect((stamped[1]!.metadata as { workDurationMs: number }).workDurationMs).toBe(18_400);
    expect(assistantWorkDurationMs(stamped, 1, 99_000)).toBe(18_400);
  });

  it('excludes time spent waiting on an interaction card from persisted work time', () => {
    const messages: UIMessage[] = [
      { id: 'user-1', role: 'user', metadata: { workStartedAt: 10_000 }, parts: [{ type: 'text', text: '开始' }] },
      assistant(completedParts),
    ];
    const stamped = stampLatestAssistantWorkDuration(messages, 40_000, 12_500);
    expect(stamped[1]!.metadata).toMatchObject({ workDurationMs: 17_500, workWaitDurationMs: 12_500 });
  });

  it('does not stamp a direct answer or an unfinished tool turn', () => {
    const direct = [assistant([{ type: 'text', text: '直接回答。' }])];
    expect(stampLatestAssistantWorkDuration(direct, 20_000)).toBe(direct);
  });
});

describe('compactStudioChatMessagesForModel', () => {
  it('replays every timeline snapshot unchanged so the request prefix stays byte-stable', () => {
    const oldTimeline = {
      type: 'tool-get_timeline', toolCallId: 'timeline-old', state: 'output-available', input: {},
      output: { ok: true, data: { durationSec: 0, tracks: [{ role: 'primaryNarrative', clips: [] }], dense: 'x'.repeat(20_000) } },
    };
    const currentTimeline = {
      type: 'tool-get_timeline', toolCallId: 'timeline-current', state: 'output-available', input: {},
      output: { ok: true, data: { durationSec: 12, tracks: [{ role: 'primaryNarrative', clips: [{ id: 'shot-1' }] }] } },
    };
    const message = assistant([oldTimeline, currentTimeline] as UIMessage['parts']);

    const [forModel] = compactStudioChatMessagesForModel([message]);
    expect((forModel!.parts[0] as { output: unknown }).output).toEqual(oldTimeline.output);
    expect((forModel!.parts[1] as { output: unknown }).output).toEqual(currentTimeline.output);
  });

  it('keeps the complete visual receipt for display but replays only editorial verdict evidence', () => {
    const subjectTracks = Array.from({ length: 100 }, (_, index) => ({ startSec: index, dense: 'x'.repeat(200) }));
    const message = assistant([{
      type: 'tool-analyze_visual',
      toolCallId: 'vision-1',
      state: 'output-available',
      input: { assetId: 'asset-1', mode: 'editorial' },
      output: {
        ok: true,
        summary: 'done',
        data: {
          analysisMode: 'editorial-candidates',
          assetId: 'asset-1',
          subjectTracks,
          qualityWindows: Array.from({ length: 20 }, (_, index) => ({ rank: index + 1 })),
          editorialCandidates: [{ candidateId: 'candidate-1', verdict: 'strong' }],
          unusedDensePayload: 'y'.repeat(50_000),
        },
      },
    }] as UIMessage['parts']);

    const [forModel] = compactStudioChatMessagesForModel([message]);
    const modelOutput = (forModel!.parts[0] as { output: { data: Record<string, unknown> } }).output.data;
    expect(modelOutput).not.toHaveProperty('subjectTracks');
    expect(modelOutput).not.toHaveProperty('qualityWindows');
    expect(modelOutput.editorialCandidates).toEqual([{ candidateId: 'candidate-1', verdict: 'strong' }]);
    expect(modelOutput).not.toHaveProperty('unusedDensePayload');
    expect(((message.parts[0] as { output: { data: Record<string, unknown> } }).output.data.subjectTracks as unknown[])).toHaveLength(100);
  });

  it('replays the assistant\'s own progress prose between receipts, capped', () => {
    const plan = '方案：第 2 句配新闻画面，第 4 句配桃子特写。'.repeat(200);
    const message = assistant([
      { type: 'text', text: '先落主轨，再审片。' },
      { type: 'tool-add_clips', toolCallId: 'add-1', state: 'output-available', input: {}, output: { ok: true } },
      { type: 'text', text: plan },
      { type: 'tool-add_clips', toolCallId: 'add-2', state: 'output-available', input: {}, output: { ok: true } },
      { type: 'text', text: '最终总结。' },
    ] as UIMessage['parts']);
    const [forModel] = compactStudioChatMessagesForModel([message]);
    expect(forModel!.parts).toHaveLength(5);
    expect(forModel!.parts[0]).toEqual({ type: 'text', text: '先落主轨，再审片。' });
    const replayedPlan = (forModel!.parts[2] as { text: string }).text;
    expect(replayedPlan.length).toBeLessThan(plan.length);
    expect(replayedPlan.startsWith(plan.slice(0, 2_000))).toBe(true);
    expect(replayedPlan.endsWith('[…]')).toBe(true);
    expect(forModel!.parts[4]).toEqual({ type: 'text', text: '最终总结。' });
    expect((message.parts[2] as { text: string }).text).toBe(plan);
  });

  it('replays v3 get_state snapshots unchanged as well', () => {
    const older = {
      type: 'tool-get_state', toolCallId: 'state-old', state: 'output-available', input: {},
      output: { ok: true, data: { tracks: [{ role: 'primaryNarrative', clips: [] }], dense: 'x'.repeat(20_000) } },
    };
    const newest = {
      type: 'tool-get_state', toolCallId: 'state-new', state: 'output-available', input: {},
      output: { ok: true, data: { tracks: [{ role: 'primaryNarrative', clips: [{ id: 'clip-1' }] }] } },
    };
    const [forModel] = compactStudioChatMessagesForModel([assistant([older, newest] as UIMessage['parts'])]);
    expect((forModel!.parts[0] as { output: unknown }).output).toEqual(older.output);
    expect((forModel!.parts[1] as { output: unknown }).output).toEqual(newest.output);
  });

  it('compacts every source receipt in one editorial batch without dropping verdicts', () => {
    const message = assistant([{
      type: 'tool-analyze_visual',
      toolCallId: 'vision-batch',
      state: 'output-available',
      input: { mode: 'editorial', items: [{ assetId: 'asset-a' }, { assetId: 'asset-b' }] },
      output: {
        ok: true,
        data: {
          analysisMode: 'editorial-batch',
          acceptedDurationSec: 7.5,
          items: [
            { ok: true, analysisMode: 'editorial-candidates', localAssetId: 'asset-a', editorialCandidates: [{ verdict: 'strong' }], dense: 'x'.repeat(10_000) },
            { ok: true, analysisMode: 'editorial-candidates', localAssetId: 'asset-b', editorialCandidates: [{ verdict: 'reject' }], dense: 'y'.repeat(10_000) },
          ],
        },
      },
    }] as UIMessage['parts']);
    const [forModel] = compactStudioChatMessagesForModel([message]);
    const data = (forModel!.parts[0] as { output: { data: { items: Array<Record<string, unknown>> } } }).output.data;
    expect(data).toMatchObject({ acceptedDurationSec: 7.5 });
    expect(data.items).toHaveLength(2);
    expect(data.items[0]!.editorialCandidates).toEqual([{ verdict: 'strong' }]);
    expect(data.items[0]).not.toHaveProperty('dense');
  });
});

describe('synchronous studio turn ledger', () => {
  it('blocks undo after a failed mutation until another mutation actually succeeds', () => {
    const ledger = createStudioTurnLedger();
    recordStudioTurnToolResult(ledger, {
      toolId: 'add_clips', toolCallId: 'failed-add', input: {},
      errorText: 'outside accepted range', canMutate: true,
    });
    expect(shouldBlockStudioTurnUndo(ledger)).toBe(true);

    recordStudioTurnToolResult(ledger, {
      toolId: 'get_timeline', toolCallId: 'read-only', input: {},
      output: { ok: true, data: { durationSec: 0 } }, canMutate: false,
    });
    expect(shouldBlockStudioTurnUndo(ledger)).toBe(true);

    recordStudioTurnToolResult(ledger, {
      toolId: 'add_clips', toolCallId: 'successful-add', input: {},
      output: { ok: true, data: { delta: { duration: [0, 3] } } }, canMutate: true,
    });
    expect(shouldBlockStudioTurnUndo(ledger)).toBe(false);
  });

  it('forces the next request to be final-only after the bounded tool budget', () => {
    const ledger = createStudioTurnLedger();
    for (let index = 0; index < MAX_STUDIO_TOOL_CALLS_PER_USER_TURN; index += 1) {
      expect(reserveStudioTurnToolCall(ledger).allowed).toBe(true);
    }
    expect(ledger.forceFinalResponse).toBe(true);
    expect(reserveStudioTurnToolCall(ledger).allowed).toBe(false);
  });
});

describe('analyze visual card context', () => {
  it('surfaces the resolved source label without showing an implementation id', () => {
    expect(analyzeVisualSourceLabel({
      type: 'tool-analyze_visual',
      state: 'output-available',
      input: { assetId: 'asset-internal-123' },
      output: { ok: true, data: { label: '海边回眸.mov' } },
    })).toBe('海边回眸.mov');
  });
});

describe('editorial capacity notice', () => {
  it('returns one material shortfall from the latest assemble_from_review receipt without blocking the result', () => {
    const covered = { type: 'tool-assemble_from_review', toolCallId: 'a1', state: 'output-available', input: {}, output: { ok: true, data: { result: { coverage: { targetDurationSec: 54, actualDurationSec: 53.6 } } } } };
    const short = { type: 'tool-assemble_from_review', toolCallId: 'a2', state: 'output-available', input: {}, output: { ok: true, data: { coverage: { targetDurationSec: 54, actualDurationSec: 36 } } } };
    expect(assistantEditorialCapacityShortfall(assistant([covered] as UIMessage['parts']))).toBeNull();
    expect(assistantEditorialCapacityShortfall(assistant([covered, short] as UIMessage['parts']))).toBe(18);
    expect(assistantEditorialCapacityShortfall(assistant([short, covered] as UIMessage['parts']))).toBeNull();
  });
});

describe('visual review budget', () => {
  it('allows one broad review and one targeted recheck per user turn', () => {
    expect(canRunVisualReview(0)).toBe(true);
    expect(canRunVisualReview(1)).toBe(true);
    expect(canRunVisualReview(2)).toBe(false);
  });
});

describe('assistantMessageHasRenderableOutput', () => {
  it('treats a reasoning-only completion as an empty response', () => {
    expect(assistantMessageHasRenderableOutput(assistant([
      { type: 'step-start' },
      { type: 'reasoning', text: 'internal planning' },
    ]))).toBe(false);
  });

  it('accepts visible text or a tool receipt', () => {
    expect(assistantMessageHasRenderableOutput(assistant([{ type: 'text', text: '完成' }]))).toBe(true);
    expect(assistantMessageHasRenderableOutput(assistant([
      { type: 'tool-seek', toolCallId: 'tool-1', state: 'output-available', input: {}, output: {} },
    ] as UIMessage['parts']))).toBe(true);
  });

  it('recognizes an interaction boundary that must not be auto-retried', () => {
    expect(assistantHasOpenOrInterruptedInteraction(assistant([
      { type: 'tool-ask_user', toolCallId: 'ask-1', state: 'output-error', input: {}, errorText: 'interrupted' },
    ] as UIMessage['parts']))).toBe(true);
    expect(assistantHasOpenOrInterruptedInteraction(assistant([
      { type: 'tool-request_approval', toolCallId: 'approval-1', state: 'input-available', input: {} },
    ] as UIMessage['parts']))).toBe(true);
    expect(assistantHasOpenOrInterruptedInteraction(assistant([
      { type: 'tool-ask_user', toolCallId: 'ask-2', state: 'output-available', input: {}, output: { ok: true } },
    ] as UIMessage['parts']))).toBe(false);
  });
});

describe('assistantMessageSuggestsContinuation', () => {
  it('detects a normal provider stop immediately before promised work', () => {
    expect(assistantMessageSuggestsContinuation(assistant([
      { type: 'text', text: '方案已经确认，我现在开始组片。' },
    ]))).toBe(true);
    expect(assistantMessageSuggestsContinuation(assistant([
      { type: 'text', text: '还有一部分需要处理，请点击继续。' },
    ]))).toBe(true);
    expect(assistantMessageSuggestsContinuation(assistant([
      { type: 'text', text: '本轮先注册配音，再放置画面。\n\n执行。' },
    ]))).toBe(true);
    expect(assistantMessageSuggestsContinuation(assistant([
      { type: 'text', text: '让我用一条自然收尾的镜头补上这段，然后加字幕。' },
    ]))).toBe(true);
    expect(assistantMessageSuggestsContinuation(assistant([
      { type: 'text', text: '正在检查时间线。' },
      { type: 'tool-get_timeline', toolCallId: 'timeline-final', state: 'output-available', input: {}, output: { ok: true } },
    ] as UIMessage['parts']))).toBe(true);
  });

  it('detects an output-limit truncation but still replays its text (capped, byte-stable)', () => {
    const truncated = assistant([
      { type: 'tool-get_timeline', toolCallId: 'timeline-1', state: 'output-available', input: {}, output: {} },
      { type: 'text', text: `${'继续计算镜头顺序。'.repeat(900)}clip_local_c` },
    ] as UIMessage['parts']);
    expect(assistantMessageSuggestsContinuation(truncated)).toBe(true);
    const replayed = compactStudioChatMessagesForModel([truncated])[0]!.parts;
    expect(replayed[0]).toEqual(truncated.parts[0]);
    expect((replayed[1] as { text: string }).text.endsWith('[…]')).toBe(true);
  });

  it('does not annotate a completed answer or duplicate an approval interaction', () => {
    expect(assistantMessageSuggestsContinuation(assistant([
      { type: 'text', text: '已经完成剪辑并复检，字幕与视频等长。' },
    ]))).toBe(false);
    expect(assistantMessageSuggestsContinuation(assistant([
      { type: 'text', text: '所有时间线操作均已执行。' },
    ]))).toBe(false);
    expect(assistantMessageSuggestsContinuation(assistant([
      { type: 'text', text: '确认后我会继续。' },
      { type: 'tool-request_approval', toolCallId: 'approval-1', state: 'input-available', input: {} },
    ] as UIMessage['parts']))).toBe(false);
  });
});

describe('isRecoverableStudioChatError', () => {
  it('allows one safe continuation for transport and stream interruption errors', () => {
    for (const message of ['studio_stream_interrupted', 'Failed to fetch', 'NetworkError', 'connection reset', 'stream terminated']) {
      expect(isRecoverableStudioChatError(new Error(message)), message).toBe(true);
    }
  });

  it('does not retry billing, auth, validation or unknown application errors', () => {
    for (const message of ['insufficient_tokens', '401 Unauthorized', 'invalid_messages', 'request_too_large', 'tool execution failed']) {
      expect(isRecoverableStudioChatError(new Error(message)), message).toBe(false);
    }
  });
});
