'use client';

import { Eye, EyeOff, Volume2, VolumeX } from 'lucide-react';
import { t } from './i18n';

/** Track mute toggle (track header): the NLE speaker icon, in front of the track it silences. Mute is a
 *  TRACK property here rather than a per-clip one — "quiet the music while I listen to the cut" is a
 *  statement about a track, and per-item silencing is already the level slider's bottom stop. */
export function MuteToggle({ muted, onToggle }: { muted: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={muted}
      aria-label={muted ? t('panels.unmuteTrack') : t('panels.muteTrack')}
      onPointerDown={(e) => e.stopPropagation()} // the row itself starts a track drag
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={`hover:bg-panel-2/20 flex h-4 w-4 items-center justify-center rounded transition ${muted ? 'text-accent-ink' : 'text-ink-4 hover:text-ink-2'}`}
    >
      {muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
    </button>
  );
}

export function VisibilityToggle({ hidden, onToggle }: { hidden: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!hidden}
      aria-label={hidden ? t('panels.showTrack') : t('panels.hideTrack')}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={`hover:bg-panel-2/20 flex h-4 w-4 items-center justify-center rounded transition ${hidden ? 'text-accent-ink' : 'text-ink-4 hover:text-ink-2'}`}
    >
      {hidden ? <EyeOff size={12} /> : <Eye size={12} />}
    </button>
  );
}
