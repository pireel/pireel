/**
 * The canvas timeline's picture of a project: which lanes there are, in what order and how tall,
 * and where every clip sits on them. Pure data from the composition and the track states; nothing
 * here knows about scrolling, zoom or the pointer, so one layout serves every frame until the
 * project itself changes. Lane rules are the DOM timeline's (studio-timeline.tsx), kept identical
 * so the two can be compared item by item.
 */
import {
  type AudioClip,
  type Block,
  type BlockKind,
  type Composition,
  audioClipWindow,
  blockKind,
  isSentenceCaption,
  videoShotTimelineSpans,
  videoTrackShots,
} from '@pireel/studio-engine/composition';
import type { NarrativeTimelinePlacement } from '../primary-render-plan';
import type { TimelinePendingRange, TimelineTrackState, TimelineTransitionItem, TimelineVisualClipState } from '../studio-timeline';
import { timelineAudioLanes, timelineTrackDisplayOrder } from '../timeline-audio-tracks';
import { CAP_LANE, SHOT_GAP, type TimelineMetrics } from '../timeline-utils';

export type LaneKey = number | `visual:${string}` | `audio:${string}`;
export const visualLaneKey = (trackId: string): LaneKey => `visual:${trackId}`;
export const audioLaneKey = (trackId: string): LaneKey => `audio:${trackId}`;
export const visualTrackIdOf = (lane: LaneKey): string | null => (typeof lane === 'string' && lane.startsWith('visual:') ? lane.slice(7) : null);
export const audioTrackIdOf = (lane: LaneKey): string | null => (typeof lane === 'string' && lane.startsWith('audio:') ? lane.slice(6) : null);

type Shot = ReturnType<typeof videoTrackShots>[number];

export interface TimelineLane {
  key: LaneKey;
  top: number;
  height: number;
  /** What the lane holds, for its header icon: the first block's kind, or video. */
  kind: BlockKind | 'video';
  /** The native track behind the lane, when the document has one. */
  track?: TimelineTrackState;
  trackId: string | null;
  audio: boolean;
  /** A lane above or below the story spine that holds graphics, captions or detached media. */
  layer: boolean;
  /** The lane's render order among the layers (0 for the spine and for audio). */
  stackOrder: number;
}

interface ItemBase {
  id: string;
  lane: LaneKey;
  startSec: number;
  endSec: number;
  /** Top and height inside the tracks area (under the ruler). */
  top: number;
  height: number;
  /** The narrowest the item is ever drawn, in px. */
  minWidth: number;
  /** Px taken off the right edge (the hairline between two shots). */
  gapRight: number;
}
export type TimelineItem =
  | (ItemBase & { kind: 'shot'; index: number; shot: Shot; enabled: boolean })
  | (ItemBase & { kind: 'visual'; clip: TimelineVisualClipState; trackId: string })
  | (ItemBase & { kind: 'block'; block: Block; blockKind: BlockKind })
  | (ItemBase & { kind: 'caption'; block: Block })
  | (ItemBase & { kind: 'audio'; clip: AudioClip; trackId?: string })
  | (ItemBase & { kind: 'transition'; transition: TimelineTransitionItem })
  | (ItemBase & { kind: 'pending'; range: TimelinePendingRange });

export interface TimelineLayout {
  lanes: TimelineLane[];
  laneByKey: Map<LaneKey, TimelineLane>;
  /** Every item, sorted by start; `byKind` holds the same objects per kind, each sorted by start. */
  items: TimelineItem[];
  byKind: { [K in TimelineItem['kind']]: Extract<TimelineItem, { kind: K }>[] };
  transitionLane: { top: number; height: number } | null;
  /** Height of the tracks area, the pending row included. */
  tracksHeight: number;
  sceneRail: boolean;
  primaryTrack?: TimelineTrackState;
  captionTrack?: TimelineTrackState;
}

export interface TimelineLayoutInput {
  comp: Composition;
  metrics: TimelineMetrics;
  durationSec: number;
  videoPlacements?: readonly NarrativeTimelinePlacement[];
  trackStates?: readonly TimelineTrackState[];
  transitions?: readonly TimelineTransitionItem[];
  /** The transition lane only exists for a host that can change transitions. */
  transitionsEditable: boolean;
  pendingRanges?: readonly TimelinePendingRange[];
  /** An audio asset is being dragged in: an empty project still shows a lane to drop it on. */
  audioDropLane: boolean;
}

