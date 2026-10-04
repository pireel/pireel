import { contractedCapability } from './workflow-node-contracts';
import { workflowLiteral as literal, type WorkflowBinding, type WorkflowCapability, type WorkflowDefinition, type WorkflowStep } from './workflow';
import type { CaptionTaskOptions } from './caption-task';
import { workflowJson } from './workflow-artifacts';
import { playbookHasMedia } from './brand-media';
import { playbookEditGuide } from './brand-edit-params';
export const sceneCapability = (id: string, inputs: string[], outputs: string[], paid = false): WorkflowCapability => contractedCapability({
  id, version: 2, label: { zh: id, en: id }, requirements: [], environments: ['browser'],
  effect: paid ? 'generate' : 'edit', retry: paid ? 'reconcile-first' : 'safe', available: true,
  inputs: Object.fromEntries(inputs.map(key => [key, { required: true }])), outputs: Object.fromEntries(outputs.map(key => [key, {}])),
});
export const CAPTION_WORKFLOW_CAPABILITIES = [
  sceneCapability('speech.transcribe', ['media', 'transcript'], ['transcript'], true),
  sceneCapability('speech.pause-plan', ['media', 'cuts'], ['cuts']),
  sceneCapability('edit.compose', ['media', 'cuts', 'aspect', 'projectId'], ['document']),
  sceneCapability('captions.plan', ['document', 'transcript', 'layout'], ['plan', 'units']),
  sceneCapability('text.translate', ['units', 'language'], ['translation', 'value'], true),
  sceneCapability('captions.apply', ['document', 'plan', 'translation', 'style'], ['document']),
  sceneCapability('captions.highlight', ['transcript'], ['transcript'], true),
  sceneCapability('brand.apply', ['document', 'brand'], ['document']),
  sceneCapability('brand.copy', ['transcript', 'request', 'templates', 'document'], ['copy'], true),
  sceneCapability('brand.texts', ['document', 'copy', 'templates'], ['document']),
  sceneCapability('edit.plan', ['transcript', 'guide', 'moves', 'document'], ['picks'], true),
  sceneCapability('edit.moves', ['document', 'transcript', 'moves', 'picks'], ['document']),
  sceneCapability('audio.loudness', ['document', 'media', 'targetLufs'], ['document']),
  sceneCapability('video.render', ['document', 'media'], ['media', 'document']),
];
export const stepOutput = (stepId: string, key: string): WorkflowBinding => ({ kind: 'step', stepId, key });
export const sceneLiteral = (value: unknown) => literal(workflowJson(value));
export function sceneStep(id: string, capability: string, args: Record<string, WorkflowBinding>): WorkflowStep {
  return { id, capability, version: 2, dependsOn: [...new Set(Object.values(args).flatMap(binding => binding.kind === 'step' ? [binding.stepId] : []))], arguments: args };
}
/** Only what changes line widths affects planning (look, font, weight, size, width); colours, position
 *  and animation do not, so restyling reuses the plan and its translation. */
