import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Block } from '@pireel/studio-engine/composition';
import { componentSchemaOf } from '@pireel/studio-engine/component-schema';
import { blockPropSpecs, liveMessageFor, nextPropsSlots } from './component-props-ui';
import { ComponentPropsPanel } from './component-props-panel';
import { setStudioLocale } from './i18n';

const manifest = JSON.stringify({
  accent: { type: 'string', format: 'color', title: '强调色', default: '#ff5a36' },
  value: { type: 'number', title: '数值', default: 72, minimum: 0, maximum: 100, multipleOf: 1 },
  badge: { type: 'boolean', title: '角标', default: true },
  layout: { type: 'string', title: '布局', default: 'row', enum: ['row', 'column'] },
});
const innerHtml = `<div data-props='${manifest}'><style>#c1 .k{color:var(--p-accent);width:calc(var(--p-value)*1%)} #c1[data-p-badge="false"] .b{display:none} #c1[data-p-layout="column"] .w{flex-direction:column}</style><i class="k" data-edit="k">十个以上的可见文字内容</i><img src="a.png" alt="A"></div>`;
const block: Block = { id: 'c1', templateId: 'custom', slots: { innerHtml, timelineBody: '', authoredDurationSec: 3 }, startSec: 0, durationSec: 3, trackIndex: 1 };
const noop = () => {};
const panel = (b: Block) => renderToStaticMarkup(createElement(ComponentPropsPanel, { block: b, canvas: { width: 1080, height: 1920 }, swatches: [{ label: 'White', value: '#ffffff' }], onBlockPatch: noop, onValues: noop, onLive: noop, onText: noop, onReplaceImage: noop, onRemoveImage: noop }));

describe('editable properties on the UI side', () => {
  it('reads the manifest only from bespoke components', () => {
    expect(blockPropSpecs(block).map((s) => s.key)).toEqual(['accent', 'value', 'badge', 'layout']);
    expect(blockPropSpecs({ templateId: 'kit:metric', slots: { props: { x: 1 } } })).toEqual([]);
  });

  it('commits through the unified contract: bespoke overrides pruned, kit props parsed whole', () => {
    expect(nextPropsSlots(block, { accent: '#000000', value: 72, badge: true, layout: 'row', ghost: 1 })).toEqual({ innerHtml, timelineBody: '', authoredDurationSec: 3, props: { accent: '#000000' } });
    const tuned = { ...block, slots: { ...block.slots, props: { accent: '#000000' } } };
    expect(nextPropsSlots(tuned, { accent: '#ff5a36' })).toEqual({ innerHtml, timelineBody: '', authoredDurationSec: 3 });
    const kit: Block = { id: 'k1', templateId: 'kit:steps', slots: { props: { variant: 'pipeline' } }, startSec: 0, durationSec: 4, trackIndex: 2 };
    const next = nextPropsSlots(kit, { variant: 'timeline' }) as { props: Record<string, unknown> };
    expect(next.props.variant).toBe('timeline');
    expect(Array.isArray(next.props.items)).toBe(true); // the component's parse filled the rest
  });

  it('formats the live message like the assembler, for bespoke components only', () => {
    expect(liveMessageFor(block, { accent: '#ff5a36', value: 250, badge: true, layout: 'column' })).toEqual({
      vars: { '--p-accent': '#ff5a36', '--p-value': '100' },
      attrs: { 'data-p-accent': '#ff5a36', 'data-p-value': '100', 'data-p-badge': 'true', 'data-p-layout': 'column' },
    });
    expect(liveMessageFor({ templateId: 'kit:steps', slots: {} }, {})).toBeNull();
  });

  it('renders the same form for both kinds, plus text and image slots for bespoke markup', () => {
    setStudioLocale('zh');
    const html = panel(block);
    // Position, size and rotation live on the preview (drag the box), not the panel.
    for (const label of ['强调色', '数值', '角标', '布局', '内容', '样式', '底板', '动效', '图片', '恢复默认', '不透明度']) expect(html).toContain(label);
    // Placement and timing are edited on the canvas and timeline, not in the panel.
    for (const label of ['>位置<', '>时间<']) expect(html).not.toContain(label);
    expect(html).toContain('type="range"');
    expect(html).toContain('role="switch"');
    expect(html.toLowerCase()).toContain('>#ff5a36<'); // a colour is one row showing its value; the picker opens on demand
    expect(html).toContain('>Column<'); // option ids read as words
    expect(html).toContain('data-block-selection-keep');
    const kit: Block = { id: 'k1', templateId: 'kit:steps', slots: { props: { variant: 'pipeline', items: [{ text: '第一步', note: '' }, { text: '第二步', note: '备注' }] } }, startSec: 0, durationSec: 4, trackIndex: 2 };
    const kitHtml = panel(kit);
    for (const s of ['>列表<', '>流程<', '>时间线<', 'value="第一步"', 'value="备注"', '添加一行']) expect(kitHtml).toContain(s);
    // Every registered component draws the same sections, in the same order, with the shared style.
    const order = ['版式', '内容', '样式', '底板', '动效'].map((label) => kitHtml.indexOf(`>${label}<`));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const label of ['文字颜色', '字体', '字号', '动画速度', '恢复默认样式']) expect(kitHtml).toContain(label);
    // A checklist's marks belong to its items: each row has a mark toggle and a drag handle, and the
    // retired list-wide choice is not offered.
    const list: Block = { id: 'c1', templateId: 'kit:checklist', slots: { props: { items: [{ text: '要做', mark: 'check' }, { text: '别做', mark: 'cross' }] } }, startSec: 0, durationSec: 4, trackIndex: 2 };
    const listHtml = panel(list);
    expect(listHtml).toContain('aria-label="打勾"');
    expect(listHtml).toContain('aria-label="划掉"');
    expect(listHtml).toContain('draggable="true"');
    expect(listHtml).not.toContain('>版式<');
    // Code offers what a person changes on an editor window: a colour scheme and type size — no
    // separate colours, no panel section — and only the fields its current layout uses.
    const code = (variant: string): Block => ({ id: 'cd', templateId: 'kit:code', slots: { props: { variant, code: 'const a = 1;', codeTheme: 'night' } }, startSec: 0, durationSec: 4, trackIndex: 2 });
    const highlight = panel(code('highlight'));
    for (const s of ['代码主题', '暗色', '浅色', '高对比', '字号', '高亮行']) expect(highlight).toContain(s);
    for (const s of ['>底板<', '强调色', '文字颜色', '改动前', '节奏']) expect(highlight).not.toContain(s);
    const diff = panel(code('diff'));
    for (const s of ['改动前', '改动后']) expect(diff).toContain(s);
    expect(diff).not.toContain('高亮行');
    expect(componentSchemaOf(kit)?.source).toBe('kit');
    expect(componentSchemaOf(block)?.source).toBe('manifest');
  });
});
