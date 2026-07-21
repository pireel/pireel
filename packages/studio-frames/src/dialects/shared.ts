/**
 * frame 方言的共用块构造器:每个 frame 一个文件,导出
 *   export const cover: () => Block                 // 列表封面(主题名当主角)
 *   export const blocks: Record<string, () => Block> // showcase 词 → 真实示例块
 * 统一约定:1920×1080 画布;样式只用主题 token(var(--paper/--panel/--panel-2/--fg/
 * --muted/--accent/--accent-2/--line/--grid/--radius/--shadow/--glow/--font-head/--font-num));
 * 选择器一律 #\${id} 作用域;GSAP 动效 1.2s 内落定(预览定格在 ~2.55s);
 * GSAP 不能选伪元素;custom 块与 agent 生成同契约(innerHtml + timelineBody)。
 */

import { type Block, blockId } from '@pireel/studio-engine/composition';
import { studioLocale } from '@pireel/studio-engine/i18n';

export type { Block };

type Html = (id: string) => string;

export function mk(prefix: string, label: string, html: Html, tl: Html): Block {
  const id = blockId(prefix);
  return {
    id,
    templateId: 'custom',
    slots: { innerHtml: html(id), timelineBody: tl(id) },
    startSec: 0,
    durationSec: 3,
    trackIndex: 2,
    label,
  };
}

/** 叠加件占位文案:构建期按界面语言二选一(**不走 t()/词典**——插入后即块数据,
 *  不跟语言切换;中英各自母语撰写通用占位,不要求互为翻译,用户定的)。 */
export function txt(zh: string, en: string): string {
  return studioLocale() === 'en' ? en : zh;
}
