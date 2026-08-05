import { artElement, type ArtDirectedElementSpec } from './shared';

export const ACCENT_ELEMENT_PRESETS: Record<string, ArtDirectedElementSpec> = {
  'el-callout': artElement(
    'tpl_callout',
    'pe_callout',
    `<div class="callout"><i>!</i><div><b data-edit="title" data-edit-max="16">WATCH THIS</b><span data-edit="note" data-edit-max="24">One decisive insight</span></div></div>`,
    `#tpl_callout .callout{position:absolute;left:12px;right:12px;top:50%;display:flex;align-items:center;gap:6px;transform:translateY(-50%);border:2px solid #171717;border-radius:6px;background:#ffe34f;padding:7px;color:#171717;box-shadow:3px 3px 0 #171717}
#tpl_callout .callout>i{display:flex;width:22px;height:22px;flex:none;align-items:center;justify-content:center;border-radius:50%;background:#171717;color:#fff;font-size:10px;font-style:normal;font-weight:900}
#tpl_callout .callout>div{min-width:0}#tpl_callout .callout b{display:block;overflow:hidden;font-size:7px;text-overflow:ellipsis;white-space:nowrap}#tpl_callout .callout span{display:block;overflow:hidden;font-size:5.5px;text-overflow:ellipsis;white-space:nowrap;opacity:.65}`,
    `tl.from('#tpl_callout .callout',{scale:.7,rotation:-5,autoAlpha:0,duration:.3,ease:'back.out(1.7)'},0);`,
  ),
  'el-keyword': artElement(
    'tpl_keyword',
    'pe_slam',
    `<div class="keyword" data-edit="keyword" data-edit-max="12">FOCUS</div><div class="note" data-edit="note" data-edit-max="18">CUT THE NOISE</div>`,
    `#tpl_keyword .keyword{position:absolute;left:8px;top:10px;max-width:92px;overflow:hidden;transform:rotate(-2deg);background:#ff4f95;padding:4px 8px;color:#fff;font-size:15px;font-weight:900;line-height:1;text-overflow:ellipsis;white-space:nowrap;box-shadow:3px 3px 0 #1b1b1b}
#tpl_keyword .note{position:absolute;right:8px;bottom:9px;max-width:96px;overflow:hidden;transform:rotate(2deg);background:#cfff52;padding:4px 8px;color:#1b1b1b;font-size:6px;font-weight:900;text-overflow:ellipsis;white-space:nowrap;box-shadow:2px 2px 0 #1b1b1b}`,
    `tl.from('#tpl_keyword .keyword',{scale:1.8,rotation:-10,autoAlpha:0,duration:.26,ease:'power4.in'},0);
tl.from('#tpl_keyword .note',{x:6,y:3,rotation:9,autoAlpha:0,duration:.26,ease:'back.out(1.7)'},.3);`,
  ),
  'el-chapter': artElement(
    'tpl_chapter',
    'pe_chap',
    `<div class="number" data-edit="number" data-edit-max="4">02</div><div class="copy"><b data-edit="title" data-edit-max="24">THE NEXT<br>CHAPTER</b><span data-edit="subtitle" data-edit-max="24">A NEW DIRECTION</span></div>`,
    `#tpl_chapter .artboard{background:#d8ff54;color:#18233a}
#tpl_chapter .number{position:absolute;left:6px;bottom:4px;max-width:46px;overflow:hidden;font-size:44px;font-weight:900;line-height:1;letter-spacing:-.1em;white-space:nowrap}
#tpl_chapter .copy{position:absolute;left:58px;right:6px;top:17px;overflow:hidden;border-left:2px solid #18233a;padding-left:6px;color:#18233a}
#tpl_chapter .copy b{display:block;max-height:22px;overflow:hidden;font-size:9px;line-height:1.05;overflow-wrap:anywhere}#tpl_chapter .copy span{display:block;overflow:hidden;margin-top:4px;font-size:5px;font-weight:700;text-overflow:ellipsis;white-space:nowrap;opacity:.6}`,
    `tl.from('#tpl_chapter .number',{x:-6,autoAlpha:0,duration:.3,ease:'power3.out'},0);
tl.from('#tpl_chapter .copy',{x:5,autoAlpha:0,duration:.3,ease:'power3.out'},.16);`,
  ),
  'el-comment': artElement(
    'tpl_comment',
    'pe_cmt',
    `<div class="bubble first"><i></i><b data-edit="comment1" data-edit-max="40">This makes it click.</b></div><div class="bubble second"><i></i><b data-edit="comment2" data-edit-max="40">Exactly what I needed.</b></div>`,
    `#tpl_comment .artboard{background:#cfe9ff;color:#213150}
#tpl_comment .bubble{position:absolute;display:flex;align-items:center;gap:6px;border-radius:8px;padding:6px;box-shadow:0 3px 10px rgba(27,44,89,.16)}
#tpl_comment .bubble i{width:16px;height:16px;flex:none;border-radius:50%;background:#ff765d}#tpl_comment .bubble b{min-width:0;overflow:hidden;font-size:6px;font-weight:700;text-overflow:ellipsis;white-space:nowrap}
#tpl_comment .first{left:8px;top:8px;max-width:92px;border-bottom-left-radius:2px;background:#fff}
#tpl_comment .second{right:8px;bottom:8px;max-width:100px;border-bottom-right-radius:2px;background:#3157da;color:#fff;box-shadow:0 3px 10px rgba(27,44,89,.2)}#tpl_comment .second i{background:#d8ff54}`,
    `tl.from('#tpl_comment .first',{x:-7,autoAlpha:0,duration:.3,ease:'back.out(1.5)'},0);
tl.from('#tpl_comment .second',{x:7,autoAlpha:0,duration:.3,ease:'back.out(1.5)'},.22);`,
  ),
};
