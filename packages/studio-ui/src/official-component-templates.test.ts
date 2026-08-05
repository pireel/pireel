import { describe, expect, it } from 'vitest';
import { ELEMENT_TEMPLATES } from './gen-templates';
import { artDirectedTemplateElement, artDirectedTemplateIds } from './gen-templates/element-presets';
import { officialComponentTemplateItem } from './official-component-templates';

describe('官方素材组件模板', () => {
  it('每张彩色模板都规范化为标准素材卡，卡片载荷就是最终插入载荷', () => {
    expect(new Set(artDirectedTemplateIds())).toEqual(new Set(ELEMENT_TEMPLATES.map((template) => template.id)));
    for (const template of ELEMENT_TEMPLATES) {
      const item = officialComponentTemplateItem(template, 'zh-CN');
      expect(item, `${template.id}: 缺少标准素材卡`).not.toBeNull();
      expect(item).toMatchObject({
        id: `template:${template.id}`,
        kind: 'element',
        origin: 'preset',
        category: template.category,
        deletable: false,
        prompt: template.promptI18n?.zh,
      });
      expect(item?.element).toEqual(artDirectedTemplateElement(template, item!.label));
      expect(item?.element?.previewFit).toBe('canvas');
      expect(item?.element?.insertFit).toBe('canvas');
      expect(item?.element?.insertScale).toBe(0.56);
      expect(item?.element?.presetVersion).toBe(5);
      expect(item?.element?.innerHtml).toContain('<style>');
      expect(item?.element?.innerHtml).toMatch(/#[0-9a-fA-F]{6}/);
      expect(item?.element?.innerHtml).toContain('data-edit=');
      expect(item?.element?.presetId).toBe(template.presetId);
      expect(item?.element?.timelineBody).toContain(`#${item?.element?.seedId}`);
    }
  });

  it('使用原卡片的 120×67.5 坐标系，并由 SVG 视口对齐预览、内容和选框', () => {
    const template = ELEMENT_TEMPLATES.find((item) => item.id === 'el-big-number')!;
    const element = artDirectedTemplateElement(template, '大数字')!;
    expect(element.innerHtml).toContain('width:120px;height:67.5px');
    expect(element.innerHtml).toContain('viewBox="0 0 120 67.5"');
    expect(element.innerHtml).toContain('class="artboard-frame"');
    expect(element.innerHtml).toContain('data-pireel-art-preset="5"');
    expect(element.innerHtml).not.toContain('transform:scale(16)');
    expect(element.innerHtml).toContain('right:4px;top:4px;width:42px;height:42px;border:7px');
    expect(element.innerHtml).toContain('font-size:26px');
    expect(element.innerHtml).not.toContain('font-family:Arial');
  });

  it('公开的文字属性都有长度边界，默认文案不会再与固定区域重叠', () => {
    for (const template of ELEMENT_TEMPLATES) {
      const element = artDirectedTemplateElement(template, template.id)!;
      const editableTags = element.innerHtml.match(/<[^>]+\bdata-edit="[^"]+"[^>]*>/g) ?? [];
      expect(editableTags.length, `${template.id}: 没有公开属性`).toBeGreaterThan(0);
      for (const tag of editableTags) expect(tag, `${template.id}: 属性缺少长度边界`).toContain('data-edit-max=');
    }

    const quote = artDirectedTemplateElement(ELEMENT_TEMPLATES.find((item) => item.id === 'el-quote')!, '金句')!;
    expect(quote.innerHtml).toContain('max-height:34px');
    expect(quote.innerHtml).not.toContain('left:-4px;top:-20px');

    const chapter = artDirectedTemplateElement(ELEMENT_TEMPLATES.find((item) => item.id === 'el-chapter')!, '章节页')!;
    expect(chapter.innerHtml).toContain('left:6px;bottom:4px');
    expect(chapter.innerHtml).not.toContain('left:-4px;bottom:-12px');
  });
});
