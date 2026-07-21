/**
 * studio 项目行 ↔ 客户端 DTO 的收口(服务端路由与客户端同步层共用形状认知)。
 * comp 视频恒剥空(blob 不可持久化);chat 是会话线程数组。云端为准 + 本地缓存,
 * version 单调递增做乐观并发(客户端保存带 baseVersion,服务端更大则 409)。
 */

import { applyPatch, type Operation } from 'fast-json-patch';
import { create as createDiffer } from 'jsondiffpatch';
import { format as formatJsonPatch } from 'jsondiffpatch/formatters/jsonpatch';
import type { Composition } from './composition';

/** 转写句(源秒;与客户端 AsrSegment 同形,这里独立声明避免 lib→features 反向依赖)。 */
export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  words?: { text: string; start: number; end: number }[];
  /** 双语字幕副行(整句译文,无词级时间)——铺/重铺字幕时随句带出。 */
  sub?: string;
}

/** 服务端可操作的编辑上下文(离线 MCP 执行器的粮):客户端 autosave 随 comp 镜像上来。
 *  plan 从宽存(shape 由 parsePlan 在使用侧收编);视频字节仍永不落库。 */
export interface StudioProjectContext {
  asr?: TranscriptSegment[];
  clipAsr?: Record<string, TranscriptSegment[]>;
  plan?: unknown;
  /** 云端字节汇合点(R2)的索引:主视频/插入源的 sig→key(字节本体在 R2,内容寻址)。
   *  换设备取回、将来离线 ASR/云渲染都从这查。 */
  media?: {
    video?: { sig: string; key: string };
    clips?: Record<string, { key: string }>;
  };
}

/** 客户端 ↔ 服务端的完整项目载荷。 */
export interface StudioProjectDto {
  id: string;
  title: string;
  comp: Composition;
  chat: unknown[];
  context: StudioProjectContext;
  videoSig: string | null;
  videoDurationSec: number | null;
  coverThumb: string | null;
  version: number;
  updatedAt: number; // epoch ms
}

/** 列表用的轻量元信息(不含 comp/chat 大字段)。 */
export interface StudioProjectMeta {
  id: string;
  title: string;
  videoDurationSec: number | null;
  blocks: number;
  shots: number;
  coverThumb: string | null;
  version: number;
  updatedAt: number;
}

/** 客户端 → 服务端的保存载荷(ProjectStore.save 的入参;云同步与 provider 契约共用)。 */
export interface ProjectSavePayload {
  title?: string;
  comp: Composition;
  chat: unknown[];
  /** 编辑上下文(asr/clipAsr/plan/media):离线执行器与换设备取回要用。 */
  context?: StudioProjectContext;
  videoSig: string | null;
  videoDurationSec: number | null;
  coverThumb: string | null;
}

/** 保存载荷上限(comp 的 LLM 生成 HTML + 会话历史都可能不小,但别失控)。 */
export const MAX_PROJECT_BYTES = 8 * 1024 * 1024;

type Row = {
  id: string;
  title: string;
  comp: unknown;
  chat: unknown;
  context?: unknown;
  videoSig: string | null;
  videoDurationSec: string | number | null;
  coverThumb: string | null;
  version: number;
  updatedAt: Date;
};

export function rowToDto(r: Row): StudioProjectDto {
  return {
    id: r.id,
    title: r.title,
    comp: r.comp as Composition,
    chat: Array.isArray(r.chat) ? r.chat : [],
    context: (r.context && typeof r.context === 'object' ? r.context : {}) as StudioProjectContext,
    videoSig: r.videoSig,
    videoDurationSec: r.videoDurationSec == null ? null : Number(r.videoDurationSec),
    coverThumb: r.coverThumb,
    version: r.version,
    updatedAt: r.updatedAt.getTime(),
  };
}

