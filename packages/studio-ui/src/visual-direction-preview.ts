import type { Block } from "@pireel/studio-engine/composition";

export type VisualDirectionKind =
  | "neutral"
  | "editorial"
  | "memphis"
  | "tech"
  | "collage"
  | "brutalist"
  | "organic";

export type MotionGraphicKind =
  | "words"
  | "number"
  | "comparison"
  | "data"
  | "line"
  | "donut"
  | "funnel"
  | "steps"
  | "timeline"
  | "flow"
  | "cycle"
  | "document"
  | "overlay"
  | "source"
  | "phone"
  | "browser"
  | "map"
  | "brand";

export interface MotionGraphicPreviewCopy {
  words: string;
  wordsSupport: string;
  numberLabel: string;
  numberNote: string;
  dataTitle: string;
  dataHook: string;
  dataProof: string;
  dataAction: string;
  overlayName: string;
  overlayRole: string;
  brandLine: string;
  sourceHeadline: string;
  sourceFocus: string;
  before: string;
  after: string;
  stageOne: string;
  stageTwo: string;
  stageThree: string;
  documentTitle: string;
  interfaceTitle: string;
  mapStart: string;
  mapEnd: string;
}

export function visualDirectionKind(id: string): VisualDirectionKind {
  const directions: Record<string, VisualDirectionKind> = {
    "performance-native": "organic",
    "editorial-quiet": "editorial",
    "memphis-motion": "memphis",
    "precision-tech": "tech",
    "paper-collage": "collage",
    "neo-brutalist": "brutalist",
    "soft-organic": "organic",
  };
  return directions[id] ?? "neutral";
}

export function visualDirectionMotionBlock(
  directionId: string,
  kind: MotionGraphicKind,
  box: NonNullable<Block["box"]>,
  copy: MotionGraphicPreviewCopy,
): Block {
  const direction = visualDirectionKind(directionId);
  const id = `visual_direction_${direction}_${kind}`;
  return {
    id,
    templateId: "custom",
    slots: {
      innerHtml: `${motionGraphicMarkup(kind, copy)}\n<style>${motionGraphicCss(id, direction, kind)}</style>`,
      timelineBody: motionTimeline(id, direction, kind),
    },
    startSec: 0,
    durationSec: kind === "overlay" ? 2.2 : 4,
    trackIndex: 2,
    box,
    label: kind,
  };
}

