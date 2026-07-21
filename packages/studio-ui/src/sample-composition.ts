/**
 * Hyperframes composition 样板 + 浏览器预览运行时。
 *
 * 核心思路(见架构讨论):composition 就是自包含网页,直接塞 <iframe srcdoc> 即在用户
 * 浏览器里实时渲染。编辑态零服务端;同一份 HTML 之后发服务端 headless Chrome 逐帧截图导出
 * → 预览与导出同源同引擎,天然 WYSIWYG。
 *
 * 预览运行时(注入进 iframe)按 Hyperframes 的**数据属性约定**驱动:
 *  - 每个 [data-composition-id] 有 data-start/data-duration,且其 GSAP 时间轴注册在
 *    window.__timelines[id]。
 *  - __hfPreview.seek(t):对每个 composition 计算 localT=t-start,可见则显示并把它的
 *    时间轴 seek 到 localT,否则隐藏;<video>/<audio> 同理 seek currentTime。
 * 这套约定与真 Hyperframes 渲染读的是同一批属性 → 同一份 HTML 两边通用。
 */

/** 起手样板:竖屏口播风,标题卡 + 逐词高亮花字。纯 HTML+GSAP,无需 build。 */
export const STARTER_HTML = `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8" />
<style>
  * { margin: 0; box-sizing: border-box; }
  html, body { width: 1080px; height: 1920px; overflow: hidden; background: #0a0a0a;
    font-family: "PingFang SC", "Microsoft YaHei", system-ui, sans-serif; }
  #root { position: relative; width: 1080px; height: 1920px;
    background: linear-gradient(160deg, #1a1147 0%, #3a1d5c 55%, #0a0a0a 100%); }
  .comp { position: absolute; inset: 0; }
  #title { display: flex; flex-direction: column; align-items: center; justify-content: center; }
  #title h1 { color: #fff; font-size: 104px; font-weight: 800; text-align: center; max-width: 82%; line-height: 1.15; }
  #title .sub { color: #ffd24d; font-size: 42px; font-weight: 600; margin-top: 28px; }
  #cap { display: flex; align-items: flex-end; justify-content: center; padding-bottom: 300px; }
  #cap .line { display: flex; gap: 16px; }
  #cap .w { position: relative; color: #fff; font-size: 78px; font-weight: 800; padding: 0 10px; }
  #cap .w .hl { position: absolute; inset: -6px -8px; background: #ff2e4d; border-radius: 12px;
    transform: scaleX(0); transform-origin: left center; z-index: -1; }
</style>
</head>
<body>
<div id="root" data-composition-id="root" data-start="0" data-width="1080" data-height="1920">

  <!-- 标题卡:0~3s -->
  <div class="comp" id="title" data-composition-id="title" data-start="0" data-duration="3">
    <h1>三个让口播涨粉的技巧</h1>
    <div class="sub">@你的账号</div>
  </div>

  <!-- 逐词高亮花字:3~6s -->
  <div class="comp" id="cap" data-composition-id="cap" data-start="3" data-duration="3">
    <div class="line">
      <span class="w" id="w0"><span class="hl"></span>钩子</span>
      <span class="w" id="w1"><span class="hl"></span>前三秒</span>
      <span class="w" id="w2"><span class="hl"></span>定生死</span>
    </div>
  </div>

</div>

<script src="/vendor/gsap.min.js"></script>
<script>
window.__timelines = window.__timelines || {};
(function () {
  var tl = gsap.timeline({ paused: true });
  tl.from('#title h1', { opacity: 0, y: 60, duration: 0.6, ease: 'power3.out' }, 0)
    .from('#title .sub', { opacity: 0, y: 30, duration: 0.5, ease: 'power2.out' }, 0.2);
  window.__timelines['title'] = tl;
})();
(function () {
  var tl = gsap.timeline({ paused: true });
  ['#w0', '#w1', '#w2'].forEach(function (id, i) {
    tl.fromTo(id + ' .hl', { scaleX: 0 }, { scaleX: 1, duration: 0.18, ease: 'power3.out' }, i * 0.6)
      .to(id + ' .hl', { scaleX: 0, duration: 0.12, ease: 'power2.in' }, i * 0.6 + 0.5);
  });
  window.__timelines['cap'] = tl;
})();
</script>
</body>
</html>`;

/** 注入进 iframe 的预览运行时(在 composition 自身脚本之后执行,故能读到 __timelines)。
 *  播放时:视频用原生 play()(顺滑,不逐帧 seek),GSAP 花字时间轴逐帧对齐到视频时钟。
 *  拖拽/暂停时:才 seek 视频 currentTime。 */
