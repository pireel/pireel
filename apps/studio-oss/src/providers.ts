/** Local storage ports only. Hosted AI capabilities are not distributed in this shell. */

import { setStudioProviders, unavailableProviders } from '@pireel/studio-engine/providers';

setStudioProviders({
  ...unavailableProviders(
    'Local uploads are unavailable',
  ),
  // Uploads go to the local disk route (vite plugin local-assets-plugin.ts): stable
  // same-origin relative URLs, loadable by the preview iframe and the client export.
  uploads: {
    async upload(blob, opts) {
      const r = await fetch('/local-assets', {
        method: 'POST',
        headers: { 'content-type': opts.contentType || blob.type || 'application/octet-stream' },
        body: blob,
      });
      const j = (await r.json().catch(() => ({}))) as { url?: string; key?: string; error?: string };
      if (!r.ok || !j.url || !j.key) throw new Error(j.error ?? `local upload failed (${r.status})`);
      return { url: j.url, key: j.key };
    },
  },
});

