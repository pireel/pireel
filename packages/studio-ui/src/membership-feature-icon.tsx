'use client';

import { Crown } from 'lucide-react';
import { studioLocale, t } from './i18n';

export function MembershipFeatureIcon({ className = '' }: { className?: string }) {
  const label = t('workbench.membershipFeature');
  return (
    <a
      href={`/${studioLocale()}/pricing`}
      target="_blank"
      rel="noreferrer"
      className={`flex size-6 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 transition-colors hover:bg-amber-500/20 hover:text-amber-700 ${className}`}
      title={label}
      aria-label={label}
    >
      <Crown size={13} strokeWidth={2.2} />
    </a>
  );
}
