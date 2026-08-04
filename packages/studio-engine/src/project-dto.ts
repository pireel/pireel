/**
 * The seam between Studio database rows and the native client DTO. Runtime URLs are stripped
 * from EditorDocumentV2 before persistence; chat is an array of conversation threads.
 * Cloud is source of truth + local cache; version increases
 * monotonically for optimistic concurrency (client save carries baseVersion, server 409s if larger).
 */

import { applyPatch, type Operation } from 'fast-json-patch';
import { create as createDiffer } from 'jsondiffpatch';
import { format as formatJsonPatch } from 'jsondiffpatch/formatters/jsonpatch';
import { isEditorDocumentV2, validateEditorDocumentV2, type EditorDocumentV2 } from './editor-document';
import {
  emptyProjectDocument,
  prepareEditorDocumentForPersistence,
  projectDocumentStats,
} from './project-document';
import { canonicalJson, hashSection } from './stable-json';

export { canonicalJson, hashSection } from './stable-json';

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

/** Metadata-only index of a project-local asset. The original bytes stay on the user's device;
 *  syncing this small record lets another browser show the asset and guide the user to reselect it. */
export interface LocalAssetIndexEntry {
  sig: string;
  label: string;
  /** Absent on legacy entries = video. */
  kind?: 'video' | 'image' | 'audio';
  w?: number | null;
  h?: number | null;
  /** Folder imports share one logical source. The directory handle itself is device-local;
   *  this cloud-safe path metadata lets another browser re-authorize the root once and recover
   *  every indexed file beneath it. */
  folder?: {
    id: string;
    name: string;
    path: string;
  };
  createdAt: number;
}

/** Cloud byte rendezvous for native V2 assets. */
export interface ProjectCloudMediaIndex {
  video?: { sig: string; key: string };
  clips?: Record<string, { key: string }>;
}

/** Full project payload between client and server. */
export interface StudioProjectDto {
  id: string;
  title: string;
  /** Canonical persisted/editing document. */
  document: EditorDocumentV2;
  chat: unknown[];
  videoSig: string | null;
  videoDurationSec: number | null;
  coverThumb: string | null;
  version: number;
  updatedAt: number; // epoch ms
}

/** Lightweight meta for lists (without the large document/chat fields). */
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
  /** Absent for chat-only saves; the server keeps the current document or seeds an empty V2 row. */
  document?: EditorDocumentV2;
  chat: unknown[];
  videoSig: string | null;
  videoDurationSec: number | null;
  coverThumb: string | null;
}

/** Save payload cap (document graphics + chat history can be sizable, but keep it bounded). */
export const MAX_PROJECT_BYTES = 8 * 1024 * 1024;

type Row = {
  id: string;
  title: string;
  comp: unknown;
  chat: unknown;
  videoSig: string | null;
  videoDurationSec: string | number | null;
  coverThumb: string | null;
  version: number;
  updatedAt: Date;
};

export function rowToDto(r: Row): StudioProjectDto {
  const videoDurationSec = r.videoDurationSec == null ? null : Number(r.videoDurationSec);
  if (!isEditorDocumentV2(r.comp)) throw new Error(`project document is not V2: ${r.id}`);
  const document = prepareEditorDocumentForPersistence(r.comp);
  return {
    id: r.id,
    title: r.title,
    document,
    chat: Array.isArray(r.chat) ? r.chat : [],
    videoSig: r.videoSig,
    videoDurationSec,
    coverThumb: r.coverThumb,
    version: r.version,
    updatedAt: r.updatedAt.getTime(),
  };
}

export function rowToMeta(r: Row): StudioProjectMeta {
  if (!isEditorDocumentV2(r.comp)) throw new Error(`project document is not V2: ${r.id}`);
  const document = prepareEditorDocumentForPersistence(r.comp);
  const stats = projectDocumentStats(document);
  return {
    id: r.id,
    title: r.title,
    videoDurationSec: r.videoDurationSec == null ? null : Number(r.videoDurationSec),
    blocks: stats.blocks,
    shots: stats.shots,
    coverThumb: r.coverThumb,
    version: r.version,
    updatedAt: r.updatedAt.getTime(),
  };
}

