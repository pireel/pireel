/**
 * Built-in template render impls + registration (importing this file registers them;
 * the side effect is triggered via the './composition' barrel). Selectors are always
 * scoped by #blockId; text nodes get data-edit for in-place editing in the preview.
 * Add a template = add a render + registerTemplate here, and the UI (template panel /
 * component library / inspector enums) grows automatically.
 */

import {
  type Rendered,
  type Slots,
  type FxWord,
  escapeAttr,
  escapeHtml,
  n,
  registerTemplate,
  span2,
  str,
  strArr,
  wordsOf,
} from './composition-core';
import { type CaptionPreset, DEFAULT_SUB_CAPTION_PRESET, getCaptionPreset } from './caption-presets';
import { t } from './i18n';
import { DEFAULT_CAPTION_WIDTH_PCT } from './composition-core';
import { BASE_CAPTION_FONT_PX } from './caption-presets';
import { chunkWordsBalanced, estWordEm, latinJoin, measureTextPx, wordsFromText } from './caption-fx';

/* ============================ template render impls ============================ */

function renderTitle(slots: Slots, id: string): Rendered {
  const text = str(slots.text);
  const sub = str(slots.sub);
  const innerHtml = `
<div class="t-root">
  <h1 data-edit="text">${escapeHtml(text)}</h1>
  ${sub ? `<div class="sub" data-edit="sub">${escapeHtml(sub)}</div>` : ''}
</div>
<style>
#${id} .t-root { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
#${id} h1 { color:var(--fg); font-family:var(--font-head); font-size:104px; font-weight:800; text-align:center; max-width:82%; line-height:1.15; text-shadow:0 2px 30px rgba(0,0,0,0.5); }
#${id} .t-root::after { content:''; width:96px; height:4px; margin-top:32px; background:var(--accent); border-radius:2px; box-shadow:var(--glow); }
#${id} .sub { color:var(--accent); font-size:42px; font-weight:600; margin-top:24px; letter-spacing:0.04em; }
</style>`.trim();
  const timelineBody =
    `tl.from('#${id} h1', { opacity: 0, y: 60, duration: 0.6, ease: 'power3.out' }, 0);` +
    (sub ? `\ntl.from('#${id} .sub', { opacity: 0, y: 30, duration: 0.5 }, 0.2);` : '');
  return { innerHtml, timelineBody };
}

function renderStat(slots: Slots, id: string): Rendered {
  const value = str(slots.value);
  const label = str(slots.label);
  const innerHtml = `
<div class="stat-root">
  <div class="stat-val" data-edit="value">${escapeHtml(value)}</div>
  <div class="stat-label" data-edit="label">${escapeHtml(label)}</div>
</div>
<style>
#${id} .stat-root { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }
#${id} .stat-val { font-family:var(--font-num); font-weight:800; font-size:280px; line-height:1; letter-spacing:-0.03em; color:var(--accent); text-shadow:var(--glow); }
#${id} .stat-label { margin-top:28px; font-family:var(--font-head); font-size:48px; font-weight:600; color:var(--fg); }
</style>`.trim();
  const timelineBody = [
    `tl.from('#${id} .stat-val', { autoAlpha:0, scale:0.6, duration:0.4, ease:'back.out(1.8)' }, 0);`,
    `tl.from('#${id} .stat-label', { autoAlpha:0, y:24, duration:0.35 }, 0.18);`,
  ].join('\n');
  return { innerHtml, timelineBody };
}

function renderList(slots: Slots, id: string): Rendered {
  const title = str(slots.title);
  const items = strArr(slots.items);
  const lis = items
    .map((it, i) => `<li id="${id}-li${i}"><span class="mk"></span><span data-edit="items.${i}">${escapeHtml(it)}</span></li>`)
    .join('');
  const innerHtml = `
<div class="list-root">
  ${title ? `<div class="list-title" data-edit="title">${escapeHtml(title)}</div>` : ''}
  <ul>${lis}</ul>
</div>
<style>
#${id} .list-root { position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; padding:0 9%; }
#${id} .list-title { font-family:var(--font-head); font-size:64px; font-weight:800; color:var(--fg); margin-bottom:48px; }
#${id} ul { list-style:none; display:flex; flex-direction:column; gap:36px; }
#${id} li { display:flex; align-items:center; gap:28px; font-family:var(--font-body); font-size:54px; font-weight:600; color:var(--fg); }
#${id} li .mk { flex:none; width:26px; height:26px; background:var(--accent); box-shadow:var(--glow); border-radius:6px; }
</style>`.trim();
  const lines = [`tl.from('#${id} .list-title', { autoAlpha:0, y:20, duration:0.3 }, 0);`];
  items.forEach((_, i) => lines.push(`tl.from('#${id}-li${i}', { autoAlpha:0, x:-40, duration:0.3, ease:'power2.out' }, ${0.15 + i * 0.12});`));
  return { innerHtml, timelineBody: lines.join('\n') };
}

