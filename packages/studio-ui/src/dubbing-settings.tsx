import { useEffect, useState } from 'react';
import { DUBBING_LANGUAGES, type DubbingOptions } from '@pireel/studio-engine/dubbing-task';
interface Voice { id: string; label: string; sampleUrl?: string; status: string }
export function DubbingSettings({ value, translatedText, disabled, locale, onChange }: { value: DubbingOptions; translatedText?: string; disabled: boolean; locale: 'zh' | 'en'; onChange: (value: DubbingOptions) => void }) {
  const zh = locale === 'zh';
  const [voices, setVoices] = useState<Voice[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [lipAvailable, setLipAvailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/studio/dubbing-lipsync', { signal: controller.signal }).then((response) => response.json()).then((body) => setLipAvailable(body.lipSyncAvailable === true)).catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); setVoices([]);
    const language = DUBBING_LANGUAGES.find((entry) => entry.id === value.language)?.code ?? 'en';
    void fetch(`/api/studio/voices?language=${language}&limit=100`, { signal: controller.signal }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.detail ?? body.error ?? '声音加载失败'); return body.voices ?? []; })
      .then((items: Voice[]) => { if (!controller.signal.aborted) setVoices(items.filter((voice) => voice.status === 'ready')); })
      .catch(() => { if (!controller.signal.aborted) setError(zh ? '声音暂时无法加载，请刷新重试。' : 'Voices could not load. Refresh and retry.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [value.language, zh]);
  const chosen = voices.find((voice) => voice.id === value.voiceId);
  const selectClass = 'border-line bg-bg text-ink w-full rounded-lg border px-3 py-2.5 text-sm';
  return <fieldset disabled={disabled} className="space-y-5 disabled:opacity-50">
    <label className="text-ink block text-sm">{zh ? '目标语言' : 'Target language'}<select aria-label={zh ? '目标语言' : 'Target language'} value={value.language} onChange={(event) => onChange({ ...value, language: event.target.value, voiceId: '', script: undefined })} className={selectClass + ' mt-2'}>{DUBBING_LANGUAGES.map((language) => <option key={language.id} value={language.id}>{language[locale]}</option>)}</select></label>
    <label className="text-ink block text-sm">{zh ? '声音' : 'Voice'}<select aria-label={zh ? '声音' : 'Voice'} disabled={disabled || loading} value={value.voiceId} onChange={(event) => onChange({ ...value, voiceId: event.target.value })} className={selectClass + ' mt-2'}><option value="">{loading ? (zh ? '加载声音…' : 'Loading voices…') : (zh ? '选择声音' : 'Choose a voice')}</option>{value.voiceId && !chosen && <option value={value.voiceId}>{zh ? '已选声音' : 'Selected voice'}</option>}{voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.label}</option>)}</select></label>
    {chosen?.sampleUrl && <audio aria-label={zh ? '声音试听' : 'Voice preview'} controls preload="none" src={chosen.sampleUrl} className="h-9 w-full" />}
    <label className="text-ink flex items-start gap-3 text-sm"><input type="checkbox" checked={value.lipSync} disabled={disabled || (!lipAvailable && !value.lipSync)} onChange={(event) => onChange({ ...value, lipSync: event.target.checked })} className="mt-1 size-4 accent-[var(--color-accent)]" /><span>{zh ? '口型同步' : 'Lip sync'}<span className="text-ink-3 mt-1 block text-xs">{lipAvailable ? (zh ? '让嘴型跟随新配音，额外消耗积分。' : 'Match mouth movements to the new voice. Uses additional credits.') : (zh ? '暂不可用' : 'Currently unavailable')}</span></span></label>
    <p className="text-ink-4 text-xs">{zh ? '新配音将替换原音轨，并适配原片时长。' : 'The new voice replaces the original audio and fits the video duration.'}</p>
    {(translatedText || value.script) && <details className="border-line border-t pt-4"><summary className="text-ink cursor-pointer text-sm">{zh ? '配音文案' : 'Voice script'}</summary><textarea aria-label={zh ? '配音文案' : 'Voice script'} value={value.script ?? translatedText ?? ''} maxLength={5000} rows={7} onChange={(event) => onChange({ ...value, script: event.target.value })} className="border-line bg-bg text-ink mt-3 w-full resize-y rounded-lg border p-3 text-sm leading-relaxed" /></details>}
    {error && <p role="alert" className="text-ink text-xs">{error}</p>}
  </fieldset>;
}
