import { describe, expect, it } from 'vitest';
import {
  type Composition,
  assembleHtml,
  blockKind,
  blockPreviewDoc,
  captionBlock,
  emptyComposition,
  freeTrack,
  localDisplayTextFontId,
  hasTimelineContent,
  isSentenceCaption,
  placementFramingNotes,
  mediaBlock,
  newBlock,
  renderBlock,
  resolveCaptionStyle,
  shotsFromSentences,
  statBlock,
  titleBlock,
  totalDuration,
  trackCount,
  videoFrameKeyframes,
  videoFrameTimelineBody,
  treatmentVacancyBox,
  shotTransformVars,
  mediaFramingTransformVars,
  resolveShotMediaFraming,
  parseClipInset,
  VOLUME_DB_MIN,
  dbToGain,
  patchShotAudio,
  patchShotFraming,
  shotFadeAt,
  shotsContiguous,
  segmentFadeFn,
  SPLICE_FADE_SEC,
  shotGain,
  shotGainAt,
  type VideoShot,
} from './composition';

function sampleComp(): Composition {
  const c = emptyComposition();
  c.video = { url: 'https://cdn.pireel.com/koudbo.mp4', durationSec: 6 };
  c.shots = [{ id: 'main', srcStart: 0, srcEnd: 6, treatment: 'full' }];
  c.blocks = [
    titleBlock({ text: '标题', startSec: 0, durationSec: 2 }),
    captionBlock({
      words: [
        { text: '前三秒', start: 2, end: 2.6 },
        { text: '定生死', start: 2.6, end: 3.4 },
      ],
      label: '前三秒定生死',
    }),
  ];
  return c;
}

