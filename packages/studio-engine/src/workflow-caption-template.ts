import { contractedCapability } from './workflow-node-contracts';
import { workflowLiteral as literal, type WorkflowBinding, type WorkflowCapability, type WorkflowDefinition, type WorkflowStep } from './workflow';
import { BRAND_CAPTION_PRESET_ID, captionTaskBaseStyle, captionTaskStyle, type CaptionTaskOptions } from './caption-task';
import { workflowJson } from './workflow-artifacts';
import { brandHasMedia } from './brand-kit';
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
  sceneCapability('captions.apply', ['document', 'plan', 'translation', 'emphasis', 'style'], ['document']),
  sceneCapability('captions.emphasize', ['plan'], ['emphasis'], true),
  sceneCapability('captions.source-emphasize', ['transcript'], ['transcript', 'value'], true),
  sceneCapability('brand.apply', ['document', 'brand'], ['document']),
  sceneCapability('video.render', ['document', 'media'], ['media', 'document']),
];
export const stepOutput = (stepId: string, key: string): WorkflowBinding => ({ kind: 'step', stepId, key });
export const sceneLiteral = (value: unknown) => literal(workflowJson(value));
export function sceneStep(id: string, capability: string, args: Record<string, WorkflowBinding>): WorkflowStep {
  return { id, capability, version: 2, dependsOn: [...new Set(Object.values(args).flatMap(binding => binding.kind === 'step' ? [binding.stepId] : []))], arguments: args };
}
/** Only geometry affects planning. Translation keys depend on resulting lines, not style choices. */
export function captionLayoutOptions(options: CaptionTaskOptions): CaptionTaskOptions {
  const style = captionTaskStyle(options);
  return { presetId: options.presetId, aspect: options.aspect, shortenPauses: false, layoutVersion: options.layoutVersion, ...(options.presetId === BRAND_CAPTION_PRESET_ID ? { brand: options.brand } : {}),
    custom: { font: style.font, scale: options.custom?.scale, bold: style.bold, wPct: options.custom?.wPct } };
}
export function captionTailSteps(options: CaptionTaskOptions, document: WorkflowBinding, transcript: WorkflowBinding, media: WorkflowBinding): WorkflowStep[] {
  const steps: WorkflowStep[] = [];
  const captions = options.sfx ? ('captions' in options.sfx && options.sfx.captions) : !options.broll || options.broll.captions;
  if (captions) {
    const emphasize = captionTaskBaseStyle(options).preset === 'kw-yellow';
    if (emphasize) steps.push(sceneStep('emphasis', 'captions.source-emphasize', { transcript }));
    steps.push(sceneStep('plan', 'captions.plan', { document, transcript: emphasize ? stepOutput('emphasis', 'transcript') : transcript, layout: sceneLiteral(captionLayoutOptions(options)) }));
    if (options.translationLanguage) steps.push(sceneStep('translate', 'text.translate', { units: stepOutput('plan', 'units'), language: sceneLiteral(options.translationLanguage) }));
    steps.push(sceneStep('captions', 'captions.apply', { document, plan: stepOutput('plan', 'plan'), translation: options.translationLanguage ? stepOutput('translate', 'value') : literal(null), emphasis: literal(null), style: sceneLiteral(options) }));
    document = stepOutput('captions', 'document');
  }
  // After captions: the intro/outro ripple the captions along with the speech they follow.
  if (brandHasMedia(options.brand)) {
    steps.push(sceneStep('brand', 'brand.apply', { document, brand: sceneLiteral(options.brand) }));
    document = stepOutput('brand', 'document');
  }
  steps.push(sceneStep('render', 'video.render', { document, media }));
  return steps;
}
export function captionWorkflowDefinition(options: CaptionTaskOptions, media: unknown, transcript: unknown = null, cuts: unknown = null, projectId = 'caption'): WorkflowDefinition {
  const source = sceneLiteral(media);
  const steps = [sceneStep('transcript', 'speech.transcribe', { media: source, transcript: sceneLiteral(transcript) })];
  if (options.shortenPauses) steps.push(sceneStep('pauses', 'speech.pause-plan', { media: source, cuts: sceneLiteral(cuts) }));
  steps.push(sceneStep('compose', 'edit.compose', { media: source, cuts: options.shortenPauses ? stepOutput('pauses', 'cuts') : literal([]), aspect: literal(options.aspect), projectId: literal(projectId) }));
  steps.push(...captionTailSteps(options, stepOutput('compose', 'document'), stepOutput('transcript', 'transcript'), source));
  return { schemaVersion: 1, id: 'official-ai-captions', version: 2, title: 'AI Captions', templateId: 'ai-captions', parameters: {}, trigger: { kind: 'manual' }, steps };
}
