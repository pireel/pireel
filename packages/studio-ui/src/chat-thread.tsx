"use client";
import { editorRequest } from '@pireel/studio-ui/host-request';
import { alreadyStarted, firstEditMessage, firstMessageEditsFootage, footageToEdit, startWithRoughCut, sceneAgentState } from '@pireel/studio-ui/agent-startup';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@pireel/ui/tooltip';
import { EditingSkillSwitches } from '@pireel/studio-ui/editing-skills';

import { directorPlanForModel, directorPlanToolBlock, saveEditingDirectorPlan, withDirectorInstruction } from '@pireel/studio-ui/editing-director-plan';
import { DEFAULT_STUDIO_AGENT_MODEL, studioAgentModelId, type StudioAgentModelId } from '@pireel/studio-engine/agent-models';

import { editingSkillsHint } from '@pireel/studio-engine/editing-skills';
import { resolveEditingRunConfig } from '@pireel/studio-engine/editing-run-config';
import { detectSkillSettings, measureSkillStyle } from '@pireel/studio-engine/skill-format';
import { EditingTaskCard } from '@pireel/studio-ui/editing-task-card';
import { displayEditingTask, hasCurrentDirectorPreview, isInteractiveEditingTool, messagesForTask, unresolvedTaskFailure } from '@pireel/studio-ui/editing-task-progress';
import { coverStillToRun, needsDirectorPlan, needsEditingReview, reviewEditingTask } from '@pireel/studio-ui/editing-task-review';
import { toolInputObject } from '@pireel/studio-ui/tool-input';
import { ROUGH_CUT_TOOL, messageTurnCredits, toolNameOfPart, type RoughCutReplyMeta } from '@pireel/studio-ui/first-pass-card';
import { NextSteps, splitNextSteps } from '@pireel/studio-ui/chat-next-steps';
import { FINE_CUT_SKILLS, firstPassStartupHint, type FineCutSkill } from '@pireel/studio-ui/first-pass';
import { latestTask, taskOf, patchTask, resumeTaskHint, resumeEditingTask, unfinishedRoughCut, withTaskUsage, type ChatTask } from "@pireel/studio-ui/chat-task";
import { cachedChatThread } from "@pireel/studio-ui/chat-thread-cache";
import { recordTaskUsage, subscribeTaskUsage } from "@pireel/studio-ui/chat-task-usage";
import { collapsedComponentRetryIndexes, studioToolFailureText } from '@pireel/studio-ui/chat-component-retries';

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
import { ConfirmDialog } from "@pireel/ui/confirm-dialog";
import { brandSkillOf, skillTakesBrand } from "@pireel/studio-engine/project-brand-metadata";
import { describeGenerationIntentLine } from "@pireel/studio-ui/chat-generation-intent";
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
  STUDIO_AUTO_SKILL_ID,
  type StudioScenarioSkillId,
} from "@pireel/studio-engine/scenario-skills";
import { studioProviders } from "@pireel/studio-engine/providers";
import {
  STUDIO_CREATE_SKILL_ACTION,
  latestStudioMetaAction,
} from "@pireel/studio-engine/skill-actions";
import { CHAT_SERVER_EXECUTED_TOOLS, v3ToolCanMutate, V3_CHAT_TOOL_IDS, V3_TOOL_IDS } from "@pireel/studio-engine/agent-surface-v3/registry";
import {
  CHAT_ACTION_PILL_CLASS,
  CHAT_PILL_ICON_CLASS,
  CHAT_PILL_LABEL_CLASS,
  mid,
  PiAvatar,
  ThinkingDots,
  renderTextWithElementPills,
} from "@pireel/studio-ui/chat-format";
import {
  renderToolPart,
  renderToolPartGroup,
  toolStatus,
  type ToolPartLike,
} from "@pireel/studio-ui/chat-tool-parts";
import { Composer, type ComposerHandle } from "@pireel/studio-ui/chat-composer";
import {
  assistantEditorialCapacityShortfall,
  assistantHasOpenOrInterruptedInteraction,
  assistantTurnEndedWithAnswer,
  assistantMessageHasRenderableOutput,
  assistantMessageSuggestsContinuation,
  assistantWorkDurationMs,
  assistantWorkFold,
  compactStudioChatMessages,
  compactStudioChatMessagesForModel,
  createStudioTurnLedger,
  effectiveStudioTurnMessages,
  isRecoverableStudioChatError,
  recordStudioTurnToolResult,
  shouldBlockStudioTurnUndo,
  stampLatestAssistantWorkDuration,
} from "@pireel/studio-ui/chat-thread-store";
import { studioLocale, t } from "@pireel/studio-ui/i18n";
import type { StudioScenarioSkillOption } from "@pireel/studio-ui/shell-context";
import { localAssetMentionContext } from "@pireel/studio-ui/chat-local-asset-mention";
import { inspectTimelineFrameEvidence } from "@pireel/studio-ui/chat-timeline-frame-evidence";
import { DeferredActivation } from "@pireel/studio-ui/deferred-activation";
import { studioToolResultStopsAgentTurn } from "@pireel/studio-ui/agent-tool-runner";
import type {
  ProgressHandle,
  StudioChatDraftPart,
  StudioChatHandle,
  StudioChatProps,
  StudioElementRef,
} from "@pireel/studio-ui/studio-chat";
import type { LocalAssetIndexEntry } from "@pireel/studio-engine/project-dto";

const USER_BUBBLE_CLASS = "group-[.is-user]:bg-secondary/35";
/** Refusals of one tool in a turn after which it is not run again in that turn. */
const STUDIO_TOOL_FAILURES_PER_TURN = 5;

