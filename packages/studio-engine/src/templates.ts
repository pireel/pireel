/**
 * 内置模板的渲染实现 + 注册(import 本文件即注册,副作用由 './composition' barrel 统一触发)。
 * 选择器一律 #blockId 作用域;文本节点打 data-edit 供预览就地改字。加模板 = 在这里
 * 加一个 render + registerTemplate,UI(模板面板/组件库/检查器枚举)自动长出来。
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
import { type CaptionPreset, getCaptionPreset } from './caption-presets';
import { t } from './i18n';
import { DEFAULT_CAPTION_WIDTH_PCT } from './composition-core';
import { chunkWordsBalanced, estWordEm, latinJoin, measureTextPx, wordsFromText } from './caption-fx';

/* ============================ 模板渲染实现 ============================ */

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
  // 字幕归字幕、组件归组件:effect='kinetic-slam' 是关键词重击**组件**(带 box 独立定位);
  // 其余一律句级字幕 → 预设通道(slots.preset 是块初始形态,全局 captionStyle 在 assemble 时覆盖)。
  if (str(slots.effect) === 'kinetic-slam') return renderSlam(words, id, scale);
  const subStyle = {
    ...(typeof slots.subYPct === 'number' ? { yPct: slots.subYPct as number } : {}),
    ...(typeof slots.subXPct === 'number' ? { xPct: slots.subXPct as number } : {}),
    ...(typeof slots.subWPct === 'number' ? { wPct: slots.subWPct as number } : {}),
    ...(typeof slots.subScale === 'number' && (slots.subScale as number) > 0 ? { scale: slots.subScale as number } : {}),
    ...(typeof slots.subHPct === 'number' && (slots.subHPct as number) > 0 ? { hPct: slots.subHPct as number } : {}),
  };
  const canvasW = typeof slots.canvasW === 'number' && (slots.canvasW as number) > 0 ? (slots.canvasW as number) : 1080;
  return renderPresetCaption(words, getCaptionPreset(str(slots.preset) || undefined), yPct, xPct, wPct, scale, id, hPct, str(slots.sub) || undefined, subStyle, canvasW);
}

/** 预设字体 → CSS font-family(serif 走 Noto Serif SC,mono 走主题 --font-num,缺省主题正文)。 */
function presetFontCss(p: CaptionPreset): string {
  if (p.font === 'serif') return `'Noto Serif SC','Songti SC',serif`;
  if (p.font === 'mono') return 'var(--font-num)';
  return 'var(--font-body)';
}

/** canvas 量宽用的**具体**字体栈(CSS var 进不了 canvas font;与文档实际加载的一致:
 *  --font-body=Noto Sans SC / --font-num=IBM Plex Mono,见 theme.ts)。 */
function presetFontFamilies(p: CaptionPreset): string {
  if (p.font === 'serif') return "'Noto Serif SC','Songti SC',serif";
  if (p.font === 'mono') return "'IBM Plex Mono',ui-monospace,monospace";
  return "'Noto Sans SC','PingFang SC',sans-serif";
}

/**
 * 预设花字:emphasis = 读到哪个词强调哪个词(变色 / 划线滑入 / 色块弹出);
 * line = 整句浮现的干净字幕,无逐词动画。视觉(配色/底板/装饰)全部来自预设表。
 * 长句**渲染期实时拆段**(chunkWordsByWidth):每段一个 .cap-line 按词时间轮播——
 * 单行短句不糊屏;拆段不落数据,块保持一句一块(旧块/草稿自动生效)。
 */
