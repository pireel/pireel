'use client';

/**
 * 轻量 Toast —— 替代 alert()。无依赖，singleton store + useSyncExternalStore。
 *
 * 用法：
 *   import { toast } from './toast';
 *   toast.error('上传失败，请重试');
 *   toast.success('已保存');
 *
 * 在 root layout 里挂 <Toaster />（一次即可，多挂会显示多份）。
 */

import { useSyncExternalStore } from 'react';

type Level = 'info' | 'success' | 'error' | 'warn';

interface ToastItem {
  id: string;
  level: Level;
  title?: string;
  message: string;
}

const listeners = new Set<() => void>();
let queue: ToastItem[] = [];
const DEFAULT_TTL_MS = 4000;

function emit() {
  for (const l of listeners) l();
}

function dismiss(id: string) {
  queue = queue.filter((x) => x.id !== id);
  emit();
}

function push(item: Omit<ToastItem, 'id'>, ttl = DEFAULT_TTL_MS) {
  const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  queue = [...queue, { id, ...item }];
  emit();
  if (ttl > 0) {
    setTimeout(() => dismiss(id), ttl);
  }
}

export const toast = {
  info: (message: string, title?: string) => push({ level: 'info', message, title }),
  success: (message: string, title?: string) => push({ level: 'success', message, title }),
  error: (message: string, title?: string) => push({ level: 'error', message, title }),
  warn: (message: string, title?: string) => push({ level: 'warn', message, title }),
  /** 手动 dismiss 用得不多，先暴露给少数需要"持久 toast 配按钮"的场景 */
  dismiss,
};

const EMPTY: ToastItem[] = [];
function getSnapshot() {
  return queue;
}
function getServerSnapshot() {
  return EMPTY;
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function Toaster() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (items.length === 0) return null;
  return (
    <div className="toast-stack" role="region" aria-label="通知">
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.level}`} role="alert">
          {t.title && <div className="toast-title">{t.title}</div>}
          <div className="toast-msg">{t.message}</div>
          <button
            type="button"
            className="toast-close"
            onClick={() => dismiss(t.id)}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
