import { describe, expect, it } from 'vitest';
import {
  compositionToEditorDocument,
  projectDocumentToComposition,
  type Block,
  type Composition,
} from '@pireel/studio-engine/composition';
import { ELEMENT_TEMPLATES } from './gen-templates';
import { artDirectedTemplateElement } from './gen-templates/element-presets';
import { ART_DIRECTED_PRESET_VERSION } from './gen-templates/element-presets/shared';
import { migrateOfficialComponentPayloads } from './official-component-migration';

const legacyBlock = (): Block => ({
  id: 'legacy_num',
  templateId: 'custom',
  slots: {
    presetId: 'pe_num',
    innerHtml: '<div class="artboard"><div data-edit="label">My pulse</div><div data-edit="number">+99%</div></div><style>#legacy_num .artboard{width:120px;height:67.5px;transform:scale(16)}</style><style data-hf-baked>#legacy_num{--fg:#111}</style>',
    timelineBody: 'old timeline',
  },
  startSec: 0,
  durationSec: 3,
  trackIndex: 2,
  box: { x: 0.02, y: 0.02, w: 0.96, h: 0.96 },
  label: '大数字',
});

const compositionWith = (block: Block): Composition => ({
  width: 1920,
  height: 1080,
  theme: 'general',
  video: null,
  blocks: [block],
  shots: [],
});

describe('官方彩色组件载荷迁移', () => {
  it('旧快照一次性升级，保留公开文字和冻结变量，并收敛旧默认尺寸', () => {
    const composition = compositionWith(legacyBlock());
    const document = compositionToEditorDocument({ projectId: 'migration', composition }).document;
    const result = migrateOfficialComponentPayloads(document, composition);
    const block = result.composition.blocks[0]!;
    const slots = block.slots as { innerHtml: string; presetVersion: number };

    expect(result.migratedBlockIds).toEqual(['legacy_num']);
    expect(slots.presetVersion).toBe(ART_DIRECTED_PRESET_VERSION);
    expect(slots.innerHtml).toContain('data-pireel-art-preset="5"');
    expect(slots.innerHtml).toContain('>My pulse<');
    expect(slots.innerHtml).toContain('>+99%<');
    expect(slots.innerHtml).toContain('data-hf-baked');
    expect(slots.innerHtml).not.toContain('transform:scale(16)');
    expect(block.box?.w).toBeCloseTo(0.5376);
    expect(projectDocumentToComposition(result.document).blocks[0]?.slots).toEqual(block.slots);
  });

  it('v2 快照升级布局但保留用户文字和已调整尺寸', () => {
    const template = ELEMENT_TEMPLATES.find((item) => item.id === 'el-comparison')!;
    const current = artDirectedTemplateElement(template, '左右对比')!;
    const v2Html = current.innerHtml
      .replace('data-pireel-art-preset="5"', 'data-pireel-art-preset="2"')
      .replace('grid-template-columns:repeat(2,minmax(0,1fr))', 'display:flex')
      .replace('>PLAN A<', '>CUSTOM A<');
    const block: Block = {
      ...legacyBlock(),
      id: 'comparison_v2',
      label: '左右对比',
      slots: {
        presetId: current.presetId,
        presetVersion: 2,
        innerHtml: v2Html.replaceAll(current.seedId, 'comparison_v2'),
        timelineBody: current.timelineBody.replaceAll(current.seedId, 'comparison_v2'),
      },
      box: { x: 0.18, y: 0.22, w: 0.42, h: 0.24 },
    };
    const composition = compositionWith(block);
    const document = compositionToEditorDocument({ projectId: 'v2', composition }).document;
    const result = migrateOfficialComponentPayloads(document, composition);
    const migrated = result.composition.blocks[0]!;
    const slots = migrated.slots as { innerHtml: string; presetVersion: number };

    expect(result.migratedBlockIds).toEqual(['comparison_v2']);
    expect(slots.presetVersion).toBe(ART_DIRECTED_PRESET_VERSION);
    expect(slots.innerHtml).toContain('>CUSTOM A<');
    expect(slots.innerHtml).toContain('grid-template-columns:repeat(2,minmax(0,1fr))');
    expect(slots.innerHtml).toContain('left:calc(50% - 10px);top:calc(50% - 10px)');
    expect(migrated.box).toEqual(block.box);
  });

  it('当前版本不进入迁移路径，也不会覆盖用户调整过的尺寸', () => {
    const template = ELEMENT_TEMPLATES.find((item) => item.id === 'el-big-number')!;
    const current = artDirectedTemplateElement(template, '大数字')!;
    const block: Block = {
      ...legacyBlock(),
      slots: {
        presetId: current.presetId,
        presetVersion: current.presetVersion,
        innerHtml: current.innerHtml.replaceAll(current.seedId, 'legacy_num'),
        timelineBody: current.timelineBody.replaceAll(current.seedId, 'legacy_num'),
      },
      box: { x: 0.2, y: 0.25, w: 0.4, h: 0.3 },
    };
    const composition = compositionWith(block);
    const document = compositionToEditorDocument({ projectId: 'current', composition }).document;
    const result = migrateOfficialComponentPayloads(document, composition);

    expect(result.migratedBlockIds).toEqual([]);
    expect(result.document).toBe(document);
    expect(result.composition).toBe(composition);
  });
});
