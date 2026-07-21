import { IntlProvider } from 'use-intl';
import { Toaster } from '@pireel/ui/toast';
import { HyperframesWorkbench } from '@pireel/studio-ui/hyperframes-workbench';
import { setStudioLocale } from '@pireel/studio-ui/i18n';
import { shellLocale } from './locale';

/** Single local project — drafts persist per-id in localStorage/OPFS, so one id is
 *  one workspace. Swap in your own project chooser if you need more. */
const PROJECT_ID = 'local';

// Editor-package UI language (zh source strings + built-in en dictionary); must be
// set before the first render — see @pireel/studio-engine/i18n.
setStudioLocale(shellLocale);

export function App() {
  return (
    <IntlProvider locale={shellLocale} timeZone="UTC" messages={{}}>
      <div className="bg-bg flex h-screen">
        <div className="flex min-h-0 min-w-0 flex-1 p-4">
          <HyperframesWorkbench projectId={PROJECT_ID} />
        </div>
      </div>
      <Toaster />
    </IntlProvider>
  );
}
