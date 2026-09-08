import { dubbingRate, dubbingSpeechWindow, dubbingVideoDocument, DUBBING_LANGUAGES } from '@pireel/studio-engine/dubbing-task';
import { projectDocumentToComposition } from '@pireel/studio-engine/composition';
import { studioProviders } from '@pireel/studio-engine/providers';
import type { CaptionTaskRecord, CaptionProcessingStage, CaptionTaskProgress } from './caption-task-store';
import { captionProcessingStages } from './caption-task-progress';
import { fileSig, probeVideoFile, transcribeFile } from './media';
import { saveLocalVideo, loadLocalVideo } from './local-media';
import { materializeRemoteMedia } from './remote-media';

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
  if (task.durationSec > 120) throw new Error('首版支持 2 分钟以内的单人口播。');
  next.dubbing ??= {};
  next.progress = Object.fromEntries(captionProcessingStages(next.options).map((stage) => [stage, { status: 'pending' }]));
  const check = () => { if (hooks.signal.aborted) throw new DOMException('Cancelled', 'AbortError'); };
  const report = (stage: CaptionProcessingStage, status: 'running' | 'completed', fraction?: number, detail?: string) => {
    check(); next = { ...next, progress: { ...next.progress, [stage]: { status, fraction, detail } } }; hooks.stageProgress?.(next.progress!);
  };
  const checkpoint = async (stage: CaptionProcessingStage) => { report(stage, 'running'); next = { ...next, stage, error: undefined, updatedAt: Date.now() }; await hooks.checkpoint(next); check(); };
  report('preparing', 'completed', 1);
  await checkpoint('transcribing');
  if (!next.transcript?.length) next.transcript = await transcribeFile(file, { signal: hooks.signal, onPhase: (detail) => report('transcribing', 'running', undefined, detail) });
  check(); const window = dubbingSpeechWindow(next.transcript, next.durationSec);
  report('transcribing', 'completed', 1);
  await checkpoint('translating');
  const sourceText = next.transcript.map((segment) => segment.text).join('\n');
  let text = config.script?.trim();
  if (!text && next.dubbing?.language === config.language && next.dubbing.sourceText === sourceText) text = next.dubbing.translatedText;
  if (!text) {
    const translate = studioProviders().translate;
    if (!translate) throw new Error('翻译服务尚未连接。');
    const rows = next.transcript.flatMap((segment) => segment.text.match(/[^\n]{1,350}/gu) ?? []).map((text, index) => ({ text, index }));
    const translated: string[] = [];
    for (let i = 0; i < rows.length; i += 250) {
      check(); const batch = rows.slice(i, i + 250); const output = await translate(batch, config.language); check();
      const byId = new Map<number, string>();
      for (const row of output) {
        if (!batch.some((source) => source.index === row.index) || byId.has(row.index) || !row.text?.trim()) throw new Error('译文不完整，请重试。');
        byId.set(row.index, row.text.trim());
      }
      if (byId.size !== batch.length) throw new Error('译文不完整，请重试。');
      translated.push(...batch.map((row) => byId.get(row.index)!));
      report('translating', 'running', translated.length / rows.length);
    }
    text = translated.join('\n');
  }
  if (!text || text.length > 5000) throw new Error('配音文案需为 1–5000 字。');
  next.dubbing = { ...next.dubbing, language: config.language, sourceText, translatedText: text };
  report('translating', 'completed', 1);
  await checkpoint('voicing');
  const signature = JSON.stringify([text, config.voiceId]);
  if (next.dubbing.speech?.signature !== signature) {
    let body = await jsonRequest('/api/studio/dubbing-speech', { runId: next.generationId, projectId: next.id, text, voiceId: config.voiceId, name: `${next.name} · ${config.language}` }, hooks.signal);
    check();
    while (body.status === 'pending') {
      await pause(hooks.signal);
      const response = await fetch(`/api/studio/dubbing-speech?id=${encodeURIComponent(body.id)}`, { signal: hooks.signal });
      body = await response.json();
      if (!response.ok) throw new Error(body.error ?? '配音进度暂时无法读取。');
    }
    check();
    if (body.status === 'failed') throw new Error(body.error ?? '配音生成失败。');
    if (!body.asset?.url || !(body.asset.durationSec > 0)) throw new Error('配音未返回有效音频。');
    next.dubbing = { language: config.language, sourceText, translatedText: text, sourceVideoKey: next.dubbing.sourceVideoKey, sourceVideoUrl: next.dubbing.sourceVideoUrl,
      speech: { url: body.asset.url, key: body.asset.key, durationSec: body.asset.durationSec, signature } };
  }
  report('voicing', 'completed', 1);
  await checkpoint('aligning');
  let aligned = next.dubbing.alignedAudioSig ? await loadLocalVideo(next.dubbing.alignedAudioSig) : null;
  if (!aligned) {
    const { decodeAudioFile, toMono } = await import('./audio-decode');
    const { signalsmithStretch, tiledStretch } = await import('./time-stretch');
    const { encodeWavMono } = await import('./denoise');
    const speech = await materializeRemoteMedia(next.dubbing.speech!.url, { name: 'dub-speech.mp3', signal: hooks.signal });
    const audio = await decodeAudioFile(speech.file); const sampleRate = 24000; const pcm = await toMono(audio, sampleRate); check();
    const rate = dubbingRate(pcm.length / sampleRate, window.duration);
    const fitted = Math.abs(rate - 1) < .001 ? pcm : (await tiledStretch(signalsmithStretch)({ channels: [pcm], sampleRate, rate }))[0]!;
    check();
    const output = new Float32Array(Math.ceil(next.durationSec * sampleRate)); const start = Math.round(window.start * sampleRate);
    if (fitted.length > output.length - start + sampleRate * .05) throw new Error('配音无法完整放入原片，请调整文案。');
    output.set(fitted.subarray(0, Math.min(fitted.length, output.length - start)), start);
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
  await checkpoint('rendering');
  const videoUrl = URL.createObjectURL(picture); const audioUrl = URL.createObjectURL(aligned);
  try {
    const document = dubbingVideoDocument(next.id, fileSig(picture), videoUrl, next.name, next.width, next.height, next.durationSec);
    const comp = projectDocumentToComposition(document);
    comp.shots = comp.shots?.map((shot) => ({ ...shot, audioMuted: true }));
    comp.audioTracks = [{ id: 'dub-audio', src: audioUrl, role: 'narration', durationSec: next.durationSec, startSec: 0, volumeDb: 0, fadeInSec: 0, fadeOutSec: 0 }];
    const { clientExportVideo } = await import('./client-export');
    const clipFiles = new Map((comp.shots ?? []).flatMap((shot) => shot.src ? [[shot.src, picture] as const] : []));
    const video = await clientExportVideo({ comp, videoFile: picture, clipFiles, render: { res: 1080, fps: 30, format: 'mp4' }, shouldCancel: () => hooks.signal.aborted, onProgress: (done, total) => { report('rendering', 'running', total ? done / total : undefined); hooks.progress(total ? done / total : 0); } });
    check(); const output = new File([video], `${next.name.replace(/\.[^.]+$/, '')}-${config.language}.mp4`, { type: 'video/mp4' });
    const sig = fileSig(output); const outputCached = await saveLocalVideo(output, sig).catch(() => false);
    const metadata = await probeVideoFile(output); const url = URL.createObjectURL(output);
    try { next.document = dubbingVideoDocument(next.id, sig, url, output.name, metadata.width, metadata.height, metadata.durationSec); } finally { URL.revokeObjectURL(url); }
    next.dubbing = { ...next.dubbing, outputSig: sig, outputCached, outputWidth: metadata.width, outputHeight: metadata.height };
    report('rendering', 'completed', 1);
    return { task: { ...next, stage: 'completed', updatedAt: Date.now() }, video };
  } finally { URL.revokeObjectURL(videoUrl); URL.revokeObjectURL(audioUrl); }
}
