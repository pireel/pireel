/**
 * Single source for block kind → name/icon/icon color (shared by element-library card footers and timeline chips).
 * Timeline and gallery each kept their own copy before and started to drift — add a new BlockKind here only.
 * Icon colors use the -500/600 steps that read well on the light theme; the timeline chip background
 * (a per-kind fill with opacity) is extended as KIND_CHIP inside studio-timeline.tsx, not in this base table.
 */

import { ArrowLeftRight, Hash, Heading, Image as ImageIcon, List, Sparkles, Type, type LucideIcon } from 'lucide-react';
import type { BlockKind } from '@pireel/studio-engine/composition';

export const KIND_META: Record<BlockKind, { label: string; icon: LucideIcon; dot: string }> = {
  caption: { label: 'panels.captions', icon: Type, dot: 'text-rose-500' },
  title: { label: 'common.title', icon: Heading, dot: 'text-amber-600' },
  stat: { label: 'common.number', icon: Hash, dot: 'text-emerald-600' },
  list: { label: 'panels.list', icon: List, dot: 'text-sky-600' },
  transition: { label: 'tools.add_transition.label', icon: ArrowLeftRight, dot: 'text-violet-500' },
  media: { label: 'common.media', icon: ImageIcon, dot: 'text-teal-600' },
  custom: { label: 'panels.element', icon: Sparkles, dot: 'text-ink-3' },
};
