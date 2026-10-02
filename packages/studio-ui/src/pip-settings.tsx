import { SceneCheckbox, SceneSelect } from './scene-form-controls';
import { PipVisual } from './pip-visual';
import type { ReactNode } from 'react';
import { UserRound, Image, Sparkles, ImagePlus, Check } from 'lucide-react';
import { DEFAULT_PIP_OPTIONS, PIP_PICKER_TEMPLATES, pipGeometry, resolvePipGeometry, type CaptionBand, type PipOptions, type PipTemplate } from '@pireel/studio-engine/pip-layout';
import type { BrollOptions, BrollAsset } from '@pireel/studio-engine/broll-task';
import { BrollSettings } from './broll-settings';
import { SceneMediaThumb } from './scene-media-picker';
import type { CaptionTaskRecord } from './caption-task-store';

/** A template's thumbnail: the real geometry drawn with one quiet palette, showing only what stays visible. */
export function PipTemplateDiagram({ template, options }: { template: PipTemplate; options?: PipOptions }) {
  const geometry = options ? resolvePipGeometry({ ...options, template }, { width: 1080, height: 1920 }, { width: 1920, height: 1080 }) : pipGeometry(template, { width: 1080, height: 1920 }, { width: 1920, height: 1080 });
  const rect = (box: { x: number; y: number; w: number; h: number }) => ({ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` });
  const media = geometry.media; const speaker = geometry.speaker;
  // The full-frame presenter is visible unless footage covers the whole frame.
  const presenterBehind = !(media.w >= .99 && media.h >= .99) && !speaker;
  return <div aria-hidden="true" className="bg-panel-2 relative aspect-[9/16] w-full overflow-hidden">
    {presenterBehind && <UserRound className="text-ink-4 absolute bottom-0 left-[18%] h-[58%] w-[64%]" strokeWidth={1.25}/>}
    {template === 'dim' && <div className="bg-ink/25 absolute inset-0"/>}
    <div className="bg-accent/15 border-accent/35 absolute flex items-center justify-center border" style={rect(media)}><Image className="text-accent/70 h-[38%] max-h-5 w-[38%] max-w-5" strokeWidth={1.25}/></div>
    {speaker && <div className={'absolute flex items-end justify-center overflow-hidden ' + (geometry.speakerCutout ? '' : 'bg-panel border-ink-4/60 border')} style={rect(speaker)}><UserRound className="text-ink-3 h-[85%] w-[85%]" strokeWidth={1.25}/></div>}
    {template === 'smart' && <Sparkles className="text-ink-3 absolute right-1 top-1 size-3"/>}
  </div>;
}
export function PipSettings({ task, value, disabled, locale, onChange, onBusy }: {
  task: CaptionTaskRecord; value: BrollOptions; disabled: boolean; locale: 'zh' | 'en'; onChange: (value: BrollOptions) => void; onBusy: (busy: boolean) => void;
}) {
  const zh = locale === 'zh';
  const config = value.pip ?? DEFAULT_PIP_OPTIONS;
  const update = (patch: Partial<PipOptions>) => onChange({ ...value, pip: { ...config, ...patch } });
  const layout = resolvePipGeometry(config, task, value.assets[0] ?? { width: 1920, height: 1080 }, task);
  const windowLayout = ['inset', 'presenter', 'cutout-small'].includes(layout.resolvedTemplate);
  const portrait = task.height >= task.width;
  // Split layouts name where the footage sits; on a landscape canvas the halves are side by side.
  const templateLabel = (id: string, label: string) => id === 'split' ? (zh ? (portrait ? '素材在上' : '素材在左') : (portrait ? 'Footage on top' : 'Footage left')) : id === 'split-bottom' ? (zh ? (portrait ? '素材在下' : '素材在右') : (portrait ? 'Footage below' : 'Footage right')) : label;
  const ai = value.aiFootage === true; const local = value.localFootage !== false;
  return <div className="space-y-5">
    <section>
      <h2 className="text-ink mb-2 text-sm font-medium">{zh ? '添加画中画素材' : 'Add footage'}</h2>
      <div className="space-y-2">
        <FootageSource icon={<Sparkles size={18} strokeWidth={1.5}/>} title={zh ? 'AI 生成' : 'AI generated'} note={zh ? '分析视频文案，AI 智能匹配画中画素材。' : 'Reads the narration and makes matching footage.'} checked={ai} disabled={disabled} onChange={aiFootage => onChange({ ...value, aiFootage })}/>
        <FootageSource icon={<ImagePlus size={18} strokeWidth={1.5}/>} title={zh ? '本地导入' : 'Your files'} checked={local} disabled={disabled} onChange={localFootage => onChange({ ...value, localFootage })}>
          {local && <BrollSettings task={task} value={value} disabled={disabled} locale={locale} onChange={onChange} onBusy={onBusy} compact/>}
        </FootageSource>
      </div>
    </section>
    <section>
    <h2 className="text-ink mb-2 text-sm font-medium">{zh ? '画中画模板' : 'Layout template'}</h2>
    <div className="grid grid-cols-4 gap-x-2 gap-y-3 p-px" role="group" aria-label={zh ? '选择画中画模板' : 'Choose a layout'}>
      {PIP_PICKER_TEMPLATES.map(template => { const selected = (value.pip?.template ?? DEFAULT_PIP_OPTIONS.template) === template.id; return <button key={template.id} type="button" disabled={disabled} aria-pressed={selected} onClick={() => update({ template: template.id })} className="group min-w-0 text-center focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50">
        <span className={'block rounded-md p-[3px] ring-inset transition-shadow ' + (selected ? 'ring-ink ring-2' : 'ring-line ring-1 group-hover:ring-ink-4')}><PipTemplateDiagram template={template.id} options={config}/></span>
        <span className={'mt-1.5 block truncate text-[11px] ' + (selected ? 'text-ink font-medium' : 'text-ink-3')}>{templateLabel(template.id, template[locale])}</span>
      </button>; })}
    </div>
    {windowLayout && <div className="mt-3 space-y-3">
        <SceneSelect label={zh ? '小窗位置' : 'Inset position'} value={config.position ?? 'bottom-right'} disabled={disabled} onChange={position => update({ position })} options={[
          { value: 'bottom-right', label: zh ? '右下' : 'Bottom right' }, { value: 'bottom-left', label: zh ? '左下' : 'Bottom left' },
          { value: 'top-right', label: zh ? '右上' : 'Top right' }, { value: 'top-left', label: zh ? '左上' : 'Top left' },
        ]} />
        <SceneSelect label={zh ? '小窗大小' : 'Inset size'} value={config.size ?? 'medium'} disabled={disabled} onChange={size => update({ size })} options={[
          { value: 'small', label: zh ? '小' : 'Small' }, { value: 'medium', label: zh ? '中' : 'Medium' }, { value: 'large', label: zh ? '大' : 'Large' },
        ]} />
    </div>}
    </section>
    <SceneCheckbox label={zh ? '字幕' : 'Captions'} checked={value.captions} disabled={disabled} onChange={captions => onChange({ ...value, captions })} />
  </div>;
}

/** One footage source: a checkable row, with its own controls underneath when it has any. */
function FootageSource({ icon, title, note, checked, disabled, onChange, children }: { icon: ReactNode; title: string; note?: string; checked: boolean; disabled: boolean; onChange: (checked: boolean) => void; children?: ReactNode }) {
  return <div className={'bg-panel-2/60 rounded-lg ' + (children ? 'pb-3' : '')}>
    <button type="button" role="checkbox" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className="flex w-full items-center gap-3 px-3 py-3 text-left disabled:opacity-50">
      <span className="text-ink-2 shrink-0">{icon}</span>
      <span className="min-w-0 flex-1"><span className="text-ink block text-sm">{title}</span>{note && <span className="text-ink-3 mt-0.5 block text-xs">{note}</span>}</span>
      <span aria-hidden="true" className={'flex size-5 shrink-0 items-center justify-center rounded-full ' + (checked ? 'bg-ink text-bg' : 'border-line border')}>{checked && <Check size={12} strokeWidth={2.5}/>}</span>
    </button>
    {children && <div className="px-3">{children}</div>}
  </div>;
}

export function PipLayoutPreview({ options, source, canvas, asset, scope, locale, captions }: {
  options: PipOptions; source: string; canvas: { width: number; height: number }; asset?: BrollAsset; scope: string; locale: 'zh' | 'en';
  /** Where captions will sit, so the preview places windows the way the render will. */
  captions?: CaptionBand;
}) {
  const layout = resolvePipGeometry(options, canvas, asset ?? { width: 1920, height: 1080 }, canvas, captions);
  const rect = (box: { x: number; y: number; w: number; h: number }) => ({ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` });
  return <div className="pointer-events-none absolute inset-0" aria-label={locale === 'zh' ? '画中画布局预览' : 'Layout preview'}>
    {layout.background && <div className="absolute inset-0" style={{ background: layout.background }}/>} 
    <div className="bg-panel-2 absolute flex items-center justify-center overflow-hidden" style={rect(layout.media)}>
      {asset ? <SceneMediaThumb asset={asset} scope={scope} fit={layout.mediaFit}/> : <span className="text-ink-3 text-xs">{locale === 'zh' ? '画中画素材' : 'Your footage'}</span>}
    </div>
    {layout.speaker && source && <PipVisual src={source} canvas={canvas} dimensions={canvas} box={layout.speaker} fit={layout.speakerFit} anchorY={layout.speakerAnchorY} cutout={layout.speakerCutout} layer={2}/>}
    <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-1 text-[10px] text-white">{locale === 'zh' ? '布局示意' : 'Layout preview'}</span>
  </div>;
}
