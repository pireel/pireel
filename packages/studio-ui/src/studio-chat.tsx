"use client";

import type { StudioAgentModelId } from '@pireel/studio-engine/agent-models';

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

import type { PlaybookSnapshot } from "@pireel/studio-engine/project-brand-metadata";
import type { HandoffItem } from '@pireel/studio-engine/editor-document/types';
import type { ConfirmAnswer } from '@pireel/studio-ui/confirm-list';
import type { GenerationIntent } from "@pireel/studio-ui/chat-generation-intent";
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
import type { LocalAssetIndexEntry } from "@pireel/studio-engine/project-dto";
import {
  STUDIO_AUTO_SKILL_ID,
  type StudioScenarioSkillId,
} from "@pireel/studio-engine/scenario-skills";
import { mid } from "@pireel/studio-ui/chat-format";
import { ChatThread } from "@pireel/studio-ui/chat-thread";
import {
  type StoredThread,
  firstUserText,
  normalizeStoredThreads,
  sanitizeRestored,
} from "@pireel/studio-ui/chat-thread-store";
import { t } from "@pireel/studio-ui/i18n";
import {
  useStudioShell,
  type StudioScenarioSkillOption,
} from "@pireel/studio-ui/shell-context";
import type { StudioElementRef } from "@pireel/studio-ui/chat-local-asset-mention";

export type { StudioElementRef } from "@pireel/studio-ui/chat-local-asset-mention";

/* ============================ Public types ============================ */

/** Updater for a streaming "progress" message (used by the "one-tap film" background flow to report). */
export interface ProgressHandle {
  step(text: string): void;
  finish(text: string): void;
  fail(text: string): void;
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
  coverContext?(outputId?: string): { request?: string; direction?: string; brandTreatment?: string };
  /** Select a skill and send a request under it (the AI Enhance switches). Dropped while streaming. */
  runSkill(skillId: string, text: string): void;
  /** Only fill a piece of text into the input without sending (used by the generate panel's "@reference" for assets). */
  insertText(text: string): void;
  /** Only focus the input (component floating bar's "AI edit" switches over to keep typing). */
  focusInput(): void;
  /** Insert a loading frame tag at the saved composer caret before capture starts. */
  beginTimelineFrameCapture(frame: PendingTimelineFrame): void;
  /** Promote the matching loading tag in place without moving or replacing earlier frame tags. */
  resolveTimelineFrameCapture(frame: AttachedTimelineFrame): void;
  /** Remove a failed loading tag. */
  failTimelineFrameCapture(id: string): void;
  /** Arm a generation intent in the composer (the generation entry point: one chat, one tool chain). */
  beginGeneration(intent: GenerationIntent, prompt?: string): void;
  /** Insert an @ mention pill into the draft (e.g. "use this asset as a reference"). */
  insertMention(el: StudioElementRef): void;
}

export interface StudioChatProps {
  coverScene?: import('@pireel/studio-ui/cover-scene').CoverScene | null;
  onOpenCover?: () => void;
  projectCover?: import('@pireel/studio-ui/project-cover').ProjectCover | null;
  onApplyCover?: (cover: import('@pireel/studio-ui/project-cover').ProjectCover) => Promise<void>;
  coverApplying?: boolean;
  /** Billing attribution: which project this chat edits (rides every charged request). */
  projectId?: string;
  /** Device-local asset index: lets search receipts resolve OPFS thumbnails for mine-scope hits. */
  localAssetIndex?: readonly LocalAssetIndexEntry[];
  /** Client-side tool executor: mutates Composition state / calls compose to generate blocks, returns a summary. */
  runTool: (
    toolId: string,
    input: Record<string, unknown>,
    opts?: { signal?: AbortSignal; surface?: "chat" | "bridge"; coverRequested?: boolean; skillId?: string; roughCut?: import("@pireel/studio-ui/first-pass").RoughCutExecution },
  ) => Promise<StudioToolResult>;
  /** Request-body fields read at send time (session-level frame / skill selection). */
  getBody: () => Record<string, unknown>;
  /** Currently @-mentionable elements. */
  elements: StudioElementRef[];
  /** Live composition accessor (stable identity, reads a ref): tool receipt cards preview blocks
   *  without linking chat re-renders to comp state. Optional — the preview strip hides without it. */
  getComp?: () => Composition;
  /** Read-only canonical timeline for source-anchored directing and final verification. */
  getDocument?: () => import('@pireel/studio-engine/composition').EditorDocumentV2;
  /** This project's chosen brand snapshot. Null or undefined means no brand; no account fallback. */
  projectBrand?: PlaybookSnapshot | null;
  /** The creator picks the project's brand in the chat; later edits follow it. */
  onProjectBrand?: (brand: PlaybookSnapshot | null) => void;
  /** The Studio Skill the project is edited as (undefined: never set — the thread's own pick applies),
   *  and how a pick in the chat is written back to the project. */
  projectSkillId?: string;
  projectAgentModel?: StudioAgentModelId;
  onProjectSkill?: (skillId: string) => void;
  /** A first message to send once on opening (a project made from the Studio home), and the call that
   *  marks it sent so it is never sent again. */
  startPrompt?: string | null;
  onStartPromptSent?: () => void;
  /** The project's clips per fine-cut skill now: a one-click edit's card counts what the agent adds
   *  after the rough cut. */
  fineCutClips?: () => import("@pireel/studio-ui/first-pass").EditingEvidence;
  /** The project has been edited (cut, captioned, anything placed): its brand is fixed and the editing
   *  skills become tag shortcuts for a message instead of switches. */
  projectEdited?: boolean;
  /** Editing skills switched on for this project, and how to change them (the row above the composer). */
  editingSkills?: readonly string[];
  onEditingSkills?: (ids: string[]) => void;
  /** The agent's confirm list and the creator's answers to it. */
  handoff?: HandoffItem[];
  onAnswerHandoff?: ConfirmAnswer;
  /** Output fps for surfaces that must convert v3 frames to seconds before execution (editorial assembly). */
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
  /** Streaming/tool-running state of the active thread (workbench pauses output switching while true). */
  onBusyChange?: (busy: boolean) => void;
  onSceneStateChange?: (state: import('@pireel/studio-ui/agent-startup').SceneAgentState) => void;
  /** Generation receipts: insert an output into the timeline at the playhead / mount audio. */
  onInsertMedia?: (asset: { type: 'image' | 'video'; url: string; label?: string }) => void;
  onUseAudio?: (url: string, label?: string) => void;
}

