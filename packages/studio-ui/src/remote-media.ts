'use client';

import { alignFileToSig, deleteLocalVideo, loadLocalVideo, saveLocalStream, saveLocalVideo } from './local-media';
import { fileNameFromSig } from './media';

export interface MaterializedRemoteMedia {
  file: File;
  sig: string;
}

interface MaterializeRemoteMediaOptions {
  name?: string;
  type?: string;
  sig?: string | null;
  pinned?: boolean;
  signal?: AbortSignal;
}

const sizeFromSig = (sig: string): number | null => {
  const parts = sig.split(':');
  const size = Number(parts[parts.length - 2]);
  return Number.isSafeInteger(size) && size >= 0 ? size : null;
};

const safeName = (value: string, fallback: string): string => {
  const clean = value.replace(/[\\/:*?"<>|\p{Cc}]+/gu, '-').trim();
  return clean || fallback;
};

const urlName = (raw: string): string => {
  try {
    const origin = typeof location !== 'undefined' ? location.origin : 'http://localhost';
    return decodeURIComponent(new URL(raw, origin).pathname.split('/').pop() || '');
  } catch {
    return '';
  }
};

async function shortHash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].slice(0, 12).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function fetchRemote(raw: string, signal?: AbortSignal): Promise<Response> {
  const origin = typeof location !== 'undefined' ? location.origin : 'http://localhost';
  const direct = raw.startsWith('blob:') || raw.startsWith('data:') || raw.startsWith('/') || raw.startsWith(origin);
  if (direct) return fetch(raw, { signal });
  try {
    const response = await fetch(raw, { signal });
    if (response.ok && response.body) return response;
  } catch {
    // CORS/network: use the guarded same-origin proxy below.
  }
  return fetch(`/api/media/fetch?url=${encodeURIComponent(raw)}`, { signal });
}

/** Materialize a remote media object directly into OPFS. Large videos never pass through
 * Response.blob()/ArrayBuffer; the returned File is backed by the browser's local storage. */
export async function materializeRemoteMedia(
  url: string,
  options: MaterializeRemoteMediaOptions = {},
): Promise<MaterializedRemoteMedia> {
  const response = await fetchRemote(url, options.signal);
  if (!response.ok || !response.body) throw new Error(`media fetch failed: HTTP ${response.status}`);

  // Number(null) === 0: an ABSENT content-length (chunked/proxied responses stream without one)
  // must read as "size unknown", never as "expect zero bytes" — that killed every export whose
  // audio materialized through the same-origin proxy.
  const headerRaw = response.headers.get('content-length');
  const headerSize = headerRaw == null || headerRaw.trim() === '' ? Number.NaN : Number(headerRaw);
  const responseSize = Number.isSafeInteger(headerSize) && headerSize >= 0 ? headerSize : null;
  const requestedSig = options.sig?.trim() || null;
  const requestedSize = requestedSig ? sizeFromSig(requestedSig) : null;
  const expectedSize = requestedSize ?? responseSize;
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || options.type || 'application/octet-stream';
  const baseName = safeName(options.name || urlName(url), contentType.startsWith('audio/') ? 'audio' : contentType.startsWith('image/') ? 'image' : 'video');

  // Server-side/unit callers have no OPFS. Browser production always takes the streaming path below;
  // this fallback keeps shared tool logic executable in non-DOM runtimes without touching location.
  if (typeof window === 'undefined') {
    const file = new File([await response.arrayBuffer()], baseName, { type: contentType, lastModified: 0 });
    return { file, sig: options.sig?.trim() || `${baseName}:${file.size}:0` };
  }
  const locatorHash = await shortHash(`${url}\n${response.headers.get('etag') ?? ''}\n${response.headers.get('last-modified') ?? ''}`);
  const durableName = `${locatorHash}-${baseName}`;

  if (requestedSig || expectedSize != null) {
    const sig = requestedSig ?? `${durableName}:${expectedSize}:0`;
    const file = await saveLocalStream(response.body, sig, {
      name: requestedSig ? fileNameFromSig(requestedSig) || durableName : durableName,
      type: contentType,
      expectedSize,
      pinned: options.pinned,
    });
    return { file: alignFileToSig(file, sig), sig };
  }

  // Some third-party origins omit Content-Length. Stream once to a temporary OPFS entry, then
  // install the disk-backed File under its final size-bearing identity without buffering in JS.
  const temporarySig = `.remote-${crypto.randomUUID()}:0:0`;
  const temporary = await saveLocalStream(response.body, temporarySig, {
    name: durableName,
    type: contentType,
    expectedSize: null,
  });
  const sig = `${durableName}:${temporary.size}:0`;
  const stored = await saveLocalVideo(alignFileToSig(temporary, sig), sig, undefined, { pinned: options.pinned });
  if (!stored) {
    await deleteLocalVideo(temporarySig);
    throw new Error('remote media could not be persisted on this device');
  }
  // Return a File backed by the DURABLE entry. The temporary-backed File must never escape:
  // OPFS Files read lazily, so handing it out and then deleting its backing entry made the
  // export mixer hit NotFoundError at mux time (after the whole video had already rendered).
  const durable = await loadLocalVideo(sig);
  await deleteLocalVideo(temporarySig);
  if (!durable) throw new Error('remote media could not be persisted on this device');
  return { file: alignFileToSig(durable, sig), sig };
}
