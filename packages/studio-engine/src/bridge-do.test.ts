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
  const stored = new Map<string, unknown>();
  return {
    sockets,
    stored,
    state: {
      acceptWebSocket: (ws: unknown) => sockets.push(ws as FakeSocket),
      getWebSockets: () => sockets.filter((s) => !s.closed) as unknown as { send(d: string): void; close(c?: number, r?: string): void }[],
      setWebSocketAutoResponse: () => {},
      storage: {
        get: async (key: string) => stored.get(key),
        put: async (key: string, value: unknown) => {
          stored.set(key, value);
        },
      },
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

  it('单活跃 socket:新标签页顶旧(旧的 close 4000,reason 带新 tab 的 projectId 供同项目判定)', async () => {
    const { state, sockets } = makeState();
    const bridge = new StudioBridge(state);
    bridge.acceptBrowserSocket(new FakeSocket());
    bridge.acceptBrowserSocket(new FakeSocket(), 'p123abc');
    expect(sockets[0]!.closed?.code).toBe(4000);
    expect(sockets[0]!.closed?.reason).toBe('p123abc');
    expect(sockets[1]!.closed).toBeNull();
    // 不带 projectId(旧客户端/未知)→ reason 空串,被顶方保守降级
    bridge.acceptBrowserSocket(new FakeSocket());
    expect(sockets[1]!.closed?.code).toBe(4000);
    expect(sockets[1]!.closed?.reason).toBe('');
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

  it('项目锚:换项目的标签页接管路由后,编辑被拒、get_state 显式重锚后放行', async () => {
    const { state, sockets, stored } = makeState();
    const bridge = new StudioBridge(state);
    bridge.acceptBrowserSocket(new FakeSocket(), 'pmtaaa1111111');
    // 第一次被服务的调用把锚定在 A 项目
    const first = bridge.fetch(callReq('add_clips'));
    await until(() => sockets[0]!.sent.length > 0);
    const firstMsg = JSON.parse(sockets[0]!.sent[0]!) as { id: string };
    bridge.webSocketMessage(sockets[0], JSON.stringify({ id: firstMsg.id, ok: true }));
    await first;
    expect(stored.get('anchorProject')).toBe('pmtaaa1111111');

    // 用户开了 B 项目的标签页,顶掉 A 的 socket——路由面换了项目
    bridge.acceptBrowserSocket(new FakeSocket(), 'pmtbbb2222222');
    const rejected = (await (await bridge.fetch(callReq('add_clips'))).json()) as { ok: boolean; error: string; hint: string };
    expect(rejected.ok).toBe(false);
    expect(rejected.error).toBe('project_switched');
    expect(rejected.hint).toContain('pmtbbb2222222');
    expect(rejected.hint).toContain('pmtaaa1111111');
    expect(sockets[1]!.sent.length).toBe(0); // B 的标签页没收到任何编辑

    // get_state 是显式重锚:转发给 B,锚随之更新,后续编辑放行
    const reanchor = bridge.fetch(callReq('get_state'));
    await until(() => sockets[1]!.sent.length > 0);
    const stateMsg = JSON.parse(sockets[1]!.sent[0]!) as { id: string };
    bridge.webSocketMessage(sockets[1], JSON.stringify({ id: stateMsg.id, ok: true, state: 's' }));
    await reanchor;
    expect(stored.get('anchorProject')).toBe('pmtbbb2222222');
    const after = bridge.fetch(callReq('add_clips'));
    await until(() => sockets[1]!.sent.length > 1);
    const afterMsg = JSON.parse(sockets[1]!.sent[1]!) as { id: string };
    bridge.webSocketMessage(sockets[1], JSON.stringify({ id: afterMsg.id, ok: true }));
    expect(((await (await after).json()) as { ok: boolean }).ok).toBe(true);
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
