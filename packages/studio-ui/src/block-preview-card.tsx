'use client';

/**
 * Shared pieces for a single-block live preview card (used by both the component-library card and the template-panel
 * card, which previously each hand-copied a version that had started to drift):
 * - BlockPreviewFrame: blockPreviewDoc self-contained iframe (frozen stable frame) + proportional scaling; overlay via children.
 * - BlockKindFooter: KIND_META icon + label footer.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { type Block, type Composition, assembleBlockHtml, blockKind, blockPreviewDoc, previewMiniComp } from '@pireel/studio-engine/composition';
import { getTheme, themeVarsCss } from '@pireel/studio-engine/theme';
import { injectPreviewRuntime } from './sample-composition';
import { injectPreviewContentBoundsReporter, type PreviewContentBounds } from './preview-content-bounds';
import { KIND_META } from './kind-meta';
import { blockDisplayTitle } from './block-display-title';

/** Transparency checkerboard (drawn at screen-pixel scale on the container; drawing it into the scaled document blurs it — learned the hard way). */
const CHECKER_STYLE: CSSProperties = {
  backgroundColor: '#ffffff',
  backgroundImage:
    'linear-gradient(45deg,#d7dbe0 25%,transparent 25%,transparent 75%,#d7dbe0 75%),linear-gradient(45deg,#d7dbe0 25%,transparent 25%,transparent 75%,#d7dbe0 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0,8px 8px',
};

