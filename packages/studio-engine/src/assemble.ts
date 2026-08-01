/**
 * Assembly layer: stitch a Composition into a complete Hyperframes document (preview iframe and export share the same source).
 * Depends on the template registry being ready — always go through the './composition' barrel externally (it imports './templates' first).
 */

import { getTheme, themeVarsCss } from './theme';
import { editedDuration } from './trim';
import {
  type Block,
  type Composition,
  cutTransitions,
  escapeAttr,
  isSentenceCaption,
  n,
  pct,
  renderBlock,
  resolveCaptionStyle,
  videoFrameTimelineBody,
} from './composition-core';
import { GL_MIXER_SRC, TRANSITION_GLSL, glDirection } from './transition-gl';

/* ============================ Assembly ============================ */

/**
 * <video> trim-mapping shim injected into the document: reframe #vidEl's currentTime to the **final-cut time** basis
 * (get: source→final; set: final→source), and use rAF to skip trimmed regions during playback. Reads window.__segments.
 * This way both the preview runtime and the export headless renderer (setting currentTime frame by frame) work in final-cut time.
 */
/** Design fonts for the preview document (single source). The parent document (workbench) must load the same set — caption
 *  splitting's canvas measureText runs in the parent, and without this font it falls back to a system font whose Latin widths mismatch and wrap. */
export const STUDIO_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700;900&family=Noto+Serif+SC:wght@700;900&family=IBM+Plex+Mono:wght@500;600&display=swap';

/** Frame shim (canvas mode): draw frames pushed by the parent-layer engine; cut transitions use the **gl-transitions WebGL
 *  mixer** (GL_MIXER_SRC, same source as export/panel) — within a window the engine brings the "other side" ghost frame
 *  (frame2) alongside the main frame, and the two live streams (from/to) are composited by the upstream shader, p spanning the whole window.
 *  Fallback chain: ghost frames cut off → after the cut, use the frozen last frame of A as from (at least the second half has an effect); GL unavailable /
 *  shader compile fails → hard cut. Before upload, cover into a W×H staging canvas first (direct texture upload gets stretched/distorted). */
