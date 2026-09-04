/** Server-backed Studio chat thread validation, restore sanitizing, and title derivation. */

import type { UIMessage } from 'ai';
import { t } from './i18n';
import type { AttachedFrame } from './studio-chat';
import { stripLeakedToolProtocolText } from '@pireel/studio-engine/tool-protocol-text';
import {
  isStudioScenarioSkillId,
  type StudioScenarioSkillId,
} from '@pireel/studio-engine/scenario-skills';
import { MAX_VISUAL_QUESTION_RANGES } from '@pireel/studio-engine/visual-question';

export interface StoredThread {
  id: string;
  title: string;
  messages: UIMessage[];
  updatedAt: number;
  /** Frame attached to the session (theme button highlight comes back when restoring the session). */
  frame?: AttachedFrame | null;
  /** Rich Markdown Studio Skill attached to this session; missing means no Skill. */
  skillId?: StudioScenarioSkillId;
}

/** Editorial evidence arrives as analyze_visual receipts on the legacy surface and as inspect_media
 * (mode editorial) receipts on v3; both carry the same editorialCandidates payload. */
export const isVisualAnalysisToolId = (id: string | undefined): boolean => id === 'analyze_visual' || id === 'inspect_media';



export interface StudioTurnLedger {
  /** Tool receipts published synchronously, before React/useChat commits them to message state. */
  receipts: UIMessage['parts'];
  unsafeUndoBlocked: boolean;
  /** Signature (tool + input) of the most recent failed call, for detecting verbatim retries. */
  lastFailureSig: string | null;
  /** How many consecutive times that same failing call has been fired. */
  repeatedFailureCount: number;
  /** Tool id of the most recent failed call, for detecting reworded retries of one tool. */
  lastFailureToolId: string | null;
  /** How many consecutive failures the same tool has produced, regardless of input. */
  sameToolFailureCount: number;
}

export interface StudioTurnToolResultRecord {
  toolId: string;
  toolCallId: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorText?: string;
  /** Whether this tool participates in the composition undo stack. */
  canMutate: boolean;
}

export function createStudioTurnLedger(): StudioTurnLedger {
  return {
    receipts: [],
    unsafeUndoBlocked: false,
    lastFailureSig: null,
    repeatedFailureCount: 0,
    lastFailureToolId: null,
    sameToolFailureCount: 0,
  };
}

