'use client';

/**
 * Client API layer for the Studio right-rail image/video generation panels.
 *
 * Reuses /create's unified generation infra: POST /api/create (tool_id picks the tool, billing, async
 * atlas) + GET /api/create/:id to poll one item's status. A creation must hang off a space — each
 * Studio project resolves one stable server-side space, with localStorage only as a per-project
 * cache. Another browser resolves the same space from the project id, so history never becomes
 * user-global and remains recoverable across devices.
 * Assets are stored as bare R2 keys; display uses the imageThumb preset; inserting into a composition uses the 'original' full URL.
 */

import { imageThumb } from '@pireel/ui/image-url';
import { t } from './i18n';

const SPACE_LS_PREFIX = 'pireel.studio.gen-space:v3:';

const spaceCacheKey = (projectId: string) => `${SPACE_LS_PREFIX}${projectId}`;

export interface GenAsset {
  /** Bare key or full URL (verbatim from output_data.assets[].url) */
  key: string;
  /** Full original URL for inserting into a composition */
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

function clearSpaceCache(projectId: string) {
  try {
    localStorage.removeItem(spaceCacheKey(projectId));
  } catch {
    /* Ignore under SSR/private mode */
  }
}

/** Current project's dedicated generation space: cached locally, resolved idempotently by the server. */
export async function getStudioSpaceId(projectId: string): Promise<string> {
  try {
    const v = localStorage.getItem(spaceCacheKey(projectId));
    if (v) return v;
  } catch {
    /* ignore */
  }
  const r = await fetch(`/api/studio/projects/${encodeURIComponent(projectId)}/gen-space`, {
    method: 'POST',
  });
  const j = (await r.json().catch(() => null)) as { space?: { id?: string } } | null;
  const id = j?.space?.id;
  if (!r.ok || !id) throw new Error('space_create_failed');
  try {
    localStorage.setItem(spaceCacheKey(projectId), id);
  } catch {
    /* ignore */
  }
  return id;
}

/** Start one generation. 402 insufficient credits becomes its own kind; on invalid space (account change/deletion) clear the cache and retry once. */
export async function startGeneration(
  projectId: string,
  toolId: 'image-gen' | 'video-gen',
  params: Record<string, unknown>,
): Promise<StartResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    let spaceId: string;
    try {
      spaceId = await getStudioSpaceId(projectId);
    } catch {
      return { ok: false, kind: 'error', message: t('common.generationSpaceFailed') };
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
      // 4xx and not yet retried → most likely an invalid space; clear the cache, get a new space, and retry
      if (attempt === 0 && (r.status === 400 || r.status === 404)) {
        clearSpaceCache(projectId);
        continue;
      }
      return { ok: false, kind: 'error', message: typeof j?.error === 'string' ? j.error : t('chatGen.generationRequestFailedStatus', { status: r.status }) };
    }
    return { ok: true, ids: Array.isArray(j.ids) && j.ids.length > 0 ? j.ids : [j.id] };
  }
  return { ok: false, kind: 'error', message: t('chatGen.generationRequestFailed') };
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

/** Poll one creation. Network hiccups are treated as pending, checked again next round. */
export async function pollCreation(id: string): Promise<GenJob | null> {
  const r = await fetch(`/api/create/${encodeURIComponent(id)}`);
  if (!r.ok) return null;
  const j = (await r.json().catch(() => null)) as RawCreation | null;
  if (!j) return null;
  return toJob({ ...j, id });
}

/** Fetch this project's generation history (including pending — resume polling on mount). */
export async function listStudioGens(projectId: string, type: 'image' | 'video' | 'audio', limit = 30): Promise<GenJob[]> {
  let spaceId: string;
  try {
    spaceId = await getStudioSpaceId(projectId);
  } catch {
    return [];
  }
  const creationType = type === 'audio' ? 'bgm' : type;
  const r = await fetch(`/api/create/list?space_id=${encodeURIComponent(spaceId)}&type=${creationType}&limit=${limit}`);
  if (!r.ok) {
    if (r.status === 400 || r.status === 404) clearSpaceCache(projectId);
    return [];
  }
  const j = (await r.json().catch(() => null)) as { items?: RawCreation[] } | null;
  return (j?.items ?? []).map(toJob).filter((x) => x.id);
}