/**
 * 字幕行分段(**渲染与编辑态共用的单一口径**,workbench 选中强显要按同样的段定位)。
 * 拆段预算(px 口径,与渲染 CSS 逐项同源,全部按**取整后的真实值**入账;行内 nowrap,
 * 万一低估也只是左右对称微溢出,绝不视觉换行):
 *   框宽 = wPct% × 画布宽(canvasW,竖屏 1080/横屏 1920——硬编码 1080 会把横屏行宽腰斩,踩过)
 *   − 底板左右 padding:与 CSS 完全同式 round(fs×0.42)×2(仅有底板时)
 *   − 0.15em 安全余量(canvas 与排版引擎的亚像素差/字体未就绪回退)
 *   词间 flex gap = round(fs×0.18),n 词 n−1 个:按"每词摊 1 个、预算补回 1 个"精确入账。
 *   词宽 = canvas measureText 实测(pretext 式,italic/weight/字号/字体栈与渲染一致;
 *   量宽文档必须加载同款字体,见 STUDIO_FONTS_HREF);node/测试环境无 canvas → 字形
 *   类别估表退路,并恒取两者较大值(宁可早断,不许溢出换行)。
 */

export function captionLineSegments(words: FxWord[], p: CaptionPreset, wPct: number, scale: number, canvasW = 1080): FxWord[][] {
  const fs = Math.max(10, Math.round(p.size * scale));
  const gapPx = Math.round(fs * 0.18);
  const spPx = Math.round(fs * 0.12); // 西文词界追加距(与渲染 .sp 同口径)
  const padPx = p.bg ? Math.round(fs * 0.42) * 2 : 0;
  const canvasFont = `${p.italic ? 'italic ' : ''}${p.weight} ${fs}px ${presetFontFamilies(p)}`;
  const wordPx = (t: string) => {
    const est = estWordEm(t) * fs;
    const m = measureTextPx(t, canvasFont);
    return m == null ? est : Math.max(m, est); // 取较大值:估表作下限,canvas 只会收紧不会放宽
  };
  const extra = new Map<FxWord, number>();
  words.forEach((w, i) => {
    if (i < words.length - 1 && latinJoin(w.text, words[i + 1]!.text)) extra.set(w, spPx);
  });
  const budgetPx = (wPct / 100) * canvasW - padPx - fs * 0.15;
  return chunkWordsBalanced(words, Math.max(fs * 2, budgetPx + gapPx), (w) => wordPx(w.text) + gapPx + (extra.get(w) ?? 0));
}