export function ChatThread({
  projectId,
  projectCover,
  coverScene,
  onOpenCover,
  onApplyCover,
  coverApplying,
  localAssetIndex,
  threadId,
  initialMessages,
  initialSkillId,
  initialAgentModel,
  scenarioSkills,
  onOpenSkillMarket,
  onRefreshScenarioSkills,
  onDeleteScenarioSkill,
  runTool,
  getBody,
  getComp,
  getDocument,
  startPrompt,
  onStartPromptSent,
  fineCutClips,
  projectEdited,
  projectBrand,
  projectSkillId,
  onProjectSkill,
  editingSkills,
  onEditingSkills,
  timelineFramePickActive,
  timelineFramePickBusy,
  timelineFramePickAvailable,
  onTimelineFramePickActiveChange,
  elements,
  onSnapshot: saveSnapshot,
  onBusyChange,
  onSceneStateChange,
  onInsertMedia,
  onUseAudio,
  handleRef,
}: {
  onInsertMedia?: StudioChatProps["onInsertMedia"];
  onUseAudio?: StudioChatProps["onUseAudio"];
  projectId?: string;
  projectCover?: StudioChatProps["projectCover"];
  coverScene?: StudioChatProps["coverScene"];
  onOpenCover?: StudioChatProps["onOpenCover"];
  onApplyCover?: StudioChatProps["onApplyCover"];
  coverApplying?: boolean;
  localAssetIndex?: readonly LocalAssetIndexEntry[];
  threadId: string;
  initialMessages: UIMessage[];
  initialSkillId: StudioScenarioSkillId;
  initialAgentModel?: StudioAgentModelId;
  scenarioSkills: readonly StudioScenarioSkillOption[];
  onOpenSkillMarket?: () => void;
  onRefreshScenarioSkills?: () => Promise<void>;
  onDeleteScenarioSkill?: (id: string) => Promise<void>;
  runTool: StudioChatProps["runTool"];
  getBody: StudioChatProps["getBody"];
  getComp?: StudioChatProps["getComp"];
  getDocument?: StudioChatProps["getDocument"];
  startPrompt?: StudioChatProps["startPrompt"];
  projectBrand?: StudioChatProps["projectBrand"];
  projectSkillId?: StudioChatProps["projectSkillId"];
  onProjectSkill?: StudioChatProps["onProjectSkill"];
  onStartPromptSent?: StudioChatProps["onStartPromptSent"];
  fineCutClips?: StudioChatProps["fineCutClips"];
  projectEdited?: StudioChatProps["projectEdited"];
  editingSkills?: StudioChatProps["editingSkills"];
  onEditingSkills?: StudioChatProps["onEditingSkills"];
  handoff?: StudioChatProps["handoff"];
  onAnswerHandoff?: StudioChatProps["onAnswerHandoff"];
  timelineFramePickActive: boolean;
  timelineFramePickBusy: boolean;
  timelineFramePickAvailable: boolean;
  onTimelineFramePickActiveChange?: StudioChatProps["onTimelineFramePickActiveChange"];
  elements: StudioElementRef[];
  onSnapshot: (
    messages: UIMessage[],
    skillId: StudioScenarioSkillId,
    agentModel?: StudioAgentModelId,
  ) => void;
  onBusyChange?: (busy: boolean) => void;
  onSceneStateChange?: StudioChatProps["onSceneStateChange"];
  handleRef: React.MutableRefObject<StudioChatHandle | null>;
}) {
  const runToolRef = useRef(runTool);
  runToolRef.current = runTool;
  // Stop plumbing: aborting the stream alone isn't enough — the stream loop awaits onToolCall, so a
  // running tool must be told to stand down too. The user-stopped flag keeps the continuation
  // safety net from resurrecting a turn the user just killed.
  const toolAbortsRef = useRef(new Set<AbortController>());
  const userStoppedRef = useRef(latestTask(initialMessages)?.state === 'paused');
  const [activeTools, setActiveTools] = useState(0);
  const [taskResumeError, setTaskResumeError] = useState(false);
  const interactionWaitDurationRef = useRef(0);
  const autoRecoveryAttemptedRef = useRef(false);
  const turnLedgerRef = useRef(createStudioTurnLedger());
  const timelineFrameInspectionRef = useRef<AbortController | null>(null);
  const [timelineFrameInspectionError, setTimelineFrameInspectionError] = useState(false);
  // Completed work stays visible by default. The arrow is an explicit user collapse, not an
  // automatic replacement of the whole turn with an empty-looking summary row.
  const [collapsedWorkMessages, setCollapsedWorkMessages] = useState<Set<string>>(() => new Set());
  useEffect(() => () => timelineFrameInspectionRef.current?.abort(), []);
  const getBodyRef = useRef(getBody);
  getBodyRef.current = getBody;
  // Read at send time: the switched-on editing skills ride each message as a frozen note.
  const editingSkillsRef = useRef(editingSkills);
  editingSkillsRef.current = editingSkills;
  const projectEditedRef = useRef(projectEdited);
  projectEditedRef.current = projectEdited;
  const composerRef = useRef<ComposerHandle | null>(null);
  // The project's Skill when it has one; a project that never set one keeps this thread's own pick.
  const [skillId, setSkillId] = useState<StudioScenarioSkillId>((projectSkillId as StudioScenarioSkillId | undefined) ?? initialSkillId);
  const [agentModel, setAgentModel] = useState<StudioAgentModelId>(() => studioAgentModelId(initialAgentModel ?? latestTask(initialMessages)?.agentModel ?? (initialMessages.length ? 'deepseek' : DEFAULT_STUDIO_AGENT_MODEL)));
  const agentModelRef = useRef(agentModel);
  const modelSelectedRef = useRef(initialAgentModel !== undefined);
  const onSnapshot = useCallback((messages: UIMessage[], skill: StudioScenarioSkillId) => {
    if (!messages.length && !modelSelectedRef.current) return;
    saveSnapshot(messages, skill, agentModelRef.current);
  }, [saveSnapshot]);
  const skillRef = useRef(skillId);
  skillRef.current = skillId;
  const scenarioSkillsRef = useRef(scenarioSkills);
  scenarioSkillsRef.current = scenarioSkills;
  const getDocumentRef = useRef(getDocument);
  getDocumentRef.current = getDocument;
  /** What Create Skill writes from: the style values and numbers the finished edit shows, and the
   *  custom Skill the conversation ran with. */
  const skillDraftContext = () => {
    const document = getDocumentRef.current?.();
    const task = latestTask(messagesRef.current);
    const settings = document
      ? detectSkillSettings(document, {
        switches: task?.skills.length ? task.skills : editingSkillsRef.current,
        ...(task?.config?.pauses ? { pauses: task.config.pauses } : {}),
        brandCaptions: !!projectBrandRef.current?.blocks.captions?.on,
      })
      : {};
    const base = scenarioSkillsRef.current.find((skill) => skill.id === skillRef.current && skill.custom);
    return {
      settings,
      ...(document ? { measure: measureSkillStyle(document) } : {}),
      ...(base ? { basedOn: { id: base.id, title: base.title } } : {}),
    };
  };

  const projectBrandRef = useRef(projectBrand);
  projectBrandRef.current = projectBrand;
  // body carries the session-level skillId and the project's brand; the situation snapshot is attached to metadata.situation at send time (persists with the session,
  // the route materializes it into a <composition_state> part) — stable history bytes are what let the prompt cache hit
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        fetch: editorRequest,
        api: studioProviders().chatEndpoint ?? "/api/studio/chat",
        body: () => ({
          locale: studioLocale().toLowerCase().startsWith("zh") ? "zh" : "en",
          ...(projectId ? { projectId } : {}),
          ...(skillRef.current !== STUDIO_AUTO_SKILL_ID
            ? { skillId: skillRef.current }
            : {}),
          ...(projectBrandRef.current !== undefined ? { brand: projectBrandRef.current } : {}),
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
            agentModel: latestTask(requestMessages)?.agentModel ?? agentModelRef.current,
            ...(latestTask(requestMessages)?.config ? { brand: latestTask(requestMessages)!.config!.brand } : {}),
            ...(latestTask(requestMessages)?.skillId ? { skillId: latestTask(requestMessages)!.skillId } : {}),
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
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  // Bound to this thread: a delayed bill must still save its original task after navigation.
  const updateTask = (id: string, patch: (task: ChatTask) => ChatTask) => {
    const source = !mountedRef.current && projectId ? cachedChatThread(projectId, threadId)?.messages ?? messagesRef.current : messagesRef.current;
    const next = patchTask(source, id, patch);
    messagesRef.current = next;
    if (mountedRef.current) setMessages(next);
    onSnapshot(compactStudioChatMessages(mountedRef.current ? effectiveStudioTurnMessages(next, turnLedgerRef.current) : next), skillRef.current);
  };

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
      if (CHAT_SERVER_EXECUTED_TOOLS.has(id)) return;
      const requestedInput = toolInputObject(toolCall.input);
      const task = latestTask(messagesRef.current);
      const ledger = turnLedgerRef.current;
      const v3 = V3_TOOL_IDS.has(id);
      const canMutate = v3ToolCanMutate(id);
      // What a refusal adds once the same call or the same tool keeps failing in this turn: refused
      // results (ok:false) count as much as errors, and reading state in between does not reset it.
      // Model-facing, so English whatever the UI language (AGENTS.md: text sent to a model stays in code).
      const loopNote = (recorded: { repeatedFailureCount: number; toolFailureCount: number }) => {
        if (recorded.repeatedFailureCount >= 2) return ` (This identical call has now failed ${recorded.repeatedFailureCount} times in a row; retrying cannot succeed. Use the real ids and parameters from receipts, or drop this operation and finish.)`;
        if (recorded.toolFailureCount >= 2) return ` (${id} has failed ${recorded.toolFailureCount} times this turn; rewording it does not help. Change what the error names, in the input or on the timeline, or stop calling this tool and tell the user in plain text what blocks it.)`;
        return '';
      };
      const publishSuccess = (output: Record<string, unknown>) => {
        if (canMutate && output.ok !== false && task && latestTask(messagesRef.current)?.review) updateTask(task.id, current => ({ ...current, review: undefined }));
        const recorded = recordStudioTurnToolResult(ledger, {
          toolId: id,
          toolCallId: toolCall.toolCallId,
          input: requestedInput,
          output,
          canMutate,
        });
        if (output.ok === false && typeof output.error === 'string') output = { ...output, error: output.error + loopNote(recorded) };
        addToolOutput({ tool: id, toolCallId: toolCall.toolCallId, output });
        const saved = effectiveStudioTurnMessages(messagesRef.current, ledger);
        onSnapshot(compactStudioChatMessages(saved), skillRef.current);
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
        // Say so on the receipt the moment a loop starts instead of letting it burn the turn budget.
        errorText += loopNote(recorded);
        addToolOutput({
          tool: id,
          toolCallId: toolCall.toolCallId,
          state: "output-error",
          errorText,
        });
        onSnapshot(compactStudioChatMessages(effectiveStudioTurnMessages(messagesRef.current, ledger)), skillRef.current);
      };
      if (id === 'save_edit_plan') {
        const document = getDocument?.();
        if (!task || !document) { publishSuccess({ ok: false, error: 'No active editing task or timeline.' }); return; }
        const result = saveEditingDirectorPlan(task, requestedInput, document);
        if (!result.ok) { publishSuccess(result); return; }
        updateTask(task.id, current => ({ ...current, directorPlan: result.plan, review: undefined }));
        publishSuccess({ ok: true, summary: 'Editing direction saved', data: { plan: directorPlanForModel(result.plan), next: 'Execute this plan now. Resolve source anchors against the current timeline after structural cuts; no approval stop.' } });
        return;
      }
      // A tool refused this often in one turn is not run again: the model reports the blocker instead.
      if ((ledger.toolFailures[id] ?? 0) >= STUDIO_TOOL_FAILURES_PER_TURN) {
        publishSuccess({ ok: false, error: `${id} was refused ${ledger.toolFailures[id]} times this turn and is not run again in it. Stop calling it and tell the user in plain text what blocks it.` });
        return;
      }
      const planBlock = directorPlanToolBlock(task, id, canMutate, requestedInput);
      if (planBlock) { publishSuccess({ ok: false, error: planBlock }); return; }
      if (id === 'finish_edit') {
        if (!task || !fineCutClips) { publishError('No active editing task or timeline evidence.'); return; }
        if (task.directorPlanRequired && !hasCurrentDirectorPreview(messagesForTask(effectiveStudioTurnMessages(messagesRef.current, ledger), task.id))) {
          publishSuccess({ ok: false, error: 'Inspect meaningful rendered timeline frames after the final edit, then assess the result against the saved director plan before finishing.' }); return;
        }
        // The enabled cover is the harness's step, not something the model must remember.
        if (coverStillToRun(task, getDocument?.(), requestedInput)) {
          const ctrl = new AbortController();
          toolAbortsRef.current.add(ctrl);
          setActiveTools(toolAbortsRef.current.size);
          if (userStoppedRef.current) ctrl.abort();
          try {
            await runToolRef.current("run_v3", { name: 'generate_cover', args: {} }, { signal: ctrl.signal, surface: "chat" as const, coverRequested: false });
          } catch {
            /* the review below reports the cover as unfinished */
          } finally {
            toolAbortsRef.current.delete(ctrl);
            setActiveTools(toolAbortsRef.current.size);
          }
        }
        const result = reviewEditingTask(task, requestedInput, fineCutClips(), getDocument?.());
        if (!result.ok) { publishSuccess({ ok: false, error: result.error, data: { problems: result.problems, ...(result.missing ? { missing: result.missing } : {}) } }); return; }
        updateTask(task.id, current => ({ ...current, review: result.review }));
        publishSuccess({ ok: true, summary: 'Editing result checked', data: { review: result.review, taskIncomplete: !result.review.completed } });
        return;
      }
      if (id === "undo" && shouldBlockStudioTurnUndo(ledger)) {
        publishSuccess({
          ok: true,
          skipped: true,
          summary: "The previous operation failed without changing the timeline, so undo was skipped.",
          data: { skipped: true, reason: "previous-mutation-failed", didMutate: false },
        });
        return;
      }
      // Fresh controller per tool run: the stop button aborts it so long tools can stand down at
      // their safe boundaries instead of holding the turn hostage until they finish
      const ctrl = new AbortController();
      toolAbortsRef.current.add(ctrl);
      setActiveTools(toolAbortsRef.current.size);
      if (userStoppedRef.current) ctrl.abort();
      // Parked tools wait on the user, not on work: keep that time out of the tool-duration ETA memory
      const interactionWaitStartedAt = id === "ask_user" || id === "export"
        ? Date.now()
        : null;
      try {
        const runOpts = {
          signal: ctrl.signal,
          surface: "chat" as const,
          ...(id === 'generate_cover' ? { coverRequested: task?.mode === 'request' } : {}),
          ...(id === ROUGH_CUT_TOOL && task ? { roughCut: {
            resume: task.roughCut?.report,
            ...(task.mode === 'one-click' ? { skills: task.skills, config: task.config } : {}),
            onProgress: (report: import('@pireel/studio-ui/first-pass').FirstPassReport) => updateTask(task.id, current => {
              if (current.roughCut && current.roughCut.callId !== toolCall.toolCallId && current.roughCut.callId !== task.roughCut?.callId) return current;
              const source = localAssetIndex?.find(asset => asset.assetId === report.sourceAssetId);
              return { ...current, roughCut: { callId: toolCall.toolCallId, report }, ...(source ? { source: { name: source.label, durationSec: source.durationSec ?? undefined, posterKey: source.posterKey } } : {}) };
            }),
            onLateUsage: (usage: import('@pireel/studio-engine/usage').WorkflowUsage) => {
              if (!projectId) return;
              const saved = recordTaskUsage({ projectId, threadId, taskId: task.id, callId: toolCall.toolCallId, usage });
              if (saved) onSnapshot(saved.messages, saved.skillId ?? skillRef.current);
            },
          } } : {}),
          ...((task?.skillId ?? skillRef.current) !== STUDIO_AUTO_SKILL_ID ? { skillId: task?.skillId ?? skillRef.current } : {}),
        };
        const executionInput = withDirectorInstruction(task, id, requestedInput, getDocument?.());
        const out = v3
          ? await runToolRef.current("run_v3", { name: id, args: executionInput }, runOpts)
          : { ok: false, error: `Unknown tool: ${id}. Use the current tool list.` };
        const stopAfterReceipt = studioToolResultStopsAgentTurn(out);
        if (id === ROUGH_CUT_TOOL && task && out.ok) {
          const baseline = (out.data as { baseline?: Record<FineCutSkill, string[]> } | undefined)?.baseline;
          if (baseline) updateTask(task.id, current => ({ ...current, fineCutBaseline: current.fineCutBaseline ?? baseline }));
        }
        if (stopAfterReceipt) { userStoppedRef.current = true; toolAbortsRef.current.forEach(controller => { if (controller !== ctrl) controller.abort(); }); }
        if (out.ok) publishSuccess(out as unknown as Record<string, unknown>);
        else publishError(studioToolFailureText(out.error ?? t("chatGen.executionFailed"), out.data, out));
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
        toolAbortsRef.current.delete(ctrl);
        setActiveTools(toolAbortsRef.current.size);
      }
    },
  });

  useEffect(() => subscribeTaskUsage(event => {
    if (event.projectId !== projectId || event.threadId !== threadId) return;
    updateTask(event.taskId, current => withTaskUsage(current, event.callId, event.usage));
  }), [projectId, threadId, onSnapshot]);

  // Persist: on stream end (ready / error) write localStorage; throttle a snapshot every 2s while streaming —
  // so switching sessions / refreshing mid-generation doesn't evaporate the streamed-out parts and completed tool outputs.
  // On first mount status is already 'ready' (also when restoring/switching to an old session) — skip that one,
  // otherwise merely opening an old session refreshes its updatedAt and scrambles the history ordering.
  messagesRef.current = messages;
  const persistSessionState = useCallback(
    (nextSkillId: StudioScenarioSkillId) => {
      if (messagesRef.current.length > 0)
        onSnapshot(compactStudioChatMessages(effectiveStudioTurnMessages(messagesRef.current, turnLedgerRef.current)), nextSkillId);
    },
    [onSnapshot],
  );
  const onProjectSkillRef = useRef(onProjectSkill);
  onProjectSkillRef.current = onProjectSkill;
  const applySkill = useCallback(
    (nextSkillId: StudioScenarioSkillId) => {
      if (skillRef.current === nextSkillId) return;
      skillRef.current = nextSkillId;
      setSkillId(nextSkillId);
      persistSessionState(nextSkillId);
      onProjectSkillRef.current?.(nextSkillId);
    },
    [persistSessionState],
  );
  // The project's Skill changed elsewhere (another thread, a brand bringing its Skill): follow it.
  useEffect(() => {
    if (projectSkillId === undefined || projectSkillId === skillRef.current) return;
    skillRef.current = projectSkillId as StudioScenarioSkillId;
    setSkillId(projectSkillId as StudioScenarioSkillId);
  }, [projectSkillId]);
  const statusSnapshotActivationRef = useRef<DeferredActivation | null>(null);
  if (!statusSnapshotActivationRef.current)
    statusSnapshotActivationRef.current = new DeferredActivation();
  useEffect(() => {
    if (!statusSnapshotActivationRef.current!.active)
      return statusSnapshotActivationRef.current!.defer();
    if (status === "ready" || status === "error")
      onSnapshot(compactStudioChatMessages(effectiveStudioTurnMessages(messagesRef.current, turnLedgerRef.current)), skillRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
  const busy = status === "streaming" || status === "submitted" || activeTools > 0;
  const taskInProgress = busy || latestTask(messages)?.state === 'running';
  // The workbench pauses output switching while a turn runs: a mid-run switch retargets every
  // later tool call (a real run dropped one output's picture-in-picture into another).
  const onBusyChangeRef = useRef(onBusyChange);
  onBusyChangeRef.current = onBusyChange;
  useEffect(() => {
    onBusyChangeRef.current?.(taskInProgress);
    return () => onBusyChangeRef.current?.(false);
  }, [taskInProgress]);

  const sceneState = sceneAgentState(messages, taskInProgress, status === 'error');
  const onSceneStateChangeRef = useRef(onSceneStateChange);
  onSceneStateChangeRef.current = onSceneStateChange;
  useEffect(() => { onSceneStateChangeRef.current?.(sceneState); }, [sceneState]);

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
    onSnapshot(compactStudioChatMessages(timedMessages), skillRef.current);
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
      if (userStoppedRef.current || latestTask(messagesRef.current)?.state === 'paused') return; // the user killed this turn — don't resurrect it
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
      () => onSnapshot(compactStudioChatMessages(effectiveStudioTurnMessages(messagesRef.current, turnLedgerRef.current)), skillRef.current),
      2000,
    );
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);
  // Unmount mid-generation (switching session/new chat triggers key remount): stop the stream + snapshot the last moment —
  // otherwise fetch keeps running and onToolCall mutates the work in the background while the UI is already gone.
  // Non-generating unmount doesn't snapshot (glance at an old session then switch away shouldn't refresh its updatedAt).
  const busyRef = useRef(busy);
  busyRef.current = taskInProgress;
  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(
    () => () => {
      if (!busyRef.current) return;
      // A conversation switch unmounts this component. Stopping only the model stream
      // leaves the client-side tool alive, so a slow generator can mutate the timeline
      // after the user has moved to a new chat or cleared the cut.
      userStoppedRef.current = true;
      toolAbortsRef.current.forEach(controller => controller.abort());
      try {
        void stopRef.current();
      } catch {
        /* already ended */
      }
      const task = latestTask(messagesRef.current);
      const saved = effectiveStudioTurnMessages(messagesRef.current, turnLedgerRef.current);
      onSnapshot(compactStudioChatMessages(task ? patchTask(saved, task.id, current => ({ ...current, state: 'paused' })) : saved), skillRef.current);
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
        /** The tool this message's first step must call (a one-click edit starts with the rough cut). */
        startTool?: string;
        /** Explicit initial whiteboard generation; local follow-up edits do not opt in. */
        wholeWhiteboard?: boolean;
        /** A note for the agent ahead of the message (one-click edit context). */
        hint?: string;
        resume?: ChatTask;
      } = {},
    ): Promise<boolean> => {
      const draftParts: StudioChatDraftPart[] =
        typeof draft === "string"
          ? [{ type: "text", text: draft.trim() }]
          : draft;
      const hasContent = draftParts.some(
        (part) => part.type === "timeline-frame" || part.text.trim().length > 0,
      );
      if (!hasContent || status === "streaming" || status === "submitted" || toolAbortsRef.current.size > 0)
        return false;
      if (!options.preserveAutoRecoveryAttempt)
        autoRecoveryAttemptedRef.current = false;
      userStoppedRef.current = false; // a new message re-arms the continuation safety net
      interactionWaitDurationRef.current = 0;
      turnLedgerRef.current = createStudioTurnLedger();
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
          timelineFrames = await inspectTimelineFrameEvidence(attachedTimelineFrames, { signal: ctrl.signal, ...(projectId ? { projectId } : {}) });
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
      // v3: no snapshot rides along (the agent pulls get_state); only a frozen hint naming what the user @mentioned,
      // so the cached prompt prefix stays byte-stable across turns.
      const mentionedIds = [...new Set(
        draftParts.flatMap((part) => (part.type === "text" ? [...part.text.matchAll(/@([A-Za-z0-9_:./-]+)/g)].map((m) => m[1]!) : [])),
      )];
      // The switched-on skills shape the project's first edit; once it is edited, the creator asks in words.
      const continuing = options.resume ?? (/^(继续|继续剪辑|继续粗剪|continue|resume)[。.!！]?$/i.test(typeof draft === 'string' ? draft.trim() : '') && latestTask(messagesRef.current)?.state !== 'done' ? latestTask(messagesRef.current) : undefined);
      const outputId = (getBodyRef.current().output as { id?: string } | undefined)?.id;
      if (continuing?.outputId && continuing.outputId !== outputId) { setTaskResumeError(true); return false; }
      setTaskResumeError(false);
      const config = continuing?.config ?? resolveEditingRunConfig({ brand: projectBrandRef.current, skills: continuing?.mode === 'one-click' ? continuing.skills : editingSkillsRef.current });
      const source = localAssetIndex?.find(asset => asset.kind === 'video' || !asset.kind);
      const task: ChatTask = continuing ? { ...resumeEditingTask(continuing), config, skillId: continuing.skillId ?? skillRef.current, review: undefined, agentModel: agentModelRef.current, reviewRequired: continuing.reviewRequired || continuing.mode === 'one-click', state: 'running' } : {
        id: mid('task'), ...(outputId ? { outputId } : {}), goal: draftParts.flatMap(part => part.type === 'text' ? [part.text] : []).join('\n'),
        skills: options.startTool ? config.skills : [],
        config, skillId: skillRef.current, agentModel: agentModelRef.current, reviewRequired: !!options.startTool || !!options.wholeWhiteboard,
        directorPlanRequired: needsDirectorPlan({ skills: config.skills, config }, { oneClick: !!options.startTool, wholeWhiteboard: !!options.wholeWhiteboard }),
        ...((options.startTool || options.wholeWhiteboard) && source ? { source: { name: source.label, ...(source.durationSec != null ? { durationSec: source.durationSec } : {}), ...(source.posterKey ? { posterKey: source.posterKey } : {}) } } : {}),
        mode: options.startTool ? 'one-click' : 'request', state: 'running',
      };
      const startTool = continuing?.mode === 'one-click' && (!continuing.roughCut || unfinishedRoughCut(continuing)) ? ROUGH_CUT_TOOL : options.startTool;
      const mentionHint = [
        continuing ? resumeTaskHint(task) : options.hint ?? "",
        mentionedIds.length ? `Referenced elements in this message (use these ids directly): ${JSON.stringify(mentionedIds)}` : "",
        localAssetContext,
        continuing ? editingSkillsHint(task.skills, V3_CHAT_TOOL_IDS) : projectEditedRef.current ? "" : editingSkillsHint(editingSkillsRef.current, V3_CHAT_TOOL_IDS),
      ].filter(Boolean).join("\n");
      const metadata = {
        task,
        workStartedAt: Date.now(),
        ...(mentionHint ? { mentionHint } : {}),
        ...(timelineFrames.length ? { timelineFrames } : {}),
        ...(options.studioAction ? { studioAction: options.studioAction, skillDraft: skillDraftContext() } : {}),
        ...(startTool ? { startTool } : {}),
      };
      const userMessage: UIMessage = {
        id: mid("user"), role: "user", metadata,
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
      };
      messagesRef.current = [...messagesRef.current, userMessage];
      onSnapshot(compactStudioChatMessages(messagesRef.current), skillRef.current);
      void sendMessage(userMessage);
      return true;
    },
    [elements, localAssetIndex, sendMessage, status, onSnapshot],
  );

  // Fine-cut rows describe observed additions. Zero additions remain unfulfilled, never inferred unnecessary.
  const fineCutFor = (message: UIMessage, task: ChatTask | undefined, live: boolean): RoughCutReplyMeta['fineCut'] => {
    if (task?.mode !== 'one-click') return undefined;
    if (!live && task.state !== 'running' && task.fineCut) return task.fineCut;
    const receipt = message.parts.find(part => toolNameOfPart(part) === ROUGH_CUT_TOOL) as { output?: { data?: { baseline?: Record<FineCutSkill, string[]> } } } | undefined;
    const baseline = task.fineCutBaseline ?? receipt?.output?.data?.baseline;
    const now = fineCutClips?.();
    const enabled = FINE_CUT_SKILLS.filter(id => task.skills.includes(id) || id === 'graphics' && task.config?.visual?.headlines);
    if (!baseline || !now) return { state: 'done', items: enabled.map(id => ({ id, count: 0, status: 'stopped' })) };
    return { state: live ? 'running' : 'done', items: enabled.map(id => {
      const count = now[id].filter(clip => !baseline[id].includes(clip)).length;
      return { id, count, status: live ? 'running' : count ? 'done' : task.state === 'paused' || unfinishedRoughCut(task) ? 'stopped' : 'not-added' };
    }) };
  };
  useEffect(() => {
    if (busy) return;
    const task = latestTask(messagesRef.current);
    const last = messagesRef.current.at(-1);
    if (!task || task.state !== 'running') return;
    if (status === 'error' || userStoppedRef.current) {
      updateTask(task.id, current => ({ ...current, state: 'paused' }));
      return;
    }
    if (last?.role !== 'assistant') return;
    if (lastAssistantMessageIsCompleteWithToolCalls({ messages: messagesRef.current })) return;
    if (last.parts.some(part => ['input-streaming', 'input-available'].includes((part as { state?: string }).state ?? ''))) return;
    const fine = fineCutFor(last, task, false);
    const state = unfinishedRoughCut(task) || task.reviewRequired && needsEditingReview(task) && !task.review?.completed || unresolvedTaskFailure(messagesForTask(messagesRef.current, task.id)) || !assistantTurnEndedWithAnswer(last) ? 'partial' : 'done';
    updateTask(task.id, current => ({ ...current, state, ...(fine ? { fineCut: fine } : {}) }));
  }, [busy, status, messages]);

  // A next step goes at the end of the message being written, to edit and send.
  const fillRequest = useCallback((request: string) => {
    composerRef.current?.insertText(request);
  }, []);

  // A newly created project's model may arrive with the asynchronously loaded document.
  // Resolve it before the startup effect sends the first request; never overwrite a user's pick.
  useEffect(() => {
    if (modelSelectedRef.current || initialAgentModel === undefined || messagesRef.current.length) return;
    const selected = studioAgentModelId(initialAgentModel);
    agentModelRef.current = selected;
    modelSelectedRef.current = true;
    setAgentModel(selected);
  }, [initialAgentModel]);

  // A project made from the Studio home opens with its first message: sent once, when the thread is idle,
  // as a one-click edit that starts with the rough cut.
  const startSentRef = useRef(false);
  useEffect(() => {
    if (!startPrompt?.trim() || startSentRef.current || status !== "ready") return;
    startSentRef.current = true;
    // A reload after saving the first message must not start it a second time.
    // With nothing switched on (no brand) the message is the creator's own request, not a one-click edit.
    const roughCut = startWithRoughCut(skillRef.current) && resolveEditingRunConfig({ brand: projectBrandRef.current, skills: editingSkillsRef.current }).skills.length > 0;
    if (alreadyStarted(messagesRef.current, startPrompt, roughCut)) { onStartPromptSent?.(); return; }
    void run(startPrompt, roughCut ? { startTool: ROUGH_CUT_TOOL, hint: firstPassStartupHint() } : { wholeWhiteboard: skillRef.current === 'whiteboard-explainer' }).then(sent => {
      if (sent) onStartPromptSent?.(); else startSentRef.current = false;
    });
  }, [startPrompt, status, run, onStartPromptSent]);

  // A failed stream may already have committed tools. Re-generating the old assistant message
  // erases its receipts while keeping the client-side call counter, so the apparent retry can
  // duplicate edits or immediately hit the old turn's ceiling. Resume as a NEW user turn instead:
  // that gives the server a fresh composition snapshot and resets both execution counters.
  const continueFromCurrentState = useCallback(
    () => {
      const studioAction = latestStudioMetaAction(messagesRef.current);
      return run(t("chatGen.continueAfterInterruptionPrompt"), {
        resume: latestTask(messagesRef.current),
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
      ) ||
      // A turn that already delivered its answer was not interrupted; a transport error after it
      // must not re-prompt the model into "finishing" what it deliberately left to the user.
      assistantTurnEndedWithAnswer(
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
        ) ||
        assistantTurnEndedWithAnswer(
          messagesRef.current[messagesRef.current.length - 1],
        )
      ) return;
      autoRecoveryAttemptedRef.current = true;
      const studioAction = latestStudioMetaAction(messagesRef.current);
      run(t("chatGen.continueAfterInterruptionPrompt"), {
        preserveAutoRecoveryAttempt: true,
        resume: latestTask(messagesRef.current),
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
    toolAbortsRef.current.forEach(controller => controller.abort());
    void stop();
    const task = latestTask(messagesRef.current);
    if (task) updateTask(task.id, current => ({ ...current, state: 'paused' }));
  }, [stop, onSnapshot]);
  useEffect(() => {
    const leave = () => { if (busyRef.current) handleStop(); };
    window.addEventListener('pagehide', leave);
    return () => window.removeEventListener('pagehide', leave);
  }, [handleStop]);

  const switchSkill = useCallback((nextSkillId: StudioScenarioSkillId) => {
    applySkill(nextSkillId);
    const defaultPrompt = nextSkillId === STUDIO_AUTO_SKILL_ID
      ? null
      : scenarioSkills.find((skill) => skill.id === nextSkillId)?.defaultPrompt ?? null;
    composerRef.current?.applySkillPrompt(defaultPrompt);
  }, [applySkill, scenarioSkills]);
  // A Skill picked in the composer: switching away from the project's Skill, or onto one that would drop
  // the project's brand, asks first.
  const [pendingSkill, setPendingSkill] = useState<StudioScenarioSkillId | null>(null);
  const pickSkill = useCallback((nextSkillId: StudioScenarioSkillId) => {
    const leavesSkill = !!projectSkillId && projectSkillId !== STUDIO_AUTO_SKILL_ID;
    const dropsBrand = !!projectBrand && !skillTakesBrand(nextSkillId);
    if (onProjectSkillRef.current && nextSkillId !== skillRef.current && (leavesSkill || dropsBrand)) {
      setPendingSkill(nextSkillId);
      return;
    }
    switchSkill(nextSkillId);
  }, [projectSkillId, projectBrand, switchSkill]);

  // Expose "one-tap film" progress + selected pill to the workbench.
  useImperativeHandle(
    handleRef,
    () => ({
      coverContext(outputId?: string) {
        const tasks = messagesRef.current.map(taskOf).filter(task => task && (!outputId || !task.outputId || task.outputId === outputId));
        const latest = tasks.at(-1); const plan = tasks.findLast(task => task?.directorPlan)?.directorPlan;
        return { request: latest?.goal, direction: plan?.direction, brandTreatment: plan?.brandTreatment };
      },
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
      runSkill(nextSkillId, text) {
        applySkill(nextSkillId as StudioScenarioSkillId);
            run(text);
      },
      insertText(text) {
        composerRef.current?.insertText(text);
      },
      focusInput() {
        composerRef.current?.focusInput();
      },
      beginGeneration(intent, prompt) {
        composerRef.current?.beginGeneration(intent, prompt);
      },
      insertMention(el) {
        composerRef.current?.insertMention(el);
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
    [setMessages, run, applySkill],
  );

  const empty = messages.length === 0;
  const shownEditingSkills = useMemo(() => resolveEditingRunConfig({ brand: projectBrand, skills: editingSkills }).skills, [projectBrand, editingSkills]);
  // The project's first message on footage not yet edited is the one-click edit those switches describe,
  // worded as when the Studio home hands a video over: the edit, then what the creator asked for.
  // Why one-click edit cannot start yet, shown on hover; the rerender that brings footage clears it.
  const startBlocked = !footageToEdit(getDocument?.()) ? t('chatGen.importVideoFirst') : !shownEditingSkills.length ? t('chatGen.turnOnASkill') : '';
  const submit = useCallback((draft: string | StudioChatDraftPart[]) => {
    if (!firstMessageEditsFootage(getDocument?.(), messagesRef.current, skillRef.current, shownEditingSkills)) return run(draft);
    return run(firstEditMessage(typeof draft === 'string' ? [{ type: 'text', text: draft }] : draft), { startTool: ROUGH_CUT_TOOL, hint: firstPassStartupHint() });
  }, [run, getDocument, shownEditingSkills]);
  // One-click edit takes the path a video handed over from the Studio home takes, whatever the box holds.
  const startEdit = useCallback(() => run(firstEditMessage([]), { startTool: ROUGH_CUT_TOOL, hint: firstPassStartupHint() }), [run]);

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
              {/* What the first edit of this footage does, until it is edited; afterwards the creator asks in words. */}
              {!projectEdited && onEditingSkills && (
                <EditingSkillSwitches value={shownEditingSkills} onChange={onEditingSkills} disabled={busy} />
              )}
              {!projectEdited && onEditingSkills && startWithRoughCut(skillId) && (
                <TooltipProvider delayDuration={200}>
                  <Tooltip open={startBlocked ? undefined : false}>
                    {/* A disabled button takes no pointer events: the wrapper carries the hover. */}
                    <TooltipTrigger asChild>
                      <span tabIndex={startBlocked ? 0 : -1} className="block w-full max-w-[344px]">
                        <button type="button" disabled={busy || !!startBlocked} onClick={() => void startEdit()}
                          className="bg-ink text-canvas w-full rounded-lg px-4 py-2 text-[12.5px] font-medium disabled:pointer-events-none disabled:opacity-40">
                          {t('chatGen.startEdit')}
                        </button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{startBlocked}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          ) : (
            messages.map((m, mi) => {
              const displayMessage = compactStudioChatMessages([m])[0] ?? m;
              const parts = (displayMessage.parts ?? []) as ToolPartLike[];
              // Collapse consecutive export status polls (only step-starts between them): render just
              // the last of each run — a polling agent otherwise buries the conversation in a column
              // of identical progress badges. Polls separated by real text keep rendering.
              const collapsed = collapsedComponentRetryIndexes(parts);
              for (let i = 0; i < parts.length; i++) {
                if (parts[i]!.type !== "tool-export") continue;
                let j = i + 1;
                while (j < parts.length && parts[j]!.type === "step-start") j++;
                if (j < parts.length && parts[j]!.type === "tool-export")
                  collapsed.add(i);
              }
              // Older runs (and a model ignoring the new vectorized schema) can emit one precise-
              // framing call per shot. Adjacent calls separated only by SDK step markers become one
              // visual receipt; message history/tool outputs remain untouched.
              const framingGroups = new Map<number, ToolPartLike[]>();
              const isFraming = (part: ToolPartLike) =>
                part.type === "tool-set_clip_framing" ||
                (part.type === "dynamic-tool" &&
                  part.toolName === "set_clip_framing");
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
              const originTask = taskOf([...messages.slice(0, mi)].reverse().find(item => item.role === 'user'));
              const savedTask = originTask ? [...messages].reverse().map(taskOf).find(task => task?.id === originTask.id) ?? originTask : undefined;
              const messageTask = savedTask ? displayEditingTask(savedTask, messagesForTask(messages, savedTask.id)) : undefined;
              const wholeVideo = messageTask?.mode === 'one-click';
              const taskMessages = messageTask ? messagesForTask(messages, messageTask.id) : [];
              const taskAnchor = wholeVideo && m.role === 'assistant' && taskMessages.find(item => item.role === 'assistant')?.id === m.id;
              const taskLive = busy && latestTask(messages)?.id === messageTask?.id;
              const finalTextIndex = parts.findLastIndex(part => part.type === 'text');
              const workFold = assistantWorkFold(m, !isLast || status === "ready");
              const workFoldAvailable = !wholeVideo && workFold !== null;
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
              if (m.role === 'assistant' && !taskAnchor && (!isLast || wholeVideo) && !parts.some((part, index) =>
                part.type === 'text' ? !!(part as { text?: string }).text?.trim() && (!wholeVideo || index === finalTextIndex && !(busy && isLast))
                  : part.type === 'file' || isInteractiveEditingTool(toolNameOfPart(part), !!wholeVideo))) return null;
              return (
                <Message key={m.id} from={m.role}>
                  <div className="flex items-start gap-2">
                    {m.role === "assistant" && <PiAvatar thinking={thinking} />}
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      {taskAnchor && messageTask && <EditingTaskCard coverScene={coverScene} onOpenCover={onOpenCover} task={messageTask} messages={taskMessages} live={taskLive} fine={fineCutFor(m, messageTask, taskLive)}
                        startedAt={(taskMessages.find(item => item.role === 'user')?.metadata as { workStartedAt?: number } | undefined)?.workStartedAt}
                        credits={taskMessages.reduce((sum, item) => sum + messageTurnCredits(item), 0) + (messageTask.roughCut?.report.credits ?? 0) + Object.values(messageTask.lateUsage ?? {}).reduce((sum, value) => sum + value, 0)}
                        onContinue={latestTask(messages)?.id === messageTask.id && !error?.message?.includes('insufficient_tokens') && (['paused', 'partial'].includes(messageTask.state) || status === 'error') ? continueFromCurrentState : undefined} />}
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
                          if (m.role === 'assistant' && wholeVideo && (busy && isLast || idx !== finalTextIndex)) return null;
                          const text = (part as { text?: string }).text ?? "";
                          if (!text) return null;
                          const intentLine = m.role === "user" ? describeGenerationIntentLine(text) : null;
                          if (intentLine) {
                            const kindLabel = t(
                              intentLine.intent === "image" ? "chatGen.intentImage"
                                : intentLine.intent === "video" ? "chatGen.intentVideo"
                                  : intentLine.intent === "audio" ? "chatGen.intentAudio"
                                    : intentLine.intent === "speech" ? "chatGen.intentSpeech"
                                      : "chatGen.intentElement",
                            );
                            return (
                              <MessageContent key={key} className={USER_BUBBLE_CLASS}>
                                <span className={CHAT_ACTION_PILL_CLASS}>
                                  <span className={`${CHAT_PILL_ICON_CLASS} text-accent-ink`}>✦</span>
                                  <span className={CHAT_PILL_LABEL_CLASS}>{intentLine.facts ? `${kindLabel} · ${intentLine.facts}` : kindLabel}</span>
                                </span>
                              </MessageContent>
                            );
                          }
                          return m.role === "user" ? (
                            <MessageContent key={key} className={USER_BUBBLE_CLASS}>
                              <div className="text-[13px] leading-relaxed">
                                {idx === parts.findIndex((candidate) => candidate.type === "text")
                                  && (m.metadata as { studioAction?: unknown } | undefined)?.studioAction === STUDIO_CREATE_SKILL_ACTION && (
                                  <span className={`${CHAT_ACTION_PILL_CLASS} mr-1.5`}>
                                    <span className={`${CHAT_PILL_ICON_CLASS} text-accent-ink`}>✦</span>
                                    <span className={CHAT_PILL_LABEL_CLASS}>{t("chatGen.skill.create.title")}</span>
                                  </span>
                                )}
                                {renderTextWithElementPills(text, elements)}
                              </div>
                            </MessageContent>
                          ) : (
                            splitNextSteps(text).body ? (
                              <MessageContent key={key}>
                                <MessageResponse className="text-[13px] leading-relaxed">
                                  {splitNextSteps(text).body}
                                </MessageResponse>
                              </MessageContent>
                            ) : null
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
                        if (toolNameOfPart(part) === ROUGH_CUT_TOOL) return null;
                        if (
                          part.type.startsWith("tool-") ||
                          part.type === "dynamic-tool"
                        )
                          if (!isInteractiveEditingTool(toolNameOfPart(part), !!wholeVideo)) return null;
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
                                coverScene,
                                onOpenCover,
                                generation: {
                                  onInsertMedia,
                                  onUseAudio,
                                  onApplyCover,
                                  appliedCoverKey: projectCover?.key,
                                  coverDisabled: taskInProgress || coverApplying,
                                  onGenerateCover: onOpenCover,
                                  onUseAsReference: (ref) => {
                                    composerRef.current?.beginGeneration("image");
                                    composerRef.current?.insertMention(ref);
                                  },
                                  onRegenerate: (intent, prompt) => composerRef.current?.beginGeneration(intent, prompt),
                                },
                                onLocate: (sec) =>
                                  void runToolRef.current("seek", {
                                    toSec: sec,
                                  }),
                                getComp,
                                localAssetIndex,
                                projectId,
                              });
                        return null;
                      })}
                      {!wholeVideo && (thinking || busy && isLast && !lastTextLive && !isInteractiveEditingTool(toolNameOfPart(lastPart ?? { type: '' }), false)) && <ThinkingDots />}
                      {!wholeVideo && emptyCompletedAssistant && !['paused', 'partial'].includes(messageTask?.state ?? '') && (
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
                      {!wholeVideo && incompleteCompletedAssistant && !['paused', 'partial'].includes(messageTask?.state ?? '') && (
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
                      {m.role === "assistant" && m.id === messages[messages.length - 1]?.id && !busy && messageTask?.state === 'done' && (
                        <NextSteps
                          steps={parts.flatMap((part) => (part.type === "text" ? splitNextSteps((part as { text?: string }).text ?? "").steps : [])).slice(0, 3)}
                          onPick={fillRequest}
                        />
                      )}
                      {editorialCapacityShortfall !== null && (
                        <div className="border-line bg-panel-2 text-ink-3 flex items-start gap-2 rounded-md border px-2.5 py-2 text-[12px] leading-relaxed">
                          <Info size={13} className="mt-0.5 shrink-0 text-accent-ink" />
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
          {(status === "submitted" || status === "streaming" || status === 'error' || latestTask(messages)?.state === 'paused') &&
            messages[messages.length - 1]?.role === "user" && (
              <Message from="assistant">
                <div className="flex items-start gap-2">
                  <PiAvatar thinking />
                  <div className="min-w-0 flex-1 pt-0.5">
                    {latestTask(messages)?.mode === 'one-click' ? <EditingTaskCard coverScene={coverScene} onOpenCover={onOpenCover} task={latestTask(messages)!} messages={messagesForTask(messages, latestTask(messages)!.id)} live={busy} credits={0} onContinue={!busy && !error?.message?.includes('insufficient_tokens') ? continueFromCurrentState : undefined} /> : <ThinkingDots />}
                  </div>
                </div>
              </Message>
            )}
          {/* Request/stream failed: committed tools are durable, so recovery is a fresh continuation
              from live project state rather than regeneration of stale history. */}
          {error && (latestTask(messages)?.mode !== 'one-click' || error.message?.includes('insufficient_tokens')) && (
            <div className="border-line bg-panel-2 flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12px]">
              <X size={12} className="shrink-0 text-destructive" />
              <span className="min-w-0 flex-1 truncate text-destructive">
                {error.message?.includes("insufficient_tokens")
                  ? t("chatGen.notEnoughCreditsTop")
                  : error.message?.includes("studio_upstream_busy")
                    ? t("chatGen.upstreamBusy")
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
          {taskResumeError && <p role="alert" className="text-ink-3 mx-3 mb-2 text-xs">{t('chatGen.resumeOriginalOutput')}</p>}
          {!busy && status !== 'error' && latestTask(messages)?.mode !== 'one-click' && ['paused', 'partial'].includes(latestTask(messages)?.state ?? '') && (
            <div className="text-ink-3 mx-3 mb-2 flex items-center justify-between gap-2 text-xs" role="status">
              <span>{t('chatGen.workNotFinished')}</span>
              <button type="button" onClick={() => void continueFromCurrentState()} className="text-ink underline underline-offset-2">{t('chatGen.continueFromCurrentState')}</button>
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
        {/* An edit is set up on the Studio home; here the conversation asks in words. */}
        <ConfirmDialog
          open={pendingSkill !== null}
          title={t("chatGen.skill.confirmTitle")}
          description={pendingSkill === null ? undefined : [
            t("chatGen.skill.confirmBody", { name: pendingSkill === STUDIO_AUTO_SKILL_ID ? t("chatGen.skill.auto.title") : scenarioSkills.find((skill) => skill.id === pendingSkill)?.title ?? pendingSkill }),
            projectBrand && !skillTakesBrand(pendingSkill) ? t("chatGen.skill.confirmDropsBrand", { brand: projectBrand.name }) : "",
          ].filter(Boolean).join(" ")}
          confirmLabel={t("chatGen.brand.switch")}
          cancelLabel={t("panels.cancel")}
          onCancel={() => setPendingSkill(null)}
          onConfirm={() => { if (pendingSkill !== null) switchSkill(pendingSkill); setPendingSkill(null); }}
        />
        <Composer
          placeholder={t("chatGen.sayWhatAddChange")}
          agentModel={agentModel}
          onPickAgentModel={id => {
            if (taskInProgress) return;
            modelSelectedRef.current = true;
            agentModelRef.current = id;
            setAgentModel(id);
            onSnapshot(messagesRef.current, skillRef.current);
          }}
          status={taskInProgress ? 'streaming' : status}
          elements={elements}
          skillId={skillId}
          scenarioSkills={scenarioSkills}
          onOpenSkillMarket={onOpenSkillMarket}
          onCreateScenarioSkill={onRefreshScenarioSkills ? createScenarioSkill : undefined}
          onDeleteScenarioSkill={onDeleteScenarioSkill}
          onPickSkill={pickSkill}
          projectBrand={projectBrand}
          timelineFramePickActive={timelineFramePickActive}
          timelineFramePickBusy={timelineFramePickBusy}
          timelineFramePickAvailable={timelineFramePickAvailable}
          onTimelineFramePickActiveChange={onTimelineFramePickActiveChange}
          onSubmit={submit}
          onStop={handleStop}
          methodsRef={composerRef}
        />
      </div>
    </>
  );
}
