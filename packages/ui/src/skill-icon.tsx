import { imageThumb, type ImagePreset } from './image-url';

/**
 * Skill 图标——统一渲染点。iconKey（生成图标集的裸 R2 key）优先，经 imageThumb
 * 转图当 app-icon 式色块；缺省回落 emoji（坐在 accent 浅底里）。
 *
 * 卡片/菜单/抽屉等有空间处用它；chat 输入框的内联 pill 与喂 LLM 的文本仍走 emoji。
 */
export function SkillIcon({
  iconKey,
  emoji,
  size = 32,
  rounded = 'rounded-lg',
  preset = 'thumb',
  className = '',
}: {
  iconKey?: string | null;
  emoji?: string | null;
  size?: number;
  rounded?: string;
  preset?: ImagePreset;
  className?: string;
}) {
  if (iconKey) {
    return (
      <img
        src={imageThumb(iconKey, preset)}
        alt=""
        loading="lazy"
        className={`shrink-0 object-cover ${rounded} ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={`bg-accent/10 text-accent inline-flex shrink-0 items-center justify-center ${rounded} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
    >
      {emoji ?? '✨'}
    </span>
  );
}
