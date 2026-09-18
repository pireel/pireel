/**
 * Frames a tool captures for the agent go to the user's content-addressed cloud media space, and
 * the receipt carries the object key instead of the picture. A chat thread then stays small (the
 * browser re-sends the whole history on every model round), the host reads the bytes only when it
 * builds a prompt or answers an MCP client, and identical frames dedupe to one object. Without a
 * reachable store (the zero-backend shell, an offline session) the frame stays inline as base64.
 */

import type { ToolFrameImage } from '@pireel/studio-engine/prompts';
import { cloudBackupMedia } from './cloud-media';
import { durableFileSig } from './media';

function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; mimeType: string; base64: string } | null {
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || comma < 0) return null;
  const header = dataUrl.slice(5, comma);
  const base64 = dataUrl.slice(comma + 1);
  const mimeType = header.split(';')[0] || 'image/jpeg';
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return { bytes, mimeType, base64 };
  } catch {
    return null;
  }
}

/** Store one captured frame and describe it for a receipt; falls back to the inline picture. */
export async function cloudToolFrame(
  dataUrl: string,
  size?: { width?: number; height?: number },
  options?: { signal?: AbortSignal },
): Promise<ToolFrameImage> {
  const decoded = decodeDataUrl(dataUrl);
  const dims = {
    ...(size?.width ? { width: size.width } : {}),
    ...(size?.height ? { height: size.height } : {}),
  };
  if (!decoded) return { mimeType: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1), ...dims };
  const inline: ToolFrameImage = { mimeType: decoded.mimeType, data: decoded.base64, ...dims };
  if (typeof fetch !== 'function') return inline;
  try {
    const file = new File([decoded.bytes as BlobPart], 'frame.jpg', { type: decoded.mimeType });
    const sig = await durableFileSig(file);
    const stored = await cloudBackupMedia(file, sig, options);
    return stored ? { mimeType: decoded.mimeType, key: stored.key, ...dims } : inline;
  } catch {
    return inline;
  }
}
