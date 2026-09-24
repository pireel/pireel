import { describe, expect, it, vi } from 'vitest';
import { buildCaptionTaskDocument } from '@pireel/studio-engine/caption-task';
import { groupAsrWords } from '@pireel/studio-engine/caption-fx';
import { projectDocumentToComposition } from '@pireel/studio-engine/composition';
import { applyDocumentTransaction } from '@pireel/studio-engine/document-transaction';
import { deriveCaptionLineRows } from './caption-line-rows';
import { captionTranslationSources } from './caption-transcript-bridge';
import { sentenceTranslationUnits } from './caption-translation-transaction';
import { captionTranslationKey, captionTranslationOps, translateCaptionUnits } from './caption-translation-operation';
import { translateCaptionTask } from './caption-task-translation';
import type { CaptionTaskRecord } from './caption-task-store';

function fixture() {
  const text='用 GPT-4o 把成本从 3.5万元降到 800元。这是第二句话，需要完整保留上下文。';
  const chars=[...text].filter(char=>char.trim());
  const words=groupAsrWords(text,chars.map((text,index)=>({text,start:index*.12,end:(index+1)*.12})));
  const task:CaptionTaskRecord={id:'shared-caption',scope:'owner',name:'speech.mp4',sourceSig:'source',width:1080,height:1920,durationSec:10,stage:'ready',updatedAt:1,
    transcript:[{text,start:0,end:chars.length*.12,words}],options:{presetId:'clean',aspect:'original',shortenPauses:false,translationLanguage:'English',custom:{wPct:35}}};
  const document=buildCaptionTaskDocument({...task,projectId:task.id,sourceUrl:'blob:source',transcript:task.transcript!});
  return {task,document,words};
}
const service = () => vi.fn(async(rows:{index:number;text:string}[])=>rows.map(row=>({index:row.index,text:`Translated sentence ${row.index+1}`})));

describe('shared Studio and standalone subtitle processing',()=>{
 it('uses the same protected words, phrase boundaries, requests and writeback in both entry points',async()=>{
  const {task,document,words}=fixture();
  expect(words.map(word=>word.text)).toContain('GPT-4o');expect(words.map(word=>word.text)).toContain('3.5万元');
  const composition=projectDocumentToComposition(document);
  const sources=captionTranslationSources(document,composition,null,{});
  const rows=deriveCaptionLineRows(document,composition,sources.main,sources.clips);
  const units=sentenceTranslationUnits(rows);expect(units).toHaveLength(1);expect(rows.length).toBeGreaterThan(1);
  const studioService=service();const standaloneService=service();
  const writes=await translateCaptionUnits(units,'English',studioService);
  const studio=applyDocumentTransaction(document,{ops:captionTranslationOps(composition,writes.writes,'English')},{projectId:task.id});
  if(!studio.ok)throw new Error(studio.error.message);
  const standalone=await translateCaptionTask(task,document,standaloneService,()=>{});
  expect(standaloneService.mock.calls).toEqual(studioService.mock.calls);
  expect(standalone.document.semantics.transcripts).toEqual(studio.document.semantics.transcripts);
  expect(deriveCaptionLineRows(standalone.document,projectDocumentToComposition(standalone.document),null,{}).map(row=>[row.w0,row.w1,row.sub]))
    .toEqual(deriveCaptionLineRows(studio.document,projectDocumentToComposition(studio.document),null,{}).map(row=>[row.w0,row.w1,row.sub]));
  expect(standalone.transcript[0].words).toEqual(words);
 });
 it('refuses a run where nothing came back and does not clear an existing translation',async()=>{
  const {task,document}=fixture();const previous=await translateCaptionTask(task,document,service(),()=>{});
  const snapshot=structuredClone(previous.document);
  await expect(translateCaptionTask({...task,...previous,options:{...task.options,translationLanguage:'日本語'}},previous.document,async()=>[{index:0,text:'  '}],()=>{})).rejects.toThrow('没有返回任何结果');
  expect(previous.document).toEqual(snapshot);
 });
 it('invalidates changed cue boundaries and legacy caches, but ignores temporary source URLs',async()=>{
  const {task,document}=fixture();const translate=service();const result=await translateCaptionTask(task,document,translate,()=>{});
  await translateCaptionTask({...task,...result},result.document,translate,()=>{});expect(translate).toHaveBeenCalledOnce();
  await translateCaptionTask({...task,...result,translation:{language:'English',sourceKey:'legacy-sentence-cache'}},result.document,translate,()=>{});expect(translate).toHaveBeenCalledTimes(2);
  const row={assetId:'asset',src:'blob:one',seg:0,start:0,text:'first second',range:{w0:0,w1:3}};
  expect(captionTranslationKey([row])).toBe(captionTranslationKey([{...row,src:'blob:two',start:10}]));
  expect(captionTranslationKey([row])).not.toBe(captionTranslationKey([{...row,range:{w0:1,w1:3}}]));
 });
});
