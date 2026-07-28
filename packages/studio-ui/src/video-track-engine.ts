/**
 * Parent-layer video track engine (decode/clock/audio side of the canvas render mode):
 *
 * Root cause: the preview iframe is sandboxed + double-buffered, so rebuilding the document
 * recreates <video> and decoder sessions churn — the whole "decode zombie" class of bugs
 * grows from this. Fix: keep decode elements resident in the parent layer (one hidden <video>
 * per source, fully decoupled from document lifecycle); the video track inside the iframe is
 * just a <canvas>, frames pushed over via ImageBitmap postMessage (zero-copy transfer); audio
 * comes straight from the parent element (the active source is unmuted).
 *
 * Master clock = the active source element's currentTime (film time mapped by the segment
 * table); boundary handoff / dead-window skipping use a debuggable TS implementation here
 * (port and retirement of the old VIDEO_TRIM_SHIM state machine). Caption/HTML blocks are
 * still DOM/GSAP in the iframe — during playback the parent sends hf:seekTimelines every frame
 * to align; the edit surface is unchanged.
 *
 * Swapping in WebCodecs later only touches the frame-grab implementation in this file; the
 * iframe contract (hf:frame / hf:seekTimelines) stays the same.
 */

export interface EngineSeg {
  /** Source key: 'main' or this segment's src (blob/remote URL). */
  key: string;
  /** Element-scoped key for mask/portrait use: 'main' or clip_<shotId> (matches the personMaskAt protocol). */
  elKey: string;
  srcStart: number;
  srcEnd: number;
  /** Linear audio gain 0..1 (shotGain of the shot; absent = 1). Applied via the decode element's own volume —
   *  segments of the same source share one element, so the value re-applies at every handoff, including the
   *  same-source roll-through swap that skips activateIdx. */
  gain?: number;
  /** Segment-local fade factor (shotFadeAt); absent = no fade. Evaluated per tick, so the level rides the
   *  curve instead of stepping at the segment's edges. */
  fadeAt?: (tLocal: number) => number;
}

/** Audio-clip spec for the preview (declarative; envelope + source-time mapping arrive as closures
 *  so the engine stays ignorant of the clip model — workbench builds them from the same pure fns as export). */
export interface EngineAudioClip {
  id: string;
  url: string;
  /** Playback speed (element playbackRate; preservesPitch=false so preview matches the export's resample). */
  speed: number;
  /** Full envelope at edited time t (level × fades), 0..1; 0 outside the clip's window. */
  gainAt: (t: number) => number;
  /** Edited time → source seconds; null = outside the playable range (element parks paused). */
  srcTimeAt: (t: number) => number | null;
}

export interface FrameInfo {
  t: number;
  elKey: string;
  srcT: number;
  /** true = pre-baked finished transition frame (shim lays it down directly, no compositing). */
  baked?: boolean;
}

const EPS = 0.04;

