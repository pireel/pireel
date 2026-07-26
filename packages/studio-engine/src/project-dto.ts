/**
 * The seam between studio project rows and the client DTO (server routes and the client sync
 * layer share this shape). comp video is always stripped (blobs can't be persisted); chat is an
 * array of conversation threads. Cloud is source of truth + local cache; version increases
 * monotonically for optimistic concurrency (client save carries baseVersion, server 409s if larger).
 */

import { applyPatch, type Operation } from 'fast-json-patch';
import { create as createDiffer } from 'jsondiffpatch';
import { format as formatJsonPatch } from 'jsondiffpatch/formatters/jsonpatch';
import { type Composition, emptyComposition } from './composition';

/** Transcript sentence (source seconds; same shape as the client AsrSegment, declared independently here to avoid a lib→features reverse dependency). */
export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  /** Spoken language of this sentence (provider-reported or script-detected). */
  lang?: string;
  /** Speaker id (diarization; absent = single speaker / not enabled). */
  speaker?: string;
  words?: { text: string; start: number; end: number }[];
  /** Bilingual whole-sentence translation (shows only when the sentence maps to a single display cue). */
  sub?: string;
  /** Per-cue translations keyed by word range "w0:w1" (UI translate flow / set_caption_translations with a range). */
  cueSubs?: Record<string, string>;
  /** Target language sub/cueSubs were translated into (unset = unknown/legacy — displayed as-is). */
  subLang?: string;
  /** Short-lived extraction-cueing scheme flag (desegmentCues merges these back into sentences on load). */
  cue?: boolean;
}

/** Server-operable editing context (fuel for the offline MCP executor): client autosave mirrors
 *  it up alongside comp. plan stored loosely (shape is normalized by parsePlan on the use side);
 *  video bytes still never persisted. */
export interface StudioProjectContext {
  asr?: TranscriptSegment[];
  clipAsr?: Record<string, TranscriptSegment[]>;
  plan?: unknown;
  /** Index into the cloud byte rendezvous (R2): main video / inserted sources sig→key (the bytes
   *  live in R2, content-addressed). Cross-device retrieval and future offline ASR / cloud render look up here. */
  media?: {
    video?: { sig: string; key: string };
    clips?: Record<string, { key: string }>;
  };
}

/** Full project payload between client and server. */
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

/** Lightweight meta for lists (without the big comp/chat fields). */
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

/** Save payload from client to server (ProjectStore.save's arg; shared by cloud sync and the provider contract). */
export interface ProjectSavePayload {
  title?: string;
  /** Absent = chat-only save (consultation session on an empty canvas): the comp section is simply not sent,
   *  the server keeps its current comp (merge) or seeds an empty one (first insert). Chat and canvas sync independently. */
  comp?: Composition;
  chat: unknown[];
  /** Editing context (asr/clipAsr/plan/media): needed by the offline executor and cross-device retrieval. */
  context?: StudioProjectContext;
  videoSig: string | null;
  videoDurationSec: number | null;
  coverThumb: string | null;
}

/** Save payload cap (comp's LLM-generated HTML + chat history can be sizable, but keep it bounded). */
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

/* ==================== incremental save wire format ==================== */
/*
 * The PUT body is a DIFF, two levels:
 *  1. Sectioning: the full payload splits into five sections (comp/chat/context/coverThumb/meta);
 *     unchanged sections aren't sent, all-unchanged = zero request; on the server, ABSENT = unchanged,
 *     keeping the current stored value.
 *  2. Intra-section JSON Patch (RFC 6902, fast-json-patch): the client keeps a copy of the
 *     "last successfully saved value"; the changed big sections (comp/chat/context) compare against
 *     it into an op list, and if that's smaller than the whole section (<60%) it sends the patch —
 *     dragging one block = one replace of a few hundred bytes, no more re-sending the whole 246KB.
 * Correctness anchor: comp/chat patches carry a target canonical hash; the server verifies after
 * applying, and on mismatch (base drifted / patch corrupt) → 422 need_full, the client clears the
 * baseline and re-sends the whole section — worst case degrades to full, never silently wrong.
 * context patches aren't verified (the server may have merged in keys from elsewhere, legitimately
 * more than the client), and apply itself preserves unknown keys. The patch precondition =
 * baseVersion optimistic concurrency: on 409 the client re-seeds the baseline (ackedFromDto) from
 * the returned server full, so the retry diff is computed against server truth, converging per section.
 */

