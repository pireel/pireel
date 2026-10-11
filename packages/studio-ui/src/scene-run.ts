import { studioProviders } from '@pireel/studio-engine/providers';
import type { CaptionTaskRecord } from '@pireel/studio-engine/scene-project';
import type { SceneWorkflowHooks } from './scene-workflow-runtime';

/**
 * Run a generation under its host run (fixed-price captions, dubbing and Auto SFX; picture in picture holds its
 * estimate's ceiling and settles at actual usage): charged once when it starts,
 * closed when it completes, refunded when it fails. A stopped generation, or one waiting on the user,
 * keeps its run open so continuing it is not charged again. Hosts without runs bill each step.
 */
export async function withSceneRun<T>(task: CaptionTaskRecord, hooks: SceneWorkflowHooks, run: (hooks: SceneWorkflowHooks) => Promise<T>): Promise<T> {
  const runs = studioProviders().sceneRuns;
  if (!runs || !task.generationId) return run(hooks);
  const { id } = await runs.start({ id: task.generationId, projectId: task.id }, hooks.signal);
  let result: T;
  try {
    result = await run({ ...hooks, sceneRun: id });
  } catch (error) {
    const waiting = error instanceof Error && 'code' in error && error.code === 'workflow_waiting';
    if (!hooks.signal.aborted && !waiting) await runs.finish(id, 'failed').catch(reason => console.warn('[scene-run] refund request failed', reason));
    throw error;
  }
  await runs.finish(id, 'completed').catch(reason => console.warn('[scene-run] close request failed', reason));
  return result;
}
