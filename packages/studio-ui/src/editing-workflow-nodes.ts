import { applyEditorialFraming } from '@pireel/studio-engine/editing-framing';
import { editingPlanNodes } from './editing-plan-nodes';
import { visualBeats, type FramingPlan } from '@pireel/studio-engine/editing-plan';
import { dubbingVoicesReady, type DubbingOptions } from '@pireel/studio-engine/dubbing-task';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import type { EditorDocumentV2, AudioClip, Block } from '@pireel/studio-engine/composition';
import { projectDocumentToComposition } from '@pireel/studio-engine/composition';
import { applyDocumentTransaction, type DocumentOp } from '@pireel/studio-engine/document-transaction';
import { captionTaskCanvas } from '@pireel/studio-engine/caption-task';
import { editingSpeechCues, editingDuration, editingMoments, mergeEditingCuts, musicBedPcm, soundEffectPcm } from '@pireel/studio-engine/editing-operations';
import { EDITING_WORKFLOW_CAPABILITIES } from '@pireel/studio-engine/editing-node-contracts';
import { artifactVersion, workflowJson } from '@pireel/studio-engine/workflow-artifacts';
import { studioProviders } from '@pireel/studio-engine/providers';
import { searchAssetLibrary, type AssetSearchDocument } from '@pireel/studio-engine/asset-search';
import { loadLocalVideo, saveLocalVideo } from './local-media';
import { SceneWorkflowHost, type SceneNode, type SceneMedia } from './scene-workflow-runtime';
import { acceptGeneratedComponent } from './compose-validation';
import { composedBlockFields } from './compose-result';
const commit = (document: EditorDocumentV2, ops: DocumentOp[]): EditorDocumentV2 => {
  if (!ops.length) return document;
  const result = applyDocumentTransaction(document, { ops }, { projectId: 'editing-workflow' });
  if (!result.ok) throw new Error(result.error.message); return result.document;
};
async function cacheAudio(host: SceneWorkflowHost, pcm: Float32Array, rate: number, identity: unknown, name: string): Promise<SceneMedia> {
  const { encodeWavMono } = await import('./denoise');
  const sig = 'edit-audio-' + await artifactVersion(identity); const file = new File([encodeWavMono(pcm, rate)], name, { type: 'audio/wav' });
  if (!await saveLocalVideo(file, sig)) throw new Error('派生音轨未保存到本机，请检查可用空间。');
  host.files.set(sig, file); return { sig, name, kind: 'audio', width: 0, height: 0, durationSec: pcm.length / rate };
}
async function addAudio(host: SceneWorkflowHost, document: EditorDocumentV2, media: SceneMedia, role: 'sfx' | 'music', id: string, start: number, volumeDb: number) {
  const trackId = 'editing-' + role;
  const ops: DocumentOp[] = [];
  if (!document.timeline.tracks.some(track => track.id === trackId)) ops.push({ op: 'command', input: { command: { type: 'track.insert', track: { id: trackId, type: 'audio', role, name: role === 'music' ? '背景音乐' : '音效', syncLocked: true } } } });
  const clip: AudioClip = { id, src: await host.url(media), sig: media.sig, label: media.name, role, durationSec: media.durationSec, startSec: start, volumeDb, fadeInSec: .01, fadeOutSec: .05, outSec: Math.min(media.durationSec, editingDuration(document) - start) };
  ops.push({ op: 'audio.add', input: { clip, toTrackId: trackId } }); return commit(document, ops);
}
async function libraryMatches(query: string, kind: 'image' | 'audio', documents: AssetSearchDocument[], signal: AbortSignal) {
  const local = searchAssetLibrary(documents, { query, kind, limit: 4 });
  if (!('error' in local) && local.results.length) return local.results;
  const semantic = await studioProviders().curatedAssets?.semanticSearch({ query, kind, limit: 4, signal });
  return (semantic?.results ?? []).filter(result => result.score > 0).flatMap(result => { const asset = documents.find(asset => asset.assetId === result.assetId && asset.kind === kind); return asset ? [asset] : []; });
}
export function editingWorkflowNodes(host: SceneWorkflowHost): SceneNode[] {
  const { store } = host;
  const node = (id: string, body: Omit<SceneNode, 'capability'>): SceneNode => ({ async cacheValid(outputs) { if (!outputs.document) return true; const doc = store.read<EditorDocumentV2>(outputs.document, 'document'); return (await Promise.all(Object.values(doc.assets).filter(asset => asset.locator.localSig?.startsWith('edit-audio-')).map(asset => loadLocalVideo(asset.locator.localSig!)))).every(Boolean); }, capability: EDITING_WORKFLOW_CAPABILITIES.find(cap => cap.id === id)!, ...body });
  const output = async (id: string, document: EditorDocumentV2, report: unknown) => ({ document: workflowJson(await store.put('document', id, document)), report: workflowJson(report) });
  return [
    ...editingPlanNodes(host),
    node('speech.voice-check', { async execute(args) { const transcript = store.read<AsrSegment[]>(args.transcript, 'transcript'); if (!dubbingVoicesReady(transcript, args.config as unknown as DubbingOptions)) throw new Error('请先为每位说话人选择音色，再继续生成配音。'); return { transcript: args.transcript }; } }),
    node('speech.empty', { async execute(args) { const media = store.read<SceneMedia>(args.media, 'media'); return { transcript: workflowJson(await store.put('transcript', media.sig, [])) }; } }),
    node('speech.project', { async execute(args) { const document = store.read<EditorDocumentV2>(args.document, 'document'); const transcript = editingSpeechCues(document, store.read(args.transcript, 'transcript')); return { transcript: workflowJson(await store.put('transcript', 'edited-speech', transcript)), durationSec: editingDuration(document) }; } }),
    node('edit.rough-cut', { stage: 'cleaning', async execute(args) {
      const document = store.read<EditorDocumentV2>(args.document, 'document'); const transcript = store.read<AsrSegment[]>(args.transcript, 'transcript'); const media = store.read<SceneMedia>(args.media, 'media');
      const options = args.options as unknown as { minimumPauseSec: number; paddingSec: number; fillers: boolean };
      const { detectSpeechSilenceCuts } = await import('./speech-silence');
      const cuts = await detectSpeechSilenceCuts(await host.media(media), { minimumPauseSec: options.minimumPauseSec, speechPaddingSec: options.paddingSec, onProgress: (done, total) => host.report('cleaning', { status: 'running', done, total, fraction: done / total }) });
      const fillers = options.fillers ? transcript.flatMap(segment => (segment.words ?? []).filter(word => /^(嗯+|呃+|额+|uh+|um+|erm+)[，,。.!?？]*$/iu.test(word.text.trim())).map(word => ({ fromSec: word.start, toSec: word.end }))) : [];
      const ranges = mergeEditingCuts([...cuts, ...fillers], media.durationSec);
      const next = ranges.length ? commit(document, [{ op: 'narration.removeRanges', input: { ranges, mainTranscript: transcript, clipTranscripts: {} } }]) : document;
      return output('rough-cut', next, { pauses: cuts.length, fillers: fillers.length, removedSec: editingDuration(document) - editingDuration(next) });
    } }),
    node('audio.cleanup', { async cacheValid(outputs) { const doc = store.read<EditorDocumentV2>(outputs.document, 'document'); const assets = Object.values(doc.assets).filter(asset => asset.locator.localSig?.startsWith('edit-audio-')); return (await Promise.all(assets.map(asset => loadLocalVideo(asset.locator.localSig!)))).every(Boolean); }, async execute(args) {
      const document = store.read<EditorDocumentV2>(args.document, 'document'); const options = args.options as unknown as { strength: number; normalize: boolean };
      const narration = document.timeline.tracks.find(track => track.role === 'narration' && !track.muted && track.clips.length);
      const sourceTrack = narration ?? document.timeline.tracks.find(track => track.id === document.semantics.primaryNarrativeTrackId)!;
      const sources = [...new Set(sourceTrack.clips.flatMap(clip => 'assetId' in clip && clip.assetId ? [clip.assetId] : []))];
      const next = structuredClone(document); const cleaned = new Map<string, SceneMedia>();
      const { decodeVideoAudio, toMono } = await import('./audio-decode'); const { denoiseWetPcm, decodeMono48k, blendPcm, encodeWavMono } = await import('./denoise');
      for (const assetId of sources) {
        const asset = document.assets[assetId]; const media: SceneMedia = { sig: asset.locator.localSig!, name: asset.label ?? 'speech', width: 0, height: 0, durationSec: asset.metadata.durationSec ?? editingDuration(document), url: asset.locator.remoteUrl };
        const audio = await decodeVideoAudio(await host.media(media)); host.check(); if (!audio) throw new Error('素材没有可清理的人声音轨。');
        const dry = await toMono(audio, 48000); const wetKey = 'dnwet:dfn3:' + media.sig;
        const cached = await loadLocalVideo(wetKey); const wet = cached ? await decodeMono48k(cached) : await denoiseWetPcm(dry, () => host.check());
        host.check(); if (!cached) await saveLocalVideo(new File([encodeWavMono(wet)], 'cleaned-wet.wav', { type: 'audio/wav' }), wetKey);
        const pcm = blendPcm(dry, wet, options.strength);
        if (options.normalize) { let gain = 1; const window = 4800; for (let offset = 0; offset < pcm.length; offset += window) { let sum = 0; const end = Math.min(pcm.length, offset + window); for (let i = offset; i < end; i++) sum += pcm[i] ** 2; const rms = Math.sqrt(sum / (end - offset)); const target = rms > .008 ? Math.max(.4, Math.min(4, .1 / rms)) : 1; for (let i = offset; i < end; i++) { gain += (target - gain) / 2400; pcm[i] = Math.max(-.95, Math.min(.95, pcm[i] * gain)); } } }
        cleaned.set(assetId, await cacheAudio(host, pcm, 48000, ['cleanup', media.sig, options], 'clean-speech.wav'));
      }
      for (const [assetId, media] of cleaned) next.assets['clean-' + assetId] = { id: 'clean-' + assetId, kind: 'audio', label: media.name, locator: { localSig: media.sig }, metadata: { durationSec: media.durationSec } };
      if (narration) { const track = next.timeline.tracks.find(track => track.id === narration.id)!; track.clips = track.clips.map(clip => 'assetId' in clip && clip.assetId && cleaned.has(clip.assetId) ? { ...clip, assetId: 'clean-' + clip.assetId } : clip); }
      else {
        const track = next.timeline.tracks.find(track => track.id === sourceTrack.id)!;
        const clips = track.clips.flatMap(clip => clip.kind === 'narrative' ? [{ id: 'clean-audio-' + clip.id, kind: 'audio' as const, anchor: { type: 'timeline' as const }, assetId: 'clean-' + clip.assetId, startFrame: clip.startFrame, durationFrames: clip.durationFrames, enabled: true, sourceInSec: clip.sourceInSec, sourceOutSec: clip.sourceOutSec, properties: { volumeDb: 0, fadeInSec: .01, fadeOutSec: .01 } }] : []);
        track.clips = track.clips.map(clip => clip.kind === 'narrative' ? { ...clip, properties: { ...clip.properties, audioMuted: true } } : clip);
        next.timeline.tracks.push({ id: 'clean-narration', type: 'audio', role: 'narration', name: '清理后人声', muted: false, hidden: false, locked: false, syncLocked: true, stackOrder: 0, clips });
      }
      return output('voice-cleanup', commit(document, [{ op: 'document.replace', input: { document: next } }]), { sources: cleaned.size, strength: options.strength, normalized: options.normalize });
    } }),
    node('graphics.generate', { async execute(args, context) {
      let document = store.read<EditorDocumentV2>(args.document, 'document'); const transcript = store.read<AsrSegment[]>(args.transcript, 'transcript'); const options = args.options as unknown as { instruction: string; maxCount: number };
      const plan = args.plan ? store.read<FramingPlan>(args.plan, 'edit-plan') : null;
      const moments = plan ? visualBeats(plan, 'graphic') : editingMoments(editingSpeechCues(document, transcript), options.maxCount, 6); const generated: string[] = [];
      for (const [index, moment] of moments.entries()) {
        host.check(); const box = 'payload' in moment && moment.payload ? moment.payload : { x: .06, y: .12, w: .42, h: .34 }; const duration = Math.min(editingDuration(document) - moment.start, Math.max(.8, moment.end - moment.start));
        const seed = { id: 'workflow-graphic-' + ('id' in moment ? moment.id : index), kind: 'custom', innerHtml: '<div></div>', timelineBody: '', durationSec: duration, boxPx: { w: Math.round(box.w * document.canvas.width), h: Math.round(box.h * document.canvas.height) } };
        const key = 'graphic-' + await artifactVersion(['graphics-v2', host.task.workflowEnvironmentRevision ?? 'local', document.appearance, moment.text, options.instruction, seed.boxPx, duration]);
        const cached = Object.values(store.entries).find(entry => entry.ref.kind === 'edit-plan' && entry.ref.id === key);
        let fields: Pick<Block, 'templateId' | 'slots'>;
        if (cached) fields = store.read(cached.ref, 'edit-plan');
        else {
          const compose = async (block: typeof seed, instruction: string) => studioProviders().composer.composeStream({ block, instruction, projectId: String(args.projectId), theme: document.appearance.theme, lang: 'zh', context: { script: transcript.map(segment => segment.text).join('\n'), beats: [{ text: moment.text, start: 0, end: duration }], backdrop: plan ? 'A reserved content area on the project theme background. Fill this local canvas readably; presenter and captions occupy separate regions. Do not create a presenter or duplicate subtitles.' : 'Transparent overlay beside the speaker. Reserve the central face and bottom 25% for captions.' } }, undefined, { signal: host.hooks.signal });
          const raw = await compose(seed, `${options.instruction}\n用视觉图形解释这一句，保持原语言：${moment.text}${'description' in moment ? '\n画面要求：' + moment.description : ''}`);
          const parsed = await acceptGeneratedComponent({ seed, raw, repair: (current, instruction) => compose({ ...seed, ...current }, instruction), failureMessage: reason => '动态图形未通过验证：' + reason });
          fields = composedBlockFields(parsed, duration); await store.put('edit-plan', key, fields); await context.savePartial({ completed: [...generated, key] });
        }
        document = commit(document, [{ op: 'overlay.insert', input: { block: { id: seed.id, ...fields, label: moment.text.slice(0, 30), startSec: moment.start, durationSec: duration, trackIndex: plan ? 4 : 3, box } } }]); generated.push(key);
      }
      if (plan) document = commit(document, [{ op: 'document.replace', input: { document: applyEditorialFraming(document, plan) } }]);
      return output('motion-graphics', document, { generated: generated.length });
    } }),
    node('camera.motion', { async execute(args) {
      let document = store.read<EditorDocumentV2>(args.document, 'document'); const options = args.options as unknown as { scale: number; intervalSec: number; transition: 'none' | 'fade' }; const duration = editingDuration(document);
      const plan = args.plan ? store.read<FramingPlan>(args.plan, 'edit-plan') : null;
      const speakerBeats = plan?.beats.filter(beat => beat.visual === 'speaker' && ['emphasis', 'transition', 'summary'].includes(beat.purpose)) ?? [];
      const atSecs = plan ? [...new Set(plan.beats.flatMap(beat => [beat.start, beat.end]))].filter(at => at > .05 && at < duration - .05) : Array.from({ length: Math.max(0, Math.ceil(duration / options.intervalSec) - 1) }, (_, index) => (index + 1) * options.intervalSec).filter(at => at < duration - .5);
      if (atSecs.length) document = commit(document, [{ op: 'narration.split', input: { atSecs } }]);
      const clips = document.timeline.tracks.find(track => track.id === document.semantics.primaryNarrativeTrackId)!.clips.filter(clip => clip.kind === 'narrative');
      const updates = clips.flatMap((clip, index) => {
        const middle = (clip.startFrame + clip.durationFrames / 2) / document.canvas.fps;
        if (plan && !speakerBeats.some(beat => middle >= beat.start && middle < beat.end)) return [];
        return [{ clipId: clip.id, patch: { properties: { zoom: { preset: 'slow-push' as const, atSec: 0, scale: plan ? options.scale : index % 2 ? 1.02 : options.scale, durationSec: clip.durationFrames / document.canvas.fps }, ...(options.transition === 'fade' && index ? { transIn: { prevId: clips[index - 1].id, effect: 'fade', durationSec: .2 } } : {}) } } }];
      });
      const next = updates.length ? commit(document, [{ op: 'narrative.patch', input: { updates } }]) : document;
      return output('camera-movement', next, { shots: updates.length, scale: options.scale, transition: options.transition });
    } }),
    node('overlays.auto', { async execute(args) {
      const document = store.read<EditorDocumentV2>(args.document, 'document'); const options = args.options as unknown as { query: string; maxCount: number };
      const catalog = (await studioProviders().curatedAssets?.listSearchDocuments() ?? []).filter(asset => asset.kind === 'image' && asset.origin === 'sticker' && asset.locator?.url);
      if (!catalog.length) throw new Error('贴纸素材库暂不可用，请检查素材库连接。');
      const framePlan = args.plan ? store.read<FramingPlan>(args.plan, 'edit-plan') : null;
      const moments = editingMoments(editingSpeechCues(document, store.read(args.transcript, 'transcript')).filter(cue => !framePlan?.beats.some(beat => beat.visual !== 'speaker' && cue.start < beat.end && cue.end > beat.start)), options.maxCount, 4); const next = structuredClone(document); const clips = [];
      for (const [index, moment] of moments.entries()) {
        const [match] = await libraryMatches(options.query || moment.text, 'image', catalog, host.hooks.signal); host.check(); if (!match?.locator?.url) continue;
        const { materializeRemoteMedia } = await import('./remote-media'); const material = await materializeRemoteMedia(match.locator.url, { name: match.label + '.png', signal: host.hooks.signal });
        if (!await saveLocalVideo(material.file, material.sig)) throw new Error('贴纸未保存，请重试。'); host.files.set(material.sig, material.file);
        const id = 'float-asset-' + index; next.assets[id] = { id, kind: 'image', label: match.label, locator: { localSig: material.sig, remoteUrl: match.locator.url }, metadata: { width: match.dimensions?.w, height: match.dimensions?.h } };
        const frames = Math.max(1, Math.round((moment.end - moment.start) * document.canvas.fps)); const box = { x: .72, y: .16, w: .22, h: .25 };
        clips.push({ id: 'float-' + index, kind: 'media' as const, assetId: id, startFrame: Math.round(moment.start * document.canvas.fps), durationFrames: frames, enabled: true, sourceInSec: 0, sourceOutSec: frames / document.canvas.fps, fit: 'contain' as const, box, keyframes: { opacity: [{ frame: 0, value: 0 }, { frame: Math.min(6, frames - 1), value: 1 }, { frame: Math.max(0, frames - 6), value: 1 }, { frame: frames, value: 0 }], box: [{ frame: 0, ...box, y: box.y + .04 }, { frame: Math.min(10, frames), ...box }] } });
      }
      if (clips.length) next.timeline.tracks.push({ id: 'floating-overlays', type: 'visual', name: '悬浮叠加', hidden: false, muted: true, locked: false, syncLocked: true, stackOrder: 4, clips });
      return output('floating-overlay', commit(document, [{ op: 'document.replace', input: { document: next } }]), { placed: clips.length, unmatched: moments.length - clips.length });
    } }),
    node('layout.auto', { async execute(args) {
      let document = store.read<EditorDocumentV2>(args.document, 'document'); const options = args.options as unknown as { aspect: 'original' | 'portrait' | 'landscape' | 'square'; arrange: boolean }; const media = store.read<SceneMedia>(args.media, 'media');
      const canvas = captionTaskCanvas(options.aspect, media);
      if (canvas.width !== document.canvas.width || canvas.height !== document.canvas.height) document = commit(document, [{ op: 'canvas.resize', input: { ...canvas, mainTranscript: null, clipTranscripts: {} } }]);
      if (args.plan) {
        const plan = store.read<FramingPlan>(args.plan, 'edit-plan');
        if (plan.canvas.width !== document.canvas.width || plan.canvas.height !== document.canvas.height) throw new Error('画幅与内容安排不一致，请重新生成安排。');
        const framed = applyEditorialFraming(document, plan);
        return output('auto-layout', commit(document, [{ op: 'document.replace', input: { document: framed } }]), { ...canvas, arranged: framed.timeline.tracks.find(track => track.id === 'editorial-ground')?.clips.length ?? 0 });
      }
      let arranged = 0;
      if (options.arrange) {
        const graphics = document.timeline.tracks.flatMap(track => track.clips).filter(clip => clip.kind === 'graphic');
        for (const graphic of graphics) {
          const start = graphic.startFrame / document.canvas.fps; const end = (graphic.startFrame + graphic.durationFrames) / document.canvas.fps;
          const atSecs = [start, end].filter(at => at > .05 && at < editingDuration(document) - .05);
          if (atSecs.length) document = commit(document, [{ op: 'narration.split', input: { atSecs } }]);
          const shots = document.timeline.tracks.find(track => track.id === document.semantics.primaryNarrativeTrackId)?.clips.filter(clip => clip.kind === 'narrative' && clip.startFrame < graphic.startFrame + graphic.durationFrames && clip.startFrame + clip.durationFrames > graphic.startFrame) ?? [];
          for (const shot of shots) document = commit(document, [{ op: 'layout.apply', input: { layout: { layout: canvas.height > canvas.width ? 'split-top-bottom' : 'split-left-right', blockIds: [graphic.id], shotId: shot.id, videoPosition: canvas.height > canvas.width ? 'top' : 'right' } } }]);
          arranged++;
        }
      }
      return output('auto-layout', document, { ...canvas, arranged });
    } }),
    node('audio.effects', { async execute(args) {
      let document = store.read<EditorDocumentV2>(args.document, 'document'); const options = args.options as unknown as { style: 'soft' | 'pop' | 'whoosh'; maxCount: number; volumeDb: number };
      const cues = editingSpeechCues(document, store.read(args.transcript, 'transcript')); const preferred = cues.filter(cue => /注意|关键|重要|第一|最后|但是|重点|important|first|finally|but|however/i.test(cue.text));
      const plan = args.plan ? store.read<FramingPlan>(args.plan, 'edit-plan') : null;
      const moments = editingMoments(plan ? plan.beats.filter(beat => beat.purpose === 'emphasis' || beat.purpose === 'transition').map(({ start, end, text }) => ({ start, end, text })) : preferred.length ? preferred : cues, options.maxCount, 5);
      const media = await cacheAudio(host, soundEffectPcm(options.style), 48000, ['sfx-v1', options.style], options.style + '.wav');
      for (const [index, cue] of moments.entries()) if (editingDuration(document) - cue.start >= .2) document = await addAudio(host, document, media, 'sfx', 'editing-sfx-' + index, cue.start, options.volumeDb);
      return output('sound-effects', document, { placed: moments.length, style: options.style });
    } }),
    node('audio.music', { async execute(args) {
      const document = store.read<EditorDocumentV2>(args.document, 'document'); const options = args.options as unknown as { query: string; assetSig: string; name: string; volumeDb: number; duckDb: number };
      let file: File | null = options.assetSig ? await loadLocalVideo(options.assetSig) : null; let sig = options.assetSig; let label = options.name;
      if (options.assetSig && !file) throw new Error('所选配乐在本机不可用，请重新上传。');
      if (!file) {
        const catalog = (await studioProviders().curatedAssets?.listSearchDocuments() ?? []).filter(asset => asset.kind === 'audio' && asset.origin === 'bgm' && asset.locator?.url);
        const [match] = await libraryMatches(options.query || 'calm narration', 'audio', catalog, host.hooks.signal);
        if (!match?.locator?.url) throw new Error('未找到匹配配乐，请更换风格描述或上传音乐。');
        const material = await (await import('./remote-media')).materializeRemoteMedia(match.locator.url, { name: match.label + '.mp3', signal: host.hooks.signal });
        file = material.file; sig = material.sig; label = match.label; if (!await saveLocalVideo(file, sig)) throw new Error('原始配乐未缓存，请重试。'); host.files.set(sig, file);
      }
      const { decodeAudioFile, toMono } = await import('./audio-decode'); const pcm = await toMono(await decodeAudioFile(file), 48000); host.check();
      const cues = editingSpeechCues(document, store.read(args.transcript, 'transcript'));
      const media = await cacheAudio(host, musicBedPcm(pcm, 48000, editingDuration(document), cues, options.volumeDb, options.duckDb), 48000, ['music-v1', sig, options.volumeDb, options.duckDb, cues.map(cue => [cue.start, cue.end]), editingDuration(document)], label + '-ducked.wav');
      const next = await addAudio(host, document, media, 'music', 'editing-music', 0, 0);
      return output('background-music', next, { source: label, originalSig: sig, volumeDb: options.volumeDb, duckDb: options.duckDb, durationSec: media.durationSec });
    } }),
  ];
}