/** Diff wire format from client to server (serverSaveProject builds it from the full payload).
 *  Each big section is one of three: full value / patch+target hash / absent (unchanged). */
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

/** Canonical serialization (object keys sorted): the hash must match on both ends, but jsonb
 *  storage reorders keys, so plain JSON.stringify yields different strings for the same data.
 *  undefined handled per JSON semantics (object keys dropped / array elements → null). */
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

/** Section hash: two 32-bit rolling hashes (FNV-1a + multiplicative) + length, ~64-bit collision
 *  rate — a collision just means one edit to a section doesn't reach the cloud (self-heals on the
 *  next change), not worth pulling in an async SHA. */
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

/** Diff baseline from the last successful save: values (JSON-clean, the base for patch diffs) + hashes (quick changed-or-not check). */
export interface AckedSections {
  values: { comp: Composition; chat: unknown[]; context: StudioProjectContext };
  hashes: SectionHashes;
}

const metaHashOf = (title: string | null | undefined, videoSig: string | null, dur: number | null) =>
  hashSection(JSON.stringify([title ?? null, videoSig, dur]));

/** Server full DTO → diff baseline (re-seed from server truth after a 409 conflict so the retry diff aligns). */
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

/* ---- diff generation: jsondiffpatch + official jsonpatch formatter (decided in a 2nd research round, 2026-07-17) ----
 * Not fast-json-patch's compare: it naively compares arrays by index, so inserting one element in
 * the middle (splitting a shot, inserting B-roll) shifts hundreds of trailing indices right and
 * emits a full replace for each shifted element — the patch degrades to full (user hit this).
 * The generation side needs "objectHash identity alignment + LCS + standard output": jsondiffpatch
 * (8k+ star, established) ships a jsonpatch formatter that converts the delta to standard RFC 6902,
 * with zero changes to the server applyPatch/hash-verify/need_full fallback (generate-json-patch is
 * functionally equivalent but 14 stars, user rejected; rfc6902 has no identity matching, "split +
 * renumber" won't align). textDiff MUST be disabled — the jsonpatch formatter can't express
 * char-level deltas, so long-string changes go through a whole-value replace. */

/** Array element identity: shots/blocks/chat threads have stable ids, aligned by id (renumber/insert
 *  don't misalign); those without an id (asr words etc.) fall back to a content hash = aligned by value. */
const elementHash = (v: unknown): string =>
  v && typeof v === 'object' && typeof (v as { id?: unknown }).id === 'string' ? `id:${(v as { id: string }).id}` : JSON.stringify(v);

// textDiff unconfigured = disabled (since v0.7 enabling it requires explicitly passing
// diff-match-patch) — the jsonpatch formatter can't express char-level deltas, so long-string
// changes should go through a whole-value replace
const differ = createDiffer({
  objectHash: elementHash,
  arrays: { detectMove: true },
});

/** RFC 6902 patch from base → target (both values must be JSON-clean). */
export function diffOps(base: unknown, target: unknown): Operation[] {
  const delta = differ.diff(base, target);
  return delta === undefined ? [] : (formatJsonPatch(delta) as Operation[]);
}

/** Threshold below which a patch is small enough to be worth sending (too-fragmented patches aren't worth it vs the whole section, and skip a server apply). */
const PATCH_WORTH_RATIO = 0.6;

/** Full payload → diff wire format. acked = the baseline from the last SUCCESSFUL save (null = send all).
 *  Returns null = all five sections unchanged, this save can be skipped entirely; otherwise carries the new baseline to advance to after a successful save. */
