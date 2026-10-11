/**
 * Capability wiring for the OSS shell — import this module BEFORE rendering the editor.
 *
 * By default every generation capability is unavailable: the editor still runs fully
 * in the browser (import video, edit, preview, timeline, captions, client export),
 * and block/plan generation is expected to come from an external agent (BYO brain)
 * or from providers you inject here.
 *
 * To wire your own backend, replace `unavailableProviders()` with a StudioProviders
 * implementation; see `StudioProviders` in @pireel/studio-engine/providers for the
 * six capability contracts (composer / planner / transcriber / vault / projects / uploads).
 */

import { setStudioProviders, unavailableProviders } from '@pireel/studio-engine/providers';

setStudioProviders({
  ...unavailableProviders(
    'this shell has no backend wired — inject StudioProviders in src/providers.ts, or generate through an external agent',
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

