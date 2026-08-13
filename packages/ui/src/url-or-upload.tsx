'use client';

import { useMemo, useRef, useState } from 'react';
import {
  IconVideo,
  IconAudio,
  IconImage,
  IconDoc,
  IconAttach,
  IconClose,
} from './icons';
import { useUiI18n } from './i18n';

const FILE_REF_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;

interface FileTag {
  name: string;
  url: string;
  raw: string;
}

function parseValue(value: string): { text: string; files: FileTag[] } {
  const files: FileTag[] = [];
  const text = value.replace(FILE_REF_RE, (raw, name, url) => {
    files.push({ name, url, raw });
    return '';
  }).replace(/\n{2,}/g, '\n').trim();
  return { text, files };
}

function buildValue(text: string, files: FileTag[]): string {
  const parts: string[] = [];
  if (text.trim()) parts.push(text.trim());
  for (const f of files) parts.push(f.raw);
  return parts.join('\n');
}

function FileIcon({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext)) return <IconVideo size={12} />;
  if (['mp3', 'wav', 'aac', 'flac', 'ogg'].includes(ext)) return <IconAudio size={12} />;
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return <IconImage size={12} />;
  if (ext === 'pdf') return <IconDoc size={12} />;
  return <IconAttach size={12} />;
}

export function UrlOrUploadInput({
  value,
  onChange,
  accept,
  placeholder,
  controlClass,
  multiline,
}: {
  value: string;
  onChange: (v: string) => void;
  accept: string;
  placeholder?: string;
  controlClass: string;
  multiline?: boolean;
}) {
  const ui = useUiI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const { text, files } = useMemo(() => parseValue(value), [value]);

  function updateText(newText: string) {
    onChange(buildValue(newText, files));
  }

  function removeFile(idx: number) {
    const next = files.filter((_, i) => i !== idx);
    onChange(buildValue(text, next));
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadErr(null);
    setUploadFileName(file.name);
    setUploading(true);
    setProgress(0);
    try {
      const presignRes = await fetch('/api/upload/media/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          content_type: file.type || 'application/octet-stream',
          size: file.size,
        }),
      });
      const presign = await presignRes.json();
      if (!presignRes.ok || !presign.ok) {
        throw new Error(presign.error ?? `HTTP ${presignRes.status}`);
      }
      await putWithProgress(
        presign.upload_url as string,
        file,
        (pct) => setProgress(pct),
        presign.cache_control as string | undefined,
      );
      const url = presign.public_url as string;
      const ref = `![${file.name}](${url})`;
      const newFiles = [...files, { name: file.name, url, raw: ref }];
      onChange(buildValue(text, newFiles));
    } catch (err) {
      console.warn('[url-or-upload] upload failed', err);
      setUploadErr(ui.uploadFailed);
    } finally {
      setUploading(false);
      setUploadFileName(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <span
              key={i}
              className="border-line bg-panel-2 text-ink-2 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11.5px]"
            >
              <span className="text-ink-3 inline-flex items-center"><FileIcon name={f.name} /></span>
              <span className="max-w-[180px] truncate">{f.name}</span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                aria-label={ui.remove}
                className="text-ink-4 hover:text-rose ml-0.5 inline-flex items-center"
              >
                <IconClose size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className={multiline ? 'flex flex-col gap-2' : 'flex items-stretch gap-2'}>
        {multiline ? (
          <textarea
            value={text}
            onChange={(e) => updateText(e.target.value)}
            placeholder={placeholder ?? ui.inputOrUploadPlaceholder}
            className={`flex-1 ${controlClass}`}
            disabled={uploading}
          />
        ) : (
          <input
            value={text}
            onChange={(e) => updateText(e.target.value)}
            placeholder={placeholder ?? ui.urlOrTextPlaceholder}
            className={`flex-1 ${controlClass}`}
            disabled={uploading}
          />
        )}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="border-line-2 bg-panel hover:bg-panel-2 text-ink flex items-center gap-1.5 rounded-md border px-3 text-[12.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? `${progress}%` : ui.uploadFile}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={onPick}
        />
      </div>
      {uploading && uploadFileName && (
        <div className="flex items-center gap-2">
          <div className="bg-panel-2 border-line h-1 flex-1 overflow-hidden rounded-full border">
            <div className="bg-accent h-full transition-all" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-ink-4 text-[11px]">{uploadFileName}</span>
        </div>
      )}
      {uploadErr && <span className="text-rose text-[11.5px]">{uploadErr}</span>}
    </div>
  );
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
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    // presign signed Cache-Control into the SigV4 signature; the PUT must send the same value or R2 rejects with SignatureDoesNotMatch
    if (cacheControl) xhr.setRequestHeader('Cache-Control', cacheControl);
    xhr.send(file);
  });
}