describe('assembleHtml', () => {
  it('拼出 root + video + 块,并注册各块时间轴', () => {
    const html = assembleHtml(sampleComp());
    expect(html).toContain('data-composition-id="root"');
    expect(html).toContain('.comp { position: absolute; font-size: 36px; }');
    expect(html).toContain('<canvas id="vidEl"'); // canvas 渲染模式:视频轨=画布,帧由父层引擎推
    // canvas 模式:源 URL 不再烤进文档(解码在父层引擎),不断言 src
    expect(html).toContain('data-track-index="0"'); // 视频轨
    expect((html.match(/window\.__timelines\[/g) ?? []).length).toBe(3); // 视频 framing + 两块各注册一条
  });

  it('时间轴体经 new Function 隔离:一块的坏脚本不能放倒整个 <script>', () => {
    const c = emptyComposition();
    const bad = newBlock('custom', { startSec: 0, durationSec: 2 });
    bad.slots = { innerHtml: '<div></div>', timelineBody: 'tl.to((' }; // 语法错误
    c.blocks = [bad, titleBlock({ text: '好块', startSec: 0, durationSec: 2 })];
    const html = assembleHtml(c);
    // 坏体以字符串字面量喂 new Function(编译期抛错被 try 圈住),不直接内联成裸代码
    expect(html).toContain(`new Function('tl', ${JSON.stringify('tl.to((')})`);
    expect(html).toContain("catch (e) { console.warn('[hf] timeline error'");
    expect((html.match(/window\.__timelines\[/g) ?? []).length).toBe(2); // 两块都照常注册
  });

  it('生成组件保留创作时长，供拖边后按完整场景时钟重映射', () => {
    const c = emptyComposition();
    const generated = newBlock('custom', { startSec: 1, durationSec: 8 });
    generated.slots = { innerHtml: '<div>Designed</div>', timelineBody: '', authoredDurationSec: 5 };
    c.blocks = [generated];
    const html = assembleHtml(c);
    expect(html).toContain('data-authored-duration="5"');
    expect(html).toContain('data-duration="8"');
  });

  it('palette 派生色注进 #root(覆盖主题默认 accent)', () => {
    const c = emptyComposition();
    c.palette = { accent: 'hsl(10 64% 50%)', line: 'hsl(10 24% 26% / 0.16)' };
    const html = assembleHtml(c);
    expect(html).toContain('--accent: hsl(10 64% 50%);');
    expect(html).not.toContain('--accent: #d8472f;'); // 默认被派生替换
  });

  it('block.box → 块定位到子区域(left/top/width/height%)', () => {
    const c = emptyComposition();
    const b = titleBlock({ text: '图', startSec: 0, durationSec: 2 });
    b.box = { x: 0.55, y: 0.1, w: 0.4, h: 0.5 };
    c.blocks = [b];
    const html = assembleHtml(c);
    expect(html).toContain('left:55%');
    expect(html).toContain('top:10%');
    expect(html).toContain('width:40%');
    expect(html).toContain('height:50%');
  });

  it('原生花字预设渲染确定性的样式与命名动画，不生成 custom HTML block', () => {
    const c = emptyComposition();
    const b = titleBlock({
      text: '普通人的奥德赛', startSec: 0, durationSec: 3,
      preset: 'editorial', animation: 'wordReveal', color: '#F7F1E8', accentColor: '#D8A84E',
    });
    c.blocks = [b];
    const html = assembleHtml(c);
    expect(b.templateId).toBe('title');
    expect(html).toContain('preset-editorial');
    expect(html).toContain('--display-fg:#F7F1E8');
    expect(html).toContain(`tl.from('#${b.id} .t-unit'`);
  });

  it('原生花字默认白色并使用导出安全的可选字体', () => {
    const c = emptyComposition();
    const b = titleBlock({
      text: '白色标题', startSec: 0, durationSec: 2,
      preset: 'clean', fontFamily: 'mono',
    });
    c.blocks = [b];
    const html = assembleHtml(c);
    expect(html).toContain('--display-fg:#FFFFFF');
    expect(html).toContain('font-family:"IBM Plex Mono","Noto Sans SC",ui-monospace,monospace');
  });

  it('原生花字安全编码并渲染用户系统字体族', () => {
    const c = emptyComposition();
    const fontFamily = localDisplayTextFontId('PingFang SC');
    expect(fontFamily).toBe('local:PingFang%20SC');
    c.blocks = [titleBlock({
      text: '系统字体', startSec: 0, durationSec: 2,
      preset: 'clean', fontFamily: fontFamily!,
    })];
    expect(assembleHtml(c)).toContain('font-family:"PingFang SC",sans-serif');
  });

  it('荧光和标签花字使用用户选择的文字色而不是固定反色', () => {
    const c = emptyComposition();
    c.blocks = [titleBlock({
      text: '彩色文字', startSec: 0, durationSec: 2,
      preset: 'marker', color: '#91C8FF', accentColor: '#FFD24D',
    })];
    const html = assembleHtml(c);
    expect(html).toContain('--display-fg:#91C8FF');
    expect(html).toContain('.preset-marker .t-unit{padding:.03em .09em');
    expect(html).toContain('color:var(--display-fg);text-shadow:none');
    expect(html).not.toContain('color:var(--bg,#0a0a0a)');
  });

  it('块按 trackIndex 排 z 序:低轨块后插入仍渲染在高轨块之前(DOM 顺序=叠层);同轨保持原顺序', () => {
    const c = emptyComposition();
    const hi = titleBlock({ text: '高轨', startSec: 0, durationSec: 2, trackIndex: 3 });
    const lo = titleBlock({ text: '低轨', startSec: 0, durationSec: 2, trackIndex: 1 });
    const midA = titleBlock({ text: '同轨A', startSec: 0, durationSec: 2, trackIndex: 2 });
    const midB = titleBlock({ text: '同轨B', startSec: 0, durationSec: 2, trackIndex: 2 });
    c.blocks = [hi, midA, midB, lo]; // 低轨块最后插入
    const html = assembleHtml(c);
    const at = (id: string) => html.indexOf(`id="${id}"`);
    expect(at(lo.id)).toBeGreaterThan(-1);
    expect(at(lo.id)).toBeLessThan(at(midA.id)); // 轨1 在轨2 之下
    expect(at(midA.id)).toBeLessThan(at(midB.id)); // 同轨稳定,保持插入顺序
    expect(at(midB.id)).toBeLessThan(at(hi.id)); // 轨2 在轨3 之下
  });

  it('block.bg → token 族覆写(墨色按亮度翻转);有卡面的 custom 块只换 token 不叠涂容器;box 块带圆角;缺省不出 background', () => {
    const c = emptyComposition();
    const boxed = titleBlock({ text: '有底板', startSec: 0, durationSec: 2 });
    boxed.box = { x: 0.1, y: 0.1, w: 0.5, h: 0.3 };
    boxed.bg = '#101114';
    const full = titleBlock({ text: '满画布底板', startSec: 0, durationSec: 2 });
    full.bg = 'rgb(255 255 255)';
    const plain = titleBlock({ text: '无底板', startSec: 0, durationSec: 2 });
    // custom 块自带 var(--panel) 卡面:bg 只做 token 覆盖,容器不叠涂(整框+卡面双色重叠的来源)
    const surf: (typeof c.blocks)[number] = {
      id: 'surf1',
      templateId: 'custom',
      slots: { innerHtml: '<div class="w"><div class="card">卡</div></div><style>#surf1 .card{background:var(--panel);}</style>', timelineBody: '' },
      startSec: 0,
      durationSec: 2,
      trackIndex: 2,
      box: { x: 0.1, y: 0.5, w: 0.5, h: 0.3 },
      bg: '#f5f3ee',
    };
    c.blocks = [boxed, full, plain, surf];
    const html = assembleHtml(c);
    // 深色 bg(title 块无卡面):token 覆写 + 墨色翻成浅墨族 + 容器垫实底
    expect(html).toContain('--panel:#101114;--paper:#101114;--fg:#f5f6f8;');
    expect(html).toMatch(/--panel:#101114;[^"]*background:#101114;/);
    const boxedDiv = html.slice(html.indexOf(`id="${boxed.id}"`), html.indexOf(`id="${boxed.id}"`) + 500);
    expect(boxedDiv.slice(0, boxedDiv.indexOf('>'))).toContain('overflow:hidden;border-radius:var(--radius,24px);');
    expect(boxedDiv).toContain('data-hf-content');
    // 非 hex 色(亮度解析不了):不翻墨,行为同旧——token+容器垫底
    expect(html).toContain('--panel:rgb(255 255 255);--paper:rgb(255 255 255);background:rgb(255 255 255);');
    const plainDiv = html.slice(html.indexOf(`id="${plain.id}"`), html.indexOf(`id="${plain.id}"`) + 400);
    expect(plainDiv.slice(0, plainDiv.indexOf('>'))).not.toContain('background');
    // 浅色 bg + 卡面:深墨族,且内容层**没有** background(卡面经 --panel 自己换色)
    const surfDiv = html.slice(html.indexOf(`id="surf1"`), html.indexOf(`id="surf1"`) + 600);
    expect(surfDiv).toContain('--panel:#f5f3ee;--paper:#f5f3ee;--fg:#15171c;');
    expect(surfDiv).not.toContain('background:#f5f3ee');
  });

  it('block.contentBox → 内容层按窗口相对坐标锚定画布(裁切不重排);未裁切时内容层平铺 100%', () => {
    const c = emptyComposition();
    const cropped = titleBlock({ text: '裁切', startSec: 0, durationSec: 2 });
    cropped.box = { x: 0.2, y: 0.2, w: 0.3, h: 0.2 }; // 窗口:左边已被裁掉 0.1
    cropped.contentBox = { x: 0.1, y: 0.2, w: 0.4, h: 0.2 }; // 内容锚 = 裁切前的 box
    const plain = titleBlock({ text: '未裁切', startSec: 0, durationSec: 2 });
    plain.box = { x: 0.1, y: 0.1, w: 0.5, h: 0.3 };
    c.blocks = [cropped, plain];
    const html = assembleHtml(c);
    const cd = html.slice(html.indexOf(`id="${cropped.id}"`), html.indexOf(`id="${cropped.id}"`) + 600);
    // rel = (contentBox - box) / box:left=(0.1-0.2)/0.3≈-33.333%,width=0.4/0.3≈133.333%
    expect(cd).toContain('data-hf-content style="position:absolute;left:-33.333%;top:0%;width:133.333%;height:100%;');
    const pd = html.slice(html.indexOf(`id="${plain.id}"`), html.indexOf(`id="${plain.id}"`) + 600);
    expect(pd).toContain('data-hf-content style="position:absolute;left:0%;top:0%;width:100%;height:100%;');
  });

  it('block.border / block.opacity → 容器描边(box 块带圆角)与整体透明度;≈1 的透明度不输出', () => {
    const c = emptyComposition();
    const b = titleBlock({ text: '描边半透明', startSec: 0, durationSec: 2 });
    b.box = { x: 0.1, y: 0.1, w: 0.5, h: 0.3 };
    b.border = '#3f4be8';
    b.opacity = 0.6;
    const solid = titleBlock({ text: '不透明', startSec: 0, durationSec: 2 });
    solid.opacity = 1;
    c.blocks = [b, solid];
    const html = assembleHtml(c);
    expect(html).toContain('border:3px solid #3f4be8;border-radius:var(--radius,24px);');
    expect(html).toContain('opacity:0.6;');
    const solidDiv = html.slice(html.indexOf(`id="${solid.id}"`), html.indexOf(`id="${solid.id}"`) + 400);
    expect(solidDiv.slice(0, solidDiv.indexOf('>'))).not.toContain('opacity');
  });

  it('block.box → 容器带 data-hf-box 可拖标记;无 box 不带', () => {
    const c = emptyComposition();
    const boxed = titleBlock({ text: '可拖', startSec: 0, durationSec: 2 });
    boxed.box = { x: 0.1, y: 0.1, w: 0.5, h: 0.3 };
    const free = titleBlock({ text: '满画布', startSec: 0, durationSec: 2 });
    c.blocks = [boxed, free];
    const html = assembleHtml(c);
    expect(html).toContain(`id="${boxed.id}" data-composition-id="${boxed.id}" data-hf-box="1"`);
    expect(html).not.toContain(`id="${free.id}" data-composition-id="${free.id}" data-hf-box`);
  });

  it('转义块文本', () => {
    const c = emptyComposition();
    c.blocks = [titleBlock({ text: '<script>x</script>', startSec: 0, durationSec: 1 })];
    const html = assembleHtml(c);
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('全局花字样式 captionStyle', () => {
  const words = [
    { text: '前三秒', start: 2, end: 2.6 },
    { text: '定生死', start: 2.6, end: 3.4 },
  ];

  it('assembleHtml:渲染时覆盖句级花字的预设/yPct/scale,块自身 slots 不动', () => {
    const c = emptyComposition();
    const cap = captionBlock({ words });
    c.blocks = [cap];
    c.captionStyle = { preset: 'em-purple-black', yPct: 60, scale: 1.5 };
    const html = assembleHtml(c);
    expect(html).toContain('bottom:40%'); // 100 - yPct
    // scale=字号系数(不是区域 transform):全局基准 48px × 1.5 = 72px(字号不随预设——预设只管颜色/动效)
    expect(html).toContain('font-size:72px');
    expect(html).not.toContain('scale(1.5)');
    expect(html).toContain('#cf96ff'); // 预设的强调色进了逐词变色时间轴
    expect(html).not.toContain('scaleX:1'); // 旧 highlight 的扫光动画没了 → 真走了预设通道
    expect(cap.slots.preset).toBeUndefined(); // 全局样式不落进块
  });

  it('框高 hPct:落到 .cap-line 的 min-height(底板跟框走,字号不动)', () => {
    const c = emptyComposition();
    c.blocks = [captionBlock({ words })];
    c.captionStyle = { preset: 'ln-black', yPct: 88, scale: 1, hPct: 22 };
    const html = assembleHtml(c);
    expect(html).toContain('min-height:22%');
    expect(html).toContain('align-items:center'); // 文字在框内垂直居中
    // 不设 hPct 则不出 min-height
    c.captionStyle = { preset: 'ln-black', yPct: 88, scale: 1 };
    expect(assembleHtml(c)).not.toContain('min-height:');
  });

  it('主字幕覆盖项:文字色/底板色改渲染,bg:null 强制无底(预设默认有底)', () => {
    const c = emptyComposition();
    c.blocks = [captionBlock({ words })];
    c.captionStyle = { preset: 'ln-black', yPct: 88, scale: 1, color: '#12FF34', bg: '#445566' };
    let html = assembleHtml(c);
    expect(html).toContain('color:#12FF34'); // 文字色覆盖
    expect(html).toContain('background:#445566'); // 底板色覆盖
    c.captionStyle = { preset: 'ln-black', yPct: 88, scale: 1, bg: null };
    html = assembleHtml(c);
    expect(html).toContain('.cap-line { position:absolute'); // 保护:选择器仍在(下一断言才有意义)
    expect(/#cap_[^{]*\.cap-line[^}]*background:/.test(html)).toBe(false); // 无底:主行不再渲染底板
    // 老数据(无覆盖字段)完全走预设——向后兼容
    c.captionStyle = { preset: 'ln-black', yPct: 88, scale: 1 };
    expect(assembleHtml(c)).toContain('background:'); // ln-black 预设自带底板
  });

  it('译文行状态门控:sub.lang 未设时 slots.sub 休眠不渲染,设了才出 .cap-sub', () => {
    const c = emptyComposition();
    c.blocks = [captionBlock({ words, sub: 'Hidden until lang' })];
    c.captionStyle = { preset: 'ln-black', yPct: 88, scale: 1 }; // 无 sub.lang:状态关
    expect(assembleHtml(c)).not.toContain('cap-sub');
    c.captionStyle = { preset: 'ln-black', yPct: 88, scale: 1, sub: { lang: 'English' } };
    expect(assembleHtml(c)).toContain('cap-sub'); // 状态开才渲染
  });

  it('副字幕独立样式:subPreset/subColor 只改译文行,主行不动', () => {
    const c = emptyComposition();
    c.blocks = [captionBlock({ words, sub: 'Hello there' })];
    c.captionStyle = { preset: 'ln-black', yPct: 88, scale: 1, sub: { preset: 'ln-clean', color: '#ABCDEF', lang: 'English' } };
    const html = assembleHtml(c);
    const subCss = html.slice(html.indexOf('.cap-sub-line {'));
    expect(subCss).toContain('color:#ABCDEF'); // 译文行文字色覆盖
    const mainCss = html.slice(html.indexOf(' .w {'), html.indexOf('.cap-sub'));
    expect(mainCss).not.toContain('#ABCDEF'); // 主行不受影响
  });

  it('带 box 的花字(关键词重击等独立定位组件)不吃全局样式', () => {
    const c = emptyComposition();
    const kw = captionBlock({ effect: 'kinetic-slam', words, trackIndex: 2 });
    kw.box = { x: 0.1, y: 0.18, w: 0.8, h: 0.34 };
    c.blocks = [kw];
    c.captionStyle = { preset: 'ln-clean', yPct: 93, scale: 1 };
    expect(isSentenceCaption(kw)).toBe(false);
    const html = assembleHtml(c);
    expect(html).toContain('font-size:150px'); // 仍是 slam 的大字,没被全局预设覆盖
  });

  it('整句字幕预设(line 模式)无逐词动画,整句硬切出入', () => {
    const c = emptyComposition();
    c.blocks = [captionBlock({ words })];
    c.captionStyle = { preset: 'ln-yellow', yPct: 93, scale: 1 };
    const html = assembleHtml(c);
    expect(html).toContain('rgba(255,227,79,0.85)'); // 黄条底板(默认带透明度)
    expect(html).not.toContain("-w0 .t'"); // 无逐词变色
    expect(html).toMatch(/-s0', \{ autoAlpha: 1/); // 整句 set 硬切入场(淡入+上浮版闪晕已废)
    expect(html).not.toContain("y:'0.3em'"); // 不再有上浮入场
  });

  it('长句渲染期实时拆段:多段 .cap-line 按词时间轮播,块仍是一个', () => {
    const c = emptyComposition();
    const many = Array.from({ length: 30 }, (_, i) => ({ text: '字', start: i * 0.3, end: i * 0.3 + 0.3 }));
    c.blocks = [captionBlock({ words: many })];
    c.captionStyle = { preset: 'ln-clean', yPct: 93, scale: 1 };
    const html = assembleHtml(c);
    expect(html).toContain('-s0"'); // 至少两段
    expect(html).toContain('-s1"');
    expect(html).toMatch(/gsap\.set\('#[^']* \.cap-line', \{ autoAlpha: 0 \}\);/); // 全段先隐
    expect(html).toMatch(/tl\.set\('#[^']*-s0', \{ autoAlpha: 0 \}, /); // 下一段登场时前段熄灭
  });

  it('resolveCaptionStyle:显式设置优先,否则从第一个句级花字推,再否则默认;xPct/wPct 缺省补齐', () => {
    const c = emptyComposition();
    expect(resolveCaptionStyle(c)).toEqual({ preset: 'em-yellow', yPct: 88, xPct: 50, wPct: 56, scale: 1 });
    c.blocks = [captionBlock({ words, preset: 'ln-clean', yPct: 93 })];
    expect(resolveCaptionStyle(c)).toEqual({ preset: 'ln-clean', yPct: 93, xPct: 50, wPct: 56, scale: 1 });
    c.captionStyle = { preset: 'em-pink', yPct: 60, scale: 0.8 };
    expect(resolveCaptionStyle(c)).toEqual({ preset: 'em-pink', yPct: 60, xPct: 50, wPct: 56, scale: 0.8 });
    c.captionStyle = { preset: 'em-pink', yPct: 60, xPct: 30, wPct: 40, scale: 0.8 };
    expect(resolveCaptionStyle(c).xPct).toBe(30);
    expect(resolveCaptionStyle(c).wPct).toBe(40);
  });

  it('blockPreviewDoc 透传全局样式:时间轴小卡与正片同款', () => {
    const c = emptyComposition();
    const cap = captionBlock({ words });
    c.blocks = [cap];
    c.captionStyle = { preset: 'em-yellow', yPct: 60, scale: 1 };
    expect(blockPreviewDoc(c, cap)).toContain('bottom:40%');
  });
});

describe('captionBlock(句级字幕)', () => {
  it('起点=首词,时长>0,选择器作用域到块 id', () => {
    const b = captionBlock({ words: [{ text: 'a', start: 3, end: 3.5 }], label: 'a' });
    expect(b.startSec).toBe(3);
    expect(b.durationSec).toBeGreaterThan(0);
    expect(blockKind(b)).toBe('caption');
    const r = renderBlock(b);
    expect(r.innerHtml).toContain(`#${b.id}`);
    expect(r.timelineBody).toContain(`#${b.id}`);
  });
});

describe('newBlock(templateId)', () => {
  it('按 slot schema 填占位 + 放模板默认轨 + 可渲染', () => {
    const stat = newBlock('stat', { startSec: 4 });
    expect(blockKind(stat)).toBe('stat');
    expect(stat.startSec).toBe(4);
    expect(stat.trackIndex).toBe(2); // stat 默认轨
    expect(typeof stat.slots.value).toBe('string'); // text 槽有占位
    expect(renderBlock(stat).innerHtml).toContain(`#${stat.id}`); // 选择器作用域到块

    const list = newBlock('list', { startSec: 0 });
    expect(Array.isArray(list.slots.items)).toBe(true); // text[] 槽给了示例数组

    const cap = newBlock('caption', { startSec: 2 });
    expect(blockKind(cap)).toBe('caption');
    expect(cap.trackIndex).toBe(1); // caption 默认轨
    expect(Array.isArray(cap.slots.words)).toBe(true); // words 槽给了示例词
  });
});

describe('视频分镜片段 shots', () => {
  it('shotsFromSentences:首段从 0 起 + 0.1s 去重 + 覆盖到视频末', () => {
    const shots = shotsFromSentences([{ start: 2 }, { start: 2.04 }, { start: 5.5 }], 8);
    // 切点 0/2/5.5 → 片段 [0,2)[2,5.5)[5.5,8)
    expect(shots.map((s) => [s.srcStart, s.srcEnd])).toEqual([
      [0, 2],
      [2, 5.5],
      [5.5, 8],
    ]);
    expect(shots.every((s) => s.treatment === 'full')).toBe(true);
  });

  it('shotsFromSentences:切点越过视频末端时夹取,editedDuration 不超视频时长', () => {
    // ASR 句子起点常落在容器时长之外几百毫秒
    const shots = shotsFromSentences([{ start: 0 }, { start: 5 }, { start: 61 }], 60);
    expect(shots.map((s) => [s.srcStart, s.srcEnd])).toEqual([
      [0, 5],
      [5, 60],
    ]);
    expect(shots.every((s) => s.srcEnd <= 60)).toBe(true);
  });

  it('videoFrameTimelineBody:首片 set,之后每段按成片起点一条过渡', () => {
    const body = videoFrameTimelineBody([
      { id: 'a', srcStart: 0, srcEnd: 3, treatment: 'full' },
      { id: 'b', srcStart: 3, srcEnd: 6, treatment: 'corner-br' },
    ]);
    expect(body).toContain("tl.set('#vidEl'");
    expect(body).toContain("tl.to('#vidEl'");
    expect(body).toContain('3'); // 第二段成片起点
  });

  it('videoFrameTimelineBody:「取景只要前一段」= 剪开表达(前段 punch-in + 后段 full)', () => {
    // 一镜=一取景:剪成 [0,2) punch-in + [2,6) full,在成片 2s 处回全屏(scale:1)
    const body = videoFrameTimelineBody([
      { id: 'a', srcStart: 0, srcEnd: 2, treatment: 'punch-in' },
      { id: 'b', srcStart: 2, srcEnd: 6, treatment: 'full' },
    ]);
    expect(body).toContain("tl.set('#vidEl'");
    expect(body).toContain('scale: 1.22'); // punch-in 起手
    expect(body).toMatch(/scale: 1[,}].*2\)/s); // 在 t=2 回全屏(scale:1)
  });

  it('videoFrameTimelineBody:短暂中间镜也如实执行(设了就执行,渲染层不做最短停留合并)', () => {
    // [0,5.8) punch-in + [5.8,6) full(0.2s)+ [6,10) corner-br:三个状态全部进时间轴
    const body = videoFrameTimelineBody([
      { id: 'a', srcStart: 0, srcEnd: 5.8, treatment: 'punch-in' },
      { id: 'b', srcStart: 5.8, srcEnd: 6, treatment: 'full' },
      { id: 'c', srcStart: 6, srcEnd: 10, treatment: 'corner-br' },
    ]);
    const calls: Array<{ m: string; vars: Record<string, number>; at: number }> = [];
    const tl = {
      set: (_sel: string, vars: Record<string, number>, at: number) => calls.push({ m: 'set', vars, at }),
      to: (_sel: string, vars: Record<string, number>, at: number) => calls.push({ m: 'to', vars, at }),
    };
    new Function('tl', body)(tl);
    const midFull = calls.find((c) => c.m === 'to' && Math.abs(c.at - 5.8) < 1e-6);
    expect(midFull).toBeTruthy(); // 短暂 full 也执行
    expect(midFull!.vars.scale).toBeCloseTo(1, 6);
    const boundary = calls.find((c) => c.m === 'to' && Math.abs(c.at - 6) < 1e-6);
    expect(boundary).toBeTruthy();
    expect(boundary!.vars.scale).toBeCloseTo(0.34, 6); // corner-br
  });

  it('videoFrameTimelineBody:碎镜取景(<1s)也照常执行 —— 设了就执行,渲染层没有最短停留合并', () => {
    // 自动编排应克制不足 1s 的取景闪烁，但用户的显式精确编辑按原样执行。
    const body = videoFrameTimelineBody([
      { id: 'a', srcStart: 0, srcEnd: 5, treatment: 'full' },
      { id: 'b', srcStart: 5, srcEnd: 5.8, treatment: 'corner-br' }, // 0.8s 碎镜
      { id: 'c', srcStart: 5.8, srcEnd: 10, treatment: 'full' },
    ]);
    expect(body).toContain('scale: 0.34'); // corner-br 照常进时间轴
  });

  it('videoFrameKeyframes:相邻同取景碎段去重成一个状态 —— 分割不产生冗余关键帧,取景不丢', () => {
    // punch-in 被分割成 3 个 0.6s 碎段:合并为一个状态,起点=首段起点
    const keys = videoFrameKeyframes([
      { id: 'a', srcStart: 0, srcEnd: 2, treatment: 'full' },
      { id: 'b1', srcStart: 2, srcEnd: 2.6, treatment: 'punch-in' },
      { id: 'b2', srcStart: 2.6, srcEnd: 3.2, treatment: 'punch-in' },
      { id: 'b3', srcStart: 3.2, srcEnd: 3.8, treatment: 'punch-in' },
      { id: 'c', srcStart: 3.8, srcEnd: 8, treatment: 'full' },
    ]);
    expect(keys.map((k) => k.tr)).toEqual(['full', 'punch-in', 'full']);
    expect(keys[1]!.at).toBeCloseTo(2, 6);
    expect(keys[2]!.at).toBeCloseTo(3.8, 6);
  });

  it('videoFrameKeyframes:孤立碎镜(<1s)也保留 —— 用户手动设的取景设了就执行', () => {
    const keys = videoFrameKeyframes([
      { id: 'a', srcStart: 0, srcEnd: 5, treatment: 'full' },
      { id: 'b1', srcStart: 5, srcEnd: 5.4, treatment: 'corner-br' },
      { id: 'b2', srcStart: 5.4, srcEnd: 5.8, treatment: 'corner-br' },
      { id: 'c', srcStart: 5.8, srcEnd: 10, treatment: 'full' },
    ]);
    expect(keys.map((k) => k.tr)).toEqual(['full', 'corner-br', 'full']);
  });

  it('videoFrameTimelineBody:取景恒整镜 → 单镜 punch-in 不出现回全屏帧', () => {
    const body = videoFrameTimelineBody([{ id: 'a', srcStart: 0, srcEnd: 6, treatment: 'punch-in' }]);
    expect(body).toContain('scale: 1.22');
    expect(body).not.toContain('scale: 1,'); // 整镜取景,没有中途回 full
  });

  describe('media 素材位块', () => {
    it('空块 → 渲染 .hf-ph 占位,不出 img/video', () => {
      const b = mediaBlock({ startSec: 1, durationSec: 3, box: { x: 0.5, y: 0.1, w: 0.4, h: 0.8 } });
      expect(b.templateId).toBe('media');
      expect(b.box).toEqual({ x: 0.5, y: 0.1, w: 0.4, h: 0.8 });
      const { innerHtml } = renderBlock(b);
      expect(innerHtml).toContain('hf-ph');
      expect(innerHtml).not.toContain('<img');
      expect(innerHtml).not.toContain('<video');
    });

    it('填图片 → <img cover>,无占位', () => {
      const b = { ...mediaBlock({ startSec: 0, durationSec: 2 }), slots: { media: { type: 'image', url: 'https://cdn.pireel.com/p.png' } } };
      const { innerHtml } = renderBlock(b);
      expect(innerHtml).toContain('<img');
      expect(innerHtml).toContain('https://cdn.pireel.com/p.png');
      expect(innerHtml).not.toContain('hf-ph');
    });

    it('填视频 → <video muted> 且 data-start=块起点(自身 0 起播)', () => {
      const b = { ...mediaBlock({ startSec: 4.5, durationSec: 2 }), slots: { media: { type: 'video', url: 'https://cdn.pireel.com/v.mp4' } } };
      const { innerHtml } = renderBlock(b);
      expect(innerHtml).toContain('<video');
      expect(innerHtml).toContain('muted');
      expect(innerHtml).toContain('data-start="4.5"');
    });

    it('占位 CSS 默认 display:none,仅 body.hf-editor 显示(导出干净)', () => {
      const c = emptyComposition();
      c.blocks = [mediaBlock({ startSec: 0, durationSec: 2 })];
      const html = assembleHtml(c);
      expect(html).toMatch(/\.hf-ph\s*\{[^}]*display:\s*none/);
      expect(html).toMatch(/body\.hf-editor\s+\.hf-ph\s*\{\s*display:\s*flex/);
    });
  });

  it('treatmentVacancyBox:缩角/半切给出另一半空区,full/放大无空区', () => {
    expect(treatmentVacancyBox('full')).toBeNull();
    expect(treatmentVacancyBox('punch-in')).toBeNull();
    // 缩右下 → 空区在上半(y 小);缩左上 → 空区在下半(y 大)
    expect(treatmentVacancyBox('corner-br')!.y).toBeLessThan(treatmentVacancyBox('corner-tl')!.y);
    // 视频占左半 → 空区在右(x>0.5);占右半 → 空区在左(x<0.5)
    expect(treatmentVacancyBox('split-l')!.x).toBeGreaterThan(0.5);
    expect(treatmentVacancyBox('split-r')!.x).toBeLessThan(0.5);
  });

  it('videoFrameTimelineBody:半分铺满半区(不缩小),靠裁切占位', () => {
    const body = videoFrameTimelineBody([{ id: 'a', srcStart: 0, srcEnd: 4, treatment: 'split-l' }]);
    // 铺满 = 不缩放,画面裁掉另一半;缺省居中取,所以左半显示的是源的中段
    expect(body).toContain('scale: 1');
    expect(body).toContain('xPercent: -25');
    expect(body).toContain("clipPath: 'inset(0% 25% 0% 25%)'"); // 保留源的中段
  });

  it('videoFrameTimelineBody:裁切位置改的是保留哪一段,不改占位', () => {
    const left = videoFrameTimelineBody([{ id: 'a', srcStart: 0, srcEnd: 4, treatment: 'split-l', treatCrop: 0 }]);
    const right = videoFrameTimelineBody([{ id: 'a', srcStart: 0, srcEnd: 4, treatment: 'split-l', treatCrop: 100 }]);
    expect(left).toContain('xPercent: 0'); // 保留最左边一段
    expect(left).toContain("clipPath: 'inset(0% 50% 0% 0%)'");
    expect(right).toContain('xPercent: -50'); // 保留最右边一段
    expect(right).toContain("clipPath: 'inset(0% 0% 0% 50%)'");
  });

  it('videoFrameTimelineBody:生成的是合法可执行 GSAP,调用时序正确', () => {
    // 不只比对字符串——把生成体当真 JS 跑(mock tl),验证语法合法 + set/to 的时间位置正确
    const body = videoFrameTimelineBody([
      { id: 'a', srcStart: 0, srcEnd: 2, treatment: 'punch-in' }, // 成片 [0,2)
      { id: 'a2', srcStart: 2, srcEnd: 6, treatment: 'full' }, // 成片 [2,6),t=2 回全屏
      { id: 'b', srcStart: 6, srcEnd: 10, treatment: 'corner-br' }, // 成片 [6,10),与前段不同取景 → 边界补 tween
    ]);
    const calls: Array<{ m: string; vars: Record<string, number>; at: number }> = [];
    const tl = {
      set: (_sel: string, vars: Record<string, number>, at: number) => calls.push({ m: 'set', vars, at }),
      to: (_sel: string, vars: Record<string, number>, at: number) => calls.push({ m: 'to', vars, at }),
    };
    // new Function 解析失败=生成了坏 JS,这里就会抛
    new Function('tl', body)(tl);
    // 首片 set 在 0,punch-in
    expect(calls[0]).toMatchObject({ m: 'set', at: 0 });
    expect(calls[0]!.vars.scale).toBeCloseTo(1.22, 2);
    // t=2 回全屏(scale 1)
    const release = calls.find((c) => c.m === 'to' && Math.abs(c.at - 2) < 1e-6);
    expect(release).toBeTruthy();
    expect(release!.vars.scale).toBe(1);
    // 第二段(corner-br,与前段不同)在边界 6 接管 —— 取景变化才补 tween(连续同取景不补)
    expect(calls.some((c) => c.m === 'to' && Math.abs(c.at - 6) < 1e-6)).toBe(true);
  });

  it('assembleHtml:有 shots 时注册取景时间轴 + 嵌入 __segments', () => {
    const c = emptyComposition();
    c.video = { url: 'https://cdn.pireel.com/k.mp4', durationSec: 8 };
    c.shots = shotsFromSentences([{ start: 0 }, { start: 4 }], 8);
    const html = assembleHtml(c);
    expect(html).toContain('id="vidEl"');
    expect(html).toContain('window.__timelines["vid"]');
    expect(html).toContain('__parentClock'); // 段表/时钟归父层引擎,文档只收帧(hf:frame)
  });

  it('assembleHtml:原生媒体拥有唯一画面底层，iframe 与 HTML root 保持透明', () => {
    const c = emptyComposition();
    c.video = { url: 'https://cdn.pireel.com/k.mp4', durationSec: 8 };
    c.shots = shotsFromSentences([{ start: 0 }], 8);
    const html = assembleHtml(c);
    expect(html).toMatch(/html, body \{[^}]*background: transparent;/);
    expect(html).toMatch(/#root \{[^}]*background: transparent;/);
    expect(html).not.toContain('box-shadow:0 30px 90px');
  });

  it('assembleHtml:只有图形元素时仍使用视频画布的黑色底，不回退到主题纸色', () => {
    const c = emptyComposition();
    c.blocks = [titleBlock({ text: '图形元素', startSec: 0, durationSec: 2 })];
    const html = assembleHtml(c);
    expect(html).toMatch(/html, body \{[^}]*background: #000000;/);
    expect(html).toMatch(/#root \{[^}]*background: #000000;/);
  });

  it('assembleHtml:成片时长=Σ片段(被剪区间不计入);data-duration', () => {
    const c = emptyComposition();
    c.video = { url: 'https://cdn.pireel.com/k.mp4', durationSec: 20 };
    c.shots = [
      { id: 'a', srcStart: 0, srcEnd: 4, treatment: 'full' }, // 成片 [0,4)
      { id: 'b', srcStart: 10, srcEnd: 12, treatment: 'full' }, // 源中段被剪 → 成片 [4,6)
    ];
    const html = assembleHtml(c);
    expect(html).toMatch(/id="vidEl"[^>]*data-duration="6"/);
  });

  it('assembleHtml:分镜边界不注入任何转场叠层(跳切,视觉变化归取景)', () => {
    const c = emptyComposition();
    c.video = { url: 'https://cdn.pireel.com/k.mp4', durationSec: 9 };
    c.shots = [
      { id: 's0', srcStart: 0, srcEnd: 3, treatment: 'full' },
      { id: 's1', srcStart: 3, srcEnd: 6, treatment: 'full' },
      { id: 's2', srcStart: 6, srcEnd: 9, treatment: 'full' },
    ];
    const html = assembleHtml(c);
    expect(html).not.toContain('shottr_');
  });
});

describe('blockPreviewDoc(单块 hover 预览)', () => {
  it('单块归一到 0 起点 + 无视频 + 跑到中段定格', () => {
    const c = sampleComp();
    const blk = statBlock({ value: '87%', label: '完播率', startSec: 5, durationSec: 2 });
    const doc = blockPreviewDoc(c, blk);
    expect(doc).toContain(blk.id); // 含该块
    expect(doc).not.toContain('id="vidEl"'); // 不带视频
    expect(doc).toContain('87%');
    expect(doc).toMatch(/data-start="0"/); // 归一到 0 起点
    // 定格时刻在 head 声明(运行时据此对齐后才揭示块,首帧即稳定帧):块 2s → 取 max(1.0, 2*0.85)=1.7
    expect(doc).toMatch(/window\.__hfBootT=1\.7/);
  });
});

describe('totalDuration / trackCount', () => {
  it('总时长取视频、块与音频末端最大', () => {
    expect(totalDuration(sampleComp())).toBeCloseTo(6);
    const audioOnly = emptyComposition();
    audioOnly.audioTracks = [{ id: 'music', src: 'music.mp3', durationSec: 8, startSec: 2, inSec: 1, outSec: 7, speed: 2 }];
    expect(totalDuration(audioOnly)).toBeCloseTo(5); // 2 + (7 - 1) / 2
    const unresolvedAudio = emptyComposition();
    unresolvedAudio.audioTracks = [{ id: 'remote', src: 'https://example.com/audio.mp3' }];
    expect(hasTimelineContent(unresolvedAudio)).toBe(true); // 字节尚未恢复时也不能丢草稿
  });
  it('空项目也保留视频主轨结构', () => {
    expect(trackCount(emptyComposition())).toBe(1);
    // 视频轨0 + caption轨1 + title轨2 = 3
    expect(trackCount(sampleComp())).toBe(3);
  });
  it('显式空 shots 不会因素材库仍有 main video 而复活主轨', () => {
    const c = emptyComposition();
    c.video = { url: 'blob:available-in-library', durationSec: 12 };
    expect(totalDuration(c)).toBeCloseTo(0.1);
    expect(assembleHtml(c)).not.toContain('id="vidEl"');

    const legacy = { ...c, shots: undefined };
    expect(totalDuration(legacy)).toBeCloseTo(12);
    expect(assembleHtml(legacy)).toContain('id="vidEl"');
  });
});

describe('freeTrack(插入时自动找空轨)', () => {
  const blk = (trackIndex: number, startSec: number, durationSec: number) =>
    ({ ...mediaBlock({ startSec, durationSec }), trackIndex });
  it('空表 → 给首选轨', () => {
    expect(freeTrack([], 0, 3)).toBe(2);
  });
  it('首选轨该窗被占 → 向上找到第一条空轨', () => {
    expect(freeTrack([blk(2, 1, 4)], 2, 3)).toBe(3); // [2,5) 与 [1,5) 重叠
    expect(freeTrack([blk(2, 1, 4), blk(3, 0, 10)], 2, 3)).toBe(4); // 2、3 都占 → 4
  });
  it('同轨不同窗不算冲突;首尾相接不算重叠', () => {
    expect(freeTrack([blk(2, 0, 2)], 5, 3)).toBe(2);
    expect(freeTrack([blk(2, 0, 2)], 2, 3)).toBe(2); // [0,2) 和 [2,5) 相接
  });
  it('尊重首选轨(如模板默认轨)', () => {
    expect(freeTrack([], 0, 3, 3)).toBe(3);
    expect(freeTrack([blk(1, 0, 9)], 0, 3, 1)).toBe(2); // 首选 1 被占 → 2
  });
});

describe('素材位入/出场动效预设(slots.anim)', () => {
  it('enter+exit:from 在 0,to 钉在块末端往前 dur 秒', () => {
    const b = mediaBlock({ startSec: 2, durationSec: 4 });
    b.slots = { media: { type: 'image', url: 'https://x/a.jpg' }, anim: { enter: 'rise', exit: 'fade', dur: 0.5 } };
    const r = renderBlock(b);
    expect(r.timelineBody).toContain("tl.from('#" + b.id + " .hf-media'");
    expect(r.timelineBody).toContain('y: 60');
    expect(r.timelineBody).toContain('), 3.5);'); // 4 - 0.5
  });
  it("enter 'none' + 无 exit:不出任何 tween", () => {
    const b = mediaBlock({ startSec: 0, durationSec: 3 });
    b.slots = { media: { type: 'image', url: 'https://x/a.jpg' }, anim: { enter: 'none' } };
    expect(renderBlock(b).timelineBody).toBe('');
  });
  it('无 anim:保持旧默认淡入(向后兼容)', () => {
    const b = mediaBlock({ startSec: 0, durationSec: 3 });
    b.slots = { media: { type: 'image', url: 'https://x/a.jpg' } };
    expect(renderBlock(b).timelineBody).toContain('scale: 0.96');
  });
});

describe('captionStyle 稀疏持久化', () => {
  it('resolve 给稀疏样式补全全部默认(preset/yPct/scale/xPct/wPct)', () => {
    const c = { width: 1080, height: 1920, durationSec: 10, theme: 'general', video: null, blocks: [], captionStyle: { on: true, preset: 'ln-black' } } as never;
    const r = resolveCaptionStyle(c);
    expect(r.preset).toBe('ln-black');
    expect(r.yPct).toBe(88);
    expect(r.scale).toBe(1);
    expect(r.xPct).toBe(50);
    expect(r.wPct).toBe(56);
  });
});

describe('加粗覆盖(bold:预设起点之上的显式覆盖)', () => {
  it('captionStyle.bold 烘进 slots 并落到 font-weight:800;译文行 sub.bold 同理(700)', () => {
    const c = emptyComposition();
    c.video = { url: 'v.mp4', durationSec: 10 };
    c.blocks = [captionBlock({ words: [{ text: '你好', start: 0, end: 1 }], sub: 'Hi' })];
    c.captionStyle = { on: true, preset: 'ln-clean', bold: true, sub: { lang: 'English', bold: true } };
    const html = assembleHtml(c);
    expect(html).toContain('font-weight:800');
    expect(html).toContain('font-weight:700'); // 译文行 bold=700
    c.captionStyle = { on: true, preset: 'ln-clean', bold: false };
    expect(assembleHtml(c)).toContain('font-weight:500'); // 显式取消加粗
  });
});

describe('半分取景的空位框不压视频', () => {
  // split-b 曾把 l/r 的横轴内缩(0.12)照抄到纵轴上,空位框底边越过视频顶边 4%,
  // 图形压在人脸上——占位框和视频必须互不相交,四个方向都是。
  const OCCUPIED: Record<string, { x: number; y: number; w: number; h: number }> = {
    'split-l': { x: 0, y: 0, w: 0.5, h: 1 },
    'split-r': { x: 0.5, y: 0, w: 0.5, h: 1 },
    'split-t': { x: 0, y: 0, w: 1, h: 0.5 },
    'split-b': { x: 0, y: 0.5, w: 1, h: 0.5 },
  };
  for (const [tr, vid] of Object.entries(OCCUPIED)) {
    it(`${tr}:空位框与视频占用区不相交`, () => {
      const b = treatmentVacancyBox(tr as never)!;
      expect(b).toBeTruthy();
      const overlaps = b.x < vid.x + vid.w && vid.x < b.x + b.w && b.y < vid.y + vid.h && vid.y < b.y + b.h;
      expect(overlaps, `${tr} 空位框 ${JSON.stringify(b)} 压在视频上`).toBe(false);
    });
  }
});

describe('空位框不进字幕带', () => {
  it('所有取景的空位框 y+h ≤ 0.84(字幕层的地界)', () => {
    for (const tr of ['corner-tl', 'corner-tr', 'corner-bl', 'corner-br', 'split-l', 'split-r', 'split-t', 'split-b'] as const) {
      const b = treatmentVacancyBox(tr)!;
      expect(b.y + b.h, `${tr} 空位框伸进了字幕带`).toBeLessThanOrEqual(0.84 + 1e-9);
    }
  });
});

describe('取景 clipPath 可插值(所有取景同 token 数)', () => {
  // GSAP 补间复杂字符串按数字 token 配对:'inset(0%)' 对 'inset(0% 50% 0% 0%)' 数量不齐,
  // 过渡时 transform 平滑滑动而裁切瞬跳。钉住:每种取景的 clipPath 都是 4 个数字。
  it('每种取景 4 个 inset 分量,任意两种之间都能补间', () => {
    const ALL = ['full', 'punch-in', 'corner-tl', 'corner-tr', 'corner-bl', 'corner-br', 'split-l', 'split-r', 'split-t', 'split-b'] as const;
    for (const tr of ALL) {
      const clip = shotTransformVars(tr).clipPath;
      expect(clip.match(/[\d.]+%/g), `${tr} → ${clip}`).toHaveLength(4);
    }
  });
});

describe('原子媒体取景(transform + crop)', () => {
  it('意图预设只负责物化原子值,渲染读取同一份值', () => {
    const base: VideoShot = { id: 's', srcStart: 0, srcEnd: 2, treatment: 'full' };
    const split = patchShotFraming(base, { treatment: 'split-l', size: 50, crop: 50 });
    expect(split.mediaFraming).toEqual({
      transform: { scale: 1, offsetX: -0.25, offsetY: 0 },
      crop: { top: 0, right: 0.25, bottom: 0, left: 0.25 },
      rounding: 0,
    });
    expect(mediaFramingTransformVars(resolveShotMediaFraming(split))).toEqual(shotTransformVars('split-l', 50, 50));
  });

  it('显式原子值优先于旧 treatment,旧项目仍可惰性解析', () => {
    const custom: VideoShot = {
      id: 'custom', srcStart: 0, srcEnd: 2, treatment: 'full',
      mediaFraming: {
        transform: { scale: 1.3, offsetX: 0.12, offsetY: -0.08 },
        crop: { top: 0.1, right: 0.2, bottom: 0, left: 0.05 },
        rounding: 18,
      },
    };
    expect(videoFrameTimelineBody([custom])).toContain("scale: 1.3, xPercent: 12, yPercent: -8, borderRadius: 18, clipPath: 'inset(10% 20% 0% 5%)'");
    expect(resolveShotMediaFraming({ treatment: 'corner-br' })).toEqual({
      transform: { scale: 0.34, offsetX: 0.31, offsetY: 0.31 },
      crop: { top: 0, right: 0, bottom: 0, left: 0 },
      rounding: 54,
    });
    expect(resolveShotMediaFraming({ treatment: 'corner-tr' }).transform).toEqual({ scale: 0.34, offsetX: 0.31, offsetY: -0.31 });
    expect(resolveShotMediaFraming({ treatment: 'corner-bl' }).transform).toEqual({ scale: 0.34, offsetX: -0.31, offsetY: 0.31 });
  });
});

describe('精确主体取景(预览/导出共用 transform)', () => {
  it('scale+source anchor 转成无露边的中心缩放/位移', () => {
    expect(shotTransformVars('full', undefined, undefined, { scale: 2, anchorX: 0.5, anchorY: 0.5 })).toMatchObject({ scale: 2, xPercent: 0, yPercent: 0 });
    expect(shotTransformVars('full', undefined, undefined, { scale: 2, anchorX: 0, anchorY: 1 })).toMatchObject({ scale: 2, xPercent: 50, yPercent: -50 });
  });

  it('source-normalized precision 在源帧绘制,canvas transform 必须保持 identity', () => {
    const precise = { scale: 2, anchorX: 0.2, anchorY: 0.4, coordinateSpace: 'source-normalized' as const };
    expect(shotTransformVars('full', undefined, undefined, precise)).toEqual({
      scale: 1,
      xPercent: 0,
      yPercent: 0,
      borderRadius: 0,
      clipPath: 'inset(0% 0% 0% 0%)',
    });
    const base: VideoShot = { id: 's', srcStart: 0, srcEnd: 3, treatment: 'full' };
    const patched = patchShotFraming(base, precise);
    expect(patched.preciseFraming).toEqual(precise);
  });

  it('patch 统一归一化数值,切到 split 自动丢弃无意义的精确锚点', () => {
    const base: VideoShot = { id: 's', srcStart: 0, srcEnd: 3, treatment: 'full' };
    const exact = patchShotFraming(base, { scale: 9, anchorX: -2, anchorY: 0.33333 });
    expect(exact.preciseFraming).toEqual({ scale: 4, anchorX: 0, anchorY: 0.333 });
    expect(patchShotFraming(exact, { treatment: 'split-l' }).preciseFraming).toBeUndefined();
  });

  it('时间轴保留精确 framing,相邻相同状态仍会去重', () => {
    const precise = { scale: 1.8, anchorX: 0.3, anchorY: 0.4 };
    const keys = videoFrameKeyframes([
      { id: 'a', srcStart: 0, srcEnd: 2, treatment: 'full', preciseFraming: precise },
      { id: 'b', srcStart: 2, srcEnd: 4, treatment: 'full', preciseFraming: precise },
    ]);
    expect(keys).toHaveLength(1);
    expect(keys[0]!.precise).toEqual(precise);
    expect(videoFrameTimelineBody([{ id: 'a', srcStart: 0, srcEnd: 2, treatment: 'full', preciseFraming: precise }])).toContain('scale: 1.8');
  });

  it('数值相同但坐标空间不同不能去重', () => {
    const legacy = { scale: 1.8, anchorX: 0.3, anchorY: 0.4 };
    const source = { ...legacy, coordinateSpace: 'source-normalized' as const };
    expect(
      videoFrameKeyframes([
        { id: 'a', srcStart: 0, srcEnd: 2, treatment: 'full', preciseFraming: legacy },
        { id: 'b', srcStart: 2, srcEnd: 4, treatment: 'full', preciseFraming: source },
      ]),
    ).toHaveLength(2);
  });
});

describe('parseClipInset(导出侧读回取景裁切)', () => {
  // 导出 bug 的根:readTransform 只读 transform,铺满半分的裁切在 clip-path 里 —— 整幅平移、
  // 没裁,看起来"只切了四分之一"。producer(shotTransformVars)与 parser 同仓互钉。
  it('往返:每种取景 emit 的 clipPath 解析回一致的 inset 分量', () => {
    const ALL = ['full', 'punch-in', 'corner-tl', 'corner-tr', 'corner-bl', 'corner-br', 'split-l', 'split-r', 'split-t', 'split-b'] as const;
    for (const tr of ALL) {
      for (const crop of [undefined, 0, 30, 100]) {
        const clip = shotTransformVars(tr, undefined, crop).clipPath;
        const ins = parseClipInset(clip);
        const nums = clip.match(/[\d.]+/g)!.map(Number);
        expect([ins.t * 100, ins.r * 100, ins.b * 100, ins.l * 100].map((v) => Math.round(v * 10) / 10)).toEqual(nums);
      }
    }
  });

  it('computed style 的缩写折叠(1/2/3 值)按 CSS 盒规则展开', () => {
    // Chromium 会把我们写的 4 值 inset 折叠:'inset(0% 25% 0% 25%)' → 'inset(0% 25%)'
    expect(parseClipInset('inset(25%)')).toEqual({ t: 0.25, r: 0.25, b: 0.25, l: 0.25 });
    expect(parseClipInset('inset(0% 25%)')).toEqual({ t: 0, r: 0.25, b: 0, l: 0.25 });
    expect(parseClipInset('inset(10% 20% 30%)')).toEqual({ t: 0.1, r: 0.2, b: 0.3, l: 0.2 });
    expect(parseClipInset('inset(25% 0% 25% 0%)')).toEqual({ t: 0.25, r: 0, b: 0.25, l: 0 });
  });

  it('none / 空 / 带 round 的形态不炸,none 归零', () => {
    expect(parseClipInset('none')).toEqual({ t: 0, r: 0, b: 0, l: 0 });
    expect(parseClipInset(undefined)).toEqual({ t: 0, r: 0, b: 0, l: 0 });
    expect(parseClipInset('inset(10% 20% round 8px)')).toEqual({ t: 0.1, r: 0.2, b: 0.1, l: 0.2 });
  });
});

describe('分镜声音(volumeDb/audioMuted)', () => {
  const shot = (over: Partial<VideoShot> = {}): VideoShot => ({ id: 's1', srcStart: 0, srcEnd: 5, treatment: 'full', ...over });

  it('dbToGain:0dB=1、-6dB≈0.5、地板 -60 及以下=真 0(不是很小声)', () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-6)).toBeCloseTo(0.501, 2);
    expect(dbToGain(VOLUME_DB_MIN)).toBe(0);
    expect(dbToGain(-120)).toBe(0);
  });

  it('shotGain:未设=1;muted 压过 volumeDb;预览/导出共用这一份换算', () => {
    expect(shotGain(shot())).toBe(1);
    expect(shotGain(shot({ volumeDb: -6 }))).toBeCloseTo(0.501, 2);
    expect(shotGain(shot({ volumeDb: -6, audioMuted: true }))).toBe(0);
  });

  it('patchShotAudio:钳位到 [-60,+20];中性值(0dB/未静音)把字段摘掉,没动过的 comp 字节不变', () => {
    const s = patchShotAudio(shot(), { volumeDb: -18.234 });
    expect(s.volumeDb).toBe(-18.2);
    // 分镜与音轨同一把尺子:抬升是真的(录轻了就推上去),预览靠 gain node、导出靠改 PCM
    const boosted = patchShotAudio(shot(), { volumeDb: 6 });
    expect(boosted.volumeDb).toBe(6);
    expect(shotGain(boosted)).toBeCloseTo(1.995, 3);
    expect(patchShotAudio(shot(), { volumeDb: 99 }).volumeDb).toBe(20);
    const floor = patchShotAudio(shot(), { volumeDb: -99 });
    expect(floor.volumeDb).toBe(-60);
    const neutral = patchShotAudio(shot({ volumeDb: -6, audioMuted: true }), { volumeDb: 0, mute: false });
    expect('volumeDb' in neutral).toBe(false);
    expect('audioMuted' in neutral).toBe(false);
  });

  it('分镜音频淡入淡出:默认无淡化(每个切点都喘气才是错的),设了才走 smoothstep,并夹在 10s 内', () => {
    const s = shot();
    expect(shotFadeAt(s, 0, 10)).toBe(1); // 默认 = 硬切
    const faded = patchShotAudio(s, { fadeInSec: 2, fadeOutSec: 1 });
    expect(faded.audioFadeInSec).toBe(2);
    expect(shotFadeAt(faded, 0, 10)).toBe(0);
    expect(shotFadeAt(faded, 1, 10)).toBe(0.5); // smoothstep 中点
    expect(shotFadeAt(faded, 5, 10)).toBe(1);
    expect(shotFadeAt(faded, 9.5, 10)).toBe(0.5); // 尾端 1s 淡出
    // 整体增益 = 电平 × 淡化;静音压过一切
    const quiet = patchShotAudio(faded, { volumeDb: -6 });
    expect(shotGainAt(quiet, 5, 10)).toBeCloseTo(dbToGain(-6), 5);
    expect(shotGainAt(patchShotAudio(quiet, { mute: true }), 5, 10)).toBe(0);
    expect(patchShotAudio(s, { fadeInSec: 99 }).audioFadeInSec).toBe(10);
    expect(patchShotAudio(faded, { fadeInSec: 0 }).audioFadeInSec).toBeUndefined(); // 归零=摘字段
  });

  it('接缝微淡化:只在真接缝上加,连续切分不加,并与分镜自身淡化相乘', () => {
    const s = shot();
    const len = 10;
    // 连续:上一镜的 srcEnd 正好是本镜的 srcStart(只分镜没删东西)→ 不是接缝
    expect(shotsContiguous({ src: undefined, srcEnd: 4 }, { src: undefined, srcStart: 4 })).toBe(true);
    expect(shotsContiguous({ src: undefined, srcEnd: 4 }, { src: undefined, srcStart: 6.5 })).toBe(false);
    expect(shotsContiguous({ src: 'a', srcEnd: 4 }, { src: undefined, srcStart: 4 })).toBe(false); // 换源必是接缝
    expect(segmentFadeFn(s, len, false, false)).toBeNull(); // 无淡化无接缝 = 直通,导出保持原样透传
    const spliced = segmentFadeFn(s, len, true, true)!;
    expect(spliced(0)).toBe(0);
    expect(spliced(SPLICE_FADE_SEC / 2)).toBeCloseTo(0.5, 5);
    expect(spliced(SPLICE_FADE_SEC)).toBe(1);
    expect(spliced(0.5)).toBe(1); // 12ms 之外完全不影响电平,不会听成淡入
    expect(spliced(len)).toBe(0);
    // 与分镜自身的淡入相乘,不是二选一
    const both = segmentFadeFn(patchShotAudio(s, { fadeInSec: 2 }), len, true, false)!;
    expect(both(1)).toBeCloseTo(0.5, 5); // 自身淡入中点 × 微淡化已完成
    expect(both(0)).toBe(0);
  });

  it('patchShotAudio:mute 独立于 volumeDb——静音再取消,原音量还在', () => {
    const quiet = patchShotAudio(shot(), { volumeDb: -12 });
    const muted = patchShotAudio(quiet, { mute: true });
    expect(muted.audioMuted).toBe(true);
    expect(muted.volumeDb).toBe(-12);
    expect(shotGain(muted)).toBe(0);
    const back = patchShotAudio(muted, { mute: false });
    expect(back.audioMuted).toBeUndefined();
    expect(shotGain(back)).toBeCloseTo(dbToGain(-12), 5);
  });
});

describe('placementFramingNotes(place_block 回执的取景提示)', () => {
  const shot = (id: string, len: number, treatment: VideoShot['treatment']): VideoShot => ({
    id, srcStart: 0, srcEnd: len, treatment,
  });

  it('names the video band and free area for an overlapping split span', () => {
    const shots = [shot('a', 10, 'full'), shot('b', 10, 'split-t'), shot('c', 10, 'full')];
    const notes = placementFramingNotes(shots, 12, 5);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toContain('split-t');
    expect(notes[0]).toContain('video holds the top half');
    expect(notes[0]).toContain('free area is the bottom half');
    expect(notes[0]).toContain('10–20s');
  });

  it('stays silent over full/punch-in spans and non-overlapping windows', () => {
    const shots = [shot('a', 10, 'full'), shot('b', 10, 'punch-in'), shot('c', 10, 'split-b')];
    expect(placementFramingNotes(shots, 0, 15)).toHaveLength(0);
    expect(placementFramingNotes(shots, 25, 100)).toHaveLength(1);
  });
});