export class VideoTrackEngine {
  private host: HTMLDivElement | null = null;
  private els = new Map<string, HTMLVideoElement>();
  private urls = new Map<string, string>(); // objectURLs we created (revoked when swapping source)
  private srcIds = new Map<string, File | string>(); // source identity: File by reference, URL by string for idempotence checks
  private segs: EngineSeg[] = [];
  private starts: number[] = [];
  private total = 0;
  private playing = false;
  private tEdited = 0;
  private raf = 0;
  private curIdx = -1; // active segment index (-1 = none)
  private bitmapInflight = false;
  private lastPush: { key: string; srcT: number } | null = null;
  private seekGen = 0;
  // Ghost decode for cut transitions: inside the window the "other side" frame is supplied by a
  // ghost element (same source = cloned element, doesn't touch the active handoff state machine).
  // Once created a ghost stays resident and is never reloaded (decode-zombie lesson: element
  // churn/reload is the root cause).
  private trs: { cut: number; half: number }[] = [];
  private ghosts = new Map<string, HTMLVideoElement>(); // key `${srcKey}::pre|post`
  private activeGhost: HTMLVideoElement | null = null;
  private ghostFresh = false; // ghost is in place and not seeking (stale frames mid-seek aren't emitted, prevents side-swap flicker)
  // Audio clips (music lane): one resident <audio> element per clip, volume driven per tick from the
  // envelope closure. Deliberately loose sync (music has no lip-sync): only correct drift > 0.35s.
  // Each element is routed through a WebAudio gain node so a clip can be BOOSTED past source level
  // (element.volume caps at 1). The takeover is permanent per element, so every lane clip goes through
  // the graph — never half native, half routed. The VIDEO elements stay untouched on the native path.
  private audioClips = new Map<string, { el: HTMLAudioElement; spec: EngineAudioClip; gain?: GainNode }>();
  private actx: AudioContext | null = null;
  // Narration dub: a processed-audio stand-in (denoise bake) keyed by source. While a dub exists for a
  // source, its decode element is force-muted and the dub carries the sound in SOURCE seconds — lip-sync
  // matters here, so drift correction is tight (0.08s) against the video element's own clock.
  private dubs = new Map<string, { el: HTMLAudioElement; url: string }>();
  // Solo monitoring: while an audio clip is soloed the footage's own sound is silenced in preview only
  // (see setMonitorMuteVideo) — this never enters the composition and never reaches the export mixer.
  private monitorMuteVideo = false;
  // Smooth clock: el.currentTime steps at video frame rate (30fps footage = 33ms jumps), so
  // aligning transition progress / overlays directly to it isn't smooth. During playback, advance
  // by wall clock and pull back when drift from the raw clock exceeds 80ms (seek/handoff self-heal).
  private tSmooth = -1;

  onFrame?: (frame: ImageBitmap, info: FrameInfo, frame2?: ImageBitmap | null) => void;
  onTick?: (t: number) => void;
  onEnded?: () => void;
  /** Transition pre-bake provider (workbench): cut → decoded frame set; null = not baked/decoded (falls back to the ghost path).
   *  When baked, the window pushes finished frames and ghost decode stays idle — "on-the-fly scheduling" leaves the critical path. */
  bakeProvider?: (cut: number) => { fps: number; half: number; frames: ImageBitmap[] } | null;

  private ensureHost(): HTMLDivElement {
    if (!this.host) {
      const d = document.createElement('div');
      // avoid display:none: hidden off-screen but still rendering, so decode/frame-grab isn't throttled
      d.style.cssText = 'position:fixed;left:-200vw;top:0;width:8px;height:8px;overflow:hidden;pointer-events:none;';
      document.body.appendChild(d);
      this.host = d;
    }
    return this.host;
  }

  /** Create/swap a source's resident decode element. file=null removes the source. Same File (by
   *  reference) / same URL is idempotent — the idempotence check MUST happen *before* createObjectURL:
   *  objectURL is a new string every time, so comparing it means never idempotent, and any segment-table
   *  change reloads every source via load() (observed: deleting a clip has an adjacent segment's
   *  hover/handoff hit the reload window, and a perfectly good segment gets skipped as a dead window). */
  setSource(key: string, source: File | string | null): void {
    const prev = this.els.get(key);
    if (source == null) {
      if (prev) {
        prev.remove();
        this.els.delete(key);
      }
      for (const side of ['pre', 'post'] as const) {
        const gDrop = this.ghosts.get(`${key}::${side}`);
        if (gDrop) {
          gDrop.remove();
          this.ghosts.delete(`${key}::${side}`);
          if (this.activeGhost === gDrop) this.activeGhost = null;
        }
      }
      this.srcIds.delete(key);
      const u = this.urls.get(key);
      if (u) {
        URL.revokeObjectURL(u);
        this.urls.delete(key);
      }
      return;
    }
    if (prev && this.srcIds.get(key) === source) return; // idempotent: same File reference / same URL
    this.srcIds.set(key, source);
    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    if (prev) {
      if (prev.dataset.hfSrcTag === url) return; // idempotent
      const old = this.urls.get(key);
      if (old) URL.revokeObjectURL(old);
      this.urls.delete(key);
      prev.src = url;
      prev.dataset.hfSrcTag = url;
      if (typeof source !== 'string') this.urls.set(key, url);
      prev.load();
      // source swapped: old ghosts point at the old src, drop them for lazy rebuild
      for (const side of ['pre', 'post'] as const) {
        const gStale = this.ghosts.get(`${key}::${side}`);
        if (gStale) {
          gStale.remove();
          this.ghosts.delete(`${key}::${side}`);
          if (this.activeGhost === gStale) this.activeGhost = null;
        }
      }
      return;
    }
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = url;
    v.dataset.hfSrcTag = url;
    if (typeof source !== 'string') this.urls.set(key, url);
    this.ensureHost().appendChild(v);
    this.els.set(key, v);
  }

