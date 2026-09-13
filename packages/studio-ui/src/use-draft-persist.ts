'use client';

/**
 * Project draft persistence — multi-project: one localStorage key per project
 * (studio:draft:<id>), composition debounce-saved so a refresh doesn't lose it. The project
 * list is derived by scanning the key prefix, no separate index maintained.
 *
 * The video itself is a local File and can't be stored — we store fileSig + duration; reselecting
 * the same file after restore snaps it fully back into place (pickVideoFile recognizes the restore
 * case by sig and skips the "new file = new project" clear).
 * Retired V1 local caches are discarded. The online migration owns V1 -> V2 conversion, so the
 * browser never reconstructs compatibility state that could race a migrated cloud row.
 */

import { type MutableRefObject, useEffect, useRef, useState } from 'react';
import {
  type Composition,
  type EditorDocumentV2,
  hasTimelineContent,
  parseEditorDocumentV2,
  compositionToEditorDocument,
  firstNarrativeAsset,
  projectDocumentToComposition,
} from '@pireel/studio-engine/composition';
import {
  type AckedSections,
  ackedFromDto,
  buildSaveWire,
  type ProjectSavePayload,
  type ProjectSaveWire,
  type StudioProjectContext,
  type StudioProjectDto,
  type StudioProjectMeta,
} from '@pireel/studio-engine/project-dto';
import { t } from './i18n';
import { reconcileProjectSave } from '@pireel/studio-engine/project-reconcile';
import type { ProjectSaveResult } from '@pireel/studio-engine/project-dto';

const PREFIX = 'studio:draft:';
const LEGACY_KEY = 'studio:draft:v1'; // single-draft era; 'v1' is a reserved id, skipped during scans
const LEGACY_CHAT_KEY = 'studio:chat:v1';
const LEGACY_CHAT_PREFIX = 'studio:chat:v1:';

const keyFor = (id: string) => `${PREFIX}${id}`;

export interface StudioDraft {
  /** Project id (= draft id, stable across saves). */
  id: string;
  /** Project name (shown in list/badge; autosave preserves it as-is). */
  title?: string;
  /** First-frame thumbnail (jpeg dataURL, ~480 wide): project list card cover. Updated when the workbench thumbnail is ready. */
  coverThumb?: string;
  /** Canonical persisted value. */
  document: EditorDocumentV2;
  /** Temporary in-memory read projection; omitted from localStorage writes. */
  comp: Composition;
  videoSig: string | null;
  videoDurationSec: number | null;
  savedAt: number;
  /** The cloud version this draft is based on (the version at last successful fetch/save). The only
   *  reliable basis for "cloud vs local, which is newer" at startup — savedAt self-refreshes on every
   *  open via local autosave, so comparing it would make every browser think it's newest, each using
   *  its own copy and overwriting the cloud. Old drafts lack this field = cloud wins. */
  baseVersion?: number | null;
  /** This draft contains edits not yet acknowledged by cloud storage. */
  pending?: boolean;
  /** Project-level multi-output directory. */
  context?: StudioProjectContext;
}

type StoredStudioDraft = Omit<StudioDraft, 'comp'>;

function writeDraft(draft: StudioDraft): void {
  const { comp: _projection, ...stored } = draft;
  window.localStorage.setItem(keyFor(draft.id), JSON.stringify(stored));
}

/** Raw read (no empty-content filter): list/rename need to read empty projects. */
function rawDraft(id: string): StudioDraft | null {
  try {
    const raw = window.localStorage.getItem(keyFor(id));
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredStudioDraft;
    if (!stored) return null;
    const document = parseEditorDocumentV2(stored.document);
    if (!document) return null;
    return {
      ...stored,
      id: stored.id || id,
      document,
      comp: projectDocumentToComposition(document),
    };
  } catch {
    return null;
  }
}

/** Only a draft with timeline content counts as recoverable (including audio-only projects). */
export function loadDraft(id: string): StudioDraft | null {
  const d = rawDraft(id);
  if (!d || (!d.pending && !hasTimelineContent(d.comp) && !d.context?.outputs?.inactive.length)) return null;
  return d;
}

export function clearDraft(id: string) {
  try {
    window.localStorage.removeItem(keyFor(id));
  } catch {
    /* ignore */
  }
}

/* ============================ Project layer ============================ */

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
        title: d.title || t('common.untitledProject'),
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

