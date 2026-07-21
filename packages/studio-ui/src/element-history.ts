'use client';

/**
 * 组件(生成的叠加 HTML 块)库 —— **云端为准 + localStorage 缓存**(2026-07-18 上云,
 * 跨项目/跨设备复用;此前纯 localStorage,清缓存/换设备全丢)。
 * 读=同步读缓存(面板秒开),syncElementEntries 拉云端合并回写;写=缓存+fire-and-forget
 * 上云(providers.elements;OSS 壳缺省=纯本地,行为与上云前一致)。
 * innerHtml 数 KB 一条,缓存 cap 防撑爆配额(云端上限 200 在服务端)。
 */

import { studioProviders, type StoredElement } from '@pireel/studio-engine/providers';

export interface GenElementResult {
  /** 生成时的种子块 id(选择器作用域);插入时用它重作用域成新 id */
  seedId: string;
  innerHtml: string;
  timelineBody: string;
  label: string;
  /** 预置组件带上来源 id(落进块 slots):「同步内容」据此重建带节拍的时间轴。 */
  presetId?: string;
  /** 设计标定尺寸(主题组件=1920×1080):插入时按此 cq 化并选画布内适配窗,不满屏铺。 */
  designW?: number;
  designH?: number;
}

export interface ElementEntry {
  id: string;
  prompt: string;
  createdAt: number;
  element: GenElementResult;
}

const ELS_KEY = 'studio:gen-elements:v1';
const ELS_CAP = 60;

interface RawEntry {
  id?: string;
  type?: string;
  status?: string;
  prompt?: string;
  createdAt?: number;
  element?: GenElementResult;
}

export function loadElementEntries(): ElementEntry[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(ELS_KEY) ?? '[]') as RawEntry[];
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((e) => e.element && (e.type === undefined || e.type === 'element') && (e.status === undefined || e.status === 'succeeded'))
      .map((e) => ({ id: e.id ?? '', prompt: e.prompt ?? '', createdAt: e.createdAt ?? 0, element: e.element! }))
      .filter((e) => e.id);
  } catch {
    return [];
  }
}

export function saveElementEntries(entries: ElementEntry[]): void {
  try {
    // 存成生成面板历史同款形态(带 type/status,老读取方直接兼容)
    const done = entries.slice(-ELS_CAP).map((e) => ({ ...e, type: 'element', status: 'succeeded' }));
    window.localStorage.setItem(ELS_KEY, JSON.stringify(done));
  } catch {
    /* 配额/隐私模式忽略 */
  }
}

const toWire = (e: ElementEntry): StoredElement => ({ id: e.id, prompt: e.prompt, label: e.element.label, createdAt: e.createdAt, element: e.element });

/** 单条上云(fire-and-forget;OSS 壳无 provider = no-op)。 */
export function pushElementToCloud(e: ElementEntry): void {
  void studioProviders().elements?.save(toWire(e)).catch(() => {});
}

/** 云端同步:云端为准,本地独有的(离线新增/上云前的历史)回填上云;合并结果写回
 *  缓存并返回(时间升序,与缓存序一致)。没配 provider / 拉取失败返回 null(用缓存)。 */
export async function syncElementEntries(): Promise<ElementEntry[] | null> {
  const store = studioProviders().elements;
  if (!store) return null;
  const cloud = await store.list().catch(() => null);
  if (!cloud) return null;
  const cloudEntries: ElementEntry[] = cloud
    .filter((c) => c.element && typeof c.element.innerHtml === 'string')
    .map((c) => ({ id: c.id, prompt: c.prompt, createdAt: c.createdAt, element: c.element }));
  const cloudIds = new Set(cloudEntries.map((e) => e.id));
  const localOnly = loadElementEntries().filter((e) => !cloudIds.has(e.id));
  for (const e of localOnly) pushElementToCloud(e); // 一次性回填:上云前的本地历史不丢
  const merged = [...cloudEntries, ...localOnly].sort((a, b) => a.createdAt - b.createdAt);
  saveElementEntries(merged);
  return merged.slice(-ELS_CAP);
}

/** 画布上的组件存回素材库(浮动条「存为组件」):追加一条(同 id 覆盖),超 cap 挤掉最老的。 */
export function addElementEntry(entry: ElementEntry): void {
  saveElementEntries([...loadElementEntries().filter((e) => e.id !== entry.id), entry]);
  pushElementToCloud(entry);
}

export function removeElementEntry(id: string): void {
  saveElementEntries(loadElementEntries().filter((e) => e.id !== id));
  void studioProviders().elements?.remove(id).catch(() => {});
}
