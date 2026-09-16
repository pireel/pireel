/**
 * StudioBridge — bridge between an external agent (Codex/Claude Code via
 * /api/studio/mcp) and an open studio tab. One Durable Object per user
 * (idFromName(userId)).
 *
 * Why a bridge and not server-side execution: studio tool execution is deeply
 * tied to the browser (runStudioTool closes over React state, inspect_media
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
  /** workerd hibernation API: the attachment survives eviction of in-memory state. */
  serializeAttachment?(value: unknown): void;
  deserializeAttachment?(): unknown;
}

interface BridgeState {
  acceptWebSocket(ws: unknown): void;
  getWebSockets(): BridgeSocket[];
  setWebSocketAutoResponse?(pair: unknown): void;
  /** Durable storage (present on the real DurableObjectState); the project anchor lives here
   *  so hibernation cannot forget which project this bridge session was editing. */
  storage?: {
    get(key: string): Promise<unknown>;
    put(key: string, value: unknown): Promise<void>;
  };
}

/** Browser reply (StudioToolResult + pass-through fields); carries state on get_state. */
export interface BridgeResult {
  ok: boolean;
  summary?: string;
  error?: string;
  data?: unknown;
  state?: string;
  hint?: string;
  /** tab_timeout: the id under which a late reply is reported by a later get_state. */
  callId?: string;
  /** get_state: outcomes of calls that timed out for the caller but finished in the tab since. */
  lateReceipts?: LateReceipt[];
}

export interface LateReceipt {
  callId: string;
  tool: string;
  startedAt: number;
  finishedAt: number;
  ok: boolean;
  summary?: string;
  error?: string;
}

/** How long a timed-out call keeps listening for the tab's reply. */
const LATE_REPLY_WINDOW_MS = 10 * 60_000;
const LATE_RECEIPTS_MAX = 20;

interface BridgeCallBody {
  tool?: string;
  input?: Record<string, unknown>;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;

export class StudioBridge {
  private pending = new Map<string, { resolve: (r: BridgeResult) => void; timer: ReturnType<typeof setTimeout>; tool: string; at: number; late?: boolean }>();
  private late: LateReceipt[] = [];
  private seq = 0;
  /** In-memory project tag per socket; the serialized attachment is the hibernation-safe copy. */
  private socketProjects = new WeakMap<object, string>();

  constructor(private state: BridgeState) {
    // ping/pong keepalive: auto-response replies even while the DO hibernates, with no wake billing
    const Pair = (globalThis as Record<string, unknown>).WebSocketRequestResponsePair as
      | (new (req: string, res: string) => unknown)
      | undefined;
    if (Pair && state.setWebSocketAutoResponse) state.setWebSocketAutoResponse(new Pair('ping', 'pong'));
  }

