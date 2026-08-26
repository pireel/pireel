"use client";

/** Single-thread studio chat (useChat): stream rendering, client-side tool execution, persistence snapshots. */

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { X } from "lucide-react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@pireel/ui/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@pireel/ui/ai-elements/message";
import {
  type ChatSituation,
  buildSituation,
} from "@pireel/studio-engine/prompts";
import {
  STUDIO_AUTO_SKILL_ID,
  type StudioScenarioSkillId,
} from "@pireel/studio-engine/scenario-skills";
import { studioProviders } from "@pireel/studio-engine/providers";
import type { FrameCatalogItem } from "./use-frame-catalog";
import {
  mid,
  PiAvatar,
  ThinkingDots,
  renderTextWithElementPills,
} from "./chat-format";
import {
  renderToolPart,
  renderToolPartGroup,
  toolStatus,
  type ToolPartLike,
} from "./chat-tool-parts";
import { Composer, type ComposerHandle } from "./chat-composer";
import {
  assistantHasOpenOrInterruptedInteraction,
  assistantMessageHasRenderableOutput,
  isRecoverableStudioChatError,
} from "./chat-thread-store";
import { scopeSituationToThread } from "./chat-thread-context";
import { studioLocale, t } from "./i18n";
import type { StudioScenarioSkillOption } from "./shell-context";
import { localAssetMentionContext } from "./chat-local-asset-mention";
import { inspectTimelineFrameEvidence } from "./chat-timeline-frame-evidence";
import type {
  AttachedFrame,
  ProgressHandle,
  StudioChatDraftPart,
  StudioChatHandle,
  StudioChatProps,
  StudioElementRef,
} from "./studio-chat";

