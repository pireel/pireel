'use client';

/**
 * 项目草稿持久化 —— 多项目:一个项目一个 localStorage key(studio:draft:<id>),
 * composition 防抖落盘,刷新不丢。项目列表 = 扫 key 前缀派生,不另维护索引。
 *
 * 视频本体是本地 File 存不了 —— 存 fileSig + 时长;恢复后重选同一个文件即完整归位
 * (pickVideoFile 按 sig 识别恢复场景,不走「换片=新作品」清空)。
 * 旧单草稿(studio:draft:v1)在项目列表首次加载时迁移成一个项目(含 chat 会话 key)。
 */

import { type MutableRefObject, useEffect, useRef, useState } from 'react';
import type { Composition } from '@pireel/studio-engine/composition';
import { type AckedSections, ackedFromDto, buildSaveWire, type ProjectSavePayload, type ProjectSaveWire, type StudioProjectDto, type StudioProjectMeta } from '@pireel/studio-engine/project-dto';
import { t } from './i18n';

const PREFIX = 'studio:draft:';
const LEGACY_KEY = 'studio:draft:v1'; // 单草稿时代;'v1' 视作保留 id,扫描时跳过
const LEGACY_CHAT_KEY = 'studio:chat:v1';

const keyFor = (id: string) => `${PREFIX}${id}`;
/** 项目的 chat 会话存储 key(会话属于项目,不跨项目混流)。 */
export const chatKeyFor = (id: string) => `studio:chat:v1:${id}`;

export interface StudioDraft {
  /** 项目 id(= 草稿 id,跨保存稳定)。 */
  id: string;
  /** 项目名(列表/徽标显示;autosave 原样保留)。 */
  title?: string;
  /** 首帧缩略(jpeg dataURL,~480 宽):项目列表卡片封面。工作台缩率图就绪时更新。 */
  coverThumb?: string;
  comp: Composition; // video 恒为 null(blob 不可持久化)
  videoSig: string | null;
  videoDurationSec: number | null;
  savedAt: number;
  /** 这份草稿基于的云端版本(上次拉取/保存成功时的 version)。开局判"云端 vs 本地
   *  谁新"的唯一可靠依据——savedAt 每次打开都被本地 autosave 自刷新,拿它比会让
   *  每个浏览器都觉得"我最新",各用各的还互相反写云端。旧草稿无此字段=云端胜。 */
  baseVersion?: number | null;
}

/** 裸读(不过滤空内容):列表/改名要读空项目。 */
function rawDraft(id: string): StudioDraft | null {
  try {
    const raw = window.localStorage.getItem(keyFor(id));
    if (!raw) return null;
    const d = JSON.parse(raw) as StudioDraft;
    return d?.comp ? d : null;
  } catch {
    return null;
  }
}

/** 有内容才算可恢复的草稿(空项目打开=全新工作台,不弹恢复条)。 */
export function loadDraft(id: string): StudioDraft | null {
  const d = rawDraft(id);
  if (!d || (!d.comp.blocks?.length && !d.comp.shots?.length)) return null;
  return d;
}

export function clearDraft(id: string) {
  try {
    window.localStorage.removeItem(keyFor(id));
  } catch {
    /* ignore */
  }
}

/* ============================ 项目层 ============================ */

export interface ProjectMeta {
  id: string;
  title: string;
  savedAt: number;
  durationSec: number | null;
  blocks: number;
  shots: number;
  coverThumb: string | null;
}

