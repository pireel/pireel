/**
 * 父层视频轨引擎(canvas 渲染模式的解码/时钟/音频侧):
 *
 * 病根:预览 iframe 是沙箱 + 双缓冲,文档一重建就重造 <video>,解码器会话反复生灭——
 * "解码僵尸"整类顽疾都长在这上面。治法:**解码元素常驻父层**(每个源一个隐藏 <video>,
 * 与文档生命周期彻底解耦),iframe 里的视频轨只是一块 <canvas>,帧经 ImageBitmap
 * postMessage(转移零拷贝)推过去;音频直接从父层元素出(当家源解除静音)。
 *
 * 时钟主 = 当家源元素的 currentTime(成片时间由段表映射),边界交棒/死窗跳过在这里用
 * 可调试的 TS 实现(原 VIDEO_TRIM_SHIM 状态机的移植与退役)。字幕/HTML 块仍是 iframe
 * 里的 DOM/GSAP——播放中父层每帧发 hf:seekTimelines 对齐,编辑面不变。
 *
 * 将来换 WebCodecs 只动本文件的取帧实现,iframe 契约(hf:frame / hf:seekTimelines)不变。
 */

export interface EngineSeg {
  /** 源键:'main' 或该段的 src(blob/远端 URL)。 */
  key: string;
  /** mask/人像用的元素口径键:'main' 或 clip_<shotId>(与 personMaskAt 协议一致)。 */
  elKey: string;
  srcStart: number;
  srcEnd: number;
}

export interface FrameInfo {
  t: number;
  elKey: string;
  srcT: number;
  /** true = 预烧录的转场成品帧(shim 直接铺,不再合成)。 */
  baked?: boolean;
}

const EPS = 0.04;

export class VideoTrackEngine {
  private host: HTMLDivElement | null = null;
  private els = new Map<string, HTMLVideoElement>();
  private urls = new Map<string, string>(); // 我们创建的 objectURL(替换源时回收)
  private srcIds = new Map<string, File | string>(); // 源身份:File 按引用、URL 按字符串判幂等
  private segs: EngineSeg[] = [];
  private starts: number[] = [];
  private total = 0;
  private playing = false;
  private tEdited = 0;
  private raf = 0;
  private curIdx = -1; // 当家段下标(-1 = 无)
  private bitmapInflight = false;
  private lastPush: { key: string; srcT: number } | null = null;
  private seekGen = 0;
  // 切点转场的影子解码:窗口内"另一侧"的画面由 ghost 元素提供(同源=克隆元素,不碰当家
  // 的交棒状态机)。ghost 一经创建常驻不重载(解码僵尸的教训:元素生灭/重载才是病根)。
  private trs: { cut: number; half: number }[] = [];
  private ghosts = new Map<string, HTMLVideoElement>(); // 键 `${srcKey}::pre|post`
  private activeGhost: HTMLVideoElement | null = null;
  private ghostFresh = false; // 影子在位且没在 seek(seek 中的旧帧不外发,防换边闪跳)
  // 平滑时钟:el.currentTime 按视频帧率步进(30fps 素材=33ms 一跳),转场进度/叠加层
  // 对齐直接吃它就不丝滑。播放中用墙钟推进、与原始时钟偏差 >80ms 回吸(seek/交棒自愈)。
  private tSmooth = -1;

  onFrame?: (frame: ImageBitmap, info: FrameInfo, frame2?: ImageBitmap | null) => void;
  onTick?: (t: number) => void;
  onEnded?: () => void;
  /** 转场预烧录提供方(workbench):切点 → 已解码帧组;null=没烧好/没解码(落回影子路径)。
   *  有烧录时窗口内推成品帧、影子解码整条待机——"临场调度"从关键路径上消失。 */
  bakeProvider?: (cut: number) => { fps: number; half: number; frames: ImageBitmap[] } | null;

  private ensureHost(): HTMLDivElement {
    if (!this.host) {
      const d = document.createElement('div');
      // 不用 display:none:隐藏文档流外但保持渲染,解码/取帧不被节流
      d.style.cssText = 'position:fixed;left:-200vw;top:0;width:8px;height:8px;overflow:hidden;pointer-events:none;';
      document.body.appendChild(d);
      this.host = d;
    }
    return this.host;
  }

