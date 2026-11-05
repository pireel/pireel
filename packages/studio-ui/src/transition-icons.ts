import { Aperture, ArrowLeftRight, Blend, Blinds, BookOpen, Box, ChevronsRight, Clock, Contrast, DoorOpen, Droplet, Eye, FastForward, Flame, Focus, Grid2x2, Heart, LayoutGrid, Maximize2, MonitorOff, Moon, MoveRight, PanelRightOpen, RefreshCw, RotateCw, Sparkles, SquareSplitHorizontal, SquareStack, Sun, Tornado, Tv, Vibrate, WavesHorizontal, Zap, ZoomIn, type LucideIcon } from 'lucide-react';
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
  flash: Sun,
  blur: Focus,
  slide: PanelRightOpen,
  whippan: FastForward,
  zoominout: Maximize2,
  camerashake: Vibrate,
  whipspin: RefreshCw,
  stretchslide: ChevronsRight,
  clockwipe: Clock,
  heart: Heart,
  eyeblink: Eye,
  squares: LayoutGrid,
  pixelize: Grid2x2,
  cube: Box,
  doorway: DoorOpen,
  pageflip: BookOpen,
  popin: SquareStack,
  bloom: Sparkles,
  lightleak: Flame,
  grayscale: Contrast,
  vhs: Tv,
  tvoff: MonitorOff,
  swirl: Tornado,
  ripple: Droplet,
};

export function transitionIcon(effect: string | undefined): LucideIcon {
  return (effect && ICONS[effect as CutTransitionEffect]) || ArrowLeftRight;
}