function renderCaption(slots: Slots, id: string): Rendered {
  const words = wordsOf(slots.words);
  const yPct = typeof slots.yPct === 'number' ? (slots.yPct as number) : 88;
  const xPct = typeof slots.xPct === 'number' ? (slots.xPct as number) : 50;
  const wPct = typeof slots.wPct === 'number' ? (slots.wPct as number) : DEFAULT_CAPTION_WIDTH_PCT;
  const scale = typeof slots.scale === 'number' && slots.scale > 0 ? (slots.scale as number) : 1;
  const hPct = typeof slots.hPct === 'number' && slots.hPct > 0 ? (slots.hPct as number) : 0;
  if (words.length === 0) return { innerHtml: '<div></div>', timelineBody: '' };
  // Captions vs blocks: effect='kinetic-slam' is a keyword-slam BLOCK (has its own box, positioned independently);
  // everything else is a sentence caption → preset channel (slots.preset is the block's initial form; global captionStyle overrides it at assemble time).
  if (str(slots.effect) === 'kinetic-slam') return renderSlam(words, id, scale);
  const subStyle = {
    ...(typeof slots.subYPct === 'number' ? { yPct: slots.subYPct as number } : {}),
    ...(typeof slots.subXPct === 'number' ? { xPct: slots.subXPct as number } : {}),
    ...(typeof slots.subWPct === 'number' ? { wPct: slots.subWPct as number } : {}),
    ...(typeof slots.subScale === 'number' && (slots.subScale as number) > 0 ? { scale: slots.subScale as number } : {}),
    ...(typeof slots.subHPct === 'number' && (slots.subHPct as number) > 0 ? { hPct: slots.subHPct as number } : {}),
  };
  const canvasW = typeof slots.canvasW === 'number' && (slots.canvasW as number) > 0 ? (slots.canvasW as number) : 1080;
  // Per-line visual overrides (global captionStyle baked into slots at assemble time): color = text color,
  // bg = plate color (null forces no plate); subPreset/subColor/subBg = the translation line's own look.
  const ov = {
    ...(typeof slots.color === 'string' ? { color: slots.color as string } : {}),
    ...(slots.bg === null || typeof slots.bg === 'string' ? { bg: slots.bg as string | null } : {}),
    ...(typeof slots.bold === 'boolean' ? { bold: slots.bold as boolean } : {}),
  };
  const subOv = {
    ...(typeof slots.subPreset === 'string' ? { preset: slots.subPreset as string } : {}),
    ...(typeof slots.subColor === 'string' ? { color: slots.subColor as string } : {}),
    ...(slots.subBg === null || typeof slots.subBg === 'string' ? { bg: slots.subBg as string | null } : {}),
    ...(typeof slots.subBold === 'boolean' ? { bold: slots.subBold as boolean } : {}),
  };
  return renderPresetCaption(words, getCaptionPreset(str(slots.preset) || undefined), yPct, xPct, wPct, scale, id, hPct, str(slots.sub) || undefined, subStyle, canvasW, ov, subOv, slots.cue === true);
}

/** Preset font → CSS font-family (serif → Noto Serif SC, mono → theme --font-num, default → theme body). */
function presetFontCss(p: CaptionPreset): string {
  if (p.font === 'serif') return `'Noto Serif SC','Songti SC',serif`;
  if (p.font === 'mono') return 'var(--font-num)';
  return 'var(--font-body)';
}

/** Concrete font stack for canvas width measurement (CSS vars can't be used in canvas font;
 *  matches what the document actually loads: --font-body=Noto Sans SC / --font-num=IBM Plex Mono, see theme.ts). */
