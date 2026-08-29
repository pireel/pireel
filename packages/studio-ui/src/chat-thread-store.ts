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
    'editorialComparisonSummary', 'acceptedDurationSec', 'instruction', 'ok', 'error',
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
}

export interface PreparedEditorialPlacement {
  input: Record<string, unknown>;
  changed: boolean;
  actualDurationSec: number;
  targetDurationSec: number;
  droppedClipCount: number;
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
  // Mixed audio/overlay batches retain their authored semantics. The montage optimizer owns only
  // one contiguous, reviewed primary-picture batch.
  if (!rows.every((clip) => (
    (clip.role == null || clip.role === 'primary')
    && sourceIds.has(canonicalEditorialAssetId(clip.assetId))
    && Number.isFinite(Number(clip.startSec))
    && Number.isFinite(Number(clip.sourceInSec))
    && Number.isFinite(Number(clip.sourceOutSec))
  ))) return null;
  const plan = planEditorialAssembly({
    targetDurationSec,
    sources,
    clips: rows.map((clip) => ({
      assetId: canonicalEditorialAssetId(clip.assetId),
      startSec: Number(clip.startSec),
      sourceInSec: Number(clip.sourceInSec),
      sourceOutSec: Number(clip.sourceOutSec),
    })),
  });
  const unusedRows = [...rows];
  const clips = plan.clips.map((planned) => {
    const matchIndex = unusedRows.findIndex((row) => canonicalEditorialAssetId(row.assetId) === planned.assetId);
    const original = matchIndex >= 0 ? unusedRows.splice(matchIndex, 1)[0]! : rows[0]!;
    const durationSec = Math.round((planned.sourceOutSec - planned.sourceInSec) * 1_000) / 1_000;
    const { speed: _discardSpeed, ...naturalSpeed } = original;
    return {
      ...naturalSpeed,
      role: 'primary',
      startSec: planned.startSec,
      sourceInSec: planned.sourceInSec,
      sourceOutSec: planned.sourceOutSec,
      durationSec,
      muted: true,
    };
  });
  return {
    input: { ...input, clips, __replacePrimaryTrack: true },
    changed: plan.changed,
    actualDurationSec: plan.actualDurationSec,
    targetDurationSec: plan.targetDurationSec,
    droppedClipCount: plan.droppedClipCount,
  };
}

/** A successful deterministic montage receipt is the picture lock for this user turn. The model
 * may continue with captions, typography, sound and delivery checks, but must not rebuild picture
 * from another interpretation of the same editorial evidence. */
export function hasCompletedEditorialPlacement(messages: readonly UIMessage[]): boolean {
  return messages.some((message) => message.role === 'assistant' && (message.parts ?? []).some((part) => {
    const candidate = part as { type?: string; toolName?: string; state?: string; output?: unknown };
    const toolId = candidate.type === 'dynamic-tool'
      ? candidate.toolName
      : candidate.type?.startsWith('tool-')
        ? candidate.type.slice('tool-'.length)
        : '';
    if (toolId !== 'add_clips' || candidate.state !== 'output-available') return false;
    const output = candidate.output as { ok?: unknown; data?: unknown } | undefined;
    return output?.ok === true
      && !!output.data
      && typeof output.data === 'object'
      && !!(output.data as { editorialAssembly?: unknown }).editorialAssembly;
  }));
}

/** One authoritative timeline read after picture lock is enough for deterministic delivery checks. */
export function hasPostAssemblyTimelineSnapshot(messages: readonly UIMessage[]): boolean {
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
      if (
        toolId === 'add_clips'
        && candidate.state === 'output-available'
        && output?.ok === true
        && output.data
        && typeof output.data === 'object'
        && (output.data as { editorialAssembly?: unknown }).editorialAssembly
      ) pictureLocked = true;
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
    const sourceInSec = Number(clip.sourceInSec);
    const sourceOutSec = Number(clip.sourceOutSec);
    if (!Number.isFinite(sourceInSec) || !Number.isFinite(sourceOutSec) || sourceOutSec <= sourceInSec) {
      return { assetId, reason: 'range-required' };
    }
    const tolerance = 0.06;
    const insideAcceptedRange = accepted.some((candidate) => {
      const startSec = Number(candidate.startSec);
      const endSec = Number(candidate.endSec);
      return Number.isFinite(startSec)
        && Number.isFinite(endSec)
        && sourceInSec >= startSec - tolerance
        && sourceOutSec <= endSec + tolerance;
    });
    if (!insideAcceptedRange) return { assetId, reason: 'outside-accepted-range' };
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
  // Output-limit truncation has no explicit marker in persisted SDK messages. A long tool-driven
  // response ending mid-token/mid-sentence is not a final answer; the observed failure ended in
  // the middle of a clip id after thousands of characters of planning.
  if (text.length >= 6_000 && /[\p{L}\p{N}_-]$/u.test(text) && !/[。！？.!?…）)】\]"'”’]$/u.test(text)) return true;
  if (/(?:要不要|是否|如需|请|点击|回复|输入).{0,16}(?:继续|接着)|(?:click|reply|say).{0,20}continue/i.test(text)) return true;
  const tail = text.slice(-600);
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