/* ==================== incremental save wire format ==================== */
/*
 * The PUT body is a DIFF, two levels:
 *  1. Sectioning: the full payload splits into four sections (document/chat/coverThumb/meta);
 *     unchanged sections aren't sent, all-unchanged = zero request; on the server, ABSENT = unchanged,
 *     keeping the current stored value.
 *  2. Intra-section JSON Patch (RFC 6902, fast-json-patch): the client keeps a copy of the
 *     "last successfully saved value"; the changed big sections (document/chat) compare against
 *     it into an op list, and if that's smaller than the whole section (<60%) it sends the patch —
 *     dragging one block = one replace of a few hundred bytes, no more re-sending the whole 246KB.
 * Correctness anchor: document/chat patches carry a target canonical hash; the server verifies after
 * applying, and on mismatch (base drifted / patch corrupt) → 422 need_full, the client clears the
 * baseline and re-sends the whole section — worst case degrades to full, never silently wrong.
 * The patch precondition = baseVersion optimistic concurrency: on 409 the client re-seeds the baseline (ackedFromDto) from
 * the returned server full, so the retry diff is computed against server truth, converging per section.
 */

/** Diff wire format from client to server (serverSaveProject builds it from the full payload).
 *  Each big section is one of three: full value / patch+target hash / absent (unchanged). */
export interface ProjectSaveWire {
  /** Save protocol version. Old tabs omit this and are told to reload instead of being normalized. */
  documentSchemaVersion: 2;
  baseVersion: number | null;
  document?: EditorDocumentV2;
  documentPatch?: Operation[];
  documentHash?: string;
  chat?: unknown[];
  chatPatch?: Operation[];
  chatHash?: string;
  coverThumb?: string | null;
  title?: string;
  videoSig?: string | null;
  videoDurationSec?: number | null;
}

export interface SectionHashes {
  document: string;
  chat: string;
  coverThumb: string;
  meta: string;
}

/** Diff baseline from the last successful save: values (JSON-clean, the base for patch diffs) + hashes (quick changed-or-not check). */
export interface AckedSections {
  values: { document: EditorDocumentV2; chat: unknown[] };
  hashes: SectionHashes;
}

const metaHashOf = (title: string | null | undefined, videoSig: string | null, dur: number | null) =>
  hashSection(JSON.stringify([title ?? null, videoSig, dur]));

