'use client';

import { Image, Sparkles, UserRound } from 'lucide-react';
import type { ClipPipLayout } from '@pireel/studio-engine/editor-document';
import { CLIP_PIP_LAYOUTS, pipGeometry, pipTemplateKey, resolvePipGeometry, type PipCorner, type PipOptions, type PipSize, type PipTemplate } from '@pireel/studio-engine/pip-layout';
import { t } from './i18n';
import { InlineLayoutPositionPicker } from './layout-strategy-picker';
import { SceneSelect, sceneChoiceClass } from './scene-form-controls';

type Dimensions = { width: number; height: number };
/** The footage shape a layout is previewed with when the picture's own shape is unknown. */
export const PIP_SAMPLE_FOOTAGE: Dimensions = { width: 1920, height: 1080 };

/**
 * A layout's thumbnail: the geometry the canvas and footage will get, drawn with one quiet palette,
 * showing only what stays visible.
 */
export function PipTemplateDiagram({ template, options, canvas = { width: 1080, height: 1920 }, asset = PIP_SAMPLE_FOOTAGE }: { template: PipTemplate; options?: PipOptions; canvas?: Dimensions; asset?: Dimensions }) {
  const ratio = { aspectRatio: `${canvas.width} / ${canvas.height}` };
  // Smart fit mixes layouts shot by shot, so its card shows several.
  if (template === 'smart') return <div aria-hidden="true" className="bg-line relative grid w-full grid-cols-2 content-center gap-px overflow-hidden" style={ratio}>
    {(['presenter', 'split', 'inset', 'dim'] as const).map(layout => <PipTemplateDiagram key={layout} template={layout} options={options} canvas={canvas} asset={asset}/>)}
    <Sparkles className="text-ink-2 absolute right-0.5 top-0.5 size-3"/>
  </div>;
  const geometry = options ? resolvePipGeometry({ ...options, template }, canvas, asset) : pipGeometry(template, canvas, asset);
  const rect = (box: { x: number; y: number; w: number; h: number }) => ({ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` });
  const media = geometry.media; const speaker = geometry.speaker;
  // The full-frame presenter is visible unless footage covers the whole frame.
  const presenterBehind = !(media.w >= .99 && media.h >= .99) && !speaker;
  return <div aria-hidden="true" className="bg-panel-2 relative w-full overflow-hidden" style={ratio}>
    {presenterBehind && <UserRound className="text-ink-4 absolute bottom-0 left-[18%] h-[58%] w-[64%]" strokeWidth={1.25}/>}
    {template === 'dim' && <div className="bg-ink/25 absolute inset-0"/>}
    <div className="bg-accent/15 border-accent/35 absolute flex items-center justify-center border" style={rect(media)}><Image className="text-accent-ink/70 h-[38%] max-h-5 w-[38%] max-w-5" strokeWidth={1.25}/></div>
    {speaker && <div className={'absolute flex items-end justify-center overflow-hidden ' + (geometry.speakerCutout ? '' : 'bg-panel border-ink-4/60 border')} style={rect(speaker)}><UserRound className="text-ink-3 h-[85%] w-[85%]" strokeWidth={1.25}/></div>}
  </div>;
}

/** A layout's name; split layouts say where the footage sits, side by side on a landscape canvas. */
export function pipTemplateLabel(id: PipTemplate, portrait: boolean) {
  const key = pipTemplateKey(id);
  return t((id === 'split' || id === 'split-bottom') && !portrait ? `${key}Side` : key);
}

const CORNERS: { id: PipCorner; label: string }[] = [
  { id: 'top-left', label: 'customFrame.corner.topLeft' },
  { id: 'top-right', label: 'customFrame.corner.topRight' },
  { id: 'bottom-left', label: 'customFrame.corner.bottomLeft' },
  { id: 'bottom-right', label: 'customFrame.corner.bottomRight' },
];
const SIZES: PipSize[] = ['small', 'medium', 'large'];

/**
 * The layouts one picture over the speaker can take, the same ones the picture-in-picture scene
 * offers: full frame, a window, the speaker in a window, a split, or a dimmed backdrop.
 */
export function PipLayoutPanel({ value, canvas, asset, onChange }: {
  value: ClipPipLayout | null;
  canvas: Dimensions;
  /** The picture's own shape, so windows keep it. */
  asset?: Dimensions;
  onChange: (layout: ClipPipLayout | null) => void;
}) {
  const portrait = canvas.height >= canvas.width;
  const shape = asset?.width && asset.height ? asset : PIP_SAMPLE_FOOTAGE;
  const options: PipOptions = { template: value?.layout ?? 'full', ...(value?.position ? { position: value.position } : {}), ...(value?.size ? { size: value.size } : {}) };
  const windowed = value?.layout === 'inset' || value?.layout === 'presenter';
  const pick = (layout: ClipPipLayout['layout'] | null) => onChange(layout ? { layout, ...(value?.position ? { position: value.position } : {}), ...(value?.size ? { size: value.size } : {}) } : null);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3 text-[11.5px]">
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('panels.pipLayout')}>
        {([null, ...CLIP_PIP_LAYOUTS] as const).map((layout) => {
          const selected = (value?.layout ?? null) === layout;
          const template = layout ?? 'full';
          return (
            <button key={template} type="button" role="radio" aria-checked={selected} onClick={() => pick(layout)} className={sceneChoiceClass(selected) + ' p-1.5 text-center'}>
              <span className="mx-auto block w-full max-w-16"><PipTemplateDiagram template={template} options={{ ...options, template }} canvas={canvas} asset={shape} /></span>
              <span className="mt-1 block truncate text-[10px]">{pipTemplateLabel(template, portrait)}</span>
            </button>
          );
        })}
      </div>
      {windowed && value && (
        <>
          <InlineLayoutPositionPicker
            title={t('customFrame.corner.position')}
            options={CORNERS.map((corner) => ({ id: corner.id, label: t(corner.label) }))}
            value={value.position ?? 'bottom-right'}
            onPick={(position) => onChange({ ...value, position: position as PipCorner })}
          />
          <SceneSelect
            label={t('panels.size')}
            value={value.size ?? 'medium'}
            options={SIZES.map((size) => ({ value: size, label: t(`panels.pipSize.${size}`) }))}
            onChange={(size) => onChange({ ...value, size })}
          />
        </>
      )}
    </div>
  );
}
