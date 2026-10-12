import { CAPTIONS_ZH } from './zh/captions';
import { CHATGEN_ZH } from './zh/chat-gen';
import { COMMON_ZH } from './zh/common';
import { PANELS_ZH } from './zh/panels';
import { PRESETS_ZH } from './zh/presets';
import { SHELL_ZH } from './zh/shell';
import { WORKBENCH_ZH } from './zh/workbench';

export const UI_ZH: Record<string, string> = { ...CAPTIONS_ZH, ...CHATGEN_ZH, ...COMMON_ZH, ...PANELS_ZH, ...PRESETS_ZH, ...SHELL_ZH, ...WORKBENCH_ZH, 'editingSkills.cover.name': '封面', 'editingSkills.cover.short': '自动制作视频封面', 'editingSkills.cover.detail': '开启后按视频上下文和品牌自动准备完整提示词、选择参考帧并生成封面，无需再次确认。结果在独立封面场景中查看和应用。', 'tools.generate_cover.label': '制作封面' };
