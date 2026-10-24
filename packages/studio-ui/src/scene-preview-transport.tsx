import { Pause, Play } from 'lucide-react';
import { usePlayheadT } from './playhead';
import { t } from './i18n';

/** Scene output controls expose playback, not timeline editing operations. */
export function ScenePreviewTransport({ duration, playing, locale, onToggle, onSeek }: {
  duration: number; playing: boolean; locale: string; onToggle: () => void; onSeek: (time: number) => void;
}) {
  const time = usePlayheadT();
  const zh = locale === 'zh';
  return <div data-scene-transport className="bg-canvas flex shrink-0 items-center gap-4 rounded-sm px-4 py-3">
    <button type="button" disabled={duration <= 0} onClick={onToggle} aria-label={playing ? (t('ui.scenePreviewTransport.pause')) : (t('ui.scenePreviewTransport.play'))} className="bg-ink text-canvas inline-flex size-8 shrink-0 items-center justify-center rounded-full disabled:opacity-40">{playing ? <Pause size={14} /> : <Play size={14} />}</button>
    <input type="range" aria-label={t('ui.scenePreviewTransport.videoPosition')} min={0} max={Math.max(0.01, duration)} step={0.05} value={Math.min(time, duration)} disabled={duration <= 0} onChange={event => onSeek(Number(event.target.value))} className="min-w-0 flex-1 accent-current" />
    <span className="text-ink-3 shrink-0 font-mono text-xs tabular-nums">{time.toFixed(1)} / {duration.toFixed(1)}s</span>
  </div>;
}
