'use client';

import { ArrowUp, Check, Loader2, Mic2, Pause, Play, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { confirm } from '@pireel/ui/confirm';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@pireel/ui/dialog';
import { toast } from '@pireel/ui/toast';
import { AssetCardMoreMenu, RESPONSIVE_ASSET_CARD_GRID } from './asset-card';
import { t } from './i18n';
import { MembershipFeatureIcon } from './membership-feature-icon';

type VoiceAsset = {
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

type UploadTicket = { key: string; url: string; content_type: string; cache_control: string };

const LANGUAGE_LABELS: Record<string, string> = {
  zh: '中文', yue: '粤语', en: 'English', pt: 'Português', ko: '한국어', es: 'Español', ja: '日本語',
  id: 'Bahasa Indonesia', ru: 'Русский', fr: 'Français', it: 'Italiano', de: 'Deutsch', nl: 'Nederlands',
  ar: 'العربية', tr: 'Türkçe', uk: 'Українська', vi: 'Tiếng Việt', und: 'Other',
};
const CUSTOM_VOICE_LANGUAGE_CODES = ['zh', 'yue', 'en', 'pt', 'ko', 'es', 'ja', 'id', 'ru', 'fr', 'it', 'de', 'nl', 'ar', 'tr', 'uk', 'vi'] as const;

function languageLabel(code: string): string {
  return LANGUAGE_LABELS[code] ?? code.toUpperCase();
}

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

function fileLabel(file: File, fallback: string): string {
  return file.name.replace(/\.[^.]+$/, '').trim().slice(0, 60) || fallback;
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
        voice.selected ? 'bg-ink text-panel' : voice.source !== 'system' ? 'bg-amber-100 text-amber-700' : voice.gender === 'male' ? 'bg-sky-100 text-sky-700' : voice.gender === 'female' ? 'bg-rose-100 text-rose-700' : 'bg-violet-100 text-violet-700'
      }`}
    >
      {[8, 15, 11, 18, 9].map((height, i) => (
        <i key={i} className="w-[2px] rounded-full bg-current opacity-80" style={{ height }} />
      ))}
    </span>
  );
}

function SampleButton({ loading, playing, onToggle }: { loading: boolean; playing: boolean; onToggle: () => void }) {
  const label = loading ? t('workbench.voiceLoadingSample') : t('workbench.voicePlaySample');
  return (
    <button
      type="button"
      onClick={(event) => { event.stopPropagation(); onToggle(); }}
      className={`absolute bottom-7 right-1 z-10 flex h-5 w-5 items-center justify-center rounded text-white transition-colors ${playing ? 'bg-accent' : 'bg-black/55 hover:bg-black/70'}`}
      title={label}
      aria-label={label}
      aria-busy={loading}
    >
      {loading ? <Loader2 size={11} className="animate-spin" /> : playing ? <Pause size={10} /> : <Play size={10} fill="currentColor" />}
    </button>
  );
}

export function AvatarPanel() {
  const [voices, setVoices] = useState<VoiceAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [customVoiceAccess, setCustomVoiceAccess] = useState<{
    allowed: boolean;
    cloneCredits: number | null;
    designCredits: number | null;
  }>({
    allowed: false,
    cloneCredits: null,
    designCredits: null,
  });
  const [composerText, setComposerText] = useState('');
  const [language, setLanguage] = useState('zh');
  const [consent, setConsent] = useState(false);
  const [preprocess, setPreprocess] = useState(false);
  const [busy, setBusy] = useState(false);
  const [languageFilter, setLanguageFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [renaming, setRenaming] = useState<VoiceAsset | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [loadingVoiceId, setLoadingVoiceId] = useState<string | null>(null);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(async (refresh = true) => {
    try {
      const res = await fetch(`/api/studio/voices?refresh=${refresh}&limit=500`);
      const body = (await res.json().catch(() => ({}))) as { voices?: VoiceAsset[]; customVoiceAccess?: typeof customVoiceAccess; error?: string; detail?: string };
      if (!res.ok || !body.voices) throw new Error(body.detail || body.error || t('workbench.voiceListFailed'));
      setVoices(body.voices);
      if (body.customVoiceAccess) setCustomVoiceAccess(body.customVoiceAccess);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('workbench.voiceListFailed'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(false); }, [load]);
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
    if ((loadingVoiceId === voice.id || playingVoiceId === voice.id) && current) {
      current.pause();
      previewAudioRef.current = null;
      setLoadingVoiceId(null);
      setPlayingVoiceId(null);
      return;
    }
    current?.pause();
    setPlayingVoiceId(null);
    setLoadingVoiceId(voice.id);
    const next = new Audio(voice.sampleUrl);
    next.preload = 'auto';
    const isCurrent = () => previewAudioRef.current === next;
    next.onplaying = () => {
      if (!isCurrent()) return;
      setLoadingVoiceId(null);
      setPlayingVoiceId(voice.id);
    };
    next.onwaiting = () => {
      if (!isCurrent()) return;
      setPlayingVoiceId(null);
      setLoadingVoiceId(voice.id);
    };
    next.onended = () => {
      if (!isCurrent()) return;
      previewAudioRef.current = null;
      setLoadingVoiceId(null);
      setPlayingVoiceId(null);
    };
    next.onerror = () => {
      if (!isCurrent()) return;
      previewAudioRef.current = null;
      setLoadingVoiceId(null);
      setPlayingVoiceId(null);
      setError(t('workbench.voicePreviewFailed'));
    };
    previewAudioRef.current = next;
    void next.play().then(() => {
      if (!isCurrent() || next.paused) return;
      setLoadingVoiceId(null);
      setPlayingVoiceId(voice.id);
    }).catch(() => {
      if (!isCurrent()) return;
      previewAudioRef.current = null;
      setLoadingVoiceId(null);
      setPlayingVoiceId(null);
      setError(t('workbench.voicePreviewFailed'));
    });
  };

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const languageOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const voice of voices) {
      for (const code of voice.languages?.length ? voice.languages : [voice.language]) {
        counts.set(code, (counts.get(code) ?? 0) + 1);
      }
    }
    const priority = (code: string) => code === 'zh' ? 0 : code === 'yue' ? 1 : code === 'en' ? 2 : 3;
    return [...counts].sort(([left], [right]) => priority(left) - priority(right) || languageLabel(left).localeCompare(languageLabel(right)));
  }, [voices]);
  const visibleVoices = voices.filter((voice) => {
    const languages = voice.languages?.length ? voice.languages : [voice.language];
    if (languageFilter !== 'all' && !languages.includes(languageFilter)) return false;
    if (!normalizedQuery) return true;
    return [voice.label, voice.description, voice.scene, voice.language, ...(voice.languages ?? []).map(languageLabel)].filter(Boolean).join(' ').toLocaleLowerCase().includes(normalizedQuery);
  });

  const chooseFile = async (next: File | null) => {
    setFile(next);
    setDuration(null);
    setError('');
    if (!next) {
      setConsent(false);
      setPreprocess(false);
      return;
    }
    if (next.size > 20 * 1024 * 1024) {
      setError(t('workbench.voiceSampleSizeError'));
      return;
    }
    try {
      const seconds = await audioDuration(next);
      setDuration(seconds);
      if (seconds < 10 || seconds > 300) setError(t('workbench.voiceSampleDurationError'));
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

  const beginRename = (voice: VoiceAsset) => {
    setRenaming(voice);
    setRenameDraft(voice.label);
  };

  const commitRename = async () => {
    if (!renaming || busy) return;
    const label = renameDraft.trim().slice(0, 60);
    if (!label || label === renaming.label) return;
    const previous = renaming;
    setVoices((current) => current.map((voice) => (voice.id === previous.id ? { ...voice, label } : voice)));
    setRenaming(null);
    setRenameDraft('');
    setBusy(true);
    try {
      const res = await fetch('/api/studio/voices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'rename', voiceId: previous.id, name: label }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
      if (!res.ok) throw new Error(body.detail || body.error || t('workbench.voiceRenameFailed'));
      toast.success(t('workbench.voiceRenamed'));
    } catch (cause) {
      setVoices((current) => current.map((voice) => (voice.id === previous.id ? { ...voice, label: previous.label } : voice)));
      setError(cause instanceof Error ? cause.message : t('workbench.voiceRenameFailed'));
      toast.error(t('workbench.voiceRenameFailed'));
    } finally {
      setBusy(false);
    }
  };

  const removeVoice = async (voice: VoiceAsset) => {
    if (busy) return;
    const approved = await confirm({
      title: t('workbench.voiceDeleteConfirm', { name: voice.label }),
      tone: 'danger',
      confirmLabel: t('workbench.voiceDelete'),
    });
    if (!approved) return;
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

  const createVoice = async () => {
    const text = composerText.trim();
    if (busy) return;
    if (!customVoiceAccess.allowed) return;
    if (file && (!consent || duration == null || duration < 10 || duration > 300 || file.size > 20 * 1024 * 1024)) return;
    if (!file && !text) return;
    setBusy(true);
    setError('');
    try {
      let payload: Record<string, unknown> = { action: 'design', prompt: text, language };
      if (file) {
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
          body: JSON.stringify({ action: 'register-audio-asset', key: ticket.key, label: fileLabel(file, t('workbench.voiceCloned')) }),
        });
        const registered = (await registerRes.json().catch(() => ({}))) as { id?: string; error?: string };
        if (!registerRes.ok || !registered.id) throw new Error(registered.error || t('workbench.voiceUploadFailed'));
        payload = { action: 'clone', audioAssetId: registered.id, name: fileLabel(file, t('workbench.voiceCloned')), language, consentConfirmed: true, preprocess };
      }
      const createRes = await fetch('/api/studio/voices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const created = (await createRes.json().catch(() => ({}))) as { voice?: VoiceAsset; error?: string; detail?: string };
      if (!createRes.ok || !created.voice) throw new Error(created.detail || created.error || t('workbench.voiceCreateFailed'));
      setFile(null);
      setDuration(null);
      setComposerText('');
      setConsent(false);
      setPreprocess(false);
      await load(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('workbench.voiceCreateFailed'));
    } finally {
      setBusy(false);
    }
  };

  const myVoices = visibleVoices.filter((voice) => voice.source !== 'system');
  const officialVoices = visibleVoices.filter((voice) => voice.source === 'system');
  const canCreate = Boolean(
    customVoiceAccess.allowed && !busy && (
      file
        ? consent && duration != null && duration >= 10 && duration <= 300 && file.size <= 20 * 1024 * 1024
        : composerText.trim()
    ),
  );

  const voiceCards = (items: VoiceAsset[]) => items.map((voice) => (
    <div
      key={voice.id}
      className={`bg-panel-2/55 hover:bg-panel-2 group relative w-full overflow-hidden rounded-md transition-colors ${voice.selected ? 'ring-accent ring-1' : ''}`}
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
              {voice.status === 'deploying' ? t('workbench.voiceDeployingShort') : voice.status === 'failed' ? t('workbench.voiceFailed') : voice.source === 'designed' ? t('workbench.voiceDesignedShort') : voice.source === 'cloned' ? t('workbench.voiceClonedShort') : voice.description || t('workbench.voiceReadyShort')}
            </span>
          )}
          <span className={`absolute top-1 rounded bg-black/55 px-1 py-0.5 text-[8px] text-white ${voice.source === 'system' ? 'right-1' : 'right-7'}`}>
            {(voice.languages ?? [voice.language]).map((item) => item === 'zh' ? '中' : item === 'yue' ? '粤' : item.toUpperCase()).join('/')}
          </span>
          {voice.selected && <span className="bg-accent text-accent-foreground absolute bottom-1 left-1 flex size-4 items-center justify-center rounded"><Check size={9} strokeWidth={3} /></span>}
        </div>
        <div className={`text-ink-3 h-6 truncate px-1.5 py-1 text-[10px] leading-4 ${voice.selected ? 'font-medium text-ink' : ''}`}>{voice.label}</div>
      </button>
      {voice.sampleUrl && <SampleButton loading={loadingVoiceId === voice.id} playing={playingVoiceId === voice.id} onToggle={() => togglePreview(voice)} />}
      {voice.source !== 'system' && (
        <AssetCardMoreMenu
          onRename={() => beginRename(voice)}
          onDelete={() => void removeVoice(voice)}
          optionsLabel={t('workbench.voiceOptions')}
          renameLabel={t('workbench.voiceRename')}
          deleteLabel={t('workbench.voiceDelete')}
        />
      )}
      {voice.status === 'deploying' && <span className="absolute inset-x-2 bottom-0 h-px overflow-hidden rounded-full bg-black/5"><i className="block h-full w-1/2 animate-pulse bg-amber-500" /></span>}
    </div>
  ));

  return (
    <div className="bg-canvas flex h-full min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1.5 px-2.5">
        <select
          value={languageFilter}
          onChange={(event) => setLanguageFilter(event.target.value)}
          aria-label={t('workbench.voiceLanguageAll')}
          className="border-line bg-panel-2 text-ink h-[24px] w-[104px] shrink-0 rounded-md border px-1.5 text-[10.5px] outline-none focus:border-accent"
        >
          <option value="all">{t('workbench.voiceLanguageAll')} · {voices.length}</option>
          {languageOptions.map(([code, count]) => <option key={code} value={code}>{languageLabel(code)} · {count}</option>)}
        </select>
        <label className="border-line focus-within:border-accent relative min-w-0 flex-1 rounded-md border transition">
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
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {error && <div className="mb-2.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-[10px] leading-relaxed text-red-700">{error}</div>}

        {loading ? (
          <div className="text-ink-4 flex items-center justify-center gap-2 py-10 text-[10.5px]"><Loader2 size={14} className="animate-spin" />{t('workbench.voiceLoading')}</div>
        ) : (
          <div className="space-y-3">
            {myVoices.length > 0 && (
              <section>
                <div className="text-ink-3 mb-1.5 px-0.5 text-[10px] font-semibold">{t('workbench.voiceMine')}</div>
                <div className={RESPONSIVE_ASSET_CARD_GRID}>{voiceCards(myVoices)}</div>
              </section>
            )}
            {officialVoices.length > 0 && (
              <section>
                <div className="text-ink-3 mb-1.5 px-0.5 text-[10px] font-semibold">{t('workbench.voiceOfficial')}</div>
                <div className={RESPONSIVE_ASSET_CARD_GRID}>{voiceCards(officialVoices)}</div>
              </section>
            )}
            {!visibleVoices.length && <div className="text-ink-4 py-10 text-center text-[10.5px]">{t('workbench.voiceNoMatches')}</div>}
          </div>
        )}
      </div>

      <div className="shrink-0 px-3 pb-3 pt-1">
        <div className="border-line bg-panel-2 focus-within:border-ink-4 rounded-md border transition-colors">
          {file && (
            <div className="px-3 pt-2.5">
              <div className="border-line bg-panel flex items-center gap-1.5 rounded-md border px-2 py-1.5">
                <Mic2 size={12} className="text-ink-3 shrink-0" />
                <span className="text-ink min-w-0 flex-1 truncate text-[10.5px]">{file.name}</span>
                <span className="text-ink-4 text-[9.5px]">{duration == null ? '…' : `${duration.toFixed(1)}s`}</span>
                <button type="button" onClick={() => void chooseFile(null)} className="text-ink-4 hover:text-ink"><X size={12} /></button>
              </div>
              <label className="text-ink mt-2 flex cursor-pointer items-start gap-1.5 text-[9.5px] leading-relaxed">
                <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 accent-black" />
                {t('workbench.voiceConsent')}
              </label>
              <label className="text-ink-3 mt-1 flex cursor-pointer items-start gap-1.5 text-[9.5px] leading-relaxed">
                <input type="checkbox" checked={preprocess} onChange={(event) => setPreprocess(event.target.checked)} className="mt-0.5 accent-black" />
                {t('workbench.voicePreprocess')}
              </label>
            </div>
          )}
          {!file && (
            <textarea
              value={composerText}
              onChange={(event) => setComposerText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && canCreate) {
                  event.preventDefault();
                  void createVoice();
                }
              }}
              maxLength={200}
              rows={2}
              placeholder={t('workbench.voiceDesignPlaceholder')}
              aria-label={t('workbench.voiceDesignPlaceholder')}
              className="text-ink placeholder:text-ink-4 max-h-[200px] min-h-[64px] w-full resize-none bg-transparent px-3 pb-1.5 pt-2.5 text-[13px] leading-relaxed outline-none"
            />
          )}
          <div className="flex items-center gap-1 px-2 pb-2 pt-1">
            <label className="text-ink-3 hover:bg-line hover:text-ink flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md" title={t('workbench.voiceAttachSample')}>
              <Mic2 size={14} />
              <input type="file" accept="audio/mpeg,audio/mp4,audio/wav,.mp3,.m4a,.wav" className="hidden" onChange={(event) => { void chooseFile(event.target.files?.[0] ?? null); event.target.value = ''; }} />
            </label>
            <select value={language} onChange={(event) => setLanguage(event.target.value)} className="border-line bg-panel-2 text-ink-2 focus:border-ink-4 shrink-0 rounded-md border py-1 pl-2 pr-1 text-[11px] outline-none">
              {CUSTOM_VOICE_LANGUAGE_CODES.map((code) => <option key={code} value={code}>{languageLabel(code)}</option>)}
            </select>
            <MembershipFeatureIcon className="ml-1" />
            <div className="flex-1" />
            {customVoiceAccess.allowed && (
              <span className="text-ink-4 truncate text-[10px]" title={file
                ? t('workbench.voiceCloneCost', { credits: customVoiceAccess.cloneCredits ?? '—' })
                : t('workbench.voiceDesignCost', { credits: customVoiceAccess.designCredits ?? '—' })}
              >
                {file
                  ? t('workbench.voiceCloneCost', { credits: customVoiceAccess.cloneCredits ?? '—' })
                  : t('workbench.voiceDesignCost', { credits: customVoiceAccess.designCredits ?? '—' })}
              </span>
            )}
            <button type="button" onClick={() => void createVoice()} disabled={!canCreate} className="bg-ink text-bg flex size-7 shrink-0 items-center justify-center rounded-md transition-opacity hover:opacity-85 disabled:pointer-events-none disabled:opacity-25" title={file ? t('workbench.voiceStartClone') : t('workbench.voiceStartDesign')}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : <ArrowUp size={15} strokeWidth={2.5} />}
            </button>
          </div>
        </div>
      </div>
      <Dialog
        open={Boolean(renaming)}
        onOpenChange={(open) => {
          if (!open) {
            setRenaming(null);
            setRenameDraft('');
          }
        }}
      >
        <DialogContent className="bg-panel border-line w-[min(420px,calc(100vw-2rem))] gap-3 p-4">
          <DialogHeader className="pr-7">
            <DialogTitle className="text-ink text-[14px]">{t('workbench.voiceRename')}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void commitRename();
            }}
            className="grid gap-3"
          >
            <label className="grid gap-1.5">
              <span className="text-ink-2 text-[11px] font-medium">{t('workbench.voiceName')}</span>
              <input
                autoFocus
                value={renameDraft}
                maxLength={60}
                onChange={(event) => setRenameDraft(event.target.value)}
                placeholder={t('workbench.voiceNamePlaceholder')}
                className="border-line bg-panel-2 text-ink placeholder:text-ink-4 focus:border-accent h-8 w-full rounded-md border px-2.5 text-[12px] outline-none transition-colors"
              />
            </label>
            <DialogFooter className="mt-1 flex-row justify-end gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setRenaming(null);
                  setRenameDraft('');
                }}
                className="border-line text-ink-2 hover:bg-panel-2 h-7 rounded-md border px-3 text-[11px]"
              >
                {t('panels.cancel')}
              </button>
              <button
                type="submit"
                disabled={!renameDraft.trim() || renameDraft.trim() === renaming?.label || busy}
                className="bg-ink text-bg h-7 rounded-md px-3 text-[11px] font-medium disabled:pointer-events-none disabled:opacity-35"
              >
                {t('panels.saveName')}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