function presetFontFamilies(p: CaptionPreset): string {
  if (p.font === 'serif') return "'Noto Serif SC','Songti SC',serif";
  if (p.font === 'mono') return "'IBM Plex Mono',ui-monospace,monospace";
  return "'Noto Sans SC','PingFang SC',sans-serif";
}

/**
 * Preset captions: emphasis = highlight each word as it's spoken (color change / underline
 * slide-in / color-block pop); line = whole sentence fades in as a clean caption, no per-word
 * animation. Visuals (colors / background plate / decoration) all come from the preset table.
 * Long lines are split into segments at render time (chunkWordsByWidth): each segment is one
 * .cap-line, cycled by word time — short single lines don't blur the screen; splitting isn't
 * persisted, blocks stay one-sentence-per-block (old blocks/drafts work automatically).
 */
/**
 * Caption line segmentation (a SINGLE spec shared by render and edit modes — workbench
 * selection highlight must locate the same segments). Split budget (in px, item-for-item
 * from the render CSS, all accounted at the ROUNDED real value; lines are nowrap, so even if
 * underestimated it's only symmetric micro-overflow, never a visual wrap):
 *   box width = wPct% × canvas width (canvasW from comp.width — the canvas is width-normalized
 *     to 1080 for every aspect (normalizeDims), only height varies; still passed as a param, never hardcoded)
 *   − plate left/right padding: exactly the CSS formula round(fs×0.42)×2 (only when there's a plate)
 *   − 0.15em safety margin (subpixel diff between canvas and the layout engine / font-not-ready fallback)
 *   inter-word flex gap = round(fs×0.18), n−1 for n words: accounted precisely as "one per word, one added back from budget".
 *   word width = canvas measureText actual (pretext-style, italic/weight/size/font-stack match
 *     render; the measuring document must load the same fonts, see STUDIO_FONTS_HREF); node/test
 *     env has no canvas → glyph-class estimate table fallback, always taking the larger of the two
 *     (rather cut early than overflow into a wrap).
 */

export function captionLineSegments(words: FxWord[], p: CaptionPreset, wPct: number, scale: number, canvasW = 1080): FxWord[][] {
  const fs = Math.max(10, Math.round(BASE_CAPTION_FONT_PX * scale));
  const gapPx = Math.round(fs * 0.18);
  const spPx = Math.round(fs * 0.12); // extra gap at Latin word boundaries (same spec as render .sp)
  const padPx = p.bg ? Math.round(fs * 0.42) * 2 : 0;
  const canvasFont = `${p.italic ? 'italic ' : ''}${p.weight} ${fs}px ${presetFontFamilies(p)}`;
  const wordPx = (t: string) => {
    const est = estWordEm(t) * fs;
    const m = measureTextPx(t, canvasFont);
    return m == null ? est : Math.max(m, est); // take the larger: estimate is the floor, canvas only tightens never loosens
  };
  const extra = new Map<FxWord, number>();
  words.forEach((w, i) => {
    if (i < words.length - 1 && latinJoin(w.text, words[i + 1]!.text)) extra.set(w, spPx);
  });
  const budgetPx = (wPct / 100) * canvasW - padPx - fs * 0.15;
  return chunkWordsBalanced(words, Math.max(fs * 2, budgetPx + gapPx), (w) => wordPx(w.text) + gapPx + (extra.get(w) ?? 0));
}

