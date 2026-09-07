import { useEffect, useState } from 'react';
import { FileVideo } from 'lucide-react';
import { loadCurrentUser } from './current-user';
import { listCaptionTasks, type CaptionTaskRecord } from './caption-task-store';
export function CaptionProjectList({ locale, onOpen }: { locale: 'zh' | 'en'; onOpen: (id: string) => void }) {
  const [projects, setProjects] = useState<CaptionTaskRecord[]>([]);
  useEffect(() => {
    let alive = true;
    loadCurrentUser().then(async (user) => {
      if (!user || user.auth_method === 'anon') return;
      const rows = await listCaptionTasks(user.user_id);
      if (alive) setProjects(rows);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!projects.length) return null;
  const zh = locale === 'zh';
  return <section className="mb-8" aria-label={zh ? '字幕项目' : 'Caption projects'}><h2 className="text-ink mb-3 text-lg font-semibold">{zh ? '字幕项目' : 'Caption projects'}</h2><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{projects.map((project) => <button type="button" key={project.id} onClick={() => onOpen(project.id)} className="border-line bg-panel hover:bg-panel-2 flex min-w-0 items-center gap-3 rounded-lg border p-4 text-left"><FileVideo size={20} className="text-ink-3 shrink-0" /><span className="min-w-0"><span className="text-ink block truncate text-sm">{project.name}</span><span className="text-ink-3 mt-1 block text-xs">{project.stage === 'completed' ? (zh ? '已完成' : 'Completed') : project.stage === 'ready' ? (zh ? '待配置' : 'Ready to configure') : (zh ? '继续处理' : 'Continue')}</span></span></button>)}</div></section>;
}
