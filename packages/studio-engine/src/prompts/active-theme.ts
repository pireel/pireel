/**
 * ACTIVE THEME 包裹段:把当前主题简报(themeForLlm 产物)接到 system 末尾。
 * compose / plan 两份措辞;plan 那份此前在 lib 单发路径和 route 工具环路径各内联一份
 * 已在漂移边缘 —— 一律走这里,别再内联。变量注入 = 函数参数 + 原生 ${},TS 编译期兜底。
 */

/** compose:预设 only,只选不造。 */
export function withActiveTheme(system: string, theme?: string): string {
  if (!theme) return system;
  return `${system}

=== ACTIVE THEME (preset design system) ===
Compose strictly within this theme. Use its tokens via var(--name); do NOT invent new palettes, fonts, or backgrounds. Select and arrange within it — protect the aesthetic.

${theme}`;
}

/** plan:「片子已在用这个预设,按它的调性规划」。 */
export function planWithActiveTheme(system: string, theme?: string): string {
  if (!theme) return system;
  return `${system}

=== ACTIVE THEME (the video already uses this preset; plan within its tone) ===
${theme}`;
}
