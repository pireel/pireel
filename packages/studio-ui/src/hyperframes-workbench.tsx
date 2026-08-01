'use client';

/**
 * Hyperframes workbench — block-based editing (pure browser, zero server).
 *
 * Model = continuous talking-head video (track 0) + overlay blocks on multiple tracks
 * (captions/titles/transitions). Each block is a nested Hyperframes composition fragment;
 * assemble stitches full HTML fed to <iframe srcdoc> for live render.
 *  · Import talking-head video + one-click ASR → one highlighted caption block per sentence (shots).
 *  · Multi-track timeline: click a block to select, chat on the right edits "this block" (per-block, cheap/precise).
 *  · Export via server-side headless Chrome (same assembled HTML, WYSIWYG, TODO wire up).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale } from 'use-intl';
import { Play, Pause, FileVideo, Code2, Loader2, Wand2, Sparkles, Upload,
  FlaskConical, ScanFace, MessageSquare, Image as ImageIcon, ChevronsLeft, ChevronsRight, Minus, Plus, Download, X, GripVertical, Trash2, Palette, RefreshCw, Save, SendToBack, BringToFront, ChevronUp, ChevronDown, UserRound, Frame, Music, Undo2, Redo2, Pin, PinOff, SlidersHorizontal, LayoutGrid, Scissors, Captions } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@pireel/ui/tooltip';

import { toast } from '@pireel/ui/toast';
import { studioLocale, t } from './i18n';
import { framePack } from '@pireel/studio-frames/locales';
import {
  type Block,
  type CaptionStyle,
  type Composition,
  type MediaRef,
  type CutTransitionEffect,
  type TransitionDirection,
  type ShotFilter,
  type ShotTreatment,
  type PersonFx,
  type VideoShot,
  SHOT_TREATMENTS,
  STUDIO_FONTS_HREF,
  CAPTION_PRESETS,
  assembleHtml,
  blockBgCss,
  captionLineSegments,
  customHasSurface,
  blockId,
  blockKind,
  videoFrameTimelineBody,
  BASE_CAPTION_FONT_PX,
  emptyComposition,
  freeTrack,
  getCaptionPreset,
  isCaptionsOn,
  isSentenceCaption,
  stripDerivedCaptions,
  mediaBlock,
  newBlock,
  renderBlock,
  assembleBlockHtml,
  resolveCaptionStyle,
  resolveSubCaptionStyle,
  audioClipId,
  audioClipWindow,
  audioTrimPatch,
  patchAudioClip,
  patchShotAudio,
  segmentFadeFn,
  shotsContiguous,
  shotFilterCss,
  shotGain,
  type AudioClip,
  shotId,
  shotTransformVars,
  DIRECTIONAL_TRANSITIONS,
  MAX_TRANSITION_SEC,
  cutTransitions,
  splitAudioClipAt,
  splitBlockedByTransition,
  totalDuration,
  treatmentVacancyBox,
} from '@pireel/studio-engine/composition';
import { getTheme, themeVarsCss } from '@pireel/studio-engine/theme';
import { deleteClipById, removeEditedInterval, removeEditedRange, removeSrcRanges, restoreSrcRange, spans as clipSpans, splitAtEdited, srcToEditedLoose, trimLeftAtEdited, trimRightAtEdited } from '@pireel/studio-engine/trim';
import { parseBlockResponse, parseKitResponse } from '@pireel/studio-engine/compose';
import { type ComposeMode, type ComposedBlock, composedBlockFields, kitChoiceOf } from './compose-result';
import { imageThumb, imgSourceBase } from '@pireel/ui/image-url';
import { HARD_LINT_CODES, lintBlock } from '@pireel/studio-engine/block-lint';
import { clearToolProgress, setToolProgress } from './tool-progress';
import { injectPreviewRuntime } from './sample-composition';
import { playhead } from './playhead';
import { type AsrSegment, captionBlocksFromAsr, desegmentCues, sanitizeTranscriptSegs } from '@pireel/studio-engine/build-blocks';
import { type Box as GraphicBox, dropPlaceholdersInWindows, insertedClipPlaceholder, isPlaceholder, layoutFromPlan, layoutInsertWindow, pickGraphicBox, placeholderSpec } from '@pireel/studio-engine/build-draft';
import { type FilmstripFrame, extractFilmstrip, fileSig, probeVideoFile, uploadImageFile, uploadVideoFile } from './media';
import { alignFileToSig, loadLocalVideo, saveLocalVideo } from './local-media';
import { VideoTrackEngine } from './video-track-engine';
import { type BakeSpec, type BakedWindow, bakeTransitionWindow, decodeBake } from './transition-bake';
import { type DraftPlan, type PlanInsert, parsePlan , unifiedPlanRows } from '@pireel/studio-engine/plan';
import { beatsForWindow as beatsForWindowPure, displayCues, inNarrationSource, insertPlanContexts } from '@pireel/studio-engine/captions-relay';
import { studioProviders } from '@pireel/studio-engine/providers';
import { StudioTimeline, DEFAULT_PPS, MIN_PPS, MAX_PPS } from './studio-timeline';
import { type AttachedFrame, StudioChat, type StudioChatHandle, type StudioElementRef } from './studio-chat';
import { ElementSourceEditor, type SourceDraft } from './element-source-editor';
import { useStableCallbacks } from './use-stable-callbacks';
import { startPointerDrag } from './drag-shell';
import {
  type StudioDraft,
  cacheProjectLocally,
  chatKeyFor,
  loadDraft,
  readChatThreads,
  saveCoverThumb,
  setProjectVersion,
  useDraftAutosave,
} from './use-draft-persist';
import type { StudioProjectDto } from '@pireel/studio-engine/project-dto';
import { useGenerationLock } from './use-generation-lock';
import { useDraftPipeline } from './use-draft-pipeline';
import { useStudioExport } from './use-export';
import { DEFAULT_RENDER_OPTS, type ExportRenderOpts, captureCompositionFrame } from './client-export';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@pireel/ui/dialog';
import { GenChatPanel, type GenElementResult } from './gen-chat-panel';
import { KIT_INSERT_DURATION, kitSampleProps } from './kit-ui';
import { KitPropsPanel } from './kit-props-panel';
import { wordsFromText } from '@pireel/studio-engine/caption-fx';
import { AssetsPanel, type GenType, type PanelDragAsset } from './assets-panel';
import { addElementEntry } from './element-history';
import { type ScriptCut, ScriptPanel } from './script-panel';
import { CaptionsPanel } from './captions-panel';
import { FramePanel } from './frame-panel';
import { PersonFxPanel, type MatteState } from './person-fx-panel';
import { ShotTreatmentPanel } from './shot-treatment-panel';
import { MusicPanel } from './music-panel';
import { AvatarPanel } from './avatar-panel';
import { useAudioTracks } from './use-audio-tracks';
import { useDenoise } from './use-denoise';
import { TransitionPanel } from './transition-panel';
import { MediaAnimPanel } from './media-anim-panel';
import { type MatteFrame, MATTE_FPS, computeMatteTrack } from './person-matte';
import { type FrameCatalogItem, useFrameCatalog } from './use-frame-catalog';
import { StudioBootOverlay } from './studio-boot';
import { confirm } from '@pireel/ui/confirm';
import { type ChatSituation, type StudioToolResult, STUDIO_TOOL_MAP, buildSituation } from '@pireel/studio-engine/prompts';
import { useAgentBridge } from './use-agent-bridge';
import { type VisualLabel, type VisualPrep, type VisualTimeline, analyzeVisual, clearVisualCache, finishVisualAnalysis, insertedClipSafeZone, prepareVisualAnalysis } from './visual';
import { type SafeZone, detectFrameAt, geomNote } from './geometry';
import { REF_WIDTH, normalizeDims, personFxFromFrame, shotSpan, syncVacancyPartner } from './workbench-utils';
import { shotCountChange, canvasSizeOnlyChange, blockPatchableChange, capPosOnlyChange, sameExceptCapStyle, shiftBox, shotFramingOnlyChange, themeMountOnlyChange } from './comp-diff';
import { BoxEditOverlay, CaptionEditOverlay } from './edit-overlays';
import { BracketCutIcon, CardShapeControls, ExportOptRow, TimeReadout } from './workbench-controls';
import { type AgentToolCtx, runStudioTool as runAgentStudioTool, runExternalTool as runAgentExternalTool } from './agent-tool-runner';
import { useCaptionsOps } from './use-captions-ops';
import { useClipInsert } from './use-clip-insert';
import { useElementOps } from './use-element-ops';
import { useBoxDrag } from './use-box-drag';
import { useAgentContext } from './use-agent-context';
import { useScriptCut } from './use-script-cut';


const PREVIEW_FALLBACK_W = 320; // fallback width before parent size is measured
const RAIL_NAV_W = 48; // vertical primary-nav strip on the rail's outer edge; railW measures the CONTENT column only
const UNDO_CAP = 20; // undo snapshot stack cap (each = full Composition, incl. custom block HTML)
// ⚠️ Temporary for testing: fill only the first N images to save LLM calls, rest stay as placeholders — **remove before launch**.
// Kept at top level so it isn't buried in a 400-line tool branch and shipped by accident.

/** Tool panel kinds (single instance, mutually exclusive, docked as a column in the asset rail): gen / smart-cut / person / framing / code / media-anim / transition / captions / kit props. */
type FloatKind = 'gen' | 'script' | 'person' | 'shot' | 'code' | 'anim' | 'transition' | 'captions' | 'kitProps';


