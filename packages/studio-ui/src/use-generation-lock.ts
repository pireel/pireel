'use client';

/**
 * 生成锁:被配图 worker(排队+在跑)/ edit_block 重写 / 编辑器 AI 改 持有的块,
 * 期间禁一切编辑 —— worker 在任务开始就快照了占位的 box/时间窗,中途改动要么喂给
 * 模型旧数据、要么被生成结果整块覆盖。
 *
 * 用法:改动入口统一过 `genIdsRef.current.has(id)`(异步/事件回调里读最新)或
 * `genLockToast(id)`(拦下并提示);UI 渲染态读 `genIds`。单块出结果即时解锁。
 */

import { useCallback, useRef, useState } from 'react';
import { toast } from '@pireel/ui/toast';
import { t } from './i18n';

export function useGenerationLock() {
  const [genIds, setGenIds] = useState<ReadonlySet<string>>(() => new Set());
  const genIdsRef = useRef<ReadonlySet<string>>(genIds);
  const markGenerating = useCallback((ids: readonly string[], on: boolean) => {
    if (!ids.length) return;
    const next = new Set(genIdsRef.current);
    for (const id of ids) {
      if (on) next.add(id);
      else next.delete(id);
    }
    genIdsRef.current = next;
    setGenIds(next);
  }, []);
  /** 时间轴拖动等手势入口:锁中 → toast 拦下,返回 true 表示「别动」。 */
  const genLockToast = useCallback((id: string): boolean => {
    if (!genIdsRef.current.has(id)) return false;
    toast.info(t('这个组件正在生成中，先不能动它'));
    return true;
  }, []);
  return { genIds, genIdsRef, markGenerating, genLockToast };
}