export function timelineLayout(input: TimelineLayoutInput): TimelineLayout {
  const { comp, metrics: M, durationSec: dur, trackStates = [] } = input;
  const shots = videoTrackShots(comp);
  const enabledOf = new Map(input.videoPlacements?.map((placement) => [placement.shotId, placement.enabled] as const) ?? []);
  const sceneSpans = videoShotTimelineSpans(shots, input.videoPlacements).map((span) => ({ shot: span.clip, start: span.editedStart, end: span.editedEnd }));

  // Lanes: the story spine, graphics and detached media by stack order, the caption lane, audio.
  const visualTracks = trackStates.filter((track) => track.type !== 'audio' && track.role !== 'primaryNarrative');
  const represented = new Set(visualTracks.map((track) => track.stackOrder));
  const sceneRail = sceneSpans.length > 0 || visualTracks.some((track) => (track.clips?.length ?? 0) > 0);
  const overlay = new Set<number>();
  for (const track of trackStates) if (track.type === 'graphics' && !represented.has(track.stackOrder)) overlay.add(track.stackOrder);
  for (const block of comp.blocks) if (block.trackIndex > 0 && !isSentenceCaption(block) && !represented.has(block.trackIndex)) overlay.add(block.trackIndex);
  const captionBlocks = comp.blocks.filter(isSentenceCaption).sort((a, b) => a.startSec - b.startSec);
  const captionTrack = trackStates.find((track) => track.type === 'caption' && track.role === 'managedCaptions');
  const captionStack = captionTrack?.stackOrder ?? 1;
  const captionLane: LaneKey = captionTrack && represented.has(captionTrack.stackOrder) ? visualLaneKey(captionTrack.trackId) : CAP_LANE;
  const primaryTrack = trackStates.find((track) => track.role === 'primaryNarrative');
  const stackOf = (lane: LaneKey) => {
    if (lane === CAP_LANE) return captionStack;
    const visualId = visualTrackIdOf(lane);
    return visualId ? visualTracks.find((track) => track.trackId === visualId)?.stackOrder ?? 0 : (lane as number);
  };
  const layerLanes: LaneKey[] = [
    ...[...overlay].sort((a, b) => b - a),
    ...visualTracks.map((track) => visualLaneKey(track.trackId)),
    ...(captionBlocks.length && captionLane === CAP_LANE ? [CAP_LANE as LaneKey] : []),
  ].sort((left, right) => stackOf(right) - stackOf(left));
  const nativeAudio = trackStates.filter((track) => track.type === 'audio');
  const audioLanes = timelineAudioLanes(comp.audioTracks ?? [], nativeAudio.map((track) => ({ trackId: track.trackId, clipIds: (track.ranges ?? []).map((range) => range.clipId) })));
  const shownAudio = audioLanes.length ? audioLanes : input.audioDropLane ? [{ trackId: undefined, clips: [] as AudioClip[] }] : [];
  const audioKeys = shownAudio.map((lane) => audioLaneKey(lane.trackId ?? '__fallback__'));

  const trackIdOf = (lane: LaneKey): string | null => {
    if (lane === 0) return primaryTrack?.trackId ?? null;
    if (lane === CAP_LANE) return captionTrack?.trackId ?? null;
    return visualTrackIdOf(lane) ?? audioTrackIdOf(lane);
  };
  const unordered: LaneKey[] = [0, ...layerLanes, ...audioKeys];
  const documentOrder = timelineTrackDisplayOrder(trackStates.filter((track) => track.timelineIndex >= 0));
  const orderOf = new Map(documentOrder.map((trackId, index) => [trackId, index] as const));
  const fallback = new Map(unordered.map((lane, index) => [lane, index] as const));
  const rank = (lane: LaneKey) => orderOf.get(trackIdOf(lane) ?? '') ?? documentOrder.length + fallback.get(lane)!;
  const display = [...unordered].sort((left, right) => rank(left) - rank(right));

  const mainHeight = sceneRail ? M.sceneH : M.rowH;
  const heightOf = (lane: LaneKey) => {
    if (audioTrackIdOf(lane)) return M.audioRowH;
    if (lane === 0) return mainHeight;
    const visualId = visualTrackIdOf(lane);
    return visualId && (visualTracks.find((track) => track.trackId === visualId)?.clips?.length ?? 0) > 0 ? M.visualSceneH : M.rowH;
  };
  const kindOf = (lane: LaneKey): BlockKind | 'video' => {
    if (lane === 0) return 'video';
    if (lane === CAP_LANE) return 'caption';
    const visualId = visualTrackIdOf(lane);
    if (visualId) {
      const native = trackStates.find((track) => track.trackId === visualId);
      if ((native?.clips?.length ?? 0) > 0) return 'video';
      if (native?.role === 'managedCaptions' || native?.type === 'caption') return 'caption';
      const block = comp.blocks.find((candidate) => native?.ranges?.some((range) => range.clipId === candidate.id));
      return block ? blockKind(block) : 'custom';
    }
    const block = comp.blocks.find((candidate) => candidate.trackIndex === lane);
    return block ? blockKind(block) : 'custom';
  };
  const trackOf = (lane: LaneKey): TimelineTrackState | undefined => {
    if (lane === CAP_LANE) return captionTrack;
    if (lane === 0) return primaryTrack;
    const audioId = audioTrackIdOf(lane);
    if (audioId) return audioId === '__fallback__' ? undefined : nativeAudio.find((track) => track.trackId === audioId);
    const visualId = visualTrackIdOf(lane);
    if (visualId) return visualTracks.find((track) => track.trackId === visualId);
    return typeof lane === 'number' && lane > 0 ? trackStates.find((track) => track.type === 'graphics' && track.stackOrder === lane) : undefined;
  };

  // The transition lane sits right under the story spine, once there is a transition to show.
  const showTransitions = input.transitionsEditable && !!input.transitions?.length && dur > 0;
  const transitionHeight = Math.max(18, Math.round(M.rowH * 0.62));
  let transitionLane: TimelineLayout['transitionLane'] = null;
  const layerKeys = new Set(layerLanes);
  const lanes: TimelineLane[] = [];
  let cursor = 0;
  display.forEach((key, index) => {
    const height = heightOf(key);
    const layer = layerKeys.has(key);
    lanes.push({ key, top: cursor, height, kind: kindOf(key), track: trackOf(key), trackId: trackIdOf(key), audio: audioTrackIdOf(key) != null, layer, stackOrder: layer ? stackOf(key) : 0 });
    const last = index === display.length - 1;
    cursor += height + (last ? 0 : M.rowGap);
    if (key === 0 && showTransitions) {
      const top = cursor + (last ? M.rowGap : 0);
      transitionLane = { top, height: transitionHeight };
      cursor = top + transitionHeight + (last ? 0 : M.rowGap);
    }
  });
  const tracksH = cursor;
  const laneByKey = new Map(lanes.map((lane) => [lane.key, lane] as const));

  const items: TimelineItem[] = [];
  const main = laneByKey.get(0)!;
  sceneSpans.forEach(({ shot, start, end }, index) => items.push({
    kind: 'shot', id: shot.id, index, shot, enabled: enabledOf.get(shot.id) ?? true, lane: 0, startSec: start, endSec: end,
    top: main.top + M.scenePadT, height: mainHeight - M.scenePadT - M.scenePadB, minWidth: 8, gapRight: index < sceneSpans.length - 1 ? SHOT_GAP : 0,
  }));
  for (const track of visualTracks) {
    const lane = laneByKey.get(visualLaneKey(track.trackId));
    if (!lane) continue;
    for (const clip of track.clips ?? []) items.push({
      kind: 'visual', id: clip.clipId, clip, trackId: track.trackId, lane: lane.key, startSec: clip.startSec, endSec: clip.endSec,
      top: lane.top + M.visualScenePadT, height: M.visualSceneH - M.visualScenePadT - M.visualScenePadB, minWidth: 20, gapRight: 0,
    });
  }
  const laneOfClip = new Map<string, LaneKey>();
  for (const track of visualTracks) for (const range of track.ranges ?? []) laneOfClip.set(range.clipId, visualLaneKey(track.trackId));
  const laneOfStack = (stackOrder: number): LaneKey => {
    const native = visualTracks.find((track) => track.stackOrder === stackOrder);
    return native ? visualLaneKey(native.trackId) : stackOrder;
  };
  for (const block of comp.blocks) {
    if (isSentenceCaption(block) || block.durationSec <= 0) continue;
    const lane = laneByKey.get(laneOfClip.get(block.id) ?? laneOfStack(block.trackIndex));
    if (!lane) continue;
    items.push({ kind: 'block', id: block.id, block, blockKind: blockKind(block), lane: lane.key, startSec: block.startSec, endSec: block.startSec + block.durationSec, top: lane.top + 4, height: M.rowH - 8, minWidth: 16, gapRight: 0 });
  }
  const captions = laneByKey.get(captionLane);
  if (captions) for (const block of captionBlocks) {
    const endSec = Math.min(dur, block.startSec + block.durationSec);
    if (endSec <= block.startSec) continue;
    items.push({ kind: 'caption', id: block.id, block, lane: captions.key, startSec: block.startSec, endSec, top: captions.top + 4, height: M.rowH - 8, minWidth: 10, gapRight: 0 });
  }
  shownAudio.forEach((audio, index) => {
    const lane = laneByKey.get(audioKeys[index]!);
    if (!lane) return;
    for (const clip of audio.clips) {
      const window = audioClipWindow(clip, dur);
      items.push({ kind: 'audio', id: clip.id, clip, trackId: audio.trackId, lane: lane.key, startSec: window.start, endSec: Math.max(window.start + 0.05, window.end), top: lane.top + 2, height: lane.height - 4, minWidth: 14, gapRight: 0 });
    }
  });
  const transitionRow = transitionLane as TimelineLayout['transitionLane'];
  if (transitionRow) for (const transition of input.transitions ?? []) {
    items.push({ kind: 'transition', id: transition.id, transition, lane: 0, startSec: transition.startSec, endSec: transition.endSec, top: transitionRow.top, height: transitionRow.height, minWidth: 6, gapRight: 0 });
  }
  let pendingRow = 0;
  for (const range of input.pendingRanges ?? []) {
    const lane = laneByKey.get(range.lane.kind === 'block' ? laneOfStack(range.lane.trackIndex) : range.lane.kind === 'visual' ? visualLaneKey(range.lane.trackId) : NaN);
    if (!lane) pendingRow = M.rowGap + M.rowH;
    items.push({
      kind: 'pending', id: range.id, range, lane: lane?.key ?? 0, startSec: range.startSec, endSec: range.endSec,
      top: lane ? lane.top + 2 : tracksH + M.rowGap + 2, height: (lane ? lane.height : M.rowH) - 4, minWidth: 28, gapRight: 0,
    });
  }

  items.sort((a, b) => a.startSec - b.startSec);
  const byKind: TimelineLayout['byKind'] = { shot: [], visual: [], block: [], caption: [], audio: [], transition: [], pending: [] };
  for (const item of items) (byKind[item.kind] as TimelineItem[]).push(item);
  return { lanes, laneByKey, items, byKind, transitionLane, tracksHeight: tracksH + pendingRow, sceneRail, primaryTrack, captionTrack };
}

