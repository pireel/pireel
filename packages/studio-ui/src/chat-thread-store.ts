/** Server-backed Studio chat thread validation, restore sanitizing, and title derivation. */

import type { UIMessage } from 'ai';
import { t } from './i18n';
import type { AttachedFrame } from './studio-chat';
import { stripLeakedToolProtocolText } from '@pireel/studio-engine/tool-protocol-text';
import {
  isStudioScenarioSkillId,
  type StudioScenarioSkillId,
} from '@pireel/studio-engine/scenario-skills';
import {
  planEditorialAssembly,
  type EditorialAssemblySource,
  type EditorialCandidateReview,
} from '@pireel/studio-engine/editorial-candidates';

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

export const MAX_VISUAL_REVIEWS_PER_USER_TURN = 2;
export const MAX_EDITORIAL_ANALYSES_PER_USER_TURN = 1;
/** Circuit breaker, not a governor: a legitimate full montage turn runs ~15–20 calls, so the
 * ceiling sits well above that and only trips a genuinely runaway loop. Duplicate-read and
 * unsafe-undo guards handle discipline; keep in sync with MAX_STUDIO_TOOL_RECEIPTS_PER_TURN
 * enforced server-side. */
export const MAX_STUDIO_TOOL_CALLS_PER_USER_TURN = 40;
/** A model that keeps re-reading an unchanged timeline after being told to stop is looping, not
 * verifying — a real turn burned ~28 of its 40 calls on refused reads and died mid-edit. After
 * this many consecutive refusals with no mutation in between, the turn goes final-only. */
export const MAX_STUDIO_REFUSED_TIMELINE_READS = 3;
/** A call that failed with the exact same tool and input will fail the exact same way; a model
 * re-firing it verbatim (e.g. removing already-removed clip ids seven times) is looping. */
export const MAX_STUDIO_IDENTICAL_FAILURES = 3;


