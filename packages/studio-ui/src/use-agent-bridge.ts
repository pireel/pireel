/**
 * External agent bridge (browser side) — connects to /api/studio/bridge (StudioBridge DO),
 * letting Codex/Claude Code drive this tab's runStudioTool via /api/studio/mcp.
 *
 * Semantics:
 *  - Serial execution: external calls queue up, never mutate comp concurrently with each other
 *    (same execution surface as the internal chat's onToolCall; undo snapshots / gen locks all
 *    live inside runStudioTool, nothing extra needed).
 *  - get_state special-cased: the state snapshot is in the browser, return <composition_state> text directly.
 *  - Single active tab: DO side kicks the old connection when a new one arrives (close 4000); the kicked side doesn't reconnect.
 *  - Reconnect backoff 1s→30s; if never connected (not logged in / no DO), give up after 6 tries instead of spinning.
 *  - 'ping' every 25s keep-alive (answered by DO auto-response, doesn't wake a hibernating instance).
 */

import { useEffect, useRef } from 'react';
import type { StudioToolResult } from '@pireel/studio-engine/prompts';

export interface AgentBridgeOpts {
  /** Run one tool (the exact same runStudioTool as the internal chat). */
  runTool: (tool: string, input: Record<string, unknown>) => Promise<StudioToolResult>;
  /** Current state snapshot (the body of get_state's reply). */
  getState: () => string;
  /** Callback when an external call completes (for UI feedback, e.g. toast). */
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
        return; // environment unsupported, give up
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
            /* socket already dead, DO side will time out / fail */
          }
          optsRef.current.onExternalCall?.(tool, out);
        });
      };
      sock.onclose = (ev) => {
        if (ws === sock) ws = null;
        if (!alive) return;
        if (ev.code === 4000) return; // kicked by a new tab: this page exits the bridge, don't fight for it
        if (!everConnected && retries >= 6) return; // never connected (not logged in, etc.): don't spin
        setTimeout(connect, Math.min(30_000, 1_000 * 2 ** retries++));
      };
    };
    connect();

    const ping = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        try {
          ws.send('ping');
        } catch {
          /* onclose will take over reconnecting */
        }
      }
    }, 25_000);

    return () => {
      alive = false;
      clearInterval(ping);
      try {
        ws?.close();
      } catch {
        /* already closed */
      }
    };
  }, []);
}
