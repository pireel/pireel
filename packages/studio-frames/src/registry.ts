/**
 * Frame registry core — parses frame.md content packs (frontmatter + English
 * playbook body) into typed Frames. Pure: content is INJECTED as a path→raw map,
 * so any bundler/runtime can feed it. Vite consumers use the `./vite` entry,
 * which globs `content/<id>/frame.md` and constructs the registry eagerly.
 */

export interface Frame {
  id: string;
  /** 面板上的中文名。 */
  title: string;
  /** 一句话简介(中文,UI 文案)。 */
  summary: string;
  /** emoji 图标(缩略图无封面时的回落 + tag 渲染)。 */
  icon: string;
  /** 封面图 R2 裸 key(可选;有则缩略图墙用它)。 */
  iconKey?: string;
  /** 主题产出的类型预览词(开放词表,frame 面板详情页渲染真实预览卡)。 */
  showcase: string[];
  /** 主题设计 token(键与 theme vars 同名;含 alpha 用 8 位 hex 别带逗号)。 */
  palette?: Record<string, string>;
  /** 人像贴纸描边推荐(可选):挂载主题时落到 comp.personFx——主体人也成为这套设计的一部分。
   *  键:stroke-style(solid|dashed)/stroke-width(0-100)/stroke-color/stroke-opacity(0-1)/
   *  person-front(true)/feather(0-100)。 */
  personFx?: Record<string, string>;
  version: string;
  /** playbook 正文(英文,注入 studio chat system)。 */
  body: string;
}

export interface FrameRegistry {
  list(): Frame[];
  get(id: string): Frame | null;
}

export function parseFrame(raw: string, ctx: string): Frame {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw.trim());
  if (!m) throw new Error(`frame.md (${ctx}) 缺 frontmatter`);
  const fm: Record<string, string> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line);
    if (kv) fm[kv[1]!] = kv[2]!.trim();
  }
  const need = (k: string): string => {
    const v = fm[k];
    if (!v) throw new Error(`frame.md (${ctx}) 缺 ${k}`);
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
  // 顶层逗号切分:括号/引号里的逗号不算(shadow 的 rgb(… / …) 、字体栈都会带逗号)
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
  if (!body) throw new Error(`frame.md (${ctx}) 正文为空`);
  return {
    id: need('id'),
    title: need('title'),
    summary: need('summary'),
    icon: need('icon'),
    ...(fm['iconKey'] ? { iconKey: fm['iconKey'] } : {}),
    showcase: arr('showcase'),
    ...(map('palette') ? { palette: map('palette') } : {}),
    ...(map('personFx') ? { personFx: map('personFx') } : {}),
    version: need('version'),
    body,
  };
}

/** 注入 path→raw 的内容表建注册表;路径须形如 …/<id>/frame.md(id 与 frontmatter 校验一致)。 */
export function createFrameRegistry(files: Record<string, string>): FrameRegistry {
  let cache: Frame[] | null = null;
  const loadAll = (): Frame[] => {
    const out: Frame[] = [];
    for (const [path, raw] of Object.entries(files)) {
      const dir = /([^/]+)\/frame\.md$/.exec(path)?.[1] ?? path;
      const f = parseFrame(raw, path);
      if (f.id !== dir) throw new Error(`frame ${path}: frontmatter id "${f.id}" 与目录名 "${dir}" 不一致`);
      out.push(f);
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
  };
  const all = (): Frame[] => (cache ??= loadAll());
  return { list: () => all(), get: (id) => all().find((f) => f.id === id) ?? null };
}
