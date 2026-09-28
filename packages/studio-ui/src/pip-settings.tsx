import { SceneSelect } from './scene-form-controls';
import { PipVisual } from './pip-visual';
import { UserRound, Image, Sparkles } from 'lucide-react';
import { DEFAULT_PIP_OPTIONS, PIP_TEMPLATES, pipGeometry, resolvePipGeometry, type PipOptions, type PipTemplate } from '@pireel/studio-engine/pip-layout';
import type { BrollOptions, BrollAsset } from '@pireel/studio-engine/broll-task';
import { BrollSettings } from './broll-settings';
import { SceneMediaThumb } from './scene-media-picker';
import type { CaptionTaskRecord } from './caption-task-store';

export function PipTemplateDiagram({ template, options }: { template: PipTemplate; options?: PipOptions }) {
  const geometry = options ? resolvePipGeometry({ ...options, template }, { width: 1080, height: 1920 }, { width: 1920, height: 1080 }) : pipGeometry(template, { width: 1080, height: 1920 }, { width: 1920, height: 1080 });
  const rect = (box: { x: number; y: number; w: number; h: number }) => ({ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` });
  return <div aria-hidden="true" className="bg-panel-2 relative mx-auto aspect-[9/16] w-full max-w-36 overflow-hidden rounded-md">
    <UserRound className="text-ink-4 absolute bottom-2 left-1/4 h-3/5 w-1/2" strokeWidth={1}/>
    {geometry.background && <div className="absolute inset-0" style={{ background: geometry.background }}/>} 
    <div className="border-ink-4 bg-panel absolute flex items-center justify-center rounded border" style={rect(geometry.media)}><Image className="text-ink-3 h-1/2 w-1/2" strokeWidth={1}/></div>
    {geometry.speaker && <div className={'absolute flex items-center justify-center ' + (geometry.speakerCutout ? '' : 'bg-panel-2 border-ink-4 rounded border')} style={rect(geometry.speaker)}><UserRound className="text-ink-3 h-3/4 w-3/4" strokeWidth={1}/></div>}
    {template === 'smart' && <Sparkles className="text-ink absolute right-2 top-2 size-4"/>}
    <span className="bg-ink-4 absolute bottom-[8%] left-[24%] h-0.5 w-[52%] rounded"/>
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
  return <div>
    <h2 className="text-ink mb-2 text-sm font-medium">{zh ? '画中画模板' : 'Layout template'}</h2>
    <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(76px,1fr))] gap-x-2 gap-y-3" role="group" aria-label={zh ? '选择画中画模板' : 'Choose a layout'}>
      {PIP_TEMPLATES.map(template => <button key={template.id} type="button" disabled={disabled} aria-pressed={value.pip?.template === template.id} onClick={() => update({ template: template.id })} className="min-w-0 text-center focus-visible:outline-2 focus-visible:outline-accent">
        <span className={'mb-2 block rounded-lg border-2 p-1 ' + (value.pip?.template === template.id ? 'border-ink' : 'border-transparent hover:border-ink-4')}><PipTemplateDiagram template={template.id} options={config}/></span>
        <span className="text-ink-3 block text-xs">{template.id === 'split' ? (zh ? (task.height > task.width ? '上下分屏' : '左右分屏') : 'Split screen') : template[locale]}</span>
      </button>)}
    </div>
    <div className="mb-5 space-y-4">
      {windowLayout && <>
        <SceneSelect label={zh ? '小窗位置' : 'Inset position'} value={config.position ?? 'bottom-right'} disabled={disabled} onChange={position => update({ position })} options={[
          { value: 'bottom-right', label: zh ? '右下' : 'Bottom right' }, { value: 'bottom-left', label: zh ? '左下' : 'Bottom left' },
          { value: 'top-right', label: zh ? '右上' : 'Top right' }, { value: 'top-left', label: zh ? '左上' : 'Top left' },
        ]} />
        <SceneSelect label={zh ? '小窗大小' : 'Inset size'} value={config.size ?? 'medium'} disabled={disabled} onChange={size => update({ size })} options={[
          { value: 'small', label: zh ? '小' : 'Small' }, { value: 'medium', label: zh ? '中' : 'Medium' }, { value: 'large', label: zh ? '大' : 'Large' },
        ]} />
      </>}
      {['split', 'presenter', 'cutout', 'cutout-small'].includes(layout.resolvedTemplate) && <SceneSelect label={zh ? '素材画面' : 'Footage framing'} value={config.mediaFit ?? layout.mediaFit} disabled={disabled} onChange={mediaFit => update({ mediaFit })} options={[
        { value: 'contain', label: zh ? '完整显示' : 'Show full frame' }, { value: 'cover', label: zh ? '裁切铺满' : 'Crop to fill' },
      ]} />}
      {(layout.resolvedTemplate === 'split') && <SceneSelect label={zh ? '人物画面' : 'Presenter framing'} value={config.speakerFit ?? layout.speakerFit} disabled={disabled} onChange={speakerFit => update({ speakerFit })} options={[
        { value: 'cover', label: zh ? '裁切铺满' : 'Crop to fill' }, { value: 'contain', label: zh ? '完整显示' : 'Show full frame' },
      ]} />}
    </div>
    <p className="text-ink-3 mb-5 text-xs leading-relaxed">{zh ? '素材小窗默认放在下侧，并留出底部字幕空间。分屏可铺满人物区域；如果裁切不合适，可改为完整显示。' : 'Insets leave room for lower captions. Split layouts can fill the presenter area; choose full frame if the crop does not suit your footage.'}</p>
    <h2 className="text-ink mb-2 text-sm font-medium">{zh ? '本地素材 · AI 匹配' : 'Your footage · AI matching'}</h2>
    <p className="text-ink-3 mb-4 text-xs leading-relaxed">{zh ? '添加图片或视频，AI 根据口播挑选适合出现的片段。素材声音默认关闭，保留口播原声。' : 'Add images or videos. AI selects relevant moments from the narration. Footage is muted; narration stays intact.'}</p>
    <BrollSettings task={task} value={value} disabled={disabled} locale={locale} onChange={onChange} onBusy={onBusy}/>
  </div>;
}

export function PipLayoutPreview({ options, source, canvas, asset, scope, locale }: {
  options: PipOptions; source: string; canvas: { width: number; height: number }; asset?: BrollAsset; scope: string; locale: 'zh' | 'en';
}) {
  const layout = resolvePipGeometry(options, canvas, asset ?? { width: 1920, height: 1080 }, canvas);
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
