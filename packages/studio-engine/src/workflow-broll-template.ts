import type { CaptionTaskOptions } from './caption-task';
import { captionWorkflowDefinition, sceneCapability, sceneLiteral, sceneStep, stepOutput } from './workflow-caption-template';
export const BROLL_WORKFLOW_CAPABILITIES = [
  sceneCapability('media.analyze', ['assets', 'cached'], ['analysis'], true),
  sceneCapability('broll.match', ['transcript', 'analysis', 'durationSec', 'projectId', 'cached'], ['plan', 'value'], true),
  sceneCapability('broll.compose', ['document', 'plan', 'analysis', 'options', 'durationSec'], ['document', 'plan']),
];
/** `renderVideo: false` stops at the document; the video is rendered when the user exports it. */
export function brollWorkflowDefinition(options: CaptionTaskOptions, media: unknown, transcript: unknown, projectId: string, durationSec: number, cached: unknown, renderVideo = true) {
  // Only the asset fields the workflow contract knows: saved assets may carry probe extras (hasAudio).
  const assets = options.broll!.assets.map(({ id, sig, name, kind, durationSec, width, height }) => ({ id, sig, name, kind, durationSec, width, height }));
  options = { ...options, broll: { ...options.broll!, assets } };
  const definition = captionWorkflowDefinition({ ...options, shortenPauses: false }, media, transcript, null, projectId);
  definition.id = options.broll?.pip ? 'official-pip' : 'official-broll'; definition.title = options.broll?.pip ? 'Picture in picture' : 'B-roll'; definition.templateId = options.broll?.pip ? 'pip' : 'broll';
  const compose = definition.steps.findIndex(step => step.id === 'compose');
  definition.steps.splice(compose, 0,
    sceneStep('analysis', 'media.analyze', { assets: sceneLiteral(options.broll!.assets), cached: sceneLiteral(cached) }),
    sceneStep('match', 'broll.match', { transcript: stepOutput('transcript', 'transcript'), analysis: stepOutput('analysis', 'analysis'), durationSec: sceneLiteral(durationSec), projectId: sceneLiteral(projectId), cached: sceneLiteral(cached) }),
  );
  const render = definition.steps.find(step => step.id === 'render')!;
  const document = render.arguments.document;
  definition.steps.splice(definition.steps.indexOf(render), 0, sceneStep('broll', 'broll.compose', { document, plan: stepOutput('match', 'value'), analysis: stepOutput('analysis', 'analysis'), options: sceneLiteral(options.broll), durationSec: sceneLiteral(durationSec) }));
  render.arguments.document = stepOutput('broll', 'document'); render.dependsOn = ['broll'];
  if (!renderVideo) definition.steps = definition.steps.filter(step => step !== render);
  return definition;
}
