"use client";

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
 *  · Multi-session: server snapshots are injected by the shell; switching remounts by thread id.
 *
 * Split across modules: chat-format (pills/avatar/dots), chat-tool-parts (badge/card),
 * chat-composer (input), chat-thread (single-thread useChat), chat-thread-store (validation/restore helpers).
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
} from "react";
import { X, MessageSquarePlus, History } from "lucide-react";
import type { UIMessage } from "ai";
import type { StudioToolResult } from "@pireel/studio-engine/prompts";
import type { Composition } from "@pireel/studio-engine/composition";
import type { CustomVisualStyle } from "@pireel/studio-engine/visual-style";
import {
  STUDIO_AUTO_SKILL_ID,
  type StudioScenarioSkillId,
} from "@pireel/studio-engine/scenario-skills";
import { useFrameCatalog } from "./use-frame-catalog";
import { mid } from "./chat-format";
import { ChatThread } from "./chat-thread";
import {
  type StoredThread,
  firstUserText,
  normalizeStoredThreads,
  sanitizeRestored,
} from "./chat-thread-store";
import { t } from "./i18n";
import {
  useStudioShell,
  type StudioScenarioSkillOption,
} from "./shell-context";
import type { StudioElementRef } from "./chat-local-asset-mention";

export type { StudioElementRef } from "./chat-local-asset-mention";

/* ============================ Public types ============================ */

/** Updater for a streaming "progress" message (used by the "one-tap film" background flow to report). */
export interface ProgressHandle {
  step(text: string): void;
  finish(text: string): void;
  fail(text: string): void;
}

/** Visual direction attached to the session; frameId carries its art-direction playbook. */
export interface AttachedFrame {
  id: string;
  title: string;
  icon: string;
  iconKey?: string | null;
  /** Independent palette/caption/layout controls layered over the selected direction. */
  customVisualStyle?: CustomVisualStyle;
}

/** A concrete composed timeline frame attached to the next user message. */
export interface AttachedTimelineFrame {
  id: string;
  atSec: number;
  fps: number;
  dataUrl: string;
  width: number;
  height: number;
}

export interface PendingTimelineFrame {
  id: string;
  atSec: number;
  fps: number;
}

/** Ordered composer stream: frame references stay exactly where the user inserted them among text. */
export type StudioChatDraftPart =
  | { type: "text"; text: string }
  | { type: "timeline-frame"; frame: AttachedTimelineFrame };

export interface StudioChatHandle {
  startProgress(): ProgressHandle;
  /** Called by the workbench on selection change: pass an element → input shows a "currently selected" pill; pass null → remove it. */
  insertElementPill(el: StudioElementRef | null): void;
  /** Clear every draft @ reference when switching outputs. */
  clearElementPills(): void;
  /** Workbench pushes a user message directly. Silently dropped while streaming. */
  send(text: string): void;
  /** Only fill a piece of text into the input without sending (used by the generate panel's "@reference" for assets). */
  insertText(text: string): void;
  /** Only focus the input (component floating bar's "AI edit" switches over to keep typing). */
  focusInput(): void;
  /** Attach a frame to the current session (shared by frame panel "use" and the input's theme button): button highlights, injected with the request. */
  attachFrame(frame: AttachedFrame | null): void;
  /** Insert a loading frame tag at the saved composer caret before capture starts. */
  beginTimelineFrameCapture(frame: PendingTimelineFrame): void;
  /** Promote the matching loading tag in place without moving or replacing earlier frame tags. */
  resolveTimelineFrameCapture(frame: AttachedTimelineFrame): void;
  /** Remove a failed loading tag. */
  failTimelineFrameCapture(id: string): void;
}

export interface StudioChatProps {
  /** Client-side tool executor: mutates Composition state / calls compose to generate blocks, returns a summary. */
  runTool: (
    toolId: string,
    input: Record<string, unknown>,
    opts?: { signal?: AbortSignal; surface?: "chat" | "bridge"; skillId?: string },
  ) => Promise<StudioToolResult>;
  /** Callback when a frame is attached (both panel "use" and the theme button): the workbench uses it to apply the theme palette to comp. */
  onFrameApplied?: (frame: AttachedFrame | null) => void;
  /** The situation read at send time (composition snapshot/selection/playhead/pipeline): buildSituation
   *  turns it into text on the user message's metadata.situation (not in request body, not in system). */
  getBody: () => Record<string, unknown>;
  /** Currently @-mentionable elements. */
  elements: StudioElementRef[];
  /** Live composition accessor (stable identity, reads a ref): tool receipt cards preview blocks
   *  without linking chat re-renders to comp state. Optional — the preview strip hides without it. */
  getComp?: () => Composition;
  /** Exact-frame picking happens on the real Studio timeline; Chat only owns its mode button and draft attachment. */
  timelineFramePickActive?: boolean;
  timelineFramePickBusy?: boolean;
  timelineFramePickAvailable?: boolean;
  onTimelineFramePickActiveChange?: (active: boolean) => void;
  /** Server session snapshots already loaded for this project. */
  initialThreads: readonly unknown[];
  /** Fired whenever the active thread has a durable snapshot ready for immediate server persistence. */
  onThreadChange?: (thread: StoredThread) => void;
  /** Close the chat area (header X; workbench collapses the right region to free up screen). Omit to not render the close button. */
  onClose?: () => void;
}

