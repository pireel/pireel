import { afterEach, expect, it, vi } from 'vitest';
import { editorRequest } from './host-request';
import { setStudioProviders, unavailableProviders } from '@pireel/studio-engine/providers';
afterEach(() => {setStudioProviders(unavailableProviders());vi.unstubAllGlobals();});
it('keeps AI/account requests off the network until a host is connected', async () => {
 const network=vi.fn();vi.stubGlobal('fetch',network);setStudioProviders(unavailableProviders());
 await expect(editorRequest('/api/studio/chat')).rejects.toThrow('not configured');
 expect(network).not.toHaveBeenCalled();
});
it('passes service requests to the configured host transport', async () => {
 const request=vi.fn(async()=>Response.json({ok:true}));setStudioProviders({...unavailableProviders(),request});
 await editorRequest('/api/studio/chat',{method:'POST',body:'{}'});
 expect(request).toHaveBeenCalledWith('/api/studio/chat',{method:'POST',body:'{}'});
});
it('does not forward external media through an authenticated host transport', async () => {
 const request=vi.fn();const network=vi.fn(async()=>new Response('media'));vi.stubGlobal('fetch',network);setStudioProviders({...unavailableProviders(),request});
 await editorRequest('https://assets.example/video.mp4');
 expect(request).not.toHaveBeenCalled();expect(network).toHaveBeenCalled();
});

it('does not bypass host configuration for an absolute same-origin service URL', async () => {
 const network=vi.fn();vi.stubGlobal('fetch',network);vi.stubGlobal('location',{origin:'http://localhost:5173'});setStudioProviders(unavailableProviders());
 await expect(editorRequest('http://localhost:5173/api/studio/chat')).rejects.toThrow('not configured');
 expect(network).not.toHaveBeenCalled();
});