function renderPresetCaption(words: FxWord[], p: CaptionPreset, yPct: number, xPct: number, wPct: number, scale: number, id: string, hPct = 0, sub?: string, subStyle?: { yPct?: number; xPct?: number; wPct?: number; scale?: number; hPct?: number }, canvasW = 1080): Rendered {
  const { start } = span2(words);
  // scale = **字号**系数(用户定的:缩放调的是字体大小,不是区域 transform)——
  // 字号/底板内边距/装饰全按缩放后的字号排版,文本真实重排,不是整块位图式缩放
  const fs = Math.max(10, Math.round(p.size * scale));
  const deco = p.mode === 'emphasis' && p.deco ? `<span class="deco"></span>` : '';
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
  // 双语副行:整句译文贴在主行正下方(主行 bottom 锚在 yPct,副行 top 锚同一线),
  // 视觉随预设走(同字体/底板/投影,0.6× 字号),无逐词动画——副行没有词级时间
  // 译文行 = 主行同一套口径的"第二条字幕行":分词拆行走同一个 captionLineSegments 预算
  // (框宽×字号实时推),锚定同主行(行底=yPct、行中心=xPct、框宽 wPct、框高 hPct 落
  // min-height),底板/投影/字体全随预设。缺省(subStyle.yPct 未设)= 贴主行正下方跟随。
  const subScale = subStyle?.scale ?? scale * 0.6;
  const subFs = Math.max(9, Math.round(p.size * subScale));
  const subW = subStyle?.wPct ?? wPct;
  const subSegs = sub ? captionLineSegments(wordsFromText(sub, 0, 1), p, subW, subScale, canvasW) : [];
  const subPill = p.bg ? `background:${p.bg}; padding:${Math.round(subFs * 0.18)}px ${Math.round(subFs * 0.5)}px; border-radius:${Math.round(subFs * 0.28)}px;` : '';
  const subHtml = sub
    ? `<div class="cap-sub" id="${id}-sub">${subSegs.map((g) => `<div class="cap-sub-line">${g.map((w, k) => `<span${k < g.length - 1 && latinJoin(w.text, g[k + 1]!.text) ? ' class="sp"' : ''}>${escapeHtml(w.text)}</span>`).join('')}</div>`).join('')}</div>`
    : '';
  const subAnchor = subStyle?.yPct != null ? `bottom:${n(100 - subStyle.yPct)}%;` : `top:calc(${n(yPct)}% + ${Math.round(fs * 0.2)}px);`;
  const subCss = sub
    ? `\n#${id} .cap-sub { position:absolute; pointer-events:auto; left:${n(subStyle?.xPct ?? xPct)}%; ${subAnchor} transform:translateX(-50%); width:${n(subW)}%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:${Math.round(subFs * 0.15)}px; ${subStyle?.hPct ? `min-height:${n(subStyle.hPct)}%; ` : ''} }
#${id} .cap-sub-line span.sp { margin-right:${Math.round(subFs * 0.12)}px; }\n#${id} .cap-sub-line span { position:relative; top:-0.04em; }\n#${id} .cap-sub-line { display:flex; flex-wrap:nowrap; justify-content:center; align-items:center; gap:${Math.round(subFs * 0.18)}px; width:100%; text-align:center; color:${p.text}; font-family:${presetFontCss(p)}; font-size:${subFs}px; font-weight:${Math.max(500, p.weight - 200)}; line-height:1.35; ${p.italic ? 'font-style:italic; ' : ''}${p.shadow && !p.bg ? 'text-shadow:0 2px 12px rgba(0,0,0,0.85),0 0 3px rgba(0,0,0,0.8); ' : ''}${subPill} }`
    : '';
  const decoCss =
    p.deco === 'highlight'
      ? `#${id} .w .deco { position:absolute; inset:${-fs * 0.08}px ${-fs * 0.12}px; background:${p.decoColor}; border-radius:${Math.round(fs * 0.16)}px; transform:scaleX(0); transform-origin:left center; }`
      : p.deco === 'underline'
        ? `#${id} .w .deco { position:absolute; left:2px; right:2px; bottom:${-fs * 0.14}px; height:${Math.max(3, Math.round(fs * 0.08))}px; background:${p.decoColor}; border-radius:3px; transform:scaleX(0); transform-origin:left center; }`
        : '';
  // .w/.cap-sub-line span 的 top:-0.04em = CJK 光学垂直居中:Noto Sans SC 的 ascent/descent
  // (1.16/0.29em)远大于 line-height,负半行距把基线压低,而 CJK 墨迹不用 descent 区 →
  // 底板里文字偏下 ≈0.07em(像素探针 cap-center-probe.mjs 实测,修正后上下留白 15/16px 持平)
  const css = `
#${id} .cap-root { position:absolute; inset:0; }
#${id} .cap-line { position:absolute; left:${n(xPct)}%; bottom:${n(100 - yPct)}%; transform:translateX(-50%); transform-origin:center bottom; display:flex; flex-wrap:nowrap; align-items:center; gap:${Math.round(fs * 0.18)}px; justify-content:center; width:${n(wPct)}%; pointer-events:auto; ${hPct > 0 ? `min-height:${n(hPct)}%; ` : ''}${pill} }
#${id} .w { position:relative; top:-0.04em; color:${p.text}; font-family:${presetFontCss(p)}; font-size:${fs}px; font-weight:${p.weight}; ${p.italic ? 'font-style:italic;' : ''} line-height:1.2; ${p.shadow && !p.bg ? 'text-shadow:0 2px 12px rgba(0,0,0,0.85),0 0 3px rgba(0,0,0,0.8);' : ''} }
${decoCss}
#${id} .w .t { position:relative; z-index:1; }\n#${id} .w.sp { margin-right:${Math.round(fs * 0.12)}px; }${subCss}`.trim();

  // 段轮播:全部先隐;每段在它首词时间入场,下一段登场时这段熄灭(末段陪块到最后)。
  // 出入场都是硬切(set):淡入+上浮版本两句之间有 0.22s 半透明空窗,播放中体感闪晕(用户报)
  const lines: string[] = [`gsap.set('#${id} .cap-line', { autoAlpha: 0 });`];
  if (sub) lines.push(`tl.set('#${id}-sub', { autoAlpha: 1 }, 0);`);
  segs.forEach((g, si) => {
    const segStart = si === 0 ? 0 : Math.max(0, g[0]!.start - start);
    lines.push(`tl.set('#${id}-s${si}', { autoAlpha: 1 }, ${n(segStart)});`);
    const nxt = segs[si + 1];
    if (nxt) lines.push(`tl.set('#${id}-s${si}', { autoAlpha: 0 }, ${n(Math.max(0, nxt[0]!.start - start))});`);
  });
  if (p.mode === 'emphasis') {
    words.forEach((w, i) => {
      const ws = w.start - start;
      const we = Math.max(w.start - start + 0.15, w.end - start);
      if (p.emphasis) {
        // 当前词变色(karaoke 式:读到亮起,读完还原)
        lines.push(`tl.set('#${id}-w${i} .t', { color:'${p.emphasis}' }, ${n(ws)});`);
        lines.push(`tl.set('#${id}-w${i} .t', { color:'${p.text}' }, ${n(we)});`);
      }
      if (p.deco) {
        lines.push(`tl.fromTo('#${id}-w${i} .deco', { scaleX:0 }, { scaleX:1, duration:0.12, ease:'power3.out' }, ${n(ws)});`);
        lines.push(`tl.to('#${id}-w${i} .deco', { scaleX:0, duration:0.1 }, ${n(we)});`);
      }
    });
  }
  return { innerHtml: `<div class="cap-root">${segHtml}${subHtml}</div>\n<style>${css}</style>`, timelineBody: lines.join('\n') };
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
    // 渐隐:黑场吸到底再吐出(dip to black),切换在最黑那一刻
    return {
      innerHtml: `<div class="tr"></div>\n<style>#${id} .tr{position:absolute;inset:0;background:#000;opacity:0;}</style>`,
      timelineBody: `tl.to('#${id} .tr',{opacity:1,duration:0.25,ease:'power1.in'},0);\ntl.to('#${id} .tr',{opacity:0,duration:0.25,ease:'power1.out'},0.25);`,
    };
  }
  if (effect === 'slide') {
    // 推移:深色面板自下而上推满再继续上推出,切换发生在盖满那一刻
    return {
      innerHtml: `<div class="tr"></div>\n<style>#${id} .tr{position:absolute;inset:0;background:var(--bg,#0a0a0a);transform:translateY(110%);}</style>`,
      timelineBody: `tl.fromTo('#${id} .tr',{yPercent:110},{yPercent:0,duration:0.24,ease:'power2.in'},0);\ntl.to('#${id} .tr',{yPercent:-110,duration:0.26,ease:'power2.out'},0.24);`,
    };
  }
  // wipe(默认):accent 面板从左扫过盖满再扫出,切换发生在盖满那一刻
  return {
    innerHtml: `<div class="tr"></div>\n<style>#${id} .tr{position:absolute;inset:0;background:var(--accent);box-shadow:var(--glow);transform:translateX(-110%);}</style>`,
    timelineBody: `tl.fromTo('#${id} .tr',{xPercent:-110},{xPercent:0,duration:0.22,ease:'power2.in'},0);\ntl.to('#${id} .tr',{xPercent:110,duration:0.24,ease:'power2.out'},0.22);`,
  };
}