export const newProjectId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function listProjects(): ProjectMeta[] {
  const out: ProjectMeta[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith(PREFIX) || k === LEGACY_KEY) continue;
      const d = rawDraft(k.slice(PREFIX.length));
      if (!d) continue;
      out.push({
        id: d.id,
        title: d.title || t('未命名项目'),
        savedAt: d.savedAt,
        durationSec: d.videoDurationSec,
        blocks: d.comp.blocks?.length ?? 0,
        shots: d.comp.shots?.length ?? 0,
        coverThumb: d.coverThumb ?? null,
      });
    }
  } catch {
    /* ignore */
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

/** 新建项目:先落一个空壳草稿(否则没保存过的新项目在列表里凭空消失)。 */
export function createProject(comp: Composition, title = t('未命名项目')): string {
  const id = newProjectId();
  const draft: StudioDraft = { id, title, comp: { ...comp, video: null }, videoSig: null, videoDurationSec: null, savedAt: Date.now() };
  try {
    window.localStorage.setItem(keyFor(id), JSON.stringify(draft));
  } catch {
    /* ignore */
  }
  return id;
}

/** 首帧缩略就绪时直接补写进已存草稿:缩略图生成晚于防抖保存,之后若无新编辑
 *  就没有下一次 autosave,不补写封面会一直缺。 */
export function saveCoverThumb(id: string, thumb: string) {
  const d = rawDraft(id);
  if (!d) return;
  try {
    window.localStorage.setItem(keyFor(id), JSON.stringify({ ...d, coverThumb: thumb }));
  } catch {
    /* ignore */
  }
}

export function renameProject(id: string, title: string) {
  const d = rawDraft(id);
  if (!d) return;
  try {
    window.localStorage.setItem(keyFor(id), JSON.stringify({ ...d, title: title.trim() || d.title }));
  } catch {
    /* ignore */
  }
}

export function deleteProject(id: string) {
  clearDraft(id);
  try {
    window.localStorage.removeItem(chatKeyFor(id));
  } catch {
    /* ignore */
  }
}

/** 单草稿时代 → 项目:老 key 的草稿按它自己的 id 落新 key,chat 会话一并归它名下。 */
export function migrateLegacyDraft() {
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    const d = JSON.parse(raw) as StudioDraft;
    if (d?.comp && d.id && (d.comp.blocks?.length || d.comp.shots?.length)) {
      window.localStorage.setItem(keyFor(d.id), JSON.stringify({ ...d, title: d.title || t('未命名项目') }));
      const chat = window.localStorage.getItem(LEGACY_CHAT_KEY);
      if (chat && !window.localStorage.getItem(chatKeyFor(d.id))) {
        window.localStorage.setItem(chatKeyFor(d.id), chat);
        window.localStorage.removeItem(LEGACY_CHAT_KEY);
      }
    }
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* ignore */
  }
}

/* ============================ 服务端同步(云端为准 + 本地缓存) ============================ */

