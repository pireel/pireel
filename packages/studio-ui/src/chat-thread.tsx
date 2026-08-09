'use client';

/** Single-thread studio chat (useChat): stream rendering, client-side tool execution, persistence snapshots. */

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useChat } from '@ai-sdk/react';
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from 'ai';
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from '@pireel/ui/ai-elements/conversation';
import { Suggestion } from '@pireel/ui/ai-elements/suggestion';
import { Message, MessageContent, MessageResponse } from '@pireel/ui/ai-elements/message';
import { type ChatSituation, buildSituation } from '@pireel/studio-engine/prompts';
import type { StudioScenarioSkillId } from '@pireel/studio-engine/scenario-skills';
import { STUDIO_AGENT_EXECUTION_LIMITS, studioAgentTurnUsage } from '@pireel/studio-engine/agent-execution-budget';
import { studioProviders } from '@pireel/studio-engine/providers';
import type { FrameCatalogItem } from './use-frame-catalog';
import { mid, PiAvatar, ThinkingDots, renderTextWithElementPills } from './chat-format';
import { renderToolPart, renderToolPartGroup, toolStatus, type ToolPartLike } from './chat-tool-parts';
import { Composer, type ComposerHandle } from './chat-composer';
import { assistantMessageHasRenderableOutput } from './chat-thread-store';
import { t } from './i18n';
import type { StudioScenarioSkillOption } from './shell-context';
import type {
  AttachedFrame,
  ProgressHandle,
  StudioChatHandle,
  StudioChatProps,
  StudioElementRef,
} from './studio-chat';

