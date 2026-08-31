'use client';

/**
 * Pro multi-track timeline (Google Vids style).
 *
 * Track 0 = primary and inserted video: filmstrip base with shot slices on top (each with its own
 *   camera treatment; a plain boundary is a hard cut and transitions are explicit elements).
 *   Track >=1 = overlay elements (captions/title/stat/list/transition...): each block has a
 *   type icon + label (shows time range when selected), is draggable whole, trimmable at both
 *   ends, and clickable to open in the right-side chat.
 *   Left gutter shows a type icon per track; top zoom bar (in/out/fit); ruler major/minor ticks;
 *   draggable playhead.
 *
 * All x are measured relative to the content layer (contentRef); snaps to whole seconds /
 * shot cut points / block, caption and audio edges / playhead.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Clapperboard, Eye, EyeOff, Film, Loader2, Music, Plus, VideoOff, Volume2, VolumeX } from 'lucide-react';
import {
  type Block,
  type BlockKind,
  type Composition,
  blockKind,
  cutTransitions,
  MAX_TRANSITION_SEC,
  totalDuration,
  isSentenceCaption,
  videoShotTimelineSpans,
  videoTrackShots,
} from '@pireel/studio-engine/composition';
import { shotFadeAt } from '@pireel/studio-engine/composition';
import type { NarrativeTimelinePlacement } from './primary-render-plan';
import { KIND_META } from './kind-meta';
import { blockDisplayTitle } from './block-display-title';
import { t } from './i18n';
import { playhead } from './playhead';
import {
  type FilmstripFrame,
  type FilmstripSourceRange,
  filmstripSourceRangeForTimelineWindow,
} from './media';
import {
  CAP_LANE,
  EDGE_PAD,
  GUTTER,
  KIND_CHIP,
  MAX_PPS,
  MIN_DUR,
  MIN_PPS,
  ROW_GAP,
  AUDIO_ROW_H,
  ROW_H,
  RULER_H,
  SCENE_H,
  SCENE_PAD_B,
  SCENE_PAD_T,
  SHOT_GAP,
  TIMELINE_ITEM_EDGE_RADIUS,
  TIMELINE_ITEM_RADIUS,
  TREATMENT_NAME,
  VISUAL_SCENE_H,
  VISUAL_SCENE_PAD_B,
  VISUAL_SCENE_PAD_T,
  fmtTick,
  packedPrimaryPlacement,
  quantizeTimelineFrameSecond,
  rulerStep,
  stripTiles,
  timelinePointerSecond,
  timelineResizeSurfaceDuration,
  timelineSourceResizeEnd,
  visibleStripTiles,
} from './timeline-utils';
import { FramePickCursor, HoverCursor, PlayheadCursor } from './timeline-overlays';
import { AudioLane, type AudioLaneMoveTarget } from './timeline-audio-lane';
import {
  timelineAudioLanes,
  timelineCompatibleTrackDropTarget,
  timelineTrackDisplayOrder,
  timelineTrackDropTarget,
  type TimelineTrackDropTarget,
} from './timeline-audio-tracks';
import { draggedPlayheadSecond, snapTimelineSecond, timelineSnapPoints } from './timeline-snap';
import { WAVE_FLOOR_DB, fadeBodyPath, waveBars } from './timeline-wave';
import { DirectorSceneStrip, DIRECTOR_SCENE_STRIP_H, type TimelineDirectorScene } from './director-scene-strip';
import type { TimelineInsertMode, TimelineMediaDropTarget, TimelineVisualDropTarget } from './timeline-asset-drop';

export { DEFAULT_PPS, MAX_PPS, MIN_PPS } from './timeline-utils';

/** Height of the audio strip drawn along the bottom of each scene card (the video's own sound). */
const SCENE_WAVE_H = 18;
/** Professional NLEs keep a permanent bottom drop zone instead of inserting a temporary dashed row. */
const VISUAL_TRACK_DROP_ZONE_H = 38;
const VIDEO_CLIP_H = SCENE_H - SCENE_PAD_T - SCENE_PAD_B;
const VISUAL_VIDEO_CLIP_H = VISUAL_SCENE_H - VISUAL_SCENE_PAD_T - VISUAL_SCENE_PAD_B;

export interface TimelineTrackState {
  trackId: string;
  timelineIndex: number;
  type: 'visual' | 'graphics' | 'caption' | 'audio';
  role?: string;
  stackOrder: number;
  hidden: boolean;
  muted: boolean;
  ranges?: readonly { clipId: string; startSec: number; endSec: number }[];
  clips?: readonly TimelineVisualClipState[];
}

export interface TimelineVisualClipState {
  clipId: string;
  startSec: number;
  endSec: number;
  kind: 'image' | 'video';
  label?: string;
  source?: string;
  sourceInSec: number;
  sourceOutSec: number;
  sourceDurationSec?: number;
  usePrimaryFilmstrip?: boolean;
  enabled: boolean;
}

type TimelineLaneKey = number | `visual:${string}` | `audio:${string}`;
const visualLaneKey = (trackId: string): TimelineLaneKey => `visual:${trackId}`;
const visualTrackId = (lane: TimelineLaneKey): string | null => typeof lane === 'string' && lane.startsWith('visual:') ? lane.slice('visual:'.length) : null;
const audioLaneKey = (trackId: string): TimelineLaneKey => `audio:${trackId}`;
const audioTrackId = (lane: TimelineLaneKey): string | null => typeof lane === 'string' && lane.startsWith('audio:') ? lane.slice('audio:'.length) : null;

export interface TimelineBlockTrackTarget {
  trackId?: string;
  stackOrder: number;
}

interface StudioTimelineProps {
  comp: Composition;
  /** Admin/debug-only Director Plan intervals. Omit for the ordinary editing timeline. */
  directorScenes?: readonly TimelineDirectorScene[];
  /** Canonical V2 placements. Omit only for legacy contiguous compositions. */
  videoPlacements?: readonly NarrativeTimelinePlacement[];
  /** Canonical document duration, including empty-primary graphics/audio regions. */
  timelineDurationSec?: number;
  /** During playback: auto-scroll to follow the playhead when it leaves the viewport (stops if the user scrolls manually, until next play). */
  playing: boolean;
  /** Locate signal: each increment = scroll the timeline to the current playhead (transport readout, or a
   *  jump made from another panel). */
  locateSignal: number;
  /** With the current signal, only scroll if the playhead is off-screen (a jump from elsewhere, e.g. clicking
   *  a word in the script) instead of re-centring a view that already shows it. */
  locateNear?: boolean;
  /** Shot multi-select set (Cmd-click / marquee): highlight + batch delete + playhead ring yields. Single select = a one-element set. */
  selectedShotIds: Set<string>;
  /** Selected native media clip on a non-primary visual lane. */
  selectedVisualClipId?: string | null;
  /** Block multi-select set (Cmd-click / marquee, can span multiple element tracks): highlight + batch delete. Single select = a one-element set. */
  selectedBlockIds: Set<string>;
  filmstrip?: FilmstripFrame[];
  /** Zoom (px/sec) is controlled: value and setter both come from the transport slider. */
  pps: number;
  onPps: React.Dispatch<React.SetStateAction<number>>;
  /** Global direct-manipulation magnet. Off means exact free placement with no edge/second snapping. */
  snapEnabled?: boolean;
  /** Inspector-style Chat frame picking: hover previews the real timeline, click returns one exact frame. */
  framePickActive?: boolean;
  framePickFps?: number;
  onPickFrame?: (atSec: number) => void;
  onSeek: (t: number) => void;
  /** Hover preview: seek the center player to this time (without moving the playhead); null = restore to the playhead. */
  onScrub: (t: number | null) => void;
  onSelect: (id: string | null) => void;
  /** Select a shot. additive = Cmd/Ctrl multi-select (toggle in/out of the set). */
  onSelectShot: (id: string, additive?: boolean) => void;
  /** Marquee: drag a rectangle from the scene track's top/bottom gap; dragging a card moves that clip in time. */
  onBoxSelectShots: (ids: string[]) => void;
  /** Move a primary clip in time or onto another visual lane. The destination uses overwrite semantics. */
  onMoveShot?: (id: string, startSec: number, target: TimelineMediaDropTarget) => void;
  /** Trim/extend a primary clip from either edge; packed-edge extensions ripple the magnetic main track. */
  onResizeShot?: (id: string, edge: 'left' | 'right', atSec: number) => void;
  /** Slip a shot's source window by SOURCE seconds (position/duration fixed). Alt-drag on the body. */
  onSlipShot?: (id: string, sourceDeltaSec: number) => void;
  /** Move a block across physical tracks. trackId is canonical; stackOrder is retained only for legacy hosts. */
  onMoveBlockTrack?: (id: string, target: TimelineBlockTrackTarget, startSec: number) => void;
  /** Drag a block into any native row boundary and create a graphics track at that document index. */
  onMoveBlockNewTrack?: (id: string, newTrackIndex: number, startSec: number) => void;
  /** Select a block. additive = Cmd/Ctrl multi-select (toggle in/out of the set, without moving the playhead). */
  onSelectBlock: (id: string, additive?: boolean) => void;
  /** Marquee blocks: drag a rectangle over empty element-track space (can span tracks); matched block ids all become the multi-select set. */
  onBoxSelectBlocks: (ids: string[]) => void;
  /** Click empty space: clear all selection (blocks + shots). */
  onDeselectAll: () => void;
  onMoveBlock: (id: string, newStartSec: number) => void;
  onResizeBlock: (id: string, newStartSec: number, newDurationSec: number) => void;
  /** Managed caption edge trim. The caption remains source-anchored; only its display window changes. */
  onResizeCaption?: (id: string, edge: 'left' | 'right', atSec: number) => void;
  /** Visual track reorder (gutter drag): preserve physical ids; stackOrder alone is not identity. */
  onReorderTracks: (topToBottom: TimelineBlockTrackTarget[]) => void;
  /** A panel asset is being dragged: the timeline exposes primary, existing visual and new visual-lane targets. */
  assetDragging?: boolean;
  /** Image on a graphics row stays a PiP component; image/video on visual targets become native V2 media clips. */
  assetDragKind?: 'image' | 'video' | 'audio' | 'element' | null;
  /** Asset (image) dropped on a non-main-track area: report the drop time (sec); workbench inserts an asset block there. */
  onDropAsset?: (t: number) => void;
  /** Native media drop. Normal drop is an exact overwrite on the selected lane; Cmd/Ctrl-drop is Ripple. */
  onDropAssetClip?: (t: number, target: TimelineMediaDropTarget, mode: TimelineInsertMode) => void;
  /** Move an existing visual clip horizontally, back to primary, or to another/new visual lane. */
  onMoveVisualClip?: (clipId: string, startSec: number, target: TimelineMediaDropTarget) => void;
  /** Trim/extend an ordinary visual-lane clip from one timeline edge. */
  onResizeVisualClip?: (clipId: string, edge: 'left' | 'right', atSec: number) => void;
  /** Select one native visual clip. Selection is mutually exclusive with shots, blocks and audio. */
  onSelectVisualClip?: (clipId: string) => void;
  /** Audio asset dropped anywhere on the timeline: add a clip starting at the drop time (music lane). */
  onDropAssetAudio?: (t: number) => void;
  /** Audio chip dragged in time or between native audio lanes. */
  onMoveAudio?: (id: string, startSec: number, target?: AudioLaneMoveTarget) => void;
  /** Music-lane edge handle released: commit the trim patch (in/out points, computed by audioTrimPatch). */
  onTrimAudio?: (id: string, patch: { startSec?: number; inSec?: number; outSec?: number }) => void;
  /** Music-lane fade knee released: commit that clip's fade length (seconds). */
  onFadeAudio?: (id: string, edge: 'in' | 'out', sec: number) => void;
  /** Per-clip mute, independent from the audio track mute toggle. */
  onToggleAudioClipMute?: (id: string, muted: boolean) => void;
  /** Peak envelopes per clip sig (lane waveform); absent = bytes not mounted, chip draws label-only. */
  audioPeaks?: Map<string, Float32Array>;
  /** Peak envelopes per VIDEO source ('main' / insert-clip url): the scene cards draw their own audio. */
  sourcePeaks?: Map<string, { peaks: Float32Array; durationSec: number }>;
  /** Track-level mute (the speaker icon in front of each track): silences that whole track — every shot's
   *  own sound, or every clip on the music lane. A composition decision, so the export honours it. */
  videoMuted?: boolean;
  onToggleVideoMute?: () => void;
  videoHidden?: boolean;
  onToggleVideoHidden?: () => void;
  audioMuted?: boolean;
  onToggleAudioMute?: () => void;
  trackStates?: readonly TimelineTrackState[];
  /** Track-level mute for ordinary media lanes. Images remain visible; video source audio is silenced. */
  onToggleTrackMute?: (trackId: string) => void;
  onToggleTrackHidden?: (trackId: string) => void;
  disabledClipIds?: ReadonlySet<string>;
  /** Music-lane selection (shared with the audio panel; Del deletes the selected clip in workbench). */
  selectedAudioId?: string | null;
  onSelectAudio?: (id: string | null) => void;
  /** Click a chip (no drag): select + open the audio panel. */
  onOpenMusicPanel?: () => void;
  /** Filmstrips for externally inserted clips (shotId -> frames, t = the clip's own source time). */
  clipStrips?: Record<string, FilmstripFrame[]>;
  /** Visible timeline window translated into source-clock thumbnail demand. */
  onFilmstripDemandChange?: (demand: Record<string, FilmstripSourceRange[]>) => void;
  /** Per-asset missing-source UI: is the main source's File loaded this session? Default true (hosts without the signal). */
  mainLive?: boolean;
  /** Per-asset missing-source UI: are this clip source's bytes reachable? Default live. */
  srcLive?: (src: string) => boolean;
  /** Shot boundary transition hotspot: click to pick a transition effect in the shared popover (cutSec = that boundary's edited-time). */
  onOpenTransition?: (cutSec: number, anchor: DOMRect) => void;
  /** Transition handles drag on both sides (symmetric): commit the new total duration (sec, <=4). */
  onResizeTransition?: (shotId: string, durationSec: number) => void;
  /** External clip insert in progress (download/upload/reading duration): draw an "inserting" badge at that edited-time so the user doesn't think it failed. */
  clipPendingAt?: number | null;
}

/** memo: callback props have stable identity via the workbench's useStableCallbacks; timeline-irrelevant
 *  state changes in the workbench (export progress / panel switch / generating state) no longer re-render this big tree. comp changes still render as usual. */
export const StudioTimeline = memo(StudioTimelineImpl);

/** Track mute toggle (track header): the NLE speaker icon, in front of the track it silences. Mute is a
 *  TRACK property here rather than a per-clip one — "quiet the music while I listen to the cut" is a
 *  statement about a track, and per-item silencing is already the level slider's bottom stop. */
/** Missing-source strip: the shot stays editable (cut/trim/delete all cloud-backed), only its frames
 *  can't render on this device — hatched fill + label instead of a blank/misleading filmstrip. */
function MissingStrip() {
  return (
    <div className="bg-panel-2 absolute inset-0 flex items-center justify-center gap-1 bg-[repeating-linear-gradient(45deg,rgba(148,163,184,0.14)_0_5px,transparent_5px_10px)]">
      <VideoOff size={11} className="text-ink-4 shrink-0" />
      <span className="text-ink-4 truncate text-[9px]">{t('workbench.srcMissing')}</span>
    </div>
  );
}

function MuteToggle({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={muted}
      aria-label={muted ? t('panels.unmuteTrack') : t('panels.muteTrack')}
      onPointerDown={(e) => e.stopPropagation()} // the row itself starts a track drag
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`hover:bg-panel-2 flex h-4 w-4 items-center justify-center rounded transition ${muted ? 'text-accent' : 'text-ink-4 hover:text-ink-2'}`}
    >
      {muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
    </button>
  );
}

function VisibilityToggle({ hidden, onToggle }: { hidden: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!hidden}
      aria-label={hidden ? t('panels.showTrack') : t('panels.hideTrack')}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={`hover:bg-panel-2 flex h-4 w-4 items-center justify-center rounded transition ${hidden ? 'text-accent' : 'text-ink-4 hover:text-ink-2'}`}
    >
      {hidden ? <EyeOff size={12} /> : <Eye size={12} />}
    </button>
  );
}

