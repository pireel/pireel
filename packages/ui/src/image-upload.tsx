'use client';

import { useEffect, useRef, useState } from 'react';
import { IconClose, IconPlus } from './icons';

/* ======================================================================
 * 单图上传：空态为一个虚线卡片，点击上传；已上传后以实心卡片展示，支持看大图和移除。
 * ====================================================================== */
export function ImageUpload({
  value,
  onChange,
  accept = 'image/*',
  label = '上传图片',
  afterUpload,
}: {
  value: string;
  onChange: (url: string) => void;
  accept?: string;
  /** 空态 / 替换按钮里的文案，默认"上传图片" */
  label?: string;
  /** 上传完成后异步钩子，给 caller 用 file 做附加动作（如视频抽首帧上传 poster）。
   *  fire-and-forget——出错不影响主上传流程 */
  afterUpload?: (file: File, url: string) => void | Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null);
    setUploading(true);
    setProgress(0);
    try {
      const url = await uploadFile(file, setProgress);
      onChange(url);
      if (afterUpload) {
        try {
          await afterUpload(file, url);
        } catch (e) {
          console.warn('[image-upload] afterUpload failed', e);
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  if (isResolvedUrl(value)) {
    return (
      <>
        <div className="border-line bg-panel flex items-stretch gap-3 rounded-md border p-2">
          <Thumb src={value} onOpen={() => setLightbox(true)} />
          <div className="flex min-w-0 flex-1 items-start justify-between gap-2 py-0.5">
            <div className="text-ink text-[12.5px] font-semibold">已上传</div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="border-line-2 bg-panel-2 text-ink-2 hover:bg-panel inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-medium disabled:opacity-50"
              >
                {uploading ? `替换中 ${progress}%` : '替换'}
              </button>
              <button
                type="button"
                onClick={() => onChange('')}
                className="border-line-2 text-ink-3 hover:border-rose hover:text-rose grid h-6 w-6 shrink-0 place-items-center rounded-md border bg-white"
                title="移除"
              >
                <IconClose size={12} />
              </button>
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={onPick}
          />
        </div>
        {err && <div className="text-rose mt-1 text-[11.5px]">上传失败：{err}</div>}
        {lightbox && <Lightbox src={value} onClose={() => setLightbox(false)} />}
      </>
    );
  }

  // 空态：虚线卡片，点击触发上传
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => !uploading && fileRef.current?.click()}
        disabled={uploading}
        className="border-line-2 hover:border-accent hover:bg-accent/[0.04] text-ink-3 hover:text-accent flex h-[88px] items-center justify-center gap-2 rounded-md border-[1.5px] border-dashed bg-transparent px-4 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
      >
        {uploading ? (
          <span className="font-mono text-[12px]">上传中 {progress}%</span>
        ) : (
          <>
            <IconPlus size={14} />
            <span className="text-[12.5px] font-medium">{label}</span>
          </>
        )}
      </button>
      {uploading && <ProgressBar pct={progress} />}
      {err && <div className="text-rose text-[11.5px]">上传失败：{err}</div>}
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={onPick}
      />
    </div>
  );
}

/* ======================================================================
 * 多图上传：展示一串缩略图 + 末尾"+"按钮，超过 maxItems 时隐藏"+"。
 * 点击"+"支持多选，按选中顺序串行上传（同时显示进度占位）。
 * ====================================================================== */
export function ImageUploadList({
  values,
  onChange,
  accept = 'image/*',
  maxItems,
  label = '添加图片',
}: {
  values: string[];
  onChange: (urls: string[]) => void;
  accept?: string;
  maxItems?: number;
  /** "+"卡片上的文案 */
  label?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  /** 正在上传的占位：每个文件一条，按完成顺序从列表里消失。 */
  const [pending, setPending] = useState<{ id: string; name: string; progress: number; err?: string }[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // onChange 每次改变都把最新 values 写进 ref，供串行上传回调读取最新数组
  const valuesRef = useRef(values);
  useEffect(() => {
    valuesRef.current = values;
  }, [values]);

  const atLimit = typeof maxItems === 'number' && values.length + pending.length >= maxItems;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    // 尊重 maxItems —— 多选超出时截断
    const room = typeof maxItems === 'number' ? Math.max(0, maxItems - values.length - pending.length) : picked.length;
    const files = picked.slice(0, room);
    if (fileRef.current) fileRef.current.value = '';

    // 先把占位塞进 pending，再串行上传
    const slots = files.map((f) => ({ id: randomId(), name: f.name, progress: 0 }));
    setPending((prev) => [...prev, ...slots]);

    for (let i = 0; i < files.length; i++) {
      const slot = slots[i];
      const file = files[i];
      try {
        const url = await uploadFile(file, (pct) => {
          setPending((prev) => prev.map((p) => (p.id === slot.id ? { ...p, progress: pct } : p)));
        });
        // 成功：从 pending 删除，把 URL 追加到 values
        setPending((prev) => prev.filter((p) => p.id !== slot.id));
        onChange([...valuesRef.current, url]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setPending((prev) => prev.map((p) => (p.id === slot.id ? { ...p, err: msg } : p)));
      }
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start gap-2">
        {values.map((url, i) => (
          <RemovableThumb
            key={`${url}-${i}`}
            src={url}
            onOpen={() => setLightbox(url)}
            onRemove={() => onChange(values.filter((_, j) => j !== i))}
          />
        ))}
        {pending.map((p) => (
          <PendingThumb
            key={p.id}
            name={p.name}
            progress={p.progress}
            err={p.err}
            onDismiss={() => setPending((prev) => prev.filter((x) => x.id !== p.id))}
          />
        ))}
        {!atLimit && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="border-line-2 hover:border-accent hover:bg-accent/[0.04] text-ink-3 hover:text-accent flex h-[88px] w-[88px] shrink-0 flex-col items-center justify-center gap-1 rounded-md border-[1.5px] border-dashed bg-transparent transition-colors"
            title={label}
          >
            <IconPlus size={16} />
            <span className="text-[11px] font-medium">{label}</span>
          </button>
        )}
      </div>
      {typeof maxItems === 'number' && (
        <div className="text-ink-4 font-mono text-[10.5px]">
          {values.length + pending.length} / {maxItems}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={onPick}
      />
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

/* ---------------- 基础原子：缩略图、带移除的缩略图、上传占位 ---------------- */

function Thumb({ src, onOpen }: { src: string; onOpen: () => void }) {
  const isVideo = /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(src);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group border-line bg-panel-2 relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-md border"
      title={isVideo ? '查看视频' : '查看大图'}
    >
      {isVideo ? (
        <>
          <video
            src={src}
            muted
            playsInline
            className="h-full w-full object-cover"
          />
          <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/60 px-1 py-0.5 text-[9px] font-bold text-white">
            ▶ 视频
          </span>
        </>
      ) : (
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover transition-transform duration-150 group-hover:scale-105"
        />
      )}
      <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/0 text-white opacity-0 transition-opacity group-hover:bg-black/35 group-hover:opacity-100">
        <ZoomIcon />
      </span>
    </button>
  );
}

function RemovableThumb({
  src,
  onOpen,
  onRemove,
}: {
  src: string;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="group relative h-[88px] w-[88px] shrink-0">
      <Thumb src={src} onOpen={onOpen} />
      <button
        type="button"
        onClick={onRemove}
        title="移除"
        className="absolute -right-1.5 -top-1.5 z-10 grid h-5 w-5 place-items-center rounded-full bg-white text-ink-3 shadow-[var(--shadow-sm)] opacity-0 transition-opacity hover:text-rose group-hover:opacity-100"
      >
        <IconClose size={11} />
      </button>
    </div>
  );
}

function PendingThumb({
  name,
  progress,
  err,
  onDismiss,
}: {
  name: string;
  progress: number;
  err?: string;
  onDismiss: () => void;
}) {
  if (err) {
    return (
      <div
        className="border-rose/40 bg-rose/[0.06] relative flex h-[88px] w-[88px] shrink-0 flex-col items-center justify-center rounded-md border px-2 text-center"
        title={err}
      >
        <div className="text-rose text-[11px] font-semibold">失败</div>
        <div className="text-ink-3 font-mono mt-0.5 line-clamp-1 text-[10px]">{name}</div>
        <button
          type="button"
          onClick={onDismiss}
          title="关闭"
          className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-white text-ink-3 shadow-[var(--shadow-sm)] hover:text-rose"
        >
          <IconClose size={11} />
        </button>
      </div>
    );
  }
  return (
    <div className="border-line bg-panel-2 relative flex h-[88px] w-[88px] shrink-0 flex-col items-center justify-center rounded-md border">
      <div className="font-mono text-ink-2 text-[13px] font-bold">{progress}%</div>
      <div className="bg-line-2 relative mt-1.5 h-[3px] w-12 overflow-hidden rounded-full">
        <div className="bg-accent h-full transition-all" style={{ width: `${progress}%` }} />
      </div>
      <div className="text-ink-4 font-mono mt-1 line-clamp-1 w-full px-1 text-center text-[9.5px]">{name}</div>
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="bg-panel-2 border-line h-1 w-full overflow-hidden rounded-full border">
      <div className="bg-accent h-full transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ---------------- Lightbox & SVG 小件 ---------------- */

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const isVideo = /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(src);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-8 backdrop-blur-sm"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
        title="关闭 (Esc)"
      >
        <IconClose size={16} />
      </button>
      {isVideo ? (
        <video
          src={src}
          controls
          playsInline
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded-md shadow-2xl"
        />
      ) : (
        <img
          src={src}
          alt=""
          onClick={(e) => e.stopPropagation()}
          className="max-h-full max-w-full rounded-md object-contain shadow-2xl"
        />
      )}
    </div>
  );
}

function ZoomIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M13 13l-2.8-2.8M5 7h4M7 5v4" />
    </svg>
  );
}

/* ---------------- 上传：presign → XHR PUT ---------------- */

export async function uploadFile(file: File, onProgress: (pct: number) => void): Promise<string> {
  const res = await fetch('/api/upload/media/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name,
      content_type: file.type || 'image/png',
      size: file.size,
    }),
  });
  const presign = await res.json();
  if (!res.ok || !presign.ok) {
    throw new Error(presign.error ?? `HTTP ${res.status}`);
  }
  await putWithProgress(
    presign.upload_url as string,
    file,
    onProgress,
    presign.cache_control as string | undefined,
  );
  return presign.public_url as string;
}

function putWithProgress(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
  cacheControl?: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`TOS HTTP ${xhr.status}: ${xhr.responseText.slice(0, 200)}`));
    });
    xhr.addEventListener('error', () => reject(new Error('网络错误')));
    xhr.addEventListener('abort', () => reject(new Error('上传被中断')));
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type || 'image/png');
    // presign 把 Cache-Control 签进了 SigV4 签名，PUT 必须带同值，否则 R2 拒签 SignatureDoesNotMatch
    if (cacheControl) xhr.setRequestHeader('Cache-Control', cacheControl);
    xhr.send(file);
  });
}

function isResolvedUrl(v: string): boolean {
  return /^https?:\/\/\S+/i.test(v.trim());
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}