function motionGraphicMarkup(
  kind: MotionGraphicKind,
  copy: MotionGraphicPreviewCopy,
): string {
  const content: Record<MotionGraphicKind, string> = {
    words: `<div class="vd-kicker">MOTION / 01</div><div class="vd-words"><span>${copy.words}</span></div><div class="vd-support">${copy.wordsSupport}</div>`,
    number: `<div class="vd-kicker">RESULT / 02</div><div class="vd-number"><strong>72</strong><i>%</i></div><div class="vd-number-copy"><b>${copy.numberLabel}</b><span>${copy.numberNote}</span></div>`,
    data: `<div class="vd-kicker">${copy.dataTitle}</div><div class="vd-chart"><div style="--v:.86"><span>${copy.dataHook}</span><i></i><b>86</b></div><div style="--v:.68"><span>${copy.dataProof}</span><i></i><b>68</b></div><div style="--v:.42"><span>${copy.dataAction}</span><i></i><b>42</b></div></div>`,
    comparison: `<div class="vd-kicker">A / B</div><div class="vd-compare"><section><small>01</small><strong>${copy.before}</strong><b>42%</b></section><i>VS</i><section><small>02</small><strong>${copy.after}</strong><b>72%</b></section></div>`,
    line: `<div class="vd-kicker">${copy.dataTitle}</div><div class="vd-line"><svg viewBox="0 0 100 46" preserveAspectRatio="none"><path class="grid" d="M0 11H100M0 23H100M0 35H100"/><path class="area" d="M0 39L18 33L36 35L55 22L74 25L100 7V46H0Z"/><path class="path" d="M0 39L18 33L36 35L55 22L74 25L100 7"/></svg><b>+72%</b></div>`,
    donut: `<div class="vd-donut"><svg viewBox="0 0 100 100"><circle class="track" cx="50" cy="50" r="39"/><circle class="arc" cx="50" cy="50" r="39" pathLength="100"/></svg><div><strong>72%</strong><span>${copy.numberLabel}</span></div></div>`,
    funnel: `<div class="vd-kicker">FUNNEL / 04</div><div class="vd-funnel"><div><span>${copy.stageOne}</span><b>100</b></div><div><span>${copy.stageTwo}</span><b>68</b></div><div><span>${copy.stageThree}</span><b>42</b></div></div>`,
    steps: `<div class="vd-kicker">PROCESS / 05</div><div class="vd-steps"><div><b>01</b><span>${copy.stageOne}</span></div><div><b>02</b><span>${copy.stageTwo}</span></div><div><b>03</b><span>${copy.stageThree}</span></div></div>`,
    timeline: `<div class="vd-kicker">TIMELINE / 06</div><div class="vd-timeline"><i></i><div><b>01</b><span>${copy.stageOne}</span></div><div><b>02</b><span>${copy.stageTwo}</span></div><div><b>03</b><span>${copy.stageThree}</span></div></div>`,
    flow: `<div class="vd-kicker">FLOW / 07</div><div class="vd-flow"><section>${copy.stageOne}</section><i></i><section>${copy.stageTwo}</section><i></i><section>${copy.stageThree}</section></div>`,
    cycle: `<div class="vd-kicker">LOOP / 08</div><div class="vd-cycle"><svg viewBox="0 0 100 100"><path d="M50 10A40 40 0 1 1 18 26"/><path d="M18 26L18 11M18 26L33 24"/></svg><span class="n1">${copy.stageOne}</span><span class="n2">${copy.stageTwo}</span><span class="n3">${copy.stageThree}</span></div>`,
    document: `<div class="vd-document"><header><span>REPORT / 2026</span><i></i><span>01</span></header><h2>${copy.documentTitle}</h2><p></p><p></p><mark>${copy.sourceFocus}</mark></div>`,
    overlay: `<div class="vd-overlay-mark"></div><div class="vd-overlay-copy"><strong>${copy.overlayName}</strong><span>${copy.overlayRole}</span></div><div class="vd-overlay-index">01</div>`,
    source: `<div class="vd-source"><div class="vd-source-bar"><span>PIREEL.COM</span><i></i><span>01</span></div><div class="vd-source-page"><b>${copy.sourceHeadline}</b><span>${copy.sourceFocus}</span></div></div>`,
    phone: `<div class="vd-phone-meta"><span>9:16 SOURCE</span><i></i><span>00:18</span></div><div class="vd-phone-frame"><img src="/studio/custom-frame-presenter-v1.jpg" alt=""/><div><b>${copy.interfaceTitle}</b><span>${copy.sourceFocus}</span></div></div>`,
    browser: `<div class="vd-browser-capture"><header><span>PIREEL.COM / STUDIO</span><i></i><b>LIVE SOURCE</b></header><main><small>${copy.interfaceTitle}</small><strong>${copy.sourceHeadline}</strong><mark>${copy.sourceFocus}</mark></main></div>`,
    map: `<div class="vd-map-meta"><span>ROUTE / 01</span><i></i><span>1.8 KM</span></div><div class="vd-map-canvas"><svg viewBox="0 0 640 340" preserveAspectRatio="none"><g class="roads"><path d="M-20 58C118 38 165 112 302 88S486 18 672 54"/><path d="M-28 258C128 224 204 286 340 244S500 142 674 176"/><path d="M92-20C104 74 66 156 124 368"/><path d="M278-24C252 82 338 158 294 370"/><path d="M496-20C462 82 532 210 468 370"/><path d="M20 150L188 178L370 140L620 270"/><path d="M176 4L214 128L420 322"/></g><path class="route" d="M88 248C146 208 168 154 246 174S354 240 420 190S500 92 560 118"/><circle class="start" cx="88" cy="248" r="10"/><circle class="end" cx="560" cy="118" r="13"/><g class="labels"><text x="65" y="286">${copy.mapStart}</text><text x="495" y="92">${copy.mapEnd}</text><text x="250" y="40">1.2868° N</text><text x="250" y="65">103.8545° E</text></g></svg></div>`,
    brand: `<div class="vd-brand-mark"><i></i><i></i><i></i></div><div class="vd-brand"><strong>PIREEL</strong><span>${copy.brandLine}</span></div>`,
  };
  return `<div class="vd-stage" data-sample="${kind}">
    <div class="vd-grid"></div><div class="vd-shape vd-shape-a"></div><div class="vd-shape vd-shape-b"></div><div class="vd-trace"></div>
    <div class="vd-content vd-${kind}">${content[kind]}</div>
  </div>`;
}

