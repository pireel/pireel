import { sfxSound, legacySfxSound, SFX_LIBRARY_VERSION, type SfxIntensity } from '@pireel/studio-engine/sfx-library';
import { speechLevelProfile, mixSoundToSpeech, SFX_MIX_VERSION } from '@pireel/studio-engine/sfx-mix';
import { integratedLoudness, loudnessGainDb, SCENE_TARGET_LUFS } from '@pireel/studio-engine/loudness-lufs';
import { artifactVersion } from '@pireel/studio-engine/workflow-artifacts';
import type { EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { applyDocumentTransaction } from '@pireel/studio-engine/document-transaction';
import { loadSfxLibrarySound } from './sfx-library-media';
import { decodeVideoAudio, decodeAudioFile, toMono } from './audio-decode';
import { cacheAudio, addAudio } from './editing-workflow-nodes';
import { SceneWorkflowHost, type SceneMedia } from './scene-workflow-runtime';
import { studioProviders } from '@pireel/studio-engine/providers';
import type { CaptionTaskRecord } from './caption-task-store';
export interface SfxMixEvent { start: number; soundId?: string; style?: string; intensity?: SfxIntensity; volumeDb?: number; muted?: boolean; generated?: SceneMedia; generate?: unknown }
const legacyIntensity = (db: number): SfxIntensity => db <= -24 ? 'gentle' : db > -18 ? 'emphasis' : 'normal';
/** Bake each effect against the narration's level, and bring the whole mix to the scene's target
 *  loudness: effects are levelled against the source, the master gain lifts voice and effects together. */
export async function renderSfxAudio(host: SceneWorkflowHost, document: EditorDocumentV2, events: readonly SfxMixEvent[], media: SceneMedia) {
  const decoded = await decodeVideoAudio(await host.media(media)); host.check();
  if (!decoded) throw new Error('无法读取原声音轨，不能自动调整音效音量。');
  const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
  const gainDb = loudnessGainDb(integratedLoudness(channels, decoded.sampleRate));
  const processing: NonNullable<EditorDocumentV2['processing']> = { ...document.processing }; delete processing.loudness;
  if (gainDb !== null) processing.loudness = { targetLufs: SCENE_TARGET_LUFS, gainDb };
  let next: EditorDocumentV2 = { ...document, processing }; if (!Object.keys(processing).length) delete next.processing;
  if (!events.length) return next;
  const profile = speechLevelProfile(channels, decoded.sampleRate);
  const reserved = new Float32Array(profile.peaks.length); const planKey = await artifactVersion(events);
  const generatedPcm = new Map<string, Float32Array>();
  for (const [index, event] of events.entries()) {
    host.check(); const sound = (event.soundId && sfxSound(event.soundId)) || legacySfxSound(event.style ?? 'soft', index);
    const intensity = event.intensity ?? legacyIntensity(event.volumeDb ?? -18);
    if (event.generate && !event.generated) throw new Error('生成音效尚未准备完成。');
    let pcm: Float32Array;
    if (event.generated) {
      const cached = generatedPcm.get(event.generated.sig);
      pcm = cached ?? await toMono(await decodeAudioFile(await host.media(event.generated)), 48000);
      generatedPcm.set(event.generated.sig, pcm);
    } else pcm = await loadSfxLibrarySound(sound.id, host.hooks.signal);
    host.check();
    const start = Math.round(event.start * document.canvas.fps) / document.canvas.fps;
    const mixed = mixSoundToSpeech(pcm, 48000, profile, start, intensity, event.muted ? new Float32Array(profile.peaks.length) : reserved, event.generated ? 5 : 1.5);
    const audio = await cacheAudio(host, mixed.pcm, 48000, [SFX_MIX_VERSION, SFX_LIBRARY_VERSION, media.sig, start, event.generated?.sig ?? sound.sha256, intensity, planKey], `${event.generated ? event.generated.name.replace(/\.mp3$/, '') : sound.id}--${intensity}.wav`);
    const id = 'auto-sfx-mixed-' + index;
    next = await addAudio(host, next, audio, 'sfx', id, start, 0);
    if (event.muted) {
      const result = applyDocumentTransaction(next, { ops: [{ op: 'audio.patch', input: { updates: [{ clipId: id, patch: { muted: true } }] } }] }, { projectId: 'sfx-mix' });
      if (!result.ok) throw new Error(result.error.message); next = result.document;
    }
  }
  return next;
}

/** Upgrade a saved edit locally: reuse its chosen events and timing, never call the LLM. */
export async function optimizeSfxAudio(task: CaptionTaskRecord, source: File, signal: AbortSignal) {
  const original = task.document; if (!original) throw new Error('请先生成音效。');
  const clips = original.timeline.tracks.filter(track => track.role === 'sfx').flatMap(track => track.clips.filter(clip => clip.kind === 'audio').map(clip => ({ clip, muted: track.muted })));
  if (!clips.length) return original;
  const events: SfxMixEvent[] = clips.map(({ clip, muted }) => {
    const label = clip.properties.label ?? original.assets[clip.assetId]?.label ?? 'soft.wav';
    const [id, strength] = label.replace(/\.wav$/, '').split('--');
    return { start: clip.startFrame / original.canvas.fps, soundId: sfxSound(id)?.id, style: id, intensity: ['gentle', 'normal', 'emphasis'].includes(strength) ? strength as SfxIntensity : undefined, volumeDb: clip.properties.volumeDb, muted: muted || !clip.enabled || clip.properties.muted };
  }).sort((a, b) => a.start - b.start);
  const removed = applyDocumentTransaction(original, { ops: [{ op: 'audio.remove', input: { clipIds: clips.map(({ clip }) => clip.id) } }] }, { projectId: task.id });
  if (!removed.ok) throw new Error(removed.error.message);
  const host = new SceneWorkflowHost(task, source, { signal, checkpoint: async () => {}, progress: () => {} });
  try {
    const result = await renderSfxAudio(host, removed.document, events, { sig: task.sourceSig, name: task.name, width: task.width, height: task.height, durationSec: task.durationSec });
    if (studioProviders().sceneProjects) {
      if (await studioProviders().sceneProjects!.owner() !== task.scope) throw new Error('登录账号已变化。');
      for (const [sig, file] of host.files) if (file.type.startsWith('audio/')) {
        signal.throwIfAborted(); if (!await studioProviders().vault.backup(file, sig)) throw new Error('优化后的音效未完成备份，请重试。');
      }
    }
    return result;
  } finally { host.dispose(); }
}
