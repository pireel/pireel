import { CAPTION_PRESETS } from './caption-presets';
import { workflowInput as input, workflowLiteral as literal, type WorkflowCapability, type WorkflowDefinition, type WorkflowParameter, type WorkflowStep } from './workflow';

const label = (zh: string, en: string) => ({ zh, en });
export const STUDIO_WORKFLOW_CAPABILITIES: readonly WorkflowCapability[] = [
  { id: 'output.duplicate', version: 1, label: label('创建独立版本', 'Create a separate version'), requirements: ['project-document'], environments: ['browser', 'desktop', 'cloud'], effect: 'edit', retry: 'reconcile-first', available: true },
  { id: 'transcript.ensure', version: 1, label: label('读取或生成转写', 'Read or generate transcript'), requirements: ['project-document'], environments: ['browser', 'desktop', 'cloud'], effect: 'generate', retry: 'reconcile-first', available: true },
  { id: 'speech.tighten-pauses', version: 1, label: label('精简无声停顿', 'Tighten silent pauses'), requirements: ['project-document', 'media-bytes', 'audio-decoder'], environments: ['browser', 'desktop'], effect: 'edit', retry: 'reconcile-first', available: true },
  { id: 'captions.style', version: 1, label: label('应用字幕样式', 'Apply caption style'), requirements: ['project-document', 'transcript-index'], environments: ['browser', 'desktop', 'cloud'], effect: 'edit', retry: 'safe', available: true },
  { id: 'captions.emphasize', version: 1, label: label('选择字幕重点词', 'Select caption emphasis'), requirements: ['transcript-index', 'language-model'], environments: ['browser', 'desktop', 'cloud'], effect: 'generate', retry: 'reconcile-first', available: true },
  { id: 'canvas.resize', version: 1, label: label('调整画幅', 'Resize canvas'), requirements: ['project-document'], environments: ['browser', 'desktop', 'cloud'], effect: 'edit', retry: 'safe', available: true },
  { id: 'media.search-transcript', version: 1, label: label('搜索已转写的片段', 'Search transcribed moments'), requirements: ['project-document', 'transcript-index'], environments: ['browser', 'desktop', 'cloud'], effect: 'read', retry: 'safe', available: true },
  // Contracts for future adapters. Registering a contract does NOT advertise an installed executor.
  { id: 'media.index-visual', version: 1, label: label('建立本地画面索引', 'Index local video frames'), requirements: ['media-bytes', 'video-decoder', 'local-vision-model'], environments: ['browser', 'desktop'], effect: 'generate', retry: 'safe', available: false },
  { id: 'media.watch-folder', version: 1, label: label('监听本地素材文件夹', 'Watch a local media folder'), requirements: ['folder-access'], environments: ['desktop'], effect: 'read', retry: 'safe', available: false },
  { id: 'audio.denoise', version: 1, label: label('处理本地人声', 'Process local speech'), requirements: ['media-bytes', 'audio-decoder'], environments: ['browser', 'desktop'], effect: 'generate', retry: 'reconcile-first', available: false },
  { id: 'video.render', version: 1, label: label('合成成片', 'Render video'), requirements: ['project-document', 'media-bytes', 'render-engine'], environments: ['browser', 'desktop', 'cloud'], effect: 'generate', retry: 'reconcile-first', available: false },
  { id: 'social.publish', version: 1, label: label('发布到自媒体账号', 'Publish to a social account'), requirements: ['social-connection'], environments: ['desktop', 'cloud'], effect: 'publish', retry: 'reconcile-first', available: false },
];

export interface StudioWorkflowTemplate {
  id: string;
  title: { zh: string; en: string };
  description: { zh: string; en: string };
  detail: { zh: string; en: string };
  art: 'pause-cleanup' | 'captions' | 'frame-video' | 'search';
  definition: WorkflowDefinition;
}
const boolean = (zh: string, en: string, value: boolean): WorkflowParameter => ({ type: 'boolean', label: label(zh, en), default: value });
const captionStyle: WorkflowParameter = {
  type: 'string', label: label('字幕样式', 'Caption style'), default: CAPTION_PRESETS[0].id,
  options: CAPTION_PRESETS.map((preset) => ({ value: preset.id, label: label(preset.name, preset.name) })),
};
const duplicate: WorkflowStep = { id: 'version', capability: 'output.duplicate', version: 1, dependsOn: [], arguments: {} };
const transcript = (dependsOn: string[], enabledBy?: string): WorkflowStep => ({ id: 'transcript', capability: 'transcript.ensure', version: 1, dependsOn, arguments: {}, ...(enabledBy ? { enabledBy } : {}) });
const captions = (dependsOn: string[], enabledBy?: string): WorkflowStep => ({ id: 'captions', capability: 'captions.style', version: 1, dependsOn, arguments: { preset: input('captionStyle'), on: literal(true) }, ...(enabledBy ? { enabledBy } : {}) });
const definition = (id: string, title: string, parameters: Record<string, WorkflowParameter>, steps: WorkflowStep[]): WorkflowDefinition => ({
  schemaVersion: 1, id: 'studio.' + id, version: 1, templateId: id, title, parameters, steps, trigger: { kind: 'manual' },
});