function motionGraphicCss(
  id: string,
  direction: VisualDirectionKind,
  kind: MotionGraphicKind,
): string {
  return `
#${id}{font-family:var(--font-body);color:var(--fg)}
#${id} .vd-stage{position:absolute;inset:0;overflow:hidden;background:var(--panel);color:var(--fg);isolation:isolate}
#${id} .vd-content{position:absolute;inset:0;z-index:3;padding:8%;display:flex;flex-direction:column;justify-content:center}
#${id} .vd-grid,#${id} .vd-shape,#${id} .vd-trace{position:absolute;pointer-events:none}
#${id} .vd-kicker{font-family:var(--font-num);font-size:22px;letter-spacing:.12em;color:var(--muted);text-transform:uppercase}
#${id} .vd-words{max-width:92%;font-family:var(--font-head);font-size:92px;font-weight:850;line-height:.92;letter-spacing:-.055em}
#${id} .vd-support{margin-top:28px;max-width:70%;font-size:26px;line-height:1.35;color:var(--muted)}
#${id} .vd-number{display:flex;align-items:flex-start;font-family:var(--font-num);font-weight:850;line-height:.78;letter-spacing:-.08em}
#${id} .vd-number strong{font-size:190px}#${id} .vd-number i{margin:10px 0 0 10px;font-size:48px;font-style:normal;color:var(--accent)}
#${id} .vd-number-copy{display:flex;gap:24px;align-items:baseline;margin-top:36px}#${id} .vd-number-copy b{font-size:30px}#${id} .vd-number-copy span{font-size:22px;color:var(--muted)}
#${id} .vd-chart{display:grid;gap:30px;margin-top:42px}#${id} .vd-chart>div{display:grid;grid-template-columns:170px 1fr 54px;gap:20px;align-items:center}
#${id} .vd-chart span,#${id} .vd-chart b{font-size:24px}#${id} .vd-chart b{font-family:var(--font-num);text-align:right}#${id} .vd-chart i{height:18px;background:linear-gradient(90deg,var(--accent) calc(var(--v)*100%),var(--line) 0);transform-origin:left}
#${id} .vd-compare{display:grid;grid-template-columns:1fr auto 1fr;gap:22px;align-items:stretch;margin-top:32px}#${id} .vd-compare section{display:flex;min-width:0;flex-direction:column;gap:16px;padding:28px;border:2px solid var(--line)}#${id} .vd-compare section:last-child{border-color:var(--accent)}#${id} .vd-compare small{font:20px var(--font-num);color:var(--muted)}#${id} .vd-compare strong{font-size:34px}#${id} .vd-compare b{margin-top:auto;font:68px var(--font-num)}#${id} .vd-compare>i{align-self:center;font:26px var(--font-num);color:var(--accent)}
#${id} .vd-line{position:relative;height:330px;margin-top:28px}#${id} .vd-line svg{width:100%;height:100%;overflow:visible}#${id} .vd-line .grid{fill:none;stroke:var(--grid);stroke-width:1;vector-effect:non-scaling-stroke}#${id} .vd-line .area{fill:color-mix(in srgb,var(--accent) 18%,transparent)}#${id} .vd-line .path{fill:none;stroke:var(--accent);stroke-width:3;vector-effect:non-scaling-stroke;stroke-linecap:round;stroke-linejoin:round}#${id} .vd-line b{position:absolute;right:0;top:0;font:46px var(--font-num);color:var(--accent)}
#${id} .vd-donut{display:flex;align-items:center;justify-content:center;gap:46px}#${id} .vd-donut svg{width:290px;height:290px;transform:rotate(-90deg)}#${id} .vd-donut circle{fill:none;stroke-width:10}#${id} .vd-donut .track{stroke:var(--line)}#${id} .vd-donut .arc{stroke:var(--accent);stroke-linecap:round;stroke-dasharray:72 100}#${id} .vd-donut>div{display:flex;flex-direction:column}#${id} .vd-donut strong{font:94px var(--font-num)}#${id} .vd-donut span{font-size:28px;color:var(--muted)}
#${id} .vd-funnel{display:grid;gap:14px;margin-top:30px}#${id} .vd-funnel div{display:flex;justify-content:space-between;align-items:center;height:68px;padding:0 24px;background:var(--panel-2);font-size:26px;clip-path:polygon(var(--cut,0) 0,calc(100% - var(--cut,0)) 0,calc(92% - var(--cut,0)) 100%,calc(8% + var(--cut,0)) 100%)}#${id} .vd-funnel div:nth-child(2){margin-inline:8%;background:color-mix(in srgb,var(--accent) 48%,var(--panel-2))}#${id} .vd-funnel div:nth-child(3){margin-inline:18%;background:var(--accent);color:var(--panel)}#${id} .vd-funnel b{font-family:var(--font-num)}
#${id} .vd-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:34px}#${id} .vd-steps div{min-height:190px;padding:24px;border-top:3px solid var(--line)}#${id} .vd-steps div:last-child{border-color:var(--accent)}#${id} .vd-steps b{font:48px var(--font-num);color:var(--accent)}#${id} .vd-steps span{display:block;margin-top:30px;font-size:28px}
#${id} .vd-timeline{position:relative;display:flex;justify-content:space-between;margin-top:70px}#${id} .vd-timeline>i{position:absolute;left:0;right:0;top:13px;height:2px;background:var(--line);transform-origin:left}#${id} .vd-timeline div{position:relative;width:30%;padding-top:44px}#${id} .vd-timeline div:before{content:'';position:absolute;top:0;left:0;width:28px;height:28px;border-radius:50%;background:var(--panel);border:6px solid var(--accent)}#${id} .vd-timeline b{font:26px var(--font-num);color:var(--muted)}#${id} .vd-timeline span{display:block;margin-top:10px;font-size:28px}
#${id} .vd-flow{display:flex;align-items:center;justify-content:center;gap:18px;margin-top:42px}#${id} .vd-flow section{display:flex;align-items:center;justify-content:center;min-height:120px;flex:1;padding:24px;border:2px solid var(--line);font-size:27px;text-align:center}#${id} .vd-flow section:last-child{border-color:var(--accent)}#${id} .vd-flow i{width:38px;height:2px;background:var(--accent);position:relative}#${id} .vd-flow i:after{content:'';position:absolute;right:-1px;top:-5px;border-left:9px solid var(--accent);border-block:6px solid transparent}
#${id} .vd-cycle{position:relative;width:390px;height:390px;margin:auto}#${id} .vd-cycle svg{width:100%;height:100%;overflow:visible}#${id} .vd-cycle path{fill:none;stroke:var(--accent);stroke-width:3;stroke-linecap:round}#${id} .vd-cycle span{position:absolute;padding:10px 15px;background:var(--panel-2);font-size:22px}#${id} .vd-cycle .n1{left:50%;top:0;transform:translateX(-50%)}#${id} .vd-cycle .n2{right:-12%;bottom:22%}#${id} .vd-cycle .n3{left:-10%;bottom:22%}
#${id} .vd-document{padding:42px;background:var(--paper);color:var(--panel);box-shadow:var(--shadow)}#${id} .vd-document header{display:flex;align-items:center;gap:16px;font:17px var(--font-num);color:var(--muted)}#${id} .vd-document header i{height:1px;flex:1;background:var(--line)}#${id} .vd-document h2{max-width:84%;margin:40px 0 28px;font:650 48px/1.04 var(--font-head)}#${id} .vd-document p{width:90%;height:10px;background:var(--line)}#${id} .vd-document p:nth-of-type(2){width:68%}#${id} .vd-document mark{display:block;width:max-content;margin-top:32px;padding:9px 13px;background:var(--accent);color:var(--panel);font-size:20px}
#${id} .vd-overlay{justify-content:flex-end;padding:8% 7% 10%;flex-direction:row;align-items:flex-end;gap:24px}
#${id} .vd-overlay-mark{width:12px;height:94px;background:var(--accent)}#${id} .vd-overlay-copy{display:flex;flex-direction:column;min-width:360px;padding-bottom:4px}
#${id} .vd-overlay-copy strong{font-family:var(--font-head);font-size:40px;line-height:1}#${id} .vd-overlay-copy span{margin-top:10px;font-size:22px;color:var(--muted)}#${id} .vd-overlay-index{font-family:var(--font-num);font-size:20px;color:var(--accent)}
#${id} .vd-source{width:100%;border:1px solid var(--line);background:var(--panel-2);color:var(--fg);padding:40px 44px;box-shadow:var(--shadow)}
#${id} .vd-source-bar{display:flex;align-items:center;gap:18px;font:18px var(--font-num);letter-spacing:.08em;color:var(--muted)}#${id} .vd-source-bar i{height:1px;flex:1;background:var(--line)}
#${id} .vd-source-page{display:flex;flex-direction:column;gap:26px;margin-top:44px}#${id} .vd-source-page b{max-width:82%;font-family:var(--font-head);font-size:54px;line-height:1.02}
#${id} .vd-source-page span{width:max-content;max-width:88%;padding:10px 15px;background:var(--accent);color:var(--panel);font-size:22px;font-weight:750}
#${id} .vd-phone-frame{position:relative;width:68%;height:100%;min-height:360px;margin:auto;overflow:hidden;background:var(--panel-2);box-shadow:var(--shadow);clip-path:polygon(5% 0,95% 0,100% 5%,100% 95%,95% 100%,5% 100%,0 95%,0 5%)}#${id} .vd-phone-frame img{width:100%;height:100%;object-fit:cover;object-position:center;filter:saturate(.9) contrast(1.05)}#${id} .vd-phone-frame:after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,transparent 48%,rgba(0,0,0,.82))}#${id} .vd-phone-frame>div{position:absolute;left:8%;right:8%;bottom:7%;z-index:2;display:flex;flex-direction:column;color:white}#${id} .vd-phone-frame b{font:700 28px/1.05 var(--font-head)}#${id} .vd-phone-frame span{margin-top:9px;font-size:17px;line-height:1.25;opacity:.78}#${id} .vd-phone-meta,#${id} .vd-map-meta{position:absolute;left:8%;right:8%;top:6%;z-index:4;display:flex;align-items:center;gap:14px;font:16px var(--font-num);letter-spacing:.08em;color:var(--muted)}#${id} .vd-phone-meta i,#${id} .vd-map-meta i{height:1px;flex:1;background:var(--line)}
#${id} .vd-browser-capture{width:100%;overflow:hidden;background:var(--panel-2);box-shadow:var(--shadow)}#${id} .vd-browser-capture header{display:flex;align-items:center;gap:16px;padding:18px 22px;border-bottom:1px solid var(--line);font:16px var(--font-num);letter-spacing:.07em;color:var(--muted)}#${id} .vd-browser-capture header i{height:1px;flex:1;background:var(--line)}#${id} .vd-browser-capture header b{color:var(--accent);font-weight:650}#${id} .vd-browser-capture main{display:grid;grid-template-columns:1fr .6fr;gap:18px;padding:38px 42px}#${id} .vd-browser-capture small{grid-column:1/-1;font:18px var(--font-num);color:var(--muted)}#${id} .vd-browser-capture strong{font:700 50px/1.02 var(--font-head)}#${id} .vd-browser-capture mark{align-self:end;padding:13px 15px;background:var(--accent);color:var(--panel);font-size:20px;line-height:1.25}
#${id} .vd-map-canvas{width:100%;height:100%;min-height:350px;background:color-mix(in srgb,var(--panel-2) 86%,var(--paper));overflow:hidden}#${id} .vd-map-canvas svg{width:100%;height:100%}#${id} .vd-map-canvas .roads path{fill:none;stroke:var(--line);stroke-width:3;vector-effect:non-scaling-stroke}#${id} .vd-map-canvas .route{fill:none;stroke:var(--accent);stroke-width:8;stroke-linecap:round;stroke-dasharray:14 10;vector-effect:non-scaling-stroke}#${id} .vd-map-canvas .start{fill:var(--panel);stroke:var(--accent);stroke-width:5}#${id} .vd-map-canvas .end{fill:var(--accent);stroke:var(--panel);stroke-width:5}#${id} .vd-map-canvas text{fill:var(--fg);font:600 20px var(--font-num)}
#${id} .vd-brand{align-items:center;text-align:center}#${id} .vd-brand strong{font-family:var(--font-head);font-size:106px;line-height:.9;letter-spacing:-.055em}#${id} .vd-brand span{margin-top:24px;font-size:24px;color:var(--muted)}
#${id} .vd-brand-mark{display:flex;justify-content:center;gap:8px;margin-bottom:32px}#${id} .vd-brand-mark i{display:block;width:12px;height:12px;background:var(--accent)}
${directionCss(id, direction, kind)}
`;
}

