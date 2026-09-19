// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { CaptionTaskRecord } from './caption-task-store';
import { BrollTimeline } from './broll-timeline';
vi.mock('./caption-task-store',()=>({loadCaptionMedia:async()=>new File(['video'],'asset.mp4')}));
vi.mock('./web-fonts',()=>({loadFont:async()=>{}}));
const task:CaptionTaskRecord={id:'qa',scope:'owner',name:'source',scene:'broll',sourceSig:'source',width:640,height:360,durationSec:20,stage:'completed',updatedAt:1,transcript:[{start:2,end:6,text:'讲解收纳包'}],options:{presetId:'clean',aspect:'original',shortenPauses:false,broll:{captions:false,assets:[{id:'asset',sig:'asset',name:'收纳包.mp4',kind:'video',durationSec:12,width:640,height:360}]}},broll:{analysisKey:'test',planKey:'test',candidates:[{id:'candidate',assetId:'asset',start:0,end:5,description:'打开收纳包，展示内部空间'}],placements:[{id:'clip',candidateId:'candidate',start:2,duration:4}]}};
it('selects a clip to edit timing without exposing analysis notes',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('URL',{createObjectURL:()=> 'blob:qa',revokeObjectURL:vi.fn()});
 const pause=vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
 const changes=vi.fn();const file=new File(['source'],'source.mp4');
 function Harness(){const [options,setOptions]=useState(task.options);return createElement(BrollTimeline,{task,options,source:file,locale:'zh',disabled:false,onChange:value=>{changes(value);setOptions({...options,broll:value});}});}
 const el=document.createElement('div');document.body.append(el);const root=createRoot(el);
 try {
  await act(async()=>root.render(createElement(Harness)));
  await act(async()=>el.querySelector('[data-broll-clip]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
  expect(el.textContent).not.toContain('打开收纳包，展示内部空间');expect(el.textContent).toContain('讲解收纳包');
  await act(async()=>el.querySelector('[data-broll-clip]')!.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})));
  expect(changes.mock.calls.at(-1)![0].edits.clip).toEqual({start:2.1,duration:4,sourceIn:0});
  await act(async()=>[...el.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='添加素材')!.click());
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('添加到时间轴');
  await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(b=>b.textContent==='收纳包.mp4')!.click());
  expect(changes.mock.calls.at(-1)![0].manualClips).toHaveLength(1);
  expect(el.querySelectorAll('[data-broll-clip]')).toHaveLength(2);
  expect(el.querySelector('input[type=number]')).toBeNull();
  const moving=el.querySelector<HTMLElement>('[data-clip-id="clip"]')!;
  Object.defineProperty(moving,'setPointerCapture',{value:vi.fn()});
  Object.defineProperty(moving.parentElement!.parentElement!,'getBoundingClientRect',{value:()=>({width:200})});
  const pointer=(type:string,x:number)=>{const event=new MouseEvent(type,{bubbles:true,button:0,clientX:x,clientY:0});Object.defineProperty(event,'pointerId',{value:1});return event;};
  await act(async()=>moving.dispatchEvent(pointer('pointerdown',20)));
  await act(async()=>moving.dispatchEvent(pointer('pointermove',100)));
  await act(async()=>moving.dispatchEvent(pointer('pointerup',100)));
  const updated=changes.mock.calls.at(-1)![0];
  expect(updated.edits.clip.start).toBe(10.1);
  expect(updated.manualClips[0].start).toBe(2);
  const countBeforeInvalid=changes.mock.calls.length;
  await act(async()=>moving.dispatchEvent(pointer('pointerdown',100)));
  await act(async()=>moving.dispatchEvent(pointer('pointermove',19)));
  expect(el.textContent).toContain('该位置已被占用');
  await act(async()=>moving.dispatchEvent(pointer('pointerup',19)));
  expect(changes.mock.calls).toHaveLength(countBeforeInvalid);
  expect(el.querySelector('[aria-label="裁剪镜头"]')).toBeNull();
  expect(el.querySelector('[aria-label="恢复自动剪辑"]')).toBeNull();
  const remove = el.querySelector<HTMLButtonElement>('[aria-label="删除镜头"]')!;
  expect(remove.closest('[data-clip-id]')?.getAttribute('data-clip-id')).toBe('clip');
  expect(el.querySelectorAll('[aria-label="删除镜头"]')).toHaveLength(1);
  await act(async()=>remove.click());
  expect(changes.mock.calls.at(-1)![0].disabledPlacements).toContain('clip');
  expect(el.querySelectorAll('[data-broll-clip]')).toHaveLength(1);
  expect(el.querySelector('[aria-label="删除镜头"]')).toBeNull();



 } finally {await act(async()=>root.unmount());el.remove();pause.mockRestore();vi.unstubAllGlobals();}
});

it('seeks across the timeline and drags the playhead with scroll-aware coordinates without editing clips',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('URL',{createObjectURL:()=> 'blob:qa',revokeObjectURL:vi.fn()});
 const mediaPause=vi.spyOn(HTMLMediaElement.prototype,'pause').mockImplementation(()=>{});
 const onChange=vi.fn();const file=new File(['source'],'source.mp4');
 const el=document.createElement('div');document.body.append(el);const root=createRoot(el);
 const render=async(disabled=false)=>act(async()=>root.render(createElement(BrollTimeline,{task,options:task.options,source:file,locale:'zh',disabled,onChange})));
 const pointer=(type:string,x:number)=>{const event=new MouseEvent(type,{bubbles:true,button:0,clientX:x});Object.defineProperty(event,'pointerId',{value:7});return event;};
 try {
  await render();
  const track=el.querySelector<HTMLElement>('[data-broll-time-track]')!;
  const capture=vi.fn();const release=vi.fn();
  Object.defineProperties(track,{getBoundingClientRect:{value:()=>({left:-100,width:400})},setPointerCapture:{value:capture},releasePointerCapture:{value:release}});
  const head=el.querySelector<HTMLElement>('[aria-label="时间轴播放头"]')!;
  const at=()=>Number(head.getAttribute('aria-valuenow'));
  await act(async()=>track.dispatchEvent(pointer('pointerdown',100)));
  expect(at()).toBe(10);expect(capture).toHaveBeenCalledWith(7);
  await act(async()=>track.dispatchEvent(pointer('pointerup',100)));
  await act(async()=>head.dispatchEvent(pointer('pointerdown',100)));
  await act(async()=>track.dispatchEvent(pointer('pointermove',200)));
  expect(at()).toBe(15);
  await act(async()=>track.dispatchEvent(pointer('pointerup',500)));
  expect(at()).toBe(20);expect(release).toHaveBeenCalledWith(7);
  await act(async()=>track.dispatchEvent(pointer('pointerdown',-150)));
  expect(at()).toBe(0);
  await act(async()=>track.dispatchEvent(pointer('pointercancel',-150)));
  await act(async()=>track.dispatchEvent(pointer('pointermove',200)));
  expect(at()).toBe(0);
  await act(async()=>head.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',shiftKey:true,bubbles:true})));
  expect(at()).toBe(1);
  await render(true);
  await act(async()=>track.dispatchEvent(pointer('pointerdown',100)));
  expect(at()).toBe(1);expect(onChange).not.toHaveBeenCalled();
 } finally {await act(async()=>root.unmount());el.remove();mediaPause.mockRestore();vi.unstubAllGlobals();}
});
