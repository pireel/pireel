/**
 * StudioBridge —— 外部 agent(Codex/Claude Code 经 /api/studio/mcp)与打开着的
 * studio 标签页之间的桥。每用户一个 Durable Object 实例(idFromName(userId))。
 *
 * 为什么是桥而不是服务端执行:studio 的工具执行深植浏览器(runStudioTool 闭包
 * React 状态、analyze_visual 跑 MediaPipe、预览 iframe)。桥让 MCP 契约面稳定,
 * 执行器留在浏览器——将来要服务端化只换 /call 的去向,不动外部契约。
 *
 * 协议:
 *   /ws   浏览器 WebSocket(session 已在 server.ts 验过)。单活跃 socket——
 *         新 studio 标签页顶掉旧的,保证一次工具调用只执行一遍。
 *   /call POST { tool, input, timeoutMs } → 转发给 socket,等 {id,...} 回执。
 *         无 socket = 409 studio_not_open;超时 = ok:false tool_timeout。
 *
 * 挂起的 /call 请求让 DO 不会中途休眠(in-flight fetch 阻止 hibernation),
 * 所以 pending Map 放内存是安全的。ping/pong 走 auto-response,休眠中也不吵醒。
 *
 * 不 import cloudflare:workers(与 server-context 同一理由:模块要能被 vitest
 * 加载)——用最小本地类型,运行时形状由 workerd 保证。
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

/** 浏览器回执(StudioToolResult + 透传字段);get_state 时带 state。 */
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
    // ping/pong 保活:auto-response 在 DO 休眠中也能应答,不产生唤醒计费
    const Pair = (globalThis as Record<string, unknown>).WebSocketRequestResponsePair as
      | (new (req: string, res: string) => unknown)
      | undefined;
    if (Pair && state.setWebSocketAutoResponse) state.setWebSocketAutoResponse(new Pair('ping', 'pong'));
  }

  /** 接入新的浏览器 socket。单活跃:新标签页顶旧——两个 socket 会让"发给谁执行"变成竞态。 */
  acceptBrowserSocket(server: unknown): void {
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.close(4000, 'replaced by a newer studio tab');
      } catch {
        /* 已死的 socket,忽略 */
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
      // 101 升级响应只有 workerd 能构造(Node Response 拒绝 <200);单测测 acceptBrowserSocket
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
          // getWebSockets 顺序无保证,但单活跃策略下最多一个存活
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
      // auto-response 不可用时的兜底
      try {
        (ws as BridgeSocket).send('pong');
      } catch {
        /* socket 已死 */
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
    if (!p) return; // 已超时的迟到回执
    this.pending.delete(m.id);
    clearTimeout(p.timer);
    const { id: _drop, ...result } = m;
    p.resolve(result);
  }

  webSocketClose(): void {
    // 标签页关闭:挂起的调用让浏览器无法回执,立即失败比等超时对 agent 更友好
    if (!this.state.getWebSockets().length) {
      for (const [id, p] of this.pending) {
        clearTimeout(p.timer);
        p.resolve({ ok: false, error: 'studio_tab_closed' });
        this.pending.delete(id);
      }
    }
  }
}
