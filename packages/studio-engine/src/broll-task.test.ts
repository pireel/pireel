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

it('passes only contract fields of saved assets into the workflow', async () => {
  const { brollWorkflowDefinition } = await import('./workflow-broll-template');
  const { assertWorkflowValue } = await import('./workflow-schema');
  const { brollAssetSchema } = await import('./workflow-node-contracts');
  const asset = { id: 'a', sig: 's', name: 'clip.mp4', kind: 'video' as const, durationSec: 12, width: 720, height: 1280, hasAudio: false };
  const definition = brollWorkflowDefinition({ caption: {}, aspect: 'original', shortenPauses: false, broll: { assets: [asset as never], captions: true } }, null, null, 'p', 40, null);
  const analysis = definition.steps.find(step => step.id === 'analysis')!;
  const assets = (analysis.arguments.assets as { value: unknown[] }).value;
  expect(assets).toEqual([{ id: 'a', sig: 's', name: 'clip.mp4', kind: 'video', durationSec: 12, width: 720, height: 1280 }]);
  for (const item of assets) expect(() => assertWorkflowValue(item, brollAssetSchema)).not.toThrow();
});

it('plans AI stills together with your footage in one pass, and needs at least one source', async () => {
  const { brollWorkflowDefinition } = await import('./workflow-broll-template');
  const base = { caption: {}, aspect: 'original' as const, shortenPauses: false };
  const asset = { id: 'a', sig: 's', name: 'clip.mp4', kind: 'video' as const, durationSec: 12, width: 720, height: 1280 };
  const ids = (broll: object) => brollWorkflowDefinition({ ...base, broll: broll as never }, null, null, 'p', 40, null).steps.map(step => step.id);
  expect(ids({ assets: [], captions: true, aiFootage: true })).toEqual(expect.arrayContaining(['generated', 'broll']));
  expect(ids({ assets: [], captions: true, aiFootage: true })).not.toContain('analysis');
  expect(ids({ assets: [asset], captions: true, aiFootage: true })).toEqual(expect.arrayContaining(['analysis', 'generated', 'broll']));
  expect(ids({ assets: [asset], captions: true, aiFootage: true })).not.toContain('match');
  expect(ids({ assets: [asset], captions: true })).toEqual(expect.arrayContaining(['analysis', 'match', 'broll']));
  const both = brollWorkflowDefinition({ ...base, broll: { assets: [asset], captions: true, aiFootage: true } }, null, null, 'p', 40, null).steps;
  expect(both.find(step => step.id === 'generated')!.arguments.analysis).toEqual({ kind: 'step', stepId: 'analysis', key: 'analysis' });
  expect(ids({ assets: [asset], captions: true, aiFootage: true, localFootage: false })).not.toContain('analysis');
  expect(() => ids({ assets: [], captions: true })).toThrow();
  const compose = brollWorkflowDefinition({ ...base, broll: { assets: [], captions: true, aiFootage: true } }, null, null, 'p', 40, null).steps.find(step => step.id === 'broll')!;
  expect(Object.keys(compose.arguments)).toEqual(expect.arrayContaining(['generated', 'document', 'options']));
  expect(compose.arguments.plan).toBeUndefined();
});

it('resolves a shot whose footage travels with its candidate (AI stills)', async () => {
  const { resolveBrollEdits } = await import('./broll-task');
  const asset = { id: 'ai-1', sig: 'still', name: 'AI 1', kind: 'image' as const, durationSec: 5, width: 1024, height: 1536 };
  const clips = resolveBrollEdits([{ id: 'broll-0-2', candidateId: 'ai-1-0', start: 2, duration: 4 }], [{ id: 'ai-1-0', assetId: 'ai-1', start: 0, end: 5, description: 'a gift box', asset }], { assets: [], captions: true }, 40);
  expect(clips[0]).toMatchObject({ start: 2, duration: 4, asset });
});

it('starts a shot on the word it illustrates and lets it run past a short sentence', async () => {
  const { brollCues, brollPlacementAnchor } = await import('./broll-task');
  const cues = brollCues([{ start: 52, end: 52.9, text: '一包咖啡。', words: [{ start: 52, text: '一' }, { start: 52.1, text: '包' }, { start: 52.5, text: '咖' }, { start: 52.6, text: '啡' }] }, { start: 57.3, end: 58.8, text: '还有一个跳绳。' }], 120);
  expect(cues).toHaveLength(2); expect(cues[0].anchors?.[2]).toMatchObject({ id: 2, start: 52.5 });
  const candidates = [{ id: 'coffee-0', assetId: 'coffee', start: 0, end: 5, description: 'two cups' }];
  const [shot] = validateBrollPlan([{ cueId: 0, wordId: 2, candidateId: 'coffee-0' }], cues, candidates, 120);
  expect(shot).toEqual({ id: 'broll-0-2', candidateId: 'coffee-0', start: 52.5, duration: 5 });
  expect(brollPlacementAnchor(shot.id)).toEqual({ cueId: 0, wordId: 2 });
  expect(() => validateBrollPlan([{ cueId: 0, wordId: 9, candidateId: 'coffee-0' }], cues, candidates, 120)).toThrow('词位');
});

it('gives every file a shot when the plan left some out, taking over a still only when no spot is free', async () => {
  const { placeEveryFile } = await import('./broll-task');
  const cues = [
    { id: 0, start: 0, end: 10, text: 'a', anchors: [{ id: 0, start: 0, text: 'a' }, { id: 1, start: 6, text: 'b' }] },
    { id: 1, start: 12, end: 30, text: 'c', anchors: [{ id: 0, start: 12, text: 'c' }, { id: 1, start: 22, text: 'd' }] },
  ];
  const candidates = [{ id: 'a-0', assetId: 'a', start: 0, end: 5, description: '' }, { id: 'b-0', assetId: 'b', start: 0, end: 3, description: '' }, { id: 'b-1', assetId: 'b', start: 3, end: 8, description: '' }];
  const plan = [{ id: 'broll-0-0', candidateId: 'a-0', start: 0, duration: 5 }];
  // File b goes to the free spot farthest from the existing shot, using its longest shot.
  expect(placeEveryFile(plan, cues, candidates, 30)).toEqual([...plan, { id: 'broll-1-1', candidateId: 'b-1', start: 22, duration: 5 }]);
  // With no room left, a still gives up its place to the file.
  const tight = [...plan, { id: 'broll-0-1', candidateId: 'still-0', start: 6, duration: 4 }];
  expect(placeEveryFile(tight, cues.slice(0, 1), candidates, 12, p => p.candidateId.startsWith('still-'))).toEqual([plan[0], { id: 'broll-0-1', candidateId: 'b-1', start: 6, duration: 4 }]);
  // Files already in the plan are left alone.
  expect(placeEveryFile([...plan, { id: 'broll-1-0', candidateId: 'b-0', start: 12, duration: 3 }], cues, candidates, 30)).toHaveLength(2);
});
