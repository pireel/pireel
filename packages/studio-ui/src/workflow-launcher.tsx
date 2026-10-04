import { SCENE_ENTRY_ICONS, SCENE_ICON_STYLE } from './workflow-art';

const SCENES = [
  { id: 'captions', zh: 'AI 字幕', en: 'AI Captions', label: 'AI Captions' },
  { id: 'subtitle-removal', zh: '智能擦除', en: 'AI Eraser' },
  { id: 'dubbing', zh: '视频译制', en: 'Video Dubbing', label: 'Video Dubbing' },
  { id: 'pip', zh: '画中画', en: 'Picture in picture' },
  { id: 'sfx', zh: 'Auto SFX', en: 'Auto SFX', label: 'Auto SFX' },
  { id: 'image', zh: 'AI 生图', en: 'AI Image' },
  { id: 'video', zh: 'AI 生视频', en: 'AI Video' },
] as const;
const entryClass = 'text-ink group flex w-24 flex-col items-center gap-2 rounded-lg py-2 text-xs focus-visible:outline-2 focus-visible:outline-accent';
const iconClass = 'size-14 object-contain transition-transform group-hover:scale-105';

/** An entry the host adds beside the scenes (e.g. a hosted feature with its own page). */
export interface LauncherEntry { id: string; label: string; icon: string; onSelect: () => void }

export function WorkflowLauncher({ locale, onSelect, onCreateAgent, centered = false, emphasize, leading = [] }: {
  locale: 'zh' | 'en'; onSelect: (id: string) => void; onCreateAgent?: () => void; centered?: boolean;
  /** Host entries shown before the scenes. */
  leading?: readonly LauncherEntry[];
  /** When given, only these entries stand out (the rest recede), e.g. the scenes that take a video in hand. */
  emphasize?: readonly string[];
}) {
  const receded = (id: string) => !!emphasize && !emphasize.includes(id);
  return <div className={'mb-8 flex flex-wrap gap-4' + (centered ? ' justify-center' : '')}>
    {leading.map(entry => <button key={entry.id} type="button" onClick={entry.onSelect} aria-label={entry.label} className={entryClass + (receded(entry.id) ? ' opacity-35 hover:opacity-70' : '')}>
      <img src={entry.icon} width={56} height={56} alt="" className={iconClass} />
      <span>{entry.label}</span>
    </button>)}
    {SCENES.map(scene => <button key={scene.id} type="button" onClick={() => onSelect(scene.id)} aria-label={scene[locale]} className={entryClass + (receded(scene.id) ? ' opacity-35 hover:opacity-70' : '')}>
      <img src={SCENE_ENTRY_ICONS[scene.id]} width={56} height={56} alt="" className={iconClass} style={scene.id === 'captions' || scene.id === 'sfx' || scene.id === 'image' || scene.id === 'video' ? undefined : SCENE_ICON_STYLE} />
      <span>{'label' in scene ? scene.label : scene[locale]}</span>
    </button>)}
    {onCreateAgent && <button type="button" onClick={onCreateAgent} className={entryClass + (receded('agent') ? ' opacity-35 hover:opacity-70' : '')}>
      <img src={SCENE_ENTRY_ICONS.agent} width={56} height={56} alt="" className={iconClass} />
      <span>Agent Editor</span>
    </button>}
  </div>;
}
