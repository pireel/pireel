import { editorTimelineTotalFrames } from './validation';
import type {
  EditorDocumentV2,
  EditorMediaAsset,
  EditorTrackRole,
  EditorTrackType,
  NarrativeTimelineClip,
  TimelineClip,
} from './types';

export interface EditorRenderClip<Clip extends TimelineClip = TimelineClip> {
  clip: Clip;
  clipId: string;
  trackId: string;
  trackType: EditorTrackType;
  trackRole?: EditorTrackRole;
  stackOrder: number;
  startFrame: number;
  endFrame: number;
  startSec: number;
  endSec: number;
  durationSec: number;
  asset?: EditorMediaAsset;
  resolvedSource?: string;
}

export interface EditorRenderTrack {
  id: string;
  type: EditorTrackType;
  role?: EditorTrackRole;
  muted: boolean;
  hidden: boolean;
  stackOrder: number;
  clips: EditorRenderClip[];
}

export interface EditorRenderPlan {
  fps: number;
  durationFrames: number;
  durationSec: number;
  primaryNarrativeTrackId: string;
  /** Bottom-to-top render order; empty tracks remain present for stable lane identity. */
  tracks: EditorRenderTrack[];
  /** Native primary-lane positions. Gaps are represented by differences between endSec/startSec. */
  narrative: EditorRenderClip<NarrativeTimelineClip>[];
}

export interface EditorRenderPlanOptions {
  resolveAssetUrl?: (asset: EditorMediaAsset) => string | null | undefined;
}

/** Immutable render/read projection. It converts frame geometry to seconds but never compacts lanes. */
export function editorDocumentRenderPlan(
  document: EditorDocumentV2,
  options: EditorRenderPlanOptions = {},
): EditorRenderPlan {
  const fps = document.canvas.fps;
  const tracks = document.timeline.tracks.map((track, documentIndex): EditorRenderTrack & { documentIndex: number } => ({
    id: track.id,
    type: track.type,
    ...(track.role ? { role: track.role } : {}),
    muted: track.muted,
    hidden: track.hidden,
    stackOrder: track.stackOrder,
    documentIndex,
    clips: track.clips.map((clip): EditorRenderClip => {
      const assetId = 'assetId' in clip ? clip.assetId : undefined;
      const asset = assetId ? document.assets[assetId] : undefined;
      const resolvedSource = asset ? options.resolveAssetUrl?.(asset) ?? undefined : undefined;
      return {
        clip,
        clipId: clip.id,
        trackId: track.id,
        trackType: track.type,
        ...(track.role ? { trackRole: track.role } : {}),
        stackOrder: track.stackOrder,
        startFrame: clip.startFrame,
        endFrame: clip.startFrame + clip.durationFrames,
        startSec: clip.startFrame / fps,
        endSec: (clip.startFrame + clip.durationFrames) / fps,
        durationSec: clip.durationFrames / fps,
        ...(asset ? { asset } : {}),
        ...(resolvedSource ? { resolvedSource } : {}),
      };
    }).sort((left, right) => left.startFrame - right.startFrame),
  })).sort((left, right) => left.stackOrder - right.stackOrder || left.documentIndex - right.documentIndex)
    .map(({ documentIndex: _documentIndex, ...track }) => track);

  const primary = tracks.find((track) => track.id === document.semantics.primaryNarrativeTrackId);
  const narrative = (primary?.clips ?? []).filter(
    (entry): entry is EditorRenderClip<NarrativeTimelineClip> => entry.clip.kind === 'narrative',
  );
  const durationFrames = editorTimelineTotalFrames(document);
  return {
    fps,
    durationFrames,
    durationSec: durationFrames / fps,
    primaryNarrativeTrackId: document.semantics.primaryNarrativeTrackId,
    tracks,
    narrative,
  };
}