export function BlockPreviewFrame({
  comp,
  block,
  width,
  height,
  animate = false,
  replayKey,
  playOnReady = false,
  showLoading = false,
  onReady,
  ground = 'checker',
  fit = 'inset',
  focus,
  focusContent = false,
  children,
}: {
  comp: Composition;
  block: Block;
  width: number;
  /** Fixed card height; omitted = derived from the canvas aspect. With a fixed height the canvas
   *  (or the focus piece) is contain-fit and centered — used by fixed-height cards like the chat preview. */
  height?: number;
  /** Preview ground: 'checker' = honest ground (transparent checkerboard, library/card default); 'stage' = stage paper ground (theme wall). */
  ground?: 'stage' | 'checker';
  /** 'canvas' uses the entire preview viewport. 'inset' keeps the historical checkerboard margin. */
  fit?: 'canvas' | 'inset';
  /** Focus box (design-canvas px): given = show only this block (piece centered and enlarged, used by component list cards); omitted = whole canvas shrunk. */
  focus?: { x: number; y: number; w: number; h: number };
  /** Measure painted descendants inside a full-canvas custom block and frame the piece itself. */
  focusContent?: boolean;
  /** Animated preview: true = auto-loop; 'hover' = play on hover, return to stable frame on leave;
   *  'manual' = frozen on the stable frame, replayed only via replayKey. Default freezes the stable frame. */
  animate?: boolean | 'hover' | 'manual';
  /** Bump to replay the entrance once (used with animate='manual'): the preview plays from the
   *  start and settles back on the stable frame. Editing props re-renders WITHOUT replaying. */
  replayKey?: number;
  /** Notify the caller when the iframe and its render dependencies are ready. */
  onReady?: () => void;
  /** Play the entrance once after the iframe is ready; used by lightboxes that open from a poster. */
  playOnReady?: boolean;
  /** Show a lightweight loading cover until the current iframe document fires load. */
  showLoading?: boolean;
  /** Overlay layer (timestamp stamp / hover buttons / generating cover), mounted in the same relative container */
  children?: ReactNode;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Re-render the doc only when this block (or theme/canvas size/palette) changes — deliberately not depending on the whole comp,
  // otherwise any edit would reload the entire wall of iframes.
  const docLoop = animate === 'manual' ? 'hover' : animate; // same doc shape: paused, message-driven
  // The document is rebuilt only for STRUCTURAL changes (different block, template, canvas, theme,
  // ground, loop mode, timing/box). Content edits — the props panel, in-place text — patch the one
  // block inside the live document instead: rebuilding reloads gsap and replays everything, which
  // made tuning props feel like the preview was thrashing.
  const docKey = [
    block.id,
    block.templateId,
    `${comp.width}x${comp.height}`,
    comp.theme ?? '',
    JSON.stringify(comp.palette ?? null),
    ground,
    String(docLoop),
    block.durationSec,
    JSON.stringify(block.box ?? null),
    String(focusContent),
  ].join('|');
  const latest = useRef(block);
  latest.current = block;
  const doc = useMemo(
    () => {
      const base = injectPreviewRuntime(blockPreviewDoc(comp, latest.current, { loop: docLoop, ground }));
      return focusContent ? injectPreviewContentBoundsReporter(base, block.id) : base;
    },
    // `docKey` deliberately fingerprints only structural composition fields; depending on the
    // full composition would reload every iframe when an unrelated block changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [block.id, docKey, focusContent],
  );
  const [loadedDocKey, setLoadedDocKey] = useState<string | null>(null);
  const iframeReady = loadedDocKey === docKey;
  const [measuredFocus, setMeasuredFocus] = useState<PreviewContentBounds | null>(null);
  useEffect(() => setMeasuredFocus(null), [docKey]);
  useEffect(() => {
    if (!focusContent) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as { type?: unknown; blockId?: unknown; rect?: Partial<PreviewContentBounds> } | null;
      if (!data || data.type !== 'hf:previewContentBounds' || data.blockId !== block.id) return;
      const rect = data.rect;
      const next = rect && [rect.x, rect.y, rect.w, rect.h].every((value) => typeof value === 'number' && Number.isFinite(value))
        ? { x: rect.x!, y: rect.y!, w: Math.max(1, rect.w!), h: Math.max(1, rect.h!) }
        : null;
      if (!next) return;
      setMeasuredFocus((previous) =>
        previous && Math.abs(previous.x - next.x) < 0.5 && Math.abs(previous.y - next.y) < 0.5 && Math.abs(previous.w - next.w) < 0.5 && Math.abs(previous.h - next.h) < 0.5
          ? previous
          : next,
      );
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [block.id, focusContent]);
  // Content patch: assembled against the same mini-composition the document used, so a patched node
  // is byte-identical to what a rebuild would have produced.
  const patchedKey = useRef(docKey);
  useEffect(() => {
    if (patchedKey.current !== docKey) {
      patchedKey.current = docKey; // the doc itself was just rebuilt with this block — nothing to patch
      return;
    }
    const mini = previewMiniComp(comp, block);
    const r = assembleBlockHtml({ ...block, startSec: 0 }, mini);
    iframeRef.current?.contentWindow?.postMessage({ type: 'hf:blockAdd', blockId: block.id, html: r.html, timelineBody: r.timelineBody }, '*');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block, docKey]);
  // Most previews preserve the historical inset that makes transparency obvious. Component-library
  // previews opt into full-canvas fit: opaque designs fill the card while transparent designs still
  // show checkerboard through their own empty areas.
  const inset = fit === 'canvas' ? 1 : ground === 'checker' ? 0.86 : 1;
  const h = height ?? Math.round(comp.height * (width / comp.width));
  // focus framing: pick scale from the piece's bounding box, align piece center to card center — list cards show the "piece itself", not the whole canvas
  // (contain-fit min() reduces to the old width-driven scale when h is aspect-derived)
  const framedFocus = focus ?? (focusContent ? measuredFocus ?? undefined : undefined);
  const scale = framedFocus ? Math.min((width * inset) / framedFocus.w, (h * inset) / framedFocus.h) : Math.min(width / comp.width, h / comp.height) * inset;
  const padX = framedFocus ? Math.round(width / 2 - (framedFocus.x + framedFocus.w / 2) * scale) : Math.round((width - comp.width * scale) / 2);
  const padY = framedFocus ? Math.round(h / 2 - (framedFocus.y + framedFocus.h / 2) * scale) : Math.round((h - comp.height * scale) / 2);
  // The sandboxed iframe (opaque origin) can't reach __hfPreview, so hover play control goes through postMessage
  const setLoop = (on: boolean, once = false) => iframeRef.current?.contentWindow?.postMessage({ type: 'hf-loop', on, once }, '*');
  // Replay on demand. Skips the initial mount (the doc already opens on the stable frame) and
  // never fires on prop edits — those re-render the doc, which opens frozen again.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (replayKey !== undefined) setLoop(true, true);
  }, [replayKey]);
  return (
    <div
      className={`relative overflow-hidden ${ground === 'checker' ? '' : 'bg-black/40'}`}
      style={{ width, height: h, ...(ground === 'checker' ? CHECKER_STYLE : {}) }}
      onPointerEnter={animate === 'hover' ? () => setLoop(true) : undefined}
      onPointerLeave={animate === 'hover' ? () => setLoop(false) : undefined}
    >
      <iframe
        ref={iframeRef}
        title={blockDisplayTitle(block)}
        srcDoc={doc}
        sandbox="allow-scripts"
        tabIndex={-1}
        loading="lazy"
        onLoad={() => {
          setLoadedDocKey(docKey);
          onReady?.();
          if (playOnReady) setLoop(true, true);
        }}
        className="pointer-events-none"
        style={{ position: 'absolute', left: padX, top: padY, width: comp.width, height: comp.height, border: 0, transform: `scale(${scale})`, transformOrigin: 'top left' }}
      />
      {showLoading && !iframeReady && (
        <div data-preview-loading className="bg-panel-2/85 absolute inset-0 z-10 flex items-center justify-center">
          <span className="border-ink-4 border-t-ink size-4 animate-spin rounded-full border-2" />
        </div>
      )}
      {children}
    </div>
  );
}

