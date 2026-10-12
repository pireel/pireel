import { pickImageModel, normalizeImageSettings, imageGenerationParams } from '@pireel/studio-engine/image-generation-settings';
import { ImageGenerationFields } from './image-generation-fields';
import { useEffect, useRef, useState } from 'react';
import { ImageIcon, Loader2 } from 'lucide-react';
import { useQuote } from '@pireel/ui/use-quote';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@pireel/ui/dialog';
import { studioLocale } from './i18n';
import { CoverFrameTimeline } from './cover-frame-timeline';
import { SceneMediaCard } from './scene-media-picker';
import { CoverApplyButton } from './chat-cover-controls';
import { coverFrameTime, coverFrameIdentity, type CoverSourceFrame, type CoverFrameStripData } from './cover-frame-selection';
import type { CoverDraftPatch, CoverGenerateOptions } from './cover-scene';
import type { CoverScene } from './cover-scene';
import type { ProjectCover } from './project-cover';

export function coverSceneStatus(scene?: CoverScene | null): string {
  const zh = studioLocale().startsWith('zh');
  return scene?.phase === 'prepared' ? zh ? '封面提示词已准备' : 'Cover brief ready' : scene?.phase === 'ready' ? zh ? '封面已生成' : 'Cover ready' : scene?.phase === 'failed' ? zh ? '封面制作未完成' : 'Cover incomplete' : scene ? zh ? '正在制作封面' : 'Creating cover' : zh ? '尚未制作封面' : 'No cover yet';
}
export function CoverToolCard({ scene, onOpen }: { scene?: CoverScene | null; onOpen?: () => void }) {
  const zh = studioLocale().startsWith('zh');
  return <div className="border-line rounded-md border px-3 py-2"><div className="text-ink-2 flex items-center gap-2 text-xs"><ImageIcon size={14} /><span>{coverSceneStatus(scene)}</span>{onOpen && <button type="button" onClick={onOpen} className="text-ink ml-auto underline underline-offset-4">{zh ? '打开封面' : 'Open cover'}</button>}</div></div>;
}
export function TimelineCoverPlaceholder({ cover, onOpen }: { cover: ProjectCover; onOpen: () => void }) {
  const zh = studioLocale().startsWith('zh');
  return <button type="button" data-timeline-cover-placeholder onClick={onOpen} aria-label={zh ? '封面占位，打开封面场景' : 'Cover placeholder, open cover scene'} className="border-line bg-panel text-ink-3 flex w-[88px] shrink-0 flex-col items-center gap-2 border-r px-2 py-3 text-xs"><span>{zh ? '封面' : 'Cover'}</span><img src={cover.url} alt={zh ? '当前封面' : 'Current cover'} className="bg-canvas h-20 w-full rounded-sm object-contain" /><span className="text-ink-4 text-[10px]">{zh ? '封面占位' : 'Cover slot'}</span></button>;
}
const timeLabel = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;

