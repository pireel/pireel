// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { BrollOptions } from '@pireel/studio-engine/broll-task';
import { BrollSettings } from './broll-settings';
const mocks = vi.hoisted(() => ({ backup: vi.fn(), change: vi.fn() }));
vi.mock('./media', () => ({ durableFileSig: async (file: File) => file.name, probeVideoFile: async () => ({width:640,height:360,durationSec:5}) }));
vi.mock('./local-media', () => ({ saveLocalVideo: async () => true }));
vi.mock('./caption-task-store', () => ({ loadCaptionMedia: async () => null }));
vi.mock('@pireel/studio-engine/providers', () => ({ studioProviders: () => ({ sceneProjects: {owner:async()=> 'owner'},vault:{backup:mocks.backup} }) }));
let container: HTMLDivElement; let root: Root;
let pending: { progress:(value:number)=>void; resolve:(value:boolean)=>void }[];
function Harness() {
 const [value,setValue]=useState<BrollOptions>({assets:[],captions:true}); const [busy,setBusy]=useState(false);
 return createElement(BrollSettings,{task:{scope:'owner'} as never,value,disabled:busy,locale:'zh',onBusy:setBusy,onChange:next=>{mocks.change(next);setValue(next);}});
}
beforeEach(async()=>{vi.clearAllMocks();pending=[];vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.stubGlobal('URL',{createObjectURL:vi.fn(()=>`blob:${Math.random()}`),revokeObjectURL:vi.fn()});
 mocks.backup.mockImplementation((_file,_sig,options)=>new Promise(resolve=>pending.push({progress:options.onProgress,resolve})));
 container=document.createElement('div');document.body.append(container);root=createRoot(container);await act(async()=>root.render(createElement(Harness)));
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.unstubAllGlobals();});
async function selectFiles(){const input=container.querySelector('input[type=file]')!;Object.defineProperty(input,'files',{configurable:true,value:[new File(['a'],'one.mp4',{type:'video/mp4'}),new File(['b'],'two.mp4',{type:'video/mp4'})]});await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));}
it('shows every local thumbnail immediately and updates only the uploading card',async()=>{
 await selectFiles();expect(container.querySelectorAll('video')).toHaveLength(2);expect(container.textContent).toContain('等待上传');
 await vi.waitFor(()=>expect(pending).toHaveLength(1));
 await act(async()=>pending[0].progress(.42));expect(container.querySelector('progress[aria-label="one.mp4 上传进度"]')?.getAttribute('value')).toBe('0.42');expect(container.querySelector('progress[aria-label="two.mp4 上传进度"]')?.getAttribute('value')).toBeNull();
 await act(async()=>pending[0].resolve(true));await vi.waitFor(()=>expect(pending).toHaveLength(2));
 expect(container.querySelector('[data-upload-status=done]')).not.toBeNull();
 await act(async()=>pending[1].resolve(true));expect(mocks.change.mock.calls.at(-1)![0].assets).toHaveLength(2);
 expect(container.querySelectorAll('progress')).toHaveLength(0);
 expect((container.querySelector('[aria-label="素材列表"]') as HTMLElement).style.gridTemplateColumns).toContain('auto-fill');
 expect(container.textContent).not.toContain('下一页素材');
});
it('keeps failed thumbnails in place, continues other files, and retries only the failed file',async()=>{
 await selectFiles();await act(async()=>pending[0].resolve(false));await vi.waitFor(()=>expect(pending).toHaveLength(2));await act(async()=>pending[1].resolve(true));
 expect(container.querySelectorAll('video')).toHaveLength(2);expect(container.querySelectorAll('[data-upload-status]')[0].getAttribute('data-upload-status')).toBe('failed');
 const retry=[...container.querySelectorAll('button')].find(b=>b.textContent==='重试')!;await act(async()=>retry.click());await vi.waitFor(()=>expect(pending).toHaveLength(3));await act(async()=>pending[2].resolve(true));
 expect(mocks.change.mock.calls.at(-1)![0].assets).toHaveLength(2);expect(mocks.backup.mock.calls.map(c=>c[1])).toEqual(['one.mp4','two.mp4','one.mp4']);
});
