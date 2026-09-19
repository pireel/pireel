import { dubbingRate, dubbingSpeakers, dubbingTurns, dubbingVoiceFor, dubbingVoicesReady, dubbingSpeechWindow, splitDubbingScript, DUBBING_LANGUAGES, type DubbingOptions, type DubbingState, type DubbingSpeech } from '@pireel/studio-engine/dubbing-task';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import { buildCaptionBaseDocument } from '@pireel/studio-engine/caption-task';
import { applyDocumentTransaction } from '@pireel/studio-engine/document-transaction';
import { DUBBING_WORKFLOW_CAPABILITIES } from '@pireel/studio-engine/workflow-dubbing-template';
import { workflowJson, workflowRequestId, artifactVersion } from '@pireel/studio-engine/workflow-artifacts';
import { studioProviders } from '@pireel/studio-engine/providers';
import { SceneWorkflowHost, type SceneNode, type SceneMedia } from './scene-workflow-runtime';
import { translateTextRows } from './caption-translation-operation';
import { transcribeFile, probeVideoFile } from './media';
import { saveLocalVideo, loadLocalVideo } from './local-media';
import { materializeRemoteMedia } from './remote-media';

interface SpeechPlan {
  text: string; language: string; sourceText: string; translatedTurns?: string[]; turnsKey?: string; signature: string;
  parts: { text: string; voiceId: string; group: number; start: number; end: number }[];
}
interface SpeechArtifact { parts: DubbingSpeech[]; signature: string; text: string }
interface AlignedMedia extends SceneMedia { signature: string; planKey: string }
async function jsonRequest(url: string, input: unknown, signal: AbortSignal) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal });
  const body = await response.json(); if (!response.ok) throw new Error(body.detail ?? body.error ?? '请求失败，请重试。'); return body;
}
async function pause(signal: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 1500);
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
  });
}
export function dubbingWorkflowNodes(host: SceneWorkflowHost): SceneNode[] {
  const { store } = host; const signal = host.hooks.signal;
  const node = (id: string, body: Omit<SceneNode, 'capability'>): SceneNode => ({ capability: DUBBING_WORKFLOW_CAPABILITIES.find(c => c.id === id)!, ...body });
  const project = (patch: DubbingState) => ({ dubbing: { ...host.task.dubbing, ...patch } });
  return [node('speech.translate', { stage: 'translating', async execute(args) {
    const config = args.config as unknown as DubbingOptions;
    const transcript = store.read<AsrSegment[]>(args.transcript, 'transcript');
    const media = store.read<SceneMedia>(args.media, 'media');
    const cached = args.cached as unknown as DubbingState;
    const window = dubbingSpeechWindow(transcript, media.durationSec);
    const speakers = dubbingSpeakers(transcript); const multiple = speakers.length > 1;
    if (multiple && (!dubbingVoicesReady(transcript, config) || config.lipSync)) {
      await host.checkpoint({ stage: 'ready' });
      throw Object.assign(new Error(config.lipSync ? '识别到多位说话人，请关闭口型同步，并为每个人选择音色。' : '识别到多位说话人，请为每个人选择音色。'), { code: 'dubbing_setup_required' });
    }
    const sourceText = transcript.map(segment => segment.text).join('\n');
    const translateTexts = async (texts: string[]) => {
      const translate = studioProviders().translate; if (!translate) throw new Error('翻译服务尚未连接。');
      const rows = texts.flatMap((text, parent) => (text.match(/[^\n]{1,350}/gu) ?? []).map(text => ({ text, parent })));
      const translated = await translateTextRows(rows.map(row => row.text), config.language, translate, host.check, (done, total) => host.report('translating', { status: 'running', fraction: done / total }));
      const byIndex = new Map(translated.map(row => [row.index, row.text]));
      return texts.map((_, parent) => rows.flatMap((row, index) => row.parent === parent ? [byIndex.get(index)!] : []).join('\n'));
    };
    let text: string; let parts: SpeechPlan['parts']; let translatedTurns: string[] | undefined; let turnsKey: string | undefined;
    if (multiple) {
      const turns = dubbingTurns(transcript, media.durationSec); turnsKey = JSON.stringify(turns);
      translatedTurns = cached.language === config.language && cached.turnsKey === turnsKey && cached.translatedTurns?.length === turns.length ? cached.translatedTurns : await translateTexts(turns.map(turn => turn.text));
      const edited = turns.map((turn, i) => (config.turnScripts?.[turn.id] ?? translatedTurns![i]).trim());
      if (edited.some(part => !part)) throw new Error('发言文案不能为空。');
      text = edited.join('\n'); splitDubbingScript(text);
      parts = turns.flatMap((turn, index) => splitDubbingScript(edited[index]).map(text => ({ text, voiceId: dubbingVoiceFor(turn.speaker, speakers, config), group: index, start: turn.start, end: turn.end })));
    } else {
      text = config.script?.trim() || (cached.language === config.language && cached.sourceText === sourceText ? cached.translatedText : '') || (await translateTexts([sourceText]))[0];
      parts = splitDubbingScript(text).map(text => ({ text, voiceId: config.voiceId, group: 0, start: window.start, end: window.end }));
    }
    const signature = multiple ? JSON.stringify([config.language, parts]) : JSON.stringify([text, config.voiceId, config.language]);
    const value: SpeechPlan = { text, parts, language: config.language, sourceText, translatedTurns, turnsKey, signature };
    return { plan: workflowJson(await store.put('speech-plan', 'dubbing', value)), value: workflowJson(value) };
  }, project: outputs => { const plan = outputs.value as unknown as SpeechPlan; return project({ language: plan.language, sourceText: plan.sourceText, translatedText: plan.text, translatedTurns: plan.translatedTurns, turnsKey: plan.turnsKey }); } }),
  node('speech.synthesize', { stage: 'voicing', reconcile: true, cacheInputs(args) { const plan = args.plan as unknown as SpeechPlan; return { language: plan.language, parts: workflowJson(plan.parts.map(part => ({ text: part.text, voiceId: part.voiceId }))) }; }, async execute(args, context) {
    const plan = args.plan as unknown as SpeechPlan;
    const cached = args.cached as unknown as DubbingState;
    if (!Array.isArray(plan.parts) || !plan.parts.length || plan.parts.some(part => !part.text?.trim() || !part.voiceId || !Number.isInteger(part.group) || part.group < 0 || !Number.isFinite(part.start) || !Number.isFinite(part.end) || part.start < 0 || part.end <= part.start) || !DUBBING_LANGUAGES.some(language => language.id === plan.language)) throw new Error('配音规划无效。');
    // Content-derived identity protects TTS from stale signatures in an edited LLM/approval value.
    const signature = plan.parts.some(part => part.group !== 0) ? JSON.stringify([plan.language, plan.parts]) : JSON.stringify([plan.parts.map(part => part.text).join(''), plan.parts[0].voiceId, plan.language]);
    const legacySignature = plan.parts.some(part => part.group !== 0) ? JSON.stringify(plan.parts) : JSON.stringify([plan.text, plan.parts[0].voiceId]);
    const partial = context.partial<{ parts: DubbingSpeech[]; requestId: string }>();
    const requestId = partial?.requestId ?? (cached as DubbingState & { legacyRunId?: string }).legacyRunId ?? await workflowRequestId(context.idempotencyKey);
    let parts = partial?.parts;
    if (!parts) parts = (cached.speechSignature === signature || (cached.language === plan.language && cached.speechSignature === legacySignature)) ? cached.speechParts : undefined;
    if (!parts && plan.parts.length === 1 && cached.language === plan.language && [signature, legacySignature].includes(cached.speech?.signature ?? '')) parts = [cached.speech!];
    parts ??= [];
    await context.savePartial({ parts, requestId }, project({ speechParts: parts, speechSignature: signature }));
    for (let index = 0; index < plan.parts.length; index++) {
      host.check(); const part = plan.parts[index];
      if (!parts[index]) {
        let body = await jsonRequest('/api/studio/dubbing-speech', { runId: requestId, projectId: args.projectId, chunkIndex: index, language: DUBBING_LANGUAGES.find(language => language.id === plan.language)!.code, text: part.text, voiceId: part.voiceId, name: `${args.name} · ${plan.language}` }, signal);
        while (body.status === 'pending') {
          await pause(signal); const response = await fetch(`/api/studio/dubbing-speech?id=${encodeURIComponent(body.id)}`, { signal }); body = await response.json();
          if (!response.ok) throw new Error(body.error ?? '配音进度暂时无法读取。');
        }
        if (body.status === 'failed') throw new Error(body.error ?? '配音生成失败。');
        if (!body.asset?.url || !Number.isFinite(body.asset.durationSec) || !(body.asset.durationSec > 0)) throw new Error('配音未返回有效音频。');
        if (typeof body.asset.cost === 'number') context.recordUsage({ source: 'server', reference: body.id ?? body.asset.key, credits: body.asset.cost, audioSeconds: body.asset.durationSec });
        parts[index] = { url: body.asset.url, key: body.asset.key, durationSec: body.asset.durationSec, signature: JSON.stringify([part.text, part.voiceId, plan.language]) };
        await context.savePartial({ parts, requestId }, project({ speechParts: parts, speechSignature: signature }));
      }
      host.report('voicing', { status: 'running', fraction: (index + 1) / plan.parts.length });
    }
    return { speech: workflowJson(await store.put('speech', 'dubbing', { parts, signature, text: plan.parts.map(part => part.text).join('') })) };
  }, project: outputs => { const speech = store.read<SpeechArtifact>(outputs.speech, 'speech'); return project({ speechParts: speech.parts, speechSignature: speech.signature, translatedText: speech.text }); } }),
  node('audio.align', { stage: 'aligning', async cacheValid(outputs) { const audio = store.read<SceneMedia>(outputs.audio, 'media'); return host.files.has(audio.sig) || !!await loadLocalVideo(audio.sig); }, async execute(args) {
    const speech = store.read<SpeechArtifact>(args.speech, 'speech');
    const plan = args.plan as unknown as SpeechPlan;
    const media = store.read<SceneMedia>(args.media, 'media');
    const cached = args.cached as unknown as DubbingState;
    if (plan.parts.length !== speech.parts.length || plan.parts.some(part => part.start < 0 || part.end > media.durationSec || part.end <= part.start)) throw new Error('配音时间规划无效。');
    const planKey = await artifactVersion([args.speech, plan.parts, media.durationSec]);
    let aligned = cached.alignedPlanKey === planKey && cached.alignedAudioSig ? await loadLocalVideo(cached.alignedAudioSig) : null;
    if (!aligned) {
      const { decodeAudioFile, toMono } = await import('./audio-decode');
      const { signalsmithStretch, tiledStretch } = await import('./time-stretch');
      const { encodeWavMono } = await import('./denoise');
      const sampleRate = 24000; const parts = speech.parts;
      const output = new Float32Array(Math.ceil(media.durationSec * sampleRate));
      const groups = new Map<number, { total: number; elapsed: number; start: number; end: number; cursor: number; last: number }>();
      plan.parts.forEach((entry, index) => {
        const group = groups.get(entry.group) ?? { total: 0, elapsed: 0, start: Math.round(entry.start * sampleRate), end: Math.min(output.length, Math.round(entry.end * sampleRate)), cursor: Math.round(entry.start * sampleRate), last: index };
        group.total += parts[index].durationSec; group.last = index; groups.set(entry.group, group);
      });
      for (const group of groups.values()) dubbingRate(group.total * sampleRate, group.end - group.start);
      for (let index = 0; index < parts.length; index++) {
        host.check(); const part = parts[index];
        const remote = await materializeRemoteMedia(part.url, { name: `dub-speech-${index}.mp3`, signal });
        const audio = await decodeAudioFile(remote.file); const pcm = await toMono(audio, sampleRate); host.check();
        const group = groups.get(plan.parts[index].group)!; group.elapsed += part.durationSec;
        const end = index === group.last ? group.end : group.start + Math.round((group.end - group.start) * group.elapsed / group.total);
        const targetLength = end - group.cursor; const rate = dubbingRate(pcm.length, targetLength);
        const fitted = Math.abs(rate - 1) < .001 ? pcm : (await tiledStretch(signalsmithStretch)({ channels: [pcm], sampleRate, rate }))[0]!;
        host.check(); if (Math.abs(fitted.length - targetLength) > sampleRate * .05) throw new Error('配音无法完整适配原片，请调整文案。');
        for (let sample = 0; sample < Math.min(fitted.length, targetLength); sample++) output[group.cursor + sample] += fitted[sample];
        group.cursor = end; host.report('aligning', { status: 'running', fraction: (index + 1) / parts.length });
      }
      let peak = 1; for (const sample of output) peak = Math.max(peak, Math.abs(sample));
      if (peak > 1) for (let sample = 0; sample < output.length; sample++) output[sample] /= peak;
      aligned = new File([encodeWavMono(output, sampleRate)], `dubbing-${speech.signature.length}.wav`, { type: 'audio/wav' });
    }
    // Identity includes the consumed speech and timing, not a temporary URL or file name alone.
    const sig = 'dub-audio-' + planKey;
    await saveLocalVideo(aligned, sig); host.files.set(sig, aligned);
    if (studioProviders().sceneProjects && !await studioProviders().vault.backup(aligned, sig)) throw new Error('配音音轨尚未同步，请重试。');
    return { audio: workflowJson(await store.put('media', 'aligned-audio', { sig, name: aligned.name, width: 0, height: 0, durationSec: media.durationSec, kind: 'audio', signature: speech.signature, planKey })) };
  }, project: outputs => project({ alignedAudioSig: store.read<AlignedMedia>(outputs.audio, 'media').sig, alignedPlanKey: store.read<AlignedMedia>(outputs.audio, 'media').planKey }) }),
  node('video.lipsync', { stage: 'lipsync', reconcile: true, async execute(args, context) {
    const media = store.read<SceneMedia>(args.media, 'media');
    const audio = store.read<AlignedMedia>(args.audio, 'media');
    const cached = args.cached as unknown as DubbingState;
    let state = context.partial<DubbingState & { workflowRequestId?: string }>() ?? (cached.alignedAudioSig === audio.sig ? { ...cached } : { sourceVideoKey: cached.sourceVideoKey, sourceVideoUrl: cached.sourceVideoUrl });
    const requestId = state.workflowRequestId ?? (cached as DubbingState & { legacyRunId?: string }).legacyRunId ?? await workflowRequestId(context.idempotencyKey);
    state = { ...state, workflowRequestId: requestId };
    await context.savePartial(state);
    const upload = studioProviders().uploads.upload;
    if (!state.alignedAudioKey) { const uploaded = await upload(await host.media(audio), { contentType: 'audio/wav', filename: 'dubbing-aligned.wav' }); state = { ...state, alignedAudioSig: audio.sig, alignedAudioKey: uploaded.key, alignedAudioUrl: uploaded.url }; await context.savePartial(state, project(state)); }
    if (!state.sourceVideoKey) { const file = await host.media(media); const uploaded = await upload(file, { contentType: file.type || 'video/mp4', filename: file.name }); state = { ...state, sourceVideoKey: uploaded.key, sourceVideoUrl: uploaded.url }; await context.savePartial(state, project(state)); }
    if (!state.lipJobId) {
      const job = await jsonRequest('/api/studio/dubbing-lipsync', { runId: requestId, projectId: args.projectId, videoKey: state.sourceVideoKey, audioKey: state.alignedAudioKey }, signal);
      if (!job.id || job.status === 'failed') throw new Error(job.error ?? '口型任务提交失败。');
      state.lipJobId = job.id; await context.savePartial(state, project(state));
    }
    while (!state.lipResultUrl) {
      host.check(); const response = await fetch(`/api/studio/dubbing-lipsync?id=${encodeURIComponent(state.lipJobId!)}`, { signal }); const job = await response.json();
      if (!response.ok || job.status === 'failed') throw new Error(job.error ?? '口型任务暂时无法读取。');
      if (job.status === 'succeeded' && job.url) { state.lipResultUrl = job.url; await context.savePartial(state, project(state)); break; }
      await pause(signal);
    }
    const picture = (await materializeRemoteMedia(state.lipResultUrl!, { name: 'lip-synced.mp4', type: 'video/mp4', signal })).file;
    const metadata = await probeVideoFile(picture);
    if (Math.abs(metadata.durationSec - media.durationSec) > .4) throw new Error('口型结果时长不匹配，请重新生成。');
    const sig = 'lip-' + state.lipJobId; host.files.set(sig, picture); await saveLocalVideo(picture, sig);
    return { media: workflowJson(await store.put('media', 'lip-result', { ...media, sig, name: picture.name, url: state.lipResultUrl })) };
  } }),
  node('speech.dub-transcribe', { stage: 'styling', async execute(args) {
    const audio = store.read<AlignedMedia>(args.audio, 'media'); const cached = args.cached as unknown as DubbingState;
    const transcript = cached.captionAudioSig === audio.sig && cached.captionTranscript?.length ? cached.captionTranscript : await transcribeFile(await host.media(audio), { signal, onPhase: detail => host.report('styling', { status: 'running', detail }) });
    if (!transcript.length) throw new Error('未识别到配音字幕，请重试。');
    return { transcript: workflowJson(await store.put('transcript', audio.sig, transcript)), audioSig: audio.sig, signature: audio.signature };
  }, project: outputs => project({ captionTranscript: store.read(outputs.transcript, 'transcript'), captionSignature: String(outputs.signature), captionAudioSig: String(outputs.audioSig) }) }),
  node('dubbing.compose', { async execute(args) {
    const media = store.read<SceneMedia>(args.media, 'media'); const audio = store.read<SceneMedia>(args.audio, 'media');
    const document = buildCaptionBaseDocument({ ...media, sourceUrl: '', sourceName: media.name, sourceSig: media.sig, projectId: String(args.projectId), transcript: [], options: { presetId: 'clean', aspect: 'original', shortenPauses: false } });
    const result = applyDocumentTransaction(document, { ops: [
      { op: 'narrative.patch', input: { updates: document.timeline.tracks.flatMap(track => track.clips.flatMap(clip => clip.kind === 'narrative' ? [{ clipId: clip.id, patch: { audio: { mute: true } } }] : [])) } },
      { op: 'command', input: { command: { type: 'track.insert', track: { id: 'dubbing-narration', type: 'audio', role: 'narration', name: 'Dubbing', syncLocked: true } } } },
      { op: 'audio.add', input: { toTrackId: 'dubbing-narration', clip: { id: 'dub-audio', sig: audio.sig, src: await host.url(audio), role: 'narration', durationSec: audio.durationSec, startSec: 0, volumeDb: 0, fadeInSec: 0, fadeOutSec: 0 } } },
    ] }, { projectId: String(args.projectId) });
    if (!result.ok) throw new Error(result.error.message);
    return { document: workflowJson(await store.put('document', 'dubbing', result.document)) };
  } })];
}
