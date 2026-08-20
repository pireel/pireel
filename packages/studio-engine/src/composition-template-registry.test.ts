import { describe, expect, it } from 'vitest';
import { blockKind, getTemplate, renderBlock } from './composition';

describe('composition public entry template registry', () => {
  it('registers the fallback template before semantic helpers run', () => {
    const block = {
      id: 'legacy-custom',
      templateId: 'custom',
      slots: { innerHtml: '<strong>ready</strong>', timelineBody: '' },
      startSec: 0,
      durationSec: 1,
      trackIndex: 1,
    };

    expect(getTemplate('custom')).toBeDefined();
    expect(blockKind(block)).toBe('custom');
    expect(renderBlock(block).innerHtml).toContain('ready');
  });
});
