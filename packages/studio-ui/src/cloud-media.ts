import { materializeRemoteMedia } from './remote-media';

/**
 * Cloud backup/retrieval of studio source videos (browser side) — the client half of /api/studio/media.
 *
 * Layered with the OPFS local library (local-media): the local library handles "instant open on this
 * device", the cloud handles "auto-reconnect after switching devices / losing on refresh". Both use the
 * same key (videoSig content fingerprint); the cloud key is derived server-side from the sig
 * (content-addressed, so duplicate backups short-circuit via headObject).
 *
 * All failures degrade silently (a failed backup ≠ lost functionality, local keeps working; a failed
 * retrieval falls back to the old "re-pick the original video" path) — an interrupted upload just retries
 * on next open, idempotent.
 */

export interface CloudMediaEntry {
  sig: string;
  key: string;
}

/** Back up a source video to the cloud. Returns {key} whether it already exists (instant) or succeeds; null on failure (silent). */
export async function cloudBackupVideo(file: File, sig: string): Promise<{ key: string } | null> {
  try {
    const r = await fetch('/api/studio/media', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'put', sig, size: file.size, content_type: file.type || 'video/mp4' }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { key: string; url?: string; already?: boolean; content_type?: string };
    if (j.already) return { key: j.key };
    if (!j.url) return null;
    // The presign signs in Content-Type + Cache-Control; the PUT must send identical headers or the signature fails
    const put = await fetch(j.url, {
      method: 'PUT',
      headers: { 'Content-Type': j.content_type ?? file.type ?? 'video/mp4', 'Cache-Control': 'public, max-age=2592000, immutable' },
      body: file,
    });
    return put.ok ? { key: j.key } : null;
  } catch {
    return null;
  }
}

/** Retrieve a source video from the cloud (by sig). Returns null on miss/failure. */
export async function cloudFetchVideo(sig: string): Promise<File | null> {
  try {
    const r = await fetch('/api/studio/media', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'get', sig }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { url: string; content_type?: string };
    const materialized = await materializeRemoteMedia(j.url, {
      sig,
      name: 'cloud-restore.mp4',
      type: j.content_type?.startsWith('video/') || j.content_type?.startsWith('audio/')
        ? j.content_type
        : 'video/mp4',
    });
    return materialized.file;
  } catch {
    return null;
  }
}
