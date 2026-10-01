import { ScenePlayerFrame } from './scene-player-frame';
import { ScenePlayback, sceneClock as clock } from './scene-playback';
import { sfxSoundLabel } from '@pireel/studio-engine/sfx-library';
import { useEffect, useMemo, useRef, useState, type ReactNode, type PointerEvent } from 'react';
import { Play, AudioLines } from 'lucide-react';
import type { AudioClip, EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { audioClipWindow, audioClipDefaults } from '@pireel/studio-engine/audio-tracks';
import { applyDocumentTransaction, type DocumentOp } from '@pireel/studio-engine/document-transaction';
import { loadCaptionMedia, type CaptionTaskRecord } from './caption-task-store';
import { SceneCanvasPreview, type SceneCanvasHandle } from './scene-canvas-preview';
import { sfxPreviewModel } from './sfx-preview-model';
import { sceneActionClass } from './scene-action-styles';
const soundName = (clip: AudioClip, zh: boolean) => clip.label?.startsWith('generated-') ? (zh ? 'AI 音效' : 'AI sound') : sfxSoundLabel((clip.label ?? '').split('--')[0], zh ? 'zh' : 'en') ?? ({ 'soft.wav': zh ? '轻提示' : 'Soft cue', 'pop.wav': zh ? '强调音' : 'Pop', 'whoosh.wav': zh ? '转场音' : 'Whoosh' }[clip.label ?? ''] ?? clip.label ?? (zh ? '音效' : 'Sound'));
export function SfxTimeline({ task, source, locale, disabled, actions, onChange }: {
  task: CaptionTaskRecord; source: File; locale: 'zh' | 'en'; disabled: boolean; actions?: ReactNode;
  onChange: (document: EditorDocumentV2) => void;
}) {
  const zh = locale === 'zh'; const player = useRef<SceneCanvasHandle>(null); const lane = useRef<HTMLDivElement>(null);
  const [media, setMedia] = useState<{ sourceUrl: string; urls: Map<string, string>; files: Map<string, File> } | null>(null);
  const [loadError, setLoadError] = useState(''); const [revision, setRevision] = useState(0);
  const [time, setTime] = useState(0); const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState(''); const [audition, setAudition] = useState<{ id: string; start: number; end: number } | null>(null);
  const [error, setError] = useState(''); const [ghost, setGhost] = useState<number | null>(null);
  const skipClick = useRef(false);
  const drag = useRef<{ id: string; x: number; width: number; start: number; duration: number } | null>(null);
  const ids = new Set(task.document?.timeline.tracks.flatMap(track => track.clips.flatMap(clip => 'assetId' in clip ? [clip.assetId] : [])) ?? []);
  const assetKey = JSON.stringify(Object.values(task.document?.assets ?? {}).filter(asset => ids.has(asset.id)).map(asset => [asset.id, asset.locator.localSig, asset.locator.remoteUrl]));
  useEffect(() => {
    let alive = true; const owned: string[] = []; setMedia(null); setLoadError('');
    void (async () => {
      const sourceUrl = URL.createObjectURL(source); owned.push(sourceUrl); const urls = new Map<string, string>(); const files = new Map([[sourceUrl, source]]);
      for (const asset of Object.values(task.document?.assets ?? {})) {
        if (!ids.has(asset.id) || asset.locator.localSig === task.sourceSig) continue;
        if (!asset.locator.localSig) throw new Error(zh ? '音效文件缺少本地或云端标识。' : 'The sound has no stored media reference.');
        const file = await loadCaptionMedia(task.scope, asset.locator.localSig, asset.label);
        if (!alive) return;
        if (!file) throw new Error(`${zh ? '音效文件无法读取' : 'Sound unavailable'}: ${asset.label ?? asset.id}`);
        const url = URL.createObjectURL(file); owned.push(url); urls.set(asset.locator.localSig, url); files.set(url, file);
      }
      if (alive) setMedia({ sourceUrl, urls, files });
    })().catch(reason => { if (alive) setLoadError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { alive = false; owned.forEach(url => URL.revokeObjectURL(url)); };
  }, [source, task.sourceSig, task.scope, assetKey, revision]);
  useEffect(() => { setSelected(''); }, [task.generationId]);
  useEffect(() => { if (disabled) { player.current?.pause(); setAudition(null); } }, [disabled]);
  const model = useMemo(() => media ? sfxPreviewModel(task, media.sourceUrl, media.urls) : null, [task.document, task.sourceSig, task.durationSec, task.options, media]);
  const clips = (model?.composition.audioTracks ?? []).filter(clip => clip.role === 'sfx');
  const selectedClip = clips.find(clip => clip.id === selected);
  const unavailable = disabled || !model || !!loadError;
  const seek = (value: number) => { const next = Math.max(0, Math.min(task.durationSec, value)); player.current?.seek(next); setTime(next); };
  const pause = () => { player.current?.pause(); setPlaying(false); setAudition(null); };
  const edit = (op: DocumentOp) => {
    if (!model || unavailable) return;
    pause(); const result = applyDocumentTransaction(model.document, { ops: [op] }, { projectId: task.id });
    if (!result.ok) { setError(result.error.message); return; }
    setError(''); onChange(result.document);
  };
  const patch = (clip: AudioClip, value: { startSec?: number; volumeDb?: number }) => edit({ op: 'audio.patch', input: { updates: [{ clipId: clip.id, patch: value }] } });
  useEffect(() => {
    if (!audition || unavailable) return;
    seek(Math.max(0, audition.start - .1)); player.current?.play();
  }, [audition, unavailable]);
  const listen = (clip: AudioClip) => { pause(); setSelected(clip.id); setAudition({ id: clip.id, ...audioClipWindow(clip, task.durationSec) }); };
  const down = (event: PointerEvent<HTMLButtonElement>, clip: AudioClip) => {
    if (unavailable || event.button !== 0) return; skipClick.current = false; event.preventDefault(); pause(); setSelected(clip.id);
    const window = audioClipWindow(clip, task.durationSec); seek(window.start);
    drag.current = { id: clip.id, x: event.clientX, width: lane.current!.getBoundingClientRect().width, start: window.start, duration: window.end - window.start }; event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => { const value = drag.current; if (value) setGhost(Math.max(0, Math.min(task.durationSec - value.duration, value.start + (event.clientX - value.x) / value.width * task.durationSec))); };
  const finish = (event: PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const value = drag.current; drag.current = null; setGhost(null); event.currentTarget.releasePointerCapture?.(event.pointerId);
    const clip = clips.find(clip => clip.id === value?.id);
    if (!cancelled && value && clip && ghost !== null && Math.abs(event.clientX - value.x) >= 3 && Math.abs(ghost - value.start) > .01) { skipClick.current = true; const fps = model?.document.canvas.fps ?? 30; const target = Math.round(ghost * fps) / fps; patch(clip, { startSec: target }); seek(target); }
  };
  return <div className="flex h-full min-h-0 flex-col gap-3" aria-label={zh ? '音效时间轴预览' : 'Sound timeline preview'}>
    <ScenePlayerFrame width={task.width} height={task.height} disabled={unavailable} onToggle={() => playing ? pause() : player.current?.play()}
      status={<>{!media && <p role="status" className="text-ink-3 absolute text-xs">{loadError || (zh ? '加载原片与音效…' : 'Loading source and sounds…')}{loadError && <button onClick={() => setRevision(value => value + 1)} className="ml-2 underline">{zh ? '重试加载' : 'Retry'}</button>}</p>}</>}>
        {model && media && <SceneCanvasPreview composition={model.composition} visuals={model.visuals} files={media.files} duration={task.durationSec} volume={1} sourceVolume={audition ? 0 : 1} onPlaying={setPlaying} onTime={value => { setTime(value); if (audition && value >= audition.end + .1) pause(); }} ref={player}/>}
    </ScenePlayerFrame>
    <ScenePlayback playing={playing} onToggle={() => playing ? pause() : player.current?.play()} time={time} duration={task.durationSec} disabled={unavailable} locale={locale} fps={model?.document.canvas.fps ?? 30} onPause={pause} onSeek={seek} actions={actions} timelineRef={lane}
      header={<><span className="text-ink-3">{zh ? `音效 · ${clips.length} 处` : `${clips.length} sounds`}</span>
        <button className={sceneActionClass} disabled={unavailable || !selectedClip} onClick={() => selectedClip && listen(selectedClip)}><Play size={12}/>{zh ? '试听选中音效' : 'Audition selected'}</button>
      </>}
      footer={<>
        {selectedClip && <div className="flex flex-wrap items-center gap-3 text-xs"><span>{soundName(selectedClip, zh)} · {clock(audioClipWindow(selectedClip, task.durationSec).start)}</span>
          <label className="text-ink-3 flex items-center gap-2">{zh ? '音量' : 'Volume'}<input aria-label={zh ? '选中音效音量' : 'Selected sound volume'} type="range" min={-30} max={6} step={1} value={audioClipDefaults(selectedClip).volumeDb} disabled={unavailable} onChange={event => patch(selectedClip, { volumeDb: Number(event.target.value) })}/>{audioClipDefaults(selectedClip).volumeDb} dB</label>
        </div>}
        {!clips.length && <p className="text-ink-3 text-xs">{task.document ? (zh ? '本次未添加音效，原声已保留。' : 'No sounds were added. Original audio is preserved.') : (zh ? '生成后，音效会显示在这条轨道上。' : 'Generated sounds will appear on this track.')}</p>}
        {error && <p role="alert" className="text-ink-3 mt-2 text-xs">{error}</p>}
      </>}>
        <div className="bg-panel-2 relative h-12 rounded" aria-label={zh ? '音效轨道' : 'Sound track'}>{clips.map(clip => { const window = audioClipWindow(clip, task.durationSec); const start = drag.current?.id === clip.id && ghost !== null ? ghost : window.start;
          return <button data-scene-clip key={clip.id} type="button" disabled={unavailable} aria-label={`${soundName(clip, zh)} ${clock(start)}`} aria-pressed={selected === clip.id} title={`${soundName(clip, zh)} · ${clock(start)} · ${audioClipDefaults(clip).volumeDb} dB`} onClick={() => { if (skipClick.current) { skipClick.current = false; return; } setSelected(clip.id); seek(window.start); }} onPointerDown={event => down(event, clip)} onPointerMove={move} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)} onLostPointerCapture={event => { if (drag.current) finish(event, true); }} onDoubleClick={() => listen(clip)} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); patch(clip, { startSec: Math.max(0, Math.min(task.durationSec - (window.end - window.start), window.start + (event.key === 'ArrowRight' ? .1 : -.1))) }); } }} className={'absolute inset-y-1 flex min-w-3 touch-none items-center justify-center rounded border-2 bg-panel ' + (selected === clip.id ? 'border-ink text-ink' : 'border-ink-4 text-ink-3') + (clip.muted ? ' opacity-40' : '')} style={{ left: `${start / task.durationSec * 100}%`, width: `${(window.end - window.start) / task.durationSec * 100}%` }}><AudioLines size={12}/></button>;
        })}</div>
    </ScenePlayback>
  </div>;
}
