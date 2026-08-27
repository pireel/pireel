import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { titleBlock } from '@pireel/studio-engine/composition';
import { DisplayTextPanel } from './display-text-panel';
import { setStudioLocale } from './i18n';

describe('DisplayTextPanel', () => {
  it('shows all visual presets as creation entries before a text clip is selected', () => {
    setStudioLocale('zh');
    const html = renderToStaticMarkup(createElement(DisplayTextPanel, {
      block: null,
      onAdd: () => {},
      onPatch: () => {},
      onPreset: () => {},
    }));
    expect(html).toContain('添加一段文字');
    for (const label of ['清爽白字', '杂志衬线', '强力标题', '描边大字', '荧光标记', '编辑标签']) {
      expect(html).toContain(label);
    }
  });

  it('renders the selected native text content, preset and animation controls', () => {
    setStudioLocale('zh');
    const block = titleBlock({
      text: '普通人的奥德赛',
      startSec: 2,
      durationSec: 3,
      preset: 'outline',
      animation: 'typewriter',
      fontFamily: 'sans',
      align: 'right',
    });
    const html = renderToStaticMarkup(createElement(DisplayTextPanel, {
      block,
      onAdd: () => {},
      onPatch: () => {},
      onPreset: () => {},
    }));
    expect(html).toContain('普通人的奥德赛');
    expect(html).not.toContain('副标题（可选）');
    expect(html).toContain('data-block-selection-keep="true"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="文字色 #FFFFFF" aria-pressed="true"');
    expect(html).toContain('role="option" aria-selected="true"');
    expect(html).toContain('现代黑体');
    expect(html).toContain('PingFang SC');
    expect(html).toContain('加载更多字体');
    expect(html).toContain('<option value="typewriter" selected="">打字机</option>');
    expect(html).not.toContain('aria-label="强调色 #FFFFFF"');
    expect(html).toContain('aria-label="右对齐" aria-pressed="true"');
    expect(html.match(/border-line/g)).toHaveLength(1);
  });

  it('shows accent colors only when the selected style or animation uses them', () => {
    setStudioLocale('zh');
    const marker = titleBlock({
      text: '高亮文字', startSec: 0, durationSec: 2,
      preset: 'marker', animation: 'highlightPop',
    });
    const html = renderToStaticMarkup(createElement(DisplayTextPanel, {
      block: marker,
      onAdd: () => {},
      onPatch: () => {},
      onPreset: () => {},
    }));
    expect(html).toContain('aria-label="文字色 #FFFFFF"');
    expect(html).toContain('aria-label="强调色 #FFFFFF"');
  });
});