function renderPresetCaption(words: FxWord[], p: CaptionPreset, yPct: number, xPct: number, wPct: number, scale: number, id: string, hPct = 0, sub?: string, subStyle?: { yPct?: number; xPct?: number; wPct?: number; scale?: number; hPct?: number }, canvasW = 1080, ov: { color?: string; bg?: string | null; bold?: boolean } = {}, subOv: { preset?: string; color?: string; bg?: string | null; bold?: boolean } = {}, cue = false): Rendered {
  // Effective preset = preset + user overrides (text color / plate). Reassigning p keeps every existing
  // use (segmentation budget, pill, css, karaoke revert color) consistent with the overridden look.
  if (ov.color != null || ov.bg !== undefined) p = { ...p, ...(ov.color != null ? { text: ov.color } : {}), ...(ov.bg !== undefined ? { bg: ov.bg ?? undefined } : {}) };
  const { start } = span2(words);
  // scale = FONT-SIZE coefficient (user-set: scaling adjusts font size, not a region transform) —
  // size/plate padding/decoration all lay out from the scaled font size, text truly reflows, not a bitmap-style scale of the whole block
  const fs = Math.max(10, Math.round(BASE_CAPTION_FONT_PX * scale));
  // Bold override: true forces 800, false forces regular 500; unset = the preset's own weight
  const mainWeight = ov.bold == null ? p.weight : ov.bold ? 800 : 500;
  const deco = p.mode === 'emphasis' && p.deco ? `<span class="deco"></span>` : '';
  // Both modes split into visual lines at the CURRENT font size (same px-accurate budget). The
  // difference is presentation: derived cue blocks STACK their lines (all visible, one plate per
  // line — standard subtitle look; at scale 1 a cue fits one line so the stack is a single line);
  // legacy sentence blocks keep the old one-line-at-a-time rotation.
  const segs = captionLineSegments(words, p, wPct, scale, canvasW);
  let wIdx = 0;
  const segHtml = segs
    .map((g, si) => {
      const spans = g
        .map((w, k) => {
          const i = wIdx++;
          const sp = k < g.length - 1 && latinJoin(w.text, g[k + 1]!.text) ? ' sp' : '';
          return `<span class="w${sp}" id="${id}-w${i}">${deco}<span class="t">${escapeHtml(w.text)}</span></span>`;
        })
        .join('');
      return `<div class="cap-line" id="${id}-s${si}">${spans}</div>`;
    })
    .join('');
  const pill = p.bg ? `background:${p.bg}; padding:${Math.round(fs * 0.22)}px ${Math.round(fs * 0.42)}px; border-radius:${Math.round(fs * 0.28)}px;` : '';
  // Bilingual sub-line: full-sentence translation sits directly under the main line (main line
  // bottom anchored at yPct, sub-line top anchored at the same line), visuals follow the preset
  // (same font/plate/shadow, 0.6× size), no per-word animation — the sub-line has no word times.
  // The translation line is a "second caption line" on the same spec as the main line: word-split
  // reflow via the same captionLineSegments budget (box width × font size, live), anchored to the
  // main line (line bottom=yPct, center=xPct, box width wPct, box height hPct → min-height), plate/
  // shadow/font all follow the preset. Default (subStyle.yPct unset) = follow directly under the main line.
  // Translation line's visual base: its OWN preset (independent of the main line; ln-clean by default),
  // sub color/bg overrides apply on top.
  let subP = getCaptionPreset(subOv.preset ?? DEFAULT_SUB_CAPTION_PRESET);
  if (subOv.color != null || subOv.bg !== undefined) subP = { ...subP, ...(subOv.color != null ? { text: subOv.color } : {}), ...(subOv.bg !== undefined ? { bg: subOv.bg ?? undefined } : {}) };
  const subScale = subStyle?.scale ?? scale * 0.7;
  const subFs = Math.max(9, Math.round(BASE_CAPTION_FONT_PX * subScale));
  const subW = subStyle?.wPct ?? wPct;
  const subSegs = sub ? captionLineSegments(wordsFromText(sub, 0, 1), subP, subW, subScale, canvasW) : [];
  const subPill = subP.bg ? `background:${subP.bg}; padding:${Math.round(subFs * 0.18)}px ${Math.round(subFs * 0.5)}px; border-radius:${Math.round(subFs * 0.28)}px;` : '';
  const subHtml = sub
    ? `<div class="cap-sub" id="${id}-sub">${subSegs.map((g) => `<div class="cap-sub-line">${g.map((w, k) => `<span${k < g.length - 1 && latinJoin(w.text, g[k + 1]!.text) ? ' class="sp"' : ''}>${escapeHtml(w.text)}</span>`).join('')}</div>`).join('')}</div>`
    : '';
  const subAnchor = subStyle?.yPct != null ? `bottom:${n(100 - subStyle.yPct)}%;` : `top:calc(${n(yPct)}% + ${Math.round(fs * 0.2)}px);`;
  // Cue mode: lines live in a bottom-anchored column (.cap-stack) — the stack owns the position
  // anchor/box width/min-height; each line hugs its own text with its own plate.
  // ONE plate around the whole stack (multi-line = a single rounded backdrop, not one strip per line);
  // the stack hugs its widest line (width:auto), so a single-line cue looks exactly like before.
  const stackCss = cue
    ? `\n#${id} .cap-stack { position:absolute; left:${n(xPct)}%; bottom:${n(100 - yPct)}%; transform:translateX(-50%); width:auto; max-width:${n(wPct)}%; display:flex; flex-direction:column; align-items:center; justify-content:center; row-gap:${Math.round(fs * 0.12)}px; pointer-events:auto; ${hPct > 0 ? `min-height:${n(hPct)}%; ` : ''}${pill} }`
    : '';
  const subCss = sub
    ? `\n#${id} .cap-sub { position:absolute; pointer-events:auto; left:${n(subStyle?.xPct ?? xPct)}%; ${subAnchor} transform:translateX(-50%); width:auto; max-width:${n(subW)}%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:${Math.round(subFs * 0.15)}px; ${subStyle?.hPct ? `min-height:${n(subStyle.hPct)}%; ` : ''}${subPill} }
#${id} .cap-sub-line span.sp { margin-right:${Math.round(subFs * 0.12)}px; }\n#${id} .cap-sub-line span { position:relative; top:-0.04em; flex:none; white-space:nowrap; }\n#${id} .cap-sub-line { display:flex; flex-wrap:nowrap; justify-content:center; align-items:center; gap:${Math.round(subFs * 0.18)}px; max-width:100%; text-align:center; color:${subP.text}; font-family:${presetFontCss(subP)}; font-size:${subFs}px; font-weight:${subOv.bold == null ? Math.max(500, subP.weight - 200) : subOv.bold ? 700 : 400}; line-height:1.35; ${subP.italic ? 'font-style:italic; ' : ''}${!subP.bg ? 'text-shadow:0 2px 12px rgba(0,0,0,0.85),0 0 3px rgba(0,0,0,0.8); ' : ''} }`
    : '';
  const decoCss =
    p.deco === 'highlight'
      ? `#${id} .w .deco { position:absolute; inset:${-fs * 0.08}px ${-fs * 0.12}px; background:${p.decoColor}; border-radius:${Math.round(fs * 0.16)}px; transform:scaleX(0); transform-origin:left center; }`
      : p.deco === 'underline'
        ? `#${id} .w .deco { position:absolute; left:2px; right:2px; bottom:${-fs * 0.14}px; height:${Math.max(3, Math.round(fs * 0.08))}px; background:${p.decoColor}; border-radius:3px; transform:scaleX(0); transform-origin:left center; }`
        : '';
  // top:-0.04em on .w/.cap-sub-line span = CJK optical vertical centering: Noto Sans SC's ascent/descent
  // (1.16/0.29em) far exceed line-height, the negative half-leading pushes the baseline down, and CJK
  // ink doesn't use the descent zone → text sits ~0.07em low in the plate (measured with pixel probe
  // cap-center-probe.mjs; after the fix top/bottom whitespace is level at 15/16px).
  const css = `
#${id} .cap-root { position:absolute; inset:0; }
${stackCss}
#${id} .cap-line { ${cue ? 'position:relative; max-width:100%;' : `position:absolute; left:${n(xPct)}%; bottom:${n(100 - yPct)}%; transform:translateX(-50%); transform-origin:center bottom; width:${n(wPct)}%; ${hPct > 0 ? `min-height:${n(hPct)}%; ` : ''}`}display:flex; flex-wrap:nowrap; align-items:center; gap:${Math.round(fs * 0.18)}px; justify-content:center; pointer-events:auto; ${cue ? '' : pill} }
#${id} .w { position:relative; top:-0.04em; flex:none; white-space:nowrap; color:${p.text}; font-family:${presetFontCss(p)}; font-size:${fs}px; font-weight:${mainWeight}; ${p.italic ? 'font-style:italic;' : ''} line-height:1.2; ${!p.bg ? 'text-shadow:0 2px 12px rgba(0,0,0,0.85),0 0 3px rgba(0,0,0,0.8);' : ''} }
${decoCss}
#${id} .w .t { position:relative; z-index:1; }\n#${id} .w.sp { margin-right:${Math.round(fs * 0.12)}px; }${subCss}`.trim();

  // Legacy segment cycling: all hidden first; each segment enters at its first word's time, and goes
  // dark when the next enters (last segment stays with the block to the end). Enter/exit are hard cuts
  // (set): the fade-in + rise version had a 0.22s semi-transparent gap between sentences that felt like flicker in playback (user-reported).
  // Cue mode has NO cycling — all stacked lines are simply visible; the block window gates on/off.
  const lines: string[] = cue ? [] : [`gsap.set('#${id} .cap-line', { autoAlpha: 0 });`];
  if (sub) lines.push(`tl.set('#${id}-sub', { autoAlpha: 1 }, 0);`);
  if (!cue) {
    segs.forEach((g, si) => {
      const segStart = si === 0 ? 0 : Math.max(0, g[0]!.start - start);
      lines.push(`tl.set('#${id}-s${si}', { autoAlpha: 1 }, ${n(segStart)});`);
      const nxt = segs[si + 1];
      if (nxt) lines.push(`tl.set('#${id}-s${si}', { autoAlpha: 0 }, ${n(Math.max(0, nxt[0]!.start - start))});`);
    });
  }
  if (p.mode === 'emphasis') {
    words.forEach((w, i) => {
      const ws = w.start - start;
      const we = Math.max(w.start - start + 0.15, w.end - start);
      if (p.emphasis) {
        // Current word color change (karaoke-style: lights up when spoken, reverts after)
        lines.push(`tl.set('#${id}-w${i} .t', { color:'${p.emphasis}' }, ${n(ws)});`);
        lines.push(`tl.set('#${id}-w${i} .t', { color:'${p.text}' }, ${n(we)});`);
      }
      if (p.deco) {
        lines.push(`tl.fromTo('#${id}-w${i} .deco', { scaleX:0 }, { scaleX:1, duration:0.12, ease:'power3.out' }, ${n(ws)});`);
        lines.push(`tl.to('#${id}-w${i} .deco', { scaleX:0, duration:0.1 }, ${n(we)});`);
      }
    });
  }
  const mainHtml = cue ? `<div class="cap-stack">${segHtml}</div>` : segHtml;
  return { innerHtml: `<div class="cap-root">${mainHtml}${subHtml}</div>\n<style>${css}</style>`, timelineBody: lines.join('\n') };
}

