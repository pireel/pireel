'use client';

import { useEffect, useState } from 'react';

/** Frame 目录条目(GET /api/studio/frames 回的 manifest,无 body)。 */
export interface FrameCatalogItem {
  id: string;
  title: string;
  summary: string;
  icon: string;
  /** 封面 R2 裸 key;null → 回落 emoji。 */
  iconKey?: string | null;
  /** 主题产出类型预览词(frame 面板详情页的预览卡)。 */
  showcase: string[];
  /** 主题设计 token(键同 theme vars);预览卡按它渲出该主题的真实色调。null → 用当前项目主题。 */
  palette?: Record<string, string> | null;
  /** 人像贴纸描边推荐(见 Frame.personFx);挂载时落 comp.personFx。null → 主题不管人像。 */
  personFx?: Record<string, string> | null;
}

// 进程内缓存——目录基本不变,整个 app 生命周期拉一次够了。
let cache: FrameCatalogItem[] | null = null;

// localStorage 镜像:刷新/新开页首帧就有目录(boot 层主题卡墙不空窗),后台 fetch 到再覆盖。
const LS_KEY = 'studio:frame-catalog:v1';
function readStoredCatalog(): FrameCatalogItem[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.length ? (parsed as FrameCatalogItem[]) : null;
  } catch {
    return null;
  }
}
function storeCatalog(frames: FrameCatalogItem[]): void {
  if (!frames.length) return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(frames));
  } catch {
    /* 存不下就算了,下次还走 fetch */
  }
}

// 目录来源可注入(与 setStudioProviders 同一手法):托管壳默认走 API(客户端拿不到
// server-only 注册表);OSS 壳直接喂 @pireel/studio-frames/vite 的客户端注册表,零后端。
let source: () => Promise<FrameCatalogItem[]> = () =>
  fetch('/api/studio/frames')
    .then((r) => (r.ok ? r.json() : { frames: [] }))
    .then((d: { frames?: FrameCatalogItem[] }) => d.frames ?? []);

export function setFrameCatalogSource(fn: () => Promise<FrameCatalogItem[]>): void {
  source = fn;
  cache = null;
}

/** frame 面板 + 对话 `/` 菜单 + boot 卡墙共用的主题目录。
 *  首帧:内存缓存 → localStorage 镜像;后台仍拉一次真源刷新(镜像可能过期)。 */
export function useFrameCatalog(): FrameCatalogItem[] {
  const [items, setItems] = useState<FrameCatalogItem[]>(() => cache ?? readStoredCatalog() ?? []);
  useEffect(() => {
    if (cache) return;
    let alive = true;
    source()
      .then((frames) => {
        if (!frames.length) return; // 拉挂了别把镜像顶成空
        cache = frames;
        storeCatalog(frames);
        if (alive) setItems(frames);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return items;
}