/* ============================ Multi-session shell ============================ */

/** memo: chat stays mounted (switching panels only hides it), so the workbench's high-frequency re-renders
 *  (box drag publishes frequently) must not re-render the whole message tree along with it. Precondition = the three
 *  props have stable identity (guaranteed on the workbench side: runTool via useStableCallbacks, getBody useCallback([]),
 *  elements memoized by content key). */
export const StudioChat = memo(
  forwardRef<StudioChatHandle, StudioChatProps>(function StudioChat(
    {
      projectId,
      projectCover,
      coverScene,
      onOpenCover,
      onApplyCover,
      coverApplying,
      localAssetIndex,
      runTool,
      getBody,
      elements,
      getComp,
      getDocument,
      startPrompt,
      onStartPromptSent,
      fineCutClips,
      projectEdited,
      projectBrand,
      onProjectBrand,
      projectSkillId,
      projectAgentModel,
      onProjectSkill,
      editingSkills,
      onEditingSkills,
      handoff,
      onAnswerHandoff,
      timelineFramePickActive = false,
      timelineFramePickBusy = false,
      timelineFramePickAvailable = false,
      onTimelineFramePickActiveChange,
      initialThreads,
      onThreadChange,
      onClose,
      onBusyChange,
      onSceneStateChange,

      onInsertMedia,

      onUseAudio,
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
        skillId: StudioScenarioSkillId,
        agentModel?: StudioAgentModelId,
      ) => {
        if (messages.length === 0 && agentModel === undefined) return;
        const title =
          firstUserText(messages).slice(0, 24) || t("chatGen.newConversation");
        const next: StoredThread = {
          id: activeId,
          title,
          messages,
          updatedAt: Math.max(Date.now(), (threadsRef.current.find(thread => thread.id === activeId)?.updatedAt ?? 0) + 1),
          skillId,
          agentModel,
        };
        const merged = [
          next,
          ...threadsRef.current.filter((t) => t.id !== activeId),
        ];
        threadsRef.current = merged;
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
        coverContext: outputId => innerRef.current?.coverContext?.(outputId) ?? {},
        runSkill: (skillId, text) => innerRef.current?.runSkill(skillId, text),
        insertText: (text) => innerRef.current?.insertText(text),
        focusInput: () => innerRef.current?.focusInput(),
        beginTimelineFrameCapture: (frame) =>
          innerRef.current?.beginTimelineFrameCapture(frame),
        resolveTimelineFrameCapture: (frame) =>
          innerRef.current?.resolveTimelineFrameCapture(frame),
        failTimelineFrameCapture: (id) =>
          innerRef.current?.failTimelineFrameCapture(id),
        beginGeneration: (intent, prompt) => innerRef.current?.beginGeneration(intent, prompt),
        insertMention: (el) => innerRef.current?.insertMention(el),
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
                    className={`hover:bg-panel-2/20 flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] ${th.id === activeId ? "bg-panel-2/35" : ""}`}
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
          projectId={projectId}
          projectCover={projectCover}
          coverScene={coverScene}
          onOpenCover={onOpenCover}
          onApplyCover={onApplyCover}
          coverApplying={coverApplying}
          localAssetIndex={localAssetIndex}
          threadId={activeId}
          initialMessages={restoredMessages}
          initialSkillId={active?.skillId ?? defaultSkillId}
          initialAgentModel={active?.agentModel ?? projectAgentModel}
          scenarioSkills={scenarioSkills}
          onOpenSkillMarket={customScenarioSkillManager?.openMarket}
          onRefreshScenarioSkills={
            customScenarioSkillManager ? refreshCustomScenarioSkills : undefined
          }
          onDeleteScenarioSkill={
            customScenarioSkillManager ? deleteScenarioSkill : undefined
          }
          runTool={runTool}
          getBody={getBody}
          elements={elements}
          getComp={getComp}
          getDocument={getDocument}
          startPrompt={startPrompt}
          onStartPromptSent={onStartPromptSent}
          fineCutClips={fineCutClips}
          projectEdited={projectEdited}
          projectBrand={projectBrand}
          onProjectBrand={onProjectBrand}
          projectSkillId={projectSkillId}
          onProjectSkill={onProjectSkill}
          editingSkills={editingSkills}
          onEditingSkills={onEditingSkills}
          handoff={handoff}
          onAnswerHandoff={onAnswerHandoff}
          timelineFramePickActive={timelineFramePickActive}
          timelineFramePickBusy={timelineFramePickBusy}
          timelineFramePickAvailable={timelineFramePickAvailable}
          onTimelineFramePickActiveChange={onTimelineFramePickActiveChange}
          onSnapshot={onSnapshot}
          onBusyChange={onBusyChange}
          onSceneStateChange={onSceneStateChange}
          onInsertMedia={onInsertMedia}
          onUseAudio={onUseAudio}
          handleRef={innerRef}
        />
      </div>
    );
  }),
);