function renderSlam(words: FxWord[], id: string, scale = 1): Rendered {
  const { start } = span2(words);
  const spans = words.map((w, i) => `<span class="w" id="${id}-w${i}">${escapeHtml(w.text)}</span>`).join('');
  const css = `
#${id} .cap-root { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; }
#${id} .w { position:absolute; color:var(--fg); font-size:${Math.max(24, Math.round(150 * scale))}px; font-weight:800; max-width:90%; text-align:center; }`.trim();
  const dirs = [
    ['-0.6em', '0'],
    ['0.6em', '0'],
    ['0', '0.5em'],
    ['0', '-0.5em'],
  ];
  const lines: string[] = [`gsap.set('#${id} .w', { autoAlpha: 0 });`];
  words.forEach((w, i) => {
    const ws = w.start - start;
    const we = w.end - start;
    const d = dirs[i % dirs.length]!;
    lines.push(`tl.fromTo('#${id}-w${i}', { autoAlpha:0, scale:0.55, x:'${d[0]}', y:'${d[1]}' }, { autoAlpha:1, scale:1, x:0, y:0, duration:0.22, ease:'back.out(2.2)' }, ${n(ws)});`);
    lines.push(`tl.to('#${id}-w${i}', { autoAlpha:0, scale:1.08, duration:0.12 }, ${n(Math.max(ws + 0.22, we))});`);
  });
  return { innerHtml: `<div class="cap-root">${spans}</div>\n<style>${css}</style>`, timelineBody: lines.join('\n') };
}

