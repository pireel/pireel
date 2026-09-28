import type { CaptionTaskOptions } from './caption-task';
import { captionWorkflowDefinition, sceneCapability, sceneLiteral, sceneStep, stepOutput } from './workflow-caption-template';
import { brollWorkflowDefinition } from './workflow-broll-template';

export const UGC_AD_CAPABILITIES = [
  sceneCapability('ugc.plan', ['transcript', 'brief', 'durationSec'], ['plan']),
  sceneCapability('ugc.apply', ['document', 'plan'], ['document']),
];
export function ugcAdWorkflowDefinition(options: CaptionTaskOptions, media: unknown, transcript: unknown, projectId: string, durationSec: number, cached: unknown) {
  const definition = options.broll?.assets.length
    ? brollWorkflowDefinition(options, media, transcript, projectId, durationSec, cached)
    : captionWorkflowDefinition({ ...options, shortenPauses: false }, media, transcript, null, projectId);
  definition.id = 'official-ugc-ad'; definition.title = 'UGC Ad'; definition.templateId = 'ugc-ad';
  const render = definition.steps.find(step => step.id === 'render')!;
  definition.steps.splice(definition.steps.indexOf(render), 0,
    sceneStep('ugc-plan', 'ugc.plan', { transcript: stepOutput('transcript', 'transcript'), brief: sceneLiteral(options.ugcAd), durationSec: sceneLiteral(durationSec) }),
    sceneStep('ugc-text', 'ugc.apply', { document: render.arguments.document, plan: stepOutput('ugc-plan', 'plan') }));
  render.arguments.document = stepOutput('ugc-text', 'document'); render.dependsOn = ['ugc-text'];
  return definition;
}
