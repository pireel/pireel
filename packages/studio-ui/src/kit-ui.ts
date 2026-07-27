/** Shared kit-component UI glue: sample props for inserts/previews (content fields
 *  localized; design fields lean on the kit's own defaults). */

import { t } from './i18n';

/** Seconds a freshly inserted kit block occupies — also the preview length, so entrance/exit
 *  choreography (lower thirds settle out, steps pace their reveals) reads the same in both. */
export const KIT_INSERT_DURATION = 4;

export function kitSampleProps(cid: string): Record<string, unknown> {
  if (cid === 'metric') return { value: '47%', trend: 'up' };
  if (cid === 'callout') return { text: t('presets.sampleText') };
  if (cid === 'lowerThird') return { title: t('kitSample.ltTitle'), subtitle: t('kitSample.ltSub') };
  if (cid === 'kpi')
    return {
      cells: [
        { label: t('kitSample.kpiA'), value: '2.4M', trend: 'up' },
        { label: t('kitSample.kpiB'), value: '18,392' },
        { label: t('kitSample.kpiC'), value: '0.8%', trend: 'down' },
      ],
    };
  if (cid === 'comparison') return { aLabel: t('kitSample.cmpA'), aValue: '6', bLabel: t('kitSample.cmpB'), bValue: '2', winner: 'b' };
  if (cid === 'chart')
    return {
      title: t('kitSample.chartTitle'),
      unit: '%',
      series: [
        { label: t('kitSample.chartA'), value: 42 },
        { label: t('kitSample.chartB'), value: 31 },
        { label: t('kitSample.chartC'), value: 17 },
      ],
    };
  if (cid === 'steps') return { items: [{ text: t('kitSample.step1') }, { text: t('kitSample.step2') }, { text: t('kitSample.step3') }] };
  if (cid === 'title') return { title: t('kitSample.titleMain'), sub: t('kitSample.titleSub') };
  return {};
}
