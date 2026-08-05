export interface ElementInsertBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DesignFitInput {
  canvasW: number;
  canvasH: number;
  designW: number;
  designH: number;
  sourceBox: ElementInsertBox;
  initialScale?: number;
}

/** Map authored design coordinates into a centered aspect-fit window on the project canvas. */
export function fitElementDesignBox({
  canvasW,
  canvasH,
  designW,
  designH,
  sourceBox,
  initialScale = 1,
}: DesignFitInput): ElementInsertBox {
  const aspect = designW / designH;
  let w = 0.96;
  let h = (canvasW * w) / aspect / canvasH;
  if (h > 0.96) {
    h = 0.96;
    w = (canvasH * h * aspect) / canvasW;
  }
  const window = { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
  const fillsDesignCanvas = sourceBox.w > 0.98 && sourceBox.h > 0.98;
  if (!fillsDesignCanvas) {
    return {
      x: window.x + sourceBox.x * window.w,
      y: window.y + sourceBox.y * window.h,
      w: sourceBox.w * window.w,
      h: sourceBox.h * window.h,
    };
  }

  const scale = Math.max(0.1, Math.min(1, initialScale));
  return {
    x: window.x + (window.w * (1 - scale)) / 2,
    y: window.y + (window.h * (1 - scale)) / 2,
    w: window.w * scale,
    h: window.h * scale,
  };
}
