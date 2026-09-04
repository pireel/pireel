import { materializeRemoteMedia } from './remote-media';

/**
 * Cloud rendezvous for studio media bytes (browser side) — the client half of /api/studio/media.
 *
 * Content-addressed: the key is derived server-side from the content sig, so a duplicate upload
 * short-circuits via headObject ("instant" backup) and the same bytes imported on two devices are one
 * object. Video, image and audio all use this one lane.
 *
 * Failures degrade silently (a failed backup ≠ lost functionality: the device copy keeps working and
 * asset-upload-queue retries; a failed retrieval falls back to the panel's re-import card).
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
    if (typeof XMLHttpRequest === 'undefined') {
      fetch(url, { method: 'PUT', headers, body: file, signal: options?.signal })
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
  if (/\.(jpe?g)$/i.test(file.name)) return 'image/jpeg';
  if (/\.png$/i.test(file.name)) return 'image/png';
  if (/\.webp$/i.test(file.name)) return 'image/webp';
  if (/\.gif$/i.test(file.name)) return 'image/gif';
  if (/\.(mp3)$/i.test(file.name)) return 'audio/mpeg';
  if (/\.(m4a)$/i.test(file.name)) return 'audio/mp4';
  if (/\.wav$/i.test(file.name)) return 'audio/wav';
  if (/\.(mov)$/i.test(file.name)) return 'video/quicktime';
  return 'video/mp4';
};

/** Back up a media file to the cloud. Returns {key} whether it already exists (instant) or succeeds; null on failure (silent). */
export async function cloudBackupMedia(file: File, sig: string, options?: CloudBackupOptions): Promise<{ key: string } | null> {
  try {
    const contentType = mediaContentType(file);
    const r = await fetch('/api/studio/media', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'put', sig, size: file.size, content_type: contentType }),
      signal: options?.signal,
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { key: string; url?: string; already?: boolean; content_type?: string };
    if (j.already) {
      options?.onProgress?.(1);
      return { key: j.key };
    }
    if (!j.url) return null;
    // The presign signs in Content-Type + Cache-Control; the PUT must send identical headers or the signature fails
    const ok = await putWithProgress(
      j.url,
      file,
      { 'Content-Type': j.content_type ?? contentType, 'Cache-Control': 'public, max-age=2592000, immutable' },
      options,
    );
    return ok ? { key: j.key } : null;
  } catch {
    return null;
  }
}

/** Retrieve a media file from the cloud, by explicit key when known (survives sig-format changes),
 * else by sig. Returns null on miss/failure. */
export async function cloudFetchMedia(sig: string, options?: { cloudKey?: string; label?: string }): Promise<File | null> {
  try {
    const r = await fetch('/api/studio/media', {
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
    return materialized.file;
  } catch {
    return null;
  }
}

/** @deprecated names from the video-only era. */
export const cloudBackupVideo = cloudBackupMedia;
export const cloudFetchVideo = cloudFetchMedia;
