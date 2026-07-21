'use client';

/**
 * 导出成片:弹窗选项(分辨率/帧率/格式)→ **客户端合成** → 自动下载。发布另走 publishVideo。
 *
 * - **只客户端合成**(本地零上传、与预览逐帧同源、插入段/取景全覆盖)。不支持 WebCodecs
 *   或本地视频丢失 → 诚实报错(不再静默交给服务端渲染——canvas 化后它产出视频轨全黑的
 *   空片、且从未验证过,已弃用)。
 * - 结果缓存:comp + 原片指纹 + 导出选项都没变 → 不重新合成,直接再下载上次的成片。
 * - 发布(publishVideo):把**成片**上传 R2 换公开直链喂发布中心(源视频永不上传;成片可传)。
 *   按需触发(点「去发布」才传),同内容不重复传。200MB 上限(presign)超了诚实报错。
 */

import { useRef, useState, type MutableRefObject } from 'react';
import { toast } from '@pireel/ui/toast';
import type { Composition } from '@pireel/studio-engine/composition';
import { studioProviders } from '@pireel/studio-engine/providers';
import { fileSig } from './media';
import { ExportCanceled, type ExportRenderOpts, clientExportVideo } from './client-export';
import { t } from './i18n';

/** presign 的硬上限(超了 413),提前拦一下给人话。 */
const MAX_PUBLISH_BYTES = 200 * 1024 * 1024;

/** 触发浏览器下载(blob 常驻缓存 ref,URL 用完即收)。 */
function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const stamp = () => new Date().toISOString().slice(11, 19).replace(/:/g, '');
const filenameFor = (o: ExportRenderOpts) => t('成片-{res}p-{stamp}.{format}', { res: o.res, stamp: stamp(), format: o.format });

