import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import type { BrollCandidate, BrollCue, BrollOptions, BrollPlacement } from '@pireel/studio-engine/broll-task';
import { validateBrollPlan, resolveBrollEdits, brollAssetsMatch } from '@pireel/studio-engine/broll-task';
import type { EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { applyDocumentTransaction } from '@pireel/studio-engine/document-transaction';
import { BROLL_WORKFLOW_CAPABILITIES } from '@pireel/studio-engine/workflow-broll-template';
import { workflowJson, artifactVersion } from '@pireel/studio-engine/workflow-artifacts';
import { SceneWorkflowHost, type SceneNode } from './scene-workflow-runtime';
import type { CaptionTaskRecord } from './caption-task-store';

type Analysis = { assets: BrollOptions['assets']; candidates: BrollCandidate[]; analyzedAssets: string[]; analysisKey: string };
type Plan = { placements: BrollPlacement[]; planKey: string };
export function brollWorkflowNodes(host: SceneWorkflowHost): SceneNode[] {
  const { store } = host;
  const node = (id: string, body: Omit<SceneNode, 'capability'>): SceneNode => ({ capability: BROLL_WORKFLOW_CAPABILITIES.find(c => c.id === id)!, ...body });
  return [node('media.analyze', { stage: 'analyzing', async execute(args, context) {
    const assets = args.assets as unknown as BrollOptions['assets'];
    if (!assets.length || assets.length > 20) throw new Error('请添加 1–20 个素材。');
    const cached = args.cached as unknown as CaptionTaskRecord['broll'];
    const analysis: Analysis = context.partial<Analysis>() ?? (brollAssetsMatch(cached?.analysisKey, assets) ? { analysisKey: cached!.analysisKey, candidates: structuredClone(cached!.candidates), assets, analyzedAssets: cached!.analyzedAssets ?? [] } : { assets, analysisKey: JSON.stringify(assets.map(a => [a.id, a.sig])), candidates: [], analyzedAssets: [] });
    // Resolve all source bytes before the first paid frame analysis.
    for (const asset of assets) await host.media(asset);
    for (const [index, asset] of assets.entries()) {
      host.report('analyzing', { status: 'running', fraction: index / assets.length });
      if (analysis.analyzedAssets.includes(asset.id)) continue;
      const file = await host.media(asset);
      let frames: { timestamp: number; base64: string; mime: string; start: number; end: number }[];
      if (asset.kind === 'image') {
        const bitmap = await createImageBitmap(file); const canvas = document.createElement('canvas');
        canvas.width = Math.min(768, bitmap.width); canvas.height = Math.round(bitmap.height * canvas.width / bitmap.width);
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
        frames = [{ timestamp: 0, base64: canvas.toDataURL('image/jpeg', .8).split(',')[1], mime: 'image/jpeg', start: 0, end: 5 }];
      } else {
        const prepared = await (await import('./visual')).prepareVisualAnalysis(file, asset.durationSec); host.check();
        if ('cached' in prepared) {
          analysis.candidates.push(...prepared.cached.segments.filter(s => s.label.desc).slice(0, 8).map((s, i) => ({ id: `${asset.id}-${i}`, assetId: asset.id, start: s.start, end: Math.min(s.end, s.start + 5), description: s.label.desc })));
          analysis.analyzedAssets.push(asset.id); await context.savePartial(analysis, { broll: analysis }); continue;
        }
        frames = prepared.prep.frames.map(frame => {
          const segment = prepared.prep.segsAll.find(s => frame.timestamp >= s.start && frame.timestamp <= s.end)!;
          const start = Math.max(segment.start, frame.timestamp - 2);
          return { ...frame, start, end: Math.min(segment.end, start + 5) };
        });
      }
      for (const [i, frame] of frames.entries()) {
        host.check(); if (analysis.candidates.some(c => c.id === `${asset.id}-${i}`)) continue;
        const response = await fetch('/api/studio/vlm', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: host.hooks.signal, body: JSON.stringify({ image_base64: frame.base64, mime: frame.mime }) });
        if (!response.ok) throw new Error(response.status === 402 ? '积分不足，无法分析素材。' : '素材分析失败，请重试。');
        const label = await response.json();
        if (label.usage) context.recordUsage(label.usage);
        if (typeof label.desc !== 'string' || !label.desc.trim()) throw new Error('素材分析未返回内容描述。');
        analysis.candidates.push({ id: `${asset.id}-${i}`, assetId: asset.id, start: frame.start, end: frame.end, description: label.desc });
        await context.savePartial(analysis, { broll: analysis });
      }
      analysis.analyzedAssets.push(asset.id); await context.savePartial(analysis, { broll: analysis });
    }
    return { analysis: workflowJson(await store.put('visual-analysis', 'broll', analysis)) };
  }, project: outputs => ({ broll: store.read<Analysis>(outputs.analysis, 'visual-analysis') }) }),
  node('broll.match', { stage: 'matching', async execute(args, context) {
    const transcript = store.read<AsrSegment[]>(args.transcript, 'transcript');
    const analysis = store.read<Analysis>(args.analysis, 'visual-analysis');
    const durationSec = Number(args.durationSec);
    const cues: BrollCue[] = [];
    for (const raw of transcript) {
      const segment = { ...raw, start: Math.max(0, raw.start), end: Math.min(durationSec, raw.end) };
      if (segment.end <= segment.start || !segment.text.trim()) continue;
      const previous = cues.at(-1);
      if (previous && previous.end - previous.start < 3 && segment.end - previous.start <= 8) { previous.text += segment.text; previous.end = segment.end; }
      else cues.push({ id: cues.length, start: segment.start, end: segment.end, text: segment.text });
    }
    const planKey = JSON.stringify([analysis.analysisKey, cues]);
    const cached = args.cached as unknown as CaptionTaskRecord['broll'];
    const sameCandidates = await artifactVersion(cached?.candidates ?? null) === await artifactVersion(analysis.candidates);
    let placements = sameCandidates && cached?.planKey === planKey ? cached.placements ?? [] : undefined;
    if (!placements) {
      placements = []; const used = new Set<string>();
      for (let offset = 0; offset < cues.length; offset += 100) {
        const batch = cues.slice(offset, offset + 100); const candidates = analysis.candidates.filter(c => !used.has(c.id));
        if (!candidates.length) break;
        const response = await fetch('/api/studio/broll-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: host.hooks.signal, body: JSON.stringify({ cues: batch, candidates, durationSec, projectId: args.projectId }) });
        const body = await response.json();
        if (body.usage) context.recordUsage(body.usage);
        if (!response.ok) throw new Error(body.error ?? '画面匹配失败。');
        const plan = validateBrollPlan(body.placements.map((p: { id: string; candidateId: string }) => ({ cueId: Number(p.id.replace('broll-', '')), candidateId: p.candidateId })), batch, candidates, durationSec);
        for (const p of plan) { used.add(p.candidateId); placements.push(p); }
      }
    }
    placements = validateBrollPlan(placements.map(p => ({ cueId: Number(p.id.replace('broll-', '')), candidateId: p.candidateId })), cues, analysis.candidates, durationSec);
    const value: Plan = { planKey, placements };
    return { plan: workflowJson(await store.put('edit-plan', 'broll', value)), value: workflowJson(value) };
  }, project: outputs => ({ broll: { ...host.task.broll!, ...(outputs.value as unknown as Plan) } }) }),
  node('broll.compose', { async execute(args) {
    const document = store.read<EditorDocumentV2>(args.document, 'document');
    const analysis = store.read<Analysis>(args.analysis, 'visual-analysis');
    const plan = args.plan as unknown as Plan;
    const options = args.options as unknown as BrollOptions;
    const clips = resolveBrollEdits(plan.placements, analysis.candidates, options, Number(args.durationSec));
    const next = structuredClone(document); const fps = next.canvas.fps;
    for (const clip of clips) next.assets['broll-' + clip.asset.id] = { id: 'broll-' + clip.asset.id, kind: clip.asset.kind, label: clip.asset.name, locator: { localSig: clip.asset.sig }, metadata: { width: clip.asset.width, height: clip.asset.height, durationSec: clip.asset.durationSec } };
    next.timeline.tracks.push({ id: 'broll', type: 'visual', role: 'broll', name: 'B-roll', stackOrder: 1, hidden: false, muted: true, locked: false, syncLocked: false, clips: clips.map(clip => ({ id: clip.id, kind: 'media', assetId: 'broll-' + clip.asset.id, startFrame: Math.round(clip.start * fps), durationFrames: Math.max(1, Math.round(clip.duration * fps)), sourceInSec: clip.sourceIn, sourceOutSec: clip.sourceIn + clip.duration, enabled: true, fit: 'cover', ...(clip.asset.kind === 'video' ? { video: { treatment: 'full', audioMuted: true } } : {}) })) });
    // Captions always remain above supplemental footage.
    for (const track of next.timeline.tracks) if (track.type === 'caption') track.stackOrder = Math.max(2, track.stackOrder);
    const result = applyDocumentTransaction(document, { ops: [{ op: 'document.replace', input: { document: next } }] }, { projectId: 'broll-workflow' });
    if (!result.ok) throw new Error(result.error.message);
    return { document: workflowJson(await store.put('document', 'broll', result.document)), plan: args.plan };
  }, project: outputs => ({ broll: { ...host.task.broll!, ...(outputs.plan as unknown as Plan) } }) })];
}
