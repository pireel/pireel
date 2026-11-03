import { editorRequest } from '@pireel/studio-ui/host-request';
import { pickImageModel, normalizeImageSettings, imageGenerationParams } from '@pireel/studio-engine/image-generation-settings';
import { ImageGenerationFields } from '@pireel/studio-ui/image-generation-fields';
import { useEffect, useRef, useState } from 'react';
import { ImageIcon, Loader2 } from 'lucide-react';
import { useQuote } from '@pireel/studio-ui/use-quote';
import { ButtonCreditCost } from './credit-cost';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@pireel/ui/dialog';
import { CoverFrameTimeline } from '@pireel/studio-ui/cover-frame-timeline';
import { SceneMediaCard } from '@pireel/studio-ui/media-picker';
import { CoverApplyButton } from '@pireel/studio-ui/chat-cover-controls';
import { coverFrameTime, coverFrameIdentity, type CoverSourceFrame, type CoverFrameStripData } from '@pireel/studio-ui/cover-frame-selection';
import type { CoverDraftPatch, CoverGenerateOptions } from '@pireel/studio-ui/cover-scene';
import { videoCoverAspect, type CoverScene } from '@pireel/studio-ui/cover-scene';
import type { ProjectCover } from '@pireel/studio-ui/project-cover';
import { t } from './i18n';