export function videoFrameShim(transitions: { cut: number; effect: string; half: number; dx: number; dy: number }[]): string {
  return `window.__parentClock = true; // clock/decode/audio run in the parent-layer engine; this doc doesn't self-drive
(function(){
  var c = document.getElementById('vidEl');
  if (!c || !c.getContext) return;
  var ctx = c.getContext('2d');
  if (!ctx) return;
  var W = c.width, H = c.height;
  var TRS = ${JSON.stringify(transitions)};
  var MIX = null;
  try { MIX = (${GL_MIXER_SRC})(W, H, ${JSON.stringify(TRANSITION_GLSL)}); } catch (eM) {}
  var liveBmp = null, ghostBmp = null, lastT = -1, ghostAtT = -1, bakedWinCut = -1;
  var liveVer = 0, ghostVer = 0, stagedLiveVer = -1, stagedGhostVer = -1;
  var frozen = null, frozenCut = null, ghostWarned = false;
  var mkStage = function () { var s = document.createElement('canvas'); s.width = W; s.height = H; return s; };
  var stageLive = mkStage(), stageGhost = mkStage();
  // fit = CONTAIN (per user): a source whose aspect differs from the canvas letterboxes inside it,
  // never crops — the canvas ratio is a project decision (first-inserted source / ratio picker).
  var cover = function (stage, bmp) {
    var g = stage.getContext('2d');
    var k = Math.min(W / bmp.width, H / bmp.height), dw = bmp.width * k, dh = bmp.height * k;
    g.clearRect(0, 0, W, H);
    g.drawImage(bmp, (W - dw) / 2, (H - dh) / 2, dw, dh);
    return stage;
  };
  // per-source staging + version: if the frame is unchanged, redraw only — skip re-cover/re-upload (clock-driven per-tick recompositing is what hits 60fps)
  var SL = function () { if (stagedLiveVer !== liveVer) { cover(stageLive, liveBmp); stagedLiveVer = liveVer; } return stageLive; };
  var SG = function () { if (stagedGhostVer !== ghostVer) { cover(stageGhost, ghostBmp); stagedGhostVer = ghostVer; } return stageGhost; };
  var drawPlain = function (bmp) {
    if (!bmp) return;
    var k = Math.min(W / bmp.width, H / bmp.height), dw = bmp.width * k, dh = bmp.height * k;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bmp, (W - dw) / 2, (H - dh) / 2, dw, dh);
  };
  var render = function (t) {
    if (!liveBmp || !(t >= 0)) return;
    var tr = null;
    for (var i = 0; i < TRS.length; i++) { if (t >= TRS[i].cut - TRS[i].half && t <= TRS[i].cut + TRS[i].half) { tr = TRS[i]; break; } }
    if (t < lastT - 0.05 || t > lastT + 0.5) frozenCut = null; // rewind/big jump: discard frozen frame
    if (tr && lastT >= 0 && lastT < tr.cut && t >= tr.cut) {
      // crossing the cut: current canvas = A's last frame; freeze it as the fallback "from" when ghost frames cut off
      frozen = frozen || mkStage();
      frozen.getContext('2d').clearRect(0, 0, W, H);
      frozen.getContext('2d').drawImage(c, 0, 0);
      frozenCut = tr.cut;
      // side switch: ghosts arriving before the cut are B's pre-roll; after the cut "from" should be A's tail — old-side frames are discarded,
      // and until the new-side ghost arrives the frozen last frame of A holds (content stays continuous, no flicker). Ghost frames whose
      // arrival time is past the cut are already new-side (the engine's ghostFresh gate verified this) — don't kill them by mistake
      if (ghostBmp && ghostAtT < tr.cut) { try { ghostBmp.close(); } catch (eX) {} ghostBmp = null; }
    }
    lastT = t;
    if (!tr) { bakedWinCut = -1; drawPlain(liveBmp); return; }
    // this window is now owned by baked frames: the old dual-stream compositing steps aside entirely (don't draw into inter-frame gaps either — that layers up into strobe)
    if (bakedWinCut === tr.cut) return;
    var p = Math.min(1, Math.max(0, (t - (tr.cut - tr.half)) / (2 * tr.half))); // 0=window start, 1=end
    var pre = t < tr.cut;
    // from/to: before the cut from=main frame (A) / to=ghost (B pre-roll); after the cut from=ghost (A tail) / to=main frame (B)
    var F = pre ? SL() : (ghostBmp ? SG() : (frozenCut === tr.cut ? frozen : null));
    var FK = pre ? 'L' + liveVer : (ghostBmp ? 'G' + ghostVer : 'Z' + frozenCut);
    var T = pre ? (ghostBmp ? SG() : null) : SL();
    var TK = pre ? 'G' + ghostVer : 'L' + liveVer;
    if (!ghostBmp && !ghostWarned) { ghostWarned = true; try { console.warn('[hf] transition ghost frames missing — degraded blending'); } catch (eW) {} }
    if (F && T && MIX && MIX.render(F, T, tr.effect, p, tr.dx, tr.dy, FK, TK)) {
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(MIX.canvas, 0, 0, W, H);
      return;
    }
    drawPlain(liveBmp); // GL unavailable / ghost not warm and no frozen frame: hard cut
  };
  // current frame's source info (personCut needs it for the mask): elKey='main'|clip_<shotId>, srcT=time within that source file
  window.__vidSrc = null;
  window.addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.type === 'hf:seekTimelines') {
      // play/scrub clock: recomposite by clock only near transition windows (motion keeps going even if ghost frames briefly cut off)
      try {
        var st = Number(d.t);
        if (st >= 0 && liveBmp) {
          for (var gi = 0; gi < TRS.length; gi++) {
            if (st >= TRS[gi].cut - TRS[gi].half - 0.1 && st <= TRS[gi].cut + TRS[gi].half) { render(st); break; }
          }
        }
      } catch (errS) {}
      return;
    }
    if (d.type !== 'hf:frame' || !d.frame) return;
    if (d.baked) {
      // pre-baked frame (0.5× same aspect ratio): just fill; compositing / freeze / bookkeeping all step aside
      try {
        ctx.clearRect(0, 0, W, H);
        ctx.drawImage(d.frame, 0, 0, W, H);
        var bt = typeof d.t === 'number' ? d.t : lastT;
        lastT = bt;
        for (var bwi = 0; bwi < TRS.length; bwi++) { if (bt >= TRS[bwi].cut - TRS[bwi].half && bt <= TRS[bwi].cut + TRS[bwi].half) { bakedWinCut = TRS[bwi].cut; break; } }
        window.__vidSrc = { elKey: d.elKey || 'main', srcT: typeof d.srcT === 'number' ? d.srcT : 0, w: d.frame.width, h: d.frame.height };
      } catch (errB) {}
      try { d.frame.close && d.frame.close(); } catch (errB2) {}
      return;
    }
    try {
      if (liveBmp && liveBmp.close) { try { liveBmp.close(); } catch (errC) {} }
      liveBmp = d.frame; liveVer++;
      if (d.frame2) {
        if (ghostBmp && ghostBmp.close) { try { ghostBmp.close(); } catch (errG) {} }
        ghostBmp = d.frame2; ghostVer++;
        ghostAtT = typeof d.t === 'number' ? d.t : lastT;
      } else if (ghostBmp) {
        // discard ghost frame once out of the window (if missing inside the window, reuse the last one — a tiny stutter beats a flicker cut)
        var t0 = typeof d.t === 'number' ? d.t : lastT;
        var inWin = false;
        for (var wi = 0; wi < TRS.length; wi++) { if (t0 >= TRS[wi].cut - TRS[wi].half && t0 <= TRS[wi].cut + TRS[wi].half) { inWin = true; break; } }
        if (!inWin) { try { ghostBmp.close(); } catch (errG2) {} ghostBmp = null; }
      }
      render(typeof d.t === 'number' ? d.t : lastT);
      window.__vidSrc = { elKey: d.elKey || 'main', srcT: typeof d.srcT === 'number' ? d.srcT : 0, w: d.frame.width, h: d.frame.height };
    } catch (err) {}
  });
})();`;
}

/**
 * Person matte ("text behind person"): the #personCut canvas sits between behind-person and front-person blocks; each frame draws the video
 * with the same object-fit:cover mapping, then destination-in with the person mask to keep only the person's pixels.
 * The mask is computed by the parent layer (MediaPipe lives in the parent document; a sandbox iframe can't reach it): this document's rVFC grabs a video frame,
 * scales it to long edge ≤384 and sends personFrame; the parent returns hf:personMask when segmentation is done; single-flight throttled (no new frame until the last returns).
 * Framing-transform follow: GSAP writes framing onto the video's inline transform, copied to the canvas as-is each frame.
 * Export / no-parent environment: the mask never arrives, the canvas stays transparent, and it degrades naturally to a normal foreground overlay.
 */
