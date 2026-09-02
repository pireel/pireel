'use client';

/**
 * Audio panel: settings for whatever is selected — an audio clip (level, solo, fades,
 * speed) or the selected shots' own sound (level, fades). Nothing selected = nothing to
 * adjust, so the section says so instead of silently addressing every shot. Muting isn't
 * here at all: it's per TRACK and lives on the timeline's track header, where an editor
 * expects the speaker icon. Adding audio isn't here either — uploads and generation live
 * in the assets panel, the same place images and video come from.
 *
 * Both level controls are the same control: same dB scale, same range, same code — a shot's
 * sound and a music bed are both just sound. Plain NLE semantics — no looping,
 * no ducking; clips are placed, trimmed, and sum when they overlap. Every control writes
 * through on change; the value shown is the value playing.
 */

import { Music } from 'lucide-react';
import { AUDIO_DEFAULT_DB, AUDIO_FADE_MAX_SEC, AUDIO_SPEED_MAX, AUDIO_SPEED_MIN, SHOT_FADE_MAX_SEC, type AudioClip, type VideoShot, audioClipDefaults } from '@pireel/studio-engine/composition';
import { Switch } from '@pireel/ui/switch';
import { AudioLevel } from './audio-level';
import { t } from './i18n';


export function MusicPanel({
  clips,
  selectedId,
  usable,
  onPatch,
  soloId,
  onSolo,
  peakOf,
  shots,
  onSetShotAudio,
  denoise,
  onSetDenoise,
}: {
  clips: AudioClip[];
  selectedId: string | null;
  /** Per-clip byte availability (dead blob after reload = false → row shows the missing hint). */
  usable: (c: AudioClip) => boolean;
  onPatch: (id: string, patch: Partial<Pick<AudioClip, 'startSec' | 'volumeDb' | 'fadeInSec' | 'fadeOutSec' | 'speed' | 'inSec' | 'outSec' | 'muted'>>) => void;
  /** Solo = monitoring only (hear this clip alone, footage included): never stored, never exported. */
  soloId: string | null;
  onSolo: (id: string | null) => void;
  /** The clip's true peak (linear, 0..1) once its bytes are decoded — drives the clipping warning. */
  peakOf: (c: AudioClip) => number | null;
  /** SELECTED shots (video track). Empty = nothing selected, so the footage section has no target.
   *  Several = every one of them takes the edit; the values shown are the first one's. */
  shots: VideoShot[];
  onSetShotAudio: (patch: { volumeDb?: number; fadeInSec?: number; fadeOutSec?: number }) => void;
  /** Narration denoise (main source): strength null = off; status/progress mirror the bake. */
  denoise: { strength: number | null; mode: 'light' | 'strong'; status: 'baking' | 'ready' | 'failed' | null; progress: number };
  onSetDenoise: (strength: number | null, mode?: 'light' | 'strong') => void;
}) {
  const sel = clips.find((c) => c.id === selectedId) ?? null;
  const selD = sel ? audioClipDefaults(sel) : null;
  const shot = shots[0] ?? null; // anchor: what the controls display when several shots share the edit
  const dbValue = Math.round(sel?.volumeDb ?? AUDIO_DEFAULT_DB);
  // Clipping: this clip alone, at this level, already exceeds full scale. Only flagged once the bytes are
  // decoded (peak unknown = say nothing rather than guess), and it's a warning, not a cap — the export
  // limiter catches what gets through, but a limiter working hard is not the same as a level set right.
  const selPeak = sel ? peakOf(sel) : null;
  const clipsAt = selPeak && selPeak > 0 ? Math.floor(20 * Math.log10(1 / selPeak)) : null;
  const clipping = clipsAt != null && dbValue > clipsAt;

  /** Slider row: writes straight through on every change — no drag buffer, no commit-on-release. The
   *  value shown is the value applied (and heard); the preview follows comp, so there is nothing to sync. */
  const slider = (label: string, value: number, min: number, max: number, step: number, fmt: (v: number) => string, commit: (v: number) => void) => (
    <div className="flex flex-col gap-1">
      <div className="text-ink-3 flex items-center justify-between">
        <span>{label}</span>
        <span className="text-ink-4 tabular-nums">{fmt(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => commit(Number(e.target.value))}
        className="zoom-range w-full"
        aria-label={label}
      />
    </div>
  );

  return (
    <div className="bg-canvas flex h-full min-h-0 w-full flex-col">
      <div className="bg-panel text-ink-4 flex h-8 shrink-0 items-center px-3 text-[10.5px]">{t('panels.musicBedHint')}</div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-3 text-[11.5px]">
        {/* No audio clip selected → the selected shots' own sound. Selection is exclusive, so exactly one
            of these two sections is live at a time, and neither addresses anything the user didn't pick. */}
        {!sel && (
          <section className="flex flex-col gap-2.5">
            <div className="text-ink flex items-center justify-between font-medium">
              <span>{t('panels.videoSound')}</span>
              {shots.length > 1 && <span className="text-ink-4 text-[10.5px]">{t('panels.nShotsSelected', { n: shots.length })}</span>}
            </div>
            {!shot ? (
              // Nothing selected: the old fallback quietly addressed EVERY shot, which is a big edit to
              // trigger by accident. Say what to select instead.
              <div className="text-ink-4">{t('panels.selectShotOrAudioFirst')}</div>
            ) : (
              <>
                <AudioLevel db={shot.volumeDb ?? 0} disabled={!!shot.audioMuted} onChange={(db) => onSetShotAudio({ volumeDb: db })} />
                {shot.audioMuted && <div className="text-ink-4 text-[10.5px]">{t('panels.trackMutedHint')}</div>}
                {slider(t('panels.fadeIn'), shot.audioFadeInSec ?? 0, 0, SHOT_FADE_MAX_SEC, 0.1, (v) => `${v.toFixed(1)}s`, (v) => onSetShotAudio({ fadeInSec: v }))}
                {slider(t('panels.fadeOut'), shot.audioFadeOutSec ?? 0, 0, SHOT_FADE_MAX_SEC, 0.1, (v) => `${v.toFixed(1)}s`, (v) => onSetShotAudio({ fadeOutSec: v }))}
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
            <AudioLevel db={dbValue} disabled={!!sel.muted} onChange={(db) => onPatch(sel.id, { volumeDb: db })} />
            {sel.muted && <div className="text-ink-4 text-[10.5px]">{t('panels.trackMutedHint')}</div>}
            {clipping && !sel.muted && <div className="text-accent text-[10.5px]">{t('panels.audioClippingHint', { db: String(clipsAt) })}</div>}
            {/* Solo is the one listening control that IS per clip: it answers "what does this one sound like",
                which is a question about a clip, not about a track. Mute is per track, up on the timeline. */}
            <div className="flex items-center justify-between">
              <span className="text-ink-3">{t('panels.soloListen')}</span>
              <Switch
                checked={soloId === sel.id}
                aria-label={t('panels.soloListen')}
                onCheckedChange={(checked) => onSolo(checked ? sel.id : null)}
              />
            </div>
            {soloId === sel.id && <div className="text-ink-4 text-[10.5px]">{t('panels.soloListenHint')}</div>}
            {/* Effective values (fades are clamped so the two never overlap) — showing the raw stored number
                would promise a fade the clip is too short to hold. */}
            {slider(t('panels.fadeIn'), selD!.fadeInSec, 0, AUDIO_FADE_MAX_SEC, 0.1, (v) => `${v.toFixed(1)}s`, (v) => onPatch(sel.id, { fadeInSec: v }))}
            {slider(t('panels.fadeOut'), selD!.fadeOutSec, 0, AUDIO_FADE_MAX_SEC, 0.1, (v) => `${v.toFixed(1)}s`, (v) => onPatch(sel.id, { fadeOutSec: v }))}
            {slider(t('panels.speedRate'), selD!.speed, AUDIO_SPEED_MIN, AUDIO_SPEED_MAX, 0.05, (v) => `${v.toFixed(2)}×`, (v) => onPatch(sel.id, { speed: v }))}
            <div className="text-ink-4 text-[10.5px]">{t('panels.speedPitchNote')}</div>
          </section>
        )}

        {/* Global settings (no selection needed): the audio tab is a first-level nav item, so this
            section keeps it useful even with nothing selected. Narration denoise (main source):
            bake-based — inference once per source, strength re-blends in seconds */}
        <section className="border-line flex flex-col gap-2 border-t pt-3">
          <div className="text-ink font-medium">{t('panels.globalAudio')}</div>
          <div className="flex items-center justify-between">
            <span className="text-ink-3">{t('panels.denoiseNarration')}</span>
            <Switch
              checked={denoise.strength != null}
              aria-label={t('panels.denoiseNarration')}
              onCheckedChange={(checked) => onSetDenoise(checked ? 0.6 : null)}
            />
          </div>
          {denoise.strength != null && (
            <>
              {/* light = steady floor only (keeps the room's own tone); strong = neural rebuild */}
              <div className="flex items-center gap-1" role="radiogroup" aria-label={t('panels.denoiseMode')}>
                {(['light', 'strong'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={denoise.mode === mode}
                    title={t(mode === 'light' ? 'panels.denoiseModeLightHint' : 'panels.denoiseModeStrongHint')}
                    onClick={() => onSetDenoise(denoise.strength, mode)}
                    className={`h-6 rounded-md border px-2 text-[11px] ${denoise.mode === mode ? 'border-accent text-ink bg-panel-2/60' : 'border-line text-ink-3 hover:border-accent'}`}
                  >
                    {t(mode === 'light' ? 'panels.denoiseModeLight' : 'panels.denoiseModeStrong')}
                  </button>
                ))}
              </div>
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
