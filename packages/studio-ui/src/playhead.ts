/**
 * 播放头外部 store —— 播放中每帧变的 t 不再走 React state(整树 60fps 重渲太贵),
 * 只有真正需要连续时间的小组件(走带读数、时间轴光标、当前场景高亮)各自订阅。
 * 粗粒度消费方(调试叠加、liveGeom)仍用 workbench 的 t state(只在 seek/暂停时更新)。
 */

import { useSyncExternalStore } from 'react';

let t = 0;
const subs = new Set<() => void>();

export const playhead = {
  get: (): number => t,
  set(v: number): void {
    if (v === t) return;
    t = v;
    subs.forEach((f) => f());
  },
  subscribe(f: () => void): () => void {
    subs.add(f);
    return () => subs.delete(f);
  },
};

/** 订阅播放头(秒);只在需要每帧跟随的叶子组件里用。 */
export function usePlayheadT(): number {
  return useSyncExternalStore(playhead.subscribe, playhead.get, () => 0);
}
