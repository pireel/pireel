import { imageThumb } from '@pireel/ui/image-url';
import { applyBrandMedia, type BrandSnapshot } from '@pireel/studio-engine/brand-kit';
import { punchInUpdates, type CaptionEditParams } from '@pireel/studio-engine/brand-edit-params';
import { applyDocumentTransaction } from '@pireel/studio-engine/document-transaction';
import { integratedLoudness, loudnessGainDb } from '@pireel/studio-engine/loudness-lufs';
import { phraseWordIndexes, rowWords } from '@pireel/studio-engine/caption-highlights';
import { applyWordDecorations } from '@pireel/studio-engine/word-decorations';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import { buildCaptionBaseDocument, captionTaskStyle, type CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import { firstNarrativeAssetId, projectDocumentToComposition, type EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { joinWords } from '@pireel/studio-engine/caption-fx';
import { studioProviders } from '@pireel/studio-engine/providers';
import { CAPTION_WORKFLOW_CAPABILITIES } from '@pireel/studio-engine/workflow-caption-template';
import { workflowJson } from '@pireel/studio-engine/workflow-artifacts';
import { planCaptionDocument, translateCaptionPlan, assembleCaptionDocument, type CaptionPlan, type CaptionTranslation } from './caption-workflow-artifacts';
import { SceneWorkflowHost, type SceneNode, type SceneMedia } from './scene-workflow-runtime';
import type { CaptionProcessingStage } from './caption-task-store';

const HIGHLIGHT_BATCH = 200;

export function captionWorkflowNodes(host: SceneWorkflowHost): SceneNode[] {
  const { store } = host;
  const count = (stage: CaptionProcessingStage) => (done: number, total: number) => host.report(stage, { status: 'running', fraction: total ? done / total : undefined, done, total });
  const node = (id: string, definition: Omit<SceneNode, 'capability'>): SceneNode => ({ capability: CAPTION_WORKFLOW_CAPABILITIES.find(item => item.id === id)!, ...definition });
  return [
    node('speech.transcribe', { stage: 'transcribing', async execute(args, context) {
      const media = store.read<SceneMedia>(args.media, 'media');
      if (args.transcript && (args.transcript as unknown as { id: string }).id !== media.sig) throw new Error('预置转写不属于当前媒体，请重新绑定。');
      let transcript = args.transcript ? store.read<AsrSegment[]>(args.transcript, 'transcript') : null;
      if (!transcript?.length) transcript = await (await import('./media')).transcribeFile(await host.media(media), { signal: host.hooks.signal, sceneRun: host.hooks.sceneRun, onUsage: context.recordUsage, onPhase: detail => host.report('transcribing', { status: 'running', detail }) });
      if (!transcript.length) throw new Error('没有识别到讲话内容，请选择有声音的视频。');
      return { transcript: workflowJson(await store.put('transcript', media.sig, transcript)) };
    }, project: outputs => ({ transcript: store.read(outputs.transcript, 'transcript') }) }),
    node('speech.pause-plan', { stage: 'cleaning', async execute(args) {
      const media = store.read<SceneMedia>(args.media, 'media');
      const cuts = args.cuts ?? await (await import('./speech-silence')).detectSpeechSilenceCuts(await host.media(media), { minimumPauseSec: Number(args.minimumPauseSec), speechPaddingSec: Number(args.speechPaddingSec), onProgress: count('cleaning') });
      return { cuts: workflowJson(cuts) };
    }, project: outputs => ({ cuts: outputs.cuts as unknown as { fromSec: number; toSec: number }[] }) }),
    node('edit.compose', { async execute(args) {
      const media = store.read<SceneMedia>(args.media, 'media');
      const document = buildCaptionBaseDocument({ ...media, projectId: String(args.projectId), sourceName: media.name, sourceUrl: '', sourceSig: media.sig, transcript: [], cuts: args.cuts as unknown as { fromSec: number; toSec: number }[], options: { caption: {}, aspect: args.aspect as CaptionTaskOptions['aspect'], shortenPauses: false } });
      return { document: workflowJson(await store.put('document', String(args.projectId), document)) };
    } }),
    node('captions.plan', { async execute(args) {
      const document = store.read<EditorDocumentV2>(args.document, 'document');
      const transcript = store.read<AsrSegment[]>(args.transcript, 'transcript');
      const layout = args.layout as unknown as CaptionTaskOptions;
      const font = captionTaskStyle(layout, document.canvas).font;
      if (font) {
        const { loadFont } = await import('./web-fonts');
        const glyphs = [...new Set([...transcript.map(segment => segment.text).join('')])];
        for (let offset = 0; offset < glyphs.length; offset += 1000) { await loadFont(font, glyphs.slice(offset, offset + 1000).join('')); host.check(); }
      }
      if (typeof globalThis.document !== 'undefined') await globalThis.document.fonts?.ready;
      host.check(); const plan = planCaptionDocument(document, transcript, layout);
      return { plan: workflowJson(await store.put('caption-plan', 'captions', plan)), units: workflowJson(plan.units) };
    } }),
    node('text.translate', { stage: 'translating', cacheInputs(args) { return { language: args.language, units: workflowJson((args.units as unknown as CaptionPlan['units']).map(({ start: _start, ...unit }) => unit)) }; }, async execute(args, context) {
      const translate = studioProviders().translate;
      if (!translate) throw new Error('翻译服务尚未连接，请关闭双语字幕后重试。');
      const translation = await translateCaptionPlan(args.units as unknown as CaptionPlan['units'], String(args.language), (rows, language) => translate(rows, language, { signal: host.hooks.signal, sceneRun: host.hooks.sceneRun, onUsage: context.recordUsage }), host.check, count('translating'));
      return { translation: workflowJson(await store.put('translation', 'captions', translation)), value: workflowJson(translation) };
    }, project: outputs => { const value = outputs.value as unknown as CaptionTranslation; return { translation: { language: value.language, sourceKey: value.sourceKey } }; } }),
    node('brand.apply', { stage: 'styling', async execute(args) {
      const document = applyBrandMedia(store.read(args.document, 'document'), args.brand as unknown as BrandSnapshot);
      return { document: workflowJson(await store.put('document', 'brand', document)) };
    }, project: outputs => ({ document: store.read<EditorDocumentV2>(outputs.document, 'document') }) }),
    node('framing.punch-in', { stage: 'styling', async execute(args) {
      const document = store.read<EditorDocumentV2>(args.document, 'document');
      const updates = punchInUpdates(document, store.read<AsrSegment[]>(args.transcript, 'transcript'), args.punch as unknown as NonNullable<CaptionEditParams['punchIn']>);
      let next = document;
      if (updates.length) {
        const result = applyDocumentTransaction(document, { ops: [{ op: 'narrative.patch', input: { updates } }] }, { projectId: 'caption-scene' });
        if (!result.ok) throw new Error(result.error.message);
        next = result.document;
      }
      return { document: workflowJson(await store.put('document', 'punch-in', next)) };
    }, project: outputs => ({ document: store.read<EditorDocumentV2>(outputs.document, 'document') }) }),
    node('audio.loudness', { stage: 'styling', async execute(args) {
      // The export applies the master gain; it is measured here once, on the source speech.
      const document = store.read<EditorDocumentV2>(args.document, 'document');
      const { decodeVideoAudio } = await import('./audio-decode');
      const decoded = await decodeVideoAudio(await host.media(store.read<SceneMedia>(args.media, 'media'))); host.check();
      if (!decoded) throw new Error('无法读取原声音轨，不能统一响度。');
      const targetLufs = Number(args.targetLufs);
      const gainDb = loudnessGainDb(integratedLoudness(Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index)), decoded.sampleRate), targetLufs);
      const next: EditorDocumentV2 = gainDb === null ? document : { ...document, processing: { ...document.processing, loudness: { targetLufs, gainDb } } };
      return { document: workflowJson(await store.put('document', 'loudness', next)) };
    }, project: outputs => ({ document: store.read<EditorDocumentV2>(outputs.document, 'document') }) }),
    node('captions.apply', { stage: 'styling', async execute(args) {
      const document = assembleCaptionDocument(store.read(args.document, 'document'), store.read(args.plan, 'caption-plan'), args.translation as unknown as CaptionTranslation | null, args.style as unknown as CaptionTaskOptions);
      return { document: workflowJson(await store.put('document', 'captions', document)) };
    }, project: outputs => {
      const document = store.read<EditorDocumentV2>(outputs.document, 'document');
      const owner = firstNarrativeAssetId(document);
      return { document, ...(owner && !document.timeline.tracks.some(track => track.role === 'narration') ? { transcript: document.semantics.transcripts[owner] as AsrSegment[] } : {}) };
    } }),
    node('captions.highlight', { stage: 'emphasizing', async execute(args, context) {
      // Same step as the workbench's auto highlight: one call over the source sentences, landing as word highlights.
      const highlight = studioProviders().autoHighlight;
      if (!highlight) throw new Error('自动高亮服务尚未连接，请关闭重点突出后重试。');
      const transcript = store.read<AsrSegment[]>(args.transcript, 'transcript');
      const rows = transcript.map(segment => rowWords(segment));
      const all = rows.flatMap((words, index) => words.length ? [{ index, text: joinWords(words.map(word => word.text)) }] : []);
      const keys: { index: number; text: string }[] = [];
      for (let offset = 0; offset < all.length; offset += HIGHLIGHT_BATCH) {
        host.check();
        keys.push(...await highlight(all.slice(offset, offset + HIGHLIGHT_BATCH), { signal: host.hooks.signal, sceneRun: host.hooks.sceneRun, onUsage: context.recordUsage }));
        count('emphasizing')(Math.min(all.length, offset + HIGHLIGHT_BATCH), all.length);
      }
      const targets = keys.flatMap(key => {
        const found = rows[key.index] ? phraseWordIndexes(rows[key.index]!, key.text) : null;
        if (!found) throw new Error(`高亮结果与字幕原文对不上：「${key.text}」`);
        return found.map(wordIndex => ({ sentenceIndex: key.index, wordIndex }));
      });
      const highlighted = applyWordDecorations(transcript, targets, { highlight: 'color', color: null });
      const ref = args.transcript as unknown as { id: string };
      return { transcript: workflowJson(await store.put('transcript', ref.id, highlighted)) };
    } }),
    node('video.render', { cache: false, stage: 'rendering', async execute(args) {
      const document = store.read<EditorDocumentV2>(args.document, 'document');
      const media = store.read<SceneMedia>(args.media, 'media');
      const rendered = await renderSceneDocument(host, document, media, args.settings, count('rendering'));
      host.video = rendered.video;
      host.check();
      const output = new File([host.video], media.name.replace(/\.[^.]+$/, '') + '-rendered.mp4', { type: 'video/mp4' });
      const sig = await (await import('./media')).durableFileSig(output);
      host.files.set(sig, output);
      return { media: workflowJson(await store.put('media', 'rendered-video', { sig, name: output.name, width: document.canvas.width, height: document.canvas.height, durationSec: rendered.durationSec, kind: 'video' })), document: args.document };
    }, project: outputs => ({ document: store.read(outputs.document, 'document') }) }),
  ];
}

