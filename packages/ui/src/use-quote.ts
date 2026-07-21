'use client';

import { useEffect, useState } from 'react';

/**
 * useQuote —— 给 /image /video 工作室"生成按钮旁的预估积分"用。
 *
 * 监听 params 变化时 debounce 拉 /api/billing/quote 拿当前积分预算。
 * model_id 缺时返回 null（前端按钮就只显示「生成」而不带预估）。
 *
 * 入参 deep compare 用 JSON.stringify——只支持可序列化对象，对当前 schema 够用。
 */

export interface UseQuoteArgs {
  toolId: string;
  /** image-gen / video-gen 必传；其他 tool 可空。 */
  modelId?: string;
  params: Record<string, unknown>;
  /** 防抖延迟（ms）。默认 250。 */
  debounceMs?: number;
}

export function useQuote(args: UseQuoteArgs): number | null {
  const { toolId, modelId, params, debounceMs = 250 } = args;
  const [credits, setCredits] = useState<number | null>(null);
  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    if (toolId === 'image-gen' || toolId === 'video-gen') {
      if (!modelId) {
        setCredits(null);
        return;
      }
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/billing/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tool_id: toolId, model_id: modelId, params }),
        });
        if (!res.ok) return;
        const j = (await res.json()) as { credits?: number };
        if (!cancelled && typeof j.credits === 'number') setCredits(j.credits);
      } catch {
        // 静默——预估失败不阻挡用户提交
      }
    }, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolId, modelId, paramsKey, debounceMs]);

  return credits;
}
