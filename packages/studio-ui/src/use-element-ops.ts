'use client';

/**
 * Element generation + block-level element operations: standalone gen (chat panel history cards),
 * local reshaping on insert (container %-binding + px→cq fluidization), insert/backfill into empty
 * media cards, layer bumping, person-layer toggle, save-as-element, and narration-driven content
 * sync. Extracted from hyperframes-workbench.tsx — bodies verbatim.
 */

import { type MutableRefObject, type SetStateAction, useState } from 'react';
import { toast } from '@pireel/ui/toast';
import {
  type Block,
  type Composition,
  type VideoShot,
  blockId,
  blockKind,
  freeTrack,
  isSentenceCaption,
} from '@pireel/studio-engine/composition';
import { getTheme, themeVarsCss } from '@pireel/studio-engine/theme';
import { kitElement } from '@pireel/studio-engine/kit-templates';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import { studioProviders } from '@pireel/studio-engine/providers';
import { addElementEntry } from './element-history';
import type { GenElementResult } from './gen-chat-panel';
import type { StudioChatHandle } from './studio-chat';
import { t } from './i18n';

export interface ElementOpsDeps {
  projectId: string;
  playing: boolean;
  compRef: MutableRefObject<Composition>;
  tRef: MutableRefObject<number>;
  asrRef: MutableRefObject<AsrSegment[] | null>;
  elementTargetRef: MutableRefObject<string | null>;
  chatRef: MutableRefObject<StudioChatHandle | null>;
  setComp: (action: SetStateAction<Composition>) => void;
  setSelectedId: (id: string | null) => void;
  setSelectedShotId: (id: string | null) => void;
  setPendingInsert: (box: { x: number; y: number; w: number; h: number } | null) => void;
  setGenRefreshTick: (fn: (n: number) => number) => void;
  applyT: (v: number) => void;
  pushUndoSnapshot: () => void;
  ensureShots: (c: Composition) => VideoShot[];
  mappedCaptionSegs: (shots: VideoShot[], narr: AsrSegment[] | null) => AsrSegment[];
  composeBlockChecked: (
    seed: { id: string; kind: string; innerHtml: string; timelineBody: string; label?: string },
    instruction: string,
    onDelta?: (raw: string) => void,
    opts?: { kit?: boolean; current?: { component: string; props: Record<string, unknown> } | null },
  ) => Promise<{ innerHtml: string; timelineBody: string; note: string; kit?: { component: string; props: Record<string, unknown> }; declined?: boolean }>;
  /** Insert a kit component block directly (props-driven, no measurement) — the workbench's insertTemplateBlock. */
  insertKitBlock: (templateId: string, props?: Record<string, unknown>) => void;
  openChat: () => void;
}

