import type { ReactNode } from 'react';
import type { CaptionStyle } from '@pireel/studio-engine/composition';
import { DEFAULT_CAPTION_PRESET, DEFAULT_SUB_CAPTION_PRESET } from '@pireel/studio-engine/caption-presets';
import { captionTaskStyle, type CaptionTaskDimensions, type CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import { studioProviders } from '@pireel/studio-engine/providers';
import { CaptionStylePanel } from './caption-style-panel';
import { SceneCheckbox } from './scene-form-controls';

type Patch = Partial<CaptionStyle>;

/**
 * Scene caption look: the workbench's own style panel writing `options.caption`, plus the
 * auto-highlight switch the workbench offers in its transcript. What a scene picks is exactly
 * what the editor shows when the result is opened there.
 */
export function CaptionTaskStyle({ options, locale, disabled, source, onChange, highlight = true, translation }: {
  options: CaptionTaskOptions; locale: 'zh' | 'en'; disabled: boolean; source?: CaptionTaskDimensions;
  /** Offer the auto-highlight switch (a scene run step; a brand has no run). */
  highlight?: boolean;
  /** Language choice for the translated line, shown in the panel's translation tab. */
  translation?: ReactNode;
  onChange: (update: (current: CaptionTaskOptions) => CaptionTaskOptions) => void;
}) {
  const resolved = { preset: DEFAULT_CAPTION_PRESET, ...captionTaskStyle(options, source) } as CaptionStyle;
  const patchMain = (patch: Patch) => onChange(current => ({ ...current, caption: { ...current.caption, ...patch } }));
  const patchSub = (patch: Patch) => onChange(current => ({ ...current, caption: { ...current.caption, sub: { ...current.caption.sub, ...patch } as CaptionStyle } }));
  const canHighlight = !!studioProviders().autoHighlight;
  return <div className="space-y-4">
    <h2 className="text-ink text-sm font-medium">{locale === 'zh' ? '字幕样式' : 'Caption style'}</h2>
    <div className="border-line flex max-h-[520px] min-h-0 flex-col rounded-lg border">
      <CaptionStylePanel active generating={disabled} translationControls={translation} onPickPreset={(preset, patch) => patchMain({ ...patch, preset })} styleCtl={{
        main: resolved,
        sub: { preset: DEFAULT_SUB_CAPTION_PRESET, ...resolved.sub } as CaptionStyle,
        bilingualOn: !!options.translationLanguage,
        onMainPatch: patchMain,
        onSubPatch: ({ lang: _lang, ...patch }) => patchSub(patch),
      }} />
    </div>
    {highlight && (canHighlight || options.highlights) && <SceneCheckbox label={locale === 'zh' ? '自动高亮重点词' : 'Auto highlight'} checked={!!options.highlights} disabled={disabled || !canHighlight}
      onChange={highlights => onChange(current => ({ ...current, highlights }))}
      description={locale === 'zh' ? '用 AI 挑出每句值得高亮的词，颜色跟随字幕样式。' : 'AI picks the words worth highlighting in each sentence, colored by the caption style.'} />}
  </div>;
}
