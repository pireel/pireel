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
  VideoOff, FlaskConical, ScanFace, MessageSquare, Image as ImageIcon, ChevronsLeft, ChevronsRight, Minus, Plus, Download, X, GripVertical, Trash2, Palette, RefreshCw, Save, SendToBack, BringToFront, ChevronUp, ChevronDown, UserRound, Frame, Undo2, Redo2, RotateCw, Squircle, Pin, PinOff } from 'lucide-react';
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
  emptyComposition,
  freeTrack,
  getCaptionPreset,
  isSentenceCaption,
  mediaBlock,
  newBlock,
  renderBlock,
  resolveCaptionStyle,
  resolveSubCaptionStyle,
  shotFilterCss,
  shotId,
  shotTransformVars,
  DIRECTIONAL_TRANSITIONS,
  MAX_TRANSITION_SEC,
  cutTransitions,
  splitBlockedByTransition,
  totalDuration,
  treatmentVacancyBox,
} from '@pireel/studio-engine/composition';
import { getTheme, themeVarsCss } from '@pireel/studio-engine/theme';
import { deleteClipById, removeEditedInterval, removeEditedRange, removeSrcRanges, restoreSrcRange, spans as clipSpans, splitAtEdited, srcToEditedLoose, trimLeftAtEdited, trimRightAtEdited } from '@pireel/studio-engine/trim';
import { parseBlockResponse } from '@pireel/studio-engine/compose';
import { imageThumb, imgSourceBase } from '@pireel/ui/image-url';
import { HARD_LINT_CODES, lintBlock } from '@pireel/studio-engine/block-lint';
import { clearToolProgress, setToolProgress } from './tool-progress';
import { injectPreviewRuntime } from './sample-composition';
import { playhead, usePlayheadT } from './playhead';
import { type AsrSegment, captionBlocksFromAsr } from '@pireel/studio-engine/build-blocks';
import { type Box as GraphicBox, dropPlaceholdersInWindows, insertedClipPlaceholder, isPlaceholder, layoutFromPlan, layoutInsertWindow, pickGraphicBox, placeholderSpec } from '@pireel/studio-engine/build-draft';
import { type FilmstripFrame, extractFilmstrip, fileSig, probeVideoFile, uploadImageFile, uploadVideoFile } from './media';
import { loadLocalVideo, saveLocalVideo } from './local-media';
import { VideoTrackEngine } from './video-track-engine';
import { type BakeSpec, type BakedWindow, bakeTransitionWindow, decodeBake } from './transition-bake';
import { type DraftPlan, type PlanInsert, parsePlan , unifiedPlanRows } from '@pireel/studio-engine/plan';
import { beatsForWindow as beatsForWindowPure, inNarrationSource, insertPlanContexts, mappedCaptionSegs as relayMappedCaptionSegs, relayCaptionLayer as relayCaptionLayerPure } from '@pireel/studio-engine/captions-relay';
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
import { wordsFromText } from '@pireel/studio-engine/caption-fx';
import { AssetsPanel, type GenType, type PanelDragAsset } from './assets-panel';
import { addElementEntry } from './element-history';
import { type ScriptCut, ScriptPanel } from './script-panel';
import { type CaptionLineRow, CaptionsPanel } from './captions-panel';
import { FramePanel } from './frame-panel';
import { PersonFxPanel, type MatteState } from './person-fx-panel';
import { ShotTreatmentPanel } from './shot-treatment-panel';
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
import { blockPatchableChange, capPosOnlyChange, sameExceptCapStyle, shiftBox, shotFramingOnlyChange, themeMountOnlyChange } from './comp-diff';
import { BoxEditOverlay, CaptionEditOverlay } from './edit-overlays';
import { BracketCutIcon, CardShapeControls, ExportOptRow, TimeReadout } from './workbench-controls';


const PREVIEW_FALLBACK_W = 320; // fallback width before parent size is measured
const UNDO_CAP = 20; // undo snapshot stack cap (each = full Composition, incl. custom block HTML)
// ⚠️ Temporary for testing: fill only the first N images to save LLM calls, rest stay as placeholders — **remove before launch**.
// Kept at top level so it isn't buried in a 400-line tool branch and shipped by accident.

