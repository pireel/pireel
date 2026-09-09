import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@pireel/ui/select';
import { useEffect, useState } from 'react';
import { DUBBING_LANGUAGES, DUBBING_MAX_SCRIPT_CHARS, dubbingSpeakers, dubbingTurns, dubbingVoiceFor, type DubbingOptions } from '@pireel/studio-engine/dubbing-task';
import { DubbingVoicePicker } from './dubbing-voice-picker';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import type { VoiceAsset } from './voice-card';
export function DubbingSettings({ value, translatedText, translatedTurns, transcript = [], durationSec = 0, disabled, locale, onChange }: { value: DubbingOptions; translatedText?: string; translatedTurns?: string[]; transcript?: AsrSegment[]; durationSec?: number; disabled: boolean; locale: 'zh' | 'en'; onChange: (value: DubbingOptions) => void }) {
  const zh = locale === 'zh';
  const [speakerId, setSpeakerId] = useState('');
  const speakers = dubbingSpeakers(transcript); const multiple = speakers.length > 1;
  const activeSpeaker = speakers.find((speaker) => speaker.id === speakerId) ?? speakers[0];
  const turns = multiple ? dubbingTurns(transcript, durationSec) : [];
  const selectedVoice = multiple && activeSpeaker ? dubbingVoiceFor(activeSpeaker.id, speakers, value) : value.voiceId;
  const chooseVoice = (voiceId: string) => onChange(multiple && activeSpeaker ? { ...value, voiceId: activeSpeaker.id === speakers[0].id ? voiceId : value.voiceId, speakerVoices: { ...value.speakerVoices, [activeSpeaker.id]: voiceId } } : { ...value, voiceId });
  const [crossLanguageVoices, setCrossLanguageVoices] = useState(false);
  const [voiceRevision, setVoiceRevision] = useState(0);
  const [voices, setVoices] = useState<VoiceAsset[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [lipAvailable, setLipAvailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/studio/dubbing-lipsync', { signal: controller.signal }).then((response) => response.json()).then((body) => setLipAvailable(body.lipSyncAvailable === true)).catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); setVoices([]);
    const language = DUBBING_LANGUAGES.find((entry) => entry.id === value.language)?.code ?? 'en';
    // A personal voice's language describes its sample, not a target-language restriction.
    void fetch('/api/studio/voices?limit=500', { signal: controller.signal }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.detail ?? body.error ?? '声音加载失败'); return body.voices ?? []; })
      .then((items: VoiceAsset[]) => {
        if (controller.signal.aborted) return;
        const ready = items.filter((voice) => voice.status === 'ready');
        const native = ready.filter((voice) => voice.source === 'system' && (voice.languages?.length ? voice.languages : [voice.language]).includes(language));
        setCrossLanguageVoices(!native.length);
        setVoices([...ready.filter((voice) => voice.source !== 'system'), ...(native.length ? native : ready.filter((voice) => voice.source === 'system'))]);
      })
      .catch(() => { if (!controller.signal.aborted) setError(zh ? '声音暂时无法加载，请刷新重试。' : 'Voices could not load. Refresh and retry.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [value.language, zh, voiceRevision]);
  const selectClass = 'text-ink h-8 w-48 max-w-[70%] border-0 bg-transparent shadow-none hover:bg-panel-2';
  return <fieldset disabled={disabled} className="space-y-5 disabled:opacity-50">
    <div className="text-ink flex items-center justify-between gap-4 text-sm"><span>{zh ? '目标语言' : 'Target language'}</span>
      <Select disabled={disabled} value={value.language} onValueChange={(language) => onChange({ ...value, language, voiceId: '', speakerVoices: undefined, script: undefined, turnScripts: undefined })}>
        <SelectTrigger aria-label={zh ? '目标语言' : 'Target language'} className={selectClass}><SelectValue /></SelectTrigger>
        <SelectContent className="max-h-72">{DUBBING_LANGUAGES.map((language) => <SelectItem key={language.id} value={language.id}>{language[locale]}</SelectItem>)}</SelectContent>
      </Select>
    </div>
    {multiple && <div className="space-y-2">
      <div aria-label={zh ? '说话人' : 'Speakers'} className="flex gap-1 overflow-x-auto">
        {speakers.map((speaker, index) => <button key={speaker.id} type="button" disabled={disabled} aria-pressed={activeSpeaker?.id === speaker.id} onClick={() => setSpeakerId(speaker.id)} className={`shrink-0 rounded-md px-2.5 py-2 text-xs ${activeSpeaker?.id === speaker.id ? 'bg-panel-2 text-ink' : 'text-ink-3 hover:text-ink'}`}>
          {zh ? `说话人 ${index + 1}` : `Speaker ${index + 1}`}{!dubbingVoiceFor(speaker.id, speakers, value) && <span className="text-ink-4 ml-1">{zh ? '待选' : 'Choose voice'}</span>}
        </button>)}
      </div>
      <p className="text-ink-3 line-clamp-2 text-xs leading-relaxed">{activeSpeaker?.sample}</p>
    </div>}
    <DubbingVoicePicker key={value.language + (activeSpeaker?.id ?? '')} voices={voices} value={selectedVoice} loading={loading} disabled={disabled} locale={locale} language={DUBBING_LANGUAGES.find((entry) => entry.id === value.language)?.code ?? 'en'} onCreated={() => setVoiceRevision((revision) => revision + 1)} onChange={chooseVoice} />
    {crossLanguageVoices && !loading && <p className="text-ink-4 text-xs">{zh ? '这些音色也可用于所选语言。' : 'These voices also support the selected language.'}</p>}
    <label className="text-ink flex items-start gap-3 text-sm"><input type="checkbox" checked={value.lipSync} disabled={disabled || ((multiple || !lipAvailable) && !value.lipSync)} onChange={(event) => onChange({ ...value, lipSync: event.target.checked })} className="mt-1 size-4 accent-[var(--color-accent)]" /><span>{zh ? '口型同步' : 'Lip sync'}<span className="text-ink-3 mt-1 block text-xs">{multiple ? (zh ? '多人视频暂不支持口型同步。' : 'Lip sync is not yet available for multiple speakers.') : lipAvailable ? (zh ? '让嘴型跟随新配音，额外消耗积分。' : 'Match mouth movements to the new voice. Uses additional credits.') : (zh ? '暂不可用' : 'Currently unavailable')}</span></span></label>
    <p className="text-ink-4 text-xs">{zh ? '新配音将替换原音轨，并适配原片时长。' : 'The new voice replaces the original audio and fits the video duration.'}</p>
    {!multiple && (translatedText || value.script) && <details className="pt-2"><summary className="text-ink cursor-pointer text-sm">{zh ? '配音文案' : 'Voice script'}</summary><textarea dir="auto" aria-label={zh ? '配音文案' : 'Voice script'} value={value.script ?? translatedText ?? ''} maxLength={DUBBING_MAX_SCRIPT_CHARS} rows={7} onChange={(event) => onChange({ ...value, script: event.target.value })} className="bg-panel-2 text-ink mt-3 w-full resize-y rounded-md border-0 p-3 text-sm leading-relaxed outline-none focus-visible:ring-1 focus-visible:ring-ink-4" /></details>}
    {multiple && translatedTurns?.length === turns.length && <details className="pt-2"><summary className="text-ink cursor-pointer text-sm">{zh ? '配音文案' : 'Voice script'}</summary>
      <div className="mt-3 max-h-80 space-y-4 overflow-y-auto">{turns.map((turn, index) => <label key={turn.id} className="text-ink-3 block text-xs">
        {zh ? '说话人' : 'Speaker'} {speakers.findIndex((speaker) => speaker.id === turn.speaker) + 1} · {Math.floor(turn.start / 60)}:{String(Math.floor(turn.start % 60)).padStart(2, '0')}
        <textarea dir="auto" disabled={disabled} rows={2} maxLength={DUBBING_MAX_SCRIPT_CHARS} value={value.turnScripts?.[turn.id] ?? translatedTurns[index]} onChange={(event) => onChange({ ...value, turnScripts: { ...value.turnScripts, [turn.id]: event.target.value } })} className="bg-panel-2 text-ink mt-1 w-full resize-y rounded-md border-0 p-2 text-xs leading-relaxed outline-none focus-visible:ring-1 focus-visible:ring-ink-4" />
      </label>)}</div>
    </details>}
    {error && <p role="alert" className="text-ink text-xs">{error}</p>}
  </fieldset>;
}