function directionCss(
  id: string,
  direction: VisualDirectionKind,
  kind: MotionGraphicKind,
): string {
  const css: Record<VisualDirectionKind, string> = {
    neutral: `#${id} .vd-stage{background:var(--panel)}#${id} .vd-grid{inset:0;background-image:radial-gradient(var(--grid) 1px,transparent 1px);background-size:24px 24px}`,
    editorial: `
#${id} .vd-stage{background:var(--paper);color:var(--panel)}#${id} .vd-content{padding:9% 10%;color:var(--panel)}
#${id} .vd-grid{left:10%;top:8%;bottom:8%;width:1px;background:var(--line)}#${id} .vd-shape-a{right:9%;top:8%;width:14%;height:5px;background:var(--accent)}
#${id} .vd-words,#${id} .vd-source-page b,#${id} .vd-brand strong{font-family:var(--font-head);font-weight:650}#${id} .vd-words{font-size:86px;max-width:78%}
#${id} .vd-kicker{color:var(--muted)}#${id} .vd-support{border-top:1px solid var(--line);padding-top:18px;color:var(--muted)}
#${id} .vd-chart i{height:4px}#${id} .vd-number strong{font-family:var(--font-head);font-weight:500}#${id} .vd-number-copy{border-top:1px solid var(--line);padding-top:18px}
#${id} .vd-source{box-shadow:none;border:1px solid var(--line);background:transparent;color:var(--panel)}#${id} .vd-overlay-mark{width:2px}#${id} .vd-overlay-copy strong{font-family:var(--font-head);font-weight:600}
`,
    memphis: `
#${id} .vd-stage{background:var(--paper);color:var(--panel)}#${id} .vd-content{color:var(--panel);transform:rotate(-1.2deg)}
#${id} .vd-grid{right:5%;top:8%;width:28%;height:35%;background-image:radial-gradient(var(--panel) 3px,transparent 3px);background-size:24px 24px;opacity:.55}
#${id} .vd-shape-a{left:-5%;bottom:-18%;width:42%;aspect-ratio:1;border-radius:50%;background:var(--accent);border:5px solid var(--panel)}#${id} .vd-shape-b{right:8%;bottom:9%;width:100px;height:100px;background:var(--accent-2);border:5px solid var(--panel);transform:rotate(18deg)}
#${id} .vd-trace{right:18%;top:9%;width:150px;height:72px;border:5px solid var(--panel);border-bottom:0;border-radius:160px 160px 0 0;background:var(--panel-2);transform:rotate(-13deg)}
#${id} .vd-words,#${id} .vd-brand strong{font-family:var(--font-head);font-size:88px;text-transform:uppercase;text-shadow:7px 7px 0 var(--accent-2)}#${id} .vd-support{color:var(--panel);font-weight:700}
#${id} .vd-number strong{font-family:var(--font-head);font-size:180px;text-shadow:8px 8px 0 var(--accent-2)}#${id} .vd-number i{color:var(--panel)}
#${id} .vd-chart i{height:28px;border-radius:999px;box-shadow:5px 5px 0 var(--panel)}#${id} .vd-source{border:3px solid var(--panel);border-radius:18px;background:var(--paper);color:var(--panel);transform:rotate(1.5deg);box-shadow:9px 9px 0 var(--panel)}
#${id} .vd-compare{gap:30px}#${id} .vd-compare section{border:5px solid var(--panel);background:var(--panel-2);box-shadow:8px 8px 0 var(--accent-2);transform:rotate(-1.5deg)}#${id} .vd-compare section:last-child{border-color:var(--panel);background:var(--paper);box-shadow:8px 8px 0 var(--accent);transform:rotate(1.5deg)}#${id} .vd-compare>i{display:grid;width:58px;height:58px;place-items:center;border:4px solid var(--panel);border-radius:50%;background:var(--accent);color:var(--paper);font-weight:900;transform:rotate(-8deg)}
#${id} .vd-flow section,#${id} .vd-steps div{border:4px solid var(--panel);background:var(--paper);box-shadow:6px 7px 0 var(--accent-2);transform:rotate(-1deg)}#${id} .vd-flow section:last-child,#${id} .vd-steps div:last-child{border-color:var(--panel);background:var(--panel-2);box-shadow:6px 7px 0 var(--accent);transform:rotate(1deg)}#${id} .vd-flow i{height:8px;background:var(--panel)}#${id} .vd-flow i:after{top:-7px;border-left-color:var(--panel);border-block-width:11px}
#${id} .vd-overlay-mark{border-radius:50% 50% 0 50%;transform:rotate(12deg)}#${id} .vd-overlay-copy{background:var(--paper);color:var(--panel);padding:22px 28px;border:3px solid var(--panel);box-shadow:7px 7px 0 var(--accent)}
`,
    tech: `
#${id} .vd-stage{background:var(--panel);color:var(--fg)}#${id} .vd-grid{inset:0;background-image:linear-gradient(var(--grid) 1px,transparent 1px),linear-gradient(90deg,var(--grid) 1px,transparent 1px);background-size:36px 36px}
#${id} .vd-shape-a{right:6%;top:8%;width:24%;height:28%;border-top:1px solid var(--accent);border-right:1px solid var(--accent)}#${id} .vd-shape-b{right:6%;bottom:8%;width:8px;height:8px;background:var(--accent);box-shadow:0 0 18px var(--accent)}
#${id} .vd-words,#${id} .vd-brand strong{font-family:var(--font-head);font-weight:650}#${id} .vd-kicker{color:var(--accent)}#${id} .vd-support{font-family:var(--font-num)}
#${id} .vd-number strong{font-family:var(--font-num);font-weight:500}#${id} .vd-chart i{height:10px;background:linear-gradient(90deg,var(--accent) calc(var(--v)*100%),var(--grid) 0);box-shadow:0 0 12px color-mix(in srgb,var(--accent) 35%,transparent)}
#${id} .vd-source{background:color-mix(in srgb,var(--panel) 92%,var(--accent));border:1px solid var(--line);border-radius:8px}#${id} .vd-source:before{content:'LIVE / VERIFIED';position:absolute;right:7%;top:7%;font:16px var(--font-num);color:var(--accent)}
#${id} .vd-overlay-copy{border-left:1px solid var(--line);padding:12px 20px;background:color-mix(in srgb,var(--panel) 80%,transparent);backdrop-filter:blur(8px)}
`,
    collage: `
#${id} .vd-stage{background:var(--paper);color:var(--panel)}#${id} .vd-content{color:var(--panel);transform:rotate(-.8deg)}
#${id} .vd-grid{inset:0;background-image:radial-gradient(var(--panel) 1.5px,transparent 1.5px);background-size:8px 8px;opacity:.08}
#${id} .vd-shape-a{left:-8%;top:12%;width:36%;height:62%;background:var(--accent);clip-path:polygon(1% 4%,97% 0,92% 96%,7% 100%);transform:rotate(7deg)}#${id} .vd-shape-b{right:5%;bottom:5%;width:26%;height:16%;background:var(--accent-2);clip-path:polygon(3% 9%,100% 0,95% 91%,0 100%)}
#${id} .vd-words,#${id} .vd-brand strong{font-family:var(--font-head);text-transform:uppercase;background:var(--paper);width:max-content;max-width:88%;padding:10px 16px;box-shadow:8px 10px 0 var(--panel);clip-path:polygon(1% 3%,100% 0,98% 97%,0 100%)}
#${id} .vd-support{color:var(--panel);background:var(--accent-2);padding:9px 13px;width:max-content;max-width:70%;transform:rotate(1.5deg)}
#${id} .vd-number strong{font-family:var(--font-head);background:var(--paper);padding:8px 18px;box-shadow:9px 11px 0 var(--panel)}#${id} .vd-chart i{height:30px;clip-path:polygon(0 8%,100% 0,98% 92%,1% 100%)}
#${id} .vd-source{background:var(--paper);color:var(--panel);border:0;box-shadow:10px 13px 0 var(--panel);clip-path:polygon(1% 2%,99% 0,96% 100%,0 97%)}#${id} .vd-overlay-copy{background:var(--paper);color:var(--panel);padding:18px 24px;box-shadow:7px 8px 0 var(--panel);transform:rotate(-1deg)}
`,
    brutalist: `
#${id} .vd-stage{background:var(--paper);color:var(--panel);border:4px solid var(--panel)}#${id} .vd-content{color:var(--panel);padding:7%}
#${id} .vd-grid{inset:0;background-image:linear-gradient(var(--line) 2px,transparent 2px),linear-gradient(90deg,var(--line) 2px,transparent 2px);background-size:25% 25%;opacity:.25}
#${id} .vd-shape-a{right:0;top:0;width:24%;height:18%;background:var(--accent);border-left:4px solid var(--panel);border-bottom:4px solid var(--panel)}
#${id} .vd-words,#${id} .vd-brand strong{font-family:var(--font-head);text-transform:uppercase;font-size:94px;line-height:.82;max-width:94%}#${id} .vd-support{border:4px solid var(--panel);padding:12px 16px;color:var(--panel);background:var(--accent);box-shadow:8px 8px 0 var(--panel)}
#${id} .vd-number strong{font-family:var(--font-head);font-size:200px}#${id} .vd-number i{color:var(--panel)}#${id} .vd-number-copy{border-top:4px solid var(--panel);padding-top:14px}
#${id} .vd-chart i{height:32px;border:3px solid var(--panel);box-shadow:5px 5px 0 var(--panel)}#${id} .vd-source{background:var(--paper);color:var(--panel);border:4px solid var(--panel);box-shadow:9px 9px 0 var(--panel)}
#${id} .vd-overlay-mark{width:18px;border:3px solid var(--panel)}#${id} .vd-overlay-copy{background:var(--accent);color:var(--panel);border:4px solid var(--panel);padding:17px 23px;box-shadow:7px 7px 0 var(--panel)}
`,
    organic: `
#${id} .vd-stage{background:var(--panel);color:var(--fg)}#${id} .vd-shape-a{left:-12%;top:-18%;width:54%;aspect-ratio:1;border-radius:42% 58% 64% 36%/45% 32% 68% 55%;background:color-mix(in srgb,var(--accent) 76%,var(--paper));opacity:.82}
#${id} .vd-shape-b{right:-5%;bottom:-18%;width:42%;aspect-ratio:1;border-radius:61% 39% 45% 55%/38% 62% 38% 62%;border:2px solid var(--accent-2);opacity:.65}
#${id} .vd-trace{right:8%;top:14%;width:28%;height:36%;border:2px solid var(--line);border-radius:62% 38% 70% 30%/45% 65% 35% 55%}
#${id} .vd-words,#${id} .vd-brand strong{font-family:var(--font-head);font-weight:550;max-width:78%}#${id} .vd-support{color:var(--fg);opacity:.75}
#${id} .vd-number strong{font-family:var(--font-head);font-weight:500}#${id} .vd-chart i{height:22px;border-radius:999px}#${id} .vd-source{background:color-mix(in srgb,var(--paper) 16%,var(--panel));border:1px solid var(--line);border-radius:32px;backdrop-filter:blur(10px)}
#${id} .vd-source-page span{border-radius:999px}#${id} .vd-overlay-mark{border-radius:999px}#${id} .vd-overlay-copy{padding:18px 26px;border-radius:28px;background:color-mix(in srgb,var(--paper) 14%,transparent);backdrop-filter:blur(10px)}
`,
  };
  return `${css[direction]}\n#${id} .vd-${kind}{}`;
}

