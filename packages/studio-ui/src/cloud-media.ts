/**
 * studio 源视频的云端备份/取回(浏览器侧)—— /api/studio/media 的客户端半边。
 *
 * 与 OPFS 本地库(local-media)是分层关系:本地库管"这台设备秒开",云端管
 * "换设备/刷新丢失后自动接回"。两边同一把钥匙(videoSig 内容指纹),云端 key
 * 由服务端从 sig 派生(内容寻址,重复备份被 headObject 秒传短路)。
 *
 * 失败一律静默降级(备份失败≠功能损失,本地照常;取回失败落回"重新选择原视频"
 * 的旧路径)——上传中断下次打开重试即可,幂等。
 */

export interface CloudMediaEntry {
  sig: string;
  key: string;
}

/** 备份一个源视频到云端。已存在(秒传)或成功都回 {key};失败回 null(静默)。 */
export async function cloudBackupVideo(file: File, sig: string): Promise<{ key: string } | null> {
  try {
    const r = await fetch('/api/studio/media', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'put', sig, size: file.size, content_type: file.type || 'video/mp4' }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { key: string; url?: string; already?: boolean; content_type?: string };
    if (j.already) return { key: j.key };
    if (!j.url) return null;
    // presign 签进了 Content-Type + Cache-Control,PUT 必须带相同 header 否则签名不过
    const put = await fetch(j.url, {
      method: 'PUT',
      headers: { 'Content-Type': j.content_type ?? file.type ?? 'video/mp4', 'Cache-Control': 'public, max-age=2592000, immutable' },
      body: file,
    });
    return put.ok ? { key: j.key } : null;
  } catch {
    return null;
  }
}

/** 从云端取回一个源视频(按 sig)。miss/失败回 null。 */
export async function cloudFetchVideo(sig: string): Promise<File | null> {
  try {
    const r = await fetch('/api/studio/media', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'get', sig }),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { url: string; content_type?: string };
    const resp = await fetch(j.url);
    if (!resp.ok) return null; // 对象不在(备份没成过):别把 404 错误 XML 当视频字节往下传
    const blob = await resp.blob();
    // 文件名不还原(sig 里的原名不可靠且无所谓);type 给 video/* 让 pickVideoFile 的类型检查通过
    return new File([blob], 'cloud-restore.mp4', { type: j.content_type?.startsWith('video/') ? j.content_type : 'video/mp4' });
  } catch {
    return null;
  }
}
