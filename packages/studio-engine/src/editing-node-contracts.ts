import type { WorkflowCapability } from './workflow';
import { ws, artifactRefSchema, voiceConfigSchema, captionStyleSchema, type NodeContract } from './workflow-node-contracts';
const ref = (name: string, kind: string) => ({ label: name, schema: artifactRefSchema(kind), valueType: kind + '-ref', required: true });
const options = (properties: Record<string, import('./workflow-schema').WorkflowSchema>) => ({ label: '配置', schema: ws.object(properties), valueType: 'editing-options', required: true });
const string = ws.string(4000); const count = ws.number(1, 12);
const definitions: [string, string, boolean, Record<string, import('./workflow-schema').WorkflowSchema>][] = [
  ['edit.rough-cut', '口播粗剪', false, { minimumPauseSec: ws.number(.1, 5), paddingSec: ws.number(0, 1), fillers: { type: 'boolean' as const } }],
  ['audio.cleanup', '人声清理', false, { strength: ws.number(0, 1), normalize: { type: 'boolean' as const } }],
  ['graphics.generate', '动态图形', true, { instruction: string, maxCount: count }],
  ['camera.motion', '镜头运动', false, { scale: ws.number(1.02, 1.5), intervalSec: ws.number(3, 60), transition: { type: 'string' as const, enum: ['none', 'fade'] } }],
  ['overlays.auto', '悬浮叠加', false, { query: string, maxCount: count }],
  ['layout.auto', '自动布局', false, { aspect: { type: 'string' as const, enum: ['original', 'portrait', 'landscape', 'square'] }, arrange: { type: 'boolean' as const } }],
  ['audio.effects', '音效', false, { style: { type: 'string' as const, enum: ['soft', 'pop', 'whoosh'] }, maxCount: count, volumeDb: ws.number(-40, -3) }],
  ['audio.music', '背景音乐', false, { query: string, assetSig: ws.string(300), name: ws.string(500), volumeDb: ws.number(-40, -3), duckDb: ws.number(-30, 0) }],
];
export const EDITING_NODE_CONTRACTS: Record<string, NodeContract> = Object.fromEntries(definitions.map(([id, name, paid, schema]) => [id, { label: { zh: name, en: id }, description: name, category: '编辑效果', implementationRevision: '2026-09-19.1', requirements: ['project-document', 'media-bytes'], billing: paid ? 'server' : 'none', cache: '文档、源媒体、转写版本与该能力配置', recovery: paid ? '保存已完成图形；不自动重放不确定的付费请求。' : '保留原素材，可安全重试。', inputs: { document: ref('文档', 'document'), transcript: ref('转写', 'transcript'), media: ref('媒体', 'media'), options: options(schema), projectId: { label: '项目', valueType: 'text', required: true, schema: ws.string(100, 1) } }, outputs: { document: ref('文档', 'document'), report: { label: '处理结果', valueType: 'json', schema: ws.object({}, [], true), required: true } } } satisfies NodeContract]));
EDITING_NODE_CONTRACTS['speech.project'] = { label: { zh: '映射讲话时间', en: 'Project speech time' }, description: '把源转写映射到剪后的时间线。', category: '内部', implementationRevision: '1', requirements: [], billing: 'none', cache: '文档与转写版本', recovery: '可安全重试', hidden: true, inputs: { document: ref('文档', 'document'), transcript: ref('转写', 'transcript') }, outputs: { transcript: ref('时间线转写', 'transcript'), durationSec: { label: '时长', valueType: 'number', schema: ws.number(.001), required: true } } };
EDITING_NODE_CONTRACTS['speech.empty'] = { ...EDITING_NODE_CONTRACTS['speech.project'], label: { zh: '准备无转写输入', en: 'Empty speech input' }, inputs: { media: ref('媒体', 'media') }, outputs: { transcript: ref('转写', 'transcript') } };
EDITING_NODE_CONTRACTS['speech.voice-check'] = { ...EDITING_NODE_CONTRACTS['speech.empty'], label: { zh: '检查说话人音色', en: 'Check speaker voices' }, inputs: { transcript: ref('转写', 'transcript'), config: { label: '声音', valueType: 'voice-config', schema: voiceConfigSchema, required: true } } };
const planPort = { label: '内容安排', valueType: 'json', schema: ws.object({}, [], true), required: true };
const localPlan = (label: string, inputs: NodeContract['inputs'], outputs: NodeContract['outputs']): NodeContract => ({ label: { zh: label, en: label }, description: label, category: '编辑安排', implementationRevision: 'editorial-plan-1', requirements: [], billing: 'none', cache: '文稿与计划版本', recovery: '可安全重试', inputs, outputs });
EDITING_NODE_CONTRACTS['edit.content-source'] = localPlan('准备内容安排', { document: ref('剪辑文档', 'document'), transcript: ref('原文', 'transcript'), settings: planPort, analysis: { ...ref('素材分析', 'visual-analysis'), schema: ws.nullable(artifactRefSchema('visual-analysis')) } }, { value: planPort });
EDITING_NODE_CONTRACTS['edit.content-plan'] = localPlan('核对内容安排', { source: planPort, proposal: planPort }, { value: planPort });
EDITING_NODE_CONTRACTS['edit.framing-plan'] = localPlan('规划画面区域', { value: planPort, document: ref('剪辑文档', 'document'), options: { ...planPort, schema: captionStyleSchema }, arrange: { label: '人物分屏', valueType: 'boolean', schema: { type: 'boolean' }, required: true } }, { plan: ref('构图安排', 'edit-plan'), value: planPort, document: ref('画幅文档', 'document') });
EDITING_NODE_CONTRACTS['edit.broll-cues'] = localPlan('准备 B-roll 片段', { plan: ref('构图安排', 'edit-plan') }, { transcript: ref('选中片段', 'transcript'), durationSec: { label: '时长', valueType: 'number', schema: ws.number(), required: true } });
EDITING_NODE_CONTRACTS['edit.broll-filter'] = localPlan('核对 B-roll 时间', { plan: ref('构图安排', 'edit-plan'), value: planPort }, { value: planPort });
for (const id of ['graphics.generate', 'camera.motion', 'layout.auto', 'overlays.auto', 'audio.effects', 'audio.music']) {
  EDITING_NODE_CONTRACTS[id].inputs.plan = { ...ref('共享构图安排', 'edit-plan'), schema: ws.nullable(artifactRefSchema('edit-plan')), required: false };
  EDITING_NODE_CONTRACTS[id].implementationRevision = 'editorial-consumer-1';
}
EDITING_NODE_CONTRACTS['edit.framing-plan'].implementationRevision = 'editorial-framing-2';
export const EDITING_WORKFLOW_CAPABILITIES: WorkflowCapability[] = Object.entries(EDITING_NODE_CONTRACTS).map(([id, meta]) => ({ id, version: 1, label: meta.label, inputs: meta.inputs, outputs: meta.outputs, requirements: meta.requirements, environments: ['browser'], available: true, effect: meta.billing === 'server' ? 'generate' : 'edit', retry: meta.billing === 'server' ? 'reconcile-first' : 'safe' }));