/** 素材位:空时占位(仅编辑态可见),填了图/视频则铺满块区(box 由取景空区给)。
 *  视频内嵌一条 <video data-start=块起点 muted>,预览运行时驱动所有 <video> 故自动跟时间轴;
 *  data-start 用块的成片起点,使它从自身 0 起播(B-roll 在该区间内播放)。导出端二路视频同步依赖
 *  Hyperframes CLI 行为(未验证),故 muted 防音轨打架。 */
/** 素材位入/出场预设(对齐 Google Vids Animation 面板的 Object Enter/Exit:Fade/Slide/Rise/Scale)。
 *  入场 from 左/下/小,出场镜像到 右/上/小;'none' 不出 tween。 */
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
    // 圆角交给最外层容器(overflow:hidden 裁),img 自身不设——否则它的自圆角比外层紧,外层调大也被它压住
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
      // 出场钉在块末端往前 d 秒;块太短则挤在后半段
      if (exit && durationSec) {
        const at = Math.max(enter ? d : 0, durationSec - d);
        lines.push(`tl.to('#${id} .hf-media', Object.assign({ duration: ${n(d)}, ease: 'power2.in' }, ${exit}), ${n(at)});`);
      }
    } else {
      lines.push(`tl.from('#${id} .hf-media', { opacity: 0, scale: 0.96, duration: 0.4, ease: 'power2.out' }, 0);`);
    }
    return { innerHtml: inner, timelineBody: lines.join('\n') };
  }
  // 空 → 占位(.hf-ph 默认 display:none,仅 body.hf-editor 显示;样式在 assembleHtml head)
  return {
    innerHtml: `<div class="hf-ph"><div class="hf-ph-plus">+</div><div class="hf-ph-tip">${t('选中后可 AI 生成<br/>或上传图片 / 视频')}</div></div>`,
    timelineBody: '',
  };
}

