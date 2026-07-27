'use client';

/**
 * Audio panel (global): the music lane's track list + the selected clip's settings
 * (level / fade-in / fade-out / speed), plus narration denoise. Plain NLE semantics —
 * no looping, no ducking; clips are placed, trimmed by their own length, and sum when
 * they overlap. Selection is shared with the timeline lane (click a chip there or a
 * row here). Volume drags preview live via the engine element; commit on release —
 * same drag discipline as the framing panel.
 */

import { useEffect, useState } from 'react';
import { Music } from 'lucide-react';
import { AUDIO_DEFAULT_DB, AUDIO_FADE_MAX_SEC, AUDIO_SPEED_MAX, AUDIO_SPEED_MIN, AUDIO_VOLUME_DB_MAX, SHOT_FADE_MAX_SEC, VOLUME_DB_MIN, type AudioClip, type VideoShot, audioClipDefaults, dbToGain } from '@pireel/studio-engine/composition';
import { t } from './i18n';


export function MusicPanel({
  clips,
  selectedId,
  usable,
  onPatch,
  onPreviewVolume,
  shot,
  shotCount,
  onSetShotAudio,
  denoise,
  onSetDenoise,
}: {
  clips: AudioClip[];
  selectedId: string | null;
  /** Per-clip byte availability (dead blob after reload = false → row shows the missing hint). */
  usable: (c: AudioClip) => boolean;
  onPatch: (id: string, patch: Partial<Pick<AudioClip, 'startSec' | 'volumeDb' | 'fadeInSec' | 'fadeOutSec' | 'speed' | 'inSec' | 'outSec'>>) => void;
  onPreviewVolume: (id: string, db: number) => void;
  /** Selected shot (video track). With no audio clip selected this panel edits the FOOTAGE's own sound. */
  shot: VideoShot | null;
  shotCount: number;
  onSetShotAudio: (patch: { volumeDb?: number; mute?: boolean; fadeInSec?: number; fadeOutSec?: number }, all: boolean) => void;
  /** Narration denoise (main source): strength null = off; status/progress mirror the bake. */
  denoise: { strength: number | null; status: 'baking' | 'ready' | 'failed' | null; progress: number };
  onSetDenoise: (strength: number | null) => void;
}) {
  const sel = clips.find((c) => c.id === selectedId) ?? null;
  const selD = sel ? audioClipDefaults(sel) : null;
  const committedDb = Math.round(sel?.volumeDb ?? AUDIO_DEFAULT_DB);
  const [dragDb, setDragDb] = useState<number | null>(null);
  useEffect(() => setDragDb(null), [selectedId]);
  // Video-track volume speaks percent of source level (its ceiling is 0 dB — see VideoShot.volumeDb),
  // matching the framing panel's control rather than inventing a second unit for the same field.
  const shotCommittedPct = Math.round(dbToGain(shot?.volumeDb ?? 0) * 100);
  const [shotDrag, setShotDrag] = useState<number | null>(null);
  useEffect(() => setShotDrag(null), [shot?.id]);
  const shotPct = shotDrag ?? shotCommittedPct;
  const commitShot = () => {
    if (shotDrag != null && shotDrag !== shotCommittedPct) {
      onSetShotAudio({ volumeDb: shotDrag <= 0 ? VOLUME_DB_MIN : Math.max(VOLUME_DB_MIN, Math.min(0, 20 * Math.log10(shotDrag / 100))) }, !shot);
    }
    setShotDrag(null);
  };
  const dbValue = dragDb ?? committedDb;
  const commitDb = () => {
    if (sel && dragDb != null && dragDb !== committedDb) onPatch(sel.id, { volumeDb: dragDb });
    setDragDb(null);
  };

  /** Slider row: drags update the local value at once (readout follows the finger), commit on release —
   *  fades/speed don't have a live-preview channel, so the value only lands in comp when you let go. */
  const [dragVal, setDragVal] = useState<{ k: string; v: number } | null>(null);
  useEffect(() => setDragVal(null), [selectedId]);
  const slider = (k: string, label: string, value: number, min: number, max: number, step: number, fmt: (v: number) => string, commit: (v: number) => void) => {
    const shown = dragVal?.k === k ? dragVal.v : value;
    const done = () => {
      setDragVal((d) => {
        if (d?.k === k && d.v !== value) commit(d.v);
        return null;
      });
    };
    return (
      <div className="flex flex-col gap-1">
        <div className="text-ink-3 flex items-center justify-between">
          <span>{label}</span>
          <span className="text-ink-4 tabular-nums">{fmt(shown)}</span>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={shown}
          onChange={(e) => setDragVal({ k, v: Number(e.target.value) })}
          onPointerUp={done}
          onKeyUp={done}
          onBlur={done}
          className="zoom-range w-full"
          aria-label={label}
        />
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="border-line text-ink-4 border-b px-3 py-1.5 text-[10.5px]">{t('panels.musicBedHint')}</div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-3 text-[11.5px]">
        {/* Settings only: this panel adjusts the SELECTED clip. Adding content (upload / generate) lives in
            the assets panel, the same place images and video come from. */}
        {/* No audio clip selected → this is the VIDEO's own sound (the selected shot, or every shot when
            none is selected), so switching here always lands on something adjustable. */}
        {!sel && (
          <section className="flex flex-col gap-2.5">
            <div className="text-ink flex items-center justify-between font-medium">
              <span>{t('panels.videoSound')}</span>
              <span className="text-ink-4 text-[10.5px]">{shot ? t('panels.thisShotOnly') : t('panels.allShotsN', { n: shotCount })}</span>
            </div>
            {shotCount === 0 ? (
              <div className="text-ink-4">{t('panels.uploadVideoForPortraitFx')}</div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-ink-3 w-7 shrink-0">{t('panels.volume')}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={shotPct}
                    disabled={!!shot?.audioMuted}
                    onChange={(e) => setShotDrag(Number(e.target.value))}
                    onPointerUp={commitShot}
                    onKeyUp={commitShot}
                    onBlur={commitShot}
                    className="zoom-range w-full"
                    aria-label={t('panels.volume')}
                  />
                  <span className="text-ink-4 w-8 shrink-0 text-right tabular-nums">{shotPct}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-ink-3">{t('panels.mute')}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={!!shot?.audioMuted}
                    aria-label={t('panels.mute')}
                    onClick={() => onSetShotAudio({ mute: !shot?.audioMuted }, !shot)}
                    className={`h-4.5 w-8 rounded-full p-0.5 transition ${shot?.audioMuted ? 'bg-accent' : 'bg-ink-4/30'}`}
                  >
                    <span className={`block h-3.5 w-3.5 rounded-full bg-white transition ${shot?.audioMuted ? 'translate-x-3.5' : ''}`} />
                  </button>
                </div>
                {shot ? (
                  <>
                    {slider('sfi', t('panels.fadeIn'), shot.audioFadeInSec ?? 0, 0, SHOT_FADE_MAX_SEC, 0.1, (v) => `${v.toFixed(1)}s`, (v) => onSetShotAudio({ fadeInSec: v }, false))}
                    {slider('sfo', t('panels.fadeOut'), shot.audioFadeOutSec ?? 0, 0, SHOT_FADE_MAX_SEC, 0.1, (v) => `${v.toFixed(1)}s`, (v) => onSetShotAudio({ fadeOutSec: v }, false))}
                  </>
                ) : (
                  <div className="text-ink-4 text-[10.5px]">{t('panels.selectShotForFades')}</div>
                )}
                <div className="text-ink-4 text-[10.5px]">{t('panels.selectAudioClipFirst')}</div>
              </>
            )}
          </section>
        )}
        {sel && (
          <section className="flex flex-col gap-2.5">
            <div className="text-ink flex items-center gap-1.5 font-medium">
              <Music className="text-accent size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{sel.label || t('panels.musicBed')}</span>
              {!usable(sel) && <span className="text-accent shrink-0 text-[10px]">{t('panels.musicFileMissingShort')}</span>}
            </div>
            <div className="text-ink flex items-center justify-between font-medium">
              <span>{t('panels.volume')}</span>
              <span className="text-ink-4 tabular-nums">{dbValue <= VOLUME_DB_MIN ? t('panels.muted') : `${dbValue > 0 ? '+' : ''}${dbValue}dB`}</span>
            </div>
            <input
              type="range"
              min={VOLUME_DB_MIN}
              max={AUDIO_VOLUME_DB_MAX}
              step={1}
              value={dbValue}
              onChange={(e) => {
                const v = Number(e.target.value);
                setDragDb(v);
                onPreviewVolume(sel.id, v);
              }}
              onPointerUp={commitDb}
              onKeyUp={commitDb}
              onBlur={commitDb}
              className="zoom-range w-full"
              aria-label={t('panels.volume')}
            />
            {/* Effective values (fades are clamped so the two never overlap) — showing the raw stored number
                would promise a fade the clip is too short to hold. */}
            {slider('fi', t('panels.fadeIn'), selD!.fadeInSec, 0, AUDIO_FADE_MAX_SEC, 0.1, (v) => `${v.toFixed(1)}s`, (v) => onPatch(sel.id, { fadeInSec: v }))}
            {slider('fo', t('panels.fadeOut'), selD!.fadeOutSec, 0, AUDIO_FADE_MAX_SEC, 0.1, (v) => `${v.toFixed(1)}s`, (v) => onPatch(sel.id, { fadeOutSec: v }))}
            {slider('sp', t('panels.speedRate'), selD!.speed, AUDIO_SPEED_MIN, AUDIO_SPEED_MAX, 0.05, (v) => `${v.toFixed(2)}×`, (v) => onPatch(sel.id, { speed: v }))}
            <div className="text-ink-4 text-[10.5px]">{t('panels.speedPitchNote')}</div>
          </section>
        )}

        {/* Narration denoise (main source): bake-based — inference once per source, strength re-blends in seconds */}
        <section className="border-line flex flex-col gap-2 border-t pt-3">
          <div className="flex items-center justify-between">
            <span className="text-ink-3">{t('panels.denoiseNarration')}</span>
            <button
              type="button"
              role="switch"
              aria-checked={denoise.strength != null}
              aria-label={t('panels.denoiseNarration')}
              onClick={() => onSetDenoise(denoise.strength != null ? null : 0.6)}
              className={`h-4.5 w-8 rounded-full p-0.5 transition ${denoise.strength != null ? 'bg-accent' : 'bg-ink-4/30'}`}
            >
              <span className={`block h-3.5 w-3.5 rounded-full bg-white transition ${denoise.strength != null ? 'translate-x-3.5' : ''}`} />
            </button>
          </div>
          {denoise.strength != null && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-ink-3 w-7 shrink-0">{t('panels.denoiseStrength')}</span>
                <input
                  key={denoise.strength}
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  defaultValue={Math.round(denoise.strength * 100)}
                  onPointerUp={(e) => onSetDenoise(Number((e.target as HTMLInputElement).value) / 100)}
                  onKeyUp={(e) => onSetDenoise(Number((e.target as HTMLInputElement).value) / 100)}
                  className="zoom-range w-full"
                  aria-label={t('panels.denoiseStrength')}
                />
                <span className="text-ink-4 w-8 shrink-0 text-right tabular-nums">{Math.round(denoise.strength * 100)}%</span>
              </div>
              {denoise.status === 'baking' && (
                <div className="text-ink-4 text-[10.5px]">{t('panels.denoiseBaking', { pct: Math.round(denoise.progress * 100) })}</div>
              )}
              {denoise.status === 'failed' && <div className="text-ink-4 text-[10.5px]">{t('panels.denoiseFailedHint')}</div>}
              {denoise.status === 'ready' && <div className="text-ink-4 text-[10.5px]">{t('panels.denoiseReadyHint')}</div>}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
