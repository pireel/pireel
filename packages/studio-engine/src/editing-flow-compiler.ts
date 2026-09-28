import type { WorkflowBinding, WorkflowStep, WorkflowDefinition } from './workflow';
import type { CaptionTaskRecord } from './scene-project';
import { sceneLiteral as lit, stepOutput as out, captionLayoutOptions } from './workflow-caption-template';
import { compileEditingWorkflow } from './editing-workflow';
import { orderedFlowCards, type EditingFlow } from './editing-flow';
import { editingCaptionOptions } from './editing-capabilities';
import { workflowToTarget } from './workflow-editor';
import { textTranslationSchema } from './workflow-text-contracts';
type Context = { document: WorkflowBinding; transcript: WorkflowBinding; media: WorkflowBinding; spoken?: WorkflowBinding; language?: string; plan?: WorkflowBinding; content?: WorkflowBinding; arrange?: boolean };
export function compileEditingFlow(flow: EditingFlow, task: CaptionTaskRecord, media: unknown, transcript: unknown) {
  const cards = orderedFlowCards(flow); const steps: WorkflowStep[] = []; const groups: Record<string, string[]> = {}; const targets: Record<string, string> = {};
  const add = (group: string, id: string, capability: string, version: number, args: Record<string, WorkflowBinding>, dependencies: string[] = []) => {
    steps.push({ id, capability, version, arguments: args, dependsOn: [...new Set([...Object.values(args).flatMap(binding => binding.kind === 'step' ? [binding.stepId] : []), ...dependencies])] }); (groups[group] ??= []).push(id); targets[group] = id;
    return id;
  };
  const source: WorkflowBinding = { kind: 'input', key: 'source' };
  const needsSpeech = cards.some(card => !['export', 'auto-layout', 'voice-cleanup'].includes(card.kind));
  add('source', 'transcript', needsSpeech ? 'speech.transcribe' : 'speech.empty', needsSpeech ? 2 : 1, { media: source, ...(needsSpeech ? { transcript: lit(transcript) } : {}) });
  add('source', 'compose', 'edit.compose', 2, { media: source, cuts: lit([]), aspect: lit('original'), projectId: lit(task.id) });
  const contexts = new Map<string, Context>([['source', { document: out('compose', 'document'), transcript: out('transcript', 'transcript'), media: source }]]);
  for (const card of cards) {
    const ctx = contexts.get(card.input!)!; const prefix = (name: string) => card.id + '--' + name; const recipe = structuredClone(card.settings);
    const node = (name: string, capability: string, version: number, args: Record<string, WorkflowBinding>) => add(card.id, prefix(name), capability, version, args);
    let result: Context = { ...ctx };
    if (card.kind === 'export') {
      node('render', 'video.render', 2, { document: ctx.document, media: ctx.media, settings: lit(recipe.render) });
    } else if (card.kind === 'rough-cut') {
      node('cut', 'flow.cut', 1, { document: ctx.document, transcript: ctx.transcript, options: lit(recipe.roughCut) });
      result = { ...ctx, document: out(prefix('cut'), 'document'), plan: undefined, content: undefined };
    } else if (card.kind === 'captions') {
      const options = { ...editingCaptionOptions(recipe), aspect: 'original' as const, translationLanguage: ctx.language as typeof recipe.captions.translationLanguage };
      let annotated = ctx.transcript;
      if (recipe.captions.presetId === 'keywords') { node('emphasis', 'captions.source-emphasize', 2, { transcript: annotated }); annotated = out(prefix('emphasis'), 'transcript'); }
      node('plan', 'captions.plan', 2, { document: ctx.document, transcript: annotated, layout: lit(captionLayoutOptions(options)) });
      node('captions', 'captions.apply', 2, { document: ctx.document, plan: out(prefix('plan'), 'plan'), style: lit(options), translation: lit(null), emphasis: lit(null) });
      result.document = out(prefix('captions'), 'document'); result.transcript = annotated;
    } else if (card.kind === 'translation') {
      node('source', 'captions.plan', 2, { document: ctx.document, transcript: ctx.transcript, layout: lit(captionLayoutOptions(editingCaptionOptions(recipe))) });
      node('units', 'flow.units', 1, { plan: out(prefix('source'), 'plan') });
      node('translate', 'text.translate', 3, { units: out(prefix('units'), 'units'), language: lit(recipe.language), enabled: lit(true) });
      let value = out(prefix('translate'), 'value');
      if (recipe.rewrite.trim()) { node('rewrite', 'llm.transform', 1, { value, instruction: lit(recipe.rewrite + '\nPreserve sourceKey, language and item IDs. Only edit text.'), schema: lit(textTranslationSchema) }); value = out(prefix('rewrite'), 'value'); }
      if (recipe.reviewTranslation) { node('approve', 'human.approval', 1, { value, title: lit('确认译文'), schema: lit(textTranslationSchema), editable: lit(true), notify: lit(true) }); value = out(prefix('approve'), 'value'); }
      node('text', 'flow.translation', 1, { document: ctx.document, transcript: ctx.transcript, plan: out(prefix('source'), 'plan'), value, language: lit(recipe.language) });
      result = { ...ctx, document: out(prefix('text'), 'document'), transcript: out(prefix('text'), 'transcript'), spoken: out(prefix('text'), 'spoken'), language: recipe.language, plan: undefined, content: undefined };
    } else if (card.kind === 'voiceover') {
      node('clock', 'flow.clock', 1, { document: ctx.document, transcript: ctx.transcript, media: ctx.media });
      const speech = ctx.spoken ?? out(prefix('clock'), 'transcript'); const timing = out(prefix('clock'), 'media');
      const config = lit({ language: ctx.language ?? recipe.language, voiceId: recipe.voiceId, speakerVoices: recipe.speakerVoices, lipSync: false });
      node('voices', 'speech.voice-check', 1, { transcript: speech, config });
      node('source', 'speech.prepare', 1, { transcript: out(prefix('voices'), 'transcript'), media: timing, script: lit(recipe.script) });
      node('text', 'text.translate', 3, { units: out(prefix('source'), 'units'), language: ctx.language ? lit(ctx.language) : out(prefix('source'), 'language'), enabled: lit(false) });
      node('plan', 'speech.plan', 1, { source: out(prefix('source'), 'source'), units: out(prefix('source'), 'units'), translation: out(prefix('text'), 'value'), config });
      node('speech', 'speech.synthesize', 2, { plan: out(prefix('plan'), 'value'), projectId: lit(task.id), name: lit(task.name), cached: lit({}) });
      node('align', 'audio.align', 2, { speech: out(prefix('speech'), 'speech'), plan: out(prefix('plan'), 'value'), media: timing, cached: lit({}) });
      node('transcript', 'speech.transcribe', 2, { media: out(prefix('align'), 'audio'), transcript: lit(null) });
      node('voice', 'flow.voice', 1, { document: ctx.document, audio: out(prefix('align'), 'audio'), transcript: out(prefix('transcript'), 'transcript'), instanceId: lit(card.id) });
      result = { document: out(prefix('voice'), 'document'), transcript: out(prefix('transcript'), 'transcript'), media: ctx.media };
    } else {
      recipe.enabled = [card.kind];
      const scopedTask = card.kind === 'broll' && recipe.brollAssetIds ? { ...task, options: { ...task.options, broll: { ...task.options.broll, captions: task.options.broll?.captions ?? true, assets: (task.options.broll?.assets ?? []).filter(asset => recipe.brollAssetIds!.includes(asset.id)) } } } : task;
      const macro = compileEditingWorkflow(recipe, scopedTask, media, transcript);
      const subgraph = workflowToTarget(macro.definition, macro.targets[card.kind]);
      const reusePlan = card.kind === 'camera-movement' && !!ctx.plan && !!ctx.content;
      const skipped = new Set(['compose', 'transcript', ...(reusePlan ? ['content-source', 'content-proposal', 'content-plan', 'framing-plan'] : [])]);
      const remap = (binding: WorkflowBinding): WorkflowBinding => {
        if (binding.kind !== 'step') return binding;
        if (binding.stepId === 'compose') return ctx.document;
        if (binding.stepId === 'transcript') return ctx.transcript;
        if (reusePlan && binding.stepId === 'framing-plan') return binding.key === 'document' ? ctx.document : binding.key === 'plan' ? ctx.plan! : ctx.plan!.kind === 'step' ? out(ctx.plan!.stepId, 'value') : ctx.plan!;
        if (reusePlan && binding.stepId === 'content-plan') return ctx.content!;
        return out(prefix(binding.stepId), binding.key);
      };
      let inputDocument = ctx.document; let plan = ctx.plan;
      if (card.kind === 'auto-layout' && ctx.content) {
        node('reframe', 'edit.framing-plan', 1, { value: ctx.content, document: ctx.document, options: lit({ ...editingCaptionOptions(recipe), aspect: recipe.layout.aspect }), arrange: lit(recipe.layout.arrange) });
        inputDocument = out(prefix('reframe'), 'document'); plan = out(prefix('reframe'), 'plan');
      }
      for (const step of subgraph.steps.filter(step => !skipped.has(step.id))) {
        const args = Object.fromEntries(Object.entries(step.arguments).map(([key, binding]) => [key, remap(binding)]));
        if (step.arguments.document?.kind === 'step' && step.arguments.document.stepId === 'compose') args.document = inputDocument;
        if (step.capability === 'edit.content-source' && args.settings.kind === 'literal') args.settings = lit({ ...(args.settings.value as object), instanceId: card.id });
        if (step.capability === 'edit.framing-plan') args.arrange = lit(ctx.arrange === true);
        if (['graphics.generate', 'overlays.auto', 'audio.effects', 'audio.music', 'broll.compose'].includes(step.capability)) args.instanceId = lit(card.id);
        if (plan && ['layout.auto', 'overlays.auto', 'audio.effects', 'audio.music', 'camera.motion'].includes(step.capability)) args.plan = plan;
        add(card.id, prefix(step.id), step.capability, step.version, args, step.dependsOn.filter(id => !skipped.has(id)).map(prefix));
      }
      result.document = out(prefix(macro.targets[card.kind]), 'document');
      if (!reusePlan && subgraph.steps.some(step => step.id === 'framing-plan')) { result.plan = out(prefix('framing-plan'), 'plan'); result.content = out(prefix('content-plan'), 'value'); }
      else result.plan = plan;
      if (card.kind === 'auto-layout') result.arrange = recipe.layout.arrange;
    }
    contexts.set(card.id, result);
  }
  const definition: WorkflowDefinition = { schemaVersion: 1, id: 'editing-card-flow', version: 1, templateId: 'editing-card-flow', title: flow.name, trigger: { kind: 'manual' }, parameters: { source: { type: 'object', label: { zh: '原视频', en: 'Source' }, default: media as never } }, steps };
  return { definition, groups, targets };
}
