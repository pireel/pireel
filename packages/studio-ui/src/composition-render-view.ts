import type {
  AudioClip,
  Composition,
  EditorRenderPlan,
  EditorRenderTrack,
} from '@pireel/studio-engine/composition';

interface RenderClipState {
  enabled: boolean;
  track: EditorRenderTrack;
}

function renderClipStates(plan: EditorRenderPlan): Map<string, RenderClipState> {
  const result = new Map<string, RenderClipState>();
  for (const track of plan.tracks) {
    for (const entry of track.clips) {
      result.set(entry.clipId, { enabled: entry.clip.enabled, track });
    }
  }
  return result;
}

function activeAudioClip(clip: AudioClip, states: Map<string, RenderClipState>): AudioClip | null {
  const state = states.get(clip.id);
  if (!state || state.track.type !== 'audio' || !state.enabled) return null;
  return state.track.muted && !clip.muted ? { ...clip, muted: true } : clip;
}

/**
 * Native V2 render-only view over the temporary Composition compatibility surface.
 *
 * The full Composition remains available to editing panels so hidden/disabled content can be
 * selected and restored. Only preview/export/playback receive this filtered view. Primary video
 * and supplemental visual media have dedicated native adapters because their timeline geometry
 * cannot be represented by Composition alone.
 */
export function compositionRenderView(composition: Composition, plan: EditorRenderPlan): Composition {
  const states = renderClipStates(plan);
  const blocks = composition.blocks.filter((block) => {
    const state = states.get(block.id);
    return !!state
      && (state.track.type === 'graphics' || state.track.type === 'caption')
      && state.enabled
      && !state.track.hidden;
  });
  const audioTracks = (composition.audioTracks ?? []).flatMap((clip) => {
    const active = activeAudioClip(clip, states);
    return active ? [active] : [];
  });
  const view = { ...composition, blocks };
  if (audioTracks.length) return { ...view, audioTracks };
  const { audioTracks: _audioTracks, ...withoutAudio } = view;
  return withoutAudio as Composition;
}
