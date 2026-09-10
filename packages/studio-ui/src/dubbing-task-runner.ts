import { dubbingRate, dubbingSpeakers, dubbingTurns, dubbingVoiceFor, dubbingVoicesReady, dubbingSpeechWindow, dubbingVideoDocument, splitDubbingScript, DUBBING_MAX_DURATION_SEC, DUBBING_MAX_VIDEO_BYTES, DUBBING_LANGUAGES } from '@pireel/studio-engine/dubbing-task';
import { projectDocumentToComposition } from '@pireel/studio-engine/composition';
import { studioProviders } from '@pireel/studio-engine/providers';
import type { CaptionTaskRecord, CaptionProcessingStage, CaptionTaskProgress } from './caption-task-store';
import { captionProcessingStages } from './caption-task-progress';
import { fileSig, probeVideoFile, transcribeFile } from './media';
import { saveLocalVideo, loadLocalVideo } from './local-media';
import { materializeRemoteMedia } from './remote-media';
import { buildCaptionTaskDocument } from '@pireel/studio-engine/caption-task';

type Hooks = { signal: AbortSignal; checkpoint: (task: CaptionTaskRecord) => Promise<void>; progress: (fraction: number) => void; stageProgress?: (progress: CaptionTaskProgress) => void };
async function jsonRequest(url: string, input: unknown, signal: AbortSignal) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal });
  const body = await response.json();
  if (!response.ok) throw new Error(body.detail ?? body.error ?? '请求失败，请重试。');
  return body;
}
async function pause(signal: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 1500);
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
  });
}
export async function runDubbingTask(task: CaptionTaskRecord, file: File, hooks: Hooks): Promise<{ task: CaptionTaskRecord; video: Blob }> {
  let next = structuredClone(task); const config = next.options.dubbing!;
  if (!DUBBING_LANGUAGES.some((language) => language.id === config.language) || !config.voiceId) throw new Error('请选择目标语言和声音。');
  if (config.script !== undefined && !config.script.trim()) throw new Error('配音文案不能为空。');
  if (!Number.isFinite(task.durationSec) || task.durationSec <= 0 || task.durationSec > DUBBING_MAX_DURATION_SEC) throw new Error('支持 30 分钟以内的视频。');
  if (file.size > DUBBING_MAX_VIDEO_BYTES) throw new Error('请选择 1GB 以下的视频。');
  next.dubbing ??= {};
  const previousLanguage = next.dubbing.language;
  next.progress = Object.fromEntries(captionProcessingStages(next.options).map((stage) => [stage, { status: 'pending' }]));
  const check = () => { if (hooks.signal.aborted) throw new DOMException('Cancelled', 'AbortError'); };
  const report = (stage: CaptionProcessingStage, status: 'running' | 'completed', fraction?: number, detail?: string) => {
    check(); next = { ...next, progress: { ...next.progress, [stage]: { status, fraction, detail } } }; hooks.stageProgress?.(next.progress!);
  };
  const checkpoint = async (stage: CaptionProcessingStage) => { report(stage, 'running'); next = { ...next, stage, error: undefined, updatedAt: Date.now() }; await hooks.checkpoint(next); check(); };
  report('preparing', 'completed', 1);
  await checkpoint('transcribing');
  if (!next.transcript?.length) {
    const transcript = await transcribeFile(file, { signal: hooks.signal, onPhase: (detail) => report('transcribing', 'running', undefined, detail) });
    check();
    // Progress replaces `next` while ASR is pending; attach its result to the current snapshot.
    next.transcript = transcript;
  }
  check(); const window = dubbingSpeechWindow(next.transcript, next.durationSec);
  report('transcribing', 'completed', 1);
  const speakers = dubbingSpeakers(next.transcript); const multiple = speakers.length > 1;
  if (multiple && (!dubbingVoicesReady(next.transcript, config) || config.lipSync)) {
    next = { ...next, stage: 'ready' }; await hooks.checkpoint(next); check();
    throw Object.assign(new Error(config.lipSync ? '识别到多位说话人，请关闭口型同步，并为每个人选择音色。' : '识别到多位说话人，请为每个人选择音色。'), { code: 'dubbing_setup_required' });
  }
  await checkpoint('translating');
  const sourceText = next.transcript.map((segment) => segment.text).join('\n');
  const translateTexts = async (texts: string[]) => {
    const translate = studioProviders().translate;
    if (!translate) throw new Error('翻译服务尚未连接。');
    const rows = texts.flatMap((text, parent) => (text.match(/[^\n]{1,350}/gu) ?? []).map((text) => ({ text, parent }))).map((row, index) => ({ ...row, index }));
    const translated = texts.map(() => [] as string[]);
    for (let i = 0; i < rows.length; i += 250) {
      check(); const batch = rows.slice(i, i + 250); const output = await translate(batch.map(({ text, index }) => ({ text, index })), config.language); check();
      const byId = new Map<number, string>();
      for (const row of output) {
        if (!batch.some((source) => source.index === row.index) || byId.has(row.index) || !row.text?.trim()) throw new Error('译文不完整，请重试。');
        byId.set(row.index, row.text.trim());
      }
      if (byId.size !== batch.length) throw new Error('译文不完整，请重试。');
      for (const row of batch) translated[row.parent].push(byId.get(row.index)!);
      report('translating', 'running', Math.min(rows.length, i + batch.length) / rows.length);
    }
    return translated.map((parts) => parts.join('\n'));
  };
  let text: string;
  let speechPlan: { text: string; voiceId: string; group: number; start: number; end: number }[];
  if (multiple) {
    const turns = dubbingTurns(next.transcript, next.durationSec); const turnsKey = JSON.stringify(turns);
    const translated = next.dubbing.language === config.language && next.dubbing.turnsKey === turnsKey && next.dubbing.translatedTurns?.length === turns.length
      ? next.dubbing.translatedTurns : await translateTexts(turns.map((turn) => turn.text));
    const edited = turns.map((turn, index) => (config.turnScripts?.[turn.id] ?? translated[index]).trim());
    if (edited.some((part) => !part)) throw new Error('发言文案不能为空。');
    text = edited.join('\n'); splitDubbingScript(text);
    speechPlan = turns.flatMap((turn, index) => splitDubbingScript(edited[index]).map((text) => ({ text, voiceId: dubbingVoiceFor(turn.speaker, speakers, config), group: index, start: turn.start, end: turn.end })));
    next.dubbing = { ...next.dubbing, language: config.language, sourceText, translatedText: text, translatedTurns: translated, turnsKey };
  } else {
    text = config.script?.trim() || (next.dubbing.language === config.language && next.dubbing.sourceText === sourceText ? next.dubbing.translatedText : '') || (await translateTexts([sourceText]))[0];
    speechPlan = splitDubbingScript(text).map((text) => ({ text, voiceId: config.voiceId, group: 0, start: window.start, end: window.end }));
    next.dubbing = { ...next.dubbing, language: config.language, sourceText, translatedText: text };
  }
  const speechTexts = speechPlan.map((part) => part.text);
  report('translating', 'completed', 1);
  await checkpoint('voicing');
  const legacySignature = multiple ? JSON.stringify(speechPlan) : JSON.stringify([text, config.voiceId]);
  const signature = multiple ? JSON.stringify([config.language, speechPlan]) : JSON.stringify([text, config.voiceId, config.language]);
  if (previousLanguage === config.language && next.dubbing.speechSignature === legacySignature) next.dubbing.speechSignature = signature;
  if (next.dubbing.speechSignature !== signature) {
    const legacy = speechTexts.length === 1 && previousLanguage === config.language && (next.dubbing.speech?.signature === signature || next.dubbing.speech?.signature === legacySignature) ? next.dubbing.speech : undefined;
    next.dubbing = { language: config.language, sourceText, translatedText: text, translatedTurns: next.dubbing.translatedTurns, turnsKey: next.dubbing.turnsKey,
      sourceVideoKey: next.dubbing.sourceVideoKey, sourceVideoUrl: next.dubbing.sourceVideoUrl,
      speechSignature: signature, speechParts: legacy ? [legacy] : [] };
  }
  next.dubbing.speechParts ??= [];
  for (let index = 0; index < speechTexts.length; index++) {
    check();
    if (!next.dubbing.speechParts[index]) {
      let body = await jsonRequest('/api/studio/dubbing-speech', { runId: next.generationId, projectId: next.id, chunkIndex: index, language: DUBBING_LANGUAGES.find((language) => language.id === config.language)!.code, text: speechTexts[index], voiceId: speechPlan[index].voiceId, name: `${next.name} · ${config.language}` }, hooks.signal);
      check();
      while (body.status === 'pending') {
        await pause(hooks.signal);
        const response = await fetch(`/api/studio/dubbing-speech?id=${encodeURIComponent(body.id)}`, { signal: hooks.signal });
        body = await response.json();
        if (!response.ok) throw new Error(body.error ?? '配音进度暂时无法读取。');
      }
      check();
      if (body.status === 'failed') throw new Error(body.error ?? '配音生成失败。');
      if (!body.asset?.url || !Number.isFinite(body.asset.durationSec) || !(body.asset.durationSec > 0)) throw new Error('配音未返回有效音频。');
      next.dubbing.speechParts[index] = { url: body.asset.url, key: body.asset.key, durationSec: body.asset.durationSec, signature: JSON.stringify([speechTexts[index], speechPlan[index].voiceId, config.language]) };
      await hooks.checkpoint(next); check();
    }
    report('voicing', 'running', (index + 1) / speechTexts.length);
  }
  report('voicing', 'completed', 1);
  await checkpoint('aligning');
  let aligned = next.dubbing.alignedAudioSig ? await loadLocalVideo(next.dubbing.alignedAudioSig) : null;
  if (!aligned) {
    const { decodeAudioFile, toMono } = await import('./audio-decode');
    const { signalsmithStretch, tiledStretch } = await import('./time-stretch');
    const { encodeWavMono } = await import('./denoise');
    const sampleRate = 24000;
    const parts = next.dubbing.speechParts;
    const output = new Float32Array(Math.ceil(next.durationSec * sampleRate));
    const groups = new Map<number, { total: number; elapsed: number; start: number; end: number; cursor: number; last: number }>();
    speechPlan.forEach((entry, index) => {
      const group = groups.get(entry.group) ?? { total: 0, elapsed: 0, start: Math.round(entry.start * sampleRate), end: Math.min(output.length, Math.round(entry.end * sampleRate)), cursor: Math.round(entry.start * sampleRate), last: index };
      group.total += parts[index].durationSec; group.last = index; groups.set(entry.group, group);
    });
    for (const group of groups.values()) dubbingRate(group.total * sampleRate, group.end - group.start);
    // Decode one part at a time, preserving pitch and a continuous picture clock.
    for (let index = 0; index < parts.length; index++) {
      check(); const part = parts[index];
      const speech = await materializeRemoteMedia(part.url, { name: `dub-speech-${index}.mp3`, signal: hooks.signal });
      const audio = await decodeAudioFile(speech.file); const pcm = await toMono(audio, sampleRate); check();
      const group = groups.get(speechPlan[index].group)!;
      group.elapsed += part.durationSec;
      const end = index === group.last ? group.end : group.start + Math.round((group.end - group.start) * group.elapsed / group.total);
      const targetLength = end - group.cursor;
      const rate = dubbingRate(pcm.length, targetLength);
      const fitted = Math.abs(rate - 1) < .001 ? pcm : (await tiledStretch(signalsmithStretch)({ channels: [pcm], sampleRate, rate }))[0]!;
      check();
      if (Math.abs(fitted.length - targetLength) > sampleRate * .05) throw new Error('配音无法完整适配原片，请调整文案。');
      for (let sample = 0; sample < Math.min(fitted.length, targetLength); sample++) output[group.cursor + sample] += fitted[sample];
      group.cursor = end;
      report('aligning', 'running', (index + 1) / parts.length);
    }
    let peak = 1; for (const sample of output) peak = Math.max(peak, Math.abs(sample));
    if (peak > 1) for (let sample = 0; sample < output.length; sample++) output[sample] /= peak;
    aligned = new File([encodeWavMono(output, sampleRate)], `${next.id}-${next.generationId}.wav`, { type: 'audio/wav' });
    const sig = fileSig(aligned); if (await saveLocalVideo(aligned, sig)) next.dubbing = { ...next.dubbing, alignedAudioSig: sig };
  }
  report('aligning', 'completed', 1);
  let picture = file;
  if (config.lipSync) {
    await checkpoint('lipsync');
    const upload = studioProviders().uploads.upload;
    if (!next.dubbing.alignedAudioKey) {
      const uploaded = await upload(aligned, { contentType: 'audio/wav', filename: 'dubbing-aligned.wav' }); check();
      next.dubbing = { ...next.dubbing, alignedAudioKey: uploaded.key, alignedAudioUrl: uploaded.url };
    }
    if (!next.dubbing.sourceVideoKey) {
      const uploaded = await upload(file, { contentType: file.type || 'video/mp4', filename: file.name }); check();
      next.dubbing = { ...next.dubbing, sourceVideoKey: uploaded.key, sourceVideoUrl: uploaded.url };
    }
    // Checkpoint uploads before submission; a retry reuses the same keys and idempotency ID.
    await hooks.checkpoint(next); check();
    if (!next.dubbing.lipJobId) {
      const job = await jsonRequest('/api/studio/dubbing-lipsync', { runId: next.generationId, projectId: next.id, videoKey: next.dubbing.sourceVideoKey, audioKey: next.dubbing.alignedAudioKey }, hooks.signal);
      if (!job.id || job.status === 'failed') throw new Error(job.error ?? '口型任务提交失败。');
      next.dubbing = { ...next.dubbing, lipJobId: job.id }; await hooks.checkpoint(next); check();
    }
    while (!next.dubbing.lipResultUrl) {
      check(); const response = await fetch(`/api/studio/dubbing-lipsync?id=${encodeURIComponent(next.dubbing.lipJobId!)}`, { signal: hooks.signal });
      const job = await response.json();
      if (!response.ok || job.status === 'failed') throw new Error(job.error ?? '口型任务暂时无法读取。');
      if (job.status === 'succeeded' && job.url) { next.dubbing = { ...next.dubbing, lipResultUrl: job.url }; break; }
      await pause(hooks.signal);
    }
    picture = (await materializeRemoteMedia(next.dubbing.lipResultUrl!, { name: 'lip-synced.mp4', type: 'video/mp4', signal: hooks.signal })).file;
    const metadata = await probeVideoFile(picture);
    if (Math.abs(metadata.durationSec - next.durationSec) > .4) throw new Error('口型结果时长不匹配，请重新生成。');
    report('lipsync', 'completed', 1);
  }
  if (config.captions && (next.dubbing.captionSignature !== signature || !next.dubbing.captionTranscript?.length)) {
    await checkpoint('styling');
    const transcript = await transcribeFile(aligned, { signal: hooks.signal, onPhase: (detail) => report('styling', 'running', undefined, detail) });
    check();
    if (!transcript.length) throw new Error('未识别到配音字幕，请重试。');
    next.dubbing = { ...next.dubbing, captionTranscript: transcript, captionSignature: signature };
    await hooks.checkpoint(next); check();
  }
  const videoUrl = URL.createObjectURL(picture); const audioUrl = URL.createObjectURL(aligned);
  try {
    let document = config.captions
      ? buildCaptionTaskDocument({ projectId: next.id, sourceSig: fileSig(picture), sourceUrl: videoUrl, sourceName: next.name, width: next.width, height: next.height, durationSec: next.durationSec, options: { ...next.options, translationLanguage: undefined, shortenPauses: false, aspect: 'original' }, transcript: next.dubbing.captionTranscript! })
      : dubbingVideoDocument(next.id, fileSig(picture), videoUrl, next.name, next.width, next.height, next.durationSec);
    if (config.captions) {
      report('styling', 'completed', 1);
      if (next.options.presetId === 'keywords') {
        await checkpoint('emphasizing');
        const select = studioProviders().captionEmphasis;
        if (!select) throw new Error('重点词服务尚未连接，请选择其他字幕样式。');
        const { emphasizeCaptionDocument } = await import('./caption-emphasis-operation');
        document = await emphasizeCaptionDocument(document, (rows) => { check(); return select(rows); }, (done, total) => report('emphasizing', 'running', done / total));
        report('emphasizing', 'completed', 1);
      }
    }
    await checkpoint('rendering');
    const comp = projectDocumentToComposition(document);
    comp.shots = comp.shots?.map((shot) => ({ ...shot, audioMuted: true }));
    comp.audioTracks = [{ id: 'dub-audio', src: audioUrl, role: 'narration', durationSec: next.durationSec, startSec: 0, volumeDb: 0, fadeInSec: 0, fadeOutSec: 0 }];
    const { clientExportVideo } = await import('./client-export');
    const clipFiles = new Map((comp.shots ?? []).flatMap((shot) => shot.src ? [[shot.src, picture] as const] : []));
    const video = await clientExportVideo({ comp, videoFile: picture, clipFiles, audio: [{ clip: comp.audioTracks[0], file: aligned }], render: { res: 1080, fps: 30, format: 'mp4' }, shouldCancel: () => hooks.signal.aborted, onProgress: (done, total) => { report('rendering', 'running', total ? done / total : undefined); hooks.progress(total ? done / total : 0); } });
    check(); const output = new File([video], `${next.name.replace(/\.[^.]+$/, '')}-${config.language}.mp4`, { type: 'video/mp4' });
    const sig = fileSig(output); const outputCached = await saveLocalVideo(output, sig).catch(() => false);
    const metadata = await probeVideoFile(output); const url = URL.createObjectURL(output);
    try { next.document = dubbingVideoDocument(next.id, sig, url, output.name, metadata.width, metadata.height, metadata.durationSec); } finally { URL.revokeObjectURL(url); }
    next.dubbing = { ...next.dubbing, outputSig: sig, outputCached, outputWidth: metadata.width, outputHeight: metadata.height };
    report('rendering', 'completed', 1);
    return { task: { ...next, stage: 'completed', updatedAt: Date.now() }, video };
  } finally { URL.revokeObjectURL(videoUrl); URL.revokeObjectURL(audioUrl); }
}
