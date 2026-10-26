import { Check, Loader2, Pause, Play } from 'lucide-react';
import type { ReactNode } from 'react';
import { t } from './i18n';

export type VoiceAsset = {
  id: string;
  label: string;
  source: 'system' | 'cloned' | 'designed';
  language: string;
  languages?: string[];
  status: 'ready' | 'deploying' | 'failed';
  selected: boolean;
  description?: string;
  sampleUrl?: string;
  avatarUrl?: string;
  gender?: 'female' | 'male';
  age?: number;
  scene?: string;
  catalog?: 'system' | 'base';
};

function VoiceGlyph({ voice }: { voice: VoiceAsset }) {
  if (voice.avatarUrl) {
    return <img src={voice.avatarUrl} alt="" className="size-9 shrink-0 rounded object-cover" loading="lazy" />;
  }
  return (
    <span
      className={`relative flex size-9 shrink-0 items-end justify-center gap-[2px] overflow-hidden rounded pb-2 ${
        voice.selected ? 'bg-ink text-panel' : voice.source !== 'system' ? 'bg-amber-100 text-amber-700' : voice.gender === 'male' ? 'bg-sky-100 text-sky-700' : voice.gender === 'female' ? 'bg-rose-100 text-rose-700' : 'bg-violet-100 text-violet-700'
      }`}
    >
      {[8, 15, 11, 18, 9].map((height, i) => (
        <i key={i} className="w-[2px] rounded-full bg-current opacity-80" style={{ height }} />
      ))}
    </span>
  );
}

function SampleButton({ loading, playing, disabled, name, onToggle }: { loading: boolean; playing: boolean; disabled: boolean; name: string; onToggle: () => void }) {
  const label = `${loading ? t('workbench.voiceLoadingSample') : playing ? t('panels.pauseAudio') : t('workbench.voicePlaySample')} · ${name}`;
  return (
    <button
      type="button"
      onClick={(event) => { event.stopPropagation(); onToggle(); }}
      className={`absolute bottom-7 right-1 z-10 flex h-5 w-5 items-center justify-center rounded transition-colors ${playing ? 'bg-black/75 text-white' : 'bg-black/55 text-white hover:bg-black/70'}`}
      title={label}
      aria-label={label}
      aria-busy={loading}
      aria-pressed={playing}
      disabled={disabled}
    >
      {loading ? <Loader2 size={11} className="animate-spin" /> : playing ? <Pause size={10} /> : <Play size={10} fill="currentColor" />}
    </button>
  );
}

export function VoiceCard({ voice, disabled = false, loading = false, playing = false, onSelect, onPreview, actions, personalLabel }: {
  voice: VoiceAsset; disabled?: boolean; loading?: boolean; playing?: boolean;
  onSelect: () => void; onPreview: () => void; actions?: ReactNode; personalLabel?: string;
}) {
  return (
    <div
      className="bg-panel-2/55 hover:bg-panel-2 group relative w-full overflow-hidden rounded-md transition-colors"
    >
      <button
        type="button"
        disabled={voice.status !== 'ready' || disabled}
        onClick={onSelect}
        aria-label={voice.label}
        aria-pressed={voice.selected}
        title={voice.description || voice.label}
        className="block w-full text-left disabled:cursor-default disabled:opacity-60"
      >
        <div className="bg-panel-2 relative flex aspect-video w-full flex-col items-center justify-center gap-1 overflow-hidden">
          {voice.avatarUrl ? <img src={voice.avatarUrl} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" /> : <VoiceGlyph voice={voice} />}
          {!voice.avatarUrl && voice.status !== 'ready' && (
            <span className="text-ink-4 max-w-[104px] truncate text-[8.5px]">
              {voice.status === 'deploying' ? t('workbench.voiceDeployingShort') : t('workbench.voiceFailed')}
            </span>
          )}
          {personalLabel && <span className="bg-panel text-accent-ink absolute left-1 top-1 rounded px-1 py-0.5 text-[8px] font-medium">{personalLabel}</span>}
          <span className={`absolute top-1 rounded bg-black/55 px-1 py-0.5 text-[8px] text-white ${actions ? 'right-7' : 'right-1'}`}>
            {(voice.languages ?? [voice.language]).filter(Boolean).map((item) => item === 'zh' || item === 'yue' ? t(`ui.voiceCard.language.${item}`) : item.toUpperCase()).join('/')}
          </span>
          {voice.selected && <span className="bg-accent text-accent-foreground absolute bottom-1 left-1 flex size-4 items-center justify-center rounded"><Check size={9} strokeWidth={3} /></span>}
        </div>
        <div className={`text-ink-3 h-6 truncate px-1 py-1 text-[10px] leading-4 ${voice.selected ? 'font-medium text-ink' : ''}`}>{voice.label}</div>
      </button>
      {voice.sampleUrl && <SampleButton loading={loading} playing={playing} disabled={disabled} name={voice.label} onToggle={onPreview} />}
      {actions}
      {voice.selected && <span aria-hidden="true" className="border-accent pointer-events-none absolute inset-0 z-20 rounded-md border" />}
      {voice.status === 'deploying' && <span className="absolute inset-x-2 bottom-0 h-px overflow-hidden rounded-full bg-black/5"><i className="block h-full w-1/2 animate-pulse bg-amber-500" /></span>}
    </div>
  );
}
