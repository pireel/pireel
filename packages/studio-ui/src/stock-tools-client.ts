/** Same authenticated stock search/import used by the hosted MCP surface. */
export async function runStockTool(action: 'search' | 'import', args: Record<string, unknown>, signal?: AbortSignal): Promise<{ ok: boolean; summary?: string; error?: string; data?: Record<string, unknown> }> {
  const response = await fetch('/api/studio/stock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...args, action }), signal });
  const body = await response.json();
  return response.ok ? body : { ok: false, error: body.error ?? `stock_request_failed_${response.status}` };
}