export interface StudioTurnLedger {
  /** Tool receipts published synchronously, before React/useChat commits them to message state. */
  receipts: UIMessage['parts'];
  toolCallCount: number;
  forceFinalResponse: boolean;
  pictureLocked: boolean;
  postAssemblyTimelineRead: boolean;
  blockFurtherTimelineReads: boolean;
  unsafeUndoBlocked: boolean;
  lastTimelineFingerprint: string | null;
  /** Consecutive get_timeline calls answered with a refusal (unchanged-dedupe or read-block). */
  refusedTimelineReads: number;
  /** Signature (tool + input) of the most recent failed call, for detecting verbatim retries. */
  lastFailureSig: string | null;
  /** How many consecutive times that same failing call has been fired. */
  repeatedFailureCount: number;
  /** A post-assembly edit reopened a picture-vs-narration gap: the assembly gate stands down so
   * one repair add_clips batch can close it. Cleared when a covering assembly lands. */
  pictureRepairArmed: boolean;
  /** The planner already fills from the ENTIRE reviewed pool, so an under-target assembly is a
   * pool-level fact: re-running placement cannot add coverage. Further prepared placements are
   * refused with an ask-the-user instruction until the narration changes (new speech). */
  assemblyCapacityExhausted: boolean;
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

/** The picture lock means "this montage is DONE". It must NOT engage on an under-target assembly:
 * locking a 36s picture against a 54s narration walls off the only legal fix (placing more
 * accepted/reserve ranges) and the turn dead-ends into a black tail — a real incident. Receipts
 * without both numbers lock conservatively (legacy shape). Tolerance mirrors the assembly's own
 * duration-fitting tolerance. */
export function editorialAssemblyCoversTarget(assembly: unknown): boolean {
  const row = assembly as { targetDurationSec?: unknown; actualDurationSec?: unknown } | null;
  const target = Number(row?.targetDurationSec);
  const actual = Number(row?.actualDurationSec);
  if (!Number.isFinite(target) || target <= 0 || !Number.isFinite(actual)) return true;
  return actual >= target - Math.max(1, target * 0.03);
}

export function createStudioTurnLedger(): StudioTurnLedger {
  return {
    receipts: [],
    toolCallCount: 0,
    forceFinalResponse: false,
    pictureLocked: false,
    postAssemblyTimelineRead: false,
    blockFurtherTimelineReads: false,
    unsafeUndoBlocked: false,
    lastTimelineFingerprint: null,
    refusedTimelineReads: 0,
    lastFailureSig: null,
    repeatedFailureCount: 0,
    pictureRepairArmed: false,
    assemblyCapacityExhausted: false,
  };
}

/** Reserve one client tool execution. Once the bounded budget is consumed, the next HTTP request
 * is final-only; a provider cannot turn a bad plan into an unbounded paid continuation loop. */
export function reserveStudioTurnToolCall(ledger: StudioTurnLedger): { allowed: boolean; forceFinalResponse: boolean } {
  if (ledger.toolCallCount >= MAX_STUDIO_TOOL_CALLS_PER_USER_TURN) {
    ledger.forceFinalResponse = true;
    return { allowed: false, forceFinalResponse: true };
  }
  ledger.toolCallCount += 1;
  if (ledger.toolCallCount >= MAX_STUDIO_TOOL_CALLS_PER_USER_TURN) ledger.forceFinalResponse = true;
  return { allowed: true, forceFinalResponse: ledger.forceFinalResponse };
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
): { timelineUnchanged: boolean; repeatedFailureCount: number } {
  const failed = !!record.errorText || record.output?.ok === false;
  if (failed) {
    const failureSig = `${record.toolId}:${studioTimelineFingerprint(record.input) ?? ''}`;
    ledger.repeatedFailureCount = failureSig === ledger.lastFailureSig ? ledger.repeatedFailureCount + 1 : 1;
    ledger.lastFailureSig = failureSig;
    if (ledger.repeatedFailureCount >= MAX_STUDIO_IDENTICAL_FAILURES) ledger.forceFinalResponse = true;
  } else if (record.output?.skipped !== true) {
    // Only a genuinely executed success clears the streak — refused/skipped no-ops interleaved
    // between verbatim retries must not disarm the breaker.
    ledger.lastFailureSig = null;
    ledger.repeatedFailureCount = 0;
  }
  const data = record.output?.data && typeof record.output.data === 'object'
    ? record.output.data as Record<string, unknown>
    : null;
  // Mutation is judged by the receipt's delta, not by the undo-stack roster: undo and the
  // output-scope tools sit outside canMutate yet genuinely change project state, and their
  // receipts carry a delta. Gating on canMutate left the read-snapshot fingerprint live across
  // those changes, so the next get_timeline was refused against a stale world.
  const didMutate = !failed && !!data?.delta && typeof data.delta === 'object';
  const editorialAssembly = data?.editorialAssembly;
  if (!failed && editorialAssembly && typeof editorialAssembly === 'object') {
    if (editorialAssemblyCoversTarget(editorialAssembly)) {
      ledger.pictureLocked = true;
      ledger.pictureRepairArmed = false;
      ledger.assemblyCapacityExhausted = false;
    } else {
      ledger.assemblyCapacityExhausted = true;
    }
  }
  // A new narration changes the target, so a previous pool-exhaustion verdict no longer holds.
  if (record.toolId === 'generate_speech' && !failed) ledger.assemblyCapacityExhausted = false;

  if (record.canMutate && failed) ledger.unsafeUndoBlocked = true;
  if (didMutate) {
    ledger.unsafeUndoBlocked = false;
    // A real state change invalidates the previous read snapshot and permits one fresh verification.
    ledger.lastTimelineFingerprint = null;
    ledger.blockFurtherTimelineReads = false;
    ledger.postAssemblyTimelineRead = false;
    ledger.refusedTimelineReads = 0;
  }

  let timelineUnchanged = false;
  if (record.toolId === 'get_timeline' && !failed) {
    const fingerprint = studioTimelineFingerprint(data);
    timelineUnchanged = !!fingerprint && fingerprint === ledger.lastTimelineFingerprint;
    if (fingerprint) ledger.lastTimelineFingerprint = fingerprint;
    if (ledger.pictureLocked) ledger.postAssemblyTimelineRead = true;
    if (timelineUnchanged) ledger.blockFurtherTimelineReads = true;
    // Refusals include both the unchanged-dedupe and pre-execution read-block receipts (the
    // latter arrive here as skipped successes). Persistent defiance ends the turn's tool budget.
    if (timelineUnchanged || record.output?.skipped === true) {
      ledger.refusedTimelineReads += 1;
      if (ledger.refusedTimelineReads >= MAX_STUDIO_REFUSED_TIMELINE_READS) ledger.forceFinalResponse = true;
    } else {
      ledger.refusedTimelineReads = 0;
    }
  }

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
  return { timelineUnchanged, repeatedFailureCount: ledger.repeatedFailureCount };
}

export function shouldBlockStudioTurnUndo(ledger: StudioTurnLedger): boolean {
  return ledger.unsafeUndoBlocked;
}

/** Narration is the montage's master clock, but the narration clip can be absent from the timeline
 * (never placed yet, or rolled back). Without a fallback the deterministic assembly layer silently
 * disengages at target=0 and placement degrades to freehand. Recover the target from the most
 * recent narration audio this turn produced: a generate_speech receipt's measured duration, or a
 * register_media call for a transcript-bearing audio asset. */
export function narrationDurationFromMessages(messages: readonly UIMessage[]): number {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex]!;
    if (message.role !== 'assistant') continue;
    const parts = message.parts ?? [];
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
      const part = parts[partIndex] as { type?: string; state?: string; output?: unknown; input?: unknown };
      if (part.type === 'tool-generate_speech' && part.state === 'output-available') {
        const asset = ((part.output as { data?: { asset?: { durationSec?: unknown } } } | undefined)?.data)?.asset;
        const durationSec = Number(asset?.durationSec);
        if (Number.isFinite(durationSec) && durationSec > 0) return durationSec;
      }
      if (part.type === 'tool-register_media' && part.state === 'output-available') {
        const assets = (part.input as { assets?: unknown } | undefined)?.assets;
        if (!Array.isArray(assets)) continue;
        for (const row of assets) {
          const asset = row as { kind?: unknown; durationSec?: unknown; transcriptText?: unknown; transcript?: unknown };
          if (asset.kind !== 'audio') continue;
          if (typeof asset.transcriptText !== 'string' && !Array.isArray(asset.transcript)) continue;
          const durationSec = Number(asset.durationSec);
          if (Number.isFinite(durationSec) && durationSec > 0) return durationSec;
        }
      }
    }
  }
  return 0;
}

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

