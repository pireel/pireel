/**
 * 块类型 → 名称/图标/图标色 的单一来源(组件库卡片脚标、时间轴 chip 共用)。
 * 此前 timeline / gallery 各存一份已经开始漂移——新加 BlockKind 只改这里。
 * 图标色用亮色主题可读的 -500/600 档;时间轴的 chip 底色(带透明度的品类填充)在
 * studio-timeline.tsx 内以 KIND_CHIP 扩展,不进这份基础表。
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
