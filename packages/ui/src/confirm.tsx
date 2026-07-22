'use client';

/**
 * Global custom confirm — replaces the browser's `window.confirm()`.
 *
 * Usage:
 *   import { confirm } from './confirm';
 *   if (!(await confirm({ title: 'Delete this?', tone: 'danger' }))) return;
 *
 * Design: singleton queue + Promise; mount `<ConfirmHost />` once (root layout).
 * Only one shows at a time; concurrent calls queue up. Escape = cancel, Enter = confirm.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { ConfirmDialog } from './confirm-dialog';

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' turns the confirm button red, for destructive actions like delete / revoke */
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
 * Root host — shows the head of the queue; on confirm/cancel it resolves that Promise and moves to the next.
 * Mount once (root layout). Mounting more than once shows duplicates.
 */
export function ConfirmHost() {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const current = items[0];

  // On unmount, resolve(false) any leftover pending items so nothing is left as a dangling promise
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
