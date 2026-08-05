import { describe, expect, it } from 'vitest';
import { ELEMENT_TEMPLATES } from './gen-templates';
import { artDirectedTemplateElement } from './gen-templates/element-presets';
import { BOX_SELECTION_OUTSET_PX, boxSelectionRect } from './edit-overlays';

describe('画布选框和官方组件布局', () => {
  it('选框向元素四周外扩且保持中心不变', () => {
    const box = { x: 0.25, y: 0.2, w: 0.5, h: 0.4 };
    const rect = boxSelectionRect(box, 1000, 500);

    expect(rect).toEqual({ left: 244, top: 94, width: 512, height: 212 });
    expect(rect.left + rect.width / 2).toBe(box.x * 1000 + box.w * 1000 / 2);
    expect(rect.top + rect.height / 2).toBe(box.y * 500 + box.h * 500 / 2);
    expect(BOX_SELECTION_OUTSET_PX).toBe(6);
  });

  it('三个紧凑模板使用不会相互覆盖的确定性布局', () => {
    const element = (id: string) => artDirectedTemplateElement(
      ELEMENT_TEMPLATES.find((template) => template.id === id)!,
      id,
    )!.innerHtml;

    expect(element('el-comparison')).toContain('grid-template-columns:repeat(2,minmax(0,1fr))');
    expect(element('el-comparison')).toContain('left:calc(50% - 10px);top:calc(50% - 10px)');
    expect(element('el-comparison')).toContain('font-size:5px');
    expect(element('el-comparison')).not.toContain('transform:translate(-50%,-50%)');
    expect(element('el-bullet-list')).toContain('grid-template-rows:repeat(3,minmax(0,1fr))');
    expect(element('el-bullet-list')).toContain('top:22px;bottom:7px');
    expect(element('el-chapter')).toContain('left:58px;right:6px');
    expect(element('el-chapter')).toContain('max-height:22px;overflow:hidden;font-size:9px');
  });
});
