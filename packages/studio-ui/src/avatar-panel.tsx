'use client';

import { Check, Loader2, Mic2, Pause, Play, Plus, Search, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from './i18n';

type VoiceAsset = {
  id: string;
  label: string;
  source: 'system' | 'cloned';
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

type UploadTicket = { key: string; url: string; content_type: string; cache_control: string };

function normalizeAudioType(file: File): string {
  if (file.type === 'audio/mp3') return 'audio/mpeg';
  if (file.type === 'audio/x-m4a') return 'audio/mp4';
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'm4a') return 'audio/mp4';
  if (ext === 'wav') return 'audio/wav';
  return '';
}

function audioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const finish = () => URL.revokeObjectURL(url);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const duration = audio.duration;
      finish();
      if (Number.isFinite(duration)) resolve(duration);
      else reject(new Error('invalid duration'));
    };
    audio.onerror = () => {
      finish();
      reject(new Error('invalid audio'));
    };
    audio.src = url;
  });
}

function VoiceGlyph({ voice }: { voice: VoiceAsset }) {
  if (voice.avatarUrl) {
    return <img src={voice.avatarUrl} alt="" className="size-9 shrink-0 rounded object-cover" loading="lazy" />;
  }
  return (
    <span
      className={`relative flex size-9 shrink-0 items-end justify-center gap-[2px] overflow-hidden rounded pb-2 ${
        voice.selected ? 'bg-ink text-panel' : voice.source === 'cloned' ? 'bg-amber-100 text-amber-700' : voice.gender === 'male' ? 'bg-sky-100 text-sky-700' : 'bg-rose-100 text-rose-700'
      }`}
    >
      {[8, 15, 11, 18, 9].map((height, i) => (
        <i key={i} className="w-[2px] rounded-full bg-current opacity-80" style={{ height }} />
      ))}
    </span>
  );
}

function SampleButton({ playing, onToggle }: { playing: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => { event.stopPropagation(); onToggle(); }}
      className={`absolute bottom-7 right-1 z-10 flex h-5 w-5 items-center justify-center rounded text-white transition-colors ${playing ? 'bg-accent' : 'bg-black/55 hover:bg-black/70'}`}
      title={t('workbench.voicePlaySample')}
      aria-label={t('workbench.voicePlaySample')}
    >
      {playing ? <Pause size={10} /> : <Play size={10} fill="currentColor" />}
    </button>
  );
}