/** New project: write an empty-shell draft first (otherwise an unsaved new project vanishes from the list). */
export function createProject(comp: Composition, title = t('common.untitledProject')): string {
  const id = newProjectId();
  const document = compositionToEditorDocument({ projectId: id, composition: comp }).document;
  const draft: StudioDraft = { id, title, document, comp: projectDocumentToComposition(document), videoSig: null, videoDurationSec: null, savedAt: Date.now() };
  try {
    writeDraft(draft);
  } catch {
    /* ignore */
  }
  return id;
}

/** Patch or clear the cover in an existing draft. Thumbnail generation lags the debounced save,
 *  while clearing must happen as soon as the final timeline video disappears. */
export function saveCoverThumb(id: string, thumb: string | null) {
  const d = rawDraft(id);
  if (!d) return;
  try {
    if (thumb) writeDraft({ ...d, coverThumb: thumb });
    else {
      const { coverThumb: _coverThumb, ...withoutCover } = d;
      writeDraft(withoutCover);
    }
  } catch {
    /* ignore */
  }
}

export function renameProject(id: string, title: string) {
  const d = rawDraft(id);
  if (!d) return;
  try {
    writeDraft({ ...d, title: title.trim() || d.title });
  } catch {
    /* ignore */
  }
}

export function deleteProject(id: string) {
  clearDraft(id);
}

/** Retired single-draft cache is discarded; the online V2 row is the recovery source. */
export function migrateLegacyDraft() {
  try {
    window.localStorage.removeItem(LEGACY_KEY);
    window.localStorage.removeItem(LEGACY_CHAT_KEY);
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(LEGACY_CHAT_PREFIX)) window.localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

/* ============================ Server sync (cloud wins + local cache) ============================ */

/** The version read from a project row (for optimistic concurrency): one per project, sent back on save, refreshed on conflict. */
const versions = new Map<string, number>();
export const projectVersion = (id: string) => versions.get(id) ?? null;
export const setProjectVersion = (id: string, v: number) => versions.set(id, v);

/** A loaded cloud row is already acknowledged server state. Seed both the optimistic version and
 * the differential-save baseline from that same snapshot, so merely hydrating a second tab cannot
 * emit a full no-op PUT, advance the version, and race the first tab's pending real edit. */
function rememberServerProject(p: StudioProjectDto): void {
  setProjectVersion(p.id, p.version);
  remoteSnapshots.set(p.id, p);
  localBaselines.set(p.id, p);
  try {
    sectionCache.set(p.id, ackedFromDto(p));
  } catch {
    sectionCache.delete(p.id);
  }
}

/** Server project list (visible across devices). Returns null on failure; caller falls back to local cache. */
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

/** List-page rename: title-only differential PUT (absent sections keep their server values).
 *  Deliberately NOT serverSaveProject — that's the workbench session's stateful diff stack;
 *  called without a hydrated session it would resend empty sections over the cloud state.
 *  409 (someone saved meanwhile) retries once against the server's version. Returns false
 *  when the row doesn't exist yet — the first autosave carries the local title up anyway. */
export async function serverRenameProject(id: string, title: string, baseVersion: number): Promise<boolean> {
  const put = (v: number) =>
    fetch(`/api/studio/projects/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        documentSchemaVersion: 2,
        title,
        baseVersion: v,
      }),
    });
  try {
    let r = await put(baseVersion);
    if (r.status === 409) {
      const { project } = (await r.json()) as { project?: StudioProjectDto };
      if (!project) return false;
      r = await put(project.version);
    }
    return r.ok;
  } catch {
    return false;
  }
}

/** Fetch a single project in full (open project / cross-device restore). Returns null on 404/failure. */
export async function serverLoadProject(id: string): Promise<StudioProjectDto | null> {
  try {
    const r = await fetch(`/api/studio/projects/${id}`);
    if (!r.ok) return null;
    const { project } = (await r.json()) as { project: StudioProjectDto };
    // A metadata refresh does not replace the editor's document. Only explicit adoption
    // through cacheProjectLocally may advance its save baseline/version to this snapshot.
    return project ?? null;
  } catch {
    return null;
  }
}

export type { ProjectSavePayload } from '@pireel/studio-engine/project-dto';

/** The diff baseline from the last successful save (section hashes + section values, values being the base
 *  for JSON Patch diffs): only advanced on 'ok' — failed sections stay dirty and resend next time; a 409
 *  reseeds from the server's returned full state (so the retry diff aligns with truth). */
const sectionCache = new Map<string, AckedSections>();

const remoteSnapshots = new Map<string, StudioProjectDto>();
const localBaselines = new Map<string, ProjectSavePayload>();
const saveChains = new Map<string, Promise<unknown>>();

/** PUT the diff body: large bodies use gzip (custom header; content-encoding risks a middlebox
 *  decompressing it on its own), environments without CompressionStream fall back to plaintext. */
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
      /* compression failed; use plaintext */
    }
  }
  return fetch(`/api/studio/projects/${id}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: json });
}

