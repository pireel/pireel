import { ScenePlayerFrame } from './scene-player-frame';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ScenePlayback } from './scene-playback';

/** Adapter for regular source/result videos. Canvas scenes use the same ScenePlayerFrame and ScenePlayback. */
export function SceneVideoPreview({ source, resultUrl, poster, width, height, duration, disabled, locale, actions, children }: {
  source: File | null; resultUrl?: string; poster?: string; width: number; height: number; duration: number;
  disabled: boolean; locale: 'zh' | 'en'; actions?: ReactNode; children?: ReactNode;
}) {
  const video = useRef<HTMLVideoElement>(null); const [sourceUrl, setSourceUrl] = useState('');
  const [time, setTime] = useState(0); const [playing, setPlaying] = useState(false); const [error, setError] = useState('');
  const src = resultUrl || sourceUrl;
  const attachVideo = useCallback((element: HTMLVideoElement | null) => { if (!element) video.current?.pause(); video.current = element; }, []);
  useEffect(() => { if (!source) { setSourceUrl(''); return; } const url = URL.createObjectURL(source); setSourceUrl(url); return () => URL.revokeObjectURL(url); }, [source]);
  useEffect(() => { video.current?.pause(); if (video.current) video.current.currentTime = 0; setTime(0); setPlaying(false); setError(''); }, [src]);
  useEffect(() => { if (disabled) video.current?.pause(); }, [disabled]);
  const pause = () => { video.current?.pause(); setPlaying(false); };
  const toggle = async () => {
    if (!video.current || disabled) return;
    if (!video.current.paused) { pause(); return; }
    if (video.current.ended || video.current.currentTime >= duration) video.current.currentTime = 0;
    const element = video.current; const current = src;
    try { await element.play(); if (element.getAttribute('src') === current) setError(''); } catch { if (element.getAttribute('src') === current) setError(locale === 'zh' ? '暂时无法播放，请重试。' : 'Could not play. Try again.'); }
  };
  return <div className="flex h-full min-h-0 flex-col gap-3">
    <ScenePlayerFrame width={width} height={height} disabled={disabled || !src} onToggle={() => void toggle()}>
        {src ? <video data-scene-video ref={attachVideo} src={src} poster={poster} playsInline className="h-full w-full object-contain" onTimeUpdate={event => setTime(event.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => { setPlaying(false); setTime(duration); }}/> : poster ? <img src={poster} alt={locale === 'zh' ? '视频首帧' : 'First video frame'} className="h-full w-full object-contain"/> : <div className="bg-panel h-full w-full"/>}
        {children}
    </ScenePlayerFrame>
    {error && <p role="alert" className="text-ink-3 text-xs">{error}</p>}
    <ScenePlayback playing={playing} onToggle={() => void toggle()} time={time} duration={duration} disabled={disabled || !src} locale={locale} onPause={pause} onSeek={value => { if (video.current) video.current.currentTime = value; setTime(value); }} actions={actions}/>
  </div>;
}
