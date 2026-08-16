import type { UIMessage } from 'ai';
import type { ChatSituation } from '@pireel/studio-engine/prompts';

function successfulDirectorPlanPart(part: UIMessage['parts'][number]): boolean {
  const candidate = part as {
    type?: string;
    toolName?: string;
    state?: string;
    output?: { ok?: boolean };
  };
  const isDirectorPlan = candidate.type === 'tool-set_director_plan'
    || (candidate.type === 'dynamic-tool' && candidate.toolName === 'set_director_plan');
  return isDirectorPlan
    && candidate.state === 'output-available'
    && candidate.output?.ok === true;
}

/** A persisted Director Plan belongs to a chat only after that same chat successfully created it. */
export function threadOwnsDirectorPlan(messages: readonly UIMessage[]): boolean {
  return messages.some(
    (message) => message.role === 'assistant'
      && (message.parts ?? []).some(successfulDirectorPlanPart),
  );
}

function timelineHasContent(body: ChatSituation): boolean {
  const composition = body.composition;
  return !!(
    composition?.shots?.length
    || composition?.blocks?.length
    || composition?.audio?.length
  );
}

/** Keep current canvas state visible while preventing another chat's editorial intent from leaking in. */
export function scopeSituationToThread(
  body: ChatSituation,
  messages: readonly UIMessage[],
): ChatSituation {
  // A Director Plan describes the current cut, not the source library. Once every
  // timeline lane is empty, retaining it in the document is useful for undo/history,
  // but feeding it to the agent makes a clean slate look like unfinished old work.
  if (timelineHasContent(body) && threadOwnsDirectorPlan(messages)) return body;
  const { directorPlan: _otherThreadPlan, ...currentState } = body;
  return {
    ...currentState,
    ...(body.pipeline
      ? { pipeline: { ...body.pipeline, plan: false } }
      : {}),
  };
}