/** Serialize the project's saves and replay only edits since this editor's last acknowledgement.
 * A network failure keeps the same local intent; identity-based reconciliation makes replay safe. */
export function serverSaveProject(id: string, payload: ProjectSavePayload): Promise<ProjectSaveResult> {
  const pending = (saveChains.get(id) ?? Promise.resolve()).then(() => saveProjectEdit(id, payload));
  saveChains.set(id, pending);
  void pending.finally(() => { if (saveChains.get(id) === pending) saveChains.delete(id); }).catch(() => {});
  return pending;
}

async function saveProjectEdit(id: string, payload: ProjectSavePayload): Promise<ProjectSaveResult> {
  const local = structuredClone(payload);
  const base = localBaselines.get(id);
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const remote = remoteSnapshots.get(id);
      const candidate = remote ? reconcileProjectSave(base ?? remote, local, remote, !base) : local;
      const wireVersion = remote?.version ?? projectVersion(id);
      const built = buildSaveWire(candidate, wireVersion, sectionCache.get(id) ?? null);
      if (!built) {
        localBaselines.set(id, local);
        return remote ? { status: 'saved', project: remote } : 'ok';
      }
      let response = await putWire(id, built.wire);
      if (response.status === 422) {
        const full = buildSaveWire(candidate, wireVersion, null);
        if (!full) return 'skip';
        response = await putWire(id, full.wire);
      }
      if (response.status === 409) {
        const body = await response.json() as { error?: string; saveBlocked?: boolean; project?: StudioProjectDto };
        if (body.saveBlocked || body.error === 'document_migration_required' || body.error === 'document_schema_upgraded') return 'migration-required';
        if (!body.project) return 'skip';
        remoteSnapshots.set(id, body.project);
        sectionCache.set(id, ackedFromDto(body.project));
        continue;
      }
      if (!response.ok) return 'skip';
      const { project } = await response.json() as { project?: StudioProjectDto };
      if (!project) return 'skip'; // no acknowledgement: leave the intent pending
      remoteSnapshots.set(id, project);
      sectionCache.set(id, ackedFromDto(project));
      localBaselines.set(id, local);
      return { status: 'saved', project };
    }
  } catch { /* the save queue retries; the live/local draft stays authoritative for pending intent */ }
  return 'skip';
}

export async function serverDeleteProject(id: string): Promise<void> {
  sectionCache.delete(id);
  remoteSnapshots.delete(id);
  localBaselines.delete(id);
  try {
    await fetch(`/api/studio/projects/${id}`, { method: 'DELETE' });
  } catch {
    /* local delete already applied; a later cloud retry is fine */
  }
}

/** Server project → local localStorage cache: after opening on a new device there's a local
 *  copy too, for instant open next time and offline viewing. Also remembers version to send back on save.
 *  Returns the in-memory draft for the caller to apply directly — persistence can silently fail on quota, and
 *  reading back from localStorage afterward would yield a stale draft (then autosave would write that stale state
 *  back to cloud; don't go down that path). */
export function cacheProjectLocally(p: StudioProjectDto): StudioDraft {
  rememberServerProject(p);
  const document = p.document;
  const draft: StudioDraft = {
    id: p.id,
    ...(p.title ? { title: p.title } : {}),
    ...(p.coverThumb ? { coverThumb: p.coverThumb } : {}),
    document,
    comp: projectDocumentToComposition(document),
    videoSig: p.videoSig,
    videoDurationSec: p.videoDurationSec,
    savedAt: p.updatedAt,
    baseVersion: p.version,
    pending: false,
    ...(p.context && Object.keys(p.context).length ? { context: p.context } : {}),
  };
  try {
    writeDraft(draft);
  } catch {
    /* quota full: only affects next instant-open; the caller applying the return value directly is unaffected */
  }
  return draft;
}