export function canRunVisualReview(completedReviews: number): boolean {
  return completedReviews < MAX_VISUAL_REVIEWS_PER_USER_TURN;
}

/** A source-selection pass is paid, exhaustive evidence for the current turn, not a retry loop. */
export function canRunEditorialAnalysis(completedAnalyses: number): boolean {
  return completedAnalyses < MAX_EDITORIAL_ANALYSES_PER_USER_TURN;
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
    'editorialComparisonSummary', 'editorialReviewReused', 'acceptedDurationSec', 'instruction', 'ok', 'error',
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
export function compactStudioChatMessagesForModel(messages: UIMessage[]): UIMessage[] {
  return compactStudioChatMessages(messages).map((message) => {
    if (message.role !== 'assistant') return message;
    const sourceParts = message.parts ?? [];
    const unfinishedVisibleTail = assistantMessageSuggestsContinuation(message);
    const lastToolIndex = sourceParts.reduce((latest, part, index) => {
      const type = (part as { type?: string }).type ?? '';
      return type === 'dynamic-tool' || type.startsWith('tool-') ? index : latest;
    }, -1);
    const lastTimelineIndex = sourceParts.reduce((latest, part, index) => {
      const candidate = part as { type?: string; toolName?: string };
      const toolId = candidate.type === 'dynamic-tool'
        ? candidate.toolName
        : candidate.type?.startsWith('tool-')
          ? candidate.type.slice('tool-'.length)
          : '';
      return toolId === 'get_timeline' ? index : latest;
    }, -1);
    return {
      ...message,
      parts: sourceParts.flatMap((part, index) => {
        const candidate = part as {
          type?: string;
          toolName?: string;
          output?: unknown;
          text?: string;
        };
        // Progress prose before a tool remains in the persisted/UI thread, but replaying it gives
        // the next model round thousands of tokens of obsolete deliberation. Receipts are the state.
        if (candidate.type === 'text') {
          if (index <= lastToolIndex) return [];
          // A provider can exhaust its output budget in visible scratchpad prose after the last
          // receipt. Keep that text in the UI for diagnosis, but do not feed it back as if it were
          // an authoritative final instruction when the recovery turn resumes from live state.
          if (unfinishedVisibleTail) return [];
          const text = candidate.text ?? '';
          return [{ ...part, text: text.length > 6_000 ? text.slice(-6_000) : text } as typeof part];
        }
        const toolId = candidate.type === 'dynamic-tool'
          ? candidate.toolName
          : candidate.type?.startsWith('tool-')
            ? candidate.type.slice('tool-'.length)
            : '';
        // A long tool turn may request the timeline repeatedly. Replaying every complete snapshot
        // makes mutually obsolete project states dominate the next model request; only the newest
        // snapshot is authoritative. The UI/persisted history still keeps every original receipt.
        if (toolId === 'get_timeline' && index !== lastTimelineIndex && candidate.output && typeof candidate.output === 'object') {
          const output = candidate.output as { ok?: unknown; summary?: unknown; error?: unknown };
          return [{
            ...part,
            output: {
              ...output,
              data: {
                superseded: true,
                instruction: 'A newer timeline snapshot is present later in this message. Ignore this snapshot.',
              },
            },
          } as typeof part];
        }
        if (toolId !== 'analyze_visual' || !candidate.output || typeof candidate.output !== 'object') return [part];
        const output = candidate.output as { ok?: unknown; summary?: unknown; error?: unknown; data?: unknown };
        if (!output.data || typeof output.data !== 'object') return [part];
        return [{ ...part, output: { ...output, data: compactVisualAnalysisData(output.data as Record<string, unknown>) } } as typeof part];
      }),
    };
  });
}

export interface EditorialPlacementIssue {
  assetId: string;
  reason: 'review-rejected' | 'range-required' | 'outside-accepted-range';
  /** The offending clip's requested source window, when one was supplied. */
  requestedRange?: { sourceInSec: number; sourceOutSec: number };
  /** Accepted source windows for this asset, so the retry can be exact instead of guessed. */
  acceptedRanges?: Array<{ startSec: number; endSec: number }>;
}

export interface PreparedEditorialPlacement {
  input: Record<string, unknown>;
  changed: boolean;
  actualDurationSec: number;
  targetDurationSec: number;
  droppedClipCount: number;
  /** Rows before the picture montage in input.clips (narration and other pass-through rows). */
  passthroughCount: number;
  /** Ordering handle: one entry per planned picture clip, in the deterministic order. Selection
   * and durations are locked; a model may permute these (opening stays first) for narrative
   * taste, applied via applyEditorialShotOrder. */
  shots: Array<{
    id: string;
    assetId: string;
    durationSec: number;
    score: number;
    facing?: string;
    role?: string;
    action?: string;
    endingFit: number;
  }>;
}

/** Apply a model-chosen narrative order to a prepared montage. The order must be a permutation
 * of every shot id with the evidence-locked opening kept first; anything else returns null and
 * the deterministic order stands. Timeline starts are recomputed for the new sequence. */
export function applyEditorialShotOrder(
  prepared: PreparedEditorialPlacement,
  order: readonly string[],
): Record<string, unknown> | null {
  const ids = prepared.shots.map((shot) => shot.id);
  if (order.length !== ids.length
    || new Set(order).size !== ids.length
    || !order.every((id) => ids.includes(id))
    || order[0] !== ids[0]) return null;
  const clips = prepared.input.clips;
  if (!Array.isArray(clips)) return null;
  const passthrough = clips.slice(0, prepared.passthroughCount);
  const planned = clips.slice(prepared.passthroughCount) as Array<Record<string, unknown>>;
  if (planned.length !== ids.length) return null;
  const byId = new Map(ids.map((id, index) => [id, planned[index]!]));
  let atSec = Math.min(...planned.map((clip) => Number(clip.startSec) || 0));
  const reordered = order.map((id) => {
    const clip = byId.get(id)!;
    const durationSec = Number(clip.sourceOutSec) - Number(clip.sourceInSec);
    const placed = { ...clip, startSec: Math.round(atSec * 1_000) / 1_000 };
    atSec += durationSec;
    return placed;
  });
  return { ...prepared.input, clips: [...passthrough, ...reordered] };
}

/** Return only a material shortage after deterministic picture assembly has finished.
 * This is presentation metadata, never a gate: the best available edit remains complete and the
 * user can decide later whether to add footage or adjust the timeline manually. */
export function assistantEditorialCapacityShortfall(message: UIMessage): number | null {
  if (message.role !== 'assistant') return null;
  let latest: { targetDurationSec: number; actualDurationSec: number } | null = null;
  for (const part of message.parts ?? []) {
    const candidate = part as { type?: string; toolName?: string; state?: string; output?: unknown };
    const toolId = candidate.type === 'dynamic-tool'
      ? candidate.toolName
      : candidate.type?.startsWith('tool-')
        ? candidate.type.slice('tool-'.length)
        : '';
    if (toolId !== 'add_clips' || candidate.state !== 'output-available') continue;
    const output = candidate.output as { ok?: unknown; data?: unknown } | undefined;
    if (output?.ok !== true || !output.data || typeof output.data !== 'object') continue;
    const assembly = (output.data as { editorialAssembly?: unknown }).editorialAssembly;
    if (!assembly || typeof assembly !== 'object') continue;
    const targetDurationSec = Number((assembly as { targetDurationSec?: unknown }).targetDurationSec);
    const actualDurationSec = Number((assembly as { actualDurationSec?: unknown }).actualDurationSec);
    if (Number.isFinite(targetDurationSec) && targetDurationSec > 0 && Number.isFinite(actualDurationSec)) {
      latest = { targetDurationSec, actualDurationSec };
    }
  }
  if (!latest) return null;
  const shortfallSec = Math.max(0, latest.targetDurationSec - latest.actualDurationSec);
  const toleranceSec = Math.max(1, latest.targetDurationSec * 0.03);
  return shortfallSec > toleranceSec ? Math.round(shortfallSec * 10) / 10 : null;
}

const canonicalEditorialAssetId = (value: unknown) => typeof value === 'string'
  ? value.trim().replace(/^@/, '').replace(/^local:/, '')
  : '';

function reviewedEditorialSources(messages: readonly UIMessage[]): EditorialAssemblySource[] {
  const reviewed = new Map<string, EditorialCandidateReview[]>();
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    for (const part of message.parts ?? []) {
      const candidate = part as { type?: string; toolName?: string; state?: string; output?: unknown };
      const partToolId = candidate.type === 'dynamic-tool'
        ? candidate.toolName
        : candidate.type?.startsWith('tool-')
          ? candidate.type.slice('tool-'.length)
          : '';
      if (partToolId !== 'analyze_visual' || candidate.state !== 'output-available') continue;
      const output = candidate.output as { ok?: unknown; data?: unknown } | undefined;
      if (output?.ok !== true || !output.data || typeof output.data !== 'object') continue;
      const data = output.data as Record<string, unknown>;
      const receipts = data.analysisMode === 'editorial-batch' && Array.isArray(data.items)
        ? data.items.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
        : [data];
      for (const receipt of receipts) {
        const assetId = canonicalEditorialAssetId(receipt.localAssetId ?? receipt.assetId);
        if (!assetId || !Array.isArray(receipt.editorialCandidates)) continue;
        reviewed.set(assetId, receipt.editorialCandidates as EditorialCandidateReview[]);
      }
    }
  }
  return [...reviewed].map(([assetId, candidates]) => ({ assetId, candidates }));
}

