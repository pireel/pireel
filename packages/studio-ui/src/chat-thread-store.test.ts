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
  canRunEditorialAnalysis,
  createStudioTurnLedger,
  compactStudioChatMessages,
  compactStudioChatMessagesForModel,
  editorialPlacementIssue,
  effectiveStudioTurnMessages,
  hasCompletedEditorialPlacement,
  hasPostAssemblyTimelineSnapshot,
  MAX_STUDIO_TOOL_CALLS_PER_USER_TURN,
  narrationDurationFromMessages,
  recordStudioTurnToolResult,
  reserveStudioTurnToolCall,
  shouldBlockStudioTurnUndo,
  prepareEditorialPlacement,
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
  it('replays only the newest full timeline snapshot in a long tool turn', () => {
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
    expect((forModel!.parts[0] as { output: { data: Record<string, unknown> } }).output.data).toEqual(expect.objectContaining({ superseded: true }));
    expect((forModel!.parts[1] as { output: unknown }).output).toEqual(currentTimeline.output);
    expect((message.parts[0] as { output: unknown }).output).toEqual(oldTimeline.output);
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

  it('does not replay visible progress chatter that precedes tool receipts', () => {
    const message = assistant([
      { type: 'text', text: '这里是一大段过程说明。' },
      { type: 'tool-list_assets', toolCallId: 'list-1', state: 'output-available', input: {}, output: { ok: true } },
      { type: 'text', text: '最终总结。' },
    ] as UIMessage['parts']);
    const [forModel] = compactStudioChatMessagesForModel([message]);
    expect(forModel!.parts).toEqual([
      message.parts[1],
      { type: 'text', text: '最终总结。' },
    ]);
    expect(message.parts[0]).toEqual({ type: 'text', text: '这里是一大段过程说明。' });
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

describe('editorial placement receipts', () => {
  const review = assistant([{
    type: 'tool-analyze_visual',
    toolCallId: 'vision-1',
    state: 'output-available',
    input: { assetId: 'asset-beach', mode: 'editorial' },
    output: {
      ok: true,
      data: {
        localAssetId: 'asset-beach',
        editorialCandidates: [
          {
            candidateId: 'candidate-1', verdict: 'strong', startSec: 0.3, endSec: 2.1,
            rank: 1, score: 90, contentRole: 'person-primary', action: 'turn', rationale: 'complete',
            openingFrameScore: 90, openingFrameState: 'stable', roleFit: [], issues: [],
            scoreBreakdown: { subjectClarity: 90, aestheticFit: 90, composition: 90, temporalCompleteness: 90, editability: 90 },
            actionPhases: [], rejectedRanges: [], entryState: '', exitState: '', cameraMotion: '', subjectPlacement: '', bestUse: '', cutOptions: [],
          },
          {
            candidateId: 'candidate-2', verdict: 'reject', startSec: 4, endSec: 6,
            rank: 2, score: 20, contentRole: 'person-primary', action: 'setup', rationale: 'reject',
            openingFrameScore: 20, openingFrameState: 'unstable', roleFit: [], issues: [],
            scoreBreakdown: { subjectClarity: 20, aestheticFit: 20, composition: 20, temporalCompleteness: 20, editability: 20 },
            actionPhases: [], rejectedRanges: [], entryState: '', exitState: '', cameraMotion: '', subjectPlacement: '', bestUse: '', cutOptions: [],
          },
        ],
      },
    },
  }] as UIMessage['parts']);

  it('allows an explicit source interval inside an accepted candidate', () => {
    expect(editorialPlacementIssue([review], 'add_clips', {
      clips: [{ assetId: 'asset-beach', role: 'primary', sourceInSec: 0.4, sourceOutSec: 2 }],
    })).toBeNull();
  });

  it('blocks whole-source or rejected-range placement after review', () => {
    expect(editorialPlacementIssue([review], 'add_clips', {
      clips: [{ assetId: 'asset-beach', role: 'primary' }],
    })).toMatchObject({ reason: 'range-required' });
    expect(editorialPlacementIssue([review], 'insert_clips', {
      clips: [{ assetId: 'asset-beach', role: 'primary', sourceInSec: 4.2, sourceOutSec: 5.8 }],
    })).toMatchObject({ reason: 'outside-accepted-range' });
  });

  it('enforces accepted ranges returned inside one batch review receipt', () => {
    const batchReview = assistant([{
      type: 'tool-analyze_visual',
      toolCallId: 'vision-batch',
      state: 'output-available',
      input: { mode: 'editorial', items: [{ assetId: 'asset-a' }] },
      output: {
        ok: true,
        data: {
          analysisMode: 'editorial-batch',
          items: [{
            ok: true,
            analysisMode: 'editorial-candidates',
            localAssetId: 'asset-a',
            editorialCandidates: [{ verdict: 'usable', startSec: 2, endSec: 4 }],
          }],
        },
      },
    }] as UIMessage['parts']);
    expect(editorialPlacementIssue([batchReview], 'add_clips', {
      clips: [{ assetId: 'asset-a', role: 'primary', sourceInSec: 2.2, sourceOutSec: 3.8 }],
    })).toBeNull();
    expect(editorialPlacementIssue([batchReview], 'add_clips', {
      clips: [{ assetId: 'asset-a', role: 'primary', sourceInSec: 0, sourceOutSec: 1 }],
    })).toMatchObject({ reason: 'outside-accepted-range' });
  });

  it('marks a prepared montage as an atomic primary-track replacement and recognizes its picture lock receipt', () => {
    const prepared = prepareEditorialPlacement([review], 'add_clips', {
      clips: [{ assetId: 'asset-beach', role: 'primary', startSec: 0, sourceInSec: 0.3, sourceOutSec: 2.1 }],
    }, 1.8);
    expect(prepared?.input).toMatchObject({ __replacePrimaryTrack: true });

    const completed = assistant([{
      type: 'tool-add_clips',
      toolCallId: 'assembly-1',
      state: 'output-available',
      input: prepared?.input,
      output: { ok: true, data: { editorialAssembly: { targetDurationSec: 1.8, actualDurationSec: 1.8 } } },
    }] as UIMessage['parts']);
    expect(hasCompletedEditorialPlacement([review, completed])).toBe(true);
    expect(hasPostAssemblyTimelineSnapshot([review, completed])).toBe(false);
    const verified = assistant([{
      type: 'tool-get_timeline', toolCallId: 'timeline-after-assembly', state: 'output-available', input: {},
      output: { ok: true, data: { durationSec: 1.8, tracks: [] } },
    }] as UIMessage['parts']);
    expect(hasPostAssemblyTimelineSnapshot([review, completed, verified])).toBe(true);
  });

  it('engages deterministic assembly for a mixed batch whose picture rows omit startSec', () => {
    const prepared = prepareEditorialPlacement([review], 'add_clips', {
      clips: [
        { assetId: 'narration-asset', role: 'narration', startSec: 0, durationSec: 1.8 },
        { assetId: 'asset-beach', role: 'primary', muted: true, sourceInSec: 0.3, sourceOutSec: 2.1 },
      ],
    }, 1.8);
    expect(prepared).not.toBeNull();
    expect(prepared!.input).toMatchObject({ __replacePrimaryTrack: true });
    const clips = prepared!.input.clips as Array<Record<string, unknown>>;
    expect(clips[0]).toMatchObject({ role: 'narration', assetId: 'narration-asset' });
    expect(clips.length).toBeGreaterThan(1);
    expect(clips.slice(1).every((clip) => clip.role === 'primary' && typeof clip.startSec === 'number')).toBe(true);
  });

  it('makes a just-finished review available before React commits the SDK message', () => {
    const ledger = createStudioTurnLedger();
    recordStudioTurnToolResult(ledger, {
      toolId: 'analyze_visual',
      toolCallId: 'vision-live',
      input: { mode: 'editorial' },
      output: (review.parts[0] as { output: Record<string, unknown> }).output,
      canMutate: false,
    });

    const effective = effectiveStudioTurnMessages([], ledger);
    expect(prepareEditorialPlacement(effective, 'add_clips', {
      clips: [{ assetId: 'asset-beach', role: 'primary', startSec: 0, sourceInSec: 0.3, sourceOutSec: 2.1 }],
    }, 1.8)).not.toBeNull();
  });
});

describe('synchronous studio turn ledger', () => {
  it('locks picture immediately and detects one unchanged timeline re-read', () => {
    const ledger = createStudioTurnLedger();
    recordStudioTurnToolResult(ledger, {
      toolId: 'add_clips',
      toolCallId: 'assembly-live',
      input: {},
      output: { ok: true, data: { delta: { duration: [0, 4] }, editorialAssembly: { actualDurationSec: 4 } } },
      canMutate: true,
    });
    expect(ledger.pictureLocked).toBe(true);

    const first = recordStudioTurnToolResult(ledger, {
      toolId: 'get_timeline', toolCallId: 'timeline-1', input: {},
      output: { ok: true, data: { durationSec: 4, tracks: [{ id: 'primary' }] } }, canMutate: false,
    });
    const repeated = recordStudioTurnToolResult(ledger, {
      toolId: 'get_timeline', toolCallId: 'timeline-2', input: {},
      output: { ok: true, data: { durationSec: 4, tracks: [{ id: 'primary' }] } }, canMutate: false,
    });
    expect(first.timelineUnchanged).toBe(false);
    expect(repeated.timelineUnchanged).toBe(true);
    expect(ledger.blockFurtherTimelineReads).toBe(true);
  });

  it('forces the final response only after persistently refused timeline reads', () => {
    const ledger = createStudioTurnLedger();
    const read = (id: string) => recordStudioTurnToolResult(ledger, {
      toolId: 'get_timeline', toolCallId: id, input: {},
      output: { ok: true, data: { durationSec: 4, tracks: [] } }, canMutate: false,
    });
    read('t1'); read('t2'); read('t3');
    expect(ledger.forceFinalResponse).toBe(false);
    // A real edit re-arms the read budget instead of counting toward the loop breaker.
    recordStudioTurnToolResult(ledger, {
      toolId: 'add_clips', toolCallId: 'edit', input: {},
      output: { ok: true, data: { delta: { durationSec: [4, 6] } } }, canMutate: true,
    });
    expect(ledger.refusedTimelineReads).toBe(0);
    read('t4'); read('t5'); read('t6'); read('t7');
    expect(ledger.forceFinalResponse).toBe(true);
  });

  it('re-locks the picture and disarms repair when a covering assembly lands', () => {
    const ledger = createStudioTurnLedger();
    ledger.pictureRepairArmed = true;
    recordStudioTurnToolResult(ledger, {
      toolId: 'add_clips', toolCallId: 'repair', input: {},
      output: { ok: true, data: { delta: { durationSec: [46, 50] }, editorialAssembly: { targetDurationSec: 50, actualDurationSec: 50 } } },
      canMutate: true,
    });
    expect(ledger.pictureLocked).toBe(true);
    expect(ledger.pictureRepairArmed).toBe(false);
  });

  it('forces the final response after a failed call is retried verbatim', () => {
    const ledger = createStudioTurnLedger();
    const failRemove = (id: string) => recordStudioTurnToolResult(ledger, {
      toolId: 'remove_clips', toolCallId: id, input: { clipIds: ['clip-gone'] },
      errorText: 'clip not found: clip-gone', canMutate: true,
    });
    expect(failRemove('f1').repeatedFailureCount).toBe(1);
    // Skipped no-ops between retries must not disarm the breaker.
    recordStudioTurnToolResult(ledger, {
      toolId: 'get_timeline', toolCallId: 'skip', input: {},
      output: { ok: true, skipped: true, data: { instruction: 'stop' } }, canMutate: false,
    });
    expect(failRemove('f2').repeatedFailureCount).toBe(2);
    expect(ledger.forceFinalResponse).toBe(false);
    failRemove('f3');
    expect(ledger.forceFinalResponse).toBe(true);

    // A different input is a fresh attempt, and a genuine success clears the streak.
    const other = createStudioTurnLedger();
    recordStudioTurnToolResult(other, {
      toolId: 'remove_clips', toolCallId: 'g1', input: { clipIds: ['a'] },
      errorText: 'clip not found: a', canMutate: true,
    });
    recordStudioTurnToolResult(other, {
      toolId: 'remove_clips', toolCallId: 'g2', input: { clipIds: ['b'] },
      errorText: 'clip not found: b', canMutate: true,
    });
    expect(other.repeatedFailureCount).toBe(1);
    recordStudioTurnToolResult(other, {
      toolId: 'add_clips', toolCallId: 'g3', input: {},
      output: { ok: true, data: { delta: { durationSec: [0, 4] } } }, canMutate: true,
    });
    expect(other.repeatedFailureCount).toBe(0);
    expect(other.lastFailureSig).toBeNull();
  });

  it('refuses to lock the picture on an under-target assembly so the gap stays fixable', () => {
    const ledger = createStudioTurnLedger();
    recordStudioTurnToolResult(ledger, {
      toolId: 'add_clips', toolCallId: 'assembly-short', input: {},
      output: { ok: true, data: { delta: { durationSec: [0, 36] }, editorialAssembly: { targetDurationSec: 53.8, actualDurationSec: 35.95 } } },
      canMutate: true,
    });
    expect(ledger.pictureLocked).toBe(false);

    recordStudioTurnToolResult(ledger, {
      toolId: 'add_clips', toolCallId: 'assembly-full', input: {},
      output: { ok: true, data: { delta: { durationSec: [36, 53.5] }, editorialAssembly: { targetDurationSec: 53.8, actualDurationSec: 53.4 } } },
      canMutate: true,
    });
    expect(ledger.pictureLocked).toBe(true);

    const shortReceipt = assistant([{
      type: 'tool-add_clips', toolCallId: 'assembly-short-msg', state: 'output-available', input: {},
      output: { ok: true, data: { editorialAssembly: { targetDurationSec: 53.8, actualDurationSec: 35.95 } } },
    }] as UIMessage['parts']);
    expect(hasCompletedEditorialPlacement([shortReceipt])).toBe(false);
    expect(hasPostAssemblyTimelineSnapshot([shortReceipt])).toBe(false);
  });

  it('invalidates the read snapshot when a NO_UNDO tool still changes state (undo, output switch)', () => {
    const ledger = createStudioTurnLedger();
    const snapshot = { ok: true, data: { durationSec: 4, tracks: [{ id: 'primary' }] } };
    recordStudioTurnToolResult(ledger, {
      toolId: 'get_timeline', toolCallId: 'timeline-1', input: {}, output: snapshot, canMutate: false,
    });
    recordStudioTurnToolResult(ledger, {
      toolId: 'get_timeline', toolCallId: 'timeline-2', input: {}, output: snapshot, canMutate: false,
    });
    expect(ledger.blockFurtherTimelineReads).toBe(true);

    // undo carries a delta but sits outside the composition undo roster (canMutate=false).
    recordStudioTurnToolResult(ledger, {
      toolId: 'undo', toolCallId: 'undo-1', input: {},
      output: { ok: true, data: { delta: { durationSec: [4, 0.1] } } }, canMutate: false,
    });
    expect(ledger.blockFurtherTimelineReads).toBe(false);
    expect(ledger.lastTimelineFingerprint).toBeNull();
  });

  it('recovers the narration target from speech receipts when the clip is absent from the timeline', () => {
    const generated = assistant([{
      type: 'tool-generate_speech', toolCallId: 'speech-1', state: 'output-available', input: {},
      output: { ok: true, data: { asset: { id: 'up_1', durationSec: 55.656 } } },
    }] as UIMessage['parts']);
    expect(narrationDurationFromMessages([generated])).toBe(55.656);

    const registered = assistant([{
      type: 'tool-register_media', toolCallId: 'register-1', state: 'output-available',
      input: { assets: [{ id: 'up_2', kind: 'audio', durationSec: 42.5, transcriptText: '旁白文本' }] },
      output: { ok: true, data: {} },
    }] as UIMessage['parts']);
    expect(narrationDurationFromMessages([registered])).toBe(42.5);

    const plainAudio = assistant([{
      type: 'tool-register_media', toolCallId: 'register-2', state: 'output-available',
      input: { assets: [{ id: 'up_3', kind: 'audio', durationSec: 30 }] },
      output: { ok: true, data: {} },
    }] as UIMessage['parts']);
    expect(narrationDurationFromMessages([plainAudio])).toBe(0);
  });

  it('scopes the picture lock to the current user turn', () => {
    const oldAssembly = assistant([{
      type: 'tool-add_clips', toolCallId: 'assembly-old', state: 'output-available', input: {},
      output: { ok: true, data: { editorialAssembly: { targetDurationSec: 4, actualDurationSec: 4 } } },
    }] as UIMessage['parts']);
    const newUserRequest: UIMessage = {
      id: 'user-recut', role: 'user', parts: [{ type: 'text', text: '重新剪一版画面' }],
    };
    expect(hasCompletedEditorialPlacement([oldAssembly])).toBe(true);
    expect(hasCompletedEditorialPlacement([oldAssembly, newUserRequest])).toBe(false);
    expect(hasPostAssemblyTimelineSnapshot([oldAssembly, newUserRequest])).toBe(false);
  });

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
  it('returns one material shortfall from the latest completed assembly without blocking the result', () => {
    const message = assistant([
      {
        type: 'tool-add_clips', toolCallId: 'assembly-short', state: 'output-available', input: {},
        output: { ok: true, data: { editorialAssembly: { targetDurationSec: 51.912, actualDurationSec: 40.321 } } },
      },
      { type: 'text', text: '已完成当前版本。' },
    ] as UIMessage['parts']);
    expect(assistantEditorialCapacityShortfall(message)).toBe(11.6);
  });

  it('does not warn for a sub-second or three-percent fitting tolerance', () => {
    const message = assistant([{
      type: 'tool-add_clips', toolCallId: 'assembly-close', state: 'output-available', input: {},
      output: { ok: true, data: { editorialAssembly: { targetDurationSec: 40, actualDurationSec: 39.2 } } },
    }] as UIMessage['parts']);
    expect(assistantEditorialCapacityShortfall(message)).toBeNull();
  });
});

describe('visual review budget', () => {
  it('allows one broad review and one targeted recheck per user turn', () => {
    expect(canRunVisualReview(0)).toBe(true);
    expect(canRunVisualReview(1)).toBe(true);
    expect(canRunVisualReview(2)).toBe(false);
  });
});

describe('editorial analysis budget', () => {
  it('permits one complete source-selection pass per user turn', () => {
    expect(canRunEditorialAnalysis(0)).toBe(true);
    expect(canRunEditorialAnalysis(1)).toBe(false);
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

  it('detects an output-limit truncation and omits its scratchpad from model replay', () => {
    const truncated = assistant([
      { type: 'tool-get_timeline', toolCallId: 'timeline-1', state: 'output-available', input: {}, output: {} },
      { type: 'text', text: `${'继续计算镜头顺序。'.repeat(900)}clip_local_c` },
    ] as UIMessage['parts']);
    expect(assistantMessageSuggestsContinuation(truncated)).toBe(true);
    expect(compactStudioChatMessagesForModel([truncated])[0]!.parts).toEqual([truncated.parts[0]]);
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
