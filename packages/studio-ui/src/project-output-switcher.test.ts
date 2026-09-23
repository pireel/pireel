import { describe, expect, it } from 'vitest';
import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProjectOutputSwitcher, projectOutputRevealScrollLeft, type ProjectOutputTab } from './project-output-switcher';

const outputs: ProjectOutputTab[] = [
  { id: 'portrait', title: 'Portrait', coverThumb: null, durationSec: 3, canvasWidth: 1080, canvasHeight: 1920 },
  { id: 'landscape', title: 'Landscape', coverThumb: null, durationSec: 4, canvasWidth: 1920, canvasHeight: 1080 },
  { id: 'custom', title: '', coverThumb: null, durationSec: 5, canvasWidth: 1000, canvasHeight: 667 },
];

const renderSwitcher = (overrides: Partial<ComponentProps<typeof ProjectOutputSwitcher>> = {}) => renderToStaticMarkup(createElement(ProjectOutputSwitcher, {
  outputs,
  activeId: 'portrait',
  label: 'Outputs',
  newLabel: 'New',
  deleteLabel: 'Delete',
  untitledLabel: 'Untitled',
  onSwitch: () => undefined,
  onCreate: () => undefined,
  onDelete: () => undefined,
  ...overrides,
}));

describe('timeline output navigation', () => {
  it('reveals off-screen tabs without changing an already visible tab’s scroll position', () => {
    const viewport = { left: 100, right: 400 };
    expect(projectOutputRevealScrollLeft(80, viewport, { left: 140, right: 240 })).toBe(80);
    expect(projectOutputRevealScrollLeft(80, viewport, { left: 60, right: 160 })).toBe(40);
    expect(projectOutputRevealScrollLeft(80, viewport, { left: 360, right: 460 })).toBe(140);
    expect(projectOutputRevealScrollLeft(10, viewport, { left: 60, right: 160 })).toBe(0);
  });

  it('exposes named tabs with one selected keyboard entry point', () => {
    const markup = renderSwitcher();
    expect(markup).toContain('aria-orientation="horizontal"');
    expect(markup).toContain('>Portrait</button>');
    expect(markup).toContain('>Landscape</button>');
    expect(markup).toContain('>Untitled 3</button>');
    expect(markup.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(markup.match(/tabindex="0"/g)).toHaveLength(1);
    expect(markup).not.toContain('<img');
  });

  it('disables switching, creating and deleting while the agent owns the edit', () => {
    const markup = renderSwitcher({ locked: true, lockedHint: 'Editing in progress' });
    expect(markup.match(/disabled=""/g)).toHaveLength(outputs.length * 2 + 1);
    expect(markup).toContain('title="Editing in progress"');
  });

  it('keeps the last output safe from deletion', () => {
    expect(renderSwitcher({ outputs: outputs.slice(0, 1) })).not.toContain('data-output-delete');
  });
});
