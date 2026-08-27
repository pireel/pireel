import type { SVGProps } from 'react';

export const STUDIO_SKILL_ICON_KEYS = [
  'skill-director',
  'skill-dialogue',
  'skill-montage',
  'skill-story',
  'skill-product',
  'skill-tutorial',
  'skill-social',
  'skill-brand',
] as const;

export type StudioSkillIconKey = typeof STUDIO_SKILL_ICON_KEYS[number];

export function ScenarioSkillIcon({
  icon,
  size = 20,
  ...props
}: Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> & {
  icon?: string | null;
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...props,
  };

  switch (icon) {
    case 'market':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
          <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
          <path d="M14 4h5.5a1.5 1.5 0 0 1 1.5 1.5V10M10 20H4.5A1.5 1.5 0 0 1 3 18.5V14" />
          <path d="m6.75 5.2.5 1.05 1.05.5-1.05.5-.5 1.05-.5-1.05-1.05-.5 1.05-.5z" />
          <path d="M15.8 17.25h2.9M17.25 15.8v2.9" />
        </svg>
      );
    case 'skill-dialogue':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="2.5" />
          <path d="M3.8 16c.8-2.7 2.2-4 4.2-4s3.4 1.3 4.2 4" />
          <path d="M14.5 7.5h5.5M14.5 10.5h3.5M14.5 13.5h5.5M14.5 16.5h3.5" opacity=".65" />
        </svg>
      );
    case 'skill-montage':
      return (
        <svg {...common}>
          <rect x="2.5" y="4" width="5.5" height="5" rx="1.2" />
          <rect x="9.25" y="4" width="5.5" height="5" rx="1.2" />
          <rect x="16" y="4" width="5.5" height="5" rx="1.2" />
          <path d="M5.25 9v3.5M12 9v3.5M18.75 9v3.5" opacity=".55" />
          <rect x="3" y="14" width="18" height="6" rx="1.5" />
          <path d="m6 16 2.5 1-2.5 1zM11 17h6M18.5 15.5v3" />
        </svg>
      );
    case 'skill-story':
      return (
        <svg {...common}>
          <circle cx="5" cy="17" r="2" />
          <circle cx="12" cy="7" r="2" />
          <circle cx="19" cy="16" r="2" />
          <path d="M6.3 15.5 10.7 8.7M13.5 8.3l4.1 6.2" />
          <path d="M3 4.5h5M16 4.5h5" opacity=".55" />
        </svg>
      );
    case 'skill-product':
      return (
        <svg {...common}>
          <path d="m4 8 8-4 8 4-8 4zM4 8v8l8 4 8-4V8M12 12v8" />
          <path d="m18.5 2 .5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z" opacity=".7" />
        </svg>
      );
    case 'skill-tutorial':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="15" rx="2" />
          <path d="M3 8h18M7 6h.1M10 6h.1" />
          <path d="m11 11 5 3-2.2.7L13 17z" opacity=".75" />
        </svg>
      );
    case 'skill-social':
      return (
        <svg {...common}>
          <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
          <path d="M10 5h4M10.5 18.5h3" opacity=".55" />
          <path d="m12.8 8-3 4h3l-1.6 4 4-5h-3z" />
        </svg>
      );
    case 'skill-brand':
      return (
        <svg {...common}>
          <path d="m12 3 7 7-7 11-7-11z" />
          <path d="m5 10 7 3 7-3M12 3v10M9 17h6" opacity=".65" />
        </svg>
      );
    case 'skill-director':
    default:
      return (
        <svg {...common}>
          <path d="M4 5h16v14H4zM4 9h16" />
          <path d="m5 5 3 4M10 5l3 4M15 5l3 4" opacity=".65" />
          <path d="m10 12 5 2.5-5 2.5z" />
        </svg>
      );
  }
}
