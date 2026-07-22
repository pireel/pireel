/**
 * studio-ui's i18n entry: the core (t/setStudioLocale) lives in the engine package (see its header for
 * the three iron rules — Chinese is the key / no t() at module scope / client-only); here we register the
 * UI package's own en dictionary — **registration runs in the module body** so a consumer's import { t }
 * triggers it, surviving sideEffects:false tree-shaking (a pure side-effect import would get shaken out — don't change it to that).
 */

import { registerEnMessages } from '@pireel/studio-engine/i18n';
import { EN_UI } from './messages-en/index';

export { t, setStudioLocale, studioLocale, missingEn, type StudioLocale } from '@pireel/studio-engine/i18n';

registerEnMessages(EN_UI);
