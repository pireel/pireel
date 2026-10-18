import { editorRequest } from '@pireel/studio-ui/host-request';
import { imageThumb } from '@pireel/ui/image-url';
import { materializeRemoteMedia } from '@pireel/studio-ui/remote-media';
import { markLocalMediaSynced } from '@pireel/studio-ui/local-media';

/**
 * Cloud rendezvous for studio media bytes (browser side) — the client half of /api/studio/media.
 *
 * Content-addressed: the key is derived server-side from the content sig, so a duplicate upload
 * short-circuits via headObject ("instant" backup) and the same bytes imported on two devices are one
 * object. Video, image and audio all use this one lane.
 *
 * A failed backup returns null (the device copy keeps working and asset-upload-queue retries; a
 * failed retrieval falls back to the panel's re-import card); the reason is logged. Large files go up
 * in parts and every PUT is retried, so one dropped connection does not lose a long upload.
 */

export interface CloudMediaEntry {
  sig: string;
  key: string;
}

export interface CloudBackupOptions {
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

function putWithProgress(url: string, file: File, headers: Record<string, string>, options?: CloudBackupOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (options?.signal?.aborted) { resolve(false); return; }
    if (typeof XMLHttpRequest === 'undefined') {
      editorRequest(url, { method: 'PUT', headers, body: file, signal: options?.signal })
        .then((response) => resolve(response.ok))
        .catch(() => resolve(false));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) options?.onProgress?.(Math.min(1, event.loaded / event.total));
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.onabort = () => resolve(false);
    options?.signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

const mediaContentType = (file: File): string => {
  if (file.type.startsWith('video/') || file.type.startsWith('audio/') || file.type.startsWith('image/')) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    gif: 'image/gif', avif: 'image/avif', bmp: 'image/bmp',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', aac: 'audio/aac',
    flac: 'audio/flac', ogg: 'audio/ogg', opus: 'audio/ogg',
    mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/mp4',
    mkv: 'video/x-matroska', avi: 'video/x-msvideo',
  };
  if (extension && types[extension]) return types[extension]!;
  return 'video/mp4';
};

/** Back up a media file to the cloud. Returns {key} whether it already exists (instant) or succeeds; null on failure (silent). */
/** Files above this go up in parts (the server picks the part size). */
export const MULTIPART_THRESHOLD_BYTES = 64 * 1024 * 1024;
const PUT_ATTEMPTS = 4;
const PART_CONCURRENCY = 4;

async function postMedia(body: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const response = await editorRequest('/api/studio/media', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  const result = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(`media ${String(body.action)}: ${typeof result.error === 'string' ? result.error : `HTTP ${response.status}`}`);
  return result;
}

/** A PUT retried with backoff; `onProgress` restarts from zero on each attempt. */
async function putWithRetry(url: string, body: Blob, headers: Record<string, string>, options: CloudBackupOptions | undefined, label: string) {
  for (let attempt = 1; attempt <= PUT_ATTEMPTS; attempt++) {
    options?.signal?.throwIfAborted();
    if (await putWithProgress(url, body as File, headers, options)) return;
    if (attempt < PUT_ATTEMPTS) await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
  }
  options?.signal?.throwIfAborted();
  throw new Error(`${label}: upload failed after ${PUT_ATTEMPTS} attempts`);
}

async function multipartBackup(file: File, sig: string, contentType: string, options?: CloudBackupOptions): Promise<{ key: string }> {
  const start = await postMedia({ action: 'multipart-start', sig, size: file.size, content_type: contentType }, options?.signal);
  if (start.already) { options?.onProgress?.(1); return { key: String(start.key) }; }
  const key = String(start.key); const uploadId = String(start.uploadId); const partSize = Number(start.partSize); const urls = start.urls as string[];
  const loaded = new Float64Array(urls.length);
  const report = () => options?.onProgress?.(Math.min(1, loaded.reduce((sum, value) => sum + value, 0) / file.size));
  let next = 0;
  try {
    await Promise.all(Array.from({ length: Math.min(PART_CONCURRENCY, urls.length) }, async () => {
      while (next < urls.length) {
        const index = next++; const part = file.slice(index * partSize, Math.min(file.size, (index + 1) * partSize));
        await putWithRetry(urls[index]!, part, {}, { signal: options?.signal, onProgress: (fraction) => { loaded[index] = fraction * part.size; report(); } }, `part ${index + 1}/${urls.length}`);
        loaded[index] = part.size; report();
      }
    }));
    await postMedia({ action: 'multipart-complete', sig, size: file.size, uploadId }, options?.signal);
  } catch (error) {
    await postMedia({ action: 'multipart-abort', sig, uploadId }).catch(() => {});
    throw error;
  }
  return { key };
}

export async function cloudBackupMedia(file: File, sig: string, options?: CloudBackupOptions): Promise<{ key: string } | null> {
  try {
    const contentType = mediaContentType(file);
    if (file.size > MULTIPART_THRESHOLD_BYTES && !contentType.startsWith('image/')) return await multipartBackup(file, sig, contentType, options);
    const j = await postMedia({ action: 'put', sig, size: file.size, content_type: contentType }, options?.signal) as { key: string; url?: string; already?: boolean; content_type?: string };
    if (j.already) {
      options?.onProgress?.(1);
      return { key: j.key };
    }
    if (!j.url) return null;
    // The presign signs in Content-Type + Cache-Control; the PUT must send identical headers or the signature fails
    await putWithRetry(j.url, file, { 'Content-Type': j.content_type ?? contentType, 'Cache-Control': 'public, max-age=2592000, immutable' }, options, 'upload');
    return { key: j.key };
  } catch (error) {
    if (!options?.signal?.aborted) console.warn('[cloud-media] backup failed', error instanceof Error ? error.message : error);
    return null;
  }
}

/** Metadata-only completion, scoped to the project that queued the bytes. */
export async function cloudConfirmUpload(projectId: string, sig: string, key: string): Promise<boolean> {
  try {
    const response = await editorRequest('/api/studio/media', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'confirm-upload', projectId, sig, key }),
    });
    const confirmed = response.ok && (await response.json() as { ok?: boolean }).ok === true;
    if (confirmed) await markLocalMediaSynced(sig);
    return confirmed;
  } catch { return false; }
}

