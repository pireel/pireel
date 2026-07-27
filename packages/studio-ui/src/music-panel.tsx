'use client';

/**
 * Music panel (global, like captions — the bed spans the whole edited timeline, not a shot):
 * add a bed by upload or generation, then level/duck/loop knobs; plus the loudness-unify action
 * (align inserted clips to the main narration via per-shot volumeDb).
 *
 * Level UI speaks dB (bed levels live at -30..-10 where a linear percent slider is all mush);
 * everything else is a switch. Live volume preview goes straight to the engine bed element
 * (onPreviewVolume), commit on release — same drag discipline as the framing panel.
 */

import { useEffect, useState } from 'react';
import { Music, Upload, Trash2, Wand2 } from 'lucide-react';
import { BGM_DEFAULT_DB, type BgmTrack } from '@pireel/studio-engine/composition';
import { t } from './i18n';

const VOL_MIN = -40;

export function MusicPanel({
  bgm,
  fileMissing,
  hasInserts,
  onUpload,
  onReconnect,
  onPatch,
  onPreviewVolume,
  onRemove,
  onGenerate,
  generating,
  onNormalize,
  normalizing,
  normalizeNote,
  denoise,
  onSetDenoise,
}: {
  bgm: BgmTrack | null;
  /** Bed exists in the comp but its bytes aren't mounted (dead blob after reload, recover failed). */
  fileMissing: boolean;
  hasInserts: boolean;
  onUpload: () => void;
  onReconnect: () => void;
  onPatch: (patch: Partial<Pick<BgmTrack, 'volumeDb' | 'duck' | 'loop' | 'startSec'>>) => void;
  onPreviewVolume: (db: number) => void;
  onRemove: () => void;
  onGenerate: (prompt: string, durationSec: number) => void;
  generating: boolean;
  onNormalize: () => void;
  normalizing: boolean;
  normalizeNote: string | null;
  /** Narration denoise (main source): strength null = off; status/progress mirror the bake. */
  denoise: { strength: number | null; status: 'baking' | 'ready' | 'failed' | null; progress: number };
  onSetDenoise: (strength: number | null) => void;
}) {
  const committedDb = Math.round(bgm?.volumeDb ?? BGM_DEFAULT_DB);
  const [dragDb, setDragDb] = useState<number | null>(null);
  useEffect(() => setDragDb(null), [bgm?.src]);
  const dbValue = dragDb ?? committedDb;
  const commitDb = () => {
    if (dragDb != null && dragDb !== committedDb) onPatch({ volumeDb: dragDb });
    setDragDb(null);
  };
  const [prompt, setPrompt] = useState('');
  const [genSec, setGenSec] = useState(60);

  const toggle = (label: string, on: boolean, cb: (v: boolean) => void) => (
    <div className="flex items-center justify-between">
      <span className="text-ink-3">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => cb(!on)}
        className={`h-4.5 w-8 rounded-full p-0.5 transition ${on ? 'bg-accent' : 'bg-ink-4/30'}`}
      >
        <span className={`block h-3.5 w-3.5 rounded-full bg-white transition ${on ? 'translate-x-3.5' : ''}`} />
      </button>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="border-line text-ink-4 border-b px-3 py-1.5 text-[10.5px]">{t('panels.musicBedHint')}</div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-3 text-[11.5px]">
        {!bgm ? (
          <>
            <button
              type="button"
              onClick={onUpload}
              className="border-line-2 text-ink hover:border-accent hover:text-accent flex items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-4 font-medium"
            >
              <Upload className="size-3.5" />
              {t('panels.uploadMusic')}
            </button>
            <section className="flex flex-col gap-1.5">
              <div className="text-ink flex items-center gap-1.5 font-medium">
                <Wand2 className="size-3" />
                {t('panels.generateMusic')}
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t('panels.musicPromptPlaceholder')}
                rows={2}
                className="border-line bg-paper text-ink placeholder:text-ink-4 w-full resize-none rounded-md border px-2 py-1.5"
              />
              <div className="flex items-center gap-2">
                <span className="text-ink-3 shrink-0">{t('panels.musicDurationSec')}</span>
                <input
                  type="number"
                  min={10}
                  max={300}
                  value={genSec}
                  onChange={(e) => setGenSec(Math.max(10, Math.min(300, Number(e.target.value) || 60)))}
                  className="border-line bg-paper text-ink w-16 rounded-md border px-2 py-1 tabular-nums"
                  aria-label={t('panels.musicDurationSec')}
                />
                <button
                  type="button"
                  disabled={generating || !prompt.trim()}
                  onClick={() => onGenerate(prompt.trim(), genSec)}
                  className="bg-accent ml-auto rounded-md px-3 py-1.5 font-medium text-white disabled:opacity-40"
                >
                  {generating ? t('panels.generatingMusic') : t('panels.generate')}
                </button>
              </div>
            </section>
          </>
        ) : (
          <>
            <div className="border-line flex items-center gap-2 rounded-lg border px-2.5 py-2">
              <Music className="text-accent size-3.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-ink truncate font-medium">{bgm.label || t('panels.musicBed')}</div>
                {bgm.durationSec != null && <div className="text-ink-4 text-[10.5px] tabular-nums">{Math.round(bgm.durationSec)}s</div>}
              </div>
              <button type="button" onClick={onRemove} aria-label={t('panels.removeMusic')} className="text-ink-4 hover:text-ink">
                <Trash2 className="size-3.5" />
              </button>
            </div>
            {fileMissing && (
              <button type="button" onClick={onReconnect} className="text-accent -mt-2 text-left text-[10.5px] underline">
                {t('panels.musicFileMissingReconnect')}
              </button>
            )}
            <section className="flex flex-col gap-1.5">
              <div className="text-ink flex items-center justify-between font-medium">
                <span>{t('panels.volume')}</span>
                <span className="text-ink-4 tabular-nums">{dbValue}dB</span>
              </div>
              <input
                type="range"
                min={VOL_MIN}
                max={0}
                step={1}
                value={dbValue}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setDragDb(v);
                  onPreviewVolume(v);
                }}
                onPointerUp={commitDb}
                onKeyUp={commitDb}
                onBlur={commitDb}
                className="zoom-range w-full"
                aria-label={t('panels.volume')}
              />
            </section>
            <section className="flex flex-col gap-2">
              {toggle(t('panels.duckUnderSpeech'), bgm.duck !== false, (v) => onPatch({ duck: v }))}
              {toggle(t('panels.loopMusic'), bgm.loop !== false, (v) => onPatch({ loop: v }))}
            </section>
          </>
        )}

        {/* Narration denoise (main source): bake-based — inference once per source, strength re-blends in seconds */}
        <section className="border-line flex flex-col gap-2 border-t pt-3">
          {toggle(t('panels.denoiseNarration'), denoise.strength != null, (v) => onSetDenoise(v ? 0.6 : null))}
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

        <section className="border-line flex flex-col gap-1.5 border-t pt-3">
          <div className="text-ink font-medium">{t('panels.unifyLoudness')}</div>
          <div className="text-ink-4 text-[10.5px]">{t('panels.unifyLoudnessHint')}</div>
          <button
            type="button"
            disabled={normalizing || !hasInserts}
            onClick={onNormalize}
            className="border-line-2 text-ink hover:border-accent hover:text-accent rounded-md border px-3 py-1.5 font-medium disabled:opacity-40"
          >
            {normalizing ? t('panels.measuringLoudness') : t('panels.unifyLoudnessRun')}
          </button>
          {normalizeNote && <div className="text-ink-3 text-[10.5px]">{normalizeNote}</div>}
        </section>
      </div>
    </div>
  );
}
