import type { CaptionTaskOptions } from './caption-task';
import { captionWorkflowDefinition, sceneCapability, sceneLiteral, sceneStep, stepOutput } from './workflow-caption-template';
export const BROLL_WORKFLOW_CAPABILITIES = [
  sceneCapability('media.analyze', ['assets', 'cached'], ['analysis'], true),
  sceneCapability('broll.match', ['transcript', 'analysis', 'durationSec', 'projectId', 'options', 'cached'], ['plan', 'value'], true),
  sceneCapability('broll.generate', ['transcript', 'analysis', 'durationSec', 'projectId', 'options', 'cached'], ['value'], true),
  sceneCapability('broll.compose', ['document', 'plan', 'analysis', 'generated', 'options', 'durationSec'], ['document', 'plan']),
];
/** `renderVideo: false` stops at the document; the video is rendered when the user exports it. */
export function brollWorkflowDefinition(options: CaptionTaskOptions, media: unknown, transcript: unknown, projectId: string, durationSec: number, cached: unknown, renderVideo = true) {
  // Only the asset fields the workflow contract knows: saved assets may carry probe extras (hasAudio).
  const assets = options.broll!.assets.map(({ id, sig, name, kind, durationSec, width, height }) => ({ id, sig, name, kind, durationSec, width, height }));
  options = { ...options, broll: { ...options.broll!, assets } };
  const definition = captionWorkflowDefinition({ ...options, shortenPauses: false }, media, transcript, null, projectId);
  definition.id = options.broll?.pip ? 'official-pip' : 'official-broll'; definition.title = options.broll?.pip ? 'Picture in picture' : 'B-roll'; definition.templateId = options.broll?.pip ? 'pip' : 'broll';
  // Footage comes from the user's files (analyzed) and/or AI stills. With AI on, one planning pass
  // arranges both, so stills fill only the moments the user's own shots cannot.
  const local = options.broll!.localFootage !== false && assets.length > 0;
  const ai = options.broll!.aiFootage === true;
  if (!local && !ai) throw new Error('请添加素材或开启 AI 生成。');
  const compose = definition.steps.findIndex(step => step.id === 'compose');
  const analysis: Record<string, ReturnType<typeof stepOutput>> = local ? { analysis: stepOutput('analysis', 'analysis') } : {};
  definition.steps.splice(compose, 0,
    ...(local ? [sceneStep('analysis', 'media.analyze', { assets: sceneLiteral(options.broll!.assets), cached: sceneLiteral(cached) })] : []),
    ai ? sceneStep('generated', 'broll.generate', { transcript: stepOutput('transcript', 'transcript'), ...analysis, durationSec: sceneLiteral(durationSec), projectId: sceneLiteral(projectId), options: sceneLiteral(options.broll), cached: sceneLiteral(cached) })
      : sceneStep('match', 'broll.match', { transcript: stepOutput('transcript', 'transcript'), ...analysis, durationSec: sceneLiteral(durationSec), projectId: sceneLiteral(projectId), options: sceneLiteral(options.broll!.pip ? { pip: options.broll!.pip } : {}), cached: sceneLiteral(cached) }),
  );
  const render = definition.steps.find(step => step.id === 'render')!;
  const document = render.arguments.document;
  definition.steps.splice(definition.steps.indexOf(render), 0, sceneStep('broll', 'broll.compose', { document, ...analysis, ...(ai ? { generated: stepOutput('generated', 'value') } : { plan: stepOutput('match', 'value') }), options: sceneLiteral(options.broll), durationSec: sceneLiteral(durationSec) }));
  render.arguments.document = stepOutput('broll', 'document'); render.dependsOn = ['broll'];
  if (!renderVideo) definition.steps = definition.steps.filter(step => step !== render);
  return definition;
}
