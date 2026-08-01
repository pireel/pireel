/**
 * Agent tool dispatcher: executes the studio's agent tools (chat + external MCP bridge) against the live
 * workbench. Extracted from hyperframes-workbench.tsx — the workbench builds an AgentToolCtx from its own
 * state/handlers and delegates here; the tool semantics are unchanged. runStudioTool is the shared surface
 * (internal chat + bridge fallback); runExternalTool adds the BYO-brain-only operations (compose_context /
 * apply_block / capture_frame / plan_context / submit_plan) and falls back to runStudioTool for the rest.
 */

import type { MutableRefObject, SetStateAction } from 'react';
import {
  type AudioClip,
  type Block,
  type CaptionStyle,
  type Composition,
  type CutTransitionEffect,
  type ShotFilter,
  type ShotTreatment,
  type TransitionDirection,
  type VideoShot,
  CAPTION_PRESETS,
  SHOT_TREATMENTS,
  VOLUME_DB_MAX,
  VOLUME_DB_MIN,
  applyBlockPlacement,
  audioClipId,
  audioTrimPatch,
  blockId,
  blockKind,
  compReceiptDelta,
  freeTrack,
  getCaptionPreset,
  isCaptionsOn,
  isSentenceCaption,
  placementFramingNotes,
  renderBlock,
  resolveCaptionStyle,
  shotFilterCss,
  blockOverlapWarnings,
  shotId,
  splitAudioClipAt,
  splitBlockedByTransition,
  totalDuration,
  zoneOf,
} from '@pireel/studio-engine/composition';
import { type CutSeamEntry, finalizeCutSeams, removeEditedInterval, removeEditedRange, spans as clipSpans, srcToEditedLoose, tightenCutRanges } from '@pireel/studio-engine/trim';
import { parseBlockResponse } from '@pireel/studio-engine/compose';
import { HARD_LINT_CODES, lintBlock } from '@pireel/studio-engine/block-lint';
import { type AsrSegment, applyCaptionTranslations, clearCaptionTranslations } from '@pireel/studio-engine/build-blocks';
import { isPlaceholder, layoutFromPlan, placeholderSpec } from '@pireel/studio-engine/build-draft';
import { exportRecommendations } from '@pireel/studio-engine/export-options';
import { interpretApplyRaw } from '@pireel/studio-engine/briefs';
import { type DraftPlan, type PlanInsert, parsePlan, unifiedPlanRows } from '@pireel/studio-engine/plan';
import { inNarrationSource } from '@pireel/studio-engine/captions-relay';
import { studioProviders } from '@pireel/studio-engine/providers';
import type { StudioToolResult } from '@pireel/studio-engine/prompts';
import { imageThumb, imgSourceBase } from '@pireel/ui/image-url';
import { t } from './i18n';
import { type ComposeMode, type ComposedBlock, composedBlockFields, kitChoiceOf } from './compose-result';
import { clearToolProgress, setToolProgress } from './tool-progress';
import { fileSig } from './media';
import { saveLocalVideo } from './local-media';
import { type VisualLabel, type VisualPrep, type VisualTimeline, finishVisualAnalysis, prepareVisualAnalysis } from './visual';
import { type ExportRenderOpts, captureCompositionFrame } from './client-export';
import type { FrameCatalogItem } from './use-frame-catalog';
import type { StudioChatHandle } from './studio-chat';

/** Progress reporter fed to pipeline steps: pushes friendly text (and optional 0–1 fraction) to the tool's chat card. */
type Report = (text: string, frac?: number) => void;

/**
 * Everything the dispatcher borrows from the workbench: refs for the latest state (tool runs are async, setState
 * is not), state setters, and the workbench's own editing handlers. Built fresh each render by the workbench.
 */
export interface AgentToolCtx {
  // Composition state
  compRef: MutableRefObject<Composition>;
  setComp: (action: SetStateAction<Composition>) => void;
  ensureShots: (c: Composition) => VideoShot[];
  /** Cloud project id — undo's history-ring fallback targets it when the in-memory stack is empty. */
  projectId: string;
  // Selection + playhead
  setSelectedId: (id: string | null) => void;
  setSelectedShotId: (id: string | null) => void;
  selectedIdRef: MutableRefObject<string | null>;
  applyT: (v: number) => void;
  tRef: MutableRefObject<number>;
  playStopAtRef: MutableRefObject<number | null>;
  playingRef: MutableRefObject<boolean>;
  setPlaying: (v: boolean) => void;
  seekBlockSettled: (id: string) => void;
  postPreview: (msg: Record<string, unknown>) => void;
  // Undo + generation lock
  pushUndoSnapshot: () => void;
  undoStackRef: MutableRefObject<Composition[]>;
  redoStackRef: MutableRefObject<Composition[]>;
  genIdsRef: MutableRefObject<ReadonlySet<string>>;
  markGenerating: (ids: string[], on: boolean) => void;
  // Sources + transcript
  videoFileRef: MutableRefObject<File | null>;
  clipFilesRef: MutableRefObject<Map<string, File>>;
  asrRef: MutableRefObject<AsrSegment[] | null>;
  setAsrSentences: (segs: AsrSegment[] | null) => void;
  clipAsrRef: MutableRefObject<Record<string, AsrSegment[]>>;
  setClipAsr: (v: Record<string, AsrSegment[]>) => void;
  currentVideo: () => { url: string; durationSec: number; width: number; height: number } | null;
  pickVideoFile: (file: File, opts?: { asSig?: string }) => Promise<void>;
  ensureClipTranscripts: () => Promise<void>;
  transcriptForAgent: () => string;
  // Draft pipeline (ASR / plan / visual)
  stepAsr: (report?: Report) => Promise<AsrSegment[]>;
  stepPlan: (report?: Report) => Promise<DraftPlan>;
  stepVisual: (report?: Report) => Promise<VisualTimeline | null>;
  planRef: MutableRefObject<DraftPlan | null>;
  setPlan: (p: DraftPlan | null) => void;
  visualRef: MutableRefObject<VisualTimeline | null>;
  visualBriefRef: MutableRefObject<VisualPrep | null>;
  applyVisualResult: (vis: VisualTimeline) => void;
  restoreDraftContext: (draft: Composition, vis: VisualTimeline | null) => Promise<Composition>;
  insertedClipsForPlanRef: MutableRefObject<() => Promise<PlanInsert[]>>;
  // Graphics generation
  graphicsRoster: () => { id: string; desc: string }[];
  neighborsFrom: (roster: { id: string; desc: string }[], selfId: string) => string[] | undefined;
  beatsForWindow: (startSec: number, durationSec: number) => { text: string; start: number; end: number }[];
  composeBlockChecked: (
    seed: { id: string; kind: string; innerHtml: string; timelineBody: string; label?: string; boxPx?: { w: number; h: number }; durationSec?: number; beats?: { text: string; start: number; end: number }[]; neighbors?: string[] },
    instruction: string,
    onDelta?: (raw: string) => void,
    opts?: ComposeMode,
  ) => Promise<ComposedBlock>;
  noteOf: (raw: string) => string;
  // Block edits
  moveBlock: (id: string, startSec: number) => void;
  resizeBlock: (id: string, startSec: number, durationSec: number) => void;
  // Video track edits
  setCutTransition: (cutSec: number, effect: CutTransitionEffect | null, direction?: TransitionDirection) => void;
  resizeCutTransition: (shotId: string, durationSec: number) => void;
  setShotTreatment: (sid: string, treatment: ShotTreatment) => void;
  setShotFilter: (sid: string, f: ShotFilter | null) => void;
  setShotAudio: (sid: string, patch: { volumeDb?: number; mute?: boolean; fadeInSec?: number; fadeOutSec?: number }) => void;
  // Audio tracks (use-bgm.ts): mount auto-levels from measured loudness; patch/remove target a clip id
  audioMount: (file: File, label?: string, opts?: { startSec?: number }) => Promise<string | undefined>;
  audioPatch: (id: string, patch: { volumeDb?: number; fadeInSec?: number; fadeOutSec?: number; speed?: number; startSec?: number }) => void;
  audioRemove: (id: string) => void;
  /** Narration denoise (use-denoise.ts): strength = on/retune, null = off; bakes in the background. */
  setDenoise: (strength: number | null) => void;
  splitAtPlayhead: () => void;
  trimAtPlayhead: (side: 'left' | 'right') => void;
  deleteShot: (sid: string) => void;
  videoDurationOf: (url: string) => Promise<number | null>;
  insertClipCore: (url: string, clipDur: number, atWish: number, file?: File) => string;
  // Captions
  setCaptionStyle: (patch: Partial<CaptionStyle>) => void;
  applyCaptionPreset: (preset: string) => Promise<void>;
  removeCaptionLayer: () => void;
  relayCaptionLayer: (blocks: Block[], shots: VideoShot[], segs: AsrSegment[] | null) => Block[];
  // Export
  agentExportRef: MutableRefObject<{ running: boolean; filename: string | null; error: string | null; delivered?: 'local_sink' | 'browser_download'; sinkError?: string }>;
  exportPctRef: MutableRefObject<number>;
  exportVideo: (opts: ExportRenderOpts, sinkUrl?: string) => Promise<{ ok: boolean; filename?: string; error?: string; delivered?: 'local_sink' | 'browser_download'; sinkError?: string }>;
  // Frames + chat handle
  frameCatalogRef: MutableRefObject<FrameCatalogItem[]>;
  chatRef: MutableRefObject<StudioChatHandle | null>;
}

