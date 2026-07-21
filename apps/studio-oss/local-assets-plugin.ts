import { createHash } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Connect, Plugin } from 'vite';

/**
 * Local asset storage for the OSS shell — the disk-backed counterpart of the hosted
 * app's R2+CDN upload provider. POST bytes to /local-assets, get back a RELATIVE url
 * (`/local-assets/<sha256>.<ext>`) that is stable across restarts and port changes;
 * the preview iframe (srcdoc inherits the parent base) and client export load it
 * same-origin. Files live in `.local-assets/` next to the app (gitignored).
 *
 * Also emulates the minimal asset-library API surface the editor's assets panel
 * talks to (same request/response contracts as the hosted app, so the panel needs
 * zero changes): GET /api/me/materials · POST /api/me/uploads · DELETE
 * /api/me/uploads/:id. Metadata lives in `.local-assets/index.json`.
 */

interface LibraryRow {
  id: string;
  url: string;
  thumb_url: string | null;
  label: string | null;
  kind: 'image' | 'video' | 'audio';
  source: string;
  width?: number | null;
  height?: number | null;
  created_at: number;
}

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
};
const MIME_BY_EXT = Object.fromEntries(Object.entries(EXT_BY_MIME).map(([m, e]) => [e, m]));
const MAX_BYTES = 100 * 1024 * 1024;

function readBody(req: Connect.IncomingMessage): Promise<Buffer> {
  return new Promise((res, rej) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (c: Buffer) => {
      total += c.length;
      if (total > MAX_BYTES) {
        rej(new Error('too_large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => res(Buffer.concat(chunks)));
    req.on('error', rej);
  });
}

export function localAssets(): Plugin {
  const dir = resolve(process.cwd(), '.local-assets');
  const indexPath = () => join(dir, 'index.json');
  const readIndex = async (): Promise<LibraryRow[]> => {
    try {
      const rows = JSON.parse(await readFile(indexPath(), 'utf8')) as LibraryRow[];
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  };
  const writeIndex = async (rows: LibraryRow[]) => {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    await writeFile(indexPath(), JSON.stringify(rows, null, 2));
  };
  const json = (res: Parameters<Connect.NextHandleFunction>[1], body: unknown, status = 200) => {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  };

  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url ?? '';

    // ---- 素材库元数据(与托管 /api/me/* 同契约,面板零改动) ----
    if (url.startsWith('/api/me/materials') && req.method === 'GET') {
      const params = new URL(url, 'http://local').searchParams;
      const kind = params.get('kind');
      void readIndex().then((rows) =>
        json(res, { items: rows.filter((r) => !kind || r.kind === kind).sort((a, b) => b.created_at - a.created_at) }),
      );
      return;
    }
    if (url.startsWith('/api/me/uploads') && req.method === 'POST') {
      void readBody(req)
        .then(async (buf) => {
          const b = JSON.parse(buf.toString('utf8') || '{}') as Partial<LibraryRow> & { byte_size?: number; mime?: string; role?: string };
          if (!b.url || (b.kind !== 'image' && b.kind !== 'video' && b.kind !== 'audio')) return json(res, { error: 'invalid_body' }, 400);
          const rows = await readIndex();
          const row: LibraryRow = {
            id: `local_${createHash('sha256').update(`${b.url}:${Date.now()}`).digest('hex').slice(0, 12)}`,
            url: b.url,
            thumb_url: b.kind === 'image' ? b.url : null,
            label: b.label ?? null,
            kind: b.kind,
            source: 'local',
            width: b.width ?? null,
            height: b.height ?? null,
            created_at: Date.now(),
          };
          await writeIndex([...rows, row]);
          json(res, { ok: true, upload: row });
        })
        .catch(() => json(res, { error: 'invalid_json' }, 400));
      return;
    }
    {
      const del = /^\/api\/me\/uploads\/([^/?]+)$/.exec(url.split('?')[0]!);
      if (del && req.method === 'DELETE') {
        void readIndex().then(async (rows) => {
          await writeIndex(rows.filter((r) => r.id !== decodeURIComponent(del[1]!)));
          json(res, { ok: true }); // 只删记录不删字节(内容寻址可能被多处引用)
        });
        return;
      }
    }

    if (!url.startsWith('/local-assets')) return next();

    if (req.method === 'POST') {
      const mime = String(req.headers['content-type'] ?? '').split(';')[0]!.trim();
      const ext = EXT_BY_MIME[mime];
      if (!ext) {
        res.statusCode = 415;
        res.end(JSON.stringify({ error: 'unsupported_type', allowed: Object.keys(EXT_BY_MIME) }));
        return;
      }
      void readBody(req)
        .then(async (buf) => {
          if (!buf.length) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'empty_body' }));
            return;
          }
          // 内容寻址:同字节同文件,天然去重幂等
          const name = `${createHash('sha256').update(buf).digest('hex').slice(0, 32)}.${ext}`;
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          await writeFile(join(dir, name), buf);
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ key: `/local-assets/${name}`, url: `/local-assets/${name}` }));
        })
        .catch((e) => {
          res.statusCode = e instanceof Error && e.message === 'too_large' ? 413 : 500;
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'write_failed' }));
        });
      return;
    }

    // GET /local-assets/<name>:只认内容寻址文件名,天然免目录穿越
    const m = /^\/local-assets\/([a-f0-9]{32}\.[a-z0-9]+)$/.exec(url.split('?')[0]!);
    if (!m) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    void readFile(join(dir, m[1]!))
      .then((buf) => {
        res.setHeader('content-type', MIME_BY_EXT[m[1]!.split('.')[1]!] ?? 'application/octet-stream');
        res.setHeader('cache-control', 'public, max-age=31536000, immutable'); // 内容寻址=永不变
        res.end(buf);
      })
      .catch(() => {
        res.statusCode = 404;
        res.end('not found');
      });
  };
  return {
    name: 'pireel-local-assets',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
