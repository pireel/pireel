/**
 * Legacy Composition sibling-lane ripple helpers.
 *
 * EditorDocument V2 commands are the final mutation authority. These functions keep the V1
 * compatibility window honest by applying the same interval geometry to audio clips instead
 * of shifting only Block[] and silently desynchronising sound.
 */

import { audioClipDefaults, type AudioClip } from './audio-tracks';
import type { Block } from './composition-core';
import { removeEditedInterval } from './trim';

export interface TimelineSiblingLayers {
  blocks: Block[];
  audioTracks?: AudioClip[];
}

interface AudioGeometry {
  start: number;
  end: number;
  inSec: number;
  outSec?: number;
  speed: number;
}

function geometry(clip: AudioClip): AudioGeometry {
  const defaults = audioClipDefaults(clip);
  const outSec = Number.isFinite(defaults.outSec) ? defaults.outSec : undefined;
  return {
    start: defaults.startSec,
    end: outSec == null ? Infinity : defaults.startSec + (outSec - defaults.inSec) / defaults.speed,
    inSec: defaults.inSec,
    ...(outSec == null ? {} : { outSec }),
    speed: defaults.speed,
  };
}

function sourceAt(g: AudioGeometry, timelineSec: number): number {
  return g.inSec + Math.max(0, timelineSec - g.start) * g.speed;
}

function derivedAudioClipId(baseId: string, boundarySec: number, usedIds: Set<string>): string {
  const stem = `${baseId}~ripple-${Math.round(boundarySec * 1000)}`;
  let id = stem;
  let suffix = 2;
  while (usedIds.has(id)) id = `${stem}-${suffix++}`;
  usedIds.add(id);
  return id;
}

function leftPiece(clip: AudioClip, g: AudioGeometry, endSec: number): AudioClip {
  return { ...clip, inSec: g.inSec, outSec: sourceAt(g, endSec), fadeOutSec: 0 };
}

function rightPiece(
  clip: AudioClip,
  g: AudioGeometry,
  id: string,
  sourceStartTimelineSec: number,
  newStartSec: number,
): AudioClip {
  return {
    ...clip,
    id,
    startSec: Math.max(0, newStartSec),
    inSec: sourceAt(g, sourceStartTimelineSec),
    ...(g.outSec == null ? { outSec: undefined } : { outSec: g.outSec }),
    fadeInSec: 0,
  };
}

/** Opens a blank interval on an audio lane, splitting a straddling clip so sound does not fill the gap. */
export function rippleInsertAudioClips(clips: AudioClip[], atSec: number, durationSec: number): AudioClip[] {
  if (!Number.isFinite(atSec) || !Number.isFinite(durationSec) || atSec < 0 || durationSec <= 0) return clips;
  const usedIds = new Set(clips.map((clip) => clip.id));
  return clips.flatMap((clip) => {
    const g = geometry(clip);
    if (g.end <= atSec) return [clip];
    if (g.start >= atSec) return [{ ...clip, startSec: g.start + durationSec }];
    const rightId = derivedAudioClipId(clip.id, atSec, usedIds);
    return [
      leftPiece(clip, g, atSec),
      rightPiece(clip, g, rightId, atSec, atSec + durationSec),
    ];
  });
}

/** Clears [startSec,endSec) from an audio lane and closes the gap, retaining exact source trims. */
export function rippleRemoveAudioClips(clips: AudioClip[], startSec: number, endSec: number): AudioClip[] {
  if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || startSec < 0 || endSec <= startSec) return clips;
  const gapSec = endSec - startSec;
  const usedIds = new Set(clips.map((clip) => clip.id));
  return clips.flatMap((clip) => {
    const g = geometry(clip);
    if (g.end <= startSec) return [clip];
    if (g.start >= endSec) return [{ ...clip, startSec: Math.max(0, g.start - gapSec) }];
    if (g.start >= startSec) {
      if (g.end <= endSec) return [];
      return [rightPiece(clip, g, clip.id, endSec, startSec)];
    }
    if (g.end <= endSec) return [leftPiece(clip, g, startSec)];
    const rightId = derivedAudioClipId(clip.id, endSec, usedIds);
    return [
      leftPiece(clip, g, startSec),
      rightPiece(clip, g, rightId, endSec, startSec),
    ];
  });
}

/** V1 bridge used by UI/server call sites until EditorDocument V2 becomes the live store. */
export function rippleRemoveSiblingLayers(
  layers: TimelineSiblingLayers,
  startSec: number,
  endSec: number,
): TimelineSiblingLayers {
  return {
    blocks: removeEditedInterval(layers.blocks, startSec, endSec),
    ...(layers.audioTracks ? { audioTracks: rippleRemoveAudioClips(layers.audioTracks, startSec, endSec) } : {}),
  };
}

/** V1 insertion bridge. Blocks keep their existing lane policy; audio uses lossless split geometry. */
export function rippleInsertSiblingLayers(
  layers: TimelineSiblingLayers,
  atSec: number,
  durationSec: number,
): TimelineSiblingLayers {
  return {
    blocks: layers.blocks.map((block) =>
      block.startSec >= atSec - 1e-3 ? { ...block, startSec: block.startSec + durationSec } : block,
    ),
    ...(layers.audioTracks ? { audioTracks: rippleInsertAudioClips(layers.audioTracks, atSec, durationSec) } : {}),
  };
}