export async function runStudioTool(ctx: AgentToolCtx, toolId: string, input: Record<string, unknown>, opts?: { signal?: AbortSignal }): Promise<StudioToolResult> {
  const {
    compRef, setComp, ensureShots, setSelectedId, setSelectedShotId, selectedIdRef, applyT, tRef, playStopAtRef,
    playingRef, setPlaying, seekBlockSettled, postPreview, pushUndoSnapshot, undoStackRef, redoStackRef, genIdsRef,
    markGenerating, videoFileRef, clipFilesRef, asrRef, setAsrSentences, clipAsrRef, setClipAsr, currentVideo, pickVideoFile,
    ensureClipTranscripts, transcriptForAgent, stepAsr, stepPlan, stepVisual, planRef, visualRef, visualBriefRef,
    applyVisualResult, restoreDraftContext, graphicsRoster, neighborsFrom, beatsForWindow, composeBlockChecked,
    noteOf, moveBlock, resizeBlock, setCutTransition, resizeCutTransition, setShotTreatment, setShotFilter, setShotAudio, audioMount, audioPatch, audioRemove, setDenoise,
    splitAtPlayhead, trimAtPlayhead, deleteShot, videoDurationOf, insertClipCore, setCaptionStyle, applyCaptionPreset,
    removeCaptionLayer, relayCaptionLayer, agentExportRef, exportPctRef, exportVideo, frameCatalogRef, chatRef,
  } = ctx;
      // Models mirror the chat's @id pill syntax into tool args ("blockIds":["@media55_…"]) — the id
      // lookup then misses and the first call of a batch reliably fails. Strip a leading @ from every
      // id-shaped field up front (fresh copy, the message part keeps what the model actually sent).
      {
        const deAt = (v: unknown): unknown =>
          typeof v === 'string' && v.startsWith('@') ? v.slice(1) : Array.isArray(v) ? v.map((x) => (typeof x === 'string' && x.startsWith('@') ? x.slice(1) : x)) : v;
        const idKeys = ['blockId', 'blockIds', 'id', 'ids', 'shotId', 'shotIds'] as const;
        if (idKeys.some((k) => k in input)) {
          input = { ...input };
          for (const k of idKeys) if (k in input) input[k] = deAt(input[k]);
        }
      }
      const c = compRef.current;
      const r1 = (x: unknown) => Math.round(Number(x) * 10) / 10;
      const findBlock = (id: unknown) => c.blocks.find((b) => b.id === id);
      const findShot = (id: unknown) => (c.shots ?? []).find((s) => s.id === id);
      const bname = (b: Block) => b.label?.slice(0, 10) || blockKind(b);
      // Pipeline tools: push friendly progress to this tool's card (matched by toolId), cleared on finish
      const report = (text: string, frac?: number, extra?: { blockIds?: string[] }) => setToolProgress({ id: toolId, text, ...(frac != null ? { frac } : {}), ...(extra ?? {}) });
      // Cooperative stop (chat stop button): long tools honor the signal at SAFE boundaries only —
      // atomic mutations always land whole. Shared dedup'd pipelines (ASR / visual analysis) are
      // never cancelled: race() just stops WAITING for them, they keep running in the background
      // and cache their result for the next call. A stopped tool throws AbortError with a
      // localized message; the chat layer turns it into an output-error receipt.
      const signal = opts?.signal;
      const stopped = () => !!signal?.aborted;
      const abortErr = () => new DOMException(t('workbench.stoppedByUser'), 'AbortError');
      const race = <T,>(p: Promise<T>): Promise<T> =>
        signal
          ? signal.aborted
            ? Promise.reject(abortErr())
            : Promise.race([p, new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(abortErr()), { once: true }))])
          : p;
      // Footage edits ripple the timeline (blocks shift/trim/drop silently, captions relay) — attach the actual
      // before/after diff as data.delta so receipts stay honest and the agent doesn't re-read state between its own edits
      const withDelta = (res: StudioToolResult): StudioToolResult => {
        if (!res.ok) return res;
        const delta = compReceiptDelta(c, compRef.current);
        return delta ? { ...res, data: { ...((res.data as Record<string, unknown> | undefined) ?? {}), delta } } : res;
      };
      // Mutating tools push an undo snapshot first (except query/locate/pure-analysis/undo itself); cap 20
      const READONLY_TOOLS = new Set(['get_block', 'list_assets', 'review_visuals', 'focus_element', 'seek', 'play', 'pause', 'undo', 'extract_asr', 'read_script', 'analyze_narration', 'analyze_visual', 'export_video', 'track_export']);
      // Generation lock: the target block is held by an image-fill/rewrite worker → refuse the change (it would be overwritten by the result, or leave the generation with stale data)
      if (!READONLY_TOOLS.has(toolId)) {
        const targetIds = [input.blockId, ...(Array.isArray(input.blockIds) ? (input.blockIds as unknown[]) : [])].filter(
          (x): x is string => typeof x === 'string',
        );
        const hit = targetIds.find((id) => genIdsRef.current.has(id));
        if (hit) {
          const b = findBlock(hit);
          return { ok: false, error: t('workbench.nameGeneratingEditAfter', { name: b ? bname(b) : hit }) };
        }
      }
      if (!READONLY_TOOLS.has(toolId)) pushUndoSnapshot(); // same entry: agent changes also void the redo line
      try {
        switch (toolId) {
          case 'extract_asr': {
            if (!videoFileRef.current) return { ok: false, error: t('common.uploadVideoFirst') };
            try {
              const segs = await race(stepAsr(report));
              if (!segs.length) return { ok: false, error: t('workbench.noSpeechDetectedTry') };
              // Transcribe inserted clips too — the agent's script must include them (otherwise in the one-click-render chat
              // it only saw the main-video script, and answering "what did the inserted clip say" needs a later read; user hit this)
              if ((compRef.current.shots ?? []).some((s) => s.src)) await ensureClipTranscripts();
              // The full text enters the feed with the receipt (injected once, cached after): the situation snapshot doesn't carry the script
              return { ok: true, summary: t('workbench.transcribedNLines', { n: segs.length }), data: { transcript: transcriptForAgent() } };
            } finally {
              clearToolProgress(toolId);
            }
          }
          case 'read_script': {
            if (!asrRef.current?.length) return { ok: false, error: t('workbench.noTranscriptYetRun') };
            await ensureClipTranscripts(); // transcribe missing insert sources on demand (the failure blacklist avoids re-burning ASR)
            return { ok: true, summary: t('workbench.readTranscript'), data: { transcript: transcriptForAgent() } };
          }
          case 'load_local_source': {
            // Agent local-import fast path: pull the video bytes straight from the import helper's
            // on-machine HTTP server (no cloud round-trip), seed the OPFS library by sig, and set it
            // as the main video. Receipt is English (bridge-internal, relayed to the helper/agent).
            const url = typeof input.localUrl === 'string' ? input.localUrl : '';
            const sig = typeof input.sig === 'string' ? input.sig : '';
            if (!url || !sig) return { ok: false, error: 'localUrl and sig required' };
            try {
              const resp = await fetch(url);
              if (!resp.ok) return { ok: false, error: `local fetch failed: HTTP ${resp.status}` };
              const blob = await resp.blob();
              const name = typeof input.filename === 'string' && input.filename ? input.filename : 'import.mp4';
              const file = new File([blob], name, {
                type: blob.type?.startsWith('video/') ? blob.type : 'video/mp4',
              });
              await saveLocalVideo(file, sig);
              await pickVideoFile(file, { asSig: sig });
              // Seed the transcript the helper already produced (pickVideoFile cleared it) so the
              // agent's read_script/cut_narration work without re-running ASR in the browser.
              const segs = Array.isArray(input.transcript) ? (input.transcript as AsrSegment[]) : [];
              if (segs.length) {
                setAsrSentences(segs);
                asrRef.current = segs;
              }
              return { ok: true, summary: `local source loaded into the studio${segs.length ? ` · ${segs.length} transcript sentences` : ''}` };
            } catch (e) {
              return { ok: false, error: `local source load failed: ${e instanceof Error ? e.message : String(e)}` };
            }
          }
          case 'analyze_narration': {
            if (!videoFileRef.current) return { ok: false, error: t('common.uploadVideoFirst') };
            try {
              const plan = await stepPlan(report);
              return { ok: true, summary: t('workbench.plannedNScenes', { n: plan.scenes?.length ?? 0 }) };
            } finally {
              clearToolProgress(toolId);
            }
          }
          case 'analyze_visual': {
            if (!videoFileRef.current) return { ok: false, error: t('common.uploadVideoFirst') };
            try {
              const vis = await race(stepVisual(report));
              return vis
                ? { ok: true, summary: t('workbench.visualAnalysisDoneSegs', { segs: vis.segments.length, cuts: vis.cuts.length }) }
                : { ok: false, error: t('workbench.visualAnalysisFoundNothingWhy') };
            } finally {
              clearToolProgress(toolId);
            }
          }
          case 'visual_brief': {
            // BYO visual semantic analysis: the free parts (cuts/frame extraction/geometry/background) run locally, and the
            // sampled frames are returned as images for the external agent to look at itself — no in-house VLM burned. The agent submits labels via submit_visual after looking.
            const vv = currentVideo();
            if (!videoFileRef.current || !vv) return { ok: false, error: t('common.uploadVideoFirst') };
            if (visualRef.current) {
              return { ok: true, summary: t('workbench.visualAnalysisAlreadyAvailable'), data: { status: 'done', segments: visualRef.current.segments.length, hint: 'visual analysis already available — no need to look/submit' } };
            }
            try {
              const r = await prepareVisualAnalysis(videoFileRef.current, vv.durationSec, (done, tot) => report(t('workbench.geometryPassPct', { pct: tot ? Math.round((done / tot) * 100) : 0 }), tot ? done / tot : 0));
              if ('cached' in r) {
                applyVisualResult(r.cached);
                return { ok: true, summary: t('workbench.visualAnalysisCacheHit'), data: { status: 'done', segments: r.cached.segments.length } };
              }
              visualBriefRef.current = r.prep;
              return {
                ok: true,
                summary: t('workbench.preparedNSampledFrames', { n: r.prep.frames.length }),
                data: {
                  frames: r.prep.frames.map((f, i) => ({ index: i, at_sec: Math.round(f.timestamp * 10) / 10 })),
                  instruction:
                    'Look at each attached frame (index order matches `frames`) and label it, then call submit_visual with labels. Per frame: content = talkinghead|screen|broll|slide|other; person = left|center|right|none (where the speaker is); safe = left|right|top|bottom|full|none (largest empty region for graphics); has_text = burned-in text visible?; desc = one short English sentence.',
                },
                images: r.prep.frames.map((f) => ({ data: f.base64, mimeType: f.mime })),
              };
            } finally {
              clearToolProgress(toolId);
            }
          }
          case 'submit_visual': {
            const prep = visualBriefRef.current;
            if (!prep) return { ok: false, error: t('workbench.runVisualBriefFirst') };
            const rawLabels = Array.isArray(input.labels) ? (input.labels as Record<string, unknown>[]) : [];
            const CONTENTS = new Set(['talkinghead', 'screen', 'broll', 'slide', 'other']);
            const PERSONS = new Set(['left', 'center', 'right', 'none']);
            const SAFES = new Set(['left', 'right', 'top', 'bottom', 'full', 'none']);
            const labels: (VisualLabel | null)[] = prep.frames.map(() => null);
            for (const l of rawLabels) {
              const i = Number(l.index);
              if (!Number.isInteger(i) || i < 0 || i >= labels.length) continue;
              labels[i] = {
                content: CONTENTS.has(String(l.content)) ? (String(l.content) as VisualLabel['content']) : 'other',
                person: PERSONS.has(String(l.person)) ? (String(l.person) as VisualLabel['person']) : 'center',
                safe: SAFES.has(String(l.safe)) ? (String(l.safe) as VisualLabel['safe']) : 'full',
                hasText: l.has_text === true || l.hasText === true,
                desc: typeof l.desc === 'string' ? l.desc.slice(0, 200) : '',
              };
            }
            if (!labels.some(Boolean)) return { ok: false, error: t('workbench.labelsEmptyAllIndexes') };
            const vis = finishVisualAnalysis(prep, labels);
            visualBriefRef.current = null;
            applyVisualResult(vis);
            return { ok: true, summary: t('workbench.visualAnalysisDoneByo', { segs: vis.segments.length, cuts: vis.cuts.length }), data: { segments: vis.segments.length, cuts: vis.cuts.length } };
          }
          case 'lay_out': {
            const v = currentVideo();
            if (!v || !videoFileRef.current) return { ok: false, error: t('common.uploadVideoFirst') };
            try {
              const segs = await race(stepAsr(report));
              if (!segs.length) return { ok: false, error: t('workbench.noSpeechDetectedTry') };
              // Planning ‖ visual analysis in parallel (visual is the long pole, progress driven by it)
              const [plan, vis] = await race(Promise.all([stepPlan(report), stepVisual(report)]));
              report(t('workbench.cuttingShots'));
              const draft = await restoreDraftContext(
                layoutFromPlan(plan, { video: v, sentences: segs, ...(vis ? { cuts: vis.cuts, visual: vis } : {}) }),
                vis,
              );
              if (stopped()) throw abortErr(); // stop before the write: analyses stay cached, the storyboard is not applied
              setComp(draft);
              setSelectedId(null);
              setSelectedShotId(null);
              applyT(0);
              const slots = draft.blocks.filter(isPlaceholder).length;
              // Deterministic collision receipt: the visual review samples only the atSecs the agent
              // picks, so a colliding pair in an unsampled window ships silently — report it as data.
              const overlaps = blockOverlapWarnings(draft.blocks);
              // Don't resend the situation snapshot within the round: the new structure's ids come with the receipt, so later add_graphics/focus can target precisely
              return {
                ok: true,
                summary: slots
                  ? t('workbench.shotsDoneWithSlots', { shots: draft.shots?.length ?? 0, slots })
                  : t('workbench.shotsDoneNoSlots', { shots: draft.shots?.length ?? 0 }),
                data: {
                  shots: (draft.shots ?? []).map((s, i) => ({ id: s.id, index: i + 1, srcStart: s.srcStart, srcEnd: s.srcEnd, treatment: s.treatment })),
                  placeholderBlocks: draft.blocks.filter(isPlaceholder).map((b) => ({ id: b.id, label: b.label })),
                  ...(overlaps.length ? { overlaps, overlapHint: 'these block pairs share a time window and their boxes collide — separate them (place_block) and re-review those atSecs' } : {}),
                },
              };
            } finally {
              clearToolProgress(toolId);
            }
          }
          case 'add_graphics': {
            if (!videoFileRef.current) return { ok: false, error: t('common.uploadVideoFirst') };
            if (genIdsRef.current.size) return { ok: false, error: t('workbench.graphicsRewriteAlreadyProgress') };
            const lockedIds: string[] = []; // placeholders locked by this run; finally unlocks as a fallback (an exception break leaves no deadlock)
            try {
              // Do the shot layout first if there are none (placeholders not yet placed). The setComp wrapper writes compRef synchronously, so reading here gets the new draft (no more empty-handed old blocks)
              if (!compRef.current.blocks.some(isPlaceholder)) {
                report(t('workbench.cuttingShotsFirst'));
                const v = currentVideo();
                const segs = await race(stepAsr(report));
                if (!v || !segs.length) return { ok: false, error: t('workbench.noSpeechDetectedTry') };
                const [plan, vis] = await race(Promise.all([stepPlan(report), stepVisual(report)]));
                // Same backfill as lay_out: preserve design state + reinsert inserted clips (this path was a simplified duplicate before,
                // so saying "add graphics" right after inserting a clip would drop the whole inserted clip)
                const draft = await restoreDraftContext(
                  layoutFromPlan(plan, { video: v, sentences: segs, ...(vis ? { cuts: vis.cuts, visual: vis } : {}) }),
                  vis,
                );
                if (stopped()) throw abortErr(); // same as lay_out: don't apply the storyboard after a stop
                setComp(draft);
              }
              let allSlots = compRef.current.blocks.filter(isPlaceholder);
              // Optional blockIds: only (re)fill the specified placeholders (the agent's "redo the 3rd one" doesn't run everything).
              // An EMPTY array means "all" (models regularly send [] instead of omitting the field) — never treat it as a filter.
              const wantList = Array.isArray(input.blockIds) ? (input.blockIds as unknown[]).map(String) : null;
              const wantIds = wantList?.length ? new Set(wantList) : null;
              if (wantIds) {
                // Explicit ids may also name FILLED components → regenerate them in place. What "redo"
                // covers is the model's call (user intent lives there); the tool only makes it expressible.
                const regen = compRef.current.blocks.filter(
                  (b) => wantIds.has(b.id) && !isPlaceholder(b) && (b.templateId === 'custom' || b.templateId.startsWith('kit:')),
                );
                allSlots = [...allSlots.filter((b) => wantIds.has(b.id)), ...regen];
              }
              if (!allSlots.length) {
                if (wantIds) {
                  // Stale ids (a fresh lay_out renumbers the slots): name the CURRENT pending ids in the
                  // receipt so the model can retarget instead of declaring the state out of sync and giving up
                  const pending = compRef.current.blocks.filter(isPlaceholder).map((b) => b.id);
                  return {
                    ok: false,
                    error: pending.length
                      ? t('workbench.specifiedBlocksNotGraphicPending', { ids: pending.join(', ') })
                      : t('workbench.specifiedBlocksNotGraphic'),
                  };
                }
                // Shots ran but not a single placeholder landed → be honest: the plan didn't produce fillable graphics, it's not a "do the layout first" case
                const p = planRef.current;
                return {
                  ok: false,
                  error: p
                    ? t('workbench.shotsDoneButNo', { n: p.scenes.length })
                    : t('workbench.noGraphicPlaceholdersCut'),
                };
              }
              const slots = allSlots; // fill all placeholders at once (the original test-phase 10-item cap was removed)
              // Lock on enqueue (blocks awaiting generation can't be edited either), unlock each block the moment it finishes (or fails)
              lockedIds.push(...slots.map((s) => s.id));
              markGenerating(lockedIds, true);
              // Concurrent image fill (blocks are independent, wall-clock ≈ 1/CONCURRENCY): a worker pool grabs from the queue, errors are skipped without spoiling the batch
              const CONCURRENCY = 3;
              let done = 0;
              let failed = 0;
              let skipped = 0; // deliberate model vetoes (moment carries nothing) — slots removed, not failures
              const queue = [...slots];
              // Neighbor list (component + gist, in time order): fed to each compose so the model actively differs from adjacent components (anti-monotony).
              // Takes the graphic slots of the whole composition (placeholders + already-filled custom) — even when re-filling one, it can see what's around it.
              const roster = graphicsRoster();
              // Warm up insert-source transcripts: an insert-window placeholder's beats need its own source's sentences (a cold cache = missing beats)
              if ((compRef.current.shots ?? []).some((s) => s.src)) await ensureClipTranscripts();
              // blockIds ride along on every progress update (the store replaces entries wholesale):
              // the chat card uses them to preview the batch live while it generates
              const slotIds = slots.map((s) => s.id);
              report(t('workbench.graphics0Total', { total: slots.length }), 0, { blockIds: slotIds });
              const fillOne = async (slot: Block) => {
                const boxPx = slot.box
                  ? { w: Math.round(slot.box.w * compRef.current.width), h: Math.round(slot.box.h * compRef.current.height) }
                  : undefined;
                // Narration sentences within this placeholder's time window → local-time beats (logic in beatsForWindow, shared with BYO compose_context)
                const beats = beatsForWindow(slot.startSec, slot.durationSec);
                const neighbors = neighborsFrom(roster, slot.id);
                const seed = { id: slot.id, kind: 'custom', innerHtml: '<div></div>', timelineBody: '', label: slot.label ?? t('workbench.graphic'), durationSec: slot.durationSec, ...(boxPx ? { boxPx } : {}), ...(beats.length ? { beats } : {}), ...(neighbors ? { neighbors } : {}) };
                // Themed projects generate HTML: the theme is a prose description the model builds
                // from (playbook via frameId), not a skin on the JSON components. Kit = themeless.
                // Regenerating a filled component whose original spec is gone (legacy fills dropped it):
                // redesign from the beats instead — content is in them, the old design is being replaced.
                const spec =
                  placeholderSpec(slot) ||
                  'Redesign the overlay component for this moment from the narration beats — the previous design is being replaced, take a fresh angle.';
                // race: a stop mustn't wait out a 10s+ compose — the late result is discarded and the
                // slot stays a placeholder (nothing lands after the user pressed stop)
                const parsed = await race(composeBlockChecked(seed, spec, undefined, compRef.current.frameId ? undefined : { kit: true }));
                if (stopped()) return;
                if (parsed.declined) {
                  // compose's veto over the plan: with the actual sentences in hand, this moment has
                  // nothing a graphic can say — remove the empty shell rather than leaving it in the
                  // composition forever. A REGEN veto keeps the existing component instead: never
                  // delete user-visible work because a redo pass found nothing better to say.
                  skipped += 1;
                  if (isPlaceholder(slot)) setComp((cc) => ({ ...cc, blocks: cc.blocks.filter((b) => b.id !== slot.id) }));
                  return;
                }
                // Keep the original spec in slots across the fill (composedBlockFields replaces slots
                // wholesale): a later "redo this component" regenerates from the same design intent.
                const fields = composedBlockFields(parsed);
                const keepSpec = placeholderSpec(slot);
                setComp((cc) => ({
                  ...cc,
                  blocks: cc.blocks.map((b) => (b.id === slot.id ? { ...b, ...fields, slots: { ...fields.slots, ...(keepSpec ? { spec: keepSpec } : {}) } } : b)),
                }));
              };
              const worker = async () => {
                for (;;) {
                  if (stopped()) return; // block boundary = safe stop point; the in-flight fill lands whole
                  const slot = queue.shift();
                  if (!slot) return;
                  try {
                    await fillOne(slot);
                  } catch (e) {
                    failed += 1;
                    console.warn('[studio] graphic fill failed', slot.id, e);
                  }
                  markGenerating([slot.id], false); // unlock on result, don't wait for the whole batch
                  done += 1;
                  report(t('workbench.graphicsDoneTotalLabel', { done, total: slots.length, label: (slot.label ?? '').slice(0, 12) }), done / slots.length, { blockIds: slotIds });
                }
              };
              await Promise.all(Array.from({ length: Math.min(CONCURRENCY, slots.length) }, worker));
              // Stopped mid-batch: report the honest partial state — what landed stays, the rest are
              // still placeholders the next round can fill. Zero landed = plain stop receipt.
              if (stopped()) {
                const filled = done - failed - skipped;
                if (filled <= 0) throw abortErr();
                return withDelta({ ok: true, summary: t('workbench.graphicsStoppedPartial', { done: filled, total: slots.length }), data: { blocks: slotIds } });
              }
              const okCount = slots.length - failed - skipped;
              // Same deterministic collision receipt as lay_out (boxes can also collide when refilling
              // into an already-busy composition) — computed on the final state after all fills landed.
              const overlaps = blockOverlapWarnings(compRef.current.blocks);
              return {
                ok: okCount > 0 || skipped > 0,
                summary:
                  t('workbench.filledNDesignGraphics', { n: okCount }) +
                  (skipped ? t('workbench.nSlotsSkippedNothingToSay', { n: skipped }) : '') +
                  (failed ? t('workbench.nFailedPlaceholdersRemain', { n: failed }) : ''),
                data: { blocks: slotIds, ...(overlaps.length ? { overlaps, overlapHint: 'these block pairs share a time window and their boxes collide — separate them (place_block) and re-review those atSecs' } : {}) },
                ...(okCount === 0 && skipped === 0 ? { error: t('workbench.allGraphicsFailedTry') } : {}),
              };
            } finally {
              markGenerating(lockedIds, false);
              clearToolProgress(toolId);
            }
          }
          case 'move_block': {
            const b = findBlock(input.blockId);
            if (!b) return { ok: false, error: t('workbench.elementNotFound') };
            moveBlock(b.id, Number(input.startSec));
            return { ok: true, summary: t('workbench.movedNameSecS', { name: bname(b), sec: r1(input.startSec) }) };
          }
          case 'resize_block': {
            const b = findBlock(input.blockId);
            if (!b) return { ok: false, error: t('workbench.elementNotFound') };
            const s = Number(input.startSec);
            const d = Number(input.durationSec);
            resizeBlock(b.id, s, d);
            return { ok: true, summary: t('workbench.setNameFromS', { name: bname(b), from: r1(s), to: r1(s + d) }) };
          }
          case 'place_block': {
            const b = findBlock(input.blockId);
            if (!b) return { ok: false, error: t('workbench.elementNotFound') };
            if (isSentenceCaption(b)) return { ok: false, error: t('workbench.captionLayerPlaceHint') };
            if (!b.box) return { ok: false, error: t('workbench.blockHasNoBox') };
            const next = applyBlockPlacement(b, input as Parameters<typeof applyBlockPlacement>[1]);
            if (!next) return { ok: false, error: t('workbench.placeNoDirective') };
            setComp((cc) => ({ ...cc, blocks: cc.blocks.map((x) => (x.id === b.id ? next : x)) }));
            // Receipt hint (agent-facing, same convention as review_visuals' data.hint): overlapping
            // corner/split spans → say where the video band is before the agent parks a graphic on it.
            const framing = placementFramingNotes(ensureShots(c), next.startSec, next.durationSec);
            return { ok: true, summary: t('workbench.placedNameZone', { name: bname(b), zone: zoneOf(next.box!) }), data: { box: next.box, ...(framing.length ? { hint: framing.join('; ') } : {}) } };
          }
          case 'delete_block': {
            const b = findBlock(input.blockId);
            if (!b) return { ok: false, error: t('workbench.elementNotFound') };
            postPreview({ type: 'hf:remove', id: b.id });
            setComp((cc) => ({ ...cc, blocks: cc.blocks.filter((x) => x.id !== b.id) }));
            if (selectedIdRef.current === b.id) setSelectedId(null);
            return { ok: true, summary: t('workbench.deletedName', { name: bname(b) }) };
          }
          case 'delete_blocks': {
            const ids = Array.isArray(input.blockIds) ? new Set((input.blockIds as unknown[]).map(String)) : null;
            if (!ids?.size) return { ok: false, error: t('workbench.missingBlockidsWhichElements') };
            const hit = c.blocks.filter((b) => ids.has(b.id));
            if (!hit.length) return { ok: false, error: t('workbench.elementsNotFound') };
            hit.forEach((b) => postPreview({ type: 'hf:remove', id: b.id }));
            setComp((cc) => ({ ...cc, blocks: cc.blocks.filter((b) => !ids.has(b.id)) }));
            if (selectedIdRef.current && ids.has(selectedIdRef.current)) setSelectedId(null);
            return { ok: true, summary: t('workbench.deletedNElements', { n: hit.length }) };
          }
          case 'duplicate_block': {
            const b = findBlock(input.blockId);
            if (!b) return { ok: false, error: t('workbench.elementNotFound') };
            const at = typeof input.atSec === 'number' ? Math.max(0, input.atSec) : b.startSec + b.durationSec;
            const dupStart = Math.round(at * 100) / 100;
            const nb: Block = {
              ...b,
              id: blockId('dup'),
              startSec: dupStart,
              trackIndex: freeTrack(compRef.current.blocks, dupStart, b.durationSec, b.trackIndex),
              slots: { ...b.slots },
            };
            setComp((cc) => ({ ...cc, blocks: [...cc.blocks, nb] }));
            setSelectedShotId(null);
            setSelectedId(nb.id);
            return { ok: true, summary: t('workbench.duplicatedNameSecS', { name: bname(b), sec: r1(nb.startSec) }), data: { newBlockId: nb.id } };
          }
          case 'add_transition': {
            const at = Number(input.atSec);
            if (!Number.isFinite(at) || at < 0) return { ok: false, error: t('workbench.invalidAtSec') };
            const sp = clipSpans(ensureShots(compRef.current));
            const bounds = sp.slice(1).map((s) => s.editedStart);
            const cut = bounds.find((b) => Math.abs(b - at) < 0.3);
            if (cut == null) return { ok: false, error: t('workbench.atSecMustBeCut', { bounds: bounds.map(r1).join(', ') }) };
            const remove = input.effect === 'none' || input.remove === true;
            const effect: CutTransitionEffect = typeof input.effect === 'string' && ['fade', 'fadeblack', 'directional', 'directionalwipe', 'circleopen', 'windowslice', 'crosszoom', 'rotatescale', 'glitch', 'dreamy'].includes(input.effect) ? (input.effect as CutTransitionEffect) : 'fade';
            const dir = typeof input.direction === 'string' && ['up', 'down', 'left', 'right'].includes(input.direction) ? (input.direction as TransitionDirection) : undefined;
            setCutTransition(cut, remove ? null : effect, dir);
            if (!remove && typeof input.durationSec === 'number' && Number.isFinite(input.durationSec)) {
              const selfId = sp[bounds.indexOf(cut) + 1]!.clip.id;
              resizeCutTransition(selfId, input.durationSec);
            }
            return { ok: true, summary: remove ? t('workbench.removedTransitionSecS', { sec: r1(cut) }) : t('workbench.setTransitionEffectSec', { sec: r1(cut), effect }) };
          }
          case 'get_block': {
            const b = findBlock(input.blockId);
            if (!b) return { ok: false, error: t('workbench.elementNotFound') };
            const s = b.slots as { innerHtml?: unknown; timelineBody?: unknown };
            const rendered =
              b.templateId === 'custom'
                ? { innerHtml: String(s.innerHtml ?? ''), timelineBody: String(s.timelineBody ?? '') }
                : renderBlock(b);
            const cap = (x: string, n: number) => (x.length > n ? `${x.slice(0, n)}\n…(truncated, ${x.length} chars total)` : x);
            return {
              ok: true,
              summary: t('workbench.nameFromSTrack', { name: bname(b), from: r1(b.startSec), to: r1(b.startSec + b.durationSec), track: b.trackIndex }),
              data: {
                id: b.id,
                templateId: b.templateId,
                kind: blockKind(b),
                label: b.label,
                startSec: b.startSec,
                durationSec: b.durationSec,
                trackIndex: b.trackIndex,
                box: b.box ?? null,
                fitScale: b.fitScale ?? null,
                ...(isPlaceholder(b) ? { placeholder: true, spec: placeholderSpec(b).slice(0, 300) } : {}),
                innerHtml: cap(rendered.innerHtml, 1600),
                timelineBody: cap(rendered.timelineBody, 800),
              },
            };
          }
          case 'review_visuals': {
            // Delegated eyes for the chat agent: the chat protocol can't return images to the model, so a
            // vision model looks at the composed frames and the FINDINGS come back as text (issues JSON)
            const atsIn = Array.isArray(input.atSecs) ? (input.atSecs as unknown[]).map(Number).filter(Number.isFinite) : [];
            if (!atsIn.length) return { ok: false, error: t('workbench.reviewNeedsAtSecs') };
            const dur = totalDuration(c);
            const ats = [...new Set(atsIn.map((x) => Math.min(Math.max(0, x), dur)))].slice(0, 6);
            try {
              const frames: { atSec: number; image_base64: string; expected: string }[] = [];
              for (let i = 0; i < ats.length; i++) {
                if (stopped()) throw abortErr(); // frame boundary — captures are per-call work, safe to drop
                const at = ats[i]!;
                report(t('workbench.reviewingFrameN', { i: i + 1, n: ats.length }));
                const shot = await captureCompositionFrame({ comp: c, videoFile: videoFileRef.current, clipFiles: clipFilesRef.current, atSec: at, burnLabel: `${r1(at)}s`, maxDim: 720 });
                const visBlocks = c.blocks
                  .filter((b) => !isSentenceCaption(b) && at >= b.startSec && at < b.startSec + b.durationSec)
                  .map((b) => `${b.id} (${blockKind(b)}${b.box ? `, ${zoneOf(b.box)}` : ''})`);
                const expected = `${visBlocks.length ? `overlays: ${visBlocks.join('; ')}` : 'no overlays'}${isCaptionsOn(c) ? '; captions: on' : ''}`;
                frames.push({ atSec: at, image_base64: shot.dataUrl.slice(shot.dataUrl.indexOf(',') + 1), expected });
              }
              report(t('workbench.reviewJudging'));
              const rr = await fetch('/api/studio/review', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ frames }), ...(signal ? { signal } : {}) });
              // scene = per-frame one-line description from the vision pass: issues alone can't answer
              // "what does this moment look like", which this tool also serves
              const j = (await rr.json().catch(() => ({}))) as { frames?: { atSec: number; scene?: string; issues: { blockId: string; kind: string; note: string }[] }[]; error?: string; detail?: string };
              if (!rr.ok || !j.frames) return { ok: false, error: t('workbench.reviewFailedMessage', { message: j.detail || j.error || String(rr.status) }) };
              const total = j.frames.reduce((a, f) => a + f.issues.length, 0);
              return {
                ok: true,
                summary: total ? t('workbench.reviewedIssues', { n: j.frames.length, m: total }) : t('workbench.reviewedClean', { n: j.frames.length }),
                data: { frames: j.frames, ...(total ? { hint: 'fix real issues (position → place_block, styling/contrast → edit_block), then re-check the affected moment' } : {}) },
              };
            } catch (e) {
              // A user stop is not a review failure — rethrow with the localized stop message
              if (e instanceof DOMException && e.name === 'AbortError') throw abortErr();
              return { ok: false, error: t('workbench.reviewFailedMessage', { message: e instanceof Error ? e.message : String(e) }) };
            } finally {
              clearToolProgress(toolId);
            }
          }
          case 'list_assets': {
            // Enumerate the user's media library (uploads + agent imports) + this project's video sources —
            // the agent references real urls instead of guessing or asking the user to describe what they have
            const kindIn = input.kind === 'image' || input.kind === 'video' || input.kind === 'audio' ? input.kind : 'all';
            const limit = Math.min(Math.max(Math.round(Number(input.limit) || 30), 1), 100);
            const fetchKind = (k: 'image' | 'video' | 'audio') =>
              fetch(`/api/me/materials?tab=global&kind=${k}&limit=${limit}`)
                .then((r) => (r.ok ? r.json() : null))
                .then((j: { items?: { id: string; url: string; label: string | null; kind: string; width: number | null; height: number | null; created_at: number }[] } | null) => j?.items ?? [])
                .catch(() => []);
            // Audio belongs here as much as stills do: set_bgm needs a url, and without this the agent could
            // only place a bed the user had already pasted into the conversation.
            const kinds: ('image' | 'video' | 'audio')[] = kindIn === 'all' ? ['image', 'video', 'audio'] : [kindIn];
            const lists = await Promise.all(kinds.map(fetchKind));
            const assets = lists
              .flat()
              .sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0))
              .slice(0, limit)
              .map((m) => ({
                id: m.id,
                kind: m.kind,
                ...(m.label ? { label: m.label } : {}),
                url: imageThumb(m.url, 'original'),
                ...(m.width && m.height ? { w: m.width, h: m.height } : {}),
              }));
            // Project-scoped sources: main video + inserted clips (same letter tags as the state snapshot)
            const tag = new Map<string, string>();
            for (const s of c.shots ?? []) if (s.src && !tag.has(s.src)) tag.set(s.src, String.fromCharCode(65 + tag.size));
            const project = {
              ...(c.video ? { mainVideo: { durationSec: r1(c.video.durationSec) } } : {}),
              ...(tag.size
                ? { insertedClips: [...tag.entries()].map(([src, tg]) => ({ clip: tg, transcribed: !!clipAsrRef.current[src]?.length })) }
                : {}),
            };
            return { ok: true, summary: t('workbench.listedNAssets', { n: assets.length }), data: { assets, project } };
          }
          case 'focus_element': {
            const id = String(input.id ?? '');
            const b = findBlock(id);
            if (b) {
              setSelectedShotId(null);
              setSelectedId(b.id);
              // Seek past the entry animation (seekBlockSettled terms): +0.01 is the 0th entry frame, where the block
              // starts from opacity:0 — after defocusing (click blank/Esc) the timeline's true value is fully transparent, as if the block vanished
              seekBlockSettled(b.id);
              return { ok: true, summary: t('workbench.focusedName', { name: bname(b) }) };
            }
            const sp = clipSpans(ensureShots(c)).find((x) => x.clip.id === id);
            if (sp) {
              setSelectedId(null);
              setSelectedShotId(id);
              applyT(sp.editedStart + 0.01);
              return { ok: true, summary: t('workbench.focusedShotN', { n: sp.index + 1 }) };
            }
            return { ok: false, error: t('workbench.elementNotFound') };
          }
          case 'seek': {
            const to = Number(input.toSec);
            if (!Number.isFinite(to)) return { ok: false, error: t('workbench.invalidToSec') };
            const v = Math.max(0, Math.min(totalDuration(c), to));
            applyT(v);
            return { ok: true, summary: t('workbench.jumpedTo', { t: r1(v) }) };
          }
          case 'play': {
            const D = totalDuration(c);
            if (D < 0.1) return { ok: false, error: t('workbench.noVideoYet') };
            const from = typeof input.fromSec === 'number' ? Math.max(0, Math.min(D, input.fromSec)) : undefined;
            const to = typeof input.toSec === 'number' ? Math.max(0, Math.min(D, input.toSec)) : undefined;
            const startAt = from ?? (tRef.current >= D - 0.02 ? 0 : tRef.current); // same replay-from-end rule as the transport button
            if (to != null && to <= startAt + 0.05) return { ok: false, error: t('workbench.toSecAfterStart') };
            if (from != null) applyT(from);
            playStopAtRef.current = to ?? null;
            setPlaying(true);
            return {
              ok: true,
              summary:
                to != null
                  ? t('workbench.playingRange', { from: r1(startAt), to: r1(to) })
                  : t('workbench.playingFrom', { t: r1(startAt) }),
            };
          }
          case 'pause': {
            playStopAtRef.current = null;
            const was = playingRef.current;
            setPlaying(false);
            return { ok: true, summary: was ? t('workbench.pausedAt', { t: r1(tRef.current) }) : t('workbench.playbackAlreadyPaused') };
          }
          case 'cut_range': {
            if (!c.video) return { ok: false, error: t('workbench.noVideoYet') };
            const from = Number(input.fromSec);
            const to = Number(input.toSec);
            if (!Number.isFinite(from) || !Number.isFinite(to) || to - from < 0.1) return { ok: false, error: t('workbench.invalidRange') };
            const shots = ensureShots(c);
            const r = removeEditedRange(shots, from, to, (base, srcStart, srcEnd) => ({ ...base, id: shotId(), srcStart, srcEnd }));
            if (!r.removed) return { ok: false, error: t('workbench.rangeDeletedMayCover') };
            setComp((cur) => ({ ...cur, shots: r.clips, blocks: removeEditedInterval(cur.blocks, r.removed![0], r.removed![1]) }));
            setSelectedShotId(null);
            applyT(r.removed[0]);
            return withDelta({ ok: true, summary: t('workbench.deletedFootageFromS', { from: r1(r.removed[0]), to: r1(r.removed[1]) }), data: { shotIds: r.clips.map((s) => s.id) } });
          }
          case 'set_captions': {
            if (!c.video) return { ok: false, error: t('workbench.uploadVideoBeforeSetting') };
            const preset = typeof input.preset === 'string' ? input.preset : undefined;
            if (preset && !CAPTION_PRESETS.some((p) => p.id === preset)) return { ok: false, error: t('workbench.noSuchCaptionPreset', { preset }) };
            const yPct = Number(input.yPct);
            const scale = Number(input.scale);
            const patch: Parameters<typeof setCaptionStyle>[0] = {};
            if (Number.isFinite(yPct)) patch.yPct = yPct;
            if (Number.isFinite(scale)) patch.scale = scale;
            if (!preset && !Object.keys(patch).length) return { ok: false, error: t('workbench.nothingSetGiveLeast') };
            if (preset) await applyCaptionPreset(preset); // enable/switch style: re-lay the whole layer from the narration script (internally runs ASR, pushes an undo snapshot)
            if (Object.keys(patch).length) setCaptionStyle(patch);
            if (!compRef.current.blocks.some(isSentenceCaption)) return { ok: false, error: t('workbench.couldNotGenerateCaptions') };
            const cs = resolveCaptionStyle(compRef.current);
            return { ok: true, summary: preset ? t('workbench.captionsSetName', { name: t(getCaptionPreset(cs.preset).name) }) : t('workbench.captionsAdjustedName', { name: t(getCaptionPreset(cs.preset).name) }) };
          }
          case 'remove_captions': {
            if (!compRef.current.blocks.some(isSentenceCaption)) return { ok: false, error: t('workbench.thereNoCaptionsRight') };
            removeCaptionLayer();
            return { ok: true, summary: t('workbench.removedCaptions') };
          }
          case 'set_caption_translations': {
            // Bilingual captions: transcript writes go through the SHARED writer (applyCaptionTranslations —
            // identical semantics to the offline executor); captions re-derive reactively from the transcript.
            const clear = input.clear === true;
            const lang = typeof input.lang === 'string' && input.lang.trim() ? input.lang.trim() : undefined;
            const items = (Array.isArray(input.items) ? input.items : [])
              .map((it) => {
                const o = (it ?? {}) as Record<string, unknown>;
                const w0 = Number(o.w0);
                const w1 = Number(o.w1);
                return {
                  index: Number(o.index),
                  text: typeof o.text === 'string' ? o.text.trim() : null,
                  ...(Number.isInteger(w0) && Number.isInteger(w1) && w0 >= 0 && w1 >= w0 ? { w0, w1 } : {}),
                };
              })
              .filter((it): it is { index: number; text: string; w0?: number; w1?: number } => Number.isInteger(it.index) && it.index >= 0 && it.text !== null);
            if (!clear && !items.length) return { ok: false, error: t('workbench.itemsEmptyInvalidNeed') };
            let summary: string;
            if (clear) {
              if (asrRef.current) {
                const next = clearCaptionTranslations(asrRef.current);
                setAsrSentences(next);
                asrRef.current = next;
              }
              const nextClips = Object.fromEntries(Object.entries(clipAsrRef.current).map(([k, v]) => [k, clearCaptionTranslations(v)]));
              setClipAsr(nextClips);
              clipAsrRef.current = nextClips;
              summary = t('workbench.clearedAllCaptionTranslations');
            } else {
              const shotIdIn = typeof input.shotId === 'string' ? input.shotId : undefined;
              const src = shotIdIn ? ensureShots(compRef.current).find((s) => s.id === shotIdIn)?.src : undefined;
              if (shotIdIn && !src) return { ok: false, error: t('workbench.shotIdNotInsertClip') };
              const segs = src ? clipAsrRef.current[src] : asrRef.current;
              if (!segs?.length) return { ok: false, error: src ? t('workbench.insertClipNoTranscript') : t('workbench.noTranscriptYetRun') };
              const bad = items.filter((it) => it.index >= segs.length);
              if (bad.length) return { ok: false, error: t('workbench.indexOutOfRange', { list: bad.map((b) => b.index).join(', '), n: segs.length }) };
              const next = applyCaptionTranslations(segs, items, lang);
              if (src) {
                const nextClips = { ...clipAsrRef.current, [src]: next };
                setClipAsr(nextClips);
                clipAsrRef.current = nextClips;
              } else {
                setAsrSentences(next);
                asrRef.current = next;
              }
              summary = t('workbench.setNTranslationLines', { n: items.filter((it) => it.text).length });
            }
            if (compRef.current.blocks.some(isSentenceCaption)) return { ok: true, summary };
            return { ok: true, summary: summary + t('workbench.captionsOffTheyShow') };
          }
          case 'cut_narration': {
            if (!c.video) return { ok: false, error: t('workbench.noVideoYet') };
            const raw = Array.isArray(input.ranges) ? input.ranges : [];
            const shots0 = ensureShots(c);
            // Narration source seconds → final-cut seconds (loose: if a boundary lands in an already-deleted segment, snap to the nearest surviving point, still deleting the remaining part);
            // delete back to front so deleting an earlier segment doesn't shift later coordinates
            // Pause tightening: keepGapSec 的余量收缩在源秒时钟上做(与离线执行器/评测共用同一份数学)
            const kg = Number(input.keepGapSec);
            const srcRanges = raw
              .map((r) => {
                const o = (r ?? {}) as Record<string, unknown>;
                return { from: Number(o.fromSec), to: Number(o.toSec) };
              })
              .filter((r) => Number.isFinite(r.from) && Number.isFinite(r.to) && r.to - r.from > 0.05);
            // Transcript snippet per cut (words fully inside the source range): the receipt list names WHAT
            // each cut removed — a range with no words is dead air, and the list says so instead of quoting air.
            const snippetOf = (from: number, to: number): string | undefined => {
              const words = (asrRef.current ?? []).flatMap((s) => s.words ?? []);
              const inside = words.filter((w) => w.start >= from - 0.02 && w.end <= to + 0.02).map((w) => w.text.trim());
              if (!inside.length) return undefined;
              const joined = inside.join('');
              return joined.length > 16 ? `${joined.slice(0, 16)}…` : joined;
            };
            const edited = (Number.isFinite(kg) && kg > 0 ? tightenCutRanges(srcRanges, kg) : srcRanges)
              .map((r) => ({ from: srcToEditedLoose(shots0, r.from, inNarrationSource), to: srcToEditedLoose(shots0, r.to, inNarrationSource), text: snippetOf(r.from, r.to) }))
              .filter((r) => r.to - r.from > 0.05)
              .sort((a, b) => b.from - a.from);
            if (!edited.length) return { ok: false, error: t('workbench.rangesEmptyInvalidThose') };
            let shots = shots0;
            let blocks = c.blocks;
            const seams: CutSeamEntry[] = [];
            let firstCut = Infinity;
            for (const e of edited) {
              const rr = removeEditedRange(shots, e.from, e.to, (base, srcStart, srcEnd) => ({ ...base, id: shotId(), srcStart, srcEnd }));
              if (!rr.removed) continue;
              shots = rr.clips;
              blocks = removeEditedInterval(blocks, rr.removed[0], rr.removed[1]);
              seams.push({ at: rr.removed[0], len: rr.removed[1] - rr.removed[0], ...(e.text ? { text: e.text } : {}) });
              firstCut = Math.min(firstCut, rr.removed[0]);
            }
            if (!seams.length) return { ok: false, error: t('workbench.thoseRangesDeletedThey') };
            const relaid = relayCaptionLayer(blocks, shots, asrRef.current); // captions follow the narration: deleted words drop out automatically
            setComp((cur) => ({ ...cur, shots, blocks: relaid }));
            setSelectedShotId(null);
            if (Number.isFinite(firstCut)) applyT(firstCut);
            // The receipt speaks ACTUAL seconds (post-margin, what really left the timeline) — the agent's own
            // gap arithmetic (raw gap sizes) is what produced "cut 2.7s" while the panel said 2.4s.
            const cuts = finalizeCutSeams(seams);
            const removedTotalSec = Math.round(cuts.reduce((a, x) => a + x.removedSec, 0) * 10) / 10;
            const summary =
              Number.isFinite(kg) && kg > 0
                ? t('workbench.cutNarrationRemovedKeep', { n: cuts.length, sec: removedTotalSec.toFixed(1), kg: String(kg) })
                : t('workbench.cutNarrationRemoved', { n: cuts.length, sec: removedTotalSec.toFixed(1) });
            return withDelta({ ok: true, summary, data: { cuts, removedTotalSec, ...(Number.isFinite(kg) && kg > 0 ? { keepGapSec: kg } : {}) } });
          }
          case 'undo': {
            // No rollback while generating: after a snapshot restores the old comp, a running worker still writes its result back, scrambling state
            if (genIdsRef.current.size) return { ok: false, error: t('workbench.elementGeneratingUndoAfter') };
            const stack = undoStackRef.current;
            // A snapshot left by a tool that didn't change anything (returned failure/no-op) shares the current reference → dedup, doesn't count as a step
            while (stack.length && stack[stack.length - 1] === compRef.current) stack.pop();
            const prev = stack.pop();
            if (!prev) {
              // In-memory stack exhausted (page refreshed / device switched / long session) → cloud
              // history ring: pop the newest server-kept version. Granularity is autosave versions,
              // not keystrokes — the receipt says where we landed and urges a re-read.
              const pull = studioProviders().historyUndo;
              if (!pull) return { ok: false, error: t('workbench.nothingUndo') };
              const entry = await pull(ctx.projectId).catch(() => null);
              if (!entry) return { ok: false, error: t('workbench.nothingUndoCloudEmpty') };
              const restored = entry.comp as Composition;
              redoStackRef.current.push(compRef.current);
              setComp(restored);
              setSelectedId(null);
              setSelectedShotId(null);
              return withDelta({
                ok: true,
                summary: t('workbench.undidCloudVersion', { sec: (Math.round(totalDuration(restored) * 10) / 10).toFixed(1) }),
              });
            }
            redoStackRef.current.push(compRef.current); // agent undo also feeds the redo line (redoable via ⇧⌘Z/button)
            setComp(prev);
            setSelectedId(null);
            setSelectedShotId(null);
            return withDelta({ ok: true, summary: t('workbench.undidLastStep') + (stack.length ? t('workbench.nMoreUndoSteps', { n: stack.length }) : '') });
          }
          case 'export_video': {
            // Default local export (per user, same path in the OSS shell): the bridge drives this tab to run client-side compositing (WebCodecs),
            // the result goes straight to a browser download on the user's machine — no R2 upload, zero server cost. Poll via track_export.
            if (!compRef.current.video?.url) return { ok: false, error: t('common.uploadBeforeExport') };
            const job = agentExportRef.current;
            if (job.running) return { ok: true, summary: t('common.exportAlreadyProgress'), data: { status: 'running', progress: exportPctRef.current, hint: 'poll track_export' } };
            // Ask before defaulting: with no resolution/fps/format and no confirmation, return
            // source- and platform-tuned recommendations for the agent to put to the user (in chat,
            // or in the external MCP client) — export starts only once a choice or confirm arrives.
            const gaveOpts = input.resolution != null || input.fps != null || input.format != null;
            if (!gaveOpts && input.confirmed !== true) {
              const rec = exportRecommendations(compRef.current);
              return {
                ok: true,
                summary: t('workbench.exportNeedsChoice'),
                data: {
                  status: 'needs_options',
                  ...rec,
                  ask: 'Ask the user which resolution / fps / format to export, using these platform recommendations. Then call export_video again with the chosen values (or confirmed:true to accept the source-quality default).',
                },
              };
            }
            const opts = {
              res: [2160, 1440, 1080, 720, 540].includes(Number(input.resolution)) ? (Number(input.resolution) as 2160 | 1440 | 1080 | 720 | 540) : (1080 as const),
              fps: [24, 30, 60].includes(Number(input.fps)) ? (Number(input.fps) as 24 | 30 | 60) : (30 as const),
              format: input.format === 'webm' || input.format === 'mov' ? (input.format as 'webm' | 'mov') : ('mp4' as const),
            };
            // Local sink (export-sink helper): the reliable delivery path for agent-driven
            // browsers, which discard page downloads. Loopback-only — the sink's whole point
            // is same-machine delivery, and this keeps the finished video from being POSTed anywhere else.
            const sinkUrl = typeof input.sink_url === 'string' && input.sink_url ? input.sink_url : undefined;
            if (sinkUrl && !/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+\//.test(sinkUrl)) {
              return { ok: false, error: 'sink_url must be a loopback URL from the export-sink helper (http://127.0.0.1:<port>/…)' };
            }
            agentExportRef.current = { running: true, filename: null, error: null };
            void exportVideo(opts, sinkUrl)
              .then((r) => {
                agentExportRef.current = {
                  running: false,
                  filename: r.ok ? (r.filename ?? null) : null,
                  error: r.ok ? null : (r.error ?? t('common.exportFailed')),
                  ...(r.delivered ? { delivered: r.delivered } : {}),
                  ...(r.sinkError ? { sinkError: r.sinkError } : {}),
                };
              })
              .catch((e) => {
                agentExportRef.current = { running: false, filename: null, error: e instanceof Error ? e.message : String(e) };
              });
            return {
              ok: true,
              summary: t('workbench.exportStartedLocalClient'),
              data: { status: 'running', options: opts, ...(sinkUrl ? { delivery: 'local_sink' } : {}), hint: 'poll track_export every ~15s; keep this studio tab open' },
            };
          }
          case 'track_export': {
            const j = agentExportRef.current;
            if (j.running) return { ok: true, summary: t('workbench.exportingPct', { pct: exportPctRef.current }), data: { status: 'running', progress: exportPctRef.current } };
            if (j.filename) {
              // Honest delivery receipts: a page download is only a hand-off to the browser —
              // agent-driven headless browsers often drop it silently, so say so and point at the sink.
              if (j.delivered === 'local_sink') {
                return { ok: true, summary: t('workbench.exportDoneLocalSink'), data: { status: 'done', filename: j.filename, saved_via: 'local sink (the export-sink helper prints the absolute saved path)' } };
              }
              return {
                ok: true,
                summary: t('workbench.exportDoneDownloadedVia'),
                data: {
                  status: 'done',
                  filename: j.filename,
                  saved_via: 'browser download (user Downloads folder by default)',
                  ...(j.sinkError ? { sink_error: `sink delivery failed (${j.sinkError}) — fell back to the browser download` } : {}),
                  caveat: 'a download is a hand-off to the browser; agent-driven/headless browsers may discard it — if the file is missing, re-export with sink_url from the export-sink helper',
                },
              };
            }
            if (j.error) return { ok: false, error: j.error };
            return { ok: true, summary: t('workbench.noExportStarted'), data: { status: 'idle', hint: 'call export_video first' } };
          }
          case 'set_shot_treatment': {
            const s = findShot(input.shotId);
            if (!s) return { ok: false, error: t('workbench.shotNotFound') };
            const tr = String(input.treatment) as ShotTreatment;
            setShotTreatment(s.id, tr);
            const name = SHOT_TREATMENTS.find((x) => x.id === tr)?.name ?? tr;
            return { ok: true, summary: t('workbench.framingChangedName', { name: t(name) }) };
          }
          case 'split_shot': {
            if (!c.video) return { ok: false, error: t('workbench.noVideoYet') };
            if (typeof input.atSec === 'number') applyT(Math.max(0, input.atSec));
            if (splitBlockedByTransition(ensureShots(compRef.current), tRef.current)) {
              return { ok: false, error: t('workbench.cannotSplitInTransition') };
            }
            splitAtPlayhead();
            // The setComp wrapper writes compRef synchronously, so reading here already gets the post-split segment table
            return withDelta({ ok: true, summary: t('workbench.splitPlayhead'), data: { shotIds: (compRef.current.shots ?? []).map((s) => s.id) } });
          }
          case 'trim_shot': {
            if (!c.video) return { ok: false, error: t('workbench.noVideoYet') };
            const side = input.side === 'left' ? 'left' : 'right';
            if (typeof input.atSec === 'number') applyT(Math.max(0, input.atSec));
            trimAtPlayhead(side);
            return withDelta({ ok: true, summary: side === 'left' ? t('workbench.trimmedFootageLeftSec', { sec: r1(tRef.current) }) : t('workbench.trimmedFootageRightSec', { sec: r1(tRef.current) }) });
          }
          case 'delete_shot': {
            const s = findShot(input.shotId);
            if (!s) return { ok: false, error: t('workbench.shotNotFound') };
            deleteShot(s.id);
            return withDelta({ ok: true, summary: t('workbench.deletedScene') });
          }
          case 'set_video_filter': {
            const s = findShot(input.shotId);
            if (!s) return { ok: false, error: t('workbench.shotNotFound') };
            const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : undefined);
            const f: ShotFilter = {
              ...(num(input.brightness) != null ? { brightness: num(input.brightness) } : {}),
              ...(num(input.contrast) != null ? { contrast: num(input.contrast) } : {}),
              ...(num(input.saturate) != null ? { saturate: num(input.saturate) } : {}),
            };
            const css = shotFilterCss(f);
            setShotFilter(s.id, css === 'none' ? null : f);
            return { ok: true, summary: css === 'none' ? t('workbench.resetColorGradeShot') : t('workbench.filtersAppliedCss', { css }) };
          }
          case 'set_shot_audio': {
            const shots = c.shots ?? [];
            const ids = input.all ? new Set(shots.map((s) => s.id)) : new Set((Array.isArray(input.shotIds) ? input.shotIds : []).map(String));
            if (!ids.size) return { ok: false, error: t('workbench.passShotIdsOrAll') };
            const hit = shots.filter((s) => ids.has(s.id));
            if (!hit.length) return { ok: false, error: t('workbench.shotNotFound') };
            const patch = {
              ...(typeof input.volumeDb === 'number' && Number.isFinite(input.volumeDb) ? { volumeDb: input.volumeDb } : {}),
              ...(typeof input.mute === 'boolean' ? { mute: input.mute } : {}),
              ...(typeof input.fadeInSec === 'number' && Number.isFinite(input.fadeInSec) ? { fadeInSec: input.fadeInSec } : {}),
              ...(typeof input.fadeOutSec === 'number' && Number.isFinite(input.fadeOutSec) ? { fadeOutSec: input.fadeOutSec } : {}),
            };
            if (!Object.keys(patch).length) return { ok: false, error: t('workbench.passVolumeOrMute') };
            for (const s of hit) setShotAudio(s.id, patch);
            const bits = [
              ...('volumeDb' in patch ? [`${r1(Math.max(VOLUME_DB_MIN, Math.min(VOLUME_DB_MAX, patch.volumeDb!)))}dB`] : []),
              ...('mute' in patch ? [patch.mute ? t('workbench.audioMuted') : t('workbench.audioUnmuted')] : []),
            ];
            return { ok: true, summary: t('workbench.shotAudioSet', { n: hit.length, what: bits.join(' · ') }) };
          }
          case 'denoise_audio': {
            if (input.off === true) {
              if (!c.audioDenoise) return { ok: false, error: t('workbench.denoiseNotOn') };
              setDenoise(null);
              return { ok: true, summary: t('workbench.denoiseTurnedOff') };
            }
            if (!videoFileRef.current) return { ok: false, error: t('common.localSourceVideoMissing') };
            const s = typeof input.strength === 'number' && Number.isFinite(input.strength) ? Math.max(0.05, Math.min(1, input.strength)) : 0.6;
            setDenoise(s);
            return { ok: true, summary: t('workbench.denoiseTurnedOn', { pct: Math.round(s * 100) }) };
          }
          case 'set_bgm': {
            const tracks = c.audioTracks ?? [];
            const trackIdIn = typeof input.trackId === 'string' ? input.trackId : '';
            const knobs = {
              ...(typeof input.volumeDb === 'number' && Number.isFinite(input.volumeDb) ? { volumeDb: input.volumeDb } : {}),
              ...(typeof input.fadeInSec === 'number' && Number.isFinite(input.fadeInSec) ? { fadeInSec: input.fadeInSec } : {}),
              ...(typeof input.fadeOutSec === 'number' && Number.isFinite(input.fadeOutSec) ? { fadeOutSec: input.fadeOutSec } : {}),
              ...(typeof input.speed === 'number' && Number.isFinite(input.speed) ? { speed: input.speed } : {}),
              ...(typeof input.startSec === 'number' && Number.isFinite(input.startSec) ? { startSec: Math.max(0, input.startSec) } : {}),
              ...(typeof input.mute === 'boolean' ? { muted: input.mute } : {}),
            };
            if (input.off === true) {
              if (!tracks.length) return { ok: false, error: t('workbench.noBgmYet') };
              if (trackIdIn && !tracks.some((x) => x.id === trackIdIn)) return { ok: false, error: t('workbench.audioTrackNotFound') };
              if (trackIdIn) audioRemove(trackIdIn);
              else for (const x of tracks) audioRemove(x.id);
              return { ok: true, summary: t('workbench.bgmRemoved') };
            }
            const urlIn = typeof input.url === 'string' ? input.url.trim() : '';
            if (urlIn) {
              report(t('workbench.fetchingMusicBytes'));
              const pr = await fetch(`/api/media/fetch?url=${encodeURIComponent(urlIn)}`);
              if (!pr.ok) return { ok: false, error: t('workbench.musicGenFailed') };
              const name = (() => {
                try {
                  return decodeURIComponent(new URL(urlIn).pathname.split('/').pop() || '') || 'bgm.mp3';
                } catch {
                  return 'bgm.mp3';
                }
              })();
              const f = new File([await pr.blob()], name, { type: pr.headers.get('content-type') || 'audio/mpeg' });
              const newId = await audioMount(f, undefined, typeof knobs.startSec === 'number' ? { startSec: knobs.startSec } : undefined);
              if (!newId) return { ok: false, error: t('workbench.musicGenFailed') };
              const { startSec: _s, ...rest } = knobs;
              if (Object.keys(rest).length) audioPatch(newId, rest);
              const db = (compRef.current.audioTracks ?? []).find((x) => x.id === newId)?.volumeDb;
              return { ok: true, summary: t('workbench.bgmMounted', { db: db != null ? String(r1(db)) : String(-18) }), data: { trackId: newId } };
            }
            const target = trackIdIn ? tracks.find((x) => x.id === trackIdIn) : tracks.length === 1 ? tracks[0] : null;
            if (!tracks.length) return { ok: false, error: t('workbench.noBgmYet') };
            if (!target) return { ok: false, error: t('workbench.audioTrackNotFound') };
            // Split changes the track COUNT, so it stands alone rather than combining with the knobs
            const splitAt = Number(input.splitAtSec);
            if (Number.isFinite(splitAt)) {
              const halves = splitAudioClipAt(target, splitAt, audioClipId);
              if (!halves) return { ok: false, error: t('workbench.movePlayheadToSplitAudio') };
              setComp((cur) => ({ ...cur, audioTracks: (cur.audioTracks ?? []).flatMap((x) => (x.id === target.id ? halves : [x])) }));
              return { ok: true, summary: t('workbench.bgmSplit'), data: { trackId: halves[0].id, newTrackId: halves[1].id } };
            }
            // Edge trims: same math as the lane's own handles (start + source in/out move together)
            const headSec = Number(input.headSec);
            const tailSec = Number(input.tailSec);
            let trimPatch: Partial<AudioClip> = {};
            if (Number.isFinite(headSec)) trimPatch = { ...trimPatch, ...audioTrimPatch(target, 'left', Math.max(0, headSec)) };
            if (Number.isFinite(tailSec)) trimPatch = { ...trimPatch, ...audioTrimPatch({ ...target, ...trimPatch }, 'right', Math.max(0, tailSec)) };
            const trimming = Object.keys(trimPatch).length > 0;
            if (!Object.keys(knobs).length && !trimming) return { ok: false, error: t('workbench.passAudioKnobs') };
            audioPatch(target.id, { ...trimPatch, ...knobs });
            return { ok: true, summary: trimming ? t('workbench.bgmTrimmed') : t('workbench.bgmAdjusted') };
          }
          case 'insert_clip': {
            // Agent inserts B-roll: the bytes must already be in our storage (a helper-uploaded sig / a CDN url of a library / generated video) —
            // the canvas engine needs CORS-clean frames, so always fetch the bytes into a File and go through the full local-insert path
            // (blob src + srcSig + OPFS + cloud backup), fully isomorphic to a manual "+" insert
            if (!c.video) return { ok: false, error: t('workbench.addMainVideoBefore') };
            const sigIn = typeof input.sig === 'string' ? input.sig.trim() : '';
            const urlIn = typeof input.url === 'string' ? input.url.trim() : '';
            if (!sigIn && !urlIn) return { ok: false, error: t('workbench.needUrlOrSig') };
            const at = typeof input.atSec === 'number' && Number.isFinite(input.atSec) ? Math.max(0, input.atSec) : tRef.current;
            try {
              report(t('workbench.fetchingClipBytes'));
              const proxyFetch = async (u: string): Promise<File | null> => {
                const pr = await fetch(`/api/media/fetch?url=${encodeURIComponent(u)}`);
                if (!pr.ok) return null;
                const b = await pr.blob();
                const name = (() => {
                  try {
                    return decodeURIComponent(new URL(u).pathname.split('/').pop() || '') || 'clip.mp4';
                  } catch {
                    return 'clip.mp4';
                  }
                })();
                // Pin lastModified to 0: the synthesized File's sig (name:size:0) is stable across fetches, so cloud backup/OPFS don't store duplicates
                return new File([b], name, { type: b.type || 'video/mp4', lastModified: 0 });
              };
              let f: File | null = null;
              if (sigIn) {
                f = await studioProviders().vault.fetch(sigIn);
                if (!f) {
                  // presign direct fetch failed (CORS/unconfigured) → fall back to the public CDN via the same-origin proxy
                  const r = await fetch('/api/studio/media', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'get', sig: sigIn }) });
                  const key = r.ok ? ((await r.json()) as { key?: string }).key : null;
                  const base = imgSourceBase();
                  if (key && base) f = await proxyFetch(`${base}/${key}`);
                }
                if (!f) return { ok: false, error: t('workbench.noBytesFoundSig') };
              } else {
                f = await proxyFetch(urlIn);
                if (!f) return { ok: false, error: t('workbench.urlFetchFailedOnly') };
              }
              report(t('workbench.readingDuration'));
              const blobUrl = URL.createObjectURL(f);
              const dur = await videoDurationOf(blobUrl);
              if (!dur) {
                URL.revokeObjectURL(blobUrl);
                return { ok: false, error: t('workbench.couldNotReadDurationCodec') };
              }
              void saveLocalVideo(f, fileSig(f)).catch(() => {});
              const newShotId = insertClipCore(blobUrl, Math.round(dur * 100) / 100, at, f);
              return withDelta({ ok: true, summary: t('workbench.insertedDurSClip', { at: r1(at), dur: r1(dur) }), data: { shotId: newShotId } });
            } finally {
              clearToolProgress(toolId);
            }
          }
          case 'attach_frame': {
            // Agent recommends / user names → mount a frame: go through chat's attachFrame (tag + subsequent requests carry frameId),
            // then onFrameApplied lands palette+frameId into comp. Next round <frame_attached> prompts it to read_frame.
            // Gate before tagging the session: onFrameApplied refuses mid-generation, and a tagged
            // session with an unapplied comp would disagree about the active theme.
            if (genIdsRef.current.size) return { ok: false, error: t('workbench.elementGeneratingThemeAfter') };
            const fid = typeof input.frame_id === 'string' ? input.frame_id : '';
            const f = frameCatalogRef.current.find((x) => x.id === fid);
            if (!f) return { ok: false, error: t('workbench.noSuchFrameId', { id: fid }) };
            chatRef.current?.attachFrame({ id: f.id, title: f.title, icon: f.icon, iconKey: f.iconKey ?? null });
            return { ok: true, summary: t('workbench.appliedThemeAlt', { title: f.title }) };
          }
          case 'add_block': {
            try {
              const at = typeof input.atSec === 'number' ? Math.min(Math.max(0, input.atSec), totalDuration(c)) : r1(tRef.current);
              const seed = { id: blockId('ai'), kind: 'custom', innerHtml: '<div></div>', timelineBody: '', label: t('workbench.newElement') };
              // Streaming: the note (the human sentence before the fence) is pushed to the card as it generates; the output passes static checks (bad CSS doesn't enter the composition)
              // Same routing as the batch fill: themed → HTML in the theme's language, themeless → kit.
              let parsed = await composeBlockChecked(
                seed,
                `Create a new overlay element for this content: ${String(input.instruction ?? '')}`,
                (acc) => report(noteOf(acc) || t('panels.generating')),
                compRef.current.frameId ? undefined : { kit: true },
              );
              // An explicit user request never maps to "nothing worth showing" — a deliberate null
              // here means no component carries the ask, so take the free-form path rather than
              // bouncing the request back at the user.
              if (parsed.declined) {
                parsed = await composeBlockChecked(
                  seed,
                  `Create a new overlay element (title / big number / list / kinetic caption — pick per the content): ${String(input.instruction ?? '')}`,
                  (acc) => report(noteOf(acc) || t('panels.generating')),
                );
              }
              const nb: Block = {
                id: seed.id,
                ...composedBlockFields(parsed),
                startSec: at,
                durationSec: 3,
                trackIndex: freeTrack(compRef.current.blocks, at, 3),
                label: String(input.instruction ?? t('workbench.newElement')).slice(0, 12),
              };
              setComp((cc) => ({ ...cc, blocks: [...cc.blocks, nb] }));
              setSelectedShotId(null);
              setSelectedId(seed.id);
              applyT(Math.max(0, at + 0.01)); // on completion, take the user straight to the result
              return { ok: true, summary: parsed.note || t('workbench.elementAdded'), data: { newBlockId: seed.id } };
            } finally {
              clearToolProgress(toolId);
            }
          }
          case 'edit_block': {
            const b = findBlock(input.blockId);
            if (!b) return { ok: false, error: t('workbench.elementNotFound') };
            try {
              markGenerating([b.id], true); // lock editing during the rewrite too (the result replaces the whole slots)
              const seed = { id: b.id, kind: blockKind(b), ...renderBlock(b), label: b.label };
              // A kit block is edited as props; anything else keeps writing markup. Editing follows
              // what the block already IS — silently converting one into the other would throw away
              // whatever the user tuned by hand.
              const current = kitChoiceOf(b);
              const parsed = await composeBlockChecked(seed, String(input.instruction ?? ''), (acc) => report(noteOf(acc) || t('workbench.editing')), current ? { kit: true, current } : undefined);
              // A declined edit means the model refused to change the component — keep the block
              // exactly as it is (never silently convert a kit block to markup) and hand the note
              // back so the agent can rephrase or explain.
              if (parsed.declined) return { ok: false, error: parsed.note || t('workbench.aiEditFailed') };
              setComp((cc) => ({
                ...cc,
                blocks: cc.blocks.map((x) => (x.id === b.id ? { ...x, ...composedBlockFields(parsed) } : x)),
              }));
              return { ok: true, summary: parsed.note || t('workbench.elementUpdated') };
            } finally {
              markGenerating([b.id], false);
              clearToolProgress(toolId);
            }
          }
          default:
            return { ok: false, error: t('workbench.unknownOperationTool', { tool: toolId }) };
        }
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
}

  /** External-agent-only bridge operations (MCP-only, invisible to the internal chat) — the browser half of the BYO-brain contract:
   *  compose_context/plan_context fetch live context (the server briefs assemble the prompt, the external model generates itself),
   *  apply_block/submit_plan receive the output and run it through the **same** validation as the in-house path (parseBlockResponse+lintBlock /
   *  parsePlan) before landing state — swap the LLM, the quality contract doesn't degrade. Other tools fall back to runStudioTool. */