/** 会话线程读出口(chatKeyFor 的原始数组):折进项目行一起上云。存取都容错。 */
export function readChatThreads(projectId: string): unknown[] {
  try {
    const raw = window.localStorage.getItem(chatKeyFor(projectId));
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
export function writeChatThreads(projectId: string, threads: unknown[]) {
  try {
    window.localStorage.setItem(chatKeyFor(projectId), JSON.stringify(threads));
  } catch {
    /* 配额满/隐私模式 */
  }
}

/** 项目行读到的 version(乐观并发用):每项目一个,保存时回带,冲突刷新即更新。 */
const versions = new Map<string, number>();
export const projectVersion = (id: string) => versions.get(id) ?? null;
export const setProjectVersion = (id: string, v: number) => versions.set(id, v);

/** 服务端项目列表(换设备可见)。失败返回 null,调用方回落本地缓存。 */
export async function serverListProjects(): Promise<StudioProjectMeta[] | null> {
  try {
    const r = await fetch('/api/studio/projects');
    if (!r.ok) return null;
    const { projects } = (await r.json()) as { projects: StudioProjectMeta[] };
    return Array.isArray(projects) ? projects : [];
  } catch {
    return null;
  }
}

/** 拉单个项目全量(打开项目/换设备恢复)。404/失败返回 null。 */
export async function serverLoadProject(id: string): Promise<StudioProjectDto | null> {
  try {
    const r = await fetch(`/api/studio/projects/${id}`);
    if (!r.ok) return null;
    const { project } = (await r.json()) as { project: StudioProjectDto };
    if (project) {
      setProjectVersion(project.id, project.version);
      // 内存态即将被云端覆盖,旧段哈希不再代表"服务端已有":清掉,下次保存全量对齐
      sectionCache.delete(project.id);
    }
    return project ?? null;
  } catch {
    return null;
  }
}

export type { ProjectSavePayload } from '@pireel/studio-engine/project-dto';

/** 上次保存成功的差分基准(段哈希 + 段值,段值是 JSON Patch diff 的底):只在 'ok'
 *  时推进——失败的段保持脏下次重发;409 用服务端返回的全量重播种(重试 diff 对齐真相)。 */
const sectionCache = new Map<string, AckedSections>();

/** PUT 差分体:大体积走 gzip(自定义头;content-encoding 有中间层私自解压的坑),
 *  不支持 CompressionStream 的环境回落明文。 */
async function putWire(id: string, wire: ProjectSaveWire): Promise<Response> {
  const json = JSON.stringify(wire);
  if (json.length > 8192 && typeof CompressionStream !== 'undefined') {
    try {
      const body = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
      return await fetch(`/api/studio/projects/${id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-content-gzip': '1' },
        body,
      });
    } catch {
      /* 压缩失败走明文 */
    }
  }
  return fetch(`/api/studio/projects/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: json });
}

/** upsert 到服务端(**差分**:只发相对上次成功保存变了的段,全没变零请求)。
 *  带上一次读到的 baseVersion;409(别处已写更新)时记下新版回 'conflict'(调用方
 *  立即重试,段哈希未推进=同批段重发)。422 need_full(服务端没这行)清基准重发全量。
 *  网络/db 不可用回 'skip'(本地缓存兜底)。 */
export async function serverSaveProject(id: string, p: ProjectSavePayload): Promise<'ok' | 'conflict' | 'skip'> {
  try {
    const built = buildSaveWire(p, projectVersion(id), sectionCache.get(id) ?? null);
    if (!built) return 'ok'; // 五段全没变:零请求
    let r = await putWire(id, built.wire);
    let acked = built.acked;
    if (r.status === 422) {
      // need_full:服务端没这行 / 补丁应用不成立(基漂了)——清基准整段重发
      sectionCache.delete(id);
      const full = buildSaveWire(p, projectVersion(id), null);
      if (!full) return 'skip';
      r = await putWire(id, full.wire);
      acked = full.acked;
    }
    if (r.status === 409) {
      // 别处已写更新:记新 version + 用服务端全量**重播种差分基准**——立即重试的 diff
      // 就是对着服务端真相算的(别处改过的段如果本端没动,不会被反写;段级收敛)。
      // 不回写本地 UI——in-memory 的用户改动才是本会话真相。
      const { project } = (await r.json()) as { project: StudioProjectDto };
      if (project) {
        setProjectVersion(id, project.version);
        try {
          sectionCache.set(id, ackedFromDto(project));
        } catch {
          sectionCache.delete(id);
        }
      }
      return 'conflict';
    }
    if (!r.ok) return 'skip';
    const { project } = (await r.json()) as { project: StudioProjectDto };
    if (project) setProjectVersion(id, project.version);
    sectionCache.set(id, acked);
    return 'ok';
  } catch {
    return 'skip';
  }
}

export async function serverDeleteProject(id: string): Promise<void> {
  sectionCache.delete(id);
  try {
    await fetch(`/api/studio/projects/${id}`, { method: 'DELETE' });
  } catch {
    /* 本地删已生效,云端稍后重试也行 */
  }
}

/** 服务端项目 → 本地 localStorage 缓存(草稿 + 会话):换设备打开后本地也有一份,
 *  下次秒开、离线可看。version 一并记住供保存回带。
 *  返回内存草稿供调用方**直接应用**——落盘可能因配额静默失败,写完再从 localStorage
 *  读回会拿到陈年旧草稿(应用后 autosave 还会拿旧状态反写云端,别走那条路)。 */
export function cacheProjectLocally(p: StudioProjectDto): StudioDraft {
  setProjectVersion(p.id, p.version);
  sectionCache.delete(p.id); // 内存态换成了云端版:差分基准作废,下次保存全量对齐
  const draft: StudioDraft = {
    id: p.id,
    ...(p.title ? { title: p.title } : {}),
    ...(p.coverThumb ? { coverThumb: p.coverThumb } : {}),
    comp: { ...p.comp, video: null },
    videoSig: p.videoSig,
    videoDurationSec: p.videoDurationSec,
    savedAt: p.updatedAt,
    baseVersion: p.version,
  };
  try {
    window.localStorage.setItem(keyFor(p.id), JSON.stringify(draft));
  } catch {
    /* 配额满:只影响下次秒开,调用方拿返回值直接应用不受影响 */
  }
  writeChatThreads(p.id, p.chat);
  return draft;
}

/** 防抖自动保存:空画布不写(刚打开别把已有草稿冲掉);blob 视频剥掉只存 sig/时长;
 *  title 原样保留(改名在项目列表做);首帧缩略从 ref 读(就绪前保留上次的,不抖没)。
 *  返回 lastSavedAt 给工作台徽标外显。 */
export function useDraftAutosave(comp: Composition, videoSig: string | null, projectId: string, coverThumbRef?: MutableRefObject<string | null>) {
  const timer = useRef<number | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  useEffect(() => {
    const hasContent = comp.blocks.length > 0 || (comp.shots?.length ?? 0) > 0;
    if (!hasContent || !projectId) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      try {
        const prev = rawDraft(projectId);
        const cover = coverThumbRef?.current ?? prev?.coverThumb;
        const draft: StudioDraft = {
          id: projectId,
          ...(prev?.title ? { title: prev.title } : {}),
          ...(cover ? { coverThumb: cover } : {}),
          comp: { ...comp, video: null },
          videoSig,
          videoDurationSec: comp.video?.durationSec ?? null,
          savedAt: Date.now(),
          baseVersion: projectVersion(projectId) ?? prev?.baseVersion ?? null,
        };
        window.localStorage.setItem(keyFor(projectId), JSON.stringify(draft));
        setLastSavedAt(draft.savedAt);
      } catch {
        /* 配额满/隐私模式:静默(草稿是增益不是承诺) */
      }
    }, 1000);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [comp, videoSig, projectId]);
  return { lastSavedAt };
}