/* ============================ Multi-session shell ============================ */

/** memo: chat stays mounted (switching panels only hides it), so the workbench's high-frequency re-renders
 *  (box drag publishes frequently) must not re-render the whole message tree along with it. Precondition = the three
 *  props have stable identity (guaranteed on the workbench side: runTool via useStableCallbacks, getBody useCallback([]),
 *  elements memoized by content key). */
export const StudioChat = memo(
  forwardRef<StudioChatHandle, StudioChatProps>(function StudioChat(
    {
      runTool,
      getBody,
      elements,
      getComp,
      timelineFramePickActive = false,
      timelineFramePickBusy = false,
      timelineFramePickAvailable = false,
      onTimelineFramePickActiveChange,
      onFrameApplied,
      initialThreads,
      onThreadChange,
      onClose,
    },
    ref,
  ) {
    const shell = useStudioShell();
    const customScenarioSkillManager = shell.customScenarioSkills;
    const [customScenarioSkills, setCustomScenarioSkills] = useState<
      readonly StudioScenarioSkillOption[]
    >([]);
    const [customScenarioSkillsReady, setCustomScenarioSkillsReady] = useState(
      !customScenarioSkillManager,
    );
    const refreshCustomScenarioSkills = useCallback(async () => {
      if (!customScenarioSkillManager) return;
      const skills = await customScenarioSkillManager.list();
      setCustomScenarioSkills(skills);
    }, [customScenarioSkillManager]);
    const scenarioSkills = useMemo(() => {
      const host = shell.scenarioSkills ?? [];
      const hostIds = new Set(host.map((skill) => skill.id));
      return [
        ...host,
        ...customScenarioSkills.filter((skill) => !hostIds.has(skill.id)),
      ];
    }, [shell.scenarioSkills, customScenarioSkills]);
    const defaultSkillId = scenarioSkills.some(
      (skill) => skill.id === shell.defaultScenarioSkillId,
    )
      ? shell.defaultScenarioSkillId!
      : STUDIO_AUTO_SKILL_ID;
    const [threads, setThreads] = useState<StoredThread[]>([]);
    const onThreadChangeRef = useRef(onThreadChange);
    onThreadChangeRef.current = onThreadChange;
    const [activeId, setActiveId] = useState<string>(() => mid("thread"));
    const [histOpen, setHistOpen] = useState(false);
    const innerRef = useRef<StudioChatHandle | null>(null);
    const frames = useFrameCatalog(); // frame catalog for the `/` picker (in-process cache)

    useEffect(() => {
      let cancelled = false;
      if (!customScenarioSkillManager) {
        setCustomScenarioSkills([]);
        setCustomScenarioSkillsReady(true);
        return () => {
          cancelled = true;
        };
      }
      setCustomScenarioSkillsReady(false);
      void customScenarioSkillManager
        .list()
        .then((skills) => {
          if (!cancelled) setCustomScenarioSkills(skills);
        })
        .catch((error) => {
          console.error("[studio] custom Skill catalog failed", error);
          if (!cancelled) setCustomScenarioSkills([]);
        })
        .finally(() => {
          if (!cancelled) setCustomScenarioSkillsReady(true);
        });
      return () => {
        cancelled = true;
      };
    }, [customScenarioSkillManager]);

    // Restore the server-authoritative sessions once both the built-in and custom Skill catalogs are ready.
    const restoredRef = useRef(false);
    useEffect(() => {
      if (!customScenarioSkillsReady || restoredRef.current) return;
      restoredRef.current = true;
      const loaded = normalizeStoredThreads(
        initialThreads,
        scenarioSkills.map((skill) => skill.id),
      );
      if (loaded.length) {
        setThreads(loaded);
        setActiveId(loaded[0]!.id);
      }
    }, [customScenarioSkillsReady, initialThreads, scenarioSkills]);

    const deleteScenarioSkill = useCallback(
      async (id: string) => {
        if (!customScenarioSkillManager)
          throw new Error("skill_delete_unavailable");
        await customScenarioSkillManager.delete(id);
        setCustomScenarioSkills((current) =>
          current.filter((skill) => skill.id !== id),
        );
      },
      [customScenarioSkillManager],
    );

    const active = threads.find((t) => t.id === activeId);
    // Sanitize interruption leftovers on restore (memo by message identity: reference changes only when a snapshot persists, not every frame)
    const activeMessages = active?.messages;
    const restoredMessages = useMemo(
      () => (activeMessages ? sanitizeRestored(activeMessages) : []),
      [activeMessages],
    );

    // Latest threads mirror: onSnapshot computes merged outside the updater (the updater must be pure — React replays
    // queued updaters during render, and side effects like notifying the workbench inside would become
    // "setState during render" warnings; been bitten). Snapshots come from the stream-end callback (event time), so the ref reads the current value.
    const threadsRef = useRef(threads);
    threadsRef.current = threads;
    const onSnapshot = useCallback(
      (
        messages: UIMessage[],
        frame: AttachedFrame | null,
        skillId: StudioScenarioSkillId,
      ) => {
        if (messages.length === 0) return;
        const title =
          firstUserText(messages).slice(0, 24) || t("chatGen.newConversation");
        const next: StoredThread = {
          id: activeId,
          title,
          messages,
          updatedAt: Date.now(),
          frame,
          skillId,
        };
        const merged = [
          next,
          ...threadsRef.current.filter((t) => t.id !== activeId),
        ];
        setThreads(merged);
        onThreadChangeRef.current?.(next);
      },
      [activeId],
    );

    const newConversation = useCallback(() => {
      setActiveId(mid("thread"));
      setHistOpen(false);
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        startProgress: () =>
          innerRef.current?.startProgress() ?? {
            step() {},
            finish() {},
            fail() {},
          },
        insertElementPill: (el) => innerRef.current?.insertElementPill(el),
        clearElementPills: () => innerRef.current?.clearElementPills(),
        send: (text) => innerRef.current?.send(text),
        insertText: (text) => innerRef.current?.insertText(text),
        focusInput: () => innerRef.current?.focusInput(),
        attachFrame: (frame) => innerRef.current?.attachFrame(frame),
        beginTimelineFrameCapture: (frame) =>
          innerRef.current?.beginTimelineFrameCapture(frame),
        resolveTimelineFrameCapture: (frame) =>
          innerRef.current?.resolveTimelineFrameCapture(frame),
        failTimelineFrameCapture: (id) =>
          innerRef.current?.failTimelineFrameCapture(id),
      }),
      [],
    );

    // Chat consumes the current canvas selection as an automatic @ reference. Focusing the composer
    // or its picker must retain that selection, or the document outside-click handler removes its pill.
    return (
      <div
        data-block-selection-keep
        data-cap-keep
        className="bg-canvas flex h-full min-h-0 w-full min-w-0 flex-col"
      >
        {/* Header: title + history + new chat */}
        <div className="bg-panel text-ink-3 relative flex h-8 shrink-0 items-center gap-1.5 px-3 text-[12px]">
          <span className="truncate">{active?.title ?? t("chatGen.chat")}</span>
          <div className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              className="hover:bg-panel-2 hover:text-ink inline-flex h-6 w-6 items-center justify-center rounded"
              onClick={() => setHistOpen((v) => !v)}
              title={t("chatGen.conversationHistory")}
            >
              <History size={13} />
            </button>
            <button
              type="button"
              disabled={!active || active.messages.length === 0}
              className="hover:bg-panel-2 hover:text-ink inline-flex h-6 w-6 items-center justify-center rounded disabled:pointer-events-none disabled:opacity-30"
              onClick={newConversation}
              title={
                !active || active.messages.length === 0
                  ? t("chatGen.alreadyNewConversation")
                  : t("chatGen.newConversation")
              }
            >
              <MessageSquarePlus size={14} />
            </button>
            {onClose && (
              <button
                type="button"
                className="hover:bg-panel-2 hover:text-ink inline-flex h-6 w-6 items-center justify-center rounded"
                onClick={onClose}
                title={t("chatGen.closeChat")}
                aria-label={t("chatGen.closeChat")}
              >
                <X size={14} />
              </button>
            )}
          </div>
          {histOpen && (
            <div className="border-line bg-panel absolute right-2 top-full z-20 mt-1 max-h-[50vh] w-[260px] overflow-y-auto rounded-md border shadow-md">
              {threads.length === 0 ? (
                <div className="text-ink-4 px-3 py-3 text-center text-[12px]">
                  {t("chatGen.noPastConversationsYet")}
                </div>
              ) : (
                threads.map((th) => (
                  <button
                    key={th.id}
                    type="button"
                    onClick={() => {
                      setActiveId(th.id);
                      setHistOpen(false);
                    }}
                    className={`hover:bg-panel-2 flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] ${th.id === activeId ? "bg-panel-2" : ""}`}
                  >
                    <span className="text-ink truncate">
                      {th.title || t("chatGen.newConversation")}
                    </span>
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
          initialSkillId={active?.skillId ?? defaultSkillId}
          scenarioSkills={scenarioSkills}
          onOpenSkillMarket={customScenarioSkillManager?.openMarket}
          onRefreshScenarioSkills={
            customScenarioSkillManager ? refreshCustomScenarioSkills : undefined
          }
          onDeleteScenarioSkill={
            customScenarioSkillManager ? deleteScenarioSkill : undefined
          }
          frames={frames}
          onFrameApplied={onFrameApplied}
          runTool={runTool}
          getBody={getBody}
          elements={elements}
          getComp={getComp}
          timelineFramePickActive={timelineFramePickActive}
          timelineFramePickBusy={timelineFramePickBusy}
          timelineFramePickAvailable={timelineFramePickAvailable}
          onTimelineFramePickActiveChange={onTimelineFramePickActiveChange}
          onSnapshot={onSnapshot}
          handleRef={innerRef}
        />
      </div>
    );
  }),
);
