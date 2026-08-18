'use client';

/**
 * Shared geometry preparation for editable overlay components.
 *
 * Every visual insertion surface (asset panel, Studio Chat, external agent) must land the same
 * block shape: content fitted to a real canvas box. A boxless custom block renders, but the editor
 * cannot draw its selection frame or offer move/resize handles.
 */

import { type Block, blockKind, isSentenceCaption } from '@pireel/studio-engine/composition';
import {
  type EditableBlockBox,
  editableOverlaySafeArea,
  fitEditableBoxIntoSafeArea,
} from '@pireel/studio-engine/overlay-placement';

export type { EditableBlockBox } from '@pireel/studio-engine/overlay-placement';
export { editableOverlaySafeArea, fitEditableBoxIntoSafeArea } from '@pireel/studio-engine/overlay-placement';

export interface NormalizableElement {
  seedId: string;
  innerHtml: string;
}

export const DEFAULT_EDITABLE_ELEMENT_BOX: EditableBlockBox = { x: 0.14, y: 0.3, w: 0.72, h: 0.4 };
export const DEFAULT_KIT_ELEMENT_BOX: EditableBlockBox = { x: 0.07, y: 0.34, w: 0.86, h: 0.3 };
/** Code needs a readable viewport rather than the shallow strip used by titles and callouts. */
export const DEFAULT_CODE_KIT_ELEMENT_BOX: EditableBlockBox = { x: 0.08, y: 0.18, w: 0.84, h: 0.64 };

export function defaultKitElementBox(templateId: string): EditableBlockBox {
  return templateId === 'kit:code' ? DEFAULT_CODE_KIT_ELEMENT_BOX : DEFAULT_KIT_ELEMENT_BOX;
}

/** A serialized zero/NaN rectangle is as unusable as a missing box: the selection frame collapses
 *  to a point and every drag delta is clamped against a zero-sized component. */
export function isUsableEditableBlockBox(box: Block['box']): boolean {
  return !!box
    && [box.x, box.y, box.w, box.h].every(Number.isFinite)
    && box.w > 0.001
    && box.h > 0.001;
}

/**
 * Measure generated HTML offscreen and bind its visible content to a real component container.
 * Text and spacing become container-relative, so later edge/corner drags resize the component
 * instead of stretching glyphs or merely clipping a full-canvas document.
 */