function motionTimeline(
  id: string,
  direction: VisualDirectionKind,
  kind: MotionGraphicKind,
): string {
  const main = `#${id} .vd-content`;
  const ornaments = `#${id} .vd-shape, #${id} .vd-trace`;
  const chart = `#${id} .vd-chart i`;
  const special: Record<VisualDirectionKind, string> = {
    neutral: `tl.from('${main}',{y:24,autoAlpha:0,duration:.55,ease:'power3.out'},.08);`,
    editorial: `tl.from('${main}',{y:34,autoAlpha:0,duration:.7,ease:'power3.out'},.08);tl.from('${ornaments}',{scaleX:0,duration:.55,ease:'power2.out'},.15);`,
    memphis: `tl.from('${ornaments}',{scale:0,rotation:-35,duration:.65,stagger:.09,ease:'back.out(1.8)'},.03);tl.from('${main}',{x:-38,rotation:-4,autoAlpha:0,duration:.58,ease:'back.out(1.35)'},.16);`,
    tech: `tl.from('${ornaments}',{autoAlpha:0,duration:.25,stagger:.08},.04);tl.from('${main}',{clipPath:'inset(0 0 100% 0)',duration:.58,ease:'power3.out'},.12);`,
    collage: `tl.from('${ornaments}',{scale:1.3,rotation:12,autoAlpha:0,duration:.42,stagger:.1,ease:'steps(5)'},.02);tl.from('${main}',{scale:1.08,rotation:-3,autoAlpha:0,duration:.46,ease:'steps(5)'},.18);`,
    brutalist: `tl.from('${ornaments}',{x:120,duration:.28,stagger:.05,ease:'none'},.02);tl.from('${main}',{x:-120,autoAlpha:0,duration:.34,ease:'power4.out'},.1);`,
    organic: `tl.from('${ornaments}',{scale:.55,rotation:-12,autoAlpha:0,duration:1.05,stagger:.08,ease:'power2.out'},.02);tl.from('${main}',{y:22,autoAlpha:0,filter:'blur(8px)',duration:.8,ease:'power2.out'},.18);`,
  };
  const details: Partial<Record<MotionGraphicKind, string>> = {
    data: `tl.from('${chart}',{scaleX:0,duration:.55,stagger:.12,ease:'power3.out'},.35);`,
    comparison: `tl.from('#${id} .vd-compare section',{y:28,autoAlpha:0,duration:.45,stagger:.12,ease:'power3.out'},.3);`,
    line: `tl.from('#${id} .vd-line .path',{strokeDasharray:240,strokeDashoffset:240,duration:.85,ease:'power2.out'},.34);`,
    donut: `tl.from('#${id} .vd-donut .arc',{strokeDasharray:'0 100',duration:.8,ease:'power2.out'},.3);`,
    funnel: `tl.from('#${id} .vd-funnel div',{scaleX:.2,autoAlpha:0,duration:.42,stagger:.12,ease:'power3.out'},.3);`,
    steps: `tl.from('#${id} .vd-steps div',{y:26,autoAlpha:0,duration:.4,stagger:.14,ease:'power3.out'},.3);`,
    timeline: `tl.from('#${id} .vd-timeline>i',{scaleX:0,duration:.55,ease:'power2.out'},.28);tl.from('#${id} .vd-timeline div',{autoAlpha:0,y:18,duration:.35,stagger:.13},.44);`,
    flow: `tl.from('#${id} .vd-flow section, #${id} .vd-flow i',{autoAlpha:0,x:-20,duration:.35,stagger:.1,ease:'power2.out'},.3);`,
    cycle: `tl.from('#${id} .vd-cycle path',{strokeDasharray:300,strokeDashoffset:300,duration:.8,ease:'power2.out'},.3);tl.from('#${id} .vd-cycle span',{scale:.8,autoAlpha:0,duration:.3,stagger:.1},.5);`,
    document: `tl.from('#${id} .vd-document mark',{clipPath:'inset(0 100% 0 0)',duration:.45,ease:'power3.out'},.55);`,
    phone: `tl.from('#${id} .vd-phone-frame',{y:42,rotation:3,autoAlpha:0,duration:.62,ease:'power3.out'},.28);`,
    browser: `tl.from('#${id} .vd-browser-capture main>*',{y:22,autoAlpha:0,duration:.4,stagger:.1,ease:'power3.out'},.3);`,
    map: `tl.from('#${id} .vd-map-canvas .route',{strokeDasharray:700,strokeDashoffset:700,duration:1.05,ease:'power2.out'},.28);tl.from('#${id} .vd-map-canvas circle',{scale:0,transformOrigin:'center',duration:.3,stagger:.18,ease:'back.out(1.8)'},.55);`,
  };
  return `${special[direction]}${details[kind] ?? ""}`;
}
