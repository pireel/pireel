'use client';

/**
 * Element generation + block-level element operations: standalone gen (chat panel history cards),
 * local reshaping on insert (container %-binding + px→cq fluidization), insert/backfill into empty
 * media cards, layer bumping, person-layer toggle, save-as-element, and narration-driven content
 * sync. Extracted from hyperframes-workbench.tsx — bodies verbatim.
 */

import { type MutableRefObject, useState } from 'react';
import { toast } from '@pireel/ui/toast';
import {
  type Block,
  type Composition,
  type EditorDocumentV2,
  type VideoShot,
  blockId,
  blockKind,
  freeTrack,
  applyOverlayDocumentEdits,
  insertOverlayDocumentClip,
  moveOverlayDocumentClip,
  isSentenceCaption,
} from '@pireel/studio-engine/composition';
import { getTheme, themeVarsCss } from '@pireel/studio-engine/theme';
import { kitElement } from '@pireel/studio-engine/kit-templates';
import type { AsrSegment } from '@pireel/studio-engine/build-blocks';
import { studioProviders } from '@pireel/studio-engine/providers';
import { addElementEntry } from './element-history';
import type { GenElementResult } from './gen-chat-panel';
import { fitElementDesignBox } from './element-insert-geometry';
import type { StudioChatHandle } from './studio-chat';
import { t } from './i18n';
import { componentContentSyncTarget } from './component-content-sync';
import { fitEditableBoxIntoSafeArea, normalizeElementForInsert } from './editable-block-geometry';

