export const STUDIO_CREATE_SKILL_ACTION = 'create-skill' as const;

export type StudioMetaAction = typeof STUDIO_CREATE_SKILL_ACTION;
export type StudioApprovalDecision = 'approved' | 'rejected';

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

function approvalDecisionFromPart(part: unknown): StudioApprovalDecision | null {
  if (!part || typeof part !== 'object' || Array.isArray(part)) return null;
  const row = part as {
    type?: unknown;
    toolName?: unknown;
    state?: unknown;
    output?: unknown;
  };
  const isApproval = row.type === 'tool-request_approval'
    || (row.type === 'dynamic-tool' && row.toolName === 'request_approval');
  if (!isApproval || row.state !== 'output-available' || !row.output || typeof row.output !== 'object') {
    return null;
  }
  const data = (row.output as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return null;
  const decision = (data as { decision?: unknown }).decision;
  return decision === 'approved' || decision === 'rejected' ? decision : null;
}

/** Latest approval made after the user activated Create Skill; newer rejection supersedes approval. */
export function latestCreateSkillApproval(
  messages: readonly { role?: unknown; metadata?: unknown; parts?: unknown }[],
): StudioApprovalDecision | null {
  let userIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') {
      userIndex = index;
      break;
    }
  }
  if (userIndex < 0 || studioMetaActionFromMetadata(messages[userIndex]?.metadata) !== STUDIO_CREATE_SKILL_ACTION) {
    return null;
  }

  let latest: StudioApprovalDecision | null = null;
  for (let index = userIndex + 1; index < messages.length; index += 1) {
    const parts = messages[index]?.parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      const decision = approvalDecisionFromPart(part);
      if (decision) latest = decision;
    }
  }
  return latest;
}
