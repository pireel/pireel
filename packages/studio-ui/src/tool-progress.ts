'use client';

/**
 * 工具实时进度(外部 store)——长工具在 chat 卡片里显示实时文案 + 进度条。
 * 工具执行在 workbench(runStudioTool),展示在 StudioChat 的 ToolCard,两者无 props 直连;
 * 用一个轻量 store 解耦:执行侧 setToolProgress / clearToolProgress,展示侧 useToolProgress(id)。
 *
 * **多槽**:按工具 id 各存一份 —— agent 可以在同一步并行调多个工具(如 分析口播稿 ‖ 分析画面),
 * 各自的卡片读各自的进度,互不clobber。
 */

import { useSyncExternalStore } from 'react';

export interface ToolProgress {
  /** 正在跑的工具 id(与 ToolCard 的 def.id 匹配才显示) */
  id: string;
  /** 友好文案,如「分析画面 42% · 约剩 12s」 */
  text: string;
  /** 0..1 进度,有则画条 */
  frac?: number;
}

let map: Record<string, ToolProgress> = {};
const subs = new Set<() => void>();
const emit = () => {
  for (const f of subs) f();
};

export function setToolProgress(p: ToolProgress | null): void {
  if (p === null) {
    // 兼容旧调用:清空全部(新代码请用 clearToolProgress(id))
    map = {};
  } else {
    map = { ...map, [p.id]: p };
  }
  emit();
}

export function clearToolProgress(id: string): void {
  if (!(id in map)) return;
  const next = { ...map };
  delete next[id];
  map = next;
  emit();
}

function subscribe(f: () => void): () => void {
  subs.add(f);
  return () => {
    subs.delete(f);
  };
}

const snapshot = (): Record<string, ToolProgress> => map;
const empty: Record<string, ToolProgress> = {};
const server = (): Record<string, ToolProgress> => empty;

/** 订阅某个工具的进度(没在跑返回 null)。 */
export function useToolProgress(id: string): ToolProgress | null {
  const m = useSyncExternalStore(subscribe, snapshot, server);
  return m[id] ?? null;
}
