/**
 * studio-ui's i18n entry: the core (t/setStudioLocale) lives in the engine package (see its
 * header for the rules — slug keys / zh catalog is the source of truth / no t() at module
 * scope / client-only); here we register the UI package's own catalogs — **registration runs
 * in the module body** so a consumer's import { t } triggers it, surviving sideEffects:false
 * tree-shaking (a pure side-effect import would get shaken out — don't change it to that).
 */

import { registerMessages } from '@pireel/studio-engine/i18n';
import { UI_ZH } from './messages/zh';
import { UI_EN } from './messages/en';

export { t, setStudioLocale, studioLocale, missingKeys, type StudioLocale } from '@pireel/studio-engine/i18n';

registerMessages('zh', UI_ZH);
registerMessages('en', UI_EN);
