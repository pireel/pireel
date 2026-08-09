/**
 * Frame registry core — parses frame.md content packs (frontmatter + English
 * playbook body) into typed Frames. Pure: content is INJECTED as a path→raw map,
 * so any bundler/runtime can feed it. Vite consumers use the `./vite` entry,
 * which globs `content/<id>/frame.md` and constructs the registry eagerly.
 */

export interface Frame {
  id: string;
  /** Display name shown on the panel. */
  title: string;
  /** One-line summary (UI copy). */
  summary: string;
  /** Emoji icon (fallback when a thumbnail has no cover + tag rendering). */
  icon: string;
  /** Square icon R2 bare key (optional; used by compact tags and rows). */
  iconKey?: string;
  /** Landscape catalog cover (optional; R2 bare key or hosted site-relative URL). */
  coverKey?: string;
  /** Open-vocabulary visual-language samples for the detail page; not fixed output types. */
  showcase: string[];
  /** Theme design tokens (keys match theme vars; use 8-digit hex for alpha, no commas). */
  palette?: Record<string, string>;
  /** Person-matte stroke recommendation (optional): written to comp.personFx on mount, so the
   *  subject also becomes part of the design. Keys: stroke-style(solid|dashed)/stroke-width(0-100)/
   *  stroke-color/stroke-opacity(0-1)/person-front(true)/feather(0-100). */
  personFx?: Record<string, string>;
  version: string;
  /** Rich Markdown video design-system playbook. Treat as prose judgment, not structured recipes. */
  body: string;
}

export interface FrameRegistry {
  list(): Frame[];
  get(id: string): Frame | null;
}

export function parseFrame(raw: string, ctx: string): Frame {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw.trim());
  if (!m) throw new Error(`frame.md (${ctx}) is missing frontmatter`);
  const fm: Record<string, string> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line);
    if (kv) fm[kv[1]!] = kv[2]!.trim();
  }
  const need = (k: string): string => {
    const v = fm[k];
    if (!v) throw new Error(`frame.md (${ctx}) is missing ${k}`);
    return v;
  };
  const arr = (k: string): string[] => {
    const v = fm[k] ?? '';
    const inner = /^\[([\s\S]*)\]$/.exec(v)?.[1] ?? '';
    return inner
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  };
  // Split on top-level commas only: commas inside parens/quotes don't count (shadow's rgb(...) and font stacks carry commas)
  const splitTop = (inner: string): string[] => {
    const parts: string[] = [];
    let buf = '';
    let depth = 0;
    let quote: string | null = null;
    for (const ch of inner) {
      if (quote) {
        if (ch === quote) quote = null;
        buf += ch;
        continue;
      }
      if (ch === "'" || ch === '"') quote = ch;
      else if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      if (ch === ',' && depth === 0 && !quote) {
        parts.push(buf);
        buf = '';
        continue;
      }
      buf += ch;
    }
    if (buf.trim()) parts.push(buf);
    return parts;
  };
  const map = (k: string): Record<string, string> | undefined => {
    const v = fm[k] ?? '';
    const inner = /^\{([\s\S]*)\}$/.exec(v)?.[1];
    if (!inner) return undefined;
    const out: Record<string, string> = {};
    for (const pair of splitTop(inner)) {
      const kv = /^\s*([\w-]+)\s*:\s*(.+?)\s*$/.exec(pair);
      if (kv) out[kv[1]!] = kv[2]!.replace(/^['"]|['"]$/g, '');
    }
    return Object.keys(out).length ? out : undefined;
  };
  const body = m[2]!.trim();
  if (!body) throw new Error(`frame.md (${ctx}) has an empty body`);
  return {
    id: need('id'),
    title: need('title'),
    summary: need('summary'),
    icon: need('icon'),
    ...(fm['iconKey'] ? { iconKey: fm['iconKey'] } : {}),
    ...(fm['coverKey'] ? { coverKey: fm['coverKey'] } : {}),
    showcase: arr('showcase'),
    ...(map('palette') ? { palette: map('palette') } : {}),
    ...(map('personFx') ? { personFx: map('personFx') } : {}),
    version: need('version'),
    body,
  };
}

/** Build a registry from an injected path→raw content map; paths must look like .../<id>/frame.md (id checked against frontmatter). */
export function createFrameRegistry(files: Record<string, string>): FrameRegistry {
  let cache: Frame[] | null = null;
  const loadAll = (): Frame[] => {
    const out: Frame[] = [];
    for (const [path, raw] of Object.entries(files)) {
      const dir = /([^/]+)\/frame\.md$/.exec(path)?.[1] ?? path;
      const f = parseFrame(raw, path);
      if (f.id !== dir) throw new Error(`frame ${path}: frontmatter id "${f.id}" does not match directory name "${dir}"`);
      out.push(f);
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
  };
  const all = (): Frame[] => (cache ??= loadAll());
  return { list: () => all(), get: (id) => all().find((f) => f.id === id) ?? null };
}