/** Rank-ordered cross-source opening contenders from the batch review's shared comparison. */
export function reviewedOpeningContenders(
  messages: readonly UIMessage[],
): Array<{ assetId: string; candidateId: string }> {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role !== 'assistant') continue;
    for (const part of message.parts ?? []) {
      const candidate = part as { type?: string; toolName?: string; state?: string; output?: unknown };
      const toolId = candidate.type === 'dynamic-tool'
        ? candidate.toolName
        : candidate.type?.startsWith('tool-')
          ? candidate.type.slice('tool-'.length)
          : '';
      if (toolId !== 'analyze_visual' || candidate.state !== 'output-available') continue;
      const output = candidate.output as { ok?: unknown; data?: unknown } | undefined;
      if (output?.ok !== true || !output.data || typeof output.data !== 'object') continue;
      const comparison = (output.data as { openingComparison?: { contenders?: unknown } }).openingComparison;
      if (!comparison || !Array.isArray(comparison.contenders)) continue;
      return [...comparison.contenders]
        .filter((row): row is { sourceId: unknown; candidateId: unknown; rank: unknown } => !!row && typeof row === 'object')
        .sort((left, right) => Number(left.rank) - Number(right.rank))
        .flatMap((row) => (typeof row.sourceId === 'string' && typeof row.candidateId === 'string'
          ? [{ assetId: canonicalEditorialAssetId(row.sourceId), candidateId: row.candidateId }]
          : []));
    }
  }
  return [];
}

