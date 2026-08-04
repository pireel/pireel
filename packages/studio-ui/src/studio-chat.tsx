'use client';

/**
 * Studio chat panel — agent + tools version, same look as the "project doc" chat.
 *
 *  · Message stream / auto-scroll / empty state / scroll-to-bottom = ai-elements Conversation family
 *  · Bubbles + markdown = Message / MessageResponse (Streamdown)
 *  · Input = contenteditable composer (border/focus/π avatar/placeholder/@ pill); @ opens the element picker
 *  · LLM tool calls = useChat streaming; tools do NOT execute server-side — onToolCall mutates the
 *    Composition client-side (runTool injected by the workbench), addToolOutput feeds back to continue.
 *    Block generation goes through /api/studio/compose.
 *  · Tool calls render in the stream as a badge (instant ops) or a card (generative)
 *  · Multi-session: threads live in localStorage, switching remounts by key; startProgress still drives "one-tap film".
 *
 * Split across modules: chat-format (pills/avatar/dots), chat-tool-parts (badge/card),
 * chat-composer (input), chat-thread (single-thread useChat), chat-thread-store (localStorage).
 * This file keeps the public types + the multi-session shell.
 */

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { X, Sparkles, MessageSquarePlus, History } from 'lucide-react';
import type { UIMessage } from 'ai';
import type { StudioToolResult } from '@pireel/studio-engine/prompts';
import type { Composition } from '@pireel/studio-engine/composition';
import { useFrameCatalog } from './use-frame-catalog';
import { mid } from './chat-format';
import { ChatThread } from './chat-thread';
import { type StoredThread, firstUserText, loadThreads, sanitizeRestored, saveThreads } from './chat-thread-store';
import { t } from './i18n';

/* ============================ Public types ============================ */

/** An @-mentionable element (block / shot). */
export interface StudioElementRef {
  id: string;
  label: string;
  /** caption / title / stat / list / transition / custom / shot */
  kind: string;
  isShot: boolean;
}

/** Updater for a streaming "progress" message (used by the "one-tap film" background flow to report). */
export interface ProgressHandle {
  step(text: string): void;
  finish(text: string): void;
  fail(text: string): void;
}

/** Frame attached to the session (studio theme-template pack; theme button highlights + frameId rides the request, server injects the playbook). */
export interface AttachedFrame {
  id: string;
  title: string;
  icon: string;
  iconKey?: string | null;
}

export interface StudioChatHandle {
  startProgress(): ProgressHandle;
  /** Called by the workbench on selection change: pass an element → input shows a "currently selected" pill; pass null → remove it. */
  insertElementPill(el: StudioElementRef | null): void;
  /** Workbench pushes a user message directly. Silently dropped while streaming. */
  send(text: string): void;
  /** Only fill a piece of text into the input without sending (used by the generate panel's "@reference" for assets). */
  insertText(text: string): void;
  /** Only focus the input (component floating bar's "AI edit" switches over to keep typing). */
  focusInput(): void;
  /** Attach a frame to the current session (shared by frame panel "use" and the input's theme button): button highlights, injected with the request. */
  attachFrame(frame: AttachedFrame): void;
}

export interface StudioChatProps {
  /** Client-side tool executor: mutates Composition state / calls compose to generate blocks, returns a summary. */
  runTool: (toolId: string, input: Record<string, unknown>, opts?: { signal?: AbortSignal; surface?: 'chat' | 'bridge' }) => Promise<StudioToolResult>;
  /** Callback when a frame is attached (both panel "use" and the theme button): the workbench uses it to apply the theme palette to comp. */
  onFrameApplied?: (frame: AttachedFrame) => void;
  /** The situation read at send time (composition snapshot/selection/playhead/pipeline): buildSituation
   *  turns it into text on the user message's metadata.situation (not in request body, not in system). */
  getBody: () => Record<string, unknown>;
  /** Currently @-mentionable elements. */
  elements: StudioElementRef[];
  /** Live composition accessor (stable identity, reads a ref): tool receipt cards preview blocks
   *  without linking chat re-renders to comp state. Optional — the preview strip hides without it. */
  getComp?: () => Composition;
  /** Session persistence key (per project: studio:chat:v1:<projectId>, sessions belong to a project). */
  storageKey: string;
  /** Fired after threads are written to localStorage (the workbench uses it to sync sessions to the cloud too). */
  onThreadsChange?: () => void;
  /** Close the chat area (header X; workbench collapses the right region to free up screen). Omit to not render the close button. */
  onClose?: () => void;
}

/* ============================ Multi-session shell ============================ */

/** memo: chat stays mounted (switching panels only hides it), so the workbench's high-frequency re-renders
 *  (box drag publishes frequently) must not re-render the whole message tree along with it. Precondition = the three
 *  props have stable identity (guaranteed on the workbench side: runTool via useStableCallbacks, getBody useCallback([]),
 *  elements memoized by content key). */