export function buildSaveWire(
  p: ProjectSavePayload,
  baseVersion: number | null,
  acked: AckedSections | null,
): { wire: ProjectSaveWire; acked: AckedSections } | null {
  // comp absent = chat-only save: don't emit the comp section at all; carry the baseline forward so a later
  // comp-ful save diffs correctly (no acked yet → seed the baseline as empty, matching the server's first-insert seed)
  const compCanon = p.comp ? canonicalJson({ ...p.comp, video: null }) : null;
  const chatCanon = canonicalJson(p.chat ?? []);
  const ctxCanon = canonicalJson(p.context ?? {});
  const hashes: SectionHashes = {
    comp: compCanon != null ? hashSection(compCanon) : (acked?.hashes.comp ?? hashSection(canonicalJson(emptyComposition()))),
    chat: hashSection(chatCanon),
    context: hashSection(ctxCanon),
    coverThumb: hashSection(p.coverThumb ?? ''),
    meta: metaHashOf(p.title, p.videoSig, p.videoDurationSec),
  };
  // JSON-clean current values (parsed from the canonical string: incidentally drops undefined, so diff is structurally comparable to the baseline)
  const values: AckedSections['values'] = {
    comp: compCanon != null ? (JSON.parse(compCanon) as Composition) : (acked?.values.comp ?? emptyComposition()),
    chat: JSON.parse(chatCanon) as unknown[],
    context: JSON.parse(ctxCanon) as StudioProjectContext,
  };
  const wire: ProjectSaveWire = { baseVersion };
  const w = wire as unknown as Record<string, unknown>;
  let changed = false;

  /** Big-section tri-state: unchanged → absent / has baseline and patch is smaller → send patch / else whole section. */
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
        /* diff failed → fall back to whole section */
      }
    }
    w[key] = values[key];
  };
  if (compCanon != null) emitBig('comp', compCanon, true);
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

/** Shape validation for patches (fast-json-patch also validates on apply; this just blocks obvious garbage). */
function sanitizeOps(v: unknown): Operation[] | undefined {
  if (!Array.isArray(v) || v.length > 10_000) return undefined;
  return v.every((o) => o && typeof o === 'object' && typeof (o as { op?: unknown }).op === 'string' && typeof (o as { path?: unknown }).path === 'string')
    ? (v as Operation[])
    : undefined;
}

/** Validate/sanitize the save request body (diff semantics: absent field = undefined = keep current value). Returns null = invalid. */
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
    // Video never persisted: if comp is present, strip video
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

/** Apply a patch to the current stored value; if verifyHash is given, verify the canonical hash of
 *  the result. Any exception/mismatch → null (caller returns need_full, client re-sends the whole
 *  section, worst case degrades to full). */
function applySectionPatch(base: unknown, ops: Operation[], verifyHash?: string): unknown | null {
  try {
    const doc = base && typeof base === 'object' ? base : {};
    // mutateDocument=false: don't touch the object read from the DB; banPrototypeModifications blocks __proto__ by default
    const result = applyPatch(doc as object, ops, true, false).newDocument as unknown;
    if (verifyHash && hashSection(canonicalJson(result)) !== verifyHash) return null;
    return result;
  } catch {
    return null;
  }
}

/** Merge the diff into an existing row (update path): section-level "absent = keep", intra-section
 *  patch apply + hash verify, context merged by key, null doesn't overwrite non-empty.
 *  videoDurationSec returns as string|null (numeric column spec). Returns null = patch apply doesn't
 *  hold (base drifted / patch corrupt), caller returns 422 need_full. */
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
  // comp: full > patch (with hash verify, strip video once more after apply as a safety net) > keep
  let comp = existing.comp;
  if (p.comp) comp = p.comp;
  else if (p.compPatch) {
    if (!p.compHash) return null; // patch must carry a target hash; missing = client broken
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

  // context: full = merge by key (guards partial state against erasure: missing key = don't know ≠ delete);
  // patch = applied on the server's current value, naturally preserving keys the client doesn't know,
  // no hash verify (the server may have merged in keys from elsewhere, legitimately more than the client, so verify would always false-positive).
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
    // null doesn't overwrite non-empty: the saving tab may not have hydrated yet (its "absent" ≠ "user deleted")
    videoSig: p.videoSig ?? existing.videoSig,
    videoDurationSec: p.videoDurationSec != null ? String(p.videoDurationSec) : exDur == null ? null : String(exDur),
    coverThumb: p.coverThumb ?? existing.coverThumb,
  };
}
