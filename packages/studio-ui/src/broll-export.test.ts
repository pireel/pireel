import { expect, it, vi } from 'vitest';
import { exportBrollEdit } from './broll-export';
import type { CaptionTaskRecord } from './caption-task-store';
const mocks=vi.hoisted(()=>({render:vi.fn(),media:vi.fn()}));
vi.mock('./client-export',()=>({clientExportVideo:mocks.render}));
vi.mock('./caption-task-store',()=>({loadCaptionMedia:mocks.media}));
vi.mock('./web-fonts',()=>({loadFont:async()=>{}}));
it('exports the current clip edits locally with narration intact and no AI calls',async()=>{
 const source=new File(['source'],'source.mp4');const footage=new File(['footage'],'footage.mp4');
 const task:CaptionTaskRecord={id:'p',scope:'owner',name:'source.mp4',sourceSig:'source',width:640,height:360,durationSec:10,scene:'broll',stage:'completed',updatedAt:1,options:{presetId:'clean',aspect:'original',shortenPauses:false,broll:{captions:false,assets:[{id:'a',sig:'footage',name:'footage.mp4',kind:'video',durationSec:8,width:640,height:360}],edits:{clip:{start:4,duration:2,sourceIn:3}}}},broll:{analysisKey:'a',planKey:'plan',candidates:[{id:'candidate',assetId:'a',start:0,end:5,description:'footage'}],placements:[{id:'clip',candidateId:'candidate',start:1,duration:3}]}};
 const revoke=vi.fn();let next=0;vi.stubGlobal('URL',{createObjectURL:()=>`blob:${++next}`,revokeObjectURL:revoke});
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);mocks.media.mockResolvedValue(footage);const result=new Blob(['mp4']);mocks.render.mockResolvedValue(result);
 try {
  const before=JSON.stringify(task);const progress=vi.fn();const signal=new AbortController().signal;
  expect(await exportBrollEdit(task,task.options,source,{signal,onProgress:progress})).toBe(result);
  expect(fetch).not.toHaveBeenCalled();expect(JSON.stringify(task)).toBe(before);
  const input=mocks.render.mock.calls[0][0];expect(input.videoFile).toBe(source);
  expect(input.comp.shots[0]).toMatchObject({srcStart:0,srcEnd:10});
  expect(input.visualMediaClips[0]).toMatchObject({startSec:4,endSec:6,sourceInSec:3,sourceOutSec:5,muted:true,audioMuted:true});
  expect(revoke).toHaveBeenCalledTimes(2);
  input.onProgress(25,100);expect(progress).toHaveBeenCalledWith(.25);
  const controller=new AbortController();controller.abort();
  await expect(exportBrollEdit(task,task.options,source,{signal:controller.signal,onProgress:progress})).rejects.toThrow();
  expect(mocks.render).toHaveBeenCalledTimes(1);
 } finally {vi.unstubAllGlobals();}
});

it('exports the same PiP panels and presenter crop used in the live render model without paid requests', async () => {
  mocks.render.mockClear(); mocks.media.mockResolvedValue(new File(['footage'], 'footage.mp4'));
  mocks.render.mockResolvedValue(new Blob(['mp4']));
  const source = new File(['source'], 'source.mp4');
  const task: CaptionTaskRecord = { id: 'pip', scene: 'pip', scope: 'owner', name: 'source.mp4', sourceSig: 'source', width: 1080, height: 1920, durationSec: 12, stage: 'completed', updatedAt: 1,
    options: { presetId: 'clean', aspect: 'original', shortenPauses: false, broll: { captions: false, pip: { template: 'split' }, assets: [{ id: 'a', sig: 'footage', name: 'product.mp4', kind: 'video', durationSec: 8, width: 1920, height: 1080 }] } },
    broll: { analysisKey: 'a', planKey: 'plan', candidates: [{ id: 'c', assetId: 'a', start: 1, end: 5, description: 'product' }], placements: [{ id: 'clip', candidateId: 'c', start: 2, duration: 3 }] },
  };
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  try {
    await exportBrollEdit(task, task.options, source, { signal: new AbortController().signal, onProgress: () => {} });
    expect(fetch).not.toHaveBeenCalled();
    const input = mocks.render.mock.calls[0][0];
    const { pipRenderModel } = await import('./pip-render-model');
    const presenter = input.visualMediaClips.find((clip: { trackId: string }) => clip.trackId === 'broll-pip-presenter');
    const media = input.visualMediaClips.find((clip: { trackId: string }) => clip.trackId === 'broll');
    const preview = pipRenderModel(task, task.options, presenter.source, new Map([['footage', media.source]]));
    expect(input.visualMediaClips).toEqual(preview.visuals);
    expect(presenter).toMatchObject({ startSec: 2, endSec: 5, sourceInSec: 2, sourceOutSec: 5, audioMuted: true, fit: 'cover', anchorY: .4 });
    expect(input.comp.shots[0]).toMatchObject({ srcStart: 0, srcEnd: 12 });
  } finally { vi.unstubAllGlobals(); }
});
