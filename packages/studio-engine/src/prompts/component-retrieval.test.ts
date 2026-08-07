import { describe, expect, it } from 'vitest';
import { components } from '@pireel/studio-kit';
import { assembleComposeBrief } from '../briefs';
import { MAX_COMPONENT_CANDIDATES, retrieveComponentCandidates } from './component-retrieval';
import { getPreset } from './presets';

describe('component query-time retrieval', () => {
  it('indexes every registered component without a second hand-maintained list', () => {
    expect(new Set(getPreset().components)).toEqual(new Set(Object.keys(components)));
  });

  it('finds structural component types in Chinese and English', () => {
    expect(retrieveComponentCandidates({ instruction: '做一张方案 A 和方案 B 的左右对比卡' })[0]).toBe('comparison');
    expect(retrieveComponentCandidates({ instruction: 'Show a bar chart ranking the top products' })[0]).toBe('chart');
    expect(retrieveComponentCandidates({ instruction: '展示三个步骤的流程和时间轴' })[0]).toBe('steps');
    expect(retrieveComponentCandidates({ instruction: '突出显示转化率 47%' })).toContain('metric');
  });

  it('keeps the current schema first during an edit and never exceeds the retrieval cap', () => {
    const candidates = retrieveComponentCandidates({
      instruction: '把数值改成 52%，其余不变',
      current: { component: 'metric', props: { value: '47%' } },
      context: { beats: [{ text: '转化率已经提升到 52%', start: 0, end: 1 }] },
    });
    expect(candidates[0]).toBe('metric');
    expect(candidates.length).toBeLessThanOrEqual(MAX_COMPONENT_CANDIDATES);
  });

  it('does not inject arbitrary schemas when only styling is described', () => {
    expect(retrieveComponentCandidates({ instruction: '颜色换成红色，动效更快一点' })).toEqual([]);
  });

  it('assembles only retrieved schemas instead of the whole registry', () => {
    const brief = assembleComposeBrief({
      block: { id: 'b1', kind: 'custom', innerHtml: '<div></div>', timelineBody: '', label: '方案对比' },
      instruction: '做一张左右对比卡',
    });
    expect(brief.candidateComponents).toEqual(['comparison']);
    for (const id of Object.keys(components)) {
      expect(brief.system.includes(`  ${id} — `), id).toBe(brief.candidateComponents.includes(id));
    }
  });
});