export function renderTransition(slots: Slots, id: string): Rendered {
  const effect = str(slots.effect, 'wipe');
  if (effect === 'flash') {
    return {
      innerHtml: `<div class="tr"></div>\n<style>#${id} .tr{position:absolute;inset:0;background:var(--fg);opacity:0;}</style>`,
      timelineBody: `tl.to('#${id} .tr',{opacity:0.85,duration:0.1,ease:'power2.in'},0);\ntl.to('#${id} .tr',{opacity:0,duration:0.28,ease:'power2.out'},0.1);`,
    };
  }
  if (effect === 'fade') {
    // fade: dip to black then back out, the cut happens at the darkest moment
    return {
      innerHtml: `<div class="tr"></div>\n<style>#${id} .tr{position:absolute;inset:0;background:#000;opacity:0;}</style>`,
      timelineBody: `tl.to('#${id} .tr',{opacity:1,duration:0.25,ease:'power1.in'},0);\ntl.to('#${id} .tr',{opacity:0,duration:0.25,ease:'power1.out'},0.25);`,
    };
  }
  if (effect === 'slide') {
    // slide: dark panel pushes up to fill then continues out the top, the cut happens at full cover
    return {
      innerHtml: `<div class="tr"></div>\n<style>#${id} .tr{position:absolute;inset:0;background:var(--bg,#0a0a0a);transform:translateY(110%);}</style>`,
      timelineBody: `tl.fromTo('#${id} .tr',{yPercent:110},{yPercent:0,duration:0.24,ease:'power2.in'},0);\ntl.to('#${id} .tr',{yPercent:-110,duration:0.26,ease:'power2.out'},0.24);`,
    };
  }
  // wipe (default): accent panel sweeps in from the left to fill then sweeps out, the cut happens at full cover
  return {
    innerHtml: `<div class="tr"></div>\n<style>#${id} .tr{position:absolute;inset:0;background:var(--accent);box-shadow:var(--glow);transform:translateX(-110%);}</style>`,
    timelineBody: `tl.fromTo('#${id} .tr',{xPercent:-110},{xPercent:0,duration:0.22,ease:'power2.in'},0);\ntl.to('#${id} .tr',{xPercent:110,duration:0.24,ease:'power2.out'},0.22);`,
  };
}