export function ChatThread({
  threadId,
  initialMessages,
  initialFrame,
  initialSkillId,
  scenarioSkills,
  frames,
  onFrameApplied,
  runTool,
  getBody,
  getComp,
  elements,
  onSnapshot,
  handleRef,
}: {
  threadId: string;
  initialMessages: UIMessage[];
  initialFrame: AttachedFrame | null;
  initialSkillId: StudioScenarioSkillId;
  scenarioSkills: readonly StudioScenarioSkillOption[];
  frames: FrameCatalogItem[];
  onFrameApplied?: (frame: AttachedFrame) => void;
  runTool: StudioChatProps['runTool'];
  getBody: StudioChatProps['getBody'];
  getComp?: StudioChatProps['getComp'];
  elements: StudioElementRef[];
  onSnapshot: (messages: UIMessage[], frame: AttachedFrame | null, skillId: StudioScenarioSkillId) => void;
  handleRef: React.MutableRefObject<StudioChatHandle | null>;
}) {
  const runToolRef = useRef(runTool);
  runToolRef.current = runTool;
  const toolCallsUsedRef = useRef(studioAgentTurnUsage(initialMessages).toolCalls);
  // Stop plumbing: aborting the stream alone isn't enough — the stream loop awaits onToolCall, so a
  // running tool must be told to stand down too. The user-stopped flag keeps the continuation
  // safety net from resurrecting a turn the user just killed.
  const toolAbortRef = useRef<AbortController | null>(null);
  const userStoppedRef = useRef(false);
  const getBodyRef = useRef(getBody);
  getBodyRef.current = getBody;
  const composerRef = useRef<ComposerHandle | null>(null);

  // Frame attached to the session: input theme button highlights, every request carries frameId along (server injects the playbook)
  const [frame, setFrame] = useState<AttachedFrame | null>(initialFrame);
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const [skillId, setSkillId] = useState<StudioScenarioSkillId>(initialSkillId);
  const skillRef = useRef(skillId);
  skillRef.current = skillId;
  const onFrameAppliedRef = useRef(onFrameApplied);
  onFrameAppliedRef.current = onFrameApplied;
  /** Attach a frame (shared by panel/theme button): besides session state, also notifies the workbench to apply the theme palette to comp. */
  const applyFrame = useCallback((f: AttachedFrame) => {
    setFrame(f);
    onFrameAppliedRef.current?.(f);
  }, []);

  // body carries session-level frameId + skillId; the situation snapshot is attached to metadata.situation at send time (persists with the session,
  // the route materializes it into a <composition_state> part) — stable history bytes are what let the prompt cache hit
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: studioProviders().chatEndpoint ?? '/api/studio/chat',
        body: () => ({
          ...(frameRef.current ? { frameId: frameRef.current.id } : {}),
          skillId: skillRef.current,
        }),
      }),
    [],
  );

  const { messages, sendMessage, status, stop, setMessages, addToolOutput, error } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    // Gate the SDK's OWN continuation triggers on the user-stopped flag too: after a stop, the tool
    // receipt lands via a queued addToolOutput job that often runs AFTER the stream has unwound to
    // 'ready' — the SDK's internal check then fires a fresh request and the turn the user just
    // killed marches on. sendAutomaticallyWhen is consulted by every trigger, so this gates them all.
    sendAutomaticallyWhen: (args) => !userStoppedRef.current && lastAssistantMessageIsCompleteWithToolCalls(args),
    async onToolCall({ toolCall }) {
      const id = toolCall.toolName;
      if (toolCallsUsedRef.current >= STUDIO_AGENT_EXECUTION_LIMITS.toolCallsPerTurn) {
        addToolOutput({
          tool: id,
          toolCallId: toolCall.toolCallId,
          state: 'output-error',
          errorText: t('chatGen.executionBudgetExhausted'),
        });
        return;
      }
      toolCallsUsedRef.current += 1;
      // Fresh controller per tool run: the stop button aborts it so long tools can stand down at
      // their safe boundaries instead of holding the turn hostage until they finish
      const ctrl = new AbortController();
      toolAbortRef.current = ctrl;
      try {
        const out = await runToolRef.current(id, (toolCall.input ?? {}) as Record<string, unknown>, { signal: ctrl.signal, surface: 'chat' });
        if (out.ok) addToolOutput({ tool: id, toolCallId: toolCall.toolCallId, output: out });
        else addToolOutput({ tool: id, toolCallId: toolCall.toolCallId, state: 'output-error', errorText: out.error ?? t('chatGen.executionFailed') });
      } catch (e) {
        const isStop = e instanceof DOMException && e.name === 'AbortError';
        addToolOutput({
          tool: id,
          toolCallId: toolCall.toolCallId,
          state: 'output-error',
          errorText: isStop ? e.message || t('chatGen.stopped') : e instanceof Error ? e.message : String(e),
        });
      } finally {
        if (toolAbortRef.current === ctrl) toolAbortRef.current = null;
      }
    },
  });

  // Persist: on stream end (ready / error) write localStorage; throttle a snapshot every 2s while streaming —
  // so switching sessions / refreshing mid-generation doesn't evaporate the streamed-out parts and completed tool outputs.
  // On first mount status is already 'ready' (also when restoring/switching to an old session) — skip that one,
  // otherwise merely opening an old session refreshes its updatedAt and scrambles the history ordering.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    if (status === 'ready' || status === 'error') onSnapshot(messagesRef.current, frameRef.current, skillRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
  const busy = status === 'streaming' || status === 'submitted';
  // Safety net for a dropped continuation: the SDK is supposed to fire the follow-up request from
  // inside addToolOutput (sendAutomaticallyWhen), but that trigger can be missed — observed in the
  // wild: tool output landed, status idle, and no request ever went out, so the turn died on the
  // tool card with the model never voicing the result. When status settles on 'ready' with the last
  // assistant message still ending in completed tool calls, fire the send ourselves — once per
  // completion state (keyed by message id + part count), after a grace delay re-checking status so
  // the SDK's own trigger always wins (no double request), and never on first mount (opening an old
  // session that happens to end on a tool card must not start a paid request by itself; dedicated
  // ref — mountedRef above is already true by the time this later-defined effect first runs).
  const statusRef = useRef(status);
  statusRef.current = status;
  const autoResumedRef = useRef('');
  const resumeArmedRef = useRef(false);
  useEffect(() => {
    if (!resumeArmedRef.current) {
      resumeArmedRef.current = true;
      return;
    }
    if (status !== 'ready') return;
    const timer = setTimeout(() => {
      if (statusRef.current !== 'ready') return; // the SDK sent its own follow-up meanwhile
      if (userStoppedRef.current) return; // the user killed this turn — don't resurrect it
      const msgs = messagesRef.current;
      const last = msgs[msgs.length - 1];
      if (!last || last.role !== 'assistant') return;
      if (!lastAssistantMessageIsCompleteWithToolCalls({ messages: msgs })) return;
      const key = `${last.id}:${last.parts.length}`;
      if (autoResumedRef.current === key) return;
      autoResumedRef.current = key;
      void sendMessage();
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, messages]);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => onSnapshot(messagesRef.current, frameRef.current, skillRef.current), 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);
  // Unmount mid-generation (switching session/new chat triggers key remount): stop the stream + snapshot the last moment —
  // otherwise fetch keeps running and onToolCall mutates the work in the background while the UI is already gone.
  // Non-generating unmount doesn't snapshot (glance at an old session then switch away shouldn't refresh its updatedAt).
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(
    () => () => {
      if (!busyRef.current) return;
      try {
        void stopRef.current();
      } catch {
        /* already ended */
      }
      onSnapshot(messagesRef.current, frameRef.current, skillRef.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  // Refresh/close mid-generation: native browser confirm dialog (a broken stream can't resume — client-execution architecture, no server-side run to recover)
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy]);

  // Attaching/detaching a frame also persists (only if there are messages; an empty session shouldn't enter history)
  useEffect(() => {
    if (messagesRef.current.length > 0) onSnapshot(messagesRef.current, frame, skillRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);

  // Skill is session state like the attached frame: changing it affects future turns and survives history switching.
  useEffect(() => {
    if (messagesRef.current.length > 0) onSnapshot(messagesRef.current, frameRef.current, skillId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillId]);

  const run = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t || status === 'streaming' || status === 'submitted') return;
      userStoppedRef.current = false; // a new message re-arms the continuation safety net
      toolCallsUsedRef.current = 0;
      // Snapshot the current situation at send time: only the latest one represents reality (situations in old messages are history, identity accounts for it)
      void sendMessage({ text: t, metadata: { situation: buildSituation(getBodyRef.current() as ChatSituation) } });
    },
    [sendMessage, status],
  );

  // A failed stream may already have committed tools. Re-generating the old assistant message
  // erases its receipts while keeping the client-side call counter, so the apparent retry can
  // duplicate edits or immediately hit the old turn's ceiling. Resume as a NEW user turn instead:
  // that gives the server a fresh composition snapshot and resets both execution counters.
  const continueFromCurrentState = useCallback(
    () => run(t('chatGen.continueAfterInterruptionPrompt')),
    [run],
  );

  // Stop = abort the running tool (it stands down at its next safe boundary) + kill the stream.
  // Order matters: flag first so neither the SDK tail check nor our safety net restarts the turn.
  const handleStop = useCallback(() => {
    userStoppedRef.current = true;
    toolAbortRef.current?.abort();
    void stop();
  }, [stop]);

  // Quick prompts: fill into the composer instead of sending directly (user can reword / add @ references before sending)
  const fillComposer = useCallback((text: string) => {
    composerRef.current?.setText(text);
  }, []);

  // Expose "one-tap film" progress + selected pill to the workbench.
  useImperativeHandle(
    handleRef,
    () => ({
      startProgress(): ProgressHandle {
        const id = mid('prog');
        const paint = (text: string) =>
          setMessages((s) => {
            const exists = s.some((m) => m.id === id);
            const msg: UIMessage = { id, role: 'assistant', parts: [{ type: 'text', text }] };
            return exists ? s.map((m) => (m.id === id ? msg : m)) : [...s, msg];
          });
        const lines: string[] = [];
        paint(' ');
        return {
          step(text) {
            const done = lines.map((l) => `✓ ${l}`).join('\n');
            lines.push(text);
            paint((done ? `${done}\n` : '') + `${text} …`);
          },
          finish(text) {
            paint(`${lines.map((l) => `✓ ${l}`).join('\n')}\n\n${text}`);
          },
          fail(text) {
            const body = lines.map((l, i) => (i < lines.length - 1 ? `✓ ${l}` : `✗ ${l}`)).join('\n');
            paint(`${body}\n\n${text}`);
          },
        };
      },
      insertElementPill(el) {
        composerRef.current?.insertElementPill(el);
      },
      clearElementPills() {
        composerRef.current?.clearElementPills();
      },
      send(text) {
        run(text);
      },
      insertText(text) {
        composerRef.current?.insertText(text);
      },
      focusInput() {
        composerRef.current?.focusInput();
      },
      attachFrame(s) {
        applyFrame(s);
      },
    }),
    [setMessages, run],
  );

  const empty = messages.length === 0;

  return (
    <>
      {/* Slide animation for the indeterminate progress bar (used by tool cards) */}
      <style>{'@keyframes hf-indet{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}@media (prefers-reduced-motion: reduce){[style*="hf-indet"]{animation:none !important}}'}</style>
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="gap-5 p-3">
          {empty ? (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <ConversationEmptyState
                icon={<PiAvatar size={44} />}
                title={t('chatGen.greeting')}
                description={t('chatGen.emptyStateIntro')}
              />
              {/* Not using Suggestions (horizontal scrollbar): starter prompts wrap across lines instead.
                  Click = fill into the input (editable/deletable, send authority stays with the user), doesn't send directly */}
              <div className="flex max-w-full flex-wrap items-center justify-center gap-2 px-3">
                <Suggestion suggestion={t('chatGen.cutShotsFirst')} onClick={fillComposer} />
                <Suggestion suggestion={t('chatGen.transcribeToEdit')} onClick={fillComposer} />
              </div>
            </div>
          ) : (
            messages.map((m, mi) => {
              const parts = (m.parts ?? []) as ToolPartLike[];
              // Collapse consecutive track_export polls (only step-starts between them): render just
              // the last of each run — a polling agent otherwise buries the conversation in a column
              // of identical progress badges. Polls separated by real text keep rendering.
              const collapsed = new Set<number>();
              for (let i = 0; i < parts.length; i++) {
                if (parts[i]!.type !== 'tool-track_export') continue;
                let j = i + 1;
                while (j < parts.length && parts[j]!.type === 'step-start') j++;
                if (j < parts.length && parts[j]!.type === 'tool-track_export') collapsed.add(i);
              }
              // Older runs (and a model ignoring the new vectorized schema) can emit one precise-
              // framing call per shot. Adjacent calls separated only by SDK step markers become one
              // visual receipt; message history/tool outputs remain untouched.
              const framingGroups = new Map<number, ToolPartLike[]>();
              const isFraming = (part: ToolPartLike) =>
                part.type === 'tool-set_shot_framing' || (part.type === 'dynamic-tool' && part.toolName === 'set_shot_framing');
              for (let i = 0; i < parts.length; i++) {
                if (collapsed.has(i) || !isFraming(parts[i]!)) continue;
                const grouped = [parts[i]!];
                const groupedIndexes: number[] = [];
                let cursor = i + 1;
                while (cursor < parts.length) {
                  while (cursor < parts.length && parts[cursor]!.type === 'step-start') cursor++;
                  if (cursor >= parts.length || !isFraming(parts[cursor]!)) break;
                  grouped.push(parts[cursor]!);
                  groupedIndexes.push(cursor);
                  cursor++;
                }
                if (grouped.length <= 1) continue;
                framingGroups.set(i, grouped);
                for (const index of groupedIndexes) collapsed.add(index);
              }
              // Dead-zone detection: stream still running, but the last visible part is neither a "running tool" (its card animates itself)
              // nor "growing text" (the tokens are their own feedback) → show thinking dots, don't let the view freeze
              const busy = status === 'submitted' || status === 'streaming';
              const isLast = mi === messages.length - 1;
              const vis = parts.filter((p) => p.type !== 'step-start');
              const lastPart = vis[vis.length - 1];
              const lastToolRunning =
                !!lastPart && (lastPart.type.startsWith('tool-') || lastPart.type === 'dynamic-tool') && toolStatus(lastPart).kind === 'running';
              const lastTextLive = !!lastPart && lastPart.type === 'text' && !!(lastPart as { text?: string }).text;
              // Reasoning parts are hidden (leaked-internals feel) — a streaming reasoning phase must
              // therefore SHOW the dots, or the model looks dead while it thinks.
              const thinking = m.role === 'assistant' && isLast && busy && !lastToolRunning && !lastTextLive;
              const emptyCompletedAssistant =
                m.role === 'assistant'
                && isLast
                && status === 'ready'
                && !assistantMessageHasRenderableOutput(m);
              const continuationRecommended =
                m.role === 'assistant'
                && isLast
                && status === 'ready'
                && (m.metadata as { continuationRecommended?: boolean } | undefined)?.continuationRecommended === true;
              return (
                <Message key={m.id} from={m.role}>
                  <div className="flex items-start gap-2">
                    {m.role === 'assistant' && <PiAvatar thinking={thinking} />}
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      {parts.map((part, idx) => {
                        const key = `${m.id}-${idx}`;
                        if (part.type === 'step-start') return null;
                        if (collapsed.has(idx)) return null;
                        if (part.type === 'text') {
                          const text = (part as { text?: string }).text ?? '';
                          if (!text) return null;
                          return m.role === 'user' ? (
                            <MessageContent key={key}>
                              <div className="text-[13px] leading-relaxed">{renderTextWithElementPills(text, elements)}</div>
                            </MessageContent>
                          ) : (
                            <MessageContent key={key}>
                              <MessageResponse className="text-[13px] leading-relaxed">{text}</MessageResponse>
                            </MessageContent>
                          );
                        }
                        // Reasoning parts are NOT rendered (user decision: no thinking process in the
                        // chat, it reads as leaked internals). The thinking phase still shows activity
                        // via the ThinkingDots below — live reasoning counts as "thinking", not output.
                        if (part.type === 'reasoning') return null;
                        if (part.type.startsWith('tool-') || part.type === 'dynamic-tool')
                          // Locate rides the existing seek tool (playhead + preview follow) — no new channel to the workbench
                          return framingGroups.has(idx)
                            ? renderToolPartGroup(framingGroups.get(idx)!, key, { onLocate: (sec) => void runToolRef.current('seek', { toSec: sec }), getComp })
                            : renderToolPart(part, key, { onLocate: (sec) => void runToolRef.current('seek', { toSec: sec }), getComp });
                        return null;
                      })}
                      {thinking && <ThinkingDots />}
                      {emptyCompletedAssistant && (
                        <div className="border-line bg-panel-2 flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12px]">
                          <X size={12} className="shrink-0 text-destructive" />
                          <span className="min-w-0 flex-1 text-destructive">{t('chatGen.requestFailed')}</span>
                          <button
                            type="button"
                            onClick={continueFromCurrentState}
                            className="text-ink-2 hover:bg-line hover:text-ink shrink-0 rounded px-1.5 py-0.5 font-medium"
                          >
                            {t('chatGen.continueFromCurrentState')}
                          </button>
                        </div>
                      )}
                      {continuationRecommended && !emptyCompletedAssistant && (
                        <div>
                          <button
                            type="button"
                            onClick={continueFromCurrentState}
                            className="border-line bg-panel-2 text-ink-2 hover:bg-line hover:text-ink rounded-md border px-2.5 py-1.5 text-[12px] font-medium"
                          >
                            {t('chatGen.continueFromCurrentState')}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </Message>
              );
            })
          )}
          {/* Sent but no first response yet (last message is the user's): standalone thinking row */}
          {(status === 'submitted' || status === 'streaming') && messages[messages.length - 1]?.role === 'user' && (
            <Message from="assistant">
              <div className="flex items-start gap-2">
                <PiAvatar thinking />
                <div className="pt-0.5">
                  <ThinkingDots />
                </div>
              </div>
            </Message>
          )}
          {/* Request/stream failed: committed tools are durable, so recovery is a fresh continuation
              from live project state rather than regeneration of stale history. */}
          {error && (
            <div className="border-line bg-panel-2 flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12px]">
              <X size={12} className="shrink-0 text-destructive" />
              <span className="min-w-0 flex-1 truncate text-destructive">
                {error.message?.includes('insufficient_tokens') ? t('chatGen.notEnoughCreditsTop') : t('chatGen.interruptedStatePreserved')}
              </span>
              {!error.message?.includes('insufficient_tokens') && (
                <button
                  type="button"
                  onClick={continueFromCurrentState}
                  className="text-ink-2 hover:bg-line hover:text-ink shrink-0 rounded px-1.5 py-0.5 font-medium"
                >
                  {t('chatGen.continueFromCurrentState')}
                </button>
              )}
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="p-2.5 pt-1">
        <Composer
          placeholder={t('chatGen.sayWhatAddChange')}
          status={status}
          elements={elements}
          skillId={skillId}
          scenarioSkills={scenarioSkills}
          onPickSkill={setSkillId}
          frame={frame}
          frames={frames}
          onPickFrame={applyFrame}
          onRemoveFrame={() => setFrame(null)}
          onSubmit={run}
          onStop={handleStop}
          methodsRef={composerRef}
        />
      </div>
    </>
  );
}
