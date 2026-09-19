import { expect, it } from 'vitest';
import { validateBrollPlan } from './broll-task';
const cues = [{ id: 0, start: 1, end: 6, text: 'Open the bag' }, { id: 1, start: 4, end: 9, text: 'Inside' }];
const candidates = [{ id: 'a', assetId: 'asset', start: 10, end: 14, description: 'Opening bag' }, { id: 'b', assetId: 'asset', start: 15, end: 20, description: 'Inside bag' }];
it('uses measured source ranges, caps durations and excludes overlapping placements', () => {
 expect(validateBrollPlan([{cueId:0,candidateId:'a'},{cueId:1,candidateId:'b'}],cues,candidates,20)).toEqual([{id:'broll-0',candidateId:'a',start:1,duration:4}]);
});
it('rejects invented footage and duplicate selection instead of silently placing it', () => {
 expect(() => validateBrollPlan([{cueId:0,candidateId:'missing'}],cues,candidates,20)).toThrow();
 expect(() => validateBrollPlan([{cueId:0,candidateId:'a'},{cueId:1,candidateId:'a'}],cues,candidates,20)).toThrow();
 expect(validateBrollPlan([],cues,candidates,20)).toEqual([]);
});

import { resolveBrollEdits, reorderBrollClips } from './broll-task';
const options = { assets: [{id:'asset',sig:'media',name:'media.mp4',kind:'video' as const,durationSec:30,width:1920,height:1080}], captions:true };
it('applies timeline position and source trims without changing the original plan', () => {
 const plan=[{id:'clip',candidateId:'a',start:1,duration:4}];
 const result=resolveBrollEdits(plan,candidates,{...options,edits:{clip:{start:8,duration:3,sourceIn:20}}},20);
 expect(result[0]).toMatchObject({start:8,duration:3,sourceIn:20}); expect(plan[0].start).toBe(1);
});
it('rejects overlapping edits, nonfinite values and source overflow', () => {
 const plan=[{id:'clip',candidateId:'a',start:1,duration:4},{id:'next',candidateId:'b',start:10,duration:4}];
 expect(()=>resolveBrollEdits(plan,candidates,{...options,edits:{clip:{start:9,duration:3,sourceIn:0}}},20)).toThrow('重叠');
 expect(()=>resolveBrollEdits(plan,candidates,{...options,edits:{clip:{start:1,duration:3,sourceIn:29}}},20)).toThrow('时长');
 expect(()=>resolveBrollEdits(plan,candidates,{...options,edits:{clip:{start:NaN,duration:3,sourceIn:0}}},20)).toThrow();
});

it('reorders finished clips while retaining duration, source trim and total span',()=>{
 const plan=[{id:'first',candidateId:'a',start:1,duration:2},{id:'second',candidateId:'b',start:8,duration:4}];
 const next=reorderBrollClips(plan,candidates,options,20,'second',0);
 const resolved=resolveBrollEdits(plan,candidates,next,20);
 expect(resolved.map(p=>({id:p.id,start:p.start,duration:p.duration,sourceIn:p.sourceIn}))).toEqual([{id:'second',start:1,duration:4,sourceIn:15},{id:'first',start:10,duration:2,sourceIn:10}]);
});
it('adds an uploaded asset directly to the timeline without an AI candidate',()=>{
 const next={...options,manualClips:[{id:'manual-1',assetId:'asset',start:5,duration:3,sourceIn:2}]};
 expect(resolveBrollEdits([],[],next,20)[0]).toMatchObject({id:'manual-1',start:5,duration:3,sourceIn:2});
 expect(()=>resolveBrollEdits([],[],{...next,manualClips:[{...next.manualClips[0],assetId:'foreign'}]},20)).toThrow();
});