export function coverSceneStatus(scene?: CoverScene | null): string {
  return scene?.phase === 'prepared' ? t('ui.coverSceneDialog.coverBriefReady') : scene?.phase === 'ready' ? t('ui.coverSceneDialog.coverReady') : scene?.phase === 'failed' ? t('ui.coverSceneDialog.coverIncomplete') : scene ? t('ui.coverSceneDialog.creatingCover') : t('ui.coverSceneDialog.noCoverYet');
}
export function CoverToolCard({ scene, onOpen }: { scene?: CoverScene | null; onOpen?: () => void }) {
  return <div className="border-line rounded-md border px-3 py-2"><div className="text-ink-2 flex items-center gap-2 text-xs"><ImageIcon size={14} /><span>{coverSceneStatus(scene)}</span>{onOpen && <button type="button" onClick={onOpen} className="text-ink ml-auto underline underline-offset-4">{t('ui.coverSceneDialog.openCover')}</button>}</div></div>;
}
/** The cover at the head of the timeline: always there, so it is where a cover is made and changed. */
export function TimelineCoverPlaceholder({ cover, busy, onOpen }: { cover: ProjectCover | null; busy?: boolean; onOpen: () => void }) {
  return <button type="button" data-timeline-cover-placeholder onClick={onOpen} aria-label={t('ui.coverSceneDialog.coverPlaceholderOpenCover')}
    className="group border-line bg-panel text-ink-3 hover:text-ink-2 flex w-[76px] shrink-0 flex-col items-center gap-1.5 border-r px-2 py-2.5 text-[11px] focus-visible:outline-accent focus-visible:outline-2 focus-visible:-outline-offset-2">
    <span>{t('ui.coverSceneDialog.cover')}</span>
    <span className={`bg-canvas group-hover:ring-accent/60 relative flex w-full flex-1 items-center justify-center overflow-hidden rounded-sm transition group-hover:ring-2 ${cover ? '' : 'border-line border border-dashed'}`}>
      {cover ? <img src={cover.url} alt={t('ui.coverSceneDialog.currentCover')} className="absolute inset-0 h-full w-full object-contain" />
        : <span className="flex flex-col items-center gap-1 px-1 text-center text-[10px] leading-tight"><ImageIcon size={16} aria-hidden />{t('ui.coverSceneDialog.addCover')}</span>}
      {busy && <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-white"><Loader2 size={16} className="animate-spin" aria-hidden /></span>}
    </span>
  </button>;
}
const timeLabel = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;

export function CoverSceneDialog({ open, scene, applied, busy, canvas, onClose, onPrepare, onSaveDraft, onLoadFrames, onPreviewFrame, onGenerate, onApply }: {
  open: boolean; scene: CoverScene | null; applied: ProjectCover | null; busy: boolean; canvas?: { width: number; height: number };
  onClose(): void;
  onPrepare(rewrite?: boolean): Promise<unknown>;
  onSaveDraft(patch: CoverDraftPatch): Promise<unknown>;
  onLoadFrames(): Promise<CoverFrameStripData>;
  onPreviewFrame(frame: CoverSourceFrame): Promise<Blob>;
  onGenerate(options: CoverGenerateOptions): Promise<unknown>;
  onApply(cover: ProjectCover): Promise<void>;
}) {
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
    void callbacks.current.onPrepare().catch(() => { if (alive) setError(t('ui.coverSceneDialog.couldNotPreparePrompt')); });
    void callbacks.current.onLoadFrames().then(data => { if (alive) setStrip(data); }).catch(() => { if (alive) setError(t('ui.coverSceneDialog.restoreSourceVideoLoad')); });
    return () => { alive = false; };
  }, [open]);
  useEffect(() => {
    if (!open) return; let alive = true;
    void editorRequest('/api/models?kind=image').then(r => r.json()).then(data => { if (alive) { const list = data.models ?? []; setModels(list); setModelId(current => pickImageModel(list, current || scene?.modelId)); } }).catch(() => {});
    return () => { alive = false; };
  }, [open, scene?.modelId]);
  const scenePrompt = scene?.prompt ?? ''; const sceneSize = scene?.size || videoCoverAspect(canvas); const sceneQuality = scene?.quality ?? ''; const newestImageKey = scene?.images[0]?.key ?? '';
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
      void onPreviewFrame({ assetId: selectedAsset, sourceSec: selectedSourceSec }).then(blob => { if (alive) { url = URL.createObjectURL(blob); setReferenceUrl(url); } }).catch(() => { if (alive) setError(t('ui.coverSceneDialog.couldNotReadThat')); }).finally(() => { if (alive) setReadingFrame(false); });
    }, 100);
    return () => { alive = false; clearTimeout(timer); if (url) URL.revokeObjectURL(url); };
  }, [open, selectedAsset, selectedSourceSec, onPreviewFrame]);
  const settings = normalizeImageSettings({ modelId, size: size || scene?.size || videoCoverAspect(canvas), quality });
  const credits = useQuote({ toolId: 'image-gen', modelId: open ? modelId : '', params: { n: 1, ...imageGenerationParams(settings), reference_count: 1 + (scene?.brandReferences?.length ?? 0) + (scene?.referenceImage ? 1 : 0) } });
  const choices = [...(scene?.images ?? []), ...(scene?.history ?? []), ...(applied ? [applied] : [])];
  const images = [...new Map(choices.map(image => [image.key, image])).values()];
  const main = images.find(image => image.key === selectedKey) ?? images[0];
  const at = strip ? coverFrameTime(strip.ranges, selectedFrame) : 0;
  const saveFrame = async (frame: CoverSourceFrame) => {
    setDraftFrame(frame); setError(''); setSavingReference(true);
    try { await onSaveDraft({ sourceFrame: coverFrameIdentity(frame) }); } catch { setDraftFrame(null); setError(t('ui.coverSceneDialog.frameSelectionWasNot')); } finally { setSavingReference(false); }
  };
  const failure = scene?.error === 'cover_brand_reference_unavailable' ? t('ui.coverSceneDialog.couldNotLoadBrand') : scene?.error === 'cover_insufficient_credits' ? t('ui.coverSceneDialog.notEnoughCreditsTop') : scene?.error === 'cover_source_unavailable' ? t('ui.coverSceneDialog.importRestoreCurrentVideo') : t('ui.coverSceneDialog.coverPreparationGenerationDid');
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose(); }}><DialogContent className="studio-scope bg-bg border-line flex h-[min(820px,calc(100vh-3rem))] w-[min(1200px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
    <div className="border-line border-b px-6 py-4 pr-12"><DialogTitle className="text-ink text-lg font-semibold">{t('ui.coverSceneDialog.cover')}</DialogTitle><DialogDescription className="text-ink-3 mt-1 text-xs">{t('ui.coverSceneDialog.generateCompleteCoverFrom')}</DialogDescription></div>
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(300px,370px)_minmax(0,1fr)] max-sm:grid-cols-1">
      <div aria-label={t('ui.coverSceneDialog.coverSettings')} className="border-line flex min-h-0 flex-col gap-3 overflow-y-auto border-r p-5">
        <div className="flex items-center justify-between gap-2"><label htmlFor="cover-full-prompt" className="text-ink text-sm font-medium">{t('ui.coverSceneDialog.fullPrompt')}</label><button type="button" disabled={pending} onClick={async () => { setError(''); try { await onPrepare(true); } catch { setError(failure); } }} className="text-ink-3 text-xs underline underline-offset-4 disabled:opacity-40">{t('ui.coverSceneDialog.rewriteFromContext')}</button></div>
        <textarea id="cover-full-prompt" value={prompt} disabled={pending} onChange={event => setPrompt(event.target.value)} onBlur={() => { if (prompt.trim() && prompt !== scenePrompt) void onSaveDraft({ prompt }).catch(() => setError(t('ui.coverSceneDialog.promptWasNotSaved'))); }} placeholder={pending ? t('ui.coverSceneDialog.preparingCompletePromptFrom') : t('ui.coverSceneDialog.editCompleteCoverGeneration')} className="border-line bg-canvas min-h-[150px] flex-1 resize-none rounded-md border p-3 text-sm leading-6" />
        <section aria-label={t('ui.coverSceneDialog.referenceImage')} className="shrink-0">
          <div className="text-ink mb-2 text-xs">{t('ui.coverSceneDialog.referenceImages')}</div>
          <div className="flex flex-wrap gap-3">
            <div className="w-24"><SceneMediaCard name={`${t('ui.coverSceneDialog.n1OriginalPerson')} · ${timeLabel(at)}`} disabled={pending}>
              {referenceUrl ? <img src={referenceUrl} alt={t('ui.coverSceneDialog.currentReferenceImage')} className="h-full w-full object-contain" /> : <div className="text-ink-4 flex h-full items-center justify-center"><Loader2 size={18} className="animate-spin" /></div>}
            </SceneMediaCard></div>
            {scene?.brandReferences?.map((reference, index) => <div key={reference.key} className="w-24"><SceneMediaCard name={`${index + 2} · ${t('ui.coverSceneDialog.brandCover')}`} disabled={pending}>
              <img src={reference.url} alt={`${t('ui.coverSceneDialog.brandCoverReference')} ${index + 1}`} className="h-full w-full object-contain" />
            </SceneMediaCard></div>)}
            {scene?.referenceImage && <div className="w-24"><SceneMediaCard name={`${2 + (scene.brandReferences?.length ?? 0)} · ${t('ui.coverSceneDialog.layoutReference')}`} disabled={pending} onRemove={() => { setSavingReference(true); void onSaveDraft({ referenceImage: null }).catch(() => setError(failure)).finally(() => setSavingReference(false)); }}>
              <img src={scene.referenceImage.url} alt={t('ui.coverSceneDialog.layoutReferenceImage')} className="h-full w-full object-contain" />
            </SceneMediaCard></div>}
          </div>
          <p className="text-ink-4 mt-2 text-[11px] leading-5">{t('ui.coverSceneDialog.sourceFrameDefinesIdentity')}</p>
        </section>
        <ImageGenerationFields value={settings} models={models} disabled={pending} onChange={next => { setModelId(next.modelId); setSize(next.size); setQuality(next.quality); void onSaveDraft(next).catch(() => setError(t('ui.coverSceneDialog.settingsWereNotSaved'))); }} />
        <div className="bg-bg sticky bottom-0 z-10 shrink-0 space-y-2 py-2">
        <button type="button" disabled={pending || !modelId || !prompt.trim() || !selectedFrame || !referenceUrl || readingFrame} onClick={async () => { if (!selectedFrame) return; setError(''); try { await onGenerate({ regenerate: true, prompt, sourceFrame: coverFrameIdentity(selectedFrame), ...settings }); } catch { setError(failure); } }} className="bg-primary text-primary-foreground inline-flex w-full h-10 shrink-0 items-center justify-center gap-2 rounded-md text-sm disabled:opacity-40">{pending && <Loader2 size={14} className="animate-spin" />}{scene?.phase === 'planning' ? t('ui.coverSceneDialog.preparingPromptReference') : pending ? t('ui.coverSceneDialog.creating') : <>{t('ui.coverSceneDialog.generateCover')}<ButtonCreditCost cost={credits === null ? null : { credits }} /></>}</button>
        {(error || scene?.phase === 'failed') && <p role="alert" className="text-destructive text-xs leading-5">{error || failure}</p>}
        </div>
      </div>
      <div className="bg-canvas flex min-h-0 min-w-0 flex-col gap-3 p-5">
        {strip ? <CoverFrameTimeline strip={strip} at={at} disabled={pending} onPreview={setDraftFrame} onCancel={() => setDraftFrame(null)} onCommit={frame => void saveFrame(frame)} /> : <p className="text-ink-4 py-4 text-xs">{t('ui.coverSceneDialog.loadingVideoFrames')}</p>}
        <div className="text-ink-3 text-xs">{t('ui.coverSceneDialog.coverPreview')}</div>
        <div className="flex min-h-0 flex-1 items-center justify-center">{main ? <img src={main.url} alt={t('ui.coverSceneDialog.coverPreview')} className="h-full max-h-full w-full object-contain" /> : <div className="text-ink-4 text-center text-sm"><ImageIcon size={28} className="mx-auto mb-3" />{t('ui.coverSceneDialog.generatedCoverAppearsHere')}</div>}</div>
        {main && <div className="flex items-center gap-3"><a href={main.url} target="_blank" rel="noreferrer" className="text-ink-3 mr-auto text-xs underline underline-offset-4">{t('ui.coverSceneDialog.openOriginal')}</a><button type="button" disabled={pending || scene?.referenceImage?.key === main.key} onClick={async () => { setSavingReference(true); setError(''); try { await onSaveDraft({ referenceImage: main }); setDraftFrame(null); } catch { setError(t('ui.coverSceneDialog.referenceWasNotSaved')); } finally { setSavingReference(false); } }} className="border-line text-ink rounded-md border px-3 py-2 text-xs disabled:opacity-40">{scene?.referenceImage?.key === main.key ? t('ui.coverSceneDialog.usingAsReference') : t('ui.coverSceneDialog.useAsReference')}</button><CoverApplyButton cover={main} appliedKey={applied?.key} onApply={onApply} disabled={pending} /></div>}
        {images.length > 1 && <div className="flex shrink-0 gap-2 overflow-x-auto">{images.map(image => <button key={image.key} type="button" aria-label={image.label} className="border-line h-12 w-16 shrink-0 overflow-hidden rounded-sm border" onClick={() => { setSelectedKey(image.key); }}><img src={image.url} alt={image.label} className="h-full w-full object-contain" /></button>)}</div>}
      </div>
    </div>
  </DialogContent></Dialog>;
}
