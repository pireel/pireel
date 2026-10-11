import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import type { EditorDocumentV2, NormBox } from '@pireel/studio-engine/composition';
import { captionTaskStyle, captionTaskCanvas, type CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import { BASE_CAPTION_FONT_PX } from '@pireel/studio-engine/caption-presets';
import { applyDocumentTransaction } from '@pireel/studio-engine/document-transaction';
import { artifactVersion, workflowJson } from '@pireel/studio-engine/workflow-artifacts';
import { EDITING_WORKFLOW_CAPABILITIES } from '@pireel/studio-engine/editing-node-contracts';
import { contentSource, validateContentPlan, frameContentPlan, constrainPlannedBroll, visualBeats, type ContentSource, type ContentPlan, type FramingPlan, type EditorialSettings } from '@pireel/studio-engine/editing-plan';
import type { BrollPlacement } from '@pireel/studio-engine/broll-task';
import type { SceneNode, SceneWorkflowHost } from './scene-workflow-runtime';

export function editingPlanNodes(host: SceneWorkflowHost): SceneNode[] {
  const { store } = host;
  const node = (id: string, body: Omit<SceneNode, 'capability'>): SceneNode => ({ capability: EDITING_WORKFLOW_CAPABILITIES.find(cap => cap.id === id)!, ...body });
  return [
    node('edit.content-source', { async execute(args) {
      const analysis = args.analysis ? store.read<{ candidates: ContentSource['candidates'] }>(args.analysis, 'visual-analysis') : null;
      const source = contentSource(store.read(args.document, 'document'), store.read<AsrSegment[]>(args.transcript, 'transcript'), args.settings as unknown as EditorialSettings, analysis?.candidates.map(({ id, description }) => ({ id, description })) ?? []);
      return { value: workflowJson({ ...source, sourceKey: await artifactVersion(source) }) };
    } }),
    node('edit.content-plan', { async execute(args) { return { value: workflowJson(validateContentPlan(args.source as unknown as ContentSource, args.proposal)) }; } }),
    node('edit.framing-plan', { async execute(args) {
      let document = store.read<EditorDocumentV2>(args.document, 'document'); const options = args.options as unknown as CaptionTaskOptions;
      const canvas = captionTaskCanvas(options.aspect, document.canvas);
      if (canvas.width !== document.canvas.width || canvas.height !== document.canvas.height) {
        const resized = applyDocumentTransaction(document, { ops: [{ op: 'canvas.resize', input: { ...canvas, mainTranscript: null, clipTranscripts: {} } }] }, { projectId: host.task.id });
        if (!resized.ok) throw new Error(resized.error.message); document = resized.document;
      }
      const style = captionTaskStyle(options, canvas);
      const bottom = Math.min(.98, (style.sub?.yPct ?? style.yPct ?? 88) / 100);
      const height = Math.max(.08, BASE_CAPTION_FONT_PX * (style.scale ?? 1) * (options.translationLanguage ? 4.5 : 2.5) / canvas.height);
      const band: NormBox = { x: .04, y: Math.max(.05, bottom - height), w: .92, h: Math.min(.95, height) };
      const value = frameContentPlan(args.value as unknown as ContentPlan, canvas, args.arrange === true, band);
      return { plan: workflowJson(await store.put('edit-plan', 'framing-plan', value)), value: workflowJson(value), document: workflowJson(await store.put('document', 'planned-canvas', document)) };
    } }),
    node('edit.broll-cues', { async execute(args) {
      const plan = store.read<FramingPlan>(args.plan, 'edit-plan');
      return { transcript: workflowJson(await store.put('transcript', 'planned-broll', visualBeats(plan, 'broll').map(beat => ({ start: beat.start, end: beat.end, text: beat.description + ' — ' + beat.text })))), durationSec: plan.durationSec };
    } }),
    node('edit.broll-filter', { async execute(args) {
      const value = args.value as unknown as { placements: BrollPlacement[]; planKey: string };
      const plan = store.read<FramingPlan>(args.plan, 'edit-plan');
      return { value: workflowJson({ ...value, placements: constrainPlannedBroll(value.placements, plan) }) };
    } }),
  ];
}
