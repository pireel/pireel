"use client";

/**
 * Hyperframes workbench — block-based editing (pure browser, zero server).
 *
 * Model = primary and inserted video shots (track 0) + overlay blocks on multiple tracks
 * (captions/titles/transitions). Each block is a nested Hyperframes composition fragment;
 * assemble stitches full HTML fed to <iframe srcdoc> for live render.
 *  · Import source media; speech-led edits can run ASR and map sentences to editable shots.
 *  · Multi-track timeline: click a block to select, chat on the right edits "this block" (per-block, cheap/precise).
 *  · Export via server-side headless Chrome (same assembled HTML, WYSIWYG, TODO wire up).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "use-intl";
import {
  Play,
  Pause,
  FileVideo,
  Code2,
  Loader2,
  Wand2,
  Sparkles,
  Upload,
  FlaskConical,
  ScanFace,
  MessageSquare,
  Image as ImageIcon,
  ChevronsLeft,
  ChevronsRight,
  Minus,
  Plus,
  Download,
  X,
  GripVertical,
  Trash2,
  Palette,
  RefreshCw,
  Save,
  SendToBack,
  BringToFront,
  ChevronUp,
  ChevronDown,
  UserRound,
  AudioLines,
  Frame,
  Music,
  Undo2,
  Redo2,
  LayoutGrid,
  Scissors,
  Captions,
  Power,
  Magnet,
  Type,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@pireel/ui/tooltip";

import { toast } from "@pireel/ui/toast";
import { studioLocale, t } from "./i18n";
import { editorErrorMessage } from "./editor-error";
import { framePack } from "@pireel/studio-frames/locales";
import {
  type Block,
  type CaptionStyle,
  type Composition,
  type EditorDocumentV2,
  type EditorMediaAsset,
  type MediaRef,
  type CutTransitionEffect,
  type TransitionDirection,
  type ShotFilter,
  type ShotFramingPatch,
  type NarrativeClipPatchUpdate,
  type OverlayDocumentPatch,
  type ShotTreatment,
  type PersonFx,
  type VideoShot,
  SHOT_TREATMENTS,
  STUDIO_FONTS_HREF,
  CAPTION_PRESETS,
  applyEditorCommand,
  applyCanvasDocumentEdit,
  applyCaptionDocumentEdit,
  resizeManagedCaptionTiming,
  applyNarrationDocumentEdit,
  applyMediaVideoSettingsPatch,
  addNarrativeDocumentClip,
  moveAudioDocumentClip,
  moveVisualDocumentClip,
  applyOverlayDocumentEdits,
  removeNarrationClipsWithoutRipple,
  removeOverlayDocumentClips,
  moveOverlayDocumentClip,
  insertOverlayDocumentClip,
  reorderOverlayDocumentTracks,
  assembleHtml,
  blockBgCss,
  captionLineSegments,
  patchNarrativeClips,
  customHasSurface,
  blockId,
  blockKind,
  videoFrameTimelineBody,
  BASE_CAPTION_FONT_PX,
  emptyComposition,
  emptyEditorDocumentV2,
  dominantTimelineSpeechTrack,
  editorDocumentRenderPlan,
  freeTrack,
  getCaptionPreset,
  isCaptionsOn,
  isSentenceCaption,
  stripDerivedCaptions,
  mediaBlock,
  mediaTimelineClipAsVideoShot,
  narrativeClipTimelineRange,
  narrativeTrimRangeAtTimelineSecond,
  newBlock,
  firstNarrativeAsset,
  firstNarrativeAssetId,
  primaryNarrativeClips,
  pruneUnusedEditorAssets,
  projectDocumentToComposition,
  renderBlock,
  localImageLocator,
  localImageLocatorSigs,
  assembleBlockHtml,
  resolveCaptionStyle,
  resolveSubCaptionStyle,
  audioClipWindow,
  audioTrimPatch,
  patchShotFraming,
  segmentFadeFn,
  shotsContiguous,
  shotFilterCss,
  shotGain,
  type AudioClip,
  shotId,
  shotTransformVars,
  IDENTITY_MEDIA_FRAMING,
  mediaFramingTransformVars,
  normalizeAtomicMediaFraming,
  resolveShotMediaFraming,
  resizeNarrativeTimelineClip,
  slipNarrativeTimelineClip,
  resizeVisualTimelineClip,
  supplementalVisualStateAt,
  DIRECTIONAL_TRANSITIONS,
  MAX_TRANSITION_SEC,
  cutTransitions,
  splitBlockedByTransition,
  totalDuration,
  hasTimelineContent,
  hasVideoTrackContent,
  videoTrackShots,
  videoShotTimelineSpans,
  treatmentVacancyBox,
  type MediaTimelineClip,
  canvasSizeFollowingFirstVideo,
  type DisplayTextAnimationId,
  type DisplayTextPresetId,
  displayTextPreset,
  titleBlock,
} from "@pireel/studio-engine/composition";
import { getTheme, themeVarsCss } from "@pireel/studio-engine/theme";
import {
  restoreSrcRange,
  spans as clipSpans,
  srcToEditedLoose,
} from "@pireel/studio-engine/trim";
import {
  parseBlockResponse,
  parseKitResponse,
} from "@pireel/studio-engine/compose";
import {
  type ComposeMode,
  type ComposedBlock,
  GeneratedBlockValidationError,
  composedBlockFields,
  kitChoiceOf,
} from "./compose-result";
import { imageThumb, imgSourceBase } from "@pireel/ui/image-url";
import { HARD_LINT_CODES, lintBlock } from "@pireel/studio-engine/block-lint";
import { clearToolProgress, setToolProgress } from "./tool-progress";
import { injectPreviewRuntime } from "./sample-composition";
import { monotonicPlaybackSecond, playhead } from "./playhead";
import {
  type AsrSegment,
  desegmentCues,
  sanitizeTranscriptSegs,
} from "@pireel/studio-engine/build-blocks";
import { beatsForWindow } from "@pireel/studio-engine/captions-relay";
import {
  type Box as GraphicBox,
  pickGraphicBox,
} from "@pireel/studio-engine/graphics-layout";
import {
  type FilmstripFrame,
  type FilmstripSourceRange,
  durableFileSig,
  extractFilmstrip,
  fileSig,
  probeVideoFile,
  uploadVideoFile,
} from "./media";
import {
  alignFileToSig,
  loadLocalAssetFile,
  loadLocalFolderFile,
  loadLocalVideo,
  saveLocalVideo,
} from "./local-media";
import { materializeRemoteMedia } from "./remote-media";
import {
  shouldReconnectNarrativeSource,
  sourceRuntimeIsLive,
} from "./local-source-runtime";
import {
  importLocalSource,
  localAssetIndexEntry,
} from "./local-import-session";
import { VideoTrackEngine } from "./video-track-engine";
import { segmentSourceRate } from "./video-segment-time";
import { compositionRenderView } from "./composition-render-view";
import { primaryNarrativeRenderPlan } from "./primary-render-plan";
import {
  supplementalVisualFileBindings,
  supplementalVisualMedia,
} from "./visual-render-plan";
import {
  type BakeSpec,
  type BakedWindow,
  bakeTransitionWindow,
  decodeBake,
} from "./transition-bake";
import { studioProviders } from "@pireel/studio-engine/providers";
import { ensureTemplatesRegistered } from "@pireel/studio-engine/templates";
import {
  customVisualStylePalette,
  type CustomVisualStyle,
} from "@pireel/studio-engine/visual-style";
import {
  CloudProjectSaveQueue,
  DeferredEffectDisposer,
} from "./cloud-project-save";
import { DeferredActivation } from "./deferred-activation";
import { loadCurrentUser } from "./current-user";
import {
  StudioTimeline,
  DEFAULT_PPS,
  MIN_PPS,
  MAX_PPS,
  type TimelineTrackState,
} from "./studio-timeline";
import { quantizeTimelineFrameSecond } from "./timeline-utils";
import { timelineDirectorScenesFromDocument } from "./director-scene-strip";
import type {
  TimelineInsertMode,
  TimelineMediaDropTarget,
} from "./timeline-asset-drop";
import {
  type AttachedFrame,
  StudioChat,
  type StudioChatHandle,
  type StudioElementRef,
} from "./studio-chat";
import { buildChatMentionElements } from "./chat-local-asset-mention";
import { resolveLocalAssetReference } from "./studio-tool-input-references";
import { shouldCollapseChatForTimelineFramePick } from "./chat-timeline-frame-picker";
import { ElementSourceEditor, type SourceDraft } from "./element-source-editor";
import { useStableCallbacks } from "./use-stable-callbacks";
import {
  type StudioDraft,
  cacheProjectLocally,
  loadDraft,
  migrateLegacyDraft,
  saveCoverThumb,
  setProjectVersion,
  useDraftAutosave,
} from "./use-draft-persist";
import {
  STUDIO_PROJECT_CONTEXT_SCHEMA_VERSION,
  type LocalAssetIndexEntry,
  type ProjectSavePayload,
  type StudioProjectDto,
} from "@pireel/studio-engine/project-dto";

import { useGenerationLock } from "./use-generation-lock";
import { useMediaAnalysis } from "./use-media-analysis";
import { useStudioExport } from "./use-export";
import {
  DEFAULT_RENDER_OPTS,
  EMPTY_VIDEO_GROUND,
  type ExportRenderOpts,
  captureCompositionFrame,
} from "./client-export";
import { DisplayTextPanel, type DisplayTextPatch } from "./display-text-panel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@pireel/ui/dialog";
import { GenChatPanel, type GenElementResult } from "./gen-chat-panel";
import { KIT_INSERT_DURATION, kitSampleProps } from "./kit-ui";
import { wordsFromText } from "@pireel/studio-engine/caption-fx";
import { AssetsPanel, type GenType, type PanelDragAsset } from "./assets-panel";
import { addElementEntry } from "./element-history";
import { useStudioShell } from "./shell-context";
import { ScriptPanel, TimelineScriptPanel } from "./script-panel";
import { CaptionsPanel } from "./captions-panel";
import { FramePanel } from "./frame-panel";
import { PersonFxPanel, type MatteState } from "./person-fx-panel";
import { ShotTreatmentPanel } from "./shot-treatment-panel";
import { MusicPanel } from "./music-panel";
import { AvatarPanel } from "./avatar-panel";
import { useAudioTracks } from "./use-audio-tracks";
import { useDenoise } from "./use-denoise";
import { TransitionPanel } from "./transition-panel";
import { MediaAnimPanel } from "./media-anim-panel";
import { type MatteFrame, MATTE_FPS, computeMatteTrack } from "./person-matte";
import { type FrameCatalogItem, useFrameCatalog } from "./use-frame-catalog";
import { StudioBootOverlay } from "./studio-boot";
import { confirm } from "@pireel/ui/confirm";
import {
  type ChatSituation,
  type StudioToolResult,
  STUDIO_TOOL_MAP,
  buildSituation,
} from "@pireel/studio-engine/prompts";
import { useAgentBridge } from "./use-agent-bridge";
import {
  type VisualLabel,
  type VisualPrep,
  type VisualTimeline,
  analyzeVisual,
  clearVisualCache,
  finishVisualAnalysis,
  insertedClipSafeZone,
  prepareVisualAnalysis,
} from "./visual";
import { type SafeZone, detectFrameAt, geomNote } from "./geometry";
import {
  REF_WIDTH,
  normalizeDims,
  personFxFromFrame,
  shotSpan,
} from "./workbench-utils";
import {
  shotCountChange,
  canvasSizeOnlyChange,
  blockPatchableChange,
  canApplyBlockPatchInPlace,
  capPosOnlyChange,
  nativeMediaBoxOnlyChange,
  previewDataEqual,
  sameExceptCapStyle,
  shiftBox,
  shotFramingOnlyChange,
  supplementalMediaFramingOnlyChange,
  themeMountOnlyChange,
} from "./comp-diff";
import {
  BoxEditOverlay,
  CaptionEditOverlay,
  boxSelectionRect,
} from "./edit-overlays";
import {
  FULL_MEDIA_CANVAS_BOX,
  fittedMediaContentBox,
  framedMediaContentBox,
  framedMediaPlacementBox,
  resolveBufferedMediaSelection,
  type MediaCanvasBox,
} from "./media-box";
import { blockDisplayTitle } from "./block-display-title";
import {
  BracketCutIcon,
  CardShapeControls,
  ExportOptRow,
  TimeReadout,
} from "./workbench-controls";
import {
  type AgentToolCtx,
  runStudioTool as runAgentStudioTool,
  runExternalTool as runAgentExternalTool,
} from "./agent-tool-runner";
import { registerStudioDevCacheTools } from "./dev-cache-tools";
import { SlipTwoUpOverlay } from "./slip-two-up-overlay";

// Console entry in all builds (pireelStudioDev.clearReviewCache / clearTtsCache): module scope on
// purpose — available as soon as any workbench chunk loads, no component lifecycle involved.
registerStudioDevCacheTools();
import { useCaptionsOps } from "./use-captions-ops";
import { useClipInsert } from "./use-clip-insert";
import { useElementOps } from "./use-element-ops";
import { isBlockContentSyncable } from "./component-content-sync";
import { useBoxDrag } from "./use-box-drag";
import { useAgentContext } from "./use-agent-context";
import { useScriptCut } from "./use-script-cut";
import { useLiveProjectDocument } from "./use-live-project-document";
import type { LiveProjectPersistenceMetadata } from "./live-project-document";
import {
  nativeProjectSessionMetadata,
  nativeProjectSharedLocalAssets,
} from "./native-project-session";
import { ProjectOutputSwitcher } from "./project-output-switcher";
import { previewStageGeometry } from "./preview-stage-geometry";
import { useProjectOutputs } from "./use-project-outputs";
import { useProjectOutputRuntime } from "./use-project-output-runtime";
import {
  videoPickSuccessNotices,
  type VideoPickOptions,
} from "./video-pick-feedback";
import {
  defaultKitElementBox,
  fitEditableBoxIntoSafeArea,
  withEditableBlockGeometry,
} from "./editable-block-geometry";
import { webFontStylesheetUrls } from '@pireel/studio-engine/font-library';
import { ensureWebFontStylesheets } from './web-fonts';

// The workbench calls semantic template helpers during its first render. Keep the
// registration call in this concrete client entry as well as the engine barrel:
// production tree-shaking can flatten a re-export barrel before evaluating it.
ensureTemplatesRegistered();

const RAIL_NAV_W = 48; // vertical primary-nav strip on the rail's outer edge; railW measures the CONTENT column only
const UNDO_CAP = 20; // undo snapshot stack cap (each = canonical V2 document, incl. custom block payloads)

/** Make the user's real caption-preset choice visible immediately. Preserve placement, size,
 * bilingual settings and on/off state; clear visual overrides so the selected preset renders intact. */
function customCaptionStyle(
  style: CustomVisualStyle,
  current: CaptionStyle,
): Partial<CaptionStyle> {
  return {
    ...current,
    preset: style.captionPreset,
    color: undefined,
    bg: undefined,
    bold: undefined,
  };
}

const firstNarrativeDurationSec = (
  document: EditorDocumentV2,
): number | null => {
  const assetId = firstNarrativeAssetId(document);
  return assetId
    ? (document.assets[assetId]?.metadata.durationSec ?? null)
    : null;
};

/** Contextual tool panels (single instance, mutually exclusive, docked over the rail content). Generation is a primary-nav tab. */
type FloatKind =
  | "script"
  | "person"
  | "shot"
  | "code"
  | "anim"
  | "transition"
  | "captions";

export function HyperframesWorkbench({
  projectId,
  agentView = false,
}: {
  projectId: string;
  agentView?: boolean;
}) {
  const shell = useStudioShell();
  const locale = useLocale(); // note/reply language follows UI locale (on-screen text follows the narration script language)
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const starter = useMemo(() => emptyComposition(), []);
  const livePersistenceMetadataRef = useRef<LiveProjectPersistenceMetadata>({});
  // V2 is the live authority. Composition is a read-only render projection.
  const {
    composition: comp,
    compositionRef: compRef,
    document: editorDocument,
    documentRef: editorDocumentRef,
    setDocument: setEditorDocument,
    resolveAssetUrl,
    rememberAssetUrl,
    clearRuntimeAssetUrls,
    persistableDocument,
  } = useLiveProjectDocument({
    projectId,
    initialComposition: starter,
    persistenceMetadataRef: livePersistenceMetadataRef,
  });
  // The persisted local-image locator is deliberately not a browser URL. The sandboxed canvas
  // resolves it from a File message; the parent timeline needs its own object URL. Keep that runtime
  // URL map outside EditorDocument so autosave never persists session-only blob addresses.
  const [localImagePreviewUrls, setLocalImagePreviewUrls] = useState<
    ReadonlyMap<string, string>
  >(new Map());
  const localImagePreviewUrlsRef = useRef<Map<string, string>>(new Map());
  const patchOverlays = useCallback(
    (updates: readonly OverlayDocumentPatch[]): boolean => {
      if (!updates.length) return false;
      const edit = applyOverlayDocumentEdits({
        document: editorDocumentRef.current,
        updates,
      });
      if (!edit.ok) {
        toast.error(editorErrorMessage(edit.error));
        return false;
      }
      setEditorDocument(edit.document);
      return true;
    },
    [setEditorDocument],
  );
  const renderPlan = useMemo(
    () => editorDocumentRenderPlan(editorDocument, { resolveAssetUrl }),
    [editorDocument, resolveAssetUrl],
  );
  const primaryNarrative = useMemo(
    () => primaryNarrativeRenderPlan(renderPlan),
    [renderPlan],
  );
  const videoPlacements = primaryNarrative.placements;
  const renderVideoPlacements = primaryNarrative.activePlacements;
  const renderComposition = useMemo(
    () => compositionRenderView(comp, renderPlan),
    [comp, renderPlan],
  );
  const supplementalVisuals = useMemo(
    () => supplementalVisualMedia(renderPlan),
    [renderPlan],
  );
  const firstAsset = firstNarrativeAsset(editorDocument);
  const firstAssetDurationSec = firstAsset?.metadata.durationSec ?? null;
  const disabledClipIds = useMemo(
    () =>
      new Set(
        renderPlan.tracks.flatMap((track) =>
          track.clips
            .filter((entry) => !entry.clip.enabled)
            .map((entry) => entry.clipId),
        ),
      ),
    [renderPlan],
  );
  /** Device-local video assets carry no metadata.durationSec (registration never probes bytes).
   *  Probe it lazily from the resolved playable URL — metadata preload only, one per asset. */
  const probedSourceDurationsRef = useRef(new Map<string, number>());
  const [probedSourceDurationsRev, setProbedSourceDurationsRev] = useState(0);
  useEffect(() => {
    const primaryId = editorDocument.semantics.primaryNarrativeTrackId;
    const track = renderPlan.tracks.find((candidate) => candidate.id === primaryId);
    for (const entry of track?.clips ?? []) {
      if (entry.clip.kind !== "narrative" || !entry.resolvedSource) continue;
      const assetId = entry.clip.assetId;
      if (editorDocument.assets[assetId]?.metadata.durationSec != null) continue;
      if (probedSourceDurationsRef.current.has(assetId)) continue;
      probedSourceDurationsRef.current.set(assetId, 0); // in-flight marker: never probe twice
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.onloadedmetadata = () => {
        if (Number.isFinite(probe.duration) && probe.duration > 0) {
          probedSourceDurationsRef.current.set(assetId, probe.duration);
          setProbedSourceDurationsRev((value) => value + 1);
        } else {
          probedSourceDurationsRef.current.delete(assetId);
        }
        probe.removeAttribute("src");
        probe.load();
      };
      probe.onerror = () => probedSourceDurationsRef.current.delete(assetId);
      probe.src = entry.resolvedSource;
    }
  }, [renderPlan, editorDocument]);

  /** Source total duration per primary SHOT id (shot ids ARE narrative clip ids) — the slip
   *  gesture/panel needs the full source extent, which the legacy VideoShot projection lacks. */
  const shotSourceDurations = useMemo(() => {
    const out = new Map<string, number>();
    const primary = editorDocument.timeline.tracks.find(
      (track) => track.id === editorDocument.semantics.primaryNarrativeTrackId,
    );
    for (const clip of primary?.clips ?? []) {
      if (clip.kind !== "narrative") continue;
      const durationSec = editorDocument.assets[clip.assetId]?.metadata.durationSec
        ?? probedSourceDurationsRef.current.get(clip.assetId);
      if (durationSec != null && durationSec > 0) out.set(clip.id, durationSec);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorDocument, probedSourceDurationsRev]);

  const timelineTrackStates = useMemo<TimelineTrackState[]>(
    () =>
      renderPlan.tracks.map((track) => ({
        trackId: track.id,
        timelineIndex: editorDocument.timeline.tracks.findIndex(
          (candidate) => candidate.id === track.id,
        ),
        type: track.type,
        ...(track.role ? { role: track.role } : {}),
        stackOrder: track.stackOrder,
        hidden: track.hidden,
        muted: track.muted,
        ranges: track.clips.map((entry) => ({
          clipId: entry.clipId,
          startSec: entry.startSec,
          endSec: entry.endSec,
        })),
        ...(track.type !== "audio"
          ? {
              clips: track.clips.flatMap((entry) =>
                entry.clip.kind === "media" &&
                (entry.asset?.kind === "image" ||
                  entry.asset?.kind === "video")
                  ? [
                      {
                        clipId: entry.clipId,
                        startSec: entry.startSec,
                        endSec: entry.endSec,
                        kind: entry.asset.kind,
                        ...(entry.asset.label
                          ? { label: entry.asset.label }
                          : {}),
                        ...(() => {
                          const source =
                            entry.asset.kind === "image" &&
                            entry.asset.locator.localSig
                              ? localImagePreviewUrls.get(
                                  entry.asset.locator.localSig,
                                )
                              : entry.resolvedSource;
                          return source ? { source } : {};
                        })(),
                        sourceInSec: entry.clip.sourceInSec,
                        sourceOutSec: entry.clip.sourceOutSec,
                        ...(entry.asset.metadata.durationSec != null
                          ? { sourceDurationSec: entry.asset.metadata.durationSec }
                          : {}),
                        enabled: entry.clip.enabled,
                      },
                    ]
                  : [],
              ),
            }
          : {}),
      })),
    [
      editorDocument.timeline.tracks,
      localImagePreviewUrls,
      renderPlan,
    ],
  );
  const videoPlacementsRef = useRef(videoPlacements);
  videoPlacementsRef.current = videoPlacements;
  const primaryHiddenRef = useRef(primaryNarrative.hidden);
  primaryHiddenRef.current = primaryNarrative.hidden;
  // Native visual-lane selection is independent from legacy shot/block projections: a clip remains
  // selectable while it is off the semantic primary lane, and moving it back can hand selection to
  // the shot channel without losing identity.
  const [selectedVisualClipId, setSelectedVisualClipId] = useState<
    string | null
  >(null);
  const selectedVisualClipIdRef = useRef<string | null>(null);
  selectedVisualClipIdRef.current = selectedVisualClipId;
  // Block selection: selectedId = primary (anchor; floating toolbar/panels only act on a single block);
  // selectedBlockIds = full multi-select set (⌘-click/marquee, used for bulk delete). setSelectedId is wrapped
  // as a setter: every existing single-select site auto-normalizes the multi-select set to {id}/empty, no per-site
  // change; multi-select gestures (toggleBlockSelect/selectBlocksBox) set both directly.
  const [selectedId, setSelectedIdRaw] = useState<string | null>(null);
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(
    () => new Set(),
  );
  const setSelectedId = useCallback(
    (id: string | null) => {
      if (id) setSelectedVisualClipId(null);
      if (id) {
        const block = compRef.current.blocks.find(
          (candidate) => candidate.id === id,
        );
        if (block) {
          const editable = withEditableBlockGeometry(
            block,
            compRef.current.width,
            compRef.current.height,
          );
          if (editable !== block) {
            patchOverlays([
              {
                clipId: block.id,
                block: {
                  templateId: editable.templateId,
                  slots: editable.slots,
                  box: editable.box,
                },
              },
            ]);
          }
        }
      }
      setSelectedIdRaw(id);
      setSelectedBlockIds(id ? new Set([id]) : new Set());
    },
    [compRef, patchOverlays],
  );
  const selectedBlockIdsRef = useRef<Set<string>>(selectedBlockIds);
  selectedBlockIdsRef.current = selectedBlockIds;
  // Shot selection: selectedShotId = primary (anchor; framing/matte panels only act on a single shot);
  // selectedShotIds = full multi-select set (⌘-click/marquee, used for bulk delete). setSelectedShotId is wrapped
  // as a setter: every existing single-select call site auto-normalizes the multi-select set to {id}/empty, no
  // per-site change; multi-select gestures use dedicated functions that set both directly.
  const [selectedShotId, setSelectedShotIdRaw] = useState<string | null>(null);
  const [selectedShotIds, setSelectedShotIds] = useState<Set<string>>(
    () => new Set(),
  );
  const setSelectedShotId = useCallback((id: string | null) => {
    if (id) setSelectedVisualClipId(null);
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
    setSelectedVisualClipId(null);
    setSelectedId(null);
    setSelectedShotIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelectedShotIdRaw(
        next.has(id) ? id : (next.values().next().value ?? null),
      );
      return next;
    });
  }, []);
  /** Marquee: set hit shots as the multi-select set (empty hit = clear selection); anchor is the first. */
  const selectShotsBox = useCallback((ids: string[]) => {
    setSelectedVisualClipId(null);
    setSelectedId(null);
    setSelectedShotIds(new Set(ids));
    setSelectedShotIdRaw(ids[0] ?? null);
  }, []);
  /** ⌘/Ctrl click a block: toggle in/out of the multi-select set (symmetric with shot multi-select; no single primary in multi-select mode, panels step aside). */
  const toggleBlockSelect = useCallback(
    (id: string) => {
      setSelectedVisualClipId(null);
      setSelectedShotId(null);
      setSelectedIdRaw((cur) => {
        // First ⌘-click of another block from single-select: fold the previous primary into the multi-select set
        if (cur && cur !== id)
          setSelectedBlockIds((prev) => new Set(prev).add(cur));
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
      setSelectedVisualClipId(null);
      setSelectedShotId(null);
      setSelectedIdRaw(null);
      setSelectedBlockIds(new Set(ids));
    },
    [setSelectedShotId],
  );
  // Timeline hover-preview jumped outside the selected block's time window → hide the edit box with the frame (else the border pins onto an unrelated frame)
  const [scrubHideSel, setScrubHideSel] = useState(false);
  const [scrubActive, setScrubActive] = useState(false);
  /** Timeline hover drives a temporary canvas clock without moving the playhead. Selection
   * geometry only needs per-frame React updates when the selected clip actually has box keyframes. */
  const [scrubPreviewSec, setScrubPreviewSec] = useState<number | null>(null);
  // Body-drag center snap guides: persistent DOM, toggle display directly — zero setState on the drag path.
  // (Previously via state: every flip near the midline re-rendered the whole tree, the source of the "stutter mid-drag".)
  const guideVRef = useRef<HTMLDivElement | null>(null); // vertical midline
  const guideHRef = useRef<HTMLDivElement | null>(null); // horizontal midline
  const setGuideVis = useCallback((cx: boolean, cy: boolean) => {
    if (guideVRef.current)
      guideVRef.current.style.display = cx ? "block" : "none";
    if (guideHRef.current)
      guideHRef.current.style.display = cy ? "block" : "none";
  }, []);
  // Body-drag/handle-drag in progress (mount the shield + empty-block action layer steps aside). The selection box
  // **no longer steps aside**: unified with caption-handle ghost semantics — baseline solid line stays put,
  // dashed ghost follows the pointer, content doesn't update live, one commit on release
  const [bodyDragging, setBodyDragging] = useState(false);
  // In-place text edit echo: text changed via the iframe 'edit' message is already current in the active doc — a
  // slots-only commit of that block can skip the rebuild (rebuilding is wasted echo and flickers once). Record the
  // block id, consumed when the patch classifier hits
  const iframeEditEchoRef = useRef<Set<string>>(new Set());
  // Motion-card clicks already replace the active block timeline before playing the one-shot
  // preview. The ensuing V2 projection must not apply the same patch again and interrupt it.
  const mediaTimelineEchoRef = useRef<Map<string, string>>(new Map());
  // Back-buffer swap pending: in-place patches only hit the **active** doc; if applied while a swap is pending they'd
  // be clobbered by the incoming generation — inside this window the patch path steps aside and falls back to a full
  // doc rebuild (rebuild composes the latest comp, always correct)
  const pendingSwitchRef = useRef(false);
  // A live back-buffer is not ready to debut until its video canvas has received the current frame.
  // Ping/pong proves only that the runtime listener exists; switching on pong alone exposed the
  // untouched white canvas during rapid Agent rebuilds. The resident decoder primes this exact
  // buffer first, then the delivery callback performs the atomic swap.
  const previewFramePrimeRef = useRef<{
    idx: 0 | 1;
    doc: string;
    attempts: number;
    timer: ReturnType<typeof setTimeout> | null;
    onDelivered: () => void;
  } | null>(null);
  // Full doc rebuild in progress (write back-buffer → handshake → swap): show an "updating frame" indicator in the
  // stage corner, covering all structural changes uniformly — manual insert / AI block landing / theme mount, etc.
  // (users reported no feedback in the gap between insert and display)
  const [rebuilding, setRebuilding] = useState(false);
  // Landing skeleton for a just-inserted block (normalized coords): before the rebuild settles, draw a dashed box + spinner where the block will appear
  const [pendingInsert, setPendingInsert] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  // Drag ghost dashed box: persistent DOM, sets style directly (zero setState, like the snap guides); input is a normalized box
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const setGhostRect = useCallback(
    (g: { x: number; y: number; w: number; h: number } | null) => {
      const el = ghostRef.current;
      if (!el) return;
      const sr = stageBoxRef.current?.getBoundingClientRect();
      if (!g || !sr) {
        el.style.display = "none";
        return;
      }
      el.style.display = "block";
      const rect = boxSelectionRect(g, sr.width, sr.height);
      el.style.left = `${rect.left}px`;
      el.style.top = `${rect.top}px`;
      el.style.width = `${rect.width}px`;
      el.style.height = `${rect.height}px`;
    },
    [],
  );
  // Full-screen shield cursor during parent-side handle drag (shield rendered at the stage): set the resize cursor per drag type
  const dragCursorRef = useRef("default");
  const [bgOpen, setBgOpen] = useState(false); // background-color popover on the floating toolbar
  // Image slot clicked inside a custom block (preview bridge reports index + normalized rect): show the image-specific
  // toolbar hugging the image. Only rendered when blockId === currently selected block, so it lapses naturally on
  // deselect, no need to clear along every selection path
  const [imgSel, setImgSel] = useState<{
    blockId: string;
    index: number;
    rect: { x: number; y: number; w: number; h: number };
  } | null>(null);
  // Media block loading has two phases: upload = file uploading; swap = stored, awaiting the buffered swap after
  // rebuild + CDN image load (the known window where the frame is unchanged for a few seconds after insert/swap —
  // show "loading" instead of dead silence). Badge reuses the "generating" style
  const [mediaBusy, setMediaBusy] = useState<Record<string, "upload" | "swap">>(
    {},
  );
  const setMediaBusyPhase = useCallback(
    (id: string, phase: "upload" | "swap" | null) => {
      setMediaBusy((m) => {
        const next = { ...m };
        if (phase) next[id] = phase;
        else delete next[id];
        return next;
      });
      // swap-phase 20s fallback: if the swap never arrives (offline/load failure), the badge must not hang forever
      if (phase === "swap") {
        setTimeout(
          () =>
            setMediaBusy((m) =>
              m[id] === "swap"
                ? Object.fromEntries(
                    Object.entries(m).filter(([k]) => k !== id),
                  )
                : m,
            ),
          20000,
        );
      }
    },
    [],
  );
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const stageBoxRef = useRef<HTMLDivElement | null>(null); // stage canvas layer (boxW×boxH): used by the rotate handle to compute block center
  const rotateOverlayRef = useRef<HTMLDivElement | null>(null); // selection box root: directly set its transform during rotate drag (handle follows pointer, zero re-render)
  const rotateLabelRef = useRef<HTMLSpanElement | null>(null); // angle number next to the rotate handle: set textContent directly while dragging
  const [tSec, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [timelineFramePickActive, setTimelineFramePickActive] = useState(false);
  const [timelineFramePickBusy, setTimelineFramePickBusy] = useState(false);
  const timelineFramePickAutoClosedChatRef = useRef(false);
  const [showCode, setShowCode] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const directorTimelineScenes = useMemo(
    () => timelineDirectorScenesFromDocument(editorDocument),
    [editorDocument],
  );
  // Debug instruments (analysis/face/source) are admin-only: no entry rendered for normal users
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let alive = true;
    loadCurrentUser()
      .then((value) => {
        if (alive) setIsAdmin(value?.role === "admin");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  // Right-panel categories (selected via the vertical toolbar): chat / image / video / blocks / upload / captions / frame (code = source drill-down of the selected block)
  const [codeBlockId, setCodeBlockId] = useState<string | null>(null); // which block the source editor is viewing
  const [codeLoop, setCodeLoop] = useState(false); // source editor "loop preview" toggle
  const [panelW, setPanelW] = useState(342); // right panel width (shared by all panels, drag left edge, 320–760)
  const loopRangeRef = useRef<{ start: number; end: number } | null>(null); // loop window (final time); clock reports out-of-range → jump back
  const codeOrigRef = useRef<{
    id: string;
    templateId: string;
    slots: Block["slots"];
  } | null>(null); // baseline at source open; restore if closed without applying
  const codeDraftRef = useRef<SourceDraft | null>(null); // last uncommitted draft pushed to stage (before restore, confirm current content is still it — don't overwrite side-channel edits like chat)
  // Generation lock (genIds/markGenerating/genLockToast) — see use-generation-lock.ts
  const { genIds, genIdsRef, markGenerating, genLockToast } =
    useGenerationLock();
  const [visual, setVisual] = useState<VisualTimeline | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  // Draft restore: read once on open (later autosave overwrites storage, but the offer holds a snapshot)
  const [draftOffer, setDraftOffer] = useState<StudioDraft | null>(() =>
    typeof window === "undefined" ? null : loadDraft(projectId),
  );
  const pendingRestoreRef = useRef<StudioDraft | null>(null); // blocks restored, awaiting reconnection to the original video
  const [chatEpoch, setChatEpoch] = useState(0); // +1 after loading server sessions; remounts StudioChat with that snapshot
  const [initialChatThreads, setInitialChatThreads] = useState<readonly unknown[] | undefined>(undefined);
  const conflictWarnedRef = useRef(false);
  const migrationWriteBlockedRef = useRef(false);
  const blockForDocumentMigration = () => {
    if (migrationWriteBlockedRef.current) return;
    migrationWriteBlockedRef.current = true;
    toast.error(t("workbench.projectMigrationSaveBlocked"));
  };
  // Single-writer demotion: set when the bridge kicks this tab (close 4000 = another window took
  // over as the active surface). A displaced tab stops cloud autosave (its 409 rebase-retry is
  // forbidden — a stale tab must never clobber the writer), refreshes itself on focus, and
  // reclaims writership on the next local edit intent (undo snapshot = the edit-intent signal).
  const [displaced, setDisplaced] = useState(false);
  const displacedRef = useRef(false);
  const cloudSaveChainRef = useRef<Promise<void>>(Promise.resolve()); // serializes cloud PUTs (flush-on-evict must not race an in-flight save)
  const cloudSaveQueueRef =
    useRef<CloudProjectSaveQueue<ProjectSavePayload> | null>(null);
  const cloudSaveQueueProjectRef = useRef(projectId);
  const cloudAutosaveActivationRef = useRef<{
    projectId: string;
    activation: DeferredActivation;
  } | null>(null);
  if (
    !cloudAutosaveActivationRef.current ||
    cloudAutosaveActivationRef.current.projectId !== projectId
  ) {
    cloudAutosaveActivationRef.current = {
      projectId,
      activation: new DeferredActivation(),
    };
  }
  const cloudSaveQueueDisposerRef = useRef<DeferredEffectDisposer | null>(null);
  if (!cloudSaveQueueDisposerRef.current)
    cloudSaveQueueDisposerRef.current = new DeferredEffectDisposer();
  const bridgeReclaimRef = useRef<() => void>(() => {});
  const reclaimWritership = () => {
    if (!displacedRef.current) return;
    displacedRef.current = false;
    setDisplaced(false);
    bridgeReclaimRef.current(); // evicts the other tab; conflicts with anything it wrote resolve via the 409 rebase-retry
    void cloudSaveQueueRef.current?.flush(); // a failed pre-displacement save stays dirty until this tab can write again
    toast.info(t("workbench.reclaimedWritership"));
  };
  const [busyImport, setBusyImport] = useState(false);
  const [asrSentences, setAsrSentences] = useState<AsrSegment[] | null>(null);
  /** Insert-source transcripts (key = shot.src, sentence times = that source file's own timeline). All sources transcribed when opening the captions / smart-cut panels. */
  const [clipAsr, setClipAsr] = useState<Record<string, AsrSegment[]>>({});
  const [filmstrip, setFilmstrip] = useState<FilmstripFrame[]>([]);
  const [timelineFilmstripDemand, setTimelineFilmstripDemand] = useState<Record<string, FilmstripSourceRange[]>>({});
  useEffect(() => {
    let cancelled = false;
    migrateLegacyDraft();
    setInitialChatThreads(undefined);
    const store = studioProviders().chats;
    void (store?.list(projectId) ?? Promise.resolve([]))
      .then((threads) => {
        if (cancelled) return;
        setInitialChatThreads(Array.isArray(threads) ? threads : []);
        setChatEpoch((value) => value + 1);
      })
      .catch(() => {
        if (!cancelled) setInitialChatThreads([]);
      });
    return () => { cancelled = true; };
  }, [projectId]);
  const persistChatThread = useCallback((thread: unknown) => {
    void studioProviders().chats?.save(projectId, thread).catch((error) => {
      console.error("[studio] chat save failed", error);
      toast.error(t("workbench.syncFailedTryAgain"));
    });
  }, [projectId]);
  const [pps, setPps] = useState(DEFAULT_PPS); // timeline zoom (px/sec), controlled by the ruler slider
  const [timelineSnapEnabled, setTimelineSnapEnabled] = useState(true);
  // Primary auto-snap is an invariant while enabled, including after project restore and after an
  // asset insertion. This keeps old head/middle gaps from surviving merely because no clip was dragged.
  useEffect(() => {
    if (!timelineSnapEnabled) return;
    const clips = primaryNarrativeClips(editorDocument);
    let cursor = 0;
    const needsPacking = clips.some((clip) => {
      const shifted = clip.startFrame !== cursor;
      cursor += clip.durationFrames;
      return shifted;
    });
    if (!needsPacking || !clips[0]) return;
    const edit = moveVisualDocumentClip({
      document: editorDocument,
      clipId: clips[0].id,
      atSec: 0,
      target: { kind: "primary" },
      primaryOrder: clips.map((clip) => clip.id),
    });
    if (edit.ok) setEditorDocument(edit.document);
  }, [editorDocument, setEditorDocument, timelineSnapEnabled]);
  const [locateSignal, setLocateSignal] = useState(0); // increment = scroll timeline to the playhead
  // near=true: only scroll when the playhead would be off-screen (jumps made from another panel), vs the
  // transport readout, which always centres because that IS the request.
  const [locateNear, setLocateNear] = useState(false);
  const locateTimeline = (near = false) => {
    setLocateNear(near);
    setLocateSignal((n) => n + 1);
  };
  const [libTab, setLibTab] = useState<
    "assets" | "frames" | "script" | "captions" | "audio" | "text" | "gen" | "avatar"
  >("assets"); // rail primary-nav tab (themes hidden)
  const [libCollapsed, setLibCollapsed] = useState(false); // asset rail collapsed (narrow strip + expand button; content hidden but state kept)
  const selectedDisplayTextBlock = useMemo(
    () => selectedId
      ? comp.blocks.find((block) => block.id === selectedId && block.templateId === "title") ?? null
      : null,
    [comp.blocks, selectedId],
  );
  const selectedDisplayTextBlockId = selectedDisplayTextBlock?.id ?? null;
  // Asset rail geometry: the expanded content width is drag-resizable and persists. Collapsing
  // keeps the primary-nav strip docked so navigation and the expand control stay in one place.
  const [railW, setRailW] = useState(() => {
    if (typeof window === "undefined") return 320;
    const v = Number(window.localStorage.getItem("studio-rail-w"));
    if (Number.isFinite(v) && v >= 260 && v <= 786) return v;
    // No stored width → derive from the screen: fit a whole number of fixed 120px asset-card
    // columns (~22vw budget, 2–6 cols) so the grid lands flush with no leftover strip.
    // 130 = card 120 + gap 10; 16 = the grid's p-2 content padding.
    const cols = Math.max(
      2,
      Math.min(6, Math.floor((window.innerWidth * 0.22 - 6) / 130)),
    );
    return 16 + cols * 120 + (cols - 1) * 10;
  });
  useEffect(() => {
    try {
      window.localStorage.setItem("studio-rail-w", String(railW));
    } catch {
      /* private mode: geometry just resets next session */
    }
  }, [railW]);
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
    const mq = window.matchMedia("(max-width: 1152px)");
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
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  // Chat area (left) open/close: chat can be closed to free up the frame; the top-right "chat" button on the preview
  // only appears when chat is hidden. Agent view collapses by default: the main conversation lives in the external
  // agent (Codex), the built-in chat on the right just takes up space
  const [panelOpen, setPanelOpen] = useState(!agentView);
  const restoreChatAfterTimelineFramePick = useCallback(() => {
    setTimelineFramePickActive(false);
    if (!timelineFramePickAutoClosedChatRef.current) return;
    timelineFramePickAutoClosedChatRef.current = false;
    setPanelOpen(true);
  }, []);
  // Contextual tool panels (smart-cut/person/framing/code/anim/transition): **dock into the asset rail column, full area**
  // (per user: not a new tab, takes the whole column; if the rail is collapsed, expand it first, and collapse back
  // when a panel-triggered expansion closes). **Single instance** — opening another replaces the current one
  // (setFloatWin handles the exit settlement uniformly).
  const [floatWin, setFloatWinRaw] = useState<FloatKind | null>(null);
  const floatWinRef = useRef<FloatKind | null>(null);
  const [genType, setGenType] = useState<GenType>("image"); // current tab inside the gen panel
  const [genSeedPrompt, setGenSeedPrompt] = useState<{
    type: GenType;
    prompt: string;
    revision: number;
  } | null>(null);
  const genSeedRevisionRef = useRef(0);
  const [genRefreshTick, setGenRefreshTick] = useState(0);
  /** The rail was "auto-expanded just to dock a panel" — collapse it back after the panel closes (leave user-expanded ones alone). */
  const libAutoExpandedRef = useRef(false);
  const [area, setArea] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [showGeom, setShowGeom] = useState(false); // debug: overlay face/safe-zone geometry on the preview to verify the algorithm
  const [liveGeom, setLiveGeom] = useState<SafeZone | null>(null); // live single-frame detection (measure whichever frame you scrub to)

  const duration = renderPlan.durationSec;
  const hasVideoTrack = renderPlan.narrative.length > 0;
  const hasContent = renderPlan.durationFrames > 0;
  const hasSplitSelection =
    !!selectedAudioId ||
    !!selectedVisualClipId ||
    selectedBlockIds.size > 0 ||
    selectedShotIds.size > 0;
  // Canvas ratio: seeded by the FIRST inserted source (insertClipCore), overridable here; other
  // sources contain-fit into it (frame shim letterboxes, never crops).
  const CANVAS_RATIOS = [
    { id: "9:16", w: 1080, h: 1920 },
    { id: "16:9", w: 1920, h: 1080 },
    { id: "1:1", w: 1080, h: 1080 },
    { id: "3:4", w: 1080, h: 1440 },
    { id: "4:3", w: 1440, h: 1080 },
  ] as const;
  const currentRatioId = CANVAS_RATIOS.find(
    (r) => Math.abs(r.w / r.h - comp.width / comp.height) < 0.02,
  )?.id;
  const sourceCanvasSize = canvasSizeFollowingFirstVideo(editorDocument);
  const followsFirstSource = !!sourceCanvasSize
    && Math.abs(sourceCanvasSize.width / sourceCanvasSize.height - comp.width / comp.height) < 0.02;
  const [ratioOpen, setRatioOpen] = useState(false);
  const applyCanvasRatio = (w: number, h: number) => {
    setRatioOpen(false);
    if (
      Math.abs(w / h - comp.width / comp.height) < 0.02 &&
      editorDocumentRef.current.canvas.configured
    )
      return;
    const edit = applyCanvasDocumentEdit({
      projectId,
      document: editorDocumentRef.current,
      width: w,
      height: h,
      mainTranscript: asrRef.current,
      clipTranscripts: clipAsrRef.current,
    });
    if (!edit.ok) {
      toast.error(editorErrorMessage(edit.error));
      return;
    }
    pushUndoSnapshot();
    setEditorDocument(edit.document);
  };
  const applySourceCanvasRatio = () => {
    if (!sourceCanvasSize) {
      toast.info(t("workbench.followSourceUnavailable"));
      return;
    }
    applyCanvasRatio(sourceCanvasSize.width, sourceCanvasSize.height);
  };
  // Preview box scale: computed after `bufs` below (stage geometry follows the ACTIVE doc's canvas
  // dims, not the live comp — a ratio switch must change shape atomically WITH the buffer swap,
  // otherwise the old content flashes stretched into the new shape for the rebuild window).
  const activeStageSizeRef = useRef({ width: 0, height: 0 });
  /** Floating toolbar positioning — single source of truth, shared by drag-follow (direct DOM writes) and React
   *  render; the two must produce identical numbers to avoid jumps. Pure follow, no clamping (edge-docking feel was
   *  rejected); avoiding truncation is structural: the toolbar mounts outside the stage's clipping layer. */
  const toolbarXY = useCallback(
    (box?: { x: number; y: number; w: number; h: number } | null) => {
      const { width: W, height: H } = activeStageSizeRef.current;
      return {
        left: box ? (box.x + box.w / 2) * W : W / 2,
        top: box ? box.y * H - 40 : 8,
      };
    },
    [],
  );
  // Debug overlay: geometry (face/safe-zone) of the frame segment at the playhead; normalized coords overlaid as % on the preview (= full-canvas scale)
  const geomSeg =
    showGeom && visual
      ? (visual.segments.find(
          (s) => tSec >= s.start - 0.01 && tSec < s.end + 0.01,
        ) ??
        visual.segments.at(-1) ??
        null)
      : null;
  // Geometry for the overlay: prefer **live single frame** (measure whichever frame you scrub to, accurate), else fall back to **segment aggregate**
  const dbgGeom = showGeom ? (liveGeom ?? geomSeg?.geom ?? null) : null;
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
      const previewUrl =
        m?.type === "image" && m.url ? imageThumb(m.url, "canvas") : null;
      if (!previewUrl && b.fitScale === undefined) return b;
      return {
        ...b,
        ...(b.fitScale !== undefined ? { fitScale: undefined } : {}),
        ...(previewUrl
          ? { slots: { ...b.slots, media: { ...m, url: previewUrl } } }
          : {}),
      };
    }),
  });
  // Debug HTML is built only while open; high-frequency native drag patches must not stitch it every frame.
  const assembled = useMemo(
    () =>
      showCode
        ? assembleHtml(
            previewCompOf(renderComposition),
            undefined,
            renderVideoPlacements,
            supplementalVisuals,
          )
        : "",
    [renderComposition, showCode, renderVideoPlacements, supplementalVisuals],
  );

  // Test hook: readable snapshot of the narration script + visual analysis (also on window.__studio for devtools)
  const debugText = useMemo(() => {
    const out: string[] = [`# transcript (${asrSentences?.length ?? 0} lines)`];
    (asrSentences ?? []).forEach((s, i) =>
      out.push(`${i}. [${s.start.toFixed(1)}–${s.end.toFixed(1)}] ${s.text}`),
    );
    out.push(
      "",
      `# visual analysis (${visual?.segments.length ?? 0} segments · ${visual?.cuts.length ?? 0} source cuts)`,
    );
    out.push(`geometry pass (MediaPipe): ${geomNote()}`);
    if (visual) out.push(`geometry pass: ${visual.geomNote ?? "—"}`);
    const pct = (n: number) => Math.round(n * 100);
    const fmtRect = (r: { x: number; y: number; w: number; h: number }) =>
      `(${pct(r.x)},${pct(r.y)} ${pct(r.w)}×${pct(r.h)})`;
    (visual?.segments ?? []).forEach((sg) => {
      out.push(
        `[${sg.start.toFixed(1)}–${sg.end.toFixed(1)}] ${sg.label.content} · person:${sg.label.person} · safe:${sg.label.safe} · ${sg.label.hasText ? "burned-in text" : "no burned-in text"}${sg.label.desc ? ` · ${sg.label.desc}` : ""}`,
      );
      if (sg.geom) {
        out.push(
          `      safe-zones%: ${sg.geom.rects.map(fmtRect).join(" ") || "(none)"}` +
            `${sg.geom.face ? ` · face${fmtRect(sg.geom.face)}` : ""}${sg.geom.subject ? ` · subject${fmtRect(sg.geom.subject)}` : ""}`,
        );
      }
    });
    return out.join("\n");
  }, [asrSentences, visual]);
  useEffect(() => {
    (window as unknown as { __studio?: unknown }).__studio = {
      asr: asrSentences,
      visual,
    };
  }, [asrSentences, visual]);
  // Preview double-buffering: after a comp change the new doc loads in a **background iframe** (inject video/seek/
  // restore selection); it swaps atomically only when ready, keeping the old frame visible to the last moment —
  // eliminates the full-reload white flash (especially visible when a run of images completes).
  const [bufs, setBufs] = useState<{
    docs: [string, string];
    dims: [{ w: number; h: number }, { w: number; h: number }];
    active: 0 | 1;
    /** Per-buffer doc revision: the iframe is keyed on it so a doc change REMOUNTS the frame.
     *  Navigating a mounted iframe (srcDoc mutation) pushes a session-history entry each time —
     *  minutes of editing made the browser Back button need dozens of presses to leave. */
    revs: [number, number];
  }>(() => ({
    docs: [injectPreviewRuntime(assembleHtml(starter)), ""],
    revs: [0, 0],
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
  const stageGeometry = previewStageGeometry({
    areaW: area.w,
    areaH: area.h,
    canvasW: activeDims.w,
    canvasH: activeDims.h,
  });
  const fit = stageGeometry.fit;
  const fitRef = useRef(fit); // used in the (mounted-once) message handler to convert comp px → stage px
  fitRef.current = fit;
  const boxW = stageGeometry.width;
  const boxH = stageGeometry.height;
  activeStageSizeRef.current = { width: boxW, height: boxH };
  const previewAreaRef = useRef<HTMLDivElement | null>(null);
  const tRef = useRef(0);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;
  const selectedShotIdRef = useRef<string | null>(null);
  selectedShotIdRef.current = selectedShotId;
  const playingRef = useRef(false);
  playingRef.current = playing;
  const timelineFramePickActiveRef = useRef(false);
  timelineFramePickActiveRef.current = timelineFramePickActive;
  // Read/write the latest state while pipeline tools run async (setState is async; multi-step tool runs rely on refs for the latest)
  const videoFileRef = useRef<File | null>(null);
  videoFileRef.current = videoFile;
  const asrRef = useRef<AsrSegment[] | null>(null);
  asrRef.current = asrSentences;
  const clipAsrRef = useRef<Record<string, AsrSegment[]>>({});
  clipAsrRef.current = clipAsr;
  const localTranscriptCacheRef = useRef<Map<string, AsrSegment[]>>(new Map());
  useEffect(() => {
    localTranscriptCacheRef.current.clear();
  }, [projectId]);
  const visualRef = useRef<VisualTimeline | null>(null);
  visualRef.current = visual;
  // BYO visual analysis (visual_brief/submit_visual): the prepared-brief intermediate state awaiting the agent's labels
  const visualBriefRef = useRef<VisualPrep | null>(null);
  /** Land visual analysis results (shared by BYO submit and cache hit; same as stepVisual's finalization). */
  const applyVisualResult = (vis: VisualTimeline) => {
    visualRef.current = vis;
    setVisual(vis);
    // Attach the background-derived palette to the composition; don't override when a frame is mounted (a frame is a user-chosen design system)
    if (vis.palette && !editorDocumentRef.current.appearance.frameId) {
      const command = applyEditorCommand(editorDocumentRef.current, {
        type: "appearance.patch",
        patch: { palette: vis.palette },
      });
      if (command.ok) setEditorDocument(command.document);
    }
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
    if (
      videoSigRef.current &&
      !videoFile &&
      !firstNarrativeAsset(editorDocument)
    )
      videoSigRef.current = null;
  }, [editorDocument, videoFile]);
  const objectUrlRef = useRef<string | null>(null); // current blob: preview URL, revoked on swap/unmount
  // Person matte: when enabled, the fully-budgeted mask track (source-time indexed, webp-compressed in memory; invalidated on video swap)
  // Parent-side video track engine (canvas render mode): decode/clock/audio stay resident, frames pushed to the iframe canvas
  const videoEngineRef = useRef<VideoTrackEngine | null>(null);
  useEffect(() => {
    const eng = new VideoTrackEngine();
    videoEngineRef.current = eng;
    eng.onFrame = (frame, info, frame2) => {
      const pendingPrime = previewFramePrimeRef.current;
      const prime = pendingPrime
        && bufsRef.current.docs[pendingPrime.idx] === pendingPrime.doc
        && bufsRef.current.active !== pendingPrime.idx
        ? pendingPrime
        : null;
      if (pendingPrime && !prime) {
        if (pendingPrime.timer) clearTimeout(pendingPrime.timer);
        previewFramePrimeRef.current = null;
      }
      const targetIdx = prime?.idx ?? bufsRef.current.active;
      // Ordinarily push to the active buffer. During a pending structural rebuild, one current frame
      // is deliberately delivered to the proven-live back-buffer before it is allowed to debut.
      // frame2 = the "other side" shadow frame within a transition window (true dual-stream: before cut = B's lead-in, after cut = A's tail)
      const w = iframesRef.current[targetIdx]?.contentWindow;
      if (!w) {
        // No target window (iframe torn down mid-decode): close instead of leaking the bitmaps
        frame.close();
        frame2?.close();
        return;
      }
      if (primaryHiddenRef.current) {
        frame.close();
        frame2?.close();
        w.postMessage({ type: "hf:clearFrame", t: info.t }, "*");
        if (prime && previewFramePrimeRef.current === prime) {
          if (prime.timer) clearTimeout(prime.timer);
          previewFramePrimeRef.current = null;
          queueMicrotask(prime.onDelivered);
        }
        return;
      }
      try {
        w.postMessage(
          {
            type: "hf:frame",
            frame,
            ...(frame2 ? { frame2 } : {}),
            ...(info.framing ? { framing: info.framing } : {}),
            ...(info.framing2 ? { framing2: info.framing2 } : {}),
            ...(info.baked ? { baked: true } : {}),
            ...(info.sourceWidth ? { sourceWidth: info.sourceWidth } : {}),
            ...(info.sourceHeight ? { sourceHeight: info.sourceHeight } : {}),
            ...(info.sourceWidth2 ? { sourceWidth2: info.sourceWidth2 } : {}),
            ...(info.sourceHeight2
              ? { sourceHeight2: info.sourceHeight2 }
              : {}),
            t: info.t,
            elKey: info.elKey,
            srcT: info.srcT,
          },
          "*",
          frame2 ? [frame, frame2] : [frame],
        );
        if (prime && previewFramePrimeRef.current === prime) {
          if (prime.timer) clearTimeout(prime.timer);
          previewFramePrimeRef.current = null;
          queueMicrotask(prime.onDelivered);
        }
      } catch {
        try {
          frame.close();
          frame2?.close();
        } catch {
          /* ignore */
        }
      }
    };
    eng.onBlank = (t) => {
      const pendingPrime = previewFramePrimeRef.current;
      const prime = pendingPrime
        && bufsRef.current.docs[pendingPrime.idx] === pendingPrime.doc
        && bufsRef.current.active !== pendingPrime.idx
        ? pendingPrime
        : null;
      const w = iframesRef.current[prime?.idx ?? bufsRef.current.active]?.contentWindow;
      w?.postMessage({ type: "hf:clearFrame", t }, "*");
      if (w && prime && previewFramePrimeRef.current === prime) {
        if (prime.timer) clearTimeout(prime.timer);
        previewFramePrimeRef.current = null;
        queueMicrotask(prime.onDelivered);
      }
    };
    eng.onTick = (t) => {
      if (!playingRef.current) return;
      tRef.current = t;
      playhead.set(t);
      postPreview({ type: "hf:seekTimelines", t }); // align overlay layers (GSAP/captions) every frame
    };
    // Transition pre-bake provider: cut → decoded frame group (bakesRef maintained by the effect below)
    eng.bakeProvider = (cut) => {
      for (const e of bakesRef.current.values()) {
        if (Math.abs(e.cut - cut) < 0.05 && e.bitmaps && e.baked)
          return { fps: e.baked.fps, half: e.half, frames: e.bitmaps };
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
      const pendingPrime = previewFramePrimeRef.current;
      if (pendingPrime?.timer) clearTimeout(pendingPrime.timer);
      previewFramePrimeRef.current = null;
      eng.dispose();
      videoEngineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mask tracks stored per **source** (multi-source main track: one per source file, key = 'main' | shot.src): matte whichever file a segment's source points to
  const matteTrackRef = useRef<Map<string, MatteFrame[]>>(new Map());
  const matteAbortRef = useRef<AbortController | null>(null);
  const [matteState, setMatteState] = useState<MatteState>({
    status: "idle",
    done: 0,
    total: 0,
  });
  const chatRef = useRef<StudioChatHandle | null>(null); // lets workbench actions coordinate with the active chat thread
  // Export (state + submit/poll/cancel) — see use-export.ts
  /** Files for locally-inserted clips (key = blob URL; the two split halves share one src so they share naturally):
   *  same "keep local, don't upload" mode as the main video, injected into preview via hf:clipFile and read directly
   *  by client export. After refresh the blob is invalid; revived from the OPFS local library by srcSig (see draft restore). */
  const clipFilesRef = useRef<Map<string, File>>(new Map());
  /** The main video's **effective sig**: usually = fileSig(videoFile); when fetched from cloud, the original sig
   *  (a fetched File's name/mtime change so fileSig drifts — sync layer/cache keys all read this, never recompute). */
  const videoSigRef = useRef<string | null>(null);
  /** Transient cloud byte index: sig → R2 key. Successful backups are folded into V2 asset locators. */
  const cloudMediaRef = useRef<{
    video?: { sig: string; key: string };
    clips?: Record<string, { key: string }>;
  }>({});
  const [cloudMediaRev, setCloudMediaRev] = useState(0);
  /** Metadata-only index of project-local assets. Unlike cloudMediaRef, this never implies the bytes
   *  are in R2 — it exists so another browser can render restore cards and ask for the originals. */
  const localAssetIndexRef = useRef<LocalAssetIndexEntry[]>([]);
  const localAssetIndexKnownRef = useRef(false);
  const localAssetIndexMutationRevRef = useRef(0);
  const [localAssetIndexRev, setLocalAssetIndexRev] = useState(0);
  const setLocalAssetIndex = useCallback((entries: LocalAssetIndexEntry[]) => {
    const next = [
      ...new Map(entries.map((entry) => [entry.assetId, entry])).values(),
    ].sort((a, b) => b.createdAt - a.createdAt);
    if (
      JSON.stringify(next) === JSON.stringify(localAssetIndexRef.current) &&
      localAssetIndexKnownRef.current
    )
      return;
    localAssetIndexRef.current = next;
    localAssetIndexKnownRef.current = true;
    setLocalAssetIndexRev((value) => value + 1);
  }, []);
  const changeLocalAssetIndex = useCallback(
    (entries: LocalAssetIndexEntry[]) => {
      localAssetIndexMutationRevRef.current += 1;
      setLocalAssetIndex(entries);
    },
    [setLocalAssetIndex],
  );

  /** Resolve a persisted device-local image identity without ever minting a cloud URL. Folder
   * handles are pinned into OPFS after the first explicit access so later capture/export is stable. */
  const resolveLocalImageFile = useCallback(
    async (sig: string): Promise<File | null> => {
      const direct = await loadLocalVideo(sig);
      if (direct) return direct;
      const entry = localAssetIndexRef.current.find(
        (item) => item.contentSig === sig && item.kind === "image",
      );
      if (!entry?.folder) return null;
      const folder = await loadLocalFolderFile(
        entry.folder.id,
        entry.folder.path,
        sig,
      );
      if (!folder?.file) return null;
      await saveLocalVideo(folder.file, sig, undefined, { pinned: true });
      return folder.file;
    },
    [],
  );
  const localRuntimePreparingRef = useRef<Map<string, Promise<
    | { ok: true; prepared: boolean; file?: File }
    | { ok: false; error: string }
  >>>(new Map());
  const localRuntimeReadyAssetIdsRef = useRef<Set<string>>(new Set());
  const localRuntimeFilesRef = useRef<Map<string, File>>(new Map());
  const localRuntimeGenerationRef = useRef(0);
  useEffect(() => {
    localRuntimeGenerationRef.current += 1;
    localRuntimePreparingRef.current.clear();
    localRuntimeReadyAssetIdsRef.current.clear();
    localRuntimeFilesRef.current.clear();
  }, [projectId]);
  /** One device-local runtime contract for every media kind. The durable document keeps the
   * logical asset id plus content sig; this boundary restores/pins device bindings and attaches
   * session-only URLs without uploading anything. */
  const prepareLocalAssetRuntime = useCallback(
    (asset: EditorMediaAsset, options?: { asPrimary?: boolean }): Promise<
      | { ok: true; prepared: boolean; file?: File }
      | { ok: false; error: string }
    > => {
      const sig = asset.locator.localSig;
      if (!sig) return Promise.resolve({ ok: true, prepared: false });
      if (localRuntimeReadyAssetIdsRef.current.has(asset.id)) {
        return Promise.resolve({
          ok: true,
          prepared: false,
          ...(localRuntimeFilesRef.current.get(asset.id)
            ? { file: localRuntimeFilesRef.current.get(asset.id) }
            : {}),
        });
      }
      const current = localRuntimePreparingRef.current.get(asset.id);
      if (current) return current;
      const generation = localRuntimeGenerationRef.current;
      const task = (async () => {
        const byLogicalId = resolveLocalAssetReference(asset.id, localAssetIndexRef.current);
        const sameContent = localAssetIndexRef.current.filter(
          (item) => item.contentSig === sig && (item.kind ?? "video") === asset.kind,
        );
        const entry = byLogicalId && (byLogicalId.kind ?? "video") === asset.kind
          ? byLogicalId
          : sameContent.length === 1
            ? sameContent[0]
            : undefined;
        const local = entry ? await loadLocalAssetFile(projectId, entry) : await loadLocalVideo(sig);
        const cloud = !local && asset.locator.cloudKey
          ? await studioProviders().vault.fetch(sig)
          : null;
        const file = local ?? cloud ?? null;
        if (generation !== localRuntimeGenerationRef.current) {
          return { ok: false as const, error: 'media preparation was superseded by an output change' };
        }
        if (!file) {
          const source = resolveAssetUrl(asset);
          if (source && !source.startsWith("blob:")) {
            localRuntimeReadyAssetIdsRef.current.add(asset.id);
            return { ok: true as const, prepared: false };
          }
          return {
            ok: false as const,
            error: `local ${asset.kind} access is unavailable — restore access to “${asset.label || sig}”, then retry`,
          };
        }
        // OPFS pinning improves refresh recovery, but a full local cache must not prevent the
        // currently authorized File/folder handle from being used in this session.
        try {
          await saveLocalVideo(file, sig, undefined, {
            pinned: asset.kind === "image" || asset.kind === "audio",
            ...(entry ? { binding: { projectId, assetId: entry.assetId } } : {}),
          });
        } catch {
          // The authorized File remains usable for this session even when the local cache is full.
        }
        // The Materials panel may have already rendered a restore card before this tool-driven
        // recovery completed. Publish a new registry identity so its byte-resolution effect retries
        // immediately instead of waiting for a remount or project refresh.
        localAssetIndexRef.current = [...localAssetIndexRef.current];
        setLocalAssetIndexRev((value) => value + 1);
        localRuntimeFilesRef.current.set(asset.id, file);
        if (asset.kind === "image") {
          localRuntimeReadyAssetIdsRef.current.add(asset.id);
          return { ok: true as const, prepared: true, file };
        }
        const url = URL.createObjectURL(file);
        clipFilesRef.current.set(url, file);
        rememberAssetUrl(asset.id, url);
        localRuntimeReadyAssetIdsRef.current.add(asset.id);
        return { ok: true as const, prepared: true, file };
      })().finally(() => {
        localRuntimePreparingRef.current.delete(asset.id);
      });
      localRuntimePreparingRef.current.set(asset.id, task);
      return task;
    },
    [projectId, rememberAssetUrl, resolveAssetUrl],
  );
  // Heal metadata-only clips from older agent runs as soon as this device can resolve their bytes.
  // Images already restore through postLocalImages; audio/video need a session URL before they can
  // enter the render projection and audio engine.
  useEffect(() => {
    let cancelled = false;
    const referencedAssetIds = new Set(
      editorDocument.timeline.tracks.flatMap((track) =>
        track.clips.flatMap((clip) =>
          "assetId" in clip && clip.assetId ? [clip.assetId] : [],
        ),
      ),
    );
    const missing = [...referencedAssetIds]
      .map((assetId) => editorDocument.assets[assetId])
      .filter(
        (asset): asset is EditorMediaAsset =>
          !!asset?.locator.localSig &&
          asset.kind !== "image" &&
          !localRuntimeReadyAssetIdsRef.current.has(asset.id),
      );
    if (!missing.length) return () => { cancelled = true; };
    void (async () => {
      let prepared = false;
      for (const asset of missing) {
        const result = await prepareLocalAssetRuntime(asset, { asPrimary: false });
        prepared ||= result.ok && result.prepared;
        if (!result.ok) {
          console.warn(
            `[studio] local ${asset.kind} runtime restore failed for ${asset.id}: ${result.error}`,
          );
        }
      }
      if (!cancelled && prepared) setEditorDocument(editorDocumentRef.current);
    })();
    return () => { cancelled = true; };
  }, [editorDocument, localAssetIndexRev, prepareLocalAssetRuntime, resolveAssetUrl, setEditorDocument]);
  // Persistence metadata is folded into V2 synchronously without coupling the live-document module
  // to workbench feature refs.
  livePersistenceMetadataRef.current = {
    ...(asrRef.current?.length
      ? { mainTranscript: sanitizeTranscriptSegs(asrRef.current) }
      : {}),
    ...(Object.keys(clipAsrRef.current).length
      ? {
          clipTranscripts: Object.fromEntries(
            Object.entries(clipAsrRef.current).map(([key, value]) => [
              key,
              sanitizeTranscriptSegs(value),
            ]),
          ),
        }
      : {}),
    ...(cloudMediaRef.current.video || cloudMediaRef.current.clips
      ? { cloudMedia: cloudMediaRef.current }
      : {}),
    ...(localAssetIndexKnownRef.current
      ? { localAssets: localAssetIndexRef.current }
      : {}),
    videoSig: videoSigRef.current,
    videoDurationSec: firstNarrativeDurationSec(editorDocumentRef.current),
  };
  /** Silently back up a source video to R2 (content-addressed, dup = instant); on success record the index and trigger a cloud sync. */
  const backupMediaToCloud = (
    file: File,
    sig: string,
    kind: "video" | "clip",
  ) => {
    void studioProviders()
      .vault.backup(file, sig)
      .then((r) => {
        if (!r) return; // silent degrade: local works as usual, retry on next open (idempotent)
        if (kind === "video")
          cloudMediaRef.current = {
            ...cloudMediaRef.current,
            video: { sig, key: r.key },
          };
        else
          cloudMediaRef.current = {
            ...cloudMediaRef.current,
            clips: { ...cloudMediaRef.current.clips, [sig]: { key: r.key } },
          };
        setCloudMediaRev((v) => v + 1);
      });
  };
  /** Export-time audio/denoise payload getters; filled by useBgm/useDenoise below (hook order: they need consts defined later). */
  const audioExportRef = useRef<
    (() => Promise<{ clip: AudioClip; file: File }[] | null>) | null
  >(null);
  const denoiseExportRef = useRef<(() => Map<string, File> | null) | null>(
    null,
  );
  const {
    exporting,
    publishing,
    exportPct,
    exportVideo,
    cancelExport,
    resetExport,
  } = useStudioExport({
    compRef,
    documentRef: editorDocumentRef,
    resolveAssetUrl,
    videoFileRef,
    clipFilesRef,
    audioExportRef,
    denoiseExportRef,
  });
  // Agent export task (export_video/track_export): compose + browser download runs via exportVideo, this only tracks task state;
  // exportPct mirrored into a ref for the progress query inside runStudioTool (the switch closure can't read state)
  const agentExportRef = useRef<{
    running: boolean;
    filename: string | null;
    error: string | null;
    delivered?: "local_sink" | "browser_download";
    sinkError?: string;
  }>({
    running: false,
    filename: null,
    error: null,
  });
  const exportPctRef = useRef(0);
  exportPctRef.current = exportPct;
  // Export dialog: options persist (remembers last choice within this session), only runs on confirm
  const [exportOpen, setExportOpen] = useState(false);
  const [exportOpts, setExportOpts] =
    useState<ExportRenderOpts>(DEFAULT_RENDER_OPTS);

  // Timeline duration is independent from the video segment table: an empty primary track may
  // still contain graphics/audio, and those regions need a real parent-side playback clock.
  useEffect(() => {
    videoEngineRef.current?.setTimelineDuration(duration);
  }, [duration]);
  // Engine segment table + other sources: refeed the whole table whenever shots change (split/trim/insert/delete); push the current frame when paused
  useEffect(() => {
    const eng = videoEngineRef.current;
    if (!eng) return;
    // Every narrative shot carries its own source. The lane engine keeps one resident decoder per
    // source URL and never creates a privileged "main" decoder.
    const shotsById = new Map(
      videoTrackShots(comp).map((shot) => [shot.id, shot]),
    );
    const entries = primaryNarrative.activeEntries.flatMap((entry) => {
      const shot = shotsById.get(entry.clipId);
      return shot ? [{ entry, shot }] : [];
    });
    const shots = entries.map(({ shot }) => shot);
    for (const s of shots) {
      if (!s.src) continue;
      const f = clipFilesRef.current.get(s.src);
      eng.setSource(s.src, f ?? (s.src.startsWith("blob:") ? null : s.src));
    }
    const shapeChanged = eng.setSegments(
      // Same envelope the export mixer builds (segmentFadeFn): the shot's own fades × micro-fades on edges
      // that meet a non-contiguous neighbour. Preview drives it off the rAF clock, so a 30 ms ramp lands as
      // two or three volume steps rather than a smooth curve — coarse, but it's the same treatment at the
      // same seams, which is what keeps preview honest about the export.
      entries.map(({ shot: s, entry }, i) => {
        const prev = shots[i - 1];
        const next = shots[i + 1];
        const fade = segmentFadeFn(
          s,
          Math.max(0.01, entry.durationSec),
          !!prev &&
            (!shotsContiguous(prev, s) ||
              Math.abs(entries[i - 1]!.entry.endSec - entry.startSec) > 1e-3),
          !!next &&
            (!shotsContiguous(s, next) ||
              Math.abs(entry.endSec - entries[i + 1]!.entry.startSec) > 1e-3),
        );
        return {
          key: s.src!,
          elKey: `clip_${s.id}`,
          srcStart: s.srcStart,
          srcEnd: s.srcEnd,
          timelineStart: entry.startSec,
          timelineEnd: entry.endSec,
          gain: primaryNarrative.muted ? 0 : shotGain(s),
          ...(s.preciseFraming?.coordinateSpace === "source-normalized"
            ? { framing: s.preciseFraming }
            : {}),
          ...(fade ? { fadeAt: fade } : {}),
        };
      }),
    );
    eng.setTransitions(
      primaryNarrative.hidden
        ? []
        : cutTransitions(shots, renderVideoPlacements).map((tr) => ({
            cut: tr.cut,
            half: tr.half,
          })),
    ); // window table for shadow decoding
    // A level-only respec keeps the frame it already shows — re-pushing one per pointer move while dragging
    // a volume slider is work nobody can see.
    if (shapeChanged && !playingRef.current) eng.refresh();
  }, [comp, primaryNarrative, renderVideoPlacements]);
  /** Transition pre-bake cache (same idea as Premiere's "render preview"): baked in the background to a webp frame
   *  sequence, decoded to bitmaps only near the window and discarded once past; the signature includes cut/duration/
   *  effect/direction/both sides' source times and file fingerprints — any relevant edit auto-invalidates. While baking,
   *  or if it can't bake (file missing), playback falls back to the shadow-decode path. */
  const bakesRef = useRef<
    Map<
      string,
      {
        sig: string;
        cut: number;
        half: number;
        baked: BakedWindow | null;
        bitmaps: ImageBitmap[] | null;
        decoding?: boolean;
      }
    >
  >(new Map());
  const bakeGenRef = useRef(0);
  useEffect(() => {
    const gen = ++bakeGenRef.current;
    const c = comp;
    const shots = ensureShots(c);
    if (primaryNarrative.hidden) return;
    const spans = videoShotTimelineSpans(shots, renderVideoPlacements);
    const specs: (BakeSpec & { sig: string })[] = [];
    for (const tr of cutTransitions(shots, renderVideoPlacements)) {
      const iB = spans.findIndex(
        (sp, i) => i >= 1 && Math.abs(sp.editedStart - tr.cut) < 0.05,
      );
      if (iB < 1) continue;
      const A = spans[iB - 1]!.clip;
      const B = spans[iB]!.clip;
      const boxA = renderVideoPlacements.find(
        (placement) => placement.shotId === A.id,
      )?.box;
      const boxB = renderVideoPlacements.find(
        (placement) => placement.shotId === B.id,
      )?.box;
      const fullBox = (box: MediaCanvasBox | undefined) =>
        !box ||
        (Math.abs(box.x) < 1e-6 &&
          Math.abs(box.y) < 1e-6 &&
          Math.abs(box.w - 1) < 1e-6 &&
          Math.abs(box.h - 1) < 1e-6);
      // The low-priority bake path still rasterizes a composition-sized source before the layer's
      // CSS placement. For independent/off-canvas media boxes, keep the live dual-decoder path;
      // otherwise the baked window would briefly resurrect the old canvas-stretch bug.
      if (!fullBox(boxA) || !fullBox(boxB)) continue;
      const rateA = segmentSourceRate(
        A,
        spans[iB - 1]!.editedStart,
        spans[iB - 1]!.editedEnd,
      );
      const rateB = segmentSourceRate(
        B,
        spans[iB]!.editedStart,
        spans[iB]!.editedEnd,
      );
      const fileA = A.src ? clipFilesRef.current.get(A.src) : videoFile;
      const fileB = B.src ? clipFilesRef.current.get(B.src) : videoFile;
      if (!fileA || !fileB) continue;
      const framingA =
        A.preciseFraming?.coordinateSpace === "source-normalized"
          ? A.preciseFraming
          : undefined;
      const framingB =
        B.preciseFraming?.coordinateSpace === "source-normalized"
          ? B.preciseFraming
          : undefined;
      const sig = [
        tr.cut.toFixed(2),
        tr.half.toFixed(2),
        tr.effect,
        tr.dir,
        A.srcEnd.toFixed(3),
        B.srcStart.toFixed(3),
        rateA.toFixed(6),
        rateB.toFixed(6),
        fileSig(fileA),
        fileSig(fileB),
        c.width,
        c.height,
        framingA
          ? `${framingA.scale}:${framingA.anchorX}:${framingA.anchorY}`
          : "-",
        framingB
          ? `${framingB.scale}:${framingB.anchorX}:${framingB.anchorY}`
          : "-",
      ].join("|");
      specs.push({
        sig,
        cut: tr.cut,
        half: tr.half,
        effect: tr.effect,
        dir: tr.dir,
        fileA,
        aEnd: A.srcEnd,
        rateA,
        fileB,
        bStart: B.srcStart,
        rateB,
        ...(framingA ? { framingA } : {}),
        ...(framingB ? { framingB } : {}),
        compW: c.width,
        compH: c.height,
      });
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
          const entry = {
            sig: sp.sig,
            cut: sp.cut,
            half: sp.half,
            baked: null as BakedWindow | null,
            bitmaps: null as ImageBitmap[] | null,
          };
          bakesRef.current.set(sp.sig, entry);
          const baked = await bakeTransitionWindow(
            sp,
            () => bakeGenRef.current !== gen,
          );
          if (bakeGenRef.current !== gen) return;
          if (baked && bakesRef.current.get(sp.sig) === entry)
            entry.baked = baked;
          else if (bakesRef.current.get(sp.sig) === entry)
            bakesRef.current.delete(sp.sig);
        }
      })();
    }, 600);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    comp.shots,
    videoFile,
    comp.width,
    comp.height,
    primaryNarrative.hidden,
    renderVideoPlacements,
  ]);
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
        } else if (
          e.bitmaps &&
          (t < e.cut - e.half - 3 || t > e.cut + e.half + 3)
        ) {
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
  const boxDragRef = useRef<{
    id: string;
    box: { x: number; y: number; w: number; h: number };
  } | null>(null);
  const undoStackRef = useRef<EditorDocumentV2[]>([]); // canonical V2 snapshots; runtime media URLs live outside history
  const redoStackRef = useRef<EditorDocumentV2[]>([]); // undone states; any new edit (pushUndoSnapshot) discards the whole redo line

  // Revoke every workbench-owned blob URL on unmount. Inserted sources stay alive while
  // the project is open (including after deletion, because undo may restore them), but no
  // project-local File URL should survive closing the workbench.
  useEffect(
    () => () => {
      filmstripGenRef.current += 1; // late extraction callbacks revoke their own new frames
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      filmstripRef.current.forEach((f) => URL.revokeObjectURL(f.url));
      for (const url of clipFilesRef.current.keys()) {
        if (url.startsWith("blob:")) URL.revokeObjectURL(url);
      }
      clipFilesRef.current.clear();
      for (const url of localImagePreviewUrlsRef.current.values())
        URL.revokeObjectURL(url);
      localImagePreviewUrlsRef.current.clear();
    },
    [],
  );

  // Preview control: a sandboxed iframe (opaque origin) can't reach contentWindow.__hfPreview, so everything goes through postMessage commands (sent to the current active buffer)
  const postLocalImages = useCallback(
    (win: Window | null | undefined, markup: string) => {
      for (const sig of localImageLocatorSigs(markup)) {
        void resolveLocalImageFile(sig).then((file) => {
          if (!file) return;
          try {
            win?.postMessage({ type: "hf:imageFile", sig, file }, "*");
          } catch {
            /* iframe may have swapped while OPFS resolved */
          }
        });
      }
    },
    [resolveLocalImageFile],
  );
  const acceptLocalAssetFile = useCallback(
    (asset: {
      sig: string;
      kind: "video" | "image" | "audio";
      file: File;
    }) => {
      if (asset.kind !== "image") return;
      // Heal legacy handle-only imports when their bytes become readable again. New image imports
      // are already pinned in local-import-session; this repeat is idempotent by sig and size.
      void saveLocalVideo(asset.file, asset.sig, undefined, { pinned: true });
      if (!localImagePreviewUrlsRef.current.has(asset.sig)) {
        localImagePreviewUrlsRef.current.set(
          asset.sig,
          URL.createObjectURL(asset.file),
        );
        setLocalImagePreviewUrls(new Map(localImagePreviewUrlsRef.current));
      }
      // Active/background buffers can be at different rebuild phases. Sending to both is safe and
      // closes the race where the one-time load injection ran before the local bytes arrived.
      for (const frame of iframesRef.current) {
        try {
          frame?.contentWindow?.postMessage(
            { type: "hf:imageFile", sig: asset.sig, file: asset.file },
            "*",
          );
        } catch {
          /* a swapping buffer receives the same file from alignBackground */
        }
      }
    },
    [],
  );
  const postPreview = useCallback(
    (msg: Record<string, unknown>) => {
      try {
        const win = iframesRef.current[bufsRef.current.active]?.contentWindow;
        win?.postMessage(msg, "*");
        const markup =
          typeof msg.html === "string"
            ? msg.html
            : typeof msg.innerHtml === "string"
              ? msg.innerHtml
              : "";
        if (markup) postLocalImages(win, markup);
      } catch {
        /* iframe not ready */
      }
    },
    [postLocalImages],
  );
  useEffect(() => {
    postPreview({
      type: "hf:primaryVisibility",
      hidden: primaryNarrative.hidden,
    });
    if (primaryNarrative.hidden)
      postPreview({ type: "hf:clearFrame", t: tRef.current });
    else videoEngineRef.current?.refresh();
  }, [postPreview, primaryNarrative.hidden]);
  const applyT = useCallback(
    (v: number) => {
      tRef.current = v;
      playhead.set(v);
      setT(v);
      postPreview({ type: "hf:seek", t: v }); // position overlay layers / PiP (video frames belong to the engine)
      videoEngineRef.current?.seek(v);
    },
    [postPreview],
  );

  // Measure the preview area and recompute the shared canvas/overlay fit, including
  // the vertical selection-chrome gutter (tracks window and panel changes).
  useEffect(() => {
    const el = previewAreaRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) setArea({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // composition change → debounced re-assemble, written into the **background buffer** (onBufLoad swaps atomically once loaded).
  // Re-assembly (assembleHtml full-string stitch) sits in the debounce callback: per-frame native patches like
  // box drag / in-place text edit cost zero build while dragging, stitched once 300ms after release.
  // **Caption pure-position (xPct/yPct) changes skip the rebuild**: hf:capStyle already wrote left/bottom directly into
  // the active doc (identical to the re-baked value), so a rebuild would only needlessly reload the video. Font size (scale)/
  // box width (wPct)/preset can't skip — segmentation is derived live from box width ÷ font size, so a rebuild must
  // re-segment (the instant path gives the feel first, then a seamless swap-in after the 300ms debounce).
  const lastBuiltCompRef = useRef<Composition | null>(null);
  // In-place swap paths bypass the full rebuild, so the active preview document never gets the
  // <link>s assemble.ts bakes for library ("花字") fonts — push them explicitly before swapping nodes.
  const postWebFonts = (pcomp: Composition) => {
    const hrefs = webFontStylesheetUrls([
      pcomp.captionStyle?.font,
      pcomp.captionStyle?.sub?.font,
      ...pcomp.blocks.map((block) => block.slots?.fontFamily),
    ]);
    if (hrefs.length) postPreview({ type: "hf:fonts", hrefs });
  };
  const lastBuiltRenderInputsRef = useRef<{
    videoPlacements: typeof renderVideoPlacements;
    supplementalVisuals: typeof supplementalVisuals;
  } | null>(null);
  // Measurement font ready: the parent doc loads the **same** design font as the preview doc — caption segmentation's
  // canvas measureText runs in the parent doc, and if the parent lacks the font it falls back to a system font, so
  // Latin widths don't match the iframe's real render (hit this: English segments measured too narrow, overflowed and
  // wrapped). Setting canvas font doesn't trigger a font download, so fonts.load must be explicit; once ready, tick
  // once to force a rebuild (the first segmentation may have used the fallback font and must be recomputed with the real one).
  const [fontsTick, setFontsTick] = useState(0);
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!document.querySelector("link[data-studio-fonts]")) {
      const l = document.createElement("link");
      l.rel = "stylesheet";
      l.href = STUDIO_FONTS_HREF;
      l.setAttribute("data-studio-fonts", "1");
      document.head.appendChild(l);
    }
    // Library ("花字") stylesheets in the parent too: caption segmentation measures here, and the
    // font picker sets each name in its own face. Chunked CSS — only rendered glyph blocks load.
    ensureWebFontStylesheets();
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
    // debounce is only for per-frame streams like box drag. Font-ready tick = structural change (re-measure
    // and re-segment), doesn't take the skip path.
    const fontsChanged = builtFontsTickRef.current !== fontsTick;
    const previousRenderInputs = lastBuiltRenderInputsRef.current;
    const renderInputsChanged =
      !previousRenderInputs ||
      !previewDataEqual(
        previousRenderInputs.videoPlacements,
        renderVideoPlacements,
      ) ||
      !previewDataEqual(
        previousRenderInputs.supplementalVisuals,
        supplementalVisuals,
      );
    const sizeOnly = canvasSizeOnlyChange(
      lastBuiltCompRef.current,
      renderComposition,
    );
    // Ratio changes also rebase native media boxes. They are still one discrete action and must not
    // fall back to the 300ms drag debounce merely because the projected placements changed too.
    const canvasChanged =
      !!lastBuiltCompRef.current &&
      (lastBuiltCompRef.current.width !== renderComposition.width ||
        lastBuiltCompRef.current.height !== renderComposition.height);
    const cutOnly = shotCountChange(
      lastBuiltCompRef.current,
      renderComposition,
    );
    const capOnly = sameExceptCapStyle(
      lastBuiltCompRef.current,
      renderComposition,
    );
    const framingOnly = shotFramingOnlyChange(
      lastBuiltCompRef.current,
      renderComposition,
    );
    const patchable = blockPatchableChange(
      lastBuiltCompRef.current,
      renderComposition,
    );
    const id = setTimeout(
      () => {
        builtFontsTickRef.current = fontsTick;
        const markBuilt = () => {
          lastBuiltCompRef.current = renderComposition;
          lastBuiltRenderInputsRef.current = {
            videoPlacements: renderVideoPlacements,
            supplementalVisuals,
          };
        };
        if (
          !fontsChanged &&
          nativeMediaBoxOnlyChange(
            lastBuiltCompRef.current,
            renderComposition,
            previousRenderInputs,
            { videoPlacements: renderVideoPlacements, supplementalVisuals },
          )
        ) {
          // Direct manipulation already painted every pointer frame. Commit the native geometry and
          // timeline in place; swapping the iframe here would show “updating canvas” after every drag.
          if (
            !previewDataEqual(
              previousRenderInputs?.videoPlacements,
              renderVideoPlacements,
            )
          ) {
            postPreview({
              type: "hf:vidTimeline",
              body: videoFrameTimelineBody(
                renderComposition.shots ?? [],
                renderVideoPlacements,
              ),
            });
          }
          for (let index = 0; index < supplementalVisuals.length; index++) {
            const visual = supplementalVisuals[index]!;
            if (
              previewDataEqual(
                previousRenderInputs?.supplementalVisuals[index]?.box,
                visual.box,
              )
            )
              continue;
            postPreview({
              type: "hf:mediaBox",
              id: `hf-visual-${visual.clipId}`,
              box: visual.box ?? FULL_MEDIA_CANVAS_BOX,
            });
          }
          markBuilt();
          return;
        }
        if (
          !fontsChanged &&
          supplementalMediaFramingOnlyChange(
            lastBuiltCompRef.current,
            renderComposition,
            previousRenderInputs,
            { videoPlacements: renderVideoPlacements, supplementalVisuals },
          )
        ) {
          for (let index = 0; index < supplementalVisuals.length; index++) {
            const visual = supplementalVisuals[index]!;
            if (
              previewDataEqual(
                previousRenderInputs?.supplementalVisuals[index]?.mediaFraming,
                visual.mediaFraming,
              )
            )
              continue;
            postPreview({
              type: "hf:shotVars",
              target: `#hf-visual-${visual.clipId}`,
              vars: mediaFramingTransformVars(
                visual.mediaFraming ?? IDENTITY_MEDIA_FRAMING,
              ),
            });
          }
          markBuilt();
          return;
        }
        if (
          !fontsChanged &&
          !renderInputsChanged &&
          themeMountOnlyChange(lastBuiltCompRef.current, renderComposition)
        ) {
          // Instant recolor: push the new palette vars into the live doc (root vars + stage background)
          postPreview({
            type: "hf:setVars",
            css: themeVarsCss(getTheme(comp.theme), comp.palette),
            bg: comp.palette?.paper ?? getTheme(comp.theme).background,
          });
          markBuilt();
          return;
        }
        if (
          !fontsChanged &&
          !renderInputsChanged &&
          capPosOnlyChange(lastBuiltCompRef.current, renderComposition)
        ) {
          markBuilt();
          return;
        }
        if (
          !fontsChanged &&
          !renderInputsChanged &&
          capOnly &&
          !pendingSwitchRef.current
        ) {
          // Caption global style (preset/scale/width/color/plate/bold/sub): re-assemble ONLY the
          // sentence-caption nodes with the new resolved style and swap them in place — segmentation
          // re-runs inside the render, so even size/width changes stay off the rebuild path
          const pcomp = previewCompOf(renderComposition);
          postWebFonts(pcomp);
          for (const cb of pcomp.blocks) {
            if (!isSentenceCaption(cb)) continue;
            const r = assembleBlockHtml(cb, pcomp);
            postPreview({
              type: "hf:blockAdd",
              blockId: cb.id,
              html: r.html,
              timelineBody: r.timelineBody,
            });
          }
          markBuilt();
          return;
        }
        // Block-level in-place patch path: geometry (move/scale/rotate) / time window (timeline block trim) / appearance
        // (bg/border/radius/opacity) / in-place text echo / pure delete — commit the final value once into the active
        // doc, skipping the full doc rebuild (rebuild = double-buffer swap = video reload, the source of "flicker per edit").
        // When a swap is pending, step aside and rebuild (see the ref comment).
        if (
          !fontsChanged &&
          !renderInputsChanged &&
          patchable &&
          !pendingSwitchRef.current
        ) {
          const echo = iframeEditEchoRef.current;
          // Existing nodes replace in their current parent/stack position. New nodes still need a
          // global insertion index; person-matte/supplemental layers make that index ambiguous.
          const fxSplit =
            hasVideoTrack && (comp.shots ?? []).some((sh) => sh.personMatte);
          if (
            canApplyBlockPatchInPlace(patchable, {
              hasSupplementalVisuals: supplementalVisuals.length > 0,
              hasPersonMatte: fxSplit,
            })
          ) {
            // Same comp variant the doc was assembled from (image thumbs, fitScale reset) — patched bytes must match a rebuild
            const pcomp = previewCompOf(renderComposition);
            const pblockOf = (id: string) =>
              pcomp.blocks.find((x) => x.id === id);
            // DOM order = native global track order. Structural patches with supplemental visual
            // tracks take the full rebuild path above because their insertion indexes are interleaved.
            const sorted = [...pcomp.blocks].sort(
              (x, y) => x.trackIndex - y.trackIndex,
            );
            const domIndexOf = (id: string) =>
              sorted.findIndex((x) => x.id === id);
            postWebFonts(pcomp);
            const sendNode = (id: string, withIndex: boolean) => {
              const pb = pblockOf(id);
              if (!pb) return;
              const r = assembleBlockHtml(pb, pcomp);
              postPreview({
                type: "hf:blockAdd",
                blockId: id,
                html: r.html,
                timelineBody: r.timelineBody,
                ...(withIndex ? { index: domIndexOf(id) } : {}),
              });
            };
            // removes first: insertion indexes are computed against the post-remove DOM
            for (const r of patchable.removed)
              postPreview({ type: "hf:remove", id: r.id });
            for (const p of patchable.pairs) {
              if (p.mediaTimeline) {
                const pb = pblockOf(p.b.id);
                if (pb) {
                  const timelineBody = renderBlock(pb).timelineBody;
                  if (mediaTimelineEchoRef.current.get(p.b.id) === timelineBody)
                    mediaTimelineEchoRef.current.delete(p.b.id);
                  else {
                    mediaTimelineEchoRef.current.delete(p.b.id);
                    postPreview({
                      type: "hf:blockTimeline",
                      blockId: pb.id,
                      timelineBody,
                    });
                  }
                }
              } else if (p.replace || (p.slots && !echo.has(p.b.id)))
                sendNode(p.b.id, false);
              else if (p.slots) echo.delete(p.b.id);
              if (p.geom) {
                const box = p.b.box!;
                const cb = p.b.contentBox ?? box;
                postPreview({
                  type: "hf:boxSize",
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
                if (!Object.is(p.a.rotation, p.b.rotation))
                  postPreview({
                    type: "hf:rotate",
                    blockId: p.b.id,
                    deg: p.b.rotation ?? 0,
                  });
              }
              if (p.timing)
                postPreview({
                  type: "hf:blockTiming",
                  blockId: p.b.id,
                  start: p.b.startSec,
                  duration: p.b.durationSec,
                });
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
                postPreview({
                  type: "hf:blockHtml",
                  blockId: kb.id,
                  innerHtml: kr.innerHtml,
                  timelineBody: kr.timelineBody,
                });
              }
              if (p.style) {
                const nb = p.b;
                const inner = String(
                  (nb.slots as { innerHtml?: unknown }).innerHtml ?? "",
                );
                postPreview({
                  type: "hf:blockStyle",
                  blockId: nb.id,
                  bgCss: nb.bg
                    ? blockBgCss(nb.bg, customHasSurface(nb.templateId, inner))
                    : "",
                  border: nb.border ? `3px solid ${nb.border}` : null,
                  // radius must match assemble exactly: explicit value wins, default radius when there's a surface/border
                  radius:
                    typeof nb.radius === "number" && nb.radius > 0
                      ? `${nb.radius}px`
                      : (nb.bg || nb.border) && nb.box
                        ? "var(--radius,24px)"
                        : null,
                  opacity:
                    typeof nb.opacity === "number" && nb.opacity < 0.995
                      ? Math.max(0.05, nb.opacity)
                      : null,
                });
              }
            }
            for (const nb of [...patchable.added].sort(
              (x, y) => domIndexOf(x.id) - domIndexOf(y.id),
            ))
              sendNode(nb.id, true);
            if (
              patchable.added.length ||
              patchable.pairs.some(
                (p) => p.geom || p.style || p.replace || p.slots || p.kitProps,
              )
            )
              postPreview({ type: "hf:measureFit" });
            markBuilt();
            return;
          }
        }
        if (!fontsChanged && !renderInputsChanged && framingOnly) {
          // Only framing (treatment/treatSize) changed: don't rebuild the doc (rebuild = a blank video-canvas frame,
          // flickers on rapid switching); swap the vid timeline in place (identical to what a rebuild would bake), the
          // instant value was already applied via hf:shotVars
          postPreview({
            type: "hf:vidTimeline",
            body: videoFrameTimelineBody(
              comp.shots ?? [],
              renderVideoPlacements,
            ),
          });
          markBuilt();
          return;
        }
        markBuilt();
        const doc = injectPreviewRuntime(
          assembleHtml(
            previewCompOf(renderComposition),
            undefined,
            renderVideoPlacements,
            supplementalVisuals,
          ),
        );
        if (doc !== bufsRef.current.docs[bufsRef.current.active]) {
          pendingSwitchRef.current = true; // swap pending: patch path steps aside
          setRebuilding(true);
        }
        setBufs((s) => {
          if (s.docs[s.active] === doc) return s; // identical to the on-screen doc: don't churn
          const back = s.active === 0 ? 1 : 0;
          const docs = [...s.docs] as [string, string];
          docs[back] = doc;
          const dims = [...s.dims] as [
            { w: number; h: number },
            { w: number; h: number },
          ];
          dims[back] = { w: comp.width, h: comp.height };
          const revs = [...s.revs] as [number, number];
          revs[back] += 1;
          return { docs, dims, active: s.active, revs };
        });
      },
      fontsChanged ||
        sizeOnly ||
        canvasChanged ||
        cutOnly ||
        capOnly ||
        framingOnly ||
        patchable
        ? 0
        : 300,
    );
    return () => clearTimeout(id);
  }, [
    comp,
    renderComposition,
    fontsTick,
    renderVideoPlacements,
    supplementalVisuals,
  ]);

  // Pending background-buffer swap: ping/pong handshake state. The load event isn't trustworthy — the empty load of a
  // cleared buffer (srcdoc='') arrives late, and font blocking can make a half-loaded doc fire load first, which once
  // swapped the frame to a "deaf doc": all playback commands vanished (observed: cascading double-swaps after zoom,
  // play sent to active with no clock response). Now a swap only executes after a live response (pong) from the target
  // doc's runtime; a deaf doc at worst keeps the frame on the old generation and warns repeatedly in console, but never
  // swallows playback.
  const switchPingRef = useRef<{
    idx: 0 | 1;
    doc: string;
    nonce: string;
    timer: ReturnType<typeof setTimeout> | null;
    tries: number;
  } | null>(null);
  const startSwitchPing = useCallback((idx: 0 | 1, doc: string) => {
    const stalePrime = previewFramePrimeRef.current;
    if (stalePrime?.timer) clearTimeout(stalePrime.timer);
    previewFramePrimeRef.current = null;
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
      if (st.tries > 1)
        console.warn(
          "[studio] background buffer not responding, retrying ping",
          { idx, tries: st.tries },
        );
      try {
        iframesRef.current[idx]?.contentWindow?.postMessage(
          { type: "hf:ping", nonce: st.nonce },
          "*",
        );
      } catch {
        /* not ready */
      }
      if (st.tries < 10) st.timer = setTimeout(ping, 1200);
      else {
        console.warn(
          "[studio] background buffer unresponsive after 10 tries, giving up the swap (stay on old frame, rebuild next time)",
          { idx },
        );
        switchPingRef.current = null;
        setRebuilding(false);
        setPendingInsert(null);
      }
    };
    ping();
  }, []);

  /** Align a freshly-booted doc to the current playhead/selection/fit — the same set of messages the
   *  load handler used to send, now shared by the load path and the runtime boot beacon. */
  const alignBackground = useCallback(
    (idx: 0 | 1) => {
      const w = iframesRef.current[idx]?.contentWindow;
      const post = (msg: Record<string, unknown>) => {
        try {
          w?.postMessage(msg, "*");
        } catch {
          /* not ready */
        }
      };
      // canvas render mode: video frames pushed by the parent engine (hf:frame), no longer inject the File into the doc
      // for PRIMARY clips. Detached/native visual videos still live as <video> nodes inside the
      // sandboxed iframe. A parent-created blob URL is unreadable from that opaque origin, so hand the
      // File across and let the preview runtime create an iframe-owned URL for each visual node.
      const document = editorDocumentRef.current;
      const primaryAssetId = firstNarrativeAssetId(document);
      const primaryAsset = primaryAssetId
        ? document.assets[primaryAssetId]
        : undefined;
      const primarySource = primaryAsset
        ? resolveAssetUrl(primaryAsset)
        : objectUrlRef.current;
      const fileBindings = supplementalVisualFileBindings(
        supplementalVisuals,
        [primarySource, objectUrlRef.current],
        videoFileRef.current,
        clipFilesRef.current,
      );
      for (const binding of fileBindings) {
        post({ type: "hf:clipFile", id: binding.id, file: binding.file });
      }
      postLocalImages(
        w,
        // The full document also covers media-slot images and the person-background layer; scanning
        // only custom-block innerHtml left those local locators unresolved after a buffer swap.
        bufsRef.current.docs[idx],
      );
      post({ type: "hf:seek", t: tRef.current });
      post({ type: "hf:primaryVisibility", hidden: primaryHiddenRef.current });
      post({ type: "hf:selectBlock", blockId: selectedIdRef.current });
      // Force-show mechanism retired: a selected block's visibility is guaranteed by "select → move playhead to its
      // settled moment" (parent selectedId effect); the seeked playhead on load is itself a visible moment, so no need
      // to replay a force-show message to the new doc.
      // fitScale isn't in the doc → after load, push the known autofit scale in
      const fits: Record<string, number> = {};
      for (const b of compRef.current.blocks)
        if (b.fitScale && b.fitScale < 0.999) fits[b.id] = b.fitScale;
      if (Object.keys(fits).length) post({ type: "hf:fit", fits });
    },
    [postLocalImages, resolveAssetUrl, supplementalVisuals],
  );

  /** A buffer finished loading: inject video/seek/restore selection; if it's the background buffer, start the ping handshake (swap only after pong). */
  const onBufLoad = useCallback(
    (idx: 0 | 1) => {
      if (!bufsRef.current.docs[idx]) return; // empty load of a cleared old buffer (srcdoc=''), ignore
      if (idx !== bufsRef.current.active) {
        alignBackground(idx);
        startSwitchPing(idx, bufsRef.current.docs[idx]);
        return;
      }
      // The active buffer's own load (first load / video swap): resume playback if playing
      alignBackground(idx);
      if (playingRef.current) {
        try {
          iframesRef.current[idx]?.contentWindow?.postMessage(
            { type: "hf:play", t: tRef.current },
            "*",
          );
        } catch {
          /* not ready */
        }
      }
    },
    [startSwitchPing, alignBackground],
  );

  // In-preview edit bridge: write a block's slot back (supports items.N array paths).
  // custom blocks (LLM-generated components) have no semantic slots — the key is the text of [data-edit=key] inside
  // innerHtml, patched back via DOMParser: double-click in-place edit is zero-token, instant, no regeneration needed.
  const setSlot = useCallback(
    (blockId: string, key: string, value: string) => {
      if (genIdsRef.current.has(blockId)) {
        toast.info(t("workbench.elementGeneratingEditWould"));
        return;
      }
      const block = compRef.current.blocks.find(
        (candidate) => candidate.id === blockId,
      );
      if (!block) return;
      let slots = block.slots;
      if (block.templateId === "custom") {
        const inner = String(
          (block.slots as { innerHtml?: unknown }).innerHtml ?? "",
        );
        try {
          const doc = new DOMParser().parseFromString(
            `<div id="__hfw">${inner}</div>`,
            "text/html",
          );
          const host = doc.getElementById("__hfw");
          const target = host?.querySelector(
            `[data-edit="${CSS.escape(key)}"]`,
          );
          if (!host || !target || (target.textContent ?? "") === value) return;
          target.textContent = value;
          slots = { ...block.slots, innerHtml: host.innerHTML };
        } catch {
          return;
        }
      } else if (key.includes(".")) {
        const [slotKey, idxStr] = key.split(".");
        const idx = Number(idxStr);
        const arr = Array.isArray(block.slots[slotKey!])
          ? [...(block.slots[slotKey!] as unknown[])]
          : [];
        if (arr[idx] === value) return;
        arr[idx] = value;
        slots = { ...block.slots, [slotKey!]: arr };
      } else {
        if (block.slots[key] === value) return;
        slots = { ...block.slots, [key]: value };
      }
      patchOverlays([{ clipId: blockId, block: { slots } }]);
    },
    [patchOverlays, genIdsRef],
  );

  // Draft autosave (1s debounce; don't write on an empty canvas)
  // First-frame thumbnail (project list card cover): use the earliest visible media in the actual
  // deliverable. A secondary visual lane can be the whole edit, so primary-track presence must not
  // decide whether an output owns a cover.
  const coverThumbRef = useRef<string | null>(null);
  // Cover BYTES travel their own debounced channel (providers.projects.saveCover → R2 key in the
  // row); the JSON save payload never carries base64 — it multiplied every project PUT/GET/list.
  const coverCloudTimerRef = useRef<number | null>(null);
  const coverCloudPushedSigRef = useRef<string | null>(null);
  const scheduleCoverCloudPush = (cover: Blob | null, sig: string | null) => {
    const saveCover = studioProviders().projects.saveCover;
    if (!saveCover || sig === coverCloudPushedSigRef.current) return;
    if (coverCloudTimerRef.current) window.clearTimeout(coverCloudTimerRef.current);
    coverCloudTimerRef.current = window.setTimeout(() => {
      coverCloudTimerRef.current = null;
      if (displacedRef.current) return;
      void saveCover(projectId, cover)
        .then(() => {
          coverCloudPushedSigRef.current = sig;
        })
        .catch(() => {}); // a cover is a bonus; the next redraw retries
    }, 2_500);
  };
  // Cover clearing must wait for hydration: the first render is intentionally empty even when a
  // saved project has video. Once ready, an empty primary track is authoritative user state.
  const [bootDataReady, setBootDataReady] = useState(false);
  const coverVisual = useMemo(() => renderPlan.tracks
    .filter((track) => !track.hidden && track.type === "visual")
    .flatMap((track) => track.clips.flatMap((entry) => {
      if (!entry.clip.enabled || !entry.asset || !entry.resolvedSource) return [];
      if (entry.asset.kind !== "video" && entry.asset.kind !== "image") return [];
      const source = entry.asset.kind === "image" && entry.asset.locator.localSig
        ? localImagePreviewUrls.get(entry.asset.locator.localSig) ?? entry.resolvedSource
        : entry.resolvedSource;
      return [{
        clipId: entry.clipId,
        kind: entry.asset.kind,
        source,
        sourceInSec: entry.clip.kind === "narrative" || entry.clip.kind === "media"
          ? entry.clip.sourceInSec
          : 0,
        startSec: entry.startSec,
        primary: track.id === renderPlan.primaryNarrativeTrackId,
      }];
    }))
    .sort((left, right) => left.startSec - right.startSec || Number(right.primary) - Number(left.primary) || left.clipId.localeCompare(right.clipId))[0] ?? null,
  [localImagePreviewUrls, renderPlan]);
  const hasCoverVisual = editorDocument.timeline.tracks.some((track) => !track.hidden && track.clips.some((clip) => {
    if (!clip.enabled || !("assetId" in clip) || typeof clip.assetId !== "string") return false;
    const kind = editorDocument.assets[clip.assetId]?.kind;
    return kind === "video" || kind === "image";
  }));
  const currentCoverThumb = () =>
    editorDocumentRef.current.timeline.tracks.some((track) => !track.hidden && track.clips.some((clip) => {
      if (!clip.enabled || !("assetId" in clip) || typeof clip.assetId !== "string") return false;
      const kind = editorDocumentRef.current.assets[clip.assetId]?.kind;
      return kind === "video" || kind === "image";
    }))
      ? coverThumbRef.current
      : null;
  const activateOutputDocumentRef = useRef<
    (document: EditorDocumentV2, composition: Composition) => void
  >(() => {});
  const getActiveOutputState = useCallback(
    () => ({
      document: persistableDocument(false),
      videoSig:
        videoSigRef.current ??
        (videoFileRef.current ? fileSig(videoFileRef.current) : null),
      videoDurationSec: firstNarrativeDurationSec(editorDocumentRef.current),
      coverThumb: currentCoverThumb(),
    }),
    [persistableDocument],
  );
  const projectOutputs = useProjectOutputs(getActiveOutputState);
  useEffect(() => {
    // A cover describes the current deliverable, not the reusable source kept in the media
    // library. Removing the final timeline video must therefore clear the cover even though
    // videoFile intentionally remains available for inserting again later.
    if (!hasCoverVisual) {
      if (!bootDataReady) return;
      coverThumbRef.current = null;
      saveCoverThumb(projectId, null);
      scheduleCoverCloudPush(null, null);
      return;
    }
    if (!coverVisual) return;
    let alive = true;
    const boundFile = coverVisual.primary
      ? videoFile
      : clipFilesRef.current.get(coverVisual.source) ?? null;
    const objectUrl = boundFile ? URL.createObjectURL(boundFile) : null;
    const url = objectUrl ?? coverVisual.source;
    const drawCover = (media: CanvasImageSource, mediaWidth: number, mediaHeight: number) => {
      if (!alive || !mediaWidth || !mediaHeight) return;
      const w = 960;
      const h = Math.max(2, Math.round((editorDocument.canvas.height / editorDocument.canvas.width) * w));
      const cv = document.createElement("canvas");
      cv.width = w;
      cv.height = h;
      const scale = Math.max(w / mediaWidth, h / mediaHeight);
      const drawW = mediaWidth * scale;
      const drawH = mediaHeight * scale;
      cv.getContext("2d")!.drawImage(media, (w - drawW) / 2, (h - drawH) / 2, drawW, drawH);
      coverThumbRef.current = cv.toDataURL("image/jpeg", 0.8);
      saveCoverThumb(projectId, coverThumbRef.current);
      const sig = coverThumbRef.current;
      cv.toBlob((blob) => {
        if (blob) scheduleCoverCloudPush(blob, sig);
      }, "image/jpeg", 0.8);
    };
    void (async () => {
      try {
        if (coverVisual.kind === "image") {
          const image = new Image();
          if (/^https?:/.test(url)) image.crossOrigin = "anonymous";
          image.src = url;
          await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error("load failed"));
            setTimeout(() => reject(new Error("load timeout")), 8000);
          });
          drawCover(image, image.naturalWidth, image.naturalHeight);
          return;
        }
        const video = document.createElement("video");
        video.muted = true;
        video.preload = "auto";
        if (/^https?:/.test(url)) video.crossOrigin = "anonymous";
        video.src = url;
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve();
          video.onerror = () => reject(new Error("load failed"));
          setTimeout(() => reject(new Error("load timeout")), 8000);
        });
        video.currentTime = Math.max(0, coverVisual.sourceInSec + 0.1);
        await new Promise<void>((resolve) => {
          video.onseeked = () => resolve();
          setTimeout(resolve, 1500);
        });
        drawCover(video, video.videoWidth, video.videoHeight);
        video.removeAttribute("src");
      } catch {
        /* the cover is a bonus, a failed grab doesn't block saving */
      } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      }
    })();
    return () => {
      alive = false;
    };
  }, [bootDataReady, coverVisual, editorDocument.canvas.height, editorDocument.canvas.width, hasCoverVisual, projectId, videoFile]);
  // Autosave runs regardless (pure side effect: debounced draft write); the toolbar no longer shows a "project/saved" time
  // videoSigRef first: in the missing-media state (no File on this device) the draft's sig anchor
  // must survive autosave — writing null would wipe the cloud row's reconnect anchor.
  // Persist-side comp: derived caption blocks are STRIPPED (transcript + captionStyle.on carry the
  // caption state); only strippable when a transcript exists to re-derive from. The draft also carries
  // the transcripts so a zero-backend reopen (OSS shell / offline) can re-derive the caption layer.
  const canDeriveCaptions =
    (asrSentences?.length ?? 0) > 0 || Object.keys(clipAsr).length > 0;
  const compForSave = useMemo(
    () => stripDerivedCaptions(comp, canDeriveCaptions),
    [comp, canDeriveCaptions],
  );
  const documentForSave = useMemo(
    () => persistableDocument(canDeriveCaptions),
    // Context-only changes must rebuild the embedded V2 transcripts/plan/asset locators too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      persistableDocument,
      compForSave,
      editorDocument,
      asrSentences,
      clipAsr,
      cloudMediaRev,
      localAssetIndexRev,
      videoFile,
    ],
  );
  useDraftAutosave(
    compForSave,
    videoSigRef.current ?? (videoFile ? fileSig(videoFile) : null),
    projectId,
    documentForSave,
    coverThumbRef,
    () => ({
      schemaVersion: STUDIO_PROJECT_CONTEXT_SCHEMA_VERSION,
      outputs: projectOutputs.outputsRef.current,
      ...(localAssetIndexKnownRef.current
        ? { localAssets: localAssetIndexRef.current }
        : {}),
    }),
    projectOutputs.outputs,
  );

  // autofit: preview measures each block's overflow → write back Block.fitScale (for export), and push hf:fit to the
  // active buffer to apply live (fitScale isn't in the preview doc, so the write-back doesn't trigger a rebuild — see the assembled comment)
  const applyFits = useCallback(
    (fits: Record<string, number>) => {
      const updates = compRef.current.blocks.flatMap(
        (block): OverlayDocumentPatch[] => {
          const k = fits[block.id];
          if (typeof k !== "number") return [];
          const next = k < 0.999 ? k : undefined;
          if (Math.abs((block.fitScale ?? 1) - (next ?? 1)) < 0.02) return [];
          return [{ clipId: block.id, block: { fitScale: next } }];
        },
      );
      if (updates.length) patchOverlays(updates);
      postPreview({ type: "hf:fit", fits });
    },
    [patchOverlays, postPreview],
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
    const s = b?.slots as
      | { innerHtml?: unknown; timelineBody?: unknown }
      | undefined;
    if (
      !b ||
      !s ||
      s.innerHtml !== last.innerHtml ||
      s.timelineBody !== last.timelineBody
    )
      return;
    patchOverlays([
      {
        clipId: orig.id,
        block: { templateId: orig.templateId, slots: orig.slots },
      },
    ]);
  };
  /** The single entry for contextual tool panels: open/switch/close all go through here — leaving code settles the draft first.
   *  Docking semantics: a panel takes the whole rail column — expand
   *  if collapsed; auto-collapse on close if it was expanded only for the panel. */
  const setFloatWin = (next: FloatKind | null) => {
    const prev = floatWinRef.current;
    if (prev === next) return;
    if (prev === "code") {
      revertCodeDraft();
      stopCodeLoop();
    }
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
  useEffect(() => {
    if (!selectedDisplayTextBlockId) return;
    setFloatWin(null);
    setLibTab("text");
    setLibCollapsed(false);
    // Re-open only when the selected text block changes; setFloatWin intentionally owns
    // contextual-panel settlement but is not stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDisplayTextBlockId]);
  // The source-editor entry is removed (per user 2026-07-17; edit components via "AI edit"/chat). The panel machinery
  // (FloatKind 'code'/ElementSourceEditor/draft settlement) is kept; to restore the entry later: set the baseline
  // codeOrigRef + setCodeBlockId(id) + setFloatWin('code'), and pin the playhead to a stable frame.
  /** Open the right-side chat area (right side is chat only; other panels dock in the asset rail). */
  const openChat = useCallback(() => setPanelOpen(true), []);
  const closeChat = useCallback(() => {
    timelineFramePickAutoClosedChatRef.current = false;
    setTimelineFramePickActive(false);
    setPanelOpen(false);
  }, []);
  /** Open a tool panel (docked in the full asset rail column). The anchor param is kept for signature compatibility
   *  across entries but no longer used for positioning after docking; clicking outside doesn't close it (a docked
   *  panel is a persistent region, not a popover) — toggling is on the trigger button itself. */
  const openFloatAt = (kind: FloatKind, _anchor?: DOMRect | null) => {
    setFloatWin(kind);
  };
  const openGeneration = (type: GenType = "image", prompt?: string) => {
    setGenType(type);
    setGenSeedPrompt(
      prompt ? { type, prompt, revision: ++genSeedRevisionRef.current } : null,
    );
    setFloatWin(null);
    setLibTab("gen");
    if (libCollapsed) setLibCollapsedManual(false);
  };
  // The person panel depends on a selected shot (its entry is disabled without one): if the selection is lost while open → just close it
  useEffect(() => {
    if (floatWin === "person" && !selectedShotId) setFloatWin(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floatWin, selectedShotId]);
  // The framing panel doesn't auto-open on selection; it opens from the selected video's border toolbar.
  // Close it if the corresponding shot selection is cleared.
  useEffect(() => {
    if (!selectedShotId && !selectedVisualClipId && floatWin === "shot")
      setFloatWin(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShotId, selectedVisualClipId, floatWin]);
  /** Open framing settings from the selected video's canvas-border toolbar. */
  const openShotSettings = (sid: string) => {
    const media = editorDocumentRef.current.timeline.tracks.some(
      (track) =>
        track.id !==
          editorDocumentRef.current.semantics.primaryNarrativeTrackId &&
        track.clips.some((clip) => clip.id === sid && clip.kind === "media"),
    );
    if (media) selectVisualClip(sid);
    else selectShot(sid);
    setFloatWin("shot");
  };
  /** The cut the transition panel is anchored to (final seconds; opened from the timeline boundary hotspot). */
  const [transitionCut, setTransitionCut] = useState<number | null>(null);
  const openTransitionAt = (cutSec: number, anchor: DOMRect) => {
    setTransitionCut(cutSec);
    setSelectedId(null); // the transition becomes the current selection: Del deletes the transition, not blocks/shots
    setSelectedShotId(null);
    openFloatAt("transition", anchor);
  };
  /** Set/change/remove a transition at a cut (content-level, hung on the next shot's transIn, prevId anchors the
   *  previous shot): at most one per cut; on set, move the playhead to the transition-region start to see the effect.
   *  Duration reuses the existing value, default 1s; direction stored only for push/slide. */
  const setCutTransition = (
    cutSec: number,
    effect: CutTransitionEffect | null,
    direction?: TransitionDirection,
  ) => {
    const sp = videoShotTimelineSpans(
      ensureShots(compRef.current),
      renderVideoPlacements,
    );
    const i = sp.findIndex(
      (s, idx) => idx >= 1 && Math.abs(s.editedStart - cutSec) < 0.05,
    );
    if (i < 1) return;
    const prevId = sp[i - 1]!.clip.id;
    const selfId = sp[i]!.clip.id;
    const shot = sp[i]!.clip;
    const durationSec = Math.min(
      MAX_TRANSITION_SEC,
      shot.transIn?.durationSec ?? 1,
    );
    const dir = direction ?? shot.transIn?.direction;
    commitNarrativePatches([
      {
        clipId: selfId,
        patch: {
          properties: {
            transIn: effect
              ? {
                  prevId,
                  effect,
                  durationSec,
                  ...(DIRECTIONAL_TRANSITIONS.has(effect) && dir
                    ? { direction: dir }
                    : {}),
                }
              : undefined,
          },
        },
      },
    ]);
    if (effect) {
      const prevDur = (sp[i]!.clip as VideoShot).transIn?.durationSec ?? 1;
      applyT(
        Math.max(0, cutSec - Math.min(prevDur, MAX_TRANSITION_SEC) / 2 - 0.2),
      );
    }
  };
  /** Transition region-handle drag commit: symmetric total duration (the timeline already clamps to both sides' shot lengths, this clamps the upper bound). */
  const resizeCutTransition = (shotId: string, durationSec: number) =>
    (() => {
      const shot = compRef.current.shots?.find(
        (candidate) => candidate.id === shotId,
      );
      if (shot?.transIn)
        commitNarrativePatches([
          {
            clipId: shotId,
            patch: {
              properties: {
                transIn: {
                  ...shot.transIn,
                  durationSec: Math.min(
                    MAX_TRANSITION_SEC,
                    Math.max(0.2, durationSec),
                  ),
                },
              },
            },
          },
        ]);
    })();
  // If the cut disappears due to editing (no longer any shot boundary) → auto-close the transition panel
  useEffect(() => {
    if (floatWin !== "transition" || transitionCut == null) return;
    const bounds = videoShotTimelineSpans(
      comp.shots ?? [],
      renderVideoPlacements,
    ).map((sp) => sp.editedEnd);
    if (!bounds.slice(0, -1).some((b) => Math.abs(b - transitionCut) < 0.05))
      setFloatWin(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floatWin, transitionCut, comp.shots, renderVideoPlacements]);
  // The media-anim panel depends on "a selected, filled media block": if selection is lost / switched to another block → auto-close back to chat
  useEffect(() => {
    if (floatWin !== "anim") return;
    const b = selectedId
      ? compRef.current.blocks.find((x) => x.id === selectedId)
      : null;
    const ok =
      b &&
      blockKind(b) === "media" &&
      !!(b.slots.media as { url?: string } | undefined)?.url;
    if (!ok) setFloatWin(null);
  }, [floatWin, selectedId]);
  /** Write back media block animation (enter/exit/duration; enter defaults to fade, matching the render side). */
  const setBlockAnim = (
    bid: string,
    patch: Partial<{ enter: string; exit: string; dur: number }>,
  ) => {
    const block = compRef.current.blocks.find(
      (candidate) => candidate.id === bid,
    );
    if (!block) return null;
    const anim = {
      enter: "fade",
      ...((block.slots.anim ?? {}) as object),
      ...patch,
    } as { enter?: string; exit?: string; dur?: number };
    const nextBlock = {
      ...block,
      slots: { ...block.slots, anim },
    };
    if (
      !patchOverlays([
        {
          clipId: bid,
          block: {
            slots: nextBlock.slots,
          },
        },
      ])
    )
      return null;
    // Install the persisted timeline before the one-shot preview. This keeps the media node
    // alive and prevents the zero-delay composition patch from replacing it mid-animation.
    const timelineBody = renderBlock(nextBlock).timelineBody;
    postPreview({
      type: "hf:blockTimeline",
      blockId: bid,
      timelineBody,
    });
    mediaTimelineEchoRef.current.set(bid, timelineBody);
    return anim;
  };
  /** Push the draft live to the stage (the editor already passed the hard-lint error gate). */
  const handleCodeDraft = (id: string, draft: SourceDraft) => {
    if (genIdsRef.current.has(id)) return;
    codeDraftRef.current = draft;
    patchOverlays([
      {
        clipId: id,
        block: {
          templateId: "custom",
          slots: {
            innerHtml: draft.innerHtml,
            timelineBody: draft.timelineBody,
          },
        },
      },
    ]);
  };
  /** Commit: write back + advance the baseline to the applied state (closing after this no longer reverts). */
  const handleCodeApply = (id: string, draft: SourceDraft) => {
    if (genIdsRef.current.has(id)) {
      toast.info(t("workbench.elementGeneratingApplyAfter"));
      return;
    }
    handleCodeDraft(id, draft);
    codeOrigRef.current = {
      id,
      templateId: "custom",
      slots: { innerHtml: draft.innerHtml, timelineBody: draft.timelineBody },
    };
    codeDraftRef.current = null;
  };
  /** In-editor "AI edit": run compose with the current draft as the base (includes the lint-fix loop), holding the generation lock. */
  const runCodeAi = async (
    b: Block,
    instruction: string,
    draft: SourceDraft,
    onNote: (n: string) => void,
  ): Promise<SourceDraft | null> => {
    markGenerating([b.id], true);
    try {
      const boxPx = b.box
        ? {
            w: Math.round(b.box.w * compRef.current.width),
            h: Math.round(b.box.h * compRef.current.height),
          }
        : undefined;
      const seed = {
        id: b.id,
        kind: "custom",
        innerHtml: draft.innerHtml,
        timelineBody: draft.timelineBody,
        label: b.label,
        durationSec: b.durationSec,
        beats: beatsForWindow(
          compRef.current.shots ?? [],
          asrRef.current,
          clipAsrRef.current,
          b.startSec,
          b.durationSec,
        ),
        ...(boxPx ? { boxPx } : {}),
      };
      const parsed = await composeBlockChecked(seed, instruction, (acc) =>
        onNote(noteOf(acc)),
      );
      return { innerHtml: parsed.innerHtml, timelineBody: parsed.timelineBody };
    } catch (e) {
      console.warn("[studio] AI edit failed", e);
      toast.error(t("workbench.aiEditFailed"));
      return null;
    } finally {
      markGenerating([b.id], false);
    }
  };
  /** "Loop preview": repeatedly play the block's time window, for tuning animation. */
  const toggleCodeLoop = (on: boolean) => {
    const b = codeBlockId
      ? compRef.current.blocks.find((x) => x.id === codeBlockId)
      : null;
    if (!on || !b) {
      stopCodeLoop();
      return;
    }
    const start = Math.max(0, b.startSec);
    const end = Math.min(
      totalDuration(compRef.current),
      b.startSec + b.durationSec,
    );
    if (end - start < 0.2) return;
    loopRangeRef.current = { start, end };
    setCodeLoop(true);
    tRef.current = start;
    playhead.set(start);
    setT(start);
    if (playingRef.current) postPreview({ type: "hf:play", t: start });
    else setPlaying(true); // the play effect starts from tRef
  };

  // Listen to the iframe bridge: select → select block; edit → in-place write-back to slot; fit → autofit scale factor; clock → playback clock
  useEffect(() => {
    function onMsg(e: MessageEvent) {
      // Only trust the preview double buffers (component cards / hover mini-previews run the same runtime and also post; don't let them change state / forge edits)
      const fromActive =
        e.source === iframesRef.current[bufsRef.current.active]?.contentWindow;
      const fromBack =
        e.source ===
        iframesRef.current[bufsRef.current.active === 0 ? 1 : 0]?.contentWindow;
      if (!fromActive && !fromBack) return;
      const d = e.data as {
        source?: string;
        type?: string;
        blockId?: string;
        clipId?: string;
        key?: string;
        value?: string;
        fits?: Record<string, number>;
        t?: number;
        src?: string;
        dx?: number;
        dy?: number;
        snapX?: boolean;
        snapY?: boolean;
        shiftKey?: boolean;
        metaKey?: boolean;
        ctrlKey?: boolean;
        altKey?: boolean;
        nonce?: string;
        index?: number;
        el?: string;
        sub?: boolean;
        part?: string;
        rect?: { x: number; y: number; w: number; h: number };
      } | null;
      if (!d || d.source !== "hf") return;
      // fit is accepted from both buffers (the background buffer measures the new content); interaction/position only from the active buffer
      if (d.type === "fit" && d.fits) {
        applyFits(d.fits);
        return;
      }
      // In-place patched node finished loading its media → clear the block's loading badge
      // (the buffer-swap clear never fires for in-place patches)
      if (d.type === "hf:mediaReady" && d.blockId) {
        setMediaBusyPhase(String(d.blockId), null);
        return;
      }
      // Measured caption-line rect (hf:measure reply): the selection box uses it to hug the real caption area
      if (d.type === "measure" && fromActive && d.rect) {
        if (d.sub)
          setCapSubMeasure({
            w: d.rect.w,
            h: d.rect.h,
            scale: resolveSubCaptionStyle(compRef.current).scale,
          });
        else
          setCapMeasure({
            w: d.rect.w,
            h: d.rect.h,
            scale: resolveCaptionStyle(compRef.current).scale,
          });
        return;
      }
      // pong accepted from both buffers: the background buffer's swap-handshake reply + the active buffer's playback-probe evidence
      if (d.type === "pong") {
        const st = switchPingRef.current;
        if (st && d.nonce === st.nonce && fromBack) {
          // Target doc confirmed live. Do not swap yet: its video canvas is still untouched. Prime
          // the current picture into this exact buffer, then debut it on successful frame delivery.
          switchPingRef.current = null;
          if (st.timer) clearTimeout(st.timer);
          const { idx, doc } = st;
          const commitSwitch = () => {
            if (
              bufsRef.current.docs[idx] !== doc ||
              bufsRef.current.active === idx
            )
              return;
            try {
              // teardown (includes pause): the old doc immediately releases media loads/decoder sessions, doesn't wait for async GC after srcdoc is cleared
              iframesRef.current[
                bufsRef.current.active
              ]?.contentWindow?.postMessage({ type: "hf:teardown" }, "*");
            } catch {
              /* ignore */
            }
            pendingSwitchRef.current = false; // swap settled: in-place patch path resumes
            setRebuilding(false);
            setPendingInsert(null);
            console.info("[studio] buf switch", {
              to: idx,
              from: bufsRef.current.active,
            });
            setBufs((s) => {
              if (s.docs[idx] !== doc) return s;
              const docs = [...s.docs] as [string, string];
              const cleared = s.active === idx ? (idx === 0 ? 1 : 0) : s.active;
              docs[cleared] = "";
              const revs = [...s.revs] as [number, number];
              revs[cleared] += 1;
              return { ...s, docs, active: idx, revs };
            });
            // Replay the alignment now that the pong PROVED this doc listens: the load-time hf:seek can hit a
            // deaf half-loaded doc (the known pit) and vanish — a paused boot then leaves caption timelines at
            // their initial hidden state (main segments gsap-hidden, sub line visible) until the first
            // hover/play seek (user-reported: captions missing after refresh until mousing over the timeline).
            const w = iframesRef.current[idx]?.contentWindow;
            try {
              w?.postMessage({ type: "hf:seek", t: tRef.current }, "*");
              // Re-assembly interrupted playback (e.g. AI edited a block) → resume from the current playhead
              if (playingRef.current)
                w?.postMessage({ type: "hf:play", t: tRef.current }, "*");
            } catch {
              /* ignore */
            }
          };
          const prime = {
            idx,
            doc,
            attempts: 0,
            timer: null as ReturnType<typeof setTimeout> | null,
            onDelivered: commitSwitch,
          };
          previewFramePrimeRef.current = prime;
          const requestPrime = () => {
            if (previewFramePrimeRef.current !== prime) return;
            if (
              bufsRef.current.docs[idx] !== doc ||
              bufsRef.current.active === idx
            ) {
              previewFramePrimeRef.current = null;
              return;
            }
            prime.attempts += 1;
            videoEngineRef.current?.refresh();
            if (prime.attempts < 10) {
              prime.timer = setTimeout(requestPrime, 300);
              return;
            }
            // Preserve the old complete frame instead of revealing an unprimed canvas. A later
            // document change starts a fresh generation; this one has already failed ten seeks.
            previewFramePrimeRef.current = null;
            pendingSwitchRef.current = false;
            setRebuilding(false);
            setPendingInsert(null);
            console.warn(
              "[studio] background buffer never received a video frame; keeping the previous complete preview",
              { idx },
            );
          };
          requestPrime();
        } else if (d.nonce === "boot" && fromBack) {
          // Runtime boot beacon (scripts parsed, gsap loaded, listener installed): start the swap handshake
          // NOW instead of waiting for the iframe load event. The load event waits for every eager media
          // image in the doc, which kept "updating…" stuck on image-heavy comps and re-requested all
          // thumbnails before the swap could settle. The ping handshake still proves liveness before swap;
          // images that are still loading just pop in after.
          const idx = bufsRef.current.active === 0 ? 1 : 0;
          if (!switchPingRef.current && bufsRef.current.docs[idx]) {
            alignBackground(idx);
            startSwitchPing(idx, bufsRef.current.docs[idx]);
          }
        }
        return;
      }
      // Person matte: the iframe requests the pre-budgeted mask by **source time** (the track is computed in full when enabled).
      // Answered from both buffers (the background buffer starts requesting during warm-up, so the person doesn't flash
      // blank at the swap); if the track isn't ready return null and the iframe side backs off and re-asks. webp is
      // decoded on demand to an ImageBitmap and transferred, keeping only the compressed form in memory.
      if (d.type === "personMaskAt") {
        const src = e.source as Window | null;
        if (!src) return;
        const t = typeof d.t === "number" ? d.t : 0;
        // Multi-source: the iframe reports "which main-track element + its source file's time"; fetch the track by source, decide the segment by that source's shot toggle
        const elKey = typeof d.el === "string" ? d.el : "main";
        const shots = compRef.current.shots ?? [];
        let trackKey = "main";
        let inOn = false;
        if (elKey === "main") {
          inOn = shots.some(
            (s) =>
              !s.src &&
              s.personMatte &&
              t >= s.srcStart - 0.05 &&
              t < s.srcEnd + 0.05,
          );
        } else {
          const sh = shots.find((s) => `clip_${s.id}` === elKey);
          trackKey = sh?.src ?? "";
          inOn =
            !!sh?.personMatte &&
            !!sh &&
            t >= sh.srcStart - 0.05 &&
            t < sh.srcEnd + 0.05;
        }
        const track = matteTrackRef.current.get(trackKey);
        if (!inOn || !track?.length) {
          try {
            src.postMessage({ type: "hf:personMask", mask: null }, "*");
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
        const pick =
          next && Math.abs(next.t - t) < Math.abs(cand.t - t) ? next : cand;
        // If the nearest frame is too far (this segment has matte on but isn't fully budgeted yet) return empty too, don't substitute another segment's mask
        if (Math.abs(pick.t - t) > 2 / MATTE_FPS) {
          try {
            src.postMessage({ type: "hf:personMask", mask: null }, "*");
          } catch {
            /* ignore */
          }
          return;
        }
        createImageBitmap(pick.blob).then(
          (mask) => {
            try {
              src.postMessage({ type: "hf:personMask", mask }, "*", [mask]);
            } catch {
              mask.close();
            }
          },
          () => {
            try {
              src.postMessage({ type: "hf:personMask", mask: null }, "*");
            } catch {
              /* ignore */
            }
          },
        );
        return;
      }
      if (!fromActive) return;
      if (d.type === "select") {
        // Clicking a block during playback = wanting to edit it: pause first (clicking blank still only deselects, doesn't interrupt playback)
        if (d.blockId && playingRef.current) setPlaying(false);
        setSelectedAudioId(null); // a click on the stage is "somewhere else" for the audio lane, hit or miss
        setSelectedId(d.blockId ?? null);
        setCapSelPart(d.part === "sub" ? "sub" : "main"); // caption sub-target: main line / translation line each get their own handles
        setImgSel(null); // if the same click hit an image, the imgSel message right after refills it
        if (d.blockId) setSelectedShotId(null);
        else {
          // Clicking the video area (not a block) = select the shot at the playhead (per user); pure deselect only when there are no shots
          const c = compRef.current;
          const shots = c.shots ?? [];
          let cur: string | null = null;
          if (shots.length) {
            const now = tRef.current;
            for (const s of shots) {
              const sp = shotSpan(c, s.id);
              if (
                sp &&
                now >= sp.editedStart - 1e-3 &&
                now < sp.editedStart + sp.shotLen + 1e-3
              ) {
                cur = s.id;
                break;
              }
            }
            cur ??= shots[shots.length - 1]!.id; // playhead at the very end: count it as the last shot
          }
          setSelectedShotId(cur);
        }
      } else if (d.type === "selectVisual" && typeof d.clipId === "string") {
        // Native media lives outside the HTML block model. Select its V2 clip directly so the
        // canvas placement shell edits the same box used by preview/export.
        if (playingRef.current) setPlaying(false);
        setSelectedVisualClipId(d.clipId);
        setSelectedId(null);
        setSelectedShotIds(new Set());
        setSelectedShotIdRaw(null);
        setSelectedAudioId(null);
        setImgSel(null);
      } else if (
        d.type === "imgSel" &&
        d.blockId &&
        typeof d.index === "number" &&
        d.rect
      ) {
        // Image slots are only for custom blocks (LLM-generated components); media-slot block images use the block-level toolbar
        const b = compRef.current.blocks.find((x) => x.id === d.blockId);
        if (b && b.templateId === "custom" && !genIdsRef.current.has(b.id))
          setImgSel({ blockId: d.blockId, index: d.index, rect: d.rect });
      } else if (d.type === "edit" && d.blockId && d.key) {
        iframeEditEchoRef.current.add(d.blockId); // in-place text edit: active doc is already current, this block's slots commit can skip the rebuild
        setSlot(d.blockId, d.key, d.value ?? "");
      } else if (d.type === "boxDragStart" && d.blockId) {
        // Drag baseline snapshot (the move itself is a translate inside the iframe, zero React re-render; this only records the start point for commit).
        // Don't commit for a block that's generating (its box was already snapshotted to the worker, a drag would be overwritten by the result).
        const b = compRef.current.blocks.find((x) => x.id === d.blockId);
        boxDragRef.current =
          b?.box && !genIdsRef.current.has(b.id)
            ? { id: b.id, box: b.box }
            : null;
        setImgSel(null); // once the block moves the image rect is stale — hide the image toolbar, re-show on click
        setGuideVis(false, false); // if the previous drag was interrupted by a doc rebuild, clear the guides here as a fallback
        dragCursorRef.current = ""; // body/grip drag doesn't mount the shield: the capture element is resident (in-iframe block / toolbar grip), events aren't lost
        setBodyDragging(!!boxDragRef.current);
      } else if (d.type === "boxDrag") {
        // Zero setState during drag: guides/ghost/toolbar all write DOM directly (React doesn't write back unchanged
        // style props, so they aren't clobbered; on commit React recomputes with the same toolbarXY, identical values → zero jump, zero re-render)
        setGuideVis(!!d.snapX, !!d.snapY);
        if (
          boxDragRef.current &&
          typeof d.dx === "number" &&
          typeof d.dy === "number"
        ) {
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
      } else if (d.type === "boxDragEnd") {
        // One-shot commit: baseline + iframe's final (snapped) displacement → translate the whole block (box and contentBox move together).
        // No boundary clamping: blocks may be dragged off-canvas, the out-of-bounds part is cut by canvas overflow (per user)
        const st = boxDragRef.current;
        if (
          st &&
          st.id === d.blockId &&
          typeof d.dx === "number" &&
          typeof d.dy === "number"
        ) {
          const c = compRef.current;
          const dxf = d.dx / c.width;
          const dyf = d.dy / c.height;
          const block = compRef.current.blocks.find(
            (candidate) => candidate.id === st.id,
          );
          if (block)
            patchOverlays([
              {
                clipId: st.id,
                block: {
                  box: shiftBox({ ...block, box: st.box }, dxf, dyf).box,
                },
              },
            ]);
        }
        boxDragRef.current = null;
        setGuideVis(false, false);
        setGhostRect(null);
        setBodyDragging(false);
      } else if (d.type === "playBlocked") {
        // Browser refused to start playback (autoplay permission/decode issue): must be visible, this was once the silent culprit of "playhead moves but frame freezes"
        console.warn("[studio] video play() rejected by the browser", d);
      } else if (d.type === "key" && typeof d.key === "string") {
        // Shortcut forwarded from the iframe (separate focus context) → replayed as a window keydown, goes through the unified shortcut handler
        window.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: d.key,
            shiftKey: !!d.shiftKey,
            metaKey: !!d.metaKey,
            ctrlKey: !!d.ctrlKey,
            altKey: !!d.altKey,
          }),
        );
      } else if (d.type === "clock" && typeof d.t === "number") {
        // Self-driven playback position reported by the iframe (after canvas-ization the parent is the sole clock; this path is only still used by the source editor's loop preview)
        if (playingRef.current) {
          // Source editor "loop preview": past the block's time-window end → jump back to start and replay (one-shot command, self-drive continues)
          const lr = loopRangeRef.current;
          if (lr && d.t >= lr.end - 0.03) {
            tRef.current = lr.start;
            playhead.set(lr.start);
            postPreview({ type: "hf:play", t: lr.start });
            return;
          }
          const nextT = monotonicPlaybackSecond(tRef.current, d.t);
          tRef.current = nextT;
          playhead.set(nextT);
        }
      } else if (d.type === "ended") {
        const lr = loopRangeRef.current;
        if (lr && playingRef.current) {
          // Loop window at the very end of the final cut: treat ended as a loop point too
          tRef.current = lr.start;
          playhead.set(lr.start);
          postPreview({ type: "hf:play", t: lr.start });
          return;
        }
        const D =
          typeof d.t === "number" ? d.t : totalDuration(compRef.current);
        tRef.current = D;
        playhead.set(D);
        setT(D);
        setPlaying(false);
      }
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
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
    return k === "caption" || k === "transition" ? null : id;
  }, []);
  // Selection change (timeline click / canvas click / agent focus) → sync iframe highlight + **select means visible**:
  // the "select = force-show" mechanism is retired (root-cause fixed per user 2026-07-13) — runtime reverse-reconstruction
  // of the "settled state" fights every initial-state style in generated code (inline tl.from / CSS-rule base + tl.to /
  // inline transform combos, observed three in a row) — a whack-a-mole you can't win. Instead: when a selected block
  // hasn't entered/settled or has already exited at the current playhead, move the playhead to its settled moment —
  // the frame is the real playback render, zero special-casing for any animation style. If the block is already visible
  // (clicked on canvas, playhead in its settled window) don't move the playhead; captions use the separate capEdit mechanism; don't move during playback.
  useEffect(() => {
    postPreview({ type: "hf:selectBlock", blockId: selectedId });
    if (!selectedId || playingRef.current) return;
    if (!focusIdOf(selectedId)) return; // ignore captions/transitions
    const b = compRef.current.blocks.find((x) => x.id === selectedId);
    if (!b) return;
    const settle = Math.min(
      Math.max(0.45, b.durationSec * 0.2),
      Math.max(0.01, b.durationSec - 0.06),
    ); // same as seekBlockSettled
    const t = tRef.current;
    if (t < b.startSec + settle - 1e-3 || t >= b.startSec + b.durationSec)
      applyT(b.startSec + settle);
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
      const entries = Object.entries(m).filter(([, p]) => p !== "swap");
      return entries.length === Object.keys(m).length
        ? m
        : Object.fromEntries(entries);
    });
  }, [bufs.active]);

  // Global shortcuts (editor muscle memory): Space play/pause · arrow keys nudge the selected block's position (with
  // no selected block, ←→ steps the playhead) · Delete/Backspace deletes the selected block or scene · Escape closes
  // the source panel / deselects. All yield when the cursor is in an input/editable area; don't intercept Enter: focus
  // often sits on a toolbar button, and Enter would do "button trigger + block delete" together, making blocks vanish.
  // removeBlock/deleteShot etc. read the latest per-render closures via keysRef.
  const keysRef = useRef<{
    removeBlock: (id: string) => void;
    deleteBlocks: (ids: Set<string>) => void;
    deleteShot: (sid: string) => void;
    deleteShots: (ids: Set<string>) => void;
    deleteVisualClip: (id: string) => void;
    removeAudio: (id: string) => void;
    closeCode: () => void;
    closeFloat: () => void;
    deleteTransition: () => void;
    undo: () => void;
    redo: () => void;
    floatWin: FloatKind | null;
  }>({
    removeBlock: () => {},
    deleteBlocks: () => {},
    deleteShot: () => {},
    deleteShots: () => {},
    deleteVisualClip: () => {},
    removeAudio: () => {},
    closeCode: () => {},
    closeFloat: () => {},
    deleteTransition: () => {},
    undo: () => {},
    redo: () => {},
    floatWin: null,
  });
  // Audible media must begin inside the click/keydown activation itself. Deferring the first
  // video.play() to the React effect loses browser user activation on stricter autoplay policies.
  const beginPlayback = useCallback(() => {
    if (tRef.current >= duration - 0.02) {
      tRef.current = 0;
      playhead.set(0);
      setT(0);
    }
    postPreview({ type: "hf:play", t: tRef.current });
    videoEngineRef.current?.play(tRef.current);
  }, [duration, postPreview]);
  const togglePlaybackFromUserGesture = useCallback(() => {
    if (playingRef.current) {
      // Close the async clock-message window immediately. setPlaying(false) does not update the
      // ref until React renders, so a queued iframe clock could otherwise rewind the playhead after
      // the user had already paused.
      playingRef.current = false;
      videoEngineRef.current?.pause();
      postPreview({ type: "hf:pause" });
      setPlaying(false);
      return;
    }
    playingRef.current = true;
    beginPlayback();
    setPlaying(true);
  }, [beginPlayback, postPreview]);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null;
      const typing =
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable);
      if (e.key === "Escape") {
        if (timelineFramePickActiveRef.current) {
          restoreChatAfterTimelineFramePick();
          return;
        }
        if (typing) return;
        if (keysRef.current.floatWin === "code") {
          keysRef.current.closeCode(); // source panel open: close it first (revert unapplied draft), keep selection
          return;
        }
        if (keysRef.current.floatWin) {
          keysRef.current.closeFloat(); // any panel: Esc closes it first, keep selection
          return;
        }
        setSelectedId(null);
        setSelectedShotId(null);
        setSelectedVisualClipId(null);
        return;
      }
      // ⌘Z/Ctrl+Z: undo (operations with snapshots — trims, script cuts, block deletes, panel inserts, etc.); ⇧⌘Z: redo
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        (e.key === "z" || e.key === "Z")
      ) {
        if (typing) return;
        e.preventDefault();
        if (e.shiftKey) keysRef.current.redo();
        else keysRef.current.undo();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === " ") {
        // Focus often sits on a button, so bare Space would re-trigger it — hijack uniformly to play/pause
        const c = compRef.current;
        if (!hasTimelineContent(c)) return;
        e.preventDefault();
        togglePlaybackFromUserGesture();
        return;
      }
      if (e.key.startsWith("Arrow")) {
        const id = selectedIdRef.current;
        const b = id ? compRef.current.blocks.find((x) => x.id === id) : null;
        if (b?.box && !genIdsRef.current.has(b.id)) {
          // Nudge the selected block's position: 5px/step, Shift=20px (in comp px)
          e.preventDefault();
          const step = e.shiftKey ? 20 : 5;
          const dx =
            (e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0) *
            (step / compRef.current.width);
          const dy =
            (e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0) *
            (step / compRef.current.height);
          if (!dx && !dy) return;
          patchOverlays([
            { clipId: b.id, block: { box: shiftBox(b, dx, dy).box } },
          ]);
          return;
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          // No nudgeable selected block: ←→ steps the playhead (0.1s, Shift=1s); pause first during playback (stepping = wanting frame-by-frame)
          e.preventDefault();
          if (playingRef.current) setPlaying(false);
          const step =
            (e.shiftKey ? 1 : 0.1) * (e.key === "ArrowLeft" ? -1 : 1);
          const D = totalDuration(compRef.current);
          applyT(Math.max(0, Math.min(D, tRef.current + step)));
        }
        return;
      }
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      if (keysRef.current.floatWin === "transition") {
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
      if (selectedVisualClipIdRef.current) {
        e.preventDefault();
        keysRef.current.deleteVisualClip(selectedVisualClipIdRef.current);
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
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    applyT,
    restoreChatAfterTimelineFramePick,
    togglePlaybackFromUserGesture,
  ]);

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
      postPreview({ type: "hf:pause" });
      setT(tRef.current); // stopped: sync the coarse-grained t (for low-frequency consumers like debug overlay/liveGeom)
      return;
    }
    // Button/Space starts the resident decoder synchronously inside the user gesture. Agent-driven
    // playback has no such direct entry and starts here. Never restart an already-playing decoder.
    if (!videoEngineRef.current?.isPlaying) beginPlayback();
  }, [playing, beginPlayback, postPreview]);

  /* ---------- Pick a local video (no upload, blob preview) + ASR ---------- */
  function activateNarrativeSourceRuntime(source: {
    file: File;
    url: string;
    sig: string;
    durationSec: number;
  }) {
    objectUrlRef.current = source.url;
    clipFilesRef.current.set(source.url, source.file);
    // Retained only as a legacy panel cache for the last file picked by the user. Playback and
    // source identity are driven exclusively by clip asset URLs.
    videoFileRef.current = source.file;
    setVideoFile(source.file);
    videoSigRef.current = source.sig;
  }

  /** opts.asSig: a cloud-fetched File has a changed name/mtime so fileSig won't match the original sig — substitute the
   *  original sig, otherwise the draft-reconnect check fails and it's wiped as a "new project" (OPFS persistence/cloud backup also use the original sig). */
  async function pickVideoFile(file: File, opts?: VideoPickOptions) {
    if (
      !file.type.startsWith("video/") &&
      !/\.(mp4|mov|webm|m4v)$/i.test(file.name)
    ) {
      toast.error(t("workbench.chooseVideoFile"));
      return;
    }
    const sig = opts?.asSig ?? await durableFileSig(file);
    setBusyImport(true);
    try {
      const p = await probeVideoFile(file);
      const dims = normalizeDims(p.width, p.height);
      // Adding the first main-source clip to a graphics/audio-only edit is an insertion, not a
      // project replacement. Preserve the work already built on the empty visual track.
      const preserveEmptyTrackEdit =
        !hasVideoTrackContent(compRef.current) &&
        hasTimelineContent(compRef.current);
      const url = URL.createObjectURL(file);
      activateNarrativeSourceRuntime({
        file,
        url,
        sig,
        durationSec: p.durationSec || 30,
      });

      void saveLocalVideo(file, sig).then((stored) => {
        if (!stored) toast.info(t("workbench.localPersistenceUnavailable"));
      }); // OPFS local library: draft restore auto-reconnects after refresh, no re-pick needed
      // Main video stays LOCAL (no auto R2 backup) — kept off deliberately; cross-device video
      // persistence is reserved for a future paid feature. Same-device reconnect uses OPFS above.
      // Inserted clips still back up (insert_clip fetches them from the cloud in another session).

      const dur = p.durationSec || 30;
      const pr = pendingRestoreRef.current;
      // Swap video: clear media-analysis products so tools do not reuse observations from another source.
      // NOT on a same-video draft-restore reconnect: V2 document hydration already restored the
      // transcript, and wiping here would leave the captions/script panels empty while the timeline
      // showed captions — the products belong to this very video, keep them (user hit this).
      // reconnect: per-asset restore of the main source mid-session — same preserve semantics as a draft reconnect
      const currentPrimaryId =
        firstNarrativeAssetId(editorDocumentRef.current);
      const currentPrimarySig = currentPrimaryId
        ? editorDocumentRef.current.assets[currentPrimaryId]?.locator.localSig
        : null;
      const sameVideoRestore = shouldReconnectNarrativeSource({
        candidateSig: sig,
        explicitReconnect: opts?.reconnect,
        pendingVideoSig: pr?.videoSig,
        assetLocalSig: currentPrimarySig,
      });
      const successNotices = videoPickSuccessNotices(sameVideoRestore, opts);
      if (!sameVideoRestore) {
        setAsrSentences(null);
        setVisual(null);
        asrRef.current = null;
        visualRef.current = null;
      }
      resetExport();
      if (sameVideoRestore) {
        // Draft restore: re-picked the same original video — only reconnect the video, keep restored blocks/shots
        pendingRestoreRef.current = null;
        // Reconnect only the source bytes. The draft's canvas may have been deliberately changed
        // (set_canvas); restoring the source dimensions here used to silently erase that edit.
        const assetId =
          firstNarrativeAssetId(editorDocumentRef.current);
        if (assetId) rememberAssetUrl(assetId, url);
        setEditorDocument(editorDocumentRef.current);
        if (successNotices.reconnected)
          toast.success(t("workbench.originalVideoReconnectedDraft"));
      } else {
        if (pr) pendingRestoreRef.current = null; // picked a different video = give up reconnecting, treat as new project
        // A real source swap keeps the historical "new edit" behavior; filling an empty track keeps
        // graphics/audio and the canvas settings that the user established before importing footage.
        const baseDocument = preserveEmptyTrackEdit
          ? editorDocumentRef.current
          : emptyEditorDocumentV2({
              width: dims.width,
              height: dims.height,
              theme: editorDocumentRef.current.appearance.theme,
            });
        const edit = addNarrativeDocumentClip({
          document: baseDocument,
          shot: {
            id: shotId(),
            src: url,
            srcSig: sig,
            srcStart: 0,
            srcEnd: dur,
            treatment: "full",
          },
          atSec: 0,
          sourceWidth: dims.width,
          sourceHeight: dims.height,
          configureCanvas: !preserveEmptyTrackEdit,
          mode: "overwrite",
        });
        if (!edit.ok || !edit.assetId)
          throw new Error(
            edit.ok
              ? "Narrative source was not registered."
              : editorErrorMessage(edit.error),
          );
        rememberAssetUrl(edit.assetId, url);
        setEditorDocument(edit.document);
      }
      setSelectedId(null);
      setSelectedShotId(null);
      setCodeBlockId(null);
      setPlaying(false);
      tRef.current = 0;
      playhead.set(0);
      setT(0);
      if (successNotices.loaded) {
        toast.success(
          t("workbench.loadedSize", { w: dims.width, h: dims.height }) +
            (p.durationSec ? ` · ${p.durationSec.toFixed(1)}s` : "") +
            (p.hasAudio ? "" : t("workbench.noAudioTrack")),
        );
      }
    } catch {
      toast.error(t("workbench.couldNotReadVideo"));
    } finally {
      setBusyImport(false);
    }
  }

  // Extract audio → upload → ASR (in-memory + persistent cache by file fingerprint, transcribe each video once)
  // Current video metadata. Read the latest via ref.
  function currentVideo() {
    const c = compRef.current;
    const document = editorDocumentRef.current;
    const asset = firstNarrativeAsset(document);
    const durationSec = asset?.metadata.durationSec;
    const url = asset ? resolveAssetUrl(asset) : null;
    return url && durationSec
      ? { url, durationSec, width: c.width, height: c.height }
      : null;
  }

  const speechFileForAsset = useCallback(
    async (asset: EditorMediaAsset): Promise<File | null> => {
      if (
        asset.id === firstNarrativeAssetId(editorDocumentRef.current) &&
        videoFileRef.current
      ) {
        return videoFileRef.current;
      }
      if (asset.locator.localSig) {
        const direct = await loadLocalVideo(asset.locator.localSig);
        if (direct) return direct;
        const entry = localAssetIndexRef.current.find(
          (item) => item.contentSig === asset.locator.localSig,
        );
        if (entry?.folder) {
          const folder = await loadLocalFolderFile(
            entry.folder.id,
            entry.folder.path,
            asset.locator.localSig,
          );
          if (folder?.file) return folder.file;
        }
      }
      const source = resolveAssetUrl(asset);
      if (!source) return null;
      const mounted = clipFilesRef.current.get(source);
      if (mounted) return mounted;
      const fallbackType = asset.kind === "audio" ? "audio/mpeg" : "video/mp4";
      const extension = asset.kind === "audio" ? "mp3" : "mp4";
      return (await materializeRemoteMedia(source, {
        name: `${asset.label || asset.id}.${extension}`,
        type: fallbackType,
        sig: asset.locator.localSig,
      })).file;
    },
    [resolveAssetUrl],
  );

  // Independent transcript and visual-analysis capabilities (in-flight deduped).
  const { stepAsr, refreshAsr, stepVisual } = useMediaAnalysis({
    videoFileRef,
    asrRef,
    visualRef,
    setAsrSentences,
    setVisual,
    documentRef: editorDocumentRef,
    setDocument: setEditorDocument,
    speechFileForAsset,
    currentVideo,
  });

  // Debug hook: clear the visual-analysis cache + rerun (same video returns cache instantly by default; use this to re-measure analysis)
  async function rerunVisual() {
    if (!videoFile || !firstAssetDurationSec) {
      toast.error(t("common.uploadVideoFirst"));
      return;
    }
    clearVisualCache(videoSigRef.current ?? fileSig(videoFile));
    setVisual(null);
    toast.success(t("workbench.cacheClearedReanalyzingVideo"));
    const vis = await analyzeVisual(videoFile, firstAssetDurationSec).catch(
      () => null,
    );
    setVisual(vis);
    toast.success(
      vis
        ? t("workbench.visualAnalysisDone")
        : t("workbench.visualAnalysisFoundNothing"),
    );
  }

  /* ---------- Chat (streaming): a block is selected → edit it; none selected → AI creates a new component ---------- */
  /** Reuse /api/studio/compose to generate/edit a custom block, returning the model's raw text (note + fences). */
  const composeBlockRaw = useCallback(
    async (
      seed: {
        id: string;
        kind: string;
        innerHtml: string;
        timelineBody: string;
        label?: string;
        boxPx?: { w: number; h: number };
        durationSec?: number;
        beats?: { text: string; start: number; end: number }[];
        neighbors?: string[];
      },
      instruction: string,
      onDelta?: (raw: string) => void,
      opts?: ComposeMode,
    ): Promise<string> => {
      const script = asrSentences?.map((s) => s.text).join("") ?? ""; // full narration text as context
      const context: {
        script?: string;
        beats?: { text: string; start: number; end: number }[];
        neighbors?: string[];
      } = {};
      if (script) context.script = script;
      if (seed.beats?.length) context.beats = seed.beats; // narration sentences within the block window (local time) → precise beat matching
      if (seed.neighbors?.length) context.neighbors = seed.neighbors; // list of other components in the same video → anti-monotony (vary prototype/alignment/motion)
      // Capabilities go through the provider (open-source split phase 2): the hosted shell = server LLM + billing; the OSS shell can swap the implementation or use BYO
      return studioProviders().composer.composeStream(
        {
          projectId,
          block: {
            id: seed.id,
            kind: seed.kind,
            innerHtml: seed.innerHtml,
            timelineBody: seed.timelineBody,
            label: seed.label ?? t("workbench.newElement"),
            ...(seed.boxPx ? { boxPx: seed.boxPx } : {}),
            ...(seed.durationSec ? { durationSec: seed.durationSec } : {}),
          },
          instruction,
          theme: compRef.current.theme,
          ...(compRef.current.palette
            ? { palette: compRef.current.palette }
            : {}), // background-derived colors, so the LLM uses the real accent
          ...(compRef.current.frameId
            ? { frameId: compRef.current.frameId }
            : {}), // frame design language goes into ACTIVE THEME
          ...(compRef.current.customVisualStyle
            ? { customVisualStyle: compRef.current.customVisualStyle }
            : {}),
          lang: localeRef.current, // note (the human sentence in chat) uses the UI language
          ...(Object.keys(context).length ? { context } : {}),
          ...(opts?.kit
            ? {
                mode: "kit" as const,
                ...(opts.current ? { current: opts.current } : {}),
              }
            : {}),
        },
        onDelta,
      );
    },
    [asrSentences],
  );

  /** Streamed text → the note visible on the card (prose before the first code fence; the contract is note-first, so it's what the model is currently saying). */
  const noteOf = (raw: string): string => {
    const i = raw.indexOf("```");
    return (i === -1 ? raw : raw.slice(0, i)).trim().slice(0, 120);
  };

  /** Generate/edit a block + static-check loop: on failure, feed the issues back for one fix round (bad output as the base, fix only the problems);
   *  if hard errors (unscoped CSS/script/non-determinism) remain after the fix → throw instead of committing CSS that pollutes the whole document. */
  const composeBlockChecked = useCallback(
    async (
      seed: {
        id: string;
        kind: string;
        innerHtml: string;
        timelineBody: string;
        label?: string;
        boxPx?: { w: number; h: number };
        durationSec?: number;
        beats?: { text: string; start: number; end: number }[];
        neighbors?: string[];
      },
      instruction: string,
      onDelta?: (raw: string) => void,
      opts?: ComposeMode,
    ): Promise<ComposedBlock> => {
      // Kit path: no lint round. The component's own schema is the gate and it never throws —
      // there is no such thing as malformed markup to bounce back, only props that clamp.
      if (opts?.kit) {
        const raw = await composeBlockRaw(seed, instruction, onDelta, opts);
        const { choice, note, declined } = parseKitResponse(raw);
        if (choice)
          return {
            innerHtml: seed.innerHtml,
            timelineBody: seed.timelineBody,
            note,
            kit: choice,
          };
        // A deliberate null is an ANSWER — surface it and let the caller decide what a veto means.
        if (declined)
          return {
            innerHtml: seed.innerHtml,
            timelineBody: seed.timelineBody,
            note,
            declined: true,
          };
        // {"custom": true} — the moment deserves a graphic no component carries (built-ins are a
        // library, not a cage): fall through to the free-form designer. Un-parseable output takes
        // the same road as a plain hiccup. The lint loop below guards both.
      }
      const raw = await composeBlockRaw(seed, instruction, onDelta);
      let parsed = parseBlockResponse(raw, {
        innerHtml: seed.innerHtml,
        timelineBody: seed.timelineBody,
      });
      let issues = lintBlock({
        blockId: seed.id,
        innerHtml: parsed.innerHtml,
        timelineBody: parsed.timelineBody,
      });
      if (issues.length) {
        const fixSeed = {
          ...seed,
          innerHtml: parsed.innerHtml,
          timelineBody: parsed.timelineBody,
        };
        const fixInstruction = `Your previous output failed these checks — fix ONLY these problems, keep everything else identical:\n${issues.map((i) => `- ${i.message}`).join("\n")}`;
        const raw2 = await composeBlockRaw(fixSeed, fixInstruction, onDelta);
        parsed = parseBlockResponse(raw2, {
          innerHtml: fixSeed.innerHtml,
          timelineBody: fixSeed.timelineBody,
        });
        issues = lintBlock({
          blockId: seed.id,
          innerHtml: parsed.innerHtml,
          timelineBody: parsed.timelineBody,
        });
        const hard = issues.filter((i) => HARD_LINT_CODES.has(i.code));
        if (hard.length)
          throw new GeneratedBlockValidationError(
            t("workbench.generatedBlockFailedChecks", {
              message: hard[0]!.message,
            }),
            hard.map((issue) => issue.message),
          );
        if (issues.length)
          console.warn("[studio] block lint soft issues", seed.id, issues);
      }
      return parsed;
    },
    [composeBlockRaw],
  );

  /** Delete a block (from the selection toolbar / general). If it's the selected block, clear selection. Don't delete
   *  while generating (the worker's write-back misses and the result count lies). Send hf:remove first so the frame
   *  removes the block instantly — waiting for the 300ms debounced rebuild + double-buffer swap makes delete feel sticky. */
  const removeBlock = (id: string) => {
    if (genLockToast(id)) return;
    const edit = removeOverlayDocumentClips({
      document: editorDocumentRef.current,
      clipIds: [id],
    });
    if (!edit.ok) {
      toast.error(editorErrorMessage(edit.error));
      return;
    }
    postPreview({ type: "hf:remove", id });
    setEditorDocument(edit.document);
    setSelectedIdRaw((s) => (s === id ? null : s));
    setSelectedBlockIds((cur) => {
      if (!cur.has(id)) return cur;
      const n = new Set(cur);
      n.delete(id);
      return n;
    });
  };

  /* ---------- Video track: shot slicing + shot framing ---------- */
  const commitNarrativePatches = (
    updates: NarrativeClipPatchUpdate[],
  ): boolean => {
    const result = patchNarrativeClips(editorDocumentRef.current, updates);
    if (!result.ok) {
      toast.error(editorErrorMessage(result.error));
      return false;
    }
    setEditorDocument(result.document);
    return true;
  };
  const selectShot = (id: string, additive = false) => {
    if (additive) {
      toggleShotSelect(id); // ⌘/Ctrl click: toggle in/out of the multi-select set
      return;
    }
    setSelectedShotId(id);
    setSelectedId(null); // focus only one object at a time
  };
  const selectVisualClip = (id: string) => {
    setSelectedVisualClipId(id);
    setSelectedId(null);
    setSelectedShotIds(new Set());
    setSelectedShotIdRaw(null);
    setSelectedAudioId(null);
  };
  const mediaVideoLocation = (clipId: string) => {
    for (const track of editorDocumentRef.current.timeline.tracks) {
      const clip = track.clips.find(
        (candidate): candidate is MediaTimelineClip =>
          candidate.id === clipId && candidate.kind === "media",
      );
      if (
        clip &&
        editorDocumentRef.current.assets[clip.assetId]?.kind === "video"
      )
        return { trackId: track.id, clip };
    }
    return null;
  };
  const videoShotForSettings = (clipId: string): VideoShot | null => {
    const narrative = compRef.current.shots?.find(
      (candidate) => candidate.id === clipId,
    );
    if (narrative) return narrative;
    const media = mediaVideoLocation(clipId);
    return media ? mediaTimelineClipAsVideoShot(media.clip) : null;
  };
  const patchMediaVideoSettings = (
    clipId: string,
    patch: Parameters<typeof applyMediaVideoSettingsPatch>[1]["patch"],
  ): VideoShot | null => {
    const media = mediaVideoLocation(clipId);
    if (!media) return null;
    const result = applyMediaVideoSettingsPatch(editorDocumentRef.current, {
      trackId: media.trackId,
      clipId,
      patch,
    });
    if (!result.ok) {
      toast.error(result.error);
      return null;
    }
    setEditorDocument(result.document);
    return result.shot;
  };
  const setShotFraming = (sid: string, patch: ShotFramingPatch) => {
    // One write path for panel + Agent: resolve/clamp first, drive the same live transform the exporter
    // later reads, then commit framing and its vacancy partner together.
    const cur = compRef.current.shots?.find((x) => x.id === sid);
    const next = cur
      ? commitNarrativePatches([{ clipId: sid, patch: { framing: patch } }])
        ? patchShotFraming(cur, patch)
        : null
      : patchMediaVideoSettings(sid, { framing: patch });
    if (!next) return;
    postPreview({
      type: "hf:shotVars",
      ...(cur ? {} : { target: `#hf-visual-${sid}` }),
      vars: mediaFramingTransformVars(resolveShotMediaFraming(next)),
    });
  };
  const setShotTreatment = (sid: string, treatment: ShotTreatment) =>
    setShotFraming(sid, { treatment });
  /** Framing size (0–100, non-full types): video scale/proportion follows, and the other-half vacancy moves in sync. */
  const setShotTreatSize = (sid: string, size: number) =>
    setShotFraming(sid, { size, resetPrecision: true });
  /** Live preview during size drag: send hf:shotVars straight to the iframe (zero setState, no debounced rebuild); setShotTreatSize only on release.
   *  canvas render mode: every segment's framing is applied on the #vidEl canvas. */
  const previewShotTreatSize = (sid: string, size: number) => {
    const s = videoShotForSettings(sid);
    if (s)
      postPreview({
        type: "hf:shotVars",
        ...(compRef.current.shots?.some((candidate) => candidate.id === sid)
          ? {}
          : { target: `#hf-visual-${sid}` }),
        vars: shotTransformVars(s.treatment, size, s.treatCrop),
      });
  };
  /** Half-split crop position (0–100): which part of the frame survives the fill. Same live channel as size. */
  const setShotTreatCrop = (sid: string, crop: number) =>
    setShotFraming(sid, { crop });
  const previewShotTreatCrop = (sid: string, crop: number) => {
    const s = videoShotForSettings(sid);
    if (s)
      postPreview({
        type: "hf:shotVars",
        ...(compRef.current.shots?.some((candidate) => candidate.id === sid)
          ? {}
          : { target: `#hf-visual-${sid}` }),
        vars: shotTransformVars(s.treatment, s.treatSize, crop),
      });
  };
  /** Shot-level color grade commit: filter changes take the same fast path as framing (hf:vidTimeline swaps the body
   *  in place, grade keyframes are inside it); if the playhead is within this shot, apply the instant value first, don't
   *  wait for the body swap. Fully neutral = drop the field entirely. */
  const setShotFilter = (sid: string, f: ShotFilter | null) => {
    const css = shotFilterCss(f ?? undefined);
    const sp = videoShotTimelineSpans(
      ensureShots(compRef.current),
      videoPlacements,
    ).find((x) => x.clip.id === sid);
    const primary = !!compRef.current.shots?.some(
      (candidate) => candidate.id === sid,
    );
    if (primary) {
      if (!commitNarrativePatches([{ clipId: sid, patch: { filter: f } }]))
        return;
      if (
        sp &&
        tRef.current >= sp.editedStart - 1e-3 &&
        tRef.current < sp.editedEnd
      ) {
        postPreview({ type: "hf:shotVars", vars: { filter: css } });
      }
      return;
    }
    if (patchMediaVideoSettings(sid, { filter: f })) {
      postPreview({
        type: "hf:shotVars",
        target: `#hf-visual-${sid}`,
        vars: { filter: css },
      });
    }
  };
  /** Live preview during grade drag (zero setState; setShotFilter commits only on release). */
  const previewShotFilter = (sid: string, f: ShotFilter) => {
    postPreview({
      type: "hf:shotVars",
      ...(compRef.current.shots?.some((candidate) => candidate.id === sid)
        ? {}
        : { target: `#hf-visual-${sid}` }),
      vars: { filter: shotFilterCss(f) },
    });
  };
  /** Per-shot audio commit (volume/mute): the engine-segment effect refeeds gains from comp.shots. */
  const setShotAudio = (
    sid: string,
    patch: {
      volumeDb?: number;
      mute?: boolean;
      fadeInSec?: number;
      fadeOutSec?: number;
    },
  ) => {
    if (compRef.current.shots?.some((candidate) => candidate.id === sid)) {
      commitNarrativePatches([{ clipId: sid, patch: { audio: patch } }]);
    } else {
      patchMediaVideoSettings(sid, { audio: patch });
    }
  };
  const setTimelineClipEnabled = (
    trackId: string,
    clipId: string,
    enabled: boolean,
  ) => {
    const result = applyEditorCommand(editorDocumentRef.current, {
      type: "clip.patch",
      trackId,
      clipId,
      patch: { enabled },
    });
    if (!result.ok) {
      toast.error(editorErrorMessage(result.error));
      return;
    }
    pushUndoSnapshot();
    setEditorDocument(result.document);
  };
  const setMediaCanvasBox = (
    trackId: string,
    clipId: string,
    box: MediaCanvasBox,
  ) => {
    const current = editorDocumentRef.current;
    const result = applyEditorCommand(current, {
      type: "clip.patch",
      trackId,
      clipId,
      patch: { box },
    });
    if (!result.ok) {
      toast.error(editorErrorMessage(result.error));
      return;
    }
    if (result.document === current) return;
    pushUndoSnapshot();
    setEditorDocument(result.document);
  };
  /** Track flags stay independent from per-shot audio settings. */
  const videoTrackMuted = primaryNarrative.muted;
  const videoTrackHidden = primaryNarrative.hidden;
  const musicTrack =
    renderPlan.tracks.find(
      (track) => track.type === "audio" && track.role === "music",
    ) ?? renderPlan.tracks.find((track) => track.type === "audio");
  const audioTrackMuted = musicTrack?.muted ?? false;
  const selectedTimelineClipId =
    selectedAudioId ?? selectedVisualClipId ?? selectedId ?? selectedShotId;
  const selectedTimelineClip = selectedTimelineClipId
    ? renderPlan.tracks
        .flatMap((track) =>
          track.clips.map((entry) => ({ trackId: track.id, entry })),
        )
        .find((candidate) => candidate.entry.clipId === selectedTimelineClipId)
    : undefined;
  const canToggleSelectedClip =
    !!selectedTimelineClip &&
    selectedShotIds.size <= 1 &&
    selectedBlockIds.size <= 1;
  const canvasPreviewSec = scrubPreviewSec ?? tSec;
  const liveSelectedCanvasMedia = (() => {
    if (selectedVisualClipId) {
      for (const track of renderPlan.tracks) {
        if (
          track.type === "audio" ||
          track.id === renderPlan.primaryNarrativeTrackId ||
          track.hidden
        )
          continue;
        const entry = track.clips.find(
          (candidate) => candidate.clipId === selectedVisualClipId,
        );
        if (!entry || entry.clip.kind !== "media" || !entry.clip.enabled)
          continue;
        const visualState = supplementalVisuals.find(
          (visual) => visual.clipId === entry.clipId,
        );
        const placement = visualState
          ? supplementalVisualStateAt(visualState, canvasPreviewSec).box
          : (entry.clip.box ?? FULL_MEDIA_CANVAS_BOX);
        const fitted = fittedMediaContentBox(
          entry.asset?.metadata.width,
          entry.asset?.metadata.height,
          comp.width,
          comp.height,
          entry.clip.fit ?? "contain",
          placement,
        );
        const atomicFraming = normalizeAtomicMediaFraming(
          entry.clip.mediaFraming,
          IDENTITY_MEDIA_FRAMING,
        );
        const framing = {
          scale: atomicFraming.transform.scale,
          xPercent: atomicFraming.transform.offsetX * 100,
          yPercent: atomicFraming.transform.offsetY * 100,
          inset: {
            t: atomicFraming.crop.top,
            r: atomicFraming.crop.right,
            b: atomicFraming.crop.bottom,
            l: atomicFraming.crop.left,
          },
        };
        return {
          kind: "media" as const,
          assetKind: entry.asset?.kind,
          settingsShot:
            entry.asset?.kind === "video"
              ? mediaTimelineClipAsVideoShot(entry.clip)
              : null,
          clipId: entry.clipId,
          trackId: track.id,
          elementId: `hf-visual-${entry.clipId}`,
          box: framedMediaContentBox(placement, fitted, framing),
          fitted,
          placementFromContent: (box: MediaCanvasBox) =>
            framedMediaPlacementBox(box, fitted, framing),
          startSec: entry.startSec,
          endSec: entry.endSec,
        };
      }
    }
    if (
      selectedShotId &&
      selectedShotIds.size === 1 &&
      !primaryNarrative.hidden
    ) {
      const entry = renderPlan.narrative.find(
        (candidate) => candidate.clipId === selectedShotId,
      );
      if (entry?.clip.enabled) {
        const placement = entry.clip.box ?? FULL_MEDIA_CANVAS_BOX;
        const fitted = fittedMediaContentBox(
          entry.asset?.metadata.width,
          entry.asset?.metadata.height,
          comp.width,
          comp.height,
          entry.clip.properties.preciseFraming?.coordinateSpace ===
            "source-normalized"
            ? "cover"
            : "contain",
          placement,
        );
        const atomicFraming = entry.clip.mediaFraming
          ? normalizeAtomicMediaFraming(entry.clip.mediaFraming)
          : resolveShotMediaFraming({
              treatment: entry.clip.properties.treatment ?? "full",
              treatSize: entry.clip.properties.treatSize,
              treatCrop: entry.clip.properties.treatCrop,
              preciseFraming: entry.clip.properties.preciseFraming,
            });
        const framing = {
          scale: atomicFraming.transform.scale,
          xPercent: atomicFraming.transform.offsetX * 100,
          yPercent: atomicFraming.transform.offsetY * 100,
          inset: {
            t: atomicFraming.crop.top,
            r: atomicFraming.crop.right,
            b: atomicFraming.crop.bottom,
            l: atomicFraming.crop.left,
          },
        };
        return {
          kind: "narrative" as const,
          assetKind: "video" as const,
          settingsShot:
            comp.shots?.find((candidate) => candidate.id === entry.clipId) ??
            null,
          clipId: entry.clipId,
          trackId: entry.trackId,
          elementId: "vidEl",
          box: framedMediaContentBox(placement, fitted, framing),
          fitted,
          placementFromContent: (box: MediaCanvasBox) =>
            framedMediaPlacementBox(box, fitted, framing),
          startSec: entry.startSec,
          endSec: entry.endSec,
        };
      }
    }
    return null;
  })();
  const displayedCanvasMediaRef = useRef(liveSelectedCanvasMedia);
  const bufferedCanvasMedia = resolveBufferedMediaSelection({
    live: liveSelectedCanvasMedia,
    displayed: displayedCanvasMediaRef.current,
    activeCanvas: { width: activeDims.w, height: activeDims.h },
    liveCanvas: { width: comp.width, height: comp.height },
  });
  if (bufferedCanvasMedia.settled)
    displayedCanvasMediaRef.current = liveSelectedCanvasMedia;
  const selectedCanvasMedia = bufferedCanvasMedia.selection;
  const canvasGeometrySettled = bufferedCanvasMedia.settled;

  const patchTrackFlags = (
    trackId: string,
    patch: { muted?: boolean; hidden?: boolean },
  ) => {
    const result = applyEditorCommand(editorDocumentRef.current, {
      type: "track.patch",
      trackId,
      patch,
    });
    if (!result.ok) {
      toast.error(editorErrorMessage(result.error));
      return;
    }
    pushUndoSnapshot();
    setEditorDocument(result.document);
  };

  /** Picked an image/video → write into a media-slot block's media slot. */
  const setBlockMedia = (bid: string, media: MediaRef) => {
    const block = compRef.current.blocks.find(
      (candidate) => candidate.id === bid,
    );
    if (block)
      patchOverlays([
        { clipId: bid, block: { slots: { ...block.slots, media } } },
      ]);
  };
  /** Pop the native file picker, get one file. */
  const pickFile = (accept: string): Promise<File | null> =>
    new Promise((res) => {
      const i = document.createElement("input");
      i.type = "file";
      i.accept = accept;
      i.onchange = () => res(i.files?.[0] ?? null);
      i.click();
    });
  /** Keep a user-picked image on this device and persist only its stable identity in the project.
   * This is the browser-picker counterpart of the agent helper's register-local-assets path. */
  const preparePickedLocalImage = async (file: File): Promise<string> => {
    const asset = await importLocalSource({ type: "browser", file }, projectId);
    if (asset.kind !== "image")
      throw new Error("selected file is not an image");
    let dims: { width?: number; height?: number } = {};
    try {
      const bitmap = await createImageBitmap(file);
      dims = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
    } catch {
      /* Dimensions are optional; the renderer can still fit the image after decode. */
    }
    const entry = localAssetIndexEntry(asset, dims);
    const previous = localAssetIndexRef.current.find(
      (item) => item.assetId === entry.assetId,
    );
    changeLocalAssetIndex([
      { ...entry, createdAt: previous?.createdAt ?? entry.createdAt },
      ...localAssetIndexRef.current.filter((item) => item.assetId !== entry.assetId),
    ]);
    return localImageLocator(entry.contentSig);
  };
  /** DOM surgery on the index-th <img> in a custom block's innerHtml (swap src / remove) — same DOMParser patch approach as setSlot's text edit, zero-LLM, instant. */
  const patchCustomImg = (
    blockId: string,
    index: number,
    fn: (img: Element) => "remove" | void,
  ) =>
    (() => {
      const block = compRef.current.blocks.find(
        (candidate) => candidate.id === blockId,
      );
      if (!block || block.templateId !== "custom") return;
      const inner = String(
        (block.slots as { innerHtml?: unknown }).innerHtml ?? "",
      );
      try {
        const doc = new DOMParser().parseFromString(
          `<div id="__hfw">${inner}</div>`,
          "text/html",
        );
        const host = doc.getElementById("__hfw");
        const img = host?.querySelectorAll("img")[index];
        if (!host || !img) return;
        if (fn(img) === "remove") img.remove();
        patchOverlays([
          {
            clipId: blockId,
            block: { slots: { ...block.slots, innerHtml: host.innerHTML } },
          },
        ]);
      } catch {
        return;
      }
    })();
  /** Image toolbar "swap image": pick file → OPFS → only swap src, layout/animation unchanged. */
  const replaceCustomImg = async (blockId: string, index: number) => {
    const f = await pickFile("image/*");
    if (!f) return;
    setMediaBusyPhase(blockId, "upload");
    try {
      const url = await preparePickedLocalImage(f);
      patchCustomImg(blockId, index, (img) => {
        img.setAttribute("src", url);
        img.removeAttribute("srcset");
      });
      setMediaBusyPhase(blockId, "swap");
    } catch (e) {
      setMediaBusyPhase(blockId, null);
      console.warn("[studio] replace slot image failed", e);
      toast.error(t("panels.imageUploadFailedTry"));
    }
  };
  /** Media block "replace": swap content of the same type (image↔image / video↔video), box/time-window/animation unchanged. */
  const replaceBlockMedia = async (bid: string) => {
    const b = compRef.current.blocks.find((x) => x.id === bid);
    const kind =
      (b?.slots.media as MediaRef | undefined)?.type === "video"
        ? "video"
        : "image";
    const f = await pickFile(kind === "image" ? "image/*" : "video/*");
    if (!f) return;
    setMediaBusyPhase(bid, "upload");
    try {
      const url =
        kind === "image"
          ? await preparePickedLocalImage(f)
          : await uploadVideoFile(f);
      setBlockMedia(bid, { type: kind, url });
      setMediaBusyPhase(bid, "swap");
      seekBlockSettled(bid);
    } catch (e) {
      setMediaBusyPhase(bid, null);
      console.warn("[studio] replace media failed", e);
      toast.error(
        kind === "image"
          ? t("panels.imageUploadFailedTry")
          : t("workbench.videoUploadFailed"),
      );
    }
  };
  /* ---------------- Insert actions for the asset library / component / frame panels ---------------- */

  const pushUndoSnapshot = () => {
    if (displacedRef.current) reclaimWritership(); // every mutation passes here → the edit-intent hook of the single-writer handover
    undoStackRef.current.push(editorDocumentRef.current);
    if (undoStackRef.current.length > UNDO_CAP) undoStackRef.current.shift();
    redoStackRef.current = []; // a new edit after undo → the old redo line no longer holds
  };
  /** Natural dimensions of a remote image (null if unavailable → use the default placeholder, doesn't block insert). */
  const imageDims = (url: string): Promise<{ w: number; h: number } | null> =>
    new Promise((res) => {
      const im = new Image();
      im.onload = () =>
        res(
          im.naturalWidth > 0 && im.naturalHeight > 0
            ? { w: im.naturalWidth, h: im.naturalHeight }
            : null,
        );
      im.onerror = () => res(null);
      im.src = url;
    });
  /** Natural dimensions of a remote video (metadata is enough, don't download the whole file; null if unavailable). */
  const videoDims = (url: string): Promise<{ w: number; h: number } | null> =>
    new Promise((res) => {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.muted = true;
      v.onloadedmetadata = () =>
        res(
          v.videoWidth > 0 && v.videoHeight > 0
            ? { w: v.videoWidth, h: v.videoHeight }
            : null,
        );
      v.onerror = () => res(null);
      v.src = url;
    });
  /** Measure aspect ratio before insert (single entry for image/video) so the loading placeholder area is the right ratio from the start, no jump.
   *  Images measure only a 400px thumbnail (same ratio, arrives in a few hundred ms) — never download a multi-MB original just to measure and stall the placeholder;
   *  videos read only metadata. 1.5s fallback: if it can't measure (slow/cross-origin/bad source), null → default box, never blocks the insert. */
  const mediaDims = (
    media: MediaRef,
  ): Promise<{ w: number; h: number } | null> =>
    Promise.race([
      media.type === "video"
        ? videoDims(media.url)
        : imageDims(imageThumb(media.url, "strip")),
      new Promise<null>((res) => setTimeout(() => res(null), 1500)),
    ]);
  /** Media block placeholder box: height set from natural aspect ratio (image/video alike, cover = contain, no crop, no letterbox).
   *  Initial PiP placement is clamped to the shared platform-safe area; later manual movement remains unrestricted. */
  const mediaBoxFor = (
    dims: { w: number; h: number } | null,
    center?: { x: number; y: number },
  ) => {
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
    return fitEditableBoxIntoSafeArea(
      { x: cx - w / 2, y: cy - h / 2, w, h },
      compRef.current.width,
      compRef.current.height,
    );
  };
  /** Panel media selected → insert a media-slot block (PiP) at the playhead, and select it for immediate drag/duration tuning.
   *  Measure image/video aspect ratio first, then land the block to scale — the loading placeholder is the right size from the start, no default-box-then-jump.
   *  knownDims: caller already knows the natural size (e.g. the upload masonry already has it) → use it directly, skipping the measure step.
   *  atSec: landing time when dropped on the timeline (default = playhead). */
  /** Media entering an overlay block: the sandboxed preview cannot resolve parent blob URLs and
   * blob refs die on refresh. Device-local images therefore persist a durable local locator and are
   * transferred to the preview only at runtime. Local videos belong on a media track. */
  const stageMediaOf = async (media: MediaRef & { sig?: string | null }): Promise<MediaRef | null> => {
    if (!media.url.startsWith("blob:")) return media;
    if (media.type === "video") {
      toast.info(t("workbench.localVideoUseTrack"));
      return null;
    }
    if (!media.sig) {
      toast.error(t("workbench.localAssetUnreachable"));
      return null;
    }
    // Keep private images device-local. The preview receives the File through postMessage and
    // export resolves the same durable locator from OPFS; project JSON never embeds image bytes.
    return { type: 'image', url: localImageLocator(media.sig) };
  };
  const insertPanelMedia = async (
    mediaIn: MediaRef,
    label?: string,
    atSec?: number,
    knownDims?: { w: number; h: number },
  ) => {
    const media = await stageMediaOf(mediaIn);
    if (!media) return;
    const startSec = Math.max(0, Math.round((atSec ?? tRef.current) * 10) / 10);
    const dur = media.type === "video" ? 5 : 3;
    const dims = knownDims ?? (await mediaDims(media)); // use ready dimensions if available, else measure (1.5s fallback null → default box)
    const base = mediaBlock({
      startSec,
      durationSec: dur,
      box: mediaBoxFor(dims),
      trackIndex: freeTrack(compRef.current.blocks, startSec, dur),
      label:
        label ||
        (media.type === "video"
          ? t("chatGen.videoClip")
          : t("workbench.graphic")),
    });
    const b: Block = { ...base, slots: { media } };
    const inserted = insertOverlayDocumentClip({
      document: editorDocumentRef.current,
      block: b,
    });
    if (!inserted.ok) {
      toast.error(editorErrorMessage(inserted.error));
      return;
    }
    pushUndoSnapshot();
    setEditorDocument(inserted.document);
    setMediaBusyPhase(b.id, "swap"); // URL ready, awaiting rebuild + CDN load to debut
    setSelectedShotId(null);
    setSelectedId(b.id);
    // Seek past the entry animation: +0.01 lands at the fade start, so the frame looks semi-transparent
    if (!playing)
      applyT(
        Math.max(0, startSec + Math.min(0.45, Math.max(0.01, dur - 0.06))),
      );
    toast.success(t("workbench.mediaInsertedDragReposition"));
  };
  /** Media being dragged out of the upload panel (the stage overlays a docking layer during the drag; the iframe swallows drop events). dims: known natural size, skip measuring on land. */
  const [dragAsset, setDragAsset] = useState<PanelDragAsset | null>(null);
  /** Measured line rect of the selected caption (hf:measure reply; w/h normalized + the scale at measure time) — the
   *  selection box hugs the real caption area, derived incrementally from style during drag, not re-measured (re-measure would wait for a rebuild). */
  const [capMeasure, setCapMeasure] = useState<{
    w: number;
    h: number;
    scale: number;
  } | null>(null);
  const [capSubMeasure, setCapSubMeasure] = useState<{
    w: number;
    h: number;
    scale: number;
  } | null>(null); // measured translation line (same mechanism as capMeasure)
  const [capSelPart, setCapSelPart] = useState<"main" | "sub">("main"); // caption selection target: clicking the main line = main, the translation line = sub; handles are separate
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
    postPreview({ type: "hf:measure", id: selCapId });
    postPreview({ type: "hf:measure", id: selCapId, sub: true }); // measure the translation line too (with no translation the iframe finds no element and simply doesn't reply)
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
    postPreview({ type: "hf:capEdit", id: null });
  }, [selCapId, playing, postPreview]);
  // Blank-page click clears the caption selection (per user): the stage, the timeline and the captions
  // panel are keep-zones (data-cap-keep) — a concrete caption chip on the timeline is the one place
  // that SETS caption selection outside the stage; everywhere else (page chrome, gutters) deselects.
  useEffect(() => {
    if (!selCapId) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("[data-cap-keep]")) return;
      setSelectedIdRaw(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selCapId]);
  // Ordinary component selection follows the same spatial rule as desktop editors: the canvas
  // and the selected timeline chip retain focus; clicking any other host-UI region clears it.
  // Events inside the iframe stay in its own document and therefore never reach this listener.
  useEffect(() => {
    if (!selectedId || selCapId) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-block-selection-keep]")) return;
      setSelectedId(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [selectedId, selCapId, setSelectedId]);
  /** Media dropped on the stage: hitting a component card (media block) present at the current moment = fill it; a miss = create a new component card centered on the drop point. */
  const handleAssetDrop = async (e: React.DragEvent) => {
    const a = dragAsset;
    setDragAsset(null);
    if (!a) return;
    if (a.type === "audio") {
      // Audio dropped on the stage: there's no visual placement for sound — mount as the bed from 0
      void audioOps.mountAudioFromUrl(a.url, a.label);
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    const tNow = tRef.current;
    const hit = compRef.current.blocks
      .filter(
        (b) =>
          b.box &&
          blockKind(b) === "media" &&
          tNow >= b.startSec - 1e-3 &&
          tNow < b.startSec + b.durationSec + 1e-3,
      )
      .filter(
        (b) =>
          nx >= b.box!.x &&
          nx <= b.box!.x + b.box!.w &&
          ny >= b.box!.y &&
          ny <= b.box!.y + b.box!.h,
      )
      .sort((x, y) => y.trackIndex - x.trackIndex)[0];
    // Components and images are dropped with equal standing (user-unified): hitting an empty component card = fill it
    // (via elementTargetRef; insertGeneratedElement only backfills after verifying "empty card"), a miss = insert (brings its own layout, ignores drop coords)
    if (a.type === "element") {
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
      const fillMedia = await stageMediaOf({ type: a.type, url: a.url, sig: a.sig });
      if (!fillMedia) return;
      setBlockMedia(hit.id, fillMedia);
      setMediaBusyPhase(hit.id, "swap");
      setSelectedShotId(null);
      setSelectedId(hit.id);
      toast.success(t("workbench.filledIntoElementCard"));
      return;
    }
    // Same as insertPanelMedia: measure aspect ratio first, then land the block to scale (centered on the drop point), so the loading placeholder is correct from the start
    const startSec = Math.max(0, Math.round(tNow * 10) / 10);
    const dur = a.type === "video" ? 5 : 3;
    const dims = a.dims ?? (await mediaDims({ type: a.type, url: a.url })); // if the drag carried dimensions, skip measuring
    const dropMedia = await stageMediaOf({ type: a.type, url: a.url, sig: a.sig });
    if (!dropMedia) return;
    const base = mediaBlock({
      startSec,
      durationSec: dur,
      box: mediaBoxFor(dims, { x: nx, y: ny }),
      trackIndex: freeTrack(compRef.current.blocks, startSec, dur),
      label: a.label,
    });
    const nb: Block = { ...base, slots: { media: dropMedia } };
    const inserted = insertOverlayDocumentClip({
      document: editorDocumentRef.current,
      block: nb,
    });
    if (!inserted.ok) {
      toast.error(editorErrorMessage(inserted.error));
      return;
    }
    pushUndoSnapshot();
    setEditorDocument(inserted.document);
    setMediaBusyPhase(nb.id, "swap");
    setSelectedShotId(null);
    setSelectedId(nb.id);
    toast.success(t("workbench.createdNewElementCard"));
  };
  /** Empty component block "upload": pick a file, and on success fill it into the block. */
  const uploadIntoBlock = async (id: string) => {
    const f = await pickFile("image/*,video/*");
    if (!f) return;
    const kind = f.type.startsWith("video/") ? "video" : "image";
    setMediaBusyPhase(id, "upload");
    try {
      const url =
        kind === "image"
          ? await preparePickedLocalImage(f)
          : await uploadVideoFile(f);
      setBlockMedia(id, { type: kind, url });
      setMediaBusyPhase(id, "swap");
      setSelectedId(id);
      seekBlockSettled(id);
    } catch (e) {
      setMediaBusyPhase(id, null);
      console.warn("[studio] upload into block failed", e);
      toast.error(t("panels.uploadFailedTryAgain"));
    }
  };
  /** Move the playhead to a block's stable frame after the entry animation: rests mid-entry so the content looks like it has "built-in transparency". */
  const seekBlockSettled = (id: string) => {
    const b = compRef.current.blocks.find((x) => x.id === id);
    if (!b || playingRef.current) return;
    applyT(
      Math.max(
        0,
        b.startSec +
          Math.min(
            Math.max(0.45, b.durationSec * 0.2),
            Math.max(0.01, b.durationSec - 0.06),
          ),
      ),
    );
  };
  /** Empty component block "AI generate": open the gen panel (component tab); when the output is inserted, prefer filling this empty block (elementTargetRef). */
  const elementTargetRef = useRef<string | null>(null);
  const aiFillBlock = (id: string) => {
    elementTargetRef.current = id;
    openGeneration("element");
    toast.info(t("workbench.afterGeneratingClickInsert"));
  };
  /** Template panel → insert a new block of that template at the playhead (default slot data, edit with AI after). */
  const insertTemplateBlock = (
    templateId: string,
    kitProps?: Record<string, unknown>,
  ) => {
    const startSec = Math.max(0, Math.round(tRef.current * 10) / 10);
    let base = newBlock(templateId, { startSec });
    if (templateId.startsWith("kit:")) {
      // Kit blocks: language-neutral sample props (defaults carry the design; the value/text is the only content),
      // a boxed default region, and enough duration for the staged entrance to read.
      // Props tuned in the preview lightbox win over the samples; duration matches the preview
      base = {
        ...base,
        slots: {
          ...base.slots,
          props: kitProps ?? kitSampleProps(templateId.slice(4)),
        },
        box: { ...defaultKitElementBox(templateId) },
        durationSec: KIT_INSERT_DURATION,
      };
    }
    const b = {
      ...base,
      trackIndex: freeTrack(
        compRef.current.blocks,
        base.startSec,
        base.durationSec,
        base.trackIndex,
      ),
    };
    const inserted = insertOverlayDocumentClip({
      document: editorDocumentRef.current,
      block: b,
    });
    if (!inserted.ok) {
      toast.error(editorErrorMessage(inserted.error));
      return;
    }
    pushUndoSnapshot();
    setEditorDocument(inserted.document);
    setSelectedShotId(null);
    setSelectedId(b.id);
    if (!playing) applyT(Math.max(0, startSec + 0.01));
    toast.success(
      t("workbench.insertedLabel", { label: t(b.label ?? templateId) }),
    );
  };

  /** Persistent UI text entry: insert a deterministic native text clip at the playhead, select it,
   * and hand off to the same Text panel used by Agent-created titles. */
  const insertDisplayText = (preset: DisplayTextPresetId = "clean") => {
    const startSec = Math.max(0, Math.round(tRef.current * 10) / 10);
    const durationSec = 3;
    const presetDefinition = displayTextPreset(preset);
    const block = titleBlock({
      text: t("displayText.defaultText"),
      startSec,
      durationSec,
      preset,
      animation: presetDefinition.defaultAnimation,
      color: "#FFFFFF",
      accentColor: "#FFD24D",
      trackIndex: freeTrack(compRef.current.blocks, startSec, durationSec, 2),
    });
    block.box = { x: 0.1, y: 0.36, w: 0.8, h: 0.22 };
    const inserted = insertOverlayDocumentClip({
      document: editorDocumentRef.current,
      block,
    });
    if (!inserted.ok) {
      toast.error(editorErrorMessage(inserted.error));
      return;
    }
    pushUndoSnapshot();
    setEditorDocument(inserted.document);
    setSelectedShotId(null);
    setSelectedId(block.id);
    setFloatWin(null);
    setLibTab("text");
    setLibCollapsed(false);
    if (!playing) applyT(Math.max(0, startSec + 0.01));
  };

  const patchDisplayText = (patch: DisplayTextPatch) => {
    if (!selectedDisplayTextBlock) return;
    const slots = { ...selectedDisplayTextBlock.slots, ...patch };
    const edit = applyOverlayDocumentEdits({
      document: editorDocumentRef.current,
      updates: [{
        clipId: selectedDisplayTextBlock.id,
        block: {
          slots,
          ...(typeof patch.text === "string"
            ? { label: patch.text.trim() || t("displayText.defaultText") }
            : {}),
        },
      }],
    });
    if (!edit.ok) {
      toast.error(editorErrorMessage(edit.error));
      return;
    }
    pushUndoSnapshot();
    setEditorDocument(edit.document);
  };
  /** Generated video → set as the main video. The CDN has no CORS headers, so fetch bytes through the /api/media/fetch same-origin proxy.
   *  Swapping the main video = a new project (pickVideoFile clears shots/blocks) — confirm first if there's content. */
  const setMainVideoFromUrl = async (url: string) => {
    const c = compRef.current;
    if (editorDocumentRenderPlan(editorDocumentRef.current).durationSec > 0) {
      const ok = await confirm({
        title: t("workbench.replaceMainVideo"),
        description: t("workbench.replacingMainVideoStarts"),
        confirmLabel: t("panels.replace"),
        tone: "danger",
      });
      if (!ok) return;
    }
    try {
      const materialized = await materializeRemoteMedia(url, {
        name: "generated.mp4",
        type: "video/mp4",
      });
      await pickVideoFile(materialized.file, { asSig: materialized.sig });
    } catch (e) {
      console.warn("[studio] set main video failed", e);
      toast.error(t("workbench.couldNotReplaceMain"));
    }
  };
  /** Frame panel "use" → attach the frame as a tag in chat (the request carries frameId to inject the playbook), switch back to chat. */
  const useFrameInChat = (f: FrameCatalogItem) => {
    openChat();
    chatRef.current?.attachFrame({
      id: f.id,
      title: f.title,
      icon: f.icon,
      iconKey: f.iconKey ?? null,
      ...(f.customVisualStyle
        ? { customVisualStyle: f.customVisualStyle }
        : {}),
    });
  };
  // Frame mounted (panel "use" / chat `/` trigger) → land the theme palette into comp:
  // compose's themeForLlm consumes comp.palette to inject the token table, so generated content follows the theme's palette/fonts/radius from then on.
  // Removing the tag doesn't roll back the palette (the project palette is explicit state; to revert to frame-derived colors, rerun visual analysis).
  const frameCatalogRef = useRef<FrameCatalogItem[]>([]);
  frameCatalogRef.current = useFrameCatalog();
  // onFrameApplied is defined before setPersonFx/runMatteForShot and has empty deps → read the latest instances via refs
  const setPersonFxRef = useRef<((fx: PersonFx | undefined) => void) | null>(
    null,
  );
  const runMatteForShotRef = useRef<((s: VideoShot) => Promise<void>) | null>(
    null,
  );
  const onFrameApplied = useCallback((af: AttachedFrame | null) => {
    if (!af) {
      if (genIdsRef.current.size) {
        toast.error(t("workbench.elementGeneratingThemeAfter"));
        return;
      }
      const appearance = applyEditorCommand(editorDocumentRef.current, {
        type: "appearance.patch",
        patch: {
          frameId: undefined,
          customVisualStyle: undefined,
          palette: undefined,
          captionStyle: undefined,
          personFx: undefined,
        },
      });
      if (appearance.ok) {
        setEditorDocument(appearance.document);
        toast.success(t("workbench.visualStyleDisabled"));
      } else {
        toast.error(editorErrorMessage(appearance.error));
      }
      return;
    }
    const f = frameCatalogRef.current.find((x) => x.id === af.id);
    if (af.customVisualStyle) {
      if (genIdsRef.current.size) {
        toast.error(t("workbench.elementGeneratingThemeAfter"));
        return;
      }
      const palette = customVisualStylePalette(
        af.customVisualStyle,
        f?.palette,
      );
      const appearance = applyEditorCommand(editorDocumentRef.current, {
        type: "appearance.patch",
        patch: {
          frameId: af.id,
          customVisualStyle: af.customVisualStyle,
          palette,
          captionStyle: customCaptionStyle(
            af.customVisualStyle,
            resolveCaptionStyle(compRef.current),
          ),
          personFx: undefined,
        },
      });
      if (appearance.ok) setEditorDocument(appearance.document);
      else {
        toast.error(editorErrorMessage(appearance.error));
        return;
      }
      const fx = f?.personFx ? personFxFromFrame(f.personFx) : null;
      if (fx) {
        setPersonFxRef.current?.(fx);
        const tNow = playhead.get();
        const nativeSpans = videoShotTimelineSpans(
          compRef.current.shots ?? [],
          videoPlacementsRef.current,
        );
        const sp =
          nativeSpans.find(
            (x) => tNow >= x.editedStart && tNow < x.editedEnd,
          ) ?? nativeSpans[0];
        const shot = sp?.clip;
        if (shot && !shot.personMatte) {
          commitNarrativePatches([
            { clipId: shot.id, patch: { properties: { personMatte: true } } },
          ]);
          void runMatteForShotRef.current?.(shot);
        }
      }
      toast.success(t("workbench.appliedTheme", { title: af.title }));
      return;
    }
    if (!f) return;
    // No theme switch while components are generating: each fill reads frameId when it starts, so a
    // mid-batch switch splits one batch across two themes (and two compose paths) — a dirty batch
    // that "insert freezes vars" then locks in. Same gate family as undo/redo-while-generating.
    if (genIdsRef.current.size) {
      toast.error(t("workbench.elementGeneratingThemeAfter"));
      return;
    }
    // Land palette + frameId together: palette drives the token layer, frameId gives compose the design-language brief
    const appearance = applyEditorCommand(editorDocumentRef.current, {
      type: "appearance.patch",
      patch: {
        frameId: f.id,
        customVisualStyle: undefined,
        ...(f.palette ? { palette: f.palette } : {}),
      },
    });
    if (appearance.ok) setEditorDocument(appearance.document);
    else {
      toast.error(editorErrorMessage(appearance.error));
      return;
    }
    // The theme declared a person recommendation (sticker theme: cut out the subject and add a sticker outline) → land it into comp.personFx too,
    // and enable matte for the shot at the playhead (finite segment, progress via the person panel; whole-video per-segment enabling belongs to the person panel)
    const fx = f.personFx ? personFxFromFrame(f.personFx) : null;
    if (fx) {
      setPersonFxRef.current?.(fx);
      const tNow = playhead.get();
      const nativeSpans = videoShotTimelineSpans(
        compRef.current.shots ?? [],
        videoPlacementsRef.current,
      );
      const sp =
        nativeSpans.find((x) => tNow >= x.editedStart && tNow < x.editedEnd) ??
        nativeSpans[0];
      const s = sp?.clip;
      if (s && !s.personMatte) {
        commitNarrativePatches([
          { clipId: s.id, patch: { properties: { personMatte: true } } },
        ]);
        void runMatteForShotRef.current?.(s);
      }
      toast.success(t("workbench.appliedThemePersonFx", { title: f.title }));
      return;
    }
    toast.success(t("workbench.appliedTheme", { title: f.title }));
  }, []);
  /** Global caption style (shared by the captions panel + canvas handles): patch merged onto the current effective style, applied uniformly to all sentence-level captions. */
  /* ---------------- Unified gen panel (one chat interaction for image/video/component) ---------------- */

  // Timeline block drag: move (clamped to [0, dur]) / trim both ends. Don't move a generating block (its time window was already fed to the worker)
  const moveBlock = (id: string, startSec: number) => {
    if (genLockToast(id)) return;
    const edit = applyOverlayDocumentEdits({
      document: editorDocumentRef.current,
      updates: [
        { clipId: id, startSec: Math.max(0, Math.round(startSec * 100) / 100) },
      ],
    });
    if (!edit.ok) {
      toast.error(editorErrorMessage(edit.error));
      return;
    }
    setEditorDocument(edit.document);
  };
  const resizeBlock = (id: string, startSec: number, durationSec: number) => {
    if (genLockToast(id)) return;
    const edit = applyOverlayDocumentEdits({
      document: editorDocumentRef.current,
      updates: [
        {
          clipId: id,
          startSec: Math.max(0, Math.round(startSec * 100) / 100),
          durationSec: Math.max(0.3, Math.round(durationSec * 100) / 100),
        },
      ],
    });
    if (!edit.ok) {
      toast.error(editorErrorMessage(edit.error));
      return;
    }
    setEditorDocument(edit.document);
  };
  const resizeCaption = (id: string, edge: "left" | "right", atSec: number) => {
    const edit = resizeManagedCaptionTiming(
      editorDocumentRef.current,
      id,
      edge,
      atSec,
    );
    if (!edit.ok) {
      toast.error(editorErrorMessage(edit.error));
      return;
    }
    if (edit.document === editorDocumentRef.current) return;
    pushUndoSnapshot();
    setEditorDocument(edit.document);
  };
  // Materialize the legacy pre-shots representation only. An explicit [] is a real empty track.
  const ensureShots = (c: Composition): VideoShot[] => videoTrackShots(c);

  // Audio tracks orchestration (upload/generate/clips/engine sync/export payload — see use-bgm.ts).
  // Called here (not earlier) because pushUndoSnapshot is a const — TDZ before its definition.
  const audioOps = useAudioTracks({
    projectId,
    comp,
    compRef,
    renderAudioTracks: renderComposition.audioTracks,
    visualMediaClips: supplementalVisuals,
    timelineDurationSec: renderPlan.durationSec,
    documentRef: editorDocumentRef,
    setDocument: setEditorDocument,
    videoFile,
    videoFileRef,
    videoSigRef,
    videoEngineRef,
    clipFilesRef,
    tRef,
    pickFile,
    backupMediaToCloud,
    pushUndoSnapshot,
  });
  audioExportRef.current = audioOps.audioForExport;
  /** Switch the rail to the audio settings tab (expanding the rail if the user had collapsed it). */
  const openAudioTab = () => {
    setFloatWin(null);
    setLibTab("audio");
    setLibCollapsed(false);
  };
  // Selected clip removed (undo, agent edit, delete) → drop the dangling selection
  useEffect(() => {
    if (
      selectedAudioId &&
      !(comp.audioTracks ?? []).some((c) => c.id === selectedAudioId)
    )
      setSelectedAudioId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comp.audioTracks]);
  useEffect(() => {
    if (!selectedVisualClipId) return;
    const exists = renderPlan.tracks.some(
      (track) =>
        track.type !== "audio" &&
        track.role !== "primaryNarrative" &&
        track.clips.some(
          (entry) =>
            entry.clipId === selectedVisualClipId && entry.clip.kind === "media",
        ),
    );
    if (!exists) setSelectedVisualClipId(null);
  }, [renderPlan, selectedVisualClipId]);
  // Narration denoise (bake/cache/dub/export substitution — see use-denoise.ts)
  const denoiseOps = useDenoise({
    comp,
    compRef,
    documentRef: editorDocumentRef,
    setDocument: setEditorDocument,
    videoFile,
    videoFileRef,
    videoSigRef,
    videoEngineRef,
    clipFilesRef,
    pushUndoSnapshot,
  });
  denoiseExportRef.current = denoiseOps.denoiseForExport;

  /** Editable caption lines for the captions panel, in edited-timeline order across all sources.
   *  Walk the shot spans; a sentence overlapping a span joins at that span's edited time; split shots
   *  sharing a sentence dedupe to the first occurrence. */

  /** Read a remote video's duration (metadata only). Streaming webm (MediaRecorder output) has duration=Infinity at
   *  the metadata stage: seek to a huge value to force the browser to compute the real duration (classic fix), 3s fallback.
   *  A just-uploaded URL may hit CDN propagation delay (first fetch 404): retry 2 more times, 1.2s apart. */

  const prepareNarrationRangeEdit = (
    ranges: { fromSec: number; toSec: number }[],
  ) =>
    applyNarrationDocumentEdit({
      projectId,
      document: editorDocumentRef.current,
      ranges,
      mainTranscript: asrRef.current,
      clipTranscripts: clipAsrRef.current,
    });
  const prepareNarrationClipRemoval = (clipIds: readonly string[]) =>
    removeNarrationClipsWithoutRipple({
      projectId,
      document: editorDocumentRef.current,
      clipIds,
      mainTranscript: asrRef.current,
      clipTranscripts: clipAsrRef.current,
    });

  /** Split the selected timeline clip(s) at the playhead. Selection owns the operation; track type does not. */
  const splitAtPlayhead = () => {
    const c = compRef.current;
    const audId = selectedAudioIdRef.current;
    if (audId) {
      const clip = (c.audioTracks ?? []).find((x) => x.id === audId);
      if (!clip) return;
      const split = audioOps.splitClip(audId, tRef.current, pushUndoSnapshot);
      if (!split.ok)
        toast.error(split.error ?? t("workbench.movePlayheadToSplitAudio"));
      return;
    }

    const selectedIds = selectedVisualClipIdRef.current
      ? [selectedVisualClipIdRef.current]
      : selectedBlockIdsRef.current.size
        ? [...selectedBlockIdsRef.current]
        : [...selectedShotIdsRef.current];
    if (!selectedIds.length) return;

    const current = editorDocumentRef.current;
    const atFrame = Math.round(tRef.current * current.canvas.fps);
    const primarySelected = selectedIds.some((clipId) =>
      current.timeline.tracks
        .find((track) => track.id === current.semantics.primaryNarrativeTrackId)
        ?.clips.some((clip) => clip.id === clipId),
    );
    if (primarySelected && splitBlockedByTransition(
      ensureShots(c),
      tRef.current,
      primaryNarrative.placements,
    )) {
      toast.error(t("workbench.removeTransitionToSplit"));
      return;
    }

    let next = current;
    let splitCount = 0;
    for (const clipId of selectedIds) {
      const track = next.timeline.tracks.find((candidate) =>
        candidate.clips.some(
          (clip) =>
            clip.id === clipId &&
            atFrame > clip.startFrame &&
            atFrame < clip.startFrame + clip.durationFrames,
        ),
      );
      // A linked partner may already have been split by an earlier selected clip. Clips that do
      // not cross the playhead are intentionally left unchanged, matching NLE multi-selection.
      if (!track) continue;
      const split = applyEditorCommand(next, {
        type: "clip.split",
        trackId: track.id,
        clipId,
        atFrame,
        includeLinked: true,
      });
      if (!split.ok) {
        toast.error(editorErrorMessage(split.error));
        return;
      }
      next = split.document;
      splitCount += 1;
    }
    if (!splitCount) {
      toast.error(t("workbench.movePlayheadToSplitSelection"));
      return;
    }
    pushUndoSnapshot();
    setEditorDocument(next);
  };
  /** Trim left / right: cut the source footage on the left/right of the playhead in the current shot, everything after
   *  shifts left, captions/effect blocks compress along with it. Native publication updates compRef synchronously, so sequential Agent trims cannot swallow the previous step. */
  const trimAtPlayhead = (
    side: "left" | "right",
  ): { ok: boolean; error?: string } => {
    const c = compRef.current;
    // Audio clip selected → trim ITS edge to the playhead (same math the lane handles use)
    const audId = selectedAudioIdRef.current;
    if (audId) {
      const clip = (c.audioTracks ?? []).find((x) => x.id === audId);
      if (!clip)
        return { ok: false, error: t("workbench.movePlayheadToTrimAudio") };
      const w = audioClipWindow(clip, totalDuration(c));
      if (tRef.current <= w.start + 0.05 || tRef.current >= w.end - 0.05) {
        toast.error(t("workbench.movePlayheadToTrimAudio"));
        return { ok: false, error: t("workbench.movePlayheadToTrimAudio") };
      }
      const edit = audioOps.patchClip(
        audId,
        audioTrimPatch(clip, side, tRef.current),
        pushUndoSnapshot,
      );
      if (!edit.ok) {
        toast.error(edit.error ?? t("workbench.movePlayheadToTrimAudio"));
        return { ok: false, error: edit.error };
      }
      return { ok: true };
    }
    if (!primaryNarrativeClips(editorDocumentRef.current).length)
      return { ok: false, error: t("workbench.noVideoYet") };
    const range = narrativeTrimRangeAtTimelineSecond(
      editorDocumentRef.current,
      tRef.current,
      side,
    );
    if (!range) {
      toast.error(t("workbench.movePlayheadToTrim"));
      return { ok: false, error: t("workbench.movePlayheadToTrim") };
    }
    const edit = prepareNarrationRangeEdit([range]);
    if (!edit.ok) {
      toast.error(editorErrorMessage(edit.error));
      return { ok: false, error: editorErrorMessage(edit.error) };
    }
    pushUndoSnapshot();
    setEditorDocument(edit.document);
    setSelectedShotId(null);
    applyT(range.fromSec); // playhead lands at the cut point
    return { ok: true };
  };
  /** Delete scene: ordinary deletes ripple; deleting the final video clip leaves independent
   *  graphic/audio tracks intact, so an empty primary track is useful rather than destructive. */
  const deleteShot = (sid: string): { ok: boolean; error?: string } => {
    const clips = primaryNarrativeClips(editorDocumentRef.current);
    const range = narrativeClipTimelineRange(editorDocumentRef.current, sid);
    if (!range) {
      toast.error(t("workbench.shotNotFound"));
      return { ok: false, error: t("workbench.shotNotFound") };
    }
    if (clips.length > 1) {
      const edit = prepareNarrationRangeEdit([range]);
      if (!edit.ok) {
        toast.error(editorErrorMessage(edit.error));
        return { ok: false, error: editorErrorMessage(edit.error) };
      }
      pushUndoSnapshot();
      setEditorDocument(edit.document);
    } else {
      // Emptying the primary lane intentionally preserves every independent sibling lane.
      const edit = prepareNarrationClipRemoval([sid]);
      if (!edit.ok) {
        toast.error(editorErrorMessage(edit.error));
        return { ok: false, error: editorErrorMessage(edit.error) };
      }
      pushUndoSnapshot();
      setEditorDocument(edit.document);
    }
    setSelectedShotId(null);
    applyT(range.fromSec);
    return { ok: true };
  };
  /** Bulk-delete multiple shots (multi-select). Delete from the final-cut end backward — removing a later shot doesn't
   *  affect an earlier shot's final-cut coords. Select-all empties only the primary track. */
  const deleteShots = (ids: Set<string>) => {
    const clips = primaryNarrativeClips(editorDocumentRef.current);
    const targets = clips
      .filter((clip) => ids.has(clip.id))
      .map((clip) => ({
        clip,
        range: narrativeClipTimelineRange(editorDocumentRef.current, clip.id)!,
      }))
      .sort((a, b) => b.range.fromSec - a.range.fromSec); // end first
    if (targets.length === 0) return;
    if (targets.length === 1) return deleteShot(targets[0]!.clip.id); // degrade to single delete (reuse guard/landing point)
    if (targets.length === clips.length) {
      const edit = prepareNarrationClipRemoval(
        targets.map((target) => target.clip.id),
      );
      if (!edit.ok) {
        toast.error(editorErrorMessage(edit.error));
        return;
      }
      pushUndoSnapshot();
      setEditorDocument(edit.document);
      setSelectedShotId(null);
      applyT(0);
      toast.success(t("workbench.deletedNScenes", { n: targets.length }));
      return;
    }
    const removedRanges = targets.map((target) => target.range);
    const firstStart = Math.min(...removedRanges.map((range) => range.fromSec));
    const edit = prepareNarrationRangeEdit(removedRanges);
    if (!edit.ok) {
      toast.error(editorErrorMessage(edit.error));
      return;
    }
    pushUndoSnapshot();
    setEditorDocument(edit.document);
    setSelectedShotId(null);
    applyT(Number.isFinite(firstStart) ? firstStart : 0);
    toast.success(t("workbench.deletedNScenes", { n: targets.length }));
  };
  /** Delete a SOURCE from the track (assets-panel delete): every shot cut from that source goes. Overlay
   *  blocks ripple while video remains; removing all video keeps independent tracks intact. Equal-footing: the first-loaded source
   *  gets no special treatment (src = null addresses it, even when its bytes are missing). One undo snapshot;
   *  blob URLs stay alive, so undo restores a playable track for
   *  this session (only the OPFS bytes are gone for good). */
  const deleteAssetSource = (src: string | null, sig?: string | null): boolean => {
    if (
      sig &&
      projectOutputs.outputsRef.current.inactive.some((output) => {
        if (output.videoSig === sig) return true;
        const assetIds = new Set(
          Object.values(output.document.assets)
            .filter((asset) => asset.locator.localSig === sig)
            .map((asset) => asset.id),
        );
        return assetIds.size > 0 && output.document.timeline.tracks.some((track) =>
          track.clips.some((clip) => 'assetId' in clip && typeof clip.assetId === 'string' && assetIds.has(clip.assetId)),
        );
      })
    ) {
      toast.error(t("panels.assetUsedByOtherOutput"));
      return false;
    }
    const isMain = src == null;
    const shots = ensureShots(compRef.current);
    const spans = clipSpans(shots)
      .filter((sp) => (isMain ? !sp.clip.src : sp.clip.src === src))
      .sort((a, b) => b.editedStart - a.editedStart); // end first: earlier spans' coords stay valid
    if (spans.length === 0 && !isMain) return true;
    const removedClipIds = new Set(spans.map((span) => span.clip.id));
    const primaryTrack = editorDocumentRef.current.timeline.tracks.find(
      (track) =>
        track.id ===
        editorDocumentRef.current.semantics.primaryNarrativeTrackId,
    );
    const deletedAssetIds = new Set(
      (primaryTrack?.clips ?? []).flatMap((clip) =>
        clip.kind === "narrative" && removedClipIds.has(clip.id)
          ? [clip.assetId]
          : [],
      ),
    );
    if (isMain && firstNarrativeAssetId(editorDocumentRef.current)) {
      deletedAssetIds.add(
        firstNarrativeAssetId(editorDocumentRef.current)!,
      );
    }
    const firstStart = spans.length ? spans[spans.length - 1]!.editedStart : 0;
    const common = {
      projectId,
      document: editorDocumentRef.current,
      mainTranscript: asrRef.current,
      clipTranscripts: clipAsrRef.current,
    };
    const edit =
      spans.length === shots.length
        ? removeNarrationClipsWithoutRipple({
            ...common,
            clipIds: spans.map((span) => span.clip.id),
          })
        : applyNarrationDocumentEdit({
            ...common,
            ranges: spans.map((span) => ({
              fromSec: span.editedStart,
              toSec: span.editedEnd,
            })),
          });
    if (!edit.ok) {
      toast.error(editorErrorMessage(edit.error));
      return false;
    }
    pushUndoSnapshot();
    const cleaned = pruneUnusedEditorAssets(edit.document, [
      ...deletedAssetIds,
    ]);
    setEditorDocument(cleaned.document);
    // Drop the source's cloud byte-rendezvous index too — otherwise the next boot resurrects the
    // deleted source from the R2 vault (loadLocalVideo miss → vault hit → source re-appears).
    const deadSigs = new Set(
      spans.map((sp) => sp.clip.srcSig).filter(Boolean) as string[],
    );
    if (cloudMediaRef.current.clips && deadSigs.size) {
      cloudMediaRef.current = {
        ...cloudMediaRef.current,
        clips: Object.fromEntries(
          Object.entries(cloudMediaRef.current.clips).filter(
            ([k]) => !deadSigs.has(k),
          ),
        ),
      };
    }
    if (isMain) {
      setVideoFile(null);
      videoSigRef.current = null;
      asrRef.current = null;
      setAsrSentences(null);
      visualRef.current = null;
      setVisual(null);
      if (cloudMediaRef.current.video)
        cloudMediaRef.current = { ...cloudMediaRef.current, video: undefined };
    }
    setSelectedShotId(null);
    setSelectedShotIds(new Set());
    applyT(Math.max(0, firstStart));
    return true;
  };
  /** Per-asset source liveness: are this source's bytes reachable in THIS session? Main = the loaded
   *  File; local clips = the held File map; remote URLs count as live (fetchable). Drives the panel's
   *  restore-card variant and the timeline's missing-source strip. */
  const srcLive = (src: string) => {
    return sourceRuntimeIsLive(src, {
      runtimeFileUrls: clipFilesRef.current,
    });
  };
  /** Per-asset reconnect (user gesture): handle/OPFS first (may prompt for permission), then the R2
   *  vault, then a manual re-pick verified against the sig. src = null targets the main source. */
  const reconnectSource = async (src: string | null, sig?: string | null) => {
    const indexedKind = sig
      ? localAssetIndexRef.current.find((entry) => entry.contentSig === sig)?.kind
      : undefined;
    let f = sig ? await loadLocalVideo(sig) : null;
    if (!f && sig) {
      const vaulted =
        src == null
          ? cloudMediaRef.current.video?.sig === sig
          : !!cloudMediaRef.current.clips?.[sig];
      if (vaulted) {
        const cf = await studioProviders().vault.fetch(sig);
        if (cf) f = alignFileToSig(cf, sig); // vault files carry their own name/mtime — realign or the identity drifts
      }
    }
    if (!f) {
      f = await pickFile(indexedKind === "image" ? "image/*" : "video/*");
      if (!f) return;
      if (sig && fileSig(f) !== sig) {
        toast.error(t("workbench.checksumMismatch"));
        return;
      }
    }
    if (src == null) {
      void pickVideoFile(f, {
        ...(sig ? { asSig: sig } : {}),
        reconnect: true,
      });
      return;
    }
    const sg = sig ?? fileSig(f);
    await reconnectIndexedSource(
      src,
      f,
      sg,
      indexedKind === "image" ? "image" : "video",
    );
  };
  /** Bulk-delete multiple component blocks (⌘ multi-select/marquee). The caption layer (pure computed product) and generating blocks are skipped; one undo snapshot. */
  const deleteBlocks = (ids: Set<string>) => {
    const targets = compRef.current.blocks.filter(
      (b) =>
        ids.has(b.id) && !isSentenceCaption(b) && !genIdsRef.current.has(b.id),
    );
    if (targets.length === 0) return;
    if (targets.length === 1) return removeBlock(targets[0]!.id); // degrade to single delete (reuse instant-remove/guard)
    const kill = new Set(targets.map((b) => b.id));
    const edit = removeOverlayDocumentClips({
      document: editorDocumentRef.current,
      clipIds: [...kill],
    });
    if (!edit.ok) {
      toast.error(editorErrorMessage(edit.error));
      return;
    }
    pushUndoSnapshot();
    for (const b of targets) postPreview({ type: "hf:remove", id: b.id }); // remove blocks from the frame instantly, don't wait for the debounced rebuild
    setEditorDocument(edit.document);
    setSelectedIdRaw(null);
    setSelectedBlockIds(new Set());
    toast.success(t("workbench.deletedNElements", { n: targets.length }));
  };
  const deleteVisualClip = (clipId: string) => {
    const track = editorDocumentRef.current.timeline.tracks.find(
      (candidate) =>
        candidate.type !== "audio" &&
        candidate.id !==
          editorDocumentRef.current.semantics.primaryNarrativeTrackId &&
        candidate.clips.some((clip) => clip.id === clipId),
    );
    if (!track) return;
    const removed = applyEditorCommand(editorDocumentRef.current, {
      type: "clips.remove",
      trackId: track.id,
      clipIds: [clipId],
      includeLinked: true,
    });
    if (!removed.ok) {
      toast.error(editorErrorMessage(removed.error));
      return;
    }
    const captions = applyEditorCommand(removed.document, {
      type: "captions.relay",
    });
    if (!captions.ok) {
      toast.error(editorErrorMessage(captions.error));
      return;
    }
    pushUndoSnapshot();
    setEditorDocument(captions.document);
    setSelectedVisualClipId(null);
  };
  const selectedShot =
    selectedCanvasMedia?.assetKind === "video"
      ? selectedCanvasMedia.settingsShot
      : null;

  // Shortcut context: these are per-render closures, the keydown listener mounts once and reads the latest via ref
  /** ⌘Z undo: pop the snapshot stack (same stack as the agent undo tool; same guard — no rollback while generating). */
  const undoLast = () => {
    if (genIdsRef.current.size) {
      toast.error(t("workbench.elementGeneratingUndoAfter"));
      return;
    }
    const stack = undoStackRef.current;
    while (
      stack.length &&
      stack[stack.length - 1] === editorDocumentRef.current
    )
      stack.pop();
    const prev = stack.pop();
    if (!prev) {
      toast.info(t("workbench.nothingUndo"));
      return;
    }
    redoStackRef.current.push(editorDocumentRef.current);
    setEditorDocument(prev);
    // Transcript caches are runtime mirrors of V2. A caption-copy undo must restore them from the
    // same snapshot immediately; otherwise the caption relay effect would write the newer text back
    // over the restored document on the next render.
    activateOutputDocumentRef.current(prev, compRef.current);
    setSelectedId(null);
    setSelectedShotId(null);
    setSelectedVisualClipId(null);
    toast.success(
      t("workbench.undone") +
        (stack.length
          ? t("workbench.nMoreUndoSteps", { n: stack.length })
          : ""),
    );
  };
  /** ⇧⌘Z redo: pop the redo stack (only undo feeds it; a new edit voids the whole line). Push directly to the undo stack, not via pushUndoSnapshot — that would clear the redo line. */
  const redoLast = () => {
    if (genIdsRef.current.size) {
      toast.error(t("workbench.elementGeneratingRedoAfter"));
      return;
    }
    const next = redoStackRef.current.pop();
    if (!next) {
      toast.info(t("workbench.nothingRedo"));
      return;
    }
    undoStackRef.current.push(editorDocumentRef.current);
    if (undoStackRef.current.length > UNDO_CAP) undoStackRef.current.shift();
    setEditorDocument(next);
    activateOutputDocumentRef.current(next, compRef.current);
    setSelectedId(null);
    setSelectedShotId(null);
    setSelectedVisualClipId(null);
    toast.success(
      t("workbench.redone") +
        (redoStackRef.current.length
          ? t("workbench.nMoreRedoSteps", { n: redoStackRef.current.length })
          : ""),
    );
  };
  keysRef.current = {
    removeBlock,
    deleteBlocks,
    deleteShot,
    deleteShots,
    deleteVisualClip,
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
  // Undo/redo button enabled state: every stack change comes with a document re-render, so refs have no visible lag.
  // A stack top sharing the same reference as the current comp is a no-op snapshot (undoLast skips it on pop), doesn't count as a step.
  const canUndo = (() => {
    const st = undoStackRef.current;
    let i = st.length - 1;
    while (i >= 0 && st[i] === editorDocument) i--;
    return i >= 0;
  })();
  const canRedo = redoStackRef.current.length > 0;

  /** Component surface background. undefined = transparent (clears the surface). */
  const setBlockBg = (id: string, bg: string | undefined) =>
    patchOverlays([{ clipId: id, block: { bg } }]);
  /** Component border color. undefined = no border. */
  const setBlockBorder = (id: string, border: string | undefined) =>
    patchOverlays([{ clipId: id, block: { border } }]);
  /** Component opacity (0–1). ≈1 clears it (back to default). */
  const setBlockOpacity = (id: string, v: number) =>
    patchOverlays([
      { clipId: id, block: { opacity: v >= 0.995 ? undefined : v } },
    ]);
  /** Component corner radius (comp px). 0 clears it (back to square/default). */
  const setBlockRadius = (id: string, v: number) =>
    patchOverlays([{ clipId: id, block: { radius: v > 0 ? v : undefined } }]);
  /** Component whole rotation (degrees). 0 clears it (back to upright). */
  const setBlockRotation = (id: string, v: number) =>
    patchOverlays([{ clipId: id, block: { rotation: v ? v : undefined } }]);
  /** Person-matte global config (person panel): undefined = all defaults. */
  const setPersonFx = (fx: PersonFx | undefined) => {
    // Instant: feather/stroke/background sent straight via hf:personFx to the matte shim (conversion matches assemble);
    // structural toggles (personFront layer order / first pipeline install) are picked up by the debounced rebuild
    const W = compRef.current.width;
    const featherPx =
      Math.round(
        (((Math.max(0, Math.min(100, fx?.feather ?? 0)) / 100) * W) / 45) * 10,
      ) / 10;
    const strokePx =
      fx?.stroke && fx.stroke.width > 0
        ? Math.max(
            1.2,
            ((Math.max(0, Math.min(100, fx.stroke.width)) / 100) * W) / 30,
          )
        : 0;
    const bg = fx?.bg
      ? fx.bg.type === "color"
        ? fx.bg.color
        : `#000 center/cover no-repeat url('${fx.bg.url}')`
      : null;
    postPreview({
      type: "hf:personFx",
      feather: featherPx,
      strokeW: strokePx,
      strokeStyle: fx?.stroke?.style ?? "solid",
      strokeColor: fx?.stroke?.color ?? "#ffffff",
      strokeAlpha: fx?.stroke?.opacity ?? 1,
      bg,
    });
    const command = applyEditorCommand(editorDocumentRef.current, {
      type: "appearance.patch",
      patch: { personFx: fx },
    });
    if (command.ok) setEditorDocument(command.document);
    else toast.error(editorErrorMessage(command.error));
  };
  setPersonFxRef.current = setPersonFx;
  /** Whether this range's (a source's) mask is mostly complete (≥80% of sample points have frames) — avoids re-running when the toggle is flipped again. */
  const matteCovered = useCallback(
    (key: string, from: number, to: number): boolean => {
      const track = matteTrackRef.current.get(key);
      if (!track?.length) return false;
      const expected = Math.max(1, Math.floor((to - from) * MATTE_FPS));
      let have = 0;
      for (const f of track)
        if (f.t >= from - 0.05 && f.t <= to + 0.05) have += 1;
      return have >= expected * 0.8;
    },
    [],
  );
  /** Budget a mask segment (progress to matteState; results merged into the corresponding track by **that source's** file time, overwriting old frames in the same segment). */
  const runMatteBatch = useCallback(
    async (job: {
      key: string;
      file: File;
      upTo: number;
      from: number;
      to: number;
    }) => {
      const { key, file, upTo, from, to } = job;
      matteAbortRef.current?.abort();
      const ab = new AbortController();
      matteAbortRef.current = ab;
      setMatteState({ status: "running", done: 0, total: 1 });
      try {
        const arr = await computeMatteTrack(
          file,
          upTo,
          (done, total) => setMatteState({ status: "running", done, total }),
          ab.signal,
          { from, to },
        );
        if (ab.signal.aborted) return;
        if (arr?.length) {
          const eps = 0.001;
          const kept = (matteTrackRef.current.get(key) ?? []).filter(
            (f) => f.t < from - eps || f.t > to + eps,
          );
          const merged = [...kept, ...arr].sort((a, b) => a.t - b.t);
          matteTrackRef.current.set(key, merged);
          setMatteState({
            status: "ready",
            done: merged.length,
            total: merged.length,
          });
        } else {
          setMatteState({ status: "error", done: 0, total: 0 });
        }
      } catch (e) {
        console.warn("[studio] person-matte precompute failed", e);
        if (!ab.signal.aborted)
          setMatteState({ status: "error", done: 0, total: 0 });
      }
    },
    [],
  );
  /** Locate a shot's matte source file (equal-standing: matte whichever segment's source is selected): narration source
   *  = main video File; other sources = clipFilesRef (local), remote URLs fetched-and-cached on the fly (also feeding the filmstrip/export). */
  const matteFileForShot = useCallback(
    async (
      s: VideoShot,
    ): Promise<{ key: string; file: File; upTo: number } | null> => {
      if (!s.src) {
        const f = videoFileRef.current;
        const dur = firstNarrativeDurationSec(editorDocumentRef.current);
        return f && dur ? { key: "main", file: f, upTo: dur } : null;
      }
      let f = clipFilesRef.current.get(s.src) ?? null;
      if (!f && !s.src.startsWith("blob:")) {
        try {
          f = (await materializeRemoteMedia(s.src, {
            name: "clip.mp4",
            type: "video/mp4",
            sig: s.srcSig,
          })).file;
          clipFilesRef.current.set(s.src, f);
        } catch {
          /* fallthrough */
        }
      }
      return f ? { key: s.src, file: f, upTo: s.srcEnd } : null;
    },
    [],
  );
  /** Run matte for a shot (only if frames are missing; clear error if the source file is unavailable). */
  const runMatteForShot = useCallback(
    async (s: VideoShot) => {
      const src = await matteFileForShot(s);
      if (!src) {
        toast.error(t("workbench.couldNotGetSource"));
        setMatteState({ status: "error", done: 0, total: 0 });
        return;
      }
      if (!matteCovered(src.key, s.srcStart, s.srcEnd))
        await runMatteBatch({
          key: src.key,
          file: src.file,
          upTo: src.upTo,
          from: s.srcStart,
          to: s.srcEnd,
        });
    },
    [matteFileForShot, matteCovered, runMatteBatch],
  );
  runMatteForShotRef.current = runMatteForShot;
  /** Toggle the selected shot's matte (per-segment, no auto-fill — only the enabled segment is computed; any source's segment works). */
  const toggleShotMatte = useCallback(
    (on: boolean) => {
      const sid = selectedShotIdRef.current;
      if (!sid) return;
      commitNarrativePatches([
        {
          clipId: sid,
          patch: { properties: { personMatte: on || undefined } },
        },
      ]);
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
    if (floatWin !== "script" && !captionsOn) return;
    for (const shot of (comp.shots ?? []).filter((s) => s.src)) {
      const src = shot.src!;
      if (
        clipAsrRef.current[src] ||
        clipAsrBusyRef.current.has(src) ||
        clipAsrFailRef.current.has(src)
      )
        continue;
      clipAsrBusyRef.current.add(src);
      void (async () => {
        try {
          const got = await matteFileForShot(shot); // same source-file location: local = clipFilesRef, remote fetched-and-cached on the fly
          if (!got) {
            clipAsrFailRef.current.add(src);
            return;
          }
          const segs = await studioProviders().transcriber.transcribe(got.file, { projectId });
          setClipAsr((m) => ({ ...m, [src]: segs }));
          clipAsrRef.current = { ...clipAsrRef.current, [src]: segs }; // mirror immediately: the re-lay below needs to read it
          // The native caption derivation effect observes clipAsr and relays this source atomically.
        } catch (e) {
          console.warn("[studio] clip transcribe failed", e);
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
      matteTrackRef.current.delete("main");
      setMatteState({ status: "idle", done: 0, total: 0 });
    };
  }, [videoFile]);
  // Border quick colors: theme accent first, white/black fallback
  const borderSwatches: [string, string][] = (() => {
    const raw: [string, string][] = [];
    if (comp.palette?.accent)
      raw.push(["panels.themeAccent", comp.palette.accent]);
    raw.push(["panels.white", "#ffffff"], ["panels.black", "#101114"]);
    const seen = new Set<string>();
    return raw.filter(
      ([, v]) =>
        !seen.has(v.toLowerCase()) && (seen.add(v.toLowerCase()), true),
    );
  })();
  // Background quick colors: theme palette paper/panel first (same language as the frame), white/black fallback; dedup same colors.
  // Theme colors default to 90% opacity — components sit over the video, and a fully opaque base blots out the whole frame; for a solid color use white/black or custom.
  const glass = (hex: string) =>
    /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}e6` : hex;
  const bgSwatches = (() => {
    const raw: [string, string][] = [];
    if (comp.palette?.paper)
      raw.push(["panels.themePaper", glass(comp.palette.paper)]);
    if (comp.palette?.panel)
      raw.push(["workbench.themePanel", glass(comp.palette.panel)]);
    raw.push(["panels.white", "#ffffff"], ["panels.black", "#101114"]);
    const seen = new Set<string>();
    return raw.filter(
      ([, v]) =>
        !seen.has(v.toLowerCase()) && (seen.add(v.toLowerCase()), true),
    );
  })();
  // Agent-facing context (roster / situation snapshot / transcript) — see use-agent-context.ts.
  const getActiveOutputForAgent = () => {
    const current = projectOutputs.outputsRef.current;
    const ordered = [current.active, ...current.inactive].sort(
      (a, b) => a.order - b.order || a.createdAt - b.createdAt,
    );
    const position =
      Math.max(
        0,
        ordered.findIndex((output) => output.id === current.active.id),
      ) + 1;
    return {
      id: current.active.id,
      title: current.active.title || t("workbench.untitledOutput"),
      position,
      total: ordered.length,
    };
  };
  const {
    chatElements,
    getChatBody,
    transcriptForAgent,
    ensureClipTranscripts,
  } = useAgentContext({
    comp,
    compRef,
    documentRef: editorDocumentRef,
    selectedIdRef,
    selectedShotIdRef,
    tRef,
    asrRef,
    visualRef,
    videoSigRef,
    videoFileRef,
    clipAsrRef,
    clipAsrBusyRef,
    clipAsrFailRef,
    setClipAsr,
    matteFileForShot,
    getActiveOutput: getActiveOutputForAgent,
  });
  const chatMentionElements = useMemo<StudioElementRef[]>(
    () => buildChatMentionElements(localAssetIndexRef.current, chatElements),
    // The metadata array lives in a ref; this revision is its intentional render signal.
    [chatElements, localAssetIndexRev],
  );
  // Live comp accessor for chat receipt previews: stable identity (StudioChat is memo'd), reads the ref —
  // the chat card re-renders off the tool-progress store, not off comp state.
  const getChatComp = useCallback(() => compRef.current, [compRef]);
  const captureTimelineFrameAt = useCallback(
    async (atSec: number) => {
      const document = editorDocumentRef.current;
      const plan = editorDocumentRenderPlan(document, { resolveAssetUrl });
      const primary = primaryNarrativeRenderPlan(plan);
      return captureCompositionFrame({
        comp: compositionRenderView(compRef.current, plan),
        videoPlacements: primary.activePlacements,
        primaryVisualHidden: primary.hidden,
        visualMediaClips: supplementalVisualMedia(plan),
        timelineDurationSec: plan.durationSec,
        videoFile: videoFileRef.current,
        clipFiles: clipFilesRef.current,
        atSec,
        maxDim: 640,
      });
    },
    [compRef, editorDocumentRef, resolveAssetUrl],
  );
  const setTimelineFramePickMode = useCallback(
    (active: boolean) => {
      if (!active) {
        restoreChatAfterTimelineFramePick();
        return;
      }
      if (active && playingRef.current) setPlaying(false);
      const shouldCollapse = shouldCollapseChatForTimelineFramePick(
        window.innerWidth,
        panelW,
      );
      timelineFramePickAutoClosedChatRef.current = shouldCollapse;
      if (shouldCollapse) setPanelOpen(false);
      setTimelineFramePickActive(true);
    },
    [panelW, restoreChatAfterTimelineFramePick],
  );
  const pickTimelineFrame = useCallback(
    async (atSec: number) => {
      const document = editorDocumentRef.current;
      const plan = editorDocumentRenderPlan(document, { resolveAssetUrl });
      const fps = Math.max(1, document.canvas.fps);
      if (plan.durationSec <= 0) return;
      const exactAt = quantizeTimelineFrameSecond(atSec, plan.durationSec, fps);
      const frameId = `timeline-frame-${Date.now()}`;
      restoreChatAfterTimelineFramePick();
      setTimelineFramePickBusy(true);
      applyT(exactAt);
      chatRef.current?.beginTimelineFrameCapture({
        id: frameId,
        atSec: exactAt,
        fps,
      });
      try {
        const frame = await captureTimelineFrameAt(exactAt);
        chatRef.current?.resolveTimelineFrameCapture({
          id: frameId,
          atSec: exactAt,
          fps,
          ...frame,
        });
      } catch {
        chatRef.current?.failTimelineFrameCapture(frameId);
        toast.error(t("chatGen.timelineFrameCaptureFailed"));
      } finally {
        setTimelineFramePickBusy(false);
      }
    },
    [
      applyT,
      captureTimelineFrameAt,
      editorDocumentRef,
      resolveAssetUrl,
      restoreChatAfterTimelineFramePick,
    ],
  );

  /** Client-side execution of a tool call: mutate Composition state / call compose to generate a block.
   *  Not memoized — StudioChat holds the latest reference via ref, rebuilt each frame to guarantee reading the latest state/closures. */
  // Agent tool dispatcher (chat + external MCP bridge) — see agent-tool-runner.ts. The ctx hands it the latest
  // refs/setters/handlers; rebuilding it every render is intentional (tool bodies read the latest state via refs).
  // Caption ops (style / line edits / preset re-lay / bilingual) — see use-captions-ops.ts. runTool goes through a
  // ref because the dispatcher ctx below needs the hook's outputs first (the tools only run from async handlers).
  const runToolRef = useRef<
    (
      toolId: string,
      input: Record<string, unknown>,
    ) => Promise<StudioToolResult>
  >(() =>
    Promise.resolve({ ok: false, error: t("editorError.operationFailed") }),
  );
  const {
    setCaptionStyle,
    mappedCaptionSegs,
    relayCaptionLayer,
    captionLineRows,
    captionsPanelProps,
    applyCaptionPreset,
    relayoutCaptions,
    removeCaptionLayer,
  } = useCaptionsOps({
    comp,
    tSec,
    asrSentences,
    clipAsr,
    setClipAsr,
    setAsrSentences,
    setSelectedIdRaw,
    setSelectedBlockIds,
    setPlaying,
    compRef,
    clipAsrRef,
    asrRef,
    videoFileRef,
    playingRef,
    tRef,
    documentRef: editorDocumentRef,
    setDocument: setEditorDocument,
    ensureShots,
    stepAsr,
    refreshAsr,
    ensureClipTranscripts,
    pushUndoSnapshot,
    postPreview,
    applyT,
    runTool: (toolId, input) => runToolRef.current(toolId, input),
  });
  /** Repair pass for transcripts cue-split at extraction (a short-lived scheme): merge cue segments
   *  back into sentences on load — display cues are DERIVED at lay time now (displayCues), the
   *  persisted transcript stays sentence-granular. Idempotent; then re-lay so blocks re-derive. */
  const migrateTranscriptCues = useCallback(() => {
    if (asrRef.current?.some((s) => s.cue)) {
      asrRef.current = desegmentCues(asrRef.current);
      setAsrSentences(asrRef.current);
    }
    for (const [src, segs] of Object.entries(clipAsrRef.current)) {
      if (!segs.some((s) => s.cue)) continue;
      const m = { ...clipAsrRef.current, [src]: desegmentCues(segs) };
      clipAsrRef.current = m;
      setClipAsr(m);
    }
    // Transcript state updates trigger the native caption derivation effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Clip insertion (multi-source main track) — see use-clip-insert.ts. Same runTool ref indirection as captions.
  const {
    videoDurationOf,
    insertClipCore,
    recoverLocalClips,
    reconnectIndexedSource,
    insertLibraryClipAt,
    clipPending,
    clipStrips,
    resetRuntime: resetClipRuntime,
  } = useClipInsert({
    projectId,
    compRef,
    clipFilesRef,
    cloudMediaRef,
    clipAsrRef,
    documentRef: editorDocumentRef,
    localAssetIndexRef,
    setDocument: setEditorDocument,
    rememberAssetUrl,
    setSelectedId,
    setSelectedShotId,
    applyT,
    pushUndoSnapshot,
    ensureClipTranscripts,
    backupMediaToCloud,
    runTool: (toolId, input) => runToolRef.current(toolId, input),
    filmstripDemand: timelineFilmstripDemand,
  });
  const resetForOutputChange = useCallback(() => {
    setPlaying(false);
    restoreChatAfterTimelineFramePick();
    videoEngineRef.current?.pause();
    setSelectedId(null);
    setSelectedShotId(null);
    setSelectedVisualClipId(null);
    setSelectedAudioId(null);
    setCodeBlockId(null);
    setFloatWinRaw(null);
    undoStackRef.current = [];
    redoStackRef.current = [];
    chatRef.current?.clearElementPills();
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    for (const url of clipFilesRef.current.keys()) {
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    }
    clipFilesRef.current.clear();
    resetClipRuntime();
    audioOps.resetRuntime();
    filmstripGenRef.current += 1;
    setFilmstrip((previous) => {
      previous.forEach((frame) => URL.revokeObjectURL(frame.url));
      return [];
    });
    for (const url of localImagePreviewUrlsRef.current.values()) URL.revokeObjectURL(url);
    localImagePreviewUrlsRef.current.clear();
    setLocalImagePreviewUrls(new Map());
    localRuntimeGenerationRef.current += 1;
    localRuntimePreparingRef.current.clear();
    localRuntimeReadyAssetIdsRef.current.clear();
    clearRuntimeAssetUrls();
    tRef.current = 0;
    playhead.set(0);
    setT(0);
  }, [audioOps, clearRuntimeAssetUrls, resetClipRuntime, restoreChatAfterTimelineFramePick, setSelectedId, setSelectedShotId]);
  const outputRuntime = useProjectOutputRuntime({
    projectId,
    getActiveId: () => projectOutputs.outputsRef.current.active.id,
    switchTo: projectOutputs.switchTo,
    create: projectOutputs.create,
    listOutputIds: () =>
      [
        projectOutputs.outputsRef.current.active,
        ...projectOutputs.outputsRef.current.inactive,
      ]
        .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
        .map((output) => output.id),
    remove: projectOutputs.remove,
    setDocument: setEditorDocument,
    getComposition: () => compRef.current,
    onDocumentActivated: (document, composition) =>
      activateOutputDocumentRef.current(document, composition),
    videoFileRef,
    videoSigRef,
    coverThumbRef,
    pendingRestoreRef,
    setVideoFile,
    pickVideoFile,
    fetchCloudMedia: async (sig, cloudKey) => {
      const vaulted = cloudMediaRef.current.video?.sig === sig
        || Boolean(cloudMediaRef.current.clips?.[sig]);
      return vaulted || cloudKey ? studioProviders().vault.fetch(sig) : null;
    },
    recoverLocalClips,
    resetEditor: resetForOutputChange,
  });
  const outputTabs = [
    {
      ...projectOutputs.outputs.active,
      coverThumb: hasCoverVisual ? coverThumbRef.current : null,
      durationSec: totalDuration(comp) || comp.video?.durationSec || null,
      canvasWidth: editorDocument.canvas.width,
      canvasHeight: editorDocument.canvas.height,
    },
    ...projectOutputs.outputs.inactive.map((output) => ({
      ...output,
      durationSec:
        editorDocumentRenderPlan(output.document).durationSec ||
        output.videoDurationSec,
      canvasWidth: output.document.canvas.width,
      canvasHeight: output.document.canvas.height,
    })),
  ].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  const switchOutput = (id: string) => {
    void outputRuntime.switchOutput(id);
  };
  const createOutput = () => {
    outputRuntime.createOutput("");
  };
  const requestDeleteOutput = (id: string) => {
    const output = outputTabs.find((item) => item.id === id);
    if (!output || outputTabs.length <= 1) return;
    const title = output.title || t("workbench.untitledOutput");
    void (async () => {
      const ok = await confirm({
        title: t("workbench.deleteOutputConfirmTitle"),
        description: t("workbench.deleteOutputConfirmDescription", { title }),
        confirmLabel: t("workbench.deleteOutput"),
        tone: "danger",
      });
      if (ok) await outputRuntime.deleteOutput(id);
    })();
  };
  // Element generation / block element ops (gen panel, floating toolbar) — see use-element-ops.ts.
  const {
    generateElementStandalone,
    insertGeneratedElement,
    bumpBlockLayer,
    togglePersonLayer,
    saveBlockAsElement,
    syncBlockContent,
    syncBusyId,
    mentionAsset,
  } = useElementOps({
    projectId,
    playing,
    compRef,
    tRef,
    asrRef,
    elementTargetRef,
    chatRef,
    documentRef: editorDocumentRef,
    setDocument: setEditorDocument,
    setSelectedId,
    setSelectedShotId,
    setPendingInsert,
    setGenRefreshTick,
    applyT,
    pushUndoSnapshot,
    ensureShots,
    mappedCaptionSegs,
    composeBlockChecked,
    insertKitBlock: insertTemplateBlock,
    openChat,
  });
  // Stage box-drag handlers (edge/corner/grip/rotate, ghost semantics) — see use-box-drag.ts.
  const {
    edgeDrag,
    scaleDrag,
    gripDrag,
    rotateDrag,
    canvasGripDrag,
    canvasScaleDrag,
    canvasEdgeDrag,
  } = useBoxDrag({
    fit,
    compRef,
    genIdsRef,
    stageBoxRef,
    rotateOverlayRef,
    rotateLabelRef,
    dragCursorRef,
    setBodyDragging,
    setGhostRect,
    setGuideVis,
    documentRef: editorDocumentRef,
    setDocument: setEditorDocument,
    postPreview,
    setBlockRotation,
  });
  // Script-panel scissors (cut/restore/replace-word/extract) — see use-script-cut.ts.
  const {
    cutSrcRanges,
    cutTimelineRanges,
    restoreSrcRanges,
    replaceScriptWord,
    replaceTimelineScriptWord,
    extractForScript,
    asrBusy,
  } = useScriptCut({
    projectId,
    comp,
    document: editorDocument,
    floatWin,
    asrSentences,
    compRef,
    tRef,
    asrRef,
    clipAsrRef,
    setClipAsr,
    setAsrSentences,
    documentRef: editorDocumentRef,
    setDocument: setEditorDocument,
    setSelectedId,
    setSelectedShotId,
    applyT,
    pushUndoSnapshot,
    ensureShots,
    stepAsr,
  });
  const dominantScriptTrack = dominantTimelineSpeechTrack(editorDocument);
  const useNativeScriptPanel = !primaryNarrativeClips(editorDocument).length
    || (!!dominantScriptTrack && dominantScriptTrack.trackId !== editorDocument.semantics.primaryNarrativeTrackId);
  const registerLocalAsset = (entry: LocalAssetIndexEntry) => {
    const previous = localAssetIndexRef.current.find(
      (item) => item.assetId === entry.assetId,
    );
    changeLocalAssetIndex([
      { ...entry, createdAt: previous?.createdAt ?? entry.createdAt },
      ...localAssetIndexRef.current.filter((item) => item.assetId !== entry.assetId),
    ]);
  };
  const listProjectOutputsForAgent = () => {
    const liveOutputs = projectOutputs.outputsRef.current;
    const liveComposition = compRef.current;
    return [
      {
        ...liveOutputs.active,
        durationSec: totalDuration(liveComposition) || liveComposition.video?.durationSec || null,
      },
      ...liveOutputs.inactive.map((output) => ({
        ...output,
        durationSec:
          editorDocumentRenderPlan(output.document).durationSec ||
          output.videoDurationSec,
      })),
    ]
      .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
      .map((output, index) => ({
        id: output.id,
        position: index + 1,
        title: output.title || t("workbench.untitledOutput"),
        active: output.id === liveOutputs.active.id,
        durationSec: output.durationSec,
        ...(output.skill ? { skill: output.skill } : {}),
      }));
  };
  const createProjectOutputForAgent = (title: string, skill?: string) => {
    const created = outputRuntime.createOutput(title, skill);
    return { id: created.id, title: created.title || title };
  };
  const duplicateProjectOutputForAgent = (title: string) => {
    const duplicated = projectOutputs.duplicate(title);
    return { id: duplicated.id, title: duplicated.title || title };
  };
  const renameProjectOutputForAgent = (id: string, title: string) => {
    if (!projectOutputs.resolve({ id }, false)) return false;
    projectOutputs.rename(id, title);
    return true;
  };
  const deleteProjectOutputForAgent = (id: string) =>
    outputRuntime.deleteOutput(id);
  const switchProjectOutputForAgent = async (id: string) => {
    if (id === projectOutputs.outputsRef.current.active.id) return true;
    const switched = await outputRuntime.switchOutput(id);
    return switched && projectOutputs.outputsRef.current.active.id === id;
  };
  const agentToolCtx: AgentToolCtx = {
    projectId,
    documentRef: editorDocumentRef,
    resolveAssetUrl,
    prepareLocalAssetRuntime,
    setDocument: setEditorDocument,
    listProjectOutputs: listProjectOutputsForAgent,
    resolveProjectOutput: projectOutputs.resolve,
    createProjectOutput: createProjectOutputForAgent,
    duplicateProjectOutput: duplicateProjectOutputForAgent,
    switchProjectOutput: switchProjectOutputForAgent,
    renameProjectOutput: renameProjectOutputForAgent,
    deleteProjectOutput: deleteProjectOutputForAgent,
    compRef,
    ensureShots,
    setSelectedId,
    setSelectedShotId,
    selectedIdRef,
    applyT,
    tRef,
    playStopAtRef,
    playingRef,
    setPlaying,
    seekBlockSettled,
    postPreview,
    pushUndoSnapshot,
    undoStackRef,
    redoStackRef,
    genIdsRef,
    markGenerating,
    videoFileRef,
    clipFilesRef,
    asrRef,
    setAsrSentences,
    clipAsrRef,
    setClipAsr,
    localTranscriptCacheRef,
    currentVideo,
    pickVideoFile,
    registerLocalAsset,
    localAssetIndexRef,
    ensureClipTranscripts,
    transcriptForAgent,
    stepAsr,
    stepVisual,
    visualRef,
    visualBriefRef,
    applyVisualResult,
    composeBlockChecked,
    noteOf,
    setCutTransition,
    resizeCutTransition,
    splitAtPlayhead,
    trimAtPlayhead,
    deleteShot,
    audioMount: audioOps.mountAudioFile,
    audioPatch: audioOps.patchClip,
    audioRemove: audioOps.removeClip,
    audioRemoveMany: audioOps.removeClips,
    audioSplit: audioOps.splitClip,
    setDenoise: denoiseOps.setDenoise,
    videoDurationOf,
    insertClipCore,
    setCaptionStyle,
    applyCaptionPreset,
    relayoutCaptions,
    removeCaptionLayer,
    agentExportRef,
    exportPctRef,
    exportVideo,
    frameCatalogRef,
    chatRef,
  };
  const persistToolMutation = async (
    pending: Promise<StudioToolResult>,
  ): Promise<StudioToolResult> => {
    const result = await pending;
    const data = result.data && typeof result.data === "object"
      ? (result.data as Record<string, unknown>)
      : null;
    if (!result.ok || !data?.delta) return result;
    // A successful tool receipt is allowed to drive the assistant's "done" response. Push the
    // matching document revision now instead of leaving it in the generic 1.2s UI debounce tail;
    // otherwise a refresh/window takeover can persist the chat while losing the timeline edit.
    const queue = cloudSaveQueueRef.current;
    if (queue) {
      queue.markDirty();
      await queue.flush();
    }
    return result;
  };
  const runStudioTool = (
    toolId: string,
    input: Record<string, unknown>,
    opts?: { signal?: AbortSignal; surface?: "chat" | "bridge"; skillId?: string },
  ) => (toolId === "run_v3"
    // v3 surface from the chat: same executor as the external bridge, with the chat surface carried in the input
    // so parked interactions (ask_user / approvals) render as chat cards.
    ? persistToolMutation(runAgentExternalTool(agentToolCtx, "run_v3", { ...input, surface: opts?.surface ?? "chat" }))
    : persistToolMutation(runAgentStudioTool(agentToolCtx, toolId, input, opts)));
  runToolRef.current = runStudioTool; // break the hook↔dispatcher cycle (assigned every render before any handler can fire)
  const runExternalTool = (tool: string, input: Record<string, unknown>) =>
    persistToolMutation(runAgentExternalTool(agentToolCtx, tool, input));

  // External agent bridge (Codex/Claude Code/any MCP client via /api/studio/mcp → StudioBridge DO → this tab):
  // the exact same execution surface as the internal chat + BYO-only operations; get_state returns the same situation snapshot as chat.
  const agentBridge = useAgentBridge({
    runTool: runExternalTool,
    projectId,
    // LIVE header names the project this tab edits: an agent that switch_project'd for offline work must not
    // assume the bridge follows — bridge tools always hit the OPEN tab. The id line lets it detect the mismatch.
    getState: () => {
      const outputs = listProjectOutputsForAgent();
      const activeOutput = outputs.find((output) => output.active)!;
      return `<composition_state>\nLIVE — the studio tab is open on project ${projectId}; bridge tools edit THIS project (switch_project only retargets OFFLINE mode).\nActive output: #${activeOutput.position} · ${activeOutput.id} · ${activeOutput.title} (${outputs.length} total; use list_outputs/switch_output for deliverables).\n${buildSituation(getChatBody() as ChatSituation)}\n</composition_state>`;
    },
    onDisplaced: () => {
      if (displacedRef.current) return;
      displacedRef.current = true;
      setDisplaced(true);
      // flush-on-evict: push the debounce tail with our still-valid baseVersion BEFORE going
      // read-only — serialized behind any in-flight save. A conflict here means the taker
      // already wrote; ours is the stale one, drop it (no rebase-retry for non-writers).
      const payload = buildCloudPayload();
      if (payload) {
        cloudSaveChainRef.current = cloudSaveChainRef.current.then(async () => {
          const result = await studioProviders()
            .projects.save(projectId, payload)
            .catch(() => "skip" as const);
          if (result === "migration-required") blockForDocumentMigration();
        });
      }
      toast.info(t("workbench.displacedByAnotherWindow"));
    },
    onExternalCall: (tool, result) => {
      if (tool === "get_state" || tool === "compose_context") return; // pure queries don't interrupt
      const EXTERNAL_LABELS: Record<string, string> = {
        apply_block: "workbench.externalBlockApply",
      };
      const label = t(
        STUDIO_TOOL_MAP[tool]?.label ?? EXTERNAL_LABELS[tool] ?? tool,
      );
      if (result.ok)
        toast.info(
          result.summary
            ? t("workbench.externalAgentLabelSummary", {
                label,
                summary: result.summary,
              })
            : t("workbench.externalAgentLabel", { label }),
        );
      else
        toast.error(
          t("workbench.externalAgentLabelFailed", {
            label,
            error: result.error ?? t("workbench.unknownError"),
          }),
        );
    },
  });
  bridgeReclaimRef.current = agentBridge.reclaim;

  /** Cloud-sync payload from the live refs (shared by the debounced autosave and flush-on-evict). */
  function buildCloudPayload(): ProjectSavePayload | null {
    const c = compRef.current;
    if (!projectId) return null;
    const hasContent = hasTimelineContent(c);
    // Boot-empty stays unsaved (never blank the cloud from a just-opened tab), but a canvas the
    // user EMPTIED this session (content seen earlier, edits removed it) must persist as empty —
    // otherwise a refresh resurrects the deleted sources from the last non-empty cloud comp.
    if (!hasContent && !everCanvasContentRef.current) {
      const hasLibraryState = localAssetIndexKnownRef.current;
      const hasInactiveOutputs =
        projectOutputs.outputsRef.current.inactive.length > 0;
      return hasLibraryState || hasInactiveOutputs
        ? {
            ...(hasLibraryState
              ? { document: persistableDocument(false) }
              : {}),
            context: {
              schemaVersion: STUDIO_PROJECT_CONTEXT_SCHEMA_VERSION,
              outputs: projectOutputs.outputsRef.current,
              ...(localAssetIndexKnownRef.current
                ? { localAssets: localAssetIndexRef.current }
                : {}),
            },
            videoSig: videoSigRef.current,
            videoDurationSec: firstNarrativeDurationSec(
              editorDocumentRef.current,
            ),
          }
        : null;
    }
    const canDerive =
      (asrRef.current?.length ?? 0) > 0 ||
      Object.keys(clipAsrRef.current).length > 0;
    return {
      document: persistableDocument(canDerive),
      context: {
        schemaVersion: STUDIO_PROJECT_CONTEXT_SCHEMA_VERSION,
        outputs: projectOutputs.outputsRef.current,
        ...(localAssetIndexKnownRef.current
          ? { localAssets: localAssetIndexRef.current }
          : {}),
      },
      videoSig:
        videoSigRef.current ??
        (videoFileRef.current ? fileSig(videoFileRef.current) : null),
      videoDurationSec: firstNarrativeDurationSec(editorDocumentRef.current),
    };
  }

  const cloudSaveOptions = {
    getPayload: buildCloudPayload,
    canWrite: () => !displacedRef.current && !migrationWriteBlockedRef.current,
    save: (payload: ProjectSavePayload) => {
      // Keep metadata refresh and the one-shot displacement flush behind the same
      // request chain as retries; no project PUT/GET observes a half-finished save.
      const request = cloudSaveChainRef.current.then(() =>
        studioProviders().projects.save(projectId, payload),
      );
      cloudSaveChainRef.current = request.then(
        () => undefined,
        () => undefined,
      );
      return request;
    },
    onConflict: () => {
      if (conflictWarnedRef.current) return;
      conflictWarnedRef.current = true;
      toast.info(t("workbench.projectAlsoEditedElsewhere"));
    },
    onMigrationRequired: blockForDocumentMigration,
  };
  if (
    !cloudSaveQueueRef.current ||
    cloudSaveQueueProjectRef.current !== projectId
  ) {
    cloudSaveQueueRef.current?.dispose();
    cloudSaveQueueRef.current = new CloudProjectSaveQueue(cloudSaveOptions);
    cloudSaveQueueProjectRef.current = projectId;
  } else {
    cloudSaveQueueRef.current.configure(cloudSaveOptions);
  }
  const cloudSaveQueue = cloudSaveQueueRef.current;

  useEffect(() => {
    // React Strict Mode runs setup → cleanup → setup once in development without a render between
    // those phases. Disposing synchronously in the first cleanup permanently killed the same queue
    // that the second setup kept using, so local edits never reached the cloud during dev/QA.
    // A later setup advances the lifecycle token before this microtask; a real unmount does not.
    const lifecycle = cloudSaveQueueDisposerRef.current!.retain(cloudSaveQueue);
    return () => {
      cloudSaveQueueDisposerRef.current!.release(
        cloudSaveQueue,
        lifecycle,
        () => {
          cloudSaveQueue.dispose();
          if (cloudSaveQueueRef.current === cloudSaveQueue)
            cloudSaveQueueRef.current = null;
        },
      );
    };
  }, [cloudSaveQueue]);

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
      if (b)
        el = {
          id: b.id,
          label: blockDisplayTitle(b),
          kind: blockKind(b),
          isShot: false,
        };
    } else if (selectedShotId) {
      const i = (c.shots ?? []).findIndex((s) => s.id === selectedShotId);
      if (i >= 0)
        el = {
          id: selectedShotId,
          label: t("workbench.shotN", { n: i + 1 }),
          kind: "shot",
          isShot: true,
        };
    }
    chatRef.current?.insertElementPill(el);
  }, [selectedId, selectedShotId]);

  /** When hover-preview jumps to v seconds, whether to hide the selected component's edit box: outside its time window = hide.
   *  Sentence-level captions are the exception — the handle is global, so keep it if any sentence-level caption is present at v. v=null (hover ended) = don't hide. */
  const selHiddenAt = (v: number | null): boolean => {
    if (v == null) return false;
    const c = compRef.current;
    const sb = selectedIdRef.current
      ? c.blocks.find((b) => b.id === selectedIdRef.current)
      : null;
    if (sb) {
      if (isSentenceCaption(sb)) {
        return !c.blocks.some(
          (b) =>
            isSentenceCaption(b) &&
            v >= b.startSec &&
            v < b.startSec + b.durationSec,
        );
      }
      return v < sb.startSec - 0.01 || v > sb.startSec + sb.durationSec + 0.01;
    }
    const clipId = selectedVisualClipIdRef.current ?? selectedShotIdRef.current;
    if (!clipId) return false;
    const fps = editorDocumentRef.current.canvas.fps;
    const clip = editorDocumentRef.current.timeline.tracks
      .flatMap((track) => track.clips)
      .find((candidate) => candidate.id === clipId);
    if (!clip) return true;
    const start = clip.startFrame / fps;
    const end = (clip.startFrame + clip.durationFrames) / fps;
    return v < start - 0.01 || v > end + 0.01;
  };

  /** Whether the selected block is present at the **current frame moment**: if absent, don't draw the selection box/toolbar
   *  (the component is gone, pinning a border on an unrelated frame only misleads). Uses t while the playhead rests; hover-preview has its own scrubHideSel. */
  const selOnScreen = (b: Block): boolean => {
    if (scrubActive) return true;
    if (isSentenceCaption(b))
      return comp.blocks.some(
        (x) =>
          isSentenceCaption(x) &&
          canvasPreviewSec >= x.startSec &&
          canvasPreviewSec < x.startSec + x.durationSec,
      );
    return (
      canvasPreviewSec >= b.startSec - 0.01 &&
      canvasPreviewSec < b.startSec + b.durationSec + 0.01
    );
  };

  // Callback props for memoized child components: stable identity, always calls the latest implementation internally (see use-stable-callbacks).
  // runStudioTool itself is rebuilt each frame (to read the latest state/closures); only the outer shell is stable.
  const chatCbs = useStableCallbacks({ runTool: runStudioTool });

  const togglePrimaryAutoSnap = () => {
    if (timelineSnapEnabled) {
      setTimelineSnapEnabled(false);
      return;
    }
    const clips = primaryNarrativeClips(editorDocumentRef.current);
    let cursor = 0;
    const needsPacking = clips.some((clip) => {
      const shifted = clip.startFrame !== cursor;
      cursor += clip.durationFrames;
      return shifted;
    });
    if (needsPacking && clips[0]) {
      const edit = moveVisualDocumentClip({
        document: editorDocumentRef.current,
        clipId: clips[0].id,
        atSec: 0,
        target: { kind: "primary" },
        primaryOrder: clips.map((clip) => clip.id),
      });
      if (!edit.ok) {
        toast.error(editorErrorMessage(edit.error));
        return;
      }
      pushUndoSnapshot();
      setEditorDocument(edit.document);
    }
    setTimelineSnapEnabled(true);
  };

  const commitVisualClipMove = (
    clipId: string,
    startSec: number,
    target: TimelineMediaDropTarget,
  ) => {
    const sourceEntry = renderPlan.tracks
      .flatMap((track) => track.clips)
      .find((entry) => entry.clipId === clipId);
    const sourceAsset = sourceEntry?.asset;
    // A lane move changes the V1 projection (shot.src appears/disappears), but it must never change
    // the session-only byte rendezvous. Re-assert the asset→URL binding before publishing the new
    // document so a local clip does not come back to the primary lane as an offline placeholder.
    if (sourceAsset) {
      const runtimeUrl =
        resolveAssetUrl(sourceAsset) ??
        (sourceAsset.id ===
        firstNarrativeAssetId(editorDocumentRef.current)
          ? (objectUrlRef.current ?? undefined)
          : undefined);
      if (runtimeUrl) rememberAssetUrl(sourceAsset.id, runtimeUrl);
    }
    const primaryOrder = timelineSnapEnabled
      ? (() => {
          const ids = primaryNarrativeClips(editorDocumentRef.current)
            .map((clip) => clip.id)
            .filter((id) => id !== clipId);
          if (target.kind === "primary") {
            const index = Math.max(
              0,
              Math.min(ids.length, target.insertIndex ?? ids.length),
            );
            ids.splice(index, 0, clipId);
          }
          return ids;
        })()
      : undefined;
    const edit = moveVisualDocumentClip({
      document: editorDocumentRef.current,
      clipId,
      atSec: startSec,
      ...(primaryOrder ? { primaryOrder } : {}),
      target:
        target.kind === "visual-new"
          ? {
              kind: "visual-new",
              id: `track_visual_${blockId("lane")}`,
              name: "Visual media",
              stackOrder: target.stackOrder,
              index: target.slot,
            }
          : target.kind === "primary"
            ? { kind: "primary" }
            : target,
    });
    if (!edit.ok) {
      toast.error(editorErrorMessage(edit.error));
      return;
    }
    pushUndoSnapshot();
    setEditorDocument(edit.document);
    if (target.kind === "primary") setSelectedShotId(clipId);
    else selectVisualClip(clipId);
  };

  const commitVisualClipResize = (
    clipId: string,
    edge: "left" | "right",
    atSec: number,
  ) => {
    const edit = resizeVisualTimelineClip(
      editorDocumentRef.current,
      clipId,
      edge,
      atSec,
    );
    if (!edit.ok || !edit.document) {
      toast.error(edit.error || t("editorError.operationFailed"));
      return;
    }
    pushUndoSnapshot();
    setEditorDocument(edit.document);
    selectVisualClip(clipId);
  };

  const commitNarrativeClipResize = (
    clipId: string,
    edge: "left" | "right",
    atSec: number,
  ) => {
    const edit = resizeNarrativeTimelineClip(
      editorDocumentRef.current,
      clipId,
      edge,
      atSec,
    );
    if (!edit.ok || !edit.document) {
      toast.error(edit.error || t("editorError.operationFailed"));
      return;
    }
    pushUndoSnapshot();
    setEditorDocument(edit.document);
    setSelectedShotId(clipId);
  };

  /** Slip two-up (over the preview stage): the slid window's new first/last frame while a slip
   *  gesture is active. Source resolves through the render plan's playable URL per shot. */
  const [slipTwoUp, setSlipTwoUp] = useState<{
    source: string;
    startSec: number;
    endSec: number;
  } | null>(null);
  const onSlipPreview = (
    state: { shotId: string; startSec: number; endSec: number } | null,
  ) => {
    if (!state) {
      setSlipTwoUp(null);
      return;
    }
    const primaryId = editorDocumentRef.current.semantics.primaryNarrativeTrackId;
    const entry = renderPlan.tracks
      .find((track) => track.id === primaryId)
      ?.clips.find((candidate) => candidate.clipId === state.shotId);
    setSlipTwoUp(entry?.resolvedSource
      ? { source: entry.resolvedSource, startSec: state.startSec, endSec: state.endSec }
      : null);
  };

  /** Slip commit (alt-drag on a shot body): the source window shifts, timeline geometry is
   *  untouched, so no retime/ripple — the engine clamps the delta against the asset again. */
  const commitNarrativeClipSlip = (clipId: string, sourceDeltaSec: number) => {
    const edit = slipNarrativeTimelineClip(
      editorDocumentRef.current,
      clipId,
      sourceDeltaSec,
    );
    if (!edit.ok || !edit.document) {
      toast.error(edit.error || t("editorError.operationFailed"));
      return;
    }
    pushUndoSnapshot();
    setEditorDocument(edit.document);
    setSelectedShotId(clipId);
  };

  const timelineCbs = useStableCallbacks({
    onPps: setPps,
    onSeek: (v: number) => {
      if (playing) setPlaying(false);
      applyT(v);
    },
    onScrub: (v: number | null) => {
      if (playing) {
        if (v == null) {
          setScrubActive(false);
          setScrubPreviewSec(null);
          setScrubHideSel(false);
        }
        return; // don't interrupt during playback
      }
      setScrubActive(v != null);
      const selectedClipId = selectedVisualClipIdRef.current;
      const selectedClip = selectedClipId
        ? editorDocumentRef.current.timeline.tracks
            .flatMap((track) => track.clips)
            .find((clip) => clip.id === selectedClipId)
        : null;
      setScrubPreviewSec(
        selectedClip?.kind === "media" && selectedClip.keyframes?.box?.length
          ? v
          : null,
      );
      postPreview({ type: "hf:seek", t: v == null ? tRef.current : v }); // hover preview: move only the player, not the playhead
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
    onMoveShot: commitVisualClipMove,
    onResizeShot: commitNarrativeClipResize,
    onSlipShot: commitNarrativeClipSlip,
    onSlipPreview,
    onSelectVisualClip: selectVisualClip,
    onDeselectAll: () => {
      setSelectedVisualClipId(null);
      setSelectedId(null);
      setSelectedShotIds(new Set());
      setSelectedShotIdRaw(null);
      setSelectedAudioId(null);
    },
    onMoveBlock: moveBlock,
    onResizeBlock: resizeBlock,
    onResizeCaption: resizeCaption,
    /** Move a block across stable native tracks. The emptied source lane remains in the document. */
    onMoveBlockTrack: (
      id: string,
      targetLane: { trackId?: string; stackOrder: number },
      startSec: number,
    ) => {
      if (genLockToast(id)) return;
      const target = targetLane.trackId
        ? editorDocumentRef.current.timeline.tracks.find(
            (track) =>
              track.id === targetLane.trackId &&
              track.type !== "audio" &&
              track.role !== "primaryNarrative",
          )
        : editorDocumentRef.current.timeline.tracks.find(
            (track) =>
              track.type !== "audio" &&
              track.role !== "primaryNarrative" &&
              track.stackOrder === targetLane.stackOrder,
          );
      if (!target) {
        toast.error(t("workbench.elementNotFound"));
        return;
      }
      const edit = moveOverlayDocumentClip({
        document: editorDocumentRef.current,
        clipId: id,
        toTrackId: target.id,
        startSec,
      });
      if (!edit.ok) {
        toast.error(editorErrorMessage(edit.error));
        return;
      }
      pushUndoSnapshot();
      setEditorDocument(edit.document);
    },
    /** Dragging into any row boundary creates a graphics lane at that exact document position. */
    onMoveBlockNewTrack: (id: string, newTrackIndex: number, startSec: number) => {
      if (genLockToast(id)) return;
      const tracks = editorDocumentRef.current.timeline.tracks;
      const insertAt = Math.max(0, Math.min(tracks.length, newTrackIndex));
      const isVisualLayer = (track: (typeof tracks)[number]) =>
        track.type !== "audio" && track.role !== "primaryNarrative";
      const above = [...tracks.slice(0, insertAt)]
        .reverse()
        .find(isVisualLayer)?.stackOrder;
      const below = tracks.slice(insertAt).find(isVisualLayer)?.stackOrder;
      const stackOrder =
        above == null
          ? (below ?? 1) + 1
          : below == null
            ? above > 1
              ? (above + 1) / 2
              : above - 1
            : (above + below) / 2;
      const edit = moveOverlayDocumentClip({
        document: editorDocumentRef.current,
        clipId: id,
        newTrack: {
          id: `track_graphics_${blockId("lane")}`,
          name: "Graphics",
          stackOrder,
          index: insertAt,
        },
        startSec,
      });
      if (!edit.ok) {
        toast.error(editorErrorMessage(edit.error));
        return;
      }
      pushUndoSnapshot();
      setEditorDocument(edit.document);
    },
    onOpenTransition: openTransitionAt,
    onResizeTransition: resizeCutTransition,
    onDropAsset: (t: number) => {
      // Non-main-track drop: image = insert a PiP media block at the drop moment; component = insert at the drop moment (equal standing with images, user-unified);
      // video doesn't respond in these regions (the timeline side already intercepts it)
      const a = dragAsset;
      setDragAsset(null);
      if (a?.type === "image") void insertPanelMedia(a, a.label, t);
      else if (a?.type === "element")
        insertGeneratedElement(a.element, a.prompt, t);
    },
    onDropAssetClip: (
      t: number,
      target: TimelineMediaDropTarget,
      mode: TimelineInsertMode,
    ) => {
      // The timeline owns the target plan: primary or a concrete/new visual lane. A normal drop is
      // exact overwrite; Cmd/Ctrl-drop is the explicitly requested Ripple operation.
      const a = dragAsset;
      setDragAsset(null);
      if (a && a.type !== "element" && a.type !== "audio")
        void insertLibraryClipAt(a, t, { target, mode });
    },
    onMoveVisualClip: commitVisualClipMove,
    onResizeVisualClip: commitVisualClipResize,
    onDropAssetAudio: (t: number) => {
      // Audio drop (music lane / anywhere audio is allowed): mount as the bed starting at the drop time
      const a = dragAsset;
      setDragAsset(null);
      if (a?.type === "audio")
        void audioOps.mountAudioFromUrl(a.url, a.label, {
          startSec: t,
          sig: a.sig,
        });
    },
    // Audio uses the same native clip.move transaction as other timeline media. The pointer gesture
    // commits once on release; the shared audio edit also allocates a parallel lane on collision.
    onMoveAudio: (id, startSec, target) => {
      const edit = moveAudioDocumentClip({
        document: editorDocumentRef.current,
        clipId: id,
        startSec,
        ...(target?.kind === "track" ? { toTrackId: target.trackId } : {}),
        ...(target ? { newTrackIndex: target.newTrackIndex } : {}),
        ...(target?.kind === "new-track" ? { forceNewTrack: true } : {}),
      });
      if (!edit.ok) {
        toast.error(editorErrorMessage(edit.error));
        return;
      }
      pushUndoSnapshot();
      setEditorDocument(edit.document);
    },
    onTrimAudio: (
      id: string,
      patch: { startSec?: number; inSec?: number; outSec?: number },
    ) => audioOps.patchClip(id, patch),
    onFadeAudio: (id: string, edge: "in" | "out", sec: number) =>
      audioOps.patchClip(
        id,
        edge === "in" ? { fadeInSec: sec } : { fadeOutSec: sec },
      ),
    onToggleAudioClipMute: (id: string, muted: boolean) =>
      audioOps.patchClip(id, { muted }),
    onSelectAudio: (id: string | null) => {
      setSelectedAudioId(id);
      if (id) {
        setSelectedVisualClipId(null);
        setSelectedId(null);
        setSelectedShotIds(new Set());
        setSelectedShotIdRaw(null);
      }
    },
    onOpenMusicPanel: () => openAudioTab(),
    /** Track mute is a native V2 flag. Per-shot levels/mutes remain untouched, so unmuting restores the mix. */
    onToggleVideoMute: () => {
      patchTrackFlags(primaryNarrative.trackId, {
        muted: !primaryNarrative.muted,
      });
    },
    onToggleVideoHidden: () => {
      patchTrackFlags(primaryNarrative.trackId, {
        hidden: !primaryNarrative.hidden,
      });
    },
    onToggleAudioMute: () => {
      if (musicTrack)
        patchTrackFlags(musicTrack.id, { muted: !musicTrack.muted });
    },
    onToggleTrackMute: (trackId: string) => {
      const track = renderPlan.tracks.find(
        (candidate) => candidate.id === trackId,
      );
      // Caption and graphics tracks have no source audio. Keeping the guard here makes the
      // callback safe even if another timeline surface starts forwarding arbitrary track ids.
      if (track)
        patchTrackFlags(trackId, { muted: !track.muted });
    },
    onToggleTrackHidden: (trackId: string) => {
      const track = renderPlan.tracks.find(
        (candidate) => candidate.id === trackId,
      );
      if (track) patchTrackFlags(trackId, { hidden: !track.hidden });
    },
    onReorderTracks: (
      topToBottom: Array<{ trackId?: string; stackOrder: number }>,
    ) => {
      const current = editorDocumentRef.current;
      const tracks = current.timeline.tracks;
      const targetIds = topToBottom.flatMap((target) =>
        target.trackId ? [target.trackId] : [],
      );
      if (
        targetIds.length !== tracks.length ||
        new Set(targetIds).size !== tracks.length ||
        targetIds.some((id) => !tracks.some((track) => track.id === id))
      ) {
        toast.error("Track reorder must contain every timeline track exactly once.");
        return;
      }

      // Presentation order is independent from visual compositing. Preserve the visual lanes'
      // top-to-bottom meaning through stackOrder, then move every native row (audio included) into
      // the user's requested timeline order.
      const visualIds = targetIds.filter((id) => {
        const track = tracks.find((candidate) => candidate.id === id);
        return track?.type !== "audio" && track?.role !== "primaryNarrative";
      });
      const visualEdit = reorderOverlayDocumentTracks(current, visualIds);
      if (!visualEdit.ok) {
        toast.error(editorErrorMessage(visualEdit.error));
        return;
      }

      let next = visualEdit.document;
      for (const [toIndex, trackId] of targetIds.entries()) {
        if (next.timeline.tracks[toIndex]?.id === trackId) continue;
        const moved = applyEditorCommand(next, {
          type: "track.move",
          trackId,
          toIndex,
        });
        if (!moved.ok) {
          toast.error(editorErrorMessage(moved.error));
          return;
        }
        next = moved.document;
      }

      pushUndoSnapshot();
      setEditorDocument(next);
    },
  });

  // Opening a project = auto-load (per user: no "restore/discard" bar, you come in to how it was last time).
  // Cloud-authoritative + local cache: use local first (offline/instant), fetch cloud concurrently; if cloud is newer (or
  // local is absent) adopt cloud — after caching locally, remount chat to re-read the session, then run the same restore flow.
  // OPFS local library hit → the main video auto-reconnects (via the existing pendingRestore check); inserted clips revive by srcSig.
  const hydrateNativeSession = useCallback(
    (
      document: EditorDocumentV2,
      composition?: Composition,
      replace = false,
    ) => {
      const metadata = nativeProjectSessionMetadata(document, composition);
      if (
        replace ||
        (!cloudMediaRef.current.video && !cloudMediaRef.current.clips)
      )
        cloudMediaRef.current = metadata.cloudMedia;
      if (
        replace ||
        (metadata.mainTranscript?.length && !asrRef.current?.length)
      ) {
        asrRef.current = metadata.mainTranscript ?? null;
        setAsrSentences(metadata.mainTranscript ?? null);
      }
      if (
        replace ||
        (Object.keys(metadata.clipTranscripts).length &&
          !Object.keys(clipAsrRef.current).length)
      ) {
        clipAsrRef.current = metadata.clipTranscripts;
        setClipAsr(metadata.clipTranscripts);
      }
    },
    [],
  );
  activateOutputDocumentRef.current = (document, composition) =>
    hydrateNativeSession(document, composition, true);

  const applyDraft = useCallback(
    (d: StudioDraft) => {
      pendingRestoreRef.current = d;
      projectOutputs.hydrate(d.context?.outputs);
      setLocalAssetIndex(nativeProjectSharedLocalAssets(d.document, d.context));
      coverThumbRef.current = d.coverThumb ?? null;
      const migrated = shell.migrateProjectPayload?.(d.document, d.comp) ?? {
        document: d.document,
        composition: d.comp,
      };
      const restoredDocument = migrated.document;
      const restoredComposition = migrated.composition;
      // The source can remain in the media library while the explicit shots array is empty. Reconnect
      // its bytes for reuse, but videoTrackShots keeps the timeline empty instead of resurrecting it.
      const wantsMain =
        (restoredComposition.shots ?? []).some((s) => !s.src) ||
        (!(restoredComposition.shots ?? []).length &&
          d.videoDurationSec != null);
      // Keep the sig anchor even before (or without) the bytes: autosave reads videoSigRef, and
      // writing videoSig:null to the cloud row while the media is missing would destroy the
      // reconnect anchor — editing captions/blocks in the missing-media state must not do that.
      const primaryId = firstNarrativeAssetId(restoredDocument);
      const mainSig =
        (primaryId
          ? restoredDocument.assets[primaryId]?.locator.localSig
          : undefined) ?? d.videoSig;
      if (mainSig && wantsMain) videoSigRef.current = mainSig;
      setEditorDocument(restoredDocument, {
        ...restoredComposition,
        video: null,
      });
      hydrateNativeSession(restoredDocument, restoredComposition);
      if (mainSig && wantsMain) {
        void loadLocalVideo(mainSig).then(async (f) => {
          if (f && pendingRestoreRef.current === d) {
            void pickVideoFile(f, { asSig: mainSig, reconnect: true });
            return;
          }
          if (f) return;
          // Not in OPFS (device switch / cleared cache) → fetch from the cloud byte rendezvous; only a miss falls back to manual re-pick
          if (cloudMediaRef.current.video?.sig === mainSig) {
            toast.info(t("workbench.retrievingVideoFromCloud"));
            const cf = await studioProviders().vault.fetch(mainSig);
            if (cf && pendingRestoreRef.current === d) {
              void pickVideoFile(cf, { asSig: mainSig, reconnect: true });
              return;
            }
          }
          // Bytes unavailable on this device (browser switch / cleared storage): nothing global to
          // flip — missing sources are per-asset now (panel restore card + timeline missing strip);
          // the sig anchor stays so reconnect/autosave keep working.
        });
      }
      void recoverLocalClips(restoredComposition.shots ?? []);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [hydrateNativeSession, shell],
  );
  const autoRestoredRef = useRef(false);
  // The boot layer's data gate: released once auto-restore (cloud-first falling back to local) finishes —
  // video-byte reconnection (OPFS/cloud fetch) continues behind the gate, not counted as entry waiting
  // The canvas may fall back locally after 1.2s, but publishing a cached asset index must wait for
  // the cloud request itself to settle or a slow response can resurrect cross-browser deletions.
  const [localAssetIndexSyncReady, setLocalAssetIndexSyncReady] =
    useState(false);
  // CAPTIONS ARE DERIVED STATE: transcript × shots × captionStyle.on → display cues, materialized into
  // comp.blocks for every consumer (preview/timeline/selection/agent) but NEVER persisted — autosave
  // strips them; the transcript is the single stored source. This one reactive effect replaces the old
  // scattered manual re-lays: any transcript/cut/toggle change re-derives, so blocks can't go stale.
  useEffect(() => {
    if (!bootDataReady) return;
    const edit = applyCaptionDocumentEdit({
      document: editorDocumentRef.current,
      mainTranscript: asrRef.current,
      clipTranscripts: clipAsrRef.current,
    });
    if (edit.ok && edit.document !== editorDocumentRef.current)
      setEditorDocument(edit.document);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    bootDataReady,
    asrSentences,
    clipAsr,
    comp.shots,
    comp.captionStyle,
    comp.width,
    comp.height,
    comp.blocks,
  ]);
  useEffect(() => {
    if (autoRestoredRef.current) return;
    autoRestoredRef.current = true;
    setDraftOffer(null);
    // Cloud project → straight into the workbench: use the in-memory draft returned by cacheProjectLocally directly, not
    // read back from localStorage — if the quota is full the write silently fails and you read a stale old draft, which autosave then writes back to the cloud.
    const applyRemote = (remote: StudioProjectDto) => {
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
        new Promise<undefined>((res) =>
          setTimeout(() => res(undefined), local ? 1200 : 15_000),
        ),
      ]);
      if (remote !== undefined) setLocalAssetIndexSyncReady(true);
      if (remote) {
        setProjectVersion(projectId, remote.version);
        // Judge newer/older by version number, not savedAt (local autosave self-refreshes savedAt on every open, so
        // comparing by it makes every browser think "I'm newest" — each keeps its own, writes stale state back to the cloud, never converges).
        // Cloud version ahead of the local draft's base = written elsewhere → cloud wins; equal = this browser is the last
        // writer, and the local draft may still hold changes not yet pushed within the 1s pre-close debounce window → local wins.
        const remoteNewer =
          !local ||
          local.baseVersion == null ||
          remote.version > local.baseVersion;
        if (remoteNewer) {
          applyRemote(remote);
          return;
        }
      }
      if (local) {
        // Opened offline / on cloud timeout: subsequent saves must carry the draft's base version so the server's 409 check has a basis
        // (the in-memory version table is empty on refresh, and a save without baseVersion unconditionally overwrites the cloud)
        if (remote === undefined && local.baseVersion != null)
          setProjectVersion(projectId, local.baseVersion);
        applyDraft(local); // local is newer / cloud unreachable → use local
      }
      // Both empty and it was a "timeout" (≠ definitely absent): the data is probably in the cloud, don't pretend it's a new empty project
      else if (remote === undefined)
        toast.error(t("workbench.cloudProjectLoadingSlowly"));
      // Losing the race ≠ giving up: after the cloud arrives late, ① backfill the hydrated reference data (prevent empty-state
      // write-back); ② if the canvas is still empty (the user did nothing) reconnect the whole thing — agent/device-switch scenarios auto-recover without a manual refresh
      if (remote === undefined) {
        void loadP.then((late) => {
          setLocalAssetIndexSyncReady(true);
          if (!late) return;
          setProjectVersion(projectId, late.version);
          hydrateNativeSession(
            late.document,
            projectDocumentToComposition(late.document),
          );
          const untouched = !hasTimelineContent(compRef.current);
          if (!local && untouched) {
            applyRemote(late);
            toast.success(t("workbench.cloudProjectReconnected"));
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

  // Another browser can change only the metadata index while this tab stays open. Revalidate when
  // the user returns here. The delay lets a just-closed file picker or a blur-triggered save finish;
  // a mutation during the GET cancels adoption so fresh local intent is never overwritten.
  useEffect(() => {
    if (!bootDataReady || !projectId) return;
    let dead = false;
    let timer: number | null = null;
    let request = 0;
    const scheduleIndexRefresh = () => {
      if (document.visibilityState !== "visible") return;
      const ticket = ++request;
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void cloudSaveChainRef.current.then(async () => {
          // Dirty-but-unflushed local state sits in the save queue's debounce, NOT in the save
          // chain — a remote snapshot fetched now predates local intent, and adopting it would
          // wipe just-imported assets (the panel treats a confirmed cloud index as exact).
          // Skip; the next focus/visibility event retries once the push has been acknowledged.
          if (cloudSaveQueueRef.current?.hasPendingSave) return;
          const mutationRev = localAssetIndexMutationRevRef.current;
          const remote = await studioProviders().projects.load(projectId);
          if (
            dead ||
            ticket !== request ||
            mutationRev !== localAssetIndexMutationRevRef.current ||
            cloudSaveQueueRef.current?.hasPendingSave
          )
            return;
          if (remote)
            setLocalAssetIndex(
              nativeProjectSharedLocalAssets(remote.document, remote.context),
            );
        });
      }, 1800);
    };
    window.addEventListener("focus", scheduleIndexRefresh);
    document.addEventListener("visibilitychange", scheduleIndexRefresh);
    return () => {
      dead = true;
      request += 1;
      if (timer != null) window.clearTimeout(timer);
      window.removeEventListener("focus", scheduleIndexRefresh);
      document.removeEventListener("visibilitychange", scheduleIndexRefresh);
    };
  }, [bootDataReady, projectId, setLocalAssetIndex]);

  // "Canvas had content this session" — buildCloudPayload uses it to tell boot-empty (never blank
  // the cloud) from user-emptied (must persist the emptiness). Set by restore or edits.
  const everCanvasContentRef = useRef(false);
  useEffect(() => {
    if (hasTimelineContent(comp)) everCanvasContentRef.current = true;
  }, [comp]);

  // Project sync (debounced): coalesce one PUT 1.2s after document/context changes. Chat uses its own immediate API.
  // local useDraftAutosave still writes localStorage as a cache, the two are independent. Don't push on an empty canvas (don't blank the cloud).
  // Transcripts, cloud locators and asset-library metadata are folded into the V2 document;
  // the separate project context only carries the multi-output directory.
  // Single-writer: a displaced tab (bridge close 4000) does not autosave at all, and never rebase-retries a 409 —
  // its in-memory state is by definition stale, and "retry until it lands" is exactly how a zombie tab clobbers the writer.
  useEffect(() => {
    // No content gate here: buildCloudPayload decides (full payload / null).
    if (!bootDataReady || !projectId) return;
    const activation = cloudAutosaveActivationRef.current!.activation;
    // Hydration, derived captions, restored media and output metadata can settle over several
    // effects. None is user intent. Wait until that cascade is quiet before autosave can become
    // dirty; real edits after the editor is interactive still take the normal 1.2s path.
    if (!activation.active) return activation.defer();
    if (displaced || migrationWriteBlockedRef.current) return;
    cloudSaveQueue.markDirty();
    const timer = window.setTimeout(() => {
      if (displacedRef.current || migrationWriteBlockedRef.current) return; // demoted/migration-blocked while this timer was armed
      void cloudSaveQueue.flush();
    }, 1200);
    return () => window.clearTimeout(timer);
    // asrSentences/clipAsr are also deps: changes that touch only the transcript, not comp (like translations (sub)), must sync too
  }, [
    bootDataReady,
    comp,
    editorDocument,
    videoFile,
    projectId,
    cloudMediaRev,
    localAssetIndexRev,
    asrSentences,
    clipAsr,
    displaced,
    projectOutputs.outputs,
    cloudSaveQueue,
  ]);

  // flush-on-hide: switching away / minimizing pushes the debounce tail immediately (a closed-soon
  // tab loses it otherwise — the "fast tab close loses the last edit" hole). Writers only; the diff
  // layer already makes this zero requests when nothing changed.
  useEffect(() => {
    if (!projectId) return;
    const onHide = () => {
      if (
        document.visibilityState !== "hidden" ||
        displacedRef.current ||
        migrationWriteBlockedRef.current
      )
        return;
      void cloudSaveQueue.flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Exponential retry covers transient failures while the tab remains open. These
  // signals make recovery immediate after offline/background periods instead of
  // waiting for the current backoff window or another edit.
  useEffect(() => {
    const retryPendingSave = () => {
      if (displacedRef.current || migrationWriteBlockedRef.current) return;
      void cloudSaveQueue.flush();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") retryPendingSave();
    };
    window.addEventListener("online", retryPendingSave);
    window.addEventListener("focus", retryPendingSave);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", retryPendingSave);
      window.removeEventListener("focus", retryPendingSave);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [cloudSaveQueue]);

  return (
    <div className="studio-scope bg-bg relative flex h-full min-h-0 w-full gap-1.5 overflow-hidden p-1.5">
      {/* Entry boot layer: heavy-resource warmup + project-data double gate, covers the whole workbench (incl. the chat bar), self-unmounts when done */}
      <StudioBootOverlay dataReady={bootDataReady} />
      {/* Agent file injection: the stable input and empty-canvas trigger below let an external agent
          use the browser file-chooser bridge. The browser reads the local file directly — no cloud
          upload — and the normal pickVideoFile path persists it in the OPFS local library. */}
      <input
        type="file"
        accept="video/*"
        data-pireel-video-input
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.currentTarget.value = ""; // allow re-injecting the same path
          if (f) void pickVideoFile(f);
        }}
      />
      {/* Left: chat area. It shares one workbench frame with the editor, while staying mounted when hidden to preserve the chat session. */}
      <div className={panelOpen ? "flex min-h-0 shrink-0" : "hidden"}>
        {/* Panel width adjustable (drag the right edge, 320–760); the stage shrinks accordingly (area observer auto-recomputes fit) */}
        <div
          className="bg-canvas relative flex min-h-0 flex-col overflow-hidden rounded-sm"
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
                if (last)
                  setPanelW(
                    Math.max(320, Math.min(760, w0 + (last.clientX - sx))),
                  );
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
                window.removeEventListener("pointermove", mv);
                window.removeEventListener("pointerup", up);
                window.removeEventListener("pointercancel", up);
              };
              window.addEventListener("pointermove", mv);
              window.addEventListener("pointerup", up);
              window.addEventListener("pointercancel", up);
            }}
            title={t("workbench.dragResizePanel")}
            className="hover:bg-accent/40 absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize transition-colors"
          />
          {/* Chat is the only content of this area (hidden entirely when collapsed, session/streaming preserved) */}
          <div className="flex min-h-0 flex-1">
            {initialChatThreads ? (
              <StudioChat
                key={chatEpoch}
                ref={chatRef}
                projectId={projectId}
                runTool={chatCbs.runTool}
                getBody={getChatBody}
                getComp={getChatComp}
                getFps={() => editorDocumentRef.current.canvas.fps}
                timelineFramePickActive={timelineFramePickActive}
                timelineFramePickBusy={timelineFramePickBusy}
                timelineFramePickAvailable={
                  duration > 0 && hasTimelineContent(comp)
                }
                onTimelineFramePickActiveChange={setTimelineFramePickMode}
                elements={chatMentionElements}
                onFrameApplied={onFrameApplied}
                initialThreads={initialChatThreads}
                onThreadChange={persistChatThread}
                onClose={closeChat}
              />
            ) : (
              <div className="text-ink-4 flex h-full w-full items-center justify-center">
                <Loader2 size={16} className="animate-spin" />
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Video import goes through the preview upload / chat; the top bar no longer has buttons (the pipeline is fully tool-ized, chat-driven) */}
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pickVideoFile(f);
            e.target.value = ""; // allow re-picking the same file
          }}
        />

        {/* Top half: preview | asset library (above the timeline). The asset library has a fixed column width, the stage adapts to remaining space (area observer recomputes fit).
            The preview must be min-w-0: flex's min-width:auto would lock it to the stage content width, and it gets squeezed and clipped when the rail collapses then expands */}
        <div className="mb-1.5 flex min-h-0 min-w-0 flex-1 gap-1.5">
          {/* Preview (= the editing surface: single-click selects a block, double-click edits text in place). No video → upload area.
            The panel clips its own children so nested surfaces cannot bleed through the outer rounded corners. */}
          <div className="bg-canvas flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-sm">
            {/* The deliverables rail is a sibling of the measured canvas area: it consumes real width,
              so the fit observer sizes the stage against the remaining space instead of overlaying it. */}
            <ProjectOutputSwitcher
              outputs={outputTabs}
              activeId={projectOutputs.outputs.active.id}
              label={t("workbench.outputSwitcher")}
              newLabel={t("workbench.newOutput")}
              deleteLabel={t("workbench.deleteOutput")}
              untitledLabel={t("workbench.untitledOutput")}
              switching={outputRuntime.switching}
              onSwitch={switchOutput}
              onCreate={createOutput}
              onDelete={requestDeleteOutput}
            />
            <div className="flex min-h-0 min-w-0 flex-1 p-3">
              <div
                ref={previewAreaRef}
                className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center"
              >
                {/* Canvas-ratio picker (bottom-right): the ratio is a project decision seeded by the first
              inserted source. Default media re-fits inside the new canvas; manually transformed media
              keeps its relative centre and is scaled uniformly, so source pixels never deform. */}
                <div className="absolute bottom-2 right-2 z-[60]" data-cap-keep>
                  {ratioOpen && (
                    <div className="border-line bg-panel absolute bottom-8 right-0 flex w-[60px] flex-col overflow-hidden rounded-md border shadow-lg">
                      <button
                        type="button"
                        onClick={applySourceCanvasRatio}
                        className={`whitespace-nowrap px-3 py-1.5 text-left text-[11.5px] transition ${
                          followsFirstSource
                            ? "bg-panel-2 text-ink font-medium"
                            : "text-ink-3 hover:bg-panel-2 hover:text-ink"
                        }`}
                      >
                        {t("workbench.ratioFollowSource")}
                      </button>
                      {CANVAS_RATIOS.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => applyCanvasRatio(r.w, r.h)}
                          className={`whitespace-nowrap px-3 py-1.5 text-left text-[11.5px] transition ${
                            currentRatioId === r.id
                              ? "bg-panel-2 text-ink font-medium"
                              : "text-ink-3 hover:bg-panel-2 hover:text-ink"
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
                    title={t("workbench.canvasRatio")}
                    className="border-line bg-panel/90 text-ink-2 hover:text-ink inline-flex h-[24px] w-[60px] items-center justify-center whitespace-nowrap rounded-md border px-2 text-[11px] backdrop-blur"
                  >
                    {followsFirstSource ? t("workbench.ratioFollowSource") : currentRatioId ?? t("workbench.ratioCustom")}
                  </button>
                </div>
                {/* Floating entries on the preview (outside the toolbar's TooltipProvider scope, use native title — Tooltip would crash):
              top-left = reopen chat (the chat area is on the left, returns to the same side; theme black primary button).
              Icon-only (per user): no text floating over the frame — the label lives in title/aria. */}
                {!panelOpen && (
                  <button
                    type="button"
                    onClick={openChat}
                    title={t("workbench.openChat")}
                    aria-label={t("workbench.openChat")}
                    className="bg-ink text-bg absolute left-3 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-md shadow-sm hover:opacity-90"
                  >
                    <MessageSquare size={14} />
                  </button>
                )}
                <div
                  ref={stageBoxRef}
                  data-cap-keep
                  data-block-selection-keep
                  className="relative"
                  style={{ width: boxW, height: boxH }}
                >
                  {!hasContent && (
                    <button
                      type="button"
                      data-pireel-video-trigger
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const f = e.dataTransfer.files?.[0];
                        if (f) void pickVideoFile(f);
                      }}
                      className="border-line bg-panel/90 text-ink-3 hover:border-ink-3 hover:text-ink absolute left-1/2 top-1/2 z-20 flex w-[min(78%,320px)] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-5 py-6 shadow-lg backdrop-blur-sm transition"
                    >
                      {busyImport ? (
                        <Loader2 size={24} className="animate-spin" />
                      ) : (
                        <Upload size={24} />
                      )}
                      <div className="text-[12px] font-medium">
                        {busyImport
                          ? t("workbench.reading")
                          : t("workbench.startWithAnyMedia")}
                      </div>
                    </button>
                  )}
                  {/* Frame clipping layer: component overflow is cut here; the panel-level radius is owned by the preview surface above. */}
                  <div
                    className={`absolute inset-0 overflow-hidden shadow-xl ring-1 ring-black/20 ${
                      hasContent
                        ? ""
                        : "bg-canvas bg-[radial-gradient(circle_at_center,var(--color-line)_0_1px,transparent_1.5px)] bg-[length:14px_14px]"
                    }`}
                    style={
                      hasContent
                        ? { background: EMPTY_VIDEO_GROUND }
                        : undefined
                    }
                  >
                    {/* Double-buffered iframes: load in the background then swap, eliminating the reload white flash.
                    Trust boundary: LLM-generated block HTML/scripts run in a sandbox (opaque origin), can't reach the main app's DOM/localStorage/cookies;
                    local blob videos aren't readable → onBufLoad hands the File in to build its own URL; the control protocol is all postMessage. */}
                    {([0, 1] as const).map((i) => (
                      <iframe
                        key={`${i}:${bufs.revs[i]}`}
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
                        className={
                          bufs.active === i ? "" : "pointer-events-none"
                        }
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 0,
                          width: bufs.dims[i].w,
                          height: bufs.dims[i].h,
                          border: 0,
                          background: "transparent",
                          transform: `scale(${fit})`,
                          transformOrigin: "top left",
                          // The background buffer is pushed to the bottom by z-order, not opacity:0 — Chromium render-throttles /
                          // media-suspends invisible cross-origin iframes, and a video loading in a hidden buffer enters a zombie
                          // state ("paused:false, ready:4, currentTime frozen") that doesn't wake even when brought to front (only rebuilding src saves it, see the watchdog).
                          // Pushed to the bottom = always rendering, just occluded by the same-size front iframe, so the decoder isn't suspended.
                          zIndex: bufs.active === i ? 2 : 1,
                          visibility: hasContent ? "visible" : "hidden",
                        }}
                      />
                    ))}
                    {/* Missing sources are per-asset (panel restore card + timeline missing strip) — no full-stage mask. */}
                  </div>
                  {/* Insert landing skeleton: draw a dashed box + spinner where the component will appear, dissolves when the rebuild settles (more prominent than the top pill) */}
                  {pendingInsert && rebuilding && (
                    <div
                      className="pointer-events-none absolute z-10"
                      style={{
                        left: `${pendingInsert.x * 100}%`,
                        top: `${pendingInsert.y * 100}%`,
                        width: `${pendingInsert.w * 100}%`,
                        height: `${pendingInsert.h * 100}%`,
                      }}
                    >
                      <div className="border-accent/70 flex h-full w-full items-center justify-center rounded-md border-2 border-dashed bg-black/20">
                        <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[11px] text-white">
                          <Loader2 size={12} className="animate-spin" />{" "}
                          {t("common.inserting")}
                        </span>
                      </div>
                    </div>
                  )}
                  {/* Full-doc rebuild indicator: for structural changes like insert / AI block landing / theme mount, gives feedback during background-buffer load + handshake */}
                  {rebuilding && (
                    <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2">
                      <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1 text-[11px] text-white shadow">
                        <Loader2 size={12} className="animate-spin" />{" "}
                        {t("workbench.updatingCanvas")}
                      </span>
                    </div>
                  )}
                  {/* The live document already has its new ratio while the old iframe remains visible.
                  Keep the old selection chrome, but don't let its old coordinate mapper edit the new document. */}
                  {!canvasGeometrySettled && (
                    <div
                      aria-hidden
                      className="absolute inset-0 z-40 cursor-wait"
                    />
                  )}
                  {/* Slip two-up: while a slip drag is live, the stage shows the slid window's
                      new first and last frame (industry-standard slip feedback). */}
                  {slipTwoUp && (
                    <SlipTwoUpOverlay
                      source={slipTwoUp.source}
                      startSec={slipTwoUp.startSec}
                      endSec={slipTwoUp.endSec}
                    />
                  )}
                  {/* Native video/image placement: the layer box is independent from source framing.
                  Timeline range/crop stay untouched; dragging commits one V2 clip.patch on release. */}
                  {!playing &&
                    !scrubHideSel &&
                    selectedCanvasMedia &&
                    (scrubActive ||
                      (canvasPreviewSec >=
                        selectedCanvasMedia.startSec - 1e-3 &&
                        canvasPreviewSec <
                          selectedCanvasMedia.endSec + 1e-3)) && (
                      <BoxEditOverlay
                        box={selectedCanvasMedia.box}
                        stageW={boxW}
                        stageH={boxH}
                        overlayRef={rotateOverlayRef}
                        bodyMove
                        outset={0}
                        onMovePointerDown={(event) =>
                          canvasGripDrag(event, {
                            box: selectedCanvasMedia.box,
                            onLive: (box) =>
                              postPreview({
                                type: "hf:mediaBox",
                                id: selectedCanvasMedia.elementId,
                                box: selectedCanvasMedia.placementFromContent(
                                  box,
                                ),
                              }),
                            onCommit: (box) =>
                              setMediaCanvasBox(
                                selectedCanvasMedia.trackId,
                                selectedCanvasMedia.clipId,
                                selectedCanvasMedia.placementFromContent(box),
                              ),
                            onPick: (x, y) =>
                              postPreview({ type: "hf:pickAt", x, y }),
                          })
                        }
                        onScalePointerDown={(event, sgnX, sgnY) =>
                          canvasScaleDrag(
                            event,
                            {
                              box: selectedCanvasMedia.box,
                              onLive: (box) =>
                                postPreview({
                                  type: "hf:mediaBox",
                                  id: selectedCanvasMedia.elementId,
                                  box: selectedCanvasMedia.placementFromContent(
                                    box,
                                  ),
                                }),
                              onCommit: (box) =>
                                setMediaCanvasBox(
                                  selectedCanvasMedia.trackId,
                                  selectedCanvasMedia.clipId,
                                  selectedCanvasMedia.placementFromContent(box),
                                ),
                            },
                            sgnX,
                            sgnY,
                          )
                        }
                        onEdgePointerDown={(event, side) =>
                          canvasEdgeDrag(
                            event,
                            {
                              box: selectedCanvasMedia.box,
                              onLive: (box) =>
                                postPreview({
                                  type: "hf:mediaBox",
                                  id: selectedCanvasMedia.elementId,
                                  box: selectedCanvasMedia.placementFromContent(
                                    box,
                                  ),
                                }),
                              onCommit: (box) =>
                                setMediaCanvasBox(
                                  selectedCanvasMedia.trackId,
                                  selectedCanvasMedia.clipId,
                                  selectedCanvasMedia.placementFromContent(box),
                                ),
                            },
                            side,
                          )
                        }
                        toolbar={
                          selectedCanvasMedia.assetKind === "video" ? (
                            <div className="border-line bg-panel flex items-center gap-1 rounded-lg border p-1 shadow-lg">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  if (floatWin === "shot") setFloatWin(null);
                                  else
                                    openShotSettings(
                                      selectedCanvasMedia.clipId,
                                    );
                                }}
                                title={t("workbench.cameraFraming")}
                                aria-label={t("workbench.cameraFraming")}
                                className={`inline-flex size-7 items-center justify-center rounded ${
                                  floatWin === "shot"
                                    ? "bg-panel-2 text-ink"
                                    : "text-ink-3 hover:bg-panel-2 hover:text-ink"
                                }`}
                              >
                                <Frame size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openAudioTab();
                                }}
                                title={t("panels.videoSound")}
                                aria-label={t("panels.videoSound")}
                                className={`inline-flex size-7 items-center justify-center rounded ${
                                  !floatWin && libTab === "audio"
                                    ? "bg-panel-2 text-ink"
                                    : "text-ink-3 hover:bg-panel-2 hover:text-ink"
                                }`}
                              >
                                <AudioLines size={14} />
                              </button>
                            </div>
                          ) : undefined
                        }
                      />
                    )}
                  {/* Selected block has a box → frame-level drag/resize handles (a boxless full-canvas block is positioned by its internal layout, no handles).
                  Hidden during playback — the edit box follows selection, not time, so it looks like a band-aid pinned on the frame during play;
                  hover-preview jumping outside the component's time window (scrubHideSel) steps aside likewise. **Not unmounted** during drag (ghost semantics:
                  baseline solid line stays, dashed line follows; unmounting would also tear down pointer capture, once covered by the shield) */}
                  {!playing &&
                    !scrubHideSel &&
                    (() => {
                      const sb = selectedId
                        ? comp.blocks.find((b) => b.id === selectedId)
                        : null;
                      if (!sb || !selOnScreen(sb)) return null;
                      // Sentence-level captions (no box): give global position/scale handles — dragging comp.captionStyle moves all captions at once
                      if (isSentenceCaption(sb)) {
                        const subSelected =
                          capSelPart === "sub" &&
                          typeof sb.slots.sub === "string" &&
                          !!sb.slots.sub;
                        // Visual line counts (cue blocks stack lines at big font sizes): the selection box height
                        // is analytic — same splitter as the render, so it tracks font-size changes instantly.
                        const csSel = resolveCaptionStyle(comp);
                        const selWords = (sb.slots.words ?? []) as {
                          text: string;
                          start: number;
                          end: number;
                        }[];
                        const mainPresetSel0 = getCaptionPreset(csSel.preset);
                        const mainPresetSel =
                          csSel.bg === undefined
                            ? mainPresetSel0
                            : { ...mainPresetSel0, bg: csSel.bg ?? undefined };
                        const mainLines =
                          sb.slots.cue === true && selWords.length
                            ? Math.max(
                                1,
                                captionLineSegments(
                                  selWords,
                                  mainPresetSel,
                                  csSel.wPct ?? 56,
                                  csSel.scale,
                                  comp.width,
                                  { bold: csSel.bold, font: csSel.font },
                                ).length,
                              )
                            : 1;
                        const subStyleSel = (() => {
                          const base = resolveSubCaptionStyle(comp);
                          if (csSel.sub?.yPct != null) return base; // explicit anchor: bottom convention already
                          // Default follow-under-main: the derived bottom accounts for ONE line — push it down for extra lines
                          const subText0 =
                            typeof sb.slots.sub === "string"
                              ? sb.slots.sub
                              : "";
                          if (!subText0) return base;
                          const subPBase = getCaptionPreset(base.preset);
                          const subP0 =
                            base.bg === undefined
                              ? subPBase
                              : { ...subPBase, bg: base.bg ?? undefined };
                          const n0 = Math.max(
                            1,
                            captionLineSegments(
                              wordsFromText(subText0, 0, 1),
                              subP0,
                              base.wPct ?? 56,
                              base.scale,
                              comp.width,
                              { bold: base.bold, font: base.font },
                            ).length,
                          );
                          if (n0 <= 1) return base;
                          const subFs0 = Math.max(
                            9,
                            Math.round(BASE_CAPTION_FONT_PX * base.scale),
                          );
                          const extra =
                            (subFs0 * 1.35 + Math.round(subFs0 * 0.15)) *
                            (n0 - 1);
                          return {
                            ...base,
                            yPct: Math.min(
                              99,
                              base.yPct + (extra / comp.height) * 100,
                            ),
                          };
                        })();
                        const subText =
                          typeof sb.slots.sub === "string" ? sb.slots.sub : "";
                        const subPresetSel0 = getCaptionPreset(
                          subStyleSel.preset,
                        );
                        const subPresetSel =
                          subStyleSel.bg === undefined
                            ? subPresetSel0
                            : {
                                ...subPresetSel0,
                                bg: subStyleSel.bg ?? undefined,
                              };
                        const subLines = subText
                          ? Math.max(
                              1,
                              captionLineSegments(
                                wordsFromText(subText, 0, 1),
                                subPresetSel,
                                subStyleSel.wPct ?? 56,
                                subStyleSel.scale,
                                comp.width,
                                { bold: subStyleSel.bold, font: subStyleSel.font },
                              ).length,
                            )
                          : 1;
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
                                metrics={{
                                  line: 1.35,
                                  padY: 0.18,
                                  rowGap: 0.15,
                                }}
                                onChange={(patch) => {
                                  const keep =
                                    compRef.current.captionStyle?.sub ?? {};
                                  setCaptionStyle({
                                    sub: { ...keep, ...patch },
                                  });
                                }}
                                onLive={(v) =>
                                  postPreview({
                                    type: "hf:capSubStyle",
                                    xPct: v.xPct ?? 50,
                                    yPct: v.yPct,
                                    ...(v.hPct ? { hPct: v.hPct } : {}),
                                  })
                                }
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
                                  postPreview({
                                    type: "hf:capStyle",
                                    xPct: s.xPct ?? 50,
                                    yPct: s.yPct,
                                    ...(s.hPct ? { hPct: s.hPct } : {}),
                                  })
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
                            style={{
                              left: sb.box.x * boxW,
                              top: sb.box.y * boxH,
                              width: sb.box.w * boxW,
                              height: sb.box.h * boxH,
                            }}
                          >
                            <span className="inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/90">
                              <Loader2 size={10} className="animate-spin" />{" "}
                              {t("workbench.generating")}
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
                          onScalePointerDown={(e, sgnX, sgnY) =>
                            scaleDrag(e, sb, sgnX, sgnY)
                          }
                          onRotatePointerDown={(e) => rotateDrag(e, sb)}
                        />
                      );
                    })()}
                  {/* Empty component block: in-block action overlay (AI generate / upload). Buttons can't go in the sandbox iframe,
                  the parent overlays them aligned to the box so they look like they're inside the block */}
                  {!playing &&
                    !scrubHideSel &&
                    !bodyDragging &&
                    (() => {
                      const eb = selectedId
                        ? comp.blocks.find((b) => b.id === selectedId)
                        : null;
                      if (
                        !eb?.box ||
                        !selOnScreen(eb) ||
                        genIds.has(eb.id) ||
                        blockKind(eb) !== "media"
                      )
                        return null;
                      const s = eb.slots as {
                        media?: { url?: string };
                        spec?: unknown;
                      };
                      if (
                        s.media?.url ||
                        typeof s.spec === "string" ||
                        mediaBusy[eb.id]
                      )
                        return null; // no actions while uploading, the badge layer is playing loading
                      return (
                        <div
                          className="pointer-events-none absolute z-40 flex items-center justify-center gap-2"
                          style={{
                            left: eb.box.x * boxW,
                            top: eb.box.y * boxH,
                            width: eb.box.w * boxW,
                            height: eb.box.h * boxH,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => aiFillBlock(eb.id)}
                            className="bg-ink text-bg pointer-events-auto rounded-full px-3 py-1 text-[12px] font-medium shadow-lg"
                          >
                            {t("workbench.aiGenerate")}
                          </button>
                          <button
                            type="button"
                            onClick={() => void uploadIntoBlock(eb.id)}
                            className="bg-panel text-ink border-line pointer-events-auto rounded-full border px-3 py-1 text-[12px] font-medium shadow-lg"
                          >
                            {t("panels.upload")}
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
                        e.dataTransfer.dropEffect = "copy";
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
                  {!playing &&
                    !scrubHideSel &&
                    (() => {
                      const mb = selectedId
                        ? comp.blocks.find((b) => b.id === selectedId)
                        : null;
                      if (!mb || !selOnScreen(mb) || genIds.has(mb.id))
                        return null;
                      if (isSentenceCaption(mb)) return null; // captions = a pure computed product: no source/delete semantics, no toolbar
                      if (imgSel && imgSel.blockId === mb.id) return null; // the in-block image toolbar takes over (image-hugging render, see below)
                      // Positioning via toolbarXY (same formula for drag-follow and render, identical numbers = zero jump):
                      // the toolbar purely follows without clipping; the component itself may go off-bounds, cut by canvas overflow
                      const p = toolbarXY(mb.box);
                      // Media block (image/video) toolbar: swap media + entry/exit animation popover + delete —
                      // no AI edit/source/background (those are layout-component semantics); an empty media slot's upload/AI-generate is in the in-block overlay
                      if (blockKind(mb) === "media") {
                        const m = mb.slots.media as MediaRef | undefined;
                        return (
                          <TooltipProvider delayDuration={200}>
                            <div
                              ref={toolbarRef}
                              className="border-line bg-panel absolute z-50 flex items-center gap-1 rounded-lg border px-1.5 py-1 shadow-lg"
                              style={{
                                left: p.left,
                                top: p.top,
                                transform: "translateX(-50%)",
                              }}
                            >
                              {mb.box && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onPointerDown={(e) => gripDrag(e, mb.id)}
                                      aria-label={t("workbench.dragMove")}
                                      className="text-ink-3 hover:text-ink cursor-move rounded p-1"
                                    >
                                      <GripVertical size={13} />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {t("workbench.dragMove")}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              {m?.url && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void replaceBlockMedia(mb.id)
                                      }
                                      disabled={!!mediaBusy[mb.id]}
                                      className="text-ink-3 hover:text-ink inline-flex items-center gap-1 rounded p-1 text-[11px] whitespace-nowrap disabled:opacity-40"
                                    >
                                      {mediaBusy[mb.id] ? (
                                        <Loader2
                                          size={13}
                                          className="animate-spin"
                                        />
                                      ) : m.type === "video" ? (
                                        <FileVideo size={13} />
                                      ) : (
                                        <ImageIcon size={13} />
                                      )}{" "}
                                      {m.type === "video"
                                        ? t("workbench.replaceVideo")
                                        : t("workbench.replaceImage")}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {m.type === "video"
                                      ? t("workbench.replaceVideoLabel")
                                      : t("workbench.replaceImageLabel")}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              {m?.url && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={(e) =>
                                        floatWin === "anim"
                                          ? setFloatWin(null)
                                          : openFloatAt(
                                              "anim",
                                              e.currentTarget.getBoundingClientRect(),
                                            )
                                      }
                                      className={`inline-flex items-center gap-1 rounded p-1 text-[11px] whitespace-nowrap ${floatWin === "anim" ? "text-ink bg-panel-2" : "text-ink-3 hover:text-ink"}`}
                                    >
                                      <Wand2 size={13} />{" "}
                                      {t("workbench.motion")}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {t("workbench.enterExitMotion")}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              {mb.box && (
                                <CardShapeControls
                                  block={mb}
                                  onRadius={(v) => {
                                    postPreview({
                                      type: "hf:radius",
                                      blockId: mb.id,
                                      px: v,
                                    }); // live preview
                                    setBlockRadius(mb.id, v); // commit to Block (debounced rebuild bakes it into HTML)
                                  }}
                                />
                              )}
                              <div className="bg-line mx-0.5 h-4 w-px" />
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => removeBlock(mb.id)}
                                    aria-label={t("tools.delete_block.label")}
                                    className="text-ink-3 rounded p-1 hover:text-destructive"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {t("tools.delete_block.label")}
                                </TooltipContent>
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
                            style={{
                              left: p.left,
                              top: p.top,
                              transform: "translateX(-50%)",
                            }}
                          >
                            {mb.box && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onPointerDown={(e) => gripDrag(e, mb.id)}
                                    aria-label={t("workbench.dragMove")}
                                    className="text-ink-3 hover:text-ink cursor-move rounded p-1"
                                  >
                                    <GripVertical size={13} />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {t("workbench.dragMove")}
                                </TooltipContent>
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
                                      const label =
                                        mb.label?.slice(0, 30) || blockKind(mb);
                                      const cmd = `Pireel block ${mb.id} ("${label}"): `;
                                      void navigator.clipboard
                                        .writeText(cmd)
                                        .then(
                                          () =>
                                            toast.success(
                                              t(
                                                "workbench.copiedPasteIntoAgent",
                                              ),
                                            ),
                                          () =>
                                            toast.error(
                                              t("workbench.copyFailed"),
                                            ),
                                        );
                                      return;
                                    }
                                    openChat();
                                    setTimeout(
                                      () => chatRef.current?.focusInput(),
                                      0,
                                    ); // focus after the panel show/hide transition settles (a hidden component can't be focused)
                                  }}
                                  className="text-ink-3 hover:text-ink inline-flex items-center gap-1 rounded p-1 text-[11px] whitespace-nowrap"
                                >
                                  <Sparkles size={13} /> {t("chatGen.aiEdit")}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {agentView
                                  ? t("workbench.copyBlockReferenceAgent")
                                  : t("workbench.tellChatHowChange")}
                              </TooltipContent>
                            </Tooltip>
                            {/* Sync content: one capability across HTML data-edit slots and kit schema props. The provider still owns
                        narration matching; hidden only when the selected block has no content contract or the shell has no syncFill capability. */}
                            {isBlockContentSyncable(mb) &&
                              !!studioProviders().syncFill && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() => void syncBlockContent(mb)}
                                      disabled={syncBusyId === mb.id}
                                      className="text-ink-3 hover:text-ink inline-flex items-center gap-1 rounded p-1 text-[11px] whitespace-nowrap disabled:opacity-50"
                                    >
                                      {syncBusyId === mb.id ? (
                                        <Loader2
                                          size={13}
                                          className="animate-spin"
                                        />
                                      ) : (
                                        <RefreshCw size={13} />
                                      )}{" "}
                                      {t("workbench.syncContent")}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {t("workbench.autoFillElementText")}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            {/* Save as component: a custom block edited on the canvas flows back to the asset library (the reverse channel of copy semantics —
                        library → canvas is a copy, here canvas → library is likewise a snapshot copy, later edits don't affect each other) */}
                            {mb.templateId === "custom" &&
                              typeof (mb.slots as { innerHtml?: unknown })
                                .innerHtml === "string" && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() => saveBlockAsElement(mb)}
                                      aria-label={t("workbench.saveAsElement")}
                                      className="text-ink-3 hover:text-ink inline-flex items-center rounded p-1"
                                    >
                                      <Save size={13} />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {t("workbench.saveAsElementKeep")}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            {/* Layer: move a block up/down one layer; when matte is on, also give a block-level "in front of / behind the person" override */}
                            {!isSentenceCaption(mb) && (
                              <>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() => bumpBlockLayer(mb, 1)}
                                      aria-label={t("workbench.bringForward")}
                                      className="text-ink-3 hover:text-ink rounded p-1"
                                    >
                                      <ChevronUp size={13} />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {t(
                                      "workbench.bringForwardCoversOverlapping",
                                    )}
                                  </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() => bumpBlockLayer(mb, -1)}
                                      aria-label={t("workbench.sendBackward")}
                                      className="text-ink-3 hover:text-ink rounded p-1"
                                      disabled={mb.trackIndex <= 1}
                                    >
                                      <ChevronDown size={13} />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {t("workbench.sendBackward")}
                                  </TooltipContent>
                                </Tooltip>
                                {(comp.shots ?? []).some(
                                  (sh) => sh.personMatte,
                                ) && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        onClick={() => togglePersonLayer(mb)}
                                        aria-label={t(
                                          "workbench.portraitLayer",
                                        )}
                                        className={`rounded p-1 ${(mb.personLayer ? mb.personLayer === "behind" : !!comp.personFx?.personFront) ? "text-ink bg-panel-2" : "text-ink-3 hover:text-ink"}`}
                                      >
                                        <BringToFront size={13} />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {(
                                        mb.personLayer
                                          ? mb.personLayer === "behind"
                                          : !!comp.personFx?.personFront
                                      )
                                        ? t(
                                            "workbench.elementSitsBehindPortrait",
                                          )
                                        : t(
                                            "workbench.elementSitsAbovePortrait",
                                          )}
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
                                    onClick={(e) =>
                                      floatWin === "person"
                                        ? setFloatWin(null)
                                        : openFloatAt(
                                            "person",
                                            e.currentTarget.getBoundingClientRect(),
                                          )
                                    }
                                    disabled={!selectedShotId}
                                    aria-label={t("panels.smartCutout")}
                                    className={`rounded p-1 disabled:opacity-40 ${(comp.shots ?? []).some((s) => s.personMatte) && comp.personFx?.personFront ? "text-ink bg-panel-2" : "text-ink-3 hover:text-ink"}`}
                                  >
                                    <SendToBack size={13} />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {t("workbench.personTopSmartCutout")}
                                </TooltipContent>
                              </Tooltip>
                            )}
                            {/* Background / border / corners: block-level chrome for free-form elements.
                        Kit components carry these in their own props (each renders them in its own
                        design language), so the generic control would be a second, conflicting one. */}
                            {!isSentenceCaption(mb) &&
                              !mb.templateId.startsWith("kit:") && (
                                <span className="relative inline-flex">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <button
                                        type="button"
                                        onClick={() => setBgOpen((o) => !o)}
                                        aria-label={t(
                                          "workbench.elementBackground",
                                        )}
                                        className={`rounded p-1 ${bgOpen ? "text-ink bg-panel-2" : "text-ink-3 hover:text-ink"}`}
                                      >
                                        <Palette size={13} />
                                      </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {t("workbench.backgroundBorder")}
                                    </TooltipContent>
                                  </Tooltip>
                                  {bgOpen && (
                                    <div className="border-line bg-panel absolute left-1/2 top-full z-50 mt-1.5 flex -translate-x-1/2 flex-col gap-2 rounded-lg border px-2.5 py-2 shadow-xl">
                                      {/* Background */}
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-ink-4 w-9 shrink-0 text-[10px]">
                                          {t("workbench.background")}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setBlockBg(mb.id, undefined)
                                          }
                                          title={t(
                                            "workbench.noBackgroundTransparentOver",
                                          )}
                                          aria-label={t(
                                            "workbench.noBackground",
                                          )}
                                          className={`h-5 w-5 shrink-0 rounded-full border bg-[linear-gradient(135deg,transparent_44%,#f43f5e_44%,#f43f5e_56%,transparent_56%)] ${!mb.bg ? "border-accent ring-1 ring-accent" : "border-line"}`}
                                        />
                                        {bgSwatches.map(([name, colorVal]) => (
                                          <button
                                            key={name}
                                            type="button"
                                            onClick={() =>
                                              setBlockBg(mb.id, colorVal)
                                            }
                                            title={t("panels.backgroundName", {
                                              name: t(name),
                                            })}
                                            aria-label={t(
                                              "panels.backgroundName",
                                              { name: t(name) },
                                            )}
                                            className={`h-5 w-5 shrink-0 rounded-full border ${mb.bg === colorVal ? "border-accent ring-1 ring-accent" : "border-line"}`}
                                            style={{ background: colorVal }}
                                          />
                                        ))}
                                        <label
                                          title={t(
                                            "panels.customBackgroundColor",
                                          )}
                                          className="border-line relative h-5 w-5 shrink-0 cursor-pointer overflow-hidden rounded-full border"
                                          style={{
                                            background:
                                              "conic-gradient(#f43f5e,#f59e0b,#84cc16,#06b6d4,#6366f1,#d946ef,#f43f5e)",
                                          }}
                                        >
                                          <input
                                            type="color"
                                            value={
                                              /^#[0-9a-fA-F]{6}/.test(
                                                mb.bg ?? "",
                                              )
                                                ? mb.bg!.slice(0, 7)
                                                : "#ffffff"
                                            }
                                            onChange={(e) =>
                                              setBlockBg(mb.id, e.target.value)
                                            }
                                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                            aria-label={t(
                                              "panels.customBackgroundColor",
                                            )}
                                          />
                                        </label>
                                      </div>
                                      {/* Border */}
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-ink-4 w-9 shrink-0 text-[10px]">
                                          {t("workbench.border")}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setBlockBorder(mb.id, undefined)
                                          }
                                          title={t("workbench.noBorder")}
                                          aria-label={t("workbench.noBorder")}
                                          className={`h-5 w-5 shrink-0 rounded-full border bg-[linear-gradient(135deg,transparent_44%,#f43f5e_44%,#f43f5e_56%,transparent_56%)] ${!mb.border ? "border-accent ring-1 ring-accent" : "border-line"}`}
                                        />
                                        {borderSwatches.map(
                                          ([name, colorVal]) => (
                                            <button
                                              key={name}
                                              type="button"
                                              onClick={() =>
                                                setBlockBorder(mb.id, colorVal)
                                              }
                                              title={t("workbench.borderName", {
                                                name: t(name),
                                              })}
                                              aria-label={t(
                                                "workbench.borderName",
                                                { name: t(name) },
                                              )}
                                              className={`relative h-5 w-5 shrink-0 rounded-full border ${mb.border === colorVal ? "border-accent ring-1 ring-accent" : "border-line"}`}
                                            >
                                              <span
                                                className="absolute inset-[3px] rounded-full border-2"
                                                style={{
                                                  borderColor: colorVal,
                                                }}
                                              />
                                            </button>
                                          ),
                                        )}
                                        <label
                                          title={t(
                                            "workbench.customBorderColor",
                                          )}
                                          className="border-line relative h-5 w-5 shrink-0 cursor-pointer overflow-hidden rounded-full border"
                                          style={{
                                            background:
                                              "conic-gradient(#f43f5e,#f59e0b,#84cc16,#06b6d4,#6366f1,#d946ef,#f43f5e)",
                                          }}
                                        >
                                          <input
                                            type="color"
                                            value={
                                              /^#[0-9a-fA-F]{6}$/.test(
                                                mb.border ?? "",
                                              )
                                                ? mb.border!
                                                : "#ffffff"
                                            }
                                            onChange={(e) =>
                                              setBlockBorder(
                                                mb.id,
                                                e.target.value,
                                              )
                                            }
                                            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                            aria-label={t(
                                              "workbench.customBorderColor",
                                            )}
                                          />
                                        </label>
                                      </div>
                                      {/* Opacity */}
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-ink-4 w-9 shrink-0 text-[10px]">
                                          {t("panels.opacity")}
                                        </span>
                                        <input
                                          type="range"
                                          min={10}
                                          max={100}
                                          step={5}
                                          value={Math.round(
                                            (mb.opacity ?? 1) * 100,
                                          )}
                                          onChange={(e) =>
                                            setBlockOpacity(
                                              mb.id,
                                              Number(e.target.value) / 100,
                                            )
                                          }
                                          className="zoom-range w-28"
                                          aria-label={t(
                                            "workbench.elementOpacity",
                                          )}
                                        />
                                        <span className="text-ink-3 w-8 shrink-0 text-right font-mono text-[10px] tabular-nums">
                                          {Math.round((mb.opacity ?? 1) * 100)}%
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </span>
                              )}
                            {mb.box && (
                              <CardShapeControls
                                block={mb}
                                onRadius={(v) => {
                                  postPreview({
                                    type: "hf:radius",
                                    blockId: mb.id,
                                    px: v,
                                  }); // live preview
                                  setBlockRadius(mb.id, v); // commit to Block (debounced rebuild bakes it into HTML)
                                }}
                              />
                            )}
                            <div className="bg-line mx-0.5 h-4 w-px" />
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => removeBlock(mb.id)}
                                  aria-label={t("workbench.deleteElement")}
                                  className="text-ink-3 rounded p-1 hover:text-destructive"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {t("workbench.deleteElement")}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TooltipProvider>
                      );
                    })()}
                  {/* Image slot toolbar (contract B): clicking an <img> inside a custom block → an image-specific bar hugging the image rect (swap/delete),
                  zero-LLM and instant. The selection ring is drawn by the parent (doesn't depend on iframe attributes, survives doc rebuilds); dismissed on block drag / selection change */}
                  {!playing &&
                    !scrubHideSel &&
                    !bodyDragging &&
                    imgSel &&
                    imgSel.blockId === selectedId &&
                    !genIds.has(imgSel.blockId) &&
                    (() => {
                      const r = imgSel.rect;
                      const p = toolbarXY(r);
                      return (
                        <TooltipProvider delayDuration={200}>
                          <div
                            className="border-accent/80 pointer-events-none absolute z-30 rounded border-2"
                            style={{
                              left: r.x * boxW,
                              top: r.y * boxH,
                              width: r.w * boxW,
                              height: r.h * boxH,
                            }}
                          />
                          <div
                            className="border-line bg-panel absolute z-50 flex items-center gap-1 rounded-lg border px-1.5 py-1 shadow-lg"
                            style={{
                              left: p.left,
                              top: p.top,
                              transform: "translateX(-50%)",
                            }}
                          >
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void replaceCustomImg(
                                      imgSel.blockId,
                                      imgSel.index,
                                    )
                                  }
                                  disabled={!!mediaBusy[imgSel.blockId]}
                                  className="text-ink-3 hover:text-ink inline-flex items-center gap-1 rounded p-1 text-[11px] whitespace-nowrap disabled:opacity-40"
                                >
                                  {mediaBusy[imgSel.blockId] ? (
                                    <Loader2
                                      size={13}
                                      className="animate-spin"
                                    />
                                  ) : (
                                    <ImageIcon size={13} />
                                  )}{" "}
                                  {t("workbench.replaceImage")}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {t("workbench.replaceThisImage")}
                              </TooltipContent>
                            </Tooltip>
                            <div className="bg-line mx-0.5 h-4 w-px" />
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => {
                                    patchCustomImg(
                                      imgSel.blockId,
                                      imgSel.index,
                                      () => "remove",
                                    );
                                    setImgSel(null);
                                  }}
                                  aria-label={t("workbench.deleteImage")}
                                  className="text-ink-3 rounded p-1 hover:text-destructive"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                {t("workbench.deleteThisImage")}
                              </TooltipContent>
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
                                ? {
                                    left: b.box.x * boxW,
                                    top: b.box.y * boxH,
                                    width: b.box.w * boxW,
                                    height: b.box.h * boxH,
                                  }
                                : { inset: 0 }
                            }
                          >
                            <span className="inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/90">
                              <Loader2 size={10} className="animate-spin" />{" "}
                              {mediaBusy[b.id] === "upload"
                                ? t("workbench.uploading")
                                : t("workbench.loading")}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                  {/* Parent-side handle-drag shield: pressing an edge/corner handle unmounts the overlay, so pointer capture is lost when the component is removed,
                  and subsequent events as the pointer slides over the iframe are swallowed by the iframe doc (window gets no move/up, the drag freezes) —
                  a full-screen transparent shield keeps events in the parent doc. Body/grip drag doesn't mount it (the capture component is resident, see dragCursorRef='') */}
                  {bodyDragging && dragCursorRef.current !== "" && (
                    <div
                      className="fixed inset-0 z-40"
                      style={{ cursor: dragCursorRef.current }}
                    />
                  )}
                  {/* Body-drag center snap guides: resident nodes, toggled via setGuideVis directly on display during drag (zero React work) */}
                  <div className="pointer-events-none absolute inset-0 z-20">
                    {/* Drag ghost dashed box (like caption-handle semantics): the baseline solid line stays, this dashed line follows the pointer, applied once on release */}
                    <div
                      ref={ghostRef}
                      className="border-accent pointer-events-none absolute rounded-md border-2 border-dashed"
                      style={{ display: "none" }}
                    />
                    <div
                      ref={guideVRef}
                      className="bg-accent/80 absolute bottom-0 left-1/2 top-0 w-px -translate-x-1/2"
                      style={{
                        display: "none",
                        boxShadow: "0 0 4px rgba(63,75,232,0.5)",
                      }}
                    />
                    <div
                      ref={guideHRef}
                      className="bg-accent/80 absolute left-0 right-0 top-1/2 h-px -translate-y-1/2"
                      style={{
                        display: "none",
                        boxShadow: "0 0 4px rgba(63,75,232,0.5)",
                      }}
                    />
                  </div>
                  {/* Debug overlay: face (red) / subject (blue dashed) / safe zone (green). Normalized coords → % align directly with the canvas */}
                  {dbgGeom && (
                    <div className="pointer-events-none absolute inset-0 z-20">
                      <div className="absolute left-1 top-1 rounded bg-black/75 px-1.5 py-0.5 text-[9px] leading-tight text-emerald-600">
                        {t("workbench.geometryPass")}
                        {geomNote()}
                      </div>
                      {dbgGeom.rects.map((r, i) => (
                        <div
                          key={`safe${i}`}
                          className="absolute border-2 border-emerald-400"
                          style={{
                            left: `${r.x * 100}%`,
                            top: `${r.y * 100}%`,
                            width: `${r.w * 100}%`,
                            height: `${r.h * 100}%`,
                          }}
                        >
                          <span className="absolute left-0 top-0 bg-emerald-400 px-1 text-[9px] font-bold leading-tight text-black">
                            {t("workbench.safe")}
                            {i + 1}
                          </span>
                        </div>
                      ))}
                      {dbgGeom.subject && (
                        <div
                          className="absolute border border-dashed border-sky-400"
                          style={{
                            left: `${dbgGeom.subject.x * 100}%`,
                            top: `${dbgGeom.subject.y * 100}%`,
                            width: `${dbgGeom.subject.w * 100}%`,
                            height: `${dbgGeom.subject.h * 100}%`,
                          }}
                        >
                          <span className="absolute right-0 top-0 bg-sky-400 px-1 text-[9px] font-bold leading-tight text-black">
                            {t("workbench.subject")}
                          </span>
                        </div>
                      )}
                      {dbgGeom.face && (
                        <div
                          className="absolute border-2 border-red-500"
                          style={{
                            left: `${dbgGeom.face.x * 100}%`,
                            top: `${dbgGeom.face.y * 100}%`,
                            width: `${dbgGeom.face.w * 100}%`,
                            height: `${dbgGeom.face.h * 100}%`,
                          }}
                        >
                          <span className="absolute bottom-0 left-0 bg-red-500 px-1 text-[9px] font-bold leading-tight text-white">
                            {t("workbench.face")}
                          </span>
                        </div>
                      )}
                      {visual?.textBands?.map((r, i) => (
                        <div
                          key={`text${i}`}
                          className="absolute border-2 border-orange-400 bg-orange-400/15"
                          style={{
                            left: `${r.x * 100}%`,
                            top: `${r.y * 100}%`,
                            width: `${r.w * 100}%`,
                            height: `${r.h * 100}%`,
                          }}
                        >
                          <span className="absolute right-0 top-0 bg-orange-400 px-1 text-[9px] font-bold leading-tight text-black">
                            {t("workbench.captionBandReserved")}
                          </span>
                        </div>
                      ))}
                      <div className="absolute bottom-1 left-1 rounded bg-black/75 px-1.5 py-0.5 text-[9px] leading-tight text-white">
                        {liveGeom ? "live frame" : "segment agg"} · t=
                        {tSec.toFixed(1)}s
                        {geomSeg
                          ? ` · ${geomSeg.label.content}·person ${geomSeg.label.person}·safe ${geomSeg.label.safe}`
                          : ""}
                        {dbgGeom.face ? "" : " · no face"}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Library rail: content column + a vertical primary-nav strip on the outer edge
            (assets / script-cut / captions / audio / avatar). railW = CONTENT width; the nav strip
            adds RAIL_NAV_W on top so the asset grid's whole-column math stays intact.
            Collapsible to free up the frame: the content column stays mounted as hidden (preserving filters/scroll/generation polling), while the primary nav remains visible.
            When a tool panel (floatWin) is open it **docks and takes the whole content column** (per user: not a new tab):
            a panel title header appears, the asset list is hidden but keeps state; the nav strip stays visible and
            clicking any nav item closes the panel and returns to that tab. */}
          <div
            className="relative flex shrink-0 flex-col"
            style={{
              width: libCollapsed ? RAIL_NAV_W : railW + RAIL_NAV_W + 6,
            }}
          >
            {/* Drag the left edge to resize (260–786 = up to six 120px card columns flush, persisted) */}
            {!libCollapsed && (
              <div
                onPointerDown={(e) => {
                  e.preventDefault();
                  const sx = e.clientX;
                  const w0 = railW;
                  let raf = 0;
                  let last: PointerEvent | null = null;
                  const flush = () => {
                    raf = 0;
                    if (last)
                      setRailW(
                        Math.max(260, Math.min(786, w0 + (sx - last.clientX))),
                      );
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
                    window.removeEventListener("pointermove", mv);
                    window.removeEventListener("pointerup", up);
                    window.removeEventListener("pointercancel", up);
                  };
                  window.addEventListener("pointermove", mv);
                  window.addEventListener("pointerup", up);
                  window.addEventListener("pointercancel", up);
                }}
                title={t("workbench.dragResizePanel")}
                className="hover:bg-accent/40 absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize transition-colors"
              />
            )}
            <div className="flex min-h-0 flex-1 gap-1.5">
              <div
                className={`${libCollapsed ? "hidden" : "flex"} bg-canvas min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-sm`}
              >
                {floatWin ? (
                  <div className="bg-panel flex h-8 shrink-0 items-center gap-1 px-2.5">
                    <span className="text-ink truncate px-1 text-[12px] font-medium">
                      {floatWin === "script"
                        ? t("workbench.smartScriptCut")
                        : floatWin === "person"
                          ? t("workbench.portrait")
                          : floatWin === "anim"
                            ? t("workbench.assetMotion")
                            : floatWin === "captions"
                              ? t("panels.captions")
                              : floatWin === "shot"
                                ? (() => {
                                    const i = (comp.shots ?? []).findIndex(
                                      (s) => s.id === selectedShotId,
                                    );
                                    return (
                                      t("workbench.cameraFraming") +
                                      (i >= 0
                                        ? t("workbench.sceneN", { n: i + 1 })
                                        : "")
                                    );
                                  })()
                                : floatWin === "transition"
                                  ? (() => {
                                      const i =
                                        transitionCut == null
                                          ? -1
                                          : videoShotTimelineSpans(
                                              comp.shots ?? [],
                                              renderVideoPlacements,
                                            ).findIndex(
                                              (sp) =>
                                                Math.abs(
                                                  sp.editedEnd - transitionCut,
                                                ) < 0.05,
                                            );
                                      return (
                                        t("tools.add_transition.label") +
                                        (i >= 0
                                          ? t("workbench.betweenScenes", {
                                              a: i + 1,
                                              b: i + 2,
                                            })
                                          : "")
                                      );
                                    })()
                                  : (() => {
                                      const cb = codeBlockId
                                        ? comp.blocks.find(
                                            (x) => x.id === codeBlockId,
                                          )
                                        : null;
                                      return t("workbench.sourceLabel", {
                                        label: cb?.label || codeBlockId || "",
                                      });
                                    })()}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFloatWin(null)}
                      title={t("workbench.close")}
                      aria-label={t("workbench.closePanel")}
                      className="text-ink-4 hover:text-ink ml-auto rounded p-1"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : null}
                {/* Assets stay mounted (hidden when switched away / covered by a panel, preserving polling/scroll position); themes mount on demand (don't run the cover wall in the background) */}
                <div
                  className={
                    !floatWin && libTab === "assets"
                      ? "flex min-h-0 flex-1 flex-col"
                      : "hidden"
                  }
                >
                  <AssetsPanel
                    comp={comp}
                    projectId={projectId}
                    localAssetIndex={
                      localAssetIndexKnownRef.current
                        ? localAssetIndexRef.current
                        : undefined
                    }
                    localAssetIndexSyncReady={localAssetIndexSyncReady}
                    onLocalAssetIndexChange={changeLocalAssetIndex}
                    onLocalAssetAvailable={acceptLocalAssetFile}
                    videoSig={null}
                    mainSourceUrl={null}
                    hasMainSource={false}
                    onDeleteAsset={deleteAssetSource}
                    isSrcLive={srcLive}
                    onReconnectSource={(src, sig) =>
                      void reconnectSource(src, sig)
                    }
                    onInsert={(m, l, d) =>
                      void insertPanelMedia(m, l, undefined, d)
                    }
                    onInsertClip={(a) =>
                      void insertLibraryClipAt(a, tRef.current)
                    }
                    onInsertElement={insertGeneratedElement}
                    onInsertKit={(cid, props) =>
                      insertTemplateBlock(`kit:${cid}`, props)
                    }
                    onDragAsset={setDragAsset}
                    onOpenGeneration={(type, prompt) =>
                      openGeneration(type, prompt)
                    }
                    onUseAudio={(url, label, sig) =>
                      void audioOps
                        .mountAudioFromUrl(url, label, { sig })
                        .then((id) => id && setSelectedAudioId(id))
                    }
                    genRefreshTick={genRefreshTick}
                  />
                </div>
                {!floatWin && libTab === "frames" && (
                  <div className="flex min-h-0 flex-1">
                    <FramePanel
                      comp={comp}
                      onUse={useFrameInChat}
                      onClear={() => {
                        openChat();
                        chatRef.current?.attachFrame(null);
                      }}
                    />
                  </div>
                )}
                {/* 剪口播 / 字幕 docked as library tabs (siblings of 素材). The same panels also open
              floating from the caption-selected shortcuts / style popover — one component, two mounts;
              floatWin covers the rail, so only one is ever visible. */}
                {!floatWin && libTab === "script" && (
                  <div className="flex min-h-0 flex-1 flex-col">
                    {!useNativeScriptPanel ? (
                      <ScriptPanel
                        sentences={asrSentences}
                        clipSentences={clipAsr}
                        shots={ensureShots(comp)}
                        videoDurationSec={firstAssetDurationSec ?? 0}
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
                    ) : (
                      <TimelineScriptPanel
                        document={editorDocument}
                        extracting={asrBusy}
                        onExtract={() => void extractForScript()}
                        onSeek={(sec) => {
                          applyT(Math.max(0, sec));
                          locateTimeline(true);
                        }}
                        onCut={cutTimelineRanges}
                        onReplaceWord={replaceTimelineScriptWord}
                      />
                    )}
                  </div>
                )}
                {!floatWin && libTab === "audio" && (
                  <MusicPanel
                    clips={comp.audioTracks ?? []}
                    selectedId={selectedAudioId}
                    usable={audioOps.clipUsable}
                    onPatch={audioOps.patchClip}
                    peakOf={(c) =>
                      c.sig ? (audioOps.clipPeaks.get(c.sig) ?? null) : null
                    }
                    shots={
                      selectedVisualClipId
                        ? selectedShot
                          ? [selectedShot]
                          : []
                        : (comp.shots ?? []).filter((sh) =>
                            selectedShotIds.has(sh.id),
                          )
                    }
                    onSetShotAudio={(patch: {
                      volumeDb?: number;
                      fadeInSec?: number;
                      fadeOutSec?: number;
                    }) => {
                      // Multi-select takes the edit as one action: every selected shot, one undo step
                      const ids =
                        selectedVisualClipId && selectedShot
                          ? [selectedShot.id]
                          : (comp.shots ?? [])
                              .filter((sh) => selectedShotIds.has(sh.id))
                              .map((sh) => sh.id);
                      if (!ids.length) return;
                      pushUndoSnapshot();
                      for (const id of ids) setShotAudio(id, patch);
                    }}
                    denoise={{
                      strength: comp.audioDenoise?.strength ?? null,
                      status: denoiseOps.status,
                      progress: denoiseOps.progress,
                    }}
                    onSetDenoise={denoiseOps.setDenoise}
                  />
                )}
                {!floatWin && libTab === "captions" && (
                  <div className="flex min-h-0 flex-1 flex-col">
                    <div data-cap-keep className="contents">
                      <CaptionsPanel {...captionsPanelProps()} />
                    </div>
                  </div>
                )}
                {!floatWin && libTab === "text" && (
                  <DisplayTextPanel
                    block={selectedDisplayTextBlock}
                    onAdd={insertDisplayText}
                    onPatch={patchDisplayText}
                    onPreset={(preset: DisplayTextPresetId, animation: DisplayTextAnimationId) =>
                      patchDisplayText({ preset, animation })
                    }
                  />
                )}
                {!floatWin && libTab === "gen" && (
                  <div className="flex min-h-0 flex-1 flex-col">
                    <div className="bg-panel flex h-8 shrink-0 items-center gap-1 px-2.5">
                      {(
                        [
                          { v: "image", label: "panels.image" },
                          { v: "video", label: "panels.video" },
                          { v: "element", label: "panels.element" },
                          { v: "audio", label: "panels.music" },
                        ] as { v: GenType; label: string }[]
                      ).map((gt) => (
                        <button
                          key={gt.v}
                          type="button"
                          onClick={() => {
                            setGenSeedPrompt(null);
                            setGenType(gt.v);
                          }}
                          className={`rounded-md px-2.5 py-1 text-[12px] transition ${
                            genType === gt.v
                              ? "bg-panel-2 text-ink font-medium"
                              : "text-ink-4 hover:text-ink-2"
                          }`}
                        >
                          {t(gt.label)}
                        </button>
                      ))}
                    </div>
                    <div className="flex min-h-0 flex-1">
                      <GenChatPanel
                        key={genType}
                        projectId={projectId}
                        type={genType}
                        seedPrompt={
                          genSeedPrompt?.type === genType
                            ? genSeedPrompt
                            : undefined
                        }
                        comp={comp}
                        onInsertMedia={(m, l, d) =>
                          void insertPanelMedia(m, l, undefined, d)
                        }
                        onDragAsset={setDragAsset}
                        onSetMainVideo={setMainVideoFromUrl}
                        onInsertElement={insertGeneratedElement}
                        onMention={mentionAsset}
                        generateElement={generateElementStandalone}
                        generateAudio={audioOps.generateAudioAsset}
                        onInsertAudio={(url, label) =>
                          void audioOps
                            .mountAudioFromUrl(url, label)
                            .then((id) => id && setSelectedAudioId(id))
                        }
                      />
                    </div>
                  </div>
                )}
                {!floatWin && libTab === "avatar" && <AvatarPanel />}
                {floatWin && (
                  <div className="flex min-h-0 flex-1">
                    {floatWin === "script" && (
                      !useNativeScriptPanel ? (
                        <ScriptPanel
                          sentences={asrSentences}
                          clipSentences={clipAsr}
                          shots={ensureShots(comp)}
                          videoDurationSec={firstAssetDurationSec ?? 0}
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
                      ) : (
                        <TimelineScriptPanel
                          document={editorDocument}
                          extracting={asrBusy}
                          onExtract={() => void extractForScript()}
                          onSeek={(sec) => {
                            applyT(Math.max(0, sec));
                            locateTimeline(true);
                          }}
                          onCut={cutTimelineRanges}
                          onReplaceWord={replaceTimelineScriptWord}
                        />
                      )
                    )}
                    {floatWin === "code" &&
                      (() => {
                        const cb = codeBlockId
                          ? comp.blocks.find((x) => x.id === codeBlockId)
                          : null;
                        return cb ? (
                          <ElementSourceEditor
                            key={cb.id}
                            block={cb}
                            locked={genIds.has(cb.id)}
                            loop={codeLoop}
                            onLoop={toggleCodeLoop}
                            onDraft={(draft) => handleCodeDraft(cb.id, draft)}
                            onApply={(draft) => handleCodeApply(cb.id, draft)}
                            runAi={(instruction, draft, onNote) =>
                              runCodeAi(cb, instruction, draft, onNote)
                            }
                          />
                        ) : (
                          <div className="text-ink-4 flex flex-1 items-center justify-center gap-2 text-[12px]">
                            {t("workbench.elementDeleted")}
                            <button
                              type="button"
                              onClick={() => setFloatWin(null)}
                              className="text-ink underline"
                            >
                              {t("workbench.close")}
                            </button>
                          </div>
                        );
                      })()}
                    {floatWin === "shot" && selectedShot && (
                      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                        {selectedShot.src?.startsWith("blob:") &&
                          !clipFilesRef.current.has(selectedShot.src) && (
                            <div className="border-line flex items-center gap-2 border-b px-3 py-2">
                              <span className="text-ink-2 min-w-0 flex-1 text-[11px]">
                                {t("workbench.insertSourceMissing")}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  void reconnectSource(
                                    selectedShot.src!,
                                    selectedShot.srcSig,
                                  )
                                }
                                className="bg-accent shrink-0 rounded px-2.5 py-1 text-[11px] font-medium text-white transition hover:brightness-110"
                              >
                                {t("workbench.rePickFile")}
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
                    {floatWin === "transition" && transitionCut != null && (
                      <TransitionPanel
                        effect={
                          cutTransitions(
                            comp.shots ?? [],
                            renderVideoPlacements,
                          ).find(
                            (tr) => Math.abs(tr.cut - transitionCut) < 0.05,
                          )?.effect ?? null
                        }
                        direction={
                          cutTransitions(
                            comp.shots ?? [],
                            renderVideoPlacements,
                          ).find(
                            (tr) => Math.abs(tr.cut - transitionCut) < 0.05,
                          )?.dir ?? "left"
                        }
                        onPick={(ef, dir) =>
                          setCutTransition(transitionCut, ef, dir)
                        }
                      />
                    )}
                    {floatWin === "captions" && (
                      <div data-cap-keep className="contents">
                        <CaptionsPanel {...captionsPanelProps()} />
                      </div>
                    )}
                    {floatWin === "person" && (
                      <PersonFxPanel
                        comp={comp}
                        onChange={setPersonFx}
                        onPrepareLocalImage={preparePickedLocalImage}
                        matte={matteState}
                        selectedShotMatte={(() => {
                          const s = (comp.shots ?? []).find(
                            (x) => x.id === selectedShotId,
                          );
                          return s ? !!s.personMatte : null; // equal standing: any source's segment can enable matte
                        })()}
                        onToggleShotMatte={toggleShotMatte}
                        onRetry={() => {
                          const s = (compRef.current.shots ?? []).find(
                            (x) => x.id === selectedShotIdRef.current,
                          );
                          if (s) void runMatteForShot(s);
                        }}
                      />
                    )}
                    {floatWin === "anim" &&
                      (() => {
                        const b = selectedId
                          ? comp.blocks.find((x) => x.id === selectedId)
                          : null;
                        if (!b) return null; // the auto-close-panel effect takes over immediately
                        return (
                          <MediaAnimPanel
                            anim={
                              (b.slots.anim ?? {}) as {
                                enter?: string;
                                exit?: string;
                                dur?: number;
                              }
                            }
                            onChange={(patch) => {
                              const merged = setBlockAnim(b.id, patch);
                              if (!merged) return;
                              // Click a card to play it once (hf:animPreview runs the tween directly in the active doc, no debounced rebuild);
                              // changing duration replays the current entry so you feel the speed change instantly
                              if (patch.enter !== undefined)
                                postPreview({
                                  type: "hf:animPreview",
                                  id: b.id,
                                  phase: "in",
                                  effect: patch.enter,
                                  dur: merged.dur ?? 0.5,
                                });
                              else if (patch.exit !== undefined)
                                postPreview({
                                  type: "hf:animPreview",
                                  id: b.id,
                                  phase: "out",
                                  effect: patch.exit,
                                  dur: merged.dur ?? 0.5,
                                });
                              else if (patch.dur !== undefined)
                                postPreview({
                                  type: "hf:animPreview",
                                  id: b.id,
                                  phase: "in",
                                  effect: merged.enter ?? "fade",
                                  dur: patch.dur,
                                });
                            }}
                          />
                        );
                      })()}
                  </div>
                )}
              </div>
              {/* Primary nav strip: always visible, including while the content column is collapsed.
              Clicking a tab closes any docked tool panel; collapse/expand aligns with the content header. */}
              <div
                className="bg-canvas flex shrink-0 flex-col overflow-hidden rounded-sm"
                style={{ width: RAIL_NAV_W }}
              >
                <button
                  type="button"
                  onClick={() => setLibCollapsedManual(!libCollapsed)}
                  title={t(
                    libCollapsed
                      ? "workbench.expandAssetsBar"
                      : "workbench.collapseAssetsBar",
                  )}
                  aria-label={t(
                    libCollapsed
                      ? "workbench.expandAssetsBar"
                      : "workbench.collapseAssetsBar",
                  )}
                  className="bg-panel text-ink-4 hover:text-ink flex h-8 w-full shrink-0 items-center justify-center transition-colors"
                >
                  {libCollapsed ? (
                    <ChevronsLeft size={14} />
                  ) : (
                    <ChevronsRight size={14} />
                  )}
                </button>
                <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto px-1 py-2">
                  {(
                    [
                      {
                        v: "assets",
                        icon: LayoutGrid,
                        label: "workbench.assets",
                      },
                      {
                        v: "script",
                        icon: Scissors,
                        label: "workbench.scriptCut",
                      },
                      {
                        v: "captions",
                        icon: Captions,
                        label: "panels.captions",
                      },
                      { v: "text", icon: Type, label: "displayText.title" },
                      { v: "audio", icon: Music, label: "panels.music" },
                      { v: "gen", icon: Sparkles, label: "common.generate" },
                      {
                        v: "avatar",
                        icon: AudioLines,
                        label: "workbench.avatar",
                      },
                      // Themes tab hidden (per user 2026-07-19): the component library is already grouped by theme with its own tokens, mount themes via the chat selector
                    ] as {
                      v:
                        | "assets"
                        | "script"
                        | "captions"
                        | "text"
                        | "audio"
                        | "gen"
                        | "avatar";
                      icon: typeof LayoutGrid;
                      label: string;
                    }[]
                  ).map((n) => (
                    <button
                      key={n.v}
                      type="button"
                      onClick={() => {
                        if (libTab === "gen" && n.v !== "gen")
                          setGenRefreshTick((value) => value + 1);
                        setFloatWin(null);
                        setLibTab(n.v);
                        if (libCollapsed) setLibCollapsedManual(false);
                      }}
                      aria-label={t(n.label)}
                      className={`flex w-full flex-col items-center gap-1 rounded-md py-1.5 transition ${
                        !floatWin && libTab === n.v
                          ? "bg-panel-2 text-ink"
                          : "text-ink-4 hover:text-ink-2"
                      }`}
                    >
                      <n.icon size={15} />
                      <span className="max-w-full truncate px-0.5 text-[9px] leading-none">
                        {t(n.label)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Transport bar. On narrow windows (≤1280) button text must not wrap: when space is short the whole bar scrolls horizontally, don't let "safe zone" stack into three lines */}
        <TooltipProvider delayDuration={200}>
          <div className="bg-panel flex items-center gap-3 overflow-x-auto rounded-t-sm py-2 pl-4 whitespace-nowrap [&>button]:shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={togglePlaybackFromUserGesture}
                  disabled={!hasContent}
                  className="bg-ink text-bg inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full disabled:opacity-40"
                  aria-label={
                    playing ? t("tools.pause.label") : t("tools.play.label")
                  }
                >
                  {playing ? (
                    <Pause size={15} />
                  ) : (
                    <Play size={15} className="ml-0.5" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {playing ? t("workbench.pauseSpace") : t("workbench.playSpace")}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => locateTimeline()}
                  disabled={!hasContent}
                  className="hover:bg-panel-2 shrink-0 rounded px-1 disabled:pointer-events-none"
                  aria-label={t("workbench.scrollPlayhead")}
                >
                  <TimeReadout duration={hasContent ? duration : 0} />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t("workbench.scrollPlayhead")}</TooltipContent>
            </Tooltip>
            {/* Undo/redo + editing (on the shot at the playhead, icons only): split / trim left / trim right — ][ glyph, dashed side = the side being trimmed */}
            <div className="text-ink-3 ml-1 flex shrink-0 items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={undoLast}
                    disabled={!canUndo}
                    aria-label={t("tools.undo.label")}
                    className="hover:text-ink hover:bg-panel-2 rounded p-1 disabled:opacity-40"
                  >
                    <Undo2 size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t("workbench.undoShortcut")}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={redoLast}
                    disabled={!canRedo}
                    aria-label={t("workbench.redo")}
                    className="hover:text-ink hover:bg-panel-2 rounded p-1 disabled:opacity-40"
                  >
                    <Redo2 size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t("workbench.redoShortcut")}</TooltipContent>
              </Tooltip>
              <div className="bg-line mx-0.5 h-4 w-px shrink-0" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => insertDisplayText("clean")}
                    aria-label={t("displayText.add")}
                    className="text-ink-3 hover:text-ink hover:bg-panel-2 flex h-7 min-w-7 items-center justify-center rounded px-1.5 font-serif text-[15px] font-bold"
                  >
                    T
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t("displayText.addAtPlayhead")}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={splitAtPlayhead}
                    disabled={!hasSplitSelection}
                    aria-label={t("workbench.split")}
                    className="hover:text-ink hover:bg-panel-2 rounded p-1 disabled:opacity-40"
                  >
                    <BracketCutIcon />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t("workbench.split")}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => trimAtPlayhead("left")}
                    disabled={!hasVideoTrack && !selectedAudioId}
                    aria-label={t("workbench.trimLeft")}
                    className="hover:text-ink hover:bg-panel-2 rounded p-1 disabled:opacity-40"
                  >
                    <BracketCutIcon dashed="left" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t("workbench.trimLeft")}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => trimAtPlayhead("right")}
                    disabled={!hasVideoTrack && !selectedAudioId}
                    aria-label={t("workbench.trimRight")}
                    className="hover:text-ink hover:bg-panel-2 rounded p-1 disabled:opacity-40"
                  >
                    <BracketCutIcon dashed="right" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t("workbench.trimRight")}</TooltipContent>
              </Tooltip>
            </div>
            {/* Delete selection: works for shots/components alike (same guard as the Delete key: don't delete while generating / keep at least one shot) */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedVisualClipId)
                      deleteVisualClip(selectedVisualClipId);
                    else if (selectedId) removeBlock(selectedId);
                    else if (selectedShotIds.size) deleteShots(selectedShotIds); // bulk multi-select; single degrades automatically
                  }}
                  disabled={
                    !selectedVisualClipId &&
                    !selectedId &&
                    selectedShotIds.size === 0
                  }
                  aria-label={t("workbench.deleteSelection")}
                  className="text-ink-3 hover:bg-panel-2 ml-1 rounded p-1 hover:text-destructive disabled:opacity-40"
                >
                  <Trash2 size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {selectedShotIds.size > 1
                  ? t("workbench.deleteNScenes", { n: selectedShotIds.size })
                  : t("workbench.deleteSelection")}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedTimelineClip) return;
                    setTimelineClipEnabled(
                      selectedTimelineClip.trackId,
                      selectedTimelineClip.entry.clipId,
                      !selectedTimelineClip.entry.clip.enabled,
                    );
                  }}
                  disabled={!canToggleSelectedClip}
                  aria-label={
                    selectedTimelineClip?.entry.clip.enabled === false
                      ? t("panels.enableClip")
                      : t("panels.disableClip")
                  }
                  className={`rounded p-1 disabled:opacity-40 ${selectedTimelineClip?.entry.clip.enabled === false ? "text-accent bg-panel-2" : "text-ink-3 hover:text-ink hover:bg-panel-2"}`}
                >
                  <Power size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {selectedTimelineClip?.entry.clip.enabled === false
                  ? t("panels.enableClip")
                  : t("panels.disableClip")}
              </TooltipContent>
            </Tooltip>
            {/* 剪口播 / 字幕 moved to the library rail tabs (siblings of 素材); the caption-selected
              shortcuts + style popover still open them floating. */}
            {/* Person: matte global config (feather/stroke/background swap); which components go behind the person is on the component toolbar */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(e) =>
                    floatWin === "person"
                      ? setFloatWin(null)
                      : openFloatAt(
                          "person",
                          e.currentTarget.getBoundingClientRect(),
                        )
                  }
                  disabled={!hasVideoTrack || !selectedShotId}
                  aria-label={t("workbench.portrait")}
                  className={`ml-1 rounded p-1 disabled:opacity-40 ${floatWin === "person" ? "text-ink bg-panel-2" : "text-ink-3 hover:text-ink hover:bg-panel-2"}`}
                >
                  <UserRound size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {t("workbench.smartCutoutPersonTop")}
              </TooltipContent>
            </Tooltip>
            {/* Audio settings: opens the rail's audio tab (selected clip, or the video's own sound) */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={openAudioTab}
                  disabled={!hasVideoTrack}
                  aria-label={t("panels.music")}
                  className={`rounded p-1 disabled:opacity-40 ${!floatWin && libTab === "audio" ? "text-ink bg-panel-2" : "text-ink-3 hover:text-ink hover:bg-panel-2"}`}
                >
                  <Music size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent>{t("panels.music")}</TooltipContent>
            </Tooltip>
            <div className="flex-1" />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="switch"
                  aria-checked={timelineSnapEnabled}
                  onClick={togglePrimaryAutoSnap}
                  aria-label={t("workbench.timelineAutoSnap")}
                  className={`mr-1 rounded p-1.5 ${timelineSnapEnabled ? "bg-accent/12 text-accent" : "text-ink-4 hover:bg-panel-2 hover:text-ink"}`}
                >
                  <Magnet size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {t(
                  timelineSnapEnabled
                    ? "workbench.timelineAutoSnapOn"
                    : "workbench.timelineAutoSnapOff",
                )}
              </TooltipContent>
            </Tooltip>
            {/* Timeline zoom: − thin slider + (borderless, vertically centered) */}
            <div className="text-ink-3 flex shrink-0 items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() =>
                      setPps((p) => Math.max(MIN_PPS, Math.round(p / 1.4)))
                    }
                    disabled={pps <= MIN_PPS}
                    aria-label={t("workbench.zoomOutTimeline")}
                    className="hover:text-ink flex items-center disabled:opacity-40"
                  >
                    <Minus size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {t("workbench.zoomOutTimelineLabel")}
                </TooltipContent>
              </Tooltip>
              <input
                type="range"
                min={MIN_PPS}
                max={MAX_PPS}
                step={1}
                value={pps}
                onChange={(e) => setPps(Number(e.target.value))}
                className="zoom-range w-24"
                aria-label={t("workbench.timelineZoom")}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() =>
                      setPps((p) => Math.min(MAX_PPS, Math.round(p * 1.4)))
                    }
                    disabled={pps >= MAX_PPS}
                    aria-label={t("workbench.zoomInTimeline")}
                    className="hover:text-ink flex items-center disabled:opacity-40"
                  >
                    <Plus size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {t("workbench.zoomInTimelineLabel")}
                </TooltipContent>
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
                      aria-label={t("workbench.debugTranscriptVisualAnalysis")}
                      className={`rounded p-1.5 ${showDebug ? "text-ink bg-panel-2" : "text-ink-4 hover:text-ink"}`}
                    >
                      <FlaskConical size={14} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {t("workbench.analysisDebug")}
                  </TooltipContent>
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
                    disabled={exporting || publishing || !hasContent}
                    className="border-line text-ink-2 hover:text-ink inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12px] disabled:opacity-50"
                  >
                    {exporting || publishing ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <FileVideo size={14} />
                    )}{" "}
                    {exporting
                      ? t("workbench.exportingPctShort", { pct: exportPct })
                      : publishing
                        ? t("workbench.renderingPct", { pct: exportPct })
                        : t("workbench.export")}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{t("tools.export_video.label")}</TooltipContent>
              </Tooltip>
              <Dialog
                open={exportOpen}
                onOpenChange={(v) => {
                  if (!v && exporting) return;
                  setExportOpen(v);
                }}
              >
                <DialogContent
                  className="max-w-[320px]"
                  showCloseButton={!exporting}
                >
                  <DialogHeader>
                    <DialogTitle>{t("tools.export_video.label")}</DialogTitle>
                  </DialogHeader>
                  {exporting ? (
                    // Export dialog stays open: progress lives here, only "cancel export" can close it (overlay/Esc are blocked)
                    <div className="flex flex-col gap-3">
                      <div className="bg-line h-1.5 overflow-hidden rounded-full">
                        <div
                          className="bg-accent h-full rounded-full transition-[width] duration-300 ease-out"
                          style={{ width: `${exportPct}%` }}
                        />
                      </div>
                      <p className="text-ink-3 text-[12px]">
                        {t("workbench.renderingPctDownloads", {
                          pct: exportPct,
                        })}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          cancelExport();
                          setExportOpen(false);
                        }}
                        className="border-line text-ink-2 hover:text-ink inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-[13px]"
                      >
                        <X size={14} /> {t("workbench.cancelExport")}
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <ExportOptRow
                        label={t("chatGen.resolution")}
                        value={exportOpts.res}
                        options={[
                          [2160, "4K"],
                          [1440, "2K"],
                          [1080, "1080p"],
                          [720, "720p"],
                          [540, "540p"],
                        ]}
                        onPick={(res) => setExportOpts((o) => ({ ...o, res }))}
                      />
                      <ExportOptRow
                        label={t("workbench.frameRate")}
                        value={exportOpts.fps}
                        options={[
                          [24, "24"],
                          [30, "30"],
                          [60, "60"],
                        ]}
                        onPick={(fps) => setExportOpts((o) => ({ ...o, fps }))}
                      />
                      <ExportOptRow
                        label={t("workbench.format")}
                        value={exportOpts.format}
                        options={[
                          ["mp4", "MP4"],
                          ["mov", "MOV"],
                          ["webm", "WebM"],
                        ]}
                        onPick={(format) =>
                          setExportOpts((o) => ({ ...o, format }))
                        }
                      />
                      <p className="text-ink-4 text-[11px] leading-relaxed">
                        {t("workbench.downloadsAutomaticallyWhenExport")}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          // Keep the dialog to show progress, close only when compositing ends (done/failed/cancelled)
                          void exportVideo(exportOpts).finally(() =>
                            setExportOpen(false),
                          );
                        }}
                        className="bg-ink text-bg inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-medium hover:opacity-90"
                      >
                        <Download size={14} /> {t("workbench.startExport")}
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
                  <TooltipContent>
                    {t("workbench.stopRendering")}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </TooltipProvider>

        {/* Caption style popover: reuses CaptionsPanel wholesale; clicking a style applies globally, click outside / Esc dismisses */}
        {/* Multi-track timeline */}
        <div data-cap-keep className="shrink-0 overflow-hidden rounded-b-sm">
          <StudioTimeline
            comp={comp}
            directorScenes={showDebug ? directorTimelineScenes : undefined}
            videoPlacements={videoPlacements}
            timelineDurationSec={duration}
            playing={playing}
            locateSignal={locateSignal}
            locateNear={locateNear}
            selectedShotIds={selectedShotIds}
            selectedVisualClipId={selectedVisualClipId}
            selectedBlockIds={selectedBlockIds}
            filmstrip={filmstrip}
            clipStrips={clipStrips}
            onFilmstripDemandChange={setTimelineFilmstripDemand}
            mainLive
            srcLive={srcLive}
            pps={pps}
            snapEnabled={timelineSnapEnabled}
            framePickActive={timelineFramePickActive}
            framePickFps={editorDocument.canvas.fps}
            onPickFrame={pickTimelineFrame}
            assetDragging={!!dragAsset}
            assetDragKind={dragAsset?.type ?? null}
            selectedAudioId={selectedAudioId}
            videoMuted={videoTrackMuted}
            videoHidden={videoTrackHidden}
            audioMuted={audioTrackMuted}
            trackStates={timelineTrackStates}
            disabledClipIds={disabledClipIds}
            audioPeaks={audioOps.audioPeaks}
            sourcePeaks={audioOps.sourcePeaks}
            shotSourceDurations={shotSourceDurations}
            clipPendingAt={clipPending}
            {...timelineCbs}
          />
        </div>

        {/* Test hook: narration script + visual analysis (read-only) */}
        {showDebug && (
          <div className="border-line flex h-44 flex-col border-t">
            <div className="border-line text-ink-4 flex items-center gap-2 border-b px-3 py-1.5 text-[11px]">
              <span>{t("workbench.transcriptVisualAnalysisRead")}</span>
              <div className="ml-auto flex items-center gap-1.5">
                {/* Face/safe-zone overlay (folded in from the old toolbar button): overlay face (red)/subject (blue)/safe zone (green) on the preview */}
                <button
                  type="button"
                  onClick={() => setShowGeom((s) => !s)}
                  disabled={!visual}
                  className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] disabled:opacity-40 ${showGeom ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-600" : "border-line text-ink-3 hover:text-ink hover:bg-panel-2"}`}
                >
                  <ScanFace size={11} /> {t("workbench.facesSafeZones")}
                </button>
                {/* assembled HTML (folded in from the old toolbar button) */}
                <button
                  type="button"
                  onClick={() => setShowCode((s) => !s)}
                  className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] ${showCode ? "border-line bg-panel-2 text-ink" : "border-line text-ink-3 hover:text-ink hover:bg-panel-2"}`}
                >
                  <Code2 size={11} /> {t("workbench.source")}
                </button>
                <button
                  type="button"
                  onClick={() => void rerunVisual()}
                  disabled={!videoFile || !firstAssetDurationSec}
                  className="border-line text-ink-3 hover:text-ink hover:bg-panel-2 rounded border px-2 py-0.5 text-[11px] disabled:opacity-40"
                >
                  {t("workbench.clearCacheRerunVisual")}
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
            <div className="border-line text-ink-4 border-b px-3 py-1.5 text-[11px]">
              {t("workbench.assembledHtmlBuiltFrom")}
            </div>
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