export function HyperframesWorkbench({ projectId, agentView = false }: { projectId: string; agentView?: boolean }) {
  const locale = useLocale(); // note/reply language follows UI locale (on-screen text follows the narration script language)
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const starter = useMemo(() => emptyComposition(), []);
  const [comp, _setComp] = useState<Composition>(starter);
  // setComp wrapper: also writes compRef synchronously — when agent tools/pipeline read-modify the composition
  // **multiple times within the same tick** (under React 18 batching, state/plain refs only update after re-render),
  // compRef is always current so a later write doesn't clobber an earlier one.
  const compRef = useRef<Composition>(starter);
  const setComp = useCallback((action: React.SetStateAction<Composition>) => {
    const next = typeof action === 'function' ? (action as (c: Composition) => Composition)(compRef.current) : action;
    compRef.current = next;
    _setComp(next);
  }, []);
  // Block selection: selectedId = primary (anchor; floating toolbar/panels only act on a single block);
  // selectedBlockIds = full multi-select set (⌘-click/marquee, used for bulk delete). setSelectedId is wrapped
  // as a setter: every existing single-select site auto-normalizes the multi-select set to {id}/empty, no per-site
  // change; multi-select gestures (toggleBlockSelect/selectBlocksBox) set both directly.
  const [selectedId, setSelectedIdRaw] = useState<string | null>(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(() => new Set());
  const setSelectedId = useCallback((id: string | null) => {
    setSelectedIdRaw(id);
    setSelectedBlockIds(id ? new Set([id]) : new Set());
  }, []);
  const selectedBlockIdsRef = useRef<Set<string>>(selectedBlockIds);
  selectedBlockIdsRef.current = selectedBlockIds;
  // Shot selection: selectedShotId = primary (anchor; framing/matte panels only act on a single shot);
  // selectedShotIds = full multi-select set (⌘-click/marquee, used for bulk delete). setSelectedShotId is wrapped
  // as a setter: every existing single-select call site auto-normalizes the multi-select set to {id}/empty, no
  // per-site change; multi-select gestures use dedicated functions that set both directly.
  const [selectedShotId, setSelectedShotIdRaw] = useState<string | null>(null);
  const [selectedShotIds, setSelectedShotIds] = useState<Set<string>>(() => new Set());
  const setSelectedShotId = useCallback((id: string | null) => {
    setSelectedShotIdRaw(id);
    setSelectedShotIds(id ? new Set([id]) : new Set());
  }, []);
  const selectedShotIdsRef = useRef<Set<string>>(selectedShotIds);
  selectedShotIdsRef.current = selectedShotIds;
  // Audio-lane selection (timeline chip ↔ audio settings; Del deletes, and the toolbar's split/trim act on it).
  // Declared alongside the other selection state so every selection path can clear it — the three are mutually
  // exclusive: whatever the user picks last owns the toolbar.
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);
  const selectedAudioIdRef = useRef<string | null>(null);
  selectedAudioIdRef.current = selectedAudioId;
  // Picking a component or a shot drops the audio selection (the reverse lives in onSelectAudio, which clears
  // both sets in the same batch — so this effect sees an empty selection there and leaves the audio alone).
  useEffect(() => {
    if (selectedId || selectedShotIds.size) setSelectedAudioId(null);
  }, [selectedId, selectedShotIds]);
  /** ⌘/Ctrl click: toggle a shot in/out of the multi-select set; anchor follows the last-interacted shot. */
  const toggleShotSelect = useCallback((id: string) => {
    setSelectedId(null);
    setSelectedShotIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelectedShotIdRaw(next.has(id) ? id : (next.values().next().value ?? null));
      return next;
    });
  }, []);
  /** Marquee: set hit shots as the multi-select set (empty hit = clear selection); anchor is the first. */
  const selectShotsBox = useCallback((ids: string[]) => {
    setSelectedId(null);
    setSelectedShotIds(new Set(ids));
    setSelectedShotIdRaw(ids[0] ?? null);
  }, []);
  /** ⌘/Ctrl click a block: toggle in/out of the multi-select set (symmetric with shot multi-select; no single primary in multi-select mode, panels step aside). */
  const toggleBlockSelect = useCallback(
    (id: string) => {
      setSelectedShotId(null);
      setSelectedIdRaw((cur) => {
        // First ⌘-click of another block from single-select: fold the previous primary into the multi-select set
        if (cur && cur !== id) setSelectedBlockIds((prev) => new Set(prev).add(cur));
        return null;
      });
      setSelectedBlockIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [setSelectedShotId],
  );
  /** Marquee blocks: set hit blocks as the multi-select set (can span multiple block tracks; empty hit = clear). */
  const selectBlocksBox = useCallback(
    (ids: string[]) => {
      setSelectedShotId(null);
      setSelectedIdRaw(null);
      setSelectedBlockIds(new Set(ids));
    },
    [setSelectedShotId],
  );
  // Timeline hover-preview jumped outside the selected block's time window → hide the edit box with the frame (else the border pins onto an unrelated frame)
  const [scrubHideSel, setScrubHideSel] = useState(false);
  // Body-drag center snap guides: persistent DOM, toggle display directly — zero setState on the drag path.
  // (Previously via state: every flip near the midline re-rendered the whole tree, the source of the "stutter mid-drag".)
  const guideVRef = useRef<HTMLDivElement | null>(null); // vertical midline
  const guideHRef = useRef<HTMLDivElement | null>(null); // horizontal midline
  const setGuideVis = useCallback((cx: boolean, cy: boolean) => {
    if (guideVRef.current) guideVRef.current.style.display = cx ? 'block' : 'none';
    if (guideHRef.current) guideHRef.current.style.display = cy ? 'block' : 'none';
  }, []);
  // Body-drag/handle-drag in progress (mount the shield + empty-block action layer steps aside). The selection box
  // **no longer steps aside**: unified with caption-handle ghost semantics — baseline solid line stays put,
  // dashed ghost follows the pointer, content doesn't update live, one commit on release
  const [bodyDragging, setBodyDragging] = useState(false);
  // In-place text edit echo: text changed via the iframe 'edit' message is already current in the active doc — a
  // slots-only commit of that block can skip the rebuild (rebuilding is wasted echo and flickers once). Record the
  // block id, consumed when the patch classifier hits
  const iframeEditEchoRef = useRef<Set<string>>(new Set());
  // Back-buffer swap pending: in-place patches only hit the **active** doc; if applied while a swap is pending they'd
  // be clobbered by the incoming generation — inside this window the patch path steps aside and falls back to a full
  // doc rebuild (rebuild composes the latest comp, always correct)
  const pendingSwitchRef = useRef(false);
  // Full doc rebuild in progress (write back-buffer → handshake → swap): show an "updating frame" indicator in the
  // stage corner, covering all structural changes uniformly — manual insert / AI block landing / theme mount, etc.
  // (users reported no feedback in the gap between insert and display)
  const [rebuilding, setRebuilding] = useState(false);
  // Landing skeleton for a just-inserted block (normalized coords): before the rebuild settles, draw a dashed box + spinner where the block will appear
  const [pendingInsert, setPendingInsert] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // Drag ghost dashed box: persistent DOM, sets style directly (zero setState, like the snap guides); input is a normalized box
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const setGhostRect = useCallback((g: { x: number; y: number; w: number; h: number } | null) => {
    const el = ghostRef.current;
    if (!el) return;
    const sr = stageBoxRef.current?.getBoundingClientRect();
    if (!g || !sr) {
      el.style.display = 'none';
      return;
    }
    el.style.display = 'block';
    el.style.left = `${g.x * sr.width}px`;
    el.style.top = `${g.y * sr.height}px`;
    el.style.width = `${g.w * sr.width}px`;
    el.style.height = `${g.h * sr.height}px`;
  }, []);
  // Full-screen shield cursor during parent-side handle drag (shield rendered at the stage): set the resize cursor per drag type
  const dragCursorRef = useRef('default');
  const [bgOpen, setBgOpen] = useState(false); // background-color popover on the floating toolbar
  // Image slot clicked inside a custom block (preview bridge reports index + normalized rect): show the image-specific
  // toolbar hugging the image. Only rendered when blockId === currently selected block, so it lapses naturally on
  // deselect, no need to clear along every selection path
  const [imgSel, setImgSel] = useState<{ blockId: string; index: number; rect: { x: number; y: number; w: number; h: number } } | null>(null);
  // Media block loading has two phases: upload = file uploading; swap = stored, awaiting the buffered swap after
  // rebuild + CDN image load (the known window where the frame is unchanged for a few seconds after insert/swap —
  // show "loading" instead of dead silence). Badge reuses the "generating" style
  const [mediaBusy, setMediaBusy] = useState<Record<string, 'upload' | 'swap'>>({});
  const setMediaBusyPhase = useCallback((id: string, phase: 'upload' | 'swap' | null) => {
    setMediaBusy((m) => {
      const next = { ...m };
      if (phase) next[id] = phase;
      else delete next[id];
      return next;
    });
    // swap-phase 20s fallback: if the swap never arrives (offline/load failure), the badge must not hang forever
    if (phase === 'swap') {
      setTimeout(() => setMediaBusy((m) => (m[id] === 'swap' ? Object.fromEntries(Object.entries(m).filter(([k]) => k !== id)) : m)), 20000);
    }
  }, []);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const stageBoxRef = useRef<HTMLDivElement | null>(null); // stage canvas layer (boxW×boxH): used by the rotate handle to compute block center
  const rotateOverlayRef = useRef<HTMLDivElement | null>(null); // selection box root: directly set its transform during rotate drag (handle follows pointer, zero re-render)
  const rotateLabelRef = useRef<HTMLSpanElement | null>(null); // angle number next to the rotate handle: set textContent directly while dragging
  const [tSec, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  // Debug instruments (analysis/face/source) are admin-only: no entry rendered for normal users
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { role?: string } | null) => setIsAdmin(b?.role === 'admin'))
      .catch(() => {});
  }, []);
  // Right-panel categories (selected via the vertical toolbar): chat / image / video / blocks / upload / captions / frame (code = source drill-down of the selected block)
  const [codeBlockId, setCodeBlockId] = useState<string | null>(null); // which block the source editor is viewing
  const [codeLoop, setCodeLoop] = useState(false); // source editor "loop preview" toggle
  const [panelW, setPanelW] = useState(342); // right panel width (shared by all panels, drag left edge, 320–760)
  const loopRangeRef = useRef<{ start: number; end: number } | null>(null); // loop window (final time); clock reports out-of-range → jump back
  const codeOrigRef = useRef<{ id: string; templateId: string; slots: Block['slots'] } | null>(null); // baseline at source open; restore if closed without applying
  const codeDraftRef = useRef<SourceDraft | null>(null); // last uncommitted draft pushed to stage (before restore, confirm current content is still it — don't overwrite side-channel edits like chat)
  // Generation lock (genIds/markGenerating/genLockToast) — see use-generation-lock.ts
  const { genIds, genIdsRef, markGenerating, genLockToast } = useGenerationLock();
  const [visual, setVisual] = useState<VisualTimeline | null>(null);
  const [plan, setPlan] = useState<DraftPlan | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  // Draft restore: read once on open (later autosave overwrites storage, but the offer holds a snapshot)
  const [draftOffer, setDraftOffer] = useState<StudioDraft | null>(() => (typeof window === 'undefined' ? null : loadDraft(projectId)));
  const pendingRestoreRef = useRef<StudioDraft | null>(null); // blocks restored, awaiting reconnection to the original video
  const [chatEpoch, setChatEpoch] = useState(0); // +1 after adopting a cloud session; remounts StudioChat to re-read local cache
  const [chatRev, setChatRev] = useState(0); // chat thread persist counter: triggers cloud sync
  const bumpChatRev = useCallback(() => setChatRev((v) => v + 1), []); // stable reference (StudioChat is memoized)
  const conflictWarnedRef = useRef(false);
  // Single-writer demotion: set when the bridge kicks this tab (close 4000 = another window took
  // over as the active surface). A displaced tab stops cloud autosave (its 409 rebase-retry is
  // forbidden — a stale tab must never clobber the writer), refreshes itself on focus, and
  // reclaims writership on the next local edit intent (undo snapshot = the edit-intent signal).
  const [displaced, setDisplaced] = useState(false);
  const displacedRef = useRef(false);
  const cloudSaveChainRef = useRef<Promise<void>>(Promise.resolve()); // serializes cloud PUTs (flush-on-evict must not race an in-flight save)
  const bridgeReclaimRef = useRef<() => void>(() => {});
  const reclaimWritership = () => {
    if (!displacedRef.current) return;
    displacedRef.current = false;
    setDisplaced(false);
    bridgeReclaimRef.current(); // evicts the other tab; conflicts with anything it wrote resolve via the 409 rebase-retry
    toast.info(t('workbench.reclaimedWritership'));
  };
  const [busyImport, setBusyImport] = useState(false);
  const [asrSentences, setAsrSentences] = useState<AsrSegment[] | null>(null);
  /** Insert-source transcripts (key = shot.src, sentence times = that source file's own timeline). All sources transcribed when opening the captions / smart-cut panels. */
  const [clipAsr, setClipAsr] = useState<Record<string, AsrSegment[]>>({});
  const [filmstrip, setFilmstrip] = useState<FilmstripFrame[]>([]);
  const [pps, setPps] = useState(DEFAULT_PPS); // timeline zoom (px/sec), controlled by the ruler slider
  const [locateSignal, setLocateSignal] = useState(0); // increment = scroll timeline to the playhead
  // near=true: only scroll when the playhead would be off-screen (jumps made from another panel), vs the
  // transport readout, which always centres because that IS the request.
  const [locateNear, setLocateNear] = useState(false);
  const locateTimeline = (near = false) => {
    setLocateNear(near);
    setLocateSignal((n) => n + 1);
  };
  const [libTab, setLibTab] = useState<'assets' | 'frames' | 'script' | 'captions' | 'audio' | 'avatar'>('assets'); // rail primary-nav tab (assets / script-cut / captions / audio / avatar; themes hidden)
  const [libCollapsed, setLibCollapsed] = useState(false); // asset rail collapsed (narrow strip + expand button; content hidden but state kept)
  // Asset rail geometry: drag-resizable width + pin mode (pinned = docked column taking layout
  // space; unpinned = floating overlay above the canvas, the stage keeps full width). Both persist.
  const [railW, setRailW] = useState(() => {
    if (typeof window === 'undefined') return 320;
    const v = Number(window.localStorage.getItem('studio-rail-w'));
    if (Number.isFinite(v) && v >= 260 && v <= 786) return v;
    // No stored width → derive from the screen: fit a whole number of fixed 120px asset-card
    // columns (~22vw budget, 2–6 cols) so the grid lands flush with no leftover strip.
    // 130 = card 120 + gap 10; 16 = the grid's p-2 content padding.
    const cols = Math.max(2, Math.min(6, Math.floor((window.innerWidth * 0.22 - 6) / 130)));
    return 16 + cols * 120 + (cols - 1) * 10;
  });
  const [railPinned, setRailPinned] = useState(() => (typeof window !== 'undefined' ? window.localStorage.getItem('studio-rail-pin') !== '0' : true));
  useEffect(() => {
    try {
      window.localStorage.setItem('studio-rail-w', String(railW));
      window.localStorage.setItem('studio-rail-pin', railPinned ? '1' : '0');
    } catch {
      /* private mode: geometry just resets next session */
    }
  }, [railW, railPinned]);
  const railAutoCollapsedRef = useRef(false); // our small-screen auto-collapse (vs the user's manual one — only ours auto-reopens)
  /** Manual collapse/expand: overrides any pending small-screen auto state. */
  const setLibCollapsedManual = (v: boolean) => {
    railAutoCollapsedRef.current = false;
    setLibCollapsed(v);
  };
  // Small screens: auto-collapse the rail to give the stage room; growing back reopens it only
  // if the collapse was ours (a user's deliberate collapse stays collapsed).
  // Threshold 1152 (not 1280): 14" Windows laptops at the OS-recommended 150% scaling are exactly
  // 1280 CSS px wide (and 2560×1600 @200% too) — the rail must stay expanded there. ≤1152 is
  // effectively tablets and half-screen windows only.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1152px)');
    const apply = (matches: boolean) => {
      if (matches) {
        setLibCollapsed((c) => {
          if (!c) railAutoCollapsedRef.current = true;
          return true;
        });
      } else if (railAutoCollapsedRef.current) {
        railAutoCollapsedRef.current = false;
        setLibCollapsed(false);
      }
    };
    apply(mq.matches);
    const on = (e: MediaQueryListEvent) => apply(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  // Chat area (left) open/close: chat can be closed to free up the frame; the top-right "chat" button on the preview
  // only appears when chat is hidden. Agent view collapses by default: the main conversation lives in the external
  // agent (Codex), the built-in chat on the right just takes up space
  const [panelOpen, setPanelOpen] = useState(!agentView);
  // Tool panels (gen/smart-cut/person/framing/code/anim/transition): **dock into the asset rail column, full area**
  // (per user: not a new tab, takes the whole column; if the rail is collapsed, expand it first, and collapse back
  // when a panel-triggered expansion closes). **Single instance** — opening another replaces the current one
  // (setFloatWin handles the exit settlement uniformly).
  const [floatWin, setFloatWinRaw] = useState<FloatKind | null>(null);
  const floatWinRef = useRef<FloatKind | null>(null);
  const [genType, setGenType] = useState<GenType>('image'); // current tab inside the gen panel
  const [genRefreshTick, setGenRefreshTick] = useState(0);
  /** The rail was "auto-expanded just to dock a panel" — collapse it back after the panel closes (leave user-expanded ones alone). */
  const libAutoExpandedRef = useRef(false);
  const [area, setArea] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [showGeom, setShowGeom] = useState(false); // debug: overlay face/safe-zone geometry on the preview to verify the algorithm
  const [liveGeom, setLiveGeom] = useState<SafeZone | null>(null); // live single-frame detection (measure whichever frame you scrub to)

  const duration = totalDuration(comp);
  const hasVideoTrack = !!comp.video || !!comp.shots?.length; // equal-footing: clips-only comps have a video track
  const hasContent = hasVideoTrack || comp.blocks.length > 0; // empty canvas (no sources, no blocks) isn't playable
  // Canvas ratio: seeded by the FIRST inserted source (insertClipCore), overridable here; other
  // sources contain-fit into it (frame shim letterboxes, never crops).
  const CANVAS_RATIOS = [
    { id: '9:16', w: 1080, h: 1920 },
    { id: '16:9', w: 1920, h: 1080 },
    { id: '1:1', w: 1080, h: 1080 },
    { id: '3:4', w: 1080, h: 1440 },
    { id: '4:3', w: 1440, h: 1080 },
  ] as const;
  const currentRatioId = CANVAS_RATIOS.find((r) => Math.abs(r.w / r.h - comp.width / comp.height) < 0.02)?.id;
  const [ratioOpen, setRatioOpen] = useState(false);
  const applyCanvasRatio = (w: number, h: number) => {
    setRatioOpen(false);
    if (Math.abs(w / h - comp.width / comp.height) < 0.02) return;
    pushUndoSnapshot();
    setComp((c) => ({ ...c, width: w, height: h }));
  };
  // Preview box scale: computed after `bufs` below (stage geometry follows the ACTIVE doc's canvas
  // dims, not the live comp — a ratio switch must change shape atomically WITH the buffer swap,
  // otherwise the old content flashes stretched into the new shape for the rebuild window).
  /** Floating toolbar positioning — single source of truth, shared by drag-follow (direct DOM writes) and React
   *  render; the two must produce identical numbers to avoid jumps. Pure follow, no clamping (edge-docking feel was
   *  rejected); avoiding truncation is structural: the toolbar mounts outside the stage's clipping layer. */
  const toolbarXY = useCallback((box?: { x: number; y: number; w: number; h: number } | null) => {
    const W = compRef.current.width * fitRef.current;
    const H = compRef.current.height * fitRef.current;
    return { left: box ? (box.x + box.w / 2) * W : W / 2, top: box ? box.y * H - 40 : 8 };
  }, []);
  // Debug overlay: geometry (face/safe-zone) of the frame segment at the playhead; normalized coords overlaid as % on the preview (= full-canvas scale)
  const geomSeg =
    showGeom && visual
      ? visual.segments.find((s) => tSec >= s.start - 0.01 && tSec < s.end + 0.01) ?? visual.segments.at(-1) ?? null
      : null;
  // Geometry for the overlay: prefer **live single frame** (measure whichever frame you scrub to, accurate), else fall back to **segment aggregate**
  const dbgGeom = showGeom ? liveGeom ?? geomSeg?.geom ?? null : null;
  // Preview doc **doesn't bake fitScale** (autofit applied live via the hf:fit message): otherwise every measured
  // write-back mutates the doc → rebuild → reload → re-measure, and near a boundary this loops into a "flicker every
  // few seconds". Export still uses the full comp.
  //
  // Preview media images **feed only the 1280 thumbnail direct link**, not multi-MB originals: large photos (phone
  // originals) pend forever downloading in srcdoc, and every structural rebuild re-downloads all media images → piles
  // of pending; thumbnails open instantly. Export still uses full-comp originals (previewCompOf only affects the
  // preview doc). Video is untouched (streams while playing, no stall).
  const previewCompOf = (c: Composition): Composition => ({
    ...c,
    blocks: c.blocks.map((b) => {
      const m = b.slots?.media as MediaRef | undefined;
      const previewUrl = m?.type === 'image' && m.url ? imageThumb(m.url, 'canvas') : null;
      if (!previewUrl && b.fitScale === undefined) return b;
      return {
        ...b,
        ...(b.fitScale !== undefined ? { fitScale: undefined } : {}),
        ...(previewUrl ? { slots: { ...b.slots, media: { ...m, url: previewUrl } } } : {}),
      };
    }),
  });
  // Debug panel's assembled HTML is built only when the panel is open (don't stitch strings every frame during high-frequency setComp like dragging)
  const assembled = useMemo(() => (showCode ? assembleHtml(previewCompOf(comp)) : ''), [comp, showCode]);

  // Test hook: readable snapshot of the narration script + visual analysis (also on window.__studio for devtools)
  const debugText = useMemo(() => {
    const out: string[] = [`# transcript (${asrSentences?.length ?? 0} lines)`];
    (asrSentences ?? []).forEach((s, i) => out.push(`${i}. [${s.start.toFixed(1)}–${s.end.toFixed(1)}] ${s.text}`));
    out.push('', `# visual analysis (${visual?.segments.length ?? 0} segments · ${visual?.cuts.length ?? 0} source cuts)`);
    out.push(`geometry pass (MediaPipe): ${geomNote()}`);
    if (visual) out.push(`geometry pass: ${visual.geomNote ?? '—'}`);
    const pct = (n: number) => Math.round(n * 100);
    const fmtRect = (r: { x: number; y: number; w: number; h: number }) => `(${pct(r.x)},${pct(r.y)} ${pct(r.w)}×${pct(r.h)})`;
    (visual?.segments ?? []).forEach((sg) => {
      out.push(
        `[${sg.start.toFixed(1)}–${sg.end.toFixed(1)}] ${sg.label.content} · person:${sg.label.person} · safe:${sg.label.safe} · ${sg.label.hasText ? 'burned-in text' : 'no burned-in text'}${sg.label.desc ? ` · ${sg.label.desc}` : ''}`,
      );
      if (sg.geom) {
        out.push(
          `      safe-zones%: ${sg.geom.rects.map(fmtRect).join(' ') || '(none)'}` +
            `${sg.geom.face ? ` · face${fmtRect(sg.geom.face)}` : ''}${sg.geom.subject ? ` · subject${fmtRect(sg.geom.subject)}` : ''}`,
        );
      }
    });
    if (plan?.scenes.length) {
      out.push('', `# scenes (${plan.scenes.length})`);
      plan.scenes.forEach((s) => {
        const g = s.graphic ? ` · ${s.graphic.data ?? s.graphic.brief}` : '';
        const e = s.emphasis?.length ? ` · emphasis:${s.emphasis.join(' ')}` : '';
        out.push(`[${s.from}-${s.to}] ${s.framing}${g}${e}`);
      });
    }
    return out.join('\n');
  }, [asrSentences, visual, plan]);
  useEffect(() => {
    (window as unknown as { __studio?: unknown }).__studio = { asr: asrSentences, visual, plan };
  }, [asrSentences, visual, plan]);
  // Preview double-buffering: after a comp change the new doc loads in a **background iframe** (inject video/seek/
  // restore selection); it swaps atomically only when ready, keeping the old frame visible to the last moment —
  // eliminates the full-reload white flash (especially visible when a run of images completes).
  const [bufs, setBufs] = useState<{ docs: [string, string]; dims: [{ w: number; h: number }, { w: number; h: number }]; active: 0 | 1 }>(() => ({
    docs: [injectPreviewRuntime(assembleHtml(starter)), ''],
    dims: [
      { w: starter.width, h: starter.height },
      { w: starter.width, h: starter.height },
    ],
    active: 0,
  }));
  const bufsRef = useRef(bufs);
  bufsRef.current = bufs;
  const iframesRef = useRef<(HTMLIFrameElement | null)[]>([null, null]);
  // Stage geometry = the ACTIVE buffer's canvas (see the note at the old fit site above)
  const activeDims = bufs.dims[bufs.active];
  const fit =
    area.w > 0 && area.h > 0 ? Math.min(area.w / activeDims.w, area.h / activeDims.h) : PREVIEW_FALLBACK_W / activeDims.w;
  const fitRef = useRef(fit); // used in the (mounted-once) message handler to convert comp px → stage px
  fitRef.current = fit;
  const boxW = Math.round(activeDims.w * fit);
  const boxH = Math.round(activeDims.h * fit);
  const previewAreaRef = useRef<HTMLDivElement | null>(null);
  const tRef = useRef(0);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const selectedShotIdRef = useRef<string | null>(null);
  selectedShotIdRef.current = selectedShotId;
  const playingRef = useRef(false);
  playingRef.current = playing;
  // Read/write the latest state while pipeline tools run async (setState is async; multi-step tool runs rely on refs for the latest)
  const videoFileRef = useRef<File | null>(null);
  videoFileRef.current = videoFile;
  const asrRef = useRef<AsrSegment[] | null>(null);
  asrRef.current = asrSentences;
  const clipAsrRef = useRef<Record<string, AsrSegment[]>>({});
  clipAsrRef.current = clipAsr;
  const planRef = useRef<DraftPlan | null>(null);
  planRef.current = plan;
  const visualRef = useRef<VisualTimeline | null>(null);
  visualRef.current = visual;
  // BYO visual analysis (visual_brief/submit_visual): the prepared-brief intermediate state awaiting the agent's labels
  const visualBriefRef = useRef<VisualPrep | null>(null);
  /** Land visual analysis results (shared by BYO submit and cache hit; same as stepVisual's finalization). */
  const applyVisualResult = (vis: VisualTimeline) => {
    visualRef.current = vis;
    setVisual(vis);
    // Attach the background-derived palette to the composition; don't override when a frame is mounted (a frame is a user-chosen design system)
    if (vis.palette) setComp((c) => (c.frameId ? c : { ...c, palette: vis.palette }));
  };
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  /** Source video bytes unavailable on this device (OPFS miss + no cloud copy — browser switch or
   *  cleared storage). The stage still renders and cloud-backed content (captions/blocks) stays
   *  editable; a placeholder in the preview tells the user to re-pick the original file. */
  // Per-asset missing-source architecture: there is NO project-level missing state — each asset
  // (panel card / timeline strip) reflects its own source's reachability. Only the sig anchor needs
  // hygiene: when nothing references the main source anymore, drop it (autosave would otherwise
  // re-persist a stale anchor forever).
  useEffect(() => {
    if (videoSigRef.current && !videoFile && !comp.video && !(comp.shots ?? []).some((s) => !s.src)) videoSigRef.current = null;
  }, [comp.video, comp.shots, videoFile]);
  const objectUrlRef = useRef<string | null>(null); // current blob: preview URL, revoked on swap/unmount
  // Person matte: when enabled, the fully-budgeted mask track (source-time indexed, webp-compressed in memory; invalidated on video swap)
  // Parent-side video track engine (canvas render mode): decode/clock/audio stay resident, frames pushed to the iframe canvas
  const videoEngineRef = useRef<VideoTrackEngine | null>(null);
  useEffect(() => {
    const eng = new VideoTrackEngine();
    videoEngineRef.current = eng;
    eng.onFrame = (frame, info, frame2) => {
      // Push only to the active buffer (ImageBitmap transferred once); when the background buffer debuts, the bufs.active effect refreshes to backfill the frame
      // frame2 = the "other side" shadow frame within a transition window (true dual-stream: before cut = B's lead-in, after cut = A's tail)
      const w = iframesRef.current[bufsRef.current.active]?.contentWindow;
      if (!w) {
        // No target window (iframe torn down mid-decode): close instead of leaking the bitmaps
        frame.close();
        frame2?.close();
        return;
      }
      try {
        w.postMessage(
          { type: 'hf:frame', frame, ...(frame2 ? { frame2 } : {}), t: info.t, elKey: info.elKey, srcT: info.srcT },
          '*',
          frame2 ? [frame, frame2] : [frame],
        );
      } catch {
        try {
          frame.close();
          frame2?.close();
        } catch {
          /* ignore */
        }
      }
    };
    eng.onTick = (t) => {
      if (!playingRef.current) return;
      tRef.current = t;
      playhead.set(t);
      postPreview({ type: 'hf:seekTimelines', t }); // align overlay layers (GSAP/captions) every frame
    };
    // Transition pre-bake provider: cut → decoded frame group (bakesRef maintained by the effect below)
    eng.bakeProvider = (cut) => {
      for (const e of bakesRef.current.values()) {
        if (Math.abs(e.cut - cut) < 0.05 && e.bitmaps && e.baked) return { fps: e.baked.fps, half: e.half, frames: e.bitmaps };
      }
      return null;
    };
    eng.onEnded = () => {
      const D = eng.durationSec || totalDuration(compRef.current);
      tRef.current = D;
      playhead.set(D);
      setT(D);
      setPlaying(false);
    };
    return () => {
      eng.dispose();
      videoEngineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mask tracks stored per **source** (multi-source main track: one per source file, key = 'main' | shot.src): matte whichever file a segment's source points to
  const matteTrackRef = useRef<Map<string, MatteFrame[]>>(new Map());
  const matteAbortRef = useRef<AbortController | null>(null);
  const [matteState, setMatteState] = useState<MatteState>({ status: 'idle', done: 0, total: 0 });
  const chatRef = useRef<StudioChatHandle | null>(null); // push the four-step "one-click render" progress to chat
  // Export (state + submit/poll/cancel) — see use-export.ts
  /** Files for locally-inserted clips (key = blob URL; the two split halves share one src so they share naturally):
   *  same "keep local, don't upload" mode as the main video, injected into preview via hf:clipFile and read directly
   *  by client export. After refresh the blob is invalid; revived from the OPFS local library by srcSig (see draft restore). */
  const clipFilesRef = useRef<Map<string, File>>(new Map());
  /** The main video's **effective sig**: usually = fileSig(videoFile); when fetched from cloud, the original sig
   *  (a fetched File's name/mtime change so fileSig drifts — sync layer/cache keys all read this, never recompute). */
  const videoSigRef = useRef<string | null>(null);
  /** Cloud byte index (in-memory form of context.media): sig → R2 key. Successful backups land here, carried on the next cloud sync. */
  const cloudMediaRef = useRef<{ video?: { sig: string; key: string }; clips?: Record<string, { key: string }> }>({});
  const [cloudMediaRev, setCloudMediaRev] = useState(0);
  /** Silently back up a source video to R2 (content-addressed, dup = instant); on success record the index and trigger a cloud sync. */
  const backupMediaToCloud = (file: File, sig: string, kind: 'video' | 'clip') => {
    void studioProviders().vault.backup(file, sig).then((r) => {
      if (!r) return; // silent degrade: local works as usual, retry on next open (idempotent)
      if (kind === 'video') cloudMediaRef.current = { ...cloudMediaRef.current, video: { sig, key: r.key } };
      else cloudMediaRef.current = { ...cloudMediaRef.current, clips: { ...cloudMediaRef.current.clips, [sig]: { key: r.key } } };
      setCloudMediaRev((v) => v + 1);
    });
  };
  /** Export-time audio/denoise payload getters; filled by useBgm/useDenoise below (hook order: they need consts defined later). */
  const audioExportRef = useRef<(() => { clip: AudioClip; file: File }[] | null) | null>(null);
  const denoiseExportRef = useRef<(() => Map<string, File> | null) | null>(null);
  const { exporting, publishing, exportPct, exportVideo, cancelExport, resetExport } = useStudioExport({ compRef, videoFileRef, clipFilesRef, audioExportRef, denoiseExportRef });
  // Agent export task (export_video/track_export): compose + browser download runs via exportVideo, this only tracks task state;
  // exportPct mirrored into a ref for the progress query inside runStudioTool (the switch closure can't read state)
  const agentExportRef = useRef<{ running: boolean; filename: string | null; error: string | null; delivered?: 'local_sink' | 'browser_download'; sinkError?: string }>({
    running: false,
    filename: null,
    error: null,
  });
  const exportPctRef = useRef(0);
  exportPctRef.current = exportPct;
  // Export dialog: options persist (remembers last choice within this session), only runs on confirm
  const [exportOpen, setExportOpen] = useState(false);
  const [exportOpts, setExportOpts] = useState<ExportRenderOpts>(DEFAULT_RENDER_OPTS);

  // Engine source sync: swap source whenever the main video File changes (the resident element only swaps src, the decode session doesn't churn with doc rebuilds)
  useEffect(() => {
    videoEngineRef.current?.setSource('main', videoFile ?? null);
    if (videoFile) videoEngineRef.current?.seek(tRef.current);
  }, [videoFile]);
  // Engine segment table + other sources: refeed the whole table whenever shots change (split/trim/insert/delete); push the current frame when paused
  useEffect(() => {
    const eng = videoEngineRef.current;
    if (!eng) return;
    // Equal-footing: real shots always feed the engine, main source or not (a clips-only comp must
    // render); the implicit whole-video single clip is only for a loaded main with no cuts yet.
    const shots = comp.shots?.length
      ? comp.shots
      : comp.video
        ? [{ id: 'all', src: undefined, srcStart: 0, srcEnd: comp.video.durationSec, treatment: 'full' as const }]
        : [];
    for (const s of shots) {
      if (!s.src) continue;
      const f = clipFilesRef.current.get(s.src);
      eng.setSource(s.src, f ?? (s.src.startsWith('blob:') ? null : s.src));
    }
    const shapeChanged = eng.setSegments(
      // Same envelope the export mixer builds (segmentFadeFn): the shot's own fades × micro-fades on edges
      // that meet a non-contiguous neighbour. Preview drives it off the rAF clock, so a 30 ms ramp lands as
      // two or three volume steps rather than a smooth curve — coarse, but it's the same treatment at the
      // same seams, which is what keeps preview honest about the export.
      shots.map((s, i) => {
        const prev = shots[i - 1];
        const next = shots[i + 1];
        const fade = segmentFadeFn(
          s,
          Math.max(0.01, s.srcEnd - s.srcStart),
          !!prev && !shotsContiguous(prev, s),
          !!next && !shotsContiguous(s, next),
        );
        return {
          key: s.src ?? 'main',
          elKey: s.src ? `clip_${s.id}` : 'main',
          srcStart: s.srcStart,
          srcEnd: s.srcEnd,
          gain: shotGain(s),
          ...(fade ? { fadeAt: fade } : {}),
        };
      }),
    );
    eng.setTransitions(cutTransitions(comp.shots ?? []).map((tr) => ({ cut: tr.cut, half: tr.half }))); // window table for shadow decoding
    // A level-only respec keeps the frame it already shows — re-pushing one per pointer move while dragging
    // a volume slider is work nobody can see.
    if (shapeChanged && !playingRef.current) eng.refresh();
  }, [comp.video, comp.shots]);
  /** Transition pre-bake cache (same idea as Premiere's "render preview"): baked in the background to a webp frame
   *  sequence, decoded to bitmaps only near the window and discarded once past; the signature includes cut/duration/
   *  effect/direction/both sides' source times and file fingerprints — any relevant edit auto-invalidates. While baking,
   *  or if it can't bake (file missing), playback falls back to the shadow-decode path. */
  const bakesRef = useRef<Map<string, { sig: string; cut: number; half: number; baked: BakedWindow | null; bitmaps: ImageBitmap[] | null; decoding?: boolean }>>(new Map());
  const bakeGenRef = useRef(0);
  useEffect(() => {
    const gen = ++bakeGenRef.current;
    const c = comp;
    if (!c.video || !videoFile) return;
    const spans = clipSpans(ensureShots(c));
    const specs: (BakeSpec & { sig: string })[] = [];
    for (const tr of cutTransitions(c.shots ?? [])) {
      const iB = spans.findIndex((sp, i) => i >= 1 && Math.abs(sp.editedStart - tr.cut) < 0.05);
      if (iB < 1) continue;
      const A = spans[iB - 1]!.clip;
      const B = spans[iB]!.clip;
      const fileA = A.src ? clipFilesRef.current.get(A.src) : videoFile;
      const fileB = B.src ? clipFilesRef.current.get(B.src) : videoFile;
      if (!fileA || !fileB) continue;
      const sig = [tr.cut.toFixed(2), tr.half.toFixed(2), tr.effect, tr.dir, A.srcEnd.toFixed(3), B.srcStart.toFixed(3), fileSig(fileA), fileSig(fileB), c.width, c.height].join('|');
      specs.push({ sig, cut: tr.cut, half: tr.half, effect: tr.effect, dir: tr.dir, fileA, aEnd: A.srcEnd, fileB, bStart: B.srcStart, compW: c.width, compH: c.height });
    }
    const want = new Set(specs.map((sp) => sp.sig));
    for (const [sig, e] of bakesRef.current) {
      if (!want.has(sig)) {
        e.bitmaps?.forEach((b) => b.close());
        bakesRef.current.delete(sig);
      }
    }
    // Start only 600ms after editing settles; bake serially one by one (a new gen yields immediately), don't hog the main thread during editing
    const timer = window.setTimeout(() => {
      void (async () => {
        for (const sp of specs) {
          if (bakeGenRef.current !== gen) return;
          if (bakesRef.current.get(sp.sig)?.baked) continue;
          const entry = { sig: sp.sig, cut: sp.cut, half: sp.half, baked: null as BakedWindow | null, bitmaps: null as ImageBitmap[] | null };
          bakesRef.current.set(sp.sig, entry);
          const baked = await bakeTransitionWindow(sp, () => bakeGenRef.current !== gen);
          if (bakeGenRef.current !== gen) return;
          if (baked && bakesRef.current.get(sp.sig) === entry) entry.baked = baked;
          else if (bakesRef.current.get(sp.sig) === entry) bakesRef.current.delete(sp.sig);
        }
      })();
    }, 600);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comp.shots, comp.video, videoFile, comp.width, comp.height]);
  // Decode when near / release when past (playhead-driven, provider reads synchronously; decodes 0.5× bitmaps, a 1s transition ≈ 60MB transient)
  useEffect(() => {
    const tick = () => {
      const t = playhead.get();
      for (const e of bakesRef.current.values()) {
        if (!e.baked) continue;
        const near = t >= e.cut - e.half - 1.5 && t <= e.cut + e.half + 0.5;
        if (near && !e.bitmaps && !e.decoding) {
          e.decoding = true;
          void decodeBake(e.baked).then((bs) => {
            e.decoding = false;
            if (bakesRef.current.get(e.sig) === e && e.baked) e.bitmaps = bs;
            else bs.forEach((b) => b.close());
          });
        } else if (e.bitmaps && (t < e.cut - e.half - 3 || t > e.cut + e.half + 3)) {
          e.bitmaps.forEach((b) => b.close());
          e.bitmaps = null;
        }
      }
    };
    const unsub = playhead.subscribe(tick);
    return () => unsub();
  }, []);
  const filmstripGenRef = useRef(0); // swap generation: invalidates old-video frame-extraction callbacks (extractFilmstrip has no abort)
  const filmstripRef = useRef<FilmstripFrame[]>([]); // mirror of filmstrip, to revoke frame blob URLs on unmount
  filmstripRef.current = filmstrip;
  // Drag by holding a block body in preview: snapshot the box baseline on drag-start; boxDrag's dx/dy (comp px) are all relative to that baseline
  const boxDragRef = useRef<{ id: string; box: { x: number; y: number; w: number; h: number } } | null>(null);
  const undoStackRef = useRef<Composition[]>([]); // snapshot stack before chat-tool changes (used by the undo tool; doesn't cover manual dragging)
  const redoStackRef = useRef<Composition[]>([]); // undone states; any new edit (pushUndoSnapshot) discards the whole redo line

  // Revoke blob URLs on unmount (original video + all filmstrip frames)
  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    filmstripRef.current.forEach((f) => URL.revokeObjectURL(f.url));
  }, []);

  // Preview control: a sandboxed iframe (opaque origin) can't reach contentWindow.__hfPreview, so everything goes through postMessage commands (sent to the current active buffer)
  const postPreview = useCallback((msg: Record<string, unknown>) => {
    try {
      iframesRef.current[bufsRef.current.active]?.contentWindow?.postMessage(msg, '*');
    } catch {
      /* iframe not ready */
    }
  }, []);
  const applyT = useCallback(
    (v: number) => {
      tRef.current = v;
      playhead.set(v);
      setT(v);
      postPreview({ type: 'hf:seek', t: v }); // position overlay layers / PiP (video frames belong to the engine)
      videoEngineRef.current?.seek(v);
    },
    [postPreview],
  );

  // Measure the preview area's available size → uniform scale to fill (tracks window/panel changes)
  useEffect(() => {
    const el = previewAreaRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setArea({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // composition change → debounced re-assemble, written into the **background buffer** (onBufLoad swaps atomically once loaded).
  // Re-assembly (assembleHtml full-string stitch) sits in the debounce callback: per-frame setComp operations like
  // box drag / in-place text edit cost zero build while dragging, stitched once 300ms after release.
  // **Caption pure-position (xPct/yPct) changes skip the rebuild**: hf:capStyle already wrote left/bottom directly into
  // the active doc (identical to the re-baked value), so a rebuild would only needlessly reload the video. Font size (scale)/
  // box width (wPct)/preset can't skip — segmentation is derived live from box width ÷ font size, so a rebuild must
  // re-segment (the instant path gives the feel first, then a seamless swap-in after the 300ms debounce).
  const lastBuiltCompRef = useRef<Composition | null>(null);
  // Measurement font ready: the parent doc loads the **same** design font as the preview doc — caption segmentation's
  // canvas measureText runs in the parent doc, and if the parent lacks the font it falls back to a system font, so
  // Latin widths don't match the iframe's real render (hit this: English segments measured too narrow, overflowed and
  // wrapped). Setting canvas font doesn't trigger a font download, so fonts.load must be explicit; once ready, tick
  // once to force a rebuild (the first segmentation may have used the fallback font and must be recomputed with the real one).
  const [fontsTick, setFontsTick] = useState(0);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!document.querySelector('link[data-studio-fonts]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = STUDIO_FONTS_HREF;
      l.setAttribute('data-studio-fonts', '1');
      document.head.appendChild(l);
    }
    let alive = true;
    void Promise.all([
      document.fonts.load("700 40px 'Noto Sans SC'"),
      document.fonts.load("700 40px 'Noto Serif SC'"),
      document.fonts.load("600 40px 'IBM Plex Mono'"),
    ])
      .then(() => {
        if (alive) setFontsTick((t) => t + 1);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const builtFontsTickRef = useRef(0);
  useEffect(() => {
    // captionStyle-only commit (ghost release / A±) = discrete action: **zero-debounce immediate rebuild** (release
    // should show the result, per user; A± rapid-click coalescing is done in stepScale, not here); the 300ms long
    // debounce is only for per-frame setComp streams like box drag. Font-ready tick = structural change (re-measure
    // and re-segment), doesn't take the skip path.
    const fontsChanged = builtFontsTickRef.current !== fontsTick;
    const sizeOnly = canvasSizeOnlyChange(lastBuiltCompRef.current, comp);
    const cutOnly = shotCountChange(lastBuiltCompRef.current, comp);
    const capOnly = sameExceptCapStyle(lastBuiltCompRef.current, comp);
    const framingOnly = shotFramingOnlyChange(lastBuiltCompRef.current, comp);
    const patchable = blockPatchableChange(lastBuiltCompRef.current, comp);
    const id = setTimeout(() => {
      builtFontsTickRef.current = fontsTick;
      if (!fontsChanged && themeMountOnlyChange(lastBuiltCompRef.current, comp)) {
        // Instant recolor: push the new palette vars into the live doc (root vars + stage background)
        postPreview({
          type: 'hf:setVars',
          css: themeVarsCss(getTheme(comp.theme), comp.palette),
          bg: comp.palette?.paper ?? getTheme(comp.theme).background,
        });
        lastBuiltCompRef.current = comp;
        return;
      }
      if (!fontsChanged && capPosOnlyChange(lastBuiltCompRef.current, comp)) {
        lastBuiltCompRef.current = comp;
        return;
      }
      if (!fontsChanged && capOnly && !pendingSwitchRef.current) {
        // Caption global style (preset/scale/width/color/plate/bold/sub): re-assemble ONLY the
        // sentence-caption nodes with the new resolved style and swap them in place — segmentation
        // re-runs inside the render, so even size/width changes stay off the rebuild path
        const pcomp = previewCompOf(comp);
        for (const cb of pcomp.blocks) {
          if (!isSentenceCaption(cb)) continue;
          const r = assembleBlockHtml(cb, pcomp);
          postPreview({ type: 'hf:blockAdd', blockId: cb.id, html: r.html, timelineBody: r.timelineBody });
        }
        lastBuiltCompRef.current = comp;
        return;
      }
      // Block-level in-place patch path: geometry (move/scale/rotate) / time window (timeline block trim) / appearance
      // (bg/border/radius/opacity) / in-place text echo / pure delete — commit the final value once into the active
      // doc, skipping the full doc rebuild (rebuild = double-buffer swap = video reload, the source of "flicker per edit").
      // When a swap is pending, step aside and rebuild (see the ref comment).
      if (!fontsChanged && patchable && !pendingSwitchRef.current) {
        const echo = iframeEditEchoRef.current;
        // Structural in-place patches (node add/replace): person-matte splits blocks around the matte
        // canvas (index math breaks), and mass additions (lay_out) are better served by one rebuild.
        const structuralN = patchable.added.length + patchable.pairs.filter((p) => p.replace || (p.slots && !echo.has(p.b.id))).length;
        const fxSplit = hasVideoTrack && (comp.shots ?? []).some((sh) => sh.personMatte);
        if (structuralN === 0 || (!fxSplit && patchable.added.length <= 8)) {
          // Same comp variant the doc was assembled from (image thumbs, fitScale reset) — patched bytes must match a rebuild
          const pcomp = previewCompOf(comp);
          const pblockOf = (id: string) => pcomp.blocks.find((x) => x.id === id);
          // DOM order = stacking = blocks stable-sorted by (sentence captions topmost, else trackIndex) — mirror of the assembler
          const zKey = (x: Block) => (isSentenceCaption(x) ? Number.MAX_SAFE_INTEGER : x.trackIndex);
          const sorted = [...pcomp.blocks].sort((x, y) => zKey(x) - zKey(y));
          const domIndexOf = (id: string) => sorted.findIndex((x) => x.id === id);
          const sendNode = (id: string, withIndex: boolean) => {
            const pb = pblockOf(id);
            if (!pb) return;
            const r = assembleBlockHtml(pb, pcomp);
            postPreview({ type: 'hf:blockAdd', blockId: id, html: r.html, timelineBody: r.timelineBody, ...(withIndex ? { index: domIndexOf(id) } : {}) });
          };
          // removes first: insertion indexes are computed against the post-remove DOM
          for (const r of patchable.removed) postPreview({ type: 'hf:remove', id: r.id });
          for (const p of patchable.pairs) {
            if (p.replace || (p.slots && !echo.has(p.b.id))) sendNode(p.b.id, false);
            else if (p.slots) echo.delete(p.b.id);
            if (p.geom) {
              const box = p.b.box!;
              const cb = p.b.contentBox ?? box;
              postPreview({
                type: 'hf:boxSize',
                blockId: p.b.id,
                x: box.x,
                y: box.y,
                w: box.w,
                h: box.h,
                cx: (cb.x - box.x) / box.w,
                cy: (cb.y - box.y) / box.h,
                cw: cb.w / box.w,
                ch: cb.h / box.h,
                s: p.b.scale ?? 1,
              });
              if (!Object.is(p.a.rotation, p.b.rotation)) postPreview({ type: 'hf:rotate', blockId: p.b.id, deg: p.b.rotation ?? 0 });
            }
            if (p.timing) postPreview({ type: 'hf:blockTiming', blockId: p.b.id, start: p.b.startSec, duration: p.b.durationSec });
            if (p.kitProps) {
              // Re-render THIS kit block with the same sizing context the assembler would bake,
              // and swap it into the active doc — a props tweak must not cost a doc rebuild
              const kb = p.b;
              const kslots = {
                ...kb.slots,
                boxW: Math.round((kb.box?.w ?? 0.86) * comp.width),
                boxH: Math.round((kb.box?.h ?? 0.3) * comp.height),
                canvasW: comp.width,
                canvasH: comp.height,
              };
              const kr = renderBlock({ ...kb, slots: kslots });
              postPreview({ type: 'hf:blockHtml', blockId: kb.id, innerHtml: kr.innerHtml, timelineBody: kr.timelineBody });
            }
            if (p.style) {
              const nb = p.b;
              const inner = String((nb.slots as { innerHtml?: unknown }).innerHtml ?? '');
              postPreview({
                type: 'hf:blockStyle',
                blockId: nb.id,
                bgCss: nb.bg ? blockBgCss(nb.bg, customHasSurface(nb.templateId, inner)) : '',
                border: nb.border ? `3px solid ${nb.border}` : null,
                // radius must match assemble exactly: explicit value wins, default radius when there's a surface/border
                radius: typeof nb.radius === 'number' && nb.radius > 0 ? `${nb.radius}px` : (nb.bg || nb.border) && nb.box ? 'var(--radius,24px)' : null,
                opacity: typeof nb.opacity === 'number' && nb.opacity < 0.995 ? Math.max(0.05, nb.opacity) : null,
              });
            }
          }
          for (const nb of [...patchable.added].sort((x, y) => domIndexOf(x.id) - domIndexOf(y.id))) sendNode(nb.id, true);
          if (patchable.added.length || patchable.pairs.some((p) => p.geom || p.style || p.replace || p.slots || p.kitProps)) postPreview({ type: 'hf:measureFit' });
          lastBuiltCompRef.current = comp;
          return;
        }
      }
      if (!fontsChanged && framingOnly) {
        // Only framing (treatment/treatSize) changed: don't rebuild the doc (rebuild = a blank video-canvas frame,
        // flickers on rapid switching); swap the vid timeline in place (identical to what a rebuild would bake), the
        // instant value was already applied via hf:shotVars
        postPreview({ type: 'hf:vidTimeline', body: videoFrameTimelineBody(comp.shots ?? []) });
        lastBuiltCompRef.current = comp;
        return;
      }
      lastBuiltCompRef.current = comp;
      const doc = injectPreviewRuntime(assembleHtml(previewCompOf(comp)));
      if (doc !== bufsRef.current.docs[bufsRef.current.active]) {
        pendingSwitchRef.current = true; // swap pending: patch path steps aside
        setRebuilding(true);
      }
      setBufs((s) => {
        if (s.docs[s.active] === doc) return s; // identical to the on-screen doc: don't churn
        const back = s.active === 0 ? 1 : 0;
        const docs = [...s.docs] as [string, string];
        docs[back] = doc;
        const dims = [...s.dims] as [{ w: number; h: number }, { w: number; h: number }];
        dims[back] = { w: comp.width, h: comp.height };
        return { docs, dims, active: s.active };
      });
    }, fontsChanged || sizeOnly || cutOnly || capOnly || framingOnly || patchable ? 0 : 300);
    return () => clearTimeout(id);
  }, [comp, fontsTick]);

  // Pending background-buffer swap: ping/pong handshake state. The load event isn't trustworthy — the empty load of a
  // cleared buffer (srcdoc='') arrives late, and font blocking can make a half-loaded doc fire load first, which once
  // swapped the frame to a "deaf doc": all playback commands vanished (observed: cascading double-swaps after zoom,
  // play sent to active with no clock response). Now a swap only executes after a live response (pong) from the target
  // doc's runtime; a deaf doc at worst keeps the frame on the old generation and warns repeatedly in console, but never
  // swallows playback.
  const switchPingRef = useRef<{ idx: 0 | 1; doc: string; nonce: string; timer: ReturnType<typeof setTimeout> | null; tries: number } | null>(null);
  const startSwitchPing = useCallback((idx: 0 | 1, doc: string) => {
    const prev = switchPingRef.current;
    if (prev?.timer) clearTimeout(prev.timer);
    const st = {
      idx,
      doc,
      nonce: `switch-${idx}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timer: null as ReturnType<typeof setTimeout> | null,
      tries: 0,
    };
    switchPingRef.current = st;
    const ping = () => {
      if (switchPingRef.current !== st) return;
      if (bufsRef.current.docs[idx] !== doc || bufsRef.current.active === idx) {
        switchPingRef.current = null; // doc replaced by a newer generation / already the active buffer: this handshake is void
        return;
      }
      st.tries++;
      if (st.tries > 1) console.warn('[studio] background buffer not responding, retrying ping', { idx, tries: st.tries });
      try {
        iframesRef.current[idx]?.contentWindow?.postMessage({ type: 'hf:ping', nonce: st.nonce }, '*');
      } catch {
        /* not ready */
      }
      if (st.tries < 10) st.timer = setTimeout(ping, 1200);
      else {
        console.warn('[studio] background buffer unresponsive after 10 tries, giving up the swap (stay on old frame, rebuild next time)', { idx });
        switchPingRef.current = null;
        setRebuilding(false);
        setPendingInsert(null);
      }
    };
    ping();
  }, []);

  /** A buffer finished loading: inject video/seek/restore selection; if it's the background buffer, start the ping handshake (swap only after pong). */
  const onBufLoad = useCallback(
    (idx: 0 | 1) => {
      if (!bufsRef.current.docs[idx]) return; // empty load of a cleared old buffer (srcdoc=''), ignore
      const w = iframesRef.current[idx]?.contentWindow;
      const post = (msg: Record<string, unknown>) => {
        try {
          w?.postMessage(msg, '*');
        } catch {
          /* not ready */
        }
      };
      // canvas render mode: video frames pushed by the parent engine (hf:frame), no longer inject the File into the doc
      post({ type: 'hf:seek', t: tRef.current });
      post({ type: 'hf:selectBlock', blockId: selectedIdRef.current });
      // Force-show mechanism retired: a selected block's visibility is guaranteed by "select → move playhead to its
      // settled moment" (parent selectedId effect); the seeked playhead on load is itself a visible moment, so no need
      // to replay a force-show message to the new doc.
      // fitScale isn't in the doc → after load, push the known autofit scale in
      const fits: Record<string, number> = {};
      for (const b of compRef.current.blocks) if (b.fitScale && b.fitScale < 0.999) fits[b.id] = b.fitScale;
      if (Object.keys(fits).length) post({ type: 'hf:fit', fits });
      if (idx !== bufsRef.current.active) {
        startSwitchPing(idx, bufsRef.current.docs[idx]);
        return;
      }
      // The active buffer's own load (first load / video swap): resume playback if playing
      if (playingRef.current) post({ type: 'hf:play', t: tRef.current });
    },
    [startSwitchPing],
  );

  // In-preview edit bridge: write a block's slot back (supports items.N array paths).
  // custom blocks (LLM-generated components) have no semantic slots — the key is the text of [data-edit=key] inside
  // innerHtml, patched back via DOMParser: double-click in-place edit is zero-token, instant, no regeneration needed.
  const setSlot = useCallback(
    (blockId: string, key: string, value: string) => {
      if (genIdsRef.current.has(blockId)) {
        toast.info(t('workbench.elementGeneratingEditWould'));
        return;
      }
      setComp((c) => ({
        ...c,
        blocks: c.blocks.map((b) => {
          if (b.id !== blockId) return b;
          if (b.templateId === 'custom') {
            const inner = String((b.slots as { innerHtml?: unknown }).innerHtml ?? '');
            try {
              const doc = new DOMParser().parseFromString(`<div id="__hfw">${inner}</div>`, 'text/html');
              const host = doc.getElementById('__hfw');
              const target = host?.querySelector(`[data-edit="${CSS.escape(key)}"]`);
              if (!host || !target) return b;
              // No actual change = full no-op: entering edit mode and exiting unchanged must not trigger a rebuild/buffer swap.
              // Don't compare host.innerHTML against the original — DOMParser serialization normalizes attributes/entities,
              // producing a string diff even without text changes; compare semantics (textContent) to be accurate.
              if ((target.textContent ?? '') === value) return b;
              target.textContent = value;
              return { ...b, slots: { ...b.slots, innerHtml: host.innerHTML } };
            } catch {
              return b;
            }
          }
          if (key.includes('.')) {
            const [k, idxStr] = key.split('.');
            const idx = Number(idxStr);
            const arr = Array.isArray(b.slots[k!]) ? [...(b.slots[k!] as unknown[])] : [];
            if (arr[idx] === value) return b; // no-op if unchanged
            arr[idx] = value;
            return { ...b, slots: { ...b.slots, [k!]: arr } };
          }
          if (b.slots[key] === value) return b; // no-op if unchanged
          return { ...b, slots: { ...b.slots, [key]: value } };
        }),
      }));
    },
    [setComp, genIdsRef],
  );

  // Draft autosave (1s debounce; don't write on an empty canvas)
  // First-frame thumbnail (project list card cover): **grab the frame straight from the video file** — filmstrip tiles
  // are only 96px wide, upscaling from them is blurry at any size (user feedback). A 960-wide jpeg is sharp enough for
  // retina cards (~440 CSS px).
  const coverThumbRef = useRef<string | null>(null);
  useEffect(() => {
    if (!videoFile) return;
    let alive = true;
    const url = URL.createObjectURL(videoFile);
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    v.src = url;
    void (async () => {
      try {
        await new Promise<void>((res, rej) => {
          v.onloadeddata = () => res();
          v.onerror = () => rej(new Error('load failed'));
          setTimeout(() => rej(new Error('load timeout')), 8000);
        });
        v.currentTime = 0.1;
        await new Promise<void>((res) => {
          v.onseeked = () => res();
          setTimeout(res, 1500); // streaming webm seek events are unreliable, use the current frame on timeout
        });
        if (!v.videoWidth) return;
        const w = 960;
        const h = Math.max(2, Math.round((v.videoHeight / v.videoWidth) * w));
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        cv.getContext('2d')!.drawImage(v, 0, 0, w, h);
        if (alive) {
          coverThumbRef.current = cv.toDataURL('image/jpeg', 0.8);
          // Backfill straight into the saved draft: frame grab finishes after the debounced save, otherwise the cover stays missing until the next edit
          saveCoverThumb(projectId, coverThumbRef.current);
        }
      } catch {
        /* the cover is a bonus, a failed grab doesn't block saving */
      } finally {
        URL.revokeObjectURL(url);
        v.removeAttribute('src');
      }
    })();
    return () => {
      alive = false;
    };
  }, [videoFile, projectId]);
  // Autosave runs regardless (pure side effect: debounced draft write); the toolbar no longer shows a "project/saved" time
  // videoSigRef first: in the missing-media state (no File on this device) the draft's sig anchor
  // must survive autosave — writing null would wipe the cloud row's reconnect anchor.
  // Persist-side comp: derived caption blocks are STRIPPED (transcript + captionStyle.on carry the
  // caption state); only strippable when a transcript exists to re-derive from. The draft also carries
  // the transcripts so a zero-backend reopen (OSS shell / offline) can re-derive the caption layer.
  const canDeriveCaptions = (asrSentences?.length ?? 0) > 0 || Object.keys(clipAsr).length > 0;
  const compForSave = useMemo(() => stripDerivedCaptions(comp, canDeriveCaptions), [comp, canDeriveCaptions]);
  useDraftAutosave(compForSave, videoSigRef.current ?? (videoFile ? fileSig(videoFile) : null), projectId, coverThumbRef, () => ({
    ...(asrRef.current?.length ? { asr: sanitizeTranscriptSegs(asrRef.current) } : {}),
    ...(Object.keys(clipAsrRef.current).length ? { clipAsr: Object.fromEntries(Object.entries(clipAsrRef.current).map(([k, v]) => [k, sanitizeTranscriptSegs(v)])) } : {}),
  }));

  // autofit: preview measures each block's overflow → write back Block.fitScale (for export), and push hf:fit to the
  // active buffer to apply live (fitScale isn't in the preview doc, so the write-back doesn't trigger a rebuild — see the assembled comment)
  const applyFits = useCallback(
    (fits: Record<string, number>) => {
      setComp((c) => {
        let changed = false;
        const blocks = c.blocks.map((b) => {
          const k = fits[b.id];
          if (typeof k !== 'number') return b;
          const next = k < 0.999 ? k : undefined; // ≈1 = no scaling (clear the old value)
          const cur = b.fitScale ?? 1;
          if (Math.abs(cur - (next ?? 1)) < 0.02) return b; // stable already, debounce to avoid a loop
          changed = true;
          return { ...b, fitScale: next };
        });
        return changed ? { ...c, blocks } : c;
      });
      postPreview({ type: 'hf:fit', fits });
    },
    [setComp, postPreview],
  );

  /* ---------- Block source editor: the stage is the live preview; only "Apply" commits, close/switch-away reverts ---------- */
  const stopCodeLoop = () => {
    loopRangeRef.current = null;
    setCodeLoop(false);
  };
  /** Settle the uncommitted draft: restore to baseline. Only act if the block's current content is still our last pushed draft (not changed by a side channel like chat). */
  const revertCodeDraft = () => {
    const orig = codeOrigRef.current;
    const last = codeDraftRef.current;
    codeOrigRef.current = null;
    codeDraftRef.current = null;
    if (!orig || !last) return;
    const b = compRef.current.blocks.find((x) => x.id === orig.id);
    const s = b?.slots as { innerHtml?: unknown; timelineBody?: unknown } | undefined;
    if (!b || !s || s.innerHtml !== last.innerHtml || s.timelineBody !== last.timelineBody) return;
    setComp((cc) => ({
      ...cc,
      blocks: cc.blocks.map((x) => (x.id === orig.id ? { ...x, templateId: orig.templateId, slots: orig.slots } : x)),
    }));
  };
  /** The single entry for tool panels: open/switch/close all go through here — leaving code settles the draft first,
   *  leaving gen tells the asset library to refetch. Docking semantics: a panel takes the whole rail column — expand
   *  if collapsed; auto-collapse on close if it was expanded only for the panel. */
  const setFloatWin = (next: FloatKind | null) => {
    const prev = floatWinRef.current;
    if (prev === next) return;
    if (prev === 'code') {
      revertCodeDraft();
      stopCodeLoop();
    }
    if (prev === 'gen') setGenRefreshTick((n) => n + 1);
    if (next && !prev && libCollapsed) {
      libAutoExpandedRef.current = true;
      setLibCollapsed(false);
    } else if (!next && libAutoExpandedRef.current) {
      libAutoExpandedRef.current = false;
      setLibCollapsed(true);
    }
    floatWinRef.current = next;
    setFloatWinRaw(next);
  };
  // The source-editor entry is removed (per user 2026-07-17; edit components via "AI edit"/chat). The panel machinery
  // (FloatKind 'code'/ElementSourceEditor/draft settlement) is kept; to restore the entry later: set the baseline
  // codeOrigRef + setCodeBlockId(id) + setFloatWin('code'), and pin the playhead to a stable frame.
  /** Open the right-side chat area (right side is chat only; other panels dock in the asset rail). */
  const openChat = () => setPanelOpen(true);
  /** Open a tool panel (docked in the full asset rail column). The anchor param is kept for signature compatibility
   *  across entries but no longer used for positioning after docking; clicking outside doesn't close it (a docked
   *  panel is a persistent region, not a popover) — toggling is on the trigger button itself. */
  const openFloatAt = (kind: FloatKind, _anchor?: DOMRect | null) => {
    setFloatWin(kind);
  };
  // The person panel depends on a selected shot (its entry is disabled without one): if the selection is lost while open → just close it
  useEffect(() => {
    if (floatWin === 'person' && !selectedShotId) setFloatWin(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floatWin, selectedShotId]);
  // The framing panel doesn't auto-open on selection (clicking a shot body = select only; open via the shot tag/toolbar entry); close it if open when the selection is cleared
  useEffect(() => {
    if (!selectedShotId && floatWin === 'shot') setFloatWin(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShotId, floatWin]);
  /** Open framing settings (shot tag / toolbar entry): select the shot + open the panel. */
  const openShotSettings = (sid: string) => {
    selectShot(sid);
    setFloatWin('shot');
  };
  /** The cut the transition panel is anchored to (final seconds; opened from the timeline boundary hotspot). */
  const [transitionCut, setTransitionCut] = useState<number | null>(null);
  const openTransitionAt = (cutSec: number, anchor: DOMRect) => {
    setTransitionCut(cutSec);
    setSelectedId(null); // the transition becomes the current selection: Del deletes the transition, not blocks/shots
    setSelectedShotId(null);
    openFloatAt('transition', anchor);
  };
  /** Set/change/remove a transition at a cut (content-level, hung on the next shot's transIn, prevId anchors the
   *  previous shot): at most one per cut; on set, move the playhead to the transition-region start to see the effect.
   *  Duration reuses the existing value, default 1s; direction stored only for push/slide. */
  const setCutTransition = (cutSec: number, effect: CutTransitionEffect | null, direction?: TransitionDirection) => {
    const sp = clipSpans(ensureShots(compRef.current));
    const i = sp.findIndex((s, idx) => idx >= 1 && Math.abs(s.editedStart - cutSec) < 0.05);
    if (i < 1) return;
    const prevId = sp[i - 1]!.clip.id;
    const selfId = sp[i]!.clip.id;
    setComp((c) => ({
      ...c,
      shots: (c.shots ?? []).map((s) => {
        if (s.id !== selfId) return s;
        const { transIn: _drop, ...rest } = s;
        if (!effect) return rest;
        const durationSec = Math.min(MAX_TRANSITION_SEC, s.transIn?.durationSec ?? 1);
        const dir = direction ?? s.transIn?.direction;
        return { ...rest, transIn: { prevId, effect, durationSec, ...(DIRECTIONAL_TRANSITIONS.has(effect) && dir ? { direction: dir } : {}) } };
      }),
    }));
    if (effect) {
      const prevDur = (sp[i]!.clip as VideoShot).transIn?.durationSec ?? 1;
      applyT(Math.max(0, cutSec - Math.min(prevDur, MAX_TRANSITION_SEC) / 2 - 0.2));
    }
  };
  /** Transition region-handle drag commit: symmetric total duration (the timeline already clamps to both sides' shot lengths, this clamps the upper bound). */
  const resizeCutTransition = (shotId: string, durationSec: number) =>
    setComp((c) => ({
      ...c,
      shots: (c.shots ?? []).map((s) =>
        s.id === shotId && s.transIn ? { ...s, transIn: { ...s.transIn, durationSec: Math.min(MAX_TRANSITION_SEC, Math.max(0.2, durationSec)) } } : s,
      ),
    }));
  // If the cut disappears due to editing (no longer any shot boundary) → auto-close the transition panel
  useEffect(() => {
    if (floatWin !== 'transition' || transitionCut == null) return;
    const bounds = clipSpans(comp.shots ?? []).map((sp) => sp.editedEnd);
    if (!bounds.slice(0, -1).some((b) => Math.abs(b - transitionCut) < 0.05)) setFloatWin(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floatWin, transitionCut, comp.shots]);
  // The media-anim panel depends on "a selected, filled media block": if selection is lost / switched to another block → auto-close back to chat
  useEffect(() => {
    if (floatWin !== 'anim') return;
    const b = selectedId ? compRef.current.blocks.find((x) => x.id === selectedId) : null;
    const ok = b && blockKind(b) === 'media' && !!(b.slots.media as { url?: string } | undefined)?.url;
    if (!ok) setFloatWin(null);
  }, [floatWin, selectedId]);
  /** Write back media block animation (enter/exit/duration; enter defaults to fade, matching the render side). */
  const setBlockAnim = (bid: string, patch: Partial<{ enter: string; exit: string; dur: number }>) =>
    setComp((c) => ({
      ...c,
      blocks: c.blocks.map((b) => (b.id === bid ? { ...b, slots: { ...b.slots, anim: { enter: 'fade', ...((b.slots.anim ?? {}) as object), ...patch } } } : b)),
    }));
  /** Push the draft live to the stage (the editor already passed the hard-lint error gate). */
  const handleCodeDraft = (id: string, draft: SourceDraft) => {
    if (genIdsRef.current.has(id)) return;
    codeDraftRef.current = draft;
    setComp((cc) => ({
      ...cc,
      blocks: cc.blocks.map((b) => (b.id === id ? { ...b, templateId: 'custom', slots: { innerHtml: draft.innerHtml, timelineBody: draft.timelineBody } } : b)),
    }));
  };
  /** Commit: write back + advance the baseline to the applied state (closing after this no longer reverts). */
  const handleCodeApply = (id: string, draft: SourceDraft) => {
    if (genIdsRef.current.has(id)) {
      toast.info(t('workbench.elementGeneratingApplyAfter'));
      return;
    }
    handleCodeDraft(id, draft);
    codeOrigRef.current = { id, templateId: 'custom', slots: { innerHtml: draft.innerHtml, timelineBody: draft.timelineBody } };
    codeDraftRef.current = null;
  };
  /** In-editor "AI edit": run compose with the current draft as the base (includes the lint-fix loop), holding the generation lock. */
  const runCodeAi = async (b: Block, instruction: string, draft: SourceDraft, onNote: (n: string) => void): Promise<SourceDraft | null> => {
    markGenerating([b.id], true);
    try {
      const boxPx = b.box
        ? { w: Math.round(b.box.w * compRef.current.width), h: Math.round(b.box.h * compRef.current.height) }
        : undefined;
      const seed = {
        id: b.id,
        kind: 'custom',
        innerHtml: draft.innerHtml,
        timelineBody: draft.timelineBody,
        label: b.label,
        durationSec: b.durationSec,
        ...(boxPx ? { boxPx } : {}),
      };
      const parsed = await composeBlockChecked(seed, instruction, (acc) => onNote(noteOf(acc)));
      return { innerHtml: parsed.innerHtml, timelineBody: parsed.timelineBody };
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('workbench.aiEditFailed'));
      return null;
    } finally {
      markGenerating([b.id], false);
    }
  };
  /** "Loop preview": repeatedly play the block's time window, for tuning animation. */
  const toggleCodeLoop = (on: boolean) => {
    const b = codeBlockId ? compRef.current.blocks.find((x) => x.id === codeBlockId) : null;
    if (!on || !b) {
      stopCodeLoop();
      return;
    }
    const start = Math.max(0, b.startSec);
    const end = Math.min(totalDuration(compRef.current), b.startSec + b.durationSec);
    if (end - start < 0.2) return;
    loopRangeRef.current = { start, end };
    setCodeLoop(true);
    tRef.current = start;
    playhead.set(start);
    setT(start);
    if (playingRef.current) postPreview({ type: 'hf:play', t: start });
    else setPlaying(true); // the play effect starts from tRef
  };

  // Listen to the iframe bridge: select → select block; edit → in-place write-back to slot; fit → autofit scale factor; clock → playback clock
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      // Only trust the preview double buffers (component cards / hover mini-previews run the same runtime and also post; don't let them change state / forge edits)
      const fromActive = e.source === iframesRef.current[bufsRef.current.active]?.contentWindow;
      const fromBack = e.source === iframesRef.current[bufsRef.current.active === 0 ? 1 : 0]?.contentWindow;
      if (!fromActive && !fromBack) return;
      const d = e.data as { source?: string; type?: string; blockId?: string; key?: string; value?: string; fits?: Record<string, number>; t?: number; src?: string; dx?: number; dy?: number; snapX?: boolean; snapY?: boolean; shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean; nonce?: string; index?: number; el?: string; sub?: boolean; part?: string; rect?: { x: number; y: number; w: number; h: number } } | null;
      if (!d || d.source !== 'hf') return;
      // fit is accepted from both buffers (the background buffer measures the new content); interaction/position only from the active buffer
      if (d.type === 'fit' && d.fits) {
        applyFits(d.fits);
        return;
      }
      // In-place patched node finished loading its media → clear the block's loading badge
      // (the buffer-swap clear never fires for in-place patches)
      if (d.type === 'hf:mediaReady' && d.blockId) {
        setMediaBusyPhase(String(d.blockId), null);
        return;
      }
      // Measured caption-line rect (hf:measure reply): the selection box uses it to hug the real caption area
      if (d.type === 'measure' && fromActive && d.rect) {
        if (d.sub) setCapSubMeasure({ w: d.rect.w, h: d.rect.h, scale: resolveSubCaptionStyle(compRef.current).scale });
        else setCapMeasure({ w: d.rect.w, h: d.rect.h, scale: resolveCaptionStyle(compRef.current).scale });
        return;
      }
      // pong accepted from both buffers: the background buffer's swap-handshake reply + the active buffer's playback-probe evidence
      if (d.type === 'pong') {
        const st = switchPingRef.current;
        if (st && d.nonce === st.nonce && fromBack) {
          // Target doc confirmed live → wait one beat (video/fonts settle) then swap atomically; the old buffer pauses and clears
          switchPingRef.current = null;
          if (st.timer) clearTimeout(st.timer);
          const { idx, doc } = st;
          setTimeout(() => {
            if (bufsRef.current.docs[idx] !== doc || bufsRef.current.active === idx) return;
            try {
              // teardown (includes pause): the old doc immediately releases media loads/decoder sessions, doesn't wait for async GC after srcdoc is cleared
              iframesRef.current[bufsRef.current.active]?.contentWindow?.postMessage({ type: 'hf:teardown' }, '*');
            } catch {
              /* ignore */
            }
            pendingSwitchRef.current = false; // swap settled: in-place patch path resumes
            setRebuilding(false);
            setPendingInsert(null);
            console.info('[studio] buf switch', { to: idx, from: bufsRef.current.active });
            setBufs((s) => {
              if (s.docs[idx] !== doc) return s;
              const docs = [...s.docs] as [string, string];
              docs[s.active === idx ? (idx === 0 ? 1 : 0) : s.active] = '';
              return { ...s, docs, active: idx };
            });
            // Replay the alignment now that the pong PROVED this doc listens: the load-time hf:seek can hit a
            // deaf half-loaded doc (the known pit) and vanish — a paused boot then leaves caption timelines at
            // their initial hidden state (main segments gsap-hidden, sub line visible) until the first
            // hover/play seek (user-reported: captions missing after refresh until mousing over the timeline).
            const w = iframesRef.current[idx]?.contentWindow;
            try {
              w?.postMessage({ type: 'hf:seek', t: tRef.current }, '*');
              // Re-assembly interrupted playback (e.g. AI edited a block) → resume from the current playhead
              if (playingRef.current) w?.postMessage({ type: 'hf:play', t: tRef.current }, '*');
            } catch {
              /* ignore */
            }
          }, 120);
        }
        return;
      }
      // Person matte: the iframe requests the pre-budgeted mask by **source time** (the track is computed in full when enabled).
      // Answered from both buffers (the background buffer starts requesting during warm-up, so the person doesn't flash
      // blank at the swap); if the track isn't ready return null and the iframe side backs off and re-asks. webp is
      // decoded on demand to an ImageBitmap and transferred, keeping only the compressed form in memory.
      if (d.type === 'personMaskAt') {
        const src = e.source as Window | null;
        if (!src) return;
        const t = typeof d.t === 'number' ? d.t : 0;
        // Multi-source: the iframe reports "which main-track element + its source file's time"; fetch the track by source, decide the segment by that source's shot toggle
        const elKey = typeof d.el === 'string' ? d.el : 'main';
        const shots = compRef.current.shots ?? [];
        let trackKey = 'main';
        let inOn = false;
        if (elKey === 'main') {
          inOn = shots.some((s) => !s.src && s.personMatte && t >= s.srcStart - 0.05 && t < s.srcEnd + 0.05);
        } else {
          const sh = shots.find((s) => `clip_${s.id}` === elKey);
          trackKey = sh?.src ?? '';
          inOn = !!sh?.personMatte && !!sh && t >= sh.srcStart - 0.05 && t < sh.srcEnd + 0.05;
        }
        const track = matteTrackRef.current.get(trackKey);
        if (!inOn || !track?.length) {
          try {
            src.postMessage({ type: 'hf:personMask', mask: null }, '*');
          } catch {
            /* ignore */
          }
          return;
        }
        let lo = 0;
        let hi = track.length - 1;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (track[mid]!.t <= t) lo = mid;
          else hi = mid - 1;
        }
        const cand = track[lo]!;
        const next = track[lo + 1];
        const pick = next && Math.abs(next.t - t) < Math.abs(cand.t - t) ? next : cand;
        // If the nearest frame is too far (this segment has matte on but isn't fully budgeted yet) return empty too, don't substitute another segment's mask
        if (Math.abs(pick.t - t) > 2 / MATTE_FPS) {
          try {
            src.postMessage({ type: 'hf:personMask', mask: null }, '*');
          } catch {
            /* ignore */
          }
          return;
        }
        createImageBitmap(pick.blob).then(
          (mask) => {
            try {
              src.postMessage({ type: 'hf:personMask', mask }, '*', [mask]);
            } catch {
              mask.close();
            }
          },
          () => {
            try {
              src.postMessage({ type: 'hf:personMask', mask: null }, '*');
            } catch {
              /* ignore */
            }
          },
        );
        return;
      }
      if (!fromActive) return;
      if (d.type === 'select') {
        // Clicking a block during playback = wanting to edit it: pause first (clicking blank still only deselects, doesn't interrupt playback)
        if (d.blockId && playingRef.current) setPlaying(false);
        setSelectedAudioId(null); // a click on the stage is "somewhere else" for the audio lane, hit or miss
        setSelectedId(d.blockId ?? null);
        setCapSelPart(d.part === 'sub' ? 'sub' : 'main'); // caption sub-target: main line / translation line each get their own handles
        setImgSel(null); // if the same click hit an image, the imgSel message right after refills it
        if (d.blockId) setSelectedShotId(null);
        else {
          // Clicking the video area (not a block) = select the shot at the playhead (per user); pure deselect only when there are no shots
          const c = compRef.current;
          const shots = c.shots ?? [];
          let cur: string | null = null;
          if (c.video && shots.length) {
            const now = tRef.current;
            for (const s of shots) {
              const sp = shotSpan(c, s.id);
              if (sp && now >= sp.editedStart - 1e-3 && now < sp.editedStart + sp.shotLen + 1e-3) {
                cur = s.id;
                break;
              }
            }
            cur ??= shots[shots.length - 1]!.id; // playhead at the very end: count it as the last shot
          }
          setSelectedShotId(cur);
        }
      } else if (d.type === 'imgSel' && d.blockId && typeof d.index === 'number' && d.rect) {
        // Image slots are only for custom blocks (LLM-generated components); media-slot block images use the block-level toolbar
        const b = compRef.current.blocks.find((x) => x.id === d.blockId);
        if (b && b.templateId === 'custom' && !genIdsRef.current.has(b.id)) setImgSel({ blockId: d.blockId, index: d.index, rect: d.rect });
      } else if (d.type === 'edit' && d.blockId && d.key) {
        iframeEditEchoRef.current.add(d.blockId); // in-place text edit: active doc is already current, this block's slots commit can skip the rebuild
        setSlot(d.blockId, d.key, d.value ?? '');
      }
      else if (d.type === 'boxDragStart' && d.blockId) {
        // Drag baseline snapshot (the move itself is a translate inside the iframe, zero React re-render; this only records the start point for commit).
        // Don't commit for a block that's generating (its box was already snapshotted to the worker, a drag would be overwritten by the result).
        const b = compRef.current.blocks.find((x) => x.id === d.blockId);
        boxDragRef.current = b?.box && !genIdsRef.current.has(b.id) ? { id: b.id, box: b.box } : null;
        setImgSel(null); // once the block moves the image rect is stale — hide the image toolbar, re-show on click
        setGuideVis(false, false); // if the previous drag was interrupted by a doc rebuild, clear the guides here as a fallback
        dragCursorRef.current = ''; // body/grip drag doesn't mount the shield: the capture element is resident (in-iframe block / toolbar grip), events aren't lost
        setBodyDragging(!!boxDragRef.current);
      } else if (d.type === 'boxDrag') {
        // Zero setState during drag: guides/ghost/toolbar all write DOM directly (React doesn't write back unchanged
        // style props, so they aren't clobbered; on commit React recomputes with the same toolbarXY, identical values → zero jump, zero re-render)
        setGuideVis(!!d.snapX, !!d.snapY);
        if (boxDragRef.current && typeof d.dx === 'number' && typeof d.dy === 'number') {
          const st = boxDragRef.current;
          const c = compRef.current;
          const gx = st.box.x + d.dx / c.width;
          const gy = st.box.y + d.dy / c.height;
          setGhostRect({ x: gx, y: gy, w: st.box.w, h: st.box.h }); // body-drag ghost: content stays, the dashed box follows the pointer
          if (toolbarRef.current) {
            const p = toolbarXY({ ...st.box, x: gx, y: gy });
            toolbarRef.current.style.left = `${p.left}px`;
            toolbarRef.current.style.top = `${p.top}px`;
          }
        }
      } else if (d.type === 'boxDragEnd') {
        // One-shot commit: baseline + iframe's final (snapped) displacement → translate the whole block (box and contentBox move together).
        // No boundary clamping: blocks may be dragged off-canvas, the out-of-bounds part is cut by canvas overflow (per user)
        const st = boxDragRef.current;
        if (st && st.id === d.blockId && typeof d.dx === 'number' && typeof d.dy === 'number') {
          const c = compRef.current;
          const dxf = d.dx / c.width;
          const dyf = d.dy / c.height;
          setComp((cc) => ({
            ...cc,
            blocks: cc.blocks.map((b) => (b.id === st.id ? shiftBox({ ...b, box: st.box }, dxf, dyf) : b)),
          }));
        }
        boxDragRef.current = null;
        setGuideVis(false, false);
        setGhostRect(null);
        setBodyDragging(false);
      } else if (d.type === 'playBlocked') {
        // Browser refused to start playback (autoplay permission/decode issue): must be visible, this was once the silent culprit of "playhead moves but frame freezes"
        console.warn('[studio] video play() rejected by the browser', d);
      } else if (d.type === 'key' && typeof d.key === 'string') {
        // Shortcut forwarded from the iframe (separate focus context) → replayed as a window keydown, goes through the unified shortcut handler
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: d.key, shiftKey: !!d.shiftKey, metaKey: !!d.metaKey, ctrlKey: !!d.ctrlKey, altKey: !!d.altKey }),
        );
      }
      else if (d.type === 'clock' && typeof d.t === 'number') {
        // Self-driven playback position reported by the iframe (after canvas-ization the parent is the sole clock; this path is only still used by the source editor's loop preview)
        if (playingRef.current) {
          // Source editor "loop preview": past the block's time-window end → jump back to start and replay (one-shot command, self-drive continues)
          const lr = loopRangeRef.current;
          if (lr && d.t >= lr.end - 0.03) {
            tRef.current = lr.start;
            playhead.set(lr.start);
            postPreview({ type: 'hf:play', t: lr.start });
            return;
          }
          tRef.current = d.t;
          playhead.set(d.t);
        }
      } else if (d.type === 'ended') {
        const lr = loopRangeRef.current;
        if (lr && playingRef.current) {
          // Loop window at the very end of the final cut: treat ended as a loop point too
          tRef.current = lr.start;
          playhead.set(lr.start);
          postPreview({ type: 'hf:play', t: lr.start });
          return;
        }
        const D = typeof d.t === 'number' ? d.t : totalDuration(compRef.current);
        tRef.current = D;
        playhead.set(D);
        setT(D);
        setPlaying(false);
      }
    }
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [setSlot, applyFits, postPreview, toolbarXY]);

  // Safe-zone debug: when enabled, run one live detection on the **current frame** whenever the playhead settles (debounced; frequent t changes during playback auto-skip until it stops)
  useEffect(() => {
    if (!showGeom || !videoFile) {
      setLiveGeom(null);
      return;
    }
    let cancelled = false;
    const id = setTimeout(() => {
      void detectFrameAt(videoFile, tSec)
        .then((sz) => {
          if (!cancelled) setLiveGeom(sz);
        })
        .catch(() => {});
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [showGeom, videoFile, tSec]);

  /** Block id force-shown in edit mode: when a component/media block is selected, force-show its animation end state;
   *  captions (which have their own capEdit force-show) and transitions (to-tween base state = invisible, force-show
   *  is meaningless) opt out → null = show per timeline state. */
  const focusIdOf = useCallback((id: string | null) => {
    if (!id) return null;
    const b = compRef.current.blocks.find((x) => x.id === id);
    if (!b) return null;
    const k = blockKind(b);
    return k === 'caption' || k === 'transition' ? null : id;
  }, []);
  // Selection change (timeline click / canvas click / agent focus) → sync iframe highlight + **select means visible**:
  // the "select = force-show" mechanism is retired (root-cause fixed per user 2026-07-13) — runtime reverse-reconstruction
  // of the "settled state" fights every initial-state style in generated code (inline tl.from / CSS-rule base + tl.to /
  // inline transform combos, observed three in a row) — a whack-a-mole you can't win. Instead: when a selected block
  // hasn't entered/settled or has already exited at the current playhead, move the playhead to its settled moment —
  // the frame is the real playback render, zero special-casing for any animation style. If the block is already visible
  // (clicked on canvas, playhead in its settled window) don't move the playhead; captions use the separate capEdit mechanism; don't move during playback.
  useEffect(() => {
    postPreview({ type: 'hf:selectBlock', blockId: selectedId });
    if (!selectedId || playingRef.current) return;
    if (!focusIdOf(selectedId)) return; // ignore captions/transitions
    const b = compRef.current.blocks.find((x) => x.id === selectedId);
    if (!b) return;
    const settle = Math.min(Math.max(0.45, b.durationSec * 0.2), Math.max(0.01, b.durationSec - 0.06)); // same as seekBlockSettled
    const t = tRef.current;
    if (t < b.startSec + settle - 1e-3 || t >= b.startSec + b.durationSec) applyT(b.startSec + settle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, bufs.active, postPreview, focusIdOf]);

  // After a buffer swap: if focus is still on the retired background buffer, the keyboard feeds a dead doc (bridge
  // forwarding is dropped by fromActive → shortcuts all fail, observed: seek/space unresponsive) — hand focus to the new active buffer
  useEffect(() => {
    const act = iframesRef.current[bufs.active];
    const other = iframesRef.current[bufs.active === 0 ? 1 : 0];
    if (act && other && document.activeElement === other) act.focus();
    // The new doc's #vidEl canvas is empty: push the current frame right after the swap (during playback the next frame arrives naturally)
    videoEngineRef.current?.refresh();
  }, [bufs.active]);

  // Buffer swap done = new media debuted with the new doc → clear all "loading" badges (the upload phase is cleared by each flow)
  useEffect(() => {
    setMediaBusy((m) => {
      const entries = Object.entries(m).filter(([, p]) => p !== 'swap');
      return entries.length === Object.keys(m).length ? m : Object.fromEntries(entries);
    });
  }, [bufs.active]);

  // Global shortcuts (editor muscle memory): Space play/pause · arrow keys nudge the selected block's position (with
  // no selected block, ←→ steps the playhead) · Delete/Backspace deletes the selected block or scene · Escape closes
  // the source panel / deselects. All yield when the cursor is in an input/editable area; don't intercept Enter: focus
  // often sits on a toolbar button, and Enter would do "button trigger + block delete" together, making blocks vanish.
  // removeBlock/deleteShot etc. read the latest per-render closures via keysRef.
  const keysRef = useRef<{ removeBlock: (id: string) => void; deleteBlocks: (ids: Set<string>) => void; deleteShot: (sid: string) => void; deleteShots: (ids: Set<string>) => void; removeAudio: (id: string) => void; closeCode: () => void; closeFloat: () => void; deleteTransition: () => void; undo: () => void; redo: () => void; floatWin: FloatKind | null }>({
    removeBlock: () => {},
    deleteBlocks: () => {},
    deleteShot: () => {},
    deleteShots: () => {},
    removeAudio: () => {},
    closeCode: () => {},
    closeFloat: () => {},
    deleteTransition: () => {},
    undo: () => {},
    redo: () => {},
    floatWin: null,
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (e.key === 'Escape') {
        if (typing) return;
        if (keysRef.current.floatWin === 'code') {
          keysRef.current.closeCode(); // source panel open: close it first (revert unapplied draft), keep selection
          return;
        }
        if (keysRef.current.floatWin) {
          keysRef.current.closeFloat(); // any panel: Esc closes it first, keep selection
          return;
        }
        setSelectedId(null);
        setSelectedShotId(null);
        return;
      }
      // ⌘Z/Ctrl+Z: undo (operations with snapshots — trims, script cuts, block deletes, panel inserts, etc.); ⇧⌘Z: redo
      if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 'z' || e.key === 'Z')) {
        if (typing) return;
        e.preventDefault();
        if (e.shiftKey) keysRef.current.redo();
        else keysRef.current.undo();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === ' ') {
        // Focus often sits on a button, so bare Space would re-trigger it — hijack uniformly to play/pause
        const c = compRef.current;
        if (!c.video && c.blocks.length === 0) return;
        e.preventDefault();
        setPlaying((p) => !p);
        return;
      }
      if (e.key.startsWith('Arrow')) {
        const id = selectedIdRef.current;
        const b = id ? compRef.current.blocks.find((x) => x.id === id) : null;
        if (b?.box && !genIdsRef.current.has(b.id)) {
          // Nudge the selected block's position: 5px/step, Shift=20px (in comp px)
          e.preventDefault();
          const step = e.shiftKey ? 20 : 5;
          const dx = (e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0) * (step / compRef.current.width);
          const dy = (e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0) * (step / compRef.current.height);
          if (!dx && !dy) return;
          setComp((c) => ({
            ...c,
            blocks: c.blocks.map((x) => (x.id === b.id && x.box ? shiftBox(x, dx, dy) : x)),
          }));
          return;
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          // No nudgeable selected block: ←→ steps the playhead (0.1s, Shift=1s); pause first during playback (stepping = wanting frame-by-frame)
          e.preventDefault();
          if (playingRef.current) setPlaying(false);
          const step = (e.shiftKey ? 1 : 0.1) * (e.key === 'ArrowLeft' ? -1 : 1);
          const D = totalDuration(compRef.current);
          applyT(Math.max(0, Math.min(D, tRef.current + step)));
        }
        return;
      }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (keysRef.current.floatWin === 'transition') {
        // Transition selected (panel open): delete this transition, not the shot
        e.preventDefault();
        keysRef.current.deleteTransition();
        return;
      }
      if (selectedAudioIdRef.current) {
        // Music-lane clip selected: Del removes it (audio selection is exclusive with block/shot per click)
        e.preventDefault();
        keysRef.current.removeAudio(selectedAudioIdRef.current);
        return;
      }
      const bids = selectedBlockIdsRef.current;
      if (bids.size > 1) {
        e.preventDefault();
        keysRef.current.deleteBlocks(bids); // bulk-delete multi-selected blocks
        return;
      }
      const id = selectedIdRef.current;
      if (id) {
        e.preventDefault();
        keysRef.current.removeBlock(id); // unified guard: don't delete a generating block
        return;
      }
      const ids = selectedShotIdsRef.current;
      if (ids.size) {
        e.preventDefault();
        keysRef.current.deleteShots(ids); // bulk multi-select; single degrades automatically (unified guard: always keep at least one scene)
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [applyT, setComp, setPlaying]);

  // Agent range-play sentinel (play {toSec}): auto-pause when the playhead reaches it. Cleared on ANY pause —
  // a manual resume must not inherit an old stop point.
  const playStopAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (!playing) {
      playStopAtRef.current = null;
      return;
    }
    return playhead.subscribe(() => {
      const stop = playStopAtRef.current;
      if (stop != null && playhead.get() >= stop - 0.02) {
        playStopAtRef.current = null;
        setPlaying(false);
      }
    });
  }, [playing]);

  // Playback (canvas render mode): **the parent engine is the sole clock** — decode elements are resident in the parent,
  // not churned by doc rebuilds, so the whole "decode zombie / clock freeze / lost command" watchdog family retires with
  // the root cause. The iframe receives only two things: hf:frame (video frame drawn into the #vidEl canvas) +
  // hf:seekTimelines (overlay layers aligned per frame); hf:play/hf:pause are still sent — in-doc PiP media start/stop as usual (no self-driven clock under __parentClock).
  useEffect(() => {
    if (!playing) {
      videoEngineRef.current?.pause();
      postPreview({ type: 'hf:pause' });
      setT(tRef.current); // stopped: sync the coarse-grained t (for low-frequency consumers like debug overlay/liveGeom)
      return;
    }
    // Pressing play at the end → start over (no looping, but replay is allowed)
    if (tRef.current >= duration - 0.02) {
      tRef.current = 0;
      playhead.set(0);
      setT(0);
    }
    postPreview({ type: 'hf:play', t: tRef.current });
    videoEngineRef.current?.play(tRef.current);
  }, [playing, duration, postPreview]);

  /* ---------- Pick a local video (no upload, blob preview) + ASR ---------- */
  /** opts.asSig: a cloud-fetched File has a changed name/mtime so fileSig won't match the original sig — substitute the
   *  original sig, otherwise the draft-reconnect check fails and it's wiped as a "new project" (OPFS persistence/cloud backup also use the original sig). */
  async function pickVideoFile(file: File, opts?: { asSig?: string; reconnect?: boolean }) {
    if (!file.type.startsWith('video/') && !/\.(mp4|mov|webm|m4v)$/i.test(file.name)) {
      toast.error(t('workbench.chooseVideoFile'));
      return;
    }
    const sig = opts?.asSig ?? fileSig(file);
    setBusyImport(true);
    try {
      const p = await probeVideoFile(file);
      const dims = normalizeDims(p.width, p.height);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;
      setVideoFile(file);
      videoSigRef.current = sig;

      void saveLocalVideo(file, sig); // OPFS local library: draft restore auto-reconnects after refresh, no re-pick needed
      // Main video stays LOCAL (no auto R2 backup) — kept off deliberately; cross-device video
      // persistence is reserved for a future paid feature. Same-device reconnect uses OPFS above.
      // Inserted clips still back up (insert_clip fetches them from the cloud in another session).

      const dur = p.durationSec || 30;
      const pr = pendingRestoreRef.current;
      // Swap video: clear pipeline products (else tools reuse the old plan/visual and skip recompute).
      // NOT on a same-video draft-restore reconnect: cloud hydration (hydrateContextRefs) already put the
      // transcript/plan back, and wiping here left the captions/script panels empty while the timeline
      // showed captions — the products belong to this very video, keep them (user hit this).
      // reconnect: per-asset restore of the main source mid-session — same preserve semantics as a draft reconnect
      const sameVideoRestore = !!(pr && pr.videoSig && sig === pr.videoSig) || !!opts?.reconnect;
      if (!sameVideoRestore) {
        setAsrSentences(null);
        setPlan(null);
        setVisual(null);
        asrRef.current = null;
        planRef.current = null;
        visualRef.current = null;
      }
      resetExport();
      if (sameVideoRestore) {
        // Draft restore: re-picked the same original video — only reconnect the video, keep restored blocks/shots
        pendingRestoreRef.current = null;
        setComp((c) => ({ ...c, video: { url, durationSec: dur }, width: dims.width, height: dims.height }));
        toast.success(t('workbench.originalVideoReconnectedDraft'));
      } else {
        if (pr) pendingRestoreRef.current = null; // picked a different video = give up reconnecting, treat as new project
        // Swap video = new project: clear shots/blocks/palette (old shots' source spans point at the old video; leftovers seek out of range and misalign the scene bar).
        // Seed one shot spanning the whole video: selectable without splitting, so per-segment abilities (framing/person) need no special-casing (per user)
        setComp((c) => ({
          ...emptyComposition(),
          theme: c.theme,
          video: { url, durationSec: dur },
          width: dims.width,
          height: dims.height,
          shots: [{ id: shotId(), srcStart: 0, srcEnd: dur, treatment: 'full' as const }],
        }));
      }
      setSelectedId(null);
      setSelectedShotId(null);
      setCodeBlockId(null);
      setPlaying(false);
      tRef.current = 0;
      playhead.set(0);
      setT(0);
      toast.success(t('workbench.loadedSize', { w: dims.width, h: dims.height }) + (p.durationSec ? ` · ${p.durationSec.toFixed(1)}s` : '') + (p.hasAudio ? '' : t('workbench.noAudioTrack')));
      // Filmstrip: revoke old frame URLs, extract incrementally at a per-duration density (surface while decoding).
      // extractFilmstrip has no abort → generation guard: after a swap, late frames from the old video are revoked and dropped, never mixed into the new filmstrip.
      const gen = ++filmstripGenRef.current;
      setFilmstrip((prev) => {
        prev.forEach((f) => URL.revokeObjectURL(f.url));
        return [];
      });
      // Density ~1 frame/sec (cap 600 ≈ 10 min without thinning): previously capped at 120 frames, so a few-minute clip
      // stretched frame spacing to 2s+ — that's why hover tiles were "off by 2+ seconds" from the preview; surfaces incrementally, doesn't block interaction
      void extractFilmstrip(file, dur, Math.min(600, Math.max(8, Math.round(dur))), (f) => {
        if (filmstripGenRef.current !== gen) {
          URL.revokeObjectURL(f.url);
          return;
        }
        setFilmstrip((prev) => [...prev, f].sort((a, b) => a.t - b.t));
      }).catch(() => {});
    } catch {
      toast.error(t('workbench.couldNotReadVideo'));
    } finally {
      setBusyImport(false);
    }
  }

  // Extract audio → upload → ASR (in-memory + persistent cache by file fingerprint, transcribe each video once)
  // Current video (for build-draft): blob preview URL + canvas dimensions. Read the latest via ref.
  function currentVideo() {
    const c = compRef.current;
    return c.video ? { url: c.video.url, durationSec: c.video.durationSec, width: c.width, height: c.height } : null;
  }

  // Three render-pipeline steps (stepAsr/stepPlan/stepVisual, in-flight deduped) — see use-draft-pipeline.ts
  // Planning context for inserted clips: the implementation lands in the ref after ensureClipTranscripts is defined
  // (that code depends on later closures like matteFileForShot); this stub is empty for now, and by the time stepPlan runs it reads the real one
  const insertedClipsForPlanRef = useRef<() => Promise<PlanInsert[]>>(() => Promise.resolve([]));
  const { stepAsr, stepPlan, stepVisual } = useDraftPipeline({
    videoFileRef,
    compRef,
    asrRef,
    planRef,
    visualRef,
    setAsrSentences,
    setPlan,
    setVisual,
    setComp,
    currentVideo,
    getInsertedClips: () => insertedClipsForPlanRef.current(),
  });

  // Debug hook: clear the visual-analysis cache + rerun (same video returns cache instantly by default; use this to re-measure analysis)
  async function rerunVisual() {
    if (!videoFile || !comp.video) {
      toast.error(t('common.uploadVideoFirst'));
      return;
    }
    clearVisualCache(videoSigRef.current ?? fileSig(videoFile));
    setVisual(null);
    toast.success(t('workbench.cacheClearedReanalyzingVideo'));
    const vis = await analyzeVisual(videoFile, comp.video.durationSec).catch(() => null);
    setVisual(vis);
    toast.success(vis ? t('workbench.visualAnalysisDone') : t('workbench.visualAnalysisFoundNothing'));
  }

  /* ---------- Chat (streaming): a block is selected → edit it; none selected → AI creates a new component ---------- */
  /** Reuse /api/studio/compose to generate/edit a custom block, returning the model's raw text (note + fences). */
  const composeBlockRaw = useCallback(
    async (
      seed: { id: string; kind: string; innerHtml: string; timelineBody: string; label?: string; boxPx?: { w: number; h: number }; durationSec?: number; beats?: { text: string; start: number; end: number }[]; neighbors?: string[] },
      instruction: string,
      onDelta?: (raw: string) => void,
      opts?: ComposeMode,
    ): Promise<string> => {
      const script = asrSentences?.map((s) => s.text).join('') ?? ''; // full narration text as context
      const context: { script?: string; beats?: { text: string; start: number; end: number }[]; neighbors?: string[] } = {};
      if (script) context.script = script;
      if (seed.beats?.length) context.beats = seed.beats; // narration sentences within the block window (local time) → precise beat matching
      if (seed.neighbors?.length) context.neighbors = seed.neighbors; // list of other components in the same video → anti-monotony (vary prototype/alignment/motion)
      // Capabilities go through the provider (open-source split phase 2): the hosted shell = server LLM + billing; the OSS shell can swap the implementation or use BYO
      return studioProviders().composer.composeStream(
        {
          block: { id: seed.id, kind: seed.kind, innerHtml: seed.innerHtml, timelineBody: seed.timelineBody, label: seed.label ?? t('workbench.newElement'), ...(seed.boxPx ? { boxPx: seed.boxPx } : {}), ...(seed.durationSec ? { durationSec: seed.durationSec } : {}) },
          instruction,
          theme: compRef.current.theme,
          ...(compRef.current.palette ? { palette: compRef.current.palette } : {}), // background-derived colors, so the LLM uses the real accent
          ...(compRef.current.frameId ? { frameId: compRef.current.frameId } : {}), // frame design language goes into ACTIVE THEME
          lang: localeRef.current, // note (the human sentence in chat) uses the UI language
          ...(Object.keys(context).length ? { context } : {}),
          ...(opts?.kit ? { mode: 'kit' as const, ...(opts.current ? { current: opts.current } : {}) } : {}),
        },
        onDelta,
      );
    },
    [asrSentences],
  );

  /** Streamed text → the note visible on the card (prose before the first code fence; the contract is note-first, so it's what the model is currently saying). */
  const noteOf = (raw: string): string => {
    const i = raw.indexOf('```');
    return (i === -1 ? raw : raw.slice(0, i)).trim().slice(0, 120);
  };

  /** Generate/edit a block + static-check loop: on failure, feed the issues back for one fix round (bad output as the base, fix only the problems);
   *  if hard errors (unscoped CSS/script/non-determinism) remain after the fix → throw — better to keep a placeholder, bad CSS pollutes the whole doc. */
  const composeBlockChecked = useCallback(
    async (
      seed: { id: string; kind: string; innerHtml: string; timelineBody: string; label?: string; boxPx?: { w: number; h: number }; durationSec?: number; beats?: { text: string; start: number; end: number }[]; neighbors?: string[] },
      instruction: string,
      onDelta?: (raw: string) => void,
      opts?: ComposeMode,
    ): Promise<ComposedBlock> => {
      // Kit path: no lint round. The component's own schema is the gate and it never throws —
      // there is no such thing as malformed markup to bounce back, only props that clamp.
      if (opts?.kit) {
        const raw = await composeBlockRaw(seed, instruction, onDelta, opts);
        const { choice, note, declined } = parseKitResponse(raw);
        if (choice) return { innerHtml: seed.innerHtml, timelineBody: seed.timelineBody, note, kit: choice };
        // A deliberate null is an ANSWER — surface it and let the caller decide what a veto means.
        if (declined) return { innerHtml: seed.innerHtml, timelineBody: seed.timelineBody, note, declined: true };
        // {"custom": true} — the moment deserves a graphic no component carries (built-ins are a
        // library, not a cage): fall through to the free-form designer. Un-parseable output takes
        // the same road as a plain hiccup. The lint loop below guards both.
      }
      const raw = await composeBlockRaw(seed, instruction, onDelta);
      let parsed = parseBlockResponse(raw, { innerHtml: seed.innerHtml, timelineBody: seed.timelineBody });
      let issues = lintBlock({ blockId: seed.id, innerHtml: parsed.innerHtml, timelineBody: parsed.timelineBody });
      if (issues.length) {
        const fixSeed = { ...seed, innerHtml: parsed.innerHtml, timelineBody: parsed.timelineBody };
        const fixInstruction = `Your previous output failed these checks — fix ONLY these problems, keep everything else identical:\n${issues.map((i) => `- ${i.message}`).join('\n')}`;
        const raw2 = await composeBlockRaw(fixSeed, fixInstruction, onDelta);
        parsed = parseBlockResponse(raw2, { innerHtml: fixSeed.innerHtml, timelineBody: fixSeed.timelineBody });
        issues = lintBlock({ blockId: seed.id, innerHtml: parsed.innerHtml, timelineBody: parsed.timelineBody });
        const hard = issues.filter((i) => HARD_LINT_CODES.has(i.code));
        if (hard.length) throw new Error(t('workbench.generatedBlockFailedChecks', { message: hard[0]!.message }));
        if (issues.length) console.warn('[studio] block lint soft issues', seed.id, issues);
      }
      return parsed;
    },
    [composeBlockRaw],
  );

  /** Delete a block (from the selection toolbar / general). If it's the selected block, clear selection. Don't delete
   *  while generating (the worker's write-back misses and the result count lies). Send hf:remove first so the frame
   *  removes the block instantly — going through setComp alone waits for the 300ms debounced rebuild + double-buffer swap, making delete feel sticky. */
  const removeBlock = (id: string) => {
    if (genLockToast(id)) return;
    postPreview({ type: 'hf:remove', id });
    setComp((c) => ({ ...c, blocks: c.blocks.filter((b) => b.id !== id) }));
    setSelectedIdRaw((s) => (s === id ? null : s));
    setSelectedBlockIds((cur) => {
      if (!cur.has(id)) return cur;
      const n = new Set(cur);
      n.delete(id);
      return n;
    });
  };

  /* ---------- Video track: shot slicing + shot framing ---------- */
  const selectShot = (id: string, additive = false) => {
    if (additive) {
      toggleShotSelect(id); // ⌘/Ctrl click: toggle in/out of the multi-select set
      return;
    }
    setSelectedShotId(id);
    setSelectedId(null); // focus only one object at a time
  };
  const setShotTreatment = (sid: string, treatment: ShotTreatment) => {
    // Instant: apply the framing transform directly via the hf:shotVars live channel (the rebuild's keyframe end value
    // matches, so landing has no jump); structural parts like the partner vacancy / keyframe sequence are picked up by the debounced rebuild afterward
    const cur = compRef.current.shots?.find((x) => x.id === sid);
    if (cur) postPreview({ type: 'hf:shotVars', vars: shotTransformVars(treatment, cur.treatSize, cur.treatCrop) });
    setComp((c) => {
      const shots = (c.shots ?? []).map((s) => (s.id === sid ? { ...s, treatment } : s));
      return syncVacancyPartner({ ...c, shots }, sid);
    });
  };
  /** Framing size (0–100, non-full types): video scale/proportion follows, and the other-half vacancy moves in sync. */
  const setShotTreatSize = (sid: string, size: number) =>
    setComp((c) => {
      const shots = (c.shots ?? []).map((s) => (s.id === sid ? { ...s, treatSize: size } : s));
      return syncVacancyPartner({ ...c, shots }, sid);
    });
  /** Live preview during size drag: send hf:shotVars straight to the iframe (zero setState, no debounced rebuild); setShotTreatSize only on release.
   *  canvas render mode: every segment's framing is applied on the #vidEl canvas. */
  const previewShotTreatSize = (sid: string, size: number) => {
    const s = compRef.current.shots?.find((x) => x.id === sid);
    if (s) postPreview({ type: 'hf:shotVars', vars: shotTransformVars(s.treatment, size, s.treatCrop) });
  };
  /** Half-split crop position (0–100): which part of the frame survives the fill. Same live channel as size. */
  const setShotTreatCrop = (sid: string, crop: number) =>
    setComp((c) => ({ ...c, shots: (c.shots ?? []).map((s) => (s.id === sid ? { ...s, treatCrop: crop } : s)) }));
  const previewShotTreatCrop = (sid: string, crop: number) => {
    const s = compRef.current.shots?.find((x) => x.id === sid);
    if (s) postPreview({ type: 'hf:shotVars', vars: shotTransformVars(s.treatment, s.treatSize, crop) });
  };
  /** Shot-level color grade commit: filter changes take the same fast path as framing (hf:vidTimeline swaps the body
   *  in place, grade keyframes are inside it); if the playhead is within this shot, apply the instant value first, don't
   *  wait for the body swap. Fully neutral = drop the field entirely. */
  const setShotFilter = (sid: string, f: ShotFilter | null) => {
    const css = shotFilterCss(f ?? undefined);
    const sp = clipSpans(ensureShots(compRef.current)).find((x) => x.clip.id === sid);
    if (sp && tRef.current >= sp.editedStart - 1e-3 && tRef.current < sp.editedEnd) {
      postPreview({ type: 'hf:shotVars', vars: { filter: css } });
    }
    setComp((c) => ({
      ...c,
      shots: (c.shots ?? []).map((s) => {
        if (s.id !== sid) return s;
        const { filter: _drop, ...rest } = s;
        return css === 'none' ? rest : { ...rest, filter: f! };
      }),
    }));
  };
  /** Live preview during grade drag (zero setState; setShotFilter commits only on release). */
  const previewShotFilter = (_sid: string, f: ShotFilter) => {
    postPreview({ type: 'hf:shotVars', vars: { filter: shotFilterCss(f) } });
  };
  /** Per-shot audio commit (volume/mute): the engine-segment effect refeeds gains from comp.shots. */
  const setShotAudio = (sid: string, patch: { volumeDb?: number; mute?: boolean; fadeInSec?: number; fadeOutSec?: number }) => {
    setComp((c) => ({ ...c, shots: (c.shots ?? []).map((s) => (s.id === sid ? patchShotAudio(s, patch) : s)) }));
  };
  /** Track-level mute state (the timeline's speaker icons). A track counts as muted when EVERY item on it
   *  is — no new field for it: silencing a track is silencing its contents, and per-item mute already
   *  exists. The toggles live in timelineCbs (stable identity for the memoized timeline). */
  const videoTrackMuted = (comp.shots ?? []).length > 0 && (comp.shots ?? []).every((s) => s.audioMuted);
  const audioTrackMuted = (comp.audioTracks ?? []).length > 0 && (comp.audioTracks ?? []).every((c) => c.muted);


  /** Picked an image/video → write into a media-slot block's media slot. */
  const setBlockMedia = (bid: string, media: MediaRef) =>
    setComp((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === bid ? { ...b, slots: { ...b.slots, media } } : b)) }));
  /** Pop the native file picker, get one file. */
  const pickFile = (accept: string): Promise<File | null> =>
    new Promise((res) => {
      const i = document.createElement('input');
      i.type = 'file';
      i.accept = accept;
      i.onchange = () => res(i.files?.[0] ?? null);
      i.click();
    });
  /** DOM surgery on the index-th <img> in a custom block's innerHtml (swap src / remove) — same DOMParser patch approach as setSlot's text edit, zero-LLM, instant. */
  const patchCustomImg = (blockId: string, index: number, fn: (img: Element) => 'remove' | void) =>
    setComp((c) => ({
      ...c,
      blocks: c.blocks.map((b) => {
        if (b.id !== blockId || b.templateId !== 'custom') return b;
        const inner = String((b.slots as { innerHtml?: unknown }).innerHtml ?? '');
        try {
          const doc = new DOMParser().parseFromString(`<div id="__hfw">${inner}</div>`, 'text/html');
          const host = doc.getElementById('__hfw');
          const img = host?.querySelectorAll('img')[index];
          if (!host || !img) return b;
          if (fn(img) === 'remove') img.remove();
          return { ...b, slots: { ...b.slots, innerHtml: host.innerHTML } };
        } catch {
          return b;
        }
      }),
    }));
  /** Image toolbar "swap image": pick file → upload → only swap src, layout/animation unchanged (object-fit:cover from the generation contract keeps the layout intact). */
  const replaceCustomImg = async (blockId: string, index: number) => {
    const f = await pickFile('image/*');
    if (!f) return;
    setMediaBusyPhase(blockId, 'upload');
    try {
      const url = await uploadImageFile(f);
      patchCustomImg(blockId, index, (img) => {
        img.setAttribute('src', url);
        img.removeAttribute('srcset');
      });
      setMediaBusyPhase(blockId, 'swap');
    } catch (e) {
      setMediaBusyPhase(blockId, null);
      console.warn('[studio] replace slot image failed', e);
      toast.error(t('panels.imageUploadFailedTry'));
    }
  };
  /** Media block "replace": swap content of the same type (image↔image / video↔video), box/time-window/animation unchanged. */
  const replaceBlockMedia = async (bid: string) => {
    const b = compRef.current.blocks.find((x) => x.id === bid);
    const kind = (b?.slots.media as MediaRef | undefined)?.type === 'video' ? 'video' : 'image';
    const f = await pickFile(kind === 'image' ? 'image/*' : 'video/*');
    if (!f) return;
    setMediaBusyPhase(bid, 'upload');
    try {
      const url = kind === 'image' ? await uploadImageFile(f) : await uploadVideoFile(f);
      setBlockMedia(bid, { type: kind, url });
      setMediaBusyPhase(bid, 'swap');
      seekBlockSettled(bid);
    } catch (e) {
      setMediaBusyPhase(bid, null);
      console.warn('[studio] replace media failed', e);
      toast.error(kind === 'image' ? t('panels.imageUploadFailedTry') : t('workbench.videoUploadFailed'));
    }
  };
  /* ---------------- Insert actions for the asset library / component / frame panels ---------------- */

  const pushUndoSnapshot = () => {
    if (displacedRef.current) reclaimWritership(); // every mutation passes here → the edit-intent hook of the single-writer handover
    undoStackRef.current.push(compRef.current);
    if (undoStackRef.current.length > UNDO_CAP) undoStackRef.current.shift();
    redoStackRef.current = []; // a new edit after undo → the old redo line no longer holds
  };
  /** Natural dimensions of a remote image (null if unavailable → use the default placeholder, doesn't block insert). */
  const imageDims = (url: string): Promise<{ w: number; h: number } | null> =>
    new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im.naturalWidth > 0 && im.naturalHeight > 0 ? { w: im.naturalWidth, h: im.naturalHeight } : null);
      im.onerror = () => res(null);
      im.src = url;
    });
  /** Natural dimensions of a remote video (metadata is enough, don't download the whole file; null if unavailable). */
  const videoDims = (url: string): Promise<{ w: number; h: number } | null> =>
    new Promise((res) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      v.onloadedmetadata = () => res(v.videoWidth > 0 && v.videoHeight > 0 ? { w: v.videoWidth, h: v.videoHeight } : null);
      v.onerror = () => res(null);
      v.src = url;
    });
  /** Measure aspect ratio before insert (single entry for image/video) so the loading placeholder area is the right ratio from the start, no jump.
   *  Images measure only a 400px thumbnail (same ratio, arrives in a few hundred ms) — never download a multi-MB original just to measure and stall the placeholder;
   *  videos read only metadata. 1.5s fallback: if it can't measure (slow/cross-origin/bad source), null → default box, never blocks the insert. */
  const mediaDims = (media: MediaRef): Promise<{ w: number; h: number } | null> =>
    Promise.race([
      media.type === 'video' ? videoDims(media.url) : imageDims(imageThumb(media.url, 'strip')),
      new Promise<null>((res) => setTimeout(() => res(null), 1500)),
    ]);
  /** Media block placeholder box: height set from natural aspect ratio (image/video alike, cover = contain, no crop, no letterbox), portrait images pulled in so they don't reach the top;
   *  no dimensions → 0.72×0.4 fallback. center defaults to canvas center. */
  const mediaBoxFor = (dims: { w: number; h: number } | null, center?: { x: number; y: number }) => {
    let w = 0.72;
    let h = 0.4;
    if (dims) {
      const c = compRef.current;
      h = w * (dims.h / dims.w) * (c.width / c.height);
      if (h > 0.62) {
        w = (w * 0.62) / h;
        h = 0.62;
      }
      h = Math.max(0.06, h);
    }
    const cx = center?.x ?? 0.5;
    const cy = center?.y ?? 0.5;
    return { x: Math.min(Math.max(cx - w / 2, 0.02), 1 - w - 0.02), y: Math.min(Math.max(cy - h / 2, 0.02), 1 - h - 0.02), w, h };
  };
  /** Panel media selected → insert a media-slot block (PiP) at the playhead, and select it for immediate drag/duration tuning.
   *  Measure image/video aspect ratio first, then land the block to scale — the loading placeholder is the right size from the start, no default-box-then-jump.
   *  knownDims: caller already knows the natural size (e.g. the upload masonry already has it) → use it directly, skipping the measure step.
   *  atSec: landing time when dropped on the timeline (default = playhead). */
  const insertPanelMedia = async (media: MediaRef, label?: string, atSec?: number, knownDims?: { w: number; h: number }) => {
    const startSec = Math.max(0, Math.round((atSec ?? tRef.current) * 10) / 10);
    const dur = media.type === 'video' ? 5 : 3;
    const dims = knownDims ?? (await mediaDims(media)); // use ready dimensions if available, else measure (1.5s fallback null → default box)
    pushUndoSnapshot();
    const base = mediaBlock({
      startSec,
      durationSec: dur,
      box: mediaBoxFor(dims),
      trackIndex: freeTrack(compRef.current.blocks, startSec, dur),
      label: label || (media.type === 'video' ? t('chatGen.videoClip') : t('tools.add_graphics.label')),
    });
    const b: Block = { ...base, slots: { media } };
    setComp((c) => ({ ...c, blocks: [...c.blocks, b] }));
    setMediaBusyPhase(b.id, 'swap'); // URL ready, awaiting rebuild + CDN load to debut
    setSelectedShotId(null);
    setSelectedId(b.id);
    // Seek past the entry animation: +0.01 lands at the fade start, so the frame looks semi-transparent
    if (!playing) applyT(Math.max(0, startSec + Math.min(0.45, Math.max(0.01, dur - 0.06))));
    toast.success(t('workbench.mediaInsertedDragReposition'));
  };
  /** Media being dragged out of the upload panel (the stage overlays a docking layer during the drag; the iframe swallows drop events). dims: known natural size, skip measuring on land. */
  const [dragAsset, setDragAsset] = useState<PanelDragAsset | null>(null);
  /** Measured line rect of the selected caption (hf:measure reply; w/h normalized + the scale at measure time) — the
   *  selection box hugs the real caption area, derived incrementally from style during drag, not re-measured (re-measure would wait for a rebuild). */
  const [capMeasure, setCapMeasure] = useState<{ w: number; h: number; scale: number } | null>(null);
  const [capSubMeasure, setCapSubMeasure] = useState<{ w: number; h: number; scale: number } | null>(null); // measured translation line (same mechanism as capMeasure)
  const [capSelPart, setCapSelPart] = useState<'main' | 'sub'>('main'); // caption selection target: clicking the main line = main, the translation line = sub; handles are separate
  const selCapId = (() => {
    const b = selectedId ? comp.blocks.find((x) => x.id === selectedId) : null;
    return b && isSentenceCaption(b) ? b.id : null;
  })();
  useEffect(() => {
    if (!selCapId) {
      setCapMeasure(null);
      setCapSubMeasure(null);
      return;
    }
    postPreview({ type: 'hf:measure', id: selCapId });
    postPreview({ type: 'hf:measure', id: selCapId, sub: true }); // measure the translation line too (with no translation the iframe finds no element and simply doesn't reply)
    // bufs.active change = rebuild swap done, re-measure; captionStyle change = just committed (active doc already
    // set to the new font size via hf:capStyle) → re-measure immediately so the selection box hugs without waiting for
    // the 300ms rebuild (linear estimation is off when a larger font wraps, hit "box change lags"). The box is a global
    // style handle, it doesn't jump with the playhead / current segment
  }, [selCapId, bufs.active, comp.captionStyle, postPreview]);
  // Edit-mode force-show RETIRED: it existed for the fade-in era (playhead often rested at a
  // half-transparent moment). With hard-cut enter/exit and static cue lines, a caption inside its
  // window is always fully opaque — the only thing forcing still did was paint the SELECTED cue on
  // top of the one at the playhead (visibility:!important pierces the window gating), i.e. two
  // captions at once after pausing (user-reported). Keep only the restore/clear message.
  useEffect(() => {
    postPreview({ type: 'hf:capEdit', id: null });
  }, [selCapId, playing, postPreview]);
  // Blank-page click clears the caption selection (per user): the stage, the timeline and the captions
  // panel are keep-zones (data-cap-keep) — a concrete caption chip on the timeline is the one place
  // that SETS caption selection outside the stage; everywhere else (page chrome, gutters) deselects.
  useEffect(() => {
    if (!selCapId) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('[data-cap-keep]')) return;
      setSelectedIdRaw(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selCapId]);
  /** Media dropped on the stage: hitting a component card (media block) present at the current moment = fill it; a miss = create a new component card centered on the drop point. */
  const handleAssetDrop = async (e: React.DragEvent) => {
    const a = dragAsset;
    setDragAsset(null);
    if (!a) return;
    if (a.type === 'audio') {
      // Audio dropped on the stage: there's no visual placement for sound — mount as the bed from 0
      void audioOps.mountAudioFromUrl(a.url, a.label);
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    const tNow = tRef.current;
    const hit = compRef.current.blocks
      .filter((b) => b.box && blockKind(b) === 'media' && tNow >= b.startSec - 1e-3 && tNow < b.startSec + b.durationSec + 1e-3)
      .filter((b) => nx >= b.box!.x && nx <= b.box!.x + b.box!.w && ny >= b.box!.y && ny <= b.box!.y + b.box!.h)
      .sort((x, y) => y.trackIndex - x.trackIndex)[0];
    // Components and images are dropped with equal standing (user-unified): hitting an empty component card = fill it
    // (via elementTargetRef; insertGeneratedElement only backfills after verifying "empty card"), a miss = insert (brings its own layout, ignores drop coords)
    if (a.type === 'element') {
      if (hit) {
        if (genLockToast(hit.id)) return;
        elementTargetRef.current = hit.id;
      }
      insertGeneratedElement(a.element, a.prompt);
      return;
    }
    if (hit) {
      if (genLockToast(hit.id)) return;
      pushUndoSnapshot();
      setBlockMedia(hit.id, { type: a.type, url: a.url });
      setMediaBusyPhase(hit.id, 'swap');
      setSelectedShotId(null);
      setSelectedId(hit.id);
      toast.success(t('workbench.filledIntoElementCard'));
      return;
    }
    // Same as insertPanelMedia: measure aspect ratio first, then land the block to scale (centered on the drop point), so the loading placeholder is correct from the start
    const startSec = Math.max(0, Math.round(tNow * 10) / 10);
    const dur = a.type === 'video' ? 5 : 3;
    const dims = a.dims ?? (await mediaDims({ type: a.type, url: a.url })); // if the drag carried dimensions, skip measuring
    pushUndoSnapshot();
    const base = mediaBlock({ startSec, durationSec: dur, box: mediaBoxFor(dims, { x: nx, y: ny }), trackIndex: freeTrack(compRef.current.blocks, startSec, dur), label: a.label });
    const nb: Block = { ...base, slots: { media: { type: a.type, url: a.url } } };
    setComp((c) => ({ ...c, blocks: [...c.blocks, nb] }));
    setMediaBusyPhase(nb.id, 'swap');
    setSelectedShotId(null);
    setSelectedId(nb.id);
    toast.success(t('workbench.createdNewElementCard'));
  };
  /** Empty component block "upload": pick a file, and on success fill it into the block. */
  const uploadIntoBlock = async (id: string) => {
    const f = await pickFile('image/*,video/*');
    if (!f) return;
    const kind = f.type.startsWith('video/') ? 'video' : 'image';
    setMediaBusyPhase(id, 'upload');
    try {
      const url = kind === 'image' ? await uploadImageFile(f) : await uploadVideoFile(f);
      setBlockMedia(id, { type: kind, url });
      setMediaBusyPhase(id, 'swap');
      setSelectedId(id);
      seekBlockSettled(id);
    } catch (e) {
      setMediaBusyPhase(id, null);
      console.warn('[studio] upload into block failed', e);
      toast.error(t('panels.uploadFailedTryAgain'));
    }
  };
  /** Move the playhead to a block's stable frame after the entry animation: rests mid-entry so the content looks like it has "built-in transparency". */
  const seekBlockSettled = (id: string) => {
    const b = compRef.current.blocks.find((x) => x.id === id);
    if (!b || playingRef.current) return;
    applyT(Math.max(0, b.startSec + Math.min(Math.max(0.45, b.durationSec * 0.2), Math.max(0.01, b.durationSec - 0.06))));
  };
  /** Empty component block "AI generate": open the gen panel (component tab); when the output is inserted, prefer filling this empty block (elementTargetRef). */
  const elementTargetRef = useRef<string | null>(null);
  const aiFillBlock = (id: string) => {
    elementTargetRef.current = id;
    setGenType('element');
    setFloatWin('gen');
    toast.info(t('workbench.afterGeneratingClickInsert'));
  };
  /** Template panel → insert a new block of that template at the playhead (default slot data, edit text after). */
  // Kit block selected -> the props panel pops in the rail area (and follows the selection away).
  useEffect(() => {
    const b = selectedId ? compRef.current.blocks.find((x) => x.id === selectedId) : null;
    const isKit = !!b?.templateId.startsWith('kit:');
    if (isKit) setFloatWin('kitProps');
    else if (floatWinRef.current === 'kitProps') setFloatWin(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);
  const insertTemplateBlock = (templateId: string, kitProps?: Record<string, unknown>) => {
    pushUndoSnapshot();
    const startSec = Math.max(0, Math.round(tRef.current * 10) / 10);
    let base = newBlock(templateId, { startSec });
    if (templateId.startsWith('kit:')) {
      // Kit blocks: language-neutral sample props (defaults carry the design; the value/text is the only content),
      // a boxed default region, and enough duration for the staged entrance to read.
      // Props tuned in the preview lightbox win over the samples; duration matches the preview
      base = {
        ...base,
        slots: { ...base.slots, props: kitProps ?? kitSampleProps(templateId.slice(4)) },
        box: { x: 0.07, y: 0.34, w: 0.86, h: 0.3 },
        durationSec: KIT_INSERT_DURATION,
      };
    }
    const b = { ...base, trackIndex: freeTrack(compRef.current.blocks, base.startSec, base.durationSec, base.trackIndex) };
    setComp((c) => ({ ...c, blocks: [...c.blocks, b] }));
    setSelectedShotId(null);
    setSelectedId(b.id);
    if (!playing) applyT(Math.max(0, startSec + 0.01));
    toast.success(t('workbench.insertedLabel', { label: t(b.label ?? templateId) }));
  };
  /** Generated video → set as the main video. The CDN has no CORS headers, so fetch bytes through the /api/media/fetch same-origin proxy.
   *  Swapping the main video = a new project (pickVideoFile clears shots/blocks) — confirm first if there's content. */
  const setMainVideoFromUrl = async (url: string) => {
    const c = compRef.current;
    if (c.video || c.blocks.length > 0) {
      const ok = await confirm({
        title: t('workbench.replaceMainVideo'),
        description: t('workbench.replacingMainVideoStarts'),
        confirmLabel: t('panels.replace'),
        tone: 'danger',
      });
      if (!ok) return;
    }
    try {
      const r = await fetch(`/api/media/fetch?url=${encodeURIComponent(url)}`);
      if (!r.ok) throw new Error(String(r.status));
      const blob = await r.blob();
      await pickVideoFile(new File([blob], 'generated.mp4', { type: blob.type || 'video/mp4' }));
    } catch (e) {
      console.warn('[studio] set main video failed', e);
      toast.error(t('workbench.couldNotReplaceMain'));
    }
  };
  /** Frame panel "use" → attach the frame as a tag in chat (the request carries frameId to inject the playbook), switch back to chat. */
  const useFrameInChat = (f: FrameCatalogItem) => {
    openChat();
    chatRef.current?.attachFrame({ id: f.id, title: f.title, icon: f.icon, iconKey: f.iconKey ?? null });
  };
  // Frame mounted (panel "use" / chat `/` trigger) → land the theme palette into comp:
  // compose's themeForLlm consumes comp.palette to inject the token table, so generated content follows the theme's palette/fonts/radius from then on.
  // Removing the tag doesn't roll back the palette (the project palette is explicit state; to revert to frame-derived colors, rerun visual analysis).
  const frameCatalogRef = useRef<FrameCatalogItem[]>([]);
  frameCatalogRef.current = useFrameCatalog();
  // onFrameApplied is defined before setPersonFx/runMatteForShot and has empty deps → read the latest instances via refs
  const setPersonFxRef = useRef<((fx: PersonFx | undefined) => void) | null>(null);
  const runMatteForShotRef = useRef<((s: VideoShot) => Promise<void>) | null>(null);
  const onFrameApplied = useCallback((af: AttachedFrame) => {
    const f = frameCatalogRef.current.find((x) => x.id === af.id);
    if (!f) return;
    // Land palette + frameId together: palette drives the token layer, frameId gives compose the design-language brief
    setComp((c) => ({ ...c, frameId: f.id, ...(f.palette ? { palette: f.palette } : {}) }));
    // The theme declared a person recommendation (sticker theme: cut out the subject and add a sticker outline) → land it into comp.personFx too,
    // and enable matte for the shot at the playhead (finite segment, progress via the person panel; whole-video per-segment enabling belongs to the person panel)
    const fx = f.personFx ? personFxFromFrame(f.personFx) : null;
    if (fx) {
      setPersonFxRef.current?.(fx);
      const tNow = playhead.get();
      const sp = clipSpans(compRef.current.shots ?? []).find((x) => tNow >= x.editedStart && tNow < x.editedEnd) ?? clipSpans(compRef.current.shots ?? [])[0];
      const s = sp?.clip;
      if (s && !s.personMatte) {
        setComp((c) => ({ ...c, shots: (c.shots ?? []).map((x) => (x.id === s.id ? { ...x, personMatte: true } : x)) }));
        void runMatteForShotRef.current?.(s);
      }
      toast.success(t('workbench.appliedThemePersonFx', { title: f.title }));
      return;
    }
    toast.success(t('workbench.appliedTheme', { title: f.title }));
  }, []);
  /** Global caption style (shared by the captions panel + canvas handles): patch merged onto the current effective style, applied uniformly to all sentence-level captions. */
  /* ---------------- Unified gen panel (one chat interaction for image/video/component) ---------------- */

  // Timeline block drag: move (clamped to [0, dur]) / trim both ends. Don't move a generating block (its time window was already fed to the worker)
  const moveBlock = (id: string, startSec: number) => {
    if (genLockToast(id)) return;
    setComp((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === id ? { ...b, startSec: Math.max(0, Math.round(startSec * 100) / 100) } : b)) }));
  };
  const resizeBlock = (id: string, startSec: number, durationSec: number) => {
    if (genLockToast(id)) return;
    setComp((c) => ({
      ...c,
      blocks: c.blocks.map((b) =>
        b.id === id ? { ...b, startSec: Math.max(0, Math.round(startSec * 100) / 100), durationSec: Math.max(0.3, Math.round(durationSec * 100) / 100) } : b,
      ),
    }));
  };
  // Ensure there's a shot spanning the whole video (give one full segment when there are no shots) for trim operations to act on
  const ensureShots = (c: Composition): VideoShot[] =>
    c.shots && c.shots.length ? c.shots : c.video ? [{ id: shotId(), srcStart: 0, srcEnd: c.video.durationSec, treatment: 'full' as const }] : [];

  // Audio tracks orchestration (upload/generate/clips/engine sync/export payload — see use-bgm.ts).
  // Called here (not earlier) because pushUndoSnapshot is a const — TDZ before its definition.
  const audioOps = useAudioTracks({ comp, compRef, setComp, videoFileRef, videoSigRef, videoEngineRef, clipFilesRef, tRef, pickFile, backupMediaToCloud, pushUndoSnapshot });
  audioExportRef.current = audioOps.audioForExport;
  /** Switch the rail to the audio settings tab (expanding the rail if the user had collapsed it). */
  const openAudioTab = () => {
    setFloatWin(null);
    setLibTab('audio');
    setLibCollapsed(false);
  };
  // Selected clip removed (undo, agent edit, delete) → drop the dangling selection
  useEffect(() => {
    if (selectedAudioId && !(comp.audioTracks ?? []).some((c) => c.id === selectedAudioId)) setSelectedAudioId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comp.audioTracks]);
  // Narration denoise (bake/cache/dub/export substitution — see use-denoise.ts)
  const denoiseOps = useDenoise({ comp, compRef, setComp, videoFileRef, videoSigRef, videoEngineRef, pushUndoSnapshot });
  denoiseExportRef.current = denoiseOps.denoiseForExport;

  /** Editable caption lines for the captions panel, in edited-timeline order across all sources.
   *  Walk the shot spans; a sentence overlapping a span joins at that span's edited time; split shots
   *  sharing a sentence dedupe to the first occurrence. */

  /** Read a remote video's duration (metadata only). Streaming webm (MediaRecorder output) has duration=Infinity at
   *  the metadata stage: seek to a huge value to force the browser to compute the real duration (classic fix), 3s fallback.
   *  A just-uploaded URL may hit CDN propagation delay (first fetch 404): retry 2 more times, 1.2s apart. */


  /** Cut: split the current shot in two at the playhead (content unchanged). Compute first, push the snapshot after —
   *  if it lands on a boundary and doesn't cut, don't touch the undo/redo stack (clearing the redo line without re-rendering would leave button states stale). */
  const splitAtPlayhead = () => {
    const c = compRef.current;
    // An audio clip is selected → the toolbar acts on IT (same rule the Del key follows): split it in two
    // at the playhead, leaving the timeline untouched.
    const audId = selectedAudioIdRef.current;
    if (audId) {
      const clip = (c.audioTracks ?? []).find((x) => x.id === audId);
      if (!clip) return;
      const halves = splitAudioClipAt(clip, tRef.current, audioClipId);
      if (!halves) {
        toast.error(t('workbench.movePlayheadToSplitAudio'));
        return;
      }
      pushUndoSnapshot();
      setComp((cur) => ({ ...cur, audioTracks: (cur.audioTracks ?? []).flatMap((x) => (x.id === audId ? halves : [x])) }));
      return;
    }
    if (!c.video) return;
    const shots = ensureShots(c);
    if (splitBlockedByTransition(shots, tRef.current)) {
      toast.error(t('workbench.removeTransitionToSplit'));
      return;
    }
    const r = splitAtEdited(shots, tRef.current, (base, srcStart, srcEnd) => ({ ...base, id: shotId(), srcStart, srcEnd }));
    if (r.clips === shots) return;
    pushUndoSnapshot();
    setComp((cur) => ({ ...cur, shots: r.clips }));
  };
  /** Trim left / right: cut the source footage on the left/right of the playhead in the current shot, everything after
   *  shifts left, captions/effect blocks compress along with it. Read compRef (setComp wrapper writes synchronously) — the agent firing multiple trim tools in one round doesn't swallow the previous step. */
  const trimAtPlayhead = (side: 'left' | 'right') => {
    const c = compRef.current;
    // Audio clip selected → trim ITS edge to the playhead (same math the lane handles use)
    const audId = selectedAudioIdRef.current;
    if (audId) {
      const clip = (c.audioTracks ?? []).find((x) => x.id === audId);
      if (!clip) return;
      const w = audioClipWindow(clip, totalDuration(c));
      if (tRef.current <= w.start + 0.05 || tRef.current >= w.end - 0.05) {
        toast.error(t('workbench.movePlayheadToTrimAudio'));
        return;
      }
      pushUndoSnapshot();
      audioOps.patchClip(audId, audioTrimPatch(clip, side, tRef.current));
      return;
    }
    if (!c.video) return;
    const shots = ensureShots(c);
    const r = side === 'left' ? trimLeftAtEdited(shots, tRef.current) : trimRightAtEdited(shots, tRef.current);
    if (!r.removed) {
      toast.error(t('workbench.movePlayheadToTrim'));
      return;
    }
    pushUndoSnapshot();
    setComp((cur) => ({ ...cur, shots: r.clips, blocks: removeEditedInterval(cur.blocks, r.removed![0], r.removed![1]) }));
    setSelectedShotId(null);
    applyT(r.removed[0]); // playhead lands at the cut point
  };
  /** Delete scene: remove the source footage for this shot (everything after shifts left, blocks compress). */
  const deleteShot = (sid: string) => {
    const c = compRef.current;
    const shots = ensureShots(c);
    const r = deleteClipById(shots, sid);
    if (!r.removed) {
      toast.error(t('workbench.keepLeastOneScene'));
      return;
    }
    pushUndoSnapshot();
    setComp((cur) => ({ ...cur, shots: r.clips, blocks: removeEditedInterval(cur.blocks, r.removed![0], r.removed![1]) }));
    setSelectedShotId(null);
    applyT(r.removed[0]);
  };
  /** Bulk-delete multiple shots (multi-select). Delete from the final-cut end backward — removing a later shot doesn't
   *  affect an earlier shot's final-cut coords, and removeEditedInterval compresses overlay blocks each time. Keep at least one scene; select-all = refuse. */
  const deleteShots = (ids: Set<string>) => {
    const c = compRef.current;
    let shots = ensureShots(c);
    const targets = clipSpans(shots)
      .filter((sp) => ids.has(sp.clip.id))
      .sort((a, b) => b.editedStart - a.editedStart); // end first
    if (targets.length === 0) return;
    if (targets.length === 1) return deleteShot(targets[0]!.clip.id); // degrade to single delete (reuse guard/landing point)
    if (targets.length >= shots.length) {
      toast.error(t('workbench.keepLeastOneScene'));
      return;
    }
    pushUndoSnapshot();
    let blocks = c.blocks;
    let firstStart = Infinity;
    for (const sp of targets) {
      const r = deleteClipById(shots, sp.clip.id);
      if (!r.removed) continue; // hit the "last shot" guard: skip
      shots = r.clips;
      blocks = removeEditedInterval(blocks, r.removed[0], r.removed[1]);
      firstStart = Math.min(firstStart, r.removed[0]);
    }
    setComp((cur) => ({ ...cur, shots, blocks }));
    setSelectedShotId(null);
    applyT(Number.isFinite(firstStart) ? firstStart : 0);
    toast.success(t('workbench.deletedNScenes', { n: targets.length }));
  };
  /** Delete a SOURCE from the track (assets-panel delete): every shot cut from that source goes, overlay
   *  blocks compress per removed span (same math as multi-delete). Equal-footing: the first-loaded source
   *  gets no special treatment (src = null addresses it, even when its bytes are missing and comp.video
   *  is already null). One undo snapshot; blob URLs stay alive, so undo restores a playable track for
   *  this session (only the OPFS bytes are gone for good). */
  const deleteAssetSource = (src: string | null) => {
    const c = compRef.current;
    const isMain = src == null || c.video?.url === src;
    const shots = ensureShots(c);
    const spans = clipSpans(shots)
      .filter((sp) => (isMain ? !sp.clip.src : sp.clip.src === src))
      .sort((a, b) => b.editedStart - a.editedStart); // end first: earlier spans' coords stay valid
    if (spans.length === 0 && !isMain) return;
    pushUndoSnapshot();
    let cur = shots;
    let blocks = c.blocks;
    let firstStart = spans.length ? spans[spans.length - 1]!.editedStart : 0;
    for (const sp of spans) {
      const r = deleteClipById(cur, sp.clip.id);
      if (r.removed) {
        cur = r.clips;
        blocks = removeEditedInterval(blocks, r.removed[0], r.removed[1]);
      } else {
        // Engine's keep-one guard fired: this span IS the whole remaining track — empty it outright
        blocks = removeEditedInterval(blocks, 0, sp.clip.srcEnd - sp.clip.srcStart);
        cur = [];
      }
    }
    setComp((x) => ({ ...x, shots: cur, blocks, ...(isMain ? { video: null } : {}) }));
    // Drop the source's cloud byte-rendezvous index too — otherwise the next boot resurrects the
    // deleted source from the R2 vault (loadLocalVideo miss → vault hit → source re-appears).
    const deadSigs = new Set(spans.map((sp) => sp.clip.srcSig).filter(Boolean) as string[]);
    if (cloudMediaRef.current.clips && deadSigs.size) {
      cloudMediaRef.current = {
        ...cloudMediaRef.current,
        clips: Object.fromEntries(Object.entries(cloudMediaRef.current.clips).filter(([k]) => !deadSigs.has(k))),
      };
    }
    if (isMain) {
      setVideoFile(null);
      videoSigRef.current = null;
      if (cloudMediaRef.current.video) cloudMediaRef.current = { ...cloudMediaRef.current, video: undefined };
    }
    setSelectedShotId(null);
    setSelectedShotIds(new Set());
    applyT(Math.max(0, firstStart));
  };
  /** Per-asset source liveness: are this source's bytes reachable in THIS session? Main = the loaded
   *  File; local clips = the held File map; remote URLs count as live (fetchable). Drives the panel's
   *  restore-card variant and the timeline's missing-source strip. */
  const srcLive = (src: string) =>
    src === compRef.current.video?.url ? !!videoFileRef.current : !src.startsWith('blob:') || clipFilesRef.current.has(src);
  /** Per-asset reconnect (user gesture): handle/OPFS first (may prompt for permission), then the R2
   *  vault, then a manual re-pick verified against the sig. src = null targets the main source. */
  const reconnectSource = async (src: string | null, sig?: string | null) => {
    let f = sig ? await loadLocalVideo(sig) : null;
    if (!f && sig) {
      const vaulted = src == null ? cloudMediaRef.current.video?.sig === sig : !!cloudMediaRef.current.clips?.[sig];
      if (vaulted) {
        const cf = await studioProviders().vault.fetch(sig);
        if (cf) f = alignFileToSig(cf, sig); // vault files carry their own name/mtime — realign or the identity drifts
      }
    }
    if (!f) {
      f = await pickFile('video/*');
      if (!f) return;
      if (sig && fileSig(f) !== sig) {
        toast.error(t('workbench.checksumMismatch'));
        return;
      }
    }
    if (src == null) {
      void pickVideoFile(f, { ...(sig ? { asSig: sig } : {}), reconnect: true });
      return;
    }
    const sg = sig ?? fileSig(f);
    backupMediaToCloud(f, sg, 'clip');
    const url = URL.createObjectURL(f);
    clipFilesRef.current.set(url, f);
    void saveLocalVideo(f, sg).catch(() => {});
    setComp((c) => ({ ...c, shots: (c.shots ?? []).map((x) => (x.src === src ? { ...x, src: url, srcSig: sg } : x)) }));
    toast.success(t('workbench.bRollReconnected'));
  };
  /** Bulk-delete multiple component blocks (⌘ multi-select/marquee). The caption layer (pure computed product) and generating blocks are skipped; one undo snapshot. */
  const deleteBlocks = (ids: Set<string>) => {
    const targets = compRef.current.blocks.filter((b) => ids.has(b.id) && !isSentenceCaption(b) && !genIdsRef.current.has(b.id));
    if (targets.length === 0) return;
    if (targets.length === 1) return removeBlock(targets[0]!.id); // degrade to single delete (reuse instant-remove/guard)
    pushUndoSnapshot();
    const kill = new Set(targets.map((b) => b.id));
    for (const b of targets) postPreview({ type: 'hf:remove', id: b.id }); // remove blocks from the frame instantly, don't wait for the debounced rebuild
    setComp((c) => ({ ...c, blocks: c.blocks.filter((b) => !kill.has(b.id)) }));
    setSelectedIdRaw(null);
    setSelectedBlockIds(new Set());
    toast.success(t('workbench.deletedNElements', { n: targets.length }));
  };
  const selectedShot = comp.shots?.find((s) => s.id === selectedShotId) ?? null;

  // Shortcut context: these are per-render closures, the keydown listener mounts once and reads the latest via ref
  /** ⌘Z undo: pop the snapshot stack (same stack as the agent undo tool; same guard — no rollback while generating). */
  const undoLast = () => {
    if (genIdsRef.current.size) {
      toast.error(t('workbench.elementGeneratingUndoAfter'));
      return;
    }
    const stack = undoStackRef.current;
    while (stack.length && stack[stack.length - 1] === compRef.current) stack.pop();
    const prev = stack.pop();
    if (!prev) {
      toast.info(t('workbench.nothingUndo'));
      return;
    }
    redoStackRef.current.push(compRef.current);
    setComp(prev);
    setSelectedId(null);
    setSelectedShotId(null);
    toast.success(t('workbench.undone') + (stack.length ? t('workbench.nMoreUndoSteps', { n: stack.length }) : ''));
  };
  /** ⇧⌘Z redo: pop the redo stack (only undo feeds it; a new edit voids the whole line). Push directly to the undo stack, not via pushUndoSnapshot — that would clear the redo line. */
  const redoLast = () => {
    if (genIdsRef.current.size) {
      toast.error(t('workbench.elementGeneratingRedoAfter'));
      return;
    }
    const next = redoStackRef.current.pop();
    if (!next) {
      toast.info(t('workbench.nothingRedo'));
      return;
    }
    undoStackRef.current.push(compRef.current);
    if (undoStackRef.current.length > UNDO_CAP) undoStackRef.current.shift();
    setComp(next);
    setSelectedId(null);
    setSelectedShotId(null);
    toast.success(t('workbench.redone') + (redoStackRef.current.length ? t('workbench.nMoreRedoSteps', { n: redoStackRef.current.length }) : ''));
  };
  keysRef.current = {
    removeBlock,
    deleteBlocks,
    deleteShot,
    deleteShots,
    removeAudio: (id: string) => {
      audioOps.removeClip(id);
      setSelectedAudioId(null);
    },
    closeCode: () => setFloatWin(null),
    closeFloat: () => setFloatWin(null),
    deleteTransition: () => {
      if (transitionCut != null) setCutTransition(transitionCut, null);
      setFloatWin(null);
    },
    undo: undoLast,
    redo: redoLast,
    floatWin,
  };
  // Undo/redo button enabled state: the stacks are refs, but every stack change comes with a setComp re-render, so reading directly during render has no lag.
  // A stack top sharing the same reference as the current comp is a no-op snapshot (undoLast skips it on pop), doesn't count as a step.
  const canUndo = (() => {
    const st = undoStackRef.current;
    let i = st.length - 1;
    while (i >= 0 && st[i] === comp) i--;
    return i >= 0;
  })();
  const canRedo = redoStackRef.current.length > 0;

  /** Component surface background. undefined = transparent (clears the surface). */
  const setBlockBg = (id: string, bg: string | undefined) =>
    setComp((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === id ? { ...b, bg } : b)) }));
  /** Component border color. undefined = no border. */
  const setBlockBorder = (id: string, border: string | undefined) =>
    setComp((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === id ? { ...b, border } : b)) }));
  /** Component opacity (0–1). ≈1 clears it (back to default). */
  const setBlockOpacity = (id: string, v: number) =>
    setComp((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === id ? { ...b, opacity: v >= 0.995 ? undefined : v } : b)) }));
  /** Component corner radius (comp px). 0 clears it (back to square/default). */
  const setBlockRadius = (id: string, v: number) =>
    setComp((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === id ? { ...b, radius: v > 0 ? v : undefined } : b)) }));
  /** Component whole rotation (degrees). 0 clears it (back to upright). */
  const setBlockRotation = (id: string, v: number) =>
    setComp((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === id ? { ...b, rotation: v ? v : undefined } : b)) }));
  /** Person-matte global config (person panel): undefined = all defaults. */
  const setPersonFx = (fx: PersonFx | undefined) => {
    // Instant: feather/stroke/background sent straight via hf:personFx to the matte shim (conversion matches assemble);
    // structural toggles (personFront layer order / first pipeline install) are picked up by the debounced rebuild
    const W = compRef.current.width;
    const featherPx = Math.round(((Math.max(0, Math.min(100, fx?.feather ?? 0)) / 100) * W) / 45 * 10) / 10;
    const strokePx = fx?.stroke && fx.stroke.width > 0 ? Math.max(1.2, ((Math.max(0, Math.min(100, fx.stroke.width)) / 100) * W) / 30) : 0;
    const bg = fx?.bg ? (fx.bg.type === 'color' ? fx.bg.color : `#000 center/cover no-repeat url('${fx.bg.url}')`) : null;
    postPreview({
      type: 'hf:personFx',
      feather: featherPx,
      strokeW: strokePx,
      strokeStyle: fx?.stroke?.style ?? 'solid',
      strokeColor: fx?.stroke?.color ?? '#ffffff',
      strokeAlpha: fx?.stroke?.opacity ?? 1,
      bg,
    });
    setComp((c) => ({ ...c, personFx: fx }));
  };
  setPersonFxRef.current = setPersonFx;
  /** Whether this range's (a source's) mask is mostly complete (≥80% of sample points have frames) — avoids re-running when the toggle is flipped again. */
  const matteCovered = useCallback((key: string, from: number, to: number): boolean => {
    const track = matteTrackRef.current.get(key);
    if (!track?.length) return false;
    const expected = Math.max(1, Math.floor((to - from) * MATTE_FPS));
    let have = 0;
    for (const f of track) if (f.t >= from - 0.05 && f.t <= to + 0.05) have += 1;
    return have >= expected * 0.8;
  }, []);
  /** Budget a mask segment (progress to matteState; results merged into the corresponding track by **that source's** file time, overwriting old frames in the same segment). */
  const runMatteBatch = useCallback(async (job: { key: string; file: File; upTo: number; from: number; to: number }) => {
    const { key, file, upTo, from, to } = job;
    matteAbortRef.current?.abort();
    const ab = new AbortController();
    matteAbortRef.current = ab;
    setMatteState({ status: 'running', done: 0, total: 1 });
    try {
      const arr = await computeMatteTrack(file, upTo, (done, total) => setMatteState({ status: 'running', done, total }), ab.signal, { from, to });
      if (ab.signal.aborted) return;
      if (arr?.length) {
        const eps = 0.001;
        const kept = (matteTrackRef.current.get(key) ?? []).filter((f) => f.t < from - eps || f.t > to + eps);
        const merged = [...kept, ...arr].sort((a, b) => a.t - b.t);
        matteTrackRef.current.set(key, merged);
        setMatteState({ status: 'ready', done: merged.length, total: merged.length });
      } else {
        setMatteState({ status: 'error', done: 0, total: 0 });
      }
    } catch (e) {
      console.warn('[studio] person-matte precompute failed', e);
      if (!ab.signal.aborted) setMatteState({ status: 'error', done: 0, total: 0 });
    }
  }, []);
  /** Locate a shot's matte source file (equal-standing: matte whichever segment's source is selected): narration source
   *  = main video File; other sources = clipFilesRef (local), remote URLs fetched-and-cached on the fly (also feeding the filmstrip/export). */
  const matteFileForShot = useCallback(async (s: VideoShot): Promise<{ key: string; file: File; upTo: number } | null> => {
    if (!s.src) {
      const f = videoFileRef.current;
      const dur = compRef.current.video?.durationSec;
      return f && dur ? { key: 'main', file: f, upTo: dur } : null;
    }
    let f = clipFilesRef.current.get(s.src) ?? null;
    if (!f && !s.src.startsWith('blob:')) {
      try {
        const r = await fetch(`/api/media/fetch?url=${encodeURIComponent(s.src)}`);
        if (r.ok) {
          f = new File([await r.blob()], 'clip.mp4', { type: 'video/mp4' });
          clipFilesRef.current.set(s.src, f);
        }
      } catch {
        /* fallthrough */
      }
    }
    return f ? { key: s.src, file: f, upTo: s.srcEnd } : null;
  }, []);
  /** Run matte for a shot (only if frames are missing; clear error if the source file is unavailable). */
  const runMatteForShot = useCallback(
    async (s: VideoShot) => {
      const src = await matteFileForShot(s);
      if (!src) {
        toast.error(t('workbench.couldNotGetSource'));
        setMatteState({ status: 'error', done: 0, total: 0 });
        return;
      }
      if (!matteCovered(src.key, s.srcStart, s.srcEnd)) await runMatteBatch({ key: src.key, file: src.file, upTo: src.upTo, from: s.srcStart, to: s.srcEnd });
    },
    [matteFileForShot, matteCovered, runMatteBatch],
  );
  runMatteForShotRef.current = runMatteForShot;
  /** Toggle the selected shot's matte (per-segment, no auto-fill — only the enabled segment is computed; any source's segment works). */
  const toggleShotMatte = useCallback(
    (on: boolean) => {
      const sid = selectedShotIdRef.current;
      if (!sid) return;
      setComp((c) => ({ ...c, shots: (c.shots ?? []).map((s) => (s.id === sid ? { ...s, personMatte: on || undefined } : s)) }));
      if (on) {
        const s = compRef.current.shots?.find((x) => x.id === sid);
        if (s) void runMatteForShot(s);
      }
    },
    [runMatteForShot],
  );
  // Insert-source transcription (policy: captions on = every source should have captions; opening the smart-cut panel = the script must include all clips).
  // transcribeFile caches by fileSig, the two split halves of the same src share one; failures are blacklisted to avoid re-burning ASR
  const clipAsrBusyRef = useRef<Set<string>>(new Set());
  const clipAsrFailRef = useRef<Set<string>>(new Set());
  const captionsOn = isCaptionsOn(comp);
  useEffect(() => {
    if (floatWin !== 'script' && !captionsOn) return;
    for (const shot of (comp.shots ?? []).filter((s) => s.src)) {
      const src = shot.src!;
      if (clipAsrRef.current[src] || clipAsrBusyRef.current.has(src) || clipAsrFailRef.current.has(src)) continue;
      clipAsrBusyRef.current.add(src);
      void (async () => {
        try {
          const got = await matteFileForShot(shot); // same source-file location: local = clipFilesRef, remote fetched-and-cached on the fly
          if (!got) {
            clipAsrFailRef.current.add(src);
            return;
          }
          const segs = await studioProviders().transcriber.transcribe(got.file);
          setClipAsr((m) => ({ ...m, [src]: segs }));
          clipAsrRef.current = { ...clipAsrRef.current, [src]: segs }; // mirror immediately: the re-lay below needs to read it
          // Caption layer is on: lay this source's captions in right away (captions = a pure computed product of the transcript)
          if (segs.length && compRef.current.blocks.some(isSentenceCaption)) {
            setComp((c) => ({ ...c, blocks: relayCaptionLayer(c.blocks, ensureShots(c), asrRef.current) }));
          }
        } catch (e) {
          console.warn('[studio] clip transcribe failed', e);
          clipAsrFailRef.current.add(src); // don't retry this session, avoids hammering ASR
        } finally {
          clipAsrBusyRef.current.delete(src);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floatWin, captionsOn, comp.shots]);
  // Swap main video: the narration source's old track is void, in-progress budgeting cancelled (other sources' tracks persist under their own src keys)
  useEffect(() => {
    return () => {
      matteAbortRef.current?.abort();
      matteTrackRef.current.delete('main');
      setMatteState({ status: 'idle', done: 0, total: 0 });
    };
  }, [videoFile]);
  // Border quick colors: theme accent first, white/black fallback
  const borderSwatches: [string, string][] = (() => {
    const raw: [string, string][] = [];
    if (comp.palette?.accent) raw.push(['panels.themeAccent', comp.palette.accent]);
    raw.push(['panels.white', '#ffffff'], ['panels.black', '#101114']);
    const seen = new Set<string>();
    return raw.filter(([, v]) => !seen.has(v.toLowerCase()) && (seen.add(v.toLowerCase()), true));
  })();
  // Background quick colors: theme palette paper/panel first (same language as the frame), white/black fallback; dedup same colors.
  // Theme colors default to 90% opacity — components sit over the video, and a fully opaque base blots out the whole frame; for a solid color use white/black or custom.
  const glass = (hex: string) => (/^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}e6` : hex);
  const bgSwatches = (() => {
    const raw: [string, string][] = [];
    if (comp.palette?.paper) raw.push(['panels.themePaper', glass(comp.palette.paper)]);
    if (comp.palette?.panel) raw.push(['workbench.themePanel', glass(comp.palette.panel)]);
    raw.push(['panels.white', '#ffffff'], ['panels.black', '#101114']);
    const seen = new Set<string>();
    return raw.filter(([, v]) => !seen.has(v.toLowerCase()) && (seen.add(v.toLowerCase()), true));
  })();
  // Agent-facing context (roster / situation snapshot / transcript / draft backfill) — see use-agent-context.ts.
  const { chatElements, getChatBody, transcriptForAgent, ensureClipTranscripts, restoreDraftContext, beatsForWindow, graphicsRoster, neighborsFrom } = useAgentContext({
    comp, compRef, selectedIdRef, selectedShotIdRef, tRef, asrRef, planRef, visualRef, videoSigRef,
    videoFileRef, clipAsrRef, clipFilesRef, clipAsrBusyRef, clipAsrFailRef, insertedClipsForPlanRef,
    setClipAsr, matteFileForShot,
  });

  /** Client-side execution of a tool call: mutate Composition state / call compose to generate a block.
   *  Not memoized — StudioChat holds the latest reference via ref, rebuilt each frame to guarantee reading the latest state/closures. */
  // Agent tool dispatcher (chat + external MCP bridge) — see agent-tool-runner.ts. The ctx hands it the latest
  // refs/setters/handlers; rebuilding it every render is intentional (tool bodies read the latest state via refs).
  // Caption ops (style / line edits / preset re-lay / bilingual) — see use-captions-ops.ts. runTool goes through a
  // ref because the dispatcher ctx below needs the hook's outputs first (the tools only run from async handlers).
  const runToolRef = useRef<(toolId: string, input: Record<string, unknown>) => Promise<StudioToolResult>>(() => Promise.resolve({ ok: false, error: 'not ready' }));
  const { setCaptionStyle, mappedCaptionSegs, relayCaptionLayer, captionLineRows, captionsPanelProps, applyCaptionPreset, removeCaptionLayer } = useCaptionsOps({
    comp, tSec, asrSentences, clipAsr, setClipAsr, setAsrSentences, setSelectedIdRaw, setSelectedBlockIds,
    setPlaying, compRef, clipAsrRef, asrRef, videoFileRef, playingRef, tRef, setComp, ensureShots, stepAsr,
    ensureClipTranscripts, pushUndoSnapshot, postPreview, applyT,
    runTool: (toolId, input) => runToolRef.current(toolId, input),
  });
  /** Repair pass for transcripts cue-split at extraction (a short-lived scheme): merge cue segments
   *  back into sentences on load — display cues are DERIVED at lay time now (displayCues), the
   *  persisted transcript stays sentence-granular. Idempotent; then re-lay so blocks re-derive. */
  const migrateTranscriptCues = useCallback(() => {
    let changed = false;
    if (asrRef.current?.some((s) => s.cue)) {
      asrRef.current = desegmentCues(asrRef.current);
      setAsrSentences(asrRef.current);
      changed = true;
    }
    for (const [src, segs] of Object.entries(clipAsrRef.current)) {
      if (!segs.some((s) => s.cue)) continue;
      const m = { ...clipAsrRef.current, [src]: desegmentCues(segs) };
      clipAsrRef.current = m;
      setClipAsr(m);
      changed = true;
    }
    if (changed && compRef.current.blocks.some(isSentenceCaption)) {
      setComp((c) => ({ ...c, blocks: relayCaptionLayer(c.blocks, ensureShots(c), asrRef.current) }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Clip insertion (multi-source main track) — see use-clip-insert.ts. Same runTool ref indirection as captions.
  const { videoDurationOf, insertClipCore, recoverLocalClips, reconnectClip, insertLibraryClipAt, insertLocalClipAt, clipPending, clipStrips } = useClipInsert({
    comp, compRef, clipFilesRef, cloudMediaRef, asrRef, clipAsrRef, planRef, setPlan, setComp, setSelectedId,
    setSelectedShotId, applyT, pushUndoSnapshot, ensureShots, ensureClipTranscripts, relayCaptionLayer, pickFile,
    backupMediaToCloud, runTool: (toolId, input) => runToolRef.current(toolId, input),
  });
  // Element generation / block element ops (gen panel, floating toolbar) — see use-element-ops.ts.
  const { generateElementStandalone, insertGeneratedElement, bumpBlockLayer, togglePersonLayer, saveBlockAsElement, syncBlockContent, syncBusyId, mentionAsset } = useElementOps({
    playing, compRef, tRef, asrRef, elementTargetRef, chatRef, setComp, setSelectedId, setSelectedShotId,
    setPendingInsert, setGenRefreshTick, applyT, pushUndoSnapshot, ensureShots, mappedCaptionSegs,
    composeBlockChecked, insertKitBlock: insertTemplateBlock, openChat,
  });
  // Stage box-drag handlers (edge/corner/grip/rotate, ghost semantics) — see use-box-drag.ts.
  const { edgeDrag, scaleDrag, gripDrag, rotateDrag } = useBoxDrag({
    fit, compRef, genIdsRef, stageBoxRef, rotateOverlayRef, rotateLabelRef, dragCursorRef,
    setBodyDragging, setGhostRect, setGuideVis, setComp, postPreview, setBlockRotation,
  });
  // Script-panel scissors (cut/restore/replace-word/extract) — see use-script-cut.ts.
  const { cutSrcRanges, restoreSrcRanges, replaceScriptWord, extractForScript, asrBusy } = useScriptCut({
    comp, floatWin, asrSentences, compRef, tRef, asrRef, clipAsrRef, setClipAsr, setAsrSentences,
    setComp, setSelectedId, setSelectedShotId, applyT, pushUndoSnapshot, ensureShots, relayCaptionLayer, stepAsr,
  });
  const agentToolCtx: AgentToolCtx = {
    projectId,
    compRef, setComp, ensureShots, setSelectedId, setSelectedShotId, selectedIdRef, applyT, tRef, playStopAtRef,
    playingRef, setPlaying, seekBlockSettled, postPreview, pushUndoSnapshot, undoStackRef, redoStackRef, genIdsRef,
    markGenerating, videoFileRef, clipFilesRef, asrRef, setAsrSentences, clipAsrRef, setClipAsr, currentVideo,
    pickVideoFile, ensureClipTranscripts, transcriptForAgent, stepAsr, stepPlan, stepVisual, planRef, setPlan,
    visualRef, visualBriefRef, applyVisualResult, restoreDraftContext, insertedClipsForPlanRef, graphicsRoster,
    neighborsFrom, beatsForWindow, composeBlockChecked, noteOf, moveBlock, resizeBlock, setCutTransition,
    resizeCutTransition, setShotTreatment, setShotFilter, setShotAudio, splitAtPlayhead, trimAtPlayhead, deleteShot,
    audioMount: audioOps.mountAudioFile, audioPatch: audioOps.patchClip, audioRemove: audioOps.removeClip, setDenoise: denoiseOps.setDenoise,
    videoDurationOf, insertClipCore, setCaptionStyle, applyCaptionPreset, removeCaptionLayer, relayCaptionLayer,
    agentExportRef, exportPctRef, exportVideo, frameCatalogRef, chatRef,
  };
  const runStudioTool = (toolId: string, input: Record<string, unknown>) => runAgentStudioTool(agentToolCtx, toolId, input);
  runToolRef.current = runStudioTool; // break the hook↔dispatcher cycle (assigned every render before any handler can fire)
  const runExternalTool = (tool: string, input: Record<string, unknown>) => runAgentExternalTool(agentToolCtx, tool, input);

  // External agent bridge (Codex/Claude Code/any MCP client via /api/studio/mcp → StudioBridge DO → this tab):
  // the exact same execution surface as the internal chat + BYO-only operations; get_state returns the same situation snapshot as chat.
  const agentBridge = useAgentBridge({
    runTool: runExternalTool,
    projectId,
    // LIVE header names the project this tab edits: an agent that switch_project'd for offline work must not
    // assume the bridge follows — bridge tools always hit the OPEN tab. The id line lets it detect the mismatch.
    getState: () => `<composition_state>\nLIVE — the studio tab is open on project ${projectId}; bridge tools edit THIS project (switch_project only retargets OFFLINE mode).\n${buildSituation(getChatBody() as ChatSituation)}\n</composition_state>`,
    onDisplaced: () => {
      if (displacedRef.current) return;
      displacedRef.current = true;
      setDisplaced(true);
      // flush-on-evict: push the debounce tail with our still-valid baseVersion BEFORE going
      // read-only — serialized behind any in-flight save. A conflict here means the taker
      // already wrote; ours is the stale one, drop it (no rebase-retry for non-writers).
      const payload = buildCloudPayload();
      if (payload) {
        cloudSaveChainRef.current = cloudSaveChainRef.current.then(() => studioProviders().projects.save(projectId, payload).then(() => undefined, () => undefined));
      }
      toast.info(t('workbench.displacedByAnotherWindow'));
    },
    onExternalCall: (tool, result) => {
      if (tool === 'get_state' || tool === 'compose_context' || tool === 'plan_context') return; // pure queries don't interrupt
      const EXTERNAL_LABELS: Record<string, string> = { apply_block: 'workbench.externalBlockApply', submit_plan: 'workbench.externalPlan' };
      const label = t(STUDIO_TOOL_MAP[tool]?.label ?? EXTERNAL_LABELS[tool] ?? tool);
      if (result.ok) toast.info(result.summary ? t('workbench.externalAgentLabelSummary', { label, summary: result.summary }) : t('workbench.externalAgentLabel', { label }));
      else toast.error(t('workbench.externalAgentLabelFailed', { label, error: result.error ?? t('workbench.unknownError') }));
    },
  });
  bridgeReclaimRef.current = agentBridge.reclaim;

  /** Cloud-sync payload from the live refs (shared by the debounced autosave and flush-on-evict).
   *  Tri-state: full payload / chat-only (empty canvas but threads exist — the comp section is not
   *  sent, so a just-opened tab can never blank the cloud comp) / null (nothing worth saving). */
  function buildCloudPayload() {
    const c = compRef.current;
    if (!projectId) return null;
    const hasContent = c.blocks.length > 0 || (c.shots?.length ?? 0) > 0;
    // Boot-empty stays chat-only (never blank the cloud from a just-opened tab), but a canvas the
    // user EMPTIED this session (content seen earlier, edits removed it) must persist as empty —
    // otherwise a refresh resurrects the deleted sources from the last non-empty cloud comp.
    if (!hasContent && !everCanvasContentRef.current) {
      // Chat is independent of canvas content: a consultation-only session still syncs its threads
      // (chat-only payload — the comp section is NOT sent, so an empty canvas can never clobber a
      // cloud comp; the server seeds an empty comp on first insert). No threads either → nothing to save.
      const threads = readChatThreads(projectId);
      return threads.length ? { chat: threads, videoSig: null, videoDurationSec: null, coverThumb: null } : null;
    }
    const canDerive = (asrRef.current?.length ?? 0) > 0 || Object.keys(clipAsrRef.current).length > 0;
    return {
      comp: { ...stripDerivedCaptions(c, canDerive), video: null },
      chat: readChatThreads(projectId),
      context: {
        // Persistence boundary: runtime derivation markers (cue/ref/si) never land in storage
        ...(asrRef.current?.length ? { asr: sanitizeTranscriptSegs(asrRef.current) } : {}),
        ...(Object.keys(clipAsrRef.current).length ? { clipAsr: Object.fromEntries(Object.entries(clipAsrRef.current).map(([k, v]) => [k, sanitizeTranscriptSegs(v)])) } : {}),
        ...(planRef.current ? { plan: planRef.current } : {}),
        ...(cloudMediaRef.current.video || cloudMediaRef.current.clips ? { media: cloudMediaRef.current } : {}),
      },
      videoSig: videoFileRef.current ? (videoSigRef.current ?? fileSig(videoFileRef.current)) : null,
      videoDurationSec: c.video?.durationSec ?? null,
      coverThumb: coverThumbRef.current,
    };
  }

  // Selection change → close the background-color popover
  useEffect(() => {
    setBgOpen(false);
  }, [selectedId]);

  // Selection change → show a "current selection" pill in the input (removing the previous one).
  useEffect(() => {
    let el: StudioElementRef | null = null;
    const c = compRef.current;
    if (selectedId) {
      const b = c.blocks.find((x) => x.id === selectedId);
      if (b) el = { id: b.id, label: b.label?.slice(0, 16) || blockKind(b), kind: blockKind(b), isShot: false };
    } else if (selectedShotId) {
      const i = (c.shots ?? []).findIndex((s) => s.id === selectedShotId);
      if (i >= 0) el = { id: selectedShotId, label: t('workbench.shotN', { n: i + 1 }), kind: 'shot', isShot: true };
    }
    chatRef.current?.insertElementPill(el);
  }, [selectedId, selectedShotId]);

  /** When hover-preview jumps to v seconds, whether to hide the selected component's edit box: outside its time window = hide.
   *  Sentence-level captions are the exception — the handle is global, so keep it if any sentence-level caption is present at v. v=null (hover ended) = don't hide. */
  const selHiddenAt = (v: number | null): boolean => {
    if (v == null) return false;
    const c = compRef.current;
    const sb = selectedIdRef.current ? c.blocks.find((b) => b.id === selectedIdRef.current) : null;
    if (!sb) return false;
    if (isSentenceCaption(sb)) {
      return !c.blocks.some((b) => isSentenceCaption(b) && v >= b.startSec && v < b.startSec + b.durationSec);
    }
    return v < sb.startSec - 0.01 || v > sb.startSec + sb.durationSec + 0.01;
  };

  /** Whether the selected block is present at the **current frame moment**: if absent, don't draw the selection box/toolbar
   *  (the component is gone, pinning a border on an unrelated frame only misleads). Uses t while the playhead rests; hover-preview has its own scrubHideSel. */
  const selOnScreen = (b: Block): boolean => {
    if (isSentenceCaption(b)) return comp.blocks.some((x) => isSentenceCaption(x) && tSec >= x.startSec && tSec < x.startSec + x.durationSec);
    return tSec >= b.startSec - 0.01 && tSec < b.startSec + b.durationSec + 0.01;
  };

  // Callback props for memoized child components: stable identity, always calls the latest implementation internally (see use-stable-callbacks).
  // runStudioTool itself is rebuilt each frame (to read the latest state/closures); only the outer shell is stable.
  const chatCbs = useStableCallbacks({ runTool: runStudioTool });

  const timelineCbs = useStableCallbacks({
    onPps: setPps,
    onSeek: (v: number) => {
      if (playing) setPlaying(false);
      applyT(v);
    },
    onScrub: (v: number | null) => {
      if (playing) return; // don't interrupt during playback
      postPreview({ type: 'hf:seek', t: v == null ? tRef.current : v }); // hover preview: move only the player, not the playhead
      videoEngineRef.current?.seek(v == null ? tRef.current : v); // video frame follows (engine-side seek fetches the frame)
      // The selection border follows the frame: hide when hovering outside the selected component's time window (a same-value setState is skipped by React, no extra render)
      setScrubHideSel(selHiddenAt(v));
    },
    onSelect: (id: string | null) => {
      setSelectedId(id);
      setScrubHideSel(false);
      if (id) setSelectedShotId(null);
    },
    /** Component click. additive = ⌘/Ctrl multi-select (in/out of the set, don't move the playhead); single = focus one block. */
    onSelectBlock: (id: string, additive?: boolean) => {
      if (additive) {
        toggleBlockSelect(id);
        return;
      }
      setSelectedId(id);
      setScrubHideSel(false);
      setSelectedShotId(null);
    },
    onBoxSelectBlocks: selectBlocksBox,
    onSelectShot: selectShot,
    onBoxSelectShots: selectShotsBox,
    /** Scene-card drag reorder (like a mainstream editor): splice the clip sequence to a new position. Captions follow the narration,
     *  re-laid unconditionally; overlay component blocks stay at their original final-cut time and don't follow the clip (like a mainstream editor). */
    onReorderShot: (from: number, to: number) => {
      const shots = ensureShots(compRef.current);
      if (from === to || !shots[from]) return;
      pushUndoSnapshot();
      const next = shots.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      setComp((cur) => ({ ...cur, shots: next, blocks: relayCaptionLayer(cur.blocks, next, asrRef.current) }));
    },
    onDeselectAll: () => {
      setSelectedId(null);
      setSelectedShotIds(new Set());
      setSelectedShotIdRaw(null);
      setSelectedAudioId(null);
    },
    onOpenShotSettings: openShotSettings,
    onMoveBlock: moveBlock,
    onResizeBlock: resizeBlock,
    /** Move a block across tracks (drag the chip vertically to another component track): change trackIndex = change z (NLE convention);
     *  an emptied track disappears automatically (timeline track rows are derived from blocks, no row to render = collapse). */
    onMoveBlockTrack: (id: string, trackIndex: number) => {
      if (genLockToast(id)) return;
      pushUndoSnapshot();
      setComp((c) => ({ ...c, blocks: c.blocks.map((b) => (b.id === id ? { ...b, trackIndex } : b)) }));
    },
    /** Dragging a block into the gap between rows = fork a new track: insert a new track at the slot in top-to-bottom display
     *  order, re-index the whole z table (same as onReorderTracks: index from 2, z=1 always the sentence-caption layer). An emptied old track disappears. */
    onMoveBlockNewTrack: (id: string, slot: number) => {
      if (genLockToast(id)) return;
      const c = compRef.current;
      const order = [...new Set(c.blocks.filter((b) => b.trackIndex > 0 && !isSentenceCaption(b)).map((b) => b.trackIndex))].sort((a, b) => b - a);
      const NEW = -1; // sentinel: new-track placeholder
      order.splice(Math.max(0, Math.min(order.length, slot)), 0, NEW);
      const K = order.length;
      const z = new Map(order.map((tk, i) => [tk, K - i + 1]));
      pushUndoSnapshot();
      setComp((cur) => ({
        ...cur,
        blocks: cur.blocks.map((b) =>
          b.id === id
            ? { ...b, trackIndex: z.get(NEW)! }
            : b.trackIndex > 0 && !isSentenceCaption(b) && z.has(b.trackIndex)
              ? { ...b, trackIndex: z.get(b.trackIndex)! }
              : b,
        ),
      }));
    },
    onInsertClipAt: (t: number) => void insertLocalClipAt(t),
    onOpenTransition: openTransitionAt,
    onResizeTransition: resizeCutTransition,
    onDropAsset: (t: number) => {
      // Non-main-track drop: image = insert a PiP media block at the drop moment; component = insert at the drop moment (equal standing with images, user-unified);
      // video doesn't respond in these regions (the timeline side already intercepts it)
      const a = dragAsset;
      setDragAsset(null);
      if (a?.type === 'image') void insertPanelMedia(a, a.label, t);
      else if (a?.type === 'element') insertGeneratedElement(a.element, a.prompt, t);
    },
    onDropAssetClip: (t: number) => {
      // Main-track drop = insert a clip: video as a whole segment, image as a 5s still frame (per user); components aren't clip-ized (the timeline side already intercepts)
      const a = dragAsset;
      setDragAsset(null);
      if (a && a.type !== 'element' && a.type !== 'audio') void insertLibraryClipAt(a, t);
    },
    onDropAssetAudio: (t: number) => {
      // Audio drop (music lane / anywhere audio is allowed): mount as the bed starting at the drop time
      const a = dragAsset;
      setDragAsset(null);
      if (a?.type === 'audio') void audioOps.mountAudioFromUrl(a.url, a.label, { startSec: t, sig: a.sig });
    },
    // Direct-manipulation lane drags commit on every move and stay OUT of the undo stack —
    // same convention as element move/resize (a snapshot per pointer frame would flood it).
    onMoveAudio: (id: string, startSec: number) => audioOps.patchClip(id, { startSec }),
    onTrimAudio: (id: string, patch: { startSec?: number; inSec?: number; outSec?: number }) => audioOps.patchClip(id, patch),
    onFadeAudio: (id: string, edge: 'in' | 'out', sec: number) =>
      audioOps.patchClip(id, edge === 'in' ? { fadeInSec: sec } : { fadeOutSec: sec }),
    onSelectAudio: (id: string | null) => {
      setSelectedAudioId(id);
      if (id) {
        setSelectedId(null);
        setSelectedShotIds(new Set());
        setSelectedShotIdRaw(null);
      }
    },
    onOpenMusicPanel: () => openAudioTab(),
    /** Track mute: toggling preserves every item's level (that's what audioMuted/muted are for), so
     *  unmuting restores the mix instead of flattening it. One undo step for the whole track. */
    onToggleVideoMute: () => {
      const shots = compRef.current.shots ?? [];
      if (!shots.length) return;
      const next = !shots.every((s) => s.audioMuted);
      pushUndoSnapshot();
      setComp((c) => ({ ...c, shots: (c.shots ?? []).map((s) => patchShotAudio(s, { mute: next })) }));
    },
    onToggleAudioMute: () => {
      const clips = compRef.current.audioTracks ?? [];
      if (!clips.length) return;
      const next = !clips.every((x) => x.muted);
      pushUndoSnapshot();
      setComp((c) => ({ ...c, audioTracks: (c.audioTracks ?? []).map((x) => patchAudioClip(x, { muted: next })) }));
    },
    onReorderTracks: (topToBottom: number[]) => {
      // Timeline overlay tracks top-to-bottom = canvas z high-to-low (NLE convention): re-index z by the new display order.
      // Index from 2 (top row = K+1): z=1 always the sentence-caption layer (hidden on the timeline, not reordered)
      const K = topToBottom.length;
      const map = new Map(topToBottom.map((tk, i) => [tk, K - i + 1]));
      pushUndoSnapshot();
      setComp((c) => ({
        ...c,
        blocks: c.blocks.map((b) => (b.trackIndex > 0 && !isSentenceCaption(b) && map.has(b.trackIndex) ? { ...b, trackIndex: map.get(b.trackIndex)! } : b)),
      }));
    },
  });

  // Opening a project = auto-load (per user: no "restore/discard" bar, you come in to how it was last time).
  // Cloud-authoritative + local cache: use local first (offline/instant), fetch cloud concurrently; if cloud is newer (or
  // local is absent) adopt cloud — after caching locally, remount chat to re-read the session, then run the same restore flow.
  // OPFS local library hit → the main video auto-reconnects (via the existing pendingRestore check); inserted clips revive by srcSig.
  const applyDraft = useCallback((d: StudioDraft) => {
    pendingRestoreRef.current = d;
    // The main-source anchor only counts when the draft's comp actually REFERENCES a main source:
    // src-less shots, or an uncut whole-main comp (no shots but a recorded main duration). A stale
    // anchor on a clips-only/emptied comp must be ignored — honoring it would resurrect a deleted
    // main video at every boot (duplicate asset card, the 成片-720p case) and re-persist itself
    // forever via autosave. Ignored here = autosave rewrites videoSig:null = self-heals.
    const wantsMain = (d.comp.shots ?? []).some((s) => !s.src) || (!(d.comp.shots ?? []).length && d.videoDurationSec != null);
    // Keep the sig anchor even before (or without) the bytes: autosave reads videoSigRef, and
    // writing videoSig:null to the cloud row while the media is missing would destroy the
    // reconnect anchor — editing captions/blocks in the missing-media state must not do that.
    if (d.videoSig && wantsMain) videoSigRef.current = d.videoSig;
    setComp(() => ({ ...d.comp, video: null }));
    // Local-draft transcript hydration (fill gaps only — in-memory state is fresher): captions are
    // derived from the transcript, so a zero-backend/offline reopen needs it from the draft.
    const dc = d.context as { asr?: AsrSegment[]; clipAsr?: Record<string, AsrSegment[]> } | undefined;
    if (dc?.asr?.length && !asrRef.current?.length) {
      asrRef.current = dc.asr;
      setAsrSentences(dc.asr);
    }
    if (dc?.clipAsr && Object.keys(dc.clipAsr).length && !Object.keys(clipAsrRef.current).length) {
      clipAsrRef.current = dc.clipAsr;
      setClipAsr(dc.clipAsr);
    }
    if (d.videoSig && wantsMain) {
      void loadLocalVideo(d.videoSig).then(async (f) => {
        if (f && pendingRestoreRef.current === d) {
          void pickVideoFile(f, { asSig: d.videoSig! });
          return;
        }
        if (f) return;
        // Not in OPFS (device switch / cleared cache) → fetch from the cloud byte rendezvous; only a miss falls back to manual re-pick
        if (cloudMediaRef.current.video?.sig === d.videoSig) {
          toast.info(t('workbench.retrievingVideoFromCloud'));
          const cf = await studioProviders().vault.fetch(d.videoSig!);
          if (cf && pendingRestoreRef.current === d) {
            void pickVideoFile(cf, { asSig: d.videoSig! });
            return;
          }
        }
        // Bytes unavailable on this device (browser switch / cleared storage): nothing global to
        // flip — missing sources are per-asset now (panel restore card + timeline missing strip);
        // the sig anchor stays so reconnect/autosave keep working.
      });
    }
    void recoverLocalClips(d.comp.shots ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const autoRestoredRef = useRef(false);
  // The boot layer's data gate: released once auto-restore (cloud-first falling back to local) finishes —
  // video-byte reconnection (OPFS/cloud fetch) continues behind the gate, not counted as entry waiting
  const [bootDataReady, setBootDataReady] = useState(false);
  // CAPTIONS ARE DERIVED STATE: transcript × shots × captionStyle.on → display cues, materialized into
  // comp.blocks for every consumer (preview/timeline/selection/agent) but NEVER persisted — autosave
  // strips them; the transcript is the single stored source. This one reactive effect replaces the old
  // scattered manual re-lays: any transcript/cut/toggle change re-derives, so blocks can't go stale.
  useEffect(() => {
    if (!bootDataReady) return;
    const c = compRef.current;
    const on = isCaptionsOn(c);
    const cues = on ? displayCues(ensureShots(c), asrRef.current, clipAsrRef.current, { subLang: resolveCaptionStyle(c).sub?.lang, canvasW: c.width }) : [];
    // On with nothing derivable (no transcript, e.g. a legacy comp whose context never mirrored):
    // keep whatever exists — the persisted legacy blocks keep rendering, nothing is destroyed.
    if (on && !cues.length) return;
    const derived = captionBlocksFromAsr(cues);
    const sigOf = (bs: typeof derived) => JSON.stringify(bs.map((b) => [b.id, b.startSec, b.durationSec, b.slots.words, b.slots.sub, b.slots.ref]));
    if (sigOf(derived) === sigOf(c.blocks.filter(isSentenceCaption))) return;
    setComp((cur) => ({ ...cur, blocks: [...cur.blocks.filter((b) => !isSentenceCaption(b)), ...derived] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootDataReady, asrSentences, clipAsr, comp.shots, comp.captionStyle, comp.width, comp.height, comp.blocks]);
  useEffect(() => {
    if (autoRestoredRef.current) return;
    autoRestoredRef.current = true;
    setDraftOffer(null);
    // Edit-context hydration (device switch/refresh): transcript/media index/plan fetched back from the cloud, no re-burning ASR / re-planning.
    // Only fill gaps — this session's existing in-memory state is the fresher truth. Backfill even when the cloud arrives late after losing the race (see below):
    // this tab autosaving with empty asr / empty media index would progressively blank the cloud context.
    const hydrateContextRefs = (rc: StudioProjectDto['context'] | undefined) => {
      if (!rc) return;
      if (rc.media && !cloudMediaRef.current.video && !cloudMediaRef.current.clips) cloudMediaRef.current = rc.media;
      if (rc.asr?.length && !asrRef.current?.length) {
        asrRef.current = rc.asr;
        setAsrSentences(rc.asr);
      }
      if (rc.clipAsr && !Object.keys(clipAsrRef.current).length) clipAsrRef.current = rc.clipAsr;
      if (rc.plan && !planRef.current) {
        try {
          const p = parsePlan(JSON.stringify(rc.plan), rc.asr?.length ?? asrRef.current?.length ?? 0);
          if (p.scenes.length) {
            planRef.current = p;
            setPlan(p);
          }
        } catch {
          /* discard the bad plan, just re-plan */
        }
      }
    };
    // Cloud project → straight into the workbench: use the in-memory draft returned by cacheProjectLocally directly, not
    // read back from localStorage — if the quota is full the write silently fails and you read a stale old draft, which autosave then writes back to the cloud.
    const applyRemote = (remote: StudioProjectDto) => {
      setChatEpoch((v) => v + 1); // remount chat to re-read the cloud session
      applyDraft(cacheProjectLocally(remote));
    };
    void (async () => {
      const local = draftOffer;
      // Cloud-first but don't wait idly: with a local draft, if the cloud doesn't reply in 1.2s use local first (works
      // offline/on slow networks; the canvas isn't replaced mid-way). **Without a local draft** (device switch / a browser
      // freshly opened by agent handoff) the cloud is the only source — it must be awaited, with only a 15s guard against hanging; cutting to 1.2s would lose the entire project, data and video.
      const loadP = studioProviders().projects.load(projectId); // null = definitely absent (new project) or unavailable
      const remote = await Promise.race([
        loadP,
        new Promise<undefined>((res) => setTimeout(() => res(undefined), local ? 1200 : 15_000)),
      ]);
      if (remote) {
        setProjectVersion(projectId, remote.version);
        hydrateContextRefs(remote.context);
        // Judge newer/older by version number, not savedAt (local autosave self-refreshes savedAt on every open, so
        // comparing by it makes every browser think "I'm newest" — each keeps its own, writes stale state back to the cloud, never converges).
        // Cloud version ahead of the local draft's base = written elsewhere → cloud wins; equal = this browser is the last
        // writer, and the local draft may still hold changes not yet pushed within the 1s pre-close debounce window → local wins.
        const remoteNewer = !local || local.baseVersion == null || remote.version > local.baseVersion;
        if (remoteNewer) {
          applyRemote(remote);
          return;
        }
      }
      if (local) {
        // Opened offline / on cloud timeout: subsequent saves must carry the draft's base version so the server's 409 check has a basis
        // (the in-memory version table is empty on refresh, and a save without baseVersion unconditionally overwrites the cloud)
        if (remote === undefined && local.baseVersion != null) setProjectVersion(projectId, local.baseVersion);
        applyDraft(local); // local is newer / cloud unreachable → use local
      }
      // Both empty and it was a "timeout" (≠ definitely absent): the data is probably in the cloud, don't pretend it's a new empty project
      else if (remote === undefined) toast.error(t('workbench.cloudProjectLoadingSlowly'));
      // Losing the race ≠ giving up: after the cloud arrives late, ① backfill the hydrated reference data (prevent empty-state
      // write-back); ② if the canvas is still empty (the user did nothing) reconnect the whole thing — agent/device-switch scenarios auto-recover without a manual refresh
      if (remote === undefined) {
        void loadP.then((late) => {
          if (!late) return;
          setProjectVersion(projectId, late.version);
          hydrateContextRefs(late.context);
          const untouched = !compRef.current.blocks.length && !(compRef.current.shots?.length ?? 0);
          if (!local && untouched) {
            applyRemote(late);
            toast.success(t('workbench.cloudProjectReconnected'));
          }
          migrateTranscriptCues(); // late-arriving legacy transcript: migrate after it lands
        });
      }
    })().finally(() => {
      migrateTranscriptCues(); // comp is applied by now — canvas orientation decides the cue budget
      setBootDataReady(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Canvas had content this session" — buildCloudPayload uses it to tell boot-empty (chat-only,
  // never blank the cloud) from user-emptied (must persist the emptiness). Set by restore or edits.
  const everCanvasContentRef = useRef(false);
  useEffect(() => {
    if (comp.blocks.length > 0 || (comp.shots?.length ?? 0) > 0) everCanvasContentRef.current = true;
  }, [comp]);

  // Cloud sync (debounced): coalesce one PUT 1.2s after comp or the session changes. The cloud-authoritative write-back —
  // local useDraftAutosave still writes localStorage as a cache, the two are independent. Don't push on an empty canvas (don't blank the cloud).
  // The payload mirrors the edit context to the cloud: the offline MCP executor (when the tab is closed) relies on it for
  // read_script / cut_narration caption re-lay / set_captions / plan; only keys that exist in memory are reported —
  // missing keys are merged and kept by the server per key, not wiped (projects.$id). See buildCloudPayload.
  // Single-writer: a displaced tab (bridge close 4000) does not autosave at all, and never rebase-retries a 409 —
  // its in-memory state is by definition stale, and "retry until it lands" is exactly how a zombie tab clobbers the writer.
  useEffect(() => {
    // No content gate here: buildCloudPayload decides (full payload / chat-only / null) — chat syncs independently
    if (!projectId || displaced) return;
    const timer = window.setTimeout(() => {
      if (displacedRef.current) return; // demoted while this timer was armed (flush-on-evict already carried this batch)
      const payload = buildCloudPayload();
      if (!payload) return;
      cloudSaveChainRef.current = cloudSaveChainRef.current.then(async () => {
        const r = await studioProviders().projects.save(projectId, payload);
        if (r !== 'conflict') return;
        if (displacedRef.current) return; // read-only tabs drop conflicted batches instead of fighting
        // The 409 already refreshed baseVersion to the store's latest: resend this batch immediately to truly enforce "last write wins".
        // If we waited for the next edit to retry and the user wraps up now, this batch would be lost locally forever.
        void studioProviders().projects.save(projectId, payload);
        if (!conflictWarnedRef.current) {
          conflictWarnedRef.current = true;
          toast.info(t('workbench.projectAlsoEditedElsewhere'));
        }
      });
    }, 1200);
    return () => window.clearTimeout(timer);
    // asrSentences/clipAsr are also deps: changes that touch only the transcript, not comp (like translations (sub)), must sync too
  }, [comp, chatRev, videoFile, projectId, cloudMediaRev, asrSentences, clipAsr, displaced]);

  // flush-on-hide: switching away / minimizing pushes the debounce tail immediately (a closed-soon
  // tab loses it otherwise — the "fast tab close loses the last edit" hole). Writers only; the diff
  // layer already makes this zero requests when nothing changed.
  useEffect(() => {
    if (!projectId) return;
    const onHide = () => {
      if (document.visibilityState !== 'hidden' || displacedRef.current) return;
      const payload = buildCloudPayload();
      if (!payload) return;
      cloudSaveChainRef.current = cloudSaveChainRef.current.then(async () => {
        const r = await studioProviders().projects.save(projectId, payload).catch(() => 'skip' as const);
        if (r === 'conflict' && !displacedRef.current) void studioProviders().projects.save(projectId, payload);
      });
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  return (
    <div className="studio-scope relative flex h-full min-h-0 w-full gap-2">
      {/* Entry boot layer: heavy-resource warmup + project-data double gate, covers the whole workbench (incl. the chat bar), self-unmounts when done */}
      <StudioBootOverlay dataReady={bootDataReady} />
      {/* Agent file injection: a stable, always-mounted hidden input an external agent (e.g. Codex's
          in-app browser) targets with tab.playwright.setInputFiles('[data-pireel-video-input]', path).
          The browser reads the local file directly — no localhost server, no port. It flows through the
          normal pickVideoFile path (OPFS local library, NOT uploaded to the cloud). */}
      <input
        type="file"
        accept="video/*"
        data-pireel-video-input
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.currentTarget.value = ''; // allow re-injecting the same path
          if (f) void pickVideoFile(f);
        }}
      />
      {/* Left: chat area (large rounded card). Hidden entirely when closed (kept mounted to preserve the chat session), reopened via the top-right "chat" on the preview */}
      <div className={panelOpen ? 'flex min-h-0 shrink-0 gap-2' : 'hidden'}>
        {/* Panel width adjustable (drag the right edge, 320–760); the stage shrinks accordingly (area observer auto-recomputes fit) */}
        <div
          className="border-line bg-panel relative flex min-h-0 flex-col overflow-hidden rounded-lg border"
          style={{ width: panelW }}
        >
          <div
            onPointerDown={(e) => {
              e.preventDefault();
              try {
                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              } catch {
                /* fall back on buttons */
              }
              const sx = e.clientX;
              const w0 = panelW;
              let raf = 0;
              let last: PointerEvent | null = null;
              const flush = () => {
                raf = 0;
                if (last) setPanelW(Math.max(320, Math.min(760, w0 + (last.clientX - sx))));
              };
              const mv = (ev: PointerEvent) => {
                if (ev.buttons === 0) { up(); return; }
                last = ev;
                if (!raf) raf = requestAnimationFrame(flush);
              };
              const up = () => {
                if (raf) cancelAnimationFrame(raf);
                flush();
                window.removeEventListener('pointermove', mv);
                window.removeEventListener('pointerup', up);
                window.removeEventListener('pointercancel', up);
              };
              window.addEventListener('pointermove', mv);
              window.addEventListener('pointerup', up);
              window.addEventListener('pointercancel', up);
            }}
            title={t('workbench.dragResizePanel')}
            className="hover:bg-accent/40 absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize transition-colors"
          />
          {/* Chat is the only content of this area (hidden entirely when collapsed, session/streaming preserved) */}
          <div className="flex min-h-0 flex-1">
            <StudioChat
              key={chatEpoch}
              ref={chatRef}
              runTool={chatCbs.runTool}
              getBody={getChatBody}
              elements={chatElements}
              onFrameApplied={onFrameApplied}
              storageKey={chatKeyFor(projectId)}
              onThreadsChange={bumpChatRev}
              onClose={() => setPanelOpen(false)}
            />
          </div>
        </div>

      </div>
      <div className="border-line bg-panel flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border">
        {/* Video import goes through the preview upload / chat; the top bar no longer has buttons (the pipeline is fully tool-ized, chat-driven) */}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pickVideoFile(f);
            e.target.value = ''; // allow re-picking the same file
          }}
        />

        {/* Top half: preview | asset library (above the timeline). The asset library has a fixed column width, the stage adapts to remaining space (area observer recomputes fit).
            The preview must be min-w-0: flex's min-width:auto would lock it to the stage content width, and it gets squeezed and clipped when the rail collapses then expands */}
        <div className="flex min-h-0 min-w-0 flex-1">
        {/* Preview (= the editing surface: single-click selects a block, double-click edits text in place). No video → upload area.
            No overflow-hidden: the floating toolbar must follow a component past the stage edge without being clipped (frame clipping is on the inner stage layer) */}
        <div ref={previewAreaRef} className="bg-panel-2 relative flex min-h-0 min-w-0 flex-1 items-center justify-center p-3">
          {/* Canvas-ratio picker (bottom-right): the ratio is a project decision — seeded by the first
              inserted source, switchable here; sources contain-fit so switching never crops content. */}
          {hasVideoTrack && (
            <div className="absolute bottom-2 right-2 z-20" data-cap-keep>
              {ratioOpen && (
                <div className="border-line bg-panel absolute bottom-8 right-0 flex flex-col overflow-hidden rounded-md border shadow-lg">
                  {CANVAS_RATIOS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => applyCanvasRatio(r.w, r.h)}
                      className={`px-3 py-1.5 text-left text-[11.5px] transition ${
                        currentRatioId === r.id ? 'bg-panel-2 text-ink font-medium' : 'text-ink-3 hover:bg-panel-2 hover:text-ink'
                      }`}
                    >
                      {r.id}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => setRatioOpen((v) => !v)}
                title={t('workbench.canvasRatio')}
                className="border-line bg-panel/90 text-ink-2 hover:text-ink inline-flex h-[24px] items-center gap-1 rounded-md border px-2 text-[11px] backdrop-blur"
              >
                {currentRatioId ?? t('workbench.ratioCustom')}
              </button>
            </div>
          )}
          {/* Floating entries on the preview (outside the toolbar's TooltipProvider scope, use native title — Tooltip would crash):
              top-left = reopen chat (the chat area is on the left, returns to the same side; theme black primary button), top-right = expand assets.
              Icon-only (per user): no text floating over the frame — the label lives in title/aria. */}
          {!panelOpen && (
            <button
              type="button"
              onClick={openChat}
              title={t('workbench.openChat')}
              aria-label={t('workbench.openChat')}
              className="bg-ink text-bg absolute left-3 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-md shadow-sm hover:opacity-90"
            >
              <MessageSquare size={14} />
            </button>
          )}
          {libCollapsed && (
            <button
              type="button"
              onClick={() => setLibCollapsedManual(false)}
              title={t('workbench.expandAssetsBar')}
              aria-label={t('workbench.expandAssetsBar')}
              className="border-line bg-panel text-ink-3 hover:text-ink absolute right-3 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-md border shadow-sm"
            >
              <ChevronsLeft size={14} />
            </button>
          )}
          {!hasVideoTrack ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void pickVideoFile(f);
              }}
              className="border-line text-ink-3 hover:border-ink-3 hover:text-ink flex h-full max-h-[70vh] w-full max-w-md flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition"
            >
              {busyImport ? <Loader2 size={28} className="animate-spin" /> : <Upload size={28} />}
              <div className="text-[13px] font-medium">{busyImport ? t('workbench.reading') : t('workbench.uploadTalkingHeadVideo')}</div>
              <div className="text-ink-4 text-[11px]">{t('workbench.videoStaysLocalOnly')}</div>
            </button>
          ) : (
            <div ref={stageBoxRef} data-cap-keep className="relative" style={{ width: boxW, height: boxH }}>
              {/* Frame clipping layer: rounded corners / overflow clipping apply only to the iframe frame — floating overlays like the toolbar mount outside this layer,
                  so following a component off-bounds isn't clipped (per user: the toolbar purely follows, never clipped; component overflow is cut here) */}
              <div className="absolute inset-0 overflow-hidden shadow-xl ring-1 ring-black/20">
                {/* Double-buffered iframes: load in the background then swap, eliminating the reload white flash.
                    Trust boundary: LLM-generated block HTML/scripts run in a sandbox (opaque origin), can't reach the main app's DOM/localStorage/cookies;
                    local blob videos aren't readable → onBufLoad hands the File in to build its own URL; the control protocol is all postMessage. */}
                {([0, 1] as const).map((i) => (
                  <iframe
                    key={i}
                    ref={(el) => {
                      iframesRef.current[i] = el;
                    }}
                    title={`hyperframes-preview-${i}`}
                    srcDoc={bufs.docs[i]}
                    onLoad={() => onBufLoad(i)}
                    sandbox="allow-scripts"
                    // autoplay must be granted explicitly to any origin (*): the sandbox has no allow-same-origin → the doc
                    // is an opaque origin, and a bare "autoplay" (default src origin) won't match → in a never-clicked new doc,
                    // play() for a video with audio is silently rejected (the culprit behind "can't play" after a rebuild)
                    allow="autoplay *"
                    className={bufs.active === i ? '' : 'pointer-events-none'}
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: bufs.dims[i].w,
                      height: bufs.dims[i].h,
                      border: 0,
                      transform: `scale(${fit})`,
                      transformOrigin: 'top left',
                      // The background buffer is pushed to the bottom by z-order, not opacity:0 — Chromium render-throttles /
                      // media-suspends invisible cross-origin iframes, and a video loading in a hidden buffer enters a zombie
                      // state ("paused:false, ready:4, currentTime frozen") that doesn't wake even when brought to front (only rebuilding src saves it, see the watchdog).
                      // Pushed to the bottom = always rendering, just occluded by the same-size front iframe, so the decoder isn't suspended.
                      zIndex: bufs.active === i ? 2 : 1,
                    }}
                  />
                ))}
                {/* Missing sources are per-asset (panel restore card + timeline missing strip) — no full-stage mask. */}
              </div>
              {/* Insert landing skeleton: draw a dashed box + spinner where the component will appear, dissolves when the rebuild settles (more prominent than the top pill) */}
              {pendingInsert && rebuilding && (
                <div
                  className="pointer-events-none absolute z-10"
                  style={{ left: `${pendingInsert.x * 100}%`, top: `${pendingInsert.y * 100}%`, width: `${pendingInsert.w * 100}%`, height: `${pendingInsert.h * 100}%` }}
                >
                  <div className="border-accent/70 flex h-full w-full items-center justify-center rounded-md border-2 border-dashed bg-black/20">
                    <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white">
                      <Loader2 size={12} className="animate-spin" /> {t('common.inserting')}
                    </span>
                  </div>
                </div>
              )}
              {/* Full-doc rebuild indicator: for structural changes like insert / AI block landing / theme mount, gives feedback during background-buffer load + handshake */}
              {rebuilding && (
                <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2">
                  <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-[11px] text-white shadow">
                    <Loader2 size={12} className="animate-spin" /> {t('workbench.updatingCanvas')}
                  </span>
                </div>
              )}
              {/* Selected block has a box → frame-level drag/resize handles (a boxless full-canvas block is positioned by its internal layout, no handles).
                  Hidden during playback — the edit box follows selection, not time, so it looks like a band-aid pinned on the frame during play;
                  hover-preview jumping outside the component's time window (scrubHideSel) steps aside likewise. **Not unmounted** during drag (ghost semantics:
                  baseline solid line stays, dashed line follows; unmounting would also tear down pointer capture, once covered by the shield) */}
              {!playing && !scrubHideSel && (() => {
                const sb = selectedId ? comp.blocks.find((b) => b.id === selectedId) : null;
                if (!sb || !selOnScreen(sb)) return null;
                // Sentence-level captions (no box): give global position/scale handles — dragging comp.captionStyle moves all captions at once
                if (isSentenceCaption(sb)) {
                  const subSelected = capSelPart === 'sub' && typeof sb.slots.sub === 'string' && !!sb.slots.sub;
                  // Visual line counts (cue blocks stack lines at big font sizes): the selection box height
                  // is analytic — same splitter as the render, so it tracks font-size changes instantly.
                  const csSel = resolveCaptionStyle(comp);
                  const selWords = (sb.slots.words ?? []) as { text: string; start: number; end: number }[];
                  const mainLines = sb.slots.cue === true && selWords.length ? Math.max(1, captionLineSegments(selWords, getCaptionPreset(csSel.preset), csSel.wPct ?? 56, csSel.scale, comp.width).length) : 1;
                  const subStyleSel = (() => {
                    const base = resolveSubCaptionStyle(comp);
                    if (csSel.sub?.yPct != null) return base; // explicit anchor: bottom convention already
                    // Default follow-under-main: the derived bottom accounts for ONE line — push it down for extra lines
                    const subText0 = typeof sb.slots.sub === 'string' ? sb.slots.sub : '';
                    if (!subText0) return base;
                    const subP0 = getCaptionPreset(base.preset);
                    const n0 = Math.max(1, captionLineSegments(wordsFromText(subText0, 0, 1), subP0, base.wPct ?? 56, base.scale, comp.width).length);
                    if (n0 <= 1) return base;
                    const subFs0 = Math.max(9, Math.round(BASE_CAPTION_FONT_PX * base.scale));
                    const extra = (subFs0 * 1.35 + Math.round(subFs0 * 0.15)) * (n0 - 1);
                    return { ...base, yPct: Math.min(99, base.yPct + (extra / comp.height) * 100) };
                  })();
                  const subText = typeof sb.slots.sub === 'string' ? sb.slots.sub : '';
                  const subLines = subText ? Math.max(1, captionLineSegments(wordsFromText(subText, 0, 1), getCaptionPreset(subStyleSel.preset), subStyleSel.wPct ?? 56, subStyleSel.scale, comp.width).length) : 1;
                  return (
                    <>
                    {/* Selection sub-target: clicking the main line shows the main handles, the translation line shows the translation handles (two instances of the same component, never overlaid) */}
                    {subSelected && (
                      <CaptionEditOverlay
                        style={subStyleSel}
                        compH={comp.height}
                        stageW={boxW}
                        stageH={boxH}
                        measured={capSubMeasure}
                        lines={subLines}
                        metrics={{ line: 1.35, padY: 0.18, rowGap: 0.15 }}
                        onChange={(patch) => {
                          const keep = compRef.current.captionStyle?.sub ?? {};
                          setCaptionStyle({ sub: { ...keep, ...patch } });
                        }}
                        onLive={(v) => postPreview({ type: 'hf:capSubStyle', xPct: v.xPct ?? 50, yPct: v.yPct, ...(v.hPct ? { hPct: v.hPct } : {}) })}
                      />
                    )}
                    {!subSelected && (
                    <CaptionEditOverlay
                      style={resolveCaptionStyle(comp)}
                      compH={comp.height}
                      stageW={boxW}
                      stageH={boxH}
                      measured={capMeasure}
                      lines={mainLines}
                      onChange={setCaptionStyle}
                      onLive={(s) =>
                        // Send only position + box height (the surface min-height follows): the live channel has no font size. Including fontPx would make the iframe
                        // rewrite font-size for every word of every caption block each frame — hundreds of style writes + a full-doc reflow, dragging stutters into a slideshow
                        postPreview({ type: 'hf:capStyle', xPct: s.xPct ?? 50, yPct: s.yPct, ...(s.hPct ? { hPct: s.hPct } : {}) })
                      }
                    />
                    )}
                    </>
                  );
                }
                if (!sb.box) return null;
                if (genIds.has(sb.id)) {
                  // No handles while generating: box/time-window already snapshotted to the worker, a drag would be overwritten by the result using old data
                  return (
                    <div
                      className="pointer-events-none absolute z-10 flex items-center justify-center"
                      style={{ left: sb.box.x * boxW, top: sb.box.y * boxH, width: sb.box.w * boxW, height: sb.box.h * boxH }}
                    >
                      <span className="inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/90">
                        <Loader2 size={10} className="animate-spin" /> {t('workbench.generating')}
                      </span>
                    </div>
                  );
                }
                return (
                  <BoxEditOverlay
                    box={sb.box}
                    stageW={boxW}
                    stageH={boxH}
                    rotation={sb.rotation}
                    overlayRef={rotateOverlayRef}
                    labelRef={rotateLabelRef}
                    onMovePointerDown={(e) => gripDrag(e, sb.id)}
                    onEdgePointerDown={(e, side) => edgeDrag(e, sb, side)}
                    onScalePointerDown={(e, sgnX, sgnY) => scaleDrag(e, sb, sgnX, sgnY)}
                    onRotatePointerDown={(e) => rotateDrag(e, sb)}
                  />
                );
              })()}
              {/* Empty component block: in-block action overlay (AI generate / upload). Buttons can't go in the sandbox iframe,
                  the parent overlays them aligned to the box so they look like they're inside the block */}
              {!playing && !scrubHideSel && !bodyDragging && (() => {
                const eb = selectedId ? comp.blocks.find((b) => b.id === selectedId) : null;
                if (!eb?.box || !selOnScreen(eb) || genIds.has(eb.id) || blockKind(eb) !== 'media') return null;
                const s = eb.slots as { media?: { url?: string }; spec?: unknown };
                if (s.media?.url || typeof s.spec === 'string' || mediaBusy[eb.id]) return null; // no actions while uploading, the badge layer is playing loading
                return (
                  <div
                    className="pointer-events-none absolute z-40 flex items-center justify-center gap-2"
                    style={{ left: eb.box.x * boxW, top: eb.box.y * boxH, width: eb.box.w * boxW, height: eb.box.h * boxH }}
                  >
                    <button
                      type="button"
                      onClick={() => aiFillBlock(eb.id)}
                      className="bg-ink text-bg pointer-events-auto rounded-full px-3 py-1 text-[12px] font-medium shadow-lg"
                    >
                      {t('workbench.aiGenerate')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void uploadIntoBlock(eb.id)}
                      className="bg-panel text-ink border-line pointer-events-auto rounded-full border px-3 py-1 text-[12px] font-medium shadow-lg"
                    >
                      {t('panels.upload')}
                    </button>
                  </div>
                );
              })()}
              {/* Asset drop layer: covers the stage while dragging assets out of the upload panel (drop would be swallowed by the iframe doc, the parent must catch it);
                  hitting a component card = fill, a miss = create a new component card at the drop point */}
              {dragAsset && (
                <div
                  className="ring-accent/60 absolute inset-0 z-50 rounded-xl ring-2"
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleAssetDrop(e);
                  }}
                />
              )}
              {/* Floating toolbar (Notion-style, hovering just outside the selected block's border): drag handle · AI edit · edit source · background · delete.
                  Media blocks (uploaded image/video) show the toolbar with equal standing to generated components (per user), entry/exit animation still on the bottom bar;
                  a generating block already has a badge in its box, so no toolbar.
                  Not unmounted during drag — boxDrag displacement directly sets DOM translate to follow the component, so handles don't vanish from under the finger */}
              {!playing && !scrubHideSel && (() => {
                const mb = selectedId ? comp.blocks.find((b) => b.id === selectedId) : null;
                if (!mb || !selOnScreen(mb) || genIds.has(mb.id)) return null;
                if (isSentenceCaption(mb)) return null; // captions = a pure computed product: no source/delete semantics, no toolbar
                if (imgSel && imgSel.blockId === mb.id) return null; // the in-block image toolbar takes over (image-hugging render, see below)
                // Positioning via toolbarXY (same formula for drag-follow and render, identical numbers = zero jump):
                // the toolbar purely follows without clipping; the component itself may go off-bounds, cut by canvas overflow
                const p = toolbarXY(mb.box);
                // Media block (image/video) toolbar: swap media + entry/exit animation popover + delete —
                // no AI edit/source/background (those are layout-component semantics); an empty media slot's upload/AI-generate is in the in-block overlay
                if (blockKind(mb) === 'media') {
                  const m = mb.slots.media as MediaRef | undefined;
                  return (
                    <TooltipProvider delayDuration={200}>
                      <div
                        ref={toolbarRef}
                        className="border-line bg-panel absolute z-50 flex items-center gap-1 rounded-lg border px-1.5 py-1 shadow-lg"
                        style={{ left: p.left, top: p.top, transform: 'translateX(-50%)' }}
                      >
                        {mb.box && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onPointerDown={(e) => gripDrag(e, mb.id)}
                                aria-label={t('workbench.dragMove')}
                                className="text-ink-3 hover:text-ink cursor-move rounded p-1"
                              >
                                <GripVertical size={13} />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>{t('workbench.dragMove')}</TooltipContent>
                          </Tooltip>
                        )}
                        {m?.url && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => void replaceBlockMedia(mb.id)}
                                disabled={!!mediaBusy[mb.id]}
                                className="text-ink-3 hover:text-ink inline-flex items-center gap-1 rounded p-1 text-[11px] whitespace-nowrap disabled:opacity-40"
                              >
                                {mediaBusy[mb.id] ? <Loader2 size={13} className="animate-spin" /> : m.type === 'video' ? <FileVideo size={13} /> : <ImageIcon size={13} />}{' '}
                                {m.type === 'video' ? t('workbench.replaceVideo') : t('workbench.replaceImage')}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>{m.type === 'video' ? t('workbench.replaceVideoLabel') : t('workbench.replaceImageLabel')}</TooltipContent>
                          </Tooltip>
                        )}
                        {m?.url && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={(e) => (floatWin === 'anim' ? setFloatWin(null) : openFloatAt('anim', e.currentTarget.getBoundingClientRect()))}
                                className={`inline-flex items-center gap-1 rounded p-1 text-[11px] whitespace-nowrap ${floatWin === 'anim' ? 'text-ink bg-panel-2' : 'text-ink-3 hover:text-ink'}`}
                              >
                                <Wand2 size={13} /> {t('workbench.motion')}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>{t('workbench.enterExitMotion')}</TooltipContent>
                          </Tooltip>
                        )}
                        {mb.box && (
                      <CardShapeControls
                        block={mb}
                        onRadius={(v) => {
                          postPreview({ type: 'hf:radius', blockId: mb.id, px: v }); // live preview
                          setBlockRadius(mb.id, v); // commit to Block (debounced rebuild bakes it into HTML)
                        }}
                      />
                    )}
                        <div className="bg-line mx-0.5 h-4 w-px" />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" onClick={() => removeBlock(mb.id)} aria-label={t('tools.delete_block.label')} className="text-ink-3 rounded p-1 hover:text-destructive">
                              <Trash2 size={13} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>{t('tools.delete_block.label')}</TooltipContent>
                        </Tooltip>
                      </div>
                    </TooltipProvider>
                  );
                }
                return (
                  <TooltipProvider delayDuration={200}>
                  <div
                    ref={toolbarRef}
                    className="border-line bg-panel absolute z-50 flex items-center gap-1 rounded-lg border px-1.5 py-1 shadow-lg"
                    style={{ left: p.left, top: p.top, transform: 'translateX(-50%)' }}
                  >
                    {mb.box && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onPointerDown={(e) => gripDrag(e, mb.id)}
                            aria-label={t('workbench.dragMove')}
                            className="text-ink-3 hover:text-ink cursor-move rounded p-1"
                          >
                            <GripVertical size={13} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t('workbench.dragMove')}</TooltipContent>
                      </Tooltip>
                    )}
                    {/* AI edit: switch to chat (the selection pill is already attached in the input via the selection state) and focus the input to type directly.
                        Agent view: there is NO way to write into the host agent's input box, and opening Pireel's own chat would burn credits the user
                        meant to spend on their agent — so copy a ready-made block-reference prompt instead; the user pastes it into the agent chat. */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => {
                            if (agentView) {
                              // Minimal reference — the agent has the pireel skill and knows what to do with a blockId
                              const label = mb.label?.slice(0, 30) || blockKind(mb);
                              const cmd = `Pireel block ${mb.id} ("${label}"): `;
                              void navigator.clipboard.writeText(cmd).then(
                                () => toast.success(t('workbench.copiedPasteIntoAgent')),
                                () => toast.error(t('workbench.copyFailed')),
                              );
                              return;
                            }
                            openChat();
                            setTimeout(() => chatRef.current?.focusInput(), 0); // focus after the panel show/hide transition settles (a hidden component can't be focused)
                          }}
                          className="text-ink-3 hover:text-ink inline-flex items-center gap-1 rounded p-1 text-[11px] whitespace-nowrap"
                        >
                          <Sparkles size={13} /> {t('chatGen.aiEdit')}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{agentView ? t('workbench.copyBlockReferenceAgent') : t('workbench.tellChatHowChange')}</TooltipContent>
                    </Tooltip>
                    {/* Kit block: schema-generated props editor (the props ARE the block; edits re-render derived) */}
                    {mb.templateId.startsWith('kit:') && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => (floatWin === 'kitProps' ? setFloatWin(null) : openFloatAt('kitProps'))}
                            className={`inline-flex items-center gap-1 rounded p-1 text-[11px] whitespace-nowrap ${floatWin === 'kitProps' ? 'text-ink bg-panel-2' : 'text-ink-3 hover:text-ink'}`}
                          >
                            <SlidersHorizontal size={13} /> {t('workbench.kitProps')}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t('workbench.kitPropsTip')}</TooltipContent>
                      </Tooltip>
                    )}
                    {/* Sync content: one-click fill the data-edit text slots from the narration script in the block's time window (preset component = generic
                        placeholder, this step matches it to real content after dropping; hidden when the OSS shell has no syncFill capability) */}
                    {mb.templateId === 'custom' &&
                      typeof (mb.slots as { innerHtml?: unknown }).innerHtml === 'string' &&
                      ((mb.slots as { innerHtml: string }).innerHtml.includes('data-edit') || null) &&
                      !!studioProviders().syncFill && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => void syncBlockContent(mb)}
                              disabled={syncBusyId === mb.id}
                              className="text-ink-3 hover:text-ink inline-flex items-center gap-1 rounded p-1 text-[11px] whitespace-nowrap disabled:opacity-50"
                            >
                              {syncBusyId === mb.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} {t('workbench.syncContent')}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>{t('workbench.autoFillElementText')}</TooltipContent>
                        </Tooltip>
                      )}
                    {/* Save as component: a custom block edited on the canvas flows back to the asset library (the reverse channel of copy semantics —
                        library → canvas is a copy, here canvas → library is likewise a snapshot copy, later edits don't affect each other) */}
                    {mb.templateId === 'custom' && typeof (mb.slots as { innerHtml?: unknown }).innerHtml === 'string' && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => saveBlockAsElement(mb)}
                            aria-label={t('workbench.saveAsElement')}
                            className="text-ink-3 hover:text-ink inline-flex items-center rounded p-1"
                          >
                            <Save size={13} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t('workbench.saveAsElementKeep')}</TooltipContent>
                      </Tooltip>
                    )}
                    {/* Layer: move a block up/down one layer; when matte is on, also give a block-level "in front of / behind the person" override */}
                    {!isSentenceCaption(mb) && (
                      <>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" onClick={() => bumpBlockLayer(mb, 1)} aria-label={t('workbench.bringForward')} className="text-ink-3 hover:text-ink rounded p-1">
                              <ChevronUp size={13} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>{t('workbench.bringForwardCoversOverlapping')}</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" onClick={() => bumpBlockLayer(mb, -1)} aria-label={t('workbench.sendBackward')} className="text-ink-3 hover:text-ink rounded p-1" disabled={mb.trackIndex <= 1}>
                              <ChevronDown size={13} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>{t('workbench.sendBackward')}</TooltipContent>
                        </Tooltip>
                        {(comp.shots ?? []).some((sh) => sh.personMatte) && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => togglePersonLayer(mb)}
                                aria-label={t('workbench.portraitLayer')}
                                className={`rounded p-1 ${(mb.personLayer ? mb.personLayer === 'behind' : !!comp.personFx?.personFront) ? 'text-ink bg-panel-2' : 'text-ink-3 hover:text-ink'}`}
                              >
                                <BringToFront size={13} />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {(mb.personLayer ? mb.personLayer === 'behind' : !!comp.personFx?.personFront) ? t('workbench.elementSitsBehindPortrait') : t('workbench.elementSitsAbovePortrait')}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </>
                    )}
                    {hasVideoTrack && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={(e) => (floatWin === 'person' ? setFloatWin(null) : openFloatAt('person', e.currentTarget.getBoundingClientRect()))}
                            disabled={!selectedShotId}
                            aria-label={t('panels.smartCutout')}
                            className={`rounded p-1 disabled:opacity-40 ${(comp.shots ?? []).some((s) => s.personMatte) && comp.personFx?.personFront ? 'text-ink bg-panel-2' : 'text-ink-3 hover:text-ink'}`}
                          >
                            <SendToBack size={13} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t('workbench.personTopSmartCutout')}</TooltipContent>
                      </Tooltip>
                    )}
                    {/* Background / border / corners: block-level chrome for free-form elements.
                        Kit components carry these in their own props (each renders them in its own
                        design language), so the generic control would be a second, conflicting one. */}
                    {!isSentenceCaption(mb) && !mb.templateId.startsWith('kit:') && (
                      <span className="relative inline-flex">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => setBgOpen((o) => !o)}
                              aria-label={t('workbench.elementBackground')}
                              className={`rounded p-1 ${bgOpen ? 'text-ink bg-panel-2' : 'text-ink-3 hover:text-ink'}`}
                            >
                              <Palette size={13} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>{t('workbench.backgroundBorder')}</TooltipContent>
                        </Tooltip>
                        {bgOpen && (
                          <div className="border-line bg-panel absolute left-1/2 top-full z-50 mt-1.5 flex -translate-x-1/2 flex-col gap-2 rounded-lg border px-2.5 py-2 shadow-xl">
                            {/* Background */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-ink-4 w-9 shrink-0 text-[10px]">{t('workbench.background')}</span>
                              <button
                                type="button"
                                onClick={() => setBlockBg(mb.id, undefined)}
                                title={t('workbench.noBackgroundTransparentOver')}
                                aria-label={t('workbench.noBackground')}
                                className={`h-5 w-5 shrink-0 rounded-full border bg-[linear-gradient(135deg,transparent_44%,#f43f5e_44%,#f43f5e_56%,transparent_56%)] ${!mb.bg ? 'border-accent ring-1 ring-accent' : 'border-line'}`}
                              />
                              {bgSwatches.map(([name, colorVal]) => (
                                <button
                                  key={name}
                                  type="button"
                                  onClick={() => setBlockBg(mb.id, colorVal)}
                                  title={t('panels.backgroundName', { name: t(name) })}
                                  aria-label={t('panels.backgroundName', { name: t(name) })}
                                  className={`h-5 w-5 shrink-0 rounded-full border ${mb.bg === colorVal ? 'border-accent ring-1 ring-accent' : 'border-line'}`}
                                  style={{ background: colorVal }}
                                />
                              ))}
                              <label
                                title={t('panels.customBackgroundColor')}
                                className="border-line relative h-5 w-5 shrink-0 cursor-pointer overflow-hidden rounded-full border"
                                style={{ background: 'conic-gradient(#f43f5e,#f59e0b,#84cc16,#06b6d4,#6366f1,#d946ef,#f43f5e)' }}
                              >
                                <input
                                  type="color"
                                  value={/^#[0-9a-fA-F]{6}/.test(mb.bg ?? '') ? mb.bg!.slice(0, 7) : '#ffffff'}
                                  onChange={(e) => setBlockBg(mb.id, e.target.value)}
                                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                  aria-label={t('panels.customBackgroundColor')}
                                />
                              </label>
                            </div>
                            {/* Border */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-ink-4 w-9 shrink-0 text-[10px]">{t('workbench.border')}</span>
                              <button
                                type="button"
                                onClick={() => setBlockBorder(mb.id, undefined)}
                                title={t('workbench.noBorder')}
                                aria-label={t('workbench.noBorder')}
                                className={`h-5 w-5 shrink-0 rounded-full border bg-[linear-gradient(135deg,transparent_44%,#f43f5e_44%,#f43f5e_56%,transparent_56%)] ${!mb.border ? 'border-accent ring-1 ring-accent' : 'border-line'}`}
                              />
                              {borderSwatches.map(([name, colorVal]) => (
                                <button
                                  key={name}
                                  type="button"
                                  onClick={() => setBlockBorder(mb.id, colorVal)}
                                  title={t('workbench.borderName', { name: t(name) })}
                                  aria-label={t('workbench.borderName', { name: t(name) })}
                                  className={`relative h-5 w-5 shrink-0 rounded-full border ${mb.border === colorVal ? 'border-accent ring-1 ring-accent' : 'border-line'}`}
                                >
                                  <span className="absolute inset-[3px] rounded-full border-2" style={{ borderColor: colorVal }} />
                                </button>
                              ))}
                              <label
                                title={t('workbench.customBorderColor')}
                                className="border-line relative h-5 w-5 shrink-0 cursor-pointer overflow-hidden rounded-full border"
                                style={{ background: 'conic-gradient(#f43f5e,#f59e0b,#84cc16,#06b6d4,#6366f1,#d946ef,#f43f5e)' }}
                              >
                                <input
                                  type="color"
                                  value={/^#[0-9a-fA-F]{6}$/.test(mb.border ?? '') ? mb.border! : '#ffffff'}
                                  onChange={(e) => setBlockBorder(mb.id, e.target.value)}
                                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                  aria-label={t('workbench.customBorderColor')}
                                />
                              </label>
                            </div>
                            {/* Opacity */}
                            <div className="flex items-center gap-1.5">
                              <span className="text-ink-4 w-9 shrink-0 text-[10px]">{t('panels.opacity')}</span>
                              <input
                                type="range"
                                min={10}
                                max={100}
                                step={5}
                                value={Math.round((mb.opacity ?? 1) * 100)}
                                onChange={(e) => setBlockOpacity(mb.id, Number(e.target.value) / 100)}
                                className="zoom-range w-28"
                                aria-label={t('workbench.elementOpacity')}
                              />
                              <span className="text-ink-3 w-8 shrink-0 text-right font-mono text-[10px] tabular-nums">{Math.round((mb.opacity ?? 1) * 100)}%</span>
                            </div>
                          </div>
                        )}
                      </span>
                    )}
                    {mb.box && (
                      <CardShapeControls
                        block={mb}
                        onRadius={(v) => {
                          postPreview({ type: 'hf:radius', blockId: mb.id, px: v }); // live preview
                          setBlockRadius(mb.id, v); // commit to Block (debounced rebuild bakes it into HTML)
                        }}
                      />
                    )}
                    <div className="bg-line mx-0.5 h-4 w-px" />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button type="button" onClick={() => removeBlock(mb.id)} aria-label={t('workbench.deleteElement')} className="text-ink-3 rounded p-1 hover:text-destructive">
                          <Trash2 size={13} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>{t('workbench.deleteElement')}</TooltipContent>
                    </Tooltip>
                  </div>
                  </TooltipProvider>
                );
              })()}
              {/* Image slot toolbar (contract B): clicking an <img> inside a custom block → an image-specific bar hugging the image rect (swap/delete),
                  zero-LLM and instant. The selection ring is drawn by the parent (doesn't depend on iframe attributes, survives doc rebuilds); dismissed on block drag / selection change */}
              {!playing && !scrubHideSel && !bodyDragging && imgSel && imgSel.blockId === selectedId && !genIds.has(imgSel.blockId) && (() => {
                const r = imgSel.rect;
                const p = toolbarXY(r);
                return (
                  <TooltipProvider delayDuration={200}>
                    <div
                      className="border-accent/80 pointer-events-none absolute z-30 rounded border-2"
                      style={{ left: r.x * boxW, top: r.y * boxH, width: r.w * boxW, height: r.h * boxH }}
                    />
                    <div
                      className="border-line bg-panel absolute z-50 flex items-center gap-1 rounded-lg border px-1.5 py-1 shadow-lg"
                      style={{ left: p.left, top: p.top, transform: 'translateX(-50%)' }}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => void replaceCustomImg(imgSel.blockId, imgSel.index)}
                            disabled={!!mediaBusy[imgSel.blockId]}
                            className="text-ink-3 hover:text-ink inline-flex items-center gap-1 rounded p-1 text-[11px] whitespace-nowrap disabled:opacity-40"
                          >
                            {mediaBusy[imgSel.blockId] ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />} {t('workbench.replaceImage')}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t('workbench.replaceThisImage')}</TooltipContent>
                      </Tooltip>
                      <div className="bg-line mx-0.5 h-4 w-px" />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => {
                              patchCustomImg(imgSel.blockId, imgSel.index, () => 'remove');
                              setImgSel(null);
                            }}
                            aria-label={t('workbench.deleteImage')}
                            className="text-ink-3 rounded p-1 hover:text-destructive"
                          >
                            <Trash2 size={13} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>{t('workbench.deleteThisImage')}</TooltipContent>
                      </Tooltip>
                    </div>
                  </TooltipProvider>
                );
              })()}
              {/* Media loading badge: uploading (file in transit) / loading (awaiting rebuild + CDN load to debut) —
                  same style as "generating"; a boxless block (full-canvas custom) falls back to centering on the whole canvas */}
              {Object.keys(mediaBusy).length > 0 && (
                <div className="pointer-events-none absolute inset-0 z-30">
                  {comp.blocks
                    .filter((b) => mediaBusy[b.id])
                    .map((b) => (
                      <div
                        key={b.id}
                        className="absolute flex items-center justify-center"
                        style={
                          b.box
                            ? { left: b.box.x * boxW, top: b.box.y * boxH, width: b.box.w * boxW, height: b.box.h * boxH }
                            : { inset: 0 }
                        }
                      >
                        <span className="inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/90">
                          <Loader2 size={10} className="animate-spin" /> {mediaBusy[b.id] === 'upload' ? t('workbench.uploading') : t('workbench.loading')}
                        </span>
                      </div>
                    ))}
                </div>
              )}
              {/* Parent-side handle-drag shield: pressing an edge/corner handle unmounts the overlay, so pointer capture is lost when the component is removed,
                  and subsequent events as the pointer slides over the iframe are swallowed by the iframe doc (window gets no move/up, the drag freezes) —
                  a full-screen transparent shield keeps events in the parent doc. Body/grip drag doesn't mount it (the capture component is resident, see dragCursorRef='') */}
              {bodyDragging && dragCursorRef.current !== '' && (
                <div className="fixed inset-0 z-40" style={{ cursor: dragCursorRef.current }} />
              )}
              {/* Body-drag center snap guides: resident nodes, toggled via setGuideVis directly on display during drag (zero React work) */}
              <div className="pointer-events-none absolute inset-0 z-20">
                {/* Drag ghost dashed box (like caption-handle semantics): the baseline solid line stays, this dashed line follows the pointer, applied once on release */}
                <div ref={ghostRef} className="border-accent pointer-events-none absolute rounded-md border-2 border-dashed" style={{ display: 'none' }} />
                <div ref={guideVRef} className="bg-accent/80 absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2" style={{ display: 'none', boxShadow: '0 0 4px rgba(63,75,232,0.5)' }} />
                <div ref={guideHRef} className="bg-accent/80 absolute left-0 right-0 top-1/2 h-px -translate-y-1/2" style={{ display: 'none', boxShadow: '0 0 4px rgba(63,75,232,0.5)' }} />
              </div>
              {/* Debug overlay: face (red) / subject (blue dashed) / safe zone (green). Normalized coords → % align directly with the canvas */}
              {dbgGeom && (
                <div className="pointer-events-none absolute inset-0 z-20">
                  <div className="absolute left-1 top-1 rounded bg-black/75 px-1.5 py-0.5 text-[9px] leading-tight text-emerald-600">{t('workbench.geometryPass')}{geomNote()}</div>
                  {dbgGeom.rects.map((r, i) => (
                    <div key={`safe${i}`} className="absolute border-2 border-emerald-400" style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}>
                      <span className="absolute left-0 top-0 bg-emerald-400 px-1 text-[9px] font-bold leading-tight text-black">{t('workbench.safe')}{i + 1}</span>
                    </div>
                  ))}
                  {dbgGeom.subject && (
                    <div className="absolute border border-dashed border-sky-400" style={{ left: `${dbgGeom.subject.x * 100}%`, top: `${dbgGeom.subject.y * 100}%`, width: `${dbgGeom.subject.w * 100}%`, height: `${dbgGeom.subject.h * 100}%` }}>
                      <span className="absolute right-0 top-0 bg-sky-400 px-1 text-[9px] font-bold leading-tight text-black">{t('workbench.subject')}</span>
                    </div>
                  )}
                  {dbgGeom.face && (
                    <div className="absolute border-2 border-red-500" style={{ left: `${dbgGeom.face.x * 100}%`, top: `${dbgGeom.face.y * 100}%`, width: `${dbgGeom.face.w * 100}%`, height: `${dbgGeom.face.h * 100}%` }}>
                      <span className="absolute bottom-0 left-0 bg-red-500 px-1 text-[9px] font-bold leading-tight text-white">{t('workbench.face')}</span>
                    </div>
                  )}
                  {visual?.textBands?.map((r, i) => (
                    <div key={`text${i}`} className="absolute border-2 border-orange-400 bg-orange-400/15" style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}>
                      <span className="absolute right-0 top-0 bg-orange-400 px-1 text-[9px] font-bold leading-tight text-black">{t('workbench.captionBandReserved')}</span>
                    </div>
                  ))}
                  <div className="absolute bottom-1 left-1 rounded bg-black/75 px-1.5 py-0.5 text-[9px] leading-tight text-white">
                    {liveGeom ? 'live frame' : 'segment agg'} · t={tSec.toFixed(1)}s{geomSeg ? ` · ${geomSeg.label.content}·person ${geomSeg.label.person}·safe ${geomSeg.label.safe}` : ''}{dbgGeom.face ? '' : ' · no face'}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Library rail: content column + a vertical primary-nav strip on the outer edge
            (assets / script-cut / captions / audio / avatar). railW = CONTENT width; the nav strip
            adds RAIL_NAV_W on top so the asset grid's whole-column math stays intact.
            Collapsible to free up the frame: the whole column stays mounted as hidden (preserving filters/scroll/generation polling), the expand button floats top-right on the preview.
            When a tool panel (floatWin) is open it **docks and takes the whole content column** (per user: not a new tab):
            a panel title header appears, the asset list is hidden but keeps state; the nav strip stays visible and
            clicking any nav item closes the panel and returns to that tab. */}
        <div
          className={`border-line flex shrink-0 flex-col border-l ${libCollapsed ? 'hidden' : ''} ${railPinned ? 'relative' : 'bg-bg absolute inset-y-0 right-0 z-40 shadow-2xl'}`}
          style={libCollapsed ? undefined : { width: railW + RAIL_NAV_W }}
        >
          {/* Drag the left edge to resize (260–786 = up to six 120px card columns flush, persisted) */}
          <div
            onPointerDown={(e) => {
              e.preventDefault();
              const sx = e.clientX;
              const w0 = railW;
              let raf = 0;
              let last: PointerEvent | null = null;
              const flush = () => {
                raf = 0;
                if (last) setRailW(Math.max(260, Math.min(786, w0 + (sx - last.clientX))));
              };
              const mv = (ev: PointerEvent) => {
                if (ev.buttons === 0) {
                  up();
                  return;
                }
                last = ev;
                if (!raf) raf = requestAnimationFrame(flush);
              };
              const up = () => {
                if (raf) cancelAnimationFrame(raf);
                flush();
                window.removeEventListener('pointermove', mv);
                window.removeEventListener('pointerup', up);
                window.removeEventListener('pointercancel', up);
              };
              window.addEventListener('pointermove', mv);
              window.addEventListener('pointerup', up);
              window.addEventListener('pointercancel', up);
            }}
            title={t('workbench.dragResizePanel')}
            className="hover:bg-accent/40 absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize transition-colors"
          />
          <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {floatWin ? (
            <div className="border-line flex items-center gap-1 border-b px-2 py-1.5">
              {floatWin === 'gen' ? (
                (
                  [
                    { v: 'image', label: 'panels.image' },
                    { v: 'video', label: 'panels.video' },
                    { v: 'element', label: 'panels.element' },
                    { v: 'audio', label: 'panels.music' },
                  ] as { v: GenType; label: string }[]
                ).map((gt) => (
                  <button
                    key={gt.v}
                    type="button"
                    onClick={() => setGenType(gt.v)}
                    className={`rounded-md px-2.5 py-1 text-[12px] transition ${
                      genType === gt.v ? 'bg-panel-2 text-ink font-medium' : 'text-ink-4 hover:text-ink-2'
                    }`}
                  >
                    {t(gt.label)}
                  </button>
                ))
              ) : (
                <span className="text-ink truncate px-1 text-[12px] font-medium">
                  {floatWin === 'script'
                    ? t('workbench.smartScriptCut')
                    : floatWin === 'kitProps'
                    ? t('workbench.kitProps')
                    : floatWin === 'person'
                      ? t('workbench.portrait')
                      : floatWin === 'anim'
                        ? t('workbench.assetMotion')
                        : floatWin === 'captions'
                          ? t('panels.captions')
                            : floatWin === 'shot'
                            ? (() => {
                                const i = (comp.shots ?? []).findIndex((s) => s.id === selectedShotId);
                                return t('workbench.cameraFraming') + (i >= 0 ? t('workbench.sceneN', { n: i + 1 }) : '');
                              })()
                            : floatWin === 'transition'
                              ? (() => {
                                  const i = transitionCut == null ? -1 : clipSpans(comp.shots ?? []).findIndex((sp) => Math.abs(sp.editedEnd - transitionCut) < 0.05);
                                  return t('tools.add_transition.label') + (i >= 0 ? t('workbench.betweenScenes', { a: i + 1, b: i + 2 }) : '');
                                })()
                              : (() => {
                                  const cb = codeBlockId ? comp.blocks.find((x) => x.id === codeBlockId) : null;
                                  return t('workbench.sourceLabel', { label: cb?.label || codeBlockId || '' });
                                })()}
                </span>
              )}
              <button
                type="button"
                onClick={() => setFloatWin(null)}
                title={t('workbench.close')}
                aria-label={t('workbench.closePanel')}
                className="text-ink-4 hover:text-ink ml-auto rounded p-1"
              >
                <X size={14} />
              </button>
            </div>
          ) : null}
          {/* Assets stay mounted (hidden when switched away / covered by a panel, preserving polling/scroll position); themes mount on demand (don't run the cover wall in the background) */}
          <div className={!floatWin && libTab === 'assets' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
            <AssetsPanel
              comp={comp}
              projectId={projectId}
              videoSig={videoSigRef.current ?? (videoFile ? fileSig(videoFile) : null)}
              onDeleteAsset={deleteAssetSource}
              isSrcLive={srcLive}
              onReconnectSource={(src, sig) => void reconnectSource(src, sig)}
              onInsert={(m, l, d) => void insertPanelMedia(m, l, undefined, d)}
              onInsertClip={(a) => void insertLibraryClipAt(a, tRef.current)}
              onInsertElement={insertGeneratedElement}
              onInsertKit={(cid, props) => insertTemplateBlock(`kit:${cid}`, props)}
              onDragAsset={setDragAsset}
              onUseAudio={(url, label, sig) => void audioOps.mountAudioFromUrl(url, label, { sig }).then((id) => id && setSelectedAudioId(id))}
              onOpenGen={(t, anchor) => {
                setGenType(t);
                openFloatAt('gen', anchor);
              }}
              genRefreshTick={genRefreshTick}
            />
          </div>
          {!floatWin && libTab === 'frames' && (
            <div className="flex min-h-0 flex-1">
              <FramePanel comp={comp} onUse={useFrameInChat} />
            </div>
          )}
          {/* 剪口播 / 字幕 docked as library tabs (siblings of 素材). The same panels also open
              floating from the caption-selected shortcuts / style popover — one component, two mounts;
              floatWin covers the rail, so only one is ever visible. */}
          {!floatWin && libTab === 'script' && (
            <div className="flex min-h-0 flex-1 flex-col">
              <ScriptPanel
                sentences={asrSentences}
                clipSentences={clipAsr}
                shots={ensureShots(comp)}
                videoDurationSec={comp.video?.durationSec ?? 0}
                extracting={asrBusy}
                onExtract={() => void extractForScript()}
                onSeek={(sec) => {
                  applyT(Math.max(0, sec));
                  locateTimeline(true); // clicking a word in the script also brings that moment into view on the timeline
                }}
                onCut={cutSrcRanges}
                onRestore={restoreSrcRanges}
                onReplaceWord={replaceScriptWord}
              />
            </div>
          )}
          {!floatWin && libTab === 'audio' && (
            <MusicPanel
              clips={comp.audioTracks ?? []}
              selectedId={selectedAudioId}
              usable={audioOps.clipUsable}
              onPatch={audioOps.patchClip}
              soloId={audioOps.soloId}
              onSolo={audioOps.setSoloId}
              peakOf={(c) => (c.sig ? (audioOps.clipPeaks.get(c.sig) ?? null) : null)}
              shots={(comp.shots ?? []).filter((sh) => selectedShotIds.has(sh.id))}
              onSetShotAudio={(patch: { volumeDb?: number; fadeInSec?: number; fadeOutSec?: number }) => {
                // Multi-select takes the edit as one action: every selected shot, one undo step
                const ids = (comp.shots ?? []).filter((sh) => selectedShotIds.has(sh.id)).map((sh) => sh.id);
                if (!ids.length) return;
                pushUndoSnapshot();
                for (const id of ids) setShotAudio(id, patch);
              }}
              denoise={{ strength: comp.audioDenoise?.strength ?? null, status: denoiseOps.status, progress: denoiseOps.progress }}
              onSetDenoise={denoiseOps.setDenoise}
            />
          )}
          {!floatWin && libTab === 'captions' && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div data-cap-keep className="contents"><CaptionsPanel {...captionsPanelProps()} /></div>
            </div>
          )}
          {!floatWin && libTab === 'avatar' && <AvatarPanel />}
          {floatWin && (
            <div className="flex min-h-0 flex-1">
              {floatWin === 'gen' && (
                <GenChatPanel
                  key={genType}
                  type={genType}
                  comp={comp}
                  onInsertMedia={(m, l, d) => void insertPanelMedia(m, l, undefined, d)}
                  onSetMainVideo={setMainVideoFromUrl}
                  onInsertElement={insertGeneratedElement}
                  onMention={mentionAsset}
                  generateElement={generateElementStandalone}
                  onInsertTemplate={insertTemplateBlock}
                  generateAudio={audioOps.generateAudioAsset}
                  onInsertAudio={(url, label) => void audioOps.mountAudioFromUrl(url, label).then((id) => id && setSelectedAudioId(id))}
                />
              )}
              {floatWin === 'script' && (
                <ScriptPanel
                  sentences={asrSentences}
                  clipSentences={clipAsr}
                  shots={ensureShots(comp)}
                  videoDurationSec={comp.video?.durationSec ?? 0}
                  extracting={asrBusy}
                  onExtract={() => void extractForScript()}
                  onSeek={(sec) => {
                  applyT(Math.max(0, sec));
                  locateTimeline(true); // clicking a word in the script also brings that moment into view on the timeline
                }}
                  onCut={cutSrcRanges}
                  onRestore={restoreSrcRanges}
                  onReplaceWord={replaceScriptWord}
                />
              )}
              {floatWin === 'code' &&
                (() => {
                  const cb = codeBlockId ? comp.blocks.find((x) => x.id === codeBlockId) : null;
                  return cb ? (
                    <ElementSourceEditor
                      key={cb.id}
                      block={cb}
                      locked={genIds.has(cb.id)}
                      loop={codeLoop}
                      onLoop={toggleCodeLoop}
                      onDraft={(draft) => handleCodeDraft(cb.id, draft)}
                      onApply={(draft) => handleCodeApply(cb.id, draft)}
                      runAi={(instruction, draft, onNote) => runCodeAi(cb, instruction, draft, onNote)}
                    />
                  ) : (
                    <div className="text-ink-4 flex flex-1 items-center justify-center gap-2 text-[12px]">
                      {t('workbench.elementDeleted')}
                      <button type="button" onClick={() => setFloatWin(null)} className="text-ink underline">
                        {t('workbench.close')}
                      </button>
                    </div>
                  );
                })()}
              {floatWin === 'shot' && selectedShot && (
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                  {selectedShot.src?.startsWith('blob:') && !clipFilesRef.current.has(selectedShot.src) && (
                    <div className="border-line flex items-center gap-2 border-b px-3 py-2">
                      <span className="text-ink-2 min-w-0 flex-1 text-[11px]">{t('workbench.insertSourceMissing')}</span>
                      <button
                        type="button"
                        onClick={() => void reconnectClip(selectedShot.id)}
                        className="bg-accent shrink-0 rounded px-2.5 py-1 text-[11px] font-medium text-white transition hover:brightness-110"
                      >
                        {t('workbench.rePickFile')}
                      </button>
                    </div>
                  )}
                  <ShotTreatmentPanel
                    shot={selectedShot}
                    onSetTreatment={setShotTreatment}
                    onSetTreatSize={setShotTreatSize}
                    onPreviewTreatSize={previewShotTreatSize}
                    onSetTreatCrop={setShotTreatCrop}
                    onPreviewTreatCrop={previewShotTreatCrop}
                    onSetFilter={setShotFilter}
                    onPreviewFilter={previewShotFilter}
                    onSetAudio={setShotAudio}
                  />
                </div>
              )}
              {floatWin === 'transition' && transitionCut != null && (
                <TransitionPanel
                  effect={cutTransitions(comp.shots ?? []).find((tr) => Math.abs(tr.cut - transitionCut) < 0.05)?.effect ?? null}
                  direction={cutTransitions(comp.shots ?? []).find((tr) => Math.abs(tr.cut - transitionCut) < 0.05)?.dir ?? 'left'}
                  onPick={(ef, dir) => setCutTransition(transitionCut, ef, dir)}
                />
              )}
              {floatWin === 'captions' && (
                <div data-cap-keep className="contents"><CaptionsPanel {...captionsPanelProps()} /></div>
              )}
              {floatWin === 'person' && (
                <PersonFxPanel
                  comp={comp}
                  onChange={setPersonFx}
                  matte={matteState}
                  selectedShotMatte={(() => {
                    const s = (comp.shots ?? []).find((x) => x.id === selectedShotId);
                    return s ? !!s.personMatte : null; // equal standing: any source's segment can enable matte
                  })()}
                  onToggleShotMatte={toggleShotMatte}
                  onRetry={() => {
                    const s = (compRef.current.shots ?? []).find((x) => x.id === selectedShotIdRef.current);
                    if (s) void runMatteForShot(s);
                  }}
                />
              )}
              {floatWin === 'kitProps' &&
                (() => {
                  const b = selectedId ? comp.blocks.find((x) => x.id === selectedId) : null;
                  if (!b || !b.templateId.startsWith('kit:')) return null; // auto-close effect takes over
                  return (
                    <KitPropsPanel
                      block={b}
                      onPatch={(props) => {
                        setComp((c) => ({ ...c, blocks: c.blocks.map((x) => (x.id === b.id ? { ...x, slots: { ...x.slots, props } } : x)) }));
                      }}
                    />
                  );
                })()}
              {floatWin === 'anim' &&
                (() => {
                  const b = selectedId ? comp.blocks.find((x) => x.id === selectedId) : null;
                  if (!b) return null; // the auto-close-panel effect takes over immediately
                  return (
                    <MediaAnimPanel
                      anim={(b.slots.anim ?? {}) as { enter?: string; exit?: string; dur?: number }}
                      onChange={(patch) => {
                        setBlockAnim(b.id, patch);
                        // Click a card to play it once (hf:animPreview runs the tween directly in the active doc, no debounced rebuild);
                        // changing duration replays the current entry so you feel the speed change instantly
                        const merged = { enter: 'fade', ...((b.slots.anim ?? {}) as { enter?: string; exit?: string; dur?: number }), ...patch };
                        if (patch.enter !== undefined) postPreview({ type: 'hf:animPreview', id: b.id, phase: 'in', effect: patch.enter, dur: merged.dur ?? 0.5 });
                        else if (patch.exit !== undefined) postPreview({ type: 'hf:animPreview', id: b.id, phase: 'out', effect: patch.exit, dur: merged.dur ?? 0.5 });
                        else if (patch.dur !== undefined) postPreview({ type: 'hf:animPreview', id: b.id, phase: 'in', effect: merged.enter ?? 'fade', dur: patch.dur });
                      }}
                    />
                  );
                })()}
            </div>
          )}
          </div>
          {/* Primary nav strip: always visible (floatWin covers only the content column). Clicking a
              tab closes any docked tool panel — the nav is the one stable way back. Pin/collapse live
              at the strip's bottom since the tabs header row is gone. */}
          <div className="border-line flex shrink-0 flex-col items-center gap-0.5 overflow-y-auto border-l px-1 py-2" style={{ width: RAIL_NAV_W }}>
            {(
              [
                { v: 'assets', icon: LayoutGrid, label: 'workbench.assets' },
                { v: 'script', icon: Scissors, label: 'workbench.scriptCut' },
                { v: 'captions', icon: Captions, label: 'panels.captions' },
                { v: 'audio', icon: Music, label: 'panels.music' },
                { v: 'avatar', icon: UserRound, label: 'workbench.avatar' },
                // Themes tab hidden (per user 2026-07-19): the component library is already grouped by theme with its own tokens, mount themes via the chat selector
              ] as { v: 'assets' | 'script' | 'captions' | 'audio' | 'avatar'; icon: typeof LayoutGrid; label: string }[]
            ).map((n) => (
              <button
                key={n.v}
                type="button"
                onClick={() => {
                  setFloatWin(null);
                  setLibTab(n.v);
                }}
                aria-label={t(n.label)}
                className={`flex w-full flex-col items-center gap-1 rounded-md py-1.5 transition ${
                  !floatWin && libTab === n.v ? 'bg-panel-2 text-ink' : 'text-ink-4 hover:text-ink-2'
                }`}
              >
                <n.icon size={15} />
                <span className="max-w-full truncate px-0.5 text-[9px] leading-none">{t(n.label)}</span>
              </button>
            ))}
            <div className="mt-auto flex w-full flex-col items-center gap-0.5 pt-2">
              <button
                type="button"
                onClick={() => setRailPinned((p) => !p)}
                title={t(railPinned ? 'workbench.unpinAssetsBar' : 'workbench.pinAssetsBar')}
                aria-label={t(railPinned ? 'workbench.unpinAssetsBar' : 'workbench.pinAssetsBar')}
                className="text-ink-4 hover:text-ink flex w-full items-center justify-center rounded-md py-1.5"
              >
                {railPinned ? <PinOff size={13} /> : <Pin size={13} />}
              </button>
              <button
                type="button"
                onClick={() => setLibCollapsedManual(true)}
                title={t('workbench.collapseAssetsBar')}
                aria-label={t('workbench.collapseAssetsBar')}
                className="text-ink-4 hover:text-ink flex w-full items-center justify-center rounded-md py-1.5"
              >
                <ChevronsRight size={14} />
              </button>
            </div>
          </div>
          </div>
        </div>
        </div>

        {/* Transport bar. On narrow windows (≤1280) button text must not wrap: when space is short the whole bar scrolls horizontally, don't let "safe zone" stack into three lines */}
        <TooltipProvider delayDuration={200}>
        <div className="border-line flex items-center gap-3 overflow-x-auto border-t py-2 pl-4 whitespace-nowrap [&>button]:shrink-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setPlaying((p) => !p)}
                disabled={!hasContent}
                className="bg-ink text-bg inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
                aria-label={playing ? t('tools.pause.label') : t('tools.play.label')}
              >
                {playing ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{playing ? t('workbench.pauseSpace') : t('workbench.playSpace')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => locateTimeline()}
                disabled={!hasContent}
                className="hover:bg-panel-2 shrink-0 rounded px-1 disabled:pointer-events-none"
                aria-label={t('workbench.scrollPlayhead')}
              >
                <TimeReadout duration={hasContent ? duration : 0} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('workbench.scrollPlayhead')}</TooltipContent>
          </Tooltip>
          {/* Undo/redo + editing (on the shot at the playhead, icons only): split / trim left / trim right — ][ glyph, dashed side = the side being trimmed */}
            <div className="text-ink-3 ml-1 flex shrink-0 items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" onClick={undoLast} disabled={!canUndo} aria-label={t('tools.undo.label')} className="hover:text-ink hover:bg-panel-2 rounded p-1 disabled:opacity-40">
                    <Undo2 size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t('workbench.undoShortcut')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" onClick={redoLast} disabled={!canRedo} aria-label={t('workbench.redo')} className="hover:text-ink hover:bg-panel-2 rounded p-1 disabled:opacity-40">
                    <Redo2 size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t('workbench.redoShortcut')}</TooltipContent>
              </Tooltip>
              <div className="bg-line mx-0.5 h-4 w-px shrink-0" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" onClick={splitAtPlayhead} disabled={!hasVideoTrack && !selectedAudioId} aria-label={t('workbench.split')} className="hover:text-ink hover:bg-panel-2 rounded p-1 disabled:opacity-40">
                    <BracketCutIcon />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t('workbench.split')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" onClick={() => trimAtPlayhead('left')} disabled={!hasVideoTrack && !selectedAudioId} aria-label={t('workbench.trimLeft')} className="hover:text-ink hover:bg-panel-2 rounded p-1 disabled:opacity-40">
                    <BracketCutIcon dashed="left" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t('workbench.trimLeft')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" onClick={() => trimAtPlayhead('right')} disabled={!hasVideoTrack && !selectedAudioId} aria-label={t('workbench.trimRight')} className="hover:text-ink hover:bg-panel-2 rounded p-1 disabled:opacity-40">
                    <BracketCutIcon dashed="right" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t('workbench.trimRight')}</TooltipContent>
              </Tooltip>
            </div>
          {/* Delete selection: works for shots/components alike (same guard as the Delete key: don't delete while generating / keep at least one shot) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => {
                  if (selectedId) removeBlock(selectedId);
                  else if (selectedShotIds.size) deleteShots(selectedShotIds); // bulk multi-select; single degrades automatically
                }}
                disabled={!selectedId && selectedShotIds.size === 0}
                aria-label={t('workbench.deleteSelection')}
                className="text-ink-3 hover:bg-panel-2 ml-1 rounded p-1 hover:text-destructive disabled:opacity-40"
              >
                <Trash2 size={14} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{selectedShotIds.size > 1 ? t('workbench.deleteNScenes', { n: selectedShotIds.size }) : t('workbench.deleteSelection')}</TooltipContent>
          </Tooltip>
          {/* 剪口播 / 字幕 moved to the library rail tabs (siblings of 素材); the caption-selected
              shortcuts + style popover still open them floating. */}
          {/* Person: matte global config (feather/stroke/background swap); which components go behind the person is on the component toolbar */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => (floatWin === 'person' ? setFloatWin(null) : openFloatAt('person', e.currentTarget.getBoundingClientRect()))}
                disabled={!hasVideoTrack || !selectedShotId}
                aria-label={t('workbench.portrait')}
                className={`ml-1 rounded p-1 disabled:opacity-40 ${floatWin === 'person' ? 'text-ink bg-panel-2' : 'text-ink-3 hover:text-ink hover:bg-panel-2'}`}
              >
                <UserRound size={14} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('workbench.smartCutoutPersonTop')}</TooltipContent>
          </Tooltip>
          {/* Framing: framing settings for the selected shot (style-card panel) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => selectedShotId && (floatWin === 'shot' ? setFloatWin(null) : openFloatAt('shot', e.currentTarget.getBoundingClientRect()))}
                disabled={!hasVideoTrack || !selectedShotId}
                aria-label={t('workbench.cameraFraming')}
                className={`rounded p-1 disabled:opacity-40 ${floatWin === 'shot' ? 'text-ink bg-panel-2' : 'text-ink-3 hover:text-ink hover:bg-panel-2'}`}
              >
                <Frame size={14} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('workbench.cameraFraming')}</TooltipContent>
          </Tooltip>
          {/* Audio settings: opens the rail's audio tab (selected clip, or the video's own sound) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={openAudioTab}
                disabled={!hasVideoTrack}
                aria-label={t('panels.music')}
                className={`rounded p-1 disabled:opacity-40 ${!floatWin && libTab === 'audio' ? 'text-ink bg-panel-2' : 'text-ink-3 hover:text-ink hover:bg-panel-2'}`}
              >
                <Music size={14} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('panels.music')}</TooltipContent>
          </Tooltip>
          <div className="flex-1" />
          {/* Timeline zoom: − thin slider + (borderless, vertically centered) */}
          <div className="text-ink-3 flex shrink-0 items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" onClick={() => setPps((p) => Math.max(MIN_PPS, Math.round(p / 1.4)))} disabled={pps <= MIN_PPS} aria-label={t('workbench.zoomOutTimeline')} className="hover:text-ink flex items-center disabled:opacity-40">
                  <Minus size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t('workbench.zoomOutTimelineLabel')}</TooltipContent>
            </Tooltip>
            <input
              type="range"
              min={MIN_PPS}
              max={MAX_PPS}
              step={1}
              value={pps}
              onChange={(e) => setPps(Number(e.target.value))}
              className="zoom-range w-24"
              aria-label={t('workbench.timelineZoom')}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" onClick={() => setPps((p) => Math.min(MAX_PPS, Math.round(p * 1.4)))} disabled={pps >= MAX_PPS} aria-label={t('workbench.zoomInTimeline')} className="hover:text-ink flex items-center disabled:opacity-40">
                  <Plus size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t('workbench.zoomInTimelineLabel')}</TooltipContent>
            </Tooltip>
          </div>
          {/* Debug hook (developer): admin-only, leaving a single "analysis" entry — face/safe-zone and source
              are folded into the analysis panel header, no longer each a separate toolbar button */}
          {isAdmin && (
          <div className="border-line flex shrink-0 items-center gap-0.5 border-l pl-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setShowDebug((s) => !s)}
                  aria-label={t('workbench.debugTranscriptVisualAnalysis')}
                  className={`rounded p-1.5 ${showDebug ? 'text-ink bg-panel-2' : 'text-ink-4 hover:text-ink'}`}
                >
                  <FlaskConical size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t('workbench.analysisDebug')}</TooltipContent>
            </Tooltip>
          </div>
          )}
          {/* Export pinned right via sticky (stays put while the bar scrolls on narrow windows).
              The bar keeps no right padding of its own — this layer's pr-4 provides it, so the sticky
              edge IS the visible edge and nothing can show through beside the button; bg-panel matches
              the column surface, masking buttons that pass underneath without a visible block. */}
          <div className="sticky right-0 z-10 ml-auto flex shrink-0 items-center gap-3 bg-panel pl-2 pr-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setExportOpen(true)}
                disabled={exporting || publishing || !hasVideoTrack}
                className="border-line text-ink-2 hover:text-ink inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] disabled:opacity-50"
              >
                {exporting || publishing ? <Loader2 size={14} className="animate-spin" /> : <FileVideo size={14} />}{' '}
                {exporting ? t('workbench.exportingPctShort', { pct: exportPct }) : publishing ? t('workbench.renderingPct', { pct: exportPct }) : t('workbench.export')}
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('tools.export_video.label')}</TooltipContent>
          </Tooltip>
          <Dialog open={exportOpen} onOpenChange={(v) => { if (!v && exporting) return; setExportOpen(v); }}>
            <DialogContent className="max-w-[320px]" showCloseButton={!exporting}>
              <DialogHeader>
                <DialogTitle>{t('tools.export_video.label')}</DialogTitle>
              </DialogHeader>
              {exporting ? (
                // Export dialog stays open: progress lives here, only "cancel export" can close it (overlay/Esc are blocked)
                <div className="flex flex-col gap-3">
                  <div className="bg-line h-1.5 overflow-hidden rounded-full">
                    <div className="bg-accent h-full rounded-full transition-[width] duration-300 ease-out" style={{ width: `${exportPct}%` }} />
                  </div>
                  <p className="text-ink-3 text-[12px]">{t('workbench.renderingPctDownloads', { pct: exportPct })}</p>
                  <button
                    type="button"
                    onClick={() => {
                      cancelExport();
                      setExportOpen(false);
                    }}
                    className="border-line text-ink-2 hover:text-ink inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-[13px]"
                  >
                    <X size={14} /> {t('workbench.cancelExport')}
                  </button>
                </div>
              ) : (
              <div className="flex flex-col gap-3">
                <ExportOptRow
                  label={t('chatGen.resolution')}
                  value={exportOpts.res}
                  options={[
                    [2160, '4K'],
                    [1440, '2K'],
                    [1080, '1080p'],
                    [720, '720p'],
                    [540, '540p'],
                  ]}
                  onPick={(res) => setExportOpts((o) => ({ ...o, res }))}
                />
                <ExportOptRow
                  label={t('workbench.frameRate')}
                  value={exportOpts.fps}
                  options={[
                    [24, '24'],
                    [30, '30'],
                    [60, '60'],
                  ]}
                  onPick={(fps) => setExportOpts((o) => ({ ...o, fps }))}
                />
                <ExportOptRow
                  label={t('workbench.format')}
                  value={exportOpts.format}
                  options={[
                    ['mp4', 'MP4'],
                    ['mov', 'MOV'],
                    ['webm', 'WebM'],
                  ]}
                  onPick={(format) => setExportOpts((o) => ({ ...o, format }))}
                />
                <p className="text-ink-4 text-[11px] leading-relaxed">{t('workbench.downloadsAutomaticallyWhenExport')}</p>
                <button
                  type="button"
                  onClick={() => {
                    // Keep the dialog to show progress, close only when compositing ends (done/failed/cancelled)
                    void exportVideo(exportOpts).finally(() => setExportOpen(false));
                  }}
                  className="bg-ink text-bg inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium hover:opacity-90"
                >
                  <Download size={14} /> {t('workbench.startExport')}
                </button>
              </div>
              )}
            </DialogContent>
          </Dialog>
          {((exporting && !exportOpen) || publishing) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    cancelExport();
                  }}
                  className="text-ink-3 hover:text-ink shrink-0 rounded p-1"
                >
                  <X size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t('workbench.stopRendering')}</TooltipContent>
            </Tooltip>
          )}
          </div>
        </div>
        </TooltipProvider>

        {/* Caption style popover: reuses CaptionsPanel wholesale; clicking a style applies globally, click outside / Esc dismisses */}
        {/* Multi-track timeline */}
        <div data-cap-keep className="contents">
        <StudioTimeline
          comp={comp}
          playing={playing}
          locateSignal={locateSignal}
          locateNear={locateNear}
          selectedShotIds={selectedShotIds}
          selectedBlockIds={selectedBlockIds}
          filmstrip={filmstrip}
          clipStrips={clipStrips}
          mainLive={!!videoFile}
          srcLive={srcLive}
          pps={pps}
          assetDragging={!!dragAsset}
          assetDragKind={dragAsset?.type ?? null}
          selectedAudioId={selectedAudioId}
          videoMuted={videoTrackMuted}
          audioMuted={audioTrackMuted}
          audioPeaks={audioOps.audioPeaks}
          sourcePeaks={audioOps.sourcePeaks}
          clipPendingAt={clipPending}
          {...timelineCbs}
        />
        </div>

        {/* Test hook: narration script + visual analysis (read-only) */}
        {showDebug && (
          <div className="border-line flex h-44 flex-col border-t">
            <div className="border-line text-ink-4 flex items-center gap-2 border-b px-3 py-1.5 text-[11px]">
              <span>{t('workbench.transcriptVisualAnalysisRead')}</span>
              <div className="ml-auto flex items-center gap-1.5">
                {/* Face/safe-zone overlay (folded in from the old toolbar button): overlay face (red)/subject (blue)/safe zone (green) on the preview */}
                <button
                  type="button"
                  onClick={() => setShowGeom((s) => !s)}
                  disabled={!visual}
                  className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] disabled:opacity-40 ${showGeom ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600' : 'border-line text-ink-3 hover:text-ink hover:bg-panel-2'}`}
                >
                  <ScanFace size={11} /> {t('workbench.facesSafeZones')}
                </button>
                {/* assembled HTML (folded in from the old toolbar button) */}
                <button
                  type="button"
                  onClick={() => setShowCode((s) => !s)}
                  className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] ${showCode ? 'border-line bg-panel-2 text-ink' : 'border-line text-ink-3 hover:text-ink hover:bg-panel-2'}`}
                >
                  <Code2 size={11} /> {t('workbench.source')}
                </button>
                <button
                  type="button"
                  onClick={() => void rerunVisual()}
                  disabled={!comp.video}
                  className="border-line text-ink-3 hover:text-ink hover:bg-panel-2 rounded border px-2 py-0.5 text-[11px] disabled:opacity-40"
                >
                  {t('workbench.clearCacheRerunVisual')}
                </button>
              </div>
            </div>
            <textarea
              value={debugText}
              readOnly
              spellCheck={false}
              className="bg-panel text-ink-3 min-h-0 flex-1 resize-none p-3 font-mono text-[11px] leading-[1.6] outline-none"
            />
          </div>
        )}

        {/* assembled HTML (read-only, transparent for inspection) */}
        {showCode && (
          <div className="border-line flex h-44 flex-col border-t">
            <div className="border-line text-ink-4 border-b px-3 py-1.5 text-[11px]">{t('workbench.assembledHtmlBuiltFrom')}</div>
            <textarea
              value={assembled}
              readOnly
              spellCheck={false}
              className="bg-panel text-ink-3 min-h-0 flex-1 resize-none p-3 font-mono text-[11px] leading-[1.5] outline-none"
            />
          </div>
        )}
      </div>


    </div>
  );
}
