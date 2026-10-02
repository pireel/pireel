import { composeBrollDocument } from '@pireel/studio-engine/broll-compose';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import type { BrollAsset, BrollCandidate, BrollOptions, BrollPlacement } from '@pireel/studio-engine/broll-task';
import { validateBrollPlan, brollAssetsMatch, brollCues, brollPlacementAnchor, brollStillBudget } from '@pireel/studio-engine/broll-task';
import type { EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { applyDocumentTransaction } from '@pireel/studio-engine/document-transaction';
import { BROLL_WORKFLOW_CAPABILITIES } from '@pireel/studio-engine/workflow-broll-template';
import { workflowJson, artifactVersion } from '@pireel/studio-engine/workflow-artifacts';
import { SceneWorkflowHost, type SceneNode } from './scene-workflow-runtime';
import type { CaptionTaskRecord } from './caption-task-store';

type Analysis = { assets: BrollOptions['assets']; candidates: BrollCandidate[]; analyzedAssets: string[]; analysisKey: string };
type Plan = { placements: BrollPlacement[]; planKey: string };
/** One plan for your shots and AI stills: the stills as candidates that carry their own asset, and where every shot lands. */
type Generated = { candidates: BrollCandidate[]; placements: BrollPlacement[] };
type Still = { id: string; prompt: string };
type GeneratedProgress = { plan?: { placements: BrollPlacement[]; stills: Still[] }; jobs: Record<number, string>; assets: Record<number, BrollAsset> };

/** Picture size for a still, by where the layout shows it: full frame, a split half, or a window. */
function stillSize(options: BrollOptions, canvas: { width: number; height: number }) {
  const portrait = canvas.height >= canvas.width;
  const template = options.pip?.template ?? 'presenter';
  if (template === 'split' || template === 'split-bottom') return '1024x1024';
  if (options.pip && (template === 'inset' || template === 'dim')) return '1536x1024';
  return portrait ? '1024x1536' : '1536x1024';
}
const STILL_ASPECT = { '1024x1024': 'square', '1536x1024': 'landscape', '1024x1536': 'portrait' } as const;
/** How the layout shows a picture, so the planner knows whether the speaker stays in view. */
function brollFrame(options: Partial<BrollOptions> | undefined) {
  const template = options?.pip?.template;
  if (!template) return 'cover';
  if (template === 'split' || template === 'split-bottom') return 'half';
  if (template === 'inset' || template === 'dim') return 'window';
  return template === 'smart' ? 'smart' : 'presenter';
}
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
    const cues = brollCues(transcript, durationSec);
    const planKey = JSON.stringify([analysis.analysisKey, cues]);
    const cached = args.cached as unknown as CaptionTaskRecord['broll'];
    const sameCandidates = await artifactVersion(cached?.candidates ?? null) === await artifactVersion(analysis.candidates);
    let placements = sameCandidates && cached?.planKey === planKey ? cached.placements ?? [] : undefined;
    if (!placements) {
      placements = []; const used = new Set<string>();
      for (let offset = 0; offset < cues.length; offset += 100) {
        const batch = cues.slice(offset, offset + 100); const candidates = analysis.candidates.filter(c => !used.has(c.id));
        if (!candidates.length) break;
        const response = await fetch('/api/studio/broll-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: host.hooks.signal, body: JSON.stringify({ cues: batch, candidates, durationSec, projectId: args.projectId, frame: brollFrame(args.options as Partial<BrollOptions> | undefined) }) });
        const body = await response.json();
        if (body.usage) context.recordUsage(body.usage);
        if (!response.ok) throw new Error(body.error ?? '画面匹配失败。');
        const plan = validateBrollPlan(body.placements.map((p: { id: string; candidateId: string }) => ({ ...brollPlacementAnchor(p.id), candidateId: p.candidateId })), batch, candidates, durationSec);
        for (const p of plan) { used.add(p.candidateId); placements.push(p); }
      }
    }
    placements = validateBrollPlan(placements.map(p => ({ ...brollPlacementAnchor(p.id), candidateId: p.candidateId })), cues, analysis.candidates, durationSec);
    const value: Plan = { planKey, placements };
    return { plan: workflowJson(await store.put('edit-plan', 'broll', value)), value: workflowJson(value) };
  }, project: outputs => ({ broll: { ...host.task.broll!, ...(outputs.value as unknown as Plan) } }) }),
  node('broll.generate', { stage: 'matching', async execute(args, context) {
    const transcript = store.read<AsrSegment[]>(args.transcript, 'transcript');
    const durationSec = Number(args.durationSec); const options = args.options as unknown as BrollOptions;
    const cues = brollCues(transcript, durationSec);
    if (!cues.length) return { value: workflowJson({ candidates: [], placements: [] }) };
    const local = args.analysis ? store.read<Analysis>(args.analysis, 'visual-analysis') : undefined;
    const size = stillSize(options, host.task);
    const progress: GeneratedProgress = context.partial<GeneratedProgress>() ?? { jobs: {}, assets: {} };
    if (!progress.plan) {
      // One pass arranges your shots and decides which moments get a still, before any image is paid for.
      const response = await fetch('/api/studio/broll-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: host.hooks.signal, body: JSON.stringify({ cues, candidates: local?.candidates ?? [], durationSec, projectId: args.projectId, frame: brollFrame(options), generate: { max: brollStillBudget(durationSec), aspect: STILL_ASPECT[size] } }) });
      const body = await response.json();
      if (body.usage) context.recordUsage(body.usage);
      if (!response.ok) throw new Error(response.status === 402 ? '积分不足，无法生成素材。' : '素材编排失败，请重试。');
      progress.plan = { placements: body.placements, stills: body.stills.map((still: Still) => ({ id: still.id, prompt: still.prompt })) }; await context.savePartial(progress);
    }
    const ideas = progress.plan.stills;
    const { startGeneration, pollCreation } = await import('./gen-api');
    await Promise.all(ideas.map(async (idea, index) => {
      if (progress.assets[index]) return;
      if (!progress.jobs[index]) {
        const started = await startGeneration(String(args.projectId), 'image-gen', { prompt: idea.prompt, user_prompt: idea.prompt, n: 1, size });
        if (!started.ok) throw new Error(started.kind === 'credits' ? '积分不足，无法生成素材。' : started.message);
        progress.jobs[index] = started.ids[0]!; await context.savePartial(progress);
      }
      let url = '';
      for (let waited = 0; !url; waited += 3) {
        host.check();
        if (waited > 300) throw new Error('素材生成超时，请稍后继续。');
        const job = await pollCreation(progress.jobs[index]!);
        if (job?.status === 'failed') throw new Error(job.error || '素材生成失败，请重试。');
        if (job?.status === 'succeeded' && job.assets[0]) url = job.assets[0].url;
        else await new Promise(resolve => setTimeout(resolve, 3000));
      }
      const { materializeRemoteMedia } = await import('./remote-media');
      const { file } = await materializeRemoteMedia(url, { name: `ai-${index + 1}.png`, signal: host.hooks.signal });
      const bitmap = await createImageBitmap(file); const width = bitmap.width; const height = bitmap.height; bitmap.close();
      const { durableFileSig } = await import('./media'); const sig = await durableFileSig(file);
      await (await import('./local-media')).saveLocalVideo(file, sig);
      const { studioProviders } = await import('@pireel/studio-engine/providers');
      if (studioProviders().sceneProjects && !await studioProviders().vault.backup(file, sig, { signal: host.hooks.signal })) throw new Error('生成的素材保存失败，请重试。');
      progress.assets[index] = { id: `ai-${progress.jobs[index]}`, sig, name: `AI ${index + 1}`, kind: 'image', width, height, durationSec: 5 };
      await context.savePartial(progress);
    }));
    const candidates: BrollCandidate[] = ideas.map((idea, index) => ({ id: `${progress.assets[index]!.id}-0`, assetId: progress.assets[index]!.id, start: 0, end: 5, description: idea.prompt, asset: progress.assets[index]! }));
    const shots = [...progress.plan.placements.map(p => ({ ...brollPlacementAnchor(p.id), candidateId: p.candidateId })), ...ideas.map((idea, index) => ({ ...brollPlacementAnchor(idea.id), candidateId: candidates[index]!.id }))];
    const placements = validateBrollPlan(shots, cues, [...(local?.candidates ?? []), ...candidates], durationSec);
    return { value: workflowJson({ candidates, placements } satisfies Generated) };
  } }),
  node('broll.compose', { async execute(args) {
    const document = store.read<EditorDocumentV2>(args.document, 'document');
    // Your footage and AI stills: a match plan for your shots alone, or one generated plan for both.
    const local = args.analysis ? store.read<Analysis>(args.analysis, 'visual-analysis') : undefined;
    const generated = args.generated as unknown as Generated | undefined;
    const analysis = { candidates: [...(local?.candidates ?? []), ...(generated?.candidates ?? [])] };
    const localPlan = args.plan as unknown as Plan | undefined;
    const taken = (localPlan?.placements ?? []).map(p => [p.start - 1, p.start + p.duration + 1]);
    const plan: Plan = { planKey: localPlan?.planKey ?? 'generated', placements: [...(localPlan?.placements ?? []), ...(generated?.placements ?? []).filter(p => !taken.some(([from, to]) => p.start < to && p.start + p.duration > from))].sort((a, b) => a.start - b.start) };
    const options = args.options as unknown as BrollOptions;
    const prefix = args.instanceId ? String(args.instanceId) + '-' : '';
    const next = composeBrollDocument(document, plan.placements, analysis.candidates, options, Number(args.durationSec), prefix);
    const result = applyDocumentTransaction(document, { ops: [{ op: 'document.replace', input: { document: next } }] }, { projectId: 'broll-workflow' });
    if (!result.ok) throw new Error(result.error.message);
    return { document: workflowJson(await store.put('document', 'broll', result.document)), plan: workflowJson({ ...plan, candidates: analysis.candidates }) };
  }, project: outputs => ({ document: store.read<EditorDocumentV2>(outputs.document, 'document'), broll: { analysisKey: '[]', ...host.task.broll, ...(outputs.plan as unknown as Plan & { candidates: BrollCandidate[] }) } }) })];
}
