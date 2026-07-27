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
import { Music, Upload, Trash2, Wand2 } from 'lucide-react';
import { AUDIO_DEFAULT_DB, AUDIO_FADE_IN_SEC, AUDIO_FADE_OUT_SEC, AUDIO_SPEED_MAX, AUDIO_SPEED_MIN, type AudioClip } from '@pireel/studio-engine/composition';
import { t } from './i18n';

const VOL_MIN = -40;

export function MusicPanel({
  clips,
  selectedId,
  onSelect,
  usable,
  onUpload,
  onPatch,
  onPreviewVolume,
  onRemove,
  onGenerate,
  generating,
  denoise,
  onSetDenoise,
}: {
  clips: AudioClip[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Per-clip byte availability (dead blob after reload = false → row shows the missing hint). */
  usable: (c: AudioClip) => boolean;
  onUpload: () => void;
  onPatch: (id: string, patch: Partial<Pick<AudioClip, 'startSec' | 'volumeDb' | 'fadeInSec' | 'fadeOutSec' | 'speed'>>) => void;
  onPreviewVolume: (id: string, db: number) => void;
  onRemove: (id: string) => void;
  onGenerate: (prompt: string, durationSec: number) => void;
  generating: boolean;
  /** Narration denoise (main source): strength null = off; status/progress mirror the bake. */
  denoise: { strength: number | null; status: 'baking' | 'ready' | 'failed' | null; progress: number };
  onSetDenoise: (strength: number | null) => void;
}) {
  const sel = clips.find((c) => c.id === selectedId) ?? null;
  const committedDb = Math.round(sel?.volumeDb ?? AUDIO_DEFAULT_DB);
  const [dragDb, setDragDb] = useState<number | null>(null);
  useEffect(() => setDragDb(null), [selectedId]);
  const dbValue = dragDb ?? committedDb;
  const commitDb = () => {
    if (sel && dragDb != null && dragDb !== committedDb) onPatch(sel.id, { volumeDb: dragDb });
    setDragDb(null);
  };
  const [prompt, setPrompt] = useState('');
  const [genSec, setGenSec] = useState(60);

  const numField = (label: string, value: number, min: number, max: number, step: number, unit: string, commit: (v: number) => void) => (
    <div className="flex items-center gap-2">
      <span className="text-ink-3 w-14 shrink-0">{label}</span>
      <input
        key={`${sel?.id}:${label}:${value}`}
        type="number"
        min={min}
        max={max}
        step={step}
        defaultValue={value}
        onBlur={(e) => {
          const v = Math.max(min, Math.min(max, Number(e.target.value)));
          if (Number.isFinite(v) && v !== value) commit(v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="border-line bg-paper text-ink w-16 rounded-md border px-2 py-1 tabular-nums"
        aria-label={label}
      />
      <span className="text-ink-4">{unit}</span>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="border-line text-ink-4 border-b px-3 py-1.5 text-[10.5px]">{t('panels.musicBedHint')}</div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-3 text-[11.5px]">
        {/* Track list (selection shared with the timeline lane) */}
        {clips.length > 0 && (
          <section className="flex flex-col gap-1">
            {clips.map((c) => (
              <div
                key={c.id}
                className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition ${selectedId === c.id ? 'border-accent bg-accent/10' : 'border-line hover:border-line-2'}`}
              >
                <button type="button" onClick={() => onSelect(selectedId === c.id ? null : c.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <Music className={`size-3.5 shrink-0 ${selectedId === c.id ? 'text-accent' : 'text-ink-4'}`} />
                  <span className="text-ink min-w-0 flex-1 truncate">{c.label || t('panels.musicBed')}</span>
                  <span className="text-ink-4 shrink-0 text-[10px] tabular-nums">
                    {(c.startSec ?? 0).toFixed(1)}s{c.durationSec != null ? ` · ${Math.round(c.durationSec)}s` : ''}
                  </span>
                </button>
                {!usable(c) && <span className="text-accent shrink-0 text-[10px]">{t('panels.musicFileMissingShort')}</span>}
                <button type="button" onClick={() => onRemove(c.id)} aria-label={t('panels.removeMusic')} className="text-ink-4 hover:text-ink shrink-0">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </section>
        )}

        {/* Selected clip's settings */}
        {sel && (
          <section className="flex flex-col gap-2.5">
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
                onPreviewVolume(sel.id, v);
              }}
              onPointerUp={commitDb}
              onKeyUp={commitDb}
              onBlur={commitDb}
              className="zoom-range w-full"
              aria-label={t('panels.volume')}
            />
            {numField(t('panels.fadeIn'), sel.fadeInSec ?? AUDIO_FADE_IN_SEC, 0, 10, 0.1, 's', (v) => onPatch(sel.id, { fadeInSec: v }))}
            {numField(t('panels.fadeOut'), sel.fadeOutSec ?? AUDIO_FADE_OUT_SEC, 0, 10, 0.1, 's', (v) => onPatch(sel.id, { fadeOutSec: v }))}
            {numField(t('panels.speedRate'), sel.speed ?? 1, AUDIO_SPEED_MIN, AUDIO_SPEED_MAX, 0.05, '×', (v) => onPatch(sel.id, { speed: v }))}
            <div className="text-ink-4 text-[10.5px]">{t('panels.speedPitchNote')}</div>
          </section>
        )}

        {/* Add content: upload / generate (both register into the assets library) */}
        <section className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onUpload}
            className="border-line-2 text-ink hover:border-accent hover:text-accent flex items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-3 font-medium"
          >
            <Upload className="size-3.5" />
            {t('panels.uploadMusic')}
          </button>
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
