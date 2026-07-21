import { describe, expect, it, vi } from 'vitest';
import { StudioBridge } from './bridge-do';

/** fake WebSocketPair:DO 在 workerd 里用全局类,测试里桩掉。 */
class FakeSocket {
  sent: string[] = [];
  closed: { code?: number; reason?: string } | null = null;
  send(d: string) {
    this.sent.push(d);
  }
  close(code?: number, reason?: string) {
    this.closed = { code, reason };
  }
}

function makeState() {
  const sockets: FakeSocket[] = [];
  return {
    sockets,
    state: {
      acceptWebSocket: (ws: unknown) => sockets.push(ws as FakeSocket),
      getWebSockets: () => sockets.filter((s) => !s.closed) as unknown as { send(d: string): void; close(c?: number, r?: string): void }[],
      setWebSocketAutoResponse: () => {},
    },
  };
}

/** fetch 内部先 await req.json(),send 不在首个微任务里——轮询等它发生。 */
async function until(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 50 && !cond(); i++) await new Promise((r) => setTimeout(r, 1));
  if (!cond()) throw new Error('condition not met');
}

function callReq(tool: string, timeoutMs?: number) {
  return new Request('https://do/call', { method: 'POST', body: JSON.stringify({ tool, input: { a: 1 }, timeoutMs }) });
}


describe('StudioBridge DO', () => {
  it('无浏览器连接:/call 回 409 studio_not_open', async () => {
    const { state } = makeState();
    const bridge = new StudioBridge(state);
    const resp = await bridge.fetch(callReq('undo'));
    expect(resp.status).toBe(409);
    expect(((await resp.json()) as { error: string }).error).toBe('studio_not_open');
  });

  it('调用→socket 收到 {id,tool,input},回执 resolve 响应', async () => {
    const { state, sockets } = makeState();
    const bridge = new StudioBridge(state);
    bridge.acceptBrowserSocket(new FakeSocket());
    const p = bridge.fetch(callReq('move_block'));
    await until(() => sockets[0]!.sent.length > 0);
    const msg = JSON.parse(sockets[0]!.sent[0]!) as { id: string; tool: string; input: unknown };
    expect(msg.tool).toBe('move_block');
    expect(msg.input).toEqual({ a: 1 });
    bridge.webSocketMessage(sockets[0], JSON.stringify({ id: msg.id, ok: true, summary: '已移动' }));
    const body = (await (await p).json()) as { ok: boolean; summary: string };
    expect(body).toEqual({ ok: true, summary: '已移动' });
  });

  it('超时:期限内无回执 → ok:false tool_timeout;迟到回执被忽略', async () => {
    vi.useFakeTimers();
    try {
      const { state, sockets } = makeState();
      const bridge = new StudioBridge(state);
      bridge.acceptBrowserSocket(new FakeSocket());
      const p = bridge.fetch(callReq('undo', 1_000));
      await vi.advanceTimersByTimeAsync(1_100); // fake timers 下 json 解析与定时器一起推进
      const body = (await (await p).json()) as { ok: boolean; error: string };
      expect(body.ok).toBe(false);
      expect(body.error).toContain('tool_timeout');
      const msg = JSON.parse(sockets[0]!.sent[0]!) as { id: string };
      expect(() => bridge.webSocketMessage(sockets[0], JSON.stringify({ id: msg.id, ok: true }))).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });

  it('单活跃 socket:新标签页顶旧(旧的 close 4000)', async () => {
    const { state, sockets } = makeState();
    const bridge = new StudioBridge(state);
    bridge.acceptBrowserSocket(new FakeSocket());
    bridge.acceptBrowserSocket(new FakeSocket());
    expect(sockets[0]!.closed?.code).toBe(4000);
    expect(sockets[1]!.closed).toBeNull();
  });

  it('标签页关闭:挂起调用立即失败(不等超时)', async () => {
    const { state, sockets } = makeState();
    const bridge = new StudioBridge(state);
    bridge.acceptBrowserSocket(new FakeSocket());
    const p = bridge.fetch(callReq('undo'));
    await until(() => sockets[0]!.sent.length > 0); // 先让调用进入挂起态
    sockets[0]!.closed = { code: 1001 }; // getWebSockets 里消失
    bridge.webSocketClose();
    const body = (await (await p).json()) as { ok: boolean; error: string };
    expect(body).toEqual({ ok: false, error: 'studio_tab_closed' });
  });

  it('ping 兜底回 pong;非 JSON/无 id 的消息安全忽略', async () => {
    const { state, sockets } = makeState();
    const bridge = new StudioBridge(state);
    bridge.acceptBrowserSocket(new FakeSocket());
    bridge.webSocketMessage(sockets[0], 'ping');
    expect(sockets[0]!.sent).toContain('pong');
    expect(() => bridge.webSocketMessage(sockets[0], 'not json')).not.toThrow();
    expect(() => bridge.webSocketMessage(sockets[0], '{"ok":true}')).not.toThrow();
  });
});
