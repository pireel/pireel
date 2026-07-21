/**
 * 组装层:把 Composition 拼成完整 Hyperframes 文档(预览 iframe 与导出同源)。
 * 依赖模板注册表已就绪 —— 对外一律走 './composition' barrel(它先 import './templates')。
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
  videoFrameTimelineBody,
} from './composition-core';
import { GL_MIXER_SRC, TRANSITION_GLSL, glDirection } from './transition-gl';

/* ============================ 组装 ============================ */

/**
 * 注入到文档里的 <video> 裁主流剪辑器射 shim:把 #vidEl 的 currentTime 改成**成片时间**口径
 * (get:源→成片;set:成片→源),并用 rAF 在播放时跳过被剪区间。读 window.__segments。
 * 这样无论是预览运行时、还是导出 headless 渲染器逐帧 set currentTime,都按成片时间工作。
 */
/** 预览文档的设计字体(单一来源)。父文档(workbench)也要加载同一份——字幕拆段的
 *  canvas measureText 在父文档量,父文档没这字体会退到系统字体,西文宽度对不上就换行。 */
export const STUDIO_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700;900&family=Noto+Serif+SC:wght@700;900&family=IBM+Plex+Mono:wght@500;600&display=swap';

/** 帧 shim(canvas 模式):画父层引擎推来的帧;切点转场用 **gl-transitions 的 WebGL
 *  合成器**(GL_MIXER_SRC,与导出/面板同一份源码)——引擎在窗口内随主帧带来"另一侧"
 *  的影子帧(frame2),from/to 两条活流按上游着色器合成,p 铺满整个窗口。
 *  兜底链:影子帧断供→切点后用冻结的 A 末帧当 from(至少后半程有效果);GL 不可用/
 *  着色器编译失败→硬切。上传前先 cover 进 W×H 中转画布(纹理直传会被拉伸变形)。 */
