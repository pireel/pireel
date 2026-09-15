'use client';

/**
 * Project draft persistence — multi-project: one localStorage key per project
 * (studio:draft:<id>), composition debounce-saved so a refresh doesn't lose it. The project
 * list is derived by scanning the key prefix, no separate index maintained.
 *
 * The draft is a cache of the last published document, for an instant or offline open. It is
 * never merged with the cloud copy: the cloud document is adopted and the unacknowledged
 * transactions (see project-sync) are replayed on top.
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
import type {
  ProjectCommitAck,
  ProjectSaveResult,
  ProjectSaveWire,
  StudioProjectContext,
  StudioProjectDto,
  StudioProjectMeta,
} from '@pireel/studio-engine/project-dto';
import { t } from './i18n';

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
  if (!d || (!hasTimelineContent(d.comp) && !d.context?.outputs?.inactive.length)) return null;
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

/* ============================ Server transport ============================ */

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

/** List-page rename: title-only PUT (absent sections keep their server values). Returns false
 *  when the row doesn't exist yet — the first autosave carries the local title up anyway. */
export async function serverRenameProject(id: string, title: string): Promise<boolean> {
  try {
    const r = await fetch(`/api/studio/projects/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ documentSchemaVersion: 2, knownVersion: null, title }),
    });
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
    return project ?? null;
  } catch {
    return null;
  }
}

export type { ProjectSavePayload } from '@pireel/studio-engine/project-dto';

/** PUT the wire: large bodies use gzip (custom header; content-encoding risks a middlebox
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

/** Transport for one save request. The sync layer owns retries, baselines and the pending list. */
export async function serverSaveProject(id: string, wire: ProjectSaveWire): Promise<ProjectSaveResult | 'need-full'> {
  try {
    const response = await putWire(id, wire);
    if (response.status === 422) return 'need-full';
    if (response.status === 409) {
      const body = await response.json() as { error?: string; saveBlocked?: boolean };
      if (body.saveBlocked || body.error === 'document_migration_required' || body.error === 'save_protocol_retired') return 'migration-required';
      return 'skip';
    }
    if (!response.ok) return 'skip';
    const body = await response.json() as Partial<ProjectCommitAck> & { project?: StudioProjectDto };
    if (!body.project) return 'skip'; // no acknowledgement: leave the intent pending
    return {
      status: 'saved',
      project: body.project,
      applied: Array.isArray(body.applied) ? body.applied : [],
      rejected: Array.isArray(body.rejected) ? body.rejected : [],
      baseVersion: typeof body.baseVersion === 'number' ? body.baseVersion : body.project.version - 1,
      documentHash: typeof body.documentHash === 'string' ? body.documentHash : '',
    };
  } catch {
    return 'skip';
  }
}

export async function serverDeleteProject(id: string): Promise<void> {
  try {
    await fetch(`/api/studio/projects/${id}`, { method: 'DELETE' });
  } catch {
    /* local delete already applied; a later cloud retry is fine */
  }
}

/** Server project → local localStorage cache: after opening on a new device there's a local
 *  copy too, for instant open next time and offline viewing.
 *  Returns the in-memory draft for the caller to apply directly — persistence can silently fail on quota, and
 *  reading back from localStorage afterward would yield a stale draft. */
export function cacheProjectLocally(p: StudioProjectDto): StudioDraft {
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
    ...(p.context && Object.keys(p.context).length ? { context: p.context } : {}),
  };
  try {
    writeDraft(draft);
  } catch {
    /* quota full: only affects next instant-open; the caller applying the return value directly is unaffected */
  }
  return draft;
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