const PREVIEW_RUNTIME = `
<script>
(function () {
  try { document.body.classList.add('hf-editor'); } catch (e) {} // 编辑态:显示素材位占位(导出不注入此运行时 → 占位不渲染)
  function comps() { return Array.prototype.slice.call(document.querySelectorAll('[data-composition-id]')); }
  function media() { return Array.prototype.slice.call(document.querySelectorAll('video,audio')); }
  function num(el, a, d) { var v = parseFloat(el.getAttribute(a)); return isNaN(v) ? d : v; }
  function tlOf(id) { return (window.__timelines && window.__timelines[id]) || null; }
  // 主时钟视频:主轨(track 0)里**正在播**的那个 —— 多源主轨下外部插入段播放时主视频停摆,
  // 时钟必须跟 clip 走(clip 的 data-start+currentTime 恰好就是成片时间),否则 raf 积分漂移
  // 会提前撞 ended。都没在播回退 #vidEl。
  function primaryVideo() {
    var vids = document.querySelectorAll('video[data-track-index="0"]');
    for (var i = 0; i < vids.length; i++) { if (!vids[i].paused && !vids[i].ended) return vids[i]; }
    return document.getElementById('vidEl') || document.querySelector('video');
  }
  // 成片裁剪的 成片↔源 映射 + 播放跳剪,由文档里注入的 VIDEO_TRIM_SHIM 在 #vidEl 的 currentTime 上处理。
  // 这里运行时把视频当**成片时间**口径用即可(currentTime 读写都是成片时间)。

  function duration() {
    var max = 0;
    comps().forEach(function (el) {
      var s = num(el, 'data-start', 0);
      var tl = tlOf(el.getAttribute('data-composition-id'));
      var d = num(el, 'data-duration', tl ? tl.duration() : 0);
      if (s + d > max) max = s + d;
    });
    media().forEach(function (m) {
      var s = num(m, 'data-start', 0);
      var d = num(m, 'data-duration', isFinite(m.duration) ? m.duration : 0);
      if (s + d > max) max = s + d;
    });
    return max || 5;
  }

  // 只对齐花字/层(GSAP 时间轴 + 可见性),不碰视频 currentTime —— 播放时每帧调,顺滑。
  function seekTimelines(t) {
    lastSeekT = t; // 「最近渲染时刻」必须含播放逐帧:capEdit/animPreview 的恢复都回放它,
    // 只在完整 seek 记的话,暂停瞬间的恢复会跳回播放前的旧时刻(实录:一暂停动画全归零)
    comps().forEach(function (el) {
      var id = el.getAttribute('data-composition-id');
      var s = num(el, 'data-start', 0);
      var tl = tlOf(id);
      var d = num(el, 'data-duration', tl ? tl.duration() : 1e9);
      if (id !== 'root') el.style.visibility = (t >= s && t < s + d) ? 'visible' : 'hidden';
      if (tl) tl.time(Math.max(0, Math.min(t - s, tl.duration())));
    });
    media().forEach(function (m) {
      if (m.tagName === 'VIDEO') {
        var s = num(m, 'data-start', 0);
        var d = num(m, 'data-duration', 1e9);
        m.style.visibility = (t >= s && t < s + d) ? 'visible' : 'hidden';
      }
    });
  }

  // 完整 seek(含视频 currentTime,成片时间口径)—— 拖拽/暂停定位用。
  var lastSeekT = 0; // 最近一次定位(视频晚就绪时 loadedmetadata 补 seek 用)
  function seek(t) {
    lastSeekT = t;
    media().forEach(function (m) {
      var s = num(m, 'data-start', 0);
      try { m.currentTime = Math.max(0, t - s); } catch (e) {}
    });
    seekTimelines(t);
  }

  // —— 「选中=强显」机制已整体退役(2026-07-13):在运行时逆向重构"块落定后的样子"
  //    对生成代码的初态写法(tl.from 内联 / CSS 规则基态+tl.to / 多条 tween)是打不完的
  //    地鼠。现在**选中不可见块=父层把播放头挪到该块落定时刻**,画面=播放渲染的真实
  //    结果,零形态特判。本文档只保留 clearProps 口径给 animPreview 收尾用。
  // ⚠️ clearProps 只许点名动画会碰的属性:'all' 会连**作者写的内联样式**一起清
  //   (renderMedia 的 .hf-media、LLM 块里的 style="…" 全遭殃,实测图片塌成自然尺寸)。
  var FOCUS_CLEAR = 'opacity,visibility,transform,clipPath,filter';

  function play(t) {
    media().forEach(function (m) {
      var s = num(m, 'data-start', 0);
      try { m.currentTime = Math.max(0, t - s); } catch (e) {}
      var p = m.play && m.play();
      // 起播被拒(典型:autoplay 权限没落到 opaque origin 文档)必须上报 —— 静默吞掉的话
      // 表现就是"播放头在走、视频画面冻着",谁也查不到
      if (p && p.catch) p.catch(function (err) {
        try { console.warn('[hf] play() rejected', err && err.name, err && err.message); } catch (e2) {}
        fpost({ type: 'playBlocked', name: err && err.name, msg: String((err && err.message) || '').slice(0, 140) });
      });
    });
    // canvas 渲染模式(__parentClock):时钟/视频帧归父层引擎,本文档不自驱不报 clock/ended;
    // 上面 media() 只剩画中画素材,照常起播即可。父层每帧发 hf:seekTimelines 对齐叠加层。
    if (window.__parentClock) { drive.on = false; return; }
    startDrive(t);
  }
  function pause() {
    drive.on = false;
    media().forEach(function (m) { try { m.pause(); } catch (e) {} });
    // 暂停=冻结在当前播放状态(用户定的),踩过"一暂停动画跳回基态"。
  }

  // —— 播放驱动循环(iframe 自驱,单一时钟源):有视频跟视频成片钟,没有/没播起来就自己积分;
  //    每帧对齐花字时间轴 + 单向上报位置(src 标注钟源,父层只观察);播完上报 ended。
  //    父层不再每帧发号施令 —— play/pause/seek 是仅有的三个一次性命令。
  // 解码僵尸自愈:paused=false、ready=4、currentTime 却不走(实录:重建文档首次装载的
  // 解码器可能生而僵死,疑与旧文档解码器未释放的竞争有关;微量 seek 踢不醒,只有重建
  // 媒体装载能救)。驱动循环 600ms 检出 → 就地 load() 循环重建,恢复 <1s。
  var zombie = { ct: -1, ts: 0, heals: 0 };
  // 僵尸检测/自愈必须用**原始** currentTime:裁剪后 raw 落在首段之前时,成片口径(s2e)会
  // 合法地停在 0,旧口径把正常追帧误判成僵尸 → 反复重建装载,播放彻底起不来(实录)。
  var rawDrv = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
  function rawTime(m) { try { return rawDrv.get.call(m); } catch (e) { return m.currentTime; } }
  function healZombie(v) {
    if (zombie.heals >= 3) return;
    if (!v.currentSrc) return; // 没有源的元素(blob 失效未复活)不是僵尸,重建装载救不了它
    zombie.heals++;
    try {
      console.warn('[hf] 解码僵尸自愈:重建媒体装载', { ct: v.currentTime, heal: zombie.heals });
      var edited = v.currentTime;
      var url = v.src;
      v.removeAttribute('src');
      v.load(); // 释放僵死的解码器会话
      v.src = url;
      v.addEventListener('loadedmetadata', function () {
        try {
          v.currentTime = edited;
          var p = v.play();
          if (p && p.catch) p.catch(function (e2) {});
        } catch (e3) {}
      }, { once: true });
      v.load();
    } catch (e4) {}
  }
  var drive = { on: false, t: 0, last: 0 };
  function startDrive(t0) {
    drive.t = t0;
    drive.last = performance.now();
    zombie.ct = -1;
    zombie.ts = performance.now();
    if (drive.on) return; // 已在驱动:只重定位
    drive.on = true;
    (function loop() {
      if (!drive.on) return;
      var now = performance.now();
      var v = primaryVideo();
      var fromVideo = !!(v && !v.paused && !v.ended);
      if (fromVideo) {
        var vct = rawTime(v);
        if (Math.abs(vct - zombie.ct) > 0.01) { zombie.ct = vct; zombie.ts = now; }
        else if (now - zombie.ts > 600 && !v.seeking && v.readyState >= 2) { zombie.ts = now; healZombie(v); }
      }
      if (fromVideo) drive.t = clock();
      else drive.t += (now - drive.last) / 1000;
      drive.last = now;
      var D = duration();
      if (drive.t >= D) {
        drive.on = false;
        media().forEach(function (m) { try { m.pause(); } catch (e) {} });
        seekTimelines(D);
        fpost({ type: 'ended', t: D });
        return;
      }
      seekTimelines(drive.t);
      fpost({ type: 'clock', t: drive.t, src: fromVideo ? 'video' : 'raf' });
      requestAnimationFrame(loop);
    })();
  }

  // 播放主时钟 = 口播视频的**成片**进度(currentTime 经 shim 已是成片时间);无视频返回 null。
  function clock() {
    var v = primaryVideo();
    return v ? v.currentTime + num(v, 'data-start', 0) : null;
  }

  // —— autofit 实测:每个块内容溢出它的 box 多少 → 缩放系数 k。scrollW/H 是**布局**值,不受 GSAP transform
  //    或已套的 scale 影响,所以可重复测且幂等。**测完就地套用**(不等父层回推——双缓冲下父层
  //    回推的目标可能是另一个缓冲,时序丢缩放 → 字体溢出裸奔);父层只记进 Block.fitScale 给导出。
  function fpost(m) { m.source = 'hf'; try { parent.postMessage(m, '*'); } catch (e) {} }
  // box 块是双层(容器=裁切窗口 + [data-hf-content] 内容层):autofit 的测量/套用都对内容层 ——
  // 容器 overflow:hidden 且入场动效可能占用容器 transform,内容层才是内容的真布局框
  function fitTarget(el) { return el.querySelector('[data-hf-content]') || el; }
  function applyFit(id, k) {
    var el = document.querySelector('[data-composition-id="' + id + '"]');
    if (!el) return;
    el = fitTarget(el);
    k = Number(k);
    if (k > 0 && k < 0.999) { el.style.transform = 'scale(' + k + ')'; el.style.transformOrigin = 'center center'; }
    else { el.style.transform = ''; }
  }
  function measureFit() {
    var fits = {};
    comps().forEach(function (el) {
      var id = el.getAttribute('data-composition-id');
      if (id === 'root' || id === 'vid') return;
      var t = fitTarget(el);
      var cw = t.clientWidth, ch = t.clientHeight;
      if (!cw || !ch) return;
      // 容差 2px:忽略亚像素/取整造成的伪溢出,只在真超出时算缩放
      var kw = t.scrollWidth > cw + 2 ? cw / t.scrollWidth : 1;
      var kh = t.scrollHeight > ch + 2 ? ch / t.scrollHeight : 1;
      fits[id] = Math.floor(Math.min(kw, kh) * 100) / 100; // 量化 0.01 防抖
      applyFit(id, fits[id]); // 就地生效
    });
    fpost({ type: 'fit', fits: fits });
  }
  function triggerFit() { try { requestAnimationFrame(function () { requestAnimationFrame(measureFit); }); } catch (e) { measureFit(); } }

  window.__hfPreview = { seek: seek, seekTimelines: seekTimelines, play: play, pause: pause, clock: clock, duration: duration, measureFit: measureFit };

  // 父层控制协议:iframe 带 sandbox(opaque origin)后父层拿不到 contentWindow.__hfPreview,
  // 控制全走消息。__hfPreview 仍保留(blockPreviewDoc 的单块预览在文档内自调)。
  window.addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.type === 'hf:seek') { try { seek(Number(d.t) || 0); } catch (err) {} }
    else if (d.type === 'hf:seekTimelines') { try { seekTimelines(Number(d.t) || 0); } catch (err) {} }
    else if (d.type === 'hf:play') { try { play(Number(d.t) || 0); } catch (err) {} }
    else if (d.type === 'hf:pause') { try { pause(); } catch (err) {} }
    else if (d.type === 'hf:shotVars' && d.vars) {
      // 取景大小拖动中:直接 gsap.set 视频取景变换(零 setState 契约,同 hf:capStyle);
      // 松手后父层提交 comp,重建的时间轴关键帧/inline 变换与这里的终值一致,切换无跳变。
      // target:外部插入段的取景打在它自己的 clip <video> 上(缺省主视频)
      try { window.gsap && window.gsap.set(d.target || '#vidEl', d.vars); } catch (err) {}
    }
    else if (d.type === 'hf:vidTimeline') {
      // 取景就地换轨:杀旧 vid 时间轴、装新体、按当前时刻重演。取景类改动不再整文档重建
      // ——重建会让视频画布空一帧(闪),快速连点取景卡尤其明显。体经 new Function 编译,
      // 与 assemble 的 timelineScript 同款隔离(坏体=空时间轴,不放倒运行时)。
      try {
        var oldVt = window.__timelines && window.__timelines['vid'];
        if (oldVt && oldVt.kill) { try { oldVt.kill(); } catch (errK) {} }
        var nvt = window.gsap.timeline({ paused: true });
        try { new Function('tl', String(d.body || ''))(nvt); } catch (errB) { console.warn('[hf] vidTimeline error', errB); }
        window.__timelines['vid'] = nvt;
        seekTimelines(lastSeekT);
      } catch (err) {}
    }
    else if (d.type === 'hf:animPreview' && d.id) {
      // 动效卡点击:当场把该入/出场演一遍,演完回聚焦全显示态。
      // 变换值与 templates.ts 的 MEDIA_ENTER/MEDIA_EXIT 同源,改那边记得同步这里
      try {
        var apHost = document.querySelector('[data-composition-id="' + d.id + '"]');
        var apT = apHost && (apHost.querySelector('.hf-media') || apHost);
        if (apT && window.gsap) {
          var AP_IN = { fade: { autoAlpha: 0 }, slide: { autoAlpha: 0, x: -60 }, rise: { autoAlpha: 0, y: 60 }, scale: { autoAlpha: 0, scale: 0.8 } };
          var AP_OUT = { fade: { autoAlpha: 0 }, slide: { autoAlpha: 0, x: 60 }, rise: { autoAlpha: 0, y: -60 }, scale: { autoAlpha: 0, scale: 0.8 } };
          var apV = (d.phase === 'out' ? AP_OUT : AP_IN)[d.effect];
          var apD = Math.max(0.15, Math.min(Number(d.dur) || 0.5, 2));
          window.gsap.killTweensOf(apT);
          // 演完清临时内联,再把该块的时间轴强制渲回当前时刻的真实状态(选中已把播放头
          // 挪到落定时刻,真实状态就是可见的;render 带 force,同值不被 GSAP 短路)
          var apEnd = function () {
            try {
              window.gsap.set(apT, { clearProps: FOCUS_CLEAR });
              var apTl = tlOf(d.id);
              if (apHost && apTl && apTl.render) apTl.render(Math.max(0, Math.min(lastSeekT - num(apHost, 'data-start', 0), apTl.duration())), true, true);
            } catch (e2) {}
          };
          if (!apV) apEnd();
          else if (d.phase === 'out') window.gsap.fromTo(apT, { autoAlpha: 1, x: 0, y: 0, scale: 1 }, Object.assign({ duration: apD, ease: 'power2.in', onComplete: apEnd }, apV));
          else window.gsap.from(apT, Object.assign({ duration: apD, ease: 'power2.out', onComplete: apEnd }, apV));
        }
      } catch (err) {}
    }
    else if (d.type === 'hf:capStyle') {
      // 花字全局样式即时预览(拖动中零 setState,同组件的 hf:nudge/hf:boxSize 契约):
      // 位置直改 .cap-line 的 left/bottom;字号直改每个 .w 的 font-size(缩放=字体大小,
      // 不动 transform → 与 GSAP 入场零冲突)。底板 padding 等重建时按新字号重烤。
      try {
        document.querySelectorAll('.cap-line').forEach(function (cl) {
          // 同值跳过:重复写 style 也会脏样式触发重排,拖动每帧一次就是持续卡顿
          if (typeof d.xPct === 'number') {
            var lv = d.xPct + '%';
            if (cl.style.left !== lv) cl.style.left = lv;
          }
          if (typeof d.yPct === 'number') {
            var bv = (100 - d.yPct) + '%';
            if (cl.style.bottom !== bv) cl.style.bottom = bv;
          }
          if (typeof d.hPct === 'number') {
            var mh = d.hPct > 0 ? d.hPct + '%' : '';
            if (cl.style.minHeight !== mh) cl.style.minHeight = mh; // 框高:底板(min-height)跟手
          }
          if (typeof d.fontPx === 'number') {
            cl.querySelectorAll('.w').forEach(function (wEl) {
              var fv = d.fontPx + 'px';
              if (wEl.style.fontSize !== fv) wEl.style.fontSize = fv;
            });
          }
        });
      } catch (err) {}
    }
    else if (d.type === 'hf:capSubStyle') {
      // 译文行即时预览:与主行 hf:capStyle **同一契约**——位置直改 left/bottom、框高改
      // min-height;字号不走 live(与主行同因:改字号要重分段,等松手重建一步到位)
      try {
        document.querySelectorAll('.cap-sub').forEach(function (el) {
          if (typeof d.xPct === 'number') {
            var lv = d.xPct + '%';
            if (el.style.left !== lv) el.style.left = lv;
          }
          if (typeof d.yPct === 'number') {
            var bv = (100 - d.yPct) + '%';
            if (el.style.bottom !== bv) { el.style.bottom = bv; el.style.top = 'auto'; }
          }
          if (typeof d.hPct === 'number') {
            var mh = d.hPct > 0 ? d.hPct + '%' : '';
            if (el.style.minHeight !== mh) el.style.minHeight = mh;
          }
        });
      } catch (err) {}
    }
    else if (d.type === 'hf:capEdit') {
      // 编辑态强显:字幕带 fade 入场,播放头常停在透明度很低的时刻——选中字幕时把
      // 当前段强制到不透明度 1(段序号由父层按同一拆段口径算好传来);取消选中/播放时
      // 重跑 seekTimelines 恢复时间轴真实状态(GSAP 会把 inline opacity 写回正确值)。
      try {
        document.querySelectorAll('.cap-line[data-hf-edit]').forEach(function (pe) {
          pe.removeAttribute('data-hf-edit');
        });
        if (d.id != null && typeof d.seg === 'number') {
          var ceEl = document.getElementById(String(d.id));
          var ceSeg = ceEl && ceEl.querySelector('#' + String(d.id) + '-s' + d.seg);
          if (ceSeg) {
            ceSeg.setAttribute('data-hf-edit', '1');
            ceSeg.style.opacity = '1';
            ceSeg.style.visibility = 'visible';
          }
        } else {
          seekTimelines(lastSeekT); // 恢复:时间轴按当前时刻重写各段状态
        }
      } catch (err) {}
    }
    else if (d.type === 'hf:measureFit') { triggerFit(); } // 父层几何-only 提交后重测 autofit(box 变小内容溢出要缩)
    else if (d.type === 'hf:measure' && d.id) {
      // 量某块可见内容的真实矩形(花字选中框用:字幕行是 iframe 内 CSS 排版,父层只能实测)。
      // 花字框是**全局样式**的手柄(用户定的),量第一段作代表落位,不跟当前词跳
      try {
        var msEl = document.getElementById(String(d.id));
        var msT = msEl && (d.sub ? msEl.querySelector('.cap-sub') : (msEl.querySelector('.cap-line') || msEl));
        if (msT) {
          var msR = msT.getBoundingClientRect();
          var msW = document.documentElement.clientWidth || 1;
          var msH = document.documentElement.clientHeight || 1;
          fpost({ type: 'measure', id: d.id, sub: !!d.sub, rect: { x: msR.left / msW, y: msR.top / msH, w: msR.width / msW, h: msR.height / msH } });
        }
      } catch (err) {}
    }
    else if (d.type === 'hf:remove' && d.id) {
      // 即时删块(不等 300ms 防抖重建+双缓冲切换):删除要跟手;重建照走,换进来的文档本来就没这块
      try {
        var rmEl = document.getElementById(String(d.id));
        if (rmEl && rmEl.classList.contains('comp')) rmEl.remove();
        if (window.__timelines && window.__timelines[d.id]) {
          try { window.__timelines[d.id].kill(); } catch (err2) {}
          delete window.__timelines[d.id];
        }
      } catch (err) {}
    }
    else if (d.type === 'hf:teardown') {
      // 即将被替换的旧缓冲:立即释放媒体装载(解码器会话不等 GC —— 新文档的解码器
      // 若与未释放的旧会话竞争,可能生而僵死)
      try {
        pause();
        var tv = primaryVideo();
        if (tv) { tv.removeAttribute('src'); tv.load(); }
      } catch (err) {}
    }
    else if (d.type === 'hf:fit' && d.fits) {
      // 父层推送的已知缩放(装载初期、fonts.ready 实测前先按上次记录顶上,防溢出一闪)
      Object.keys(d.fits).forEach(function (id) { applyFit(id, d.fits[id]); });
    }
    else if (d.type === 'hf:ping') {
      // 活体应答:父层切换缓冲前靠它确认本文档的脚本/监听真的就绪
      // (load 事件会被空载竞态/字体阻塞骗过,曾把画面切给聋文档)
      fpost({ type: 'pong', nonce: d.nonce });
    }
    else if (d.type === 'hf:video' && d.file) {
      // 本地 blob 视频:sandbox iframe 与父层不同源,父层的 blob: URL 这里读不到 →
      // 父层把 File 结构化克隆传进来,本文档自己造 object URL(文档销毁自动回收)。
      // 幂等:已注入过就跳过(父层的播放看门狗会重发,重设 src 会打断正在播的视频)。
      var v = document.getElementById('vidEl');
      // force = 看门狗判定解码僵尸,强制重建 src(新 object URL + 重新装载)踹醒它
      if (v && (!v.__hfInjected || d.force)) {
        try {
          if (d.force && v.src) { try { URL.revokeObjectURL(v.src); } catch (err2) {} }
          v.src = URL.createObjectURL(d.file);
          v.__hfInjected = true;
          v.addEventListener('loadedmetadata', function () { try { if (v.paused) seek(lastSeekT); } catch (err) {} }, { once: true });
        } catch (err) {}
      }
    }
    else if (d.type === 'hf:clipFile' && d.file && d.id) {
      // 本地外部插入段(多源主轨):与 hf:video 同款——文件留在本地不上传,File 结构化克隆
      // 传进来自己造 object URL。幂等:装载过就跳过。
      var ce = document.getElementById(String(d.id));
      if (ce && !ce.__hfInjected) {
        try {
          ce.src = URL.createObjectURL(d.file);
          ce.__hfInjected = true;
          ce.addEventListener('loadedmetadata', function () { try { if (ce.paused) seek(lastSeekT); } catch (err) {} }, { once: true });
        } catch (err) {}
      }
    }
  });
  try { seek(0); } catch (e) {}
  // 字体就绪 + 两帧后测(等版式/CJK 字形稳定,否则量出来偏)
  try {
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) document.fonts.ready.then(triggerFit);
    else triggerFit();
  } catch (e) { triggerFit(); }
})();
</script>
<script>
/* 编辑桥(v0 式直接在预览里改):单击选块,点中 [data-edit] 文字直接就地改(光标落点击处)→ 父层回写 slot;
   按住块身拖 >4px → boxDragStart/boxDrag(dx,dy 为 comp px)/boxDragEnd → 父层换算写回 Block.box。
   子→父:{source:'hf',type:'select'|'edit'|'boxDragStart'|'boxDrag'|'boxDragEnd',...}
   父→子:{type:'hf:selectBlock'|'hf:clearSel'} */
(function () {
  var st = document.createElement('style');
  // 选中描边:满画布块(字幕等)靠它显选中,常显;有 box 的块(卡片)idle 时父层已画选中框
  // (BoxEditOverlay,更清晰),这条描边只在体拖中(父层框让位)才亮 —— 否则和父层框叠成双框。
  st.textContent = '[data-hf-sel]:not([data-hf-box]),[data-hf-sel][data-hf-dragging]{outline:3px solid var(--accent,#37e1ff);outline-offset:3px;border-radius:4px}'
    + '[data-hf-sel]{cursor:move}'
    + '[data-edit]{cursor:text} [data-composition-id]:not(#root):not([data-composition-id="vid"]){cursor:pointer}'
    // 拖动块时别选中文本:全局禁选,唯就地改字的 contenteditable 恢复可选(不然改字选不了字)
    + 'body{-webkit-user-select:none;user-select:none}'
    + '[contenteditable="true"]{-webkit-user-select:text;user-select:text}'
    + '[contenteditable="true"]{outline:2px dashed var(--accent,#37e1ff);cursor:text}';
  document.head.appendChild(st);

  var sel = null;
  function highlight(el) {
    if (sel && sel !== el) sel.removeAttribute('data-hf-sel');
    sel = el || null;
    if (sel) sel.setAttribute('data-hf-sel', '');
  }
  // 最近的可选块(排除 root 与视频轨)
  function closestComp(el) {
    while (el && el !== document.body) {
      if (el.getAttribute) {
        var id = el.getAttribute('data-composition-id');
        if (id && id !== 'root' && id !== 'vid') return el;
      }
      el = el.parentNode;
    }
    return null;
  }
  function post(m) { m.source = 'hf'; try { parent.postMessage(m, '*'); } catch (e) {} }

  var dragEndAt = 0; // 体拖松手后浏览器会补发一个 click,不当单击(否则拖完就误入改字)
  document.addEventListener('click', function (e) {
    if (performance.now() - dragEndAt < 350) return;
    if (e.target && e.target.getAttribute && e.target.getAttribute('contenteditable') === 'true') return; // 编辑中不抢选
    var comp = closestComp(e.target);
    if (comp) {
      highlight(comp);
      // 字幕块分靶:点译文行(.cap-sub)= 选第二字幕,父层只出译文手柄;点主行/其它 = 主
      var selPart = e.target && e.target.closest && e.target.closest('.cap-sub') ? 'sub' : 'main';
      post({ type: 'select', blockId: comp.getAttribute('data-composition-id'), part: selPart });
      // 单击文字即改(Notion 式,不需要双击);拖动语义不受影响 —— 体拖有 4px 阈值,拖过就不算 click
      var ed = e.target && e.target.closest ? e.target.closest('[data-edit]') : null;
      if (ed && comp.contains(ed)) enterEdit(ed, comp, e);
      // 图片 slot:点中块内 <img>(素材位整图 .hf-media 除外,那是块本体)→ 上报序号 + 归一矩形,
      // 父层据此贴着图片位置出图片专属工具条(换图/删除),零 LLM
      var im = e.target && e.target.closest ? e.target.closest('img') : null;
      if (im && comp.contains(im) && !(im.classList && im.classList.contains('hf-media'))) {
        var W0 = rootDim('data-width', 1080), H0 = rootDim('data-height', 1920);
        var imgs = comp.querySelectorAll('img'), idx = -1;
        for (var ii = 0; ii < imgs.length; ii++) if (imgs[ii] === im) idx = ii;
        var ir = im.getBoundingClientRect();
        post({ type: 'imgSel', blockId: comp.getAttribute('data-composition-id'), index: idx, rect: { x: ir.left / W0, y: ir.top / H0, w: ir.width / W0, h: ir.height / H0 } });
      }
    }
    else { highlight(null); post({ type: 'select', blockId: null }); } // 点空白/视频 = 取消选中(否则选中框没有消失的途径)
  }, true);

  // —— 块移动引擎(体拖 + 父层手柄拖共用)——
  // 拖动期间只在本文档里移动(零 React 重渲,顺滑),吸附画布中线并上报参考线;
  // 结束把最终位移交父层一次性写回 Block.box。位移保留到父层重建文档后原子切换,
  // 两边位置一致,无跳变。只有 [data-hf-box](有 box 的块)可拖;dx/dy 是 comp px。
  // ⚠️ 位移用 CSS translate **属性**(不是 transform):autofit 的 applyFit 会整串覆写
  // el.style.transform,若共用 transform,后台缓冲装载测量回推 fit 时会把拖动位移抹掉
  // (表现为松手后先跳回原位、文档切换后又跳到新位)。两属性各管各的,互不冲掉。
  var nudge = null;
  function rootDim(a, f) { var r = document.getElementById('root'); var v = r && parseFloat(r.getAttribute(a)); return v || f; }
  function baseTranslate(el) {
    // 注意:本段活在模板字符串里,正则的反斜杠必须双写,否则 \\d 会被外层字符串转义吃掉
    var m = /(-?[\\d.]+)px(?:\\s+(-?[\\d.]+)px)?/.exec(el.style.translate || '');
    return { x: m ? parseFloat(m[1]) : 0, y: m && m[2] ? parseFloat(m[2]) : 0 };
  }
  function beginNudge(el) {
    if (!el || !el.hasAttribute('data-hf-box')) return false;
    var b = baseTranslate(el); // 上一次拖动尚未随文档重建落地时,新拖动叠在其上
    nudge = {
      el: el, id: el.getAttribute('data-composition-id'),
      rect0: el.getBoundingClientRect(), bx: b.x, by: b.y,
      W: rootDim('data-width', 1080), H: rootDim('data-height', 1920), dx: 0, dy: 0,
    };
    post({ type: 'boxDragStart', blockId: nudge.id });
    return true;
  }
  function applyNudge(dx, dy) {
    if (!nudge) return;
    var r = nudge.rect0, W = nudge.W, H = nudge.H;
    // 不做边界钳制:组件允许拖出画布,出界部分被画布 overflow 截断(toolbar 由父层钳住,永远够得着)
    // 中心吸附:块中心贴近画布中线 1.5% 内吸上(体拖专属;父层细边条拖动仍是不吸的精调通道)
    var cx = r.left + r.width / 2 + dx, cy = r.top + r.height / 2 + dy;
    var snapX = Math.abs(cx - W / 2) < W * 0.015, snapY = Math.abs(cy - H / 2) < H * 0.015;
    if (snapX) dx = W / 2 - (r.left + r.width / 2);
    if (snapY) dy = H / 2 - (r.top + r.height / 2);
    nudge.dx = dx; nudge.dy = dy;
    // ghost 语义(同字幕手柄,用户定的):内容不实时动,只上报位移 —— 父层画虚线 ghost 跟手,
    // 松手 boxDragEnd 一次提交(免重建通道把终值一次打回本文档)
    post({ type: 'boxDrag', blockId: nudge.id, dx: dx, dy: dy, snapX: snapX, snapY: snapY });
  }
  function endNudge() {
    if (!nudge) return;
    post({ type: 'boxDragEnd', blockId: nudge.id, dx: nudge.dx, dy: nudge.dy });
    nudge = null;
  }

  // 体拖:按住块身拖 >4px = 移动这个块。拖没拖过阈值不发,单击选块/双击改字语义原样保留。
  // 丢 pointerup 三防:①拖起即 setPointerCapture(指针划出 iframe 也持续收 move/up);
  // ②move 里 buttons===0 即刻收尾(万一 up 还是错过,松开后不会再跟着鼠标走);③pointercancel 同 up。
  document.addEventListener('dragstart', function (e) { e.preventDefault(); }, true); // 预览里禁原生拖拽(图片拖影会劫持体拖)
  document.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    if (e.target && e.target.closest && e.target.closest('[contenteditable="true"]')) return; // 编辑中不拖
    var comp = closestComp(e.target);
    if (!comp || !comp.hasAttribute('data-hf-box')) return;
    var sx = e.clientX, sy = e.clientY, started = false, raf = 0, lx = 0, ly = 0;
    function mv(ev) {
      if (ev.buttons === 0) { up(); return; } // 按钮已松(错过 up):立即结束,别跟着裸移动走
      var dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (!started) {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        highlight(comp);
        post({ type: 'select', blockId: comp.getAttribute('data-composition-id') });
        started = beginNudge(comp);
        if (!started) { up(); return; }
        try { comp.setPointerCapture(ev.pointerId); } catch (err) {}
      }
      lx = dx; ly = dy;
      if (!raf) raf = requestAnimationFrame(function () { raf = 0; applyNudge(lx, ly); });
    }
    function up(ev) {
      document.removeEventListener('pointermove', mv);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      if (ev && ev.pointerId != null) { try { comp.releasePointerCapture(ev.pointerId); } catch (err) {} }
      if (raf) { cancelAnimationFrame(raf); raf = 0; applyNudge(lx, ly); }
      if (started) { endNudge(); dragEndAt = performance.now(); }
    }
    document.addEventListener('pointermove', mv);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  }, true);

  // 就地改字:单击 [data-edit] 即进入,光标落在点击处(落不到再退到末尾),blur 提交回父层
  function enterEdit(ed, comp, ev) {
    if (ed.getAttribute('contenteditable') === 'true') return;
    ed.setAttribute('contenteditable', 'true');
    ed.focus();
    try {
      var r = null;
      if (ev && document.caretRangeFromPoint) r = document.caretRangeFromPoint(ev.clientX, ev.clientY);
      else if (ev && document.caretPositionFromPoint) {
        var p = document.caretPositionFromPoint(ev.clientX, ev.clientY);
        if (p) { r = document.createRange(); r.setStart(p.offsetNode, p.offset); r.collapse(true); }
      }
      if (!r || !ed.contains(r.startContainer)) { r = document.createRange(); r.selectNodeContents(ed); r.collapse(false); }
      var s = getSelection(); s.removeAllRanges(); s.addRange(r);
    } catch (err) {}
    function commit() {
      ed.removeEventListener('blur', commit);
      ed.removeAttribute('contenteditable');
      post({ type: 'edit', blockId: comp.getAttribute('data-composition-id'), key: ed.getAttribute('data-edit'), value: ed.textContent });
    }
    ed.addEventListener('blur', commit);
    ed.addEventListener('keydown', function (k) {
      if (k.key === 'Enter' && !k.shiftKey) { k.preventDefault(); ed.blur(); }
      if (k.key === 'Escape') { k.preventDefault(); ed.textContent = ed.textContent; ed.blur(); }
    });
  }

  // 快捷键转发:点过预览后焦点在本 iframe(独立焦点上下文),父层 keydown 收不到 ——
  // 把编辑快捷键原样转发回父层统一处理;就地改字(contenteditable)中不转发。
  var FWD_KEYS = { ' ': 1, ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1, Delete: 1, Backspace: 1, Escape: 1 };
  document.addEventListener('keydown', function (e) {
    if (e.target && e.target.closest && e.target.closest('[contenteditable="true"]')) return;
    if (!FWD_KEYS[e.key]) return;
    e.preventDefault();
    post({ type: 'key', key: e.key, shiftKey: !!e.shiftKey, metaKey: !!e.metaKey, ctrlKey: !!e.ctrlKey, altKey: !!e.altKey });
  }, true);

  window.addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.type === 'hf:selectBlock') highlight(d.blockId ? document.querySelector('[data-composition-id="' + d.blockId + '"]') : null);
    else if (d.type === 'hf:clearSel') highlight(null);
    else if (d.type === 'hf:nudge') {
      // 父层手柄拖动:走同一套移动引擎(dx/dy 已是 comp px)
      if (d.phase === 'start') beginNudge(d.blockId ? document.querySelector('[data-composition-id="' + d.blockId + '"]') : null);
      else if (d.phase === 'move') applyNudge(Number(d.dx) || 0, Number(d.dy) || 0);
      else if (d.phase === 'end') endNudge();
    }
    else if (d.type === 'hf:blockTiming') {
      // 时间窗就地补丁(时间轴拖块/裁剪的提交):运行时每帧动态读 data-start/data-duration,
      // 改属性 + 按当前时刻重演即可,不用整文档重建。容器与其内层媒体([data-start] 后代)同步。
      var bt2 = d.blockId ? document.querySelector('[data-composition-id="' + d.blockId + '"]') : null;
      if (bt2) {
        bt2.setAttribute('data-start', String(Number(d.start) || 0));
        bt2.setAttribute('data-duration', String(Number(d.duration) || 0));
        bt2.querySelectorAll('[data-start]').forEach(function (m2) {
          m2.setAttribute('data-start', String(Number(d.start) || 0));
          m2.setAttribute('data-duration', String(Number(d.duration) || 0));
        });
        try { seekTimelines(lastSeekT); } catch (err) {}
      }
    }
    else if (d.type === 'hf:blockStyle') {
      // 表观就地补丁(浮动条 bg/边框/圆角/透明度的提交):容器 frame 属性 + 内容层 bg token 族。
      // 值由父层按 assemble 同一 helper 算好(blockBgCss),与重组输出恒等 —— 空值=清干净。
      var bs = d.blockId ? document.querySelector('[data-composition-id="' + d.blockId + '"]') : null;
      if (bs) {
        bs.style.border = d.border || '';
        bs.style.borderRadius = d.radius || '';
        bs.style.opacity = d.opacity == null ? '' : String(d.opacity);
        var bc = bs.querySelector('[data-hf-content]') || bs;
        // 先清后涂:上一次 bg 打上的 token/背景全部撤掉,再按新串逐对 setProperty
        ['--panel', '--paper', '--fg', '--muted', '--line', '--panel-2', '--grid'].forEach(function (k2) { bc.style.removeProperty(k2); });
        bc.style.removeProperty('background');
        String(d.bgCss || '').split(';').forEach(function (pair) {
          var ci = pair.indexOf(':');
          if (ci < 1) return;
          var k3 = pair.slice(0, ci).trim();
          var v3 = pair.slice(ci + 1).trim();
          if (k3 && v3) bc.style.setProperty(k3, v3);
        });
      }
    }
    else if (d.type === 'hf:boxSize') {
      // 父层边/角柄裁切:过程只在本文档直改几何(零 React 重渲),父层松手才一次性提交 Block.box。
      // 容器(裁切窗口)动,内容层 [data-hf-content] 同步反向补偿(cx/cy/cw/ch,相对窗口的%)——
      // 内容锚定画布不动,拖哪条边裁哪条边
      var sel2 = d.blockId ? document.querySelector('[data-composition-id="' + d.blockId + '"]') : null;
      if (sel2) {
        sel2.style.width = (Number(d.w) * 100) + '%';
        sel2.style.height = (Number(d.h) * 100) + '%';
        if (d.x != null) sel2.style.left = (Number(d.x) * 100) + '%';
        if (d.y != null) sel2.style.top = (Number(d.y) * 100) + '%';
        var wc = sel2.querySelector('[data-hf-content]');
        if (wc && d.cw != null) {
          wc.style.left = (Number(d.cx) * 100) + '%';
          wc.style.top = (Number(d.cy) * 100) + '%';
          wc.style.width = (Number(d.cw) * 100) + '%';
          wc.style.height = (Number(d.ch) * 100) + '%';
          // 角柄等比缩放:视觉 scale 同步 ×k(scale 属性,不碰 transform/translate)
          if (d.s != null) wc.style.scale = String(Number(d.s) || 1);
        }
      }
    }
    else if (d.type === 'hf:rotate') {
      // 底部旋转手柄拖动:直改容器 transform:rotate(实时,零 React 重渲);松手父层提交 Block.rotation。
      // rotate 走 transform,与 nudge 的 translate / boxSize 的 w-h-left-top / 内容层 scale 各属性正交,互不覆写。
      var selRot = d.blockId ? document.querySelector('[data-composition-id="' + d.blockId + '"]') : null;
      if (selRot) { selRot.style.transformOrigin = 'center center'; selRot.style.transform = (Number(d.deg) || 0) ? 'rotate(' + (Number(d.deg) || 0) + 'deg)' : ''; }
    }
    else if (d.type === 'hf:radius') {
      // 圆角滑杆:直改容器 border-radius(实时)
      var selRad = d.blockId ? document.querySelector('[data-composition-id="' + d.blockId + '"]') : null;
      if (selRad) selRad.style.borderRadius = (Number(d.px) || 0) > 0 ? (Number(d.px) || 0) + 'px' : '';
    }
  });
})();
</script>`;

/** 把预览运行时注入 composition HTML(插在 </body> 前)。 */
export function injectPreviewRuntime(html: string): string {
  if (html.includes('</body>')) return html.replace('</body>', `${PREVIEW_RUNTIME}\n</body>`);
  return html + PREVIEW_RUNTIME;
}

/** iframe 暴露的预览句柄类型。 */
export interface HfPreviewHandle {
  /** 完整定位(含视频 currentTime)—— 拖拽/暂停用。 */
  seek(t: number): void;
  /** 只对齐花字时间轴(不碰视频)—— 播放每帧用,顺滑。 */
  seekTimelines(t: number): void;
  /** 媒体原生播放(t = 起播全局秒)。 */
  play(t: number): void;
  pause(): void;
  /** 播放主时钟 = 视频进度;无视频返回 null。 */
  clock(): number | null;
  duration(): number;
}
