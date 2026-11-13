'use client';

import { useEffect, useState } from 'react';
import { IntlProvider } from 'use-intl';
import { UiI18nProvider, uiMessagesForLocale } from '@pireel/ui/i18n';
import { Toaster } from '@pireel/ui/toast';
import { studioProviders, setStudioProviders, unavailableProviders, type StudioProviders } from '@pireel/studio-engine/providers';
import { HyperframesWorkbench } from './hyperframes-workbench';
import { useEditorPageMark } from './editor-page-mark';
import { StudioShellProvider, type StudioShell } from './shell-context';
import { setStudioLocale, studioLocale } from './i18n';

const LOCAL_SERVICES = unavailableProviders('Configure AI and storage providers in the editor host.');
const NO_EXTENSIONS: StudioShell = {};
export interface PireelEditorProps {
  projectId: string;
  locale?: 'zh' | 'en';
  /** AI, storage and transport adapters supplied by the embedding app. */
  providers?: StudioProviders;
  /** Optional business UI such as a product workflow entry or curated catalog. */
  extensions?: StudioShell;
  className?: string;
}
/** The original full editor, packaged for embedding. Product pages and presets are host extensions. */
export function PireelEditor({ projectId, locale = 'zh', providers = LOCAL_SERVICES, extensions = NO_EXTENSIONS, className = 'h-full w-full min-h-0' }: PireelEditorProps) {
  const [ready, setReady] = useState(false);
  useEditorPageMark();
  useEffect(() => {
    const previous = studioProviders(); const previousLocale = studioLocale();
    setStudioProviders(providers); setStudioLocale(locale); setReady(true);
    return () => { setStudioProviders(previous); setStudioLocale(previousLocale); };
  }, [providers, locale]);
  if (!ready) return null;
  return <IntlProvider locale={locale} timeZone="UTC" messages={{}}>
    <UiI18nProvider messages={uiMessagesForLocale(locale)}>
      <StudioShellProvider value={extensions}>
        <div className={`pireel-editor-theme ${className}`}><HyperframesWorkbench key={projectId} projectId={projectId}/></div>
      </StudioShellProvider>
      <Toaster/>
    </UiI18nProvider>
  </IntlProvider>;
}
