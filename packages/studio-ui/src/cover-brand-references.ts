import { imageThumb } from '@pireel/ui/image-url';
import { materializeRemoteMedia } from './remote-media';
import type { LoadedCoverBrandReference } from './cover-scene';

/** Pixels for visual planning; original image URLs for the one image-generation call. No model calls. */
export async function loadCoverBrandReferences(keys: string[], signal?: AbortSignal): Promise<LoadedCoverBrandReference[]> {
  return Promise.all(keys.map(async key => {
    signal?.throwIfAborted();
    const url = imageThumb(key, 'original');
    const { file } = await materializeRemoteMedia(url, { name: 'brand-cover.jpg', signal });
    signal?.throwIfAborted();
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 768 / Math.max(bitmap.width, bitmap.height));
      const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('cover_brand_reference_unavailable');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
      signal?.throwIfAborted();
      return { key, url, base64: btoa(binary), mime: 'image/jpeg' };
    } finally { bitmap.close(); }
  }));
}