/** Tool panel kinds (single instance, mutually exclusive, docked as a column in the asset rail): gen / smart-cut / person / framing / code / media-anim / transition / captions. */
type FloatKind = 'gen' | 'script' | 'person' | 'shot' | 'code' | 'anim' | 'transition' | 'captions';


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
  const [locateSignal, setLocateSignal] = useState(0); // increment = scroll timeline to the playhead (click the time readout)
  const [capTransBusy, setCapTransBusy] = useState(false); // bilingual translation in progress (captions panel)
  const [libTab, setLibTab] = useState<'assets' | 'frames' | 'script' | 'captions'>('assets'); // library rail tab (assets / script-cut / captions; themes hidden)
  const [libCollapsed, setLibCollapsed] = useState(false); // asset rail collapsed (narrow strip + expand button; content hidden but state kept)
  // Asset rail geometry: drag-resizable width + pin mode (pinned = docked column taking layout
  // space; unpinned = floating overlay above the canvas, the stage keeps full width). Both persist.
  const [railW, setRailW] = useState(() => {
    const v = typeof window !== 'undefined' ? Number(window.localStorage.getItem('studio-rail-w')) : 0;
    return Number.isFinite(v) && v >= 260 && v <= 560 ? v : 320;
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
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1280px)');
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
  const hasContent = !!comp.video || comp.blocks.length > 0; // empty canvas (no video, no blocks) isn't playable
  // Preview box: keep canvas aspect, fill the parent as much as possible (measure parent size → uniform scale)
  const fit =
    area.w > 0 && area.h > 0
      ? Math.min(area.w / comp.width, area.h / comp.height)
      : PREVIEW_FALLBACK_W / comp.width;
  const fitRef = useRef(fit); // used in the (mounted-once) message handler to convert comp px → stage px
  fitRef.current = fit;
  /** Floating toolbar positioning — single source of truth, shared by drag-follow (direct DOM writes) and React
   *  render; the two must produce identical numbers to avoid jumps. Pure follow, no clamping (edge-docking feel was
   *  rejected); avoiding truncation is structural: the toolbar mounts outside the stage's clipping layer. */
  const toolbarXY = useCallback((box?: { x: number; y: number; w: number; h: number } | null) => {
    const W = compRef.current.width * fitRef.current;
    const H = compRef.current.height * fitRef.current;
    return { left: box ? (box.x + box.w / 2) * W : W / 2, top: box ? box.y * H - 40 : 8 };
  }, []);
  const boxW = Math.round(comp.width * fit);
  const boxH = Math.round(comp.height * fit);
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
        const g = s.graphic ? ` · ${s.graphic.component}:${s.graphic.data ?? s.graphic.brief}` : '';
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
  const [bufs, setBufs] = useState<{ docs: [string, string]; active: 0 | 1 }>(() => ({
    docs: [injectPreviewRuntime(assembleHtml(starter)), ''],
    active: 0,
  }));
  const bufsRef = useRef(bufs);
  bufsRef.current = bufs;
  const iframesRef = useRef<(HTMLIFrameElement | null)[]>([null, null]);
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
  const [mediaMissing, setMediaMissing] = useState(false);
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
      try {
        w?.postMessage(
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
  const { exporting, publishing, exportPct, exportVideo, cancelExport, resetExport } = useStudioExport({ compRef, videoFileRef, clipFilesRef });
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
    const shots = comp.video ? (comp.shots?.length ? comp.shots : [{ id: 'all', src: undefined, srcStart: 0, srcEnd: comp.video.durationSec, treatment: 'full' as const }]) : [];
    for (const s of shots) {
      if (!s.src) continue;
      const f = clipFilesRef.current.get(s.src);
      eng.setSource(s.src, f ?? (s.src.startsWith('blob:') ? null : s.src));
    }
    eng.setSegments(shots.map((s) => ({ key: s.src ?? 'main', elKey: s.src ? `clip_${s.id}` : 'main', srcStart: s.srcStart, srcEnd: s.srcEnd })));
    eng.setTransitions(cutTransitions(comp.shots ?? []).map((tr) => ({ cut: tr.cut, half: tr.half }))); // window table for shadow decoding
    if (!playingRef.current) eng.refresh();
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
    const capOnly = sameExceptCapStyle(lastBuiltCompRef.current, comp);
    const framingOnly = shotFramingOnlyChange(lastBuiltCompRef.current, comp);
    const patchable = blockPatchableChange(lastBuiltCompRef.current, comp);
    const id = setTimeout(() => {
      builtFontsTickRef.current = fontsTick;
      if (!fontsChanged && themeMountOnlyChange(lastBuiltCompRef.current, comp)) {
        lastBuiltCompRef.current = comp;
        return;
      }
      if (!fontsChanged && capPosOnlyChange(lastBuiltCompRef.current, comp)) {
        lastBuiltCompRef.current = comp;
        return;
      }
      // Block-level in-place patch path: geometry (move/scale/rotate) / time window (timeline block trim) / appearance
      // (bg/border/radius/opacity) / in-place text echo / pure delete — commit the final value once into the active
      // doc, skipping the full doc rebuild (rebuild = double-buffer swap = video reload, the source of "flicker per edit").
      // When a swap is pending, step aside and rebuild (see the ref comment).
      if (!fontsChanged && patchable && !pendingSwitchRef.current) {
        const echo = iframeEditEchoRef.current;
        // slots changes must all be echoes of iframe in-place text edits (active doc is already current); slots changed
        // by other sources (agent/panel/image swap) leave the active doc stale and must rebuild
        if (patchable.pairs.every((p) => !p.slots || echo.has(p.b.id))) {
          for (const p of patchable.pairs) {
            if (p.slots) echo.delete(p.b.id);
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
          for (const r of patchable.removed) postPreview({ type: 'hf:remove', id: r.id });
          if (patchable.pairs.some((p) => p.geom || p.style)) postPreview({ type: 'hf:measureFit' });
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
        return { docs, active: s.active };
      });
    }, fontsChanged || capOnly || framingOnly || patchable ? 0 : 300);
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
  useDraftAutosave(comp, videoSigRef.current ?? (videoFile ? fileSig(videoFile) : null), projectId, coverThumbRef);

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
              return { docs, active: idx };
            });
            // Re-assembly interrupted playback (e.g. AI edited a block) → the new buffer resumes from the current playhead, don't freeze on a paused frame
            if (playingRef.current) {
              const w = iframesRef.current[idx]?.contentWindow;
              try {
                w?.postMessage({ type: 'hf:seek', t: tRef.current }, '*');
                w?.postMessage({ type: 'hf:play', t: tRef.current }, '*');
              } catch {
                /* ignore */
              }
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
  const keysRef = useRef<{ removeBlock: (id: string) => void; deleteBlocks: (ids: Set<string>) => void; deleteShot: (sid: string) => void; deleteShots: (ids: Set<string>) => void; closeCode: () => void; closeFloat: () => void; deleteTransition: () => void; undo: () => void; redo: () => void; floatWin: FloatKind | null }>({
    removeBlock: () => {},
    deleteBlocks: () => {},
    deleteShot: () => {},
    deleteShots: () => {},
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
  async function pickVideoFile(file: File, opts?: { asSig?: string }) {
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
      setMediaMissing(false);
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
      const sameVideoRestore = !!(pr && pr.videoSig && sig === pr.videoSig);
      if (!sameVideoRestore) {
        setAsrSentences(null);
        setPlan(null);
        setVisual(null);
        asrRef.current = null;
        planRef.current = null;
        visualRef.current = null;
      }
      resetExport();
      if (pr && pr.videoSig && sig === pr.videoSig) {
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
    ): Promise<{ innerHtml: string; timelineBody: string; note: string }> => {
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
    if (cur) postPreview({ type: 'hf:shotVars', vars: shotTransformVars(treatment, cur.treatSize) });
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
    if (s) postPreview({ type: 'hf:shotVars', vars: shotTransformVars(s.treatment, size) });
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
  // Edit-mode force-show: captions fade in, and the playhead often rests at a very low opacity — you can't tune a caption you can't see.
  // Select a caption (and paused) → force the current segment opaque (segment index computed via the same captionLineSegments as render);
  // deselect/play → runtime re-runs seekTimelines to restore the true timeline state
  useEffect(() => {
    if (!selCapId || playing) {
      postPreview({ type: 'hf:capEdit', id: null });
      return;
    }
    const b = comp.blocks.find((x) => x.id === selCapId);
    const words = (b?.slots.words ?? []) as { text: string; start: number; end: number }[];
    if (!b || !words.length) return;
    const cs = resolveCaptionStyle(comp);
    const segs = captionLineSegments(words, getCaptionPreset(cs.preset), cs.wPct ?? 56, cs.scale, comp.width);
    let idx = 0;
    for (let i = 0; i < segs.length; i++) {
      if (segs[i]![0]!.start <= tSec + 1e-3) idx = i;
      else break;
    }
    postPreview({ type: 'hf:capEdit', id: selCapId, seg: idx });
  }, [selCapId, playing, tSec, comp, bufs.active, postPreview]);
  /** Media dropped on the stage: hitting a component card (media block) present at the current moment = fill it; a miss = create a new component card centered on the drop point. */
  const handleAssetDrop = async (e: React.DragEvent) => {
    const a = dragAsset;
    setDragAsset(null);
    if (!a) return;
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
  const insertTemplateBlock = (templateId: string) => {
    pushUndoSnapshot();
    const startSec = Math.max(0, Math.round(tRef.current * 10) / 10);
    const base = newBlock(templateId, { startSec });
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
  const setCaptionStyle = useCallback((patch: Partial<CaptionStyle>) => {
    setComp((c) => ({ ...c, captionStyle: { ...resolveCaptionStyle(c), ...patch } }));
  }, []);
  /** Caption re-lay/mapping: the pure functions live in captions-relay (reused by the offline MCP executor); this is a thin wrapper feeding refs. */
  const mappedCaptionSegs = (shots: VideoShot[], narr: AsrSegment[] | null): AsrSegment[] => relayMappedCaptionSegs(shots, narr, clipAsrRef.current);
  const relayCaptionLayer = (blocks: Block[], shots: VideoShot[], segs: AsrSegment[] | null): Block[] =>
    relayCaptionLayerPure(blocks, shots, segs, clipAsrRef.current);
  /** Edit one caption line's TEXT (captions panel). Single source of truth = the transcript: the fix
   *  reaches caption re-lay, read_script/agents and the script panel at once. Timing untouched; word
   *  timing redistributed proportionally within the sentence (wordsFromText — karaoke presets keep working).
   *  Bilingual on → the stale translation is dropped and that line auto-retranslates. */
  const [captionLineBusyKey, setCaptionLineBusyKey] = useState<string | null>(null);
  const retranslateCaptionLine = async (src: string | null, index: number, langIn?: string) => {
    const tr = studioProviders().translate;
    const lang = langIn ?? resolveCaptionStyle(compRef.current).sub?.lang;
    if (!tr || !lang) return;
    const segs = src ? clipAsrRef.current[src] : asrRef.current;
    const seg = segs?.[index];
    if (!seg) return;
    const key = `${src ?? 'main'}:${index}`;
    setCaptionLineBusyKey(key);
    try {
      const out = await tr([{ index, text: seg.text }], lang);
      const textOut = out.find((o) => o.index === index)?.text?.trim();
      if (!textOut) throw new Error(t('workbench.translationFailedTryAgain'));
      if (src) {
        const shot = ensureShots(compRef.current).find((s) => s.src === src);
        if (shot) await runStudioTool('set_caption_translations', { shotId: shot.id, items: [{ index, text: textOut }] });
      } else {
        await runStudioTool('set_caption_translations', { items: [{ index, text: textOut }] });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('workbench.translationFailedTryAgain'));
    } finally {
      setCaptionLineBusyKey((k) => (k === key ? null : k));
    }
  };
  /** Live-edited-but-not-committed lines (panel debounces keystrokes through phase 'live'):
   *  commit uses it to know a retranslate is owed even when the final call's text is already current. */
  const captionLiveDirtyRef = useRef<Set<string>>(new Set());
  const editCaptionLine = (src: string | null, index: number, nextText: string, phase: 'live' | 'commit' | 'revert' = 'commit') => {
    const segs = src ? clipAsrRef.current[src] : asrRef.current;
    const old = segs?.[index];
    if (!old || !nextText) return;
    const key = `${src ?? 'main'}:${index}`;
    const changed = nextText !== old.text;
    if (changed) {
      // Keep the existing sub while typing (nicer than flashing 未翻译); the commit-time retranslate replaces it
      const nextSeg: AsrSegment = {
        ...old,
        text: nextText,
        // Only rebuild word timing if ASR provided it (karaoke presets read words); sentence-level stays sentence-level
        ...(old.words?.length ? { words: wordsFromText(nextText, old.start, old.end) } : {}),
      };
      const next = segs.map((s, i) => (i === index ? nextSeg : s));
      if (src) {
        const m = { ...clipAsrRef.current, [src]: next };
        clipAsrRef.current = m;
        setClipAsr(m);
      } else {
        asrRef.current = next;
        setAsrSentences(next);
      }
      // Captions on → re-lay so the canvas reflects the text live (double-buffered doc swap, no flash)
      if (compRef.current.blocks.some(isSentenceCaption)) {
        setComp((cur) => ({ ...cur, blocks: relayCaptionLayer(cur.blocks, ensureShots(cur), asrRef.current) }));
      }
    }
    if (phase === 'live') {
      if (changed) captionLiveDirtyRef.current.add(key);
      return;
    }
    const dirty = captionLiveDirtyRef.current.delete(key);
    if (phase === 'revert') return; // Esc: text restored above (if needed), old sub still matches — nothing else to do
    // Commit + bilingual on → refresh this line's translation (also owed when live edits already landed the text)
    if ((changed || dirty) && resolveCaptionStyle(compRef.current).sub?.lang && studioProviders().translate) {
      void retranslateCaptionLine(src, index);
    }
  };
  /** Captions panel empty-state "extract captions": run ASR in place (no style applied — the user
   *  may just want to edit lines; picking a style later re-lays from this transcript). */
  const extractCaptionsNow = async () => {
    if (!videoFileRef.current) {
      toast.error(t('common.uploadVideoFirst'));
      return;
    }
    if (captionGenBusyRef.current) return;
    captionGenBusyRef.current = true;
    setCapGenBusy(true);
    try {
      await stepAsr();
      await ensureClipTranscripts();
    } catch {
      toast.error(t('workbench.transcriptExtractionFailedTry'));
    } finally {
      captionGenBusyRef.current = false;
      setCapGenBusy(false);
    }
  };
  /** Manually edit one line's TRANSLATION (bilingual second row). Same single-source semantics as the
   *  text edit (seg.sub), same live re-lay; no auto-retranslate here — the user's wording wins
   *  (only editing the SOURCE re-triggers translation). null = clear this line's translation. */
  const editCaptionSubLine = (src: string | null, index: number, text: string | null, _phase: 'live' | 'commit' | 'revert' = 'commit') => {
    const segs = src ? clipAsrRef.current[src] : asrRef.current;
    const old = segs?.[index];
    if (!old) return;
    const nextSub = text?.trim() || undefined;
    if (nextSub === old.sub) return;
    const { sub: _drop, ...rest } = old;
    const nextSeg: AsrSegment = nextSub ? { ...rest, sub: nextSub } : rest;
    const next = segs.map((s, i) => (i === index ? nextSeg : s));
    if (src) {
      const m = { ...clipAsrRef.current, [src]: next };
      clipAsrRef.current = m;
      setClipAsr(m);
    } else {
      asrRef.current = next;
      setAsrSentences(next);
    }
    if (compRef.current.blocks.some(isSentenceCaption)) {
      setComp((cur) => ({ ...cur, blocks: relayCaptionLayer(cur.blocks, ensureShots(cur), asrRef.current) }));
    }
  };
  /** Shared props for the two CaptionsPanel mounts (docked rail + float window). */
  const captionsPanelProps = () => ({
    comp,
    generating: capGenBusy,
    onPickPreset: applyCaptionPreset,
    onRemove: removeCaptionLayer,
    rows: captionLineRows,
    activeKey: (() => {
      let hit: string | null = null;
      for (const r of captionLineRows) if (r.editedStart <= tSec + 0.001) hit = r.key;
      return hit;
    })(),
    onEditLine: editCaptionLine,
    onEditSubLine: editCaptionSubLine,
    onSeekTo: (sec: number) => {
      if (playingRef.current) setPlaying(false);
      applyT(sec);
    },
    onRetranslateLine: (src: string | null, index: number) => void retranslateCaptionLine(src, index),
    lineBusyKey: captionLineBusyKey,
    onExtract: () => void extractCaptionsNow(),
    translation: studioProviders().translate
      ? {
          done: (asrSentences ?? []).filter((x) => x.sub).length + Object.values(clipAsr).flat().filter((x) => x.sub).length,
          total: (asrSentences ?? []).length + Object.values(clipAsr).flat().length,
          busy: capTransBusy,
          lang: resolveCaptionStyle(comp).sub?.lang,
          onTranslate: (lang: string) => void translateCaptionsTo(lang),
          onClear: () => void runStudioTool('set_caption_translations', { clear: true }),
        }
      : undefined,
  });
  /** Clicking a style card in the captions panel: **always re-lay the whole layer from the narration script** (segmentation/
   *  mapping are deterministic post-processing and shouldn't reuse old blocks — old blocks may predate a segmentation-algorithm change;
   *  the transcript is the single source of truth, and word replacements are recorded there too). Auto-run ASR if there's no transcript;
   *  if there's no transcript but old captions exist (a loaded legacy draft), degrade to style-only. */
  const captionGenBusyRef = useRef(false);
  const [capGenBusy, setCapGenBusy] = useState(false); // used by the panel's "generating captions" overlay (the ref only prevents re-entry, doesn't trigger render)
  const applyCaptionPreset = async (preset: string) => {
    const has = compRef.current.blocks.some(isSentenceCaption);
    if (!compRef.current.video) {
      toast.error(t('workbench.uploadVideoBeforeApplying'));
      return;
    }
    if (captionGenBusyRef.current) return;
    captionGenBusyRef.current = true;
    setCapGenBusy(true);
    try {
      // Run ASR if there's no transcript (fileSig cache hit = instant) — **never** skip re-laying because "captions already exist":
      // old blocks may predate a segmentation-algorithm change, and without re-laying, segmentation never takes effect (hit this:
      // after loading a draft the transcript state was empty, took the "style-only" degrade path, and no matter how the user clicked they saw no segmentation)
      let segs = asrRef.current;
      if (!segs?.length) {
        toast.info(t('workbench.extractingTranscript'));
        segs = await stepAsr();
      }
      const caps = captionBlocksFromAsr(mappedCaptionSegs(ensureShots(compRef.current), segs ?? []));
      if (!caps.length) {
        toast.error(t('workbench.transcriptEmptyGenerateCaptions'));
        return;
      }
      pushUndoSnapshot();
      setComp((c) => ({ ...c, blocks: [...c.blocks.filter((b) => !isSentenceCaption(b)), ...caps], captionStyle: { ...resolveCaptionStyle(c), preset } }));
      // Let the user see the result immediately (same value as "select means visible"): if the playhead isn't in any
      // caption window, move it to the first caption — otherwise nothing on screen moves after laying and it feels like "clicked but no effect" (user reported)
      if (!playingRef.current && caps.length) {
        const t = tRef.current;
        const within = caps.some((b) => t >= b.startSec && t < b.startSec + b.durationSec);
        if (!within) applyT(caps[0]!.startSec + Math.min(0.3, caps[0]!.durationSec / 2));
      }
      toast.success(has ? t('workbench.reLaidCaptionsFrom') : t('workbench.laidNCaptionsFrom', { n: caps.length }));
    } catch (e) {
      console.warn('[studio] apply caption preset failed', e);
      setCaptionStyle({ preset }); // on transcription failure, at least swap the style
      toast.error(t('workbench.transcriptExtractionFailedStyle'));
    } finally {
      captionGenBusyRef.current = false;
      setCapGenBusy(false);
    }
  };
  /** Captions panel "remove": drop the entire sentence-level caption layer + clear the global style (with an undo snapshot). */
  const removeCaptionLayer = () => {
    const ids = compRef.current.blocks.filter(isSentenceCaption).map((b) => b.id);
    if (!ids.length) return;
    pushUndoSnapshot();
    ids.forEach((id) => postPreview({ type: 'hf:remove', id }));
    setComp((c) => ({ ...c, blocks: c.blocks.filter((b) => !isSentenceCaption(b)), captionStyle: undefined }));
    setSelectedIdRaw((s) => (s && ids.includes(s) ? null : s));
    setSelectedBlockIds((cur) => {
      const n = new Set([...cur].filter((x) => !ids.includes(x)));
      return n.size === cur.size ? cur : n;
    });
    toast.success(t('workbench.removedCaptions'));
  };
  /* ---------------- Unified gen panel (one chat interaction for image/video/component) ---------------- */
  /** Generate a standalone component (composeBlockChecked, not added to the video; only added via "insert" on a history card). */
  const generateElementStandalone = async (prompt: string, base?: GenElementResult): Promise<GenElementResult> => {
    // Draft iteration: a "reference" already-generated component enters the seed as the existing implementation, the instruction = edit on top of it
    const seed = base
      ? { id: blockId('ai'), kind: 'custom', innerHtml: base.innerHtml.replaceAll(base.seedId, 'SEED_'), timelineBody: base.timelineBody.replaceAll(base.seedId, 'SEED_'), label: base.label }
      : { id: blockId('ai'), kind: 'custom', innerHtml: '<div></div>', timelineBody: '', label: t('workbench.newElement') };
    if (base) {
      seed.innerHtml = seed.innerHtml.replaceAll('SEED_', seed.id);
      seed.timelineBody = seed.timelineBody.replaceAll('SEED_', seed.id);
    }
    const instruction = base
      ? `Edit this element's current implementation as requested (keep everything not mentioned as-is): ${prompt}`
      : `Create a new overlay element (title / big number / list / kinetic caption — pick per the content): ${prompt}`;
    const parsed = await composeBlockChecked(seed, instruction);
    return { seedId: seed.id, innerHtml: parsed.innerHtml, timelineBody: parsed.timelineBody, label: prompt.slice(0, 12) };
  };
  /** History card "insert": re-scope the id then land at the playhead (the same asset can be inserted multiple times, selectors don't collide).
   *  If there's an empty component block waiting to be filled (elementTargetRef recorded by aiFillBlock), prefer filling it — keeping its time window/box/track. */
  /** Local reshaping before component insert (without an LLM round-trip), the user-defined container/text separation semantics:
   *  - **inner container tracks the box's real size**: top-level visible elements' width/height (and absolute-position offsets)
   *    are bound to container %; corner handles scale proportionally, edge handles on one axis, it changes as the container does (not a whole-transform scale);
   *  - **text then follows the resulting size**: font-size/line-height px are calibrated to the natural size at insert as
   *    min(cqw,cqh) container-query units — font size = original × min(width ratio, height ratio), pure CSS, instant during
   *    drag, no glyph stretching;
   *  - normalization of absurd sizes (over-canvas shrunk back / too-small enlarged) is reflected directly in the box choice, content %/cq follows automatically.
   *  Rendered and measured offscreen at canvas size (container id = seedId; the component's <style> only takes effect scoped to #seedId);
   *  offset geometry is immune to transform (entry animation doesn't pollute it). If unmeasurable → as-is + default centered box;
   *  extreme overflow still has the autofit safety net. */
  const normalizeElementForInsert = (el: GenElementResult, W: number, H: number, opts?: { fullFluid?: boolean }): { innerHtml: string; box: { x: number; y: number; w: number; h: number } } => {
    const fallback = { innerHtml: el.innerHtml, box: { x: 0.14, y: 0.3, w: 0.72, h: 0.4 } };
    try {
      const host = document.createElement('div');
      host.style.cssText = `position:fixed;left:-100000px;top:0;width:${W}px;height:${H}px;overflow:hidden;visibility:hidden;pointer-events:none;`;
      const root = document.createElement('div');
      root.id = el.seedId;
      root.style.cssText = 'position:absolute;inset:0;';
      root.innerHTML = el.innerHtml;
      host.appendChild(root);
      document.body.appendChild(host);
      try {
        const rectOf = (n: HTMLElement) => {
          let x = n.offsetLeft;
          let y = n.offsetTop;
          let p = n.offsetParent as HTMLElement | null;
          while (p && p !== host) {
            x += p.offsetLeft;
            y += p.offsetTop;
            p = p.offsetParent as HTMLElement | null;
          }
          return { x, y, w: n.offsetWidth, h: n.offsetHeight };
        };
        const tops: { node: HTMLElement; rect: { x: number; y: number; w: number; h: number } }[] = [];
        const walk = (node: HTMLElement, depth: number) => {
          for (const k of Array.from(node.children) as HTMLElement[]) {
            if (k.tagName === 'STYLE' || k.tagName === 'SCRIPT') continue;
            const w = k.offsetWidth;
            const h = k.offsetHeight;
            if (w < 2 || h < 2) continue;
            if (w > W * 0.92 && h > H * 0.92 && depth < 4) walk(k, depth + 1);
            else tops.push({ node: k, rect: rectOf(k) });
          }
        };
        walk(root, 0);
        if (!tops.length) return fallback;
        const x0 = Math.min(...tops.map((t2) => t2.rect.x));
        const y0 = Math.min(...tops.map((t2) => t2.rect.y));
        const x1 = Math.max(...tops.map((t2) => t2.rect.x + t2.rect.w));
        const y1 = Math.max(...tops.map((t2) => t2.rect.y + t2.rect.h));
        const nbW = x1 - x0;
        const nbH = y1 - y0;
        if (nbW < W * 0.03 || nbH < H * 0.02) return fallback; // measured absurdly small = untrustworthy
        // Components that basically fill the canvas keep their original layout semantics (full-canvas box, content unchanged);
        // fullFluid (whole-page theme components) is the exception: full pages are also fully cq-ized — calibrated to the design size, content scales proportionally no matter how small the box shrinks
        const fullBleed = nbW > W * 0.95 && nbH > H * 0.95;
        if (fullBleed && !opts?.fullFluid) return { innerHtml: el.innerHtml, box: { x: 0, y: 0, w: 1, h: 1 } };
        const pad = fullBleed ? 0 : Math.min(W, H) * 0.025; // breathing room: font-measurement error / shadow margin
        const natW = fullBleed ? W : nbW + pad * 2; // natural container size (= box px without normalization): the calibration base for % and cq
        const natH = fullBleed ? H : nbH + pad * 2;
        const pc = (v: number) => `${Math.round(v * 1000) / 10}%`;
        for (const { node, rect } of fullBleed ? [] : tops) {
          // Top-level visible element: size bound to container % — it changes its real size as the container (blue box) does
          node.style.width = pc(rect.w / natW);
          node.style.height = pc(rect.h / natH);
          if (getComputedStyle(node).position === 'absolute') {
            // Absolutely-positioned top-level element: convert the offset to % too; clear right/bottom anchors to avoid stretching from a double constraint with the new left/top
            node.style.left = pc((rect.x - x0 + pad) / natW);
            node.style.top = pc((rect.y - y0 + pad) / natH);
            node.style.right = 'auto';
            node.style.bottom = 'auto';
          }
        }
        // Full fluidization: all px in CSS contexts (<style> and style="") are calibrated to the natural size as min(cqw,cqh).
        // At box = natural size every value is identical; a proportional corner drag = font/padding/radius/SVG sizes all ×k, the skeleton holds;
        // a single-edge widen = min picks the unchanged height ratio, so font/padding stay put, the container's real width grows, text reflows.
        // ≤2px thin lines are kept (a hairline shrunk to sub-pixel goes blurry); @container/@media condition lines are protected (no cq units allowed in the condition).
        const cq = (n: number) => `min(${Math.round((n / natW) * 100000) / 1000}cqw,${Math.round((n / natH) * 100000) / 1000}cqh)`;
        // Negative px (like right:-14px for decorations outside the card): a textual '-min(...)' is invalid CSS and the
        // whole positioning is dropped by the browser (the culprit behind the Botanical stamp falling to the bottom-left); negatives use max(-a,-b), mirroring the positive min scaling semantics
        const ncq = (n: number) => `max(${-(Math.round((n / natW) * 100000) / 1000)}cqw,${-(Math.round((n / natH) * 100000) / 1000)}cqh)`;
        const fluidCss = (css: string) => {
          const guards: string[] = [];
          return css
            .replace(/@(?:container|media|supports)[^{]*/g, (m) => {
              guards.push(m);
              return `@@HFG${guards.length - 1}@@`;
            })
            .replace(/(-?\d+(?:\.\d+)?)px/gi, (m, n: string) => {
              const v = parseFloat(n);
              if (Math.abs(v) <= 2) return m;
              return v > 0 ? cq(v) : ncq(-v);
            })
            .replace(/@@HFG(\d+)@@/g, (_m, i: string) => guards[Number(i)]!);
        };
        const html = root.innerHTML
          .replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (_m, attrs: string, css: string) => `<style${attrs}>${fluidCss(css)}</style>`)
          .replace(/style="([^"]*)"/gi, (_m, css: string) => `style="${fluidCss(css)}"`);
        // Wrap in a container-query base (container-type:size): cqw/cqh always relative to the component container, not the canvas
        const wrapped = `<div style="position:absolute;inset:0;container-type:size;">\n${html}\n</div>`;
        if (fullBleed) return { innerHtml: wrapped, box: { x: 0, y: 0, w: 1, h: 1 } };
        // Size normalization is just the box choice: over-canvas shrunk back to a sensible scale, too-small bumped up a notch, content %/cq follows automatically
        let k = 1;
        if (nbW > 0.88 * W || nbH > 0.8 * H) k = Math.min((0.78 * W) / nbW, (0.7 * H) / nbH);
        else if (nbW < 0.22 * W && nbH < 0.22 * H) k = Math.min((0.4 * W) / nbW, (0.35 * H) / nbH);
        k = Math.max(0.3, Math.min(2.5, k));
        const bw = Math.min(W, natW * k);
        const bh = Math.min(H, natH * k);
        const bx = Math.max(0, Math.min(W - bw, x0 + nbW / 2 - bw / 2)); // placed concentrically, clamped back into the canvas
        const by = Math.max(0, Math.min(H - bh, y0 + nbH / 2 - bh / 2));
        const r4 = (v: number) => Math.round(v * 10000) / 10000;
        return { innerHtml: wrapped, box: { x: r4(bx / W), y: r4(by / H), w: r4(bw / W), h: r4(bh / H) } };
      } finally {
        host.remove();
      }
    } catch {
      return fallback;
    }
  };
  const insertGeneratedElement = (el: GenElementResult, prompt: string, atSec?: number) => {
    // Reshape locally once, shared by both branches: inner container %-binding + font cq-ization (when backfilling into a component card, content also adapts to the card's box)
    const dW = el.designW ?? compRef.current.width;
    const dH = el.designH ?? compRef.current.height;
    const geom = normalizeElementForInsert(el, dW, dH, { fullFluid: !!(el.designW && el.designH) });
    if (el.designW && el.designH) {
      // Design coords → canvas: first take the fit window inside the canvas at the design aspect ratio (same shape as the preview).
      // Whole-page items (measured full-bleed) = the entire fit window; overlay items (measured their own small box) = map the small box into the fit window,
      // so the selection box hugs the item itself rather than covering half the screen
      const W = compRef.current.width;
      const H = compRef.current.height;
      const ar = el.designW / el.designH;
      let w = 0.96;
      let h = (W * w) / ar / H;
      if (h > 0.96) {
        h = 0.96;
        w = (H * h * ar) / W;
      }
      const win = { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
      const full = geom.box.w > 0.98 && geom.box.h > 0.98;
      geom.box = full
        ? win
        : { x: win.x + geom.box.x * win.w, y: win.y + geom.box.y * win.h, w: geom.box.w * win.w, h: geom.box.h * win.h };
    }
    // Independence baking: theme components carry data-hf-baked (theme tokens travel with them); other components snapshot
    // the current theme's tokens into the block scope here — swapping themes / editing other components after insert doesn't affect it (user-defined independence semantics)
    if (!geom.innerHtml.includes('data-hf-baked')) {
      geom.innerHtml += `\n<style data-hf-baked>#${el.seedId}{${themeVarsCss(getTheme(compRef.current.theme), compRef.current.palette)}}</style>`;
    }
    const targetId = elementTargetRef.current;
    const tb = targetId ? compRef.current.blocks.find((b) => b.id === targetId) : null;
    const tbSlots = tb?.slots as { media?: { url?: string }; spec?: unknown } | undefined;
    if (tb && blockKind(tb) === 'media' && !tbSlots?.media?.url && typeof tbSlots?.spec !== 'string') {
      elementTargetRef.current = null;
      pushUndoSnapshot();
      setComp((c) => ({
        ...c,
        blocks: c.blocks.map((b) =>
          b.id === tb.id
            ? {
                ...b,
                templateId: 'custom',
                slots: { innerHtml: geom.innerHtml.replaceAll(el.seedId, tb.id), timelineBody: el.timelineBody.replaceAll(el.seedId, tb.id), ...(el.presetId ? { presetId: el.presetId } : {}) },
                label: el.label || prompt.slice(0, 12),
              }
            : b,
        ),
      }));
      setSelectedShotId(null);
      setSelectedId(tb.id);
      if (!playing) applyT(Math.max(0, tb.startSec + 0.01));
      toast.success(t('workbench.filledIntoElementCard'));
      return;
    }
    pushUndoSnapshot();
    const newId = blockId('cst');
    const at = Math.max(0, Math.round((atSec ?? tRef.current) * 100) / 100);
    // Only with a box are there selection frame / move / resize handles (a boxless block can't show a border, so the user can't adjust it after dragging into the canvas)
    const nb: Block = {
      id: newId,
      templateId: 'custom',
      slots: { innerHtml: geom.innerHtml.replaceAll(el.seedId, newId), timelineBody: el.timelineBody.replaceAll(el.seedId, newId), ...(el.presetId ? { presetId: el.presetId } : {}) },
      startSec: at,
      durationSec: 3,
      trackIndex: freeTrack(compRef.current.blocks, at, 3),
      label: el.label || prompt.slice(0, 12),
      box: geom.box,
    };
    setComp((c) => ({ ...c, blocks: [...c.blocks, nb] }));
    if (nb.box) setPendingInsert(nb.box);
    setSelectedShotId(null);
    setSelectedId(newId);
    if (!playing) applyT(Math.max(0, nb.startSec + 0.01));
    toast.success(t('workbench.elementInserted'));
  };
  /** Layer: move a block up/down one layer (trackIndex±1, DOM order = stacking; 0 = video, clamped to [1,55]). */
  const bumpBlockLayer = (b: Block, dir: 1 | -1) => {
    pushUndoSnapshot();
    setComp((c) => ({ ...c, blocks: c.blocks.map((x) => (x.id === b.id ? { ...x, trackIndex: Math.max(1, Math.min(55, x.trackIndex + dir)) } : x)) }));
  };
  /** Block-level person-layer override: toggle between on-top-of / behind the person (defaults to global personFront, see engine Block.personLayer). */
  const togglePersonLayer = (b: Block) => {
    pushUndoSnapshot();
    const behindNow = b.personLayer ? b.personLayer === 'behind' : !!compRef.current.personFx?.personFront;
    setComp((c) => ({ ...c, blocks: c.blocks.map((x) => (x.id === b.id ? { ...x, personLayer: behindNow ? 'front' : 'behind' } : x)) }));
  };
  /** Floating toolbar "save as component": save a canvas custom block as-is into the asset library (snapshot copy, later
   *  edits don't affect each other; seedId = block id, the insert side re-scopes as usual). Re-saving the same block = overwrites the same entry. */
  const saveBlockAsElement = (b: Block) => {
    const slots = b.slots as { innerHtml?: string; timelineBody?: string };
    if (typeof slots.innerHtml !== 'string') return;
    // Snapshot semantics: a block that already has baked tokens (theme component / baked at a prior insert) = saved as-is —
    // **never** strip the old and re-bake, or saving gets polluted by the currently-mounted theme (a chain error the user
    // called out); only un-baked ones (legacy block / raw AI output) get the current theme snapshot added
    const baked = slots.innerHtml.includes('data-hf-baked')
      ? slots.innerHtml
      : `${slots.innerHtml}\n<style data-hf-baked>#${b.id}{${themeVarsCss(getTheme(compRef.current.theme), compRef.current.palette)}}</style>`;
    addElementEntry({
      id: `saved:${b.id}`,
      prompt: b.label || t('workbench.canvasElement'),
      createdAt: Date.now(),
      element: { seedId: b.id, innerHtml: baked, timelineBody: slots.timelineBody ?? '', label: b.label || t('panels.element'), ...((b.slots as { presetId?: string }).presetId ? { presetId: (b.slots as { presetId?: string }).presetId } : {}) },
    });
    setGenRefreshTick((n) => n + 1); // refetch the asset library so it's visible immediately
    toast.success(t('workbench.savedAsElementAssets'));
  };
  /** Floating toolbar "sync content": one-click fill the component's data-edit text slots from the narration script in
   *  the block's time window (preset component copy = generic placeholder, this step matches it to real content). Slots
   *  are claimed by index in DOM order (keys may repeat); text replacement only touches textContent, layout/animation unchanged. */
  const [syncBusyId, setSyncBusyId] = useState<string | null>(null);
  const syncBlockContent = async (b: Block) => {
    const fill = studioProviders().syncFill;
    if (!fill || syncBusyId) return;
    const slots = b.slots as { innerHtml?: string };
    if (typeof slots.innerHtml !== 'string') return;
    const doc = new DOMParser().parseFromString(`<div id="__root">${slots.innerHtml}</div>`, 'text/html');
    const nodes = Array.from(doc.querySelectorAll('#__root [data-edit]'));
    const items = nodes.map((n, i) => ({ index: i, text: (n.textContent ?? '').trim() })).filter((x) => x.text);
    if (!items.length) {
      toast.error(t('workbench.elementNoFillableText'));
      return;
    }
    // Narration window: sentences whose final-cut time overlaps the block window (±3s breathing room); if none, take the two nearest.
    // When transcript references aren't hydrated (old project / missing context), fall back to reading copy from the **caption blocks themselves** —
    // if there are captions on screen there's a script, so we can't report "no narration script" (user hit this).
    let segs = mappedCaptionSegs(ensureShots(compRef.current), asrRef.current);
    if (!segs.length) {
      segs = compRef.current.blocks
        .filter(isSentenceCaption)
        .map((cb) => ({ start: cb.startSec, end: cb.startSec + cb.durationSec, text: cb.label || '' }))
        .filter((x) => !!x.text) as typeof segs;
    }
    const s0 = b.startSec - 3;
    const s1 = b.startSec + b.durationSec + 3;
    let win = segs.filter((x) => x.end > s0 && x.start < s1);
    if (!win.length && segs.length) {
      const mid = b.startSec + b.durationSec / 2;
      win = [...segs].sort((a, c) => Math.abs((a.start + a.end) / 2 - mid) - Math.abs((c.start + c.end) / 2 - mid)).slice(0, 2);
    }
    if (!win.length) {
      toast.error(t('workbench.noTranscriptYetExtract'));
      return;
    }
    setSyncBusyId(b.id);
    try {
      // Script carries timestamps (sentence range + word-level time): the LLM in one pass gives "copy + the moment `at`
      // when the content is spoken" — the goal is described in generic language in the server system prompt, not enumerating component shapes (per user)
      const script = win
        .map((x) => {
          const wl = x.words?.length ? `\n  words: ${x.words.map((w) => `${w.start.toFixed(2)}|${w.text}`).join(' ')}` : '';
          return `[${x.start.toFixed(2)}-${x.end.toFixed(2)}] ${x.text}${wl}`;
        })
        .join('\n');
      const curTlb = (b.slots as { timelineBody?: string }).timelineBody ?? '';
      const out = await fill(items, script, { html: slots.innerHtml, timeline: curTlb, id: b.id });
      const byIndex = new Map(out.items.map((x) => [x.index, x.text]));
      const byIndexAt = new Map(out.items.filter((x) => typeof x.at === 'number').map((x) => [x.index, x.at!]));
      // Component = strong reference (per user): the LLM may restructure wholesale (a 3-item list grows to 4 per the script).
      // html passing validation = full replacement; not given / not passing = fall back to slot patching (text only)
      let nextHtml: string;
      const okHtml =
        typeof out.html === 'string' &&
        out.html.includes('data-edit') &&
        out.html.includes(`#${b.id}`) && // the style scope must still be this block's id (prevents cross-block leakage / lost scope)
        !/<script/i.test(out.html);
      if (okHtml) {
        nextHtml = out.html!;
      } else {
        nodes.forEach((n, i) => {
          const t = byIndex.get(i);
          if (t) n.textContent = t;
        });
        nextHtml = doc.querySelector('#__root')!.innerHTML;
      }
      // Sync timeline ① window alignment: prefer the span the LLM gives (it drops leading/trailing sentences unrelated to
      // the component — the previous "overlap-window min/max" pulled in unrelated leading segments, user hit this); fall back to the overlap window if not given
      const winLo = Math.min(...win.map((x) => x.start));
      const winHi = Math.max(...win.map((x) => x.end));
      const spanFrom = out.span ? Math.min(Math.max(out.span.from, winLo - 1), winHi) : winLo;
      const spanTo = out.span ? Math.max(Math.min(out.span.to, winHi + 1), spanFrom + 1) : winHi;
      const newStart = Math.max(0, Math.round(spanFrom * 100) / 100);
      const newDur = Math.max(1.5, Math.round((spanTo - newStart) * 100) / 100);
      // Sync timeline ② preset beats: each segment's main-slot new copy is located in the narration word stream → rebuild the timeline at its entrance moment
      // (word-level timestamps are our edge; segments not found are left to the builder's default rhythm)
      // Sync timeline ②: the LLM rewrites timelineBody directly by looking at the component's real HTML (generic — it
      // targets whatever selectors it reads, not preset class names; the previous preset-enumerating builder was rejected by the user).
      // Compile-validate with new Function before applying (bad syntax = keep the original timeline, content still syncs).
      let nextTlb: string | null = null;
      if (out.timeline) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-implied-eval
          new Function('tl', out.timeline);
          nextTlb = out.timeline;
        } catch {
          /* compile failed: discard, keep the original timeline */
        }
      }
      pushUndoSnapshot();
      setComp((c) => ({
        ...c,
        blocks: c.blocks.map((x) =>
          x.id === b.id
            ? { ...x, startSec: newStart, durationSec: newDur, slots: { ...x.slots, innerHtml: nextHtml, ...(nextTlb ? { timelineBody: nextTlb } : {}) } }
            : x,
        ),
      }));
      toast.success(nextTlb ? t('workbench.syncedContentTimingBlock') : t('workbench.syncedContentAlignedNarration'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('workbench.syncFailedTryAgain'));
    } finally {
      setSyncBusyId(null);
    }
  };
  /** History card "@mention": stuff the asset into the right-side agent input (fill only, don't send), switch to chat to describe how to use it. */
  const mentionAsset = (text: string) => {
    openChat();
    chatRef.current?.insertText(text);
  };

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

  /** Editable caption lines for the captions panel, in edited-timeline order across all sources.
   *  Walk the shot spans; a sentence overlapping a span joins at that span's edited time; split shots
   *  sharing a sentence dedupe to the first occurrence. */
  const captionLineRows = useMemo<CaptionLineRow[]>(() => {
    // NOTE deliberately not gated on comp.video: transcript + shots are cloud-backed — caption editing
    // must keep working in the missing-media state (browser switch / cleared storage).
    const rows: CaptionLineRow[] = [];
    const seen = new Set<string>();
    for (const sp of clipSpans(ensureShots(comp))) {
      const shot = sp.clip as VideoShot;
      const src = shot.src ?? null;
      const segs = src ? (clipAsr[src] ?? []) : (asrSentences ?? []);
      segs.forEach((seg, i) => {
        if (seg.end <= shot.srcStart + 0.05 || seg.start >= shot.srcEnd - 0.05) return;
        const key = `${src ?? 'main'}:${i}`;
        if (seen.has(key)) return;
        seen.add(key);
        rows.push({
          key, src, index: i, text: seg.text, sub: seg.sub,
          editedStart: sp.editedStart + Math.max(0, seg.start - shot.srcStart),
          dur: Math.max(0.1, Math.min(seg.end, shot.srcEnd) - Math.max(seg.start, shot.srcStart)),
        });
      });
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comp.shots, asrSentences, clipAsr]);

  /** Read a remote video's duration (metadata only). Streaming webm (MediaRecorder output) has duration=Infinity at
   *  the metadata stage: seek to a huge value to force the browser to compute the real duration (classic fix), 3s fallback.
   *  A just-uploaded URL may hit CDN propagation delay (first fetch 404): retry 2 more times, 1.2s apart. */
  const videoDurationOf = async (url: string): Promise<number | null> => {
    for (let i = 0; i < 3; i++) {
      const d = await videoDurationOnce(url);
      if (d != null) return d;
      await new Promise((r) => setTimeout(r, 1200));
    }
    return null;
  };
  const videoDurationOnce = (url: string): Promise<number | null> =>
    new Promise((res) => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      let settled = false;
      const done = (d: number | null) => {
        if (settled) return;
        settled = true;
        res(d);
      };
      const dur = () => (Number.isFinite(v.duration) && v.duration > 0.1 ? v.duration : null);
      v.onerror = () => done(null);
      v.onloadedmetadata = () => {
        if (dur() != null) return done(dur());
        v.ondurationchange = () => {
          if (dur() != null) done(dur());
        };
        v.currentTime = 1e7;
        setTimeout(() => done(dur()), 3000);
      };
      v.src = url;
    });
  /** Landing point (final seconds) while an external clip is being inserted (reading duration/extracting frames): the timeline shows an "inserting" badge there. */
  const [clipPending, setClipPending] = useState<number | null>(null);
  /** Filmstrips for external clips (**src → frames**, t = that source's own source time): the main filmstrip belongs
   *  only to the main video; clips extract one set per **source**, shared by all clips of the same source — split/delete
   *  just change the span, no re-extract (extracting by shot.id once meant a split's right half was a new id, re-extracting
   *  the whole thing, a visibly flickering filmstrip redraw on large files). */
  const [clipStrips, setClipStrips] = useState<Record<string, FilmstripFrame[]>>({});
  const clipStripReqRef = useRef<Set<string>>(new Set()); // sources already requested (incl. in progress), prevents duplicate extraction
  useEffect(() => {
    const bySrc = new Map<string, number>(); // src → the maximum source time covered
    for (const s of comp.shots ?? []) if (s.src) bySrc.set(s.src, Math.max(bySrc.get(s.src) ?? 0, s.srcEnd));
    for (const [src, maxEnd] of bySrc) {
      if (clipStripReqRef.current.has(src)) continue;
      clipStripReqRef.current.add(src);
      const upTo = Math.max(0.5, maxEnd);
      void (async () => {
        try {
          let f: File;
          if (src.startsWith('blob:')) {
            const lf = clipFilesRef.current.get(src); // local mode: the File is already at hand, zero download
            if (!lf) {
              clipStripReqRef.current.delete(src); // File not in place yet (restoring): undo the placeholder, retry once src is revived
              return;
            }
            f = lf;
          } else {
            const r = await fetch(`/api/media/fetch?url=${encodeURIComponent(src)}`);
            if (!r.ok) throw new Error(String(r.status));
            const blob = await r.blob();
            f = new File([blob], 'clip.mp4', { type: blob.type || 'video/mp4' });
          }
          await extractFilmstrip(f, upTo, Math.min(60, Math.max(4, Math.round(upTo))), (fr) => {
            setClipStrips((m) => ({ ...m, [src]: [...(m[src] ?? []), fr].sort((a, b) => a.t - b.t) }));
          });
        } catch (e) {
          console.warn('[studio] clip filmstrip failed', e);
        }
      })();
    }
  }, [comp.shots]);
  /** Nearest split point (0 + each shot's end). */
  const nearestShotBound = (shots: VideoShot[], t: number) => {
    let at = 0;
    let idx = 0;
    let best = Infinity;
    [0, ...clipSpans(shots).map((x) => x.editedEnd)].forEach((b, i) => {
      const d = Math.abs(b - t);
      if (d < best) {
        best = d;
        at = b;
        idx = i;
      }
    });
    return { at, idx };
  };
  /** Insert core: an external clip lands at the nearest split point (an equal-standing clip: framing/matte/audio/captions
   *  same as the main source). Overlay blocks after the boundary shift right as a whole — the mirror of removeEditedInterval. file = local mode (blob url). */
  const insertClipCore = (url: string, clipDur: number, atWish: number, file?: File): string => {
    pushUndoSnapshot();
    // Narrative structure changed: the old plan is void. A cached plan doesn't know about this beat, and a cached lay_out
    // would treat it as absent (scenes crossing the insert window / mismatched placeholders); re-planning is what treats the inserted clip as its own beat.
    setPlan(null);
    planRef.current = null;
    const shots = ensureShots(compRef.current);
    const { at, idx } = nearestShotBound(shots, atWish);
    if (file) clipFilesRef.current.set(url, file);
    if (file) backupMediaToCloud(file, fileSig(file), 'clip'); // insert sources also go to the cloud byte rendezvous
    const nb: VideoShot = { id: shotId(), src: url, ...(file ? { srcSig: fileSig(file) } : {}), srcStart: 0, srcEnd: clipDur, treatment: 'full' };
    setComp((c) => ({
      ...c,
      shots: [...shots.slice(0, idx), nb, ...shots.slice(idx)],
      blocks: c.blocks.map((b) => (b.startSec >= at - 1e-3 ? { ...b, startSec: b.startSec + clipDur } : b)),
    }));
    setSelectedId(null);
    setSelectedShotId(nb.id);
    applyT(at + Math.min(0.1, clipDur / 2));
    toast.success(t('workbench.insertedBRoll'));
    // Captions/translation already on → the new clip follows automatically (transcribe → re-lay captions; if a target language was chosen, also auto-fill the translation in that language)
    if (compRef.current.blocks.some(isSentenceCaption)) void autoCaptionNewClip(url, nb.id);
    return nb.id;
  };
  /** Auto-complete captions/translation for a newly inserted clip: a bonus, silent on failure (the panel/agent can still fill manually). */
  const autoCaptionNewClip = async (src: string, insertedShotId: string) => {
    const relay = () => setComp((cur) => ({ ...cur, blocks: relayCaptionLayer(cur.blocks, ensureShots(cur), asrRef.current) }));
    // The insert already shifted final-cut time / split sentences: **re-lay once unconditionally first** (sentences
    // crossing the insert point are re-split by the new time). Still/silent clips have no speech to transcribe, and by
    // this point captions are already correct — previously re-laying was gated behind "the new clip transcribed sentences",
    // so silent clips returned early and the whole caption layer stayed on the old time (user reported).
    try {
      relay();
    } catch {
      /* same as below: auto-complete failure is silent */
    }
    try {
      await ensureClipTranscripts(); // transcribe new sources on demand (cache / failure blacklist handled internally)
      const segs = clipAsrRef.current[src];
      if (!segs?.length) return;
      relay(); // new-source sentences enter the layer
      // A target language was chosen in the panel → auto-fill the new clip's translation in that language (same executor writes data as manual translation)
      const lang = resolveCaptionStyle(compRef.current).sub?.lang;
      const t = studioProviders().translate;
      if (lang && t) {
        const out = await t(segs.map((x, i) => ({ index: i, text: x.text })), lang);
        if (out.length) await runStudioTool('set_caption_translations', { shotId: insertedShotId, items: out });
      }
    } catch {
      /* auto-complete failure is silent: the captions panel / agent can fill manually */
    }
  };
  /** Draft restore: a local clip's src is a dead blob — fetch the File from OPFS by srcSig and rebuild the blob src.
   *  The two split halves of the same src share one fetch; unrecoverable ones stay as-is (card shows a base color, preview a black segment, no worse than before). */
  const recoverLocalClips = async (shots: VideoShot[]) => {
    const remap = new Map<string, string>(); // old src → new blob src
    for (const s of shots) {
      if (!s.src || !s.srcSig || remap.has(s.src) || clipFilesRef.current.has(s.src)) continue;
      let f = await loadLocalVideo(s.srcSig);
      if (!f && cloudMediaRef.current.clips?.[s.srcSig]) f = await studioProviders().vault.fetch(s.srcSig); // cloud byte rendezvous fallback
      if (!f) continue;
      void saveLocalVideo(f, s.srcSig); // cloud-fetched files land back in the local library, instant next time
      const url = URL.createObjectURL(f);
      clipFilesRef.current.set(url, f);
      remap.set(s.src, url);
    }
    if (remap.size) {
      setComp((c) => ({ ...c, shots: (c.shots ?? []).map((s) => (s.src && remap.has(s.src) ? { ...s, src: remap.get(s.src)! } : s)) }));
    }
    // Unrecovered dead links (blob src with no File): say so plainly and point to reconnection — previously a silent black
    // segment, whereas the main video has a "re-import" prompt in the same case; equal-standing clips deserve their own repair path
    const dead = new Set(
      shots.map((s) => s.src).filter((src): src is string => !!src && src.startsWith('blob:') && !remap.has(src) && !clipFilesRef.current.has(src)),
    );
    if (dead.size) toast.error(t('workbench.insertSourcesMissing', { n: dead.size }));
  };

  /** Reconnect a dead-link clip: re-pick a file to reconnect (srcSig verifies it's the original file; segments split from the same source reconnect together). */
  const reconnectClip = async (shotId: string) => {
    const s = (compRef.current.shots ?? []).find((x) => x.id === shotId);
    if (!s?.src) return;
    const f = await pickFile('video/*');
    if (!f) return;
    const sig = fileSig(f);
    if (s.srcSig && sig !== s.srcSig) {
      toast.error(t('workbench.checksumMismatch'));
      return;
    }
    backupMediaToCloud(f, sig, 'clip'); // manual reconnections also go to the cloud rendezvous, no re-prompt on the next device
    const url = URL.createObjectURL(f);
    clipFilesRef.current.set(url, f);
    void saveLocalVideo(f, sig).catch(() => {});
    const old = s.src;
    setComp((c) => ({ ...c, shots: (c.shots ?? []).map((x) => (x.src === old ? { ...x, src: url, srcSig: sig } : x)) }));
    toast.success(t('workbench.bRollReconnected'));
  };
  /** Image → 5-second still-frame video (the user-defined default): freeze on canvas + MediaBunny avc mp4, no audio track
   *  = silent clip. Uses a video shape rather than adding an image branch to shots — trim/split/framing/captions/export
   *  all work automatically with zero changes. 30fps of identical frames, near-zero encode cost; dimensions clamped ≤1920 and made even (avc requirement). */
  const STILL_CLIP_SEC = 5;
  const stillClipFromImage = async (blob: Blob, label?: string): Promise<File | null> => {
    try {
      const bmp = await createImageBitmap(blob);
      const scale = Math.min(1, 1920 / Math.max(bmp.width, bmp.height));
      const w = Math.max(2, Math.round((bmp.width * scale) / 2) * 2);
      const h = Math.max(2, Math.round((bmp.height * scale) / 2) * 2);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
      bmp.close();
      const { BufferTarget, CanvasSource, Mp4OutputFormat, Output } = await import('mediabunny');
      const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
      const source = new CanvasSource(canvas, { codec: 'avc', bitrate: 2_000_000 });
      output.addVideoTrack(source, { frameRate: 30 });
      await output.start();
      for (let i = 0; i < STILL_CLIP_SEC * 30; i++) await source.add(i / 30, 1 / 30);
      await output.finalize();
      const buf = (output.target as { buffer: ArrayBuffer | null }).buffer;
      if (!buf) return null;
      // Filename carries size + label: fileSig=name:size:0, and a plain 'still.mp4' collides on sig whenever size collides (cloud backup / OPFS cross-contamination)
      const name = `still-${w}x${h}-${(label || 'image').replace(/[^\w一-龥-]/g, '').slice(0, 24) || 'image'}.mp4`;
      return new File([buf], name, { type: 'video/mp4', lastModified: 0 });
    } catch (e) {
      console.warn('[studio] still clip encode failed', e);
      return null;
    }
  };
  /** Dragging a library image/video onto the main track = insert a clip (per user 2026-07-17, reversing "video-into-main-track
   *  was cut" — what was cut back then was OS file drops; library assets have direct links and caching, so the experience holds).
   *  Bytes first via the asset direct link (CDN CORS is allowed), falling back to the /api/media/fetch same-origin proxy; then
   *  the same insertClipCore as the "+" button (OPFS/cloud backup/caption auto-follow all reused). */
  const insertLibraryClipAt = async (a: MediaRef & { label?: string }, at: number) => {
    setClipPending(at);
    try {
      let blob: Blob | null = null;
      try {
        const r = await fetch(a.url);
        if (r.ok) blob = await r.blob();
      } catch {
        /* CORS/network → proxy fallback */
      }
      if (!blob) {
        const r = await fetch(`/api/media/fetch?url=${encodeURIComponent(a.url)}`).catch(() => null);
        if (r?.ok) blob = await r.blob();
      }
      if (!blob) {
        toast.error(t('workbench.couldNotFetchAsset'));
        return;
      }
      if (a.type === 'video') {
        const name = `clip-${(a.label || 'video').replace(/[^\w一-龥-]/g, '').slice(0, 24) || 'video'}.mp4`;
        const f = new File([blob], name, { type: blob.type || 'video/mp4', lastModified: 0 });
        const url = URL.createObjectURL(f);
        const dur = await videoDurationOf(url);
        if (!dur) {
          URL.revokeObjectURL(url);
          toast.error(t('workbench.couldNotReadDuration'));
          return;
        }
        void saveLocalVideo(f, fileSig(f)).catch(() => {});
        insertClipCore(url, Math.round(dur * 100) / 100, at, f);
      } else {
        const f = await stillClipFromImage(blob, a.label);
        if (!f) {
          toast.error(t('workbench.couldNotConvertImage'));
          return;
        }
        const url = URL.createObjectURL(f);
        void saveLocalVideo(f, fileSig(f)).catch(() => {});
        insertClipCore(url, STILL_CLIP_SEC, at, f);
      }
    } finally {
      setClipPending(null);
    }
  };
  /** Shot-boundary "+": pick a local video → insert at that split point. Like the main video, **kept local, not uploaded**
   *  (per user; uploading previously hit the 200MB direct-upload cap) — blob preview, the File is injected into the iframe via hf:clipFile. */
  const insertLocalClipAt = async (at: number) => {
    const f = await pickFile('video/*');
    if (!f) return;
    setClipPending(at);
    try {
      const url = URL.createObjectURL(f);
      const dur = await videoDurationOf(url);
      if (!dur) {
        URL.revokeObjectURL(url);
        toast.error(t('workbench.couldNotReadDuration'));
        return;
      }
      void saveLocalVideo(f, fileSig(f)); // OPFS local library: draft restore fetches by srcSig
      insertClipCore(url, Math.round(dur * 100) / 100, at, f);
    } finally {
      setClipPending(null);
    }
  };

  /** The script panel's scissors: delete a batch of (source, source-time range) (shared by delete-sentence / delete-silence
   *  / delete-filler; the mapping math is in trim.removeSrcRanges); grouped and computed per source (source timelines are
   *  independent), overlay blocks compressed in the order deletions occur; one setComp (rebuilds flicker only once). */
  const cutSrcRanges = (cuts: ScriptCut[], msg: string) => {
    const c0 = compRef.current;
    if (!c0.video || !cuts.length) return;
    pushUndoSnapshot();
    const groups = new Map<string | null, [number, number][]>();
    for (const it of cuts) groups.set(it.src, [...(groups.get(it.src) ?? []), it.range]);
    let shots = ensureShots(c0);
    let blocks = c0.blocks;
    let cut = 0;
    for (const [src, ranges] of groups) {
      const r = removeSrcRanges(shots, ranges, (base, srcStart, srcEnd) => ({ ...base, id: shotId(), srcStart, srcEnd }), (c) => (c.src ?? null) === src);
      cut += r.removed.reduce((a, [x, y]) => a + (y - x), 0);
      // Non-caption blocks compressed by the deleted spans; the caption layer is recomputed whole at the end (captions = a pure computed product of the transcript, word times must follow the new edit)
      blocks = r.removed.reduce((bs, [a, b]) => removeEditedInterval(bs, a, b), blocks);
      shots = r.clips;
    }
    if (cut < 0.01) {
      toast.info(t('workbench.thoseRangesAlreadyOut'));
      return;
    }
    blocks = relayCaptionLayer(blocks, shots, asrRef.current);
    setComp((c) => ({ ...c, shots, blocks }));
    setSelectedShotId(null);
    setSelectedId(null);
    const lastSp = clipSpans(shots);
    const newDur = lastSp.length ? lastSp[lastSp.length - 1]!.editedEnd : 0;
    applyT(Math.max(0, Math.min(tRef.current, Math.max(0, newDur - 0.05))));
    toast.success(t('workbench.msgUndoHint', { msg }));
  };
  /** Script panel "restore": reconnect a deleted (source, source range) back into the video (the gap merges into an adjacent
   *  same-source shot or inserts a new shot); overlay blocks after the restore point shift right by the restored duration to stay content-aligned. */
  const restoreSrcRanges = (cuts: ScriptCut[], msg: string) => {
    const c0 = compRef.current;
    if (!c0.video || !cuts.length) return;
    pushUndoSnapshot();
    let shots = ensureShots(c0);
    let blocks = c0.blocks;
    let restored = 0;
    for (const { src, range: [s, e] } of cuts) {
      const before = shots;
      const inSrc = (c: VideoShot) => (c.src ?? null) === src;
      // An insert source entirely absent from the video = no anchor and no srcSig, unrecoverable (the panel only emits words for present sources, so this shouldn't happen in theory)
      if (src && !before.some(inSrc)) continue;
      const srcSig = src ? before.find((c) => c.src === src)?.srcSig : undefined;
      const durBefore = clipSpans(before).at(-1)?.editedEnd ?? 0;
      shots = restoreSrcRange(
        before,
        s,
        e,
        (a, b) => ({ id: shotId(), ...(src ? { src, ...(srcSig ? { srcSig } : {}) } : {}), srcStart: a, srcEnd: b, treatment: 'full' as const }),
        (c) => !c.partnerBlockId,
        inSrc,
      );
      if (shots === before) continue;
      const durAfter = clipSpans(shots).at(-1)?.editedEnd ?? 0;
      const len = durAfter - durBefore;
      if (len <= 0.01) continue;
      restored += len;
      // The restored segment's final-cut start: where s lands on the new shots (only same-source clips count, different-source seconds would collide numerically); blocks after it shift right as a whole
      const sp = clipSpans(shots).find((x) => inSrc(x.clip) && s >= x.clip.srcStart - 1e-3 && s < x.clip.srcEnd);
      const at = sp ? sp.editedStart + Math.max(0, s - sp.clip.srcStart) : 0;
      blocks = blocks.map((b) => (b.startSec >= at - 1e-3 ? { ...b, startSec: b.startSec + len } : b));
    }
    if (restored < 0.01) {
      toast.info(t('workbench.contentAlreadyInVideo'));
      return;
    }
    const relaid = relayCaptionLayer(blocks, shots, asrRef.current);
    setComp((c) => ({ ...c, shots, blocks: relaid }));
    setSelectedShotId(null);
    toast.success(t('workbench.msgUndoHint', { msg }));
  };
  /** Script panel "replace word": edit the transcript (word + sentence text), and the caption layer is **recomputed whole**
   *  (captions = a pure computed product of the transcript; changing a word may change segment width → segmentation boundaries
   *  shift, per-block patches can't keep up). Text only, audio untouched. src identifies which source's script. */
  const replaceScriptWord = (src: string | null, si: number, word: { start: number; end: number }, text: string) => {
    const txt = text.trim();
    if (!txt) return;
    const isSame = (x: { start: number; end: number }) => Math.abs(x.start - word.start) < 1e-3 && Math.abs(x.end - word.end) < 1e-3;
    const patchSent = (s: AsrSegment): AsrSegment => {
      const words = (s.words?.length ? s.words : wordsFromText(s.text, s.start, s.end)).map((w) => (isSame(w) ? { ...w, text: txt } : w));
      return { ...s, words, text: words.map((w) => w.text).join('') };
    };
    if (src == null) {
      const prev = asrRef.current;
      if (!prev?.[si]) return;
      const next = [...prev];
      next[si] = patchSent(prev[si]!);
      setAsrSentences(next);
      asrRef.current = next; // mirror immediately (the state mirror writes on next render): the recompute below needs the latest transcript
    } else {
      const list = clipAsrRef.current[src];
      if (!list?.[si]) return;
      const next = { ...clipAsrRef.current, [src]: list.map((x, i) => (i === si ? patchSent(x) : x)) };
      setClipAsr(next);
      clipAsrRef.current = next;
    }
    setComp((c) => ({ ...c, blocks: relayCaptionLayer(c.blocks, ensureShots(c), asrRef.current) }));
    toast.success(t('workbench.replacedText', { text: txt }));
  };
  /** The script panel's "extract narration script" (spinner prevents double-clicks; errors toast). */
  const [asrBusy, setAsrBusy] = useState(false);
  const asrBusyRef = useRef(false);
  const extractForScript = async () => {
    if (asrBusyRef.current) return;
    asrBusyRef.current = true;
    setAsrBusy(true);
    try {
      await stepAsr();
    } catch (e) {
      console.warn('[studio] extract asr failed', e);
      toast.error(t('workbench.transcriptExtractionFailed'));
    } finally {
      asrBusyRef.current = false;
      setAsrBusy(false);
    }
  };
  // Opening the script panel auto-extracts (no button needed): fileSig cache hit returns instantly; runs ASR once if uncached.
  // Only triggers when asrSentences is still null (never extracted) — an empty array = extracted but empty, don't retry in a loop
  useEffect(() => {
    if (floatWin !== 'script' || !comp.video || asrSentences != null) return;
    void extractForScript();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floatWin, comp.video, asrSentences]);

  /** Cut: split the current shot in two at the playhead (content unchanged). Compute first, push the snapshot after —
   *  if it lands on a boundary and doesn't cut, don't touch the undo/redo stack (clearing the redo line without re-rendering would leave button states stale). */
  const splitAtPlayhead = () => {
    const c = compRef.current;
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
  const captionsOn = comp.blocks.some(isSentenceCaption);
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
  /** Edge-handle stretch (same as caption line width, per user: change the box size on this axis, content reflows to fill,
   *  no crop, no locked ratio): the opposite edge is anchored; contentBox resets to = box (old crop semantics are dropped,
   *  legacy cropped blocks reset to full-fill on one drag). The process writes directly in the iframe via hf:boxSize (zero React re-render), one commit on release. */
  const edgeDrag = (e: React.PointerEvent, blk: Block, side: 'l' | 'r' | 't' | 'b') => {
    if (!blk.box) return;
    const box0 = blk.box;
    const kf = fit || 1;
    const c = compRef.current;
    let g = { ...box0 };
    startPointerDrag(e, {
      onStart: () => {
        dragCursorRef.current = side === 'l' || side === 'r' ? 'ew-resize' : 'ns-resize';
        setBodyDragging(true);
      },
      onFrame: (px, py) => {
        const dx = px / (c.width * kf);
        const dy = py / (c.height * kf);
        g = { ...box0 };
        if (side === 'r') g.w = Math.max(0.04, box0.w + dx);
        else if (side === 'l') {
          g.w = Math.max(0.04, box0.w - dx);
          g.x = box0.x + box0.w - g.w;
        } else if (side === 'b') g.h = Math.max(0.03, box0.h + dy);
        else {
          g.h = Math.max(0.03, box0.h - dy);
          g.y = box0.y + box0.h - g.h;
        }
        setGhostRect(g); // ghost follows the pointer, content doesn't update live (applied once on release via the rebuild-free channel)
      },
      onEnd: () => {
        setBodyDragging(false);
        setGhostRect(null);
        const gg = g;
        setComp((cc) => ({
          ...cc,
          blocks: cc.blocks.map((b) => (b.id === blk.id && b.box ? { ...b, box: gg, contentBox: undefined } : b)),
        }));
      },
    });
  };
  /** Corner-handle scale: the diagonal corner is anchored, the process writes directly in the iframe via hf:boxSize (zero React re-render), one commit on release.
   *  - custom (component) blocks: **box locks aspect ratio** (per user: corners = inner container keeps its ratio). Content
   *    isn't transform-scaled — the inner container's real size follows the box via the %-binding from insert, and font size adjusts automatically with the container via cq units;
   *  - others (media, etc.): free scaling, no locked ratio, content reflows to fill (original behavior). */
  const scaleDrag = (e: React.PointerEvent, blk: Block, sgnX: 1 | -1, sgnY: 1 | -1) => {
    if (!blk.box) return;
    const box0 = blk.box;
    const kf = fit || 1;
    const c = compRef.current;
    const uniform = blockKind(blk) === 'custom';
    let g = { ...box0 };
    startPointerDrag(e, {
      onStart: () => {
        dragCursorRef.current = sgnX * sgnY > 0 ? 'nwse-resize' : 'nesw-resize';
        setBodyDragging(true);
      },
      onFrame: (px, py) => {
        const dx = px / (c.width * kf);
        const dy = py / (c.height * kf);
        g = { ...box0 };
        if (uniform) {
          // Horizontal-driven proportional scale: k = new width/old width, height follows ×k (diagonal anchored)
          const w = Math.max(0.04, sgnX > 0 ? box0.w + dx : box0.w - dx);
          const k = w / box0.w;
          g.w = w;
          g.h = Math.max(0.03, box0.h * k);
          if (sgnX < 0) g.x = box0.x + box0.w - g.w;
          if (sgnY < 0) g.y = box0.y + box0.h - g.h;
        } else {
          if (sgnX > 0) g.w = Math.max(0.04, box0.w + dx);
          else {
            g.w = Math.max(0.04, box0.w - dx);
            g.x = box0.x + box0.w - g.w;
          }
          if (sgnY > 0) g.h = Math.max(0.03, box0.h + dy);
          else {
            g.h = Math.max(0.03, box0.h - dy);
            g.y = box0.y + box0.h - g.h;
          }
        }
        setGhostRect(g); // ghost follows the pointer, content doesn't update live (applied once on release via the rebuild-free channel)
      },
      onEnd: () => {
        setBodyDragging(false);
        setGhostRect(null);
        const gg = g;
        setComp((cc) => ({
          ...cc,
          blocks: cc.blocks.map((b) => (b.id === blk.id && b.box ? { ...b, box: gg, contentBox: undefined } : b)),
        }));
      },
    });
  };

  /** Floating toolbar drag handle: parent-side ghost semantics (like edge/corner handles) — dashed box follows the pointer
   *  + center snap guides, content doesn't move live, one shiftBox commit on release (applied via the rebuild-free channel). */
  const gripDrag = (e: React.PointerEvent, gripBlockId: string) => {
    const blk = compRef.current.blocks.find((b) => b.id === gripBlockId);
    const box0 = blk?.box;
    if (!blk || !box0 || genIdsRef.current.has(blk.id)) return;
    const sr = stageBoxRef.current?.getBoundingClientRect();
    if (!sr) return;
    let dxn = 0;
    let dyn = 0;
    startPointerDrag(e, {
      onFrame: (dx, dy) => {
        dxn = dx / sr.width;
        dyn = dy / sr.height;
        // Center snap (same as body drag: the block center snaps to the canvas midline within 1.5%)
        const cx = box0.x + box0.w / 2 + dxn;
        const cy = box0.y + box0.h / 2 + dyn;
        const snapX = Math.abs(cx - 0.5) < 0.015;
        const snapY = Math.abs(cy - 0.5) < 0.015;
        if (snapX) dxn = 0.5 - (box0.x + box0.w / 2);
        if (snapY) dyn = 0.5 - (box0.y + box0.h / 2);
        setGuideVis(snapX, snapY);
        setGhostRect({ x: box0.x + dxn, y: box0.y + dyn, w: box0.w, h: box0.h });
      },
      onEnd: () => {
        setGuideVis(false, false);
        setGhostRect(null);
        if (dxn || dyn) setComp((cc) => ({ ...cc, blocks: cc.blocks.map((b) => (b.id === blk.id ? shiftBox(b, dxn, dyn) : b)) }));
      },
    });
  };
  /** Bottom rotate handle: rotate around the component center by the pointer angle, live via hf:rotate directly in the iframe (zero re-render), commits to Block.rotation on release.
   *  Shift = 15° snap. */
  const rotateDrag = (e: React.PointerEvent, block: Block) => {
    const box = block.box;
    const stage = stageBoxRef.current;
    if (!box || !stage) return;
    const rect = stage.getBoundingClientRect();
    const cx = rect.left + (box.x + box.w / 2) * rect.width;
    const cy = rect.top + (box.y + box.h / 2) * rect.height;
    const base = block.rotation ?? 0;
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx);
    let deg = base;
    startPointerDrag(e, {
      onStart: () => {
        if (rotateLabelRef.current) rotateLabelRef.current.style.display = 'block'; // show the angle as soon as dragging starts (even from 0°)
      },
      onFrame: (_dx, _dy, ev) => {
        const a = Math.atan2(ev.clientY - cy, ev.clientX - cx);
        let d = base + ((a - a0) * 180) / Math.PI;
        if (ev.shiftKey) d = Math.round(d / 15) * 15;
        d = Math.round(d);
        while (d > 180) d -= 360;
        while (d < -180) d += 360;
        deg = d;
        postPreview({ type: 'hf:rotate', blockId: block.id, deg }); // the card in the iframe rotates live
        if (rotateOverlayRef.current) rotateOverlayRef.current.style.transform = deg ? `rotate(${deg}deg)` : ''; // selection box/handles rotate with it
        if (rotateLabelRef.current) {
          rotateLabelRef.current.textContent = `${deg}°`;
          rotateLabelRef.current.style.transform = deg ? `rotate(${-deg}deg)` : ''; // counter-rotate to keep the number upright
        }
      },
      onEnd: () => setBlockRotation(block.id, deg),
    });
  };
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
  /* ---------- chat agent: can @ components + request context + client-executed tools ---------- */
  // Memo by **content key** (not array identity): box drag etc. changes the blocks array identity every frame but id/label/kind
  // don't change — keeping elements identity stable so the memoized StudioChat doesn't re-render every frame.
  const chatElemsKey = [
    comp.blocks.map((b) => `${b.id}${b.templateId}${b.label ?? ''}`).join(''),
    (comp.shots ?? []).map((s) => s.id).join(''),
  ].join('');
  const chatElements = useMemo<StudioElementRef[]>(
    () => [
      ...compRef.current.blocks.map((b) => ({ id: b.id, label: b.label?.slice(0, 16) || blockKind(b), kind: blockKind(b), isShot: false })),
      ...(compRef.current.shots ?? []).map((s, i) => ({ id: s.id, label: t('workbench.shotN', { n: i + 1 }), kind: 'shot', isShot: true })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatElemsKey],
  );

  /** The situation at the moment a chat message is sent (composition snapshot / selection / playhead / pipeline; attached
   *  as message metadata). The narration script isn't here — it's anchored to source time and doesn't change with editing,
   *  so it enters the feed once via the extract_asr receipt / read_script, no need to resend each round (prompt-cache friendly). */
  const getChatBody = useCallback((): Record<string, unknown> => {
    const c = compRef.current;
    let sel: { id: string; type: 'block' | 'shot'; label?: string; kind?: string } | null = null;
    if (selectedIdRef.current) {
      const b = c.blocks.find((x) => x.id === selectedIdRef.current);
      if (b) sel = { id: b.id, type: 'block', label: b.label, kind: blockKind(b) };
    } else if (selectedShotIdRef.current) {
      const i = (c.shots ?? []).findIndex((s) => s.id === selectedShotIdRef.current);
      if (i >= 0) sel = { id: selectedShotIdRef.current, type: 'shot', label: `Shot #${i + 1}`, kind: 'shot' };
    }
    return {
      composition: {
        durationSec: totalDuration(c),
        theme: c.theme,
        // Caption layer state (on/off + current preset/position): lets the agent decide set vs remove, and avoid re-enabling
        ...(c.blocks.some(isSentenceCaption)
          ? (() => {
              const cs = resolveCaptionStyle(c);
              return { captions: { preset: cs.preset, yPct: Math.round(cs.yPct) } };
            })()
          : {}),
        blocks: c.blocks.map((b) => ({
          id: b.id,
          label: b.label,
          kind: blockKind(b),
          startSec: b.startSec,
          durationSec: b.durationSec,
          ...(isPlaceholder(b) ? { placeholder: true } : {}),
        })),
        // Each shot carries its final-cut span (the addressing clock for cut_range/split/trim/add_block) + an insert-source short tag
        // (same insert source = same letter, so two different external clips are distinguishable; the main source isn't tagged) — fixes "the agent cuts using source seconds as if they were final-cut seconds"
        shots: (() => {
          const tag = new Map<string, string>();
          for (const s of c.shots ?? []) if (s.src && !tag.has(s.src)) tag.set(s.src, String.fromCharCode(65 + tag.size));
          return clipSpans(c.shots ?? []).map((sp, i) => ({
            id: sp.clip.id,
            index: i + 1,
            editedStart: sp.editedStart,
            editedEnd: sp.editedEnd,
            srcStart: sp.clip.srcStart,
            srcEnd: sp.clip.srcEnd,
            treatment: sp.clip.treatment,
            ...(sp.clip.src ? { source: tag.get(sp.clip.src) } : {}),
          }));
        })(),
      },
      selected: sel,
      playheadSec: tRef.current,
      // Pipeline state: so the agent doesn't blindly rerun, nor claim a transcript that doesn't exist
      pipeline: { asr: !!asrRef.current?.length, plan: !!planRef.current, visual: !!visualRef.current },
      // Main-video byte-mount state: the project should have a video (has shots / has sig) but bytes aren't ready → tell the agent explicitly
      // (a handoff-just-opened tab is often in the OPFS miss → cloud fetch window; the data plane is complete)
      ...((videoSigRef.current || (c.shots ?? []).length) && !videoFileRef.current ? { videoBytesReady: false } : {}),
    };
  }, []);

  /** Narration script → text fed to the agent: all main-source sentences + one section per insert source (each in its own
   *  source-file seconds, annotated with the owning shot id). Machine-facing English; shared by the extract_asr receipt and read_script. */
  const transcriptForAgent = (): string => {
    const rd = (x: number) => Math.round(x * 10) / 10;
    const row = (s: AsrSegment, i: number) => `  ${i}. [${rd(s.start)}–${rd(s.end)}s] ${s.text}`;
    const parts: string[] = [];
    const main = asrRef.current ?? [];
    parts.push(`MAIN NARRATION (source-video seconds — never shift when the video is cut; shot src in→out uses the same clock):\n${main.map(row).join('\n')}`);
    const bySrc = new Map<string, string[]>();
    for (const s of compRef.current.shots ?? []) {
      if (!s.src) continue;
      bySrc.set(s.src, [...(bySrc.get(s.src) ?? []), s.id]);
    }
    for (const [src, ids] of bySrc) {
      const segs = clipAsrRef.current[src];
      const head = `INSERTED CLIP for shot(s) ${ids.map((x) => `@${x}`).join(', ')} (its OWN source seconds; does not map to the narration clock)`;
      if (!segs) parts.push(`${head}: (no transcript — transcription unavailable for this clip)`);
      else if (!segs.length) parts.push(`${head}: (no speech detected)`);
      else parts.push(`${head}:\n${segs.map(row).join('\n')}`);
    }
    const out = parts.join('\n');
    return out.length > 4000 ? `${out.slice(0, 4000)}\n…(truncated)` : out;
  };
  /** Fill in insert-source transcripts (triggered on demand by read_script — policy: when captions are off, only transcribe when the LLM needs it).
   *  Shares the busy/fail lists with the panel transcription effect: failures don't re-burn ASR, in-flight ones are awaited. */
  const ensureClipTranscripts = async (): Promise<void> => {
    // Blacklist + tell the user (reported once per src: after blacklisting, the top continue won't reach here again) —
    // with only a console.warn the user has no idea why an inserted clip has no captions
    const failClipAsr = (src: string) => {
      if (clipAsrFailRef.current.has(src)) return;
      clipAsrFailRef.current.add(src);
      toast.error(t('workbench.bRollTranscriptionFailed'));
    };
    const srcs = [...new Set((compRef.current.shots ?? []).filter((s) => s.src).map((s) => s.src!))];
    for (const src of srcs) {
      if (clipAsrRef.current[src] || clipAsrFailRef.current.has(src)) continue;
      if (clipAsrBusyRef.current.has(src)) {
        const t0 = Date.now();
        while (clipAsrBusyRef.current.has(src) && Date.now() - t0 < 45000) await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      clipAsrBusyRef.current.add(src);
      try {
        const shot = (compRef.current.shots ?? []).find((s) => s.src === src)!;
        const got = await matteFileForShot(shot);
        if (!got) {
          failClipAsr(src);
          continue;
        }
        const segs = await studioProviders().transcriber.transcribe(got.file);
        setClipAsr((m) => ({ ...m, [src]: segs }));
        clipAsrRef.current = { ...clipAsrRef.current, [src]: segs };
      } catch (e) {
        console.warn('[studio] clip transcribe failed', e);
        failClipAsr(src);
      } finally {
        clipAsrBusyRef.current.delete(src);
      }
    }
  };

  // Inserted clip → planning context: anchor = the srcEnd of the nearest preceding main-source segment (main-source time domain, the plan's clock);
  // text = the transcribed sentences within that insert window (the two split halves of the same source share the whole transcript, filtered by window)
  insertedClipsForPlanRef.current = async () => {
    const shots = compRef.current.shots ?? [];
    if (!shots.some((s) => s.src)) return [];
    await ensureClipTranscripts(); // transcribe on demand (busy/fail lists handled internally, no re-burning ASR)
    // Pure function in captions-relay (same as the offline executor): carrying sentences = the input surface for equal-standing shots
    return insertPlanContexts(shots, clipAsrRef.current);
  };

  /** Context backfill for the shot draft (shared by lay_out and add_graphics's "shots first" to prevent drift between the two):
   *  1) design state preserved across rebuilds: frame (the user's explicit design system) > frame-derived palette; global caption style;
   *  2) multi-source main track: inserted clips are the body of the video and must not be overwritten by re-layout — insert them
   *     back at the nearest boundary at their original final-cut position, blocks after shift along (same mirror logic as manual
   *     insert), each insert window lands its image placeholder per **its own narration** (equal-standing, per user; main-source
   *     placeholders that slide into the window are dropped to avoid mismatched briefs); placeholder positions use the inserted
   *     clip's own geometry analysis (local File + MediaPipe, avoiding faces), falling back to a fixed box on unavailable/failure. */
  const restoreDraftContext = async (draft: Composition, vis: VisualTimeline | null): Promise<Composition> => {
    const keep = compRef.current;
    if (keep.frameId) {
      draft.frameId = keep.frameId;
      if (keep.palette) draft.palette = keep.palette;
    } else if (vis?.palette) {
      draft.palette = vis.palette;
    }
    if (keep.captionStyle) draft.captionStyle = keep.captionStyle;
    const inserted = clipSpans(keep.shots ?? []).filter((sp) => sp.clip.src);
    if (inserted.length && draft.shots?.length) {
      // The transcript cache may be cold (a plan cache hit doesn't trigger insert-source transcription) — fill it before inserting back,
      // otherwise speech is empty and the inserted clip can't land its own image placeholder
      await ensureClipTranscripts();
      let shots2 = draft.shots;
      let blocks2 = draft.blocks;
      const planCtx = insertPlanContexts(keep.shots ?? [], clipAsrRef.current); // same enumeration as the planning input (clip index = subscript + 1)
      const extraBlocks: Block[] = []; // per-scene placeholders produced by equal-standing shots
      const insertWins: { start: number; end: number; speech: string; planned?: boolean; layout?: { box: GraphicBox; hasFace: boolean } }[] = [];
      for (const [k, sp] of inserted.entries()) {
        const bounds = [0, ...clipSpans(shots2).map((x) => x.editedEnd)];
        let idx = 0;
        let at = 0;
        let best = Infinity;
        bounds.forEach((b, i) => {
          const d = Math.abs(b - sp.editedStart);
          if (d < best) {
            best = d;
            at = b;
            idx = i;
          }
        });
        const len = sp.editedEnd - sp.editedStart;
        shots2 = [...shots2.slice(0, idx), sp.clip, ...shots2.slice(idx)];
        blocks2 = blocks2.map((b) => (b.startSec >= at - 1e-3 ? { ...b, startSec: b.startSec + len } : b));
        const speech = (clipAsrRef.current[sp.clip.src!] ?? [])
          .filter((x) => x.end > sp.clip.srcStart + 0.05 && x.start < sp.clip.srcEnd - 0.05)
          .map((x) => x.text)
          .join('');
        // Inserted-clip geometry position (P1④ multi-source equal-standing): only run if there's a local File (a few frames of
        // MediaPipe, free and fast; remote/dead links aren't fetched, just fall back). Failure / no MediaPipe → undefined = always the fallback box, never breaks the shot chain.
        let layout: { box: GraphicBox; hasFace: boolean } | undefined;
        try {
          const f = sp.clip.src ? clipFilesRef.current.get(sp.clip.src) : undefined;
          if (f) {
            const zone = await insertedClipSafeZone(f, sp.clip.srcStart, sp.clip.srcEnd);
            if (zone) layout = { box: pickGraphicBox(zone.rects, zone.face ? [zone.face] : []), hasFace: !!zone.face };
          }
        } catch {
          /* geometry analysis failed → fall back to the status quo (FULL_GRAPHIC_BOX) */
        }
        // Equal-standing shots: the plan gave this inserted clip its own scenes (clip index = enumeration subscript + 1) → slice
        // shots + framing + per-scene placeholders; if it doesn't line up (no plan / no sentences / can't slice) fall back to the whole-clip single-beat old path
        const planned = planRef.current?.inserts?.find((x) => x.clip === k + 1);
        const sentences = planCtx[k]?.sentences;
        let sliced: { shots: VideoShot[]; blocks: Block[] } | null = null;
        if (planned?.scenes.length && sentences?.length) {
          sliced = layoutInsertWindow({ win: { start: at, end: at + len }, clip: sp.clip, sentences, scenes: planned.scenes, layout });
        }
        if (sliced) {
          shots2 = [...shots2.slice(0, idx), ...sliced.shots, ...shots2.slice(idx + 1)]; // replace the whole clip just inserted
          extraBlocks.push(...sliced.blocks);
        }
        insertWins.push({ start: at, end: at + len, speech, ...(sliced ? { planned: true } : {}), ...(layout ? { layout } : {}) });
      }
      draft.shots = shots2;
      const insertPh = insertWins.filter((w) => !w.planned).map((w) => insertedClipPlaceholder(w, w.speech, w.layout)).filter((b): b is Block => !!b);
      draft.blocks = [...dropPlaceholdersInWindows(blocks2, insertWins), ...insertPh, ...extraBlocks];
    }
    return draft;
  };

  /** Narration beats within a placeholder/component window (pure function in captions-relay, used on both ends), thin wrapper feeding refs. */
  const beatsForWindow = (startSec: number, durationSec: number): { text: string; start: number; end: number }[] =>
    beatsForWindowPure(compRef.current.shots ?? [], asrRef.current, clipAsrRef.current, startSec, durationSec);
  /** Roster of graphic slots in the same video (placeholders + filled custom, in time order) — fed to compose for anti-monotony. */
  const graphicsRoster = (): { id: string; desc: string }[] => {
    const describeSlot = (b: Block) => {
      const comp = /component: ([a-z-]+)/.exec(placeholderSpec(b))?.[1];
      return `${comp ? `[${comp}] ` : ''}${b.label ?? ''}`.trim() || '(fragment)';
    };
    return compRef.current.blocks
      .filter((b) => isPlaceholder(b) || b.templateId === 'custom')
      .sort((a, b) => a.startSec - b.startSec)
      .map((b, i) => ({ id: b.id, desc: `${i + 1}. ${describeSlot(b)}` }));
  };
  /** roster → neighbor list from a block's perspective (self marked «THIS»); a single block has no neighbors. */
  const neighborsFrom = (roster: { id: string; desc: string }[], selfId: string): string[] | undefined =>
    roster.length > 1 ? roster.map((r) => (r.id === selfId ? `${r.desc}  «THIS»` : r.desc)) : undefined;

  /** Client-side execution of a tool call: mutate Composition state / call compose to generate a block.
   *  Not memoized — StudioChat holds the latest reference via ref, rebuilt each frame to guarantee reading the latest state/closures. */
  const runStudioTool = async (toolId: string, input: Record<string, unknown>): Promise<StudioToolResult> => {
      const c = compRef.current;
      const r1 = (x: unknown) => Math.round(Number(x) * 10) / 10;
      const findBlock = (id: unknown) => c.blocks.find((b) => b.id === id);
      const findShot = (id: unknown) => (c.shots ?? []).find((s) => s.id === id);
      const bname = (b: Block) => b.label?.slice(0, 10) || blockKind(b);
      // Pipeline tools: push friendly progress to this tool's card (matched by toolId), cleared on finish
      const report = (text: string, frac?: number) => setToolProgress({ id: toolId, text, ...(frac != null ? { frac } : {}) });
      // Mutating tools push an undo snapshot first (except query/locate/pure-analysis/undo itself); cap 20
      const READONLY_TOOLS = new Set(['get_block', 'focus_element', 'seek', 'play', 'pause', 'undo', 'extract_asr', 'read_script', 'analyze_narration', 'analyze_visual', 'export_video', 'track_export']);
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
              const segs = await stepAsr(report);
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
              const vis = await stepVisual(report);
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
              const segs = await stepAsr(report);
              if (!segs.length) return { ok: false, error: t('workbench.noSpeechDetectedTry') };
              // Planning ‖ visual analysis in parallel (visual is the long pole, progress driven by it)
              const [plan, vis] = await Promise.all([stepPlan(report), stepVisual(report)]);
              report(t('workbench.cuttingShots'));
              const draft = await restoreDraftContext(
                layoutFromPlan(plan, { video: v, sentences: segs, ...(vis ? { cuts: vis.cuts, visual: vis } : {}) }),
                vis,
              );
              setComp(draft);
              setSelectedId(null);
              setSelectedShotId(null);
              applyT(0);
              const slots = draft.blocks.filter(isPlaceholder).length;
              // Don't resend the situation snapshot within the round: the new structure's ids come with the receipt, so later add_graphics/focus can target precisely
              return {
                ok: true,
                summary: slots
                  ? t('workbench.shotsDoneWithSlots', { shots: draft.shots?.length ?? 0, slots })
                  : t('workbench.shotsDoneNoSlots', { shots: draft.shots?.length ?? 0 }),
                data: {
                  shots: (draft.shots ?? []).map((s, i) => ({ id: s.id, index: i + 1, srcStart: s.srcStart, srcEnd: s.srcEnd, treatment: s.treatment })),
                  placeholderBlocks: draft.blocks.filter(isPlaceholder).map((b) => ({ id: b.id, label: b.label })),
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
                const segs = await stepAsr(report);
                if (!v || !segs.length) return { ok: false, error: t('workbench.noSpeechDetectedTry') };
                const [plan, vis] = await Promise.all([stepPlan(report), stepVisual(report)]);
                // Same backfill as lay_out: preserve design state + reinsert inserted clips (this path was a simplified duplicate before,
                // so saying "add graphics" right after inserting a clip would drop the whole inserted clip)
                const draft = await restoreDraftContext(
                  layoutFromPlan(plan, { video: v, sentences: segs, ...(vis ? { cuts: vis.cuts, visual: vis } : {}) }),
                  vis,
                );
                setComp(draft);
              }
              let allSlots = compRef.current.blocks.filter(isPlaceholder);
              // Optional blockIds: only (re)fill the specified placeholders (the agent's "redo the 3rd one" doesn't run everything)
              const wantIds = Array.isArray(input.blockIds) ? new Set((input.blockIds as unknown[]).map(String)) : null;
              if (wantIds) allSlots = allSlots.filter((b) => wantIds.has(b.id));
              if (!allSlots.length) {
                if (wantIds) return { ok: false, error: t('workbench.specifiedBlocksNotGraphic') };
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
              const queue = [...slots];
              // Neighbor list (component + gist, in time order): fed to each compose so the model actively differs from adjacent components (anti-monotony).
              // Takes the graphic slots of the whole composition (placeholders + already-filled custom) — even when re-filling one, it can see what's around it.
              const roster = graphicsRoster();
              // Warm up insert-source transcripts: an insert-window placeholder's beats need its own source's sentences (a cold cache = missing beats)
              if ((compRef.current.shots ?? []).some((s) => s.src)) await ensureClipTranscripts();
              report(t('workbench.graphics0Total', { total: slots.length }), 0);
              const fillOne = async (slot: Block) => {
                const boxPx = slot.box
                  ? { w: Math.round(slot.box.w * compRef.current.width), h: Math.round(slot.box.h * compRef.current.height) }
                  : undefined;
                // Narration sentences within this placeholder's time window → local-time beats (logic in beatsForWindow, shared with BYO compose_context)
                const beats = beatsForWindow(slot.startSec, slot.durationSec);
                const neighbors = neighborsFrom(roster, slot.id);
                const seed = { id: slot.id, kind: 'custom', innerHtml: '<div></div>', timelineBody: '', label: slot.label ?? t('workbench.graphic'), durationSec: slot.durationSec, ...(boxPx ? { boxPx } : {}), ...(beats.length ? { beats } : {}), ...(neighbors ? { neighbors } : {}) };
                const parsed = await composeBlockChecked(seed, placeholderSpec(slot));
                setComp((cc) => ({
                  ...cc,
                  blocks: cc.blocks.map((b) =>
                    b.id === slot.id ? { ...b, templateId: 'custom', slots: { innerHtml: parsed.innerHtml, timelineBody: parsed.timelineBody } } : b,
                  ),
                }));
              };
              const worker = async () => {
                for (;;) {
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
                  report(t('workbench.graphicsDoneTotalLabel', { done, total: slots.length, label: (slot.label ?? '').slice(0, 12) }), done / slots.length);
                }
              };
              await Promise.all(Array.from({ length: Math.min(CONCURRENCY, slots.length) }, worker));
              const okCount = slots.length - failed;
              return {
                ok: okCount > 0,
                summary:
                  t('workbench.filledNDesignGraphics', { n: okCount }) +
                  (failed ? t('workbench.nFailedPlaceholdersRemain', { n: failed }) : ''),
                ...(okCount === 0 ? { error: t('workbench.allGraphicsFailedTry') } : {}),
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
            return { ok: true, summary: t('workbench.deletedFootageFromS', { from: r1(r.removed[0]), to: r1(r.removed[1]) }), data: { shotIds: r.clips.map((s) => s.id) } };
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
            // Bilingual captions: translations are written to the transcript sentence's sub (same semantics as the offline executor), the caption re-lay brings them out automatically
            const clear = input.clear === true;
            const items = (Array.isArray(input.items) ? input.items : [])
              .map((it) => {
                const o = (it ?? {}) as Record<string, unknown>;
                return { index: Number(o.index), text: typeof o.text === 'string' ? o.text.trim() : null };
              })
              .filter((it): it is { index: number; text: string } => Number.isInteger(it.index) && it.index >= 0 && it.text !== null);
            if (!clear && !items.length) return { ok: false, error: t('workbench.itemsEmptyInvalidNeed') };
            const stripSub = (segs: AsrSegment[]) => segs.map(({ sub: _s, ...rest }) => rest);
            let summary: string;
            if (clear) {
              if (asrRef.current) {
                const next = stripSub(asrRef.current);
                setAsrSentences(next);
                asrRef.current = next;
              }
              const nextClips = Object.fromEntries(Object.entries(clipAsrRef.current).map(([k, v]) => [k, stripSub(v)]));
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
              const next = segs.map((s, i) => {
                const hit = items.find((it) => it.index === i);
                if (!hit) return s;
                const { sub: _s, ...rest } = s;
                return hit.text ? { ...rest, sub: hit.text } : rest;
              });
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
            if (compRef.current.blocks.some(isSentenceCaption)) {
              setComp((cur) => ({ ...cur, blocks: relayCaptionLayer(cur.blocks, ensureShots(cur), asrRef.current) }));
              return { ok: true, summary };
            }
            return { ok: true, summary: summary + t('workbench.captionsOffTheyShow') };
          }
          case 'cut_narration': {
            if (!c.video) return { ok: false, error: t('workbench.noVideoYet') };
            const raw = Array.isArray(input.ranges) ? input.ranges : [];
            const shots0 = ensureShots(c);
            // Narration source seconds → final-cut seconds (loose: if a boundary lands in an already-deleted segment, snap to the nearest surviving point, still deleting the remaining part);
            // delete back to front so deleting an earlier segment doesn't shift later coordinates
            const edited = raw
              .map((r) => {
                const o = (r ?? {}) as Record<string, unknown>;
                return { from: Number(o.fromSec), to: Number(o.toSec) };
              })
              .filter((r) => Number.isFinite(r.from) && Number.isFinite(r.to) && r.to - r.from > 0.05)
              .map((r) => ({ from: srcToEditedLoose(shots0, r.from, inNarrationSource), to: srcToEditedLoose(shots0, r.to, inNarrationSource) }))
              .filter((r) => r.to - r.from > 0.05)
              .sort((a, b) => b.from - a.from);
            if (!edited.length) return { ok: false, error: t('workbench.rangesEmptyInvalidThose') };
            let shots = shots0;
            let blocks = c.blocks;
            let removedCount = 0;
            let firstCut = Infinity;
            for (const e of edited) {
              const rr = removeEditedRange(shots, e.from, e.to, (base, srcStart, srcEnd) => ({ ...base, id: shotId(), srcStart, srcEnd }));
              if (!rr.removed) continue;
              shots = rr.clips;
              blocks = removeEditedInterval(blocks, rr.removed[0], rr.removed[1]);
              removedCount++;
              firstCut = Math.min(firstCut, rr.removed[0]);
            }
            if (!removedCount) return { ok: false, error: t('workbench.thoseRangesDeletedThey') };
            const relaid = relayCaptionLayer(blocks, shots, asrRef.current); // captions follow the narration: deleted words drop out automatically
            setComp((cur) => ({ ...cur, shots, blocks: relaid }));
            setSelectedShotId(null);
            if (Number.isFinite(firstCut)) applyT(firstCut);
            return { ok: true, summary: t('workbench.deletedNRangesPer', { n: removedCount }) };
          }
          case 'undo': {
            // No rollback while generating: after a snapshot restores the old comp, a running worker still writes its result back, scrambling state
            if (genIdsRef.current.size) return { ok: false, error: t('workbench.elementGeneratingUndoAfter') };
            const stack = undoStackRef.current;
            // A snapshot left by a tool that didn't change anything (returned failure/no-op) shares the current reference → dedup, doesn't count as a step
            while (stack.length && stack[stack.length - 1] === compRef.current) stack.pop();
            const prev = stack.pop();
            if (!prev) return { ok: false, error: t('workbench.nothingUndo') };
            redoStackRef.current.push(compRef.current); // agent undo also feeds the redo line (redoable via ⇧⌘Z/button)
            setComp(prev);
            setSelectedId(null);
            setSelectedShotId(null);
            return { ok: true, summary: t('workbench.undidLastStep') + (stack.length ? t('workbench.nMoreUndoSteps', { n: stack.length }) : '') };
          }
          case 'export_video': {
            // Default local export (per user, same path in the OSS shell): the bridge drives this tab to run client-side compositing (WebCodecs),
            // the result goes straight to a browser download on the user's machine — no R2 upload, zero server cost. Poll via track_export.
            if (!compRef.current.video?.url) return { ok: false, error: t('common.uploadBeforeExport') };
            const job = agentExportRef.current;
            if (job.running) return { ok: true, summary: t('common.exportAlreadyProgress'), data: { status: 'running', progress: exportPctRef.current, hint: 'poll track_export' } };
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
            return { ok: true, summary: t('workbench.splitPlayhead'), data: { shotIds: (compRef.current.shots ?? []).map((s) => s.id) } };
          }
          case 'trim_shot': {
            if (!c.video) return { ok: false, error: t('workbench.noVideoYet') };
            const side = input.side === 'left' ? 'left' : 'right';
            if (typeof input.atSec === 'number') applyT(Math.max(0, input.atSec));
            trimAtPlayhead(side);
            return { ok: true, summary: side === 'left' ? t('workbench.trimmedFootageLeftSec', { sec: r1(tRef.current) }) : t('workbench.trimmedFootageRightSec', { sec: r1(tRef.current) }) };
          }
          case 'delete_shot': {
            const s = findShot(input.shotId);
            if (!s) return { ok: false, error: t('workbench.shotNotFound') };
            deleteShot(s.id);
            return { ok: true, summary: t('workbench.deletedScene') };
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
              return { ok: true, summary: t('workbench.insertedDurSClip', { at: r1(at), dur: r1(dur) }), data: { shotId: newShotId } };
            } finally {
              clearToolProgress(toolId);
            }
          }
          case 'attach_frame': {
            // Agent recommends / user names → mount a frame: go through chat's attachFrame (tag + subsequent requests carry frameId),
            // then onFrameApplied lands palette+frameId into comp. Next round <frame_attached> prompts it to read_frame.
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
              const parsed = await composeBlockChecked(seed, `Create a new overlay element (title / big number / list / kinetic caption — pick per the content): ${String(input.instruction ?? '')}`, (acc) =>
                report(noteOf(acc) || t('panels.generating')),
              );
              const nb: Block = {
                id: seed.id,
                templateId: 'custom',
                slots: { innerHtml: parsed.innerHtml, timelineBody: parsed.timelineBody },
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
              const parsed = await composeBlockChecked(seed, String(input.instruction ?? ''), (acc) => report(noteOf(acc) || t('workbench.editing')));
              setComp((cc) => ({
                ...cc,
                blocks: cc.blocks.map((x) =>
                  x.id === b.id ? { ...x, templateId: 'custom', slots: { innerHtml: parsed.innerHtml, timelineBody: parsed.timelineBody } } : x,
                ),
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
  };

  /** External-agent-only bridge operations (MCP-only, invisible to the internal chat) — the browser half of the BYO-brain contract:
   *  compose_context/plan_context fetch live context (the server briefs assemble the prompt, the external model generates itself),
   *  apply_block/submit_plan receive the output and run it through the **same** validation as the in-house path (parseBlockResponse+lintBlock /
   *  parsePlan) before landing state — swap the LLM, the quality contract doesn't degrade. Other tools fall back to runStudioTool. */
  const runExternalTool = async (tool: string, input: Record<string, unknown>): Promise<StudioToolResult> => {
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
            data: { ...base, block: { id: b.id, kind: blockKind(b), ...renderBlock(b), label: b.label }, ...(script ? { context: { script } } : {}) },
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
          const shot = await captureCompositionFrame({ comp: c2, videoFile: videoFileRef.current, clipFiles: clipFilesRef.current, atSec: at });
          const b64 = shot.dataUrl.slice(shot.dataUrl.indexOf(',') + 1);
          return { ok: true, summary: t('workbench.capturedFrameSecS', { sec: Math.round(at * 10) / 10 }), image: { data: b64, mimeType: 'image/jpeg' }, data: { atSec: at, width: shot.width, height: shot.height } } as StudioToolResult;
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
        return runStudioTool(tool, input);
    }
  };

  // External agent bridge (Codex/Claude Code/any MCP client via /api/studio/mcp → StudioBridge DO → this tab):
  // the exact same execution surface as the internal chat + BYO-only operations; get_state returns the same situation snapshot as chat.
  const agentBridge = useAgentBridge({
    runTool: runExternalTool,
    projectId,
    getState: () => `<composition_state>\n${buildSituation(getChatBody() as ChatSituation)}\n</composition_state>`,
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
   *  Null on an empty canvas (a just-opened tab must not blank the cloud) — same rule as the effect. */
  function buildCloudPayload() {
    const c = compRef.current;
    if (!(c.blocks.length > 0 || (c.shots?.length ?? 0) > 0) || !projectId) return null;
    return {
      comp: { ...c, video: null },
      chat: readChatThreads(projectId),
      context: {
        ...(asrRef.current?.length ? { asr: asrRef.current } : {}),
        ...(Object.keys(clipAsrRef.current).length ? { clipAsr: clipAsrRef.current } : {}),
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

  /* ---------- Bilingual translation (the captions panel "bilingual" section): translations come from the in-house LLM
     (providers.translate; the OSS shell's default hides this section), data lands via the same set_caption_translations executor (undo/re-lay shared). ---------- */
  const translateCaptionsTo = async (target: string) => {
    const tr = studioProviders().translate;
    if (!tr) return;
    if (!asrRef.current?.length) {
      toast.error(t('workbench.noTranscriptShort'));
      return;
    }
    setCapTransBusy(true);
    try {
      await ensureClipTranscripts(); // translate insert sources too, don't produce half-done bilingual
      const main = asrRef.current ?? [];
      const out = await tr(main.map((x, i) => ({ index: i, text: x.text })), target);
      if (out.length) await runStudioTool('set_caption_translations', { items: out });
      for (const [src, segs] of Object.entries(clipAsrRef.current)) {
        if (!segs.length) continue;
        const shot = (compRef.current.shots ?? []).find((sh) => sh.src === src);
        if (!shot) continue;
        const co = await tr(segs.map((x, i) => ({ index: i, text: x.text })), target);
        if (co.length) await runStudioTool('set_caption_translations', { shotId: shot.id, items: co });
      }
      // Remember the target language: panel chip selected state + new inserted clips auto-translated to the same language
      setCaptionStyle({ sub: { ...(resolveCaptionStyle(compRef.current).sub ?? {}), lang: target } });
      toast.success(t('workbench.generatedLangTranslations', { lang: target }) + (compRef.current.blocks.some(isSentenceCaption) ? '' : t('workbench.enableCaptionsShowThem')));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('workbench.translationFailedTryAgain'));
    } finally {
      setCapTransBusy(false);
    }
  };
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
      if (a && a.type !== 'element') void insertLibraryClipAt(a, t);
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
    setMediaMissing(false);
    // Keep the sig anchor even before (or without) the bytes: autosave reads videoSigRef, and
    // writing videoSig:null to the cloud row while the media is missing would destroy the
    // reconnect anchor — editing captions/blocks in the missing-media state must not do that.
    if (d.videoSig) videoSigRef.current = d.videoSig;
    setComp(() => ({ ...d.comp, video: null }));
    if (d.videoSig) {
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
        // Bytes unavailable on this device (browser switch / cleared storage): enter the persistent
        // missing-media state — the stage keeps rendering captions/blocks (all cloud-backed), with a
        // placeholder telling the user the source file is gone and how to reconnect it.
        setMediaMissing(true);
      });
    }
    void recoverLocalClips(d.comp.shots ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const autoRestoredRef = useRef(false);
  // The boot layer's data gate: released once auto-restore (cloud-first falling back to local) finishes —
  // video-byte reconnection (OPFS/cloud fetch) continues behind the gate, not counted as entry waiting
  const [bootDataReady, setBootDataReady] = useState(false);
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
        });
      }
    })().finally(() => setBootDataReady(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cloud sync (debounced): coalesce one PUT 1.2s after comp or the session changes. The cloud-authoritative write-back —
  // local useDraftAutosave still writes localStorage as a cache, the two are independent. Don't push on an empty canvas (don't blank the cloud).
  // The payload mirrors the edit context to the cloud: the offline MCP executor (when the tab is closed) relies on it for
  // read_script / cut_narration caption re-lay / set_captions / plan; only keys that exist in memory are reported —
  // missing keys are merged and kept by the server per key, not wiped (projects.$id). See buildCloudPayload.
  // Single-writer: a displaced tab (bridge close 4000) does not autosave at all, and never rebase-retries a 409 —
  // its in-memory state is by definition stale, and "retry until it lands" is exactly how a zombie tab clobbers the writer.
  useEffect(() => {
    const hasContent = comp.blocks.length > 0 || (comp.shots?.length ?? 0) > 0;
    if (!hasContent || !projectId || displaced) return;
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
          {/* Floating entries on the preview (outside the toolbar's TooltipProvider scope, use native title — Tooltip would crash):
              top-left = reopen chat (the chat area is on the left, returns to the same side; theme black primary button), top-right = expand assets */}
          {!panelOpen && (
            <button
              type="button"
              onClick={openChat}
              title={t('workbench.openChat')}
              aria-label={t('workbench.openChat')}
              className="bg-ink text-bg absolute left-3 top-2 z-20 flex h-7 items-center gap-1 rounded-md px-2 text-[11.5px] font-medium shadow-sm hover:opacity-90"
            >
              <MessageSquare size={13} /> {t('chatGen.chat')}
            </button>
          )}
          {libCollapsed && (
            <button
              type="button"
              onClick={() => setLibCollapsedManual(false)}
              title={t('workbench.expandAssetsBar')}
              aria-label={t('workbench.expandAssetsBar')}
              className="border-line bg-panel text-ink-3 hover:text-ink absolute right-3 top-2 z-20 flex h-7 items-center gap-1 rounded-md border px-2 text-[11.5px] shadow-sm"
            >
              <ChevronsLeft size={13} /> {t('workbench.assets')}
            </button>
          )}
          {!comp.video && !mediaMissing ? (
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
            <div ref={stageBoxRef} className="relative" style={{ width: boxW, height: boxH }}>
              {/* Frame clipping layer: rounded corners / overflow clipping apply only to the iframe frame — floating overlays like the toolbar mount outside this layer,
                  so following a component off-bounds isn't clipped (per user: the toolbar purely follows, never clipped; component overflow is cut here) */}
              <div className="absolute inset-0 overflow-hidden rounded-xl shadow-xl ring-1 ring-black/20">
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
                      width: comp.width,
                      height: comp.height,
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
                {/* Missing-media placeholder (mainstream-editor-style): the source bytes aren't on this device, but
                    everything cloud-backed (captions/blocks/timeline) keeps rendering underneath and stays
                    editable — this only explains the black video layer and offers the reconnect. */}
                {mediaMissing && !comp.video && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
                    <div className="flex max-w-xs flex-col items-center gap-2 px-6 text-center">
                      <VideoOff size={26} className="text-white/75" />
                      <div className="text-[13px] font-medium text-white">{t('workbench.originalVideoFileMissing')}</div>
                      <div className="text-[11.5px] leading-relaxed text-white/70">
                        {t('workbench.storageMissingHint')}
                      </div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="mt-1 rounded-md bg-white px-3 py-1.5 text-[12px] font-medium text-black hover:bg-white/90"
                      >
                        {t('workbench.reSelectOriginalVideo')}
                      </button>
                    </div>
                  </div>
                )}
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
                  return (
                    <>
                    {/* Selection sub-target: clicking the main line shows the main handles, the translation line shows the translation handles (two instances of the same component, never overlaid) */}
                    {subSelected && (
                      <CaptionEditOverlay
                        style={resolveSubCaptionStyle(comp)}
                        compH={comp.height}
                        stageW={boxW}
                        stageH={boxH}
                        measured={capSubMeasure}
                        label={t('workbench.translationGlobal')}
                        onChange={(patch) => {
                          const keep = resolveCaptionStyle(compRef.current).sub ?? {};
                          setCaptionStyle({ sub: { ...keep, ...patch } });
                        }}
                        onLive={(v) => postPreview({ type: 'hf:capSubStyle', xPct: v.xPct ?? 50, yPct: v.yPct, ...(v.hPct ? { hPct: v.hPct } : {}) })}
                        onOpenPanel={(pn) => setFloatWin(pn === 'caption' ? 'captions' : 'script')}
                      />
                    )}
                    {!subSelected && (
                    <CaptionEditOverlay
                      style={resolveCaptionStyle(comp)}
                      compH={comp.height}
                      stageW={boxW}
                      stageH={boxH}
                      measured={capMeasure}
                      onChange={setCaptionStyle}
                      onLive={(s) =>
                        // Send only position + box height (the surface min-height follows): the live channel has no font size. Including fontPx would make the iframe
                        // rewrite font-size for every word of every caption block each frame — hundreds of style writes + a full-doc reflow, dragging stutters into a slideshow
                        postPreview({ type: 'hf:capStyle', xPct: s.xPct ?? 50, yPct: s.yPct, ...(s.hPct ? { hPct: s.hPct } : {}) })
                      }
                      onOpenPanel={(p) => setFloatWin(p === 'caption' ? 'captions' : 'script')}
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
                    {comp.video && (
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
                    {!isSentenceCaption(mb) && (
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

        {/* Asset rail: two tabs — assets (image/video/component/upload aggregated, with source badges) / themes; width 320 aligned to the theme card CARD_W.
            Collapsible to free up the frame: the whole column stays mounted as hidden (preserving filters/scroll/generation polling), the expand button floats top-right on the preview.
            When a tool panel (floatWin) is open it **docks and takes the whole column** (per user: not a new tab): the tabs header is replaced by
            the panel title header, the asset list is hidden but keeps state, closing the panel returns to the tabs */}
        <div
          className={`border-line flex shrink-0 flex-col border-l ${libCollapsed ? 'hidden' : ''} ${railPinned ? 'relative' : 'bg-bg absolute inset-y-0 right-0 z-40 shadow-2xl'}`}
          style={libCollapsed ? undefined : { width: railW }}
        >
          {/* Drag the left edge to resize (260–560, persisted) */}
          <div
            onPointerDown={(e) => {
              e.preventDefault();
              const sx = e.clientX;
              const w0 = railW;
              let raf = 0;
              let last: PointerEvent | null = null;
              const flush = () => {
                raf = 0;
                if (last) setRailW(Math.max(260, Math.min(560, w0 + (sx - last.clientX))));
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
          <div className="flex min-h-0 flex-1 flex-col">
          {floatWin ? (
            <div className="border-line flex items-center gap-1 border-b px-2 py-1.5">
              {floatWin === 'gen' ? (
                (
                  [
                    { v: 'image', label: 'panels.image' },
                    { v: 'video', label: 'panels.video' },
                    { v: 'element', label: 'panels.element' },
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
          ) : (
            <div className="border-line flex items-center gap-1 border-b px-2 py-1.5">
              {(
                [
                  { v: 'assets', label: 'workbench.assets' },
                  { v: 'script', label: 'workbench.scriptCut' },
                  { v: 'captions', label: 'panels.captions' },
                  // Themes tab hidden (per user 2026-07-19): the component library is already grouped by theme with its own tokens, mount themes via the chat selector
                ] as { v: 'assets' | 'frames' | 'script' | 'captions'; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.v}
                  type="button"
                  onClick={() => setLibTab(tab.v)}
                  className={`rounded-md px-2.5 py-1 text-[12px] transition ${
                    libTab === tab.v ? 'bg-panel-2 text-ink font-medium' : 'text-ink-4 hover:text-ink-2'
                  }`}
                >
                  {t(tab.label)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setRailPinned((p) => !p)}
                title={t(railPinned ? 'workbench.unpinAssetsBar' : 'workbench.pinAssetsBar')}
                aria-label={t(railPinned ? 'workbench.unpinAssetsBar' : 'workbench.pinAssetsBar')}
                className="text-ink-4 hover:text-ink ml-auto rounded p-1"
              >
                {railPinned ? <PinOff size={13} /> : <Pin size={13} />}
              </button>
              <button
                type="button"
                onClick={() => setLibCollapsedManual(true)}
                title={t('workbench.collapseAssetsBar')}
                aria-label={t('workbench.collapseAssetsBar')}
                className="text-ink-4 hover:text-ink rounded p-1"
              >
                <ChevronsRight size={14} />
              </button>
            </div>
          )}
          {/* Assets stay mounted (hidden when switched away / covered by a panel, preserving polling/scroll position); themes mount on demand (don't run the cover wall in the background) */}
          <div className={!floatWin && libTab === 'assets' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
            <AssetsPanel
              comp={comp}
              onInsert={(m, l, d) => void insertPanelMedia(m, l, undefined, d)}
              onInsertElement={insertGeneratedElement}
              onDragAsset={setDragAsset}
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
                onSeek={(sec) => applyT(Math.max(0, sec))}
                onCut={cutSrcRanges}
                onRestore={restoreSrcRanges}
                onReplaceWord={replaceScriptWord}
              />
            </div>
          )}
          {!floatWin && libTab === 'captions' && (
            <div className="flex min-h-0 flex-1 flex-col">
              <CaptionsPanel {...captionsPanelProps()} />
            </div>
          )}
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
                  onSeek={(sec) => applyT(Math.max(0, sec))}
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
                    onSetFilter={setShotFilter}
                    onPreviewFilter={previewShotFilter}
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
                <CaptionsPanel {...captionsPanelProps()} />
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
        </div>
        </div>

        {/* Transport bar. On narrow windows (≤1280) button text must not wrap: when space is short the whole bar scrolls horizontally, don't let "safe zone" stack into three lines */}
        <TooltipProvider delayDuration={200}>
        <div className="border-line flex items-center gap-3 overflow-x-auto border-t px-4 py-2 whitespace-nowrap [&>button]:shrink-0">
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
                onClick={() => setLocateSignal((n) => n + 1)}
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
                  <button type="button" onClick={splitAtPlayhead} disabled={!comp.video} aria-label={t('workbench.split')} className="hover:text-ink hover:bg-panel-2 rounded p-1 disabled:opacity-40">
                    <BracketCutIcon />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t('workbench.split')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" onClick={() => trimAtPlayhead('left')} disabled={!comp.video} aria-label={t('workbench.trimLeft')} className="hover:text-ink hover:bg-panel-2 rounded p-1 disabled:opacity-40">
                    <BracketCutIcon dashed="left" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t('workbench.trimLeft')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" onClick={() => trimAtPlayhead('right')} disabled={!comp.video} aria-label={t('workbench.trimRight')} className="hover:text-ink hover:bg-panel-2 rounded p-1 disabled:opacity-40">
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
                disabled={!comp.video || !selectedShotId}
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
                disabled={!comp.video || !selectedShotId}
                aria-label={t('workbench.cameraFraming')}
                className={`rounded p-1 disabled:opacity-40 ${floatWin === 'shot' ? 'text-ink bg-panel-2' : 'text-ink-3 hover:text-ink hover:bg-panel-2'}`}
              >
                <Frame size={14} />
              </button>
            </TooltipTrigger>
            <TooltipContent>{t('workbench.cameraFraming')}</TooltipContent>
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
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setExportOpen(true)}
                disabled={exporting || publishing || !comp.video}
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
        </TooltipProvider>

        {/* Caption style popover: reuses CaptionsPanel wholesale; clicking a style applies globally, click outside / Esc dismisses */}
        {/* Multi-track timeline */}
        <StudioTimeline
          comp={comp}
          playing={playing}
          locateSignal={locateSignal}
          selectedShotIds={selectedShotIds}
          selectedBlockIds={selectedBlockIds}
          filmstrip={filmstrip}
          clipStrips={clipStrips}
          pps={pps}
          assetDragging={!!dragAsset}
          assetDragKind={dragAsset?.type ?? null}
          clipPendingAt={clipPending}
          {...timelineCbs}
        />

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
