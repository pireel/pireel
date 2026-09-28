import { expect, it } from 'vitest';
import { connectFlow, flowCard, flowDiagnostics, insertFlowCard, moveFlowCard, recipeToFlow, removeFlowCard, type EditingFlow } from './editing-flow';
import { defaultEditingRecipe } from './editing-capabilities';
import { compileEditingFlow } from './editing-flow-compiler';
import { validateWorkflow } from './workflow';
import { WORKFLOW_NODE_CATALOG, workflowToTarget } from './workflow-editor';
const task = { id: 'test', name: 'video.mp4', options: { broll: { assets: [{ id: 'a', sig: 'asset', name: 'asset.mp4', kind: 'video', width: 640, height: 360, durationSec: 10 }], captions: true } } } as never;
const media = { kind: 'media', id: 'source', version: 'a'.repeat(64) }; const transcript = { kind: 'transcript', id: 'source', version: 'b'.repeat(64) };
const card = (kind: Parameters<typeof flowCard>[0], input: string, id: string) => flowCard(kind, input, defaultEditingRecipe(), id);
const compile = (flow: EditingFlow) => compileEditingFlow(flow, task, media, transcript);
it('compiles the visible order rather than the former fixed effect order', () => {
  const flow: EditingFlow = { version: 1, name: 'order', cards: [card('captions', 'source', 'captions'), card('rough-cut', 'captions', 'cut'), card('export', 'cut', 'out')] };
  const before = compile(flow); expect(() => validateWorkflow(before.definition, WORKFLOW_NODE_CATALOG)).not.toThrow();
  expect(before.definition.steps.find(step => step.id === 'cut--cut')!.arguments.document).toEqual({ kind: 'step', stepId: 'captions--captions', key: 'document' });
  const after = compile(moveFlowCard(flow, 'cut', 'up'));
  expect(after.definition.steps.find(step => step.id === 'captions--plan')!.arguments.document).toEqual({ kind: 'step', stepId: 'cut--cut', key: 'document' });
  expect(after.definition.steps.find(step => step.id === 'out--render')!.arguments.document).toEqual({ kind: 'step', stepId: 'captions--captions', key: 'document' });
});
it('branches from a common result and runs only a selected branch with independent parameters', () => {
  const flow: EditingFlow = { version: 1, name: 'branches', cards: [card('voice-cleanup', 'source', 'clean'), card('captions', 'clean', 'a'), card('captions', 'clean', 'b'), card('export', 'a', 'oa'), card('export', 'b', 'ob')] };
  flow.cards[1].settings.captions.presetId = 'keywords'; flow.cards[2].settings.captions.custom = { scale: 2 };
  const result = compile(flow); expect(() => validateWorkflow(result.definition, WORKFLOW_NODE_CATALOG)).not.toThrow();
  const one = workflowToTarget(result.definition, result.targets.oa);
  expect(one.steps.some(step => step.id.startsWith('b--') || step.id.startsWith('ob--'))).toBe(false);
  expect(result.definition.steps.filter(step => step.capability === 'audio.cleanup')).toHaveLength(1);
  expect(result.definition.steps.filter(step => step.capability === 'video.render')).toHaveLength(2);
});
it('rejects cycles and wrong product-level output types without changing the original graph', () => {
  const flow = recipeToFlow(defaultEditingRecipe()); const initial = structuredClone(flow); const first = flow.cards[0]; const output = flow.cards[1];
  expect(() => connectFlow(flow, first.id, output.id)).toThrow('成片'); expect(flow).toEqual(initial);
  const a = card('captions', 'b', 'a'); const b = card('captions', 'a', 'b'); expect(flowDiagnostics({ version: 1, name: 'cycle', cards: [a, b] }).join()).toContain('循环');
  expect(() => insertFlowCard(flow, card('translation', first.id, 't'))).toThrow('文稿');
  const removed = removeFlowCard(flow, first.id); expect(removed.cards[0].input).toBe('source');
});
it('supports translation to captions and voiceover without translating the same text again', () => {
  const flow: EditingFlow = { version: 1, name: 'languages', cards: [card('rough-cut', 'source', 'cut'), card('translation', 'cut', 'translate'), card('captions', 'translate', 'captions'), card('voiceover', 'translate', 'voice'), card('captions', 'voice', 'spoken'), card('export', 'captions', 'out-a'), card('export', 'spoken', 'out-b')] };
  flow.cards[3].settings.voiceId = 'voice';
  const result = compile(flow); expect(() => validateWorkflow(result.definition, WORKFLOW_NODE_CATALOG)).not.toThrow();
  expect(result.definition.steps.filter(step => step.capability === 'text.translate' && step.arguments.enabled.kind === 'literal' && step.arguments.enabled.value === true)).toHaveLength(1);
  expect(result.definition.steps.find(step => step.id === 'voice--voice')!.arguments.document).toEqual({ kind: 'step', stepId: 'translate--text', key: 'document' });
  expect(result.definition.steps.find(step => step.id === 'spoken--plan')!.arguments.transcript).toEqual({ kind: 'step', stepId: 'voice--transcript', key: 'transcript' });
});
it('migrates all existing selected capabilities into an editable connected graph', () => {
  const recipe = defaultEditingRecipe(); recipe.enabled = ['motion-graphics', 'sound-effects', 'captions', 'voice-cleanup', 'camera-movement', 'floating-overlay', 'rough-cut', 'auto-layout', 'broll', 'background-music', 'translation', 'voiceover']; recipe.voiceId = 'voice';
  const flow = recipeToFlow(recipe); expect(flowDiagnostics(flow)).toEqual([]);
  const result = compile(flow); expect(() => validateWorkflow(result.definition, WORKFLOW_NODE_CATALOG)).not.toThrow();
  expect(flow.cards.filter(card => card.kind !== 'export')).toHaveLength(recipe.enabled.length);
  const duplicate = card('motion-graphics', flow.cards.at(-2)!.id, 'another-mg');
  const repeated = compile(insertFlowCard(flow, duplicate));
  expect(new Set(repeated.definition.steps.map(step => step.id)).size).toBe(repeated.definition.steps.length);
});
it('rejects a cut that would detach translated text, while allowing cuts after a new voice track', () => {
  const translation = card('translation', 'source', 't'); const captions = card('captions', 't', 'c'); const cut = card('rough-cut', 'c', 'cut');
  expect(flowDiagnostics({ version: 1, name: 'unsafe', cards: [translation, captions, cut] }).join()).toContain('粗剪放在翻译之前');
  const voice = card('voiceover', 't', 'v'); cut.input = 'v';
  expect(flowDiagnostics({ version: 1, name: 'safe', cards: [translation, voice, cut] })).toEqual([]);
});
it('reuses a preceding visual plan for camera movement instead of charging for an unused second plan', () => {
  const flow: EditingFlow = { version: 1, name: 'shared plan', cards: [card('motion-graphics', 'source', 'mg'), card('camera-movement', 'mg', 'camera'), card('auto-layout', 'camera', 'layout')] };
  const result = compile(flow); expect(() => validateWorkflow(result.definition, WORKFLOW_NODE_CATALOG)).not.toThrow();
  expect(result.definition.steps.filter(step => step.capability === 'llm.transform')).toHaveLength(1);
  expect(result.definition.steps.find(step => step.id === 'camera--camera-movement-apply')!.arguments.plan).toEqual({ kind: 'step', stepId: 'mg--framing-plan', key: 'plan' });
  expect(result.definition.steps.find(step => step.id === 'layout--reframe')!.arguments.value).toEqual({ kind: 'step', stepId: 'mg--content-plan', key: 'value' });
});
