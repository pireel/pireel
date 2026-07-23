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
  /** This tab's project — sent on connect; the DO hands it to whoever we evict (close reason)
   *  so displacement stays PER-PROJECT: an unrelated-project tab taking the bridge must not
   *  stop this tab's autosave. */
  projectId?: string;
  /** Called when the DO kicks this tab because a newer tab connected (close 4000) ON THE SAME
   *  project — the single-writer demotion signal: the workbench stops cloud autosave on it.
   *  (An empty/unknown evictor project counts as same-project: demote conservatively.) */
  onDisplaced?: () => void;
}

export interface AgentBridgeHandle {
  /** Rejoin the bridge, evicting whoever holds it now (the write-claim half of the
   *  single-writer handover). No-op while this tab is already connected/connecting. */
  reclaim: () => void;
}

export function useAgentBridge(opts: AgentBridgeOpts): AgentBridgeHandle {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const handleRef = useRef<AgentBridgeHandle>({ reclaim: () => {} });

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
      if (optsRef.current.projectId) url.searchParams.set('project', optsRef.current.projectId);
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
        if (ev.code === 4000) {
          // Kicked by a new tab: this page exits the bridge, don't fight for it. reclaim() is the
          // only way back in (user edit intent), so two live tabs never ping-pong evict each other.
          // Demote autosave ONLY on a same-project takeover (close reason = evictor's projectId);
          // an unrelated project taking the tool surface must not stop this project's writes.
          // The cross-project exemption requires a reason that actually LOOKS like a project id —
          // anything else (empty, or an older server's human-readable close message) is unknown
          // and demotes conservatively: over-locking beats a stale tab clobbering the writer.
          const evictorProject = ev.reason;
          const mine = optsRef.current.projectId;
          const crossProject = !!mine && /^p[a-z0-9]{6,}$/.test(evictorProject) && evictorProject !== mine;
          if (!crossProject) optsRef.current.onDisplaced?.();
          return;
        }
        if (!everConnected && retries >= 6) return; // never connected (not logged in, etc.): don't spin
        setTimeout(connect, Math.min(30_000, 1_000 * 2 ** retries++));
      };
    };
    connect();

    handleRef.current.reclaim = () => {
      if (!alive || (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING))) return;
      retries = 0;
      connect();
    };

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
        // Closing a CONNECTING socket logs a scary "closed before established" warning (hit on every
        // dev StrictMode double-mount): let the handshake finish, then close.
        if (ws?.readyState === WebSocket.CONNECTING) {
          const s = ws;
          s.onopen = () => s.close();
        } else ws?.close();
      } catch {
        /* already closed */
      }
    };
  }, []);

  return handleRef.current;
}