  /** Accept a new browser socket. Single active: a new tab evicts the old — two sockets would make
   *  "which one executes" a race. The close REASON carries the new tab's projectId so the evicted
   *  side can tell a same-project takeover (demote autosave) from an unrelated-project tab merely
   *  taking the tool-routing surface (keep autosaving its own project). */
  acceptBrowserSocket(server: unknown, projectId?: string): void {
    const project = (projectId ?? '').slice(0, 100);
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.close(4000, project);
      } catch {
        /* dead socket, ignore */
      }
    }
    this.state.acceptWebSocket(server);
    this.socketProjects.set(server as object, project);
    try {
      (server as BridgeSocket).serializeAttachment?.({ project });
    } catch {
      /* attachment unsupported (tests / old runtime): the in-memory tag still covers this lifetime */
    }
  }

  private projectOf(ws: BridgeSocket): string {
    const tagged = this.socketProjects.get(ws as object);
    if (tagged !== undefined) return tagged;
    try {
      const attachment = ws.deserializeAttachment?.() as { project?: unknown } | undefined;
      return typeof attachment?.project === 'string' ? attachment.project : '';
    } catch {
      return '';
    }
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // Internal server routing only: account services must share the editing session's
    // project rather than guessing from unrelated tabs' autosave timestamps.
    if (url.pathname === '/context' && req.method === 'GET') {
      const sockets = this.state.getWebSockets();
      const target = sockets[sockets.length - 1];
      return Response.json({ connected: !!target, projectId: target ? this.projectOf(target) : null,
        anchorProject: await this.state.storage?.get('anchorProject') ?? null,
        explicitSelection: await this.state.storage?.get('anchorExplicit') === true });
    }
    if (url.pathname === '/anchor' && req.method === 'POST') {
      const body = await req.json() as { projectId?: unknown; explicitSelection?: unknown };
      if (typeof body.projectId !== 'string' || !body.projectId || body.projectId.length > 100) {
        return Response.json({ ok: false, error: 'project_id_required' }, { status: 400 });
      }
      await this.state.storage?.put('anchorProject', body.projectId);
      await this.state.storage?.put('anchorExplicit', body.explicitSelection === true);
      return Response.json({ ok: true });
    }

    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return new Response('expected websocket', { status: 426 });
      }
      const pair = new ((globalThis as Record<string, unknown>).WebSocketPair as new () => Record<0 | 1, unknown>)();
      this.acceptBrowserSocket(pair[1], url.searchParams.get('project') ?? undefined);
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
      // getWebSockets order is unspecified, but single-active means at most one is alive
      const target = sockets[sockets.length - 1]!;
      // PROJECT ANCHOR: one bridge session edits one project. The routing surface can flip
      // underneath the agent (opening another project's tab evicts the old socket, by design);
      // without this gate the agent's next tool call would silently land in the wrong project.
      // get_state is the deliberate re-anchor — its receipt shows the LIVE project header, so
      // the agent continues with its eyes open. An untagged socket (legacy client) skips the gate.
      const socketProject = this.projectOf(target);
      const selected = await this.state.storage?.get('anchorProject');
      const explicitlySelected = await this.state.storage?.get('anchorExplicit') === true;
      if (explicitlySelected && selected && selected !== socketProject) {
        // Treat the unrelated tab as unavailable for this selection. The route can run
        // data tools against the selected cloud project; get_state must not change it.
        return Response.json({ ok: false, error: 'studio_not_open', projectId: selected,
          hint: `The selected project ${selected} is not open in the connected tab. Offline tools keep this selection; open this project for browser-only tools.` }, { status: 409 });
      }
      if (socketProject) {
        const anchor = selected as string | undefined;
        // On the v3 surface every call arrives wrapped as run_v3, so the gate has to read the tool
        // inside it. Comparing the outer name would block the re-anchor along with everything else
        // and leave the session refusing edits for good, with no call left that could clear it.
        const called = body.tool === 'run_v3' ? String(body.input?.name ?? body.tool) : body.tool;
        if (called !== 'get_state' && anchor && anchor !== socketProject) {
          return Response.json({
            ok: false,
            error: 'project_switched',
            hint: `The connected studio tab now shows project ${socketProject}, but this session was editing project ${anchor}. No edit was performed. Call get_state to deliberately continue on the open project, or create_browser_handoff {project_id: "${anchor}"} to reopen the original one.`,
          });
        }
        if (anchor !== socketProject) await this.state.storage?.put('anchorProject', socketProject);
        // get_state deliberately adopts the live tab; later passive tab takeovers remain guarded.
        if (!explicitlySelected && (called === 'get_state' || !anchor)) await this.state.storage?.put('anchorExplicit', false);
      }
      const id = `c${++this.seq}`;
      const timeoutMs = Math.min(Math.max(body.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1_000), 600_000);
      const called = body.tool === 'run_v3' ? String(body.input?.name ?? body.tool) : body.tool;
      const result = await new Promise<BridgeResult>((resolve) => {
        const timer = setTimeout(() => {
          // The tab may still be working (a long cut, an export). The caller is told so and the
          // entry stays open a while longer: a reply that arrives later is kept as a late receipt
          // and handed over with the next get_state, so the agent can see whether the work landed
          // instead of guessing from a stale read and running the edit twice.
          const entry = this.pending.get(id);
          if (entry) {
            entry.late = true;
            entry.timer = setTimeout(() => this.pending.delete(id), LATE_REPLY_WINDOW_MS);
          }
          resolve({
            ok: false,
            error: 'tab_timeout',
            callId: id,
            hint: `The studio tab has not answered ${called} within ${Math.round(timeoutMs / 1000)}s; it may still be working. Do not repeat the call. Call get_state: when the tab finishes, the receipt arrives under lateReceipts with callId ${id}.`,
          });
        }, timeoutMs);
        this.pending.set(id, { resolve, timer, tool: called, at: Date.now() });
        try {
          target.send(JSON.stringify({ id, tool: body.tool, input: body.input ?? {} }));
        } catch {
          clearTimeout(timer);
          this.pending.delete(id);
          resolve({ ok: false, error: 'bridge_send_failed' });
        }
      });
      if (called === 'get_state' && result.ok && this.late.length) {
        const lateReceipts = this.late.splice(0, this.late.length);
        return Response.json({ ...result, lateReceipts });
      }
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
    if (!p) return; // reply for a call that timed out long ago
    this.pending.delete(m.id);
    clearTimeout(p.timer);
    const { id: _drop, ...result } = m;
    if (p.late) {
      // The caller already received tab_timeout; keep the outcome for the next get_state.
      this.late.push({ callId: m.id, tool: p.tool, startedAt: p.at, finishedAt: Date.now(), ok: result.ok, ...(result.summary ? { summary: result.summary } : {}), ...(result.error ? { error: result.error } : {}) });
      if (this.late.length > LATE_RECEIPTS_MAX) this.late.splice(0, this.late.length - LATE_RECEIPTS_MAX);
      return;
    }
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
