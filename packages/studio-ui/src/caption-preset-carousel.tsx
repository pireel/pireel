import { dubbingCaptionSample } from './caption-preview-text';
import { SceneCardCarousel } from './scene-card-carousel';
import { BRAND_CAPTION_PRESET_ID, CAPTION_TASK_PRESETS, captionTaskStyle, type CaptionTaskDimensions, type CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import { studioProviders } from '@pireel/studio-engine/providers';
import { brandCaptionStyle } from '@pireel/studio-engine/brand-kit';
import { CanvasCaptionPreview } from './canvas-caption-preview';

export function CaptionPresetCarousel({ options, locale, disabled, onSelect, source }: { source?: CaptionTaskDimensions; options: CaptionTaskOptions; locale: 'zh' | 'en'; disabled: boolean; onSelect: (id: string) => void }) {
  const presets = [
    // The picked brand's own captions come first; any other card restyles captions but keeps the brand.
    ...(options.brand ? [{ id: BRAND_CAPTION_PRESET_ID, name: { zh: '品牌字幕', en: 'Brand captions' }, style: brandCaptionStyle(options.brand) }] : []),
    ...CAPTION_TASK_PRESETS.filter((item) => item.id !== 'keywords' || !!studioProviders().captionEmphasis),
  ];
  return <SceneCardCarousel items={presets} selectedId={options.presetId}
    header={<h2 className="text-ink text-sm font-medium">{locale === 'zh' ? '字幕样式' : 'Caption style'}</h2>}
    label={locale === 'zh' ? '字幕样式列表' : 'Caption styles'}
    previousLabel={locale === 'zh' ? '上一页样式' : 'Previous styles'} nextLabel={locale === 'zh' ? '下一页样式' : 'Next styles'}
    renderItem={(item) => <button key={item.id} type="button" disabled={disabled} aria-pressed={options.presetId === item.id} onClick={() => onSelect(item.id)} className="group w-full min-w-0 text-center focus-visible:outline-2 focus-visible:outline-accent">
        <span className={'bg-panel block aspect-[1.15] overflow-hidden rounded-lg border-2 ' + (options.presetId === item.id ? 'border-ink' : 'border-transparent group-hover:border-ink-4')}><CanvasCaptionPreview style={options.presetId === item.id ? captionTaskStyle(options, source) : item.style} locale={locale} sampleText={dubbingCaptionSample(options)} tile /></span>
        <span className="text-ink-3 mt-2 block truncate text-xs">{item.name[locale]}</span>
      </button>}
  />;
}
