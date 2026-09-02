/**
 * Provider contracts — the capability seams between the pure engine/editor and
 * whatever supplies LLM, ASR, storage, and persistence.
 *
 * The engine NEVER calls a provider itself (BYO-brain: briefs are assembled here,
 * generation happens in the caller's model). These interfaces exist so an editor
 * shell can be wired to different backends:
 *  - the hosted app injects its own API-backed implementations;
 *  - an OSS/self-hosted shell injects local or bring-your-own-key implementations,
 *    or `unavailableProviders()` to run the editor pure-local (BYO agent only).
 */

import type { BlockEdit, ComposeContext, KitChoice } from './compose';
import type { AsrSegment } from './build-blocks';
import type { ProjectSavePayload, StudioProjectDto } from './project-dto';
import type { EditorDocumentV2 } from './editor-document';
import type { AssetSearchDocument } from './asset-search';
import type { CustomVisualStyle } from './visual-style';

/** One block-generation request (the same shape the BYO brief is assembled from). */
export interface ComposeRequest {
  /** Billing attribution only — which project this generation belongs to. */
  projectId?: string;
  block: BlockEdit;
  instruction: string;
  theme?: string;
  palette?: Record<string, string>;
  frameId?: string;
  customVisualStyle?: CustomVisualStyle;
  /** UI language for the human-facing note line. */
  lang?: string;
  context?: ComposeContext;
  /** 'kit' asks for a component choice ({component, props}); default 'html' writes a markup fragment. */
  mode?: 'kit' | 'html';
  /** kit mode: the component this block already shows, when editing rather than creating. */
  current?: KitChoice | null;
}

/** Generates block HTML/animation from a request. Hosted: server LLM. OSS: own key or unavailable (use the BYO agent flow instead). */
export interface BlockComposer {
  /** Resolves with the raw model output (note + ```html + ```js fences); onDelta streams partials. */
  composeStream(req: ComposeRequest, onDelta?: (raw: string) => void): Promise<string>;
}

/** Speech → timed sentences (source-clock seconds). */
export interface Transcriber {
  /** opts.projectId is billing attribution only. */
  transcribe(file: File, opts?: { projectId?: string }): Promise<AsrSegment[]>;
}

/** Source-video byte vault (content-addressed by signature). Null results = degrade to local-only. */
export interface MediaVault {
  backup(file: File, sig: string): Promise<{ key: string } | null>;
  fetch(sig: string): Promise<File | null>;
}

/** Project persistence beyond the current device. */
export interface ProjectStore {
  load(id: string): Promise<StudioProjectDto | null>;
  save(id: string, payload: ProjectSavePayload): Promise<'ok' | 'conflict' | 'migration-required' | 'skip'>;
  remove(id: string): Promise<void>;
  /** Project-card cover as image BYTES (null clears). Kept out of the JSON save payload:
   * a base64 cover multiplies every project PUT/GET/list response. Optional — a shell
   * without object storage simply keeps covers device-local. */
  saveCover?(id: string, cover: Blob | null): Promise<void>;
}

/** Server-authoritative Studio chat sessions. Browser storage is not part of this contract. */
export interface ChatThreadStore {
  list(projectId: string): Promise<unknown[] | null>;
  save(projectId: string, thread: unknown): Promise<void>;
}

/** Generic asset upload (panel images, stock uploads …) — returns a public URL + storage key. */
export interface AssetUploader {
  upload(blob: Blob, opts: { contentType: string; filename?: string }): Promise<{ url: string; key: string }>;
}

/** One reusable overlay component in a Studio project's library (few-KB HTML + timeline script). */
export interface StoredElement {
  id: string;
  prompt: string;
  label: string;
  createdAt: number;
  element: { seedId: string; innerHtml: string; timelineBody: string; label: string };
}

/** Project-level component library beyond the current device (localStorage stays as cache). */
export interface ElementStore {
  list(projectId: string): Promise<StoredElement[] | null>;
  save(projectId: string, e: StoredElement): Promise<void>;
  remove(projectId: string, id: string): Promise<void>;
}

