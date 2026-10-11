import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { sfxSound } from '@pireel/studio-engine/sfx-library';
import pack from './workflow-art/sfx-showcase-pack-v1.provenance.json';
import './sfx-upload-showcase.css';

const packUrl = new URL('./workflow-art/sfx-showcase-pack-v1.wav', import.meta.url).href;
const demoUrl = new URL('./workflow-art/caption-demo.mp4', import.meta.url).href;
const PURPOSES = {
  accent: { zh: '重点', en: 'Accent' },
  transition: { zh: '转场', en: 'Transition' },
  reveal: { zh: '揭示', en: 'Reveal' },
  confirmation: { zh: '确认', en: 'Confirm' },
  question: { zh: '提问', en: 'Question' },
  emphasis: { zh: '强调', en: 'Emphasis' },
  money: { zh: '金额', en: 'Money' },
  achievement: { zh: '成就', en: 'Achievement' },
  reaction: { zh: '反应', en: 'Reaction' },
  comedic: { zh: '反转', en: 'Comedic' },
  cta: { zh: '引导', en: 'Call to action' },
};

/** One local listening pack: every licensed library sound, in catalog order. */
export function SfxUploadShowcase({ locale }: { locale: 'zh' | 'en' }) {
  const zh = locale === 'zh';
  const audio = useRef<HTMLAudioElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [error, setError] = useState('');
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!preference) return;
    const update = () => setReduced(preference.matches);
    preference.addEventListener?.('change', update);
    return () => preference.removeEventListener?.('change', update);
  }, []);
  useEffect(() => {
    const picture = video.current; if (!picture) return;
    if (reduced) picture.pause();
    else {
      try { void Promise.resolve(picture.play()).catch(() => {}); }
      catch { /* The still video frame remains available if playback is unsupported. */ }
    }
  }, [reduced]);
  useEffect(() => {
    const player = audio.current;
    const picture = video.current;
    return () => { player?.pause(); if (player) player.currentTime = 0; picture?.pause(); };
  }, []);
  const toggle = async () => {
    const player = audio.current; if (!player) return;
    if (playing) { player.pause(); setPlaying(false); return; }
    try { setError(''); await player.play(); setPlaying(true); }
    catch { setPlaying(false); setError(zh ? '试听暂不可用。' : 'Preview unavailable.'); }
  };
  const activeEntry = playing && position > 0 ? pack.entries[Math.max(0, pack.entries.findLastIndex(entry => entry.startSec <= position))] : null;
  const purpose = activeEntry ? sfxSound(activeEntry.id)?.purpose : null;
  const cueName = purpose ? PURPOSES[purpose as keyof typeof PURPOSES]?.[locale] : null;
  const progress = Math.min(1, position / pack.durationSec);
  return <div className="my-4 space-y-3" aria-label={zh ? '音效示例' : 'Sound effect example'}>
    <audio ref={audio} src={packUrl} preload="none" onTimeUpdate={event => setPosition(event.currentTarget.currentTime)} onEnded={() => { setPlaying(false); setPosition(0); if (audio.current) audio.current.currentTime = 0; }} onPause={() => setPlaying(false)} onError={() => { setPlaying(false); setError(zh ? '试听暂不可用。' : 'Preview unavailable.'); }} />
    <div className="bg-panel-2 relative aspect-video w-full overflow-hidden rounded-lg">
      <video ref={video} src={demoUrl} muted loop playsInline preload="metadata" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover object-center" />
      <div className="absolute inset-0 bg-black/45" aria-hidden="true" />
      {cueName && <div key={purpose} data-sfx-mg-cue={purpose ?? undefined} className="sfx-mg-tag pointer-events-none absolute right-4 top-4 rounded-full border border-white/30 bg-black/45 px-2.5 py-1 text-[11px] text-white backdrop-blur-sm">{cueName}</div>}
      {activeEntry && !reduced && <div key={activeEntry.id} className="sfx-mg-burst pointer-events-none absolute right-[12%] top-[34%] size-12" aria-hidden="true"><span/><span/></div>}
      <div className="absolute inset-x-4 bottom-4 text-white">
        <button type="button" onClick={() => void toggle()} aria-label={playing ? (zh ? '暂停音效' : 'Pause sound') : (zh ? '播放音效' : 'Play sound')} aria-pressed={playing} className="mb-2 flex size-9 items-center justify-center rounded-full bg-white text-black transition-colors hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-white">
          {playing ? <Pause size={16}/> : <Play size={16}/>}
        </button>
        <svg viewBox="0 0 480 68" aria-hidden="true" className="h-[68px] w-full">
        <line x1="0" x2="480" y1="35" y2="35" stroke="currentColor" opacity=".25"/>
        {pack.waveform.map((peak, i) => {
          const height = 5 + peak * 57;
          return <rect key={i} x={i * 6.65 + 1} y={35 - height / 2} width="3.5" height={height} rx="1.5" fill={i / pack.waveform.length <= progress ? '#f8f4eb' : 'currentColor'} opacity={i / pack.waveform.length <= progress ? '.96' : '.52'}/>;
        })}
        {playing && <g data-sfx-mg-playhead><line x1={progress * 480} x2={progress * 480} y1="3" y2="67" stroke="#d8b99a" strokeWidth="1.5"/><circle cx={progress * 480} cy="4" r="3" fill="#d8b99a"/></g>}
        </svg>
        <div className="mt-1 h-0.5 overflow-hidden rounded-full bg-white/30"><div className="h-full rounded-full bg-white transition-[width] duration-100" style={{ width: `${progress * 100}%` }}/></div>
      </div>
    </div>
    <p className="text-ink-3 text-xs leading-relaxed">{zh ? '播放音效示例。生成时 AI 会根据口播内容挑选音效，安排时机并调整音量。' : 'Play the sound preview. During generation, AI chooses effects, timing and level for the narration.'}</p>
    {error && <p role="status" className="text-ink-3 text-xs">{error}</p>}
  </div>;
}
