'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { t } from './i18n';

export const RIGHT_DOCK_TABS = ['enhance', 'assets', 'caption-style', 'text', 'transitions', 'audio', 'avatar', 'frames'] as const;
export type RightDockTab = typeof RIGHT_DOCK_TABS[number];
export type EditingMode = 'chat' | 'captions';
export type DockTab = EditingMode | RightDockTab;
export interface ColumnWidths { left: number; right: number }
const DEFAULT_WIDTHS: ColumnWidths = { left: 320, right: 280 };
/** A side left `null` has not been dragged by the user and follows the workspace size. */
export type PreferredWidths = { [side in keyof ColumnWidths]: number | null };
const STORAGE_KEY = 'studio-column-widths';
const MIN_PANEL_WIDTH = 220;
const MAX_PANEL_WIDTH = 786;
// Right tool strip (48), three gaps (18), and a usable central preview (200).
const RESERVED_WIDTH = 266;
// The editor column (chat / transcript) takes about a quarter of the workspace.
const AUTO_LEFT_SHARE = 0.28;
const AUTO_LEFT_MAX = 480;

/** Default editor column width for a workspace row of `rowWidth` pixels. */
export function autoColumnWidths(rowWidth: number): ColumnWidths {
  const left = Math.round(Math.max(DEFAULT_WIDTHS.left, Math.min(AUTO_LEFT_MAX, rowWidth * AUTO_LEFT_SHARE)));
  return { left, right: DEFAULT_WIDTHS.right };
}

export function parseColumnWidths(raw: string | null): PreferredWidths {
  try {
    const value = raw ? JSON.parse(raw) : null;
    const read = (side: keyof ColumnWidths) => {
      const width = value?.[side];
      // Earlier builds saved the fixed defaults without any drag; treat those as "not chosen".
      if (typeof width !== 'number' || !Number.isFinite(width) || width === DEFAULT_WIDTHS[side]) return null;
      return Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, width));
    };
    return { left: read('left'), right: read('right') };
  } catch { return { left: null, right: null }; }
}

/** Fit the two sidebars to the actual workspace, reserving room for the preview. */
export function fitColumnWidths(preferred: ColumnWidths, budget: number): ColumnWidths {
  budget = Math.max(0, budget);
  const leftOn = preferred.left > 0;
  const rightOn = preferred.right > 0;
  if (!leftOn || !rightOn) return { left: leftOn ? Math.min(preferred.left, budget) : 0, right: rightOn ? Math.min(preferred.right, budget) : 0 };
  if (preferred.left + preferred.right <= budget) return preferred;
  const minimum = Math.min(MIN_PANEL_WIDTH, budget / 2);
  const left = Math.max(minimum, Math.min(budget - minimum, budget * preferred.left / (preferred.left + preferred.right)));
  return { left, right: budget - left };
}

/** Dragging uses rendered widths; it may borrow space from the opposite sidebar. */
export function resizeColumnWidths(current: ColumnWidths, side: keyof ColumnWidths, requested: number, budget: number): ColumnWidths {
  const other = side === 'left' ? 'right' : 'left';
  const minimum = Math.min(MIN_PANEL_WIDTH, Math.max(0, budget) / (current[other] > 0 ? 2 : 1));
  const otherMinimum = current[other] > 0 ? minimum : 0;
  const width = Math.max(minimum, Math.min(MAX_PANEL_WIDTH, budget - otherMinimum, requested));
  return { ...current, [side]: width, [other]: Math.min(current[other], Math.max(0, budget - width)) };
}

export function useWorkbenchColumns(leftVisible: boolean, rightVisible: boolean) {
  const [row, setRow] = useState<HTMLDivElement | null>(null);
  const [rowWidth, setRowWidth] = useState(0);
  const [preferred, setPreferred] = useState<PreferredWidths>({ left: null, right: null });
  useEffect(() => {
    try { setPreferred(parseColumnWidths(window.localStorage.getItem(STORAGE_KEY))); } catch { /* optional storage */ }
  }, []);
  useEffect(() => {
    if (!row) return;
    const observer = new ResizeObserver(([entry]) => setRowWidth(entry.contentRect.width));
    observer.observe(row);
    return () => observer.disconnect();
  }, [row]);
  const auto = autoColumnWidths(rowWidth);
  const left = preferred.left ?? auto.left;
  const right = preferred.right ?? auto.right;
  const budget = Math.max(0, rowWidth - RESERVED_WIDTH);
  const widths = fitColumnWidths({ left: leftVisible ? left : 0, right: rightVisible ? right : 0 }, budget);
  const resize = (side: keyof ColumnWidths, width: number) => {
    const next = resizeColumnWidths(widths, side, width, budget);
    const other = side === 'left' ? 'right' : 'left';
    // Dragging one side may squeeze the other; only then does the other become a chosen width too.
    const chosen: PreferredWidths = { ...preferred, [side]: next[side] || preferred[side] };
    if (next[other] && next[other] !== widths[other]) chosen[other] = next[other];
    setPreferred(chosen);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(chosen)); } catch { /* optional storage */ }
  };
  return { rowRef: setRow, widths, resize };
}

export function WorkbenchDockPanel({ id, visible, side, width, onResize, children }: {
  id: string;
  visible: boolean;
  side: 'left' | 'right';
  width: number;
  onResize: (width: number) => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  return <div ref={panelRef} data-block-selection-keep data-cap-keep data-studio-dock-panel={id}
    className={visible ? 'bg-canvas relative flex min-h-0 min-w-0 shrink-0 flex-col overflow-hidden rounded-sm' : 'hidden'}
    style={{ width, flexBasis: width }}>
    {children}
    <div title={t('workbench.dragResizePanel')} data-panel-resize={side}
      className={`hover:bg-accent/30 absolute inset-y-0 z-20 w-1.5 touch-none cursor-col-resize ${side === 'left' ? 'right-0' : 'left-0'}`}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const handle = event.currentTarget;
        const pointerId = event.pointerId;
        handle.setPointerCapture(pointerId);
        const start = event.clientX;
        const initial = panelRef.current?.getBoundingClientRect().width ?? width;
        let frame = 0; let latest = initial;
        const flush = () => { frame = 0; onResize(latest); };
        const move = (next: PointerEvent) => {
          if (!next.buttons) { finish(); return; }
          latest = initial + (next.clientX - start) * (side === 'left' ? 1 : -1);
          if (!frame) frame = requestAnimationFrame(flush);
        };
        const finish = () => {
          if (frame) { cancelAnimationFrame(frame); flush(); }
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', finish);
          window.removeEventListener('pointercancel', finish);
          handle.removeEventListener('lostpointercapture', finish);
          if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', finish);
        window.addEventListener('pointercancel', finish);
        handle.addEventListener('lostpointercapture', finish);
      }} />
  </div>;
}