/* ============================ 注册内置模板 ============================ */

registerTemplate({
  id: 'custom',
  name: '自定义 HTML',
  kind: 'custom',
  defaultTrackIndex: 2,
  slots: { innerHtml: { type: 'text', label: 'HTML' }, timelineBody: { type: 'text', label: 'GSAP 动画体' } },
  render: (slots) => ({ innerHtml: str(slots.innerHtml, '<div></div>'), timelineBody: str(slots.timelineBody) }),
});
registerTemplate({
  id: 'title',
  name: '标题卡',
  kind: 'title',
  defaultTrackIndex: 2,
  slots: { text: { type: 'text', label: '标题', required: true }, sub: { type: 'text', label: '副标题' } },
  render: renderTitle,
});
registerTemplate({
  id: 'stat',
  name: '大数字',
  kind: 'stat',
  defaultTrackIndex: 2,
  slots: { value: { type: 'text', label: '数字', required: true }, label: { type: 'text', label: '说明' } },
  render: renderStat,
});
registerTemplate({
  id: 'list',
  name: '要点列表',
  kind: 'list',
  defaultTrackIndex: 2,
  slots: { title: { type: 'text', label: '小标题' }, items: { type: 'text[]', label: '要点', required: true } },
  render: renderList,
});
registerTemplate({
  id: 'transition',
  name: '转场',
  kind: 'transition',
  defaultTrackIndex: 3, // 最上层,盖住底下切换
  slots: { effect: { type: 'enum', label: '效果', options: ['wipe', 'flash', 'fade', 'slide'] } },
  render: renderTransition,
});
registerTemplate({
  id: 'caption',
  name: '动效字幕',
  kind: 'caption',
  defaultTrackIndex: 1,
  slots: {
    words: { type: 'words', label: '词级时间', required: true },
    effect: { type: 'enum', label: '效果', options: ['kinetic-slam'] },
    sub: { type: 'text', label: '译文副行' },
  },
  render: renderCaption,
});
registerTemplate({
  id: 'media',
  name: '素材位',
  kind: 'media',
  defaultTrackIndex: 2,
  slots: { media: { type: 'image', label: '图片/视频' } },
  render: renderMedia,
});
