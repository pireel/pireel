import { Aperture, ArrowLeftRight, Blend, Blinds, Moon, MoveRight, RotateCw, SquareSplitHorizontal, WavesHorizontal, Zap, ZoomIn, type LucideIcon } from 'lucide-react';
import type { CutTransitionEffect } from '@pireel/studio-engine/composition';

/** One glyph per cut transition, read at a glance on the timeline's transition lane. */
const ICONS: Record<CutTransitionEffect, LucideIcon> = {
  fade: Blend,
  fadeblack: Moon,
  directional: MoveRight,
  directionalwipe: SquareSplitHorizontal,
  circleopen: Aperture,
  windowslice: Blinds,
  crosszoom: ZoomIn,
  rotatescale: RotateCw,
  glitch: Zap,
  dreamy: WavesHorizontal,
};

export function transitionIcon(effect: string | undefined): LucideIcon {
  return (effect && ICONS[effect as CutTransitionEffect]) || ArrowLeftRight;
}
