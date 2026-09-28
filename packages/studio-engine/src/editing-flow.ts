import { defaultEditingRecipe, EDITING_CAPABILITIES, type EditingCapabilityId, type EditingRecipe } from './editing-capabilities';
export type EditingFlowKind = EditingCapabilityId | 'export';
export interface EditingFlowCard { id: string; kind: EditingFlowKind; title: string; input: string | null; settings: EditingRecipe; position?: { x: number; y: number } }
export interface EditingFlow { version: 1; name: string; cards: EditingFlowCard[] }
export const flowOutput = (kind: EditingFlowKind | 'source') => kind === 'translation' ? '文稿' : kind === 'export' ? '成片' : '视频';
export const flowAccepts = (kind: EditingFlowKind, output: string) => output === '视频' || output === '文稿' && ['captions', 'voiceover'].includes(kind);
export function flowCard(kind: EditingFlowKind, input = 'source', settings = defaultEditingRecipe(), id = 'card-' + crypto.randomUUID()): EditingFlowCard {
  return { id, kind, title: kind === 'export' ? '导出视频' : EDITING_CAPABILITIES.find(item => item.id === kind)!.name, input, settings: structuredClone(settings) };
}
export function flowDiagnostics(flow: EditingFlow): string[] {
  if (flow.version !== 1 || !Array.isArray(flow.cards) || flow.cards.length > 60 || typeof flow.name !== 'string' || !flow.name.trim()) return ['流程格式无效，最多支持 60 张能力卡片。'];
  const errors: string[] = []; const ids = new Set<string>(); const kinds = new Set([...EDITING_CAPABILITIES.map(item => item.id), 'export']);
  for (const card of flow.cards) {
    if (!card || !/^[\w-]{1,80}$/.test(card.id) || card.id === 'source' || ids.has(card.id) || !kinds.has(card.kind) || !card.settings || typeof card.title !== 'string') return ['卡片标识或设置无效。'];
    ids.add(card.id);
  }
  for (const card of flow.cards.filter(card => card.kind === 'rough-cut')) {
    let parent = flow.cards.find(item => item.id === card.input); const seen = new Set<string>();
    while (parent && !seen.has(parent.id)) {
      seen.add(parent.id); if (parent.kind === 'voiceover') break;
      if (parent.kind === 'translation') { errors.push('粗剪会改变译文对应的讲话内容，请将粗剪放在翻译之前，或先完成配音再粗剪。'); break; }
      parent = flow.cards.find(item => item.id === parent!.input);
    }
  }
  const done = new Set<string>(); const active = new Set<string>();
  const visit = (id: string) => {
    if (id === 'source' || done.has(id)) return;
    if (active.has(id)) { errors.push('连接形成了循环，请移除返回前序的连线。'); return; }
    const card = flow.cards.find(item => item.id === id); if (!card) return;
    const parent = flow.cards.find(item => item.id === card.input);
    if (!card.input || card.input !== 'source' && !parent) errors.push(`${card.title}：请选择输入来源。`);
    else if (!flowAccepts(card.kind, flowOutput(parent?.kind ?? 'source'))) errors.push(`${card.title}需要${['captions', 'voiceover'].includes(card.kind) ? '视频或文稿' : '视频'}，不能接收${flowOutput(parent!.kind)}。`);
    active.add(id); if (parent) visit(parent.id); active.delete(id); done.add(id);
  };
  flow.cards.forEach(card => visit(card.id)); return [...new Set(errors)];
}
export function orderedFlowCards(flow: EditingFlow): EditingFlowCard[] {
  const issues = flowDiagnostics(flow); if (issues.length) throw new Error(issues[0]);
  const result: EditingFlowCard[] = []; const seen = new Set<string>();
  const visit = (card: EditingFlowCard) => { if (seen.has(card.id)) return; const parent = flow.cards.find(item => item.id === card.input); if (parent) visit(parent); seen.add(card.id); result.push(card); };
  flow.cards.forEach(visit); return result;
}
export function connectFlow(flow: EditingFlow, cardId: string, input: string): EditingFlow {
  const next = structuredClone(flow); const card = next.cards.find(card => card.id === cardId); if (!card) throw new Error('找不到这张卡片。');
  card.input = input; const issues = flowDiagnostics(next); if (issues.length) throw new Error(issues[0]); return next;
}
export function insertFlowCard(flow: EditingFlow, card: EditingFlowCard, branch = false): EditingFlow {
  const next = structuredClone(flow);
  const children = next.cards.filter(item => item.input === card.input);
  if (!branch && children.length > 1) throw new Error('这里有多个分支，请先选择具体分支中的卡片，或使用“从这里分支”。');
  if (!branch && children.length === 1) children[0].input = card.id;
  next.cards.push(structuredClone(card)); const issues = flowDiagnostics(next); if (issues.length) throw new Error(issues[0]); return next;
}
export function removeFlowCard(flow: EditingFlow, id: string): EditingFlow {
  const next = structuredClone(flow); const removed = next.cards.find(card => card.id === id); if (!removed) return next;
  next.cards = next.cards.filter(card => card.id !== id);
  const parent = next.cards.find(card => card.id === removed.input);
  for (const card of next.cards.filter(card => card.input === id)) card.input = flowAccepts(card.kind, flowOutput(parent?.kind ?? 'source')) ? removed.input : null;
  return next;
}
export function moveFlowCard(flow: EditingFlow, id: string, direction: 'up' | 'down'): EditingFlow {
  const node = flow.cards.find(card => card.id === id); if (!node) return flow;
  const children = flow.cards.filter(card => card.input === id);
  const before = direction === 'up' ? flow.cards.find(card => card.id === node.input) : node;
  const after = direction === 'up' ? node : children.length === 1 ? children[0] : undefined;
  if (!before || !after || flow.cards.filter(card => card.input === before.id).length !== 1) throw new Error('分支处请通过输入来源或连线调整顺序。');
  const next = structuredClone(flow); const a = next.cards.find(card => card.id === before.id)!; const b = next.cards.find(card => card.id === after.id)!;
  for (const child of next.cards.filter(card => card.input === b.id)) child.input = a.id;
  b.input = a.input; a.input = b.id; delete a.position; delete b.position;
  const issues = flowDiagnostics(next); if (issues.length) throw new Error(issues[0]); return next;
}
export function recipeToFlow(recipe: EditingRecipe): EditingFlow {
  const order: EditingCapabilityId[] = ['translation', 'voiceover', 'rough-cut', 'voice-cleanup', 'broll', 'auto-layout', 'motion-graphics', 'floating-overlay', 'camera-movement', 'captions', 'sound-effects', 'background-music'];
  // Translation feeds voiceover or captions; it must not connect a text result to a video-only effect.
  const kinds = order.filter(kind => recipe.enabled.includes(kind) && kind !== 'translation');
  if (recipe.enabled.includes('translation')) {
    const index = kinds.findIndex(kind => kind === 'voiceover' || kind === 'captions');
    kinds.splice(index < 0 ? kinds.length : index, 0, 'translation');
  }
  const cards: EditingFlowCard[] = []; let input = 'source';
  for (const [index, kind] of kinds.entries()) { const card = flowCard(kind, input, recipe, `step-${index}-${kind}`); cards.push(card); input = card.id; }
  if (!cards.length || flowOutput(cards.at(-1)!.kind) === '视频') cards.push(flowCard('export', input, recipe, 'output-main'));
  return { version: 1, name: '我的编辑流程', cards };
}