export function BlockKindFooter({ block }: { block: Block }) {
  const meta = KIND_META[blockKind(block)];
  const Icon = meta.icon;
  return (
    <div className="flex items-center gap-1 px-1.5 py-1">
      <Icon size={11} className={`${meta.dot} shrink-0`} />
      <span className="text-ink truncate text-[10px]">{blockDisplayTitle(block)}</span>
    </div>
  );
}

/* ============================ Inline preview (trusted blocks only) ============================ */

/** Main page lazy-loads self-hosted GSAP on demand (same /vendor/gsap.min.js as the preview iframe), once per process. */
type GsapLike = { timeline: (o?: Record<string, unknown>) => GsapTimeline };
interface GsapTimeline {
  play(t?: number): void;
  pause(t?: number): void;
  progress(v: number): GsapTimeline;
  kill(): void;
}
let _gsap: Promise<GsapLike | null> | null = null;
function loadGsap(): Promise<GsapLike | null> {
  const w = window as unknown as { gsap?: GsapLike };
  if (w.gsap) return Promise.resolve(w.gsap);
  _gsap ??= new Promise((resolve) => {
    const el = document.createElement('script');
    el.src = '/vendor/gsap.min.js';
    el.onload = () => resolve((window as unknown as { gsap?: GsapLike }).gsap ?? null);
    el.onerror = () => resolve(null);
    document.head.appendChild(el);
  });
  return _gsap;
}

/**
 * Inline block preview — ONLY for trusted blocks we hand-write ourselves (frame-dialect covers/showcase):
 * no iframe (switching panels no longer flashes white, no per-card document pulling scripts), renders innerHtml directly +
 * runs the timeline with the main page's GSAP. Trust boundary unchanged: LLM-generated blocks still go only through the BlockPreviewFrame sandbox.
 * Font difference: the main app uses the system font stack (no Noto subsets loaded); serif/mono fall back within the stack, acceptable.
 */
/** Placeholder person in the preview (half-body silhouette): demonstrates "graphics floating over the talking-head person".
 *  front=false sits behind the graphics (normal overlay); front=true sits in front (text-behind-person / person on top);
 *  a non-empty strokeColor = the theme's recommended person outline (sticker white edge) drawn directly on the silhouette. */
export interface PreviewPerson {
  front?: boolean;
  strokeColor?: string | null;
  /** hero = cover protagonist size; corner = small figure in the output card's corner (default hero). */
  size?: 'hero' | 'corner';
}