export async function runExternalTool(ctx: AgentToolCtx, tool: string, input: Record<string, unknown>): Promise<StudioToolResult> {
  const {
    compRef, setComp, setSelectedId, setSelectedShotId, applyT, tRef, pushUndoSnapshot, genIdsRef, videoFileRef,
    clipFilesRef, asrRef, currentVideo, planRef, setPlan, visualRef, insertedClipsForPlanRef, graphicsRoster,
    neighborsFrom, beatsForWindow,
  } = ctx;
    const c2 = compRef.current;
    switch (tool) {
      case 'compose_context': {
        const script = (asrRef.current ?? []).map((s) => s.text).join('');
        const base = { theme: c2.theme, ...(c2.palette ? { palette: c2.palette } : {}), ...(c2.frameId ? { frameId: c2.frameId } : {}) };
        const bid = typeof input.blockId === 'string' ? input.blockId : undefined;
        if (bid) {
          const b = c2.blocks.find((x) => x.id === bid);
          if (!b) return { ok: false, error: t('workbench.elementNotFoundIds') };
          if (genIdsRef.current.has(b.id)) return { ok: false, error: t('workbench.blockGeneratingWaitFinish') };
          if (isPlaceholder(b)) {
            const boxPx = b.box ? { w: Math.round(b.box.w * c2.width), h: Math.round(b.box.h * c2.height) } : undefined;
            const beats = beatsForWindow(b.startSec, b.durationSec);
            const neighbors = neighborsFrom(graphicsRoster(), b.id);
            return {
              ok: true,
              summary: t('workbench.fetchedPlaceholderContext'),
              data: {
                ...base,
                block: { id: b.id, kind: 'custom', innerHtml: '<div></div>', timelineBody: '', label: b.label ?? t('workbench.graphic'), durationSec: b.durationSec, ...(boxPx ? { boxPx } : {}) },
                context: { ...(script ? { script } : {}), ...(beats.length ? { beats } : {}), ...(neighbors ? { neighbors } : {}) },
                suggested_instruction: placeholderSpec(b),
              },
            };
          }
          return {
            ok: true,
            summary: t('workbench.fetchedBlockContext'),
            data: {
              ...base,
              block: { id: b.id, kind: blockKind(b), ...renderBlock(b), label: b.label },
              // A kit block is edited as props: hand the brief what it currently shows, so an
              // external edit keeps unmentioned fields exactly like the in-app path does.
              ...(b.templateId.startsWith('kit:') ? { kitCurrent: kitChoiceOf(b) } : {}),
              ...(script ? { context: { script } } : {}),
            },
          };
        }
        const at = typeof input.atSec === 'number' ? Math.min(Math.max(0, input.atSec), totalDuration(c2)) : Math.round(tRef.current * 10) / 10;
        return {
          ok: true,
          summary: t('workbench.fetchedNewElementContext'),
          data: { ...base, atSec: at, block: { id: blockId('ai'), kind: 'custom', innerHtml: '<div></div>', timelineBody: '', label: t('workbench.newElement') }, ...(script ? { context: { script } } : {}) },
        };
      }
      case 'apply_block': {
        const raw = typeof input.raw === 'string' ? input.raw : '';
        if (!raw.trim()) return { ok: false, error: t('workbench.rawRequired') };
        const bid = typeof input.blockId === 'string' ? input.blockId : undefined;
        const target = bid ? c2.blocks.find((x) => x.id === bid) : undefined;
        if (target && genIdsRef.current.has(target.id)) return { ok: false, error: t('workbench.blockGeneratingWaitFinish') };
        const fb = target && !isPlaceholder(target) ? renderBlock(target) : { innerHtml: '<div></div>', timelineBody: '' };
        // Stable applyId (same fix as the offline executor in server-tools): an unknown bid IS the
        // new-block id — compose_context minted it for the brief, or a lint receipt handed it back.
        // Reuse it so the generated CSS's #id scope survives the retry instead of chasing a fresh
        // mint each round (the loop that drove external agents off the BYO path).
        const applyId = target?.id ?? bid ?? blockId('ai');
        // Same shared interpreter as the offline executor — component JSON, custom escape and the
        // deliberate null each get their own meaning; markup falls through to the lint path.
        const shape = interpretApplyRaw(raw);
        if (shape.kind === 'kit') {
          pushUndoSnapshot();
          if (target) {
            setComp((cc) => ({ ...cc, blocks: cc.blocks.map((x) => (x.id === target.id ? { ...x, templateId: `kit:${shape.component}`, slots: { props: shape.props } } : x)) }));
            setSelectedShotId(null);
            setSelectedId(target.id);
            applyT(Math.max(0, target.startSec + 0.01));
            return { ok: true, summary: isPlaceholder(target) ? t('workbench.filledLabel', { label: target.label ?? t('workbench.graphic') }) : t('workbench.updatedLabel', { label: target.label?.slice(0, 10) || blockKind(target) }), data: { blockId: target.id } };
          }
          const kAt = typeof input.atSec === 'number' ? Math.min(Math.max(0, input.atSec), totalDuration(c2)) : Math.round(tRef.current * 10) / 10;
          const kDur = typeof input.durationSec === 'number' && input.durationSec >= 0.3 ? input.durationSec : 3;
          const kb: Block = {
            id: applyId,
            templateId: `kit:${shape.component}`,
            slots: { props: shape.props },
            startSec: kAt,
            durationSec: kDur,
            trackIndex: freeTrack(c2.blocks, kAt, kDur),
            label: (typeof input.label === 'string' && input.label ? input.label : t('workbench.newElement')).slice(0, 12),
          };
          setComp((cc) => ({ ...cc, blocks: [...cc.blocks, kb] }));
          setSelectedShotId(null);
          setSelectedId(kb.id);
          applyT(Math.max(0, kAt + 0.01));
          return { ok: true, summary: t('workbench.elementAdded'), data: { newBlockId: kb.id } };
        }
        if (shape.kind === 'kit-unknown') {
          return { ok: false, error: `unknown component "${shape.component}" — use an id from the brief's COMPONENTS list, answer {"custom": true} for a bespoke build, or null for no graphic` };
        }
        if (shape.kind === 'custom') {
          return { ok: false, error: 'the model chose a bespoke build — call compose_block_brief again with format:"html" for the markup contract, generate against it, then apply_block with that raw text' };
        }
        if (shape.kind === 'declined') {
          if (target && isPlaceholder(target)) {
            pushUndoSnapshot();
            setComp((cc) => ({ ...cc, blocks: cc.blocks.filter((x) => x.id !== target.id) }));
            return { ok: true, summary: t('workbench.slotRemovedNothingToSay'), data: { removedBlockId: target.id } };
          }
          return { ok: false, error: 'the model answered null (no graphic) — nothing was changed; delete_block the target yourself if you agree' };
        }
        const parsed = parseBlockResponse(raw, fb);
        const issues = lintBlock({ blockId: applyId, innerHtml: parsed.innerHtml, timelineBody: parsed.timelineBody });
        // Same hard line as composeBlockChecked: hard problems are bounced back for the external model to fix itself (it is the "one fix round" model)
        const hard = issues.filter((i) => HARD_LINT_CODES.has(i.code));
        if (hard.length) {
          return { ok: false, error: t('workbench.failedStaticChecksFix', { blockId: applyId }), data: { blockId: applyId, issues: issues.map((i) => i.message) } };
        }
        const warnings = issues.length ? { warnings: issues.map((i) => i.message) } : {};
        pushUndoSnapshot();
        if (target) {
          setComp((cc) => ({
            ...cc,
            blocks: cc.blocks.map((x) => (x.id === target.id ? { ...x, templateId: 'custom', slots: { innerHtml: parsed.innerHtml, timelineBody: parsed.timelineBody } } : x)),
          }));
          setSelectedShotId(null);
          setSelectedId(target.id);
          applyT(Math.max(0, target.startSec + 0.01));
          return { ok: true, summary: isPlaceholder(target) ? t('workbench.filledLabel', { label: target.label ?? t('workbench.graphic') }) : t('workbench.updatedLabel', { label: target.label?.slice(0, 10) || blockKind(target) }), data: { blockId: target.id, ...warnings } };
        }
        const at = typeof input.atSec === 'number' ? Math.min(Math.max(0, input.atSec), totalDuration(c2)) : Math.round(tRef.current * 10) / 10;
        const dur = typeof input.durationSec === 'number' && input.durationSec >= 0.3 ? input.durationSec : 3;
        const nb: Block = {
          id: applyId,
          templateId: 'custom',
          slots: { innerHtml: parsed.innerHtml, timelineBody: parsed.timelineBody },
          startSec: at,
          durationSec: dur,
          trackIndex: freeTrack(c2.blocks, at, dur),
          label: (typeof input.label === 'string' && input.label ? input.label : t('workbench.newElement')).slice(0, 12),
        };
        setComp((cc) => ({ ...cc, blocks: [...cc.blocks, nb] }));
        setSelectedShotId(null);
        setSelectedId(nb.id);
        applyT(Math.max(0, at + 0.01));
        return { ok: true, summary: t('workbench.elementAdded'), data: { newBlockId: nb.id, ...warnings } };
      }
      case 'capture_frame': {
        // The external agent's "eye": capture a frame via the same render pipeline as export (BYO self-checks visuals after writing a block)
        const at = typeof input.atSec === 'number' ? Math.min(Math.max(0, input.atSec), totalDuration(c2)) : tRef.current;
        try {
          const label = `${Math.round(at * 10) / 10}s`;
          const shot = await captureCompositionFrame({ comp: c2, videoFile: videoFileRef.current, clipFiles: clipFilesRef.current, atSec: at, burnLabel: label });
          const b64 = shot.dataUrl.slice(shot.dataUrl.indexOf(',') + 1);
          // What the image SHOWS mapped back to what the agent can EDIT: overlay blocks visible at this
          // moment (with screen zone), the shot it lands in, and whether the caption layer is on
          const visBlocks = c2.blocks
            .filter((b) => !isSentenceCaption(b) && at >= b.startSec && at < b.startSec + b.durationSec)
            .map((b) => ({ id: b.id, kind: blockKind(b), ...(b.label ? { label: b.label } : {}), ...(b.box ? { zone: zoneOf(b.box) } : {}) }));
          const span = clipSpans(c2.shots ?? []).find((sp) => at >= sp.editedStart - 1e-6 && at < sp.editedEnd + 1e-6);
          const visible = {
            blocks: visBlocks,
            ...(span ? { shot: { id: span.clip.id, treatment: span.clip.treatment } } : {}),
            captionsOn: c2.blocks.some(isSentenceCaption),
          };
          return {
            ok: true,
            summary: t('workbench.capturedFrameSecS', { sec: Math.round(at * 10) / 10 }),
            image: { data: b64, mimeType: 'image/jpeg' },
            data: { atSec: at, width: shot.width, height: shot.height, burnedLabel: label, visible },
          } as StudioToolResult;
        } catch (e) {
          return { ok: false, error: t('workbench.frameCaptureFailedMessage', { message: e instanceof Error ? e.message : String(e) }) };
        }
      }
      case 'plan_context': {
        const segs = asrRef.current;
        if (!segs?.length) return { ok: false, error: t('workbench.noTranscriptYetRun') };
        const vis = visualRef.current;
        const visuals = vis?.segments.length
          ? segs.map((s, i) => {
              const mid = (s.start + s.end) / 2;
              const seg = vis.segments.find((x) => mid >= x.start - 0.01 && mid < x.end + 0.01) ?? vis.segments.at(-1)!;
              return { index: i, content: seg.label.content, safe: seg.label.safe };
            })
          : undefined;
        const inserts = await insertedClipsForPlanRef.current().catch(() => [] as PlanInsert[]);
        return {
          ok: true,
          summary: t('workbench.fetchedPlanningContext'),
          data: {
            sentences: segs.map((s, i) => ({ index: i, text: s.text, start: s.start, end: s.end })),
            videoDurationSec: currentVideo()?.durationSec ?? 0,
            theme: c2.theme,
            ...(visuals ? { visuals } : {}),
            ...(inserts.length ? { inserts } : {}),
          },
        };
      }
      case 'submit_plan': {
        if (!asrRef.current?.length) return { ok: false, error: t('workbench.runAsrFirst') };
        const text = typeof input.plan === 'string' ? input.plan : JSON.stringify(input.plan ?? {});
        // Unified narrative stream (same interleaving given to the agent in plan_context): global-line-number scenes are decomposed back into main/insert segments at the assembly layer
        const insCtx = await insertedClipsForPlanRef.current().catch(() => [] as PlanInsert[]);
        const planRows = unifiedPlanRows(asrRef.current.map((x, i) => ({ index: i, text: x.text, start: x.start, end: x.end })), insCtx);
        let p: DraftPlan;
        try {
          p = parsePlan(text, planRows);
        } catch (e) {
          return { ok: false, error: t('workbench.planParsingFailedMessage', { message: e instanceof Error ? e.message : String(e) }) };
        }
        if (!p.scenes.length) return { ok: false, error: t('workbench.noValidScenesCheck') };
        pushUndoSnapshot();
        planRef.current = p;
        setPlan(p);
        return { ok: true, summary: t('workbench.planReceivedNScenes', { n: p.scenes.length }), data: { scenes: p.scenes.length } };
      }
      default:
        return runStudioTool(ctx, tool, input);
    }
}
