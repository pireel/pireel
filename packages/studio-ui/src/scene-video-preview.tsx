import { ScenePlayerFrame } from './scene-player-frame';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ScenePlayback } from './scene-playback';
import { BACKDROP_DIM, BACKDROP_SAMPLE_WIDTH } from '@pireel/studio-engine/source-framing';
import { t } from './i18n';

/** The picture's own blurred, dimmed copy behind it, sampled small like the render's backdrop. */
function BlurredBackdrop({ video, poster }: { video: HTMLVideoElement | null; poster?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const target = canvas.current; const g = target?.getContext('2d');
    if (!target || !g) return;
    const paint = (image: CanvasImageSource, width: number, height: number) => {
      if (!(width > 0 && height > 0)) return;
      const box = target.getBoundingClientRect();
      target.width = BACKDROP_SAMPLE_WIDTH; target.height = Math.max(2, Math.round(BACKDROP_SAMPLE_WIDTH * box.height / Math.max(1, box.width)));
      const k = Math.max(target.width / width, target.height / height);
      g.drawImage(image, (target.width - width * k) / 2, (target.height - height * k) / 2, width * k, height * k);
    };
    let frame = 0;
    const fromVideo = () => { if (video && video.readyState >= 2) paint(video, video.videoWidth, video.videoHeight); };
    const loop = () => { fromVideo(); frame = requestAnimationFrame(loop); };
    if (video) {
      const play = () => { cancelAnimationFrame(frame); loop(); };
      const stop = () => { cancelAnimationFrame(frame); fromVideo(); };
      video.addEventListener('loadeddata', fromVideo); video.addEventListener('seeked', fromVideo);
      video.addEventListener('play', play); video.addEventListener('pause', stop);
      fromVideo();
      return () => { cancelAnimationFrame(frame); video.removeEventListener('loadeddata', fromVideo); video.removeEventListener('seeked', fromVideo); video.removeEventListener('play', play); video.removeEventListener('pause', stop); };
    }
    if (!poster) return;
    const image = new Image(); image.onload = () => paint(image, image.naturalWidth, image.naturalHeight); image.src = poster;
  }, [video, poster]);
  return <canvas ref={canvas} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" style={{ filter: `blur(18px) brightness(${1 - BACKDROP_DIM})`, transform: 'scale(1.15)' }} />;
}

/** Adapter for regular source/result videos. Canvas scenes use the same ScenePlayerFrame and ScenePlayback.
 *  `backdrop`: the frame has another shape than the picture; fill the bands with its blurred copy. */
export function SceneVideoPreview({ source, resultUrl, poster, width, height, duration, disabled, actions, backdrop, children }: {
  source: File | null; resultUrl?: string; poster?: string; width: number; height: number; duration: number;
  disabled: boolean; actions?: ReactNode; backdrop?: boolean; children?: ReactNode;
}) {
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null);
  const video = useRef<HTMLVideoElement>(null); const [sourceUrl, setSourceUrl] = useState('');
  const [time, setTime] = useState(0); const [playing, setPlaying] = useState(false); const [error, setError] = useState('');
  const src = resultUrl || sourceUrl;
  const attachVideo = useCallback((element: HTMLVideoElement | null) => { if (!element) video.current?.pause(); video.current = element; setVideoElement(element); }, []);
  useEffect(() => { if (!source) { setSourceUrl(''); return; } const url = URL.createObjectURL(source); setSourceUrl(url); return () => URL.revokeObjectURL(url); }, [source]);
  useEffect(() => { video.current?.pause(); if (video.current) video.current.currentTime = 0; setTime(0); setPlaying(false); setError(''); }, [src]);
  useEffect(() => { if (disabled) video.current?.pause(); }, [disabled]);
  const pause = () => { video.current?.pause(); setPlaying(false); };
  const toggle = async () => {
    if (!video.current || disabled) return;
    if (!video.current.paused) { pause(); return; }
    if (video.current.ended || video.current.currentTime >= duration) video.current.currentTime = 0;
    const element = video.current; const current = src;
    try { await element.play(); if (element.getAttribute('src') === current) setError(''); } catch { if (element.getAttribute('src') === current) setError(t('ui.sceneVideoPreview.couldNotPlayTry')); }
  };
  return <div className="flex h-full min-h-0 flex-col gap-3">
    <ScenePlayerFrame width={width} height={height} disabled={disabled || !src} onToggle={() => void toggle()}>
        {backdrop && !resultUrl && <BlurredBackdrop video={src ? videoElement : null} poster={poster} />}
        {src ? <video data-scene-video ref={attachVideo} src={src} poster={poster} playsInline className="relative h-full w-full object-contain" onTimeUpdate={event => setTime(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setTime(duration); }}/> : poster ? <img src={poster} alt={t('ui.sceneVideoPreview.firstVideoFrame')} className="relative h-full w-full object-contain"/> : <div className="bg-panel h-full w-full"/>}
        {children}
    </ScenePlayerFrame>
    {error && <p role="alert" className="text-ink-3 text-xs">{error}</p>}
    <ScenePlayback playing={playing} onToggle={() => void toggle()} time={time} duration={duration} disabled={disabled || !src} onPause={pause} onSeek={value => { if (video.current) video.current.currentTime = value; setTime(value); }} actions={actions}/>
  </div>;
}
