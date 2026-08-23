import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ExportRecommendations } from '@pireel/studio-engine/export-options';
import {
  AdaptiveExportPicker,
  adaptiveExportSelection,
} from './chat-export-card';

const recommendations: ExportRecommendations = {
  canvas: { width: 1080, height: 1920, orientation: 'portrait' },
  source: { shortSide: 1080, longSide: 1920 },
  defaultId: 'source',
  options: [{
    id: 'source',
    platform: 'Source quality',
    resolution: 1080,
    fps: 30,
    format: 'mp4',
    note: 'adaptive',
  }],
};

describe('adaptive export card', () => {
  it('uses the source recommendation unless the user explicitly supplied a spec', () => {
    expect(adaptiveExportSelection(recommendations)).toEqual({
      resolution: 1080,
      fps: 30,
      format: 'mp4',
    });
    expect(adaptiveExportSelection(recommendations, { resolution: 2160 })).toEqual({
      resolution: 2160,
      fps: 30,
      format: 'mp4',
    });
  });

  it('renders one export action instead of resolution, fps, and format choices', () => {
    const html = renderToStaticMarkup(createElement(AdaptiveExportPicker, {
      selection: adaptiveExportSelection(recommendations),
      ready: true,
    }));
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain('1080p · 30fps · MP4');
    expect(html).not.toContain('720p');
    expect(html).not.toContain('4K');
  });
});