const PERSON_CUT_SHIM = `(function(){
  var v = document.getElementById('vidEl');
  var c = document.getElementById('personCut');
  if (!v || !c || !c.getContext) return;
  var ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // effect params are baked into data-attributes by assemble (config change → setComp → doc rebuild, same path as other config)
  var feather = parseFloat(c.getAttribute('data-feather')) || 0;
  var strokeW = parseFloat(c.getAttribute('data-stroke-w')) || 0;
  var strokeC = c.getAttribute('data-stroke-color') || '#ffffff';
  var bgEl = document.getElementById('personBg');
  var W = c.width, H = c.height;
  // person (video ∘ mask) and stroke silhouette each render offscreen; the main canvas composites in stroke→person order
  var P = document.createElement('canvas'); P.width = W; P.height = H;
  var pctx = P.getContext('2d');
  pctx.imageSmoothingEnabled = true; pctx.imageSmoothingQuality = 'high';
  var strokeStyle = c.getAttribute('data-stroke-style') || 'solid';
  var strokeAlpha = parseFloat(c.getAttribute('data-stroke-alpha'));
  if (!(strokeAlpha >= 0 && strokeAlpha <= 1)) strokeAlpha = 1;
  // stroke = trace the mask outline (marching squares) into a Path2D, then stroke it: solid/dashed both follow the contour,
  // line width = 2× target — the inner half is covered by the person layer above, so only the outer ring shows (mainstream-editor-style "outer stroke").
  var tc = null, tctx = null, strokePath = null, strokeGrid = null;
  if (strokeW > 0) { tc = document.createElement('canvas'); tctx = tc.getContext('2d', { willReadFrequently: true }); }
  function retrace(){
    if (!tctx || !mask) { strokePath = null; return; }
    var gw = 220, gh = Math.max(2, Math.round((220 * mask.height) / mask.width));
    tc.width = gw; tc.height = gh;
    tctx.clearRect(0, 0, gw, gh);
    tctx.drawImage(mask, 0, 0, gw, gh);
    var px = tctx.getImageData(0, 0, gw, gh).data;
    function at(x, y){ return x >= 0 && y >= 0 && x < gw && y < gh && px[(y * gw + x) * 4 + 3] > 127 ? 1 : 0; }
    // per blob: walk marching squares once from an unconsumed boundary start; drop short loops (noise), skip starts already inside a bbox
    var boxes = [], paths = [], attempts = 0;
    for (var sy = 0; sy < gh && attempts < 6; sy++) {
      for (var sx = 0; sx < gw && attempts < 6; sx++) {
        if (!at(sx, sy) || at(sx - 1, sy)) continue;
        var inBox = false;
        for (var bi = 0; bi < boxes.length; bi++) { var bb = boxes[bi]; if (sx >= bb[0] && sx <= bb[2] && sy >= bb[1] && sy <= bb[3]) { inBox = true; break; } }
        if (inBox) continue;
        attempts++;
        var pts = [], x = sx, y = sy, prev = 'up', guard = gw * gh;
        do {
          var v = 0;
          if (at(x - 1, y - 1)) v |= 1;
          if (at(x, y - 1)) v |= 2;
          if (at(x - 1, y)) v |= 4;
          if (at(x, y)) v |= 8;
          var d2;
          if (v === 1 || v === 13 || v === 5) d2 = 'up';
          else if (v === 8 || v === 10 || v === 11) d2 = 'down';
          else if (v === 4 || v === 12 || v === 14) d2 = 'left';
          else if (v === 2 || v === 3 || v === 7) d2 = 'right';
          else if (v === 6) d2 = prev === 'up' ? 'left' : 'right';
          else if (v === 9) d2 = prev === 'right' ? 'up' : 'down';
          else break;
          prev = d2;
          if (d2 === 'up') y--; else if (d2 === 'down') y++; else if (d2 === 'left') x--; else x++;
          pts.push(x, y);
        } while ((x !== sx || y !== sy) && guard-- > 0);
        if (pts.length >= 60) {
          var minX = gw, minY = gh, maxX = 0, maxY = 0;
          for (var pi = 0; pi < pts.length; pi += 2) {
            if (pts[pi] < minX) minX = pts[pi]; if (pts[pi] > maxX) maxX = pts[pi];
            if (pts[pi + 1] < minY) minY = pts[pi + 1]; if (pts[pi + 1] > maxY) maxY = pts[pi + 1];
          }
          boxes.push([minX, minY, maxX, maxY]);
          paths.push(pts);
        }
      }
    }
    if (!paths.length) { strokePath = null; return; }
    // midpoint quadratic-curve smoothing (decimate by step 3); build Path2D in grid coords, translate/scale to canvas at draw time
    var p2 = new Path2D();
    for (var ci = 0; ci < paths.length; ci++) {
      var q = paths[ci], step = 3, n2 = Math.floor(q.length / 2 / step);
      if (n2 < 6) continue;
      function gx(i){ return q[((i % n2) * step) * 2]; }
      function gy(i){ return q[((i % n2) * step) * 2 + 1]; }
      p2.moveTo((gx(0) + gx(1)) / 2, (gy(0) + gy(1)) / 2);
      for (var i2 = 1; i2 <= n2; i2++) p2.quadraticCurveTo(gx(i2), gy(i2), (gx(i2) + gx(i2 + 1)) / 2, (gy(i2) + gy(i2 + 1)) / 2);
      p2.closePath();
    }
    strokePath = p2;
    strokeGrid = { gw: gw, gh: gh };
  }
  var mask = null, inflight = false;
  function post(m, tr){ m.source='hf'; try { parent.postMessage(m, '*', tr || []); } catch (e) {} }
  window.addEventListener('message', function(e){
    var d = e.data || {};
    if (d.type === 'hf:personFx') {
      // live param update (person popover sliders / style cards take effect immediately, no doc rebuild; values match what a rebuild bakes into data-attributes).
      // structural switches (personFront layer order / first pipeline install) still go through a rebuild — that's DOM structure, not params.
      if (d.feather != null) feather = parseFloat(d.feather) || 0;
      if (d.strokeW != null) {
        strokeW = parseFloat(d.strokeW) || 0;
        if (strokeW > 0 && !tctx) { tc = document.createElement('canvas'); tctx = tc.getContext('2d', { willReadFrequently: true }); }
        try { retrace(); } catch (err) { strokePath = null; }
      }
      if (d.strokeColor) strokeC = d.strokeColor;
      if (d.strokeStyle) strokeStyle = d.strokeStyle;
      if (d.strokeAlpha != null) { strokeAlpha = parseFloat(d.strokeAlpha); if (!(strokeAlpha >= 0 && strokeAlpha <= 1)) strokeAlpha = 1; }
      if (d.bg !== undefined) {
        if (!d.bg) { if (bgEl) bgEl.style.display = 'none'; bgEl = null; }
        else {
          if (!bgEl) {
            bgEl = document.getElementById('personBg');
            if (!bgEl) {
              bgEl = document.createElement('div');
              bgEl.id = 'personBg';
              bgEl.style.cssText = 'position:absolute;inset:0;display:none;';
              if (v.parentNode) v.insertAdjacentElement('afterend', bgEl); // layer order same as assemble: above the video, below the blocks
            }
          }
          bgEl.style.background = d.bg;
        }
      }
      return;
    }
    if (d.type === 'hf:personMask') {
      inflight = false;
      if (mask) { try { mask.close(); } catch (err) {} }
      // no mask (this segment has matting off / track not ready) = clear the old mask: scrubbing into an unmatted segment hides the person layer immediately,
      // no leftover from the previous segment; back off before re-asking, don't hammer the parent every frame
      mask = d.mask || null;
      if (mask) {
        try { retrace(); } catch (err2) { strokePath = null; }
      } else {
        strokePath = null;
        nextAskAt = performance.now() + 400;
      }
    }
  });
  // full mask compute lives in the parent (runs once when the user enables matting); here we only request a ready one keyed by **time within that source file**:
  // in canvas render mode the frame shim records frame info on window.__vidSrc (elKey + time within that source file)
  var lastReq = -1, lastEl = '', nextAskAt = 0;
  function feed(){
    var fi = window.__vidSrc;
    if (inflight || !fi) return;
    if (performance.now() < nextAskAt) return;
    var t = fi.srcT, ek = fi.elKey || 'main';
    if (mask && ek === lastEl && Math.abs(t - lastReq) < 1 / 30) return; // don't re-request the same frame
    inflight = true;
    lastReq = t;
    lastEl = ek;
    post({ type: 'personMaskAt', t: t, el: ek });
  }
  function draw(){
    var fi = window.__vidSrc;
    // no frame yet (load gap) → blank the whole layer
    if (!fi) { ctx.clearRect(0, 0, W, H); if (bgEl) bgEl.style.display = 'none'; return; }
    ctx.clearRect(0, 0, W, H);
    // background-replace layer follows the mask: only lit on segments that have a mask (export / no parent / matting-off segments all hidden, fall back to original frame)
    if (bgEl) bgEl.style.display = mask ? 'block' : 'none';
    if (!mask) return;
    // mask aspect ratio = source frame; the on-canvas frame is contain-fit, so align the mask with the same contain mapping
    var vw = fi.w || W, vh = fi.h || H;
    var k = Math.min(W / vw, H / vh), dw = vw * k, dh = vh * k, dx = (W - dw) / 2, dy = (H - dh) / 2;
    pctx.clearRect(0, 0, W, H);
    pctx.drawImage(v, 0, 0); // video frame taken straight from the #vidEl canvas (already cover-composited)
    pctx.globalCompositeOperation = 'destination-in';
    if (feather > 0) pctx.filter = 'blur(' + feather + 'px)';
    pctx.drawImage(mask, dx, dy, dw, dh);
    pctx.filter = 'none';
    pctx.globalCompositeOperation = 'source-over';
    if (strokePath && strokeGrid) {
      // contour stroke sits under the person: line width 2× (inner half covered by the person = outer stroke); dash length scales with line width
      var s = dw / strokeGrid.gw;
      ctx.save();
      ctx.translate(dx, dy);
      ctx.scale(dw / strokeGrid.gw, dh / strokeGrid.gh);
      ctx.lineWidth = (strokeW * 2) / s;
      ctx.strokeStyle = strokeC;
      ctx.globalAlpha = strokeAlpha;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      if (strokeStyle === 'dashed') ctx.setLineDash([(strokeW * 2.6) / s, (strokeW * 1.6) / s]);
      ctx.stroke(strokePath);
      ctx.restore();
    }
    ctx.drawImage(P, 0, 0);
    c.style.transform = v.style.transform || '';
    c.style.translate = v.style.translate || '';
    c.style.scale = v.style.scale || '';
  }
  (function loop(){ try { feed(); draw(); } catch (e) {} requestAnimationFrame(loop); })();
})();`;

