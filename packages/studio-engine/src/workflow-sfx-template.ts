import type { CaptionTaskOptions } from './caption-task';
import { DEFAULT_SFX_OPTIONS } from './sfx-task';
import { captionWorkflowDefinition, sceneCapability, sceneLiteral, sceneStep, stepOutput } from './workflow-caption-template';
export const SFX_AI_CAPABILITIES = [sceneCapability('sfx.plan', ['transcript', 'density', 'media', 'projectId'], ['plan'], true), sceneCapability('sfx.apply', ['document', 'plan', 'media'], ['document']), sceneCapability('sfx.generate', ['plan', 'projectId'], ['plan'], true)];
export function sfxWorkflowDefinition(options: CaptionTaskOptions, media: unknown, transcript: unknown, projectId: string) {
  const config = options.sfx ?? DEFAULT_SFX_OPTIONS;
  const definition = captionWorkflowDefinition({ ...options, shortenPauses: false, translationLanguage: undefined }, media, transcript, null, projectId);
  definition.id = 'official-auto-sfx'; definition.title = 'Auto SFX'; definition.templateId = 'sfx';
  const render = definition.steps.find(step => step.id === 'render')!;
  if ('density' in config) {
    definition.steps.splice(definition.steps.indexOf(render), 0,
      sceneStep('sfx-plan', 'sfx.plan', { transcript: stepOutput('transcript', 'transcript'), density: sceneLiteral(config.density), media: sceneLiteral(media), projectId: sceneLiteral(projectId) }),
      sceneStep('sfx-generate', 'sfx.generate', { plan: stepOutput('sfx-plan', 'plan'), projectId: sceneLiteral(projectId) }),
      sceneStep('sfx', 'sfx.apply', { document: render.arguments.document, plan: stepOutput('sfx-generate', 'plan'), media: sceneLiteral(media) }));
    render.arguments.document = stepOutput('sfx', 'document'); render.dependsOn = ['sfx'];
    return definition;
  }
  const effects = sceneStep('sfx', 'audio.effects', { document: render.arguments.document, transcript: stepOutput('transcript', 'transcript'), media: sceneLiteral(media), projectId: sceneLiteral(projectId), options: sceneLiteral({ style: config.style, maxCount: config.maxCount, volumeDb: config.volumeDb }) });
  effects.version = 1;
  definition.steps.splice(definition.steps.indexOf(render), 0, effects);
  render.arguments.document = stepOutput('sfx', 'document'); render.dependsOn = ['sfx'];
  return definition;
}
