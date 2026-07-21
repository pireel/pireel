'use client';

/**
 * Studio 右侧 rail 生图/生视频面板的客户端 API 层。
 *
 * 复用 /create 的统一生成基建:POST /api/create(tool_id 选工具、计费、异步 atlas)+
 * GET /api/create/:id 轮询单条状态。creation 必须挂在 space 下——studio 不建项目,
 * 用一个懒建的专属空间(localStorage 记 id,跨账号/被删时清缓存重建一次)。
 * 资产落库是裸 R2 key,展示走 imageThumb 预设,插入 composition 用 'original' 全 URL。
 */

import { imageThumb } from '@pireel/ui/image-url';
import { t } from './i18n';

const SPACE_LS_KEY = 'pireel.studio.gen-space';

export interface GenAsset {
  /** 裸 key 或完整 URL(原样来自 output_data.assets[].url) */
  key: string;
  /** 插入 composition 用的完整原始 URL */
  url: string;
  mime: string;
}

export type GenStatus = 'pending' | 'succeeded' | 'failed';

export interface GenJob {
  id: string;
  status: GenStatus;
  prompt: string;
  assets: GenAsset[];
  error?: string;
  createdAt: number;
}

export type StartResult =
  | { ok: true; ids: string[] }
  | { ok: false; kind: 'credits'; need: number; balance: number }
  | { ok: false; kind: 'error'; message: string };

function clearSpaceCache() {
  try {
    localStorage.removeItem(SPACE_LS_KEY);
  } catch {
    /* SSR/隐私模式忽略 */
  }
}

/** studio 专属生成空间:localStorage 缓存,没有就建一个。 */
export async function getStudioSpaceId(): Promise<string> {
  try {
    const v = localStorage.getItem(SPACE_LS_KEY);
    if (v) return v;
  } catch {
    /* ignore */
  }
  const r = await fetch('/api/create/spaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: t('Studio 生成') }),
  });
  const j = (await r.json().catch(() => null)) as { space?: { id?: string } } | null;
  const id = j?.space?.id;
  if (!r.ok || !id) throw new Error('space_create_failed');
  try {
    localStorage.setItem(SPACE_LS_KEY, id);
  } catch {
    /* ignore */
  }
  return id;
}

/** 发起一次生成。402 积分不足单独成 kind;space 失效(换号/被删)清缓存重试一次。 */
export async function startGeneration(
  toolId: 'image-gen' | 'video-gen',
  params: Record<string, unknown>,
): Promise<StartResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let spaceId: string;
    try {
      spaceId = await getStudioSpaceId();
    } catch {
      return { ok: false, kind: 'error', message: t('生成空间创建失败，稍后再试') };
    }
    const r = await fetch('/api/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ space_id: spaceId, tool_id: toolId, params }),
    });
    const j = (await r.json().catch(() => null)) as
      | { ok?: boolean; id?: string; ids?: string[]; error?: string; need?: number; balance?: number }
      | null;
    if (r.status === 402 && j?.error === 'insufficient_tokens') {
      return { ok: false, kind: 'credits', need: j.need ?? 0, balance: j.balance ?? 0 };
    }
    if (!r.ok || !j?.ok || !j.id) {
      // 4xx 且还没重试过 → 大概率 space 失效,清缓存换新空间再试
      if (attempt === 0 && (r.status === 400 || r.status === 404)) {
        clearSpaceCache();
        continue;
      }
      return { ok: false, kind: 'error', message: typeof j?.error === 'string' ? j.error : t('生成请求失败（{status}）', { status: r.status }) };
    }
    return { ok: true, ids: Array.isArray(j.ids) && j.ids.length > 0 ? j.ids : [j.id] };
  }
  return { ok: false, kind: 'error', message: t('生成请求失败') };
}

interface RawCreation {
  id?: string;
  status?: string;
  prompt?: string;
  params?: { user_prompt?: string };
  error?: string;
  created_at?: number | string;
  output_data?: { assets?: Array<{ url?: string; mime?: string }> };
}

function toAssets(data: RawCreation['output_data']): GenAsset[] {
  return (data?.assets ?? [])
    .filter((a): a is { url: string; mime?: string } => typeof a?.url === 'string')
    .map((a) => ({ key: a.url, url: imageThumb(a.url, 'original'), mime: a.mime ?? '' }));
}

function toJob(raw: RawCreation): GenJob {
  const status: GenStatus = raw.status === 'succeeded' ? 'succeeded' : raw.status === 'failed' ? 'failed' : 'pending';
  const at = typeof raw.created_at === 'number' ? raw.created_at : Date.parse(String(raw.created_at ?? '')) || Date.now();
  return {
    id: raw.id ?? '',
    status,
    prompt: raw.params?.user_prompt || raw.prompt || '',
    assets: toAssets(raw.output_data),
    ...(raw.error ? { error: raw.error } : {}),
    createdAt: at,
  };
}

/** 轮询单条 creation。网络抖动当 pending 处理,下一轮再看。 */
export async function pollCreation(id: string): Promise<GenJob | null> {
  const r = await fetch(`/api/create/${encodeURIComponent(id)}`);
  if (!r.ok) return null;
  const j = (await r.json().catch(() => null)) as RawCreation | null;
  if (!j) return null;
  return toJob({ ...j, id });
}

/** 拉 studio 空间的生成历史(含 pending——挂载即恢复轮询)。没建过空间 = 没历史。 */
export async function listStudioGens(type: 'image' | 'video', limit = 30): Promise<GenJob[]> {
  let spaceId: string | null = null;
  try {
    spaceId = localStorage.getItem(SPACE_LS_KEY);
  } catch {
    /* ignore */
  }
  if (!spaceId) return [];
  const r = await fetch(`/api/create/list?space_id=${encodeURIComponent(spaceId)}&type=${type}&limit=${limit}`);
  if (!r.ok) {
    if (r.status === 400 || r.status === 404) clearSpaceCache();
    return [];
  }
  const j = (await r.json().catch(() => null)) as { items?: RawCreation[] } | null;
  return (j?.items ?? []).map(toJob).filter((x) => x.id);
}