export function useElementOps(deps: ElementOpsDeps) {
  const {
    projectId, playing, compRef, tRef, asrRef, elementTargetRef, chatRef, setComp, setSelectedId, setSelectedShotId,
    setPendingInsert, setGenRefreshTick, applyT, pushUndoSnapshot, ensureShots, mappedCaptionSegs,
    composeBlockChecked, insertKitBlock, openChat,
  } = deps;
  /** Generate a standalone component (composeBlockChecked, not added to the video; only added via "insert" on a history card).
   *  Same routing as add_block: themed → HTML in the theme's language; themeless → kit first, and
   *  the model itself decides per the description — a component fits (props), nothing fits
   *  ({"custom": true} falls through to HTML inside the checked composer), or a deliberate null,
   *  which an explicit description never deserves → retry as HTML. */
  const generateElementStandalone = async (prompt: string, base?: GenElementResult): Promise<GenElementResult> => {
    // Draft iteration: a "reference" already-generated component enters the seed as the existing implementation, the instruction = edit on top of it
    const seed = base
      ? { id: blockId('ai'), kind: 'custom', innerHtml: base.innerHtml.replaceAll(base.seedId, 'SEED_'), timelineBody: base.timelineBody.replaceAll(base.seedId, 'SEED_'), label: base.label }
      : { id: blockId('ai'), kind: 'custom', innerHtml: '<div></div>', timelineBody: '', label: t('workbench.newElement') };
    if (base) {
      seed.innerHtml = seed.innerHtml.replaceAll('SEED_', seed.id);
      seed.timelineBody = seed.timelineBody.replaceAll('SEED_', seed.id);
    }
    const instruction = base
      ? `Edit this element's current implementation as requested (keep everything not mentioned as-is): ${prompt}`
      : `Create a new overlay element (title / big number / list / kinetic caption — pick per the content): ${prompt}`;
    const kitOpts = compRef.current.frameId ? undefined : { kit: true, ...(base?.kit ? { current: base.kit } : {}) };
    let parsed = await composeBlockChecked(seed, instruction, undefined, kitOpts);
    if (parsed.declined) parsed = await composeBlockChecked(seed, instruction); // explicit ask never maps to "nothing to show"
    if (parsed.kit) {
      // Library card preview = the derived render at a standard landscape reference (same as the
      // assets-panel component cards); insertion uses the props, never this markup.
      const pv = kitElement(parsed.kit.component, seed.id, parsed.kit.props, { w: 1920, h: 1080 });
      return { seedId: seed.id, innerHtml: pv.innerHtml, timelineBody: pv.timelineBody, label: prompt.slice(0, 12), designW: 1920, designH: 1080, kit: parsed.kit };
    }
    return { seedId: seed.id, innerHtml: parsed.innerHtml, timelineBody: parsed.timelineBody, label: prompt.slice(0, 12) };
  };
  /** History card "insert": re-scope the id then land at the playhead (the same asset can be inserted multiple times, selectors don't collide).
   *  If there's an empty component block waiting to be filled (elementTargetRef recorded by aiFillBlock), prefer filling it — keeping its time window/box/track. */
  /** Local reshaping before component insert (without an LLM round-trip), the user-defined container/text separation semantics:
   *  - **inner container tracks the box's real size**: top-level visible elements' width/height (and absolute-position offsets)
   *    are bound to container %; corner handles scale proportionally, edge handles on one axis, it changes as the container does (not a whole-transform scale);
   *  - **text then follows the resulting size**: font-size/line-height px are calibrated to the natural size at insert as
   *    min(cqw,cqh) container-query units — font size = original × min(width ratio, height ratio), pure CSS, instant during
   *    drag, no glyph stretching;
   *  - normalization of absurd sizes (over-canvas shrunk back / too-small enlarged) is reflected directly in the box choice, content %/cq follows automatically.
   *  Rendered and measured offscreen at canvas size (container id = seedId; the component's <style> only takes effect scoped to #seedId);
   *  offset geometry is immune to transform (entry animation doesn't pollute it). If unmeasurable → as-is + default centered box;
   *  extreme overflow still has the autofit safety net. */
  const normalizeElementForInsert = (el: GenElementResult, W: number, H: number, opts?: { fullFluid?: boolean }): { innerHtml: string; box: { x: number; y: number; w: number; h: number } } => {
    const fallback = { innerHtml: el.innerHtml, box: { x: 0.14, y: 0.3, w: 0.72, h: 0.4 } };
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
        const rectOf = (n: HTMLElement) => {
          let x = n.offsetLeft;
          let y = n.offsetTop;
          let p = n.offsetParent as HTMLElement | null;
          while (p && p !== host) {
            x += p.offsetLeft;
            y += p.offsetTop;
            p = p.offsetParent as HTMLElement | null;
          }
          return { x, y, w: n.offsetWidth, h: n.offsetHeight };
        };
        const tops: { node: HTMLElement; rect: { x: number; y: number; w: number; h: number } }[] = [];
        const walk = (node: HTMLElement, depth: number) => {
          for (const k of Array.from(node.children) as HTMLElement[]) {
            if (k.tagName === 'STYLE' || k.tagName === 'SCRIPT') continue;
            const w = k.offsetWidth;
            const h = k.offsetHeight;
            if (w < 2 || h < 2) continue;
            if (w > W * 0.92 && h > H * 0.92 && depth < 4) walk(k, depth + 1);
            else tops.push({ node: k, rect: rectOf(k) });
          }
        };
        walk(root, 0);
        if (!tops.length) return fallback;
        const x0 = Math.min(...tops.map((t2) => t2.rect.x));
        const y0 = Math.min(...tops.map((t2) => t2.rect.y));
        const x1 = Math.max(...tops.map((t2) => t2.rect.x + t2.rect.w));
        const y1 = Math.max(...tops.map((t2) => t2.rect.y + t2.rect.h));
        const nbW = x1 - x0;
        const nbH = y1 - y0;
        if (nbW < W * 0.03 || nbH < H * 0.02) return fallback; // measured absurdly small = untrustworthy
        // Components that basically fill the canvas keep their original layout semantics (full-canvas box, content unchanged);
        // fullFluid (whole-page theme components) is the exception: full pages are also fully cq-ized — calibrated to the design size, content scales proportionally no matter how small the box shrinks
        const fullBleed = nbW > W * 0.95 && nbH > H * 0.95;
        if (fullBleed && !opts?.fullFluid) return { innerHtml: el.innerHtml, box: { x: 0, y: 0, w: 1, h: 1 } };
        const pad = fullBleed ? 0 : Math.min(W, H) * 0.025; // breathing room: font-measurement error / shadow margin
        const natW = fullBleed ? W : nbW + pad * 2; // natural container size (= box px without normalization): the calibration base for % and cq
        const natH = fullBleed ? H : nbH + pad * 2;
        const pc = (v: number) => `${Math.round(v * 1000) / 10}%`;
        for (const { node, rect } of fullBleed ? [] : tops) {
          // Top-level visible element: size bound to container % — it changes its real size as the container (blue box) does
          node.style.width = pc(rect.w / natW);
          node.style.height = pc(rect.h / natH);
          if (getComputedStyle(node).position === 'absolute') {
            // Absolutely-positioned top-level element: convert the offset to % too; clear right/bottom anchors to avoid stretching from a double constraint with the new left/top
            node.style.left = pc((rect.x - x0 + pad) / natW);
            node.style.top = pc((rect.y - y0 + pad) / natH);
            node.style.right = 'auto';
            node.style.bottom = 'auto';
          }
        }
        // Full fluidization: all px in CSS contexts (<style> and style="") are calibrated to the natural size as min(cqw,cqh).
        // At box = natural size every value is identical; a proportional corner drag = font/padding/radius/SVG sizes all ×k, the skeleton holds;
        // a single-edge widen = min picks the unchanged height ratio, so font/padding stay put, the container's real width grows, text reflows.
        // ≤2px thin lines are kept (a hairline shrunk to sub-pixel goes blurry); @container/@media condition lines are protected (no cq units allowed in the condition).
        const cq = (n: number) => `min(${Math.round((n / natW) * 100000) / 1000}cqw,${Math.round((n / natH) * 100000) / 1000}cqh)`;
        // Negative px (like right:-14px for decorations outside the card): a textual '-min(...)' is invalid CSS and the
        // whole positioning is dropped by the browser (the culprit behind the Botanical stamp falling to the bottom-left); negatives use max(-a,-b), mirroring the positive min scaling semantics
        const ncq = (n: number) => `max(${-(Math.round((n / natW) * 100000) / 1000)}cqw,${-(Math.round((n / natH) * 100000) / 1000)}cqh)`;
        const fluidCss = (css: string) => {
          const guards: string[] = [];
          return css
            .replace(/@(?:container|media|supports)[^{]*/g, (m) => {
              guards.push(m);
              return `@@HFG${guards.length - 1}@@`;
            })
            .replace(/(-?\d+(?:\.\d+)?)px/gi, (m, n: string) => {
              const v = parseFloat(n);
              if (Math.abs(v) <= 2) return m;
              return v > 0 ? cq(v) : ncq(-v);
            })
            .replace(/@@HFG(\d+)@@/g, (_m, i: string) => guards[Number(i)]!);
        };
        const html = root.innerHTML
          .replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (_m, attrs: string, css: string) => `<style${attrs}>${fluidCss(css)}</style>`)
          .replace(/style="([^"]*)"/gi, (_m, css: string) => `style="${fluidCss(css)}"`);
        // Wrap in a container-query base (container-type:size): cqw/cqh always relative to the component container, not the canvas
        const wrapped = `<div style="position:absolute;inset:0;container-type:size;">\n${html}\n</div>`;
        if (fullBleed) return { innerHtml: wrapped, box: { x: 0, y: 0, w: 1, h: 1 } };
        // Size normalization is just the box choice: over-canvas shrunk back to a sensible scale, too-small bumped up a notch, content %/cq follows automatically
        let k = 1;
        if (nbW > 0.88 * W || nbH > 0.8 * H) k = Math.min((0.78 * W) / nbW, (0.7 * H) / nbH);
        else if (nbW < 0.22 * W && nbH < 0.22 * H) k = Math.min((0.4 * W) / nbW, (0.35 * H) / nbH);
        k = Math.max(0.3, Math.min(2.5, k));
        const bw = Math.min(W, natW * k);
        const bh = Math.min(H, natH * k);
        const bx = Math.max(0, Math.min(W - bw, x0 + nbW / 2 - bw / 2)); // placed concentrically, clamped back into the canvas
        const by = Math.max(0, Math.min(H - bh, y0 + nbH / 2 - bh / 2));
        const r4 = (v: number) => Math.round(v * 10000) / 10000;
        return { innerHtml: wrapped, box: { x: r4(bx / W), y: r4(by / H), w: r4(bw / W), h: r4(bh / H) } };
      } finally {
        host.remove();
      }
    } catch {
      return fallback;
    }
  };
  const insertGeneratedElement = (el: GenElementResult, prompt: string, atSec?: number) => {
    // Kit elements skip the whole HTML insertion pipeline (offscreen measurement, cq-ization,
    // token baking): the block stores props and the component computes sizes from its real box.
    if (el.kit) {
      insertKitBlock(`kit:${el.kit.component}`, el.kit.props);
      return;
    }
    // Reshape locally once, shared by both branches: inner container %-binding + font cq-ization (when backfilling into a component card, content also adapts to the card's box)
    const dW = el.designW ?? compRef.current.width;
    const dH = el.designH ?? compRef.current.height;
    const geom = normalizeElementForInsert(el, dW, dH, { fullFluid: !!(el.designW && el.designH) });
    if (el.designW && el.designH) {
      // Design coords → canvas: first take the fit window inside the canvas at the design aspect ratio (same shape as the preview).
      // Whole-page items (measured full-bleed) = the entire fit window; overlay items (measured their own small box) = map the small box into the fit window,
      // so the selection box hugs the item itself rather than covering half the screen
      const W = compRef.current.width;
      const H = compRef.current.height;
      const ar = el.designW / el.designH;
      let w = 0.96;
      let h = (W * w) / ar / H;
      if (h > 0.96) {
        h = 0.96;
        w = (H * h * ar) / W;
      }
      const win = { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
      const full = geom.box.w > 0.98 && geom.box.h > 0.98;
      geom.box = full
        ? win
        : { x: win.x + geom.box.x * win.w, y: win.y + geom.box.y * win.h, w: geom.box.w * win.w, h: geom.box.h * win.h };
    }
    // Independence baking: theme components carry data-hf-baked (theme tokens travel with them); other components snapshot
    // the current theme's tokens into the block scope here — swapping themes / editing other components after insert doesn't affect it (user-defined independence semantics)
    if (!geom.innerHtml.includes('data-hf-baked')) {
      geom.innerHtml += `\n<style data-hf-baked>#${el.seedId}{${themeVarsCss(getTheme(compRef.current.theme), compRef.current.palette)}}</style>`;
    }
    const targetId = elementTargetRef.current;
    const tb = targetId ? compRef.current.blocks.find((b) => b.id === targetId) : null;
    const tbSlots = tb?.slots as { media?: { url?: string }; spec?: unknown } | undefined;
    if (tb && blockKind(tb) === 'media' && !tbSlots?.media?.url && typeof tbSlots?.spec !== 'string') {
      elementTargetRef.current = null;
      pushUndoSnapshot();
      setComp((c) => ({
        ...c,
        blocks: c.blocks.map((b) =>
          b.id === tb.id
            ? {
                ...b,
                templateId: 'custom',
                slots: { innerHtml: geom.innerHtml.replaceAll(el.seedId, tb.id), timelineBody: el.timelineBody.replaceAll(el.seedId, tb.id), ...(el.presetId ? { presetId: el.presetId } : {}) },
                label: el.label || prompt.slice(0, 12),
              }
            : b,
        ),
      }));
      setSelectedShotId(null);
      setSelectedId(tb.id);
      if (!playing) applyT(Math.max(0, tb.startSec + 0.01));
      toast.success(t('workbench.filledIntoElementCard'));
      return;
    }
    pushUndoSnapshot();
    const newId = blockId('cst');
    const at = Math.max(0, Math.round((atSec ?? tRef.current) * 100) / 100);
    // Only with a box are there selection frame / move / resize handles (a boxless block can't show a border, so the user can't adjust it after dragging into the canvas)
    const nb: Block = {
      id: newId,
      templateId: 'custom',
      slots: { innerHtml: geom.innerHtml.replaceAll(el.seedId, newId), timelineBody: el.timelineBody.replaceAll(el.seedId, newId), ...(el.presetId ? { presetId: el.presetId } : {}) },
      startSec: at,
      durationSec: 3,
      trackIndex: freeTrack(compRef.current.blocks, at, 3),
      label: el.label || prompt.slice(0, 12),
      box: geom.box,
    };
    setComp((c) => ({ ...c, blocks: [...c.blocks, nb] }));
    if (nb.box) setPendingInsert(nb.box);
    setSelectedShotId(null);
    setSelectedId(newId);
    if (!playing) applyT(Math.max(0, nb.startSec + 0.01));
    toast.success(t('workbench.elementInserted'));
  };
  /** Layer: move a block up/down one layer (trackIndex±1, DOM order = stacking; 0 = video, clamped to [1,55]). */
  const bumpBlockLayer = (b: Block, dir: 1 | -1) => {
    pushUndoSnapshot();
    setComp((c) => ({ ...c, blocks: c.blocks.map((x) => (x.id === b.id ? { ...x, trackIndex: Math.max(1, Math.min(55, x.trackIndex + dir)) } : x)) }));
  };
  /** Block-level person-layer override: toggle between on-top-of / behind the person (defaults to global personFront, see engine Block.personLayer). */
  const togglePersonLayer = (b: Block) => {
    pushUndoSnapshot();
    const behindNow = b.personLayer ? b.personLayer === 'behind' : !!compRef.current.personFx?.personFront;
    setComp((c) => ({ ...c, blocks: c.blocks.map((x) => (x.id === b.id ? { ...x, personLayer: behindNow ? 'front' : 'behind' } : x)) }));
  };
  /** Floating toolbar "save as component": save a canvas custom block as-is into the asset library (snapshot copy, later
   *  edits don't affect each other; seedId = block id, the insert side re-scopes as usual). Re-saving the same block = overwrites the same entry. */
  const saveBlockAsElement = (b: Block) => {
    const slots = b.slots as { innerHtml?: string; timelineBody?: string };
    if (typeof slots.innerHtml !== 'string') return;
    // Snapshot semantics: a block that already has baked tokens (theme component / baked at a prior insert) = saved as-is —
    // **never** strip the old and re-bake, or saving gets polluted by the currently-mounted theme (a chain error the user
    // called out); only un-baked ones (legacy block / raw AI output) get the current theme snapshot added
    const baked = slots.innerHtml.includes('data-hf-baked')
      ? slots.innerHtml
      : `${slots.innerHtml}\n<style data-hf-baked>#${b.id}{${themeVarsCss(getTheme(compRef.current.theme), compRef.current.palette)}}</style>`;
    addElementEntry(projectId, {
      id: `saved:${b.id}`,
      prompt: b.label || t('workbench.canvasElement'),
      createdAt: Date.now(),
      element: { seedId: b.id, innerHtml: baked, timelineBody: slots.timelineBody ?? '', label: b.label || t('panels.element'), ...((b.slots as { presetId?: string }).presetId ? { presetId: (b.slots as { presetId?: string }).presetId } : {}) },
    });
    setGenRefreshTick((n) => n + 1); // refetch the asset library so it's visible immediately
    toast.success(t('workbench.savedAsElementAssets'));
  };
  /** Floating toolbar "sync content": one-click fill the component's data-edit text slots from the narration script in
   *  the block's time window (preset component copy = generic placeholder, this step matches it to real content). Slots
   *  are claimed by index in DOM order (keys may repeat); text replacement only touches textContent, layout/animation unchanged. */
  const [syncBusyId, setSyncBusyId] = useState<string | null>(null);
  const syncBlockContent = async (b: Block) => {
    const fill = studioProviders().syncFill;
    if (!fill || syncBusyId) return;
    const slots = b.slots as { innerHtml?: string };
    if (typeof slots.innerHtml !== 'string') return;
    const doc = new DOMParser().parseFromString(`<div id="__root">${slots.innerHtml}</div>`, 'text/html');
    const nodes = Array.from(doc.querySelectorAll('#__root [data-edit]'));
    const items = nodes.map((n, i) => ({ index: i, text: (n.textContent ?? '').trim() })).filter((x) => x.text);
    if (!items.length) {
      toast.error(t('workbench.elementNoFillableText'));
      return;
    }
    // Narration window: sentences whose final-cut time overlaps the block window (±3s breathing room); if none, take the two nearest.
    // When transcript references aren't hydrated (old project / missing context), fall back to reading copy from the **caption blocks themselves** —
    // if there are captions on screen there's a script, so we can't report "no narration script" (user hit this).
    let segs = mappedCaptionSegs(ensureShots(compRef.current), asrRef.current);
    if (!segs.length) {
      segs = compRef.current.blocks
        .filter(isSentenceCaption)
        .map((cb) => ({ start: cb.startSec, end: cb.startSec + cb.durationSec, text: cb.label || '' }))
        .filter((x) => !!x.text) as typeof segs;
    }
    const s0 = b.startSec - 3;
    const s1 = b.startSec + b.durationSec + 3;
    let win = segs.filter((x) => x.end > s0 && x.start < s1);
    if (!win.length && segs.length) {
      const mid = b.startSec + b.durationSec / 2;
      win = [...segs].sort((a, c) => Math.abs((a.start + a.end) / 2 - mid) - Math.abs((c.start + c.end) / 2 - mid)).slice(0, 2);
    }
    if (!win.length) {
      toast.error(t('workbench.noTranscriptYetExtract'));
      return;
    }
    setSyncBusyId(b.id);
    try {
      // Script carries timestamps (sentence range + word-level time): the LLM in one pass gives "copy + the moment `at`
      // when the content is spoken" — the goal is described in generic language in the server system prompt, not enumerating component shapes (per user)
      const script = win
        .map((x) => {
          const wl = x.words?.length ? `\n  words: ${x.words.map((w) => `${w.start.toFixed(2)}|${w.text}`).join(' ')}` : '';
          return `[${x.start.toFixed(2)}-${x.end.toFixed(2)}] ${x.text}${wl}`;
        })
        .join('\n');
      const curTlb = (b.slots as { timelineBody?: string }).timelineBody ?? '';
      const out = await fill(items, script, { html: slots.innerHtml, timeline: curTlb, id: b.id });
      const byIndex = new Map(out.items.map((x) => [x.index, x.text]));
      const byIndexAt = new Map(out.items.filter((x) => typeof x.at === 'number').map((x) => [x.index, x.at!]));
      // Component = strong reference (per user): the LLM may restructure wholesale (a 3-item list grows to 4 per the script).
      // html passing validation = full replacement; not given / not passing = fall back to slot patching (text only)
      let nextHtml: string;
      const okHtml =
        typeof out.html === 'string' &&
        out.html.includes('data-edit') &&
        out.html.includes(`#${b.id}`) && // the style scope must still be this block's id (prevents cross-block leakage / lost scope)
        !/<script/i.test(out.html);
      if (okHtml) {
        nextHtml = out.html!;
      } else {
        nodes.forEach((n, i) => {
          const t = byIndex.get(i);
          if (t) n.textContent = t;
        });
        nextHtml = doc.querySelector('#__root')!.innerHTML;
      }
      // Sync timeline ① window alignment: prefer the span the LLM gives (it drops leading/trailing sentences unrelated to
      // the component — the previous "overlap-window min/max" pulled in unrelated leading segments, user hit this); fall back to the overlap window if not given
      const winLo = Math.min(...win.map((x) => x.start));
      const winHi = Math.max(...win.map((x) => x.end));
      const spanFrom = out.span ? Math.min(Math.max(out.span.from, winLo - 1), winHi) : winLo;
      const spanTo = out.span ? Math.max(Math.min(out.span.to, winHi + 1), spanFrom + 1) : winHi;
      const newStart = Math.max(0, Math.round(spanFrom * 100) / 100);
      const newDur = Math.max(1.5, Math.round((spanTo - newStart) * 100) / 100);
      // Sync timeline ② preset beats: each segment's main-slot new copy is located in the narration word stream → rebuild the timeline at its entrance moment
      // (word-level timestamps are our edge; segments not found are left to the builder's default rhythm)
      // Sync timeline ②: the LLM rewrites timelineBody directly by looking at the component's real HTML (generic — it
      // targets whatever selectors it reads, not preset class names; the previous preset-enumerating builder was rejected by the user).
      // Compile-validate with new Function before applying (bad syntax = keep the original timeline, content still syncs).
      let nextTlb: string | null = null;
      if (out.timeline) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-implied-eval
          new Function('tl', out.timeline);
          nextTlb = out.timeline;
        } catch {
          /* compile failed: discard, keep the original timeline */
        }
      }
      pushUndoSnapshot();
      setComp((c) => ({
        ...c,
        blocks: c.blocks.map((x) =>
          x.id === b.id
            ? { ...x, startSec: newStart, durationSec: newDur, slots: { ...x.slots, innerHtml: nextHtml, ...(nextTlb ? { timelineBody: nextTlb } : {}) } }
            : x,
        ),
      }));
      toast.success(nextTlb ? t('workbench.syncedContentTimingBlock') : t('workbench.syncedContentAlignedNarration'));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('workbench.syncFailedTryAgain'));
    } finally {
      setSyncBusyId(null);
    }
  };
  /** History card "@mention": stuff the asset into the right-side agent input (fill only, don't send), switch to chat to describe how to use it. */
  const mentionAsset = (text: string) => {
    openChat();
    chatRef.current?.insertText(text);
  };
  return { generateElementStandalone, insertGeneratedElement, bumpBlockLayer, togglePersonLayer, saveBlockAsElement, syncBlockContent, syncBusyId, mentionAsset };
}