  setSegments(segs: EngineSeg[]): void {
    this.segs = segs;
    this.starts = [];
    let acc = 0;
    for (const s of segs) {
      this.starts.push(acc);
      acc += Math.max(0, s.srcEnd - s.srcStart);
    }
    this.total = acc;
    this.curIdx = -1; // segment table changed: recompute the active one
    // segment table changed mid-playback (delete/trim/insert while playing): the rAF loop only knows
    // curIdx, and without re-locating it spins dead — restart playback from the current film time
    // (play clamps t, re-finds a playable segment, reschedules rAF)
    if (this.playing) this.play(Math.min(this.tEdited, this.total));
  }

  get durationSec(): number {
    return this.total;
  }

  private segGain(i: number, tEdited?: number): number {
    const seg = this.segs[i];
    if (!seg) return 1;
    if (this.monitorMuteVideo) return 0;
    const base = seg.gain == null ? 1 : Math.max(0, Math.min(1, seg.gain));
    if (!seg.fadeAt || base <= 0) return base;
    const local = (tEdited ?? this.tEdited) - (this.starts[i] ?? 0);
    return Math.max(0, Math.min(1, base * seg.fadeAt(local)));
  }

  /** Monitoring-only footage mute (an audio clip is soloed): silences the video track's own sound in
   *  PREVIEW without touching the composition — nothing here reaches the export mixer. Applied inside
   *  segGain, so every writer (activation, roll-through, per-tick fades, dub) picks it up. */
  setMonitorMuteVideo(on: boolean): void {
    if (this.monitorMuteVideo === on) return;
    this.monitorMuteVideo = on;
    const seg = this.segs[this.curIdx];
    if (!seg) return;
    const g = this.segGain(this.curIdx);
    const el = this.els.get(seg.key);
    if (el) el.volume = g; // paused too: no tick would come to apply it
    const dub = this.dubs.get(seg.key);
    if (dub) dub.el.volume = g;
  }

  /** Live volume preview (slider drag): update one segment's gain in place and, if it's the active one,
   *  apply to the element immediately — no setSegments refeed, no handoff churn. Commit still flows
   *  through the normal comp → setSegments path. */
  setSegGain(i: number, gain: number): void {
    const seg = this.segs[i];
    if (!seg) return;
    seg.gain = gain;
    if (i !== this.curIdx) return;
    const el = this.els.get(seg.key);
    if (el) el.volume = this.segGain(i);
  }

  /** Cut transition table (film seconds): inside the window, pushFrame carries the "other side" ghost frame (frame2). */
  setTransitions(trs: { cut: number; half: number }[]): void {
    this.trs = trs;
  }

  /** Reconcile the audio-clip set: same-url respec (knob turns) keeps the element — only the closures
   *  swap, no reload, no playback interruption; removed ids drop their elements. */
  setAudioClips(specs: EngineAudioClip[]): void {
    const keep = new Set(specs.map((sp) => sp.id));
    for (const [id, c] of this.audioClips) {
      if (!keep.has(id)) {
        c.gain?.disconnect();
        c.el.remove();
        this.audioClips.delete(id);
      }
    }
    for (const spec of specs) {
      const cur = this.audioClips.get(spec.id);
      if (!cur) {
        const a = document.createElement('audio');
        a.preload = 'auto';
        a.src = spec.url;
        a.dataset.hfSrcTag = spec.url;
        this.ensureHost().appendChild(a);
        this.audioClips.set(spec.id, { el: a, spec });
      } else {
        if (cur.el.dataset.hfSrcTag !== spec.url) {
          cur.el.src = spec.url;
          cur.el.dataset.hfSrcTag = spec.url;
          cur.el.load();
        }
        cur.spec = spec;
      }
    }
    this.syncAudioClips(this.tEdited, this.playing, true);
  }

