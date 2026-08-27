export const STUDIO_CREATE_SKILL_ACTION = 'create-skill' as const;

export type StudioMetaAction = typeof STUDIO_CREATE_SKILL_ACTION;

/** Meta actions are explicit UI intent, persisted on the user message that initiated the turn. */
export function studioMetaActionFromMetadata(metadata: unknown): StudioMetaAction | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  return (metadata as { studioAction?: unknown }).studioAction === STUDIO_CREATE_SKILL_ACTION
    ? STUDIO_CREATE_SKILL_ACTION
    : null;
}

export function latestStudioMetaAction(
  messages: readonly { role?: unknown; metadata?: unknown }[],
): StudioMetaAction | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'user') return studioMetaActionFromMetadata(message.metadata);
  }
  return null;
}