/** The render step's body: resolve every asset locator (local sig, cloud key, remote url) at the host
 * boundary, then export the document in the browser. Shared by the scene node and QA harnesses. */
export async function renderSceneDocument(host: Pick<SceneWorkflowHost, 'media' | 'url' | 'check' | 'hooks'>, document: EditorDocumentV2, media: SceneMedia, settings: unknown, onProgress: (done: number, total: number) => void = () => {}): Promise<{ video: Blob; durationSec: number }> {
  const style = document.appearance.captionStyle;
  const { loadFont } = await import('./web-fonts');
  const glyphs = Object.values(document.semantics.transcripts).flat().map(segment => segment.text).join('');
  if (style?.font) for (let offset = 0; offset < glyphs.length; offset += 1000) await loadFont(style.font, glyphs.slice(offset, offset + 1000));
  if (typeof globalThis.document !== 'undefined') await globalThis.document.fonts?.ready;
  const clipFiles = new Map<string, File>();
  const assetUrls = new Map<string, string>();
  // Resolve every persisted locator at the host boundary; no blob URLs enter artifact identity.
  // Cloud-only assets (e.g. brand logo / intro / outro) are read by key from the public media namespace.
  for (const asset of Object.values(document.assets)) {
    const { localSig, cloudKey, remoteUrl } = asset.locator;
    const sig = localSig ?? (cloudKey ? `cloud:${cloudKey}` : undefined);
    if (!sig) continue;
    const file = await host.media({ sig, name: asset.label ?? sig, width: 0, height: 0, durationSec: media.durationSec, url: remoteUrl ?? (!localSig && cloudKey ? imageThumb(cloudKey, 'original') : undefined) });
    const url = await host.url({ sig, name: file.name, width: 0, height: 0, durationSec: media.durationSec });
    assetUrls.set(asset.id, url); clipFiles.set(url, file);
  }
  const { editorDocumentRenderPlan } = await import('@pireel/studio-engine/composition');
  const { compositionRenderView } = await import('./composition-render-view');
  const { supplementalVisualMedia } = await import('./visual-render-plan');
  const resolveAssetUrl = (asset: { id: string }) => assetUrls.get(asset.id);
  const renderPlan = editorDocumentRenderPlan(document, { resolveAssetUrl });
  const renderComp = compositionRenderView(projectDocumentToComposition(document, { resolveAssetUrl }), renderPlan);
  const sourceUrl = await host.url(media);
  if (renderComp.video) renderComp.video.url = sourceUrl;
  for (const shot of renderComp.shots ?? []) if (shot.src && !clipFiles.has(shot.src)) clipFiles.set(shot.src, await host.media(media));
  const visualMediaClips = supplementalVisualMedia(renderPlan);
  const audio = (renderComp.audioTracks ?? []).flatMap(clip => clipFiles.has(clip.src) ? [{ clip, file: clipFiles.get(clip.src)! }] : []);
  const video = await (await import('./client-export')).clientExportVideo({ comp: renderComp, videoFile: await host.media(media), clipFiles, visualMediaClips, audio, render: settings as unknown as { res: number; fps: number; format: 'mp4' }, shouldCancel: () => host.hooks.signal.aborted, onProgress: (done, total) => { onProgress(done, total); host.hooks.progress(total ? done / total : 0); } });
  return { video, durationSec: renderPlan.durationSec };
}