/** Media slot: placeholder when empty (visible only in edit mode); when filled with image/video it
 *  fills the block region (box comes from the framing's empty area). Video embeds a
 *  <video data-start=block-start muted>; the preview runtime drives all <video> so it auto-follows
 *  the timeline; data-start uses the block's edited start so it plays from its own 0 (B-roll plays
 *  within that range). Export-side secondary-video sync relies on Hyperframes CLI behavior (unverified),
 *  so muted to prevent audio tracks clashing. */
/** Media slot enter/exit presets (aligned with Google Vids Animation panel's Object Enter/Exit:
 *  Fade/Slide/Rise/Scale). Enter from left/bottom/small, exit mirrored to right/top/small; 'none' emits no tween. */
export type MediaAnim = { enter?: string; exit?: string; dur?: number };
const MEDIA_ENTER: Record<string, string> = {
  fade: '{ autoAlpha: 0 }',
  slide: '{ autoAlpha: 0, x: -60 }',
  rise: '{ autoAlpha: 0, y: 60 }',
  scale: '{ autoAlpha: 0, scale: 0.8 }',
};
const MEDIA_EXIT: Record<string, string> = {
  fade: '{ autoAlpha: 0 }',
  slide: '{ autoAlpha: 0, x: 60 }',
  rise: '{ autoAlpha: 0, y: -60 }',
  scale: '{ autoAlpha: 0, scale: 0.8 }',
};

