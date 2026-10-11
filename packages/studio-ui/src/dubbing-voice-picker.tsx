import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@pireel/ui/dialog';
import { SceneCardCarousel } from './scene-card-carousel';
import { VoiceCard, type VoiceAsset } from './voice-card';

const CloneVoicePanel = lazy(() => import('./avatar-panel').then((module) => ({ default: module.AvatarPanel })));

export function DubbingVoicePicker({ voices, value, loading, disabled, locale, language, onCreated, onChange }: {
  voices: VoiceAsset[]; value: string; loading: boolean; disabled: boolean;
  locale: 'zh' | 'en'; language: string; onCreated: (voice: VoiceAsset) => void; onChange: (id: string) => void;
}) {
  const zh = locale === 'zh';
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneBusy, setCloneBusy] = useState(false);
  const [playing, setPlaying] = useState('');
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const audio = useRef<HTMLAudioElement | null>(null);
  const stop = () => { const current = audio.current; audio.current = null; current?.pause(); setPlaying(''); setPending(''); };
  useEffect(() => () => { const current = audio.current; audio.current = null; current?.pause(); }, []);
  useEffect(() => { stop(); }, [disabled, language]);
  const preview = (voice: VoiceAsset) => {
    if (disabled || !voice.sampleUrl) return;
    const same = voice.id === playing || voice.id === pending;
    stop(); setError('');
    if (same) return;
    const next = new Audio(voice.sampleUrl);
    audio.current = next; setPending(voice.id);
    const active = () => audio.current === next;
    const fail = () => { if (active()) { stop(); setError(zh ? '试听加载失败，请重试。' : 'Could not play this sample. Try again.'); } };
    next.onplaying = () => { if (active()) { setPending(''); setPlaying(voice.id); } };
    next.onwaiting = () => { if (active()) { setPlaying(''); setPending(voice.id); } };
    next.onended = () => { if (active()) stop(); };
    next.onerror = fail;
    void next.play().catch(fail);
  };
  const visible = [...voices.filter((voice) => voice.source !== 'system'), ...voices.filter((voice) => voice.source === 'system')];
  const selected = voices.find((voice) => voice.id === value);
  return <section aria-label={zh ? '音色选择' : 'Voice library'} className="space-y-3">
    <SceneCardCarousel items={visible} selectedId={value}
      header={<div className="flex min-w-0 flex-1 items-center justify-between gap-3 text-sm"><span className="text-ink">{zh ? '音色' : 'Voice'}</span>
        <button type="button" disabled={disabled} onClick={() => { stop(); setCloneOpen(true); }} className="text-ink-3 hover:text-ink inline-flex items-center gap-1 text-xs"><Plus size={13} />{zh ? '克隆音色' : 'Clone voice'}</button>
      </div>}
      label={zh ? '音色列表' : 'Voice cards'} previousLabel={zh ? '上一页音色' : 'Previous voices'} nextLabel={zh ? '下一页音色' : 'Next voices'}
      renderItem={(voice) => <VoiceCard personalLabel={voice.source !== 'system' ? (zh ? '我的' : 'Mine') : undefined} voice={{ ...voice, selected: voice.id === value }} disabled={disabled} playing={playing === voice.id} loading={pending === voice.id} onSelect={() => { stop(); onChange(voice.id); }} onPreview={() => preview(voice)} />}
      empty={loading ? <div role="status" className="text-ink-3 flex h-32 items-center justify-center gap-2 text-xs"><Loader2 size={14} className="animate-spin" />{zh ? '正在加载音色…' : 'Loading voices…'}</div> : <div className="text-ink-3 py-8 text-center text-xs"><p>{zh ? '暂无可用音色' : 'No voices available'}</p>{<button type="button" disabled={disabled} onClick={() => { stop(); setCloneOpen(true); }} className="bg-panel-2 text-ink hover:bg-panel mt-3 rounded-md px-3 py-2">{zh ? '克隆音色' : 'Clone voice'}</button>}</div>}
    />
    {selected && <p className="text-ink-3 truncate text-xs">{zh ? '已选：' : 'Selected: '}{selected.label}</p>}
    <Dialog open={cloneOpen} onOpenChange={(open) => { if (!cloneBusy) setCloneOpen(open); }}>
      <DialogContent aria-describedby={undefined} showCloseButton={!cloneBusy} className="bg-panel border-line max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <DialogTitle className="text-ink text-base">{zh ? '克隆音色' : 'Clone voice'}</DialogTitle>
        <Suspense fallback={<Loader2 size={18} className="animate-spin" />}><CloneVoicePanel mode="clone" initialLanguage={selected?.language ?? language} onBusyChange={setCloneBusy} onCreated={(voice) => { setCloneBusy(false); setCloneOpen(false); onCreated(voice); }} /></Suspense>
      </DialogContent>
    </Dialog>
    {error && <p role="alert" className="text-ink-3 text-xs">{error}</p>}
  </section>;
}