export function rowToMeta(r: Row): StudioProjectMeta {
  const comp = (r.comp ?? {}) as Composition;
  return {
    id: r.id,
    title: r.title,
    videoDurationSec: r.videoDurationSec == null ? null : Number(r.videoDurationSec),
    blocks: comp.blocks?.length ?? 0,
    shots: comp.shots?.length ?? 0,
    coverThumb: r.coverThumb,
    version: r.version,
    updatedAt: r.updatedAt.getTime(),
  };
}

/* ==================== 增量保存线格式 ==================== */
/*
 * PUT 体是**差分**,两级:
 *  1. 分段:全量载荷拆五段(comp/chat/context/coverThumb/meta),没变的段不发,
 *     全没变零请求;服务端**缺席 = 没变**,保留库里现值。
 *  2. 段内 JSON Patch(RFC 6902,fast-json-patch):客户端留一份"上次保存成功的值",
 *     变了的大段(comp/chat/context)与之 compare 出操作列表,比整段小(<60%)就发
 *     补丁——拖一个块 = 一条 replace 几百字节,不再整段 246KB 重传。
 * 正确性锚:comp/chat 补丁带目标 canonical 哈希,服务端应用后校验,不合(基漂了/
 * 补丁坏了)→ 422 need_full,客户端清基准整段重发——最坏退化成全量,绝不静默错。
 * context 补丁不校验(服务端可能合并着别处的 key,合法地比客户端多),apply 本身
 * 保留未知 key。补丁的应用前提=baseVersion 乐观并发:409 时客户端拿返回的服务端
 * 全量**重播种基准**(ackedFromDto),重试的 diff 就是对着服务端真相算的,段级收敛。
 */

/** 客户端 → 服务端的差分线格式(serverSaveProject 由全量 payload 构建)。
 *  每个大段三选一:全量值 / patch+目标哈希 / 缺席(没变)。 */
export interface ProjectSaveWire {
  baseVersion: number | null;
  comp?: Composition;
  compPatch?: Operation[];
  compHash?: string;
  chat?: unknown[];
  chatPatch?: Operation[];
  chatHash?: string;
  context?: StudioProjectContext;
  contextPatch?: Operation[];
  coverThumb?: string | null;
  title?: string;
  videoSig?: string | null;
  videoDurationSec?: number | null;
}

/** 规范化序列化(对象键排序):哈希必须两端一致,而 jsonb 存取会重排键序,
 *  裸 JSON.stringify 同数据不同串。undefined 值按 JSON 语义处理(对象键剔除/数组元素 null)。 */
export function canonicalJson(v: unknown): string {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map((x) => canonicalJson(x)).join(',')}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
}

/** 段哈希:双 32 位滚动(FNV-1a + 乘散列)+ 长度,64 位级碰撞率——碰撞后果只是
 *  某段一次编辑不上云(下次再变即自愈),不值得为它引入异步 SHA。 */
export function hashSection(s: string): string {
  let a = 0x811c9dc5;
  let b = 0x12345679;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = (Math.imul(b + c, 0x85ebca6b) ^ (b >>> 13)) | 0;
  }
  return `${(a >>> 0).toString(36)}.${(b >>> 0).toString(36)}.${s.length}`;
}

export interface SectionHashes {
  comp: string;
  chat: string;
  context: string;
  coverThumb: string;
  meta: string;
}

/** 上次保存成功的差分基准:值(JSON-clean,补丁 diff 的底)+ 哈希(变没变的快判)。 */
export interface AckedSections {
  values: { comp: Composition; chat: unknown[]; context: StudioProjectContext };
  hashes: SectionHashes;
}

const metaHashOf = (title: string | null | undefined, videoSig: string | null, dur: number | null) =>
  hashSection(JSON.stringify([title ?? null, videoSig, dur]));