export function AvatarPanel() {
  const [voices, setVoices] = useState<VoiceAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('zh');
  const [consent, setConsent] = useState(false);
  const [preprocess, setPreprocess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [languageFilter, setLanguageFilter] = useState<'all' | 'zh' | 'en'>('all');
  const [query, setQuery] = useState('');
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(async (refresh = true) => {
    try {
      const res = await fetch(`/api/studio/voices?refresh=${refresh}`);
      const body = (await res.json().catch(() => ({}))) as { voices?: VoiceAsset[]; error?: string; detail?: string };
      if (!res.ok || !body.voices) throw new Error(body.detail || body.error || t('workbench.voiceListFailed'));
      setVoices(body.voices);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('workbench.voiceListFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(true); }, [load]);
  useEffect(() => () => previewAudioRef.current?.pause(), []);
  const deploying = voices.some((voice) => voice.status === 'deploying');
  useEffect(() => {
    if (!deploying) return;
    const timer = window.setInterval(() => void load(true), 5_000);
    return () => window.clearInterval(timer);
  }, [deploying, load]);

  const togglePreview = (voice: VoiceAsset) => {
    if (!voice.sampleUrl) return;
    const current = previewAudioRef.current;
    if (playingVoiceId === voice.id && current && !current.paused) {
      current.pause();
      setPlayingVoiceId(null);
      return;
    }
    current?.pause();
    const next = new Audio(voice.sampleUrl);
    next.onended = () => setPlayingVoiceId(null);
    next.onerror = () => {
      setPlayingVoiceId(null);
      setError(t('workbench.voicePreviewFailed'));
    };
    previewAudioRef.current = next;
    void next.play().then(() => setPlayingVoiceId(voice.id)).catch(() => setError(t('workbench.voicePreviewFailed')));
  };

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleVoices = voices.filter((voice) => {
    const languages = voice.languages?.length ? voice.languages : [voice.language];
    if (languageFilter !== 'all' && !languages.includes(languageFilter)) return false;
    if (!normalizedQuery) return true;
    return [voice.label, voice.description, voice.scene, voice.language].filter(Boolean).join(' ').toLocaleLowerCase().includes(normalizedQuery);
  });

  const chooseFile = async (next: File | null) => {
    setFile(next);
    setDuration(null);
    setError('');
    if (!next) return;
    try {
      const seconds = await audioDuration(next);
      setDuration(seconds);
      if (seconds < 3 || seconds > 30) setError(t('workbench.voiceSampleDurationError'));
      if (!name) setName(next.name.replace(/\.[^.]+$/, '').slice(0, 60));
    } catch {
      setError(t('workbench.voiceSampleUnreadable'));
    }
  };

  const selectVoice = async (voice: VoiceAsset) => {
    if (voice.status !== 'ready' || voice.selected || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/studio/voices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'select', voiceId: voice.id }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
      if (!res.ok) throw new Error(body.detail || body.error || t('workbench.voiceSelectFailed'));
      setVoices((current) => current.map((item) => ({ ...item, selected: item.id === voice.id })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('workbench.voiceSelectFailed'));
    } finally {
      setBusy(false);
    }
  };

  const removeVoice = async (voice: VoiceAsset) => {
    if (busy || !window.confirm(t('workbench.voiceDeleteConfirm', { name: voice.label }))) return;
    setBusy(true);
    try {
      const res = await fetch('/api/studio/voices', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ voiceId: voice.id }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
      if (!res.ok) throw new Error(body.detail || body.error || t('workbench.voiceDeleteFailed'));
      await load(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('workbench.voiceDeleteFailed'));
    } finally {
      setBusy(false);
    }
  };

  const cloneVoice = async () => {
    if (!file || !name.trim() || !consent || duration == null || duration < 3 || duration > 30 || busy) return;
    setBusy(true);
    setError('');
    try {
      const contentType = normalizeAudioType(file);
      if (!['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav'].includes(contentType)) throw new Error(t('workbench.voiceSampleTypeError'));
      const ticketRes = await fetch('/api/studio/media', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'put-audio-asset', size: file.size, content_type: contentType }),
      });
      const ticket = (await ticketRes.json().catch(() => ({}))) as UploadTicket & { error?: string };
      if (!ticketRes.ok || !ticket.url) throw new Error(ticket.error || t('workbench.voiceUploadFailed'));
      const putRes = await fetch(ticket.url, {
        method: 'PUT',
        headers: { 'Content-Type': ticket.content_type, 'Cache-Control': ticket.cache_control },
        body: file,
      });
      if (!putRes.ok) throw new Error(t('workbench.voiceUploadFailed'));
      const registerRes = await fetch('/api/studio/media', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'register-audio-asset', key: ticket.key, label: name.trim() }),
      });
      const registered = (await registerRes.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!registerRes.ok || !registered.id) throw new Error(registered.error || t('workbench.voiceUploadFailed'));
      const cloneRes = await fetch('/api/studio/voices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'clone', audioAssetId: registered.id, name: name.trim(), language, consentConfirmed: true, preprocess }),
      });
      const cloned = (await cloneRes.json().catch(() => ({}))) as { voice?: VoiceAsset; error?: string; detail?: string };
      if (!cloneRes.ok || !cloned.voice) throw new Error(cloned.detail || cloned.error || t('workbench.voiceCloneFailed'));
      setFormOpen(false);
      setFile(null);
      setDuration(null);
      setName('');
      setConsent(false);
      setPreprocess(false);
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('workbench.voiceCloneFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div className="px-2.5 pt-2">
        <div className="bg-panel border-line flex rounded-md border p-0.5">
          {(['all', 'zh', 'en'] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setLanguageFilter(filter)}
              className={`flex-1 rounded px-2 py-1 text-[11.5px] transition ${
                languageFilter === filter ? 'bg-panel-2 text-ink font-medium' : 'text-ink-4 hover:text-ink-2'
              }`}
            >
              {filter === 'all' ? t('workbench.voiceLanguageAll') : filter === 'zh' ? '中文' : 'English'}
            </button>
          ))}
        </div>
      </div>

      <div className="border-line border-b px-2.5 py-1.5">
        <div className="flex items-center gap-1.5">
          <label className="border-line bg-panel-2 focus-within:border-accent relative min-w-0 flex-1 rounded-md border transition">
            <Search size={11} className="text-ink-4 pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('workbench.voiceSearchPlaceholder')}
              aria-label={t('workbench.voiceSearchPlaceholder')}
              className="text-ink placeholder:text-ink-4 h-[24px] w-full bg-transparent pl-5.5 pr-10 text-[11px] outline-none"
            />
            <span className="text-ink-4 pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] tabular-nums">{visibleVoices.length}/{voices.length}</span>
          </label>
          <button
            type="button"
            onClick={() => { setFormOpen((value) => !value); setError(''); }}
            className={`border-line text-ink-2 hover:text-ink inline-flex h-[24px] shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-2 text-[11px] transition ${formOpen ? 'bg-panel-2' : ''}`}
          >
            {formOpen ? <X size={11} /> : <Plus size={11} />}
            {formOpen ? t('workbench.close') : t('workbench.voiceClone')}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {formOpen && (
          <section className="border-line bg-panel mb-2.5 rounded-md border p-2.5">
            <div className="mb-2.5 flex items-center gap-2">
              <span className="bg-panel-2 text-ink-3 flex size-7 items-center justify-center rounded"><Mic2 size={13} /></span>
              <div>
                <div className="text-ink text-[11.5px] font-semibold">{t('workbench.voiceCreateTitle')}</div>
                <div className="text-ink-4 text-[9.5px]">{t('workbench.voiceSampleHint')}</div>
              </div>
            </div>
            <label className="border-line bg-panel-2 hover:border-accent flex min-h-14 cursor-pointer items-center gap-2.5 rounded-md border border-dashed px-2.5 py-2 transition-colors">
              <span className="bg-panel text-ink-4 flex size-8 items-center justify-center rounded"><Plus size={14} /></span>
              <span className="min-w-0">
                <span className="text-ink block truncate text-[10.5px] font-medium">{file?.name || t('workbench.voiceChooseSample')}</span>
                <span className="text-ink-4 block text-[9.5px]">{duration != null ? `${duration.toFixed(1)}s · ${t('workbench.voiceSampleReady')}` : 'MP3 · M4A · WAV'}</span>
              </span>
              <input type="file" accept="audio/mpeg,audio/mp4,audio/wav,.mp3,.m4a,.wav" className="hidden" onChange={(event) => void chooseFile(event.target.files?.[0] ?? null)} />
            </label>
            <div className="mt-2 grid grid-cols-[1fr_76px] gap-2">
              <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} placeholder={t('workbench.voiceNamePlaceholder')} className="border-line bg-panel text-ink placeholder:text-ink-4 h-7 min-w-0 rounded-md border px-2 text-[10.5px] outline-none focus:border-accent" />
              <select value={language} onChange={(event) => setLanguage(event.target.value)} className="border-line bg-panel text-ink h-7 rounded-md border px-1.5 text-[10.5px] outline-none focus:border-accent">
                <option value="zh">中文</option><option value="en">English</option><option value="ja">日本語</option><option value="ko">한국어</option><option value="es">Español</option><option value="fr">Français</option><option value="de">Deutsch</option>
              </select>
            </div>
            <label className="text-ink-3 mt-2.5 flex cursor-pointer items-start gap-2 text-[9.5px] leading-relaxed">
              <input type="checkbox" checked={preprocess} onChange={(event) => setPreprocess(event.target.checked)} className="mt-0.5 accent-black" />
              {t('workbench.voicePreprocess')}
            </label>
            <label className="text-ink mt-2 flex cursor-pointer items-start gap-2 text-[9.5px] font-medium leading-relaxed">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 accent-black" />
              {t('workbench.voiceConsent')}
            </label>
            <button type="button" onClick={() => void cloneVoice()} disabled={!file || !name.trim() || !consent || duration == null || duration < 3 || duration > 30 || busy} className="bg-accent text-accent-foreground mt-3 flex h-7 w-full items-center justify-center gap-1.5 rounded-md text-[10.5px] font-medium disabled:cursor-not-allowed disabled:opacity-35">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Mic2 size={12} />}{t('workbench.voiceStartClone')}
            </button>
          </section>
        )}

        {error && <div className="mb-2.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-[10px] leading-relaxed text-red-700">{error}</div>}

        {loading ? (
          <div className="text-ink-4 flex items-center justify-center gap-2 py-10 text-[10.5px]"><Loader2 size={14} className="animate-spin" />{t('workbench.voiceLoading')}</div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,120px)] gap-2.5">
            {visibleVoices.map((voice) => (
              <div
                key={voice.id}
                className={`group relative w-full overflow-hidden rounded-md border transition ${voice.selected ? 'border-accent ring-accent/20 ring-1' : 'border-line hover:border-accent'}`}
              >
                <button
                  type="button"
                  disabled={voice.status !== 'ready' || busy}
                  onClick={() => void selectVoice(voice)}
                  title={`${voice.label} · ${voice.description || t('workbench.voiceReadyShort')}`}
                  className="block w-full text-left disabled:cursor-default disabled:opacity-60"
                >
                  <div className="bg-panel-2 relative flex aspect-video w-full flex-col items-center justify-center gap-1 overflow-hidden">
                    {voice.avatarUrl ? <img src={voice.avatarUrl} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" /> : <VoiceGlyph voice={voice} />}
                    {!voice.avatarUrl && (
                      <span className="text-ink-4 max-w-[104px] truncate text-[8.5px]">
                        {voice.status === 'deploying' ? t('workbench.voiceDeployingShort') : voice.status === 'failed' ? t('workbench.voiceFailed') : voice.description || t('workbench.voiceReadyShort')}
                      </span>
                    )}
                    <span className="absolute right-1 top-1 rounded bg-black/55 px-1 py-0.5 text-[8px] text-white">
                      {(voice.languages ?? [voice.language]).map((item) => item === 'zh' ? '中' : item === 'en' ? 'EN' : item).join('/')}
                    </span>
                    {voice.selected && <span className="bg-accent text-accent-foreground absolute bottom-1 left-1 flex size-4 items-center justify-center rounded"><Check size={9} strokeWidth={3} /></span>}
                  </div>
                  <div className={`text-ink-3 h-6 truncate px-1.5 py-1 text-[10px] leading-4 ${voice.selected ? 'font-medium text-ink' : ''}`}>{voice.label}</div>
                </button>
                {voice.sampleUrl && <SampleButton playing={playingVoiceId === voice.id} onToggle={() => togglePreview(voice)} />}
                {voice.source === 'cloned' && (
                  <button
                    type="button"
                    onClick={(event) => { event.stopPropagation(); void removeVoice(voice); }}
                    className="absolute left-1 top-1 hidden h-5 w-5 items-center justify-center rounded bg-black/55 text-white hover:bg-red-600 group-hover:inline-flex"
                    title={t('workbench.voiceDelete')}
                    aria-label={t('workbench.voiceDelete')}
                  >
                    <Trash2 size={11} />
                  </button>
                )}
                {voice.status === 'deploying' && <span className="absolute inset-x-2 bottom-0 h-px overflow-hidden rounded-full bg-black/5"><i className="block h-full w-1/2 animate-pulse bg-amber-500" /></span>}
              </div>
            ))}
            {!visibleVoices.length && <div className="text-ink-4 col-span-full py-10 text-center text-[10.5px]">{t('workbench.voiceNoMatches')}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
