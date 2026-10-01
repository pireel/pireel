import { SCENE_ENTRY_ICONS, SCENE_ICON_STYLE } from './workflow-art';

const SCENES = [
  { id: 'captions', zh: 'AI 字幕', en: 'AI Captions', label: 'AI Captions' },
  { id: 'ugc-ad', zh: 'UGC 广告', en: 'UGC Ad' },
  { id: 'subtitle-removal', zh: '智能擦除', en: 'AI Eraser' },
  { id: 'dubbing', zh: '视频译制', en: 'Video Dubbing', label: 'Video Dubbing' },
  { id: 'pip', zh: '画中画', en: 'Picture in picture' },
  { id: 'sfx', zh: 'Auto SFX', en: 'Auto SFX', label: 'Auto SFX' },
  { id: 'image', zh: 'AI 生图', en: 'AI Image' },
] as const;
const entryClass = 'text-ink group flex w-24 flex-col items-center gap-2 rounded-lg py-2 text-xs focus-visible:outline-2 focus-visible:outline-accent';
const iconClass = 'size-14 object-contain transition-transform group-hover:scale-105';

export function WorkflowLauncher({ locale, onSelect, onCreateAgent }: { locale: 'zh' | 'en'; onSelect: (id: string) => void; onCreateAgent?: () => void }) {
  return <div className="mb-8 flex flex-wrap gap-4">
    {SCENES.map(scene => <button key={scene.id} type="button" onClick={() => onSelect(scene.id)} aria-label={scene[locale]} className={entryClass}>
      <img src={SCENE_ENTRY_ICONS[scene.id]} width={56} height={56} alt="" className={iconClass} style={scene.id === 'captions' || scene.id === 'ugc-ad' || scene.id === 'sfx' || scene.id === 'image' ? undefined : SCENE_ICON_STYLE} />
      <span>{'label' in scene ? scene.label : scene[locale]}</span>
    </button>)}
    {onCreateAgent && <button type="button" onClick={onCreateAgent} className={entryClass}>
      <img src={SCENE_ENTRY_ICONS.agent} width={56} height={56} alt="" className={iconClass} />
      <span>Agent Editor</span>
    </button>}
  </div>;
}