/** An item's name while a gesture has it: ids are only unique within a kind. */
export const liveKey = (item: Pick<TimelineItem, 'kind' | 'id'>): string => `${item.kind}:${item.id}`;

/** An item's box in content px at a zoom: time gives the left edge, the right edge keeps the item's minimum width. */
export function itemBox(item: TimelineItem, pps: number): { left: number; width: number } {
  return { left: item.startSec * pps, width: Math.max(item.minWidth, (item.endSec - item.startSec) * pps - item.gapRight) };
}

/** The items of a start-sorted list that can show between two seconds. An item drawn wider than its
 *  time (its minimum width) reaches at most `slackSec` past its end. */
export function itemsBetween<T extends TimelineItem>(sorted: readonly T[], fromSec: number, toSec: number, slackSec: number): T[] {
  let low = 0;
  let high = sorted.length;
  while (low < high) { // the first item starting after the window
    const middle = (low + high) >> 1;
    if (sorted[middle]!.startSec <= toSec) low = middle + 1; else high = middle;
  }
  // Walking back stops where nothing earlier can reach the window: a long clip (a music bed under
  // the whole talk) starts far before it and still shows, so the stop is the latest end so far.
  const latestEnd = latestEndsOf(sorted);
  const out: T[] = [];
  for (let index = low - 1; index >= 0 && latestEnd[index]! + slackSec >= fromSec; index -= 1) {
    if (sorted[index]!.endSec + slackSec >= fromSec) out.push(sorted[index]!);
  }
  return out.reverse();
}

const latestEnds = new WeakMap<readonly TimelineItem[], Float64Array>();
/** For each index of a start-sorted list, the latest end among the items up to it. */
function latestEndsOf(sorted: readonly TimelineItem[]): Float64Array {
  let ends = latestEnds.get(sorted);
  if (!ends) {
    ends = new Float64Array(sorted.length);
    let latest = -Infinity;
    for (let index = 0; index < sorted.length; index += 1) ends[index] = latest = Math.max(latest, sorted[index]!.endSec);
    latestEnds.set(sorted, ends);
  }
  return ends;
}
