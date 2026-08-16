import { describe, expect, it } from 'vitest';
import {
  MAX_MOTION_GRAPHIC_PATTERNS,
  MOTION_GRAPHIC_CAPABILITY_MAP,
  motionGraphicPatternSection,
  retrieveMotionGraphicPatterns,
} from './motion-graphic-patterns';

describe('open Motion Graphic capability retrieval', () => {
  it('describes breadth without presenting a closed component enum', () => {
    expect(MOTION_GRAPHIC_CAPABILITY_MAP).toContain('OPEN, NOT EXHAUSTIVE');
    expect(MOTION_GRAPHIC_CAPABILITY_MAP).toContain('authentic phone/app capture');
    expect(MOTION_GRAPHIC_CAPABILITY_MAP).toContain('flowchart');
    expect(MOTION_GRAPHIC_CAPABILITY_MAP).toContain('waterfall');
    expect(MOTION_GRAPHIC_CAPABILITY_MAP).toContain('Combine, extend, or invent');
  });

  it('retrieves only the few structural references relevant to the current moment', () => {
    const patterns = retrieveMotionGraphicPatterns({
      instruction: '在手机 App 界面中展示下单流程和三个分支，最后停在支付成功',
    });
    expect(patterns).toContain('phone-source');
    expect(patterns).toContain('flowchart');
    expect(patterns.length).toBeLessThanOrEqual(MAX_MOTION_GRAPHIC_PATTERNS);
    expect(patterns).not.toContain('map-route');
  });

  it('keeps the retrieved references optional and leaves unmatched work bespoke', () => {
    const retrieved = motionGraphicPatternSection(['browser-source', 'annotation']);
    expect(retrieved).toContain('RETRIEVED, NOT REQUIRED OUTPUT TYPES');
    expect(retrieved).toContain('combine, transform, or');
    expect(retrieved).toContain('active visual direction owns appearance');

    const unmatched = motionGraphicPatternSection([]);
    expect(unmatched).toContain('content-specific structure');
    expect(unmatched).toContain('generic card');
  });
});