export const StudioChat = memo(
  forwardRef<StudioChatHandle, StudioChatProps>(function StudioChat({ runTool, getBody, elements, getComp, onFrameApplied, storageKey, onThreadsChange, onClose }, ref) {
  const [threads, setThreads] = useState<StoredThread[]>([]);
  const onThreadsChangeRef = useRef(onThreadsChange);
  onThreadsChangeRef.current = onThreadsChange;
  const [activeId, setActiveId] = useState<string>(() => mid('thread'));
  const [histOpen, setHistOpen] = useState(false);
  const innerRef = useRef<StudioChatHandle | null>(null);
  const frames = useFrameCatalog(); // frame catalog for the `/` picker (in-process cache)

  // Restore from localStorage after mount (SSR-safe: first frame empty, hydrate on the client). Key is per project,
  // sessions belong to a project; the workbench remounts per project, so storageKey won't change mid-life
  useEffect(() => {
    const loaded = loadThreads(storageKey);
    if (loaded.length) {
      setThreads(loaded);
      setActiveId(loaded[0]!.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = threads.find((t) => t.id === activeId);
  // Sanitize interruption leftovers on restore (memo by message identity: reference changes only when a snapshot persists, not every frame)
  const activeMessages = active?.messages;
  const restoredMessages = useMemo(() => (activeMessages ? sanitizeRestored(activeMessages) : []), [activeMessages]);

  // Latest threads mirror: onSnapshot computes merged outside the updater (the updater must be pure — React replays
  // queued updaters during render, and side effects like saveThreads/notifying the workbench inside would become
  // "setState during render" warnings; been bitten). Snapshots come from the stream-end callback (event time), so the ref reads the current value.
  const threadsRef = useRef(threads);
  threadsRef.current = threads;
  const onSnapshot = useCallback(
    (messages: UIMessage[], frame: AttachedFrame | null) => {
      if (messages.length === 0) return;
      const title = firstUserText(messages).slice(0, 24) || t('chatGen.newConversation');
      const next: StoredThread = { id: activeId, title, messages, updatedAt: Date.now(), frame };
      const merged = [next, ...threadsRef.current.filter((t) => t.id !== activeId)];
      setThreads(merged);
      saveThreads(storageKey, merged);
      onThreadsChangeRef.current?.(); // persisted to localStorage → notify the workbench to sync to the cloud
    },
    [activeId, storageKey],
  );

  const newConversation = useCallback(() => {
    setActiveId(mid('thread'));
    setHistOpen(false);
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      startProgress: () =>
        innerRef.current?.startProgress() ?? { step() {}, finish() {}, fail() {} },
      insertElementPill: (el) => innerRef.current?.insertElementPill(el),
      send: (text) => innerRef.current?.send(text),
      insertText: (text) => innerRef.current?.insertText(text),
      focusInput: () => innerRef.current?.focusInput(),
      attachFrame: (frame) => innerRef.current?.attachFrame(frame),
    }),
    [],
  );

  return (
    <div className="bg-panel flex h-full min-h-0 w-full min-w-0 flex-col">
      {/* Header: title + history + new chat */}
      <div className="border-line text-ink-3 relative flex items-center gap-1.5 border-b px-3 py-2 text-[12px]">
        <Sparkles size={13} className="text-accent" />
        <span className="truncate">{active?.title ?? t('chatGen.chat')}</span>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            className="hover:bg-panel-2 hover:text-ink inline-flex h-6 w-6 items-center justify-center rounded"
            onClick={() => setHistOpen((v) => !v)}
            title={t('chatGen.conversationHistory')}
          >
            <History size={13} />
          </button>
          <button
            type="button"
            disabled={!active || active.messages.length === 0}
            className="hover:bg-panel-2 hover:text-ink inline-flex h-6 w-6 items-center justify-center rounded disabled:pointer-events-none disabled:opacity-30"
            onClick={newConversation}
            title={!active || active.messages.length === 0 ? t('chatGen.alreadyNewConversation') : t('chatGen.newConversation')}
          >
            <MessageSquarePlus size={14} />
          </button>
          {onClose && (
            <button
              type="button"
              className="hover:bg-panel-2 hover:text-ink inline-flex h-6 w-6 items-center justify-center rounded"
              onClick={onClose}
              title={t('chatGen.closeChat')}
              aria-label={t('chatGen.closeChat')}
            >
              <X size={14} />
            </button>
          )}
        </div>
        {histOpen && (
          <div className="border-line bg-panel absolute right-2 top-9 z-20 max-h-[50vh] w-[260px] overflow-y-auto rounded-md border shadow-md">
            {threads.length === 0 ? (
              <div className="text-ink-4 px-3 py-3 text-center text-[12px]">{t('chatGen.noPastConversationsYet')}</div>
            ) : (
              threads.map((th) => (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => {
                    setActiveId(th.id);
                    setHistOpen(false);
                  }}
                  className={`hover:bg-panel-2 flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] ${th.id === activeId ? 'bg-panel-2' : ''}`}
                >
                  <span className="text-ink truncate">{th.title || t('chatGen.newConversation')}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      <ChatThread
        key={activeId}
        threadId={activeId}
        initialMessages={restoredMessages}
        initialFrame={active?.frame ?? null}
        frames={frames}
        onFrameApplied={onFrameApplied}
        runTool={runTool}
        getBody={getBody}
        elements={elements}
        getComp={getComp}
        onSnapshot={onSnapshot}
        handleRef={innerRef}
      />
    </div>
  );
  }),
);
