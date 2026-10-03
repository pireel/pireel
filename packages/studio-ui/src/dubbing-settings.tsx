import { SceneCheckbox, SceneSelect } from './scene-form-controls';
import { useEffect, useMemo, useState } from 'react';
import { DUBBING_LANGUAGES, dubbingSpeakers, dubbingVoiceFor, type DubbingOptions } from '@pireel/studio-engine/dubbing-task';
import { DubbingVoicePicker } from './dubbing-voice-picker';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import type { VoiceAsset } from './voice-card';
export function DubbingSettings({ value, transcript = [], disabled, locale, onChange, showLanguage = true, autoSelectVoice = true, durationSec }: { showLanguage?: boolean; autoSelectVoice?: boolean; /** Picture length, for lip sync's 10 s–10 min range. */ durationSec?: number; value: DubbingOptions; transcript?: AsrSegment[]; disabled: boolean; locale: 'zh' | 'en'; onChange: (value: DubbingOptions) => void }) {
  const zh = locale === 'zh';
  const [speakerId, setSpeakerId] = useState('');
  const speakers = dubbingSpeakers(transcript); const multiple = speakers.length > 1;
  const activeSpeaker = speakers.find((speaker) => speaker.id === speakerId) ?? speakers[0];
  const selectedVoice = multiple && activeSpeaker ? dubbingVoiceFor(activeSpeaker.id, speakers, value) : value.voiceId;
  const chooseVoice = (voiceId: string) => onChange(multiple && activeSpeaker ? { ...value, voiceId: activeSpeaker.id === speakers[0].id ? voiceId : value.voiceId, speakerVoices: { ...value.speakerVoices, [activeSpeaker.id]: voiceId } } : { ...value, voiceId });
  const [voiceRevision, setVoiceRevision] = useState(0);
  const [allVoices, setAllVoices] = useState<VoiceAsset[]>([]); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    // A personal voice's language describes its sample, not a target-language restriction.
    void fetch('/api/studio/voices?limit=500', { signal: controller.signal }).then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.detail ?? body.error ?? '声音加载失败'); return body.voices ?? []; })
      .then((items: VoiceAsset[]) => {
        if (controller.signal.aborted) return;
        setAllVoices(items.filter((voice) => voice.status === 'ready'));
      })
      .catch(() => { if (!controller.signal.aborted) setError(zh ? '声音暂时无法加载，请刷新重试。' : 'Voices could not load. Refresh and retry.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [zh, voiceRevision]);
  const [lipAvailable, setLipAvailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/studio/dubbing-lipsync', { signal: controller.signal }).then((response) => response.json()).then((body) => { if (!controller.signal.aborted) setLipAvailable(body.lipSyncAvailable === true); }).catch(() => {});
    return () => controller.abort();
  }, []);
  const lipBlocked = multiple ? (zh ? '多人视频暂不支持口型同步。' : 'Lip sync is not yet available for several speakers.')
    : durationSec !== undefined && (durationSec < 10 || durationSec > 600) ? (zh ? '口型同步支持 10 秒到 10 分钟的视频。' : 'Lip sync works on videos from 10 seconds to 10 minutes.')
    : !lipAvailable ? (zh ? '暂不可用。' : 'Currently unavailable.') : '';
  const language = DUBBING_LANGUAGES.find((entry) => entry.id === value.language)?.code ?? 'en';
  const native = useMemo(() => allVoices.filter((voice) => voice.source === 'system' && (voice.languages?.length ? voice.languages : [voice.language]).includes(language)), [allVoices, language]);
  const voices = useMemo(() => allVoices.filter((voice) => voice.source !== 'system' || voice.id === selectedVoice || !native.length || native.includes(voice)), [allVoices, native, selectedVoice]);
  useEffect(() => {
    if (!autoSelectVoice || disabled || loading || selectedVoice || !voices.length) return;
    const first = voices.find((voice) => voice.source !== 'system') ?? voices[0];
    chooseVoice(first.id);
  }, [autoSelectVoice, disabled, loading, selectedVoice, voices, chooseVoice]);
  return <fieldset disabled={disabled} className="min-w-0 space-y-4 disabled:opacity-50">
    {showLanguage && <SceneSelect label={zh ? '目标语言' : 'Target language'} value={value.language} disabled={disabled} onChange={language => onChange({ ...value, language, script: undefined, turnScripts: undefined })} options={DUBBING_LANGUAGES.map(language => ({ value: language.id, label: language[locale] }))} />}
    {multiple && <div className="space-y-2">
      <div aria-label={zh ? '说话人' : 'Speakers'} className="flex gap-1 overflow-x-auto">
        {speakers.map((speaker, index) => <button key={speaker.id} type="button" disabled={disabled} aria-pressed={activeSpeaker?.id === speaker.id} onClick={() => setSpeakerId(speaker.id)} className={`shrink-0 rounded-md px-2.5 py-2 text-xs ${activeSpeaker?.id === speaker.id ? 'bg-panel-2 text-ink' : 'text-ink-3 hover:text-ink'}`}>
          {zh ? `说话人 ${index + 1}` : `Speaker ${index + 1}`}{!dubbingVoiceFor(speaker.id, speakers, value) && <span className="text-ink-4 ml-1">{zh ? '待选' : 'Choose voice'}</span>}
        </button>)}
      </div>
      <p className="text-ink-3 line-clamp-2 text-xs leading-relaxed">{activeSpeaker?.sample}</p>
    </div>}
    <DubbingVoicePicker voices={voices} value={selectedVoice} loading={loading} disabled={disabled} locale={locale} language={DUBBING_LANGUAGES.find((entry) => entry.id === value.language)?.code ?? 'en'} onCreated={() => setVoiceRevision((revision) => revision + 1)} onChange={chooseVoice} />
    <p className="text-ink-4 text-xs">{zh ? '新配音将替换原音轨，并适配原片时长。' : 'The new voice replaces the original audio and fits the video duration.'}</p>
    <SceneCheckbox label={zh ? '口型同步' : 'Lip sync'} checked={value.lipSync} disabled={disabled || (!!lipBlocked && !value.lipSync)} onChange={(lipSync) => onChange({ ...value, lipSync })}
      description={lipBlocked || (zh ? '让嘴型跟随新配音。处理较慢，约为视频时长的 30 倍，可以离开页面稍后回来。' : 'Matches mouth movements to the new voice. Slow: about 30 times the video length; you can leave and come back.')} />
    {error && <p role="alert" className="text-ink text-xs">{error}</p>}
  </fieldset>;
}