  /** Mount/swap/remove a source's narration dub (baked processed audio, same source-seconds timeline).
   *  Same-url is idempotent; url change swaps the element src in place (re-blend after a strength change). */
  setNarrationDub(key: string, url: string | null): void {
    const cur = this.dubs.get(key);
    if (!url) {
      if (cur) {
        cur.el.remove();
        this.dubs.delete(key);
      }
      // hand the sound back to the decode element on the next activate/seek
      if (!this.playing) this.seek(this.tEdited);
      return;
    }
    if (cur?.url === url) return;
    if (cur) {
      cur.el.src = url;
      cur.el.load();
      cur.url = url;
    } else {
      const a = document.createElement('audio');
      a.preload = 'auto';
      a.src = url;
      this.ensureHost().appendChild(a);
      this.dubs.set(key, { el: a, url });
    }
    if (!this.playing) this.seek(this.tEdited); // re-run activation so muting/dub parking take effect
  }

  /** Dub sync for the active source (called from activate/seek/tick): the video element stays the clock,
   *  the dub follows in source seconds; corrections only past 0.08s (audible micro-gap, so keep them rare). */
  private syncDub(key: string, videoEl: HTMLVideoElement, gain: number, wantPlay: boolean): boolean {
    for (const [k, d] of this.dubs) {
      if (k !== key && !d.el.paused) d.el.pause();
    }
    const dub = this.dubs.get(key);
    if (!dub) return false;
    dub.el.volume = Math.max(0, Math.min(1, gain));
    if (!dub.el.seeking && Math.abs(dub.el.currentTime - videoEl.currentTime) > 0.08) {
      try {
        dub.el.currentTime = videoEl.currentTime;
      } catch {
        /* metadata not ready: next tick retries */
      }
    }
    if (wantPlay && dub.el.paused) dub.el.play().catch(() => {});
    else if (!wantPlay && !dub.el.paused) dub.el.pause();
    return true;
  }

