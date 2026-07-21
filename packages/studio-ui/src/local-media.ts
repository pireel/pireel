/**
 * OPFS 本地视频库:主视频/插入段「留在本地不上传」模式的持久层——刷新后按 fileSig 取回,
 * 草稿恢复不再要用户重选文件。best-effort:不支持/被驱逐/任何失败都静默降级回
 * 「重新导入」提示,不会比没有它更糟。
 *
 * 存取键 = fileSig(name:size:lastModified)。OPFS 里的 File 元数据(名字/mtime/type)
 * 是落盘时的,不是原文件的 —— 取回时按 sidecar meta 重建 File,保证 fileSig(取回) ===
 * 原 sig(草稿接回校验、ASR/画面分析缓存、autosave 的 sig 全都依赖这个恒等)。
 */

const DIR = 'local-videos';
const MAX_FILES = 12; // 视频很大,只留最近 N 部(LRU by 落盘时间);超出连 meta 一起清

interface StoredMeta {
  name: string;
  type: string;
  lastModified: number;
}

/** sig 含文件名(可能有中文/空格/冒号),收敛成 OPFS 安全文件名;size:mtime 保证唯一性。 */
const sigKey = (sig: string) => sig.replace(/[^a-zA-Z0-9._-]/g, '_');

async function dirHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.getDirectory) return null;
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(DIR, { create: true });
  } catch {
    return null;
  }
}

export async function saveLocalVideo(file: File, sig: string): Promise<void> {
  const dir = await dirHandle();
  if (!dir) return;
  try {
    // 常驻申请(best-effort):不给就接受被驱逐的可能
    void navigator.storage.persist?.().catch(() => {});
    const key = sigKey(sig);
    try {
      await dir.getFileHandle(key);
      return; // 同 sig 已落盘(内容由 size+mtime 钉死),跳过重写
    } catch {
      /* 不存在 → 落盘 */
    }
    const meta: StoredMeta = { name: file.name, type: file.type, lastModified: file.lastModified };
    const fh = await dir.getFileHandle(key, { create: true });
    const w = await fh.createWritable();
    await w.write(file);
    await w.close();
    const mh = await dir.getFileHandle(`${key}.meta.json`, { create: true });
    const mw = await mh.createWritable();
    await mw.write(JSON.stringify(meta));
    await mw.close();
    await prune(dir);
  } catch (e) {
    console.warn('[studio] save local video failed', e);
  }
}

export async function loadLocalVideo(sig: string): Promise<File | null> {
  const dir = await dirHandle();
  if (!dir) return null;
  try {
    const key = sigKey(sig);
    const fh = await dir.getFileHandle(key);
    const stored = await fh.getFile();
    if (!stored.size) return null;
    let meta: StoredMeta | null = null;
    try {
      const mh = await dir.getFileHandle(`${key}.meta.json`);
      meta = JSON.parse(await (await mh.getFile()).text()) as StoredMeta;
    } catch {
      /* meta 缺失:退化成落盘元数据(sig 对不上,只影响接回校验) */
    }
    return meta ? new File([stored], meta.name, { type: meta.type, lastModified: meta.lastModified }) : stored;
  } catch {
    return null;
  }
}

/** LRU 清理:按落盘时间只留最近 MAX_FILES 部(meta sidecar 跟着数据文件走)。 */
async function prune(dir: FileSystemDirectoryHandle): Promise<void> {
  try {
    const files: { name: string; mtime: number }[] = [];
    const iter = (dir as unknown as { values(): AsyncIterable<FileSystemHandle> }).values();
    for await (const h of iter) {
      if (h.kind !== 'file' || h.name.endsWith('.meta.json')) continue;
      const f = await (h as FileSystemFileHandle).getFile();
      files.push({ name: h.name, mtime: f.lastModified });
    }
    files.sort((a, b) => b.mtime - a.mtime);
    for (const f of files.slice(MAX_FILES)) {
      try {
        await dir.removeEntry(f.name);
        await dir.removeEntry(`${f.name}.meta.json`);
      } catch {
        /* 清不掉就留着,下次再试 */
      }
    }
  } catch {
    /* best-effort */
  }
}