/** Server full DTO → diff baseline (re-seed from server truth after a 409 conflict so the retry diff aligns). */
export function ackedFromDto(p: {
  document: EditorDocumentV2;
  chat: unknown[];
  coverThumb: string | null;
  title: string;
  videoSig: string | null;
  videoDurationSec: number | null;
}): AckedSections {
  const document = prepareEditorDocumentForPersistence(p.document);
  const documentCanon = canonicalJson(document);
  const chatCanon = canonicalJson(p.chat ?? []);
  return {
    values: {
      document: JSON.parse(documentCanon) as EditorDocumentV2,
      chat: JSON.parse(chatCanon) as unknown[],
    },
    hashes: {
      document: hashSection(documentCanon),
      chat: hashSection(chatCanon),
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
  // document absent = chat-only save. Carry the baseline forward so a later document save diffs
  // correctly (no acked yet means the server's empty V2 first-insert seed).
  const document = p.document ? prepareEditorDocumentForPersistence(p.document) : null;
  const documentCanon = document ? canonicalJson(document) : null;
  const chatCanon = canonicalJson(p.chat ?? []);
  const hashes: SectionHashes = {
    document: documentCanon != null ? hashSection(documentCanon) : (acked?.hashes.document ?? hashSection(canonicalJson(emptyProjectDocument()))),
    chat: hashSection(chatCanon),
    coverThumb: hashSection(p.coverThumb ?? ''),
    meta: metaHashOf(p.title, p.videoSig, p.videoDurationSec),
  };
  // JSON-clean current values (parsed from the canonical string: incidentally drops undefined, so diff is structurally comparable to the baseline)
  const values: AckedSections['values'] = {
    document: documentCanon != null ? (JSON.parse(documentCanon) as EditorDocumentV2) : (acked?.values.document ?? emptyProjectDocument()),
    chat: JSON.parse(chatCanon) as unknown[],
  };
  const wire: ProjectSaveWire = { documentSchemaVersion: 2, baseVersion };
  const w = wire as unknown as Record<string, unknown>;
  let changed = false;

  /** Big-section tri-state: unchanged → absent / has baseline and patch is smaller → send patch / else whole section. */
  const emitBig = (key: 'document' | 'chat', canon: string, withHash: boolean) => {
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
  if (documentCanon != null) emitBig('document', documentCanon, true);
  emitBig('chat', chatCanon, true);

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
  document?: EditorDocumentV2;
  documentPatch?: Operation[];
  documentHash?: string;
  chat?: unknown[];
  chatPatch?: Operation[];
  chatHash?: string;
  videoSig: string | null;
  videoDurationSec: number | null;
  coverThumb: string | null;
  baseVersion: number | null;
  documentSchemaVersion: 2 | null;
} | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (['comp', 'compPatch', 'compHash', 'context', 'contextPatch'].some((key) => key in b)) return null;
  const dur = b.videoDurationSec;
  const videoSig = typeof b.videoSig === 'string' ? b.videoSig.slice(0, 200) : null;
  const videoDurationSec = typeof dur === 'number' && Number.isFinite(dur) ? dur : null;
  let document: EditorDocumentV2 | undefined;
  if (b.document && typeof b.document === 'object') {
    if (!isEditorDocumentV2(b.document)) return null;
    const prepared = prepareEditorDocumentForPersistence(b.document);
    if (validateEditorDocumentV2(prepared).some((issue) => issue.severity === 'error')) return null;
    document = prepared;
  }
  return {
    ...(typeof b.title === 'string' && b.title.trim() ? { title: b.title.slice(0, 120) } : {}),
    ...(document ? { document } : {}),
    ...(Array.isArray(b.chat) ? { chat: b.chat } : {}),
    ...(sanitizeOps(b.documentPatch) ? { documentPatch: sanitizeOps(b.documentPatch) } : {}),
    ...(sanitizeOps(b.chatPatch) ? { chatPatch: sanitizeOps(b.chatPatch) } : {}),
    ...(typeof b.documentHash === 'string' ? { documentHash: b.documentHash.slice(0, 64) } : {}),
    ...(typeof b.chatHash === 'string' ? { chatHash: b.chatHash.slice(0, 64) } : {}),
    videoSig,
    videoDurationSec,
    coverThumb: typeof b.coverThumb === 'string' ? b.coverThumb.slice(0, 500_000) : null,
    baseVersion: typeof b.baseVersion === 'number' ? b.baseVersion : null,
    documentSchemaVersion: b.documentSchemaVersion === 2 ? 2 : null,
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
 *  patch apply + hash verify, null doesn't overwrite non-empty.
 *  videoDurationSec returns as string|null (numeric column spec). Returns null = patch apply doesn't
 *  hold (base drifted / patch corrupt), caller returns 422 need_full. */
export function mergeSaveIntoRow(
  existing: {
    title: string;
    document: unknown;
    chat: unknown;
    videoSig: string | null;
    videoDurationSec: string | number | null;
    coverThumb: string | null;
  },
  p: NonNullable<ReturnType<typeof sanitizeSavePayload>>,
): {
  title: string;
  document: unknown;
  chat: unknown;
  videoSig: string | null;
  videoDurationSec: string | null;
  coverThumb: string | null;
} | null {
  let document = existing.document;
  if (p.document) document = p.document;
  else if (p.documentPatch) {
    if (!p.documentHash) return null; // patch must carry a target hash; missing = client broken
    const patched = applySectionPatch(existing.document, p.documentPatch);
    if (patched === null) return null;
    // Refuse a patch against a legacy-shaped row. Online migration owns that transition.
    if (!isEditorDocumentV2(patched)) return null;
    const prepared = prepareEditorDocumentForPersistence(patched);
    if (validateEditorDocumentV2(prepared).some((issue) => issue.severity === 'error')) return null;
    if (hashSection(canonicalJson(prepared)) !== p.documentHash) return null;
    document = prepared;
  }

  let chat = existing.chat;
  if (p.chat) chat = p.chat;
  else if (p.chatPatch) {
    if (!p.chatHash) return null;
    const patched = applySectionPatch(Array.isArray(existing.chat) ? existing.chat : [], p.chatPatch, p.chatHash);
    if (patched === null) return null;
    chat = patched;
  }

  const exDur = existing.videoDurationSec;
  return {
    title: p.title ?? existing.title,
    document,
    chat,
    // null doesn't overwrite non-empty: the saving tab may not have hydrated yet (its "absent" ≠ "user deleted")
    videoSig: p.videoSig ?? existing.videoSig,
    videoDurationSec: p.videoDurationSec != null ? String(p.videoDurationSec) : exDur == null ? null : String(exDur),
    coverThumb: p.coverThumb ?? existing.coverThumb,
  };
}
