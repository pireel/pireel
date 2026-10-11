import type { WorkflowDefinition, WorkflowInputs, WorkflowRun } from './workflow';
export interface WorkflowCostHint { id: string; capability: string; durationSec: number; textLength: number; voiceId: string; frames: number }
/** Read-only sizing hints. The billing service always authorizes and charges the actual operation. */
export function workflowCostHints(definition: WorkflowDefinition, durationSec: number, run?: WorkflowRun): WorkflowCostHint[] {
  const value = (binding: import('./workflow').WorkflowBinding | undefined): unknown => binding?.kind === 'literal' ? binding.value : binding?.kind === 'input' ? definition.parameters[binding.key]?.default : binding?.kind === 'step' ? run?.steps.find(step => step.id === binding.stepId)?.artifact?.data[binding.key] : undefined;
  return definition.steps.filter(step => ['speech.transcribe', 'speech.dub-transcribe', 'text.translate', 'speech.translate', 'captions.emphasize', 'captions.source-emphasize', 'speech.synthesize', 'media.analyze', 'broll.match', 'video.lipsync', 'llm.transform', 'graphics.generate'].includes(step.capability)).map(step => {
    const args = Object.fromEntries(Object.entries(step.arguments).map(([key, binding]) => [key, value(binding)]));
    const units = args.units as { text?: string }[] | undefined; const plan = args.plan as { parts?: { text?: string; voiceId?: string }[] } | undefined;
    const assets = args.assets as { kind?: string }[] | undefined;
    const voiceConfig = definition.steps.find(step => step.capability === 'speech.plan' || step.capability === 'speech.translate')?.arguments.config;
    const config = value(voiceConfig) as { voiceId?: string } | undefined;
    return { id: step.id, capability: step.capability, durationSec: Math.max(.001, durationSec), textLength: Math.min(60000, units?.reduce((sum, unit) => sum + (unit.text?.length ?? 0), 0) ?? plan?.parts?.reduce((sum, part) => sum + (part.text?.length ?? 0), 0) ?? (args.value ? JSON.stringify(args.value).length : 0)), voiceId: plan?.parts?.[0]?.voiceId ?? config?.voiceId ?? '', frames: step.capability === 'graphics.generate' ? Number((args.options as { maxCount?: number } | undefined)?.maxCount ?? 3) : assets?.reduce((sum, asset) => sum + (asset.kind === 'image' ? 1 : 8), 0) ?? 8 };
  });
}