  /** 建/换某个源的常驻解码元素。file=null 移除该源。同 File(按引用)/同 URL 幂等——
   *  幂等判定必须在 createObjectURL **之前**:objectURL 每次都是新串,拿它比对
   *  等于永不幂等,段表一变全部源都被 load() 重载(实录:删除片段的瞬间相邻段
   *  hover/交棒撞上重载窗口,好端端的段被当死窗跳过)。 */
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
    if (prev && this.srcIds.get(key) === source) return; // 幂等:同一 File 引用/同一 URL
    this.srcIds.set(key, source);
    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    if (prev) {
      if (prev.dataset.hfSrcTag === url) return; // 幂等
      const old = this.urls.get(key);
      if (old) URL.revokeObjectURL(old);
      this.urls.delete(key);
      prev.src = url;
      prev.dataset.hfSrcTag = url;
      if (typeof source !== 'string') this.urls.set(key, url);
      prev.load();
      // 源换体:旧 ghost 指着旧 src,弃掉懒重建
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
    this.curIdx = -1; // 段表变了:当家重算
    // 播放中换段表(播着删/裁/插):rAF 循环只认 curIdx,不重新定位就空转挂死——
    // 按当前成片时间重新起播(play 会夹取 t、重找可播段、重编 rAF)
    if (this.playing) this.play(Math.min(this.tEdited, this.total));
  }

  get durationSec(): number {
    return this.total;
  }

  /** 切点转场表(成片秒):窗口内 pushFrame 会带上"另一侧"的 ghost 帧(frame2)。 */
  setTransitions(trs: { cut: number; half: number }[]): void {
    this.trs = trs;
  }

  /** t 所在的转场窗口(带 0.3s 预热提前量)→ 两侧段下标;切点对不上段边界返回 null。 */
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

  /** 某源某"边"的 ghost 解码元素(懒建,常驻,恒 muted;src 直接抄当家元素)。
   *  按边(pre=B 前摇/post=A 尾巴)分两个元素:同源切点两边时间域不同,一个元素在
   *  切点上换边要 seek,解码一停旧帧还在外发——混合内容闪跳(实录)。 */
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