export function CoverSceneDialog({ open, scene, applied, busy, onClose, onPrepare, onSaveDraft, onLoadFrames, onPreviewFrame, onGenerate, onApply }: {
  open: boolean; scene: CoverScene | null; applied: ProjectCover | null; busy: boolean;
  onClose(): void;
  onPrepare(rewrite?: boolean): Promise<unknown>;
  onSaveDraft(patch: CoverDraftPatch): Promise<unknown>;
  onLoadFrames(): Promise<CoverFrameStripData>;
  onPreviewFrame(frame: CoverSourceFrame): Promise<Blob>;
  onGenerate(options: CoverGenerateOptions): Promise<unknown>;
  onApply(cover: ProjectCover): Promise<void>;
}) {
  const zh = studioLocale().startsWith('zh'); const say = (cn: string, en: string) => zh ? cn : en;
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [modelId, setModelId] = useState(''); const [size, setSize] = useState(''); const [quality, setQuality] = useState('');
  const [prompt, setPrompt] = useState(''); const [selectedKey, setSelectedKey] = useState(''); const [error, setError] = useState('');
  const [strip, setStrip] = useState<CoverFrameStripData | null>(null);
  const [draftFrame, setDraftFrame] = useState<CoverSourceFrame | null>(null);
  const [referenceUrl, setReferenceUrl] = useState(''); const [readingFrame, setReadingFrame] = useState(false);
  const [savingReference, setSavingReference] = useState(false);
  const selectedFrame = draftFrame ?? scene?.sourceFrame;
  const pending = savingReference || busy || scene?.phase === 'planning' || scene?.phase === 'generating' || scene?.phase === 'starting';
  const callbacks = useRef({ onPrepare, onLoadFrames }); callbacks.current = { onPrepare, onLoadFrames };
  useEffect(() => {
    if (!open) return;
    let alive = true; setError(''); setStrip(null);
    void callbacks.current.onPrepare().catch(() => { if (alive) setError(zh ? '提示词准备失败，请重试。' : 'Could not prepare the prompt. Please retry.'); });
    void callbacks.current.onLoadFrames().then(data => { if (alive) setStrip(data); }).catch(() => { if (alive) setError(zh ? '无法读取视频缩略图，请恢复源视频后重试。' : 'Restore the source video to load its frames.'); });
    return () => { alive = false; };
  }, [open, zh]);
  useEffect(() => {
    if (!open) return; let alive = true;
    void fetch('/api/models?kind=image').then(r => r.json()).then(data => { if (alive) { const list = data.models ?? []; setModels(list); setModelId(current => pickImageModel(list, current || scene?.modelId)); } }).catch(() => {});
    return () => { alive = false; };
  }, [open, scene?.modelId]);
  const scenePrompt = scene?.prompt ?? ''; const sceneSize = scene?.size ?? ''; const sceneQuality = scene?.quality ?? ''; const newestImageKey = scene?.images[0]?.key ?? '';
  useEffect(() => { if (open) setPrompt(scenePrompt); }, [open, scenePrompt]);
  useEffect(() => { if (open) { setSize(sceneSize); setQuality(sceneQuality); } }, [open, sceneSize, sceneQuality]);
  useEffect(() => { setDraftFrame(null); }, [scene?.sourceFrame?.assetId, scene?.sourceFrame?.sourceSec]);
  useEffect(() => { if (open && scene?.phase === 'ready' && newestImageKey) { setSelectedKey(newestImageKey); } }, [open, scene?.phase, newestImageKey]);
  const selectedAsset = selectedFrame?.assetId; const selectedSourceSec = selectedFrame?.sourceSec;
  useEffect(() => {
    setReferenceUrl('');
    if (!open || !selectedAsset || selectedSourceSec === undefined) { setReadingFrame(false); return; }
    let alive = true; let url = ''; setReadingFrame(true);
    const timer = setTimeout(() => {
      void onPreviewFrame({ assetId: selectedAsset, sourceSec: selectedSourceSec }).then(blob => { if (alive) { url = URL.createObjectURL(blob); setReferenceUrl(url); } }).catch(() => { if (alive) setError(zh ? '选中的画面无法读取，请换一帧重试。' : 'Could not read that frame. Choose another frame.'); }).finally(() => { if (alive) setReadingFrame(false); });
    }, 100);
    return () => { alive = false; clearTimeout(timer); if (url) URL.revokeObjectURL(url); };
  }, [open, selectedAsset, selectedSourceSec, onPreviewFrame, zh]);
  const settings = normalizeImageSettings({ modelId, size: size || scene?.size, quality });
  const credits = useQuote({ toolId: 'image-gen', modelId: open ? modelId : '', params: { n: 1, ...imageGenerationParams(settings), reference_count: 1 + (scene?.brandReferences?.length ?? 0) + (scene?.referenceImage ? 1 : 0) } });
  const choices = [...(scene?.images ?? []), ...(scene?.history ?? []), ...(applied ? [applied] : [])];
  const images = [...new Map(choices.map(image => [image.key, image])).values()];
  const main = images.find(image => image.key === selectedKey) ?? images[0];
  const at = strip ? coverFrameTime(strip.ranges, selectedFrame) : 0;
  const saveFrame = async (frame: CoverSourceFrame) => {
    setDraftFrame(frame); setError(''); setSavingReference(true);
    try { await onSaveDraft({ sourceFrame: coverFrameIdentity(frame) }); } catch { setDraftFrame(null); setError(say('选帧未保存，请重试。', 'Frame selection was not saved. Please retry.')); } finally { setSavingReference(false); }
  };
  const failure = scene?.error === 'cover_brand_reference_unavailable' ? say('品牌参考封面读取失败，请重试准备提示词。', 'Could not load the brand covers. Retry preparing the prompt.') : scene?.error === 'cover_insufficient_credits' ? say('积分不足，充值后重试。', 'Not enough credits. Top up and retry.') : scene?.error === 'cover_source_unavailable' ? say('请导入或恢复当前视频。', 'Import or restore the current video.') : say('封面准备或生成未完成，请重试。', 'Cover preparation or generation did not finish. Please retry.');
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}><DialogContent className="studio-scope bg-bg border-line flex h-[min(820px,calc(100vh-3rem))] w-[min(1200px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
    <div className="border-line border-b px-6 py-4 pr-12"><DialogTitle className="text-ink text-lg font-semibold">{say('封面', 'Cover')}</DialogTitle><DialogDescription className="text-ink-3 mt-1 text-xs">{say('结合人物原帧、品牌封面和本期内容，一次生成完整封面。可修改提示词或手动选帧。', 'Generate the complete cover from the original person, brand covers and current topic. Edit the prompt or choose a frame.')}</DialogDescription></div>
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(300px,370px)_minmax(0,1fr)] max-sm:grid-cols-1">
      <div aria-label={say('封面设置', 'Cover settings')} className="border-line flex min-h-0 flex-col gap-3 overflow-y-auto border-r p-5">
        <div className="flex items-center justify-between gap-2"><label htmlFor="cover-full-prompt" className="text-ink text-sm font-medium">{say('完整提示词', 'Full prompt')}</label><button type="button" disabled={pending} onClick={async () => { setError(''); try { await onPrepare(true); } catch { setError(failure); } }} className="text-ink-3 text-xs underline underline-offset-4 disabled:opacity-40">{say('按上下文重写', 'Rewrite from context')}</button></div>
        <textarea id="cover-full-prompt" value={prompt} disabled={pending} onChange={event => setPrompt(event.target.value)} onBlur={() => { if (prompt.trim() && prompt !== scenePrompt) void onSaveDraft({ prompt }).catch(() => setError(say('提示词未保存，请重试。', 'Prompt was not saved. Please retry.'))); }} placeholder={pending ? say('正在根据当前视频与品牌准备完整提示词…', 'Preparing a complete prompt from this video and brand…') : say('编辑完整的封面生图提示词', 'Edit the complete cover-generation prompt')} className="border-line bg-canvas min-h-[150px] flex-1 resize-none rounded-md border p-3 text-sm leading-6" />
        <section aria-label={say('参考图', 'Reference image')} className="shrink-0">
          <div className="text-ink mb-2 text-xs">{say('参考图', 'Reference images')}</div>
          <div className="flex flex-wrap gap-3">
            <div className="w-24"><SceneMediaCard name={`${say('1 · 人物原图', '1 · Original person')} · ${timeLabel(at)}`} locale={zh ? 'zh' : 'en'} disabled={pending}>
              {referenceUrl ? <img src={referenceUrl} alt={say('当前参考图', 'Current reference image')} className="h-full w-full object-contain" /> : <div className="text-ink-4 flex h-full items-center justify-center"><Loader2 size={18} className="animate-spin" /></div>}
            </SceneMediaCard></div>
            {scene?.brandReferences?.map((reference, index) => <div key={reference.key} className="w-24"><SceneMediaCard name={`${index + 2} · ${say('品牌封面', 'Brand cover')}`} locale={zh ? 'zh' : 'en'} disabled={pending}>
              <img src={reference.url} alt={`${say('品牌封面参考', 'Brand cover reference')} ${index + 1}`} className="h-full w-full object-contain" />
            </SceneMediaCard></div>)}
            {scene?.referenceImage && <div className="w-24"><SceneMediaCard name={`${2 + (scene.brandReferences?.length ?? 0)} · ${say('构图参考', 'Layout reference')}`} locale={zh ? 'zh' : 'en'} disabled={pending} onRemove={() => { setSavingReference(true); void onSaveDraft({ referenceImage: null }).catch(() => setError(failure)).finally(() => setSavingReference(false)); }}>
              <img src={scene.referenceImage.url} alt={say('构图参考图', 'Layout reference image')} className="h-full w-full object-contain" />
            </SceneMediaCard></div>}
          </div>
          <p className="text-ink-4 mt-2 text-[11px] leading-5">{say('人物原帧用于身份，品牌封面用于视觉风格与构图，内容来自本期视频。', 'The source frame defines identity, brand covers guide style and composition, and this video supplies the topic.')}</p>
        </section>
        <ImageGenerationFields value={settings} models={models} locale={zh ? 'zh' : 'en'} disabled={pending} onChange={next => { setModelId(next.modelId); setSize(next.size); setQuality(next.quality); void onSaveDraft(next).catch(() => setError(say('设置未保存，请重试。', 'Settings were not saved. Please retry.'))); }} />
        <div className="bg-bg sticky bottom-0 z-10 shrink-0 space-y-2 py-2">
        {credits !== null && <p className="text-ink-3 text-xs">{say('生图预计', 'Image estimate')} {credits} {say('积分', 'credits')}</p>}
        <button type="button" disabled={pending || !modelId || !prompt.trim() || !selectedFrame || !referenceUrl || readingFrame} onClick={async () => { if (!selectedFrame) return; setError(''); try { await onGenerate({ regenerate: true, prompt, sourceFrame: coverFrameIdentity(selectedFrame), ...settings }); } catch { setError(failure); } }} className="bg-ink text-bg inline-flex w-full h-10 shrink-0 items-center justify-center gap-2 rounded-md text-sm disabled:opacity-40">{pending && <Loader2 size={14} className="animate-spin" />}{scene?.phase === 'planning' ? say('正在准备提示词与参考图…', 'Preparing prompt and reference…') : pending ? say('制作中…', 'Creating…') : say('生成封面', 'Generate cover')}</button>
        {(error || scene?.phase === 'failed') && <p role="alert" className="text-destructive text-xs leading-5">{error || failure}</p>}
        </div>
      </div>
      <div className="bg-canvas flex min-h-0 min-w-0 flex-col gap-3 p-5">
        {strip ? <CoverFrameTimeline strip={strip} at={at} disabled={pending} zh={zh} onPreview={setDraftFrame} onCancel={() => setDraftFrame(null)} onCommit={frame => void saveFrame(frame)} /> : <p className="text-ink-4 py-4 text-xs">{say('正在读取视频帧…', 'Loading video frames…')}</p>}
        <div className="text-ink-3 text-xs">{say('封面预览', 'Cover preview')}</div>
        <div className="flex min-h-0 flex-1 items-center justify-center">{main ? <img src={main.url} alt={say('封面预览', 'Cover preview')} className="h-full max-h-full w-full object-contain" /> : <div className="text-ink-4 text-center text-sm"><ImageIcon size={28} className="mx-auto mb-3" />{say('生成的封面会显示在这里', 'Your generated cover appears here')}</div>}</div>
        {main && <div className="flex items-center gap-3"><a href={main.url} target="_blank" rel="noreferrer" className="text-ink-3 mr-auto text-xs underline underline-offset-4">{say('查看原图', 'Open original')}</a><button type="button" disabled={pending || scene?.referenceImage?.key === main.key} onClick={async () => { setSavingReference(true); setError(''); try { await onSaveDraft({ referenceImage: main }); setDraftFrame(null); } catch { setError(say('参考图未保存，请重试。', 'Reference was not saved. Please retry.')); } finally { setSavingReference(false); } }} className="border-line text-ink rounded-md border px-3 py-2 text-xs disabled:opacity-40">{scene?.referenceImage?.key === main.key ? say('已用作参考图', 'Using as reference') : say('用作参考图', 'Use as reference')}</button><CoverApplyButton cover={main} appliedKey={applied?.key} onApply={onApply} disabled={pending} /></div>}
        {images.length > 1 && <div className="flex shrink-0 gap-2 overflow-x-auto">{images.map(image => <button key={image.key} type="button" aria-label={image.label} className="border-line h-12 w-16 shrink-0 overflow-hidden rounded-sm border" onClick={() => { setSelectedKey(image.key); }}><img src={image.url} alt={image.label} className="h-full w-full object-contain" /></button>)}</div>}
      </div>
    </div>
  </DialogContent></Dialog>;
}