  /** Lazily build (and reuse) this clip's WebAudio chain: element → gain → destination. Returns null when
   *  the browser refuses a context; the caller then degrades to element volume (boosts just won't be
   *  audible in preview, while export still applies them). */
  private gainFor(entry: { el: HTMLAudioElement; gain?: GainNode }): GainNode | null {
    if (entry.gain) return entry.gain;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      if (!this.actx) this.actx = new Ctor();
      const gain = this.actx.createGain();
      this.actx.createMediaElementSource(entry.el).connect(gain).connect(this.actx.destination);
      entry.gain = gain;
      return gain;
    } catch {
      return null; // already-taken-over element / autoplay policy: stay on the native path
    }
  }

  /** Per-tick / on-seek clip sync: volume from the envelope closure, playbackRate = speed with
   *  preservesPitch OFF (matches the export resample); drift correction only past 0.35s. force = hard seek. */
  private syncAudioClips(t: number, wantPlay: boolean, force = false): void {
    if (wantPlay && this.actx?.state === 'suspended') void this.actx.resume(); // play is a user gesture
    for (const entry of this.audioClips.values()) {
      const { el, spec } = entry;
      const srcT = spec.srcTimeAt(t);
      const gainNode = this.gainFor(entry);
      const setGain = (g: number) => {
        if (gainNode) {
          gainNode.gain.value = Math.max(0, g);
          el.volume = 1; // the graph carries the level now
        } else {
          el.volume = Math.max(0, Math.min(1, g)); // no graph: boosts are inaudible here, export still applies them
        }
      };
      if (srcT == null) {
        setGain(0);
        if (!el.paused) el.pause();
        continue;
      }
      setGain(spec.gainAt(t));
      el.playbackRate = spec.speed;
      (el as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = false;
      if ((force || Math.abs(el.currentTime - srcT) > 0.35) && !el.seeking) {
        try {
          el.currentTime = srcT;
        } catch {
          /* metadata not ready: next tick retries */
        }
      }
      if (wantPlay && el.paused) el.play().catch(() => {});
      else if (!wantPlay && !el.paused) el.pause();
    }
  }

  /** The transition window containing t (with 0.3s warm-up lead) → both-side segment indices; null if the cut doesn't align to a segment boundary. */
  private transitionWinAt(t: number): { cut: number; half: number; iA: number; iB: number } | null {
    for (const tr of this.trs) {
      if (t < tr.cut - tr.half - 0.3 || t > tr.cut + tr.half + 0.05) continue;
      for (let i = 1; i < this.segs.length; i++) {
        if (Math.abs(this.starts[i]! - tr.cut) < 0.05) return { cut: tr.cut, half: tr.half, iA: i - 1, iB: i };
      }
      return null;
    }
    return null;
  }

  /** Ghost decode element for a given source and "side" (lazy-built, resident, always muted; src copied
   *  straight from the active element). Split into two elements by side (pre=B's lead-in / post=A's tail):
   *  same-source cuts have different time domains on each side; one element swapping sides at the cut would
   *  need a seek, and decode stalling while stale frames still emit causes mixed-content flicker (observed). */
  private ghostFor(key: string, side: 'pre' | 'post'): HTMLVideoElement | null {
    const gk = `${key}::${side}`;
    const g0 = this.ghosts.get(gk);
    if (g0) return g0;
    const main = this.els.get(key);
    if (!main?.src) return null;
    const g = document.createElement('video');
    g.muted = true;
    g.playsInline = true;
    g.preload = 'auto';
    g.src = main.src;
    this.ensureHost().appendChild(g);
    this.ghosts.set(gk, g);
    return g;
  }

  /** Ghost time-sync: inside the window, drive the "other side" ghost into position (before the cut =
   *  B's lead-in handle, after = A's tail handle; a handle out of range clamps to a frozen edge frame).
   *  Before the cut, warm up the post side (park at A's tail, start playing just before the cut) — zero
   *  gap when swapping sides at the cut. ghostFresh = ghost is in place and not seeking (pushFrame uses
   *  it to decide whether to emit frame2; stale frames mid-seek are never emitted). Outside the window, pause all. */
  private syncGhost(t: number): void {
    const w = this.transitionWinAt(t);
    if (!w) {
      if (this.activeGhost) {
        for (const g of this.ghosts.values()) if (!g.paused) g.pause();
        this.activeGhost = null;
      }
      this.ghostFresh = false;
      return;
    }
    if (this.bakeProvider?.(w.cut)) {
      // window already has baked frames: ghost decode stays fully idle (no build, no seek, no play)
      if (this.activeGhost) {
        for (const g of this.ghosts.values()) if (!g.paused) g.pause();
        this.activeGhost = null;
      }
      this.ghostFresh = false;
      return;
    }
    const pre = t < w.cut;
    const other = pre ? this.segs[w.iB]! : this.segs[w.iA]!;
    const srcT = pre ? Math.max(0, other.srcStart - (w.cut - t)) : other.srcEnd + (t - w.cut);
    const g = this.ghostFor(other.key, pre ? 'pre' : 'post');
    if (!g) return;
    if (this.activeGhost && this.activeGhost !== g && !this.activeGhost.paused) this.activeGhost.pause();
    this.activeGhost = g;
    const durCap = Number.isFinite(g.duration) && g.duration > 0 ? g.duration - 0.05 : Infinity;
    const tgt = Math.min(srcT, durCap);
    try {
      if (Math.abs(g.currentTime - tgt) > 0.15) g.currentTime = tgt;
    } catch {
      /* metadata not ready: re-sync next tick */
    }
    this.ghostFresh = !g.seeking && g.readyState >= 2 && Math.abs(g.currentTime - tgt) < 0.3;
    if (this.playing && t >= w.cut - w.half) {
      if (g.paused) g.play().catch(() => {});
    } else if (!g.paused) g.pause();
    // warm up the other side: before the cut, park the post ghost (do the seek early). Balance start
    // timing against position: start from srcEnd-lead so it reaches srcEnd exactly at the cut — if it
    // started early from srcEnd, it would overshoot by 0.25s by the cut and still need a seek there,
    // wasting the warm-up
    if (pre) {
      const segA = this.segs[w.iA]!;
      const gp = this.ghostFor(segA.key, 'post');
      if (gp) {
        const rolling = this.playing && t >= w.cut - 0.25;
        const parkT = segA.srcEnd - (rolling ? Math.max(0, w.cut - t) : 0);
        try {
          if (Math.abs(gp.currentTime - parkT) > 0.2 && !gp.seeking) gp.currentTime = parkT;
        } catch {
          /* metadata not ready */
        }
        if (rolling && gp.paused) gp.play().catch(() => {});
      }
    }
  }

  private alive(i: number): boolean {
    const s = this.segs[i];
    if (!s) return false;
    const el = this.els.get(s.key);
    return !!el && !!el.currentSrc && !el.error;
  }

  private segIndexAt(t: number): number {
    for (let i = 0; i < this.segs.length; i++) {
      const len = Math.max(0, this.segs[i]!.srcEnd - this.segs[i]!.srcStart);
      if (t < this.starts[i]! + len || i === this.segs.length - 1) return i;
    }
    return this.segs.length - 1;
  }

  /** The playable segment at t (or the first one after it); -1 if all are dead. */
  private playableAt(t: number): number {
    if (!this.segs.length) return -1;
    let i = this.segIndexAt(t);
    for (; i < this.segs.length; i++) if (this.alive(i)) return i;
    return -1;
  }

  private activateIdx(i: number, srcT: number, wantPlay: boolean): void {
    this.curIdx = i;
    const key = this.segs[i]!.key;
    for (const [k, el] of this.els) {
      if (k === key) continue;
      el.muted = true;
      if (!el.paused) el.pause();
    }
    const el = this.els.get(key);
    if (!el) return;
    try {
      el.currentTime = Math.max(0, srcT);
    } catch {
      /* metadata not ready: the next seek after loadedmetadata covers it */
    }
    el.volume = this.segGain(i);
    // a mounted dub carries this source's sound → the decode element stays muted no matter what
    const dubbed = this.syncDub(key, el, this.segGain(i), wantPlay);
    el.muted = dubbed || !wantPlay; // only the active element makes sound during playback
    if (wantPlay) {
      const p = el.play();
      if (p?.catch) p.catch(() => {});
    } else if (!el.paused) {
      el.pause();
    }
  }

  private pushFrame(tOverride?: number): void {
    if (this.bitmapInflight || this.curIdx < 0) return;
    const seg = this.segs[this.curIdx];
    if (!seg) return;
    const el = this.els.get(seg.key);
    if (!el || el.readyState < 2 || !el.videoWidth) return;
    const srcT = el.currentTime;
    const t = tOverride ?? this.starts[this.curIdx]! + Math.max(0, srcT - seg.srcStart);
    // inside the transition window (excluding warm-up), carry the other side's ghost frame; skip dedup (ghost is moving, push even if the main frame is same-position)
    const w = this.transitionWinAt(t);
    const inWin = !!w && t >= w.cut - w.half;
    const bake = inWin ? this.bakeProvider?.(w!.cut) : null;
    if (bake && inWin && bake.frames.length) {
      // pre-bake path: push finished frames by frame index (clone then transfer; dedup same frame), decoder doesn't touch the picture at all
      const idx = Math.max(0, Math.min(bake.frames.length - 1, Math.round((t - (w!.cut - bake.half)) * bake.fps)));
      const bkey = `bake@${w!.cut}`;
      if (this.lastPush && this.lastPush.key === bkey && this.lastPush.srcT === idx) return;
      this.bitmapInflight = true;
      createImageBitmap(bake.frames[idx]!).then(
        (bmp) => {
          this.bitmapInflight = false;
          this.lastPush = { key: bkey, srcT: idx };
          this.onFrame?.(bmp, { t, elKey: seg.elKey, srcT, baked: true }, null);
        },
        () => {
          this.bitmapInflight = false;
        },
      );
      return;
    }
    const g = inWin && this.ghostFresh ? this.activeGhost : null;
    const ghostReady = !!g && g.readyState >= 2 && !!g.videoWidth;
    if (!ghostReady && this.lastPush && this.lastPush.key === seg.key && Math.abs(this.lastPush.srcT - srcT) < 1 / 60) return;
    this.bitmapInflight = true;
    Promise.all([createImageBitmap(el), ghostReady ? createImageBitmap(g!).catch(() => null) : Promise.resolve(null)]).then(
      ([bmp, bmp2]) => {
        this.bitmapInflight = false;
        this.lastPush = { key: seg.key, srcT };
        this.onFrame?.(bmp, { t, elKey: seg.elKey, srcT }, bmp2);
      },
      () => {
        this.bitmapInflight = false;
      },
    );
  }

  /** Paused seek: park the active element, push one frame after seeked. */
  seek(t: number): void {
    this.tEdited = Math.max(0, Math.min(this.total, t));
    this.tSmooth = this.tEdited;
    const i = this.playableAt(this.tEdited);
    if (i < 0) {
      this.curIdx = -1;
      return;
    }
    const seg = this.segs[i]!;
    // seek into a dead window: degrade to showing the first frame of the next playable segment (same as the shim era, no freeze)
    const inSeg = this.segIndexAt(this.tEdited) === i;
    const srcT = inSeg ? seg.srcStart + (this.tEdited - this.starts[i]!) : seg.srcStart;
    this.activateIdx(i, srcT, this.playing);
    const el = this.els.get(seg.key);
    if (!el) return;
    this.syncGhost(this.tEdited); // scrub into a transition window: ghost seeks along (no play while paused)
    this.syncAudioClips(this.tEdited, this.playing, true); // park the clips at the new position (aligned resume)
    const gen = ++this.seekGen;
    const push = () => {
      if (gen !== this.seekGen) return;
      this.lastPush = null; // the seek frame must push (same-frame dedup would block a re-push on an in-place seek)
      this.pushFrame();
    };
    if (el.readyState >= 2 && Math.abs(el.currentTime - srcT) < 0.01) push();
    else {
      el.addEventListener('seeked', push, { once: true });
      el.addEventListener('loadeddata', push, { once: true });
    }
  }

  play(t: number): void {
    this.tEdited = Math.max(0, Math.min(this.total, t));
    this.playing = true;
    const i = this.playableAt(this.tEdited);
    if (i < 0) {
      this.playing = false;
      this.onEnded?.();
      return;
    }
    const seg = this.segs[i]!;
    const inSeg = this.segIndexAt(this.tEdited) === i;
    const srcT = inSeg ? seg.srcStart + (this.tEdited - this.starts[i]!) : seg.srcStart;
    if (!inSeg) this.tEdited = this.starts[i]!; // starting play in a dead window: begin at the next playable segment (skip)
    this.activateIdx(i, srcT, true);
    this.syncAudioClips(this.tEdited, true, true); // hard-align the clips at play start
    if (this.raf) cancelAnimationFrame(this.raf);
    let lastCt = -1;
    let lastCtAt = performance.now();
    let lastLoopAt = performance.now();
    this.tSmooth = this.tEdited;
    const loop = () => {
      if (!this.playing) return;
      const idx = this.curIdx;
      const sg = idx >= 0 ? this.segs[idx] : null;
      const el = sg ? this.els.get(sg.key) : null;
      const nowLoop = performance.now();
      const dtWall = Math.min(0.1, (nowLoop - lastLoopAt) / 1000);
      lastLoopAt = nowLoop;
      if (sg && el) {
        const ct = el.currentTime;
        this.tEdited = this.starts[idx]! + Math.max(0, Math.min(ct, sg.srcEnd) - sg.srcStart);
        // smooth clock: wall-clock advance + proportional pull-back (close 12% of the drift per frame).
        // Hard snap-back is reserved for real jumps (>250ms: seek/handoff) — a smaller threshold aliases:
        // when the media clock stutters, wall clock runs ahead, and once the threshold builds up it yanks
        // back, visibly jerking the playhead and reversing transition progress (observed). During soft
        // correction, never run backward (monotonic).
        let ts;
        if (this.tSmooth < 0) ts = this.tEdited;
        else {
          // clock discipline: never run backward (going back = baked transition frames replay in reverse,
          // observed as "the transition played twice"). Leading the media (at the cut, the main element's
          // audio-trim seek stalls the media clock) = coast at reduced rate to catch up, no hard yank;
          // lagging >0.25s (forward seek/handoff) = jump forward only. Inside the bake window, free-wheel
          // (picture doesn't need the decoder), but leading >0.6s also halves the rate as a backstop.
          const wB = this.transitionWinAt(this.tSmooth);
          const freewheel = !!wB && this.tSmooth >= wB.cut - wB.half && !!this.bakeProvider?.(wB.cut);
          const lead = this.tSmooth - this.tEdited;
          let rate = 1;
          if (!freewheel && lead > 0.04) rate = Math.max(0.3, 1 - lead * 2.5);
          if (freewheel && lead > 0.6) rate = 0.5;
          ts = this.tSmooth + dtWall * rate;
          if (ts - this.tEdited < -0.25) ts = this.tEdited; // too far behind: jump forward (forward doesn't hurt perception)
          if (ts < this.tSmooth) ts = this.tSmooth;
        }
        this.tSmooth = ts;
        this.onTick?.(ts);
        this.syncGhost(ts); // transition ghost time-sync (all auto-paused outside the window)
        this.syncAudioClips(ts, true);
        if (this.segs[idx]?.fadeAt && !el.muted) el.volume = this.segGain(idx, ts); // shot audio fades ride the clock
        if (this.dubs.size && this.syncDub(sg.key, el, this.segGain(this.curIdx), true)) el.muted = true;
        this.pushFrame(ts);
        // segment-end detection, three checks: (1) reached segment end; (2) element fires ended;
        // (3) stall backstop — streaming webm duration is estimated via Infinity-seek and may be too
        // high (measured 4.0 vs data ending at 3.92), so the element neither fires ended nor reaches
        // srcEnd; only "clock not advancing near the tail" closes it out
        const durCap = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : Infinity;
        const segEnd = Math.min(sg.srcEnd, durCap);
        const now = performance.now();
        if (Math.abs(ct - lastCt) > 0.005) {
          lastCt = ct;
          lastCtAt = now;
        }
        const stalledAtTail = now - lastCtAt > 700 && ct >= segEnd - 0.6 && !el.seeking;
        if (ct >= segEnd - EPS || el.ended || stalledAtTail) {
          // segment-tail handoff: find the next playable segment (skip dead windows); none = end of film
          let nx = idx + 1;
          for (; nx < this.segs.length; nx++) if (this.alive(nx)) break;
          if (nx < this.segs.length) {
            this.tEdited = this.starts[nx]!;
            const nxSeg = this.segs[nx]!;
            if (nxSeg.key === sg.key && Math.abs(nxSeg.srcStart - sg.srcEnd) < 0.05 && !el.ended && !el.paused) {
              // continuous same-source split point (pure split, no footage removed): the element is already
              // playing right here — swap the active index without a seek so decode isn't interrupted (forcing
              // an in-place currentTime seek stalls 50–150ms, visible as a "flash/stutter" at the cut)
              this.curIdx = nx;
              el.volume = this.segGain(nx); // roll-through skips activateIdx, but the two shots may carry different gains
            } else {
              this.activateIdx(nx, nxSeg.srcStart, true);
            }
          } else {
            this.pause();
            this.tEdited = this.total;
            this.onTick?.(this.total);
            this.onEnded?.();
            return;
          }
        }
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  pause(): void {
    this.playing = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const el of this.els.values()) {
      el.muted = true;
      if (!el.paused) el.pause();
    }
    for (const g of this.ghosts.values()) if (!g.paused) g.pause();
    for (const c of this.audioClips.values()) if (!c.el.paused) c.el.pause();
    for (const d of this.dubs.values()) if (!d.el.paused) d.el.pause();
  }

  /** Re-push the current frame (after a buffer swap the new document's canvas is blank). */
  refresh(): void {
    if (this.playing) return; // during playback the next frame arrives naturally
    this.seek(this.tEdited);
  }

  dispose(): void {
    this.pause();
    for (const c of this.audioClips.values()) {
      c.gain?.disconnect();
      c.el.remove();
    }
    this.audioClips.clear();
    void this.actx?.close().catch(() => {});
    this.actx = null;
    for (const d of this.dubs.values()) d.el.remove();
    this.dubs.clear();
    for (const el of this.els.values()) el.remove();
    for (const g of this.ghosts.values()) g.remove();
    for (const u of this.urls.values()) URL.revokeObjectURL(u);
    this.els.clear();
    this.ghosts.clear();
    this.urls.clear();
    this.srcIds.clear();
    this.activeGhost = null;
    this.host?.remove();
    this.host = null;
  }
}
