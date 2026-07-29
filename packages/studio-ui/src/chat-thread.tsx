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
import { Reasoning, ReasoningContent, ReasoningTrigger } from '@pireel/ui/ai-elements/reasoning';
import { type ChatSituation, buildSituation } from '@pireel/studio-engine/prompts';
import { studioProviders } from '@pireel/studio-engine/providers';
import type { FrameCatalogItem } from './use-frame-catalog';
import { mid, PiAvatar, ThinkingDots, renderTextWithElementPills } from './chat-format';
import { renderToolPart, toolStatus, type ToolPartLike } from './chat-tool-parts';
import { Composer, type ComposerHandle } from './chat-composer';
import { t } from './i18n';
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
  frames,
  onFrameApplied,
  runTool,
  getBody,
  elements,
  onSnapshot,
  handleRef,
}: {
  threadId: string;
  initialMessages: UIMessage[];
  initialFrame: AttachedFrame | null;
  frames: FrameCatalogItem[];
  onFrameApplied?: (frame: AttachedFrame) => void;
  runTool: StudioChatProps['runTool'];
  getBody: StudioChatProps['getBody'];
  elements: StudioElementRef[];
  onSnapshot: (messages: UIMessage[], frame: AttachedFrame | null) => void;
  handleRef: React.MutableRefObject<StudioChatHandle | null>;
}) {
  const runToolRef = useRef(runTool);
  runToolRef.current = runTool;
  const getBodyRef = useRef(getBody);
  getBodyRef.current = getBody;
  const composerRef = useRef<ComposerHandle | null>(null);

  // Frame attached to the session: input theme button highlights, every request carries frameId along (server injects the playbook)
  const [frame, setFrame] = useState<AttachedFrame | null>(initialFrame);
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const onFrameAppliedRef = useRef(onFrameApplied);
  onFrameAppliedRef.current = onFrameApplied;
  /** Attach a frame (shared by panel/theme button): besides session state, also notifies the workbench to apply the theme palette to comp. */
  const applyFrame = useCallback((f: AttachedFrame) => {
    setFrame(f);
    onFrameAppliedRef.current?.(f);
  }, []);

  // body carries only frameId; the situation snapshot is attached to metadata.situation at send time (persists with the session,
  // the route materializes it into a <composition_state> part) — stable history bytes are what let the prompt cache hit
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: studioProviders().chatEndpoint ?? '/api/studio/chat',
        body: () => (frameRef.current ? { frameId: frameRef.current.id } : {}),
      }),
    [],
  );

  const { messages, sendMessage, status, stop, setMessages, addToolOutput, error, regenerate } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    async onToolCall({ toolCall }) {
      const id = toolCall.toolName;
      try {
        const out = await runToolRef.current(id, (toolCall.input ?? {}) as Record<string, unknown>);
        if (out.ok) addToolOutput({ tool: id, toolCallId: toolCall.toolCallId, output: out });
        else addToolOutput({ tool: id, toolCallId: toolCall.toolCallId, state: 'output-error', errorText: out.error ?? t('chatGen.executionFailed') });
      } catch (e) {
        addToolOutput({
          tool: id,
          toolCallId: toolCall.toolCallId,
          state: 'output-error',
          errorText: e instanceof Error ? e.message : String(e),
        });
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
    if (status === 'ready' || status === 'error') onSnapshot(messagesRef.current, frameRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
  const busy = status === 'streaming' || status === 'submitted';
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => onSnapshot(messagesRef.current, frameRef.current), 2000);
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
      onSnapshot(messagesRef.current, frameRef.current);
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
    if (messagesRef.current.length > 0) onSnapshot(messagesRef.current, frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);

  const run = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t || status === 'streaming' || status === 'submitted') return;
      // Snapshot the current situation at send time: only the latest one represents reality (situations in old messages are history, identity accounts for it)
      void sendMessage({ text: t, metadata: { situation: buildSituation(getBodyRef.current() as ChatSituation) } });
    },
    [sendMessage, status],
  );

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
              {/* Onboarding: the film pipeline is entirely agent-driven, one tap = one sentence sent */}
              {/* Not using Suggestions (horizontal scrollbar): quick prompts wrap across lines instead.
                  Click = fill into the input (editable/deletable, send authority stays with the user), doesn't send directly */}
              <div className="flex max-w-full flex-wrap items-center justify-center gap-2 px-3">
                <Suggestion suggestion={t('chatGen.autoCreateHint')} onClick={fillComposer} />
                <Suggestion suggestion={t('chatGen.cutShotsFirst')} onClick={fillComposer} />
                <Suggestion suggestion={t('chatGen.transcribeToEdit')} onClick={fillComposer} />
              </div>
            </div>
          ) : (
            messages.map((m, mi) => {
              const parts = (m.parts ?? []) as ToolPartLike[];
              // Dead-zone detection: stream still running, but the last visible part is neither a "running tool" (its card animates itself)
              // nor "growing text" (the tokens are their own feedback) → show thinking dots, don't let the view freeze
              const busy = status === 'submitted' || status === 'streaming';
              const isLast = mi === messages.length - 1;
              const vis = parts.filter((p) => p.type !== 'step-start');
              const lastPart = vis[vis.length - 1];
              const lastToolRunning =
                !!lastPart && (lastPart.type.startsWith('tool-') || lastPart.type === 'dynamic-tool') && toolStatus(lastPart).kind === 'running';
              const lastTextLive = !!lastPart && lastPart.type === 'text' && !!(lastPart as { text?: string }).text;
              // A live reasoning panel already signals activity — no extra thinking dots under it
              const lastReasoningLive = !!lastPart && lastPart.type === 'reasoning' && !!(lastPart as { text?: string }).text;
              const thinking = m.role === 'assistant' && isLast && busy && !lastToolRunning && !lastTextLive && !lastReasoningLive;
              return (
                <Message key={m.id} from={m.role}>
                  <div className="flex items-start gap-2">
                    {m.role === 'assistant' && <PiAvatar thinking={thinking} />}
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      {parts.map((part, idx) => {
                        const key = `${m.id}-${idx}`;
                        if (part.type === 'step-start') return null;
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
                        if (part.type === 'reasoning') {
                          // Reasoning-model thinking stream: rendered live (otherwise the whole
                          // thinking phase is dead air — the stream is flowing but nothing paints)
                          const text = (part as { text?: string }).text ?? '';
                          if (!text.trim()) return null;
                          const streaming = (part as { state?: 'streaming' | 'done' }).state === 'streaming';
                          return (
                            <Reasoning key={key} isStreaming={streaming}>
                              <ReasoningTrigger>
                                {streaming ? t('chatGen.reasoningLive') : t('chatGen.reasoningDone')}
                              </ReasoningTrigger>
                              <ReasoningContent>
                                <MessageResponse className="text-xs leading-relaxed">{text}</MessageResponse>
                              </ReasoningContent>
                            </Reasoning>
                          );
                        }
                        if (part.type.startsWith('tool-') || part.type === 'dynamic-tool')
                          // Locate rides the existing seek tool (playhead + preview follow) — no new channel to the workbench
                          return renderToolPart(part, key, { onLocate: (sec) => void runToolRef.current('seek', { toSec: sec }) });
                        return null;
                      })}
                      {thinking && <ThinkingDots />}
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
          {/* Request/stream failed: show a visible error bar (otherwise it just silently stops); retry = regenerate reruns the last round */}
          {error && (
            <div className="border-line bg-panel-2 flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12px]">
              <X size={12} className="shrink-0 text-destructive" />
              <span className="min-w-0 flex-1 truncate text-destructive">
                {error.message?.includes('insufficient_tokens') ? t('chatGen.notEnoughCreditsTop') : t('chatGen.somethingWentWrongMsg', { msg: error.message || t('chatGen.requestFailed') })}
              </span>
              <button
                type="button"
                onClick={() => void regenerate()}
                className="text-ink-2 hover:bg-line hover:text-ink shrink-0 rounded px-1.5 py-0.5 font-medium"
              >
                {t('common.retry')}
              </button>
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
          frame={frame}
          frames={frames}
          onPickFrame={applyFrame}
          onRemoveFrame={() => setFrame(null)}
          onSubmit={run}
          onStop={stop}
          methodsRef={composerRef}
        />
      </div>
    </>
  );
}
