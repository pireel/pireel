'use client';

import type { Block, Composition } from '@pireel/studio-engine/composition';
import type { GenElementResult } from './element-history';
import { BlockPreviewFrame } from './block-preview-card';
import { defaultKitElementBox } from './editable-block-geometry';
import { KIT_INSERT_DURATION, kitSampleProps } from './kit-ui';

const COMPONENT_PREVIEW_COMP: Composition = {
  width: 1920,
  height: 1080,
  theme: 'general',
  video: null,
  blocks: [],
  shots: [],
};

/** Kit components are laid out for the box they land in, so they preview on a real canvas in the
 *  box an insert gives them — a full landscape frame stretched every layout and shrank the type. */
const KIT_PREVIEW_CANVAS = { width: 1080, height: 1920 };

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
  /** Design-canvas px of the component's own box: previews frame this, not the whole canvas. */
  focus?: { x: number; y: number; w: number; h: number };
}

/** Normalize native kit components and authored HTML components into one preview contract. */
export function componentPreviewModel(
  source: ComponentPreviewSource,
  /** The project composition (lightbox): kit previews take its canvas size, authored ones its look. */
  canvas?: Composition,
): ComponentPreviewModel | null {
  if (source.kit) {
    const insertProps = kitSampleProps(source.kit);
    const templateId = `kit:${source.kit}`;
    const size = canvas ?? KIT_PREVIEW_CANVAS;
    const box = defaultKitElementBox(templateId);
    return {
      comp: { ...COMPONENT_PREVIEW_COMP, width: size.width, height: size.height },
      block: {
        id: `preview_${source.kit}`,
        templateId,
        slots: { props: insertProps, backdrop: 'page' },
        startSec: 0,
        durationSec: KIT_INSERT_DURATION,
        trackIndex: 2,
        box: { ...box },
        label: source.label,
      },
      insertProps,
      focus: { x: box.x * size.width, y: box.y * size.height, w: box.w * size.width, h: box.h * size.height },
    };
  }

  const element = source.element;
  if (!element) return null;
  const fallbackComp = canvas ?? COMPONENT_PREVIEW_COMP;
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

/** Width ÷ height of what a preview shows: the component's box when it has one, else its canvas. */
export function componentPreviewAspect(model: ComponentPreviewModel): number {
  return model.focus ? model.focus.w / model.focus.h : model.comp.width / model.comp.height;
}

/** One renderer for every component-library thumbnail and lightbox preview. */
export function LibraryComponentPreview({
  model,
  width,
  height,
  animate = false,
  replayKey,
  playOnReady = false,
  onReady,
}: {
  model: ComponentPreviewModel;
  width: number;
  height?: number;
  animate?: boolean | 'hover' | 'manual';
  replayKey?: number;
  playOnReady?: boolean;
  onReady?: () => void;
}) {
  return (
    <BlockPreviewFrame
      comp={model.comp}
      block={model.block}
      width={width}
      height={height}
      animate={animate}
      replayKey={replayKey}
      playOnReady={playOnReady}
      showLoading
      onReady={onReady}
      ground="checker"
      fit="canvas"
      focus={model.focus}
    />
  );
}
