/**
 * studio 轻量 i18n 核心(引擎/编辑器包共用,零依赖):
 *
 * - **中文串即 key**:源码里保留中文原文(单一事实源),en 词典做 zh→en 映射;
 *   查不到回落中文,永不炸 UI。词典按包注册(registerEnMessages),分文件维护。
 * - locale 由壳注入(托管壳=路由 $locale;OSS 壳自定,默认 en)——**渲染前设一次**,
 *   不做运行时响应式(切语言=换路由整页重来,与应用路由行为一致)。
 * - 插值:`t('已铺 {n} 条', { n })`,{name} 占位。
 * - **只用于客户端 UI 字符**:服务端(Worker)是跨请求共享模块作用域,这个全局
 *   locale 在那不安全——server-tools/MCP 回执不走这里。
 * - 模块作用域禁止调 t()(壳还没注入 locale):常量存中文,渲染/使用点再包。
 */

export type StudioLocale = 'zh' | 'en';

let locale: StudioLocale = 'zh';
const EN: Record<string, string> = {};
/** en 缺词收集(探针/自检读,不刷控制台)。 */
export const missingEn = new Set<string>();

export function setStudioLocale(l: StudioLocale): void {
  locale = l;
}
export function studioLocale(): StudioLocale {
  return locale;
}

/** 各包把自己的 en 词典并进来(在包的 i18n 入口模块体调,消费 t 即触发注册)。 */
export function registerEnMessages(dict: Record<string, string>): void {
  Object.assign(EN, dict);
}

export function t(zh: string, vars?: Record<string, string | number>): string {
  let msg = zh;
  if (locale === 'en') {
    const hit = EN[zh];
    if (hit !== undefined) msg = hit;
    else missingEn.add(zh);
  }
  return vars ? msg.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : msg;
}

import { EN_ENGINE } from './messages-en';
registerEnMessages(EN_ENGINE);