/** 服务端全量 DTO → 差分基准(409 冲突后用服务端真相重播种,重试 diff 对齐)。 */
export function ackedFromDto(p: {
  comp: Composition;
  chat: unknown[];
  context: StudioProjectContext;
  coverThumb: string | null;
  title: string;
  videoSig: string | null;
  videoDurationSec: number | null;
}): AckedSections {
  const compCanon = canonicalJson({ ...p.comp, video: null });
  const chatCanon = canonicalJson(p.chat ?? []);
  const ctxCanon = canonicalJson(p.context ?? {});
  return {
    values: {
      comp: JSON.parse(compCanon) as Composition,
      chat: JSON.parse(chatCanon) as unknown[],
      context: JSON.parse(ctxCanon) as StudioProjectContext,
    },
    hashes: {
      comp: hashSection(compCanon),
      chat: hashSection(chatCanon),
      context: hashSection(ctxCanon),
      coverThumb: hashSection(p.coverThumb ?? ''),
      meta: metaHashOf(p.title, p.videoSig, p.videoDurationSec),
    },
  };
}

/* ---- 差分生成:jsondiffpatch + 官方 jsonpatch formatter(二轮调研定,2026-07-17) ----
 * 不用 fast-json-patch 的 compare:它按索引朴素比对数组,中间插一个元素(分割分镜、
 * 插入 B-roll)后面上百个元素索引全体右移,每个移位元素都发整条 replace——补丁退化
 * 成全量(用户实测踩到)。生成端要的是"objectHash 身份对齐 + LCS + 标准输出"的组合:
 * jsondiffpatch(8k+ star 老牌)自带 jsonpatch formatter 把 delta 转成标准 RFC 6902,
 * 服务端 applyPatch/哈希校验/need_full 兜底零改动(generate-json-patch 功能等价但
 * 14 star,用户否了;rfc6902 无身份匹配,"分割+重编号"对不齐)。textDiff 必须禁用
 * ——jsonpatch formatter 表达不了字符级 delta,长字符串改动走整值 replace。 */

/** 数组元素身份:shots/blocks/chat 线程都有稳定 id,按 id 对齐(重编号/插入不错位);
 *  无 id 的(asr words 等)退回内容哈希 = 按值对齐。 */
const elementHash = (v: unknown): string =>
  v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string' ? `id:${(v as { id: string }).id}` : JSON.stringify(v);

// textDiff 不配置 = 禁用(v0.7 起启用必须显式传 diff-match-patch)——jsonpatch
// formatter 表达不了字符级 delta,长字符串改动就该走整值 replace
const differ = createDiffer({
  objectHash: elementHash,
  arrays: { detectMove: true },
});

/** base → target 的 RFC 6902 补丁(两值必须是 JSON-clean)。 */
export function diffOps(base: unknown, target: unknown): Operation[] {
  const delta = differ.diff(base, target);
  return delta === undefined ? [] : (formatJsonPatch(delta) as Operation[]);
}

/** 补丁比整段小到值得发的阈值(补丁太碎不如整段,还省服务端 apply)。 */
const PATCH_WORTH_RATIO = 0.6;

/** 全量载荷 → 差分线格式。acked = 上次保存**成功**的基准(null = 全发)。
 *  返回 null = 五段全没变,这次保存可以整个跳过;否则带保存成功后要推进的新基准。 */
