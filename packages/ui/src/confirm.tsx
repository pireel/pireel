'use client';

/**
 * 全局自定义 confirm —— 替代浏览器 `window.confirm()`。
 *
 * 用法：
 *   import { confirm } from './confirm';
 *   if (!(await confirm({ title: '确认删除？', tone: 'danger' }))) return;
 *
 * 设计：singleton 队列 + Promise；mount `<ConfirmHost />` 一次（root layout）。
 * 同一时刻只显示一个；并发调用排队执行。Escape = 取消，Enter = 确认。
 */

import { useEffect, useSyncExternalStore } from 'react';
import { ConfirmDialog } from './confirm-dialog';

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' 把确认按钮染红，用于删除 / 撤销等破坏性操作 */
  tone?: 'default' | 'danger';
}

interface Pending {
  id: string;
  options: ConfirmOptions;
  resolve: (v: boolean) => void;
}

const listeners = new Set<() => void>();
let queue: Pending[] = [];

function emit() {
  for (const l of listeners) l();
}

export function confirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const id = `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    queue = [...queue, { id, options, resolve }];
    emit();
  });
}

function settle(id: string, value: boolean) {
  const pending = queue.find((p) => p.id === id);
  if (!pending) return;
  queue = queue.filter((p) => p.id !== id);
  emit();
  pending.resolve(value);
}

const EMPTY: Pending[] = [];
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function getSnapshot() {
  return queue;
}
function getServerSnapshot() {
  return EMPTY;
}

/**
 * Root host —— 同时显示队首一条，确认 / 取消后 resolve 对应 Promise 再取下一条。
 * mount 一次即可（root layout）。多挂会重复显示。
 */
export function ConfirmHost() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const current = items[0];

  // 卸载时把残留的 pending 都 resolve(false)，避免组件烧掉留 dangling promise
  useEffect(() => {
    return () => {
      for (const p of queue) p.resolve(false);
      queue = [];
    };
  }, []);

  if (!current) return null;
  return (
    <ConfirmDialog
      open
      title={current.options.title}
      description={current.options.description}
      confirmLabel={current.options.confirmLabel}
      cancelLabel={current.options.cancelLabel}
      tone={current.options.tone}
      onCancel={() => settle(current.id, false)}
      onConfirm={() => settle(current.id, true)}
    />
  );
}
