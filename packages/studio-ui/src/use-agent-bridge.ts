/**
 * 外部 agent 桥(浏览器侧)—— 连 /api/studio/bridge(StudioBridge DO),
 * 让 Codex/Claude Code 经 /api/studio/mcp 驱动本标签页的 runStudioTool。
 *
 * 语义:
 *  - 串行执行:外部调用排队跑,不与彼此并发改 comp(与内部 chat 的 onToolCall
 *    同一执行面,undo 快照/生成锁都在 runStudioTool 里,无需另做)。
 *  - get_state 特殊处理:局势快照在浏览器,直接回 <composition_state> 文本。
 *  - 单活跃标签:DO 侧新连接顶旧连接(close 4000),被顶的这边不再重连。
 *  - 重连退避 1s→30s;从未连上过(未登录/无 DO)连 6 次就放弃,不空转。
 *  - 'ping' 25s 保活(DO auto-response 应答,不吵醒休眠实例)。
 */

import { useEffect, useRef } from 'react';
import type { StudioToolResult } from '@pireel/studio-engine/prompts';

export interface AgentBridgeOpts {
  /** 执行一个工具(与内部 chat 完全同一 runStudioTool)。 */
  runTool: (tool: string, input: Record<string, unknown>) => Promise<StudioToolResult>;
  /** 当前局势快照(get_state 的回执正文)。 */
  getState: () => string;
  /** 外部调用完成的回调(UI 反馈用,如 toast)。 */
  onExternalCall?: (tool: string, result: StudioToolResult) => void;
}

export function useAgentBridge(opts: AgentBridgeOpts): void {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let alive = true;
    let retries = 0;
    let everConnected = false;
    let queue: Promise<void> = Promise.resolve();

    const connect = () => {
      if (!alive) return;
      const url = new URL('/api/studio/bridge', location.href);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      let sock: WebSocket;
      try {
        sock = new WebSocket(url);
      } catch {
        return; // 环境不支持,放弃
      }
      ws = sock;
      sock.onopen = () => {
        everConnected = true;
        retries = 0;
      };
      sock.onmessage = (ev) => {
        if (typeof ev.data !== 'string' || ev.data === 'pong') return;
        let m: { id?: string; tool?: string; input?: Record<string, unknown> };
        try {
          m = JSON.parse(ev.data) as typeof m;
        } catch {
          return;
        }
        if (!m.id || !m.tool) return;
        const { id, tool, input } = m as { id: string; tool: string; input?: Record<string, unknown> };
        queue = queue.then(async () => {
          let out: StudioToolResult & { state?: string };
          try {
            out = tool === 'get_state' ? { ok: true, state: optsRef.current.getState() } : await optsRef.current.runTool(tool, input ?? {});
          } catch (e) {
            out = { ok: false, error: e instanceof Error ? e.message : String(e) };
          }
          try {
            sock.send(JSON.stringify({ id, ...out }));
          } catch {
            /* socket 已死,DO 侧会超时/失败 */
          }
          optsRef.current.onExternalCall?.(tool, out);
        });
      };
      sock.onclose = (ev) => {
        if (ws === sock) ws = null;
        if (!alive) return;
        if (ev.code === 4000) return; // 被新标签页顶掉:本页退出桥,不抢
        if (!everConnected && retries >= 6) return; // 从未连上(未登录等):别空转
        setTimeout(connect, Math.min(30_000, 1_000 * 2 ** retries++));
      };
    };
    connect();

    const ping = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        try {
          ws.send('ping');
        } catch {
          /* onclose 会接手重连 */
        }
      }
    }, 25_000);

    return () => {
      alive = false;
      clearInterval(ping);
      try {
        ws?.close();
      } catch {
        /* 已关 */
      }
    };
  }, []);
}
