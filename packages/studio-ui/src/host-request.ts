import { studioProviders } from '@pireel/studio-engine/providers';

/** Platform HTTP calls are supplied by the embedding host; local media remains ordinary fetch. */
export const editorRequest: typeof fetch = (input, init) => {
  const services = studioProviders();
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const origin = typeof location === 'undefined' ? undefined : location.origin;
  let localApi = url.startsWith('/api/');
  if (origin) {
    try { const parsed = new URL(url, origin); localApi ||= parsed.origin === origin && parsed.pathname.startsWith('/api/'); } catch { /* fetch reports malformed resource URLs */ }
  }
  if (localApi || url === services.chatEndpoint) {
    if (services.request) return services.request(input, init);
    if (services.chatEndpoint === url) return fetch(input, init);
    return Promise.reject(new Error('AI service is not configured. Connect an AI provider in the editor host.'));
  }
  return fetch(input, init);
};