/** Turn the one editorial review receipt into the actual narrated montage before the write tool
 * runs. Qwen supplies semantic phases and aesthetic scores; deterministic local optimization owns
 * source-clock reconciliation, duplicate removal, natural-speed placement, and duration fitting. */
export function prepareEditorialPlacement(
  messages: readonly UIMessage[],
  toolId: string,
  input: Record<string, unknown>,
  targetDurationSec: number,
): PreparedEditorialPlacement | null {
  if (toolId !== 'add_clips' || !Number.isFinite(targetDurationSec) || targetDurationSec <= 0) return null;
  const sources = reviewedEditorialSources(messages);
  if (!sources.length || !Array.isArray(input.clips)) return null;
  const sourceIds = new Set(sources.map((source) => source.assetId));
  const rows = input.clips.filter((value): value is Record<string, unknown> => (
    !!value && typeof value === 'object' && !Array.isArray(value)
  ));
  if (!rows.length || rows.length !== input.clips.length) return null;
  // The optimizer owns the reviewed primary-picture rows; audio, overlays and unreviewed footage
  // ride along with their authored semantics. A mixed batch (narration + picture in one call, a
  // common model shape) must engage assembly for its picture rows, not disable it wholesale.
  const isPictureRow = (clip: Record<string, unknown>) => (
    (clip.role == null || clip.role === 'primary')
    && sourceIds.has(canonicalEditorialAssetId(clip.assetId))
  );
  const pictureRows = rows.filter(isPictureRow);
  if (!pictureRows.length) return null;
  if (!pictureRows.every((clip) => (
    Number.isFinite(Number(clip.sourceInSec))
    && Number.isFinite(Number(clip.sourceOutSec))
  ))) return null;
  const passthroughRows = rows.filter((clip) => !isPictureRow(clip));
  // Models often batch picture without startSec, intending sequential placement. Synthesize the
  // sequence so assembly engages; freehand placement of an unanchored batch is never the intent.
  let appendCursorSec = 0;
  const orderedPicture = pictureRows.map((clip) => {
    const spanSec = Math.max(0, Number(clip.sourceOutSec) - Number(clip.sourceInSec));
    const startSec = Number.isFinite(Number(clip.startSec)) ? Number(clip.startSec) : appendCursorSec;
    appendCursorSec = Math.max(appendCursorSec, startSec) + spanSec;
    return { row: clip, startSec };
  });
  const plan = planEditorialAssembly({
    targetDurationSec,
    sources,
    opening: reviewedOpeningContenders(messages),
    clips: orderedPicture.map(({ row, startSec }) => ({
      assetId: canonicalEditorialAssetId(row.assetId),
      startSec,
      sourceInSec: Number(row.sourceInSec),
      sourceOutSec: Number(row.sourceOutSec),
    })),
  });
  const unusedRows = orderedPicture.map(({ row }) => row);
  const clips = plan.clips.map((planned) => {
    const matchIndex = unusedRows.findIndex((row) => canonicalEditorialAssetId(row.assetId) === planned.assetId);
    // Pool-completion filler clips have NO batch row: they must carry the PLANNER's asset id.
    // Falling back to another row's fields once stamped the batch's first asset id onto every
    // filler clip — foreign ranges under the wrong asset, killed by the placement guard.
    const original = matchIndex >= 0 ? unusedRows.splice(matchIndex, 1)[0]! : null;
    const durationSec = Math.round((planned.sourceOutSec - planned.sourceInSec) * 1_000) / 1_000;
    const { speed: _discardSpeed, ...naturalSpeed } = original ?? {};
    return {
      ...naturalSpeed,
      role: 'primary',
      assetId: original ? original.assetId : planned.assetId,
      startSec: planned.startSec,
      sourceInSec: planned.sourceInSec,
      sourceOutSec: planned.sourceOutSec,
      durationSec,
      muted: true,
    };
  });
  // Ordering handle: describe each planned picture clip from its reviewed candidate so a
  // narrative-ordering pass has facing/role/action evidence without re-deriving anything.
  const shots = clips.map((clip, index) => {
    const canonical = canonicalEditorialAssetId(clip.assetId);
    const candidate = (sources.find((source) => source.assetId === canonical)?.candidates ?? [])
      .find((row) => (row.verdict === 'strong' || row.verdict === 'usable')
        && Number(clip.sourceInSec) >= row.startSec - 0.06
        && Number(clip.sourceOutSec) <= row.endSec + 0.06);
    return {
      id: `shot-${index + 1}`,
      assetId: canonical,
      durationSec: Math.round((Number(clip.sourceOutSec) - Number(clip.sourceInSec)) * 10) / 10,
      score: candidate?.score ?? 0,
      ...(candidate?.facing ? { facing: candidate.facing } : {}),
      ...(candidate?.contentRole ? { role: candidate.contentRole } : {}),
      ...(candidate?.action ? { action: String(candidate.action).slice(0, 90) } : {}),
      endingFit: (candidate?.roleFit ?? []).find((fit) => fit.role === 'ending')?.score ?? 0,
    };
  });
  return {
    input: { ...input, clips: [...passthroughRows, ...clips], __replacePrimaryTrack: true },
    passthroughCount: passthroughRows.length,
    shots,
    changed: plan.changed,
    actualDurationSec: plan.actualDurationSec,
    targetDurationSec: plan.targetDurationSec,
    droppedClipCount: plan.droppedClipCount,
  };
}

