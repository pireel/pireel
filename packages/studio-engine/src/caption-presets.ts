/**
 * 花字视觉预设表 —— 对照 Google Vids Captions 的两类字幕(temp/captions.html 扒的实际配色):
 *   emphasis(Word emphasis)= 整句常显,读到哪个词强调哪个词(变色 / 划线 / 底色块);
 *   line(Line by line)= 整句浮现的干净字幕,无逐词动画。
 * Vids 的第三类 Word by word(逐词单显)不做 —— 关键词重击(kinetic-slam)已经占了这个生态位。
 *
 * 预设只管**视觉**(配色/底板/装饰/字体);动画行为由 mode 定,渲染在 templates.renderCaption。
 * 无依赖叶子模块:composition-core / templates / 面板都从这里取,别在各处内联色值。
 */

export type CaptionMode = 'emphasis' | 'line';

export interface CaptionPreset {
  id: string;
  /** 面板上的中文名。 */
  name: string;
  mode: CaptionMode;
  /** 正文字色。 */
  text: string;
  /** 强调词色(emphasis 模式;缺省 = 不变色,靠 deco)。 */
  emphasis?: string;
  /** 整行底板色(圆角横条,CSS color 可带 alpha);缺省 = 裸字。 */
  bg?: string;
  /** 逐词强调装饰:当前词底下滑入划线 / 身后弹出色块。 */
  deco?: 'underline' | 'highlight';
  decoColor?: string;
  /** 字体:缺省主题 sans;serif = 衬线(Noto Serif SC),mono = 等宽(--font-num)。 */
  font?: 'serif' | 'mono';
  /** 裸字时的投影(有底板不需要)。 */
  shadow?: boolean;
  italic?: boolean;
  /** 基准字号 px(1080 宽画布,scale=1)。 */
  size: number;
  weight: number;
}

export const CAPTION_PRESETS: CaptionPreset[] = [
  // —— 逐词强调(Word emphasis)——
  { id: 'em-yellow', name: '白字黄词', mode: 'emphasis', text: '#ffffff', emphasis: '#ffe34f', shadow: true, size: 50, weight: 800 },
  { id: 'em-green', name: '白字荧绿', mode: 'emphasis', text: '#ffffff', emphasis: '#5affb6', shadow: true, size: 50, weight: 800 },
  { id: 'em-purple-black', name: '黑底紫词', mode: 'emphasis', text: '#ffffff', emphasis: '#cf96ff', bg: 'rgba(0,0,0,0.72)', size: 47, weight: 700 },
  { id: 'em-serif-black', name: '黑底青词', mode: 'emphasis', text: '#ffffff', emphasis: '#63ffc7', bg: 'rgba(0,0,0,0.72)', font: 'serif', size: 47, weight: 700 },
  { id: 'em-underline', name: '黑底划线', mode: 'emphasis', text: '#ffffff', bg: 'rgba(0,0,0,0.8)', deco: 'underline', decoColor: '#ffffff', size: 48, weight: 800 },
  { id: 'em-blue-line', name: '灰底蓝线', mode: 'emphasis', text: '#111111', emphasis: '#0059ff', bg: 'rgba(255,255,255,0.78)', deco: 'underline', decoColor: '#0059ff', size: 47, weight: 700 },
  { id: 'em-box-purple', name: '紫底跳块', mode: 'emphasis', text: '#ffffff', bg: 'rgba(118,40,187,0.85)', deco: 'highlight', decoColor: 'rgba(0,0,0,0.4)', size: 45, weight: 800 },
  { id: 'em-box-blue', name: '蓝底黑块', mode: 'emphasis', text: '#ffffff', bg: 'rgba(0,89,255,0.85)', deco: 'highlight', decoColor: '#000000', size: 45, weight: 800 },
  { id: 'em-pink', name: '粉底提白', mode: 'emphasis', text: '#fccfcf', emphasis: '#ffffff', bg: 'rgba(236,137,134,0.85)', size: 47, weight: 800 },
  { id: 'em-gold-serif', name: '米底金字', mode: 'emphasis', text: '#b89d4c', emphasis: '#7f6000', bg: 'rgba(248,233,192,0.85)', font: 'serif', size: 47, weight: 700 },
  // —— 整句字幕(Line by line)——
  { id: 'ln-clean', name: '干净白字', mode: 'line', text: '#ffffff', shadow: true, size: 40, weight: 700 },
  { id: 'ln-black', name: '黑条白字', mode: 'line', text: '#ffffff', bg: 'rgba(0,0,0,0.85)', size: 36, weight: 600 },
  { id: 'ln-navy', name: '蓝灰衬线', mode: 'line', text: '#ffffff', bg: 'rgba(70,80,109,0.85)', font: 'serif', size: 39, weight: 700 },
  { id: 'ln-white', name: '白条蓝字', mode: 'line', text: '#3901ee', bg: 'rgba(255,255,255,0.85)', italic: true, size: 39, weight: 700 },
  { id: 'ln-orange', name: '橙条白字', mode: 'line', text: '#ffffff', bg: 'rgba(255,140,90,0.85)', size: 40, weight: 800 },
  { id: 'ln-yellow', name: '黄条黑字', mode: 'line', text: '#000000', bg: 'rgba(255,227,79,0.85)', size: 39, weight: 700 },
  { id: 'ln-red', name: '红条等宽', mode: 'line', text: '#ffffff', bg: 'rgba(255,0,0,0.85)', font: 'mono', size: 38, weight: 700 },
  { id: 'ln-mint', name: '青字投影', mode: 'line', text: '#63ffc7', shadow: true, size: 40, weight: 800 },
];

export const DEFAULT_CAPTION_PRESET = 'em-yellow';

const BY_ID = new Map(CAPTION_PRESETS.map((p) => [p.id, p]));

/** 取预设;未知 id 落回默认款(别让坏 id 渲空)。 */
export function getCaptionPreset(id: string | undefined): CaptionPreset {
  return (id && BY_ID.get(id)) || BY_ID.get(DEFAULT_CAPTION_PRESET)!;
}
