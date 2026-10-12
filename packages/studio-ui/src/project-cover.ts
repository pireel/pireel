import type { ProjectSync } from './project-sync';
import type { EditorDocumentV2 } from '@pireel/studio-engine/editor-document/types';

export interface ProjectCover { url: string; key: string; label: string }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const validCover = (value: unknown): value is ProjectCover => record(value) && typeof value.url === 'string' && /^https?:\/\//i.test(value.url) && typeof value.key === 'string' && !!value.key && !/^(blob|data):/i.test(value.key) && typeof value.label === 'string';

/** Output-scoped selection lives in the document, so switching devices cannot restore auto frames. */
export function projectCoverFromDocument(document: EditorDocumentV2): ProjectCover | null {
  const artifacts = document.semantics.artifacts;
  const value = record(artifacts) ? artifacts.projectCover : null;
  return record(value) && value.kind === 'pireel.project-cover' && validCover(value.image) ? value.image : null;
}

export function withProjectCover(document: EditorDocumentV2, cover: ProjectCover): EditorDocumentV2 {
  if (!validCover(cover)) throw new Error('Invalid project cover');
  const previous = document.semantics.artifacts;
  const artifacts = record(previous) ? previous : previous === undefined ? {} : { legacyArtifacts: { kind: 'pireel.opaque', payload: previous } };
  return { ...document, semantics: { ...document.semantics, artifacts: { ...artifacts, projectCover: { kind: 'pireel.project-cover', image: { ...cover } } } } };
}

/** All thumbnail writes share one lane: an in-flight auto frame cannot overwrite a chosen cover. */
export class ProjectCoverWriteQueue {
  private pending: Promise<void> = Promise.resolve();
  constructor(private readonly save: (cover: Blob | null, signature: string | null) => Promise<void>) {}
  write(cover: Blob | null, signature: string | null): Promise<void> {
    const next = this.pending.catch(() => {}).then(() => this.save(cover, signature));
    this.pending = next;
    return next;
  }
}

/** Await this cover's transaction, not unrelated autosaves that may arrive during the request. */
export async function persistProjectCover(sync: Pick<ProjectSync, 'flush' | 'whenIdle' | 'pendingTransactions'> | null, transactionId: string | undefined, cover: ProjectCover, document: () => EditorDocumentV2): Promise<void> {
  if (!sync || !transactionId) throw new Error('cover_sync_unavailable');
  await sync.flush();
  await sync.whenIdle();
  if (sync.pendingTransactions.some(transaction => transaction.id === transactionId)
      || projectCoverFromDocument(document())?.key !== cover.key) throw new Error('cover_sync_failed');
}

/** Save bytes before reporting application; reload identity is part of the document transaction. */
export async function applyProjectCover(cover: ProjectCover, deps: {
  load: (url: string) => Promise<Blob>;
  save: (blob: Blob, signature: string) => Promise<void>;
  current: () => boolean;
  document: () => EditorDocumentV2;
  commit: (document: EditorDocumentV2) => boolean;
  persist: () => Promise<void>;
}): Promise<void> {
  if (!validCover(cover)) throw new Error('Invalid project cover');
  let blob: Blob;
  try { blob = await deps.load(cover.url); } catch (cause) { throw new Error('cover_image_unavailable', { cause }); }
  if (!blob.size || !blob.type.startsWith('image/')) throw new Error('cover_image_unavailable');
  if (!deps.current()) throw new Error('cover_output_changed');
  try { await deps.save(blob, cover.url); } catch (cause) { throw new Error('cover_upload_failed', { cause }); }
  if (!deps.current()) throw new Error('cover_output_changed');
  if (!deps.commit(withProjectCover(deps.document(), cover))) throw new Error('cover_apply_failed');
  await deps.persist();
}

/** The list-thumbnail endpoint accepts <=600 KiB; keep the original image URL for full-size use. */
export async function projectCoverThumbnail(source: Blob): Promise<Blob> {
  if (source.size <= 600 * 1024 && ['image/jpeg', 'image/png', 'image/webp'].includes(source.type)) return source;
  const bitmap = await createImageBitmap(source);
  try {
    const scale = Math.min(1, 960 / Math.max(bitmap.width, bitmap.height));
    const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('cover_image_unavailable');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.65, 0.45]) {
      const thumbnail = await canvas.convertToBlob({ type: 'image/jpeg', quality });
      if (thumbnail.size <= 600 * 1024) return thumbnail;
    }
    throw new Error('cover_image_unavailable');
  } finally { bitmap.close(); }
}
