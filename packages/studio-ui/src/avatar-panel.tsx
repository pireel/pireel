'use client';

/**
 * AI avatar (数字人) panel — a first-level nav slot in the library rail. v1 ships the entry
 * point ahead of the feature (a deliberate placeholder): the nav structure stays stable while
 * the generation pipeline lands behind it.
 */

import { UserRound } from 'lucide-react';
import { t } from './i18n';

export function AvatarPanel() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <span className="bg-panel-2 text-ink-4 flex size-12 items-center justify-center rounded-full">
        <UserRound size={22} />
      </span>
      <div className="text-ink text-[13px] font-medium">{t('workbench.avatarComingSoon')}</div>
      <div className="text-ink-4 max-w-[240px] text-[11.5px] leading-relaxed">{t('workbench.avatarComingSoonDesc')}</div>
    </div>
  );
}
