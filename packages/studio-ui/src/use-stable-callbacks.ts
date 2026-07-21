'use client';

/**
 * 把一组每次渲染都重建的回调,包成**身份恒定**的 wrapper(内部经 ref 永远调到最新实现)。
 *
 * 用途:给 React.memo 的重子组件(时间轴/chat)喂回调 props——实现可以随便用最新
 * state/闭包重建,wrapper 身份不变,memo 的浅比较才拦得住无关重渲。
 * 键集合必须固定(首次渲染就定型);新增回调 = 新增键,别条件性增删。
 */

import { useRef, useState } from 'react';

/** 泛型回调表要容纳任意签名,any 是这里的正确工具。 */
type AnyFnMap = Record<string, (...args: any[]) => any>;

export function useStableCallbacks<T extends AnyFnMap>(impl: T): T {
  const ref = useRef(impl);
  ref.current = impl;
  const [stable] = useState(() => {
    const out = {} as AnyFnMap;
    for (const key of Object.keys(impl)) {
      out[key] = (...args) => ref.current[key]!(...args);
    }
    return out as T;
  });
  return stable;
}