export function buildSaveWire(
  p: ProjectSavePayload,
  baseVersion: number | null,
  acked: AckedSections | null,
): { wire: ProjectSaveWire; acked: AckedSections } | null {
  const compCanon = canonicalJson({ ...p.comp, video: null });
  const chatCanon = canonicalJson(p.chat ?? []);
  const ctxCanon = canonicalJson(p.context ?? {});
  const hashes: SectionHashes = {
    comp: hashSection(compCanon),
    chat: hashSection(chatCanon),
    context: hashSection(ctxCanon),
    coverThumb: hashSection(p.coverThumb ?? ''),
    meta: metaHashOf(p.title, p.videoSig, p.videoDurationSec),
  };
  // JSON-clean 当前值(从 canonical 串解析:顺带剔 undefined,diff 与基准同构可比)
  const values: AckedSections['values'] = {
    comp: JSON.parse(compCanon) as Composition,
    chat: JSON.parse(chatCanon) as unknown[],
    context: JSON.parse(ctxCanon) as StudioProjectContext,
  };
  const wire: ProjectSaveWire = { baseVersion };
  const w = wire as unknown as Record<string, unknown>;
  let changed = false;

  /** 大段三态:没变缺席 / 有基准且补丁更小发补丁 / 否则整段。 */
  const emitBig = (key: 'comp' | 'chat' | 'context', canon: string, withHash: boolean) => {
    if (acked && acked.hashes[key] === hashes[key]) return;
    changed = true;
    if (acked) {
      try {
        const ops = diffOps(acked.values[key], values[key]);
        if (JSON.stringify(ops).length < canon.length * PATCH_WORTH_RATIO) {
          w[`${key}Patch`] = ops;
          if (withHash) w[`${key}Hash`] = hashes[key];
          return;
        }
      } catch {
        /* diff 失败走整段 */
      }
    }
    w[key] = values[key];
  };
  emitBig('comp', compCanon, true);
  emitBig('chat', chatCanon, true);
  emitBig('context', ctxCanon, false);

  if (!acked || acked.hashes.coverThumb !== hashes.coverThumb) {
    wire.coverThumb = p.coverThumb;
    changed = true;
  }
  if (!acked || acked.hashes.meta !== hashes.meta) {
    if (p.title !== undefined) wire.title = p.title;
    wire.videoSig = p.videoSig;
    wire.videoDurationSec = p.videoDurationSec;
    changed = true;
  }
  return changed ? { wire, acked: { values, hashes } } : null;
}

/** 补丁的形状校验(应用时 fast-json-patch 还会 validate,这里只挡明显垃圾)。 */
function sanitizeOps(v: unknown): Operation[] | undefined {
  if (!Array.isArray(v) || v.length > 10_000) return undefined;
  return v.every((o) => o && typeof o === 'object' && typeof (o as { op?: unknown }).op === 'string' && typeof (o as { path?: unknown }).path === 'string')
    ? (v as Operation[])
    : undefined;
}

/** 保存请求体的校验/净化(差分语义:缺席字段 = undefined = 保留现值)。返回 null = 非法。 */
export function sanitizeSavePayload(body: unknown): {
  title?: string;
  comp?: Composition;
  compPatch?: Operation[];
  compHash?: string;
  chat?: unknown[];
  chatPatch?: Operation[];
  chatHash?: string;
  contextPatch?: Operation[];
  videoSig: string | null;
  videoDurationSec: number | null;
  coverThumb: string | null;
  context: StudioProjectContext | undefined;
  baseVersion: number | null;
} | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const dur = b.videoDurationSec;
  return {
    ...(typeof b.title === 'string' && b.title.trim() ? { title: b.title.slice(0, 120) } : {}),
    // 视频永不落库:带了 comp 就剥空 video
    ...(b.comp && typeof b.comp === 'object' ? { comp: { ...(b.comp as Composition), video: null } } : {}),
    ...(Array.isArray(b.chat) ? { chat: b.chat } : {}),
    ...(sanitizeOps(b.compPatch) ? { compPatch: sanitizeOps(b.compPatch) } : {}),
    ...(sanitizeOps(b.chatPatch) ? { chatPatch: sanitizeOps(b.chatPatch) } : {}),
    ...(sanitizeOps(b.contextPatch) ? { contextPatch: sanitizeOps(b.contextPatch) } : {}),
    ...(typeof b.compHash === 'string' ? { compHash: b.compHash.slice(0, 64) } : {}),
    ...(typeof b.chatHash === 'string' ? { chatHash: b.chatHash.slice(0, 64) } : {}),
    videoSig: typeof b.videoSig === 'string' ? b.videoSig.slice(0, 200) : null,
    videoDurationSec: typeof dur === 'number' && Number.isFinite(dur) ? dur : null,
    coverThumb: typeof b.coverThumb === 'string' ? b.coverThumb.slice(0, 500_000) : null,
    context: b.context && typeof b.context === 'object' && !Array.isArray(b.context) ? (b.context as StudioProjectContext) : undefined,
    baseVersion: typeof b.baseVersion === 'number' ? b.baseVersion : null,
  };
}

