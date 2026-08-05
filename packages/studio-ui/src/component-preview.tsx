'use client';

import type { Block, Composition } from '@pireel/studio-engine/composition';
import type { GenElementResult } from './element-history';
import { BlockPreviewFrame } from './block-preview-card';
import { KIT_INSERT_DURATION, kitSampleProps } from './kit-ui';

const COMPONENT_PREVIEW_COMP: Composition = {
  width: 1920,
  height: 1080,
  theme: 'general',
  video: null,
  blocks: [],
  shots: [],
};

export interface ComponentPreviewSource {
  id: string;
  label: string;
  kit?: string;
  element?: GenElementResult;
}

export interface ComponentPreviewModel {
  comp: Composition;
  block: Block;
  insertProps?: Record<string, unknown>;
}

/** Normalize native kit components and authored HTML components into one preview contract. */
export function componentPreviewModel(
  source: ComponentPreviewSource,
  fallbackComp: Composition = COMPONENT_PREVIEW_COMP,
): ComponentPreviewModel | null {
  if (source.kit) {
    const insertProps = kitSampleProps(source.kit);
    return {
      comp: COMPONENT_PREVIEW_COMP,
      block: {
        id: `preview_${source.kit}`,
        templateId: `kit:${source.kit}`,
        slots: { props: insertProps },
        startSec: 0,
        durationSec: KIT_INSERT_DURATION,
        trackIndex: 2,
        box: { x: 0, y: 0, w: 1, h: 1 },
        label: source.label,
      },
      insertProps,
    };
  }

  const element = source.element;
  if (!element) return null;
  return {
    comp: {
      ...fallbackComp,
      width: element.designW ?? fallbackComp.width,
      height: element.designH ?? fallbackComp.height,
      video: null,
      blocks: [],
      shots: [],
    },
    block: {
      id: element.seedId,
      templateId: 'custom',
      slots: { innerHtml: element.innerHtml, timelineBody: element.timelineBody },
      startSec: 0,
      durationSec: KIT_INSERT_DURATION,
      trackIndex: 2,
      label: element.label || source.label,
    },
  };
}

/** One renderer for every component-library thumbnail and lightbox preview. */
export function LibraryComponentPreview({
  model,
  width,
  height,
  animate = false,
  replayKey,
}: {
  model: ComponentPreviewModel;
  width: number;
  height?: number;
  animate?: boolean | 'hover' | 'manual';
  replayKey?: number;
}) {
  return (
    <BlockPreviewFrame
      comp={model.comp}
      block={model.block}
      width={width}
      height={height}
      animate={animate}
      replayKey={replayKey}
      ground="checker"
      fit="canvas"
    />
  );
}
