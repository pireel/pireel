/** Shared task contract. No renderer dependencies or editorial prompt text. */
export const WHITEBOARD_SKILL_ID = 'whiteboard-explainer';
export const WHITEBOARD_MEDIA_LIMITS = { entities: 100, queriesPerEntity: 2 } as const;

export interface WhiteboardTaskState {
  skillId?: string;
  directorPlanRequired?: boolean;
  directorPlan?: { revision?: number; beats?: unknown[] };
}

/** Local revisions use the existing board; only explicit full-video launches require a plan. */
export function isWholeWhiteboardTask(task: WhiteboardTaskState | undefined): boolean {
  return task?.skillId === WHITEBOARD_SKILL_ID && task.directorPlanRequired === true;
}

export function whiteboardTaskPhase(task: WhiteboardTaskState | undefined): 'planning' | 'execution' | undefined {
  if (!isWholeWhiteboardTask(task)) return undefined;
  return task?.directorPlan?.revision && task.directorPlan.beats?.length ? 'execution' : 'planning';
}

/** Preparation can register chosen media, but cannot author the timeline before the plan exists. */
export function whiteboardToolBlock(task: WhiteboardTaskState | undefined, tool: string, mutates: boolean, input?: Record<string, unknown>): string | undefined {
  const phase = whiteboardTaskPhase(task);
  if (!phase) return;
  if (tool === 'rough_cut') return 'This task preserves the original narration; do not rough_cut.';
  if (phase === 'execution') return;
  if (tool === 'save_edit_plan' || tool === 'register_media' || tool === 'prepare_local_asset' || tool === 'set_whiteboard' && input?.describe === true) return;
  if (!mutates && tool !== 'compose_component') return;
  return 'Whiteboard planning is incomplete. Follow whiteboard-explainer and save_edit_plan before timeline authoring.';
}
