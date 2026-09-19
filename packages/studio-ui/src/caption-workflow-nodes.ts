import { validateEmphasisSelection as sourceSelectionValid } from '@pireel/studio-engine/caption-emphasis';
import { sourceEmphasisRows, annotateSourceEmphasis } from '@pireel/studio-engine/caption-source-emphasis';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import { buildCaptionBaseDocument, captionTaskStyle, type CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import { firstNarrativeAssetId, projectDocumentToComposition, type EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { studioProviders } from '@pireel/studio-engine/providers';
import { CAPTION_WORKFLOW_CAPABILITIES } from '@pireel/studio-engine/workflow-caption-template';
import { artifactVersion, workflowJson } from '@pireel/studio-engine/workflow-artifacts';
import { selectCaptionEmphasisRows } from './caption-emphasis-operation';
import { planCaptionDocument, translateCaptionPlan, assembleCaptionDocument, captionPlanEmphasisRows, type CaptionPlan, type CaptionTranslation, type CaptionEmphasis } from './caption-workflow-artifacts';
import { SceneWorkflowHost, type SceneNode, type SceneMedia } from './scene-workflow-runtime';
import type { CaptionProcessingStage } from './caption-task-store';

export function captionWorkflowNodes(host: SceneWorkflowHost): SceneNode[] {
  const { store } = host;
  const count = (stage: CaptionProcessingStage) => (done: number, total: number) => host.report(stage, { status: 'running', fraction: total ? done / total : undefined, done, total });
  const node = (id: string, definition: Omit<SceneNode, 'capability'>): SceneNode => ({ capability: CAPTION_WORKFLOW_CAPABILITIES.find(item => item.id === id)!, ...definition });
  return [
    node('speech.transcribe', { stage: 'transcribing', async execute(args, context) {
      const media = store.read<SceneMedia>(args.media, 'media');
      if (args.transcript && (args.transcript as unknown as { id: string }).id !== media.sig) throw new Error('预置转写不属于当前媒体，请重新绑定。');
      let transcript = args.transcript ? store.read<AsrSegment[]>(args.transcript, 'transcript') : null;
      if (!transcript?.length) transcript = await (await import('./media')).transcribeFile(await host.media(media), { signal: host.hooks.signal, onUsage: context.recordUsage, onPhase: detail => host.report('transcribing', { status: 'running', detail }) });
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
      const document = buildCaptionBaseDocument({ ...media, projectId: String(args.projectId), sourceName: media.name, sourceUrl: '', sourceSig: media.sig, transcript: [], cuts: args.cuts as unknown as { fromSec: number; toSec: number }[], options: { presetId: 'clean', aspect: args.aspect as CaptionTaskOptions['aspect'], shortenPauses: false } });
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
      const translation = await translateCaptionPlan(args.units as unknown as CaptionPlan['units'], String(args.language), (rows, language) => translate(rows, language, { signal: host.hooks.signal, onUsage: context.recordUsage }), host.check, count('translating'));
      return { translation: workflowJson(await store.put('translation', 'captions', translation)), value: workflowJson(translation) };
    }, project: outputs => { const value = outputs.value as unknown as CaptionTranslation; return { translation: { language: value.language, sourceKey: value.sourceKey } }; } }),
    node('captions.apply', { stage: 'styling', async execute(args) {
      const document = assembleCaptionDocument(store.read(args.document, 'document'), store.read(args.plan, 'caption-plan'), args.translation as unknown as CaptionTranslation | null, args.style as unknown as CaptionTaskOptions, args.emphasis as unknown as CaptionEmphasis | null);
      return { document: workflowJson(await store.put('document', 'captions', document)) };
    }, project: outputs => {
      const document = store.read<EditorDocumentV2>(outputs.document, 'document');
      const owner = firstNarrativeAssetId(document);
      return { document, ...(owner && !document.timeline.tracks.some(track => track.role === 'narration') ? { transcript: document.semantics.transcripts[owner] as AsrSegment[] } : {}) };
    } }),
    node('captions.source-emphasize', { stage: 'emphasizing', async execute(args, context) {
      const transcript = store.read<AsrSegment[]>(args.transcript, 'transcript');
      const select = studioProviders().captionEmphasis;
      if (!select) throw new Error('重点词服务尚未连接。');
      const { rows, addresses } = sourceEmphasisRows(transcript);
      const selections = await selectCaptionEmphasisRows(rows, async batch => {
        host.check();
        const key = 'source-emphasis-' + await artifactVersion([host.task.scope, host.task.workflowEnvironmentRevision ?? 'local', 'source-emphasis-1', batch]);
        const cached = Object.values(store.entries).find(entry => entry.ref.kind === 'edit-plan' && entry.ref.id === key);
        if (cached) {
          const saved = store.read<{ selections: import('@pireel/studio-engine/caption-emphasis').EmphasisSelection[] }>(cached.ref, 'edit-plan');
          if (sourceSelectionValid(batch, saved.selections)) return saved.selections;
        }
        const value = await select(batch, undefined, { signal: host.hooks.signal, onUsage: context.recordUsage });
        if (!sourceSelectionValid(batch, value)) throw new Error('重点词结果不完整，原文已保留。');
        await store.put('edit-plan', key, { selections: value });
        await context.savePartial({ lastCompletedBatch: key }); return value;
      }, count('emphasizing'));
      const annotated = annotateSourceEmphasis(transcript, selections);
      const ref = args.transcript as unknown as { id: string; version: string };
      return { transcript: workflowJson(await store.put('transcript', ref.id, annotated)), value: workflowJson({ sourceVersion: ref.version, items: selections.map(row => ({ segment: addresses[row.index].segment, words: row.words.map(word => addresses[row.index].offset + word) })) }) };
    } }),
    node('captions.emphasize', { stage: 'emphasizing', cacheInputs(args) { const plan = store.read<CaptionPlan>(args.plan, 'caption-plan'); return { sourceKey: plan.sourceKey, rows: workflowJson(captionPlanEmphasisRows(plan)) }; }, async execute(args, context) {
      const select = studioProviders().captionEmphasis;
      if (!select) throw new Error('重点词服务尚未连接，请选择其他字幕样式。');
      const plan = store.read<CaptionPlan>(args.plan, 'caption-plan');
      const selections = await selectCaptionEmphasisRows(captionPlanEmphasisRows(plan), rows => { host.check(); return select(rows, undefined, { signal: host.hooks.signal, onUsage: context.recordUsage }); }, count('emphasizing'));
      return { emphasis: workflowJson({ sourceKey: plan.sourceKey, items: selections.map(selection => ({ id: plan.lines[selection.index].id, words: selection.words })) }) };
    } }),
    node('video.render', { cache: false, stage: 'rendering', async execute(args) {
      const document = store.read<EditorDocumentV2>(args.document, 'document');
      const media = store.read<SceneMedia>(args.media, 'media');
      const style = document.appearance.captionStyle;
      const { loadFont } = await import('./web-fonts');
      const glyphs = Object.values(document.semantics.transcripts).flat().map(segment => segment.text).join('');
      if (style?.font) for (let offset = 0; offset < glyphs.length; offset += 1000) await loadFont(style.font, glyphs.slice(offset, offset + 1000));
      if (typeof globalThis.document !== 'undefined') await globalThis.document.fonts?.ready;
      const clipFiles = new Map<string, File>();
      const assetUrls = new Map<string, string>();
      // Resolve every persisted locator at the host boundary; no blob URLs enter artifact identity.
      for (const asset of Object.values(document.assets)) {
        const sig = asset.locator.localSig;
        if (!sig) continue;
        const file = await host.media({ sig, name: asset.label ?? sig, width: 0, height: 0, durationSec: media.durationSec, url: asset.locator.remoteUrl });
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
      host.video = await (await import('./client-export')).clientExportVideo({ comp: renderComp, videoFile: await host.media(media), clipFiles, visualMediaClips, audio, render: args.settings as unknown as { res: number; fps: number; format: 'mp4' }, shouldCancel: () => host.hooks.signal.aborted, onProgress: (done, total) => { count('rendering')(done, total); host.hooks.progress(total ? done / total : 0); } });
      host.check();
      const output = new File([host.video], media.name.replace(/\.[^.]+$/, '') + '-rendered.mp4', { type: 'video/mp4' });
      const sig = await (await import('./media')).durableFileSig(output);
      host.files.set(sig, output);
      return { media: workflowJson(await store.put('media', 'rendered-video', { sig, name: output.name, width: document.canvas.width, height: document.canvas.height, durationSec: renderPlan.durationSec, kind: 'video' })), document: args.document };
    }, project: outputs => ({ document: store.read(outputs.document, 'document') }) }),
  ];
}
