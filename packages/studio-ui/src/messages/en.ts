import { CAPTIONS_EN } from './en/captions';
import { CHATGEN_EN } from './en/chat-gen';
import { COMMON_EN } from './en/common';
import { COMPONENTS_EN } from './en/components';
import { PANELS_EN } from './en/panels';
import { PRESETS_EN } from './en/presets';
import { SHELL_EN } from './en/shell';
import { WORKBENCH_EN } from './en/workbench';

export const UI_EN: Record<string, string> = { ...CAPTIONS_EN, ...CHATGEN_EN, ...COMMON_EN, ...COMPONENTS_EN, ...PANELS_EN, ...PRESETS_EN, ...SHELL_EN, ...WORKBENCH_EN, 'editingSkills.cover.name': 'Cover', 'editingSkills.cover.short': 'Create the video cover automatically', 'editingSkills.cover.detail': 'When enabled, prepare a complete prompt and reference frame from the video context and brand, then generate a cover in the independent cover scene without another confirmation. Review and apply it there.', 'tools.generate_cover.label': 'Create cover' };