/** Registration script for a single timeline. The body is compiled and run via new Function: syntax errors / runtime throws are contained to this block
 *  (an empty timeline still registers) and don't take down other blocks in the same <script> — both human source edits and LLM output can carry bad scripts,
 *  lint doesn't do JS syntax parsing, so this is the last line of isolation. */
function timelineScript(id: string, body: string): string {
  return (
    `(function(){ var tl = gsap.timeline({ paused: true }); ` +
    `try { new Function('tl', ${JSON.stringify(body)})(tl); } catch (e) { console.warn('[hf] timeline error', ${JSON.stringify(id)}, e); } ` +
    `window.__timelines[${JSON.stringify(id)}] = tl; })();`
  );
}

/**
 * Stitch a complete Hyperframes document. gsapSrc is swappable (export uses the render container's local './vendor/gsap.min.js').
 * Preview self-hosts /vendor/gsap.min.js by default (a srcdoc iframe inherits the parent document's base → same-origin):
 * with N iframes per screen in the component library / template wall each fetching the script, same-origin strong caching + reachable in China, no longer hanging off jsdelivr.
 */
/** Whether a custom block carries its own card surface (explicit data-hf-surface marker, or a background:var(--panel) card).
 *  When it has a surface, a user-set background color is only a token override — the surface recolors itself, the container doesn't paint over it
 *  (a two-color overlap of frame + surface, with the space outside the card also painted, is the source of "colors overlap and break after setting a color"). */
