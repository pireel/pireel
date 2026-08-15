import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ProjectOutputSwitcher,
  projectOutputRevealScrollTop,
  projectOutputThumbGeometry,
  type ProjectOutputTab,
} from './project-output-switcher';

const outputs: ProjectOutputTab[] = [
  { id: 'portrait', title: 'Portrait', coverThumb: null, durationSec: 3, canvasWidth: 1080, canvasHeight: 1920 },
  { id: 'landscape', title: 'Landscape', coverThumb: null, durationSec: 4, canvasWidth: 1920, canvasHeight: 1080 },
  { id: 'custom', title: 'Custom', coverThumb: null, durationSec: 5, canvasWidth: 1000, canvasHeight: 667 },
];

const renderSwitcher = () => renderToStaticMarkup(createElement(ProjectOutputSwitcher, {
  outputs,
  activeId: 'portrait',
  label: 'Outputs',
  newLabel: 'New',
  deleteLabel: 'Delete',
  untitledLabel: 'Untitled',
  onSwitch: () => undefined,
  onCreate: () => undefined,
  onDelete: () => undefined,
}));

describe('projectOutputThumbGeometry', () => {
  it('keeps portrait, square, and landscape output cards at their own canvas ratios', () => {
    expect(projectOutputThumbGeometry({ canvasWidth: 1080, canvasHeight: 1920 })).toEqual({
      cssAspectRatio: '1080 / 1920',
      cardWidth: 67.5,
    });
    expect(projectOutputThumbGeometry({ canvasWidth: 1080, canvasHeight: 1080 })).toEqual({
      cssAspectRatio: '1080 / 1080',
      cardWidth: 120,
    });
    expect(projectOutputThumbGeometry({ canvasWidth: 1920, canvasHeight: 1080 })).toEqual({
      cssAspectRatio: '1920 / 1080',
      cardWidth: 144,
    });
  });

  it('keeps custom ratios bounded and falls back safely for invalid legacy values', () => {
    const custom = projectOutputThumbGeometry({ canvasWidth: 1000, canvasHeight: 667 });
    expect(custom.cssAspectRatio).toBe('1000 / 667');
    expect(custom.cardWidth).toBe(144);
    expect(projectOutputThumbGeometry({ canvasWidth: 0, canvasHeight: Number.NaN })).toEqual({
      cssAspectRatio: '16 / 9',
      cardWidth: 144,
    });
  });

  it('reveals an output by changing only the rail list scroll position', () => {
    const viewport = { top: 100, bottom: 400 };
    expect(projectOutputRevealScrollTop(80, viewport, { top: 140, bottom: 240 })).toBe(80);
    expect(projectOutputRevealScrollTop(80, viewport, { top: 60, bottom: 160 })).toBe(40);
    expect(projectOutputRevealScrollTop(80, viewport, { top: 360, bottom: 460 })).toBe(140);
  });

  it('applies each output ratio in the vertical rail', () => {
    const markup = renderSwitcher();
    expect(markup).toContain('aspect-ratio:1080 / 1920');
    expect(markup).toContain('aspect-ratio:1920 / 1080');
    expect(markup).toContain('aspect-ratio:1000 / 667');
    expect(markup).not.toContain('aspect-video');
  });

  it('places the add action after the output cards without a list header', () => {
    const markup = renderSwitcher();
    const asideOpen = markup.slice(0, markup.indexOf('>') + 1);
    expect(asideOpen).toContain('bg-canvas');
    expect(asideOpen).not.toContain('border-');
    expect(asideOpen).not.toContain('rounded-');
    expect(asideOpen).not.toContain('shadow-lg');
    expect(asideOpen).not.toContain('backdrop-blur-md');
    expect(markup).toContain('data-output-list="true"');
    expect(markup).toContain('aria-orientation="vertical"');
    expect(markup).toContain('data-output-create-card="true"');
    expect(markup.indexOf('data-output-create-card="true"')).toBeGreaterThan(markup.lastIndexOf('role="tab"'));
    expect(markup).not.toContain('aria-pressed');
    expect(markup).not.toContain('aria-expanded');
  });

  it('renders canvas-style navigation rows with a separate index and selected row', () => {
    const markup = renderSwitcher();
    expect(markup.match(/data-output-nav-item="true"/g)).toHaveLength(outputs.length);
    expect(markup.match(/data-output-index="true"/g)).toHaveLength(outputs.length);
    expect(markup.match(/data-output-thumb="true"/g)).toHaveLength(outputs.length);
    expect(markup.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(markup).toContain('bg-panel-2 text-ink');
    expect(markup).toContain('>01<');
    expect(markup).toContain('>02<');
    expect(markup).toContain('>03<');
    expect(markup).not.toContain('data-output-meta');
    expect(markup.match(/data-output-duration="true"/g)).toHaveLength(outputs.length);
  });

  it('reveals the delete action on row hover without restoring a title row', () => {
    const markup = renderSwitcher();
    const deleteStart = markup.indexOf('data-output-delete="true"');
    const deleteTag = markup.slice(deleteStart, markup.indexOf('>', deleteStart) + 1);
    expect(deleteTag).toContain('opacity-0');
    expect(deleteTag).toContain('group-hover:opacity-100');
    expect(deleteTag).toContain('text-red-500');
    expect(markup).not.toContain('data-output-meta');
  });

  it('does not expose batch-selection controls', () => {
    expect(renderSwitcher()).not.toContain('role="checkbox"');
    expect(renderSwitcher()).not.toContain('aria-checked');
  });
});
