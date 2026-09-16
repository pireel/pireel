/** @-mention roster: editable graphics and shots only. Derived sentence-caption blocks are one logical caption layer,
 * already represented in the chat situation snapshot, so listing every rendered cue is both noisy and unstable. */

import type { EditorDocumentV2 } from '@pireel/studio-engine/editor-document';
import { type Block, type VideoShot, blockKind, isSentenceCaption } from '@pireel/studio-engine/composition';
import type { StudioElementRef } from './studio-chat';
import { blockDisplayTitle } from './block-display-title';
import { t } from './i18n';

/** A media clip on a visual lane other than the story spine (B-roll footage or a still). */
export interface AgentMediaClipRef {
  id: string;
  kind: 'video' | 'image';
  label?: string;
}

/** The B-roll and image clips the user can select on the timeline, in timeline order. */
export function agentMediaClipRefs(document: EditorDocumentV2): AgentMediaClipRef[] {
  const refs: AgentMediaClipRef[] = [];
  for (const track of document.timeline.tracks) {
    if (track.type !== 'visual' || track.id === document.semantics.primaryNarrativeTrackId) continue;
    for (const clip of track.clips) {
      if (clip.kind !== 'media') continue;
      const asset = document.assets[clip.assetId];
      if (!asset || (asset.kind !== 'video' && asset.kind !== 'image')) continue;
      refs.push({ id: clip.id, kind: asset.kind, ...(asset.label ? { label: asset.label } : {}) });
    }
  }
  return refs.sort((left, right) => left.id.localeCompare(right.id));
}

export function buildAgentElementRoster(blocks: Block[], shots: VideoShot[], mediaClips: AgentMediaClipRef[] = []): StudioElementRef[] {
  return [
    ...blocks
      .filter((block) => !isSentenceCaption(block))
      .map((block) => ({ id: block.id, label: blockDisplayTitle(block), kind: blockKind(block), isShot: false as const })),
    ...shots.map((shot, index) => ({ id: shot.id, label: t('workbench.shotN', { n: index + 1 }), kind: 'shot', isShot: true as const })),
    ...mediaClips.map((clip, index) => ({ id: clip.id, label: clip.label ?? t('workbench.brollClipN', { n: index + 1 }), kind: clip.kind, isShot: false as const })),
  ];
}

export function agentElementRosterKey(blocks: Block[], shots: VideoShot[], mediaClips: AgentMediaClipRef[] = []): string {
  return buildAgentElementRoster(blocks, shots, mediaClips)
    .map((element) => `${element.id}\u0001${element.kind}\u0001${element.label}`)
    .join('\u0002');
}