export function videoFrameShim(transitions: { cut: number; effect: string; half: number; dx: number; dy: number }[]): string {
  return `window.__parentClock = true; // 时钟/解码/音频在父层引擎,本文档不自驱
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
  var cover = function (stage, bmp) {
    var g = stage.getContext('2d');
    var k = Math.max(W / bmp.width, H / bmp.height), dw = bmp.width * k, dh = bmp.height * k;
    g.clearRect(0, 0, W, H);
    g.drawImage(bmp, (W - dw) / 2, (H - dh) / 2, dw, dh);
    return stage;
  };
  // 按源 staging + 版本号:帧没换只重画不重 cover/不重传纹理(时钟驱动的逐 tick 重合成才能 60fps)
  var SL = function () { if (stagedLiveVer !== liveVer) { cover(stageLive, liveBmp); stagedLiveVer = liveVer; } return stageLive; };
  var SG = function () { if (stagedGhostVer !== ghostVer) { cover(stageGhost, ghostBmp); stagedGhostVer = ghostVer; } return stageGhost; };
  var drawPlain = function (bmp) {
    if (!bmp) return;
    var k = Math.max(W / bmp.width, H / bmp.height), dw = bmp.width * k, dh = bmp.height * k;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(bmp, (W - dw) / 2, (H - dh) / 2, dw, dh);
  };
  var render = function (t) {
    if (!liveBmp || !(t >= 0)) return;
    var tr = null;
    for (var i = 0; i < TRS.length; i++) { if (t >= TRS[i].cut - TRS[i].half && t <= TRS[i].cut + TRS[i].half) { tr = TRS[i]; break; } }
    if (t < lastT - 0.05 || t > lastT + 0.5) frozenCut = null; // 倒退/大跳:冻帧作废
    if (tr && lastT >= 0 && lastT < tr.cut && t >= tr.cut) {
      // 过切点:当前画布 = A 的最后一帧,冻结作影子断供的兜底 from
      frozen = frozen || mkStage();
      frozen.getContext('2d').clearRect(0, 0, W, H);
      frozen.getContext('2d').drawImage(c, 0, 0);
      frozenCut = tr.cut;
      // 换边:切点前到达的影子帧是 B 前摇,切点后 from 应是 A 尾巴——旧边帧作废,
      // 新边影子到帧前由冻结的 A 末帧顶住(内容连续,不闪跳)。到达时间在切点后的
      // 影子帧已是新边(引擎 ghostFresh 门验过),别误杀
      if (ghostBmp && ghostAtT < tr.cut) { try { ghostBmp.close(); } catch (eX) {} ghostBmp = null; }
    }
    lastT = t;
    if (!tr) { bakedWinCut = -1; drawPlain(liveBmp); return; }
    // 本窗口已由成品帧接管:旧双流合成整段让路(帧间小间隙也不许插画,插了就是叠层 strobe)
    if (bakedWinCut === tr.cut) return;
    var p = Math.min(1, Math.max(0, (t - (tr.cut - tr.half)) / (2 * tr.half))); // 0=窗口起点 1=终点
    var pre = t < tr.cut;
    // from/to:切点前 from=主帧(A)/to=影子(B 前摇);切点后 from=影子(A 尾巴)/to=主帧(B)
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
    drawPlain(liveBmp); // GL 不可用/影子未热且无冻帧:硬切
  };
  // 当前帧的源信息(personCut 要 mask 用):elKey='main'|clip_<shotId>,srcT=该源文件时间
  window.__vidSrc = null;
  window.addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.type === 'hf:seekTimelines') {
      // 播放/scrub 时钟:仅转场窗口附近按时钟重合成(影子帧短暂断供运动也继续走)
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
      // 预烧录成品帧(0.5× 同长宽比):直接铺满,合成/冻帧/簿记全部让路
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
        // 出窗后影子帧作废(窗内缺席则沿用上一张,微卡好过闪切)
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
 * 人像抠片(「文字穿人」):#personCut 画布夹在人后块与人前块之间,每帧把视频按
 * object-fit:cover 同映射画上、再用人像 mask destination-in 只留人的像素。
 * mask 由父层算(MediaPipe 在父文档,sandbox iframe 进不去):本文档 rVFC 抓视频帧
 * 缩到长边 ≤384 发 personFrame,父层分割完回 hf:personMask;单飞节流(上一张没回不发新帧)。
 * 取景变换跟随:GSAP 把取景写在 video 的 inline transform 上,逐帧原样拷到画布。
 * 导出/无父层环境:mask 永远不来,画布保持透明,自然降级成常规前景叠加。
 */
const PERSON_CUT_SHIM = `(function(){
  var v = document.getElementById('vidEl');
  var c = document.getElementById('personCut');
  if (!v || !c || !c.getContext) return;
  var ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // 效果参数由 assemble 烤进 data 属性(改配置 → setComp → 文档重建,与其它配置同路)
  var feather = parseFloat(c.getAttribute('data-feather')) || 0;
  var strokeW = parseFloat(c.getAttribute('data-stroke-w')) || 0;
  var strokeC = c.getAttribute('data-stroke-color') || '#ffffff';
  var bgEl = document.getElementById('personBg');
  var W = c.width, H = c.height;
  // 人像(视频∘mask)与描边剪影各自离屏,主画布按 描边→人像 顺序合成
  var P = document.createElement('canvas'); P.width = W; P.height = H;
  var pctx = P.getContext('2d');
  pctx.imageSmoothingEnabled = true; pctx.imageSmoothingQuality = 'high';
  var strokeStyle = c.getAttribute('data-stroke-style') || 'solid';
  var strokeAlpha = parseFloat(c.getAttribute('data-stroke-alpha'));
  if (!(strokeAlpha >= 0 && strokeAlpha <= 1)) strokeAlpha = 1;
  // 描边 = mask 轮廓追踪(marching squares)出 Path2D 再 stroke:实线/虚线都沿轮廓走,
  // 线宽取 2×目标宽 —— 内半边被上层人像盖住,视觉上只剩外圈(主流剪辑器同款"外描边")。
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
    // 逐 blob:从未消费的边界起点走 marching squares 一圈;短环(噪点)丢弃,bbox 内起点跳过
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
    // 中点二次曲线平滑(步进 3 抽稀),网格坐标建 Path2D,draw 时 translate/scale 到画布
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
      // 实时参数更新(人像浮窗滑杆/样式卡即时生效,不等文档重建;值与重建烤进 data 属性的一致)。
      // 结构性开关(personFront 层序/首次装管线)仍走重建——那是 DOM 结构不是参数。
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
              if (v.parentNode) v.insertAdjacentElement('afterend', bgEl); // 层序同 assemble:视频之上、块之下
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
      // 没 mask(此段没开抠像/轨没就绪)= 清掉旧 mask:滑进未抠像段时人像层立即消失,
      // 不残留上一段的画面;退避重问,别每帧刷父层
      mask = d.mask || null;
      if (mask) {
        try { retrace(); } catch (err2) { strokePath = null; }
      } else {
        strokePath = null;
        nextAskAt = performance.now() + 400;
      }
    }
  });
  // mask 全量预算在父层(用户开抠像时跑一次),这里只按**该源文件的时间**要现成的:
  // canvas 渲染模式下帧信息由帧 shim 记在 window.__vidSrc(elKey + 该源文件时间)
  var lastReq = -1, lastEl = '', nextAskAt = 0;
  function feed(){
    var fi = window.__vidSrc;
    if (inflight || !fi) return;
    if (performance.now() < nextAskAt) return;
    var t = fi.srcT, ek = fi.elKey || 'main';
    if (mask && ek === lastEl && Math.abs(t - lastReq) < 1 / 30) return; // 同一帧不重复要
    inflight = true;
    lastReq = t;
    lastEl = ek;
    post({ type: 'personMaskAt', t: t, el: ek });
  }
  function draw(){
    var fi = window.__vidSrc;
    // 还没有帧(装载间隙)→ 整层熄灭
    if (!fi) { ctx.clearRect(0, 0, W, H); if (bgEl) bgEl.style.display = 'none'; return; }
    ctx.clearRect(0, 0, W, H);
    // 换背景层跟着 mask 走:有 mask 的段才亮(导出/无父层/未开抠像的段一律隐藏,退回原画面)
    if (bgEl) bgEl.style.display = mask ? 'block' : 'none';
    if (!mask) return;
    // mask 的宽高比 = 源帧;画布上的帧已按 cover 摆好,mask 用同一套 cover 映射对位
    var vw = fi.w || W, vh = fi.h || H;
    var k = Math.max(W / vw, H / vh), dw = vw * k, dh = vh * k, dx = (W - dw) / 2, dy = (H - dh) / 2;
    pctx.clearRect(0, 0, W, H);
    pctx.drawImage(v, 0, 0); // 视频帧直接取自 #vidEl 画布(已 cover 合成)
    pctx.globalCompositeOperation = 'destination-in';
    if (feather > 0) pctx.filter = 'blur(' + feather + 'px)';
    pctx.drawImage(mask, dx, dy, dw, dh);
    pctx.filter = 'none';
    pctx.globalCompositeOperation = 'source-over';
    if (strokePath && strokeGrid) {
      // 轮廓描边垫在人像下:线宽 2×(内半被人像盖住 = 外描边);虚线段长随线宽走
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

/** 单条时间轴的注册脚本。体经 new Function 编译再执行:语法错误/运行时抛错都圈在本块
 *  (空时间轴照常注册),不放倒同一 <script> 里其它块 —— 人改源码和 LLM 输出都可能带坏脚本,
 *  lint 不做 JS 语法解析,这里是最后一道隔离。 */
function timelineScript(id: string, body: string): string {
  return (
    `(function(){ var tl = gsap.timeline({ paused: true }); ` +
    `try { new Function('tl', ${JSON.stringify(body)})(tl); } catch (e) { console.warn('[hf] timeline error', ${JSON.stringify(id)}, e); } ` +
    `window.__timelines[${JSON.stringify(id)}] = tl; })();`
  );
}

/**
 * 拼成完整 Hyperframes 文档。gsapSrc 可换(导出走渲染容器本地 './vendor/gsap.min.js')。
 * 预览默认自托管 /vendor/gsap.min.js(srcdoc iframe 继承父文档 base → 同源):
 * 组件库/模板墙一屏 N 个 iframe 各拉一次脚本,同源强缓存 + 国内可达,不再吊在 jsdelivr 上。
 */
/** custom 块是否自带卡面(显式 data-hf-surface 标记,或 background:var(--panel) 的卡)。
 *  有卡面时用户设背景色只做 token 覆盖 —— 卡面自己换色,容器不叠涂
 *  (整框+卡面双色重叠、卡外留白也被涂色,就是"设色后配色重叠错乱"的来源)。 */
export function customHasSurface(templateId: string, innerHtml: string): boolean {
  return templateId === 'custom' && (innerHtml.includes('data-hf-surface') || /background\s*:[^;{}]*var\(--panel\)/.test(innerHtml));
}

/** 块背景色 → 内容层 CSS(token 覆写 + 可选容器垫底)。surfaceOnly=有卡面,只换 token。
 *  同时按 bg 亮度翻转墨色族(--fg/--muted/--line/--panel-2/--grid):浅底配深墨、深底配浅墨,
 *  深主题下选浅色"浅字浅底不可读"的对比崩坏在这兜住(--accent 保持主题色)。
 *  就地补丁通道(hf:blockStyle)与整文档重组共用本函数 —— 两条路输出恒等。 */
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

export function assembleHtml(comp: Composition, gsapSrc = '/vendor/gsap.min.js'): string {
  const { width: W, height: H } = comp;
  const theme = getTheme(comp.theme);
  // 底色:派生/主题包 palette 给了 paper 就用它(frame 深色主题的预览要能真的变深),否则主题默认
  const bg = comp.palette?.paper ?? theme.background;
  const body: string[] = [];
  const scripts: string[] = [];

  if (comp.video) {
    // 视频轨 = 一块 <canvas>(canvas 渲染模式,用户定的):解码/时钟/音频全在父层引擎
    // (video-track-engine),帧经 hf:frame 推进来画。文档重建不再重造解码器 → "解码僵尸"
    // 整类问题的病根移除。id 仍叫 vidEl:取景关键帧/shotVars/personCut 的选择器零改动。
    const hasShots = !!(comp.shots && comp.shots.length);
    const editedDur = hasShots ? editedDuration(comp.shots!) : comp.video.durationSec;
    body.push(
      `<canvas id="vidEl" data-composition-id="vid" width="${n(comp.width)}" height="${n(comp.height)}" data-start="0" data-duration="${n(editedDur)}" data-track-index="0" ` +
        `style="position:absolute;inset:0;width:100%;height:100%;transform-origin:center center;will-change:transform;box-shadow:0 30px 90px rgba(0,0,0,0.45);"></canvas>`,
    );
    // 帧接收 shim + 父层时钟标记(运行时据此不自驱时钟,见 PREVIEW_RUNTIME);切点转场表烤进 shim
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
    // 镜头取景时间轴(按成片时间)注册到 vid → 变换打在画布元素上,单画布统一吃所有段的取景
    const frameBody = hasShots ? videoFrameTimelineBody(comp.shots!) : '';
    if (frameBody) {
      scripts.push(timelineScript('vid', frameBody));
    }
  }

  // 按 trackIndex 稳定排序后渲染:块不带 z-index,DOM 顺序即叠层 → 排序保证
  // 「data-track-index 越大越上层」的宣称成立,与 comp.blocks 插入顺序无关;同轨保持原顺序。
  // 转场叠层(track 60)自带 z-index:60,不受此排序影响。
  // 排序键:句级花字恒在最上层(字幕是可读性刚需,不许被组件盖住;用户定的),
  // 其余块按 trackIndex(DOM 顺序即叠层)
  const zKey = (b: Block) => (isSentenceCaption(b) ? Number.MAX_SAFE_INTEGER : b.trackIndex);
  const ordered = [...comp.blocks].sort((a, b) => zKey(a) - zKey(b));
  // 人像三明治:视频 → 换背景层 → [人物置顶时:全部块] → #personCut 抠片画布 → [常规:全部块]。
  // 抠像逐段生效(VideoShot.personMatte):有任一段开了才装管线;段外没有 mask,画布
  // 透明、背景层隐藏,自动退回常规画面。层级(personFront)/描边/背景是全局样式。
  const fx = comp.personFx;
  const fxOn = !!comp.video && (comp.shots ?? []).some((s) => s.personMatte);
  const personFront = fxOn && !!fx?.personFront;
  // 块级覆盖:b.personLayer 显式指定人前/人后,缺省跟全局 personFront
  const isBehind = (b: Block) => (fxOn ? (b.personLayer ? b.personLayer === 'behind' : personFront) : false);
  const behind = ordered.filter((b) => isBehind(b));
  const front = ordered.filter((b) => !isBehind(b));
  // 有任一块要垫到人后,抠片画布就得在(否则块级 'behind' 无从垫起)
  const fxPipeline = fxOn && (personFront || (fx?.stroke?.width ?? 0) > 0 || !!fx?.bg || behind.length > 0);
  if (fxPipeline && fx?.bg) {
    // 换背景层盖在原视频上(display:none,shim 拿到首个 mask 才亮);人像由上层抠片画布补回
    const bgStyle = fx.bg.type === 'color' ? `background:${escapeAttr(fx.bg.color)};` : `background:#000 center/cover no-repeat url('${escapeAttr(fx.bg.url)}');`;
    body.push(`<div id="personBg" style="position:absolute;inset:0;display:none;${bgStyle}"></div>`);
  }
  // 全局花字样式:渲染时覆盖句级花字的预设/位置/缩放,块自身 slots 不动(样式是全局态,不落进块)
  const cs = comp.captionStyle;
  const renderOne = (b: Block) => {
    const capBase = isSentenceCaption(b) ? { ...b, slots: { ...b.slots, canvasW: comp.width } } : b;
    const rb =
      cs && isSentenceCaption(b)
        ? { ...capBase, slots: { ...capBase.slots, preset: cs.preset, yPct: cs.yPct, xPct: cs.xPct ?? 50, wPct: cs.wPct ?? 56, scale: cs.scale, ...(cs.hPct ? { hPct: cs.hPct } : {}), ...(cs.sub?.yPct != null ? { subYPct: cs.sub.yPct } : {}), ...(cs.sub?.xPct != null ? { subXPct: cs.sub.xPct } : {}), ...(cs.sub?.wPct != null ? { subWPct: cs.sub.wPct } : {}), ...(cs.sub?.scale != null ? { subScale: cs.sub.scale } : {}), ...(cs.sub?.hPct != null ? { subHPct: cs.sub.hPct } : {}) } }
        : capBase;
    const { innerHtml, timelineBody } = renderBlock(rb);
    // autofit:内容溢出时整体缩到刚好进 box(实测得来),预览=导出
    const fit = b.fitScale && b.fitScale < 0.999 ? `transform:scale(${n(b.fitScale)});transform-origin:center center;` : '';
    // 内容等比缩放:CSS scale 属性(围绕中心),不影响布局(autofit 量 scrollWidth 不被污染),
    // 也不进 transform 串(不会被 autofit transform 覆写)
    const scaleCss = typeof b.scale === 'number' && Math.abs(b.scale - 1) > 0.005 ? `scale:${n(b.scale)};` : '';
    // 组件背景(用户在浮动条上设的):helper 见 blockBgCss/customHasSurface(就地补丁通道复用同一逻辑)
    const hasSurface = customHasSurface(b.templateId, innerHtml);
    const bgCss = b.bg ? blockBgCss(b.bg, hasSurface) : '';
    // 边框/透明度/圆角/旋转贴在最外层容器(= 取景框)上
    const frame: string[] = [];
    if (b.border) frame.push(`border:3px solid ${escapeAttr(b.border)};`);
    // 圆角:用户显式设了走它;否则有底板/边框时给个默认圆角(与旧行为一致)
    if (typeof b.radius === 'number' && b.radius > 0) frame.push(`border-radius:${n(b.radius)}px;`);
    else if ((b.bg || b.border) && b.box) frame.push('border-radius:var(--radius,24px);');
    if (typeof b.opacity === 'number' && b.opacity < 0.995) frame.push(`opacity:${n(Math.max(0.05, b.opacity))};`);
    // 整体旋转:绕中心转最外层容器(box 块的裁切窗口/满画布层一并转);与内容层的 scale/autofit 互不干扰
    if (typeof b.rotation === 'number' && Math.abs(b.rotation) > 0.01) frame.push(`transform:rotate(${n(b.rotation)}deg);transform-origin:center center;`);
    const attrs =
      `id="${b.id}" data-composition-id="${b.id}" ${b.box ? 'data-hf-box="1" ' : ''}` +
      `data-start="${n(b.startSec)}" data-duration="${n(b.durationSec)}" data-track-index="${b.trackIndex}" ` +
      `data-width="${W}" data-height="${H}"`;
    if (b.box) {
      // box 块 = 双层:容器是裁切窗口(overflow:hidden,拖边/角只动窗口),内容层
      // [data-hf-content] 按 contentBox 锚定画布 —— 裁切时内容不重排,窗口外被裁掉;
      // bg 卡面/autofit/内容缩放都在内容层(± 缩放只缩内容,超窗被裁 = 取景框内变焦)。
      const cb = b.contentBox ?? b.box;
      const pos = `left:${pct(b.box.x)};top:${pct(b.box.y)};width:${pct(b.box.w)};height:${pct(b.box.h)};`;
      const rel = `left:${pct((cb.x - b.box.x) / b.box.w)};top:${pct((cb.y - b.box.y) / b.box.h)};width:${pct(cb.w / b.box.w)};height:${pct(cb.h / b.box.h)};`;
      body.push(
        `<div class="comp" ${attrs} style="position:absolute;${pos}overflow:hidden;${frame.join('')}">\n` +
          `<div data-hf-content style="position:absolute;${rel}${bgCss}${scaleCss}${fit}">\n${innerHtml}\n</div>\n</div>`,
      );
    } else {
      // 满画布块(字幕层等):平铺单层,无裁切/缩放语义。
      // 句级字幕容器不吃点击(pointer-events:none,.cap-line 自己 auto):容器 inset:0 铺满
      // 全画布,吃点击的话字幕在屏时点画布任何空白都会命中它——"点空白选分镜"整个失效
      const pe = isSentenceCaption(b) ? 'pointer-events:none;' : '';
      body.push(`<div class="comp" ${attrs} style="position:absolute;inset:0;${pe}${bgCss}${frame.join('')}${scaleCss}${fit}">\n${innerHtml}\n</div>`);
    }
    scripts.push(timelineScript(b.id, timelineBody));
  };
  for (const b of behind) renderOne(b);
  if (fxPipeline) {
    // 抠片画布:pointer-events 穿透(人后块照常点选);transform 由 shim 逐帧从 video 拷来
    // 0–100 无单位 → px(随画布分辨率换算):羽化满档 ≈ W/45(1080→24px),描边满档 ≈ W/30(1080→36px)
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
  /* 素材位占位:默认不渲染(导出干净),仅编辑态(body.hf-editor)显示 */
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
 * 单块预览文档:把一个叠加块单独渲成自包含 HTML(主题背景 + 该块,跑到中段定格),
 * 供时间轴 hover 出"这块长啥样"的实时小预览。块归一到 0 起点;无视频、无其它块。
 */
/** 单块预览的「诚实底」:素材库/生成卡/时间轴悬停里,块是要叠进画面的对象——
 *  底必须表达"透明,叠在画面上"(棋盘格),不许垫舞台纸底冒充组件自身的背景
 *  (所见≠所得:列表里看着有底,插进去没有;用户点名的直觉红线)。
 *  主题墙(frame-panel)例外:那是主题整页设计的展示,保留 stage。 */
// 文档只负责变透明;棋盘格由预览容器按**屏幕像素**画(画在文档里会被缩放糊掉,踩过)
const TRANSPARENT_CSS = 'background:transparent !important;';

export function blockPreviewDoc(comp: Composition, block: Block, opts: { loop?: boolean | 'hover'; ground?: 'stage' | 'checker' } = {}): string {
  const mini: Composition = {
    width: comp.width,
    height: comp.height,
    theme: comp.theme,
    video: null,
    blocks: [{ ...block, startSec: 0 }],
    shots: [],
    ...(comp.palette ? { palette: comp.palette } : {}),
    // 花字预览也吃全局样式 —— 时间轴小卡/样式卡与正片所见一致
    ...(comp.captionStyle ? { captionStyle: comp.captionStyle } : {}),
  };
  // 定格到入场动画结束后的稳定帧(显示完整内容,不卡在揭示半截);入场多在 1s 内完成,
  // 取 85% 但至少 1s,封顶到末端前 0.06s(避开尾部退场)
  const at = Math.min(block.durationSec - 0.06, Math.max(1.0, block.durationSec * 0.85));
  let html = assembleHtml(mini);
  if (opts.ground === 'checker') html = html.replace('</head>', `<style>html, body, #root { ${TRANSPARENT_CSS} }</style></head>`);
  if (opts.loop) {
    // 动态预览:rAF 循环播动画 —— 播完在稳定帧上悬停一拍再从头来(frame 面板样式卡用)。
    // loop:'hover' = 初始定格,父层 postMessage {type:'hf-loop',on} 控制(封面墙悬停才播);
    // 沙箱 iframe(opaque origin)父层拿不到 __hfPreview,控制只能走消息。
    const HOLD = 1.2;
    const cycle = Math.max(0.5, at) + HOLD;
    const auto = opts.loop === true;
    return `${html}\n<script>(function(){var playing=${auto ? 'true' : 'false'};var t0=performance.now();
function tick(){if(playing){var t=((performance.now()-t0)/1000)%${n(cycle)};if(t>${n(at)})t=${n(at)};try{window.__hfPreview&&window.__hfPreview.seek(t);}catch(e){}}requestAnimationFrame(tick);}
addEventListener('message',function(e){var d=e&&e.data;if(!d||d.type!=='hf-loop')return;if(d.on){t0=performance.now();playing=true;}else{playing=false;try{window.__hfPreview&&window.__hfPreview.seek(${n(at)});}catch(err){}}});
setTimeout(function(){if(!playing){try{window.__hfPreview&&window.__hfPreview.seek(${n(at)});}catch(err){}}t0=performance.now();tick();},50);})();</script>`;
  }
  return `${html}\n<script>setTimeout(function(){try{window.__hfPreview&&window.__hfPreview.seek(${n(at)});}catch(e){}},0);</script>`;
}