/** 对库里现值应用一段补丁;verifyHash 给了就校验应用结果的 canonical 哈希。
 *  任何异常/不合 → null(调用方回 need_full,客户端整段重发,最坏退化成全量)。 */
function applySectionPatch(base: unknown, ops: Operation[], verifyHash?: string): unknown | null {
  try {
    const doc = base && typeof base === 'object' ? base : {};
    // mutateDocument=false:不动库里读出的对象;banPrototypeModifications 默认拦 __proto__
    const result = applyPatch(doc as object, ops, true, false).newDocument as unknown;
    if (verifyHash && hashSection(canonicalJson(result)) !== verifyHash) return null;
    return result;
  } catch {
    return null;
  }
}

/** 差分合并进已有行(update 路径):段级"缺席保留"、段内补丁应用+哈希校验、
 *  context 按 key 合并、null 不覆盖非空。videoDurationSec 回 string|null(numeric 列口径)。
 *  返回 null = 补丁应用不成立(基漂了/补丁坏了),调用方回 422 need_full。 */
export function mergeSaveIntoRow(
  existing: {
    title: string;
    comp: unknown;
    chat: unknown;
    context?: unknown;
    videoSig: string | null;
    videoDurationSec: string | number | null;
    coverThumb: string | null;
  },
  p: NonNullable<ReturnType<typeof sanitizeSavePayload>>,
): {
  title: string;
  comp: unknown;
  chat: unknown;
  context: Record<string, unknown>;
  videoSig: string | null;
  videoDurationSec: string | null;
  coverThumb: string | null;
} | null {
  // comp:全量 > 补丁(带哈希校验,应用后再剥一次 video 兜底)> 保留
  let comp = existing.comp;
  if (p.comp) comp = p.comp;
  else if (p.compPatch) {
    if (!p.compHash) return null; // 补丁必须带目标哈希,没有=客户端坏了
    const patched = applySectionPatch(existing.comp, p.compPatch, p.compHash);
    if (patched === null) return null;
    comp = { ...(patched as Composition), video: null };
  }

  let chat = existing.chat;
  if (p.chat) chat = p.chat;
  else if (p.chatPatch) {
    if (!p.chatHash) return null;
    const patched = applySectionPatch(Array.isArray(existing.chat) ? existing.chat : [], p.chatPatch, p.chatHash);
    if (patched === null) return null;
    chat = patched;
  }

  // context:全量 = 按 key 合并(部分状态防抹除:缺 key=不知道≠删除);
  // 补丁 = 应用在服务端现值上,天然保留客户端不知道的 key,不做哈希校验
  // (服务端可能合并着别处的 key,合法地比客户端多,校验必假阳)。
  const exCtx = (existing.context && typeof existing.context === 'object' ? existing.context : {}) as Record<string, unknown>;
  let context = exCtx;
  if (p.context) context = { ...exCtx, ...(p.context as Record<string, unknown>) };
  else if (p.contextPatch) {
    const patched = applySectionPatch(exCtx, p.contextPatch);
    if (patched === null || typeof patched !== 'object' || Array.isArray(patched)) return null;
    context = patched as Record<string, unknown>;
  }

  const exDur = existing.videoDurationSec;
  return {
    title: p.title ?? existing.title,
    comp,
    chat,
    context,
    // null 不覆盖非空:发起保存的标签页可能还没水合(它"没有"≠"用户删了")
    videoSig: p.videoSig ?? existing.videoSig,
    videoDurationSec: p.videoDurationSec != null ? String(p.videoDurationSec) : exDur == null ? null : String(exDur),
    coverThumb: p.coverThumb ?? existing.coverThumb,
  };
}
