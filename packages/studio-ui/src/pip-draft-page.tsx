import { useEffect, useRef, useState } from 'react';
import { TopBarStart, topBarBackClass } from './top-bar-slot';
import { ArrowLeft, Loader2, Plus } from 'lucide-react';
import { DEFAULT_PIP_OPTIONS } from '@pireel/studio-engine/pip-layout';
import type { BrollOptions } from '@pireel/studio-engine/broll-task';
import type { CaptionTaskOptions } from '@pireel/studio-engine/caption-task';
import { createSceneProject, sceneProjectOptions } from './caption-upload-dialog';
import type { CaptionTaskRecord, CaptionUploadProgress } from './caption-task-store';
import { loadCurrentUser } from './current-user';
import { PipSettings } from './pip-settings';
import { PipShowcase } from './scene-upload-showcases';
import { SceneBrandPicker } from './scene-brand-picker';

const actionClass = 'bg-ink text-bg inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40';

/**
 * Picture in picture before its source video exists: the layout and footage are chosen right away,
 * and uploading the talking-head video creates the project with those settings and opens it.
 */
export function PipDraftPage({ locale, onBack, onCreated }: { locale: 'zh' | 'en'; onBack: () => void; onCreated: (id: string) => void }) {
  const zh = locale === 'zh'; const say = (cn: string, en: string) => (zh ? cn : en);
  const [options, setOptions] = useState<CaptionTaskOptions>(() => sceneProjectOptions('pip'));
  const [scope, setScope] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<CaptionUploadProgress>({ phase: 'preparing' });
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; void loadCurrentUser().then(user => { if (alive.current && user) setScope(user.user_id); }); return () => { alive.current = false; }; }, []);
  // Footage cards need an owner scope only; the project itself is created with the source video.
  const draft = { id: 'draft', scope, name: '', sourceSig: '', width: 1080, height: 1920, durationSec: 0, options, stage: 'ready', updatedAt: 0 } as CaptionTaskRecord;
  const broll: BrollOptions = options.broll ?? { assets: [], captions: true, pip: DEFAULT_PIP_OPTIONS };
  const busy = preparing || uploading;

  const choose = async (file: File) => {
    if (busy) return;
    setUploading(true); setError(''); setProgress({ phase: 'preparing' });
    try {
      const id = await createSceneProject(file, 'pip', { options, stale: () => !alive.current, report: value => { if (alive.current) setProgress(value); } });
      if (id && alive.current) onCreated(id);
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (alive.current) setUploading(false); }
  };
  const uploadLabel = progress.phase === 'uploading' ? `${say('正在上传', 'Uploading')}${progress.fraction === undefined ? '…' : ` ${Math.floor(progress.fraction * 100)}%`}` : progress.phase === 'saving' ? say('正在保存…', 'Saving…') : say('正在准备…', 'Preparing…');

  return <section className="studio-scope mx-auto flex h-full min-h-0 w-full flex-1 max-w-[1440px] flex-col overflow-hidden px-5 py-5 sm:px-10">
    <input ref={input} type="file" accept="video/*" className="hidden" aria-label={say('选择视频文件', 'Choose a video file')} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void choose(file); }} />
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(160px,28%)_minmax(0,1fr)] gap-5 overflow-hidden md:grid-cols-[minmax(260px,300px)_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
      <section className="min-h-0 min-w-0 overflow-y-auto overscroll-contain pr-2" aria-label={say('画中画设置', 'Picture in picture settings')}>
        <div className="pb-5 pr-2">
          <TopBarStart>{placement => <button type="button" disabled={uploading} onClick={onBack} className={topBarBackClass(placement)}><ArrowLeft size={15} />{say('返回首页', 'Back to home')}</button>}</TopBarStart>
          <header className="mb-4 min-w-0"><h1 className="text-ink text-xl font-semibold tracking-tight">{say('画中画', 'Picture in picture')}</h1></header>
          <section className="mb-5">
            <h2 className="text-ink mb-2 text-sm font-medium">{say('添加口播视频', 'Add talking-head video')}</h2>
            <button type="button" disabled={busy || !scope} onClick={() => input.current?.click()} className="border-line text-ink-3 hover:text-ink relative flex min-h-16 w-full items-center justify-center gap-1.5 overflow-hidden rounded-md border border-dashed text-xs disabled:opacity-60">
              {uploading ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}{uploading ? uploadLabel : say('去添加', 'Add')}
              {uploading && <progress aria-label={say('视频上传进度', 'Video upload progress')} max={1} value={progress.phase === 'uploading' ? progress.fraction : undefined} className="absolute inset-x-0 bottom-0 h-1 w-full appearance-none accent-[var(--color-accent)]" />}
            </button>
            {error && <p role="alert" className="text-ink mt-2 text-xs">{error}</p>}
          </section>
          <SceneBrandPicker options={options} locale={locale} disabled={uploading} onChange={update => { setOptions(current => update(current)); }} />
          {scope && <PipSettings task={draft} value={broll} disabled={uploading} locale={locale} onBusy={setPreparing} onChange={value => setOptions(current => ({ ...current, broll: value }))} />}
        </div>
        <div className="bg-bg sticky bottom-0 z-20 pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <button type="button" disabled title={say('先上传口播视频', 'Upload the talking-head video first')} className={actionClass + ' w-full'}>{say('生成视频', 'Generate video')}</button>
        </div>
      </section>
      <section aria-label={say('上传口播视频', 'Upload the talking-head video')} className="flex h-full min-h-0 min-w-0 flex-col items-center justify-center gap-5 overflow-y-auto rounded-lg bg-panel-2/40 p-6"
        onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void choose(file); }}>
        <div className="w-full max-w-md"><PipShowcase locale={locale} suspended={uploading} /></div>
      </section>
    </div>
  </section>;
}
