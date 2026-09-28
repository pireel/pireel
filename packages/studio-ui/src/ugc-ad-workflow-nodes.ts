import { planUgcAdText, type UgcAdText } from '@pireel/studio-engine/ugc-ad-plan';
import type { UgcAdOptions } from '@pireel/studio-engine/ugc-ad';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import type { EditorDocumentV2 } from '@pireel/studio-engine/composition';
import { applyDocumentTransaction } from '@pireel/studio-engine/document-transaction';
import { workflowJson } from '@pireel/studio-engine/workflow-artifacts';
import { UGC_AD_CAPABILITIES } from '@pireel/studio-engine/workflow-ugc-ad-template';
import type { SceneNode, SceneWorkflowHost } from './scene-workflow-runtime';

export function ugcAdWorkflowNodes(host: SceneWorkflowHost): SceneNode[] {
  const { store } = host;
  return [{ capability: UGC_AD_CAPABILITIES[0], stage: 'matching', async execute(args) {
    const transcript = store.read<AsrSegment[]>(args.transcript, 'transcript');
    const plan = planUgcAdText(args.brief as unknown as UgcAdOptions, transcript, Number(args.durationSec));
    return { plan: workflowJson(await store.put('edit-plan', 'ugc-ad-text', plan)) };
  } }, { capability: UGC_AD_CAPABILITIES[1], stage: 'styling', async execute(args) {
    const document = store.read<EditorDocumentV2>(args.document, 'document');
    const plan = store.read<UgcAdText[]>(args.plan, 'edit-plan');
    const applied = applyDocumentTransaction(document, { ops: [{ op: 'agent.timeline', input: {
      tool: 'set_texts', input: { items: plan.map(item => ({ id: `ugc-${item.role}`, text: item.text, startSec: item.startSec, durationSec: item.durationSec, preset: 'clean', align: 'center' })) },
    } }] }, { projectId: host.task.id });
    if (!applied.ok) throw new Error(applied.error.message);
    return { document: workflowJson(await store.put('document', 'ugc-ad', applied.document)) };
  } }];
}
