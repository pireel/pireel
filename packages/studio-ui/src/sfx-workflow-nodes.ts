import { SFX_AI_CAPABILITIES } from '@pireel/studio-engine/workflow-sfx-template';
import { sfxCues, validateSfxPlan, type SfxPlacement } from '@pireel/studio-engine/sfx-plan';
import type { SfxDensity } from '@pireel/studio-engine/sfx-task';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import type { EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { renderSfxAudio, type SfxMixEvent } from './sfx-audio-render';
import { artifactVersion, workflowJson } from '@pireel/studio-engine/workflow-artifacts';
import { loadLocalVideo } from './local-media';
import type { SceneWorkflowHost, SceneMedia, SceneNode } from './scene-workflow-runtime';
export function sfxWorkflowNodes(host: SceneWorkflowHost): SceneNode[] {
  const { store } = host;
  return [{ capability: SFX_AI_CAPABILITIES[0], stage: 'matching', async execute(args, context) {
    const transcript = store.read<AsrSegment[]>(args.transcript, 'transcript'); const media = store.read<SceneMedia>(args.media, 'media');
    const density = args.density as SfxDensity; const cues = sfxCues(transcript, media.durationSec);
    const partial = context.partial<{ placements: SfxPlacement[]; offset: number }>() ?? { placements: [], offset: 0 };
    while (partial.offset < cues.length) {
      host.check(); const offset = partial.offset; let batch = cues.slice(offset, offset + 120);
      while (batch.length > 1 && new TextEncoder().encode(JSON.stringify(batch)).length > 240 * 1024) batch = batch.slice(0, Math.ceil(batch.length / 2));
      const response = await fetch('/api/studio/sfx-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: host.hooks.signal, body: JSON.stringify({ cues: batch, density, durationSec: media.durationSec, projectId: args.projectId, sceneRun: host.hooks.sceneRun }) });
      const body = await response.json(); if (body.usage) context.recordUsage(body.usage);
      if (!response.ok) throw new Error(body.error ?? 'AI 音效匹配失败。');
      partial.placements.push(...validateSfxPlan(body.placements, batch, media.durationSec)); partial.offset = offset + batch.length;
      await context.savePartial(partial); host.report('matching', { status: 'running', fraction: Math.min(1, partial.offset / cues.length) });
    }
    const placements = validateSfxPlan(partial.placements, cues, media.durationSec);
    return { plan: workflowJson(await store.put('edit-plan', 'auto-sfx', { placements })) };
  } }, { capability: SFX_AI_CAPABILITIES[2], stage: 'matching', reconcile: true, async execute(args, context) {
    const plan = store.read<{ placements: SfxPlacement[] }>(args.plan, 'edit-plan');
    const partial = context.partial<{ sounds: Record<string, SceneMedia> }>() ?? { sounds: {} };
    const placements: SfxMixEvent[] = [];
    for (const event of plan.placements) {
      host.check();
      if (!event.generate) { placements.push(event); continue; }
      // Repeated list accents share one generated asset, regardless of their placement/intensity.
      const key = await artifactVersion([event.generate.prompt.trim(), event.generate.durationSec]);
      if (!partial.sounds[key]) {
        const requestId = await artifactVersion([context.idempotencyKey, key]);
        const response = await fetch('/api/studio/sfx', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: host.hooks.signal, body: JSON.stringify({ projectId: args.projectId, requestId, generate: event.generate, sceneRun: host.hooks.sceneRun }) });
        const body = await response.json(); if (body.usage) context.recordUsage(body.usage);
        if (!response.ok) throw new Error(body.error === 'sfx_request_pending' ? '音效仍在生成或结果待确认，请稍后继续；不会重复扣费。' : ['sfx_request_failed', 'sfx_gen_failed'].includes(body.error) ? '上次音效生成失败，请生成新版本重试。' : response.status === 402 ? '积分不足，补充积分后请生成新版本重试。' : body.error === 'sfx_gen_unconfigured' ? '音效生成服务尚未配置。' : '音效生成未完成，请稍后继续。');
        const asset = body.asset;
        if (!asset || typeof asset.id !== 'string' || !/^cre_[a-f0-9]{20,32}$/.test(asset.id) || !Number.isFinite(asset.durationSec) || asset.durationSec <= 0 || asset.durationSec > 5) throw new Error('生成音效结果无效。');
        partial.sounds[key] = { sig: 'sfx-generated-' + asset.id, name: 'generated-' + key.slice(0, 12) + '.mp3', kind: 'audio', width: 0, height: 0, durationSec: asset.durationSec, url: '/api/studio/sfx?asset=' + encodeURIComponent(asset.id) };
        await context.savePartial(partial);
      }
      placements.push({ ...event, generated: partial.sounds[key] });
    }
    return { plan: workflowJson(await store.put('edit-plan', 'auto-sfx-sources', { placements })) };
  } }, { capability: SFX_AI_CAPABILITIES[1], stage: 'styling', async cacheValid(outputs) {
    const document = store.read<EditorDocumentV2>(outputs.document, 'document');
    return (await Promise.all(Object.values(document.assets).filter(asset => asset.locator.localSig?.startsWith('edit-audio-')).map(asset => loadLocalVideo(asset.locator.localSig!)))).every(Boolean);
  }, async execute(args) {
    let document = store.read<EditorDocumentV2>(args.document, 'document');
    const plan = store.read<{ placements: SfxMixEvent[] }>(args.plan, 'edit-plan');
    const media = store.read<SceneMedia>(args.media, 'media');
    document = await renderSfxAudio(host, document, plan.placements, media);
    return { document: workflowJson(await store.put('document', 'auto-sfx', document)) };
  }, project: outputs => ({ document: store.read<EditorDocumentV2>(outputs.document, 'document') }) }];
}
