'use client';

/**
 * THE level control. Every sound in the composition — a shot's own audio, a music bed — is set with this
 * one slider, on one dB scale, from every panel that offers it. There is no second implementation and no
 * second unit; when the range or the wording changes, it changes everywhere at once.
 *
 * Writes through on change (no drag buffer): the engine treats a level-only respec as a cheap in-place
 * swap, so the value shown is always the value playing.
 */

import { VOLUME_DB_MAX, VOLUME_DB_MIN } from '@pireel/studio-engine/composition';
import { t } from './i18n';

/** -60 dB is true silence, not "very quiet" — say so instead of printing the number. */
export function formatDb(db: number): string {
  return db <= VOLUME_DB_MIN ? t('panels.muted') : `${db > 0 ? '+' : ''}${db}dB`;
}

export function AudioLevel({ db, disabled, onChange }: { db: number; disabled?: boolean; onChange: (db: number) => void }) {
  const value = Math.round(db);
  return (
    <div className="flex flex-col gap-1">
      <div className="text-ink flex items-center justify-between font-medium">
        <span>{t('panels.volume')}</span>
        <span className="text-ink-4 tabular-nums">{formatDb(value)}</span>
      </div>
      <input
        type="range"
        min={VOLUME_DB_MIN}
        max={VOLUME_DB_MAX}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="zoom-range w-full disabled:opacity-40"
        aria-label={t('panels.volume')}
      />
    </div>
  );
}