export const STUDIO_WORKFLOW_TEMPLATES: readonly StudioWorkflowTemplate[] = [
  {
    id: 'pause-cleanup', art: 'pause-cleanup', title: label('精简口播停顿', 'Tighten pauses'),
    description: label('保留自然呼吸，让讲话更紧凑。', 'Keep the breathing room. Lose the dead air.'),
    detail: label('分析原声并压缩无声停顿。不会自动删除口误、重录或有意义的句子。', 'Analyze source audio and shorten silent pauses. Spoken mistakes, retakes and meaningful sentences are not automatically removed.'),
    definition: definition('pause-cleanup', 'Tighten pauses', {
      minimumPauseSec: { type: 'number', label: label('处理超过多少秒的停顿', 'Minimum pause in seconds'), default: 0.7, min: 0.25, max: 3 },
      speechPaddingSec: { type: 'number', label: label('语音两侧保留时长（秒）', 'Breathing room per edge in seconds'), default: 0.15, min: 0, max: 0.5 },
      addCaptions: boolean('同时添加字幕', 'Add captions', false), captionStyle,
    }, [duplicate, { id: 'pauses', capability: 'speech.tighten-pauses', version: 1, dependsOn: ['version'], arguments: { minimumPauseSec: input('minimumPauseSec'), speechPaddingSec: input('speechPaddingSec') } }, transcript(['pauses'], 'addCaptions'), captions(['transcript'], 'addCaptions')]),
  },
  {
    id: 'captions', art: 'captions', title: label('AI 字幕', 'AI captions'),
    description: label('识别讲话，套用喜欢的字幕样式。', 'Turn spoken words into styled captions.'),
    detail: label('优先复用已有转写，缺少时再识别。所有字幕仍可在编辑器中修改。', 'Reuse existing transcripts or transcribe when missing. Every caption stays editable in Studio.'),
    definition: { ...definition('captions', 'Captioned video', {
      captionStyle,
      shortenPauses: boolean('AI 去停顿', 'Shorten pauses', false),
      highlightKeywords: boolean('突出重点词', 'Emphasize key phrases', false),
    }, [duplicate, {
      id: 'pauses', capability: 'speech.tighten-pauses', version: 1, dependsOn: ['version'], enabledBy: 'shortenPauses',
      arguments: { minimumPauseSec: literal(0.7), speechPaddingSec: literal(0.15) },
    }, transcript(['pauses']), captions(['transcript']), { id: 'emphasis', capability: 'captions.emphasize', version: 1, dependsOn: ['captions'], enabledBy: 'highlightKeywords', arguments: {} }]), version: 3 },
  },
  {
    id: 'talking-head', art: 'pause-cleanup', title: label('口播精剪', 'Polish a talking-head video'),
    description: label('把录好的口播，整理成节奏顺畅、字幕清晰的视频。', 'Turn your recording into a fluent, captioned video.'),
    detail: label('整理长停顿、生成字幕与重点词，保留完整观点和可编辑素材。', 'Shorten pauses and add editable captions and key phrases while keeping your message intact.'),
    definition: definition('talking-head', 'Polished talking-head video', {
      captionStyle,
      minimumPauseSec: { type: 'number', label: label('停顿门槛', 'Pause threshold'), default: 0.7, min: 0.25, max: 3 },
      speechPaddingSec: { type: 'number', label: label('语音留白', 'Speech padding'), default: 0.15, min: 0, max: 0.5 },
      highlightKeywords: boolean('突出重点词', 'Emphasize key phrases', false),
    }, [duplicate, { id: 'pauses', capability: 'speech.tighten-pauses', version: 1, dependsOn: ['version'], arguments: { minimumPauseSec: input('minimumPauseSec'), speechPaddingSec: input('speechPaddingSec') } }, transcript(['pauses']), captions(['transcript']), { id: 'emphasis', capability: 'captions.emphasize', version: 1, dependsOn: ['captions'], enabledBy: 'highlightKeywords', arguments: {} }]),
  },
  {
    id: 'frame-video', art: 'frame-video', title: label('适配视频画幅', 'Fit another format'),
    description: label('把现有作品适配为竖屏、横屏或方形。', 'Make a portrait, landscape or square version.'),
    detail: label('生成新的画幅版本，保留可编辑内容。不会自动追踪人物或重新剪辑，完成后请检查构图。', 'Create a separate canvas version while keeping every layer editable. This changes format, not subject tracking or editorial cuts. Review the framing afterward.'),
    definition: definition('frame-video', 'Fit another format', {
      ratio: { type: 'string', label: label('目标画幅', 'Output format'), default: 'portrait', options: [
        { value: 'portrait', label: label('竖屏 9:16', 'Portrait 9:16') },
        { value: 'landscape', label: label('横屏 16:9', 'Landscape 16:9') },
        { value: 'square', label: label('方形 1:1', 'Square 1:1') },
      ] },
    }, [duplicate, { id: 'format', capability: 'canvas.resize', version: 1, dependsOn: ['version'], arguments: { preset: input('ratio') } }]),
  },
  {
    id: 'search', art: 'search', title: label('搜索口播片段', 'Find spoken moments'),
    description: label('在当前作品的已有转写中查找关键词。', 'Find keywords in this output’s existing transcript.'),
    detail: label('只搜索已转写的内容，不扫描未建立索引的本地视频画面，也不修改作品。', 'Search indexed speech without editing the output. Unindexed local video frames are not scanned.'),
    definition: definition('search', 'Find spoken moments', {
      query: { type: 'string', label: label('想找什么内容', 'What are you looking for?'), default: '', maxLength: 200 },
    }, [{ id: 'search', capability: 'media.search-transcript', version: 1, dependsOn: [], arguments: { query: input('query'), scope: literal('narrative'), limit: literal(12) } }]),
  },
];

export function workflowTemplate(id: string): StudioWorkflowTemplate | undefined {
  return STUDIO_WORKFLOW_TEMPLATES.find((template) => template.id === id);
}