export interface CuratedAssetSemanticResult {
  query?: string;
  mode: 'semantic' | 'metadata';
  results: Array<{ assetId: string; kind?: string; score: number }>;
}

/** Optional host-owned catalog extension. OSS knows the search contract, never the catalog contents. */
export interface CuratedAssetProvider {
  listSearchDocuments(): Promise<AssetSearchDocument[]>;
  semanticSearch(args: {
    query: string;
    kind: 'all' | 'image' | 'video' | 'audio' | 'element';
    limit: number;
    signal?: AbortSignal;
  }): Promise<CuratedAssetSemanticResult | null>;
}

export interface StudioProviders {
  composer: BlockComposer;
  transcriber: Transcriber;
  vault: MediaVault;
  projects: ProjectStore;
  /** Built-in chat persistence, independent from project document/version sync. */
  chats?: ChatThreadStore;
  uploads: AssetUploader;
  /** Project component library sync (absent = pure-local localStorage library, e.g. the OSS shell). */
  elements?: ElementStore;
  /** Hosted/curated asset metadata and ranking; absent in the zero-content OSS shell. */
  curatedAssets?: CuratedAssetProvider;
  /** Endpoint for the built-in agent chat (a hosted-LLM feature; OSS shells may omit and rely on external agents via MCP). */
  chatEndpoint?: string;
  /** Which agent tool surface the host's chat route speaks. Resolved once per session so the client can
   *  route tool calls (`v3` names execute through the v3 adapter). Absent = legacy. */
  agentSurface?: () => Promise<'legacy' | 'v3'>;
  /** Cloud undo fallback: pop the newest entry off the project's server-side history ring and
   *  return the restored V2 document (null = ring empty). Absent = in-memory undo only (OSS shell).
   *  The server marks the restore as consumed — repeated calls walk strictly backward. */
  historyUndo?: (projectId: string) => Promise<{ document: EditorDocumentV2; version: number } | null>;
  /** Sentence translator for bilingual captions (hosted-LLM feature; absent = the captions panel hides its translation section — BYO agents translate themselves via set_caption_translations). */
  translate?: (rows: { index: number; text: string }[], targetLanguage: string) => Promise<{ index: number; text: string }[]>;
  /** Fill a component's text slots from the narration around its time window (hosted-LLM feature;
   *  absent = the toolbar hides its sync button — BYO agents edit blocks themselves). */
  syncFill?: (
    items: { index: number; text: string }[],
    script: string,
    block?: { html: string; timeline: string; id: string },
  ) => Promise<{ items: { index: number; text: string; at?: number }[]; span?: { from: number; to: number }; timeline?: string; html?: string }>;
}

/** All capabilities absent, failing with actionable guidance — the pure-local baseline:
 *  editing/preview/export still work; generation goes through the BYO agent flow. */
export function unavailableProviders(hint = 'no provider configured — connect an agent via MCP (BYO) or inject providers'): StudioProviders {
  const fail = (cap: string) => Promise.reject(new Error(`${cap} unavailable: ${hint}`));
  return {
    composer: { composeStream: () => fail('block composer') },
    transcriber: { transcribe: () => fail('transcriber') },
    vault: { backup: async () => null, fetch: async () => null },
    projects: { load: async () => null, save: async () => 'skip', remove: async () => {} },
    uploads: { upload: () => fail('asset uploader') },
  };
}

/* ---------- Runtime registry (editor packages get capabilities via this; the shell injects impls at startup) ---------- */

let current: StudioProviders = unavailableProviders();

/** The currently active providers (editor code always gets them via this, never imports impls). */
export const studioProviders = (): StudioProviders => current;

/** The shell injects impls (hosted shell = API backend; OSS shell = local/BYO; tests = stub). */
export function setStudioProviders(p: StudioProviders): void {
  current = p;
}