function renderMedia(slots: Slots, id: string, startSec = 0, durationSec?: number): Rendered {
  const m = (slots.media ?? null) as { type?: string; url?: string } | null;
  if (m && m.url && (m.type === 'image' || m.type === 'video')) {
    // Rounding is left to the outermost container (overflow:hidden clips it), img sets none itself — otherwise its own corner radius is tighter than the container's and caps it even when the container widens
    const css = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
    const inner =
      m.type === 'image'
        ? `<img class="hf-media" src="${escapeAttr(m.url)}" alt="" style="${css}" />`
        : `<video class="hf-media" src="${escapeAttr(m.url)}" data-start="${n(startSec)}" muted playsinline style="${css}"></video>`;
    const anim = (slots.anim ?? null) as MediaAnim | null;
    const lines: string[] = [];
    if (anim) {
      const d = Math.max(0.15, Math.min(anim.dur ?? 0.5, 2));
      const enter = anim.enter && MEDIA_ENTER[anim.enter];
      const exit = anim.exit && MEDIA_EXIT[anim.exit];
      if (enter) lines.push(`tl.from('#${id} .hf-media', Object.assign({ duration: ${n(d)}, ease: 'power2.out' }, ${enter}), 0);`);
      // Exit pinned d seconds before the block end; if the block is too short it crowds into the second half
      if (exit && durationSec) {
        const at = Math.max(enter ? d : 0, durationSec - d);
        lines.push(`tl.to('#${id} .hf-media', Object.assign({ duration: ${n(d)}, ease: 'power2.in' }, ${exit}), ${n(at)});`);
      }
    } else {
      lines.push(`tl.from('#${id} .hf-media', { opacity: 0, scale: 0.96, duration: 0.4, ease: 'power2.out' }, 0);`);
    }
    return { innerHtml: inner, timelineBody: lines.join('\n') };
  }
  // empty → placeholder (.hf-ph is display:none by default, shown only under body.hf-editor; styles in assembleHtml head)
  return {
    innerHtml: `<div class="hf-ph"><div class="hf-ph-plus">+</div><div class="hf-ph-tip">${t('engine.mediaPlaceholderTip')}</div></div>`,
    timelineBody: '',
  };
}

/* ============================ register built-in templates ============================ */

registerTemplate({
  id: 'custom',
  name: 'engine.customHtml',
  kind: 'custom',
  defaultTrackIndex: 2,
  slots: { innerHtml: { type: 'text', label: 'HTML' }, timelineBody: { type: 'text', label: 'engine.gsapTimelineBody' } },
  render: (slots) => ({ innerHtml: str(slots.innerHtml, '<div></div>'), timelineBody: str(slots.timelineBody) }),
});
registerTemplate({
  id: 'title',
  name: 'common.titleCard',
  kind: 'title',
  defaultTrackIndex: 2,
  slots: { text: { type: 'text', label: 'common.title', required: true }, sub: { type: 'text', label: 'engine.subtitle' } },
  render: renderTitle,
});
registerTemplate({
  id: 'stat',
  name: 'common.bigNumber',
  kind: 'stat',
  defaultTrackIndex: 2,
  slots: { value: { type: 'text', label: 'common.number', required: true }, label: { type: 'text', label: 'engine.label' } },
  render: renderStat,
});
registerTemplate({
  id: 'list',
  name: 'common.bulletList',
  kind: 'list',
  defaultTrackIndex: 2,
  slots: { title: { type: 'text', label: 'engine.heading' }, items: { type: 'text[]', label: 'engine.bulletPoints', required: true } },
  render: renderList,
});
registerTemplate({
  id: 'transition',
  name: 'tools.add_transition.label',
  kind: 'transition',
  defaultTrackIndex: 3, // topmost, covers the cut beneath
  slots: { effect: { type: 'enum', label: 'engine.effect', options: ['wipe', 'flash', 'fade', 'slide'] } },
  render: renderTransition,
});
registerTemplate({
  id: 'caption',
  name: 'engine.animatedCaptions',
  kind: 'caption',
  defaultTrackIndex: 1,
  slots: {
    words: { type: 'words', label: 'engine.wordTimings', required: true },
    effect: { type: 'enum', label: 'engine.effect', options: ['kinetic-slam'] },
    sub: { type: 'text', label: 'engine.translationLine' },
  },
  render: renderCaption,
});
registerTemplate({
  id: 'media',
  name: 'common.media',
  kind: 'media',
  defaultTrackIndex: 2,
  slots: { media: { type: 'image', label: 'engine.imageVideo' } },
  render: renderMedia,
});

/**
 * Force-load anchor: all templates register via this module's TOP-LEVEL registerTemplate side
 * effects. Under sideEffects:false, if nobody imports a named export of this module the bundler
 * tree-shakes the whole thing away (REGISTRY empty → getTemplate returns undefined → blockKind
 * crashes). The MCP worker path (server-tools' blockKind/renderBlock) is exactly this case.
 * Having the consumer import and call this empty function forces the module into the bundle and
 * top-level evaluation (completing registration).
 */
export function ensureTemplatesRegistered(): void {
  /* Empty impl: its only purpose is to give the bundler a non-shakeable reference, incidentally triggering this module's top-level side effects. */
}
