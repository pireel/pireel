/**
 * StudioBridge — bridge between an external agent (Codex/Claude Code via
 * /api/studio/mcp) and an open studio tab. One Durable Object per user
 * (idFromName(userId)).
 *
 * Why a bridge and not server-side execution: studio tool execution is deeply
 * tied to the browser (runStudioTool closes over React state, analyze_visual
 * runs MediaPipe, the preview iframe). The bridge keeps the MCP contract stable
 * with the executor in the browser — to move it server-side later, only change
 * where /call routes, not the external contract.
 *
 * Protocol:
 *   /ws   browser WebSocket (session already verified in server.ts). Single
 *         active socket — a new studio tab evicts the old one, guaranteeing each
 *         tool call runs exactly once.
 *   /call POST { tool, input, timeoutMs } → forwarded to the socket, awaits the
 *         {id,...} reply. No socket = 409 studio_not_open; timeout = ok:false
 *         tool_timeout.
 *
 * A pending /call keeps the DO from hibernating mid-flight (in-flight fetch
 * blocks hibernation), so keeping the pending Map in memory is safe. ping/pong
 * uses auto-response and won't wake it.
 *
 * Doesn't import cloudflare:workers (same reason as server-context: the module
 * must be loadable by vitest) — uses minimal local types; runtime shape is
 * guaranteed by workerd.
 */

interface BridgeSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

interface BridgeState {
  acceptWebSocket(ws: unknown): void;
  getWebSockets(): BridgeSocket[];
  setWebSocketAutoResponse?(pair: unknown): void;
}

/** Browser reply (StudioToolResult + pass-through fields); carries state on get_state. */
export interface BridgeResult {
  ok: boolean;
  summary?: string;
  error?: string;
  data?: unknown;
  state?: string;
}

interface BridgeCallBody {
  tool?: string;
  input?: Record<string, unknown>;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;

export class StudioBridge {
  private pending = new Map<string, { resolve: (r: BridgeResult) => void; timer: ReturnType<typeof setTimeout> }>();
  private seq = 0;

  constructor(private state: BridgeState) {
    // ping/pong keepalive: auto-response replies even while the DO hibernates, with no wake billing
    const Pair = (globalThis as Record<string, unknown>).WebSocketRequestResponsePair as
      | (new (req: string, res: string) => unknown)
      | undefined;
    if (Pair && state.setWebSocketAutoResponse) state.setWebSocketAutoResponse(new Pair('ping', 'pong'));
  }

  /** Accept a new browser socket. Single active: a new tab evicts the old — two sockets would make "which one executes" a race. */
  acceptBrowserSocket(server: unknown): void {
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.close(4000, 'replaced by a newer studio tab');
      } catch {
        /* dead socket, ignore */
      }
    }
    this.state.acceptWebSocket(server);
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('expected websocket', { status: 426 });
      }
      const pair = new ((globalThis as Record<string, unknown>).WebSocketPair as new () => Record<0 | 1, unknown>)();
      this.acceptBrowserSocket(pair[1]);
      // Only workerd can build a 101 upgrade response (Node Response rejects <200); unit tests cover acceptBrowserSocket
      return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit);
    }

    if (url.pathname === '/call' && req.method === 'POST') {
      let body: BridgeCallBody;
      try {
        body = (await req.json()) as BridgeCallBody;
      } catch {
        return Response.json({ ok: false, error: 'invalid_json' }, { status: 400 });
      }
      if (!body.tool) return Response.json({ ok: false, error: 'tool_required' }, { status: 400 });
      const sockets = this.state.getWebSockets();
      if (!sockets.length) {
        return Response.json(
          { ok: false, error: 'studio_not_open', hint: 'Ask the user to open their Pireel studio project in a browser tab, then retry.' },
          { status: 409 },
        );
      }
      const id = `c${++this.seq}`;
      const timeoutMs = Math.min(Math.max(body.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1_000), 600_000);
      const result = await new Promise<BridgeResult>((resolve) => {
        const timer = setTimeout(() => {
          this.pending.delete(id);
          resolve({ ok: false, error: `tool_timeout after ${Math.round(timeoutMs / 1000)}s` });
        }, timeoutMs);
        this.pending.set(id, { resolve, timer });
        try {
          // getWebSockets order is unspecified, but single-active means at most one is alive
          sockets[sockets.length - 1]!.send(JSON.stringify({ id, tool: body.tool, input: body.input ?? {} }));
        } catch {
          clearTimeout(timer);
          this.pending.delete(id);
          resolve({ ok: false, error: 'bridge_send_failed' });
        }
      });
      return Response.json(result);
    }

    return new Response('not found', { status: 404 });
  }

  webSocketMessage(ws: unknown, message: string | ArrayBuffer): void {
    if (typeof message !== 'string') return;
    if (message === 'ping') {
      // fallback when auto-response is unavailable
      try {
        (ws as BridgeSocket).send('pong');
      } catch {
        /* socket dead */
      }
      return;
    }
    let m: { id?: string } & BridgeResult;
    try {
      m = JSON.parse(message) as { id?: string } & BridgeResult;
    } catch {
      return;
    }
    if (!m.id) return;
    const p = this.pending.get(m.id);
    if (!p) return; // late reply for an already-timed-out call
    this.pending.delete(m.id);
    clearTimeout(p.timer);
    const { id: _drop, ...result } = m;
    p.resolve(result);
  }

  webSocketClose(): void {
    // Tab closed: pending calls can no longer get a browser reply; failing fast beats waiting for timeout for the agent
    if (!this.state.getWebSockets().length) {
      for (const [id, p] of this.pending) {
        clearTimeout(p.timer);
        p.resolve({ ok: false, error: 'studio_tab_closed' });
        this.pending.delete(id);
      }
    }
  }
}