export function useStudioExport(deps: {
  compRef: MutableRefObject<Composition>;
  videoFileRef: MutableRefObject<File | null>;
  /** 本地插入段 File 表(键=blob URL);客户端合成取插入段用。 */
  clipFilesRef?: MutableRefObject<Map<string, File>>;
}) {
  const { compRef, videoFileRef, clipFilesRef } = deps;
  const [exporting, setExporting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [exportPct, setExportPct] = useState(0);
  // 成片上传后的公开直链(R2):「去发布」入口的数据源。客户端合成的本地 blob 无公开链,
  // 只有 publishVideo 上传后才有值
  const [publishUrl, setPublishUrl] = useState<string | null>(null);
  const exportCancelRef = useRef(false); // 用户点了「取消导出」:停止合成解锁 UI
  const uploadedExportRef = useRef<{ key: string; url: string } | null>(null); // 成片上传结果(同内容不重复传)
  /** 最近成片缓存:key=comp+原片指纹+选项。没变就直接再下载/发布,不重新合成。 */
  const lastExportRef = useRef<{ key: string; blob?: Blob; opts: ExportRenderOpts } | null>(null);

  /** comp 全量 JSON + 原片指纹 + 选项:任何影响成片的东西变了,key 必变。
   *  (插入段以 blob URL 出现在 comp.shots 里,会话内稳定,天然入 key。) */
  const exportKey = (c: Composition, opts: ExportRenderOpts): string =>
    `${videoFileRef.current ? fileSig(videoFileRef.current) : (c.video?.url ?? '')}|${JSON.stringify(opts)}|${JSON.stringify(c)}`;

  /** 本地能不能客户端合成(WebCodecs + 有原片 File)。不能 = 诚实报错,不再交给弃用的服务端渲染。 */
  const canClientExport = () => typeof window !== 'undefined' && 'VideoEncoder' in window && !!videoFileRef.current;
  const noExportReason = () =>
    !videoFileRef.current ? t('本地视频丢失，重新上传原片后再导出') : t('这个浏览器不支持本地导出，换 Chrome/Edge 打开再试');

  /** 拿到当前内容的成片 blob:缓存命中直接用,否则客户端合成一遍(过程回报进度、可取消)。 */
  const renderBlob = async (c: Composition, key: string, opts: ExportRenderOpts): Promise<Blob> => {
    const cached = lastExportRef.current;
    if (cached && cached.key === key && cached.blob) return cached.blob;
    const blob = await clientExportVideo({
      comp: c,
      videoFile: videoFileRef.current!,
      clipFiles: clipFilesRef?.current ?? new Map(),
      render: opts,
      onProgress: (done, total) => setExportPct(Math.round((done / total) * 100)),
      shouldCancel: () => exportCancelRef.current,
    });
    lastExportRef.current = { key, blob, opts };
    return blob;
  };

  /** 导出 = 客户端合成 + 自动下载。不支持则诚实报错(不再静默走服务端出黑片)。
   *  返回结果给 agent 导出工具(export_video/track_export)用:成功带落盘文件名。 */
  async function exportVideo(opts: ExportRenderOpts): Promise<{ ok: boolean; filename?: string; error?: string }> {
    const c = compRef.current;
    if (!c.video?.url) {
      toast.error(t('先上传口播视频再导出'));
      return { ok: false, error: t('先上传口播视频再导出') };
    }
    if (exporting || publishing) return { ok: false, error: t('已有导出在进行中') };
    if (!canClientExport()) {
      toast.error(noExportReason());
      return { ok: false, error: noExportReason() };
    }
    const key = exportKey(c, opts);
    const name = filenameFor(opts);
    if (lastExportRef.current?.key === key && lastExportRef.current.blob) {
      toast.success(t('内容没有改动，已下载上次的成片'));
      downloadBlob(lastExportRef.current.blob, name);
      return { ok: true, filename: name };
    }
    setExporting(true);
    setExportPct(0);
    exportCancelRef.current = false;
    try {
      const blob = await renderBlob(c, key, opts);
      downloadBlob(blob, name);
      toast.success(t('导出完成，已开始下载'));
      return { ok: true, filename: name };
    } catch (e) {
      if (e instanceof ExportCanceled) {
        toast.info(t('已取消导出'));
        return { ok: false, error: t('导出被取消') };
      }
      console.warn('[studio] client export failed', e);
      toast.error(t('导出失败，稍后重试'));
      return { ok: false, error: e instanceof Error ? e.message : t('导出失败') };
    } finally {
      setExporting(false);
    }
  }

  /** 发布 = 客户端合成成片 → 上传 R2 换公开直链 → 点亮 publishUrl(源视频永不上传,成片可传)。
   *  按需触发(点「去发布」才跑);同内容已传过则复用上次的直链。返回公开 URL(失败/取消返回 null)。 */
  async function publishVideo(opts: ExportRenderOpts): Promise<string | null> {
    const c = compRef.current;
    if (!c.video?.url) {
      toast.error(t('先上传口播视频'));
      return null;
    }
    if (exporting || publishing) return null;
    if (!canClientExport()) {
      toast.error(noExportReason());
      return null;
    }
    const key = exportKey(c, opts);
    if (uploadedExportRef.current?.key === key) {
      // 同内容已上传过:直接复用直链
      setPublishUrl(uploadedExportRef.current.url);
      return uploadedExportRef.current.url;
    }
    setPublishing(true);
    setExportPct(0);
    exportCancelRef.current = false;
    try {
      const blob = await renderBlob(c, key, opts);
      if (blob.size > MAX_PUBLISH_BYTES) {
        toast.error(t('成片超过 200MB，发布上传装不下——降低分辨率或缩短时长再试'));
        return null;
      }
      toast.success(t('上传成片中…'));
      const { url } = await studioProviders().uploads.upload(blob, { contentType: blob.type || 'video/mp4', filename: filenameFor(opts) });
      uploadedExportRef.current = { key, url };
      setPublishUrl(url);
      return url;
    } catch (e) {
      if (e instanceof ExportCanceled) toast.info(t('已取消'));
      else {
        console.warn('[studio] publish upload failed', e);
        toast.error(t('发布准备失败，稍后重试'));
      }
      return null;
    } finally {
      setPublishing(false);
    }
  }

  return {
    exporting,
    publishing,
    exportPct,
    exportVideo,
    publishVideo,
    publishUrl,
    cancelExport: () => {
      exportCancelRef.current = true;
    },
    /** 换片时清掉成片缓存与发布直链(key 含原片指纹本就不会误命中,清是为了释放 blob 内存)。 */
    resetExport: () => {
      lastExportRef.current = null;
      uploadedExportRef.current = null;
      setPublishUrl(null);
    },
  };
}