/** The lock is per user turn: a NEW user request (e.g. "re-cut the picture") must be allowed to
 * assemble again from the persisted editorial evidence. Only receipts after the latest user
 * message count; earlier turns' receipts are history, not a standing prohibition. */
function currentTurnMessages(messages: readonly UIMessage[]): readonly UIMessage[] {
  const latestUserIndex = messages.findLastIndex((message) => message.role === 'user');
  return latestUserIndex < 0 ? messages : messages.slice(latestUserIndex + 1);
}

/** A successful deterministic montage receipt is the picture lock for this user turn. The model
 * may continue with captions, typography, sound and delivery checks, but must not rebuild picture
 * from another interpretation of the same editorial evidence. */
export function hasCompletedEditorialPlacement(allMessages: readonly UIMessage[]): boolean {
  const messages = currentTurnMessages(allMessages);
  return messages.some((message) => message.role === 'assistant' && (message.parts ?? []).some((part) => {
    const candidate = part as { type?: string; toolName?: string; state?: string; output?: unknown };
    const toolId = candidate.type === 'dynamic-tool'
      ? candidate.toolName
      : candidate.type?.startsWith('tool-')
        ? candidate.type.slice('tool-'.length)
        : '';
    if (toolId !== 'add_clips' || candidate.state !== 'output-available') return false;
    const output = candidate.output as { ok?: unknown; data?: unknown } | undefined;
    const assembly = output?.ok === true && output.data && typeof output.data === 'object'
      ? (output.data as { editorialAssembly?: unknown }).editorialAssembly
      : null;
    return !!assembly && editorialAssemblyCoversTarget(assembly);
  }));
}

