import { useId } from 'react';
import { imageSizeChoices, imageSizeGroupsFor, normalizeImageSettings, qualityConfigFor, type ImageSettings } from '@pireel/studio-engine/image-generation-settings';
import { SceneSelect } from './scene-form-controls';
import { t } from './i18n';

/** Quality levels with a name of their own (`ui.quality.<level>`); others show the model's label. */
const QUALITY_NAMED = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
/** The same model/aspect/resolution/quality controls in covers, image studio and chat. */
export function ImageGenerationFields({ value, models, onChange, disabled = false, showModel = true }: {
  value: ImageSettings; models: readonly { id: string; name: string }[]; onChange(value: ImageSettings): void;
  disabled?: boolean; showModel?: boolean;
}) {
  const owner = useId();
  const current = normalizeImageSettings(value);
  const choices = imageSizeChoices(current.modelId);
  const selected = choices.find(choice => choice.value === current.size)!;
  const ratios = [...new Set(choices.map(choice => choice.aspect))];
  const tiers = choices.filter(choice => choice.aspect === selected.aspect);
  const quality = qualityConfigFor(current.modelId);
  const pixelSizes = !!imageSizeGroupsFor(current.modelId);
  const update = (patch: Partial<ImageSettings>) => onChange(normalizeImageSettings({ ...current, ...patch }));
  return <div className="space-y-3" data-image-generation-fields={owner}>
    {showModel && <SceneSelect portalOwner={owner} label={t('ui.imageGenerationFields.imageModel')} value={current.modelId} options={models.map(model => ({ value: model.id, label: model.name }))} onChange={modelId => update({ modelId })} disabled={disabled || !models.length} />}
    <div className="grid grid-cols-2 gap-3">
      <SceneSelect portalOwner={owner} label={t('ui.imageGenerationFields.aspectRatio')} value={selected.aspect} options={ratios.map(value => ({ value, label: value }))} onChange={aspect => update({ size: (choices.find(choice => choice.aspect === aspect && choice.tier === selected.tier) ?? choices.find(choice => choice.aspect === aspect))!.value })} disabled={disabled} />
      {pixelSizes ? <SceneSelect portalOwner={owner} label={t('ui.imageGenerationFields.resolution')} value={current.size} options={tiers.map(choice => ({ value: choice.value, label: `${choice.tier} · ${choice.resolution}` }))} onChange={size => update({ size })} disabled={disabled || tiers.length < 2} />
        : quality && <SceneSelect portalOwner={owner} label={t('ui.imageGenerationFields.resolution')} value={current.quality} options={quality.options} onChange={quality => update({ quality })} disabled={disabled || quality.options.length < 2} />}
    </div>
    {pixelSizes && quality && <SceneSelect portalOwner={owner} label={t('ui.imageGenerationFields.quality')} value={current.quality} options={quality.options.map(option => ({ ...option, label: QUALITY_NAMED.has(option.value) ? t(`ui.quality.${option.value}`) : option.label }))} onChange={quality => update({ quality })} disabled={disabled} />}
  </div>;
}
