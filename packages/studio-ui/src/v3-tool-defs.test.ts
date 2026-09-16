import { describe, expect, it } from 'vitest';
import { V3_TOOLS } from '@pireel/studio-engine/agent-surface-v3/registry';
import { t } from './i18n';
import { studioToolDefFor } from './v3-tool-defs';

describe('tool presentation', () => {
  it('renders every registered tool with a translated label', () => {
    const untranslated = V3_TOOLS
      .map((tool) => studioToolDefFor(tool.id))
      .filter((def) => t(def.label) === def.label)
      .map((def) => def.id);
    expect(untranslated).toEqual([]);
  });

  it('still renders a call from an earlier surface, labelled by its id', () => {
    expect(studioToolDefFor('get_timeline')).toMatchObject({ id: 'get_timeline', kind: 'badge', label: 'get_timeline' });
  });
});
