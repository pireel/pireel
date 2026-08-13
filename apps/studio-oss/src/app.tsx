import { IntlProvider } from 'use-intl';
import { Toaster } from '@pireel/ui/toast';
import { UiI18nProvider, uiMessagesForLocale } from '@pireel/ui/i18n';
import { HyperframesWorkbench } from '@pireel/studio-ui/hyperframes-workbench';
import { setStudioLocale } from '@pireel/studio-ui/i18n';
import { StudioShellProvider, type StudioShell } from '@pireel/studio-ui/shell-context';
import {
  OSS_STUDIO_DEFAULT_SKILL_ID,
  ossStudioScenarioSkillCatalog,
} from '@pireel/studio-engine/scenario-skills/vite';
import { shellLocale } from './locale';

/** Single local project — drafts persist per-id in localStorage/OPFS, so one id is
 *  one workspace. Swap in your own project chooser if you need more. */
const PROJECT_ID = 'local';

// Editor-package UI language (zh source strings + built-in en dictionary); must be
// set before the first render — see @pireel/studio-engine/i18n.
setStudioLocale(shellLocale);

const SHELL: StudioShell = {
  scenarioSkills: ossStudioScenarioSkillCatalog(shellLocale),
  defaultScenarioSkillId: OSS_STUDIO_DEFAULT_SKILL_ID,
};

export function App() {
  return (
    <IntlProvider locale={shellLocale} timeZone="UTC" messages={{}}>
      <UiI18nProvider messages={uiMessagesForLocale(shellLocale)}>
        <StudioShellProvider value={SHELL}>
          <div className="bg-bg flex h-screen">
            <div className="flex min-h-0 min-w-0 flex-1 p-4">
              <HyperframesWorkbench projectId={PROJECT_ID} />
            </div>
          </div>
          <Toaster />
        </StudioShellProvider>
      </UiI18nProvider>
    </IntlProvider>
  );
}