export function captionLayoutOptions(options: CaptionTaskOptions): CaptionTaskOptions {
  const { preset, font, bold, scale, wPct } = options.caption;
  return { aspect: options.aspect, shortenPauses: false, caption: { preset, font, bold, scale, wPct } };
}
/** `render: false` stops at the edited document; the video is rendered when the user exports it. */
export function captionTailSteps(options: CaptionTaskOptions, document: WorkflowBinding, transcript: WorkflowBinding, media: WorkflowBinding, render = true): WorkflowStep[] {
  const steps: WorkflowStep[] = [];
  const captions = options.sfx ? ('captions' in options.sfx && options.sfx.captions) : !options.broll || options.broll.captions;
  const moves = options.edit?.moves;
  if (captions && options.highlights) steps.push(sceneStep('highlight', 'captions.highlight', { transcript }));
  if (captions) {
    steps.push(sceneStep('plan', 'captions.plan', { document, transcript: options.highlights ? stepOutput('highlight', 'transcript') : transcript, layout: sceneLiteral(captionLayoutOptions(options)) }));
    if (options.translationLanguage) steps.push(sceneStep('translate', 'text.translate', { units: stepOutput('plan', 'units'), language: sceneLiteral(options.translationLanguage) }));
    steps.push(sceneStep('captions', 'captions.apply', { document, plan: stepOutput('plan', 'plan'), translation: options.translationLanguage ? stepOutput('translate', 'value') : literal(null), style: sceneLiteral(options) }));
    document = stepOutput('captions', 'document');
  }
  if (moves && (moves.punchIn || moves.transition)) {
    // Where each move lands is a judgement on this video's lines, made against the creator's own triggers.
    steps.push(sceneStep('editplan', 'edit.plan', { transcript, guide: literal(options.brand ? playbookEditGuide(options.brand) : ''), moves: sceneLiteral(moves), document }));
    steps.push(sceneStep('moves', 'edit.moves', { document, transcript, moves: sceneLiteral(moves), picks: stepOutput('editplan', 'picks') }));
    document = stepOutput('moves', 'document');
  }
  const texts = options.edit?.texts; const templates = options.brand?.fixed.bands;
  if (texts && templates && ((texts.header && templates.header) || (texts.hookLabel && templates.hookLabel))) {
    // The bands' look is the brand's; their words are written for this video, in the creator's manner.
    const request = { header: !!(texts.header && templates.header), hookLabel: !!(texts.hookLabel && templates.hookLabel), examples: options.brand?.generation.headlines?.examples ?? [] };
    steps.push(sceneStep('copy', 'brand.copy', { transcript, request: sceneLiteral(request), templates: sceneLiteral(templates), document }));
    steps.push(sceneStep('texts', 'brand.texts', { document, copy: stepOutput('copy', 'copy'), templates: sceneLiteral(templates) }));
    document = stepOutput('texts', 'document');
  }
  // After captions: the intro/outro ripple the captions along with the speech they follow.
  if (playbookHasMedia(options.brand)) {
    steps.push(sceneStep('brand', 'brand.apply', { document, brand: sceneLiteral(options.brand) }));
    document = stepOutput('brand', 'document');
  }
  if (options.edit?.targetLufs !== undefined) {
    steps.push(sceneStep('loudness', 'audio.loudness', { document, media, targetLufs: literal(options.edit.targetLufs) }));
    document = stepOutput('loudness', 'document');
  }
  if (render) steps.push(sceneStep('render', 'video.render', { document, media }));
  return steps;
}
export function captionWorkflowDefinition(options: CaptionTaskOptions, media: unknown, transcript: unknown = null, cuts: unknown = null, projectId = 'caption', render = true): WorkflowDefinition {
  const source = sceneLiteral(media);
  const steps = [sceneStep('transcript', 'speech.transcribe', { media: source, transcript: sceneLiteral(transcript) })];
  const pause = options.edit?.pause;
  if (options.shortenPauses) steps.push(sceneStep('pauses', 'speech.pause-plan', { media: source, cuts: sceneLiteral(cuts), ...(pause ? { minimumPauseSec: literal(pause.minimumPauseSec), speechPaddingSec: literal(pause.speechPaddingSec) } : {}) }));
  steps.push(sceneStep('compose', 'edit.compose', { media: source, cuts: options.shortenPauses ? stepOutput('pauses', 'cuts') : literal([]), aspect: literal(options.aspect), projectId: literal(projectId) }));
  steps.push(...captionTailSteps(options, stepOutput('compose', 'document'), stepOutput('transcript', 'transcript'), source, render));
  return { schemaVersion: 1, id: 'official-ai-captions', version: 2, title: 'AI Captions', templateId: 'ai-captions', parameters: {}, trigger: { kind: 'manual' }, steps };
}
