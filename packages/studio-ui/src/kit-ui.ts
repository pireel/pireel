/** Shared kit-component UI glue: sample props for inserts/previews (content fields
 *  localized; design fields lean on the kit's own defaults). */

import { t } from './i18n';

export function kitSampleProps(cid: string): Record<string, unknown> {
  if (cid === 'metric') return { value: '47%', trend: 'up' };
  if (cid === 'callout') return { text: t('presets.sampleText') };
  if (cid === 'lowerThird') return { title: t('kitSample.ltTitle'), subtitle: t('kitSample.ltSub') };
  return {};
}