/** One authoritative timeline read after picture lock is enough for deterministic delivery checks. */
export function hasPostAssemblyTimelineSnapshot(allMessages: readonly UIMessage[]): boolean {
  const messages = currentTurnMessages(allMessages);
  let pictureLocked = false;
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    for (const part of message.parts ?? []) {
      const candidate = part as { type?: string; toolName?: string; state?: string; output?: unknown };
      const toolId = candidate.type === 'dynamic-tool'
        ? candidate.toolName
        : candidate.type?.startsWith('tool-')
          ? candidate.type.slice('tool-'.length)
          : '';
      const output = candidate.output as { ok?: unknown; data?: unknown } | undefined;
      const assembly = toolId === 'add_clips'
        && candidate.state === 'output-available'
        && output?.ok === true
        && output.data
        && typeof output.data === 'object'
        ? (output.data as { editorialAssembly?: unknown }).editorialAssembly
        : null;
      if (assembly && editorialAssemblyCoversTarget(assembly)) pictureLocked = true;
      if (pictureLocked && toolId === 'get_timeline' && candidate.state === 'output-available' && output?.ok === true) return true;
    }
  }
  return false;
}

/**
 * Once a source has an editorial receipt in this conversation, picture placement must honor it.
 * This makes the persisted verdict authoritative instead of trusting a later model step to
 * remember that a high aesthetic score can still have a rejected usable range.
 */