function PersonBust({ person, canvasH }: { person: PreviewPerson; canvasH: number }) {
  const h = Math.round(canvasH * (person.size === 'corner' ? 0.46 : 0.62));
  return (
    <svg
      viewBox="0 0 200 220"
      style={{
        position: 'absolute',
        right: person.size === 'corner' ? '2.5%' : '6%',
        bottom: -Math.round(h * 0.04),
        height: h,
        pointerEvents: 'none',
        ...(person.strokeColor ? { filter: 'drop-shadow(0 10px 22px rgb(0 0 0 / 0.2))' } : {}),
      }}
      aria-hidden
    >
      <path
        d="M100 14c24 0 41 19 41 45 0 19-9 35-22 43 38 9 66 38 75 84 3 16-7 30-23 30H29c-16 0-26-14-23-30 9-46 37-75 75-84-13-8-22-24-22-43 0-26 17-45 41-45z"
        fill="var(--panel-2)"
        stroke={person.strokeColor ?? 'var(--line)'}
        strokeWidth={person.strokeColor ? 14 : 2}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function InlineBlockPreview({
  comp,
  block,
  width,
  animate = false,
  person = null,
  ground = 'checker',
  backdrop,
  children,
}: {
  comp: Composition;
  block: Block;
  width: number;
  /** true = auto-loop; 'hover' = play on hover, return to stable frame on leave; false = freeze the stable frame. */
  animate?: boolean | 'hover';
  /** Placeholder person; null = don't draw (non-theme scenes). */
  person?: PreviewPerson | null;
  /** Preview ground: 'checker' = honest ground (transparent checkerboard, library/card default); 'stage' = stage paper ground (theme wall). */
  ground?: 'stage' | 'checker';
  /** Trusted scene layer behind the block, used when a card previews the block in composition rather than in isolation. */
  backdrop?: ReactNode;
  /** Screen-space chrome over the scaled stage, such as a caption sample. */
  children?: ReactNode;
}) {
  // Use the production assembler here as well. Rendering only the template body
  // silently discarded block.box, so Frame/Motion Graphic samples appeared as a
  // full-canvas layer even though their production placement was safe.
  const { html, timelineBody } = useMemo(() => assembleBlockHtml(block, comp), [block, comp]);
  const theme = getTheme(comp.theme);
  const vars = useMemo(() => themeVarsCss(theme, comp.palette), [theme, comp.palette]);
  const stageBg = comp.palette?.paper ?? theme.background;
  const inset = ground === 'checker' ? 0.86 : 1;
  const scale = (width / comp.width) * inset;
  const h = Math.round(comp.height * (width / comp.width));
  const padX = Math.round((width * (1 - inset)) / 2);
  const padY = Math.round((h * (1 - inset)) / 2);
  const tlRef = useRef<GsapTimeline | null>(null);

  useEffect(() => {
    let dead = false;
    void loadGsap().then((g) => {
      if (dead || !g) return;
      // animate=true (detail card): loop, settle one beat after each pass then repeat.
      // Otherwise (cover/static): no loop — default freezes at the final state (progress 1);
      // hover plays once from the start, ending naturally at the final state.
      const tl = g.timeline(animate === true ? { paused: true, repeat: -1, repeatDelay: 1.2 } : { paused: true });
      try {
        new Function('tl', timelineBody)(tl);
      } catch {
        /* bad timeline -> static display */
      }
      tlRef.current = tl;
      if (animate === true) tl.play(0);
      else tl.progress(1).pause();
    });
    return () => {
      dead = true;
      tlRef.current?.kill();
      tlRef.current = null;
    };
  }, [timelineBody, animate]);

  return (
    <div
      className="relative overflow-hidden"
      style={{ width, height: h, ...(ground === 'checker' ? CHECKER_STYLE : {}) }}
      onPointerEnter={animate === 'hover' ? () => tlRef.current?.play(0) : undefined}
      onPointerLeave={animate === 'hover' ? () => tlRef.current?.progress(1).pause() : undefined}
    >
      <div
        ref={(el) => {
          if (el)
            el.style.cssText = `position:absolute;left:${padX}px;top:${padY}px;width:${comp.width}px;height:${comp.height}px;transform:scale(${scale});transform-origin:top left;overflow:hidden;${ground === 'checker' ? 'background:transparent;' : `background:${stageBg};`}${vars}font-family:var(--font-body);color:var(--fg);`;
        }}
      >
        {backdrop}
        {/* Placeholder person underneath (normal overlay: graphics in front of the person) */}
        {person && !person.front && <PersonBust person={person} canvasH={comp.height} />}
        {/* The assembled block includes the same framing box and sizing context used by editor/export. */}
        <div style={{ position: 'absolute', inset: 0 }} dangerouslySetInnerHTML={{ __html: html }} />
        {/* Person on top (personFront: text-behind-person / sticker person) -> silhouette sits in front of the graphics */}
        {person?.front && <PersonBust person={person} canvasH={comp.height} />}
      </div>
      {children}
    </div>
  );
}
