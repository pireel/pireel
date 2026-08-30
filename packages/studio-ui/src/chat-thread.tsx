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
import { ChevronRight, Info, X } from "lucide-react";
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
import {
  STUDIO_CREATE_SKILL_ACTION,
  latestStudioMetaAction,
} from "@pireel/studio-engine/skill-actions";
import { audioClipWindow } from "@pireel/studio-engine/composition";
import type { FrameCatalogItem } from "./use-frame-catalog";
import {
  CHAT_ACTION_PILL_CLASS,
  CHAT_PILL_ICON_CLASS,
  CHAT_PILL_LABEL_CLASS,
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
  assistantEditorialCapacityShortfall,
  assistantHasOpenOrInterruptedInteraction,
  assistantMessageHasRenderableOutput,
  assistantMessageSuggestsContinuation,
  assistantWorkDurationMs,
  assistantWorkFold,
  canRunEditorialAnalysis,
  canRunVisualReview,
  compactStudioChatMessages,
  compactStudioChatMessagesForModel,
  createStudioTurnLedger,
  editorialPlacementIssue,
  effectiveStudioTurnMessages,
  hasCompletedEditorialPlacement,
  hasPostAssemblyTimelineSnapshot,
  isRecoverableStudioChatError,
  narrationDurationFromMessages,
  prepareEditorialPlacement,
  recordStudioTurnToolResult,
  reserveStudioTurnToolCall,
  shouldBlockStudioTurnUndo,
  stampLatestAssistantWorkDuration,
} from "./chat-thread-store";
import { scopeSituationToThread } from "./chat-thread-context";
import { studioLocale, t } from "./i18n";
import type { StudioScenarioSkillOption } from "./shell-context";
import { localAssetMentionContext } from "./chat-local-asset-mention";
import { inspectTimelineFrameEvidence } from "./chat-timeline-frame-evidence";
import { DeferredActivation } from "./deferred-activation";
import { studioToolCanMutate, studioToolResultStopsAgentTurn } from "./agent-tool-runner";
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
  onOpenSkillMarket,
  onRefreshScenarioSkills,
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
  onOpenSkillMarket?: () => void;
  onRefreshScenarioSkills?: () => Promise<void>;
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
  const visualReviewCountRef = useRef(0);
  const editorialAnalysisCountRef = useRef(0);
  const interactionWaitDurationRef = useRef(0);
  const autoRecoveryAttemptedRef = useRef(false);
  const turnLedgerRef = useRef(createStudioTurnLedger());
  const finalOnlyRef = useRef(false);
  const timelineFrameInspectionRef = useRef<AbortController | null>(null);
  const [timelineFrameInspectionError, setTimelineFrameInspectionError] = useState(false);
  // Completed work stays visible by default. The arrow is an explicit user collapse, not an
  // automatic replacement of the whole turn with an empty-looking summary row.
  const [collapsedWorkMessages, setCollapsedWorkMessages] = useState<Set<string>>(() => new Set());
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
          ...(finalOnlyRef.current ? { finalOnly: true } : {}),
        }),
        prepareSendMessagesRequest: ({
          body,
          id,
          messageId,
          messages: requestMessages,
          trigger,
        }) => ({
          body: {
            ...body,
            id,
            messageId,
            messages: compactStudioChatMessagesForModel(requestMessages),
            trigger,
          },
        }),
      }),
    [],
  );

  const messagesRef = useRef<UIMessage[]>(initialMessages);

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
      const requestedInput = (toolCall.input ?? {}) as Record<string, unknown>;
      const ledger = turnLedgerRef.current;
      const canMutate = studioToolCanMutate(id);
      const publishSuccess = (output: Record<string, unknown>) => {
        const recorded = recordStudioTurnToolResult(ledger, {
          toolId: id,
          toolCallId: toolCall.toolCallId,
          input: requestedInput,
          output,
          canMutate,
        });
        let reported = output;
        if (recorded.timelineUnchanged) {
          reported = {
            ok: true,
            summary: studioLocale().toLowerCase().startsWith("zh")
              ? "时间线和上次读取完全一致。不要再调用 get_timeline——立即执行下一步编辑，或给出最终回复"
              : "The timeline is exactly as your last read reported. Do not call get_timeline again — take the next editing action or write the final reply.",
            data: {
              unchanged: true,
              instruction: "The preceding timeline snapshot is still authoritative. Do NOT call get_timeline again this turn: your next call MUST be an editing tool, or you must write the final user-facing reply. Repeated reads end this turn's tool budget.",
            },
          };
          const lastReceipt = ledger.receipts.at(-1) as { output?: unknown } | undefined;
          if (lastReceipt) lastReceipt.output = reported;
        }
        addToolOutput({ tool: id, toolCallId: toolCall.toolCallId, output: reported });
        return recorded;
      };
      const publishError = (errorText: string) => {
        const recorded = recordStudioTurnToolResult(ledger, {
          toolId: id,
          toolCallId: toolCall.toolCallId,
          input: requestedInput,
          errorText,
          canMutate,
        });
        // A verbatim retry of a failed call fails identically forever; say so on the receipt the
        // moment the repetition starts instead of letting the streak burn the turn budget.
        if (recorded.repeatedFailureCount >= 2) {
          errorText += studioLocale().toLowerCase().startsWith("zh")
            ? `（完全相同的调用已连续失败 ${recorded.repeatedFailureCount} 次，重试不会成功：改用回执里的真实 id 与参数，或放弃该操作直接收尾。）`
            : ` (This identical call has now failed ${recorded.repeatedFailureCount} times in a row; retrying cannot succeed. Use the real ids and parameters from receipts, or drop this operation and finish.)`;
        }
        addToolOutput({
          tool: id,
          toolCallId: toolCall.toolCallId,
          state: "output-error",
          errorText,
        });
      };
      const reservation = reserveStudioTurnToolCall(ledger);
      finalOnlyRef.current = reservation.forceFinalResponse;
      if (!reservation.allowed) {
        publishSuccess({
          ok: true,
          skipped: true,
          summary: studioLocale().toLowerCase().startsWith("zh")
            ? "本轮处理次数已达上限，正在收尾"
            : "This turn reached its processing limit and is finishing now.",
          data: { reason: "turn-tool-limit", instruction: "Do not call more tools. Summarize the authoritative current state." },
        });
        return;
      }
      const effectiveMessages = effectiveStudioTurnMessages(messagesRef.current, ledger);
      const comp = getComp?.();
      const placedNarrationEndSec = comp?.audioTracks
        ?.filter((clip) => clip.role === "narration" && !clip.muted)
        .reduce((latest, clip) => Math.max(latest, audioClipWindow(clip, 0).end), 0) ?? 0;
      // Placed narration is authoritative; when it is absent (not yet placed, or rolled back) the
      // measured duration of the narration audio produced this session keeps deterministic
      // assembly engaged instead of silently degrading to freehand placement at target=0.
      const narrationEndSec = placedNarrationEndSec > 0
        ? placedNarrationEndSec
        : narrationDurationFromMessages(effectiveMessages);
      const preparedPlacement = prepareEditorialPlacement(
        effectiveMessages,
        id,
        requestedInput,
        narrationEndSec,
      );
      // Repair arming (a detected coverage gap) stands the assembly gate down so the one legal
      // fix — an add_clips batch from the same review evidence — is not blocked by its own lock.
      const editorialPictureLocked = !ledger.pictureRepairArmed
        && (ledger.pictureLocked || hasCompletedEditorialPlacement(effectiveMessages));
      if (id === "undo" && shouldBlockStudioTurnUndo(ledger)) {
        publishSuccess({
          ok: true,
          skipped: true,
          summary: studioLocale().toLowerCase().startsWith("zh")
            ? "上一项失败且未改动时间线，已跳过撤销"
            : "The previous operation failed without changing the timeline, so undo was skipped.",
          data: { skipped: true, reason: "previous-mutation-failed", didMutate: false },
        });
        return;
      }
      // The planner fills from the whole reviewed pool, so an under-target assembly is a
      // pool-level fact — re-running placement is idempotent and cannot add coverage. Route the
      // model to the user instead of letting it grind retries.
      if (preparedPlacement && ledger.assemblyCapacityExhausted) {
        publishSuccess({
          ok: true,
          skipped: true,
          summary: studioLocale().toLowerCase().startsWith("zh")
            ? "已审素材容量低于旁白时长，重拼不会改变结果——请询问用户"
            : "The reviewed footage cannot cover the narration; re-running placement cannot change that — ask the user.",
          data: {
            skipped: true,
            reason: "assembly-capacity-exhausted",
            instruction: "The deterministic assembly already used the ENTIRE reviewed pool and still falls short of the narration. Do not retry placement. Use ask_user to offer the user a choice: add more footage for review, or shorten the narration script (then regenerate speech, which re-opens assembly).",
          },
        });
        return;
      }
      if (preparedPlacement && editorialPictureLocked) {
        publishSuccess({
          ok: true,
          summary: studioLocale().toLowerCase().startsWith("zh")
            ? "主画面已经完成，本轮不再重复重建"
            : "The primary picture is already assembled; it will not be rebuilt again in this turn.",
          data: {
            skipped: true,
            reason: "editorial-picture-locked",
            instruction: "Preserve the current picture edit. Continue only with unfinished captions, typography, sound, deterministic delivery checks, and a concise final summary.",
          },
        });
        return;
      }
      if (id === "review_visuals" && editorialPictureLocked) {
        publishSuccess({
          ok: true,
          skipped: true,
          summary: studioLocale().toLowerCase().startsWith("zh")
            ? "选片阶段已完成画面判断，成片仅做基础状态验收"
            : "Picture judgment is complete; delivery uses deterministic state checks only.",
          data: {
            instruction: "Do not run another visual review or rebuild the montage. Verify coverage, canvas fill, muted source audio, and track boundaries from the current project state, then finish.",
          },
        });
        return;
      }
      if (
        id === "get_timeline"
        && (ledger.blockFurtherTimelineReads || (
          editorialPictureLocked
          && (ledger.postAssemblyTimelineRead || hasPostAssemblyTimelineSnapshot(effectiveMessages))
        ))
      ) {
        publishSuccess({
          ok: true,
          skipped: true,
          summary: studioLocale().toLowerCase().startsWith("zh")
            ? "基础状态已核对完毕。不要再调用 get_timeline——继续未完成的编辑，或给出最终回复"
            : "The delivery state is verified. Do not call get_timeline again — continue unfinished edits or write the final reply.",
          data: {
            instruction: "Do NOT call get_timeline again this turn. Use the latest authoritative snapshot already present: your next call MUST be an editing tool, or you must write the final user-facing reply. Repeated reads end this turn's tool budget.",
          },
        });
        return;
      }
      const executionInput = preparedPlacement?.input ?? requestedInput;
      const placementIssue = editorialPlacementIssue(
        effectiveMessages,
        id,
        executionInput,
      );
      if (placementIssue) {
        const zh = studioLocale().toLowerCase().startsWith("zh");
        const sec = (value: number) => `${Math.round(value * 100) / 100}s`;
        const acceptedList = placementIssue.acceptedRanges?.length
          ? placementIssue.acceptedRanges.map((range) => `${sec(range.startSec)}–${sec(range.endSec)}`).join(", ")
          : null;
        const requested = placementIssue.requestedRange
          ? `${sec(placementIssue.requestedRange.sourceInSec)}–${sec(placementIssue.requestedRange.sourceOutSec)}`
          : null;
        const detail = placementIssue.reason === "review-rejected"
          ? (zh
            ? `素材 ${placementIssue.assetId} 本轮没有通过审片的可用区间。`
            : `Source ${placementIssue.assetId} has no accepted editorial range in this turn.`)
          : placementIssue.reason === "range-required"
            ? (zh
              ? `素材 ${placementIssue.assetId} 已经审片，放入时间线时必须填写通过审片的源区间${acceptedList ? `（可用：${acceptedList}）` : ""}。`
              : `Source ${placementIssue.assetId} is reviewed; placing it requires an explicit accepted source range${acceptedList ? ` (accepted: ${acceptedList})` : ""}.`)
            : (zh
              ? `素材 ${placementIssue.assetId} 请求的源区间${requested ? ` ${requested}` : ""}超出了本轮通过审片的范围${acceptedList ? `（可用：${acceptedList}）` : ""}。`
              : `Source ${placementIssue.assetId} requested range${requested ? ` ${requested}` : ""} falls outside this turn's accepted editorial range${acceptedList ? ` (accepted: ${acceptedList})` : ""}.`);
        // The guard rejected the call before execution: nothing changed, so an undo here would
        // revert the previous SUCCESSFUL operation — say so explicitly instead of relying on the
        // model to know failed calls apply nothing.
        const noMutation = zh
          ? "本次调用没有改动时间线，不要撤销；请改用通过审片的区间重新调用。"
          : "This call changed nothing on the timeline — do not undo; retry with an accepted range.";
        publishError(zh ? `${detail}${noMutation}` : `${detail} ${noMutation}`);
        return;
      }
      if (id === "analyze_visual" && (toolCall.input as { mode?: unknown } | undefined)?.mode === "editorial") {
        if (!canRunEditorialAnalysis(editorialAnalysisCountRef.current)) {
          publishSuccess({
            ok: true,
            skipped: true,
            summary: studioLocale().toLowerCase().startsWith("zh")
              ? "本轮完整审片已经完成；继续使用已有可用区间、容量和分段评分，不再重复审片。"
              : "This turn's complete source review already exists. Reuse its accepted reservoirs, capacity, and cut scores instead of reviewing again.",
          });
          return;
        }
        editorialAnalysisCountRef.current += 1;
      }
      if (id === "review_visuals") {
        if (!canRunVisualReview(visualReviewCountRef.current)) {
          publishSuccess({
            ok: true,
            skipped: true,
            summary: studioLocale().toLowerCase().startsWith("zh")
              ? "本轮画面检查已经完成，请根据现有检查结果修复或如实说明未完成项。"
              : "This turn's visual review is complete. Use the existing evidence to repair the edit or state what remains unfinished.",
          });
          return;
        }
        visualReviewCountRef.current += 1;
      }
      // Fresh controller per tool run: the stop button aborts it so long tools can stand down at
      // their safe boundaries instead of holding the turn hostage until they finish
      const ctrl = new AbortController();
      toolAbortRef.current = ctrl;
      const interactionWaitStartedAt = id === "ask_user" || id === "request_approval"
        ? Date.now()
        : null;
      try {
        const out = await runToolRef.current(
          id,
          executionInput,
          {
            signal: ctrl.signal,
            surface: "chat",
            ...(skillRef.current !== STUDIO_AUTO_SKILL_ID ? { skillId: skillRef.current } : {}),
          },
        );
        const assemblyShortfallSec = preparedPlacement
          ? Math.max(0, preparedPlacement.targetDurationSec - preparedPlacement.actualDurationSec)
          : 0;
        const assemblyCovered = !preparedPlacement
          || assemblyShortfallSec <= Math.max(1, preparedPlacement.targetDurationSec * 0.03);
        // Coverage self-heal replaces the demolition veto: trims are legitimate editing (bad
        // frames DO get cut), so instead of forbidding picture surgery the turn re-measures the
        // picture against the narration after each successful non-assembly mutation. A reopened
        // gap arms repair — the receipt orders one add_clips batch from the same review evidence
        // and the assembly gate stands down for exactly that fix.
        let pictureCoverageGapSec = 0;
        if (out.ok && !preparedPlacement
          && (ledger.pictureLocked || hasCompletedEditorialPlacement(effectiveStudioTurnMessages(messagesRef.current, ledger)))) {
          const compAfter = getComp?.();
          const narrationEnd = compAfter?.audioTracks
            ?.filter((clip) => clip.role === "narration" && !clip.muted)
            .reduce((latest, clip) => Math.max(latest, audioClipWindow(clip, 0).end), 0) ?? 0;
          const pictureSec = (compAfter?.shots ?? [])
            .reduce((sum, shot) => sum + Math.max(0, shot.srcEnd - shot.srcStart), 0);
          const gap = narrationEnd - pictureSec;
          if (narrationEnd > 0 && gap > Math.max(1, narrationEnd * 0.03)) {
            pictureCoverageGapSec = Math.round(gap * 10) / 10;
            ledger.pictureRepairArmed = true;
          }
        }
        const outWithGap = pictureCoverageGapSec > 0
          ? {
              ...out,
              data: {
                ...(out.data && typeof out.data === "object" ? out.data : {}),
                pictureCoverageGap: {
                  gapSec: pictureCoverageGapSec,
                  instruction: `This edit left the picture ${pictureCoverageGapSec}s SHORT of the narration. Close the gap now in ONE add_clips batch using unplaced accepted or reserve:true ranges from the existing review receipt; never stretch, slow down, or repeat already-placed shots. The assembly gate is open for exactly this repair.`,
                },
              },
            }
          : out;
        const reportedOut = out.ok && preparedPlacement
          ? {
              ...out,
              data: {
                ...(out.data && typeof out.data === "object" ? out.data : {}),
                editorialAssembly: {
                  targetDurationSec: preparedPlacement.targetDurationSec,
                  actualDurationSec: preparedPlacement.actualDurationSec,
                  droppedClipCount: preparedPlacement.droppedClipCount,
                  naturalSpeed: true,
                  // An under-target assembly is NOT a finished picture: say so in the receipt and
                  // name the one legal fix, instead of letting a lock message call it complete.
                  // A covered assembly is equally explicit the other way: without the FINAL
                  // declaration a model re-planned "its own" cut and stripped the montage apart.
                  ...(assemblyCovered ? {
                    instruction: `The montage is COMPLETE: deterministic assembly placed ${preparedPlacement.actualDurationSec}s of reviewed picture covering the full ${preparedPlacement.targetDurationSec}s narration at natural speed. This IS the final picture for this turn — do not remove, reorder, re-add, or re-plan picture clips. Selection criteria live in the review brief and were already applied during review; do not re-litigate selection (topic fit, ordering, taste) after assembly. Continue with captions, typography, sound, and the final summary.`,
                  } : {
                    shortfallSec: Math.round(assemblyShortfallSec * 10) / 10,
                    instruction: `The picture covers ${preparedPlacement.actualDurationSec}s of the ${preparedPlacement.targetDurationSec}s narration, and deterministic assembly already drew on the ENTIRE reviewed pool — retrying placement cannot add coverage. Never stretch, slow down, or repeat shots. Use ask_user to offer the user a choice: add more footage for review, or shorten the narration script and regenerate speech.`,
                  }),
                },
              },
            }
          : outWithGap;
        const stopAfterReceipt = studioToolResultStopsAgentTurn(out);
        if (stopAfterReceipt) userStoppedRef.current = true;
        if (out.ok) publishSuccess(reportedOut as unknown as Record<string, unknown>);
        else publishError(out.error ?? t("chatGen.executionFailed"));
        if (stopAfterReceipt) void stop();
      } catch (e) {
        const isStop = e instanceof DOMException && e.name === "AbortError";
        publishError(
          isStop
            ? e.message || t("chatGen.stopped")
            : e instanceof Error
              ? e.message
              : String(e),
        );
      } finally {
        if (interactionWaitStartedAt !== null) {
          interactionWaitDurationRef.current += Math.max(0, Date.now() - interactionWaitStartedAt);
        }
        if (toolAbortRef.current === ctrl) toolAbortRef.current = null;
      }
    },
  });

  // Persist: on stream end (ready / error) write localStorage; throttle a snapshot every 2s while streaming —
  // so switching sessions / refreshing mid-generation doesn't evaporate the streamed-out parts and completed tool outputs.
  // On first mount status is already 'ready' (also when restoring/switching to an old session) — skip that one,
  // otherwise merely opening an old session refreshes its updatedAt and scrambles the history ordering.
  messagesRef.current = messages;
  const persistSessionState = useCallback(
    (nextFrame: AttachedFrame | null, nextSkillId: StudioScenarioSkillId) => {
      if (messagesRef.current.length > 0)
        onSnapshot(compactStudioChatMessages(messagesRef.current), nextFrame, nextSkillId);
    },
    [onSnapshot],
  );
  /** Attach a frame (shared by panel/theme button): update the request state, apply the palette, and persist this explicit user action. */
  const applyFrame = useCallback(
    (nextFrame: AttachedFrame | null) => {
      frameRef.current = nextFrame;
      setFrame(nextFrame);
      onFrameAppliedRef.current?.(nextFrame);
      persistSessionState(nextFrame, skillRef.current);
    },
    [persistSessionState],
  );
  const applySkill = useCallback(
    (nextSkillId: StudioScenarioSkillId) => {
      if (skillRef.current === nextSkillId) return;
      skillRef.current = nextSkillId;
      setSkillId(nextSkillId);
      persistSessionState(frameRef.current, nextSkillId);
    },
    [persistSessionState],
  );
  const statusSnapshotActivationRef = useRef<DeferredActivation | null>(null);
  if (!statusSnapshotActivationRef.current)
    statusSnapshotActivationRef.current = new DeferredActivation();
  useEffect(() => {
    if (!statusSnapshotActivationRef.current!.active)
      return statusSnapshotActivationRef.current!.defer();
    if (status === "ready" || status === "error")
      onSnapshot(compactStudioChatMessages(messagesRef.current), frameRef.current, skillRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
  const busy = status === "streaming" || status === "submitted";

  const workTimingActivationRef = useRef<DeferredActivation | null>(null);
  if (!workTimingActivationRef.current)
    workTimingActivationRef.current = new DeferredActivation();
  useEffect(() => {
    if (!workTimingActivationRef.current!.active)
      return workTimingActivationRef.current!.defer();
    if (status !== "ready" && status !== "error") return;
    const timedMessages = stampLatestAssistantWorkDuration(
      messagesRef.current,
      Date.now(),
      interactionWaitDurationRef.current,
    );
    if (timedMessages === messagesRef.current) return;
    messagesRef.current = timedMessages;
    setMessages(timedMessages);
    onSnapshot(compactStudioChatMessages(timedMessages), frameRef.current, skillRef.current);
  }, [onSnapshot, setMessages, status]);

  const refreshedCreatedSkillRef = useRef<string | null>(null);
  useEffect(() => {
    if (status !== "ready" || !onRefreshScenarioSkills) return;
    let createdSkillId: string | null = null;
    for (let messageIndex = messages.length - 1; messageIndex >= 0 && !createdSkillId; messageIndex -= 1) {
      const message = messages[messageIndex]!;
      for (let partIndex = message.parts.length - 1; partIndex >= 0; partIndex -= 1) {
        const part = message.parts[partIndex] as {
          type?: string;
          toolName?: string;
          state?: string;
          output?: unknown;
        };
        const toolId = part.type === "dynamic-tool"
          ? part.toolName
          : part.type?.startsWith("tool-")
            ? part.type.slice(5)
            : undefined;
        if (toolId !== "save_user_skill" || part.state !== "output-available") continue;
        const output = part.output as { ok?: unknown; skill_id?: unknown } | undefined;
        if (output?.ok === true && typeof output.skill_id === "string") {
          createdSkillId = output.skill_id;
          break;
        }
      }
    }
    if (!createdSkillId || refreshedCreatedSkillRef.current === createdSkillId) return;
    refreshedCreatedSkillRef.current = createdSkillId;
    composerRef.current?.clearStudioAction();
    void onRefreshScenarioSkills().catch((error) => {
      console.error("[studio] custom Skill refresh failed", error);
    });
  }, [messages, onRefreshScenarioSkills, status]);
  // Safety net for a dropped continuation: the SDK is supposed to fire the follow-up request from
  // inside addToolOutput (sendAutomaticallyWhen), but that trigger can be missed — observed in the
  // wild: tool output landed, status idle, and no request ever went out, so the turn died on the
  // tool card with the model never voicing the result. When status settles on 'ready' with the last
  // assistant message still ending in completed tool calls, fire the send ourselves — once per
  // completion state (keyed by message id + part count), after a grace delay re-checking status so
  // the SDK's own trigger always wins (no double request), and never on first mount (opening an old
  // session that happens to end on a tool card must not start a paid request by itself; dedicated
  // ref — the snapshot activation above is intentionally independent from continuation recovery).
  const statusRef = useRef(status);
  statusRef.current = status;
  const autoResumedRef = useRef("");
  const resumeActivationRef = useRef<DeferredActivation | null>(null);
  if (!resumeActivationRef.current)
    resumeActivationRef.current = new DeferredActivation();
  useEffect(() => {
    // Restoring and sanitizing a persisted thread may replace the initial message array after the
    // first effect setup. Keep that entire startup cycle inert; only message changes that happen
    // after the final mount settles are eligible for live tool continuation.
    if (!resumeActivationRef.current!.active)
      return resumeActivationRef.current!.defer();
    if (status !== "ready") return;
    const timer = setTimeout(() => {
      if (statusRef.current !== "ready") return; // the SDK sent its own follow-up meanwhile
      if (userStoppedRef.current) return; // the user killed this turn — don't resurrect it
      const msgs = messagesRef.current;
      const last = msgs[msgs.length - 1];
      if (!last || last.role !== "assistant") return;
      const key = `${last.id}:${last.parts.length}`;
      const completedToolNeedsFollowup = lastAssistantMessageIsCompleteWithToolCalls({ messages: msgs });
      if (!completedToolNeedsFollowup || autoResumedRef.current === key) return;
      autoResumedRef.current = key;
      void sendMessage();
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, messages]);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(
      () => onSnapshot(compactStudioChatMessages(messagesRef.current), frameRef.current, skillRef.current),
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
      onSnapshot(compactStudioChatMessages(messagesRef.current), frameRef.current, skillRef.current);
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

  const run = useCallback(
    async (
      draft: string | StudioChatDraftPart[],
      options: {
        preserveAutoRecoveryAttempt?: boolean;
        studioAction?: typeof STUDIO_CREATE_SKILL_ACTION;
      } = {},
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
      visualReviewCountRef.current = 0;
      editorialAnalysisCountRef.current = 0;
      interactionWaitDurationRef.current = 0;
      turnLedgerRef.current = createStudioTurnLedger();
      finalOnlyRef.current = false;
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
        workStartedAt: Date.now(),
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
        ...(options.studioAction ? { studioAction: options.studioAction } : {}),
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
    () => {
      const studioAction = latestStudioMetaAction(messagesRef.current);
      return run(t("chatGen.continueAfterInterruptionPrompt"), {
        ...(studioAction ? { studioAction } : {}),
      });
    },
    [run],
  );

  const createScenarioSkill = useCallback(() => {
    composerRef.current?.beginCreateSkill({
      label: t("chatGen.skill.create.title"),
      prompt: t("chatGen.skill.create.prompt"),
    });
  }, []);

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
      const studioAction = latestStudioMetaAction(messagesRef.current);
      run(t("chatGen.continueAfterInterruptionPrompt"), {
        preserveAutoRecoveryAttempt: true,
        ...(studioAction ? { studioAction } : {}),
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
      applySkill(nextSkillId);
      setActiveStarterId(`${nextSkillId}:${starterId}`);
      fillComposer(prompt);
    },
    [applySkill, fillComposer],
  );

  const pickSkill = useCallback((nextSkillId: StudioScenarioSkillId) => {
    applySkill(nextSkillId);
    setActiveStarterId(null);
    const defaultPrompt = nextSkillId === STUDIO_AUTO_SKILL_ID
      ? null
      : scenarioSkills.find((skill) => skill.id === nextSkillId)?.defaultPrompt ?? null;
    composerRef.current?.applySkillPrompt(defaultPrompt);
  }, [applySkill, scenarioSkills]);

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
              const displayMessage = compactStudioChatMessages([m])[0] ?? m;
              const parts = (displayMessage.parts ?? []) as ToolPartLike[];
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
              const incompleteCompletedAssistant =
                m.role === "assistant" &&
                isLast &&
                status === "ready" &&
                !emptyCompletedAssistant &&
                assistantMessageSuggestsContinuation(m);
              const editorialCapacityShortfall = m.role === "assistant" && (!isLast || status === "ready")
                ? assistantEditorialCapacityShortfall(m)
                : null;
              const workFold = assistantWorkFold(m, !isLast || status === "ready");
              const workFoldAvailable = workFold !== null;
              const workExpanded = !collapsedWorkMessages.has(m.id);
              const workHidden = workFoldAvailable && !workExpanded;
              const workDurationMs = workFoldAvailable
                ? assistantWorkDurationMs(messages, mi)
                : null;
              const workDurationSeconds = workDurationMs === null
                ? null
                : Math.max(1, Math.round(workDurationMs / 1000));
              const workDuration = workDurationSeconds === null
                ? null
                : workDurationSeconds < 60
                  ? t("chatGen.workDurationSeconds", { s: workDurationSeconds })
                  : t("chatGen.workDurationMinutes", {
                      m: Math.floor(workDurationSeconds / 60),
                      s: workDurationSeconds % 60,
                    });
              return (
                <Message key={m.id} from={m.role}>
                  <div className="flex items-start gap-2">
                    {m.role === "assistant" && <PiAvatar thinking={thinking} />}
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      {workFoldAvailable && (
                        <button
                          type="button"
                          aria-expanded={workExpanded}
                          onClick={() => setCollapsedWorkMessages((current) => {
                            const next = new Set(current);
                            if (next.has(m.id)) next.delete(m.id);
                            else next.add(m.id);
                            return next;
                          })}
                          className="text-ink-3 hover:text-ink flex w-fit items-center gap-1 py-0.5 text-[11px] transition-colors"
                        >
                          <ChevronRight
                            aria-hidden
                            className={`size-3 transition-transform ${workExpanded ? "rotate-90" : ""}`}
                          />
                          <span>{t("chatGen.workUpdates")}</span>
                          {workDuration && <span>· {workDuration}</span>}
                        </button>
                      )}
                      {parts.map((part, idx) => {
                        const key = `${m.id}-${idx}`;
                        if (workHidden && idx <= (workFold?.lastWorkPartIndex ?? -1)) return null;
                        if (part.type === "step-start") return null;
                        if (collapsed.has(idx)) return null;
                        if (part.type === "text") {
                          const text = (part as { text?: string }).text ?? "";
                          if (!text) return null;
                          return m.role === "user" ? (
                            <MessageContent key={key}>
                              <div className="text-[13px] leading-relaxed">
                                {idx === parts.findIndex((candidate) => candidate.type === "text")
                                  && (m.metadata as { studioAction?: unknown } | undefined)?.studioAction === STUDIO_CREATE_SKILL_ACTION && (
                                  <span className={`${CHAT_ACTION_PILL_CLASS} mr-1.5`}>
                                    <span className={`${CHAT_PILL_ICON_CLASS} text-accent`}>✦</span>
                                    <span className={CHAT_PILL_LABEL_CLASS}>{t("chatGen.skill.create.title")}</span>
                                  </span>
                                )}
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
                      {incompleteCompletedAssistant && (
                        <div className="border-line bg-panel-2 flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12px]">
                          <span className="text-ink-3 min-w-0 flex-1">
                            {t("chatGen.workNotFinished")}
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
                      {editorialCapacityShortfall !== null && (
                        <div className="border-line bg-panel-2 text-ink-3 flex items-start gap-2 rounded-md border px-2.5 py-2 text-[12px] leading-relaxed">
                          <Info size={13} className="mt-0.5 shrink-0 text-accent" />
                          <span>
                            {t("chatGen.editorialCapacityShortfall", { s: editorialCapacityShortfall })}
                          </span>
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
          onOpenSkillMarket={onOpenSkillMarket}
          onCreateScenarioSkill={onRefreshScenarioSkills ? createScenarioSkill : undefined}
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