export function normalizeElementForInsert(
  el: NormalizableElement,
  W: number,
  H: number,
  opts?: { fullFluid?: boolean },
): { innerHtml: string; box: EditableBlockBox } {
  const fallback = { innerHtml: el.innerHtml, box: { ...DEFAULT_EDITABLE_ELEMENT_BOX } };
  if (!Number.isFinite(W) || !Number.isFinite(H) || W <= 0 || H <= 0) return fallback;
  try {
    const host = document.createElement('div');
    host.style.cssText = `position:fixed;left:-100000px;top:0;width:${W}px;height:${H}px;overflow:hidden;visibility:hidden;pointer-events:none;`;
    const root = document.createElement('div');
    root.id = el.seedId;
    root.style.cssText = 'position:absolute;inset:0;';
    root.innerHTML = el.innerHtml;
    host.appendChild(root);
    document.body.appendChild(host);
    try {
      type LayoutElement = (HTMLElement | SVGElement) & { style: CSSStyleDeclaration };
      const hostRect = host.getBoundingClientRect();
      const rectOf = (node: LayoutElement) => {
        const rect = node.getBoundingClientRect();
        return { x: rect.left - hostRect.left, y: rect.top - hostRect.top, w: rect.width, h: rect.height };
      };
      const tops: { node: LayoutElement; rect: { x: number; y: number; w: number; h: number } }[] = [];
      const walk = (node: Element, depth: number) => {
        for (const child of Array.from(node.children)) {
          if (child.tagName === 'STYLE' || child.tagName === 'SCRIPT') continue;
          if (!(child instanceof HTMLElement || child instanceof SVGElement)) continue;
          const layoutChild = child as LayoutElement;
          const rect = rectOf(layoutChild);
          const { w, h } = rect;
          if (![rect.x, rect.y, w, h].every(Number.isFinite)) continue;
          if (w < 2 || h < 2) continue;
          if (w > W * 0.92 && h > H * 0.92 && depth < 4) walk(child, depth + 1);
          else tops.push({ node: layoutChild, rect });
        }
      };
      walk(root, 0);
      if (!tops.length) return fallback;
      const x0 = Math.min(...tops.map((item) => item.rect.x));
      const y0 = Math.min(...tops.map((item) => item.rect.y));
      const x1 = Math.max(...tops.map((item) => item.rect.x + item.rect.w));
      const y1 = Math.max(...tops.map((item) => item.rect.y + item.rect.h));
      const nbW = x1 - x0;
      const nbH = y1 - y0;
      if (nbW < W * 0.03 || nbH < H * 0.02) return fallback;

      // Layout-only full-canvas wrappers are traversed above. A genuinely full-bleed component
      // keeps the full canvas unless it came from an authored design canvas that must be fluidized.
      const fullBleed = nbW > W * 0.95 && nbH > H * 0.95;
      if (fullBleed && !opts?.fullFluid) return { innerHtml: el.innerHtml, box: { x: 0, y: 0, w: 1, h: 1 } };
      const pad = fullBleed ? 0 : Math.min(W, H) * 0.025;
      const natW = fullBleed ? W : nbW + pad * 2;
      const natH = fullBleed ? H : nbH + pad * 2;
      const pc = (value: number) => `${Math.round(value * 1000) / 10}%`;
      for (const { node, rect } of fullBleed ? [] : tops) {
        node.style.width = pc(rect.w / natW);
        node.style.height = pc(rect.h / natH);
        if (getComputedStyle(node).position === 'absolute') {
          node.style.left = pc((rect.x - x0 + pad) / natW);
          node.style.top = pc((rect.y - y0 + pad) / natH);
          node.style.right = 'auto';
          node.style.bottom = 'auto';
        }
      }

      const cq = (value: number) => `min(${Math.round((value / natW) * 100000) / 1000}cqw,${Math.round((value / natH) * 100000) / 1000}cqh)`;
      const ncq = (value: number) => `max(${-(Math.round((value / natW) * 100000) / 1000)}cqw,${-(Math.round((value / natH) * 100000) / 1000)}cqh)`;
      const fluidCss = (css: string) => {
        const guards: string[] = [];
        return css
          .replace(/@(?:container|media|supports)[^{]*/g, (match) => {
            guards.push(match);
            return `@@HFG${guards.length - 1}@@`;
          })
          .replace(/(-?\d+(?:\.\d+)?)px/gi, (match, raw: string) => {
            const value = parseFloat(raw);
            if (Math.abs(value) <= 2) return match;
            return value > 0 ? cq(value) : ncq(-value);
          })
          .replace(/@@HFG(\d+)@@/g, (_match, index: string) => guards[Number(index)]!);
      };
      const html = root.innerHTML
        .replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (_match, attrs: string, css: string) => `<style${attrs}>${fluidCss(css)}</style>`)
        .replace(/style="([^"]*)"/gi, (_match, css: string) => `style="${fluidCss(css)}"`);
      const wrapped = `<div style="position:absolute;inset:0;container-type:size;">\n${html}\n</div>`;
      if (fullBleed) return { innerHtml: wrapped, box: { x: 0, y: 0, w: 1, h: 1 } };

      let scale = 1;
      if (nbW > 0.88 * W || nbH > 0.8 * H) scale = Math.min((0.78 * W) / nbW, (0.7 * H) / nbH);
      else if (nbW < 0.22 * W && nbH < 0.22 * H) scale = Math.min((0.4 * W) / nbW, (0.35 * H) / nbH);
      scale = Math.max(0.3, Math.min(2.5, scale));
      const bw = Math.min(W, natW * scale);
      const bh = Math.min(H, natH * scale);
      const bx = Math.max(0, Math.min(W - bw, x0 + nbW / 2 - bw / 2));
      const by = Math.max(0, Math.min(H - bh, y0 + nbH / 2 - bh / 2));
      const round = (value: number) => Math.round(value * 10000) / 10000;
      const box = {
        x: round(bx / W),
        y: round(by / H),
        w: round(bw / W),
        h: round(bh / H),
      };
      if (!isUsableEditableBlockBox(box)) return fallback;
      return {
        innerHtml: wrapped,
        box: fitEditableBoxIntoSafeArea(box, W, H),
      };
    } finally {
      host.remove();
    }
  } catch {
    return fallback;
  }
}

/** Add editable geometry to a malformed visual block while preserving captions/transitions. */
export function withEditableBlockGeometry(block: Block, canvasW: number, canvasH: number): Block {
  if (isUsableEditableBlockBox(block.box) || isSentenceCaption(block) || blockKind(block) === 'transition') return block;
  if (block.templateId.startsWith('kit:')) return { ...block, box: { ...defaultKitElementBox(block.templateId) } };
  if (block.templateId !== 'custom') return { ...block, box: { ...DEFAULT_EDITABLE_ELEMENT_BOX } };

  const innerHtml = typeof block.slots.innerHtml === 'string' ? block.slots.innerHtml : '';
  const geometry = normalizeElementForInsert({ seedId: block.id, innerHtml }, canvasW, canvasH);
  return {
    ...block,
    box: geometry.box,
    slots: { ...block.slots, innerHtml: geometry.innerHtml },
  };
}
