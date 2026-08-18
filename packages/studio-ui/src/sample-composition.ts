/**
 * Hyperframes composition sample + browser preview runtime.
 *
 * Core idea (see architecture discussion): a composition is a self-contained web page,
 * dropped straight into <iframe srcdoc> to render live in the user's browser. Zero server in
 * edit mode; the same HTML is later sent to server-side headless Chrome for frame-by-frame
 * export → preview and export share one engine and origin, so WYSIWYG is inherent.
 *
 * The preview runtime (injected into the iframe) is driven by Hyperframes' data-attribute convention:
 *  - Each [data-composition-id] has data-start/data-duration, and its GSAP timeline is registered
 *    at window.__timelines[id].
 *  - __hfPreview.seek(t): for each composition compute localT=t-start; if visible, show it and
 *    seek its timeline to localT, else hide; <video>/<audio> seek currentTime the same way.
 * This convention reads the same attributes as real Hyperframes rendering → one HTML works on both sides.
 */

/** Starter sample: portrait talking-head style, title card + per-word highlight captions. Pure HTML+GSAP, no build. */
export const STARTER_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<style>
  * { margin: 0; box-sizing: border-box; }
  html, body { width: 1080px; height: 1920px; overflow: hidden; background: #0a0a0a;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
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

  <!-- title card: 0–3s -->
  <div class="comp" id="title" data-composition-id="title" data-start="0" data-duration="3">
    <h1>3 tricks to grow your channel</h1>
    <div class="sub">@yourhandle</div>
  </div>

  <!-- per-word highlight captions: 3–6s -->
  <div class="comp" id="cap" data-composition-id="cap" data-start="3" data-duration="3">
    <div class="line">
      <span class="w" id="w0"><span class="hl"></span>Hook</span>
      <span class="w" id="w1"><span class="hl"></span>First 3s</span>
      <span class="w" id="w2"><span class="hl"></span>Make or break</span>
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

/** Preview runtime injected into the iframe (runs after the composition's own scripts, so it can read __timelines).
 *  On play: video uses native play() (smooth, no per-frame seek); GSAP caption timelines align frame-by-frame to the video clock.
 *  On scrub/pause: only then seek the video's currentTime. */
export const PREVIEW_RUNTIME = `
<script>
(function () {
  try { document.body.classList.add('hf-editor'); } catch (e) {} // edit mode: show media-slot placeholders (export doesn't inject this runtime → placeholders not rendered)
  function comps() { return Array.prototype.slice.call(document.querySelectorAll('[data-composition-id]')); }
  function media() { return Array.prototype.slice.call(document.querySelectorAll('video,audio')); }
  function num(el, a, d) { var v = parseFloat(el.getAttribute(a)); return isNaN(v) ? d : v; }
  function tlOf(id) { return (window.__timelines && window.__timelines[id]) || null; }
  // master-clock video: whichever track-0 video is *currently playing* — under a multi-source main track,
  // the main video stalls while an external inserted clip plays, so the clock must follow the clip
  // (the clip's data-start+currentTime is exactly the final-cut time), else raf integration drift
  // hits ended too early. If none is playing, fall back to #vidEl.
  function primaryVideo() {
    var vids = document.querySelectorAll('video[data-track-index="0"]');
    for (var i = 0; i < vids.length; i++) { if (!vids[i].paused && !vids[i].ended) return vids[i]; }
    return document.getElementById('vidEl') || document.querySelector('video');
  }
  // final-cut↔source mapping + play-time trim jumps are handled by the VIDEO_TRIM_SHIM injected into the doc, over #vidEl's currentTime.
  // this runtime just treats the video as *final-cut time* (currentTime reads/writes are all final-cut time).

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

  var timelinePlaying = false;
  function syncTimelineMedia(t, wantPlay) {
    media().forEach(function (m) {
      if (!m.hasAttribute('data-hf-timeline-media')) return;
      var s = num(m, 'data-start', 0);
      var d = num(m, 'data-duration', 0);
      var active = t >= s && t < s + d;
      m.style.visibility = active ? 'visible' : 'hidden';
      var sourceIn = num(m, 'data-source-in', 0);
      var sourceOut = num(m, 'data-source-out', Infinity);
      var rate = Math.max(0.0001, num(m, 'data-source-rate', 1));
      var target = Math.min(sourceOut, Math.max(sourceIn, sourceIn + (t - s) * rate));
      // Native media elements reject extreme playbackRate values. Keep native playback inside the
      // interoperable range, while the independent target-time correction still follows exact V2
      // source geometry for more extreme retimes.
      try { m.playbackRate = Math.min(16, Math.max(0.0625, rate)); } catch (e) {}
      try { if (!m.seeking && Math.abs(m.currentTime - target) > 0.18) m.currentTime = target; } catch (e2) {}
      if (active && wantPlay) {
        if (m.paused) { var p = m.play && m.play(); if (p && p.catch) p.catch(function () {}); }
      } else if (!m.paused) {
        try { m.pause(); } catch (e3) {}
      }
    });
  }

  // align captions/layers only (GSAP timeline + visibility), don't touch video currentTime — called per frame during playback, smooth.
  function seekTimelines(t) {
    lastSeekT = t; // "latest render time" must include per-frame playback: capEdit/animPreview restore replays it;
    // if recorded only on a full seek, a restore at the pause instant jumps back to the pre-play time (observed: all animation resets to zero on pause)
    comps().forEach(function (el) {
      var id = el.getAttribute('data-composition-id');
      var s = num(el, 'data-start', 0);
      var tl = tlOf(id);
      var d = num(el, 'data-duration', tl ? tl.duration() : 1e9);
      if (id !== 'root') el.style.visibility = (t >= s && t < s + d) ? 'visible' : 'hidden';
      if (tl) {
        // Generated Components remember the window they were authored for. If the user later drags
        // an edge, remap local time through that authored clock: entrances, payoff holds and exits
        // all survive the resize instead of cutting off or leaving a long dead tail. Untagged legacy
        // and built-in timelines keep their original absolute-time behaviour.
        var authored = num(el, 'data-authored-duration', d);
        var local = Math.max(0, Math.min(t - s, d));
        var mapped = d > 0 ? local * authored / d : local;
        var tv = Math.max(0, Math.min(mapped, tl.duration()));
        // First alignment must force a render: a freshly built paused timeline sits at time 0, and
        // tl.time(0) is a same-value no-op — position-0 sets (caption segment reveals) never apply,
        // leaving captions invisible at their own window start until the playhead moves (user-reported:
        // caption at t=0 blank on boot, appearing only after a timeline hover). Nudge once off 0 so
        // the real seek below always renders.
        if (!tl.__hfInit) {
          tl.__hfInit = 1;
          if (tv === 0 && tl.duration() > 0) tl.time(Math.min(1e-4, tl.duration()), true);
        }
        tl.time(tv);
      }
    });
    media().forEach(function (m) {
      if (m.tagName === 'VIDEO') {
        if (m.hasAttribute('data-hf-timeline-media')) return;
        var s = num(m, 'data-start', 0);
        var d = num(m, 'data-duration', 1e9);
        m.style.visibility = (t >= s && t < s + d) ? 'visible' : 'hidden';
      }
    });
    syncTimelineMedia(t, timelinePlaying);
  }

  // full seek (including video currentTime, final-cut time) — for scrub/pause positioning.
  var lastSeekT = 0; // last position (used by loadedmetadata to re-seek when the video is ready late)
  function seek(t) {
    lastSeekT = t;
    media().forEach(function (m) {
      if (m.hasAttribute('data-hf-timeline-media')) return;
      var s = num(m, 'data-start', 0);
      try { m.currentTime = Math.max(0, t - s); } catch (e) {}
    });
    syncTimelineMedia(t, timelinePlaying);
    seekTimelines(t);
  }

  // —— the "selected = force-show" mechanism is fully retired (2026-07-13): reverse-reconstructing
  //    "how a block looks once settled" at runtime is whack-a-mole against generated-code initial-state
  //    styles (inline tl.from / CSS base rule + tl.to / multiple tweens). Now *selecting an invisible
  //    block = the parent moves the playhead to that block's settle time*, so the picture is the real
  //    playback-rendered result, zero form special-casing. This doc keeps only the clearProps list for animPreview cleanup.
  // ⚠️ clearProps may only name properties the animation touches: 'all' would also wipe *author-written inline styles*
  //   (renderMedia's .hf-media and style="…" inside LLM blocks all suffer; observed: images collapse to natural size).
  var FOCUS_CLEAR = 'opacity,visibility,transform,clipPath,filter';

  function play(t) {
    timelinePlaying = true;
    media().forEach(function (m) {
      if (m.hasAttribute('data-hf-timeline-media')) return;
      var s = num(m, 'data-start', 0);
      try { m.currentTime = Math.max(0, t - s); } catch (e) {}
      var p = m.play && m.play();
      // a rejected play() (typically: autoplay permission not granted to the opaque-origin doc) must be reported —
      // if silently swallowed, it looks like "the playhead moves but the video is frozen", untraceable
      if (p && p.catch) p.catch(function (err) {
        try { console.warn('[hf] play() rejected', err && err.name, err && err.message); } catch (e2) {}
        fpost({ type: 'playBlocked', name: err && err.name, msg: String((err && err.message) || '').slice(0, 140) });
      });
    });
    syncTimelineMedia(t, true);
    // canvas render mode (__parentClock): clock/video frames belong to the parent engine; this doc doesn't self-drive or report clock/ended;
    // media() above holds only picture-in-picture assets, just start them normally. The parent sends hf:seekTimelines each frame to align overlays.
    if (window.__parentClock) { drive.on = false; return; }
    startDrive(t);
  }
  function pause() {
    drive.on = false;
    timelinePlaying = false;
    media().forEach(function (m) { try { m.pause(); } catch (e) {} });
    // pause = freeze at the current playback state (user's intent); we've been bitten by "animation jumps back to base state on pause".
  }

  // —— playback drive loop (iframe self-driven, single clock source): follow the video's final-cut clock if there's a video, else self-integrate;
  //    align the caption timeline each frame + report position one-way (src marks the clock source, parent only observes); report ended when done.
  //    the parent no longer commands each frame — play/pause/seek are the only three one-shot commands.
  // decode-zombie self-heal: paused=false, ready=4, yet currentTime doesn't advance (observed: the decoder on a rebuilt doc's first load
  //    can be born dead, likely a race with the old doc's decoder not being released; a tiny seek won't wake it, only rebuilding the
  //    media load helps). The drive loop detects it at 600ms → rebuilds the load in place via load(), recovers in <1s.
  var zombie = { ct: -1, ts: 0, heals: 0 };
  // zombie detection/heal must use *raw* currentTime: after trimming, when raw sits before the first segment, the final-cut mapping (s2e)
  // legitimately stops at 0, and the old measure misjudges normal tracking as a zombie → repeatedly rebuilds the load, playback never starts (observed).
  var rawDrv = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'currentTime');
  function rawTime(m) { try { return rawDrv.get.call(m); } catch (e) { return m.currentTime; } }
  function healZombie(v) {
    if (zombie.heals >= 3) return;
    if (!v.currentSrc) return; // an element with no source (dead blob not yet revived) isn't a zombie; rebuilding the load can't save it
    zombie.heals++;
    try {
      console.warn('[hf] decode-zombie self-heal: rebuilding media load', { ct: v.currentTime, heal: zombie.heals });
      var edited = v.currentTime;
      var url = v.src;
      v.removeAttribute('src');
      v.load(); // release the dead decoder session
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
    if (drive.on) return; // already driving: just reposition
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

  // playback master clock = the talking-head video's *final-cut* progress (currentTime is already final-cut time via the shim); null if no video.
  function clock() {
    var v = primaryVideo();
    return v ? v.currentTime + num(v, 'data-start', 0) : null;
  }

  // —— autofit measurement: how far each block's content overflows its box → scale factor k. scrollW/H are *layout* values, unaffected by GSAP transform
  //    or an already-applied scale, so it's repeatable and idempotent. *Apply in place once measured* (don't wait for the parent to push back — under double
  //    buffering the parent's push-back target may be the other buffer, dropping the scale on a timing miss → fonts overflow unclamped); the parent only records it into Block.fitScale for export.
  function fpost(m) { m.source = 'hf'; try { parent.postMessage(m, '*'); } catch (e) {} }
  // a box block is two-layer (container = crop window + [data-hf-content] content layer): autofit measures/applies on the content layer —
  // the container is overflow:hidden and its transform may be used by the enter animation, so the content layer is the true layout frame
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
      // 2px tolerance: ignore subpixel/rounding pseudo-overflow, only compute scale on real overflow
      var kw = t.scrollWidth > cw + 2 ? cw / t.scrollWidth : 1;
      var kh = t.scrollHeight > ch + 2 ? ch / t.scrollHeight : 1;
      fits[id] = Math.floor(Math.min(kw, kh) * 100) / 100; // quantize to 0.01 to de-jitter
      applyFit(id, fits[id]); // apply in place
    });
    fpost({ type: 'fit', fits: fits });
  }
  function triggerFit() { try { requestAnimationFrame(function () { requestAnimationFrame(measureFit); }); } catch (e) { measureFit(); } }

  window.__hfPreview = { seek: seek, seekTimelines: seekTimelines, play: play, pause: pause, clock: clock, duration: duration, measureFit: measureFit };


  // parent control protocol: once the iframe is sandboxed (opaque origin) the parent can't reach contentWindow.__hfPreview,
  // so all control goes through messages. __hfPreview is kept (blockPreviewDoc's single-block preview calls it in-doc).
  window.addEventListener('message', function (e) {
    var d = e.data || {};
    if (d.type === 'hf:seek') { try { seek(Number(d.t) || 0); } catch (err) {} }
    else if (d.type === 'hf:seekTimelines') { try { seekTimelines(Number(d.t) || 0); } catch (err) {} }
    else if (d.type === 'hf:play') { try { play(Number(d.t) || 0); } catch (err) {} }
    else if (d.type === 'hf:pause') { try { pause(); } catch (err) {} }
    else if (d.type === 'hf:primaryVisibility') {
      ['vidEl', 'personCut', 'personBg'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.style.visibility = d.hidden ? 'hidden' : '';
      });
    }
    else if (d.type === 'hf:shotVars' && d.vars) {
      // during framing-size drag: gsap.set the video framing transform directly (zero-setState contract, same as hf:capStyle);
      // on release the parent commits the comp, and the rebuilt timeline keyframes / inline transform match the final values here, so the switch has no jump.
      // target: an external inserted clip's framing is applied to its own clip <video> (defaults to the main video)
      try { window.gsap && window.gsap.set(d.target || '#vidEl', d.vars); } catch (err) {}
    }
    else if (d.type === 'hf:mediaBox' && d.id && d.box) {
      // Direct canvas placement is independent from source framing: this only moves/resizes the
      // native layer. The parent commits once on release; per-frame messages keep dragging smooth.
      try {
        var mb = d.box;
        var mt = document.getElementById(String(d.id));
        if (mt && [mb.x, mb.y, mb.w, mb.h].every(function (v) { return typeof v === 'number' && isFinite(v); })) {
          var mv = { left: (mb.x * 100) + '%', top: (mb.y * 100) + '%', width: (mb.w * 100) + '%', height: (mb.h * 100) + '%' };
          if (window.gsap) window.gsap.set(mt, mv);
          else Object.assign(mt.style, mv);
        }
      } catch (err) {}
    }
    else if (d.type === 'hf:pickAt' && typeof d.x === 'number' && typeof d.y === 'number') {
      // The parent-side media transform shell covers the selected layer so its body can be dragged.
      // A click without movement comes back here for real DOM hit-testing, preserving selection of
      // components and higher visual lanes under that transparent shell.
      try {
        var px = Math.max(0, Math.min(1, d.x)) * window.innerWidth;
        var py = Math.max(0, Math.min(1, d.y)) * window.innerHeight;
        var pe = document.elementFromPoint(px, py);
        var pv = pe && pe.closest ? pe.closest('[data-hf-visual-clip]') : null;
        if (pv) post({ type: 'selectVisual', clipId: pv.getAttribute('data-hf-visual-clip') });
        else {
          var pc = closestComp(pe);
          post({ type: 'select', blockId: pc ? pc.getAttribute('data-composition-id') : null });
        }
      } catch (err) {}
    }
    else if (d.type === 'hf:vidTimeline') {
      // in-place framing swap: kill the old vid timeline, install the new body, re-run at the current time. Framing changes no longer rebuild the whole doc
      // — a rebuild blanks the video canvas for one frame (flash), especially visible on rapid framing-card clicks. The body is compiled via new Function,
      // isolated the same way as assemble's timelineScript (a bad body = empty timeline, doesn't take down the runtime).
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
      // animation-card click: play that enter/exit once on the spot, then return to the focused fully-shown state.
      // the transform values share a source with templates.ts's MEDIA_ENTER/MEDIA_EXIT; remember to sync here when changing those
      try {
        var apHost = document.querySelector('[data-composition-id="' + d.id + '"]');
        var apT = apHost && (apHost.querySelector('.hf-media') || apHost);
        if (apT && window.gsap) {
          var AP_IN = { fade: { autoAlpha: 0 }, slide: { autoAlpha: 0, x: -60 }, rise: { autoAlpha: 0, y: 60 }, scale: { autoAlpha: 0, scale: 0.8 } };
          var AP_OUT = { fade: { autoAlpha: 0 }, slide: { autoAlpha: 0, x: 60 }, rise: { autoAlpha: 0, y: -60 }, scale: { autoAlpha: 0, scale: 0.8 } };
          var apV = (d.phase === 'out' ? AP_OUT : AP_IN)[d.effect];
          var apD = Math.max(0.15, Math.min(Number(d.dur) || 0.5, 2));
          window.gsap.killTweensOf(apT);
          // after playing, clear the temp inline styles, then force the block's timeline to render back to the real state at the current time (selecting already moved
          // the playhead to the settle time, so the real state is visible; render with force so equal values aren't short-circuited by GSAP)
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
      // caption global-style live preview (zero setState during drag, same contract as the component's hf:nudge/hf:boxSize):
      // position edits .cap-line's left/bottom directly; font size edits each .w's font-size (scaling = font size,
      // no transform → zero conflict with the GSAP enter). Backplate padding etc. is re-baked at the new font size on rebuild.
      try {
        // cue docs anchor lines inside .cap-stack (position/box live on the stack); legacy docs position .cap-line directly
        var capAnchors = document.querySelectorAll('.cap-stack');
        if (!capAnchors.length) capAnchors = document.querySelectorAll('.cap-line');
        capAnchors.forEach(function (cl) {
          // skip equal values: rewriting style dirties it and triggers reflow; once per drag frame means continuous stutter
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
            if (cl.style.minHeight !== mh) cl.style.minHeight = mh; // frame height: the backplate (min-height) tracks the drag
          }
        });
        if (typeof d.fontPx === 'number') {
          document.querySelectorAll('.cap-line .w').forEach(function (wEl) {
            var fv = d.fontPx + 'px';
            if (wEl.style.fontSize !== fv) wEl.style.fontSize = fv;
          });
        }
      } catch (err) {}
    }
    else if (d.type === 'hf:capSubStyle') {
      // translation-line live preview: *same contract* as the main line's hf:capStyle — position edits left/bottom directly, frame height edits
      // min-height; font size isn't live (same reason as the main line: changing size needs re-segmentation, done in one shot on release rebuild)
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
      // edit-mode force-show: captions fade in, so the playhead often sits at a very-low-opacity moment — on selecting a caption, force
      // the current segment to opacity 1 (the segment index comes from the parent, computed with the same segmentation); on deselect/play
      // re-run seekTimelines to restore the timeline's real state.
      // Forcing goes through an attribute CSS rule, NEVER inline styles: an inline visibility:visible on the segment
      // outlives the selection and overrides the hidden block container (CSS visibility inheritance), leaving the
      // once-selected caption on screen forever — it overlapped every later caption during playback (user-reported).
      // Dropping the attribute restores the timeline-owned inline values instantly.
      try {
        if (!document.getElementById('hf-capedit-css')) {
          var ceCss = document.createElement('style');
          ceCss.id = 'hf-capedit-css';
          ceCss.textContent = '.cap-line[data-hf-edit]{opacity:1 !important;visibility:visible !important;}';
          document.head.appendChild(ceCss);
        }
        document.querySelectorAll('.cap-line[data-hf-edit]').forEach(function (pe) {
          pe.removeAttribute('data-hf-edit');
        });
        if (d.id != null && typeof d.seg === 'number') {
          var ceEl = document.getElementById(String(d.id));
          if (ceEl && d.seg < 0) {
            // cue stack: every line is on screen together — force them all
            ceEl.querySelectorAll('.cap-line').forEach(function (ln) { ln.setAttribute('data-hf-edit', '1'); });
          } else {
            var ceSeg = ceEl && ceEl.querySelector('#' + String(d.id) + '-s' + d.seg);
            if (ceSeg) ceSeg.setAttribute('data-hf-edit', '1');
          }
        } else {
          seekTimelines(lastSeekT); // restore: the timeline rewrites each segment's state at the current time
        }
      } catch (err) {}
    }
    else if (d.type === 'hf:measureFit') { triggerFit(); } // re-measure autofit after a geometry-only parent commit (a smaller box overflows and needs scaling)
    else if (d.type === 'hf:measure' && d.id) {
      // measure a block's visible content rect (for the caption selection box: caption lines are laid out by CSS inside the iframe, the parent can only measure).
      // the caption box is the *global-style* handle (user's intent), so measure the first segment as a representative position, don't jump with the current word
      try {
        var msEl = document.getElementById(String(d.id));
        var msT = msEl && (d.sub ? msEl.querySelector('.cap-sub') : (msEl.querySelector('.cap-stack') || msEl.querySelector('.cap-line') || msEl));
        if (msT) {
          var msR = msT.getBoundingClientRect();
          var msW = document.documentElement.clientWidth || 1;
          var msH = document.documentElement.clientHeight || 1;
          fpost({ type: 'measure', id: d.id, sub: !!d.sub, rect: { x: msR.left / msW, y: msR.top / msH, w: msR.width / msW, h: msR.height / msH } });
        }
      } catch (err) {}
    }
    else if (d.type === 'hf:blockAdd' && d.blockId && d.html) {
      // In-place block insert / whole-node replace (new block, template swap, non-echo slots change,
      // caption restyle): the html is assembled by the parent from the same per-block assembler the
      // full rebuild uses, so the patched node matches a later rebuild byte for byte.
      try {
        var baTmp = document.createElement('div');
        baTmp.innerHTML = String(d.html);
        var baNode = baTmp.firstElementChild;
        if (baNode) {
          var baOld = document.getElementById(String(d.blockId));
          if (baOld && baOld.classList.contains('comp')) { baOld.replaceWith(baNode); }
          else {
            // DOM order = stacking: insert before the block currently at the target index (parent
            // computes it against the post-remove, sorted block list), else append on top
            var baList = Array.prototype.slice.call(document.querySelectorAll('.comp'));
            var baParent = (baList[0] && baList[0].parentElement) || document.getElementById('root') || document.body;
            var baRef = typeof d.index === 'number' && d.index >= 0 ? baList[d.index] : null;
            if (baRef && baRef.parentElement === baParent) baParent.insertBefore(baNode, baRef);
            else baParent.appendChild(baNode);
          }
          // Report when the node's media has actually loaded — the parent clears the block's
          // "loading" badge on this signal (in-place patches never trigger the buffer swap the
          // badge used to wait for; without this it hangs until the 20s fallback). Runs right
          // after insertion so a failure in the timeline section below can't starve it.
          (function () {
            var pend = 0;
            var done = function () { pend--; if (pend <= 0) fpost({ type: 'hf:mediaReady', blockId: String(d.blockId) }); };
            var media = baNode.querySelectorAll('img, video');
            for (var mi = 0; mi < media.length; mi++) {
              var m = media[mi];
              var ready = m.tagName === 'IMG' ? (m.complete && m.naturalWidth > 0) : m.readyState >= 2;
              if (ready) continue;
              pend++;
              m.addEventListener(m.tagName === 'IMG' ? 'load' : 'loadeddata', done, { once: true });
              m.addEventListener('error', done, { once: true });
            }
            if (pend === 0) fpost({ type: 'hf:mediaReady', blockId: String(d.blockId) });
          })();
          if (window.__timelines && window.__timelines[d.blockId]) {
            try { window.__timelines[d.blockId].kill(); } catch (e1) {}
            delete window.__timelines[d.blockId];
          }
          try {
            var baTl = gsap.timeline({ paused: true });
            try { new Function('tl', String(d.timelineBody || ''))(baTl); } catch (e2) { console.warn('[hf] blockAdd timeline', d.blockId, e2); }
            window.__timelines[d.blockId] = baTl;
            seekTimelines(lastSeekT);
          } catch (e3) { console.warn('[hf] blockAdd', d.blockId, e3); }
        }
      } catch (err) {}
    }
    else if (d.type === 'hf:setVars' && typeof d.css === 'string') {
      // Instant theme/palette recolor: inline vars on #root override the baked stylesheet rule;
      // native media compositions keep the iframe/root transparent: the canvas owns the pixels.
      try {
        var svRoot = document.getElementById('root');
        var svHasMedia = !!document.getElementById('vidEl') || !!document.querySelector('.hf-native-visual');
        var svBg = svHasMedia ? 'transparent' : (d.bg || 'transparent');
        if (svRoot) svRoot.style.cssText = d.css + 'background:' + svBg + ';';
        document.documentElement.style.background = svBg;
        document.body.style.background = svBg;
      } catch (err) {}
    }
    else if (d.type === 'hf:blockHtml' && d.blockId) {
      // Kit props edit: swap ONE block's content and rebuild only its timeline — a full doc
      // rebuild (double-buffer swap + video reload) for a one-block tweak reads as "updating…" lag.
      try {
        var bhEl = document.getElementById(String(d.blockId));
        if (bhEl && bhEl.classList.contains('comp')) {
          var bhHost = bhEl.querySelector('[data-hf-content]') || bhEl;
          bhHost.innerHTML = String(d.innerHtml || '');
          if (window.__timelines && window.__timelines[d.blockId]) {
            try { window.__timelines[d.blockId].kill(); } catch (e1) {}
            delete window.__timelines[d.blockId];
          }
          var bhTl = gsap.timeline({ paused: true });
          try { new Function('tl', String(d.timelineBody || ''))(bhTl); } catch (e2) { console.warn('[hf] blockHtml timeline', d.blockId, e2); }
          window.__timelines[d.blockId] = bhTl;
          seekTimelines(lastSeekT); // re-align the fresh paused timeline to the current playhead
        }
      } catch (err) {}
    }
    else if (d.type === 'hf:remove' && d.id) {
      // instant block delete (don't wait for the 300ms debounced rebuild + double-buffer swap): delete must feel immediate; the rebuild still runs, and the swapped-in doc simply doesn't have this block
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
      // the old buffer about to be replaced: release the media load immediately (decoder sessions don't wait for GC — the new doc's decoder
      // may be born dead if it races an unreleased old session)
      try {
        pause();
        var tv = primaryVideo();
        if (tv) { tv.removeAttribute('src'); tv.load(); }
      } catch (err) {}
    }
    else if (d.type === 'hf:fit' && d.fits) {
      // known scale pushed by the parent (early in load, before fonts.ready measurement, apply the last recorded value to prevent an overflow flash)
      Object.keys(d.fits).forEach(function (id) { applyFit(id, d.fits[id]); });
    }
    else if (d.type === 'hf:ping') {
      // liveness reply: the parent uses it to confirm this doc's scripts/listeners are really ready before switching buffers
      // (the load event can be fooled by an empty-load race / font blocking, which once switched the picture to a deaf doc)
      fpost({ type: 'pong', nonce: d.nonce });
    }
    else if (d.type === 'hf:video' && d.file) {
      // local blob video: the sandboxed iframe is cross-origin from the parent, so the parent's blob: URL can't be read here →
      // the parent structured-clones the File in, and this doc makes its own object URL (auto-reclaimed when the doc is destroyed).
      // idempotent: skip if already injected (the parent's play watchdog re-sends, and resetting src would interrupt a playing video).
      var v = document.getElementById('vidEl');
      // force = the watchdog judged a decode zombie, force-rebuild src (new object URL + reload) to kick it awake
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
      // local external inserted clip (multi-source main track): same as hf:video — the file stays local, unuploaded; the File is structured-cloned
      // in and this doc makes its own object URL. Idempotent: skip if already loaded.
      var ce = document.getElementById(String(d.id));
      if (ce && !ce.__hfInjected) {
        try {
          ce.src = URL.createObjectURL(d.file);
          ce.__hfInjected = true;
          ce.addEventListener('loadedmetadata', function () { try { if (ce.paused) seek(lastSeekT); } catch (err) {} }, { once: true });
        } catch (err) {}
      }
    }
    else if (d.type === 'hf:imageFile' && d.file && d.sig) {
      // Device-local custom-block image. Persisted markup carries only a stable sig; this opaque
      // sandbox receives the File and creates its own object URL, exactly like local video clips.
      var marker = 'pireel-local-image:' + encodeURIComponent(String(d.sig)).replace(/[!'()*]/g, function (char) {
        return '%' + char.charCodeAt(0).toString(16).toUpperCase();
      });
      var localUrl = '';
      try { localUrl = URL.createObjectURL(d.file); } catch (err1) { return; }
      var used = false;
      var imgs = document.querySelectorAll('img[src]');
      for (var ii = 0; ii < imgs.length; ii++) {
        var im = imgs[ii];
        var raw = im.getAttribute('src') || '';
        if (raw !== marker || im.__hfInjected) continue;
        try {
          im.src = localUrl;
          im.__hfInjected = true;
          im.addEventListener('load', triggerFit, { once: true });
          used = true;
        } catch (err3) {}
      }
      // Generated components sometimes use the selected image as a CSS background. Resolve the
      // same locator in inline style attributes and scoped <style> text without persisting blob URLs.
      var styled = document.querySelectorAll('[style]');
      for (var si = 0; si < styled.length; si++) {
        var styleText = styled[si].getAttribute('style') || '';
        if (styleText.indexOf(marker) < 0) continue;
        styled[si].setAttribute('style', styleText.split(marker).join(localUrl));
        used = true;
      }
      var sheets = document.querySelectorAll('style');
      for (var ti = 0; ti < sheets.length; ti++) {
        var cssText = sheets[ti].textContent || '';
        if (cssText.indexOf(marker) < 0) continue;
        sheets[ti].textContent = cssText.split(marker).join(localUrl);
        used = true;
      }
      if (used) triggerFit();
      else try { URL.revokeObjectURL(localUrl); } catch (err4) {}
    }
  });
  // Single boot point. __hfBootT is the moment the document wants to open on — single-block previews
  // declare it in <head> (see blockPreviewDoc) so the first painted frame is already correct; docs
  // without it open at 0. Then drop the rule that hid .comp: until gsap loaded and the timelines
  // existed, the DOM sat at its NATURAL end state, and painting that before the entrance yanks it
  // back is the "flash then restart" users see. Both steps run SYNCHRONOUSLY, never behind
  // rAF/timeout — the client exporter renders offscreen where those throttle, and a stuck rule
  // there would export blank frames.
  try {
    seek(typeof window.__hfBootT === 'number' ? window.__hfBootT : 0);
  } catch (e) {}
  try {
    var bootHide = document.getElementById('hf-boot-hide');
    if (bootHide && bootHide.parentNode) bootHide.parentNode.removeChild(bootHide);
  } catch (e) {}
  // measure after fonts ready + two frames (wait for layout/CJK glyphs to settle, else the measurement is off)
  try {
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) document.fonts.ready.then(triggerFit);
    else triggerFit();
  } catch (e) { triggerFit(); }
  // Boot beacon: scripts parsed, gsap loaded, message listener installed. The parent starts the
  // background-buffer swap handshake on THIS signal instead of the iframe load event — the load event
  // waits for every eager media image in the doc, which kept "updating…" stuck until the last
  // thumbnail arrived (and re-requested them all on each rebuild). Images arriving later just pop in.
  try { fpost({ type: 'pong', nonce: 'boot' }); } catch (e) {}
})();
</script>
<script>
/* edit bridge (v0-style, edit directly in the preview): single-click to select a block, click [data-edit] text to edit in place (caret at the click point) → parent writes the slot back;
   hold on the block body and drag >4px → boxDragStart/boxDrag (dx,dy in comp px)/boxDragEnd → parent converts and writes back to Block.box.
   child→parent: {source:'hf',type:'select'|'edit'|'boxDragStart'|'boxDrag'|'boxDragEnd',...}
   parent→child: {type:'hf:selectBlock'|'hf:clearSel'} */
(function () {
  var st = document.createElement('style');
  // selection outline: full-canvas blocks (captions etc.) rely on it to show selection, always on; for box blocks (cards) the parent already draws a selection frame when idle
  // (BoxEditOverlay, clearer), so this outline only lights up during body-drag (when the parent frame steps aside) — else it doubles up with the parent frame.
  st.textContent = '[data-hf-sel]:not([data-hf-box]),[data-hf-sel][data-hf-dragging]{outline:3px solid var(--accent,#37e1ff);outline-offset:3px;border-radius:4px}'
    + '[data-hf-sel]{cursor:move}'
    + '[data-edit]{cursor:text} [data-composition-id]:not(#root):not([data-composition-id="vid"]){cursor:pointer}'
    // don't select text while dragging a block: disable selection globally, only the in-place-edit contenteditable restores selectability (else you can't select text to edit)
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
  // nearest selectable block (excluding root and the video track)
  function closestComp(el) {
    while (el && el !== document.body) {
      if (el.getAttribute) {
        var id = el.getAttribute('data-composition-id');
        if (id && id !== 'root' && id !== 'vid' && !el.hasAttribute('data-hf-visual-clip')) return el;
      }
      el = el.parentNode;
    }
    return null;
  }
  function post(m) { m.source = 'hf'; try { parent.postMessage(m, '*'); } catch (e) {} }

  var dragEndAt = 0; // after a body-drag release the browser fires a stray click, don't treat it as a single click (else dragging accidentally enters text edit)
  document.addEventListener('click', function (e) {
    if (performance.now() - dragEndAt < 350) return;
    if (e.target && e.target.getAttribute && e.target.getAttribute('contenteditable') === 'true') return; // don't grab selection while editing
    var visual = e.target && e.target.closest ? e.target.closest('[data-hf-visual-clip]') : null;
    if (visual) {
      highlight(null);
      post({ type: 'selectVisual', clipId: visual.getAttribute('data-hf-visual-clip') });
      return;
    }
    var comp = closestComp(e.target);
    if (comp) {
      highlight(comp);
      // caption block sub-targeting: clicking the translation line (.cap-sub) = select the second caption, parent shows only the translation handle; clicking the main line/other = main
      var selPart = e.target && e.target.closest && e.target.closest('.cap-sub') ? 'sub' : 'main';
      post({ type: 'select', blockId: comp.getAttribute('data-composition-id'), part: selPart });
      // single click to edit text (Notion-style, no double click needed); drag semantics unaffected — body-drag has a 4px threshold, past which it's not a click
      var ed = e.target && e.target.closest ? e.target.closest('[data-edit]') : null;
      if (ed && comp.contains(ed)) enterEdit(ed, comp, e);
      // image slot: clicking an <img> inside the block (except the full media-slot image .hf-media, which is the block body) → report index + normalized rect,
      // and the parent shows an image-specific toolbar (replace/delete) glued to the image position, zero LLM
      var im = e.target && e.target.closest ? e.target.closest('img') : null;
      if (im && comp.contains(im) && !(im.classList && im.classList.contains('hf-media'))) {
        var W0 = rootDim('data-width', 1080), H0 = rootDim('data-height', 1920);
        var imgs = comp.querySelectorAll('img'), idx = -1;
        for (var ii = 0; ii < imgs.length; ii++) if (imgs[ii] === im) idx = ii;
        var ir = im.getBoundingClientRect();
        post({ type: 'imgSel', blockId: comp.getAttribute('data-composition-id'), index: idx, rect: { x: ir.left / W0, y: ir.top / H0, w: ir.width / W0, h: ir.height / H0 } });
      }
    }
    else { highlight(null); post({ type: 'select', blockId: null }); } // click blank/video = deselect (else the selection frame has no way to disappear)
  }, true);

  // —— block move engine (shared by body-drag + parent handle-drag) ——
  // during the drag, move only within this doc (zero React re-render, smooth), snap to the canvas center line and report guide lines;
  // on end, hand the final displacement to the parent to write back to Block.box in one shot. The displacement is kept until the parent rebuilds the doc and swaps atomically,
  // so both sides agree, no jump. Only [data-hf-box] (box blocks) is draggable; dx/dy are comp px.
  // ⚠️ displacement uses the CSS translate *property* (not transform): autofit's applyFit overwrites the whole
  // el.style.transform, and if they shared transform, the background buffer's load-measurement fit push-back would erase the drag displacement
  // (looks like jumping back to origin on release, then jumping to the new position after the doc swap). Each property minds its own, no clobbering.
  var nudge = null;
  function rootDim(a, f) { var r = document.getElementById('root'); var v = r && parseFloat(r.getAttribute(a)); return v || f; }
  function baseTranslate(el) {
    // note: this block lives in a template string, so the regex backslashes must be doubled, else \\d gets eaten by the outer string escaping
    var m = /(-?[\\d.]+)px(?:\\s+(-?[\\d.]+)px)?/.exec(el.style.translate || '');
    return { x: m ? parseFloat(m[1]) : 0, y: m && m[2] ? parseFloat(m[2]) : 0 };
  }
  function beginNudge(el) {
    if (!el || !el.hasAttribute('data-hf-box')) return false;
    var b = baseTranslate(el); // when the previous drag hasn't yet landed via doc rebuild, the new drag stacks on top of it
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
    // no boundary clamping: components may be dragged off-canvas, the off-canvas part is clipped by the canvas overflow (the toolbar is clamped by the parent, always reachable)
    // center snap: when the block center is within 1.5% of the canvas center line it snaps on (body-drag only; the parent's thin edge-bar drag stays a non-snapping fine-tune channel)
    var cx = r.left + r.width / 2 + dx, cy = r.top + r.height / 2 + dy;
    var snapX = Math.abs(cx - W / 2) < W * 0.015, snapY = Math.abs(cy - H / 2) < H * 0.015;
    if (snapX) dx = W / 2 - (r.left + r.width / 2);
    if (snapY) dy = H / 2 - (r.top + r.height / 2);
    nudge.dx = dx; nudge.dy = dy;
    // Move the visible component in this document immediately. The parent only mirrors the dashed
    // selection ghost/guides during the gesture and commits the canonical box once on release.
    nudge.el.style.translate = (nudge.bx + dx) + 'px ' + (nudge.by + dy) + 'px';
    post({ type: 'boxDrag', blockId: nudge.id, dx: dx, dy: dy, snapX: snapX, snapY: snapY });
  }
  function endNudge() {
    if (!nudge) return;
    post({ type: 'boxDragEnd', blockId: nudge.id, dx: nudge.dx, dy: nudge.dy });
    nudge = null;
  }

  // body-drag: hold on the block body and drag >4px = move this block. Nothing is sent below the threshold, and single-click-to-select / double-click-to-edit semantics are preserved.
  // three guards against a lost pointerup: 1) setPointerCapture on drag start (keep receiving move/up even if the pointer leaves the iframe);
  // 2) in move, finish immediately when buttons===0 (if up is still missed, it won't keep following the mouse after release); 3) pointercancel same as up.
  document.addEventListener('dragstart', function (e) { e.preventDefault(); }, true); // disable native drag in the preview (image drag-ghost would hijack the body-drag)
  document.addEventListener('pointerdown', function (e) {
    if (e.button !== 0) return;
    if (e.target && e.target.closest && e.target.closest('[contenteditable="true"]')) return; // don't drag while editing
    var comp = closestComp(e.target);
    if (!comp || !comp.hasAttribute('data-hf-box')) return;
    var sx = e.clientX, sy = e.clientY, started = false, raf = 0, lx = 0, ly = 0;
    function mv(ev) {
      if (ev.buttons === 0) { up(); return; } // button already released (missed up): finish immediately, don't follow bare movement
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

  // in-place text edit: single click on [data-edit] enters it, caret at the click point (falls back to the end if it can't land), blur commits back to the parent
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

  // shortcut forwarding: after clicking the preview, focus is in this iframe (separate focus context) and the parent's keydown doesn't fire —
  // forward editing shortcuts back to the parent to handle uniformly; don't forward while editing in place (contenteditable).
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
      // parent handle-drag: uses the same move engine (dx/dy are already comp px)
      if (d.phase === 'start') beginNudge(d.blockId ? document.querySelector('[data-composition-id="' + d.blockId + '"]') : null);
      else if (d.phase === 'move') applyNudge(Number(d.dx) || 0, Number(d.dy) || 0);
      else if (d.phase === 'end') endNudge();
    }
    else if (d.type === 'hf:blockTiming') {
      // time-window in-place patch (commit of timeline block-drag/trim): the runtime reads data-start/data-duration dynamically each frame,
      // so just change the attributes + re-run at the current time, no full doc rebuild. The container and its inner media ([data-start] descendants) stay in sync.
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
      // appearance in-place patch (commit of the floating bar's bg/border/radius/opacity): container frame properties + content-layer bg token family.
      // values are computed by the parent with the same helper as assemble (blockBgCss), identical to the rebuild output — an empty value = clear it.
      var bs = d.blockId ? document.querySelector('[data-composition-id="' + d.blockId + '"]') : null;
      if (bs) {
        bs.style.border = d.border || '';
        bs.style.borderRadius = d.radius || '';
        bs.style.opacity = d.opacity == null ? '' : String(d.opacity);
        var bc = bs.querySelector('[data-hf-content]') || bs;
        // clear then paint: remove all tokens/background applied by the previous bg, then setProperty pair by pair from the new string
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
      // Parent move/edge/corner handles preview geometry in this doc (zero React re-render), then
      // commit Block.box once on release. A canonical box patch also clears a temporary body-drag
      // translate, so the committed left/top become the single source of truth without a visual jump.
      var sel2 = d.blockId ? document.querySelector('[data-composition-id="' + d.blockId + '"]') : null;
      if (sel2) {
        sel2.style.translate = '';
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
          // corner-handle proportional scale: the visual scale syncs ×k (scale property, doesn't touch transform/translate)
          if (d.s != null) wc.style.scale = String(Number(d.s) || 1);
        }
      }
    }
    else if (d.type === 'hf:rotate') {
      // bottom rotate-handle drag: edit the container transform:rotate directly (live, zero React re-render); the parent commits Block.rotation on release.
      // rotate uses transform, orthogonal to nudge's translate / boxSize's w-h-left-top / the content layer's scale — no mutual overwrite.
      var selRot = d.blockId ? document.querySelector('[data-composition-id="' + d.blockId + '"]') : null;
      if (selRot) { selRot.style.transformOrigin = 'center center'; selRot.style.transform = (Number(d.deg) || 0) ? 'rotate(' + (Number(d.deg) || 0) + 'deg)' : ''; }
    }
    else if (d.type === 'hf:radius') {
      // radius slider: edit the container border-radius directly (live)
      var selRad = d.blockId ? document.querySelector('[data-composition-id="' + d.blockId + '"]') : null;
      if (selRad) selRad.style.borderRadius = (Number(d.px) || 0) > 0 ? (Number(d.px) || 0) + 'px' : '';
    }
  });
})();
</script>`;

/** Inject the preview runtime into the composition HTML (before </body>). */
/** Hides overlay blocks until the runtime has aligned them to t=0 (removed synchronously at the end
 *  of PREVIEW_RUNTIME). Without it the browser paints the un-animated end state while the external
 *  gsap script is still loading, then the entrance yanks everything back — a visible flash.
 *  Scoped to .comp so the stage background and the video keep painting immediately. */
const BOOT_HIDE = `<style id="hf-boot-hide">.comp{visibility:hidden}</style>`;

export function injectPreviewRuntime(html: string): string {
  const withHide = html.includes('</head>') ? html.replace('</head>', `${BOOT_HIDE}</head>`) : BOOT_HIDE + html;
  if (withHide.includes('</body>')) return withHide.replace('</body>', `${PREVIEW_RUNTIME}\n</body>`);
  return withHide + PREVIEW_RUNTIME;
}

/** Preview handle type exposed by the iframe. */
export interface HfPreviewHandle {
  /** Full seek (including video currentTime) — for scrub/pause. */
  seek(t: number): void;
  /** Align only the caption timeline (leave video alone) — used per frame during playback, smooth. */
  seekTimelines(t: number): void;
  /** Native media playback (t = global start second). */
  play(t: number): void;
  pause(): void;
  /** Playback master clock = video progress; null if no video. */
  clock(): number | null;
  duration(): number;
}
