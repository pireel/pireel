import { CONTENT_PLAN_INSTRUCTION, contentDecisionSchema } from './editing-plan';
import type { WorkflowDefinition, WorkflowBinding, WorkflowStep } from './workflow';
import { sceneLiteral as lit, stepOutput as out, captionLayoutOptions } from './workflow-caption-template';
import { captionTranslationSchema } from './workflow-node-contracts';
import { textTranslationSchema } from './workflow-text-contracts';
import { editingCaptionOptions, type EditingRecipe } from './editing-capabilities';
import type { CaptionTaskRecord } from './scene-project';
export interface CompiledEditingWorkflow { definition: WorkflowDefinition; groups: Record<string, string[]>; targets: Record<string, string> }
export function compileEditingWorkflow(recipe: EditingRecipe, task: CaptionTaskRecord, media: unknown, transcript: unknown): CompiledEditingWorkflow {
  const enabled = new Set(recipe.enabled); const steps: WorkflowStep[] = []; const groups: Record<string, string[]> = {}; const targets: Record<string, string> = {};
  let planReviewId: string | undefined;
  const add = (group: string, id: string, capability: string, version: number, args: Record<string, WorkflowBinding>) => {
    steps.push({ id, capability, version, arguments: args, dependsOn: [...new Set([...Object.values(args).flatMap(binding => binding.kind === 'step' ? [binding.stepId] : []), ...(planReviewId ? [planReviewId] : [])])] }); (groups[group] ??= []).push(id); targets[group] = id; return id;
  };
  const source: WorkflowBinding = { kind: 'input', key: 'source' }; let speechMedia: WorkflowBinding = source;
  const needsTranscript = recipe.enabled.some(id => !['auto-layout', 'voice-cleanup'].includes(id));
  if (needsTranscript) add('source', 'transcript', 'speech.transcribe', 2, { media: source, transcript: lit(transcript) });
  if (!needsTranscript) add('source', 'transcript', 'speech.empty', 1, { media: source });
  let speech: WorkflowBinding = out('transcript', 'transcript');
  add('source', 'compose', 'edit.compose', 2, { media: source, cuts: lit([]), aspect: lit('original'), projectId: lit(task.id) });
  let document: WorkflowBinding = out('compose', 'document');
  if (enabled.has('voiceover')) {
    add('voiceover', 'voice-check', 'speech.voice-check', 1, { transcript: speech, config: lit({ language: recipe.language, voiceId: recipe.voiceId, speakerVoices: recipe.speakerVoices, lipSync: false }) });
    add('voiceover', 'speech-text', 'speech.prepare', 1, { media: source, transcript: out('voice-check', 'transcript'), script: lit(recipe.script) });
    add(enabled.has('translation') ? 'translation' : 'voiceover', 'translation', 'text.translate', 3, { units: out('speech-text', 'units'), language: enabled.has('translation') ? lit(recipe.language) : out('speech-text', 'language'), enabled: enabled.has('translation') ? out('speech-text', 'translate') : lit(false) });
    let translation = out('translation', 'value');
    if (recipe.rewrite.trim()) { add('rewrite', 'rewrite', 'llm.transform', 1, { value: translation, instruction: lit(recipe.rewrite + '\nPreserve IDs, language and sourceKey; only edit items[].text.'), schema: lit(textTranslationSchema) }); translation = out('rewrite', 'value'); }
    if (recipe.reviewTranslation) { add('review', 'review', 'human.approval', 1, { value: translation, title: lit('确认配音稿'), schema: lit(textTranslationSchema), editable: lit(true), notify: lit(true) }); translation = out('review', 'value'); }
    add('voiceover', 'voice-plan', 'speech.plan', 1, { source: out('speech-text', 'source'), units: out('speech-text', 'units'), translation, config: lit({ language: recipe.language, voiceId: recipe.voiceId, speakerVoices: recipe.speakerVoices, lipSync: false }) });
    add('voiceover', 'speech', 'speech.synthesize', 2, { plan: out('voice-plan', 'value'), projectId: lit(task.id), name: lit(task.name), cached: lit({}) });
    add('voiceover', 'align', 'audio.align', 2, { speech: out('speech', 'speech'), plan: out('voice-plan', 'value'), media: source, cached: lit({}) });
    speechMedia = out('align', 'audio');
    add('voiceover', 'voice-document', 'dubbing.compose', 2, { media: source, audio: speechMedia, projectId: lit(task.id) }); document = out('voice-document', 'document');
    add('source', 'voice-transcript', 'speech.transcribe', 2, { media: speechMedia, transcript: lit(null) }); speech = out('voice-transcript', 'transcript');
  }
  let framingPlan: WorkflowBinding | undefined;
  const effect = (group: string, capability: string, options: unknown, actualMedia: WorkflowBinding = source) => { const id = group + '-apply'; add(group, id, capability, 1, { document, transcript: speech, media: actualMedia, options: lit(options), projectId: lit(task.id), ...(framingPlan ? { plan: framingPlan } : {}) }); document = out(id, 'document'); };
  if (enabled.has('rough-cut')) effect('rough-cut', 'edit.rough-cut', recipe.roughCut, speechMedia);
  if (enabled.has('voice-cleanup')) effect('voice-cleanup', 'audio.cleanup', recipe.cleanup, speechMedia);
  const planned = recipe.enabled.some(id => ['motion-graphics', 'camera-movement', 'broll'].includes(id));
  if (enabled.has('broll')) add('broll', 'broll-analysis', 'media.analyze', 2, { assets: lit(task.options.broll?.assets ?? []), cached: lit(null) });
  if (planned) {
    add('planning', 'content-source', 'edit.content-source', 1, { document, transcript: speech, settings: lit({ enabled: recipe.enabled.filter(id => ['motion-graphics', 'camera-movement', 'broll'].includes(id)), maxGraphics: recipe.graphics.maxCount, instruction: recipe.graphics.instruction }), analysis: enabled.has('broll') ? out('broll-analysis', 'analysis') : lit(null) });
    add('planning', 'content-proposal', 'llm.transform', 1, { value: out('content-source', 'value'), instruction: lit(CONTENT_PLAN_INSTRUCTION), schema: lit(contentDecisionSchema) });
    add('planning', 'content-plan', 'edit.content-plan', 1, { source: out('content-source', 'value'), proposal: out('content-proposal', 'value') });
    const content = out('content-plan', 'value');
    add('planning', 'framing-plan', 'edit.framing-plan', 1, { value: content, document, options: lit(editingCaptionOptions(recipe)), arrange: lit(enabled.has('auto-layout') && recipe.layout.arrange) });
    if (recipe.reviewPlan) { add('planning', 'content-review', 'human.approval', 1, { value: out('framing-plan', 'value'), title: lit('确认内容与构图安排'), schema: lit({ type: 'object', properties: {}, additionalProperties: true }), editable: lit(false), notify: lit(true) }); planReviewId = 'content-review'; }
    framingPlan = out('framing-plan', 'plan'); document = out('framing-plan', 'document');
  }
  if (enabled.has('broll')) {
    add('broll', 'broll-time', 'edit.broll-cues', 1, { plan: framingPlan! });
    add('broll', 'broll-match', 'broll.match', 2, { transcript: out('broll-time', 'transcript'), analysis: out('broll-analysis', 'analysis'), durationSec: out('broll-time', 'durationSec'), projectId: lit(task.id), cached: lit(null) });
    add('broll', 'broll-window', 'edit.broll-filter', 1, { plan: framingPlan!, value: out('broll-match', 'value') });
    add('broll', 'broll-apply', 'broll.compose', 2, { document, plan: out('broll-window', 'value'), analysis: out('broll-analysis', 'analysis'), options: lit(task.options.broll ?? { assets: [], captions: true }), durationSec: out('broll-time', 'durationSec') }); document = out('broll-apply', 'document');
    add('broll', 'broll-framing', 'layout.auto', 1, { document, transcript: speech, media: source, options: lit({ ...recipe.layout, aspect: enabled.has('auto-layout') ? recipe.layout.aspect : 'original', arrange: false }), projectId: lit(task.id), plan: framingPlan! }); document = out('broll-framing', 'document');
  }
  if (enabled.has('motion-graphics')) effect('motion-graphics', 'graphics.generate', recipe.graphics);
  if (enabled.has('floating-overlay')) effect('floating-overlay', 'overlays.auto', recipe.overlay);
  if (enabled.has('camera-movement')) effect('camera-movement', 'camera.motion', recipe.camera);
  if (enabled.has('auto-layout')) effect('auto-layout', 'layout.auto', { ...recipe.layout, aspect: enabled.has('auto-layout') ? recipe.layout.aspect : 'original', arrange: enabled.has('auto-layout') && recipe.layout.arrange });
  if (enabled.has('captions') || enabled.has('translation') && !enabled.has('voiceover')) {
    const captionOptions = editingCaptionOptions(recipe);
    if (recipe.captions.highlights) add('captions', 'caption-highlight', 'captions.highlight', 2, { transcript: speech });
    add('captions', 'captions-plan', 'captions.plan', 2, { document, transcript: recipe.captions.highlights ? out('caption-highlight', 'transcript') : speech, layout: lit(captionLayoutOptions(captionOptions as never)) });
    let translation: WorkflowBinding = lit(null);
    if (captionOptions.translationLanguage) {
      add('translation', 'caption-translation', 'text.translate', 2, { units: out('captions-plan', 'units'), language: lit(recipe.language) }); translation = out('caption-translation', 'value');
      if (recipe.rewrite.trim()) { add('rewrite', 'rewrite', 'llm.transform', 1, { value: translation, instruction: lit(recipe.rewrite + '\nPreserve IDs, sourceKey, language and line counts; edit lines only.'), schema: lit(captionTranslationSchema) }); translation = out('rewrite', 'value'); }
      if (recipe.reviewTranslation) { add('review', 'review', 'human.approval', 1, { value: translation, title: lit('确认字幕译文'), schema: lit(captionTranslationSchema), editable: lit(true), notify: lit(true) }); translation = out('review', 'value'); }
    }
    if (enabled.has('captions')) { add('captions', 'captions-apply', 'captions.apply', 2, { document, plan: out('captions-plan', 'plan'), translation, style: lit(captionOptions) }); document = out('captions-apply', 'document'); }
  }
  if (enabled.has('sound-effects')) effect('sound-effects', 'audio.effects', recipe.effects);
  if (enabled.has('background-music')) effect('background-music', 'audio.music', recipe.music);
  add('export', 'render', 'video.render', 2, { document, media: source, settings: lit(recipe.render) });
  const definition: WorkflowDefinition = { schemaVersion: 1, id: 'editing-workflow', version: 1, title: '我的编辑工作流', templateId: 'editing-workflow', trigger: { kind: 'manual' }, parameters: { source: { type: 'object', label: { zh: '原视频', en: 'Source video' }, default: media as never }, projectId: { type: 'string', label: { zh: '测试项目', en: 'Test project' }, default: task.id } }, steps };
  if (planned) targets.plan = 'framing-plan';
  return { definition, groups, targets };
}
