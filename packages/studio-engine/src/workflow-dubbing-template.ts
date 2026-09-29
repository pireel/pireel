import type { CaptionTaskOptions } from './caption-task';
import type { DubbingState } from './dubbing-task';
import { captionTailSteps, sceneCapability, sceneLiteral as lit, sceneStep as step, stepOutput as out } from './workflow-caption-template';
import type { WorkflowDefinition } from './workflow';
export const DUBBING_WORKFLOW_CAPABILITIES = [
  sceneCapability('speech.translate', ['transcript', 'media', 'config', 'cached'], ['plan', 'value'], true),
  sceneCapability('speech.synthesize', ['plan', 'projectId', 'name', 'cached'], ['speech'], true),
  sceneCapability('audio.align', ['speech', 'plan', 'media', 'cached'], ['audio']),
  sceneCapability('video.lipsync', ['media', 'audio', 'projectId', 'cached'], ['media'], true),
  sceneCapability('speech.dub-transcribe', ['audio', 'cached'], ['transcript', 'audioSig', 'signature'], true),
  sceneCapability('dubbing.compose', ['media', 'audio', 'projectId'], ['document']),
];
/** `render: false` stops at the dubbed document; the video is rendered when the user downloads it. */
export function dubbingWorkflowDefinition(options: CaptionTaskOptions, media: unknown, transcript: unknown, projectId: string, name: string, cached: DubbingState = {}, legacyRunId?: string, render = true): WorkflowDefinition {
  const config = options.dubbing!;
  const steps = [
    step('transcript', 'speech.transcribe', { media: lit(media), transcript: lit(transcript) }),
    step('translate', 'speech.translate', { transcript: out('transcript', 'transcript'), media: lit(media), config: lit({ language: config.language, script: config.script, turnScripts: config.turnScripts, voiceId: config.voiceId, speakerVoices: config.speakerVoices, lipSync: config.lipSync }), cached: lit({ language: cached.language, sourceText: cached.sourceText, translatedText: cached.translatedText, translatedTurns: cached.translatedTurns, turnsKey: cached.turnsKey }) }),
    step('speech', 'speech.synthesize', { plan: out('translate', 'value'), projectId: lit(projectId), name: lit(name), cached: lit({ language: cached.language, speechSignature: cached.speechSignature, speechParts: cached.speechParts, speech: cached.speech, legacyRunId }) }),
    step('align', 'audio.align', { speech: out('speech', 'speech'), plan: out('translate', 'value'), media: lit(media), cached: lit({ speechSignature: cached.speechSignature, alignedAudioSig: cached.alignedAudioSig, alignedPlanKey: cached.alignedPlanKey }) }),
  ];
  let picture = lit(media);
  if (config.lipSync) {
    steps.push(step('lipsync', 'video.lipsync', { media: picture, audio: out('align', 'audio'), projectId: lit(projectId), cached: lit({ ...cached, legacyRunId }) })); picture = out('lipsync', 'media');
  }
  if (config.captions) steps.push(step('dubTranscript', 'speech.dub-transcribe', { audio: out('align', 'audio'), cached: lit({ captionSignature: cached.captionSignature, captionTranscript: cached.captionTranscript, captionAudioSig: cached.captionAudioSig }) }));
  steps.push(step('compose', 'dubbing.compose', { media: picture, audio: out('align', 'audio'), projectId: lit(projectId) }));
  const captionOptions = { ...options, translationLanguage: undefined, shortenPauses: false, aspect: 'original' as const, broll: config.captions ? undefined : { assets: [], captions: false } };
  steps.push(...captionTailSteps(captionOptions, out('compose', 'document'), config.captions ? out('dubTranscript', 'transcript') : lit(null), picture, render));
  return { schemaVersion: 1, id: 'official-dubbing', version: 2, title: 'Video dubbing', templateId: 'dubbing', parameters: {}, trigger: { kind: 'manual' }, steps };
}
