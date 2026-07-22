import { imageThumb, type ImagePreset } from './image-url';

/**
 * Skill icon — single render point. Prefers iconKey (raw R2 key of the generated icon set),
 * transformed via imageThumb into an app-icon-style tile; falls back to an emoji (on a light accent bg).
 *
 * Use it where there's room (cards/menus/drawers); the chat input's inline pill and the text fed to
 * the LLM still use the emoji.
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