export function customHasSurface(templateId: string, innerHtml: string): boolean {
  return templateId === 'custom' && (innerHtml.includes('data-hf-surface') || /background\s*:[^;{}]*var\(--panel\)/.test(innerHtml));
}

/** Block background color → content-layer CSS (token override + optional container backing). surfaceOnly = has a surface, only swap tokens.
 *  Also flips the ink family (--fg/--muted/--line/--panel-2/--grid) by bg luminance: light bg → dark ink, dark bg → light ink,
 *  catching the "light text on light bg, unreadable" contrast breakdown when picking a light color under a dark theme (--accent keeps the theme color).
 *  The in-place patch channel (hf:blockStyle) and full-document reassembly share this function — both paths output identically. */
export function blockBgCss(bg: string, surfaceOnly: boolean): string {
  let ink = '';
  const hex = /^#([0-9a-fA-F]{6})/.exec(bg);
  if (hex) {
    const v = parseInt(hex[1]!, 16);
    const lum = (0.2126 * ((v >> 16) & 255) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255)) / 255;
    ink =
      lum > 0.55
        ? '--fg:#15171c;--muted:rgba(21,23,28,0.62);--line:rgba(21,23,28,0.16);--panel-2:rgba(21,23,28,0.06);--grid:rgba(21,23,28,0.10);'
        : '--fg:#f5f6f8;--muted:rgba(245,246,248,0.66);--line:rgba(255,255,255,0.18);--panel-2:rgba(255,255,255,0.09);--grid:rgba(255,255,255,0.13);';
  }
  return `--panel:${escapeAttr(bg)};--paper:${escapeAttr(bg)};${ink}${surfaceOnly ? '' : `background:${escapeAttr(bg)};`}`;
}

/** Assemble ONE block into its outer container HTML + timeline body — byte-identical to what the
 *  full document assembler emits for it. Shared by assembleHtml and the workbench's in-place patch
 *  channel (hf:blockAdd/hf:blockHtml), so patched blocks always match a later rebuild exactly. */
export function assembleBlockHtml(b: Block, comp: Composition): { html: string; timelineBody: string } {
  return assembleBlockWith(b, comp, comp.captionStyle ? resolveCaptionStyle(comp) : undefined);
}

