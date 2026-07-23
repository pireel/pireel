'use client';

/**
 * Generation lock: blocks held by the graphics worker (queued + running) / edit_block rewrite / editor AI
 * edit are locked against all editing — the worker snapshots the placeholder's box/time window when the
 * task starts, so a mid-task edit would either feed the model stale data or be wholly overwritten by the result.
 *
 * Usage: route edit entry points through `genIdsRef.current.has(id)` (read the latest inside async/event
 * callbacks) or `genLockToast(id)` (block and prompt); UI render state reads `genIds`. A block unlocks the
 * instant its result lands.
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
  /** Gesture entry points like timeline drag: if locked → toast blocks it, returns true meaning "don't move". */
  const genLockToast = useCallback((id: string): boolean => {
    if (!genIdsRef.current.has(id)) return false;
    toast.info(t('workbench.elementStillGenerating'));
    return true;
  }, []);
  return { genIds, genIdsRef, markGenerating, genLockToast };
}
