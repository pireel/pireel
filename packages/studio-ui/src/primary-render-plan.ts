import type {
  EditorRenderPlan,
  VideoShotTimelinePlacement,
} from '@pireel/studio-engine/composition';

export interface NarrativeTimelinePlacement extends VideoShotTimelinePlacement {
  /** Disabled clips keep their native timeline range but do not enter the decoder/render projection. */
  enabled: boolean;
}

export interface PrimaryNarrativeRenderPlan {
  trackId: string;
  hidden: boolean;
  muted: boolean;
  /** Full native geometry for timeline UI and editing, including disabled clips. */
  placements: NarrativeTimelinePlacement[];
  /** Media projection only. Disabled clips become real timeline gaps. */
  activePlacements: VideoShotTimelinePlacement[];
  activeEntries: EditorRenderPlan['narrative'];
}

/** Project the semantic primary lane without mixing track flags into legacy VideoShot properties. */
export function primaryNarrativeRenderPlan(plan: EditorRenderPlan): PrimaryNarrativeRenderPlan {
  const track = plan.tracks.find((candidate) => candidate.id === plan.primaryNarrativeTrackId);
  const placements = plan.narrative.map((entry): NarrativeTimelinePlacement => ({
    shotId: entry.clipId,
    startSec: entry.startSec,
    endSec: entry.endSec,
    enabled: entry.clip.enabled,
    ...(entry.clip.box ? { box: entry.clip.box } : {}),
  }));
  const activeEntries = plan.narrative.filter((entry) => entry.clip.enabled);
  return {
    trackId: plan.primaryNarrativeTrackId,
    hidden: track?.hidden ?? false,
    muted: track?.muted ?? false,
    placements,
    activePlacements: activeEntries.map((entry) => ({
      shotId: entry.clipId,
      startSec: entry.startSec,
      endSec: entry.endSec,
      ...(entry.clip.box ? { box: entry.clip.box } : {}),
    })),
    activeEntries,
  };
}
