/**
 * Single source for block kind → name/icon/icon color (shared by element-library card footers and timeline chips).
 * Timeline and gallery each kept their own copy before and started to drift — add a new BlockKind here only.
 * Icon colors use the -500/600 steps that read well on the light theme; the timeline chip background
 * (a per-kind fill with opacity) is extended as KIND_CHIP inside studio-timeline.tsx, not in this base table.
 */

import { ArrowLeftRight, Hash, Heading, Image as ImageIcon, List, Sparkles, Type, type LucideIcon } from 'lucide-react';
import type { BlockKind } from '@pireel/studio-engine/composition';

export const KIND_META: Record<BlockKind, { label: string; icon: LucideIcon; dot: string }> = {
  caption: { label: '字幕', icon: Type, dot: 'text-rose-500' },
  title: { label: '标题', icon: Heading, dot: 'text-amber-600' },
  stat: { label: '数字', icon: Hash, dot: 'text-emerald-600' },
  list: { label: '列表', icon: List, dot: 'text-sky-600' },
  transition: { label: '转场', icon: ArrowLeftRight, dot: 'text-violet-500' },
  media: { label: '素材位', icon: ImageIcon, dot: 'text-teal-600' },
  custom: { label: '组件', icon: Sparkles, dot: 'text-ink-3' },
};