function studioTimelineFingerprint(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const value = JSON.stringify(data);
  // Small synchronous FNV-1a fingerprint. Keeping the full repeated timeline in the live ledger
  // would retain tens of kilobytes solely to discover that nothing changed.
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${value.length}:${(hash >>> 0).toString(16)}`;
}

/** Publish a receipt to the synchronous turn ledger. This is the authority used by the next tool
 * call in the same streaming turn; rendered message history catches up later. */
export function recordStudioTurnToolResult(
  ledger: StudioTurnLedger,
  record: StudioTurnToolResultRecord,
): { repeatedFailureCount: number; sameToolFailureCount: number } {
  const failed = !!record.errorText || record.output?.ok === false;
  if (failed) {
    const failureSig = `${record.toolId}:${studioTimelineFingerprint(record.input) ?? ''}`;
    ledger.repeatedFailureCount = failureSig === ledger.lastFailureSig ? ledger.repeatedFailureCount + 1 : 1;
    ledger.lastFailureSig = failureSig;
    ledger.sameToolFailureCount = record.toolId === ledger.lastFailureToolId ? ledger.sameToolFailureCount + 1 : 1;
    ledger.lastFailureToolId = record.toolId;
  } else if (record.output?.skipped !== true) {
    // Only a genuinely executed success clears the streak — refused/skipped no-ops interleaved
    // between verbatim retries must not disarm the breaker.
    ledger.lastFailureSig = null;
    ledger.repeatedFailureCount = 0;
    ledger.lastFailureToolId = null;
    ledger.sameToolFailureCount = 0;
  }
  const data = record.output?.data && typeof record.output.data === 'object'
    ? record.output.data as Record<string, unknown>
    : null;
  // Mutation is judged by the receipt's delta, not by the undo-stack roster: undo and the
  // output-scope tools sit outside canMutate yet genuinely change project state, and their
  // receipts carry a delta.
  const didMutate = !failed && !!data?.delta && typeof data.delta === 'object';
  if (record.canMutate && failed) ledger.unsafeUndoBlocked = true;
  if (didMutate) ledger.unsafeUndoBlocked = false;

  ledger.receipts.push((record.errorText
    ? {
        type: `tool-${record.toolId}`,
        toolCallId: record.toolCallId,
        state: 'output-error',
        input: record.input,
        errorText: record.errorText,
      }
    : {
        type: `tool-${record.toolId}`,
        toolCallId: record.toolCallId,
        state: 'output-available',
        input: record.input,
        output: record.output ?? { ok: true },
      }) as UIMessage['parts'][number]);
  return { repeatedFailureCount: ledger.repeatedFailureCount, sameToolFailureCount: ledger.sameToolFailureCount };
}

export function shouldBlockStudioTurnUndo(ledger: StudioTurnLedger): boolean {
  return ledger.unsafeUndoBlocked;
}

/** Narration is the montage's master clock, but the narration clip can be absent from the timeline
 * (never placed yet, or rolled back). Without a fallback the deterministic assembly layer silently
 * disengages at target=0 and placement degrades to freehand. Recover the target from the most
 * recent narration audio this turn produced: a generate_speech receipt's measured duration, or a
 * register_media call for a transcript-bearing audio asset. */
/** Merge receipts that may not have reached React state yet. De-duplicate once useChat catches up. */
export function effectiveStudioTurnMessages(
  messages: readonly UIMessage[],
  ledger: StudioTurnLedger,
): UIMessage[] {
  if (!ledger.receipts.length) return messages as UIMessage[];
  const committed = new Set<string>();
  for (const message of messages) {
    for (const part of message.parts ?? []) {
      const toolCallId = (part as { toolCallId?: unknown }).toolCallId;
      if (typeof toolCallId === 'string') committed.add(toolCallId);
    }
  }
  const pending = ledger.receipts.filter((part) => {
    const toolCallId = (part as { toolCallId?: unknown }).toolCallId;
    return typeof toolCallId !== 'string' || !committed.has(toolCallId);
  });
  if (!pending.length) return messages as UIMessage[];
  return [...messages, { id: '__studio-turn-ledger__', role: 'assistant', parts: pending }];
}

export interface AssistantWorkFold {
  /** Every part through this index belongs to the collapsible work log. */
  lastWorkPartIndex: number;
}

/**
 * Split a completed assistant turn into its live work log and its final answer.
 *
 * Nothing is deleted or rewritten: while streaming, every update remains visible. Once the turn
 * has both a tool receipt and later summary text, the UI may collapse the earlier parts and leave
 * that summary visible. Deriving this from persisted message parts also keeps refresh behavior
 * deterministic without storing presentation state in the conversation.
 */
export function assistantWorkFold(
  message: UIMessage,
  completed: boolean,
): AssistantWorkFold | null {
  if (!completed || message.role !== 'assistant' || assistantMessageSuggestsContinuation(message)) return null;
  const parts = message.parts ?? [];
  const lastWorkPartIndex = parts.reduce((latest, part, index) => {
    const type = (part as { type?: string }).type ?? '';
    return type.startsWith('tool-') || type === 'dynamic-tool' ? index : latest;
  }, -1);
  if (lastWorkPartIndex < 0) return null;
  const hasFinalSummary = parts.slice(lastWorkPartIndex + 1).some((part) => {
    const candidate = part as { type?: string; text?: string };
    return candidate.type === 'text' && !!candidate.text?.trim();
  });
  if (!hasFinalSummary) return null;
  return { lastWorkPartIndex };
}

type WorkTimingMetadata = {
  workStartedAt?: unknown;
  workDurationMs?: unknown;
  workWaitDurationMs?: unknown;
};

/** Read a persisted duration, or derive the live duration from the user request that began this
 * assistant turn. Timing lives in message metadata so it survives refresh without altering text. */
export function assistantWorkDurationMs(
  messages: readonly UIMessage[],
  assistantIndex: number,
  now = Date.now(),
): number | null {
  const assistant = messages[assistantIndex];
  if (!assistant || assistant.role !== 'assistant') return null;
  const saved = Number((assistant.metadata as WorkTimingMetadata | undefined)?.workDurationMs);
  if (Number.isFinite(saved) && saved >= 0) return saved;
  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role !== 'user') continue;
    const startedAt = Number((message.metadata as WorkTimingMetadata | undefined)?.workStartedAt);
    return Number.isFinite(startedAt) && startedAt > 0 ? Math.max(0, now - startedAt) : null;
  }
  return null;
}

/** Freeze the latest completed turn's elapsed time in its assistant metadata. */
export function stampLatestAssistantWorkDuration(
  messages: readonly UIMessage[],
  now = Date.now(),
  waitDurationMs = 0,
): UIMessage[] {
  const assistantIndex = messages.findLastIndex((message) => message.role === 'assistant');
  if (assistantIndex < 0) return messages as UIMessage[];
  const assistant = messages[assistantIndex]!;
  if (!assistantWorkFold(assistant, true)) return messages as UIMessage[];
  const existing = Number((assistant.metadata as WorkTimingMetadata | undefined)?.workDurationMs);
  if (Number.isFinite(existing) && existing >= 0) return messages as UIMessage[];
  const elapsed = assistantWorkDurationMs(messages, assistantIndex, now);
  if (elapsed === null) return messages as UIMessage[];
  const excludedWait = Number.isFinite(waitDurationMs) ? Math.max(0, waitDurationMs) : 0;
  const duration = Math.max(0, elapsed - excludedWait);
  return messages.map((message, index) => index === assistantIndex
    ? {
        ...message,
        metadata: {
          ...(message.metadata && typeof message.metadata === 'object' ? message.metadata : {}),
          workDurationMs: duration,
          ...(excludedWait > 0 ? { workWaitDurationMs: excludedWait } : {}),
        },
      }
    : message);
}

/** Remove non-display protocol parts while preserving every user-visible text fragment and tool
 * receipt. A text fragment may already be visible before a later tool call streams in; removing it
 * after that point makes completed prose disappear from the conversation. */
export function compactStudioChatMessages(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    if (message.role !== 'assistant') return message;
    const source = message.parts ?? [];
    const parts = source.flatMap((part) => {
      const candidate = part as { type?: string; text?: string };
      if (candidate.type === 'reasoning' || candidate.type === 'step-start') return [];
      if (candidate.type === 'text') {
        if (typeof candidate.text === 'string') {
          const text = stripLeakedToolProtocolText(candidate.text);
          return text.trim() ? [{ ...part, text } as typeof part] : [];
        }
      }
      return [part];
    });
    return { ...message, parts };
  });
}

const takeArray = (value: unknown, limit: number) => Array.isArray(value) ? value.slice(0, limit) : undefined;

function compactVisualAnalysisData(data: Record<string, unknown>): Record<string, unknown> {
  const compactData: Record<string, unknown> = {};
  for (const key of [
    'analysisMode', 'assetId', 'localAssetId', 'label', 'durationSec', 'hasAudio',
    'audioAssessment', 'speechLikely', 'audibleSec', 'speechSec', 'editorialBrief',
    'editorialComparisonSummary', 'editorialReviewReused', 'acceptedDurationSec', 'note', 'ok', 'error',
  ]) {
    if (data[key] !== undefined) compactData[key] = data[key];
  }
  if (data.analysisMode === 'editorial-batch') {
    const items = takeArray(data.items, 24);
    if (items) compactData.items = items.map((item) => item && typeof item === 'object' && !Array.isArray(item)
      ? compactVisualAnalysisData(item as Record<string, unknown>)
      : item);
  } else if (data.analysisMode === 'editorial-candidates') {
    const editorialCandidates = takeArray(data.editorialCandidates, 8);
    if (editorialCandidates) compactData.editorialCandidates = editorialCandidates;
  } else if (data.analysisMode === 'question' || data.analysisMode === 'question-batch') {
    // Answers ARE the reusable evidence: a later selection filters on them without re-asking.
    if (data.question !== undefined) compactData.question = data.question;
    const answers = takeArray(data.answers, MAX_VISUAL_QUESTION_RANGES);
    if (answers) compactData.answers = answers;
    if (data.visualQuestionReused !== undefined) compactData.visualQuestionReused = data.visualQuestionReused;
    const items = takeArray(data.items, 24);
    if (items) compactData.items = items.map((item) => item && typeof item === 'object' && !Array.isArray(item)
      ? compactVisualAnalysisData(item as Record<string, unknown>)
      : item);
  } else if (data.analysisMode === 'semantic') {
    const segments = takeArray(data.segments, 20);
    if (segments) compactData.segments = segments;
  } else {
    const sceneCutsSec = takeArray(data.sceneCutsSec, 80);
    const subjectTracks = takeArray(data.subjectTracks, 24);
    if (sceneCutsSec) compactData.sceneCutsSec = sceneCutsSec;
    if (subjectTracks) compactData.subjectTracks = subjectTracks;
  }
  return compactData;
}

/** Keep the full visual receipt in the UI/persisted thread, but send only reusable evidence back to
 * the model on later tool-continuation requests. Replaying dense per-frame tracks made real Studio
 * turns grow from ~110k to ~190k input tokens without adding editorial information. */
/** Cap on any replayed text part. Per-part and deterministic, so the same part is sent identically
 * at every step. */
const MAX_REPLAYED_TEXT_CHARS = 4_000;

/** What the model replays: the persisted thread, byte-stable across steps. Every transform here is
 * per-part and deterministic — a part sent at step N is sent unchanged at step N+1 — so the
 * provider's prompt cache keeps the whole prefix. Never drop or rewrite earlier parts by position:
 * stripping the assistant's own progress prose and marking older snapshots "superseded" invalidated
 * the cache from the first rewrite onward (real turns re-paid 40–60k tokens per step) and erased the
 * model's memory of what it had already done. The only reduction is the visual receipts' dense
 * per-frame payload, trimmed the same way every time. */
const isToolPart = (part: { type?: string }): boolean => part.type === 'dynamic-tool' || !!part.type?.startsWith('tool-');

/** Step boundaries decide how the SDK converts one UI assistant message into provider messages: every
 * `step-start` closes an assistant turn (its text + tool calls) and its tool results. Without them the
 * whole multi-round message folds into ONE assistant message carrying every tool call, followed by
 * every result — the model then reads its own earlier rounds as a single parallel burst, and the
 * assistant message's bytes change every step, so the provider's prompt cache stops right before it.
 * Live SDK messages carry step-start parts; persisted threads were saved without them, so the
 * boundaries are re-derived: a text after a tool result starts a step, and so does a tool call whose
 * id restarts the per-step numbering (DeepSeek ids are call_<stepIndex>_…). */
export function withStepBoundaries(parts: UIMessage['parts']): UIMessage['parts'] {
  const out: UIMessage['parts'] = [];
  let previousWasTool = false;
  for (const part of parts) {
    const candidate = part as { type?: string; toolCallId?: string };
    if (candidate.type === 'step-start') {
      if ((out.at(-1) as { type?: string } | undefined)?.type !== 'step-start') out.push(part);
      previousWasTool = false;
      continue;
    }
    const tool = isToolPart(candidate);
    const startsStep = previousWasTool && (candidate.type === 'text' || (tool && /^call_00_/.test(candidate.toolCallId ?? '')));
    if (startsStep && (out.at(-1) as { type?: string } | undefined)?.type !== 'step-start') out.push({ type: 'step-start' } as UIMessage['parts'][number]);
    out.push(part);
    previousWasTool = tool;
  }
  return out;
}

export function compactStudioChatMessagesForModel(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    if (message.role !== 'assistant') return message;
    const parts = (message.parts ?? []).flatMap((part) => {
      const candidate = part as { type?: string; text?: string };
      if (candidate.type === 'reasoning') return [];
      if (candidate.type === 'text') {
        const text = stripLeakedToolProtocolText(candidate.text ?? '');
        return text.trim() ? [{ ...part, text } as typeof part] : [];
      }
      return [part];
    });
    return {
      ...message,
      parts: withStepBoundaries(parts).map((part) => {
        const candidate = part as { type?: string; toolName?: string; output?: unknown; text?: string };
        if (candidate.type === 'text') {
          const text = candidate.text ?? '';
          return text.length > MAX_REPLAYED_TEXT_CHARS
            ? { ...part, text: `${text.slice(0, MAX_REPLAYED_TEXT_CHARS)}\n[…]` } as typeof part
            : part;
        }
        const toolId = candidate.type === 'dynamic-tool'
          ? candidate.toolName
          : candidate.type?.startsWith('tool-')
            ? candidate.type.slice('tool-'.length)
            : '';
        if (!isVisualAnalysisToolId(toolId ?? '') || !candidate.output || typeof candidate.output !== 'object') return part;
        const output = candidate.output as { ok?: unknown; summary?: unknown; error?: unknown; data?: unknown };
        if (!output.data || typeof output.data !== 'object') return part;
        return { ...part, output: { ...output, data: compactVisualAnalysisData(output.data as Record<string, unknown>) } } as typeof part;
      }),
    };
  });
}

/** Return only a material shortage after assemble_from_review has finished. Presentation metadata,
 * never a gate: the best available edit remains complete and the user decides whether to add footage. */
export function assistantEditorialCapacityShortfall(message: UIMessage): number | null {
  if (message.role !== 'assistant') return null;
  let latest: { targetDurationSec: number; actualDurationSec: number } | null = null;
  for (const part of message.parts ?? []) {
    const candidate = part as { type?: string; state?: string; output?: unknown };
    if (candidate.type !== 'tool-assemble_from_review' || candidate.state !== 'output-available') continue;
    const output = candidate.output as { ok?: unknown; data?: { coverage?: unknown; result?: { coverage?: unknown } } } | undefined;
    if (output?.ok !== true) continue;
    const coverage = (output.data?.coverage ?? output.data?.result?.coverage) as { targetDurationSec?: unknown; actualDurationSec?: unknown } | undefined;
    const targetDurationSec = Number(coverage?.targetDurationSec);
    const actualDurationSec = Number(coverage?.actualDurationSec);
    if (Number.isFinite(targetDurationSec) && targetDurationSec > 0 && Number.isFinite(actualDurationSec)) {
      latest = { targetDurationSec, actualDurationSec };
    }
  }
  if (!latest) return null;
  const shortfallSec = Math.max(0, latest.targetDurationSec - latest.actualDurationSec);
  const toleranceSec = Math.max(1, latest.targetDurationSec * 0.03);
  return shortfallSec > toleranceSec ? Math.round(shortfallSec * 10) / 10 : null;
}

export function normalizeStoredThreads(value: unknown, availableSkillIds: readonly string[] = []): StoredThread[] {
  if (!Array.isArray(value)) return [];
  const available = new Set(availableSkillIds);
  return value
    .filter((thread): thread is StoredThread => !!thread
      && typeof thread === 'object'
      && typeof (thread as StoredThread).id === 'string'
      && Array.isArray((thread as StoredThread).messages))
    .map((thread) => ({
      ...thread,
      ...(isStudioScenarioSkillId(thread?.skillId)
        && (thread.skillId === 'auto' || available.has(thread.skillId))
        ? { skillId: thread.skillId }
        : { skillId: undefined }),
    }));
}

/** Sanitize a restored session: an interrupted tool can no longer continue, and provider-native tool
 *  protocol accidentally persisted as assistant text must never become visible history. */
export function sanitizeRestored(messages: UIMessage[]): UIMessage[] {
  return compactStudioChatMessages(messages.map((m) => {
    if (m.role !== 'assistant') return m;
    const parts = (m.parts ?? []).map((p) => {
      const tp = p as { type: string; state?: string; text?: string };
      if (tp.type === 'text' && typeof tp.text === 'string') {
        const text = stripLeakedToolProtocolText(tp.text);
        if (text !== tp.text) return { ...p, text } as typeof p;
      }
      if (tp.type.startsWith('tool-') && (tp.state === 'input-streaming' || tp.state === 'input-available')) {
        return { ...p, state: 'output-error', errorText: t('chatGen.generationInterrupted') } as typeof p;
      }
      return p;
    });
    return { ...m, parts };
  }));
}

/** The renderer intentionally hides reasoning and step markers. A completed assistant message
 * containing only those parts is therefore an empty response and must offer a visible retry. */
export function assistantMessageHasRenderableOutput(message: UIMessage): boolean {
  if (message.role !== 'assistant') return true;
  const compacted = compactStudioChatMessages([message])[0] ?? message;
  return (compacted.parts ?? []).some((part) => {
    const candidate = part as { type?: string; text?: string };
    if (candidate.type === 'text') return !!candidate.text?.trim();
    return candidate.type === 'dynamic-tool' || !!candidate.type?.startsWith('tool-');
  });
}

/** Offer an explicit continuation affordance when a provider ends a normal stream after announcing
 * work it has not actually performed. This is intentionally narrow: ordinary answers and completed
 * edit receipts must not grow a misleading "continue" button. */
export function assistantMessageSuggestsContinuation(message: UIMessage): boolean {
  if (message.role !== 'assistant' || assistantHasOpenOrInterruptedInteraction(message)) return false;
  const text = (message.parts ?? [])
    .flatMap((part) => {
      const candidate = part as { type?: string; text?: string };
      return candidate.type === 'text' && candidate.text ? [candidate.text] : [];
    })
    .join('\n')
    .trim();
  if (!text) return false;
  const parts = message.parts ?? [];
  const lastToolIndex = parts.reduce((latest, part, index) => {
    const type = (part as { type?: string }).type ?? '';
    return type === 'dynamic-tool' || type.startsWith('tool-') ? index : latest;
  }, -1);
  if (lastToolIndex >= 0) {
    const hasTurnBoundary = parts.some((part) => {
      const candidate = part as { type?: string; toolName?: string; output?: unknown };
      const toolId = candidate.type === 'dynamic-tool'
        ? candidate.toolName
        : candidate.type?.startsWith('tool-')
          ? candidate.type.slice('tool-'.length)
          : '';
      const decision = candidate.output && typeof candidate.output === 'object'
        ? (candidate.output as { data?: { decision?: unknown } }).data?.decision
        : undefined;
      return toolId === 'ask_user' || toolId === 'request_approval' || decision === 'rejected';
    });
    const hasPostToolSummary = parts.slice(lastToolIndex + 1).some((part) => {
      const candidate = part as { type?: string; text?: string };
      return candidate.type === 'text' && !!candidate.text?.trim();
    });
    if (!hasTurnBoundary && !hasPostToolSummary) return true;
  }
  // Output-limit truncation has no explicit marker in persisted SDK messages. A long tool-driven
  // response ending mid-token/mid-sentence is not a final answer; the observed failure ended in
  // the middle of a clip id after thousands of characters of planning.
  if (text.length >= 6_000 && /[\p{L}\p{N}_-]$/u.test(text) && !/[。！？.!?…）)】\]"'”’]$/u.test(text)) return true;
  if (/(?:要不要|是否|如需|请|点击|回复|输入).{0,16}(?:继续|接着)|(?:click|reply|say).{0,20}continue/i.test(text)) return true;
  const tail = text.slice(-600);
  if (/(?:让我|我(?:再|来|接着|继续|现在|接下来)|接着|随后)[^。！？!?\n]{0,180}(?:补上|添加|加上|加字幕|生成|处理|完成|修复|放置|执行|检查|核对)[^。！？!?\n]{0,100}[。！.!…]*$/i.test(tail)) return true;
  if (/(?:我(?:现在|接下来)?(?:会|来|开始)|接下来|下一步|next(?:,| step)?)[^。！？!?\n]{0,160}(?:开始|继续|完成|处理|组片|剪辑|修复|复检|生成|放置|执行|proceed|continue|finish|start|execute)[。！.!…]*$/i.test(tail)) return true;
  // Providers sometimes spend their whole response planning, then stop on a standalone action
  // cue instead of emitting the promised tool call. A completed recap says “已完成/已执行”; the
  // bare imperative below is an unfinished handoff and should be resumed automatically.
  return /(?:^|[\n。！？!?])\s*(?!(?:已|已经|完成|成功))(?:现在|立即|开始)?\s*(?:执行|开始放置|开始剪辑|继续处理|execute|executing now|proceeding now)[。！.!…]*$/i.test(tail);
}

/** An interaction boundary cannot be resumed safely without the user. Automatic stream recovery
 * would just append another disabled copy of the same question/approval card. */
export function assistantHasOpenOrInterruptedInteraction(message: UIMessage | undefined): boolean {
  if (!message || message.role !== 'assistant') return false;
  return (message.parts ?? []).some((part) => {
    const candidate = part as { type?: string; toolName?: string; state?: string };
    const toolId = candidate.type === 'dynamic-tool'
      ? candidate.toolName
      : candidate.type?.startsWith('tool-')
        ? candidate.type.slice('tool-'.length)
        : '';
    return (toolId === 'ask_user' || toolId === 'request_approval')
      && candidate.state !== 'output-available';
  });
}

/** Only transport/stream failures are safe to continue from live project state automatically. */
export function isRecoverableStudioChatError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const normalized = message.toLowerCase();
  if (!normalized) return false;
  if (/(insufficient_tokens|not enough credits|unauthorized|forbidden|invalid_|request_too_large|messages_required|no_llm_configured|\b(?:400|401|403|413|422)\b)/i.test(normalized)) {
    return false;
  }
  return /(studio_stream_interrupted|failed to fetch|network(?:error| request failed)?|connection (?:closed|reset|interrupted)|stream (?:closed|interrupted|terminated)|load failed)/i.test(normalized);
}

export function firstUserText(messages: UIMessage[]): string {
  const first = messages.find((m) => m.role === 'user');
  if (!first) return '';
  return ((first.parts ?? []) as { type: string; text?: string }[])
    .filter((p) => p.type === 'text')
    .map((p) => p.text ?? '')
    .join('')
    .replace(/@[\w.-]+/g, '')
    .trim();
}
