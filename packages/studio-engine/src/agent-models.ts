/** Public Agent choices. Provider credentials and billing stay on the host. */
export const STUDIO_AGENT_MODELS = [
  { id: 'auto', label: 'Auto', version: 'Opus + DeepSeek' },
  { id: 'deepseek', label: 'DeepSeek', version: 'V4.1 Flash' },
  { id: 'opus', label: 'Opus', version: '5.5' },
  { id: 'sonnet', label: 'Sonnet', version: '5.5' },
  { id: 'gpt-sol', label: 'GPT Sol', version: '6.1' },
] as const;
export type StudioAgentModelId = typeof STUDIO_AGENT_MODELS[number]['id'];
export const DEFAULT_STUDIO_AGENT_MODEL: StudioAgentModelId = 'auto';
export function isStudioAgentModelId(value: unknown): value is StudioAgentModelId {
  return STUDIO_AGENT_MODELS.some(model => model.id === value);
}
export function studioAgentModelId(value: unknown): StudioAgentModelId {
  // Old saved projects/threads did not select a model and ran on DeepSeek.
  return isStudioAgentModelId(value) ? value : 'deepseek';
}