function assembleBlockWith(b: Block, comp: Composition, cs: ReturnType<typeof resolveCaptionStyle> | undefined): { html: string; timelineBody: string } {
  const { width: W, height: H } = comp;

    // State-first bilingual gate: the translation line renders ONLY while captionStyle.sub.lang is set.
    // Translations live in the transcript (and get baked into slots.sub by the relay), but without the
    // language state they stay dormant — turning translation off hides them without destroying content.
    // Kit blocks derive HTML at render time — bake the sizing context (box/canvas px)
    // into slots here, where the composition's dimensions are known.
    const kitBase = b.templateId.startsWith('kit:')
      ? {
          ...b,
          slots: {
            ...b.slots,
            boxW: Math.round((b.box?.w ?? 0.86) * W),
            boxH: Math.round((b.box?.h ?? 0.3) * H),
            canvasW: W,
            canvasH: H,
          },
        }
      : b;
    const capBase = isSentenceCaption(kitBase)
      ? { ...kitBase, slots: { ...kitBase.slots, canvasW: comp.width, ...(comp.captionStyle?.sub?.lang ? {} : { sub: undefined }) } }
      : kitBase;
    const rb =
      cs && isSentenceCaption(b)
        ? { ...capBase, slots: { ...capBase.slots, preset: cs.preset, yPct: cs.yPct, xPct: cs.xPct ?? 50, wPct: cs.wPct ?? 56, scale: cs.scale, ...(cs.hPct ? { hPct: cs.hPct } : {}), ...(cs.color != null ? { color: cs.color } : {}), ...(cs.bg !== undefined ? { bg: cs.bg } : {}), ...(cs.bold != null ? { bold: cs.bold } : {}), ...(cs.sub?.preset != null ? { subPreset: cs.sub.preset } : {}), ...(cs.sub?.color != null ? { subColor: cs.sub.color } : {}), ...(cs.sub?.bg !== undefined ? { subBg: cs.sub.bg } : {}), ...(cs.sub?.bold != null ? { subBold: cs.sub.bold } : {}), ...(cs.sub?.yPct != null ? { subYPct: cs.sub.yPct } : {}), ...(cs.sub?.xPct != null ? { subXPct: cs.sub.xPct } : {}), ...(cs.sub?.wPct != null ? { subWPct: cs.sub.wPct } : {}), ...(cs.sub?.scale != null ? { subScale: cs.sub.scale } : {}), ...(cs.sub?.hPct != null ? { subHPct: cs.sub.hPct } : {}) } }
        : capBase;
    const { innerHtml, timelineBody } = renderBlock(rb);
    // autofit: when content overflows, scale the whole thing to just fit the box (measured empirically), preview = export
    const fit = b.fitScale && b.fitScale < 0.999 ? `transform:scale(${n(b.fitScale)});transform-origin:center center;` : '';
    // Uniform content scaling: CSS scale property (around center), doesn't affect layout (autofit's scrollWidth measure stays uncontaminated),
    // and doesn't enter the transform chain (won't be overwritten by the autofit transform)
    const scaleCss = typeof b.scale === 'number' && Math.abs(b.scale - 1) > 0.005 ? `scale:${n(b.scale)};` : '';
    // Component background (set by the user on the floating bar): see helpers blockBgCss/customHasSurface (the in-place patch channel reuses the same logic)
    const hasSurface = customHasSurface(b.templateId, innerHtml);
    const bgCss = b.bg ? blockBgCss(b.bg, hasSurface) : '';
    // Border/opacity/radius/rotation are applied to the outermost container (= the framing box)
    const frame: string[] = [];
    if (b.border) frame.push(`border:3px solid ${escapeAttr(b.border)};`);
    // Radius: use the user's explicit value if set; otherwise give a default radius when there's a backing/border (matches old behavior)
    if (typeof b.radius === 'number' && b.radius > 0) frame.push(`border-radius:${n(b.radius)}px;`);
    else if ((b.bg || b.border) && b.box) frame.push('border-radius:var(--radius,24px);');
    if (typeof b.opacity === 'number' && b.opacity < 0.995) frame.push(`opacity:${n(Math.max(0.05, b.opacity))};`);
    // Whole-block rotation: rotate the outermost container around center (a box block's crop window / full-canvas layer rotates with it); independent of the content layer's scale/autofit
    if (typeof b.rotation === 'number' && Math.abs(b.rotation) > 0.01) frame.push(`transform:rotate(${n(b.rotation)}deg);transform-origin:center center;`);
    const attrs =
      `id="${b.id}" data-composition-id="${b.id}" ${b.box ? 'data-hf-box="1" ' : ''}` +
      `data-start="${n(b.startSec)}" data-duration="${n(b.durationSec)}" data-track-index="${b.trackIndex}" ` +
      `data-width="${W}" data-height="${H}"`;
    let html: string;
    if (b.box) {
      // box block = two layers: the container is the crop window (overflow:hidden, dragging edges/corners only moves the window), the content layer
      // [data-hf-content] is anchored to the canvas by contentBox — cropping doesn't reflow content, anything outside the window is clipped;
      // bg surface / autofit / content scaling all live in the content layer (± scaling only scales content, over-window is clipped = zoom within the framing box).
      const cb = b.contentBox ?? b.box;
      const pos = `left:${pct(b.box.x)};top:${pct(b.box.y)};width:${pct(b.box.w)};height:${pct(b.box.h)};`;
      const rel = `left:${pct((cb.x - b.box.x) / b.box.w)};top:${pct((cb.y - b.box.y) / b.box.h)};width:${pct(cb.w / b.box.w)};height:${pct(cb.h / b.box.h)};`;
      html =
        `<div class="comp" ${attrs} style="position:absolute;${pos}overflow:hidden;${frame.join('')}">\n` +
        `<div data-hf-content style="position:absolute;${rel}${bgCss}${scaleCss}${fit}">\n${innerHtml}\n</div>\n</div>`;
    } else {
      // Full-canvas block (caption layer, etc.): a single flat layer, no crop/scale semantics.
      // The sentence-caption container doesn't take clicks (pointer-events:none, .cap-line is auto): the container is inset:0 spanning
      // the whole canvas, and if it took clicks, clicking any blank area while captions are on-screen would hit it — "click blank to select a shot" would break entirely
      const pe = isSentenceCaption(b) ? 'pointer-events:none;' : '';
      html = `<div class="comp" ${attrs} style="position:absolute;inset:0;${pe}${bgCss}${frame.join('')}${scaleCss}${fit}">\n${innerHtml}\n</div>`;
    }
    return { html, timelineBody };
}