  /** 影子对时:窗口内让"另一侧"的 ghost 播到位(切点前=B 的前摇 handle,切点后=A 的
   *  尾巴 handle;handle 越界夹住=定格边帧)。切点前**预热 post 边**(摆到 A 尾巴、临近
   *  切点先起播)——切点换边零间隙。ghostFresh=影子在位且没在 seek(pushFrame 据此
   *  决定发不发 frame2,seek 中的旧帧绝不外发)。离开窗口全部暂停。 */
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
      // 窗口已有成品帧:影子解码整条待机(不建、不 seek、不播)
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
      /* metadata 未就绪:下一拍再对 */
    }
    this.ghostFresh = !g.seeking && g.readyState >= 2 && Math.abs(g.currentTime - tgt) < 0.3;
    if (this.playing && t >= w.cut - w.half) {
      if (g.paused) g.play().catch(() => {});
    } else if (!g.paused) g.pause();
    // 预热另一边:切点前把 post ghost 摆好(seek 提前做掉)。起播时机与位置配平:
    // 从 srcEnd-提前量 起播,恰好在切点跑到 srcEnd——若从 srcEnd 提前起播,到切点已
    // 跑过头 0.25s,切点上还得 seek,预热就白做了
    if (pre) {
      const segA = this.segs[w.iA]!;
      const gp = this.ghostFor(segA.key, 'post');
      if (gp) {
        const rolling = this.playing && t >= w.cut - 0.25;
        const parkT = segA.srcEnd - (rolling ? Math.max(0, w.cut - t) : 0);
        try {
          if (Math.abs(gp.currentTime - parkT) > 0.2 && !gp.seeking) gp.currentTime = parkT;
        } catch {
          /* metadata 未就绪 */
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

  /** t 所在(或其后第一个)可播段;全死返回 -1。 */
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
      /* metadata 未就绪:loadedmetadata 后的下一次定位兜底 */
    }
    el.muted = !wantPlay; // 只有播放中的当家出声
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
    // 转场窗口内(不含预热段)带上另一侧的 ghost 帧;去重要放行(ghost 在动,主帧同位也得推)
    const w = this.transitionWinAt(t);
    const inWin = !!w && t >= w.cut - w.half;
    const bake = inWin ? this.bakeProvider?.(w!.cut) : null;
    if (bake && inWin && bake.frames.length) {
      // 预烧录路径:按帧号推成品帧(克隆后转移;同帧去重),解码器完全不参与画面
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

  /** 暂停态定位:摆当家元素到位,seeked 后推一帧。 */
  seek(t: number): void {
    this.tEdited = Math.max(0, Math.min(this.total, t));
    this.tSmooth = this.tEdited;
    const i = this.playableAt(this.tEdited);
    if (i < 0) {
      this.curIdx = -1;
      return;
    }
    const seg = this.segs[i]!;
    // 死窗内定位:降级显示其后第一个可播段的首帧(与 shim 时代口径一致,不冻)
    const inSeg = this.segIndexAt(this.tEdited) === i;
    const srcT = inSeg ? seg.srcStart + (this.tEdited - this.starts[i]!) : seg.srcStart;
    this.activateIdx(i, srcT, this.playing);
    const el = this.els.get(seg.key);
    if (!el) return;
    this.syncGhost(this.tEdited); // scrub 进转场窗口:影子跟着 seek(暂停态不播)
    const gen = ++this.seekGen;
    const push = () => {
      if (gen !== this.seekGen) return;
      this.lastPush = null; // 定位帧必推(同帧去重会拦住原地 seek 的重推)
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
    if (!inSeg) this.tEdited = this.starts[i]!; // 死窗起播:直接从下一个可播段开始(跳过)
    this.activateIdx(i, srcT, true);
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
        // 平滑时钟:墙钟推进 + **比例回吸**(每帧收 12% 偏差)。硬吸回只留给真跳变
        // (>250ms:seek/交棒)——阈值小了会锯齿:媒体时钟微卡时墙钟先跑,攒够阈值
        // 猛拉回来,播放头肉眼回跳、转场进度倒抽(实录)。软修正期不许倒走(单调)。
        let ts;
        if (this.tSmooth < 0) ts = this.tEdited;
        else {
          // 时钟纪律:**永不倒走**(倒走=转场成品帧倒放重演,实录"推移播了两次");
          // 领先媒体(切点上主元素为音频 trim seek 停摆媒体钟)= 降速滑行追平,
          // 不硬拉回;落后 >0.25s(向前 seek/交棒)= 只向前跳。烧录窗口内自由轮转
          // (画面不吃解码器),但领先 >0.6s 也降半速兜底。
          const wB = this.transitionWinAt(this.tSmooth);
          const freewheel = !!wB && this.tSmooth >= wB.cut - wB.half && !!this.bakeProvider?.(wB.cut);
          const lead = this.tSmooth - this.tEdited;
          let rate = 1;
          if (!freewheel && lead > 0.04) rate = Math.max(0.3, 1 - lead * 2.5);
          if (freewheel && lead > 0.6) rate = 0.5;
          ts = this.tSmooth + dtWall * rate;
          if (ts - this.tEdited < -0.25) ts = this.tEdited; // 落后过多:向前跳(向前不伤观感)
          if (ts < this.tSmooth) ts = this.tSmooth;
        }
        this.tSmooth = ts;
        this.onTick?.(ts);
        this.syncGhost(ts); // 转场影子对时(窗口外自动全停)
        this.pushFrame(ts);
        // 段末判定三口径:①到段末;②元素报 ended;③停滞兜底 —— 流式 webm 的时长是
        // Infinity-seek 估出来的,可能虚高(实测 4.0 vs 数据到 3.92 就没了),元素既不
        // ended 也到不了 srcEnd,只能靠"近末端时钟不走"收口
        const durCap = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : Infinity;
        const segEnd = Math.min(sg.srcEnd, durCap);
        const now = performance.now();
        if (Math.abs(ct - lastCt) > 0.005) {
          lastCt = ct;
          lastCtAt = now;
        }
        const stalledAtTail = now - lastCtAt > 700 && ct >= segEnd - 0.6 && !el.seeking;
        if (ct >= segEnd - EPS || el.ended || stalledAtTail) {
          // 段尾交棒:找下一个可播段(死窗跳过);没有 = 片尾
          let nx = idx + 1;
          for (; nx < this.segs.length; nx++) if (this.alive(nx)) break;
          if (nx < this.segs.length) {
            this.tEdited = this.starts[nx]!;
            const nxSeg = this.segs[nx]!;
            if (nxSeg.key === sg.key && Math.abs(nxSeg.srcStart - sg.srcEnd) < 0.05 && !el.ended && !el.paused) {
              // 连续同源分割点(纯 split,没有删掉 footage):元素本来就播到这儿——
              // 免 seek 直接换当家下标,解码不打断(强制 currentTime 原地 seek 会停
              // 50–150ms,肉眼就是切点"闪/顿"一下)
              this.curIdx = nx;
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
  }

  /** 重推当前帧(缓冲切换后新文档画布是空的)。 */
  refresh(): void {
    if (this.playing) return; // 播放中下一帧自然到
    this.seek(this.tEdited);
  }

  dispose(): void {
    this.pause();
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
