'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CUSTOM_FRAME_ID,
  DEFAULT_CUSTOM_VISUAL_STYLE,
  customVisualStylePalette,
  normalizeCustomVisualStyle,
  type CustomVisualStyle,
} from '@pireel/studio-engine/visual-style';
import type { FrameCatalogItem } from './use-frame-catalog';

const STORAGE_KEY = 'studio:custom-visual-style:v1';
const CHANGE_EVENT = 'pireel:custom-visual-style-change';

function read(): CustomVisualStyle {
  if (typeof window === 'undefined') return DEFAULT_CUSTOM_VISUAL_STYLE;
  try {
    return normalizeCustomVisualStyle(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null'))
      ?? DEFAULT_CUSTOM_VISUAL_STYLE;
  } catch {
    return DEFAULT_CUSTOM_VISUAL_STYLE;
  }
}

function write(style: CustomVisualStyle): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(style));
  } catch {
    // Project persistence still carries the selected style if localStorage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: style }));
}

export function useCustomFrameStyle(): readonly [CustomVisualStyle, (style: CustomVisualStyle) => void] {
  const [style, setStyle] = useState<CustomVisualStyle>(DEFAULT_CUSTOM_VISUAL_STYLE);
  useEffect(() => {
    setStyle(read());
    const onChange = (event: Event) => {
      const next = normalizeCustomVisualStyle((event as CustomEvent<unknown>).detail);
      if (next) setStyle(next);
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
  }, []);
  const save = useCallback((next: CustomVisualStyle) => {
    setStyle(next);
    write(next);
  }, []);
  return [style, save] as const;
}

export function customFrameCatalogItem(
  style: CustomVisualStyle,
  title: string,
  summary: string,
  direction?: FrameCatalogItem | null,
): FrameCatalogItem {
  return {
    ...(direction ?? {
      id: CUSTOM_FRAME_ID,
      title,
      summary,
      icon: '✣',
      showcase: [],
    }),
    palette: customVisualStylePalette(style, direction?.palette),
    customVisualStyle: style,
  };
}