export function ChatThread({
  threadId,
  initialMessages,
  initialFrame,
  initialSkillId,
  scenarioSkills,
  onImportScenarioSkill,
  onDeleteScenarioSkill,
  frames,
  onFrameApplied,
  runTool,
  getBody,
  getComp,
  timelineFramePickActive,
  timelineFramePickBusy,
  timelineFramePickAvailable,
  onTimelineFramePickActiveChange,
  elements,
  onSnapshot,
  handleRef,
}: {
  threadId: string;
  initialMessages: UIMessage[];
  initialFrame: AttachedFrame | null;
  initialSkillId: StudioScenarioSkillId;
  scenarioSkills: readonly StudioScenarioSkillOption[];
  onImportScenarioSkill?: (file: File) => Promise<StudioScenarioSkillOption>;
  onDeleteScenarioSkill?: (id: string) => Promise<void>;
  frames: FrameCatalogItem[];
  onFrameApplied?: (frame: AttachedFrame | null) => void;
  runTool: StudioChatProps["runTool"];
  getBody: StudioChatProps["getBody"];
  getComp?: StudioChatProps["getComp"];
  timelineFramePickActive: boolean;
  timelineFramePickBusy: boolean;
  timelineFramePickAvailable: boolean;
  onTimelineFramePickActiveChange?: StudioChatProps["onTimelineFramePickActiveChange"];
  elements: StudioElementRef[];
  onSnapshot: (
    messages: UIMessage[],
    frame: AttachedFrame | null,
    skillId: StudioScenarioSkillId,
  ) => void;
  handleRef: React.MutableRefObject<StudioChatHandle | null>;
}) {
  const runToolRef = useRef(runTool);
  runToolRef.current = runTool;
  // Stop plumbing: aborting the stream alone isn't enough — the stream loop awaits onToolCall, so a
  // running tool must be told to stand down too. The user-stopped flag keeps the continuation
  // safety net from resurrecting a turn the user just killed.
  const toolAbortRef = useRef<AbortController | null>(null);
  const userStoppedRef = useRef(false);
  const autoRecoveryAttemptedRef = useRef(false);
  const timelineFrameInspectionRef = useRef<AbortController | null>(null);
  const [timelineFrameInspectionError, setTimelineFrameInspectionError] = useState(false);
  useEffect(() => () => timelineFrameInspectionRef.current?.abort(), []);
  const getBodyRef = useRef(getBody);
  getBodyRef.current = getBody;
  const composerRef = useRef<ComposerHandle | null>(null);

  // Frame attached to the session: input theme button highlights, every request carries frameId along (server injects the playbook)
  const [frame, setFrame] = useState<AttachedFrame | null>(initialFrame);
  const frameRef = useRef(frame);
  frameRef.current = frame;
  const [skillId, setSkillId] = useState<StudioScenarioSkillId>(initialSkillId);
  const [activeStarterId, setActiveStarterId] = useState<string | null>(null);
  const skillRef = useRef(skillId);
  skillRef.current = skillId;
  const onFrameAppliedRef = useRef(onFrameApplied);
  onFrameAppliedRef.current = onFrameApplied;
  /** Attach a frame (shared by panel/theme button): besides session state, also notifies the workbench to apply the theme palette to comp. */
  const applyFrame = useCallback((f: AttachedFrame | null) => {
    setFrame(f);
    onFrameAppliedRef.current?.(f);
  }, []);

  // body carries session-level frameId + skillId; the situation snapshot is attached to metadata.situation at send time (persists with the session,
  // the route materializes it into a <composition_state> part) — stable history bytes are what let the prompt cache hit
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: studioProviders().chatEndpoint ?? "/api/studio/chat",
        body: () => ({
          locale: studioLocale().toLowerCase().startsWith("zh") ? "zh" : "en",
          ...(frameRef.current ? { frameId: frameRef.current.id } : {}),
          ...(frameRef.current?.customVisualStyle
            ? { customVisualStyle: frameRef.current.customVisualStyle }
            : {}),
          ...(skillRef.current !== STUDIO_AUTO_SKILL_ID
            ? { skillId: skillRef.current }
            : {}),
        }),
      }),
    [],
  );

  const {
    messages,
    sendMessage,
    status,
    stop,
    setMessages,
    addToolOutput,
    error,
  } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    // Gate the SDK's OWN continuation triggers on the user-stopped flag too: after a stop, the tool
    // receipt lands via a queued addToolOutput job that often runs AFTER the stream has unwound to
    // 'ready' — the SDK's internal check then fires a fresh request and the turn the user just
    // killed marches on. sendAutomaticallyWhen is consulted by every trigger, so this gates them all.
    sendAutomaticallyWhen: (args) =>
      !userStoppedRef.current &&
      lastAssistantMessageIsCompleteWithToolCalls(args),
    async onToolCall({ toolCall }) {
      const id = toolCall.toolName;
      // Fresh controller per tool run: the stop button aborts it so long tools can stand down at
      // their safe boundaries instead of holding the turn hostage until they finish
      const ctrl = new AbortController();
      toolAbortRef.current = ctrl;
      try {
        const out = await runToolRef.current(
          id,
          (toolCall.input ?? {}) as Record<string, unknown>,
          { signal: ctrl.signal, surface: "chat" },
        );
        if (out.ok)
          addToolOutput({
            tool: id,
            toolCallId: toolCall.toolCallId,
            output: out,
          });
        else
          addToolOutput({
            tool: id,
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText: out.error ?? t("chatGen.executionFailed"),
          });
      } catch (e) {
        const isStop = e instanceof DOMException && e.name === "AbortError";
        addToolOutput({
          tool: id,
          toolCallId: toolCall.toolCallId,
          state: "output-error",
          errorText: isStop
            ? e.message || t("chatGen.stopped")
            : e instanceof Error
              ? e.message
              : String(e),
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
    if (status === "ready" || status === "error")
      onSnapshot(messagesRef.current, frameRef.current, skillRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
  const busy = status === "streaming" || status === "submitted";
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
  const autoResumedRef = useRef("");
  const resumeArmedRef = useRef(false);
  useEffect(() => {
    if (!resumeArmedRef.current) {
      resumeArmedRef.current = true;
      return;
    }
    if (status !== "ready") return;
    const timer = setTimeout(() => {
      if (statusRef.current !== "ready") return; // the SDK sent its own follow-up meanwhile
      if (userStoppedRef.current) return; // the user killed this turn — don't resurrect it
      const msgs = messagesRef.current;
      const last = msgs[msgs.length - 1];
      if (!last || last.role !== "assistant") return;
      if (!lastAssistantMessageIsCompleteWithToolCalls({ messages: msgs }))
        return;
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
    const t = setInterval(
      () => onSnapshot(messagesRef.current, frameRef.current, skillRef.current),
      2000,
    );
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
      // A conversation switch unmounts this component. Stopping only the model stream
      // leaves the client-side tool alive, so a slow generator can mutate the timeline
      // after the user has moved to a new chat or cleared the cut.
      userStoppedRef.current = true;
      toolAbortRef.current?.abort();
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
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  // Attaching/detaching a frame also persists (only if there are messages; an empty session shouldn't enter history)
  useEffect(() => {
    if (messagesRef.current.length > 0)
      onSnapshot(messagesRef.current, frame, skillRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame]);

  // Skill is session state like the attached frame: changing it affects future turns and survives history switching.
  useEffect(() => {
    if (messagesRef.current.length > 0)
      onSnapshot(messagesRef.current, frameRef.current, skillId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillId]);

  const run = useCallback(
    async (
      draft: string | StudioChatDraftPart[],
      options: { preserveAutoRecoveryAttempt?: boolean } = {},
    ): Promise<boolean> => {
      const draftParts: StudioChatDraftPart[] =
        typeof draft === "string"
          ? [{ type: "text", text: draft.trim() }]
          : draft;
      const hasContent = draftParts.some(
        (part) => part.type === "timeline-frame" || part.text.trim().length > 0,
      );
      if (!hasContent || status === "streaming" || status === "submitted")
        return false;
      if (!options.preserveAutoRecoveryAttempt)
        autoRecoveryAttemptedRef.current = false;
      userStoppedRef.current = false; // a new message re-arms the continuation safety net
      // Snapshot the current situation at send time: only the latest one represents reality (situations in old messages are history, identity accounts for it)
      const attachedTimelineFrames = draftParts
        .filter(
          (
            part,
          ): part is Extract<StudioChatDraftPart, { type: "timeline-frame" }> =>
            part.type === "timeline-frame",
        )
        .map(({ frame }) => frame);
      let timelineFrames: Awaited<ReturnType<typeof inspectTimelineFrameEvidence>> = [];
      if (attachedTimelineFrames.length) {
        const ctrl = new AbortController();
        timelineFrameInspectionRef.current = ctrl;
        setTimelineFrameInspectionError(false);
        try {
          timelineFrames = await inspectTimelineFrameEvidence(attachedTimelineFrames, { signal: ctrl.signal });
        } catch (error) {
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            setTimelineFrameInspectionError(true);
          }
          return false;
        } finally {
          if (timelineFrameInspectionRef.current === ctrl) timelineFrameInspectionRef.current = null;
        }
      }
      const localAssetContext = localAssetMentionContext(
        draftParts.flatMap((part) => (part.type === "text" ? [part.text] : [])),
        elements,
      );
      const previousMessages = messagesRef.current;
      const situation = scopeSituationToThread(
        getBodyRef.current() as ChatSituation,
        previousMessages,
      );
      const metadata = {
        situation: [
          buildSituation(situation, {
            freshConversation: !previousMessages.some(
              (message) => message.role === "user",
            ),
          }),
          localAssetContext,
        ]
          .filter(Boolean)
          .join("\n"),
        ...(timelineFrames.length ? { timelineFrames } : {}),
      };
      void sendMessage({
        metadata,
        parts: draftParts.map((part) =>
          part.type === "text"
            ? { type: "text" as const, text: part.text }
            : {
                type: "file" as const,
                mediaType: "image/jpeg",
                filename: `pireel-frame-${part.frame.id}-${part.frame.atSec.toFixed(3)}s.jpg`,
                url: part.frame.dataUrl,
              },
        ),
      });
      return true;
    },
    [elements, sendMessage, status],
  );

  // A failed stream may already have committed tools. Re-generating the old assistant message
  // erases its receipts while keeping the client-side call counter, so the apparent retry can
  // duplicate edits or immediately hit the old turn's ceiling. Resume as a NEW user turn instead:
  // that gives the server a fresh composition snapshot and resets both execution counters.
  const continueFromCurrentState = useCallback(
    () => run(t("chatGen.continueAfterInterruptionPrompt")),
    [run],
  );

  // Client-side tools may already have committed durable edits before a provider/network stream
  // drops. Retry exactly once as a NEW user turn against the current project snapshot; never replay
  // the failed assistant request, and never recover validation/billing/auth failures or a user stop.
  useEffect(() => {
    if (
      status !== "error" ||
      !error ||
      userStoppedRef.current ||
      autoRecoveryAttemptedRef.current ||
      !isRecoverableStudioChatError(error) ||
      assistantHasOpenOrInterruptedInteraction(
        messagesRef.current[messagesRef.current.length - 1],
      )
    ) return;
    const timer = setTimeout(() => {
      if (
        statusRef.current !== "error" ||
        userStoppedRef.current ||
        autoRecoveryAttemptedRef.current ||
        assistantHasOpenOrInterruptedInteraction(
          messagesRef.current[messagesRef.current.length - 1],
        )
      ) return;
      autoRecoveryAttemptedRef.current = true;
      run(t("chatGen.continueAfterInterruptionPrompt"), {
        preserveAutoRecoveryAttempt: true,
      });
    }, 650);
    return () => clearTimeout(timer);
  }, [error, run, status]);

  // Stop = abort the running tool (it stands down at its next safe boundary) + kill the stream.
  // Order matters: flag first so neither the SDK tail check nor our safety net restarts the turn.
  const handleStop = useCallback(() => {
    userStoppedRef.current = true;
    timelineFrameInspectionRef.current?.abort();
    toolAbortRef.current?.abort();
    void stop();
  }, [stop]);

  // Quick prompts: fill into the composer instead of sending directly (user can reword / add @ references before sending)
  const fillComposer = useCallback((text: string) => {
    composerRef.current?.setText(text);
  }, []);

  const starterGroups = useMemo(
    () =>
      scenarioSkills
        .map((skill) => ({
          skill,
          starters: skill.starters ?? [],
        }))
        .filter((group) => group.starters.length > 0),
    [scenarioSkills],
  );

  const pickStarter = useCallback(
    (nextSkillId: StudioScenarioSkillId, starterId: string, prompt: string) => {
      setSkillId(nextSkillId);
      setActiveStarterId(`${nextSkillId}:${starterId}`);
      fillComposer(prompt);
    },
    [fillComposer],
  );

  const pickSkill = useCallback((nextSkillId: StudioScenarioSkillId) => {
    setSkillId(nextSkillId);
    setActiveStarterId(null);
  }, []);

  // Expose "one-tap film" progress + selected pill to the workbench.
  useImperativeHandle(
    handleRef,
    () => ({
      startProgress(): ProgressHandle {
        const id = mid("prog");
        const paint = (text: string) =>
          setMessages((s) => {
            const exists = s.some((m) => m.id === id);
            const msg: UIMessage = {
              id,
              role: "assistant",
              parts: [{ type: "text", text }],
            };
            return exists ? s.map((m) => (m.id === id ? msg : m)) : [...s, msg];
          });
        const lines: string[] = [];
        paint(" ");
        return {
          step(text) {
            const done = lines.map((l) => `✓ ${l}`).join("\n");
            lines.push(text);
            paint((done ? `${done}\n` : "") + `${text} …`);
          },
          finish(text) {
            paint(`${lines.map((l) => `✓ ${l}`).join("\n")}\n\n${text}`);
          },
          fail(text) {
            const body = lines
              .map((l, i) => (i < lines.length - 1 ? `✓ ${l}` : `✗ ${l}`))
              .join("\n");
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
      beginTimelineFrameCapture(s) {
        composerRef.current?.beginTimelineFrameCapture(s);
      },
      resolveTimelineFrameCapture(s) {
        composerRef.current?.resolveTimelineFrameCapture(s);
      },
      failTimelineFrameCapture(id) {
        composerRef.current?.failTimelineFrameCapture(id);
      },
    }),
    [applyFrame, setMessages, run],
  );

  const empty = messages.length === 0;

  return (
    <>
      {/* Slide animation for the indeterminate progress bar (used by tool cards) */}
      <style>
        {
          '@keyframes hf-indet{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}@media (prefers-reduced-motion: reduce){[style*="hf-indet"]{animation:none !important}}'
        }
      </style>
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="gap-5 p-3">
          {empty ? (
            <div className="flex min-h-full flex-col items-center justify-center gap-4 py-3">
              <ConversationEmptyState
                icon={<PiAvatar size={44} />}
                title={t("chatGen.greeting")}
                description={t("chatGen.emptyStateIntro")}
              />
              {starterGroups.length > 0 ? (
                <div className="flex w-full max-w-[430px] flex-col gap-3 px-2">
                  {starterGroups.map(({ skill, starters }) => (
                    <section key={skill.id} className="min-w-0">
                      <h3 className="text-ink-3 mb-1.5 px-1 text-[11px] font-medium">
                        {skill.title}
                      </h3>
                      <div className="grid grid-cols-2 gap-1.5">
                        {starters.map((starter) => {
                          const active =
                            activeStarterId === `${skill.id}:${starter.id}`;
                          return (
                            <button
                              key={starter.id}
                              type="button"
                              aria-pressed={active}
                              onClick={() =>
                                pickStarter(skill.id, starter.id, starter.prompt)
                              }
                              className={`group min-w-0 rounded-xl p-1 text-left transition-colors ${
                                active
                                  ? "bg-panel-2"
                                  : "hover:bg-panel-2/70"
                              }`}
                            >
                              <span
                                className={`relative block aspect-[3/2] overflow-hidden rounded-lg bg-panel-2 ${
                                  active ? "ring-1 ring-inset ring-white/45" : ""
                                }`}
                              >
                                <img
                                  src={starter.imageUrl}
                                  alt=""
                                  draggable={false}
                                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.025]"
                                />
                              </span>
                              <span className="text-ink block truncate px-1 pb-0.5 pt-1.5 text-[12px] font-medium">
                                {starter.title}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="flex max-w-full flex-wrap items-center justify-center gap-2 px-3">
                  <button
                    type="button"
                    onClick={() => fillComposer(t("chatGen.cutShotsFirst"))}
                    className="border-line bg-panel hover:bg-panel-2 rounded-full border px-3 py-1.5 text-[12px]"
                  >
                    {t("chatGen.cutShotsFirst")}
                  </button>
                  <button
                    type="button"
                    onClick={() => fillComposer(t("chatGen.transcribeToEdit"))}
                    className="border-line bg-panel hover:bg-panel-2 rounded-full border px-3 py-1.5 text-[12px]"
                  >
                    {t("chatGen.transcribeToEdit")}
                  </button>
                </div>
              )}
            </div>
          ) : (
            messages.map((m, mi) => {
              const parts = (m.parts ?? []) as ToolPartLike[];
              // Collapse consecutive track_export polls (only step-starts between them): render just
              // the last of each run — a polling agent otherwise buries the conversation in a column
              // of identical progress badges. Polls separated by real text keep rendering.
              const collapsed = new Set<number>();
              for (let i = 0; i < parts.length; i++) {
                if (parts[i]!.type !== "tool-track_export") continue;
                let j = i + 1;
                while (j < parts.length && parts[j]!.type === "step-start") j++;
                if (j < parts.length && parts[j]!.type === "tool-track_export")
                  collapsed.add(i);
              }
              // Older runs (and a model ignoring the new vectorized schema) can emit one precise-
              // framing call per shot. Adjacent calls separated only by SDK step markers become one
              // visual receipt; message history/tool outputs remain untouched.
              const framingGroups = new Map<number, ToolPartLike[]>();
              const isFraming = (part: ToolPartLike) =>
                part.type === "tool-set_shot_framing" ||
                (part.type === "dynamic-tool" &&
                  part.toolName === "set_shot_framing");
              for (let i = 0; i < parts.length; i++) {
                if (collapsed.has(i) || !isFraming(parts[i]!)) continue;
                const grouped = [parts[i]!];
                const groupedIndexes: number[] = [];
                let cursor = i + 1;
                while (cursor < parts.length) {
                  while (
                    cursor < parts.length &&
                    parts[cursor]!.type === "step-start"
                  )
                    cursor++;
                  if (cursor >= parts.length || !isFraming(parts[cursor]!))
                    break;
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
              const busy = status === "submitted" || status === "streaming";
              const isLast = mi === messages.length - 1;
              const vis = parts.filter((p) => p.type !== "step-start");
              const lastPart = vis[vis.length - 1];
              const lastToolRunning =
                !!lastPart &&
                (lastPart.type.startsWith("tool-") ||
                  lastPart.type === "dynamic-tool") &&
                toolStatus(lastPart).kind === "running";
              const lastTextLive =
                !!lastPart &&
                lastPart.type === "text" &&
                !!(lastPart as { text?: string }).text;
              // Reasoning parts are hidden (leaked-internals feel) — a streaming reasoning phase must
              // therefore SHOW the dots, or the model looks dead while it thinks.
              const thinking =
                m.role === "assistant" &&
                isLast &&
                busy &&
                !lastToolRunning &&
                !lastTextLive;
              const emptyCompletedAssistant =
                m.role === "assistant" &&
                isLast &&
                status === "ready" &&
                !assistantMessageHasRenderableOutput(m);
              return (
                <Message key={m.id} from={m.role}>
                  <div className="flex items-start gap-2">
                    {m.role === "assistant" && <PiAvatar thinking={thinking} />}
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      {parts.map((part, idx) => {
                        const key = `${m.id}-${idx}`;
                        if (part.type === "step-start") return null;
                        if (collapsed.has(idx)) return null;
                        if (part.type === "text") {
                          const text = (part as { text?: string }).text ?? "";
                          if (!text) return null;
                          return m.role === "user" ? (
                            <MessageContent key={key}>
                              <div className="text-[13px] leading-relaxed">
                                {renderTextWithElementPills(text, elements)}
                              </div>
                            </MessageContent>
                          ) : (
                            <MessageContent key={key}>
                              <MessageResponse className="text-[13px] leading-relaxed">
                                {text}
                              </MessageResponse>
                            </MessageContent>
                          );
                        }
                        if (part.type === "file") {
                          const file = part as {
                            mediaType?: string;
                            url?: string;
                          };
                          if (
                            !file.mediaType?.startsWith("image/") ||
                            !file.url
                          )
                            return null;
                          const fileIndex =
                            parts
                              .slice(0, idx + 1)
                              .filter((candidate) => candidate.type === "file")
                              .length - 1;
                          const timelineFrame = (
                            m.metadata as
                              | { timelineFrames?: Array<{ atSec?: number }> }
                              | undefined
                          )?.timelineFrames?.[fileIndex];
                          return (
                            <MessageContent
                              key={key}
                              className="overflow-hidden p-0"
                            >
                              <figure className="bg-canvas relative w-[180px] max-w-full overflow-hidden rounded-md">
                                <img
                                  src={file.url}
                                  alt=""
                                  className="block max-h-[180px] w-full object-contain"
                                />
                                {typeof timelineFrame?.atSec === "number" && (
                                  <figcaption className="absolute bottom-1.5 left-1.5 rounded-sm bg-black/70 px-1.5 py-0.5 font-mono text-[9px] leading-none text-white backdrop-blur">
                                    {timelineFrame.atSec.toFixed(2)}s
                                  </figcaption>
                                )}
                              </figure>
                            </MessageContent>
                          );
                        }
                        // Reasoning parts are NOT rendered (user decision: no thinking process in the
                        // chat, it reads as leaked internals). The thinking phase still shows activity
                        // via the ThinkingDots below — live reasoning counts as "thinking", not output.
                        if (part.type === "reasoning") return null;
                        if (
                          part.type.startsWith("tool-") ||
                          part.type === "dynamic-tool"
                        )
                          // Locate rides the existing seek tool (playhead + preview follow) — no new channel to the workbench
                          return framingGroups.has(idx)
                            ? renderToolPartGroup(
                                framingGroups.get(idx)!,
                                key,
                                {
                                  onLocate: (sec) =>
                                    void runToolRef.current("seek", {
                                      toSec: sec,
                                    }),
                                  getComp,
                                },
                              )
                            : renderToolPart(part, key, {
                                onLocate: (sec) =>
                                  void runToolRef.current("seek", {
                                    toSec: sec,
                                  }),
                                getComp,
                              });
                        return null;
                      })}
                      {thinking && <ThinkingDots />}
                      {emptyCompletedAssistant && (
                        <div className="border-line bg-panel-2 flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12px]">
                          <X size={12} className="shrink-0 text-destructive" />
                          <span className="min-w-0 flex-1 text-destructive">
                            {t("chatGen.requestFailed")}
                          </span>
                          <button
                            type="button"
                            onClick={continueFromCurrentState}
                            className="text-ink-2 hover:bg-line hover:text-ink shrink-0 rounded px-1.5 py-0.5 font-medium"
                          >
                            {t("chatGen.continueFromCurrentState")}
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
          {(status === "submitted" || status === "streaming") &&
            messages[messages.length - 1]?.role === "user" && (
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
                {error.message?.includes("insufficient_tokens")
                  ? t("chatGen.notEnoughCreditsTop")
                  : t("chatGen.interruptedStatePreserved")}
              </span>
              {!error.message?.includes("insufficient_tokens") && (
                <button
                  type="button"
                  onClick={continueFromCurrentState}
                  className="text-ink-2 hover:bg-line hover:text-ink shrink-0 rounded px-1.5 py-0.5 font-medium"
                >
                  {t("chatGen.continueFromCurrentState")}
                </button>
              )}
            </div>
          )}
          {timelineFrameInspectionError && status !== "error" && (
            <div className="border-destructive/30 bg-destructive/5 text-ink-2 mx-3 mb-2 flex items-center gap-2 rounded-md border px-2.5 py-2 text-[11px]">
              <X size={12} className="shrink-0 text-destructive" />
              <span className="min-w-0 flex-1 truncate text-destructive">
                {t("chatGen.timelineFrameInspectionFailed")}
              </span>
            </div>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="p-2.5 pt-1">
        <Composer
          placeholder={t("chatGen.sayWhatAddChange")}
          status={status}
          elements={elements}
          skillId={skillId}
          scenarioSkills={scenarioSkills}
          onImportScenarioSkill={onImportScenarioSkill}
          onDeleteScenarioSkill={onDeleteScenarioSkill}
          onPickSkill={pickSkill}
          frame={frame}
          frames={frames}
          timelineFramePickActive={timelineFramePickActive}
          timelineFramePickBusy={timelineFramePickBusy}
          timelineFramePickAvailable={timelineFramePickAvailable}
          onTimelineFramePickActiveChange={onTimelineFramePickActiveChange}
          onPickFrame={applyFrame}
          onSubmit={run}
          onStop={handleStop}
          methodsRef={composerRef}
        />
      </div>
    </>
  );
}