export function editorialPlacementIssue(
  messages: readonly UIMessage[],
  toolId: string,
  input: Record<string, unknown>,
): EditorialPlacementIssue | null {
  if (toolId !== 'add_clips' && toolId !== 'insert_clips') return null;
  const reviewed = new Map(reviewedEditorialSources(messages).map((source) => [source.assetId, source.candidates]));
  const clips = Array.isArray(input.clips) ? input.clips : [];
  for (const value of clips) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const clip = value as Record<string, unknown>;
    const assetId = canonicalEditorialAssetId(clip.assetId);
    const candidates = reviewed.get(assetId);
    if (!candidates) continue;
    const accepted = candidates.filter((candidate) => candidate.verdict === 'strong' || candidate.verdict === 'usable');
    if (!accepted.length) return { assetId, reason: 'review-rejected' };
    const allAcceptedRanges = accepted
      .map((candidate) => ({ startSec: Number(candidate.startSec), endSec: Number(candidate.endSec) }))
      .filter((range) => Number.isFinite(range.startSec) && Number.isFinite(range.endSec));
    // Validation uses every accepted window; the receipt reports a bounded sample.
    const acceptedRanges = allAcceptedRanges.slice(0, 8);
    const sourceInSec = Number(clip.sourceInSec);
    const sourceOutSec = Number(clip.sourceOutSec);
    if (!Number.isFinite(sourceInSec) || !Number.isFinite(sourceOutSec) || sourceOutSec <= sourceInSec) {
      return { assetId, reason: 'range-required', acceptedRanges };
    }
    const tolerance = 0.06;
    const insideAcceptedRange = allAcceptedRanges.some((range) => (
      sourceInSec >= range.startSec - tolerance && sourceOutSec <= range.endSec + tolerance
    ));
    if (!insideAcceptedRange) {
      return { assetId, reason: 'outside-accepted-range', requestedRange: { sourceInSec, sourceOutSec }, acceptedRanges };
    }
  }
  return null;
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