export interface ElementOpsDeps {
  projectId: string;
  playing: boolean;
  compRef: MutableRefObject<Composition>;
  tRef: MutableRefObject<number>;
  asrRef: MutableRefObject<AsrSegment[] | null>;
  elementTargetRef: MutableRefObject<string | null>;
  chatRef: MutableRefObject<StudioChatHandle | null>;
  documentRef: MutableRefObject<EditorDocumentV2>;
  setDocument: (document: EditorDocumentV2) => void;
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
    projectId, playing, compRef, tRef, asrRef, elementTargetRef, chatRef, documentRef, setDocument, setSelectedId, setSelectedShotId,
    setPendingInsert, setGenRefreshTick, applyT, pushUndoSnapshot, ensureShots, mappedCaptionSegs,
    composeBlockChecked, insertKitBlock, openChat,
  } = deps;
  /** Generate a standalone component (composeBlockChecked, not added to the video; only added via
   *  "insert" on a history card). New work always uses bespoke markup; an existing kit result keeps
   *  the props contract so editing never discards manual component choices. */
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
    const kitOpts = base?.kit ? { kit: true, current: base.kit } : undefined;
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
    const geom = el.insertFit === 'canvas'
      ? { innerHtml: el.innerHtml, box: { x: 0, y: 0, w: 1, h: 1 } }
      : normalizeElementForInsert(el, dW, dH, { fullFluid: !!(el.designW && el.designH) });
    if (el.designW && el.designH) {
      geom.box = fitElementDesignBox({
        canvasW: compRef.current.width,
        canvasH: compRef.current.height,
        designW: el.designW,
        designH: el.designH,
        sourceBox: geom.box,
        initialScale: el.insertScale,
      });
    }
    if (el.insertFit !== 'canvas') {
      geom.box = fitEditableBoxIntoSafeArea(geom.box, compRef.current.width, compRef.current.height);
    }
    // Independence baking: theme components carry data-hf-baked (theme tokens travel with them); other components snapshot
    // tokens into the block scope here — swapping themes / editing other components after insert doesn't affect it (user-defined
    // independence semantics). Preset-library elements bake the NEUTRAL general tokens (presets are themeless by decree — they
    // land exactly as their library card shows); AI-generated elements bake the project's current theme+palette they were made under.
    if (!geom.innerHtml.includes('data-hf-baked')) {
      const bakeVars = el.presetId ? themeVarsCss(getTheme('general')) : themeVarsCss(getTheme(compRef.current.theme), compRef.current.palette);
      geom.innerHtml += `\n<style data-hf-baked>#${el.seedId}{${bakeVars}}</style>`;
    }
    const targetId = elementTargetRef.current;
    const tb = targetId ? compRef.current.blocks.find((b) => b.id === targetId) : null;
    const tbSlots = tb?.slots as { media?: { url?: string }; spec?: unknown } | undefined;
    if (tb && blockKind(tb) === 'media' && !tbSlots?.media?.url && typeof tbSlots?.spec !== 'string') {
      elementTargetRef.current = null;
      const edit = applyOverlayDocumentEdits({
        document: documentRef.current,
        updates: [{
          clipId: tb.id,
          block: {
            templateId: 'custom',
            slots: {
              innerHtml: geom.innerHtml.replaceAll(el.seedId, tb.id),
              timelineBody: el.timelineBody.replaceAll(el.seedId, tb.id),
              ...(el.presetId ? { presetId: el.presetId } : {}),
              ...(el.presetVersion ? { presetVersion: el.presetVersion } : {}),
            },
            label: el.label || prompt.slice(0, 12),
          },
        }],
      });
      if (!edit.ok) {
        toast.error(edit.error.message);
        return;
      }
      pushUndoSnapshot();
      setDocument(edit.document);
      setSelectedShotId(null);
      setSelectedId(tb.id);
      if (!playing) applyT(Math.max(0, tb.startSec + 0.01));
      toast.success(t('workbench.filledIntoElementCard'));
      return;
    }
    const newId = blockId('cst');
    const at = Math.max(0, Math.round((atSec ?? tRef.current) * 100) / 100);
    // Only with a box are there selection frame / move / resize handles (a boxless block can't show a border, so the user can't adjust it after dragging into the canvas)
    const nb: Block = {
      id: newId,
      templateId: 'custom',
      slots: {
        innerHtml: geom.innerHtml.replaceAll(el.seedId, newId),
        timelineBody: el.timelineBody.replaceAll(el.seedId, newId),
        ...(el.presetId ? { presetId: el.presetId } : {}),
        ...(el.presetVersion ? { presetVersion: el.presetVersion } : {}),
      },
      startSec: at,
      durationSec: 3,
      trackIndex: freeTrack(compRef.current.blocks, at, 3),
      label: el.label || prompt.slice(0, 12),
      box: geom.box,
    };
    const inserted = insertOverlayDocumentClip({ document: documentRef.current, block: nb });
    if (!inserted.ok) {
      toast.error(inserted.error.message);
      return;
    }
    pushUndoSnapshot();
    setDocument(inserted.document);
    if (nb.box) setPendingInsert(nb.box);
    setSelectedShotId(null);
    setSelectedId(newId);
    if (!playing) applyT(Math.max(0, nb.startSec + 0.01));
    toast.success(t('workbench.elementInserted'));
  };
  /** Layer: move a block up/down one layer (trackIndex±1, DOM order = stacking; 0 = video, clamped to [1,55]). */
  const bumpBlockLayer = (b: Block, dir: 1 | -1) => {
    const stackOrder = Math.max(1, Math.min(55, b.trackIndex + dir));
    const existing = documentRef.current.timeline.tracks.find((track) => track.type === 'graphics' && track.stackOrder === stackOrder);
    const used = new Set(documentRef.current.timeline.tracks.map((track) => track.id));
    let trackId = `track_graphics_${stackOrder}`;
    let suffix = 2;
    while (used.has(trackId)) trackId = `track_graphics_${stackOrder}_${suffix++}`;
    const edit = moveOverlayDocumentClip({
      document: documentRef.current,
      clipId: b.id,
      ...(existing ? { toTrackId: existing.id } : { newTrack: { id: trackId, stackOrder, name: `Graphics ${stackOrder}` } }),
    });
    if (!edit.ok) {
      toast.error(edit.error.message);
      return;
    }
    pushUndoSnapshot();
    setDocument(edit.document);
  };
  /** Block-level person-layer override: toggle between on-top-of / behind the person (defaults to global personFront, see engine Block.personLayer). */
  const togglePersonLayer = (b: Block) => {
    const behindNow = b.personLayer ? b.personLayer === 'behind' : !!compRef.current.personFx?.personFront;
    const edit = applyOverlayDocumentEdits({ document: documentRef.current, updates: [{ clipId: b.id, block: { personLayer: behindNow ? 'front' : 'behind' } }] });
    if (!edit.ok) {
      toast.error(edit.error.message);
      return;
    }
    pushUndoSnapshot();
    setDocument(edit.document);
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
  /** Floating toolbar "sync content": one capability for HTML data-edit slots and schema-backed kit props. */
  const [syncBusyId, setSyncBusyId] = useState<string | null>(null);
  const syncBlockContent = async (b: Block) => {
    const fill = studioProviders().syncFill;
    if (!fill || syncBusyId) return;
    const slots = b.slots as { innerHtml?: string; timelineBody?: string };
    const kitTarget = componentContentSyncTarget(b);
    let htmlDoc: Document | null = null;
    let nodes: Element[] = [];
    let items = kitTarget?.items ?? [];
    if (!kitTarget && typeof slots.innerHtml === 'string') {
      htmlDoc = new DOMParser().parseFromString(`<div id="__root">${slots.innerHtml}</div>`, 'text/html');
      nodes = Array.from(htmlDoc.querySelectorAll('#__root [data-edit]'));
      items = nodes.map((n, i) => ({ index: i, text: (n.textContent ?? '').trim() })).filter((x) => x.text);
    }
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
      const curTlb = slots.timelineBody ?? '';
      // HTML components may be structurally rewritten from their strong reference. Kit components
      // keep their typed schema and derived renderer, so only their content props go to this endpoint.
      const out = await fill(
        items,
        script,
        kitTarget || typeof slots.innerHtml !== 'string' ? undefined : { html: slots.innerHtml, timeline: curTlb, id: b.id },
      );
      // Sync timeline ① window alignment: prefer the span the LLM gives (it drops leading/trailing sentences unrelated to
      // the component — the previous "overlap-window min/max" pulled in unrelated leading segments, user hit this); fall back to the overlap window if not given
      const winLo = Math.min(...win.map((x) => x.start));
      const winHi = Math.max(...win.map((x) => x.end));
      const spanFrom = out.span ? Math.min(Math.max(out.span.from, winLo - 1), winHi) : winLo;
      const spanTo = out.span ? Math.max(Math.min(out.span.to, winHi + 1), spanFrom + 1) : winHi;
      const newStart = Math.max(0, Math.round(spanFrom * 100) / 100);
      const newDur = Math.max(1.5, Math.round((spanTo - newStart) * 100) / 100);
      let nextTlb: string | null = null;
      let nextSlots: Block['slots'];
      if (kitTarget) {
        nextSlots = { ...b.slots, props: kitTarget.apply(out.items) };
      } else {
        const byIndex = new Map(out.items.map((x) => [x.index, x.text]));
        // Component = strong reference: HTML may grow/shrink repeated units. If the structural
        // response is invalid, patch text nodes only and keep the authored layout and animation.
        const okHtml =
          typeof out.html === 'string' &&
          out.html.includes('data-edit') &&
          out.html.includes(`#${b.id}`) &&
          !/<script/i.test(out.html);
        let nextHtml = out.html ?? '';
        if (!okHtml) {
          nodes.forEach((n, i) => {
            const text = byIndex.get(i);
            if (text) n.textContent = text;
          });
          nextHtml = htmlDoc?.querySelector('#__root')?.innerHTML ?? slots.innerHtml ?? '';
        }
        // Only authored HTML owns an editable timeline body. Kit motion is derived from typed props.
        if (out.timeline) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-implied-eval
            new Function('tl', out.timeline);
            nextTlb = out.timeline;
          } catch {
            /* compile failed: discard, keep the original timeline */
          }
        }
        nextSlots = { ...b.slots, innerHtml: nextHtml, ...(nextTlb ? { timelineBody: nextTlb } : {}) };
      }
      const edit = applyOverlayDocumentEdits({
        document: documentRef.current,
        updates: [{
          clipId: b.id,
          startSec: newStart,
          durationSec: newDur,
          block: { slots: nextSlots },
        }],
      });
      if (!edit.ok) throw new Error(edit.error.message);
      pushUndoSnapshot();
      setDocument(edit.document);
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
