import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const dependency = vi.hoisted(() => ({ initialized: false }));

vi.mock('lucide-react', async (importOriginal) => {
  const icons = await importOriginal<typeof import('lucide-react')>();
  return {
    ...icons,
    // Production chunks can cycle through the app entry before its icon is initialized.
    get Sparkles() { return dependency.initialized ? icons.Sparkles : undefined; },
  };
});

import * as icons from './icons';

dependency.initialized = true;

describe('shared icon wrappers', () => {
  it('reads a live icon binding at render time after cyclic chunk initialization', () => {
    const html = renderToStaticMarkup(createElement(icons.IconSparkle));
    expect(html).toContain('<svg');
    expect(html).toContain('lucide-sparkles');
    expect(html).toContain('width="16"');
    expect(html).toContain('stroke-width="1.6"');
  });

  it('renders every exported icon and preserves props and stroke defaults', () => {
    for (const Icon of Object.values(icons)) {
      const html = renderToStaticMarkup(createElement(Icon, {
        size: 24, strokeWidth: 3, className: 'test-icon', 'aria-label': 'Test icon',
      }));
      expect(html).toContain('width="24"');
      expect(html).toContain('stroke-width="3"');
      expect(html).toContain('test-icon');
      expect(html).toContain('aria-label="Test icon"');
    }
    expect(renderToStaticMarkup(createElement(icons.IconClose))).toContain('stroke-width="1.8"');
    expect(renderToStaticMarkup(createElement(icons.IconCheck))).toContain('stroke-width="2"');
  });
});