export function assembleHtml(comp: Composition, gsapSrc = '/vendor/gsap.min.js'): string {
  const { width: W, height: H } = comp;
  const theme = getTheme(comp.theme);
  // Background: use paper if the derived/theme-pack palette provided it (a frame's dark-theme preview must actually go dark), otherwise the theme default
  const bg = comp.palette?.paper ?? theme.background;
  const body: string[] = [];
  const scripts: string[] = [];

  if (comp.video || comp.shots?.length) {
    // Video track = a single <canvas> (canvas render mode, per the user's decision): decode/clock/audio all in the parent-layer engine
    // (video-track-engine), frames drawn as they're pushed via hf:frame. Document rebuild no longer recreates the decoder → the root cause of the whole
    // "decode zombie" class of problems is removed. The id stays vidEl: framing keyframe / shotVars / personCut selectors need zero changes.
    // Equal-footing: comp.video is just the first-loaded source — a clips-only comp (external inserts,
    // no "main") still gets the canvas; only a truly source-less comp skips it.
    const hasShots = !!(comp.shots && comp.shots.length);
    const editedDur = hasShots ? editedDuration(comp.shots!) : comp.video!.durationSec;
    body.push(
      `<canvas id="vidEl" data-composition-id="vid" width="${n(comp.width)}" height="${n(comp.height)}" data-start="0" data-duration="${n(editedDur)}" data-track-index="0" ` +
        `style="position:absolute;inset:0;width:100%;height:100%;transform-origin:center center;will-change:transform;box-shadow:0 30px 90px rgba(0,0,0,0.45);"></canvas>`,
    );
    // Frame-receive shim + parent-clock marker (the runtime uses it to not self-drive the clock, see PREVIEW_RUNTIME); the cut-transition table is baked into the shim
    scripts.push(
      videoFrameShim(
        hasShots
          ? cutTransitions(comp.shots!).map((tr) => {
              const [dx, dy] = glDirection(tr.dir);
              return { cut: tr.cut, effect: tr.effect, half: tr.half, dx, dy };
            })
          : [],
      ),
    );
    // Framing timeline (in final-cut time) registered to vid → transforms applied to the canvas element, one canvas absorbing every segment's framing
    const frameBody = hasShots ? videoFrameTimelineBody(comp.shots!) : '';
    if (frameBody) {
      scripts.push(timelineScript('vid', frameBody));
    }
  }

  // Render after a stable sort by trackIndex: blocks carry no z-index, so DOM order = stacking → sorting makes the claim
  // "higher data-track-index is on top" hold, regardless of comp.blocks insertion order; same track keeps original order.
  // The transition layer (track 60) carries its own z-index:60 and is unaffected by this sort.
  // Sort key: sentence captions are always topmost (captions are a readability must-have, not to be covered by components; per the user's decision),
  // other blocks by trackIndex (DOM order = stacking)
  const zKey = (b: Block) => (isSentenceCaption(b) ? Number.MAX_SAFE_INTEGER : b.trackIndex);
  const ordered = [...comp.blocks].sort((a, b) => zKey(a) - zKey(b));
  // Person sandwich: video → background-swap layer → [when person on top: all blocks] → #personCut matte canvas → [normal: all blocks].
  // Matting takes effect per segment (VideoShot.personMatte): the pipeline is installed only if any segment turned it on; outside those segments there's no mask, the canvas is
  // transparent and the background layer hidden, auto-reverting to the normal picture. Layer order (personFront) / stroke / background are global styles.
  const fx = comp.personFx;
  const fxOn = !!comp.video && (comp.shots ?? []).some((s) => s.personMatte);
  const personFront = fxOn && !!fx?.personFront;
  // Block-level override: b.personLayer explicitly sets front/behind person; default follows the global personFront
  const isBehind = (b: Block) => (fxOn ? (b.personLayer ? b.personLayer === 'behind' : personFront) : false);
  const behind = ordered.filter((b) => isBehind(b));
  const front = ordered.filter((b) => !isBehind(b));
  // If any block needs to sit behind the person, the matte canvas must exist (otherwise block-level 'behind' has nothing to sit under)
  const fxPipeline = fxOn && (personFront || (fx?.stroke?.width ?? 0) > 0 || !!fx?.bg || behind.length > 0);
  if (fxPipeline && fx?.bg) {
    // Background-swap layer covers the original video (display:none, lit only once the shim gets the first mask); the person is restored by the matte canvas above
    const bgStyle = fx.bg.type === 'color' ? `background:${escapeAttr(fx.bg.color)};` : `background:#000 center/cover no-repeat url('${escapeAttr(fx.bg.url)}');`;
    body.push(`<div id="personBg" style="position:absolute;inset:0;display:none;${bgStyle}"></div>`);
  }
  // Global caption style: at render time it overrides sentence captions' preset/position/scale; the block's own slots are untouched
  // (style is global state, not baked into the block). RESOLVED here — storage is sparse, defaults come from the resolver.
  const cs = comp.captionStyle ? resolveCaptionStyle(comp) : undefined;
  const renderOne = (b: Block) => {
    const r = assembleBlockWith(b, comp, cs);
    body.push(r.html);
    scripts.push(timelineScript(b.id, r.timelineBody));
  };
  for (const b of behind) renderOne(b);
  if (fxPipeline) {
    // Matte canvas: pointer-events pass through (behind-person blocks stay clickable); transform is copied from the video by the shim each frame
    // 0–100 unitless → px (scaled by canvas resolution): feather at max ≈ W/45 (1080→24px), stroke at max ≈ W/30 (1080→36px)
    const featherPx = Math.round(((Math.max(0, Math.min(100, fx?.feather ?? 0)) / 100) * W) / 45 * 10) / 10;
    const strokePx = fx?.stroke ? Math.max(1.2, ((Math.max(0, Math.min(100, fx.stroke.width)) / 100) * W) / 30) : 0;
    body.push(
      `<canvas id="personCut" width="${W}" height="${H}" ` +
        `data-feather="${n(featherPx)}" ` +
        `data-stroke-w="${n((fx?.stroke?.width ?? 0) > 0 ? strokePx : 0)}" data-stroke-style="${escapeAttr(fx?.stroke?.style ?? 'solid')}" ` +
        `data-stroke-color="${escapeAttr(fx?.stroke?.color ?? '#ffffff')}" data-stroke-alpha="${n(fx?.stroke?.opacity ?? 1)}" ` +
        `style="position:absolute;inset:0;width:100%;height:100%;pointer-events:none;transform-origin:center center;will-change:transform;"></canvas>`,
    );
    scripts.push(PERSON_CUT_SHIM);
  }
  for (const b of front) renderOne(b);

  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="${STUDIO_FONTS_HREF}" rel="stylesheet" />
<style>
  * { margin: 0; box-sizing: border-box; }
  html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: ${bg}; }
  #root { position: relative; width: ${W}px; height: ${H}px; background: ${bg}; overflow: hidden;
    ${themeVarsCss(theme, comp.palette)} font-family: var(--font-body); color: var(--fg); }
  .comp { position: absolute; }
  /* media-slot placeholder: not rendered by default (clean export), shown only in editor mode (body.hf-editor) */
  .hf-ph { position:absolute; inset:0; display:none; flex-direction:column; align-items:center; justify-content:center; gap:14px;
    border:3px dashed rgba(255,255,255,0.34); border-radius:24px; color:rgba(255,255,255,0.72); background:rgba(255,255,255,0.05); }
  body.hf-editor .hf-ph { display:flex; }
  .hf-ph-plus { font-size:96px; font-weight:300; line-height:1; }
  .hf-ph-tip { font-size:34px; text-align:center; line-height:1.3; font-family:var(--font-body); }
