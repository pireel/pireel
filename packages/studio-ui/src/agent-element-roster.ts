/** @-mention roster: editable graphics and shots only. Derived sentence-caption blocks are one logical caption layer,
 * already represented in the chat situation snapshot, so listing every rendered cue is both noisy and unstable. */

import { type Block, type VideoShot, blockKind, isSentenceCaption } from '@pireel/studio-engine/composition';
import type { StudioElementRef } from './studio-chat';
import { blockDisplayTitle } from './block-display-title';
import { t } from './i18n';

export function buildAgentElementRoster(blocks: Block[], shots: VideoShot[]): StudioElementRef[] {
  return [
    ...blocks
      .filter((block) => !isSentenceCaption(block))
      .map((block) => ({ id: block.id, label: blockDisplayTitle(block), kind: blockKind(block), isShot: false as const })),
    ...shots.map((shot, index) => ({ id: shot.id, label: t('workbench.shotN', { n: index + 1 }), kind: 'shot', isShot: true as const })),
  ];
}

export function agentElementRosterKey(blocks: Block[], shots: VideoShot[]): string {
  return buildAgentElementRoster(blocks, shots)
    .map((element) => `${element.id}\u0001${element.kind}\u0001${element.label}`)
    .join('\u0002');
}