/** Read link for lazy library cards. Keep this transient: durable documents store the key. */
export async function cloudMediaPreviewUrl(sig: string, options: { cloudKey: string }): Promise<string | null> {
  if (!options.cloudKey.startsWith('studio-src/')) return imageThumb(options.cloudKey, 'original');
  try {
    const response = await editorRequest('/api/studio/media', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'get', sig, key: options.cloudKey }),
    });
    if (!response.ok) return null;
    const result = await response.json() as { url?: string };
    return typeof result.url === 'string' ? result.url : null;
  } catch {
    return null;
  }
}

/** Retrieve a media file from the cloud, by explicit key when known (survives sig-format changes),
 * else by sig. Returns null on miss/failure. */
export async function cloudFetchMedia(sig: string, options?: { cloudKey?: string; label?: string }): Promise<File | null> {
  try {
    // Generated / library objects live on the public CDN namespace (bare key → imageThumb 'original');
    // only the private rendezvous prefix needs a presigned read.
    if (options?.cloudKey && !options.cloudKey.startsWith('studio-src/')) {
      const materialized = await materializeRemoteMedia(imageThumb(options.cloudKey, 'original'), {
        sig,
        name: options.label || options.cloudKey.split('/').pop() || 'media',
      });
      await markLocalMediaSynced(sig);
      return materialized.file;
    }
    const r = await editorRequest('/api/studio/media', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'get', sig, ...(options?.cloudKey ? { key: options.cloudKey } : {}) }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { url: string; content_type?: string };
    const type = j.content_type && /^(video|audio|image)\//.test(j.content_type) ? j.content_type : 'video/mp4';
    const materialized = await materializeRemoteMedia(j.url, {
      sig,
      name: options?.label || (type.startsWith('image/') ? 'cloud-restore.png' : type.startsWith('audio/') ? 'cloud-restore.m4a' : 'cloud-restore.mp4'),
      type,
    });
    await markLocalMediaSynced(sig);
    return materialized.file;
  } catch {
    return null;
  }
}

/** @deprecated names from the video-only era. */
export const cloudBackupVideo = cloudBackupMedia;
export const cloudFetchVideo = cloudFetchMedia;