</style>
</head>
<body>
<div id="root" data-composition-id="root" data-start="0" data-width="${W}" data-height="${H}">
${body.join('\n')}
</div>
<script src="${escapeAttr(gsapSrc)}"></script>
<script>
window.__timelines = window.__timelines || {};
${scripts.join('\n')}
</script>
</body>
</html>`;
}

/**
 * Single-block preview document: render one overlay block into self-contained HTML on its own (theme background + the block, paused mid-run),
 * for a live mini-preview on timeline hover showing "what this block looks like". The block is normalized to a 0 start; no video, no other blocks.
 */
/** The "honest ground" for single-block previews: in the asset library / generation card / timeline hover, a block is an object to overlay onto the picture —
 *  the ground must convey "transparent, sitting on the picture" (checkerboard), not fake a stage paper ground as if it were the component's own background
 *  (WYSIWYG violation: a ground shows in the list but not once inserted; a gut red line the user named).
 *  The theme wall (frame-panel) is the exception: it showcases a theme's full-page design, so keep the stage. */
// The document only goes transparent; the checkerboard is drawn by the preview container in **screen pixels** (drawing it inside the document gets scaled and blurred — been there)
const TRANSPARENT_CSS = 'background:transparent !important;';

/** The single-block composition a preview document renders: the block normalized to start at 0,
 *  on the project's canvas/theme. Exported so in-place preview patches assemble the block against
 *  the SAME composition the document was built from (otherwise a patched node drifts from a rebuild). */
export function previewMiniComp(comp: Composition, block: Block): Composition {
  return {
    width: comp.width,
    height: comp.height,
    theme: comp.theme,
    video: null,
    blocks: [{ ...block, startSec: 0 }],
    shots: [],
    ...(comp.palette ? { palette: comp.palette } : {}),
    // Caption previews also take the global style — timeline mini-cards / style cards match what's seen in the final cut
    ...(comp.captionStyle ? { captionStyle: comp.captionStyle } : {}),
  };
}

export function blockPreviewDoc(comp: Composition, block: Block, opts: { loop?: boolean | 'hover'; ground?: 'stage' | 'checker' } = {}): string {
  const mini = previewMiniComp(comp, block);
  // Pause on the stable frame after the entrance animation ends (show full content, not stuck mid-reveal); entrances mostly finish within 1s,
  // take 85% but at least 1s, capped at 0.06s before the end (avoid the tail exit)
  const at = Math.min(block.durationSec - 0.06, Math.max(1.0, block.durationSec * 0.85));
  let html = assembleHtml(mini);
  if (opts.ground === 'checker') html = html.replace('</head>', `<style>html, body, #root { ${TRANSPARENT_CSS} }</style></head>`);
  // Opening frame, declared BEFORE the runtime boots: it aligns to this time and only then reveals
  // the blocks, so nothing intermediate is ever painted. Looping previews open at 0 (the entrance
  // plays from its start); static and hover-gated ones open on the stable frame.
  const bootT = opts.loop === true ? 0 : Math.max(0, at);
  html = html.replace('</head>', `<script>window.__hfBootT=${n(bootT)};</script></head>`);
  if (opts.loop) {
    // Animated preview: rAF loops the animation — after playing, hold on the stable frame for a beat then restart (used by frame-panel style cards).
    // {type:'hf-loop',on:true,once:true} plays the entrance ONE time and settles on the stable frame
    // (the lightbox's replay button) — without `once` it keeps cycling.
    // loop:'hover' = initially paused, controlled by parent postMessage {type:'hf-loop',on} (plays only on cover-wall hover);
    // a sandboxed iframe (opaque origin) can't reach __hfPreview from the parent, so control must go through messages.
    const HOLD = 1.2;
    const cycle = Math.max(0.5, at) + HOLD;
    const auto = opts.loop === true;
    return `${html}\n<script>(function(){var playing=${auto ? 'true' : 'false'};var once=false;var t0=performance.now();
function tick(){if(playing){var e=(performance.now()-t0)/1000;var t=once?Math.min(e,${n(at)}):e%${n(cycle)};if(t>${n(at)})t=${n(at)};try{window.__hfPreview&&window.__hfPreview.seek(t);}catch(err){}if(once&&e>=${n(at)})playing=false;}requestAnimationFrame(tick);}
addEventListener('message',function(e){var d=e&&e.data;if(!d||d.type!=='hf-loop')return;if(d.on){t0=performance.now();once=!!d.once;playing=true;}else{playing=false;once=false;try{window.__hfPreview&&window.__hfPreview.seek(${n(at)});}catch(err){}}});
(function start(){if(!window.__hfPreview){setTimeout(start,16);return;}t0=performance.now();tick();})();})();</script>`;
  }
  // Static card: the head-declared boot time already opened it on the stable frame; a full seek
  // afterwards only matters for media (video currentTime), which a single-block preview has none of.
  return html;
}
