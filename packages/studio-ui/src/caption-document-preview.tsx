import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { imageThumb } from '@pireel/ui/image-url';
import { editorDocumentRenderPlan, projectDocumentToComposition } from '@pireel/studio-engine/composition';
import { ScenePlayerFrame } from './scene-player-frame';
import { ScenePlayback } from './scene-playback';
import { SceneCanvasPreview, type SceneCanvasHandle } from './scene-canvas-preview';
import { compositionRenderView } from './composition-render-view';
import { supplementalVisualMedia } from './visual-render-plan';
import { loadCaptionMedia, type CaptionTaskRecord } from './caption-task-store';

/**
 * Plays a generated caption document live over its source — what the download will render, without
 * rendering it. Assets beyond the source (brand logo, intro, outro) come from the media vault or
 * their cloud key.
 */
export function CaptionDocumentPreview({ task, source, locale, disabled, actions }: {
  task: CaptionTaskRecord; source: File; locale: 'zh' | 'en'; disabled: boolean; actions?: ReactNode;
}) {
  const zh = locale === 'zh';
  const player = useRef<SceneCanvasHandle>(null);
  const [media, setMedia] = useState<{ sourceUrl: string; urls: Map<string, string>; files: Map<string, File> } | null>(null);
  const [loadError, setLoadError] = useState('');
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const document = task.document;
  const assetKey = JSON.stringify(Object.values(document?.assets ?? {}).map(asset => [asset.id, asset.locator.localSig, asset.locator.cloudKey]));
  useEffect(() => {
    let alive = true; const owned: string[] = []; setMedia(null); setLoadError('');
    void (async () => {
      const sourceUrl = URL.createObjectURL(source); owned.push(sourceUrl);
      const urls = new Map<string, string>(); const files = new Map([[sourceUrl, source]]);
      for (const asset of Object.values(document?.assets ?? {})) {
        const sig = asset.locator.localSig;
        if (!sig || sig === task.sourceSig) continue;
        const file = await loadCaptionMedia(task.scope, sig, asset.label);
        if (!alive) return;
        if (!file) throw new Error(`${zh ? '素材无法读取' : 'Media unavailable'}: ${asset.label ?? asset.id}`);
        const url = URL.createObjectURL(file); owned.push(url); urls.set(sig, url); files.set(url, file);
      }
      if (alive) setMedia({ sourceUrl, urls, files });
    })().catch(reason => { if (alive) setLoadError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { alive = false; owned.forEach(url => URL.revokeObjectURL(url)); };
  }, [source, task.sourceSig, task.scope, assetKey]);
  const model = useMemo(() => {
    if (!media || !document) return null;
    const resolveAssetUrl = (asset: { locator: { localSig?: string; cloudKey?: string; remoteUrl?: string } }) =>
      asset.locator.localSig === task.sourceSig ? media.sourceUrl
        : urls(asset.locator.localSig) ?? asset.locator.remoteUrl ?? (asset.locator.cloudKey ? imageThumb(asset.locator.cloudKey, 'original') : undefined);
    const urls = (sig?: string) => (sig ? media.urls.get(sig) : undefined);
    const plan = editorDocumentRenderPlan(document, { resolveAssetUrl });
    return { composition: compositionRenderView(projectDocumentToComposition(document, { resolveAssetUrl }), plan), visuals: supplementalVisualMedia(plan), fps: document.canvas.fps };
  }, [document, media, task.sourceSig]);
  const unavailable = disabled || !model || !!loadError;
  const pause = () => { player.current?.pause(); setPlaying(false); };
  const seek = (value: number) => { const next = Math.max(0, Math.min(task.durationSec, value)); player.current?.seek(next); setTime(next); };
  useEffect(() => { if (disabled) pause(); }, [disabled]);
  return <div className="flex h-full min-h-0 flex-col gap-3" aria-label={zh ? '字幕效果预览' : 'Caption preview'}>
    <ScenePlayerFrame width={task.width} height={task.height} disabled={unavailable} onToggle={() => playing ? pause() : player.current?.play()}
      status={!model && <p role="status" className="text-ink-3 absolute text-xs">{loadError || (zh ? '加载预览…' : 'Loading preview…')}</p>}>
      {model && media && <SceneCanvasPreview ref={player} composition={model.composition} visuals={model.visuals} files={media.files} duration={task.durationSec} volume={1} onPlaying={setPlaying} onTime={setTime} />}
    </ScenePlayerFrame>
    <ScenePlayback playing={playing} onToggle={() => playing ? pause() : player.current?.play()} time={time} duration={task.durationSec} disabled={unavailable} locale={locale} fps={model?.fps ?? 30} onPause={pause} onSeek={seek} actions={actions} />
  </div>;
}
