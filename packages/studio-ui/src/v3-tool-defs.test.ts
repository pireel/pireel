import { describe, expect, it } from 'vitest';
import { V3_TOOLS } from '@pireel/studio-engine/agent-surface-v3/registry';
import { STUDIO_TOOL_MAP } from '@pireel/studio-engine/prompts';
import { t } from './i18n';
import { studioToolDefFor } from './v3-tool-defs';

describe('v3 tool presentation', () => {
  it('renders every v3 tool with a definition, and every v3-only tool with a translated label', () => {
    const undefinedTools = V3_TOOLS.filter((tool) => !studioToolDefFor(tool.id)).map((tool) => tool.id);
    expect(undefinedTools).toEqual([]);
    const untranslated = V3_TOOLS
      .filter((tool) => !STUDIO_TOOL_MAP[tool.id])
      .map((tool) => studioToolDefFor(tool.id)!)
      .filter((def) => t(def.label) === def.label)
      .map((def) => def.id);
    expect(untranslated).toEqual([]);
  });
});
