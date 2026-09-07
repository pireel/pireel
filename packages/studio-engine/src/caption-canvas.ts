import type { CaptionStyle } from './composition-core';
import { getCaptionPreset, BASE_CAPTION_FONT_PX } from './caption-presets';
import { captionCanvasFontFamilies, captionLineSegments } from './caption-layout-metrics';
import { latinJoin, type FxWord } from './caption-fx';

export function captionWordHighlighted(words: readonly FxWord[], index: number, time: number, keywords: boolean): boolean {
  const word = words[index];
  if (!word) return false;
  if (keywords) return word.emphasis === true;
  return word.timing !== 'estimated' && time >= word.start && time < (words[index + 1]?.start ?? word.end);
}

/** Canvas view of the same caption preset, font metrics, source word times and appearance overrides. */
export function drawPresetCaption(ctx: CanvasRenderingContext2D, words: FxWord[], style: Partial<CaptionStyle>, time: number, width: number, height: number) {
  if (!words.length) return;
  const base = getCaptionPreset(style.preset);
  const preset = { ...base, ...(style.color ? { text: style.color } : {}), ...(style.bg !== undefined ? { bg: style.bg ?? undefined } : {}), ...(style.accentColor ? { emphasis: style.accentColor, decoColor: style.accentColor } : {}) };
  const scale = style.scale ?? 1;
  const size = Math.max(10, Math.round(BASE_CAPTION_FONT_PX * scale));
  const font = `${preset.italic ? 'italic ' : ''}${style.bold ? 800 : 500} ${size}px ${captionCanvasFontFamilies(preset, style.font)}`;
  const lines = captionLineSegments(words, preset, style.wPct ?? 84, scale, width, { bold: style.bold, font: style.font, measureText: (text, face) => { ctx.font = face; return ctx.measureText(text).width; } });
  ctx.save(); ctx.font = font; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const paddingX = preset.bg ? Math.round(size * .42) : 0;
  const paddingY = preset.bg ? Math.round(size * .22) : 0;
  const lineHeight = size * 1.35 + paddingY * 2;
  const gap = size * .15;
  let y = height * (style.yPct ?? 86) / 100 - lines.length * lineHeight - Math.max(0, lines.length - 1) * gap;
  // Style previews keep the line visible while the active word advances.
  ctx.globalAlpha = 1;
  let index = 0;
  for (const line of lines) {
    const widths = line.map((word) => ctx.measureText(word.text).width);
    const spaces = line.map((word, i) => i < line.length - 1 && latinJoin(word.text, line[i + 1]!.text) ? Math.round(size * .3) : 0);
    const total = widths.reduce((sum, value, i) => sum + value + spaces[i]!, 0);
    let x = width * (style.xPct ?? 50) / 100 - total / 2;
    if (preset.bg) { ctx.fillStyle = preset.bg; ctx.beginPath(); ctx.roundRect(x - paddingX, y, total + paddingX * 2, lineHeight, size * .28); ctx.fill(); }
    const baseline = y + lineHeight / 2 - size * .04;
    line.forEach((word, i) => {
      const active = preset.mode === 'emphasis' && captionWordHighlighted(words, index++, time, preset.id === 'kw-yellow');
      if (active && preset.deco) {
        ctx.fillStyle = preset.decoColor ?? preset.emphasis ?? preset.text;
        if (preset.deco === 'underline') ctx.fillRect(x, baseline + size * .59, widths[i]!, Math.max(3, size * .08));
        else { ctx.beginPath(); ctx.roundRect(x - size * .12, baseline - size * .6, widths[i]! + size * .24, size * 1.2, size * .16); ctx.fill(); }
      }
      ctx.fillStyle = active && preset.emphasis ? preset.emphasis : preset.text;
      if (!preset.bg) { ctx.shadowColor = 'rgba(0,0,0,.85)'; ctx.shadowBlur = size * .15; ctx.shadowOffsetY = 2; }
      if (style.strokeWidth) { ctx.strokeStyle = style.strokeColor ?? '#000000'; ctx.lineWidth = style.strokeWidth * scale; ctx.strokeText(word.text, x, baseline); }
      ctx.fillText(word.text, x, baseline);
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      x += widths[i]! + spaces[i]!;
    });
    y += lineHeight + gap;
  }
  ctx.restore();
}
