import { Dialog, DialogContent, DialogTitle } from '@pireel/ui/dialog';
import { useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent } from 'react';
import { Play, Pause, Volume2, VolumeX, Plus, Trash2 } from 'lucide-react';
import { resolveBrollEdits, type BrollAsset, type BrollOptions } from '@pireel/studio-engine/broll-task';
import type { CaptionTaskRecord } from './caption-task-store';
import { loadCaptionMedia } from './caption-task-store';
import { captionTaskStyle, type CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import { emptyComposition } from '@pireel/studio-engine/composition';
import { brollRenderComposition } from './broll-render-model';
import type { SupplementalVisualMediaClip } from '@pireel/studio-engine/visual-layer-plan';
import { SceneCanvasPreview, type SceneCanvasHandle } from './scene-canvas-preview';
import { loadFont } from './web-fonts';
import { sceneActionClass } from './scene-action-styles';
const clock = (n: number) => `${Math.floor(n / 60)}:${(n % 60).toFixed(1).padStart(4, '0')}`;
export function BrollTimeline({ task, options, source, renderedUrl, disabled, locale, onChange, actions }: {task:CaptionTaskRecord;options:CaptionTaskOptions;source:File;actions?:ReactNode|((addFootage:ReactNode)=>ReactNode);renderedUrl?:string;disabled:boolean;locale:'zh'|'en';onChange:(value:BrollOptions)=>void}) {
 const zh=locale==='zh';const config=options.broll!;const player=useRef<SceneCanvasHandle>(null);const track=useRef<HTMLDivElement>(null);
 const [addOpen,setAddOpen]=useState(false);const [trimOpen,setTrimOpen]=useState(false);const [ghost,setGhost]=useState<{id:string;start:number;duration:number}|null>(null);
 const [volume,setVolume]=useState(1);
 const [time,setTime]=useState(0);const timeRef=useRef(0);const [playing,setPlaying]=useState(false);const [selected,setSelected]=useState('');const [sourceUrl,setSourceUrl]=useState('');const [urls,setUrls]=useState<Record<string,string>>({});const [assetFiles,setAssetFiles]=useState<Map<string,File>>(new Map());const [error,setError]=useState('');
 const [pending,setPending]=useState<BrollOptions|null>(null);const shown=pending??config;
 const scrubPointer=useRef<number|null>(null);
 const drag=useRef<{id:string;x:number;width:number;mode:'move'|'left'|'right';start:number;duration:number;sourceIn:number;config:BrollOptions;value:BrollOptions;valid:boolean}|null>(null);
 useEffect(()=>{const url=URL.createObjectURL(source);setSourceUrl(url);return()=>URL.revokeObjectURL(url);},[source]);
 const assetKey=JSON.stringify(config.assets.map(a=>[a.id,a.sig]));
 useEffect(()=>{let alive=true;const owned:string[]=[];setUrls({});setAssetFiles(new Map());void Promise.all(config.assets.map(async a=>{const file=await loadCaptionMedia(task.scope,a.sig,a.name);if(!file)throw new Error(`${zh?'无法读取素材':'Media unavailable'}: ${a.name}`);if(!alive)return;const url=URL.createObjectURL(file);owned.push(url);setAssetFiles(v=>new Map(v).set(url,file));setUrls(v=>({...v,[a.id]:url}));})).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;owned.forEach(URL.revokeObjectURL);};},[assetKey,task.scope]);
 const resolved=useMemo(()=>{try{return {clips:resolveBrollEdits(task.broll?.placements??[],task.broll?.candidates??[],shown,task.durationSec),error:''};}catch(e){return {clips:[],error:e instanceof Error?e.message:String(e)};}},[task.broll,shown,task.durationSec]);
 const clips=resolved.clips;const selection=clips.find(p=>p.id===selected);
 const seek=(value:number)=>{const t=Math.max(0,Math.min(task.durationSec,value));timeRef.current=t;setTime(t);player.current?.seek(t);};
 const pause=()=>{player.current?.pause();setPlaying(false);};
 const togglePlay=()=>{if(playing)pause();else player.current?.play();};
 const timeAtPointer=(x:number)=>{const rect=track.current?.getBoundingClientRect();return rect&&rect.width>0?(x-(rect.left??0))/rect.width*task.durationSec:timeRef.current;};
 const scrubStart=(event:PointerEvent<HTMLDivElement>)=>{
  if(disabled||event.button!==0)return;
  event.preventDefault();scrubPointer.current=event.pointerId;pause();setSelected('');seek(timeAtPointer(event.clientX));event.currentTarget.setPointerCapture(event.pointerId);
 };
 const scrubMove=(event:PointerEvent<HTMLDivElement>)=>{if(scrubPointer.current===event.pointerId)seek(timeAtPointer(event.clientX));};
 const scrubEnd=(event:PointerEvent<HTMLDivElement>,cancel=false)=>{
  if(scrubPointer.current!==event.pointerId)return;
  if(!cancel)seek(timeAtPointer(event.clientX));scrubPointer.current=null;event.currentTarget.releasePointerCapture(event.pointerId);
 };

 useEffect(()=>{if(disabled)pause();},[disabled]);
 const live=!renderedUrl||!!pending;
 const [fontRevision,setFontRevision]=useState(0);
 const font=captionTaskStyle(options,task).font;
 useEffect(()=>{let alive=true;if(font)void loadFont(font,(task.transcript??[]).map(s=>s.text).join('')).then(()=>{if(alive)setFontRevision(v=>v+1);}).catch(()=>{});return()=>{alive=false;};},[font,task.transcript]);
 const composition=useMemo(()=>{
  if(live&&sourceUrl)return brollRenderComposition(task,options,sourceUrl);
  const url=live?sourceUrl:renderedUrl!;
  return {...emptyComposition(),width:task.width,height:task.height,video:{url,durationSec:task.durationSec},shots:[{id:'scene-source',src:url,srcStart:0,srcEnd:task.durationSec,treatment:'full' as const}]};
 },[live,renderedUrl,sourceUrl,task.id,task.name,task.sourceSig,task.width,task.height,task.durationSec,task.transcript,options,fontRevision]);
 const visuals=useMemo<SupplementalVisualMediaClip[]>(()=>live?clips.filter(p=>urls[p.asset.id]).map(p=>({clipId:p.id,trackId:'broll',stackOrder:1,kind:p.asset.kind,source:urls[p.asset.id],startSec:p.start,endSec:p.start+p.duration,sourceInSec:p.sourceIn,sourceOutSec:p.sourceIn+p.duration,fit:'cover',muted:true,audioMuted:true})):[],[live,clips,urls]);
 const previewFiles=useMemo(()=>{const files=new Map(assetFiles);files.set(sourceUrl,source);for(const shot of composition.shots??[])if(live&&shot.src)files.set(shot.src,source);return files;},[assetFiles,sourceUrl,source,composition,live]);
 const edit=(id:string,patch:Partial<{start:number;duration:number;sourceIn:number}>,base=config)=>{
  const all=resolveBrollEdits(task.broll?.placements??[],task.broll?.candidates??[],base,task.durationSec);const index=all.findIndex(p=>p.id===id);const p=all[index];if(!p)return base;
  const lower=index?all[index-1].start+all[index-1].duration:0;const upper=index<all.length-1?all[index+1].start:task.durationSec;
  const e={start:p.start,duration:p.duration,sourceIn:p.sourceIn,...patch};
  e.start=patch.start!==undefined&&patch.duration===undefined ? Math.max(0,Math.min(task.durationSec-e.duration,e.start)) : Math.max(lower,Math.min(upper-(patch.duration === undefined ? e.duration : .1),e.start));e.sourceIn=Math.max(0,e.sourceIn);
  e.duration=Math.max(.1,Math.min(e.duration,(patch.start!==undefined&&patch.duration===undefined?task.durationSec:upper)-e.start,p.asset.kind==='video'?p.asset.durationSec-e.sourceIn:Infinity));
  if(p.asset.kind==='video')e.sourceIn=Math.min(e.sourceIn,p.asset.durationSec-e.duration);
  for(const key of ['start','duration','sourceIn'] as const)e[key]=Math.round(e[key]*1000)/1000;
  const value={...base,edits:{...base.edits,[id]:e}};resolveBrollEdits(task.broll?.placements??[],task.broll?.candidates??[],value,task.durationSec);return value;
 };
 const commit=(id:string,patch:Partial<{start:number;duration:number;sourceIn:number}>)=>{try{onChange(edit(id,patch));setError('');}catch(e){setError(e instanceof Error?e.message:String(e));}};
 const down=(event:PointerEvent<HTMLElement>,id:string,mode:'move'|'left'|'right')=>{if(disabled||event.button!==0)return;event.stopPropagation();event.preventDefault();const p=clips.find(p=>p.id===id)!;setSelected(id);pause();seek(mode==='move'?timeAtPointer(event.clientX):p.start);drag.current={id,x:event.clientX,width:track.current!.getBoundingClientRect().width,mode,start:p.start,duration:p.duration,sourceIn:p.sourceIn,config,value:config,valid:true};(event.currentTarget.closest('[data-broll-clip]') as HTMLElement).setPointerCapture(event.pointerId);};
 const move=(event:PointerEvent<HTMLElement>)=>{
  const d=drag.current;if(!d)return;const delta=(event.clientX-d.x)/d.width*task.durationSec;
  try {
    const patch=d.mode==='move'?{start:d.start+delta}:d.mode==='right'?{duration:d.duration+delta}:{start:d.start+delta,duration:d.duration-delta,sourceIn:d.sourceIn+delta};
    d.value=edit(d.id,patch,d.config);d.valid=true;setPending(d.value);setGhost(null);
  }catch{d.valid=false;setPending(null);if(d.mode==='move')setGhost({id:d.id,start:Math.max(0,Math.min(task.durationSec-d.duration,d.start+delta)),duration:d.duration});}
 };
 const finish=(event:PointerEvent<HTMLElement>,cancel=false)=>{const d=drag.current;if(!d)return;drag.current=null;setPending(null);setGhost(null);event.currentTarget.releasePointerCapture?.(event.pointerId);if(!cancel && d.valid && d.value !== d.config){onChange(d.value);const moved=resolveBrollEdits(task.broll?.placements??[],task.broll?.candidates??[],d.value,task.durationSec).find(p=>p.id===d.id);if(moved)seek(moved.start);}};
 const insert=(asset:BrollAsset)=>{
  try {
    let start=timeRef.current;
    for(const p of clips)if(start>=p.start-.001&&start<p.start+p.duration)start=p.start+p.duration;
    const end=clips.find(p=>p.start>start)?.start??task.durationSec;
    const duration=Math.min(3,end-start,asset.kind==='video'?asset.durationSec:Infinity);
    if(duration<.1)throw new Error(zh?'当前位置没有空位，请移动播放位置后添加。':'No room here. Move the playhead before adding footage.');
    const id=`manual-${crypto.randomUUID()}`;
    const next={...config,manualClips:[...(config.manualClips??[]),{id,assetId:asset.id,start,duration,sourceIn:0}]};
    resolveBrollEdits(task.broll?.placements??[],task.broll?.candidates??[],next,task.durationSec);
    onChange(next);setSelected(id);seek(start);setAddOpen(false);setError('');
  }catch(e){setError(e instanceof Error?e.message:String(e));}
 };
 const addFootage=<button type="button" disabled={disabled||!config.assets.length} onClick={()=>{pause();setError('');setAddOpen(true);}} className={sceneActionClass}><Plus size={14}/>{zh?'添加素材':'Add footage'}</button>;
 return <div className="flex h-full min-h-0 flex-col gap-3">
  <div className="flex min-h-0 flex-1 items-center justify-center" style={{containerType:'size'}}>
  <div className="group/player relative overflow-hidden rounded-lg bg-black" style={{aspectRatio:task.width/task.height,width:`min(100cqw, calc(100cqh * ${task.width/task.height}))`}}>
   <SceneCanvasPreview ref={player} composition={composition} visuals={visuals} files={previewFiles} duration={task.durationSec} volume={volume} onTime={value=>{timeRef.current=value;setTime(value);}} onPlaying={setPlaying}/>
   <button type="button" aria-label={zh?'切换播放':'Toggle playback'} disabled={disabled||!!resolved.error} onClick={togglePlay} className="absolute inset-0 z-10 cursor-pointer"/>
   <div data-player-controls className={`absolute inset-x-0 bottom-0 z-20 space-y-1 bg-gradient-to-t from-black/85 to-transparent px-2 pb-2 pt-5 text-white transition-opacity ${playing?'opacity-0 group-hover/player:opacity-100 group-focus-within/player:opacity-100':'opacity-100'}`}>
    <div className="flex items-center gap-1.5 text-[10px]"><button type="button" aria-label={playing?(zh?'暂停':'Pause'):(zh?'播放':'Play')} disabled={disabled||!!resolved.error} onClick={togglePlay} className="shrink-0 rounded p-1">{playing?<Pause size={14}/>:<Play size={14}/>}</button><span className="min-w-0 flex-1 whitespace-nowrap tabular-nums">{clock(time)} / {clock(task.durationSec)}</span>
     <div className="group/volume relative shrink-0"><button type="button" aria-label={volume===0?(zh?'取消静音':'Unmute'):(zh?'静音':'Mute')} onClick={()=>{const next=volume===0?1:0;setVolume(next);}} className="p-1">{volume===0?<VolumeX size={14}/>:<Volume2 size={14}/>}</button><div className="pointer-events-none absolute bottom-full right-0 rounded bg-black/80 p-2 opacity-0 group-hover/volume:pointer-events-auto group-hover/volume:opacity-100 group-focus-within/volume:pointer-events-auto group-focus-within/volume:opacity-100"><input type="range" aria-label={zh?'音量':'Volume'} min={0} max={1} step={.05} value={volume} onChange={e=>{const next=Number(e.target.value);setVolume(next);}} className="block h-2 w-16 accent-white"/></div></div>
    </div>
   </div>
  </div>
  </div>
  <div className="shrink-0">{typeof actions==='function'?actions(addFootage):<div className="flex items-center gap-2">{actions}{addFootage}</div>}</div>
  {(error||resolved.error||ghost)&&<div role="status" className="shrink-0 truncate text-xs text-ink-3">{ghost?(zh?'该位置已被占用':'Position occupied'):error||resolved.error}</div>}
  <Dialog open={addOpen} onOpenChange={setAddOpen}><DialogContent aria-describedby={undefined} className="studio-scope bg-panel border-line sm:max-w-lg"><DialogTitle className="text-ink">{zh?'添加到时间轴':'Add to timeline'}</DialogTitle><div className="grid max-h-[60dvh] grid-cols-3 gap-3 overflow-y-auto">{config.assets.map(asset=><button key={asset.id} type="button" disabled={disabled} onClick={()=>insert(asset)} className="text-ink min-w-0 text-left"><div className="bg-panel-2 aspect-[1.15] overflow-hidden rounded-lg">{urls[asset.id]&&(asset.kind==='image'?<img src={urls[asset.id]} alt="" className="h-full w-full object-cover"/>:<video src={urls[asset.id]} muted playsInline preload="metadata" className="pointer-events-none h-full w-full object-cover" onLoadedMetadata={e=>{e.currentTarget.currentTime=.05;}}/>)}</div><span className="mt-1 block truncate text-xs">{asset.name}</span></button>)}</div>{error&&<p role="alert" className="text-ink text-xs">{error}</p>}</DialogContent></Dialog>
  <div className="shrink-0 overflow-x-auto overflow-y-hidden rounded-md bg-panel p-2" aria-label={zh?'极简时间轴':'Simple timeline'}>
   <div ref={track} data-broll-time-track onPointerDown={scrubStart} onPointerMove={scrubMove} onPointerUp={e=>scrubEnd(e)} onPointerCancel={e=>scrubEnd(e,true)} onLostPointerCapture={()=>{scrubPointer.current=null;}} className="relative touch-none select-none cursor-crosshair" style={{minWidth:Math.max(500,task.durationSec*6)}}>
    <div className="mb-2 flex justify-between text-[10px] text-ink-4">{Array.from({length:9},(_,i)=><span key={i}>{clock(task.durationSec*i/8)}</span>)}</div>
    <div className="relative mb-2 h-7 overflow-hidden rounded bg-panel-2" aria-label={zh?'口播主线':'Narration'}>{(task.transcript??[]).map((s,i)=><button key={i} type="button" title={s.text} disabled={disabled} onClick={e=>{if(e.detail===0){pause();seek(s.start);}}} className="absolute inset-y-0 overflow-hidden truncate border-r border-line px-1 text-left text-[10px] text-ink-3" style={{left:`${s.start/task.durationSec*100}%`,width:`${(s.end-s.start)/task.durationSec*100}%`}}>{s.text}</button>)}</div>
    <div className="relative h-14 rounded bg-panel-2" aria-label="B-roll">
     {clips.map(p=><div key={p.id} data-broll-clip data-clip-id={p.id} role="button" tabIndex={disabled?-1:0} aria-label={`${zh?'镜头':'Clip'} ${p.asset.name} ${clock(p.start)}`} aria-pressed={selected===p.id} onDoubleClick={()=>{setSelected(p.id);setTrimOpen(true);}} onPointerDown={e=>down(e,p.id,'move')} onPointerMove={move} onPointerUp={e=>finish(e)} onPointerCancel={e=>finish(e,true)} onKeyDown={e=>{if(disabled)return;if(e.key==='Enter'){setSelected(p.id);seek(p.start);}if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();commit(p.id,{start:p.start+(e.key === 'ArrowRight' ? .1 : -.1)});}}} className={`absolute inset-y-1 touch-none rounded border-2 bg-panel text-ink ${selected===p.id?'border-ink':'border-ink-4'}`} style={{left:`${p.start/task.durationSec*100}%`,width:`${p.duration/task.durationSec*100}%`,minWidth:12,cursor:'grab'}}>
       {urls[p.asset.id]&&(p.asset.kind==='image'?<img src={urls[p.asset.id]} alt="" className="pointer-events-none absolute h-full w-full rounded object-cover opacity-50"/>:<video src={urls[p.asset.id]} muted preload="metadata" onLoadedMetadata={e=>{e.currentTarget.currentTime=p.sourceIn;}} className="pointer-events-none absolute h-full w-full rounded object-cover opacity-50"/>)}
       <span className="pointer-events-none relative block truncate px-2 py-3 text-[10px] text-white">{p.asset.name}</span>
       {selected===p.id&&<button type="button" aria-label={zh?'删除镜头':'Delete clip'} disabled={disabled} onPointerDown={e=>e.stopPropagation()} onDoubleClick={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();pause();onChange({...config,disabledPlacements:[...(config.disabledPlacements??[]),p.id]});setSelected('');}} className="absolute -right-1 -top-1 z-20 flex size-5 items-center justify-center rounded bg-black/85 text-white hover:bg-black disabled:opacity-40"><Trash2 size={12}/></button>}
       <span role="button" aria-label={zh?'调整片段开头':'Trim start'} onPointerDown={e=>down(e,p.id,'left')} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-white/40"/><span role="button" aria-label={zh?'调整片段结尾':'Trim end'} onPointerDown={e=>down(e,p.id,'right')} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-white/40"/>
     </div>)}
     {ghost&&<div className="pointer-events-none absolute inset-y-1 rounded border-2 border-dashed border-red-400 bg-red-400/20" style={{left:`${ghost.start/task.durationSec*100}%`,width:`${ghost.duration/task.durationSec*100}%`}}/>}
    </div>
    <div role="slider" aria-label={zh?'时间轴播放头':'Timeline playhead'} aria-valuemin={0} aria-valuemax={task.durationSec} aria-valuenow={Number(time.toFixed(2))} aria-valuetext={clock(time)} aria-disabled={disabled} tabIndex={disabled?-1:0} onKeyDown={e=>{
     if(disabled)return;const steps:Record<string,number>={ArrowLeft:-(e.shiftKey?1:1/30),ArrowRight:e.shiftKey?1:1/30,PageDown:5,PageUp:-5};const value=e.key==='Home'?0:e.key==='End'?task.durationSec:e.key in steps?timeRef.current+steps[e.key]:null;
     if(value!==null){e.preventDefault();pause();seek(value);}
    }} className="absolute inset-y-0 z-10 w-3 -translate-x-1/2 cursor-ew-resize rounded-sm outline-none focus-visible:bg-white/15" style={{left:`${time/task.durationSec*100}%`}}>
     <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white"/><div className="pointer-events-none absolute -top-0.5 left-1/2 h-2.5 w-2 -translate-x-1/2 rounded-b-sm bg-white"/>
    </div>
   </div>
  </div>
  <Dialog open={trimOpen&&!!selection} onOpenChange={setTrimOpen}><DialogContent aria-describedby={undefined} className="studio-scope bg-panel border-line sm:max-w-md"><DialogTitle className="text-ink">{zh?'裁剪镜头':'Trim clip'}</DialogTitle>{selection&&<>
   <div className="grid grid-cols-3 gap-2">{([{key:'start',name:zh?'位置（秒）':'Position (s)'},{key:'duration',name:zh?'时长（秒）':'Duration (s)'},...(selection.asset.kind==='video'?[{key:'sourceIn',name:zh?'素材起点（秒）':'Source in (s)'}]:[])] as const).map(field=><label key={field.key} className="text-ink-3 text-[10px]">{field.name}<input key={selection.id+selection[field.key as 'start'|'duration'|'sourceIn']} type="number" disabled={disabled} min={0} step={.1} defaultValue={selection[field.key as 'start'|'duration'|'sourceIn']} onBlur={e=>commit(selection.id,{[field.key]:Number(e.currentTarget.value)})} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}} className="bg-bg text-ink mt-1 w-full rounded border-0 p-2 text-xs"/></label>)}</div>
  </>}</DialogContent></Dialog>
 </div>;
}