export function draftHasPendingEdits(id: string, document: EditorDocumentV2, context?: StudioProjectContext, fallback = true): boolean {
  const remote = remoteSnapshots.get(id);
  if (!remote) return fallback;
  const built = buildSaveWire({ document, context, videoSig: remote.videoSig, videoDurationSec: remote.videoDurationSec }, remote.version, ackedFromDto(remote));
  return !!built && ('document' in built.wire || 'documentPatch' in built.wire || 'context' in built.wire || 'contextPatch' in built.wire);
}

/** Seed the save base from cloud truth, but never discard an unacknowledged local draft.
 * With no persisted base snapshot, keep both branches as normal outputs instead of guessing. */
export function restoreCloudProject(remote: StudioProjectDto, local?: StudioDraft | null): StudioDraft {
  const cloud = cacheProjectLocally(remote);
  if (!local || !draftHasPendingEdits(remote.id, local.document, local.context)) return cloud;
  const localPayload: ProjectSavePayload = { document: local.document, context: local.context,
    videoSig: local.videoSig, videoDurationSec: local.videoDurationSec, coverThumb: local.coverThumb };
  let next: ProjectSavePayload;
  if (local.baseVersion === remote.version) next = localPayload;
  else if (local.pending === false) return cloud;
  else if (local.pending === true) next = reconcileProjectSave(remote, localPayload, remote, true);
  else {
    // A pre-upgrade draft has no dirty marker. Prefer cloud while preserving the unknown local branch.
    const localSnapshot = { ...remote, ...localPayload, document: local.document, context: local.context ?? remote.context, updatedAt: local.savedAt } as StudioProjectDto;
    next = reconcileProjectSave(localSnapshot, remote, localSnapshot, true);
  }
  const restored: StudioDraft = { ...cloud, document: next.document!, comp: projectDocumentToComposition(next.document!),
    context: next.context, videoSig: next.videoSig, videoDurationSec: next.videoDurationSec, coverThumb: next.coverThumb ?? undefined, pending: true };
  try { writeDraft(restored); } catch { /* live edit remains available */ }
  return restored;
}

/** Debounced autosave: don't write an empty canvas (just-opened, don't clobber an existing draft); strip the blob
 *  video down to sig/duration; preserve title as-is (renaming happens in the project list); read the first-frame
 *  thumbnail from a ref (including an intentional null after deletion). Returns lastSavedAt for the workbench badge. */
export function useDraftAutosave(
  comp: Composition,
  videoSig: string | null,
  projectId: string,
  document: EditorDocumentV2,
  coverThumbRef?: MutableRefObject<string | null>,
  contextOf?: () => StudioDraft['context'],
  contextRevision?: unknown,
) {
  const timer = useRef<number | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  // Boot-empty must not clobber a real draft, but "the user emptied a loaded project" is a legit
  // final state that MUST persist — otherwise a refresh resurrects the last non-empty draft.
  // "Emptied" = this hook saw content earlier in the session and now it's gone.
  const everContent = useRef(false);
  useEffect(() => {
    const context = contextOf?.();
    const hasContent = hasTimelineContent(comp) || !!context?.outputs?.inactive.length;
    if (hasContent) everContent.current = true;
    if ((!hasContent && !everContent.current) || !projectId) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      try {
        const prev = rawDraft(projectId);
        // Passing a ref means the caller is authoritative: null is an intentional clear after
        // the last timeline video was removed. Only callers without a cover ref inherit the
        // previous draft value.
        const cover = coverThumbRef ? coverThumbRef.current : prev?.coverThumb;
        const videoDurationSec = firstNarrativeAsset(document)?.metadata.durationSec ?? prev?.videoDurationSec ?? null;
        const draft: StudioDraft = {
          id: projectId,
          ...(prev?.title ? { title: prev.title } : {}),
          ...(cover ? { coverThumb: cover } : {}),
          document,
          comp: projectDocumentToComposition(document),
          videoSig,
          videoDurationSec,
          savedAt: Date.now(),
          baseVersion: projectVersion(projectId) ?? prev?.baseVersion ?? null,
          pending: draftHasPendingEdits(projectId, document, context, prev?.pending ?? true),
          ...(() => {
            const ctx = context;
            return ctx && Object.keys(ctx).length ? { context: ctx } : {};
          })(),
        };
        writeDraft(draft);
        setLastSavedAt(draft.savedAt);
      } catch {
        /* quota full / private mode: silent (a draft is a bonus, not a promise) */
      }
    }, 1000);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [comp, videoSig, projectId, document, contextRevision]);
  return { lastSavedAt };
}
