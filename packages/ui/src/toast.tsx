'use client';

/**
 * Lightweight Toast — replaces alert(). No deps, singleton store + useSyncExternalStore.
 *
 * Usage:
 *   import { toast } from './toast';
 *   toast.error('Upload failed, please retry');
 *   toast.success('Saved');
 *
 * Mount <Toaster /> in the root layout (once; mounting more than once shows duplicates).
 */

import { useSyncExternalStore } from 'react';
import { useUiI18n } from './i18n';

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
  /** Manual dismiss is rarely needed; exposed for the few cases wanting a "persistent toast with a button" */
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
  const messages = useUiI18n();
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (items.length === 0) return null;
  return (
    <div className="toast-stack" role="region" aria-label={messages.notifications}>
      {items.map((t) => (
        <div key={t.id} className={`toast toast-${t.level}`} role="alert">
          {t.title && <div className="toast-title">{t.title}</div>}
          <div className="toast-msg">{t.message}</div>
          <button
            type="button"
            className="toast-close"
            onClick={() => dismiss(t.id)}
            aria-label={messages.dismiss}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