function StudioTimelineImpl({
  comp,
  directorScenes,
  videoPlacements,
  timelineDurationSec,
  playing,
  locateSignal,
  locateNear,
  selectedShotIds,
  selectedVisualClipId,
  selectedBlockIds,
  filmstrip,
  pps,
  onPps,
  snapEnabled = true,
  framePickActive = false,
  framePickFps = 30,
  onPickFrame,
  onSeek,
  onScrub,
  onSelect,
  onSelectShot,
  onBoxSelectShots,
  onMoveShot,
  onResizeShot,
  onSlipShot,
  onMoveBlockTrack,
  onMoveBlockNewTrack,
  onSelectBlock,
  onBoxSelectBlocks,
  onDeselectAll,
  onMoveBlock,
  onResizeBlock,
  onResizeCaption,
  onReorderTracks,
  assetDragging,
  assetDragKind,
  onDropAsset,
  onDropAssetClip,
  onMoveVisualClip,
  onResizeVisualClip,
  onSelectVisualClip,
  onDropAssetAudio,
  onMoveAudio,
  onTrimAudio,
  onFadeAudio,
  onToggleAudioClipMute,
  audioPeaks,
  sourcePeaks,
  videoMuted,
  onToggleVideoMute,
  videoHidden,
  onToggleVideoHidden,
  audioMuted,
  onToggleAudioMute,
  trackStates,
  onToggleTrackMute,
  onToggleTrackHidden,
  disabledClipIds,
  selectedAudioId,
  onSelectAudio,
  onOpenMusicPanel,
  onOpenTransition,
  onResizeTransition,
  clipPendingAt,
  clipStrips,
  onFilmstripDemandChange,
  mainLive = true,
  srcLive,
}: StudioTimelineProps) {
  const dur = timelineDurationSec ?? totalDuration(comp);
  const hasDirectorScenes = !!directorScenes?.length;
  const shots = useMemo(() => videoTrackShots(comp), [comp]);
  const placementEnabled = useMemo(
    () => new Map(videoPlacements?.map((placement) => [placement.shotId, placement.enabled] as const) ?? []),
    [videoPlacements],
  );
  const activeVideoPlacements = useMemo(
    () => videoPlacements?.filter((placement) => placement.enabled),
    [videoPlacements],
  );
  // V2 placements are native timeline geometry: visible blank regions stay blank instead of being compacted.
  const sceneSpans = useMemo(
    () => videoShotTimelineSpans(shots, videoPlacements).map((sp) => ({ shot: sp.clip, start: sp.editedStart, end: sp.editedEnd })),
    [shots, videoPlacements],
  );
  const hasVideoLane = sceneSpans.length > 0;
  /** Scene-card audio bands, precomputed per shot. These are the timeline's heaviest drawing by far — one
   *  path with up to WAVE_MAX_BARS sub-paths per card — and they depend only on the cut, the zoom and that
   *  shot's own audio. Building them inside the render meant every unrelated gesture that re-renders the
   *  timeline (trimming a lane clip, 60 times a second) rebuilt every card's waveform, which is what makes
   *  the drag stutter. Nothing here reads the drag state, so this memo survives the whole gesture. */
  const sceneWaves = useMemo(() => {
    const out = new Map<string, { body: string; wave: string }>();
    if (!sourcePeaks?.size) return out;
    for (let i = 0; i < sceneSpans.length; i++) {
      const { shot, start, end } = sceneSpans[i]!;
      const sp = sourcePeaks.get(shot.src ?? 'main');
      const w = Math.max(8, (end - start) * pps - (i < sceneSpans.length - 1 ? SHOT_GAP : 0));
      if (!sp || sp.durationSec <= 0 || w < 6) continue;
      const per = sp.peaks.length / sp.durationSec;
      const len = Math.max(0.01, shot.srcEnd - shot.srcStart);
      const faded = !!(shot.audioFadeInSec || shot.audioFadeOutSec);
      out.set(shot.id, {
        body: fadeBodyPath(w, SCENE_WAVE_H, shot.audioFadeInSec ?? 0, shot.audioFadeOutSec ?? 0, len),
        wave: waveBars(
          sp.peaks,
          Math.floor(shot.srcStart * per),
          Math.ceil(shot.srcEnd * per),
          w,
          SCENE_WAVE_H,
          shot.audioMuted ? WAVE_FLOOR_DB : (shot.volumeDb ?? 0),
          // shot fades shape the band exactly as they shape a lane clip's wave
          faded ? (f) => shotFadeAt(shot, f * len, len) : undefined,
        ),
      });
    }
    return out;
  }, [sceneSpans, sourcePeaks, pps]);
  // Filmstrip tiles (like a mainstream editor): square tiles (width=height, object-cover crop), grid anchored on **source time** —
  // each card just "windows" (stripTiles) the continuous strip; after split/trim each segment continues the original strip, never re-laying-out trailing segments
  // Card = thumbnails on top, the footage's own audio strip beneath them (never overlaid — a wave drawn on
  // the picture is unreadable). Tiles stay square against the film area, so its height drives their width.
  const filmH = SCENE_H - SCENE_PAD_T - SCENE_PAD_B - SCENE_WAVE_H;
  const thumbW = filmH;
  const tileDur = thumbW / pps; // source duration one tile covers
  const visualFilmH = VISUAL_VIDEO_CLIP_H - SCENE_WAVE_H;
  const visualThumbW = visualFilmH;
  const visualTileDur = visualThumbW / pps;
  const [guide, setGuide] = useState<number | null>(null); // snap alignment guide while dragging (sec)
  const [dropHint, setDropHint] = useState<{
    t: number;
    target: 'audio' | 'block' | TimelineMediaDropTarget;
    mode: TimelineInsertMode;
  } | null>(null);
  const [audioDropTarget, setAudioDropTarget] = useState<AudioLaneMoveTarget | null>(null);
  const [trDrag, setTrDrag] = useState<{ cut: number; half: number } | null>(null); // live half-width while dragging a transition handle (symmetric)
  const [shotResize, setShotResize] = useState<{
    shotId: string;
    edge: 'left' | 'right';
    atSec: number;
  } | null>(null);
  /** Slip ghost (alt-drag on a shot body): shifts WHICH source range plays, position/duration
   *  fixed. deltaSec is in SOURCE seconds; the filmstrip re-windows live, commit on release. */
  const [shotSlip, setShotSlip] = useState<{ shotId: string; deltaSec: number } | null>(null);
  const [captionResize, setCaptionResize] = useState<{
    id: string;
    startSec: number;
    durationSec: number;
  } | null>(null);
  const [visualClipResize, setVisualClipResize] = useState<{
    clipId: string;
    edge: 'left' | 'right';
    atSec: number;
  } | null>(null);
  const [endResizeSec, setEndResizeSec] = useState<number | null>(null);
  const [marquee, setMarquee] = useState<{ l: number; r: number } | null>(null); // scene-track marquee rectangle (content px)
  const laneRef = useRef<HTMLDivElement | null>(null); // scene-track DOM (content-coordinate base, moves with scroll)
  const marqueeDraggedRef = useRef(false); // whether this pointer-down became a marquee drag (used to suppress the subsequent shot click)
  const shotResizeMovedRef = useRef(false); // suppress the click synthesized after a main-clip edge trim
  const [blockMarquee, setBlockMarquee] = useState<{ l: number; r: number; t: number; b: number } | null>(null); // element-track marquee rectangle (tracksRef px, includes y for cross-track)
  const tracksRef = useRef<HTMLDivElement | null>(null); // track background area DOM (coordinate base for block marquee)
  const blockMarqueeDraggedRef = useRef(false); // whether the block marquee became a drag (suppress the subsequent block click)
  const marqueeRafRef = useRef(0); // rAF during marquee (edge auto-scroll + recompute rectangle each frame)
  const [hoverT, setHoverT] = useState<number | null>(null); // hover time (center preview jumps to this frame + draw hover vertical line)
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [visibleRange, setVisibleRange] = useState({ startSec: 0, endSec: 30 });
  const filmstripDemandKeyRef = useRef('');
  const draggingRef = useRef(false); // while dragging: let hover-seek yield (avoid double seek)
  const framePickConsumedRef = useRef(false); // suppress the click synthesized after a capture-phase frame pick
  const hoverRaf = useRef(0); // hover rAF coalescing
  const hoverXRef = useRef(0); // latest hover screen x
  /** Detach the document-level hover escape guards (installed when hover-scrub arms). */
  const scrubGuardCleanupRef = useRef<(() => void) | null>(null);
  /** Idempotent end-of-hover restore: mouseleave AND the escape guards all route here — whoever fires
   *  first restores the preview to the playhead and disarms; later calls are no-ops. */
  const endScrubRef = useRef<() => void>(() => {});
  endScrubRef.current = () => {
    scrubGuardCleanupRef.current?.();
    scrubGuardCleanupRef.current = null;
    if (hoverRaf.current) {
      cancelAnimationFrame(hoverRaf.current);
      hoverRaf.current = 0;
    }
    const armed = scrubArmedRef.current;
    scrubEnterRef.current = null;
    scrubArmedRef.current = false;
    setHoverT(null);
    if (armed) onScrub(null); // restore to the playhead (if never armed, the preview never moved, so no restore needed)
  };
  useEffect(() => () => scrubGuardCleanupRef.current?.(), []);
  // hover-scrub arming: only start following-seek of the center preview after >=160ms in the timeline and >=6px of real movement.
  // A cursor "passing through" the timeline on its way from an element track to the stage, or a layout shift from the selection control bar appearing, shouldn't make the picture jump.
  const scrubEnterRef = useRef<{ x: number; y: number; ts: number } | null>(null);
  const scrubArmedRef = useRef(false);
  useEffect(() => {
    // Switching inspector mode in either direction must restore any transient preview and clear its guide.
    endScrubRef.current();
  }, [framePickActive]);

  const surfaceDur = timelineResizeSurfaceDuration(
    dur,
    pps,
    endResizeSec ?? undefined,
  );
  const W = Math.max(320, surfaceDur * pps);
  const x = useCallback((s: number) => s * pps, [pps]);
  const updateVisibleRange = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const contentLeft = GUTTER + EDGE_PAD;
    const viewportSec = Math.max(1, (el.clientWidth - GUTTER) / pps);
    const rawStart = Math.max(0, (el.scrollLeft - contentLeft) / pps);
    const rawEnd = Math.min(dur, (el.scrollLeft + el.clientWidth - contentLeft) / pps);
    // Quantize to half-view buckets and keep a full viewport of overscan. This avoids re-rendering
    // on every scroll pixel while still preparing thumbnails before they enter the viewport.
    const bucket = Math.max(1, viewportSec / 2);
    const startSec = Math.max(0, Math.floor(rawStart / bucket) * bucket - viewportSec);
    const endSec = Math.min(dur, Math.ceil(rawEnd / bucket) * bucket + viewportSec);
    setVisibleRange((current) => current.startSec === startSec && current.endSec === endSec ? current : { startSec, endSec });
  }, [dur, pps]);
  useEffect(() => {
    updateVisibleRange();
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateVisibleRange);
    observer.observe(el);
    return () => observer.disconnect();
  }, [updateVisibleRange]);
  useEffect(() => {
    if (!onFilmstripDemandChange) return;
    const demand: Record<string, FilmstripSourceRange[]> = {};
    const addVisibleSourceRange = (
      source: string | undefined,
      timelineStartSec: number,
      timelineEndSec: number,
      sourceInSec: number,
      sourceOutSec: number,
    ) => {
      if (!source) return;
      const range = filmstripSourceRangeForTimelineWindow(
        timelineStartSec,
        timelineEndSec,
        sourceInSec,
        sourceOutSec,
        visibleRange.startSec,
        visibleRange.endSec,
      );
      if (range) (demand[source] ??= []).push(range);
    };
    for (const span of sceneSpans) {
      addVisibleSourceRange(span.shot.src, span.start, span.end, span.shot.srcStart, span.shot.srcEnd);
      // A live slip re-windows the filmstrip outside the committed source range; demand a padded
      // window around the slid position so the tiles exist while the pointer is still moving
      // (the consumer dedupes by bucket, so this only fetches genuinely new frames).
      if (shotSlip?.shotId === span.shot.id && span.shot.src) {
        const pad = 8;
        (demand[span.shot.src] ??= []).push({
          startSec: Math.max(0, span.shot.srcStart + shotSlip.deltaSec - pad),
          endSec: span.shot.srcEnd + shotSlip.deltaSec + pad,
        });
      }
    }
    for (const track of trackStates ?? []) {
      for (const clip of track.clips ?? []) {
        if (clip.kind !== 'video' || clip.usePrimaryFilmstrip) continue;
        addVisibleSourceRange(clip.source, clip.startSec, clip.endSec, clip.sourceInSec, clip.sourceOutSec);
      }
    }
    const key = JSON.stringify(demand);
    if (key === filmstripDemandKeyRef.current) return;
    filmstripDemandKeyRef.current = key;
    onFilmstripDemandChange(demand);
  }, [onFilmstripDemandChange, sceneSpans, shotSlip, trackStates, visibleRange]);
  // Static snap points include every visible clip edge. The playhead changes every frame, so it is
  // appended dynamically at snap time rather than invalidating this memo during playback.
  const snapPoints = useMemo(() => {
    const nativeVisualSpans = (trackStates ?? []).flatMap((track) =>
      (track.clips ?? []).map((clip) => ({ start: clip.startSec, end: clip.endSec })));
    return timelineSnapPoints(dur, [...sceneSpans, ...nativeVisualSpans], comp.blocks, comp.audioTracks ?? []);
  }, [dur, sceneSpans, comp.blocks, comp.audioTracks, trackStates]);
  const snap = useCallback(
    (sec: number, exclude?: number[]) => {
      if (!snapEnabled) {
        setGuide(null);
        return Math.round(sec * 100) / 100;
      }
      const result = snapTimelineSecond(sec, snapPoints, { pps, dynamicPoints: [playhead.get()], exclude });
      setGuide(result.hit); // hit a snap point -> light up the alignment guide
      return result.second;
    },
    [snapEnabled, snapPoints, pps],
  );
  const snapPlayhead = useCallback((second: number, lockedPoint: number | null) => {
    if (!snapEnabled) {
      setGuide(null);
      return { second: Math.round(second * 100) / 100, hit: null };
    }
    const result = snapTimelineSecond(second, snapPoints, { pps, lockedPoint });
    setGuide(result.hit);
    return result;
  }, [pps, snapEnabled, snapPoints]);
  const snapClipStart = useCallback((
    rawStart: number,
    durationSec: number,
    exclude: readonly number[],
    locked: { edge: 'start' | 'end'; point: number } | null,
  ): { startSec: number; lock: { edge: 'start' | 'end'; point: number } | null } => {
    if (!snapEnabled) {
      setGuide(null);
      return { startSec: Math.round(rawStart * 100) / 100, lock: null };
    }
    const candidate = (edge: 'start' | 'end') => {
      const offset = edge === 'start' ? 0 : durationSec;
      const result = snapTimelineSecond(rawStart + offset, snapPoints, {
        pps,
        dynamicPoints: [playhead.get()],
        exclude,
        lockedPoint: locked?.edge === edge ? locked.point : null,
      });
      return { edge, offset, result, distance: Math.abs(result.second - (rawStart + offset)) };
    };
    const start = candidate('start');
    const end = candidate('end');
    const best = start.result.hit != null && (end.result.hit == null || start.distance <= end.distance) ? start : end;
    if (best.result.hit == null) {
      setGuide(null);
      return { startSec: Math.round(rawStart * 100) / 100, lock: null };
    }
    setGuide(best.result.hit);
    return {
      startSec: Math.max(0, Math.round((best.result.second - best.offset) * 100) / 100),
      lock: { edge: best.edge, point: best.result.hit },
    };
  }, [pps, snapEnabled, snapPoints]);

  // stable identities: the music lane is memoized, and a fresh closure per render would defeat that
  const rawSecAt = useCallback((clientX: number) => (clientX - (contentRef.current?.getBoundingClientRect().left ?? 0)) / pps, [pps]);
  const secAt = useCallback((clientX: number) => timelinePointerSecond(rawSecAt(clientX), dur), [dur, rawSecAt]);
  const frameSecAt = useCallback((clientX: number) => {
    return quantizeTimelineFrameSecond(secAt(clientX), dur, framePickFps);
  }, [dur, framePickFps, secAt]);
  /** Shared marquee engine (scene track / element track): anchor in content coordinates (base moves with scroll, x0/y0 stay fixed in content coords),
   *  end point recomputed each frame from base's **live** rect -> supports edge auto-scroll throughout; keeps scrolling via rAF even when the pointer sits still at the edge.
   *  baseRef = coordinate-base DOM; draggedRef = whether it became a drag; onDrag = draw rectangle; onCommit = hit test; onClick = pure click (no drag). */
  const startMarquee = (
    e: React.PointerEvent,
    baseRef: React.MutableRefObject<HTMLDivElement | null>,
    draggedRef: React.MutableRefObject<boolean>,
    onDrag: (x0: number, y0: number, x1: number, y1: number) => void,
    onCommit: (x0: number, y0: number, x1: number, y1: number) => void,
    onEnd: () => void,
    onClick?: (clientX: number) => void,
  ) => {
    if (e.button !== 0) return;
    const base = baseRef.current;
    if (!base) return;
    const rect0 = base.getBoundingClientRect();
    const x0 = e.clientX - rect0.left; // content coords: scroll doesn't change it (base moves but the content point stays fixed)
    const y0 = e.clientY - rect0.top;
    draggedRef.current = false;
    let lastX = e.clientX;
    let lastY = e.clientY;
    let px1 = NaN;
    let py1 = NaN;
    const EDGE = 44; // viewport-edge band width that triggers auto-scroll (px)
    const frame = () => {
      const sc = scrollRef.current;
      if (sc) {
        const sr = sc.getBoundingClientRect();
        let dx = 0;
        if (lastX < sr.left + EDGE) dx = -Math.ceil(((sr.left + EDGE - lastX) / EDGE) * 20);
        else if (lastX > sr.right - EDGE) dx = Math.ceil(((lastX - (sr.right - EDGE)) / EDGE) * 20);
        if (dx) sc.scrollLeft += dx; // at the edge: keep horizontal-scrolling (base moves with it, and recomputing the end point extends into the new area)
      }
      const r = base.getBoundingClientRect(); // live rect (includes scroll offset)
      const x1 = lastX - r.left;
      const y1 = lastY - r.top;
      if (!draggedRef.current && (Math.abs(x1 - x0) > 4 || Math.abs(y1 - y0) > 4)) draggedRef.current = true;
      if (draggedRef.current && (x1 !== px1 || y1 !== py1)) {
        px1 = x1;
        py1 = y1;
        onDrag(x0, y0, x1, y1); // only setState when the rectangle actually changed (changes each frame during edge scroll, unchanged when still)
      }
      marqueeRafRef.current = requestAnimationFrame(frame);
    };
    marqueeRafRef.current = requestAnimationFrame(frame);
    const move = (ev: PointerEvent) => {
      if (ev.buttons === 0) { up(); return; } // missed pointerup: finish immediately, don't track bare movement (same as drag)
      lastX = ev.clientX;
      lastY = ev.clientY;
    };
    const up = () => {
      cancelAnimationFrame(marqueeRafRef.current);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      const r = base.getBoundingClientRect();
      const x1 = lastX - r.left;
      const y1 = lastY - r.top;
      if (draggedRef.current) onCommit(x0, y0, x1, y1);
      else onClick?.(lastX);
      onEnd();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  /** Scene-track marquee: drag from the track's top/bottom gap (or blank space right of the last card).
   *  Pressing a card is intercepted by the exact-time clip movement channel. */
  const onLanePointerDown = (e: React.PointerEvent) => {
    startMarquee(
      e,
      laneRef,
      marqueeDraggedRef,
      (x0, _y0, x1) => setMarquee({ l: Math.min(x0, x1), r: Math.max(x0, x1) }),
      (x0, _y0, x1) => {
        const lo = Math.min(x0, x1);
        const hi = Math.max(x0, x1);
        onBoxSelectShots(sceneSpans.filter(({ start, end }) => x(start) < hi && x(end) > lo).map(({ shot }) => shot.id));
      },
      () => setMarquee(null),
    );
  };
  // Image/video/element drags all make the timeline a drop zone; drop routing splits by type (see assetDragKind comment)
  const dropActive = !!assetDragging && !!assetDragKind;
  // On drag end (released outside the timeline / cancelled) clear the marker
  useEffect(() => {
    if (!assetDragging) {
      setDropHint(null);
      setGuide(null);
    }
  }, [assetDragging]);

  // Generic pointer drag (returns whether it actually dragged -> distinguishes click vs drag). Runs a continuous rAF loop:
  // onMove fires at most once per frame (seeking the video on every pointermove is expensive decoding-wise and causes jank),
  // and at the viewport's left/right edge it keeps auto horizontal-scrolling (same rAF pattern as shot reorder / marquee) —
  // the scroll shifts the content coordinate base, so scrolled frames replay onMove even with the pointer sitting still,
  // which is what lets a playhead/trim drag keep advancing past the visible window. draggingRef makes hover-seek yield.
  const drag = useCallback((e: React.PointerEvent, onMove: (clientX: number, clientY: number) => void, onUp?: (moved: boolean) => void) => {
    e.preventDefault();
    // A drag owns the timeline preview/guide until release. Clear any resting hover cursor immediately
    // instead of leaving its yellow line frozen behind the moving playhead or clip handle.
    endScrubRef.current();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); // keep receiving move/up even outside the window
    } catch {
      /* fall back to buttons */
    }
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    let lastX = e.clientX;
    let lastY = e.clientY;
    let dirty = false; // pointer moved since last flushed frame
    let raf = 0;
    draggingRef.current = true;
    const EDGE = 44; // viewport-edge band width that triggers auto-scroll (same as marquee/shot reorder)
    const frame = () => {
      const sc = scrollRef.current;
      let scrolled = false;
      if (sc && moved) {
        const sr = sc.getBoundingClientRect();
        const leftEdge = sr.left + GUTTER + EDGE; // left is covered by the sticky gutter; visible content starts at +GUTTER
        let d = 0;
        if (lastX < leftEdge) d = -Math.ceil(((leftEdge - lastX) / EDGE) * 44);
        else if (lastX > sr.right - EDGE) d = Math.ceil(((lastX - (sr.right - EDGE)) / EDGE) * 44);
        if (d) {
          const before = sc.scrollLeft;
          sc.scrollLeft += d;
          scrolled = sc.scrollLeft !== before; // at scroll bounds nothing changed -> don't replay onMove every frame
        }
      }
      if (moved && (dirty || scrolled)) {
        dirty = false;
        onMove(lastX, lastY);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const mv = (ev: PointerEvent) => {
      if (ev.buttons === 0) { up(); return; } // missed pointerup: finish immediately, don't track bare movement
      if (Math.abs(ev.clientX - sx) > 3 || Math.abs(ev.clientY - sy) > 3) moved = true; // pure vertical (cross-track) also counts as a drag
      lastX = ev.clientX;
      lastY = ev.clientY;
      dirty = true;
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (raf) cancelAnimationFrame(raf);
      if (moved && dirty) onMove(lastX, lastY); // release between animation frames: commit the pointer's true final position
      setGuide(null); // drag ended, hide the guide
      draggingRef.current = false;
      onUp?.(moved);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }, []);

  /** Ruler seeking and full-height cursor dragging share a per-gesture magnetic lock. */
  const onRulerPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    let snapLock: number | null = null;
    const seek = (clientX: number) => {
      const result = snapPlayhead(secAt(clientX), snapLock);
      snapLock = result.hit;
      onSeek(result.second);
    };
    seek(e.clientX);
    drag(e, (clientX) => seek(clientX));
  }, [drag, onSeek, secAt, snapPlayhead]);
  const onPlayheadPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    // Keep the exact side-of-line grab offset, but clamp only AFTER subtracting it. Clamping the
    // pointer first made one endpoint unreachable whenever the user grabbed off the line's centre.
    const grabOffset = rawSecAt(e.clientX) - playhead.get();
    let snapLock: number | null = null;
    drag(e, (clientX) => {
      const result = snapPlayhead(draggedPlayheadSecond(rawSecAt(clientX), grabOffset, dur), snapLock);
      snapLock = result.hit;
      onSeek(result.second);
    });
  }, [drag, dur, onSeek, rawSecAt, snapPlayhead]);

  // Cmd + wheel zoom (zoom value is controlled by the transport slider)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      onPps((p) => Math.max(MIN_PPS, Math.min(MAX_PPS, p * (ev.deltaY < 0 ? 1.1 : 0.9))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [onPps]);

  // Auto-scroll to follow the playhead during playback: page-scroll when it leaves the viewport (land the playhead at ~10% from the visible content's left, leaving lead-in).
  // User manual scroll during playback -> stop following, until next play re-enables it (followRef resets on the playing rising edge).
  const followRef = useRef(true);
  const progScrollUntilRef = useRef(0); // time window for programmatic scrolls: scroll events within it don't count as user action
  /** Scroll so the playhead lands at leadFrac of the visible content width (0.1 = left lead-in for follow; 0.5 = center it). */
  const scrollToPlayhead = useCallback(
    (leadFrac: number) => {
      const el = scrollRef.current;
      const content = contentRef.current;
      if (!el || !content) return;
      // Content layer's left edge in scroll coordinates (computed via rect, no offsetParent dependency)
      const contentX = content.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
      const px = contentX + playhead.get() * pps;
      const target = px - GUTTER - (el.clientWidth - GUTTER) * leadFrac;
      progScrollUntilRef.current = performance.now() + 150;
      el.scrollLeft = Math.max(0, target);
    },
    [pps],
  );
  useEffect(() => {
    if (playing) followRef.current = true; // playback started: restart following
  }, [playing]);
  /** Is the playhead inside the visible content area right now? (the sticky gutter covers the left edge,
   *  so "visible" starts at +GUTTER). Unknown layout counts as visible — never yank the view on a guess. */
  const playheadOnScreen = useCallback(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return true;
    const contentX = content.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
    const px = contentX + playhead.get() * pps;
    return px >= el.scrollLeft + GUTTER && px <= el.scrollLeft + el.clientWidth - 8;
  }, [pps]);
  useEffect(() => {
    if (!playing) return;
    let lastCheck = 0;
    const follow = () => {
      if (!followRef.current) return;
      // 4Hz is enough for the out-of-viewport check: the playhead fires every frame, and calling getBoundingClientRect every frame here would force a synchronous layout each frame, fighting the engine's rAF for the main thread (one contributor to transition stutter)
      const now = performance.now();
      if (now - lastCheck < 250) return;
      lastCheck = now;
      if (!playheadOnScreen()) scrollToPlayhead(0.1);
    };
    const unsub = playhead.subscribe(follow);
    follow(); // correct once at play start
    return unsub;
  }, [playing, scrollToPlayhead, playheadOnScreen]);
  // Locate the playhead (triggered by incrementing locateSignal; skip first mount). Two flavours: the
  // transport readout always centres — it's an explicit "where am I" — while a jump made somewhere else
  // (clicking a word in the script) only scrolls when the playhead would otherwise be off-screen, so the
  // timeline doesn't lurch under a user who can already see where they landed.
  const scrollToPlayheadRef = useRef(scrollToPlayhead);
  scrollToPlayheadRef.current = scrollToPlayhead;
  const locateNearRef = useRef(locateNear);
  locateNearRef.current = locateNear;
  const onScreenRef = useRef(playheadOnScreen);
  onScreenRef.current = playheadOnScreen;
  const firstLocateRef = useRef(true);
  useEffect(() => {
    if (firstLocateRef.current) {
      firstLocateRef.current = false;
      return;
    }
    if (locateNearRef.current && onScreenRef.current()) return;
    scrollToPlayheadRef.current(0.5);
  }, [locateSignal]);
  const lastScrollLeftRef = useRef(0);
  const onScrollFollow = () => {
    const el = scrollRef.current;
    if (!el) return;
    updateVisibleRange();
    const moved = el.scrollLeft !== lastScrollLeftRef.current; // only count horizontal scroll (vertical track-switch doesn't count)
    lastScrollLeftRef.current = el.scrollLeft;
    if (performance.now() < progScrollUntilRef.current) return; // programmatic scroll, ignore
    if (playing && moved) followRef.current = false; // user horizontal manual scroll during playback -> stop following
  };

  // Representative kind per track (take that track's first block); track 0 = video
  const trackKind = (track: TimelineLaneKey): BlockKind | 'video' => {
    if (track === 0) return 'video';
    const nativeId = visualTrackId(track);
    if (nativeId) {
      const native = trackStates?.find((candidate) => candidate.trackId === nativeId);
      if ((native?.clips?.length ?? 0) > 0) return 'video';
      if (native?.role === 'managedCaptions' || native?.type === 'caption') return 'caption';
      const block = comp.blocks.find((candidate) => native?.ranges?.some((range) => range.clipId === candidate.id));
      return block ? blockKind(block) : 'custom';
    }
    const b = comp.blocks.find((bk) => bk.trackIndex === track);
    return b ? blockKind(b) : 'custom';
  };

  const step = rulerStep(pps);
  const ticks = Math.floor(dur / step) + 1;

  // The primary narrative uses the taller scene-rail presentation when it has video. Its row is not
  // anchored: all native track types share the document's presentation order below. Visual stack
  // order remains separate and only determines compositing among visual-output tracks.
  const visualTracks = useMemo(
    () => (trackStates ?? []).filter((track) =>
      track.type !== 'audio'
      && track.role !== 'primaryNarrative'),
    [trackStates],
  );
  const representedStackOrders = useMemo(
    () => new Set(visualTracks.map((track) => track.stackOrder)),
    [visualTracks],
  );
  const sceneRail = hasVideoLane || visualTracks.some((track) => (track.clips?.length ?? 0) > 0);
  const H0 = sceneRail ? SCENE_H : ROW_H;
  // V2 graphics lanes are native identities and published empty lanes are pruned automatically.
  // Legacy hosts without trackStates retain the blocks-derived fallback.
  const overlayTracks = useMemo(() => {
    const set = new Set<number>();
    for (const track of trackStates ?? []) {
      if (track.type === 'graphics' && !representedStackOrders.has(track.stackOrder)) set.add(track.stackOrder);
    }
    for (const b of comp.blocks) {
      if (b.trackIndex > 0 && !isSentenceCaption(b) && !representedStackOrders.has(b.trackIndex)) set.add(b.trackIndex);
    }
    return [...set].sort((a, b) => b - a);
  }, [comp.blocks, representedStackOrders, trackStates]);
  const visualWaves = useMemo(() => {
    const out = new Map<string, { body: string; wave: string }>();
    if (!sourcePeaks?.size) return out;
    for (const track of visualTracks) {
      for (const clip of track.clips ?? []) {
        if (clip.kind !== 'video') continue;
        const key = clip.usePrimaryFilmstrip ? 'main' : clip.source;
        const peaks = key ? sourcePeaks.get(key) : undefined;
        const width = Math.max(20, (clip.endSec - clip.startSec) * pps);
        if (!peaks || peaks.durationSec <= 0 || width < 6) continue;
        const per = peaks.peaks.length / peaks.durationSec;
        out.set(clip.clipId, {
          body: fadeBodyPath(width, SCENE_WAVE_H, 0, 0, clip.endSec - clip.startSec),
          wave: waveBars(
            peaks.peaks,
            Math.floor(clip.sourceInSec * per),
            Math.ceil(clip.sourceOutSec * per),
            width,
            SCENE_WAVE_H,
            0,
          ),
        });
      }
    }
    return out;
  }, [pps, sourcePeaks, visualTracks]);
  // Sentence captions get their own lane. Their copy follows the transcript; either display edge can
  // be trimmed directly while the engine keeps the result anchored to the same source words.
  const captionBlocks = useMemo(
    () => comp.blocks.filter(isSentenceCaption).sort((a, b) => a.startSec - b.startSec),
    [comp.blocks],
  );
  const hasCaptions = captionBlocks.length > 0;
  const captionTrack = trackStates?.find(
    (track) => track.type === 'caption' && track.role === 'managedCaptions',
  );
  const captionStackOrder = captionTrack?.stackOrder ?? 1;
  const captionLane = captionTrack && representedStackOrders.has(captionTrack.stackOrder)
    ? visualLaneKey(captionTrack.trackId)
    : CAP_LANE;
  const audioClips = useMemo(() => comp.audioTracks ?? [], [comp.audioTracks]);
  const nativeAudioTracks = useMemo(
    () => (trackStates ?? []).filter((track) => track.type === 'audio'),
    [trackStates],
  );
  const audioLanes = useMemo(
    () => timelineAudioLanes(
      audioClips,
      nativeAudioTracks.map((track) => ({
        trackId: track.trackId,
        clipIds: (track.ranges ?? []).map((range) => range.clipId),
      })),
    ),
    [audioClips, nativeAudioTracks],
  );
  const visibleAudioLanes = audioLanes.length
    ? audioLanes
    : assetDragKind === 'audio'
      ? [{ trackId: undefined, clips: [] }]
      : [];
  const musicLane = visibleAudioLanes.length > 0;
  const primaryTrack = trackStates?.find((track) => track.role === 'primaryNarrative');
  const protectedTrackIds = new Set(primaryTrack ? [primaryTrack.trackId] : []);
  const layerTracks = useMemo<TimelineLaneKey[]>(() => [
    ...overlayTracks,
    ...visualTracks.map((track) => visualLaneKey(track.trackId)),
    ...(hasCaptions && captionLane === CAP_LANE ? [CAP_LANE] : []),
  ].sort((left, right) => {
    const stackOf = (lane: TimelineLaneKey) => {
      if (lane === CAP_LANE) return captionStackOrder;
      const visualId = visualTrackId(lane);
      if (visualId) return visualTracks.find((track) => track.trackId === visualId)?.stackOrder ?? 0;
      return lane as number;
    };
    return stackOf(right) - stackOf(left);
  }), [overlayTracks, visualTracks, hasCaptions, captionLane, captionStackOrder]);
  const audioLaneTracks = useMemo<TimelineLaneKey[]>(
    () => visibleAudioLanes.map((lane) => audioLaneKey(lane.trackId ?? '__fallback__')),
    [visibleAudioLanes],
  );
  const displayTracks = useMemo<TimelineLaneKey[]>(() => {
    const lanes = [0, ...layerTracks, ...audioLaneTracks] as TimelineLaneKey[];
    const orderedTrackIds = timelineTrackDisplayOrder(
      (trackStates ?? []).filter((track) => track.timelineIndex >= 0),
    );
    const order = new Map(orderedTrackIds.map((trackId, index) => [trackId, index] as const));
    const fallback = new Map(lanes.map((lane, index) => [lane, index] as const));
    const trackIdForLane = (lane: TimelineLaneKey) => {
      if (lane === 0) return primaryTrack?.trackId;
      if (lane === CAP_LANE) return captionTrack?.trackId;
      return visualTrackId(lane) ?? audioTrackId(lane) ?? undefined;
    };
    return [...lanes].sort((left, right) => {
      const leftOrder = order.get(trackIdForLane(left) ?? '') ?? orderedTrackIds.length + fallback.get(left)!;
      const rightOrder = order.get(trackIdForLane(right) ?? '') ?? orderedTrackIds.length + fallback.get(right)!;
      return leftOrder - rightOrder;
    });
  }, [audioLaneTracks, captionTrack?.trackId, layerTracks, primaryTrack?.trackId, trackStates]);
  const dispIdx = useMemo(() => new Map(displayTracks.map((tk, i) => [tk, i])), [displayTracks]);
  const rowH = (track: TimelineLaneKey) => {
    if (audioTrackId(track)) return AUDIO_ROW_H;
    if (track === 0) return H0;
    const visualId = visualTrackId(track);
    return visualId && (visualTracks.find((candidate) => candidate.trackId === visualId)?.clips?.length ?? 0) > 0
      ? VISUAL_SCENE_H
      : ROW_H;
  };
  // Mixed-height layout: detached video lanes are a compact version of the primary rail, while
  // graphics/caption lanes stay smaller still.
  // Deriving every top from the preceding lane avoids the old fixed-ROW_H assumption that made a
  // taller visual lane overlap the rows below it.
  const rowTops = new Map<TimelineLaneKey, number>();
  let rowCursor = 0;
  displayTracks.forEach((track, index) => {
    rowTops.set(track, rowCursor);
    rowCursor += rowH(track) + (index < displayTracks.length - 1 ? ROW_GAP : 0);
  });
  const rowTop = (track: TimelineLaneKey) => rowTops.get(track) ?? 0;
  const nativeTrackIdForLane = (lane: TimelineLaneKey): string | null => {
    if (lane === 0) return primaryTrack?.trackId ?? null;
    if (lane === CAP_LANE) return captionTrack?.trackId ?? null;
    return visualTrackId(lane) ?? audioTrackId(lane);
  };
  const nativeDisplayTracks = displayTracks.filter((lane) => nativeTrackIdForLane(lane) != null);
  const nativeDropRows = nativeDisplayTracks.flatMap((lane) => {
    const trackId = nativeTrackIdForLane(lane);
    const trackIndex = trackStates?.find((track) => track.trackId === trackId)?.timelineIndex;
    return trackId != null && trackIndex != null && trackIndex >= 0
      ? [{ trackId, trackIndex, top: rowTop(lane), height: rowH(lane) }]
      : [];
  });
  const graphicsTrackIds = new Set((trackStates ?? [])
    .filter((track) => track.type === 'graphics')
    .map((track) => track.trackId));
  const laneForStackOrder = (stackOrder: number): TimelineLaneKey => {
    const native = visualTracks.find((track) => track.stackOrder === stackOrder);
    return native ? visualLaneKey(native.trackId) : stackOrder;
  };
  const nativeLaneByClipId = new Map<string, TimelineLaneKey>();
  for (const track of visualTracks) {
    const lane = visualLaneKey(track.trackId);
    for (const range of track.ranges ?? []) nativeLaneByClipId.set(range.clipId, lane);
  }
  const laneForBlock = (block: Block): TimelineLaneKey => nativeLaneByClipId.get(block.id) ?? laneForStackOrder(block.trackIndex);
  const tracksH = rowCursor;
  const tracksHeight = musicLane ? tracksH : tracksH + VISUAL_TRACK_DROP_ZONE_H;

  const resolveAudioMoveTarget = (clientY: number): AudioLaneMoveTarget | null => {
    const bounds = tracksRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    const y = clientY - bounds.top;
    const audioTrackIds = new Set(visibleAudioLanes.flatMap((lane) => lane.trackId ? [lane.trackId] : []));
    const target = timelineCompatibleTrackDropTarget(
      nativeDropRows,
      y,
      AUDIO_ROW_H,
      audioTrackIds,
      protectedTrackIds,
    );
    if (!target) return null;
    if (target.kind === 'new-track') return target;

    const audioTarget = visibleAudioLanes.find((lane) => lane.trackId === target.trackId);
    if (audioTarget?.trackId) {
      return {
        kind: 'track',
        trackId: audioTarget.trackId,
        newTrackIndex: target.trackIndex + 1,
        top: target.top,
      };
    }

    return null;
  };

  const layerStackOrder = (lane: TimelineLaneKey) => {
    if (lane === CAP_LANE) return captionStackOrder;
    const visualId = visualTrackId(lane);
    if (visualId) return visualTracks.find((track) => track.trackId === visualId)?.stackOrder ?? 0;
    return lane as number;
  };
  const newVisualTargetForDocumentIndex = (indexWish: number): Extract<TimelineVisualDropTarget, { kind: 'visual-new' }> => {
    const slot = Math.max(0, Math.min(nativeDropRows.length, indexWish));
    const visualRows = nativeDropRows.filter((row) => layerTracks.some((lane) => nativeTrackIdForLane(lane) === row.trackId));
    const visualSlot = visualRows.filter((row) => row.trackIndex < slot).length;
    const aboveId = visualRows[visualSlot - 1]?.trackId;
    const belowId = visualRows[visualSlot]?.trackId;
    const above = layerTracks.find((lane) => nativeTrackIdForLane(lane) === aboveId);
    const below = layerTracks.find((lane) => nativeTrackIdForLane(lane) === belowId);
    const aboveStack = above == null ? undefined : layerStackOrder(above);
    const belowStack = below == null ? undefined : layerStackOrder(below);
    const stackOrder = aboveStack == null
      ? (belowStack ?? 1) + 1
      : belowStack == null
        ? (aboveStack > 1 ? (aboveStack + 1) / 2 : aboveStack - 1)
        : (aboveStack + belowStack) / 2;
    return { kind: 'visual-new', stackOrder, slot };
  };
  const visualInsertionLineTop = (indexWish: number) => {
    const index = Math.max(0, Math.min(nativeDropRows.length, indexWish));
    const below = nativeDropRows.find((row) => row.trackIndex >= index);
    const above = [...nativeDropRows].reverse().find((row) => row.trackIndex < index);
    if (below && above) return (above.top + above.height + below.top) / 2;
    if (below) return below.top;
    return above ? above.top + above.height : 0;
  };
  const primarySpans = sceneSpans.map((span) => ({ id: span.shot.id, startSec: span.start, endSec: span.end }));
  /** NLE-style hit testing: dropping on a row means that exact physical row and uses overwrite
   * semantics. Only dropping in the gap creates a new row. */
  const visualMoveTargetAt = (
    clientY: number,
    allowPrimary: boolean,
  ): TimelineMediaDropTarget => {
    const bounds = tracksRef.current?.getBoundingClientRect();
    const y = bounds ? clientY - bounds.top : rowTop(0) + H0 / 2;
    const compatibleIds = new Set([
      ...visualTracks.filter((track) => track.type === 'visual').map((track) => track.trackId),
      ...(allowPrimary && primaryTrack ? [primaryTrack.trackId] : []),
    ]);
    const target = timelineCompatibleTrackDropTarget(
      nativeDropRows,
      y,
      VISUAL_SCENE_H,
      compatibleIds,
      protectedTrackIds,
    );
    if (target?.kind === 'new-track') return newVisualTargetForDocumentIndex(target.newTrackIndex);
    if (target?.kind === 'existing-track') {
      if (target.trackId === primaryTrack?.trackId && allowPrimary) return { kind: 'primary' };
      if (visualTracks.some((track) => track.type === 'visual' && track.trackId === target.trackId)) {
        return { kind: 'visual', trackId: target.trackId };
      }
    }

    // An external asset has no source lane to clamp back to. Give it a typed lane at the physical
    // row position; internal clip drags never take this fallback.
    const physical = timelineTrackDropTarget(nativeDropRows, y, VISUAL_SCENE_H);
    return newVisualTargetForDocumentIndex(
      physical?.kind === 'new-track' ? physical.newTrackIndex : physical?.trackIndex ?? nativeDropRows.length,
    );
  };
  const resolveAssetDropTarget = (
    event: { target: EventTarget | null; clientY: number },
    atSec: number,
  ): 'audio' | 'block' | TimelineMediaDropTarget | null => {
    if (assetDragKind === 'audio') return 'audio';
    if (assetDragKind === 'element') return (event.target as Element | null)?.closest?.('[data-main-track]') ? null : 'block';
    if (assetDragKind !== 'image' && assetDragKind !== 'video') return null;
    return visualMoveTargetAt(event.clientY, assetDragKind === 'video');
  };

  /** Element-track marquee: drag a rectangle over empty element-track space (can span tracks); matched blocks all enter the multi-select set.
   *  Coordinate base tracksRef; x shares the domain of x(start), y that of rowTop. Pure click = clear selection + move playhead to the click point. */
  const onOverlayPointerDown = (e: React.PointerEvent) => {
    startMarquee(
      e,
      tracksRef,
      blockMarqueeDraggedRef,
      (x0, y0, x1, y1) => setBlockMarquee({ l: Math.min(x0, x1), r: Math.max(x0, x1), t: Math.min(y0, y1), b: Math.max(y0, y1) }),
      (x0, y0, x1, y1) => {
        const lo = Math.min(x0, x1);
        const hi = Math.max(x0, x1);
        const top = Math.min(y0, y1);
        const bot = Math.max(y0, y1);
        const hit = comp.blocks
          .filter((b) => b.trackIndex > 0 && !isSentenceCaption(b))
          .filter((b) => {
            const bl = x(b.startSec);
            const br = x(b.startSec + b.durationSec);
            const bt = rowTop(laneForBlock(b)) + 4;
            const bb = bt + (ROW_H - 8);
            return bl < hi && br > lo && bt < bot && bb > top; // intersect on both timeline x and track y
          })
          .map((b) => b.id);
        onBoxSelectBlocks(hit);
      },
      () => setBlockMarquee(null),
      (clientX) => {
        onSelect(null);
        onSeek(secAt(clientX));
      },
    );
  };

  // Gutter drag-reorder: the dragged row follows via translateY, the target slot draws an insert line, release commits the new display order
  const [trackDrag, setTrackDrag] = useState<{
    track: TimelineLaneKey;
    fromSlot: number;
    toSlot: number;
    fromIndex: number;
    toIndex: number;
    dy: number;
  } | null>(null);
  const trackDragRef = useRef(trackDrag);
  trackDragRef.current = trackDrag;
  const reorderableTracks = nativeDisplayTracks;
  const trackInsertionLineTop = (drag: NonNullable<typeof trackDrag>) => {
    const others = reorderableTracks.filter((candidate) => candidate !== drag.track);
    const before = others[drag.toIndex];
    if (before != null) return rowTop(before) - ROW_GAP / 2;
    const last = others.at(-1);
    return last == null ? rowTop(drag.track) : rowTop(last) + rowH(last) + ROW_GAP / 2;
  };
  const startTrackDrag = (e: React.PointerEvent, track: TimelineLaneKey) => {
    if (reorderableTracks.length <= 1) return;
    e.preventDefault();
    const fromSlot = dispIdx.get(track)!;
    const fromIndex = reorderableTracks.indexOf(track);
    const sy = e.clientY;
    const mv = (ev: PointerEvent) => {
      if (ev.buttons === 0) { up(); return; }
      const dy = ev.clientY - sy;
      const center = rowTop(track) + rowH(track) / 2 + dy;
      const others = reorderableTracks.filter((candidate) => candidate !== track);
      const toIndex = others.filter((candidate) => center > rowTop(candidate) + rowH(candidate) / 2).length;
      const before = others[toIndex];
      const after = others[toIndex - 1];
      const toSlot = before != null ? dispIdx.get(before)! : after != null ? dispIdx.get(after)! + 1 : fromSlot;
      setTrackDrag({ track, fromSlot, toSlot, fromIndex, toIndex, dy });
    };
    const up = () => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      const td = trackDragRef.current;
      setTrackDrag(null);
      if (td && td.toIndex !== td.fromIndex) {
        const order = reorderableTracks.slice();
        const [moved] = order.splice(td.fromIndex, 1);
        order.splice(td.toIndex, 0, moved!);
        onReorderTracks(order.map((lane) => {
          const trackId = nativeTrackIdForLane(lane)!;
          const nativeTrack = trackStates?.find((candidate) => candidate.trackId === trackId);
          return {
            trackId,
            stackOrder: nativeTrack?.stackOrder ?? 0,
          };
        }));
      }
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  // With primary auto-snap on, horizontal dragging chooses an insertion point and the whole semantic
  // rail remains packed from zero. Turning it off restores exact free placement (including gaps).
  const [shotDrag, setShotDrag] = useState<{
    from: number;
    startSec: number;
    ghostTop: number;
    target: TimelineMediaDropTarget;
  } | null>(null);
  const shotDragRef = useRef(shotDrag);
  shotDragRef.current = shotDrag;
  const shotDragMovedRef = useRef(false); // whether this press became a drag (suppress the subsequent click)
  const startShotDrag = (e: React.PointerEvent, from: number) => {
    if (e.button !== 0 || !onMoveShot) return;
    const span = sceneSpans[from];
    if (!span) return;
    const grab = secAt(e.clientX) - span.start;
    const grabY = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const durationSec = span.end - span.start;
    let snapLock: { edge: 'start' | 'end'; point: number } | null = null;
    shotDragMovedRef.current = false;
    drag(
      e,
      (clientX, clientY) => {
        shotDragMovedRef.current = true;
        const snapped = snapClipStart(Math.max(0, secAt(clientX) - grab), durationSec, [span.start, span.end], snapLock);
        snapLock = snapped.lock;
        let startSec = snapped.startSec;
        let target = visualMoveTargetAt(clientY, true);
        if (target.kind === 'primary' && snapEnabled) {
          const packed = packedPrimaryPlacement(primarySpans, span.shot.id, startSec, durationSec);
          target = { kind: 'primary', insertIndex: packed.index };
          setGuide(packed.startSec);
        }
        const bounds = tracksRef.current?.getBoundingClientRect();
        const ghostTop = clientY - (bounds?.top ?? 0) - grabY;
        const next = { from, startSec, ghostTop, target };
        shotDragRef.current = next;
        setShotDrag(next);
      },
      (moved) => {
        const current = shotDragRef.current;
        setShotDrag(null);
        if (moved && current?.from === from) {
          onMoveShot(span.shot.id, current.startSec, current.target);
        }
        setTimeout(() => { shotDragMovedRef.current = false; }, 0);
      },
    );
  };

  const shotSlipRef = useRef(shotSlip);
  shotSlipRef.current = shotSlip;
  const shotSlipMovedRef = useRef(false);
  /** Alt-drag on a shot body: slip the source window (which range plays), position/duration
   *  fixed. Content follows the pointer — dragging RIGHT reveals EARLIER material. Head clamps
   *  at source zero live; tail clamps live only when the source duration is known from mounted
   *  peaks (the engine performs the authoritative tail clamp again on commit). */
  const startShotSlip = (e: React.PointerEvent, from: number) => {
    if (e.button !== 0 || !onSlipShot) return;
    const span = sceneSpans[from];
    if (!span) return;
    const sourceRate = (span.shot.srcEnd - span.shot.srcStart) / Math.max(0.001, span.end - span.start);
    const sourceDurationSec = sourcePeaks?.get(span.shot.src ?? 'main')?.durationSec;
    const grabSec = secAt(e.clientX);
    shotSlipMovedRef.current = false;
    drag(
      e,
      (clientX) => {
        shotSlipMovedRef.current = true;
        let deltaSec = -(secAt(clientX) - grabSec) * sourceRate;
        deltaSec = Math.max(-span.shot.srcStart, deltaSec);
        if (sourceDurationSec != null && sourceDurationSec > 0) {
          deltaSec = Math.min(deltaSec, Math.max(0, sourceDurationSec - span.shot.srcEnd));
        }
        const next = { shotId: span.shot.id, deltaSec };
        shotSlipRef.current = next;
        setShotSlip(next);
      },
      (moved) => {
        const current = shotSlipRef.current;
        setShotSlip(null);
        if (moved && current?.shotId === span.shot.id && Math.abs(current.deltaSec) > 0.001) {
          onSlipShot(span.shot.id, current.deltaSec);
        }
        setTimeout(() => { shotSlipMovedRef.current = false; }, 0);
      },
    );
  };

  // Block cross-track drag uses the same document-row hit target as audio and visual media. Row
  // bodies stay typed; every boundary can create a graphics track at that exact document index.
  const [blockTrackDrag, setBlockTrackDrag] = useState<{
    id: string;
    startSec: number;
    to: TimelineLaneKey | null;
    gap: Extract<TimelineTrackDropTarget, { kind: 'new-track' }> | null;
  } | null>(null);
  const blockTrackDragRef = useRef(blockTrackDrag);
  blockTrackDragRef.current = blockTrackDrag;
  const previewBlockTrackDrag = (next: NonNullable<typeof blockTrackDrag>) => {
    // Pointer-up can arrive before React paints the last pointer-move. Keep the transaction ref
    // synchronous so release always commits the exact row/time shown by the final ghost.
    blockTrackDragRef.current = next;
    setBlockTrackDrag(next);
  };
  const [visualClipDrag, setVisualClipDrag] = useState<{
    clipId: string;
    startSec: number;
    ghostTop: number;
    target: TimelineMediaDropTarget;
  } | null>(null);
  const visualClipDragRef = useRef(visualClipDrag);
  visualClipDragRef.current = visualClipDrag;
  const visualTargetTop = (target: TimelineMediaDropTarget) => {
    if (target.kind === 'primary') return rowTop(0) + SCENE_PAD_T;
    if (target.kind === 'visual') return rowTop(visualLaneKey(target.trackId)) + VISUAL_SCENE_PAD_T;
    // A new-lane ghost always sits below its insertion line. Centering it on the boundary made it
    // jump upward into the previous row for a few pixels before snapping down again.
    return visualInsertionLineTop(target.slot) + VISUAL_SCENE_PAD_T;
  };
  const activeVisualGhost = (() => {
    if (shotDrag) {
      const span = sceneSpans[shotDrag.from];
      if (!span) return null;
      return {
        clipId: span.shot.id,
        kind: 'video' as const,
        label: t('panels.video'),
        source: span.shot.src,
        sourceInSec: span.shot.srcStart,
        sourceOutSec: span.shot.srcEnd,
        usePrimaryFilmstrip: !span.shot.src,
        startSec: shotDrag.startSec,
        ghostTop: shotDrag.ghostTop,
        ghostHeight: VIDEO_CLIP_H,
        durationSec: span.end - span.start,
        target: shotDrag.target,
      };
    }
    if (visualClipDrag) {
      for (const track of visualTracks) {
        const clip = track.clips?.find((candidate) => candidate.clipId === visualClipDrag.clipId);
        if (!clip) continue;
        return {
          clipId: clip.clipId,
          kind: clip.kind,
          label: clip.label || t(clip.kind === 'video' ? 'panels.video' : 'panels.image'),
          source: clip.source,
          sourceInSec: clip.sourceInSec,
          sourceOutSec: clip.sourceOutSec,
          usePrimaryFilmstrip: !!clip.usePrimaryFilmstrip,
          startSec: visualClipDrag.startSec,
          ghostTop: visualClipDrag.ghostTop,
          ghostHeight: VISUAL_VIDEO_CLIP_H,
          durationSec: clip.endSec - clip.startSec,
          target: visualClipDrag.target,
        };
      }
    }
    return null;
  })();

  return (
    <div className="bg-panel flex max-h-96 min-h-0 flex-col">
      {/* Scroll area (zoom controls moved to the transport toolbar above). When a panel asset is dragged in, the whole area becomes a drop zone:
          the drop x is converted to time via secAt (includes scroll/zoom), and workbench inserts an asset block at that time */}
      <div
        ref={scrollRef}
        className={`min-h-0 flex-1 overflow-auto ${dropActive ? 'ring-accent/60 ring-2 ring-inset' : framePickActive ? 'ring-accent/45 ring-1 ring-inset' : ''}`}
        onScroll={onScrollFollow}
        onDragOver={
          dropActive
            ? (e) => {
                e.preventDefault();
                const at = snap(secAt(e.clientX));
                const target = resolveAssetDropTarget(e, at);
                if (!target) {
                  e.dataTransfer.dropEffect = 'none';
                  setDropHint(null);
                  return;
                }
                e.dataTransfer.dropEffect = 'copy';
                const mode: TimelineInsertMode = e.metaKey || e.ctrlKey ? 'ripple' : 'overwrite';
                const placement = typeof target === 'object' && target.kind === 'primary' && snapEnabled
                  ? packedPrimaryPlacement(primarySpans, '__external_asset__', at, assetDragKind === 'image' ? 5 : 3)
                  : null;
                setDropHint({
                  t: placement?.startSec ?? at,
                  target: placement ? { kind: 'primary', insertIndex: placement.index } : target,
                  mode: placement ? 'ripple' : mode,
                });
              }
            : undefined
        }
        onDragLeave={
          dropActive
            ? (e) => {
                // dragleave bubbles from children (fires when dragging over a scene card): only clear the marker when truly leaving the container
                if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) {
                  setDropHint(null);
                  setGuide(null);
                }
              }
            : undefined
        }
        onDrop={
          dropActive
            ? (e) => {
                e.preventDefault();
                const rawAt = snap(secAt(e.clientX));
                const target = resolveAssetDropTarget(e, rawAt);
                setDropHint(null);
                if (!target) return;
                const placement = typeof target === 'object' && target.kind === 'primary' && snapEnabled
                  ? packedPrimaryPlacement(primarySpans, '__external_asset__', rawAt, assetDragKind === 'image' ? 5 : 3)
                  : null;
                const at = placement?.startSec ?? rawAt;
                const plannedTarget: TimelineMediaDropTarget | 'audio' | 'block' = placement
                  ? { kind: 'primary', insertIndex: placement.index }
                  : target;
                setGuide(null);
                if (plannedTarget === 'audio') onDropAssetAudio?.(at);
                else if (plannedTarget === 'block') onDropAsset?.(at);
                else onDropAssetClip?.(at, plannedTarget, placement != null || e.metaKey || e.ctrlKey ? 'ripple' : 'overwrite');
              }
            : undefined
        }
      >
        <div className="flex" style={{ minWidth: GUTTER + EDGE_PAD * 2 + W }}>
          {/* Left: track labels (icon + name). Sticky fixed column; z must beat all scrolling content (treatment badge z-30 /
              playhead z-30 / marquee & "+" z-40), otherwise on horizontal scroll content slides under it but covers the icons */}
          <div className="bg-panel sticky left-0 z-50 shrink-0" style={{ width: GUTTER }}>
            {/* Corner: sticks with the ruler, and opaque so the track icons scroll UNDER it, not into it */}
            <div className="border-line bg-panel sticky top-0 z-10 border-b" style={{ height: RULER_H }} />
            {hasDirectorScenes && (
              <div className="border-line text-ink-4 flex items-center gap-1 border-b px-2 text-[9px]" style={{ height: DIRECTOR_SCENE_STRIP_H }} title={t('panels.directorPlan')}>
                <Clapperboard size={12} className="text-accent shrink-0" />
                <span className="truncate">{t('panels.directorPlan')}</span>
              </div>
            )}
            <div style={{ paddingTop: 0 }}>
              {displayTracks.map((track, displayIndex) => {
                const k = trackKind(track);
                const visualId = visualTrackId(track);
                const audioId = audioTrackId(track);
                const nativeTrack = track === CAP_LANE
                  ? trackStates?.find((candidate) => candidate.type === 'caption' && candidate.role === 'managedCaptions')
                  : track === 0
                    ? primaryTrack
                    : audioId && audioId !== '__fallback__'
                      ? nativeAudioTracks.find((candidate) => candidate.trackId === audioId)
                  : visualId
                    ? visualTracks.find((candidate) => candidate.trackId === visualId)
                    : typeof track === 'number' && track > 0
                    ? trackStates?.find((candidate) => candidate.type === 'graphics' && candidate.stackOrder === track)
                    : undefined;
                const meta =
                  track === CAP_LANE
                    ? KIND_META.caption
                    : audioId
                      ? { label: 'panels.musicBed', icon: Music, dot: 'text-accent' }
                    : visualId && k === 'video'
                      ? { label: 'panels.multimediaTrack', icon: Film, dot: 'text-accent' }
                    : k === 'video'
                      ? { label: sceneRail ? t('panels.scene') : t('panels.video'), icon: Film, dot: 'text-accent' }
                      : KIND_META[k];
                const Icon = meta.icon;
                const dragging = trackDrag?.track === track;
                const draggable = nativeTrack != null;
                return (
                  <div
                    key={track}
                    data-audio-track-id={audioId && audioId !== '__fallback__' ? audioId : undefined}
                    onPointerDown={draggable ? (e) => startTrackDrag(e, track) : undefined}
                    title={t(meta.label)}
                    className={`grid grid-cols-[16px_16px_16px] items-center gap-0.5 px-2 text-[11px] ${draggable ? 'cursor-grab active:cursor-grabbing' : ''} ${dragging ? 'bg-panel-2 relative z-10 rounded' : ''}`}
                    style={{ height: rowH(track), marginTop: displayIndex === 0 ? 0 : ROW_GAP, transform: dragging ? `translateY(${trackDrag!.dy}px)` : undefined }}
                  >
                    <span className="flex h-4 w-4 items-center justify-center" aria-hidden>
                      <Icon size={13} className={meta.dot} />
                    </span>
                    {track === 0 && onToggleVideoMute ? (
                      <MuteToggle muted={!!videoMuted} onToggle={onToggleVideoMute} />
                    ) : audioId && nativeTrack && onToggleTrackMute ? (
                      <MuteToggle muted={nativeTrack.muted} onToggle={() => onToggleTrackMute(nativeTrack.trackId)} />
                    ) : audioId && onToggleAudioMute ? (
                      <MuteToggle muted={!!audioMuted} onToggle={onToggleAudioMute} />
                    ) : nativeTrack?.clips?.some((clip) => clip.kind === 'video') && onToggleTrackMute ? (
                      <MuteToggle muted={nativeTrack.muted} onToggle={() => onToggleTrackMute(nativeTrack.trackId)} />
                    ) : (
                      <span className="h-4 w-4" aria-hidden />
                    )}
                    {track === 0 && onToggleVideoHidden ? (
                      <VisibilityToggle hidden={!!videoHidden} onToggle={onToggleVideoHidden} />
                    ) : nativeTrack && onToggleTrackHidden ? (
                      <VisibilityToggle hidden={nativeTrack.hidden} onToggle={() => onToggleTrackHidden(nativeTrack.trackId)} />
                    ) : (
                      <span className="h-4 w-4" aria-hidden />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Breathing room: the first block's selection ring bleeds 2px left; without it, it slips under the sticky gutter and gets clipped (same on the right, see trailing spacer) */}
          <div className="shrink-0" style={{ width: EDGE_PAD }} />

          {/* Right: ruler + tracks + playhead */}
          <div
            ref={contentRef}
            data-timeline-content
            data-frame-pick-active={framePickActive ? '' : undefined}
            className={`relative select-none ${framePickActive ? 'cursor-crosshair [&_*]:cursor-crosshair' : ''}`}
            style={{ width: W }}
            onPointerDownCapture={(e) => {
              if (!framePickActive || e.button !== 0) return;
              e.preventDefault();
              e.stopPropagation();
              const atSec = frameSecAt(e.clientX);
              framePickConsumedRef.current = true;
              setHoverT(atSec);
              onSeek(atSec);
              onScrub(null);
              onPickFrame?.(atSec);
            }}
            onClickCapture={(e) => {
              if (!framePickActive && !framePickConsumedRef.current) return;
              framePickConsumedRef.current = false;
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={() => {
              if (framePickActive) return;
              // Click empty space = clear all selection. Interactive parts (shots/chips/ticks/buttons) each stopPropagation,
              // so what bubbles here is the background. A marquee drag's tail isn't a click (browsers usually don't fire click, but add a safeguard).
              if (marqueeDraggedRef.current || blockMarqueeDraggedRef.current) {
                marqueeDraggedRef.current = false;
                blockMarqueeDraggedRef.current = false;
                return;
              }
              onDeselectAll();
            }}
            onMouseMove={(e) => {
              if (draggingRef.current) return; // during drag onSeek handles it, don't also hover-seek
              hoverXRef.current = e.clientX;
              if (framePickActive) {
                scrubArmedRef.current = true;
                if (!hoverRaf.current)
                  hoverRaf.current = requestAnimationFrame(() => {
                    hoverRaf.current = 0;
                    const tt = frameSecAt(hoverXRef.current);
                    setHoverT(tt);
                    onScrub(tt);
                  });
                return;
              }
              if (!scrubArmedRef.current) {
                const a = scrubEnterRef.current;
                if (!a) scrubEnterRef.current = { x: e.clientX, y: e.clientY, ts: performance.now() };
                else if (performance.now() - a.ts >= 160 && Math.hypot(e.clientX - a.x, e.clientY - a.y) >= 6) {
                  scrubArmedRef.current = true;
                  // Armed → arm the escape guards too. A single mouseleave is NOT a reliable end-of-hover signal
                  // (fast flick out of the window / drag hand-offs can skip it — verified on prod: a missed leave
                  // leaves the preview frozen at the hover moment, captions from the hovered time lingering over
                  // the resting playhead). Guards are idempotent with onMouseLeave: whoever fires first restores.
                  const host = e.currentTarget as HTMLElement;
                  const guard = (ev: MouseEvent) => {
                    const r = host.getBoundingClientRect();
                    if (ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom) return;
                    endScrubRef.current();
                  };
                  const end = () => endScrubRef.current();
                  document.addEventListener('mousemove', guard);
                  window.addEventListener('blur', end);
                  document.documentElement.addEventListener('mouseleave', end);
                  scrubGuardCleanupRef.current = () => {
                    document.removeEventListener('mousemove', guard);
                    window.removeEventListener('blur', end);
                    document.documentElement.removeEventListener('mouseleave', end);
                  };
                }
              }
              if (!hoverRaf.current)
                hoverRaf.current = requestAnimationFrame(() => {
                  hoverRaf.current = 0;
                  const tt = secAt(hoverXRef.current);
                  setHoverT(tt); // hover line, instant feedback
                  if (scrubArmedRef.current) onScrub(tt); // only follow after armed: at most once per frame, center preview jumps frames
                });
            }}
            onMouseLeave={() => endScrubRef.current()}
          >
            {/* Ruler (click/drag to seek) + major/minor ticks */}
            {/* Sticky: with enough tracks the area scrolls vertically, and a ruler that scrolls away takes
                the one thing every other row is read against with it. */}
            <div
              className="border-line bg-panel text-ink-4 sticky top-0 z-[45] cursor-ew-resize select-none border-b text-[9px]"
              style={{ height: RULER_H }}
              onClick={(e) => e.stopPropagation()} // dragging the ruler to seek doesn't clear selection
              onPointerDown={onRulerPointerDown}
            >
              {framePickActive && (
                <div
                  data-frame-pick-hint
                  className="bg-ink text-bg pointer-events-none sticky top-1 left-2 z-[49] inline-flex w-fit items-center gap-2 rounded-sm px-2 py-1 text-[10px] shadow-md"
                >
                  <span>{t('chatGen.pickFrameOnTimeline')}</span>
                  <kbd className="border-bg/25 border-l pl-2 font-mono text-[9px] opacity-70">Esc</kbd>
                </div>
              )}
              {Array.from({ length: ticks }, (_, i) => {
                const s = i * step;
                return (
                  <div key={i} className="absolute bottom-0 top-0" style={{ left: x(s) }}>
                    <div className="bg-line absolute bottom-0 left-0 w-px" style={{ height: 6 }} />
                    <span className="text-ink-4 absolute left-1 top-0.5 tabular-nums">{fmtTick(s)}</span>
                    {/* Minor tick (half cell) */}
                    {x(step) >= 40 && <div className="bg-line/60 absolute bottom-0 w-px" style={{ left: x(step) / 2, height: 3 }} />}
                  </div>
                );
              })}
            </div>

            {hasDirectorScenes && <DirectorSceneStrip scenes={directorScenes} pps={pps} onSeek={onSeek} />}

            {/* Track background area (hosts all rows) */}
            <div ref={tracksRef} className="relative" style={{ height: tracksHeight }}>
              {/* Row background */}
              {displayTracks.map((track) => (
                <div
                  key={`bg${track}`}
                  data-track-row
                  data-visual-track-id={visualTrackId(track) ?? undefined}
                  data-graphics-track={typeof track === 'number' && track > 0 && track !== CAP_LANE ? '' : undefined}
                  className="bg-panel-2/40 absolute left-0 right-0 rounded"
                  style={{ top: rowTop(track), height: rowH(track) }}
                  onPointerDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    // Audio blank space seeks without starting a visual marquee. Visual rows keep the
                    // existing marquee gesture; the primary rail owns its own scene gesture below.
                    if (audioTrackId(track)) {
                      onSelectAudio?.(null);
                      onSeek(secAt(e.clientX));
                    } else if (track !== 0) onOverlayPointerDown(e);
                    else {
                      onSelect(null);
                      onSeek(secAt(e.clientX));
                    }
                  }}
                />
              ))}
              {/* Element-track marquee rectangle (can span tracks, includes y bounds) */}
              {blockMarquee && (
                <div
                  className="pointer-events-none absolute z-40 rounded-sm border border-sky-400 bg-sky-400/15"
                  style={{ left: blockMarquee.l, top: blockMarquee.t, width: Math.max(1, blockMarquee.r - blockMarquee.l), height: Math.max(1, blockMarquee.b - blockMarquee.t) }}
                />
              )}
              {/* Track reorder insert line (during gutter drag) */}
              {trackDrag && trackDrag.toSlot !== trackDrag.fromSlot && (
                <div
                  className="bg-accent/90 pointer-events-none absolute left-0 right-0 z-40 h-0.5 rounded"
                  style={{ top: trackInsertionLineTop(trackDrag) }}
                />
              )}

              {/* Track 0 is persistent document structure: it remains a drop target when empty, like a
                  conventional NLE. With clips it expands into the scene rail. */}
              <div ref={laneRef} data-main-track onPointerDown={onLanePointerDown} className="absolute left-0 right-0" style={{ top: rowTop(0), height: H0 }}>
                  {/* An empty primary track is intentional document state, not a missing render. Give it
                      its own persistent drop affordance instead of deriving a zero-width filmstrip from
                      a zero-duration filmstrip. It remains presentation-only; dropping still routes through the timeline. */}
                  {sceneSpans.length === 0 && (
                    <div
                      data-empty-main-track-placeholder
                      className={`pointer-events-none absolute top-3 bottom-2 left-2 flex items-center overflow-hidden border border-dashed px-3 transition-colors ${TIMELINE_ITEM_RADIUS} ${assetDragging && assetDragKind === 'video' ? 'border-accent/70 bg-accent/10 text-accent' : 'border-line/80 bg-panel/45 text-ink-4'}`}
                      style={{ width: Math.max(220, Math.min(420, W - 16)) }}
                    >
                      <span className="relative mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-ink/6">
                        <Film size={14} />
                        <Plus size={8} strokeWidth={2.5} className="bg-panel absolute -right-0.5 -bottom-0.5 rounded-full" />
                      </span>
                      <span className="truncate text-[10px] font-medium tracking-wide">
                        {t(assetDragging && assetDragKind === 'video' ? 'panels.releaseVideoOnPrimaryTrack' : 'panels.emptyPrimaryTrackDropVideo')}
                      </span>
                      <span className="ml-3 h-px min-w-8 flex-1 bg-current opacity-15" />
                    </div>
                  )}
                  {/* Scene cards (shot clips, semi-transparent so the filmstrip shows through): index + current-scene highlight.
                      Framing controls belong to the selected video border on the canvas, not the thumbnail. */}
                  {marquee && (
                    <div
                      className="pointer-events-none absolute top-3 bottom-2 z-40 rounded-sm border border-sky-400 bg-sky-400/15"
                      style={{ left: marquee.l, width: Math.max(1, marquee.r - marquee.l) }}
                    />
                  )}
                  {sceneSpans.map(({ shot, start, end }, i) => {
                    const sel = selectedShotIds.has(shot.id);
                    const enabled = placementEnabled.get(shot.id) ?? true;
                    const liveResize = shotResize?.shotId === shot.id ? shotResize : null;
                    const sourceRate = (shot.srcEnd - shot.srcStart) / Math.max(0.001, end - start);
                    const sourceFloor = sourceRate > 0 ? start - shot.srcStart / sourceRate : start;
                    const previousEnd = sceneSpans[i - 1]?.end ?? 0;
                    const packedAtStart = Math.abs(previousEnd - start) < 0.001;
                    const liveHeadRipple = liveResize?.edge === 'left' && packedAtStart && liveResize.atSec < start;
                    const displayStart = liveResize?.edge === 'left'
                      ? liveHeadRipple
                        ? start
                        : Math.max(0, sourceFloor, previousEnd, Math.min(liveResize.atSec, end - 0.2))
                      : start;
                    const displayEnd = liveHeadRipple
                      ? end + start - liveResize.atSec
                      : liveResize?.edge === 'right'
                        ? Math.max(start + 0.2, liveResize.atSec)
                        : end;
                    const liveSlip = shotSlip?.shotId === shot.id ? shotSlip : null;
                    const displaySourceStart = liveSlip
                      ? shot.srcStart + liveSlip.deltaSec
                      : liveResize?.edge === 'left'
                        ? shot.srcStart + (liveResize.atSec - start) * sourceRate
                        : shot.srcStart;
                    const displaySourceEnd = liveSlip
                      ? shot.srcEnd + liveSlip.deltaSec
                      : liveResize?.edge === 'right'
                        ? shot.srcEnd + (displayEnd - end) * sourceRate
                        : shot.srcEnd;
                    const shotLen = displayEnd - displayStart;
                    const gapR = i < sceneSpans.length - 1 ? SHOT_GAP : 0; // hairline gap off the right edge, left edge stays time-accurate
                    const w = Math.max(8, x(shotLen) - gapR);
                    const dragged = shotDrag?.from === i;
                    return (
                      <div key={shot.id}>
                        <button
                          type="button"
                          // Card press enters exact-time movement; stopPropagation keeps marquee selection separate.
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            if (e.altKey && onSlipShot) {
                              startShotSlip(e, i);
                              return;
                            }
                            startShotDrag(e, i);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (shotResizeMovedRef.current) {
                              shotResizeMovedRef.current = false;
                              return;
                            }
                            if (shotSlipMovedRef.current) {
                              shotSlipMovedRef.current = false; // tail of a slip drag, not a click
                              return;
                            }
                            if (shotDragMovedRef.current) {
                              shotDragMovedRef.current = false; // this is the tail of a clip drag, not a click
                              return;
                            }
                            if (marqueeDraggedRef.current) {
                              marqueeDraggedRef.current = false; // this is the tail of a marquee drag, not a click
                              return;
                            }
                            const additive = e.metaKey || e.ctrlKey;
                            if (!additive) onSeek(secAt(e.clientX)); // single select = select + playhead to click position; multi-select doesn't move the playhead
                            onSelectShot(shot.id, additive);
                          }}
                          onDoubleClick={(e) => e.stopPropagation()}
                          aria-label={t('panels.sceneNShotName', { n: i + 1, name: t(TREATMENT_NAME[shot.treatment] ?? shot.treatment) })}
                          aria-disabled={!enabled}
                          className={`group/shot bg-ink/10 absolute overflow-hidden text-left ${TIMELINE_ITEM_RADIUS} ${!enabled ? 'opacity-45 grayscale ' : ''}${
                            dragged ? 'opacity-30 ring-1 ring-white/10' : sel ? 'transition ring-2 ring-accent/70' : 'transition ring-1 ring-white/10 hover:ring-accent/40'
                          }`}
                          style={{ left: x(displayStart), width: w, top: SCENE_PAD_T, height: H0 - SCENE_PAD_T - SCENE_PAD_B }}
                        >
                          {liveSlip ? (
                            <div className="pointer-events-none absolute left-1 top-1 z-10 rounded bg-black/70 px-1.5 py-0.5 text-[10px] tabular-nums text-white">
                              {`${displaySourceStart.toFixed(1)}s – ${displaySourceEnd.toFixed(1)}s`}
                            </div>
                          ) : null}
                          {/* Filmstrip (clipped inside the card: rounded corners / hairline gaps from the card's overflow-hidden).
                              Externally inserted clip: the main filmstrip is the main video's frames, so pasting it would be wrong — lay down its own extracted frames
                              (clipStrips, t = clip source time; before frames are extracted, show a dedicated placeholder background) */}
                          {shot.src ? (
                            <div className="pointer-events-none absolute inset-0">
                              {(() => {
                                if (srcLive && !srcLive(shot.src)) return <MissingStrip />;
                                const strip = (shot.src ? clipStrips?.[shot.src] : null) ?? [];
                                if (!strip.length) return <div className="absolute inset-0 bg-gradient-to-r from-sky-500/35 to-sky-500/15" />;
                                if (end < visibleRange.startSec || start > visibleRange.endSec) return null;
                                return visibleStripTiles(strip, displaySourceStart, displaySourceEnd, tileDur, pps, displayStart, visibleRange.startSec, visibleRange.endSec, displayEnd).map((tl, ti) => (
                                  <img key={ti} data-film-tile src={tl.url} aria-hidden="true" loading="lazy" decoding="async" draggable={false} className="max-w-none absolute top-0 object-cover" style={{ left: tl.left, width: tl.width, height: filmH }} />
                                ));
                              })()}
                            </div>
                          ) : !mainLive ? (
                            <div className="pointer-events-none absolute inset-0">
                              <MissingStrip />
                            </div>
                          ) : (
                            <>
                              {displayEnd >= visibleRange.startSec && displayStart <= visibleRange.endSec && visibleStripTiles(filmstrip ?? [], displaySourceStart, displaySourceEnd, tileDur, pps, displayStart, visibleRange.startSec, visibleRange.endSec, displayEnd).map((tl, ti) => (
                                <img key={ti} data-film-tile src={tl.url} aria-hidden="true" loading="lazy" decoding="async" draggable={false} className="max-w-none pointer-events-none absolute top-0 object-cover" style={{ left: tl.left, width: tl.width, height: filmH }} />
                              ))}
                              {(filmstrip ?? []).length === 0 && <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-accent/20 to-accent/8" />}
                            </>
                          )}
                          {/* The video's OWN audio, along the card's bottom edge: same dB scale as the music
                              lane, shifted by this shot's level so muting or ducking a shot shows here too. */}
                          {(() => {
                            const band = sceneWaves.get(shot.id);
                            if (!band) return null;
                            return (
                              <svg
                                className={`pointer-events-none absolute inset-x-0 bottom-0 ${shot.audioMuted ? 'text-accent/25' : 'text-accent/60'}`}
                                style={{ height: SCENE_WAVE_H }}
                                viewBox={`0 0 ${Math.round(w)} ${SCENE_WAVE_H}`}
                                preserveAspectRatio="none"
                                aria-hidden
                              >
                                {/* same blue as the music lane, and the backing tapers with the fades exactly
                                    like a lane clip's body — the band IS the shot's audio, shape included */}
                                <path d={band.body} className="fill-accent/8" />
                                <path
                                  d={band.wave}
                                  fill="currentColor"
                                />
                              </svg>
                            );
                          })()}
                          {/* Index number */}
                          <span className="absolute left-1 top-1 rounded bg-black/55 px-1 text-[9px] font-semibold leading-[14px] text-white">{i + 1}</span>
                          {(['left', 'right'] as const).map((edge) => (
                            <span
                              key={edge}
                              role="none"
                              data-shot-trim-edge={edge}
                              onPointerDown={(event) => {
                                event.stopPropagation();
                                if (!onResizeShot || event.button !== 0) return;
                                onSelectShot(shot.id, false);
                                let latest = edge === 'left' ? start : end;
                                setShotResize({ shotId: shot.id, edge, atSec: latest });
                                setEndResizeSec(end);
                                drag(
                                  event,
                                  (clientX) => {
                                    const requested = snap(edge === 'left'
                                      ? rawSecAt(clientX)
                                      : timelinePointerSecond(rawSecAt(clientX), dur, true));
                                    latest = edge === 'left'
                                      ? Math.max(
                                          packedAtStart ? sourceFloor : Math.max(0, sourceFloor, previousEnd),
                                          Math.min(requested, end - 0.2),
                                        )
                                      : Math.max(start + 0.2, requested);
                                    setShotResize({ shotId: shot.id, edge, atSec: latest });
                                    setEndResizeSec(edge === 'left' && packedAtStart && latest < start
                                      ? end + start - latest
                                      : edge === 'right'
                                        ? latest
                                        : end);
                                    setGuide(latest);
                                  },
                                  (moved) => {
                                    setShotResize(null);
                                    setEndResizeSec(null);
                                    if (moved) {
                                      shotResizeMovedRef.current = true;
                                      onResizeShot(shot.id, edge, latest);
                                    }
                                  },
                                );
                              }}
                              className={`absolute inset-y-0 z-20 w-2 cursor-ew-resize transition-colors ${edge === 'left' ? `left-0 ${TIMELINE_ITEM_EDGE_RADIUS.left}` : `right-0 ${TIMELINE_ITEM_EDGE_RADIUS.right}`} ${sel ? 'bg-white/55' : 'bg-white/0 group-hover/shot:bg-white/55'}`}
                            />
                          ))}
                        </button>
                      </div>
                    );
                  })}
                  {/* Cut-point transition (content-level, mounted on the main track): unset = narrow "add" affordance; set = a
                      symmetric region centered on the cut (theme color), with handles on both sides dragging the duration symmetrically (drag one, the other mirrors; total <=4s).
                      z-30 is above scene cards, below the hover "+" (z-40) */}
                  {onOpenTransition &&
                    (() => {
                      const trs = cutTransitions(shots, activeVideoPlacements);
                      return sceneSpans.slice(0, -1).map(({ end }, i) => {
                        if (!(placementEnabled.get(sceneSpans[i]!.shot.id) ?? true)
                          || !(placementEnabled.get(sceneSpans[i + 1]!.shot.id) ?? true)) return null;
                        const tr = trs.find((t2) => Math.abs(t2.cut - end) < 0.05);
                        if (!tr) {
                          return (
                            <button
                              key={`tr-${i}`}
                              type="button"
                              aria-label={t('panels.addTransition')}
                              onMouseEnter={() => {
                                if (draggingRef.current) return; // don't grab hover-scrub while dragging
                                // Hovering the transition spot = clear intent: arm hover-scrub immediately, center preview jumps straight to the cut frame
                                scrubArmedRef.current = true;
                                setHoverT(end);
                                onScrub(end);
                              }}
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenTransition(end, e.currentTarget.getBoundingClientRect());
                              }}
                              className="absolute z-30 flex h-5 w-5 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full bg-black/55 text-white/75 shadow-sm transition hover:bg-black/75 hover:text-white"
                              style={{ left: x(end), top: SCENE_PAD_T + 3 }}
                            >
                              <ArrowLeftRight size={10} />
                            </button>
                          );
                        }
                        // Live half-width while dragging (local state); handle clamped to [0.1, min(2, both sides' shot lengths)]
                        const lenPrev = sceneSpans[i]!.end - sceneSpans[i]!.start;
                        const lenSelf = sceneSpans[i + 1]!.end - sceneSpans[i + 1]!.start;
                        const maxHalf = Math.min(MAX_TRANSITION_SEC / 2, lenPrev, lenSelf);
                        const half = trDrag && Math.abs(trDrag.cut - end) < 0.05 ? trDrag.half : tr.half;
                        const handle = (side: -1 | 1) => (
                          <div
                            role="none"
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              drag(
                                e,
                                (cx) => setTrDrag({ cut: end, half: Math.min(maxHalf, Math.max(0.1, Math.abs(secAt(cx) - end))) }),
                                (moved) => {
                                  setTrDrag((cur) => {
                                    if (moved && cur) onResizeTransition?.(tr.shotId, Math.round(cur.half * 2 * 100) / 100);
                                    return null;
                                  });
                                },
                              );
                            }}
                            className="bg-accent pointer-events-auto absolute top-0 bottom-0 w-1.5 cursor-ew-resize rounded-full opacity-80 hover:opacity-100"
                            style={side < 0 ? { left: -3 } : { right: -3 }}
                          />
                        );
                        return (
                          <div
                            key={`tr-${i}`}
                            data-transition-region
                            className="pointer-events-none absolute top-3 bottom-2 z-30"
                            style={{ left: x(end - half), width: Math.max(10, x(half * 2)) }}
                            onMouseEnter={(e) => {
                              if (draggingRef.current) return; // don't grab hover-scrub while dragging
                              // Hovering the transition region = clear intent: arm immediately, preview jumps to the cursor's time (subsequent mousemove bubbles up to follow)
                              scrubArmedRef.current = true;
                              const tt = secAt(e.clientX);
                              setHoverT(tt);
                              onScrub(tt);
                            }}
                          >
                            <button
                              type="button"
                              aria-label={t('panels.editTransition')}
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenTransition(end, e.currentTarget.getBoundingClientRect());
                              }}
                              className={`bg-accent/30 ring-accent/70 pointer-events-none absolute inset-0 ring-1 ${TIMELINE_ITEM_RADIUS}`}
                            >
                              <span className="bg-accent pointer-events-auto absolute left-1/2 top-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-white shadow transition hover:brightness-110">
                                <ArrowLeftRight size={9} />
                              </span>
                            </button>
                            {handle(-1)}
                            {handle(1)}
                          </div>
                        );
                      });
                    })()}
              </div>

              {/* Native visual media lanes. They are separate from the semantic primary rail and from
                  HTML graphics tracks, so visual clips can overlap the talking head/components without
                  forcing either lane to ripple. */}
              {visualTracks.flatMap((track) => (track.clips ?? []).map((clip) => {
                const live = visualClipDrag?.clipId === clip.clipId ? visualClipDrag : null;
                const liveResize = visualClipResize?.clipId === clip.clipId ? visualClipResize : null;
                const selected = selectedVisualClipId === clip.clipId;
                const top = rowTop(visualLaneKey(track.trackId)) + VISUAL_SCENE_PAD_T;
                const displayStart = liveResize?.edge === 'left'
                  ? Math.max(0, Math.min(liveResize.atSec, clip.endSec - 0.2))
                  : clip.startSec;
                const displayEnd = liveResize?.edge === 'right'
                  ? Math.max(clip.startSec + 0.2, liveResize.atSec)
                  : clip.endSec;
                const left = x(displayStart);
                const width = Math.max(20, x(displayEnd - displayStart));
                const visualStrip = clip.kind === 'video'
                  ? clip.usePrimaryFilmstrip ? filmstrip ?? [] : clip.source ? clipStrips?.[clip.source] ?? [] : []
                  : [];
                const liveSource = clip.usePrimaryFilmstrip ? mainLive !== false : !clip.source || !srcLive || srcLive(clip.source);
                const waveBand = visualWaves.get(clip.clipId);
                return (
                  <div
                    key={clip.clipId}
                    data-visual-track-id={track.trackId}
                    data-visual-clip-id={clip.clipId}
                    aria-disabled={!clip.enabled}
                    className={`bg-ink/10 group absolute overflow-hidden text-left ${TIMELINE_ITEM_RADIUS} ${!clip.enabled ? 'opacity-45 grayscale ' : ''}${live ? 'opacity-30 ring-1 ring-white/10' : selected ? 'transition ring-2 ring-accent/70' : 'transition ring-1 ring-white/10 hover:ring-accent/40'}`}
                    style={{ left, width, top, height: VISUAL_VIDEO_CLIP_H }}
                    onClick={(event) => {
                      event.stopPropagation();
                      onSeek(secAt(event.clientX));
                    }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      onSelectVisualClip?.(clip.clipId);
                      if (!onMoveVisualClip) return;
                      const grab = secAt(event.clientX) - clip.startSec;
                      const grabY = event.clientY - event.currentTarget.getBoundingClientRect().top;
                      const durationSec = clip.endSec - clip.startSec;
                      let snapLock: { edge: 'start' | 'end'; point: number } | null = null;
                      drag(
                        event,
                        (clientX, clientY) => {
                          const snapped = snapClipStart(Math.max(0, secAt(clientX) - grab), durationSec, [clip.startSec, clip.endSec], snapLock);
                          snapLock = snapped.lock;
                          let startSec = snapped.startSec;
                          let target = visualMoveTargetAt(clientY, clip.kind === 'video');
                          if (target.kind === 'primary' && snapEnabled) {
                            const packed = packedPrimaryPlacement(primarySpans, clip.clipId, startSec, durationSec);
                            target = { kind: 'primary', insertIndex: packed.index };
                            setGuide(packed.startSec);
                          }
                          const bounds = tracksRef.current?.getBoundingClientRect();
                          const next = {
                            clipId: clip.clipId,
                            startSec,
                            ghostTop: clientY - (bounds?.top ?? 0) - grabY,
                            target,
                          };
                          visualClipDragRef.current = next;
                          setVisualClipDrag(next);
                        },
                        (moved) => {
                          const current = visualClipDragRef.current;
                          setVisualClipDrag(null);
                          if (moved && current?.clipId === clip.clipId) onMoveVisualClip(clip.clipId, current.startSec, current.target);
                        },
                      );
                    }}
                  >
                    {clip.kind === 'image' && clip.source && clip.endSec >= visibleRange.startSec && clip.startSec <= visibleRange.endSec && (
                      <img src={clip.source} alt="" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
                    )}
                    {clip.kind === 'video' && (
                      <div className="pointer-events-none absolute inset-0">
                        {!liveSource ? <MissingStrip /> : visualStrip.length > 0 ? visibleStripTiles(
                          visualStrip,
                          clip.sourceInSec,
                          clip.sourceOutSec,
                          visualTileDur,
                          pps,
                          clip.startSec,
                          visibleRange.startSec,
                          visibleRange.endSec,
                          clip.endSec,
                        ).map((tile, index) => (
                          <img
                            key={index}
                            src={tile.url}
                            alt=""
                            draggable={false}
                            className="absolute top-0 max-w-none object-cover"
                            style={{ left: tile.left, width: tile.width, height: visualFilmH }}
                          />
                        )) : (
                          <div className="absolute inset-0 bg-gradient-to-r from-accent/20 to-accent/8" />
                        )}
                      </div>
                    )}
                    {waveBand && (
                      <svg
                        className="text-accent/60 pointer-events-none absolute inset-x-0 bottom-0"
                        style={{ height: SCENE_WAVE_H }}
                        viewBox={`0 0 ${Math.round(width)} ${SCENE_WAVE_H}`}
                        preserveAspectRatio="none"
                        aria-hidden
                      >
                        <path d={waveBand.body} className="fill-accent/8" />
                        <path d={waveBand.wave} fill="currentColor" />
                      </svg>
                    )}
                    {clip.kind === 'image' && width > 46 && (
                      <span className="pointer-events-none absolute bottom-1 left-1 max-w-[calc(100%-8px)] truncate rounded bg-black/55 px-1 text-[9px] text-white">
                        {clip.label || t('panels.image')}
                      </span>
                    )}
                    {(['left', 'right'] as const).map((edge) => (
                      <div
                        key={edge}
                        role="none"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          if (!onResizeVisualClip) return;
                          let latest = edge === 'left' ? clip.startSec : clip.endSec;
                          const maximumEndSec = clip.kind === 'video'
                            ? timelineSourceResizeEnd(
                                clip.startSec,
                                clip.endSec,
                                clip.sourceInSec,
                                clip.sourceOutSec,
                                clip.sourceDurationSec,
                              )
                            : Number.POSITIVE_INFINITY;
                          setVisualClipResize({ clipId: clip.clipId, edge, atSec: latest });
                          if (edge === 'right') setEndResizeSec(latest);
                          drag(
                            event,
                            (clientX) => {
                              latest = Math.min(
                                maximumEndSec,
                                snap(timelinePointerSecond(rawSecAt(clientX), dur, edge === 'right')),
                              );
                              setVisualClipResize({ clipId: clip.clipId, edge, atSec: latest });
                              if (edge === 'right') setEndResizeSec(latest);
                              setGuide(latest);
                            },
                            (moved) => {
                              setVisualClipResize(null);
                              setEndResizeSec(null);
                              if (moved) onResizeVisualClip(clip.clipId, edge, latest);
                            },
                          );
                        }}
                        className={`absolute inset-y-0 z-10 w-1.5 cursor-ew-resize transition-colors ${edge === 'left' ? `left-0 ${TIMELINE_ITEM_EDGE_RADIUS.left}` : `right-0 ${TIMELINE_ITEM_EDGE_RADIUS.right}`} ${selected ? 'bg-white/50' : 'bg-white/0 group-hover:bg-white/40'}`}
                      />
                    ))}
                  </div>
                );
              }))}

              {/* NLE-style internal drag: the source stays faint in place and a separate ghost
                  follows the pointer. A new lane is represented by one insertion line, never a
                  temporary row that shifts every track underneath the gesture. */}
              {activeVisualGhost?.target.kind === 'visual-new' && (
                <div
                  className="bg-amber-400 pointer-events-none absolute left-0 right-0 z-50 h-0.5 -translate-y-1/2 rounded-full shadow-[0_0_6px_rgba(251,191,36,0.65)]"
                  style={{ top: visualInsertionLineTop(activeVisualGhost.target.slot) }}
                />
              )}
              {activeVisualGhost && (() => {
                // The preview belongs to the pointer, not the destination. It keeps its source size
                // and free y throughout the gesture; only the committed document snaps into a lane.
                const ghostHeight = activeVisualGhost.ghostHeight;
                const ghostFilmHeight = activeVisualGhost.kind === 'video' ? ghostHeight - SCENE_WAVE_H : ghostHeight;
                const ghostWidth = Math.max(20, x(activeVisualGhost.durationSec));
                const ghostStrip = activeVisualGhost.kind === 'video'
                  ? activeVisualGhost.usePrimaryFilmstrip
                    ? filmstrip ?? []
                    : activeVisualGhost.source
                      ? clipStrips?.[activeVisualGhost.source] ?? []
                      : []
                  : [];
                const ghostBand = activeVisualGhost.kind === 'video'
                  ? sceneWaves.get(activeVisualGhost.clipId) ?? visualWaves.get(activeVisualGhost.clipId)
                  : undefined;
                return (
                  <div
                    className={`bg-ink/10 pointer-events-none absolute z-[60] overflow-hidden shadow-xl ring-2 ring-accent ${TIMELINE_ITEM_RADIUS}`}
                    style={{
                      left: x(activeVisualGhost.startSec),
                      top: activeVisualGhost.ghostTop,
                      width: ghostWidth,
                      height: ghostHeight,
                      opacity: 0.82,
                    }}
                  >
                    {activeVisualGhost.kind === 'image' && activeVisualGhost.source && (
                      <img src={activeVisualGhost.source} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover opacity-70" />
                    )}
                    {ghostStrip.length > 0 && stripTiles(
                      ghostStrip,
                      activeVisualGhost.sourceInSec,
                      activeVisualGhost.sourceOutSec,
                      ghostFilmHeight / pps,
                      pps,
                    ).map((tile, index) => (
                      <img
                        key={index}
                        src={tile.url}
                        alt=""
                        draggable={false}
                        className="absolute top-0 max-w-none object-cover"
                        style={{ left: tile.left, width: ghostFilmHeight, height: ghostFilmHeight }}
                      />
                    ))}
                    {activeVisualGhost.kind === 'video' && ghostStrip.length === 0 && (
                      <div className="absolute inset-0 bg-gradient-to-r from-accent/20 to-accent/8" />
                    )}
                    {ghostBand && (
                      <svg
                        className="text-accent/60 absolute inset-x-0 bottom-0"
                        style={{ height: SCENE_WAVE_H }}
                        viewBox={`0 0 ${Math.round(ghostWidth)} ${SCENE_WAVE_H}`}
                        preserveAspectRatio="none"
                        aria-hidden
                      >
                        <path d={ghostBand.body} className="fill-accent/8" />
                        <path d={ghostBand.wave} fill="currentColor" />
                      </svg>
                    )}
                    {activeVisualGhost.kind === 'image' && ghostWidth > 46 && (
                      <span className="absolute bottom-1 left-1 max-w-[calc(100%-8px)] truncate rounded bg-black/55 px-1 text-[9px] text-white">
                        {activeVisualGhost.label}
                      </span>
                    )}
                  </div>
                );
              })()}

              {/* Overlay element chip: type icon + label + time when selected; whole-block drag + trim at both ends */}
              {comp.blocks.map((b) => {
                const track = laneForBlock(b);
                const btd = blockTrackDrag?.id === b.id ? blockTrackDrag : null;
                const sel = selectedBlockIds.has(b.id);
                const k = blockKind(b);
                const meta = { ...KIND_META[k], ...KIND_CHIP[k] };
                const Icon = meta.icon;
                const displayStartSec = btd?.startSec ?? b.startSec;
                const displayDurationSec = Math.max(0, Math.min(b.durationSec, dur - displayStartSec));
                const left = x(displayStartSec);
                const width = Math.max(16, x(displayDurationSec));
                // Sentence captions don't enter the timeline: captions are a pure computed output of the script (edited from the script panel / caption panel);
                // a row of chips that follow the transcript and can't be dragged or trimmed is just noise
                if (isSentenceCaption(b)) return null;
                if (displayDurationSec <= 0) return null;
                // During cross-track drag the chip follows an exact physical lane identity. stackOrder
                // is render z only and cannot identify a lane when two imported tracks share a value.
                const crossing = !!btd && (btd.gap != null || btd.to !== track);
                const top = btd?.gap != null
                  ? btd.gap.top + 4
                  : rowTop(btd?.to ?? track) + 4;
                return (
                  <div
                    key={b.id}
                    aria-disabled={disabledClipIds?.has(b.id)}
                    data-block-selection-keep={sel ? '' : undefined}
                    className={`group absolute overflow-hidden ring-1 ${TIMELINE_ITEM_RADIUS} ${disabledClipIds?.has(b.id) ? 'opacity-45 grayscale ' : ''}${crossing ? 'z-40 shadow-lg ring-2 brightness-110' : 'transition'} ${sel ? meta.chipSel : meta.chip}`}
                    style={{ left, width, top, height: ROW_H - 8 }}
                    onClick={(e) => e.stopPropagation()} // chip is selected via pointer; block bubbling so the background doesn't clear it
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onSelect(b.id); // positioning was already done by the single click (stop where you clicked); double-click no longer jumps to the block start
                    }}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      const additive = e.metaKey || e.ctrlKey; // Cmd/Ctrl multi-select
                      const at = secAt(e.clientX); // time at press point: on click the playhead stops here
                      const grab = at - b.startSec;
                      drag(
                        e,
                        (cx, cy) => {
                          if (additive) return;
                          const startSec = snap(Math.max(0, secAt(cx) - grab), [b.startSec, b.startSec + b.durationSec]);
                          // Vertical: a row's core band = snap to row; a row gap (including the scene track's lower edge / caption lane's sides) = new-track insert position
                          if (!onMoveBlockTrack) {
                            previewBlockTrackDrag({ id: b.id, startSec, to: track, gap: null });
                            return;
                          }
                          const base = tracksRef.current?.getBoundingClientRect();
                          if (!base) return;
                          const y = cy - base.top;
                          const target = timelineCompatibleTrackDropTarget(
                            nativeDropRows,
                            y,
                            ROW_H,
                            graphicsTrackIds,
                            protectedTrackIds,
                          );
                          if (!target || (!onMoveBlockNewTrack && target.kind === 'new-track')) {
                            const prev = blockTrackDragRef.current?.id === b.id ? blockTrackDragRef.current : null;
                            previewBlockTrackDrag({ id: b.id, startSec, to: prev?.to ?? track, gap: null });
                          } else if (target.kind === 'new-track') {
                            previewBlockTrackDrag({ id: b.id, startSec, to: null, gap: target });
                          } else {
                            const to = nativeDisplayTracks.find((lane) => nativeTrackIdForLane(lane) === target.trackId) ?? track;
                            previewBlockTrackDrag({ id: b.id, startSec, to, gap: null });
                          }
                        },
                        (moved) => {
                          const td = blockTrackDragRef.current;
                          blockTrackDragRef.current = null;
                          setBlockTrackDrag(null);
                          if (moved) {
                            if (td?.id === b.id) {
                              if (td.gap != null) onMoveBlockNewTrack?.(b.id, td.gap.newTrackIndex, td.startSec);
                              else if (td.to != null && td.to !== track) {
                                const targetTrackId = visualTrackId(td.to);
                                const stackOrder = targetTrackId
                                  ? visualTracks.find((candidate) => candidate.trackId === targetTrackId)?.stackOrder
                                  : td.to;
                                if (typeof stackOrder === 'number') {
                                  onMoveBlockTrack?.(b.id, {
                                    ...(targetTrackId ? { trackId: targetTrackId } : {}),
                                    stackOrder,
                                  }, td.startSec);
                                }
                              } else onMoveBlock(b.id, td.startSec);
                            }
                            return;
                          }
                          if (additive) {
                            onSelectBlock(b.id, true); // toggle in/out of the multi-select set, don't move the playhead
                            return;
                          }
                          // Click = select + playhead to the exact clicked position (stage shows that moment directly)
                          onSeek(at);
                          onSelectBlock(b.id, false);
                        },
                      );
                    }}
                  >
                    <div className="pointer-events-none flex h-full items-center gap-1 px-2">
                      <Icon size={11} className={`${meta.dot} shrink-0`} />
                      <span className="text-ink truncate text-[10px] font-medium">{blockDisplayTitle(b)}</span>
                      {sel && width > 92 && (
                        <span className="text-ink-3 ml-auto shrink-0 font-mono text-[9px] tabular-nums">
                          {b.startSec.toFixed(1)}–{(b.startSec + b.durationSec).toFixed(1)}
                        </span>
                      )}
                    </div>
                    {/* Left trim */}
                    <span
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        const end = b.startSec + b.durationSec;
                        drag(e, (cx) => {
                          const ns = Math.max(0, Math.min(end - MIN_DUR, snap(secAt(cx), [b.startSec])));
                          onResizeBlock(b.id, ns, end - ns);
                        });
                      }}
                      className={`absolute inset-y-0 left-0 w-1.5 cursor-ew-resize ${TIMELINE_ITEM_EDGE_RADIUS.left} ${sel ? 'bg-white/50' : 'bg-white/0 group-hover:bg-white/40'}`}
                    />
                    {/* Right trim */}
                    <span
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setEndResizeSec(b.startSec + b.durationSec);
                        drag(
                          e,
                          (cx) => {
                            const ne = Math.max(
                              b.startSec + MIN_DUR,
                              snap(timelinePointerSecond(rawSecAt(cx), dur, true), [b.startSec + b.durationSec]),
                            );
                            setEndResizeSec(ne);
                            onResizeBlock(b.id, b.startSec, ne - b.startSec);
                          },
                          () => setEndResizeSec(null),
                        );
                      }}
                      className={`absolute inset-y-0 right-0 w-1.5 cursor-ew-resize ${TIMELINE_ITEM_EDGE_RADIUS.right} ${sel ? 'bg-white/50' : 'bg-white/0 group-hover:bg-white/40'}`}
                    />
                  </div>
                );
              })}

              {/* New-track horizontal insert line (when a block is dragged into a row gap): rides the center of the gap between two rows */}
              {blockTrackDrag?.gap != null && (
                <div
                  className="bg-accent pointer-events-none absolute left-0 z-40 h-0.5 rounded-full shadow"
                  style={{ top: blockTrackDrag.gap.lineTop - 1, width: x(dur) }}
                />
              )}

              {/* Caption lane: click selects/jumps; either edge trims the display window without changing copy. */}
              {hasCaptions &&
                captionBlocks.map((b) => {
                  const preview = captionResize?.id === b.id ? captionResize : b;
                  const selected = selectedBlockIds.has(b.id);
                  const displayDurationSec = Math.max(0, Math.min(preview.durationSec, dur - preview.startSec));
                  if (displayDurationSec <= 0) return null;
                  const width = Math.max(10, x(displayDurationSec));
                  const precisionControls = width >= 18;
                  const end = b.startSec + b.durationSec;
                  const minDurationSec = 1 / Math.max(1, framePickFps);
                  return (
                    <div
                      key={b.id}
                      aria-disabled={disabledClipIds?.has(b.id)}
                      className={`group absolute overflow-hidden bg-rose-500/12 ring-1 transition hover:bg-rose-500/20 ${selected ? 'ring-rose-400/60' : 'ring-rose-400/25'} ${TIMELINE_ITEM_RADIUS} ${disabledClipIds?.has(b.id) ? 'opacity-45 grayscale' : ''}`}
                      style={{ left: x(preview.startSec), width, top: rowTop(captionLane) + 4, height: ROW_H - 8 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectBlock(b.id, false); // picking a concrete caption on the timeline selects it (the one place that sets caption selection outside the stage)
                        onSeek(secAt(e.clientX));
                      }}
                    >
                      <div className="pointer-events-none flex h-full items-center gap-1.5 px-2">
                        <span className="text-ink-2 truncate text-[10px]">{b.label || t('panels.captions')}</span>
                        {selected && width > 82 && (
                          <span className="text-ink-3 ml-auto shrink-0 font-mono text-[9px] tabular-nums">
                            {preview.durationSec.toFixed(1)}s
                          </span>
                        )}
                      </div>
                      {onResizeCaption && precisionControls && !disabledClipIds?.has(b.id) && (
                        <>
                          <span
                            aria-label="Trim caption start"
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              onSelectBlock(b.id, false);
                              let latest = b.startSec;
                              drag(
                                e,
                                (cx) => {
                                  const snapped = snap(secAt(cx), [b.startSec, end]);
                                  latest = Math.max(0, Math.min(end - minDurationSec, quantizeTimelineFrameSecond(snapped, dur, framePickFps)));
                                  setCaptionResize({ id: b.id, startSec: latest, durationSec: end - latest });
                                },
                                (moved) => {
                                  setCaptionResize(null);
                                  if (moved) onResizeCaption(b.id, 'left', latest);
                                },
                              );
                            }}
                            className={`absolute inset-y-0 left-0 w-1.5 cursor-ew-resize ${TIMELINE_ITEM_EDGE_RADIUS.left} ${selected ? 'bg-white/30' : 'bg-transparent group-hover:bg-white/20'}`}
                          />
                          <span
                            aria-label="Trim caption end"
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              onSelectBlock(b.id, false);
                              let latest = end;
                              setEndResizeSec(latest);
                              drag(
                                e,
                                (cx) => {
                                  const snapped = snap(timelinePointerSecond(rawSecAt(cx), dur, true), [b.startSec, end]);
                                  latest = Math.max(
                                    b.startSec + minDurationSec,
                                    Math.round(snapped * Math.max(1, framePickFps)) / Math.max(1, framePickFps),
                                  );
                                  setEndResizeSec(latest);
                                  setCaptionResize({ id: b.id, startSec: b.startSec, durationSec: latest - b.startSec });
                                },
                                (moved) => {
                                  setCaptionResize(null);
                                  setEndResizeSec(null);
                                  if (moved) onResizeCaption(b.id, 'right', latest);
                                },
                              );
                            }}
                            className={`absolute inset-y-0 right-0 w-1.5 cursor-ew-resize ${TIMELINE_ITEM_EDGE_RADIUS.right} ${selected ? 'bg-white/30' : 'bg-transparent group-hover:bg-white/20'}`}
                          />
                        </>
                      )}
                    </div>
                  );
                })}

              {/* One component per native audio track. Gesture state stays local so waveform dragging
                  does not re-render the full timeline, while vertical release carries the real track id. */}
              {audioDropTarget?.kind === 'new-track' && (
                <div
                  className="bg-amber-400 pointer-events-none absolute left-0 right-0 z-50 h-0.5 -translate-y-1/2 rounded-full shadow-[0_0_6px_rgba(251,191,36,0.65)]"
                  style={{ top: audioDropTarget.lineTop }}
                />
              )}
              {visibleAudioLanes.map((lane, index) => (
                <AudioLane
                  key={lane.trackId ?? `audio-fallback-${index}`}
                  trackId={lane.trackId}
                  clips={lane.clips}
                  disabledIds={disabledClipIds}
                  dur={dur}
                  surfaceDur={surfaceDur}
                  pps={pps}
                  top={rowTop(audioLaneTracks[index]!)}
                  peaks={audioPeaks}
                  selectedId={selectedAudioId}
                  onSelect={onSelectAudio}
                  resolveMoveTarget={resolveAudioMoveTarget}
                  onMoveTargetChange={setAudioDropTarget}
                  onMove={onMoveAudio}
                  onTrim={onTrimAudio}
                  onFade={onFadeAudio}
                  onToggleMute={onToggleAudioClipMute}
                  onOpenPanel={onOpenMusicPanel}
                  secAt={secAt}
                  endSecAt={(clientX) => timelinePointerSecond(rawSecAt(clientX), dur, true)}
                  onEndResizePreview={setEndResizeSec}
                  snap={snap}
                  drag={drag}
                />
              ))}

              {/* Snap alignment guide (when a drag hits a cut point / whole second / adjacent block edge / playhead) */}
              {guide != null && (
                <div className="pointer-events-none absolute top-0 bottom-0 z-40" style={{ left: x(guide) }}>
                  <div className="absolute top-0 bottom-0 w-px bg-accent/90" style={{ boxShadow: '0 0 6px rgba(63,75,232,0.55)' }} />
                </div>
              )}

              {/* Asset drop plan: exact x, explicit target lane, and explicit normal/Ripple mode. */}
              {dropActive && dropHint != null && (() => {
                const mediaTarget = typeof dropHint.target === 'object' ? dropHint.target : null;
                const newLane = mediaTarget?.kind === 'visual-new' ? mediaTarget : null;
                const targetTop = mediaTarget?.kind === 'primary'
                  ? rowTop(0) + SCENE_PAD_T
                  : mediaTarget?.kind === 'visual'
                    ? rowTop(visualLaneKey(mediaTarget.trackId)) + VISUAL_SCENE_PAD_T
                    : newLane
                      ? visualTargetTop(newLane)
                      : 0;
                const ghostDuration = assetDragKind === 'image' ? 5 : 3;
                return (
                  <>
                    {newLane && (
                      <div
                        className="bg-amber-400 pointer-events-none absolute left-0 z-40 h-0.5 rounded-full shadow"
                        style={{ top: visualInsertionLineTop(newLane.slot), width: x(dur) }}
                      />
                    )}
                    {mediaTarget && (
                      <div
                        className={`pointer-events-none absolute z-40 border-2 border-dashed border-accent/80 bg-accent/15 ${TIMELINE_ITEM_RADIUS}`}
                        style={{
                          left: x(dropHint.t),
                          top: targetTop,
                          width: Math.max(28, x(ghostDuration)),
                          height: mediaTarget.kind === 'primary' ? VIDEO_CLIP_H : VISUAL_VIDEO_CLIP_H,
                        }}
                      />
                    )}
                    <div className="pointer-events-none absolute top-0 bottom-0 z-40" style={{ left: x(dropHint.t) }}>
                      <div className="bg-accent absolute top-0 bottom-0 w-0.5 -translate-x-1/2" style={{ boxShadow: '0 0 8px rgba(63,75,232,0.7)' }} />
                      <div className="bg-accent absolute -top-0.5 left-1.5 rounded px-1 text-[9px] leading-[13px] whitespace-nowrap text-white">
                        {mediaTarget
                          ? `${t(dropHint.mode === 'ripple' ? 'panels.rippleInsert' : 'panels.overwritePlace')} · ${dropHint.t.toFixed(1)}s${newLane ? ` · ${t('panels.newVisualTrack')}` : ''}`
                          : t('panels.insertSecS', { sec: dropHint.t.toFixed(1) })}
                      </div>
                    </div>
                  </>
                );
              })()}

              {/* External clip insert in progress (download/upload/reading duration): show a badge at the drop point so it doesn't look like the drag did nothing */}
              {clipPendingAt != null && (
                <div className="pointer-events-none absolute z-40 -translate-x-1/2" style={{ left: x(clipPendingAt), top: 8 }}>
                  <span className="inline-flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] whitespace-nowrap text-white">
                    <Loader2 size={10} className="animate-spin" /> {t('common.inserting')}
                  </span>
                </div>
              )}

            </div>

            {/* Hover vertical line (spans ruler + tracks; center preview jumps to that frame in sync). */}
            {hoverT != null && (framePickActive
              ? <FramePickCursor second={hoverT} pps={pps} />
              : <HoverCursor second={hoverT} pps={pps} />)}

            {/* Playhead: spans ruler + tracks, bright line + top dot (subscribes to the playhead store, only this component moves each frame).
                Not drawn on an empty project — a red line hanging on empty tracks looks broken */}
            {(hasVideoLane || comp.blocks.length > 0 || audioClips.length > 0) && <PlayheadCursor pps={pps} onPointerDown={onPlayheadPointerDown} />}
          </div>

          {/* Right breathing room: the last block's selection ring bleed isn't clipped by the scroll container's right edge */}
          <div className="shrink-0" style={{ width: EDGE_PAD }} />
        </div>
      </div>
    </div>
  );
}
