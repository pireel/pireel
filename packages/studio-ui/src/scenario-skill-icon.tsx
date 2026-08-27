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
  'skill-captions',
  'skill-audio',
  'skill-color',
  'skill-reframe',
  'skill-cover',
  'skill-commerce',
  'skill-interview',
  'skill-documentary',
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
    case 'skill-captions':
      return (
        <svg {...common}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M6.5 14.5h4M13.5 14.5h4M8.5 17h7" />
          <path d="m9.5 8 2.5 1.5L9.5 11z" opacity=".65" />
        </svg>
      );
    case 'skill-audio':
      return (
        <svg {...common}>
          <path d="M4 14.5v-5M7 17v-10M10 14v-4M13 18V6M16 15v-6M19 13v-2" />
          <path d="M3 20h18" opacity=".55" />
        </svg>
      );
    case 'skill-color':
      return (
        <svg {...common}>
          <path d="M12 3a9 9 0 1 0 0 18c1.5 0 2.2-.9 1.7-2-.5-1.1.2-2.1 1.5-2.1H18a3 3 0 0 0 3-3C21 7.9 17 3 12 3Z" />
          <circle cx="7.5" cy="10" r="1" />
          <circle cx="11" cy="6.8" r="1" />
          <circle cx="16" cy="8.5" r="1" />
        </svg>
      );
    case 'skill-reframe':
      return (
        <svg {...common}>
          <path d="M8 3H4a1 1 0 0 0-1 1v4M16 3h4a1 1 0 0 1 1 1v4M8 21H4a1 1 0 0 1-1-1v-4M16 21h4a1 1 0 0 0 1-1v-4" />
          <rect x="7" y="6" width="10" height="12" rx="1.5" />
          <path d="m9 15 2.2-2.5 1.8 1.8 2-2.3" opacity=".65" />
        </svg>
      );
    case 'skill-cover':
      return (
        <svg {...common}>
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <path d="M8 7h8M8 10h5M8 17l2.5-3 2 2 1.5-1.5 2 2.5" />
        </svg>
      );
    case 'skill-commerce':
      return (
        <svg {...common}>
          <path d="M4 6h2l1.5 9h9.8l1.7-6H7" />
          <circle cx="9" cy="19" r="1.3" />
          <circle cx="17" cy="19" r="1.3" />
          <path d="M11 5h8M15 2v6" opacity=".7" />
        </svg>
      );
    case 'skill-interview':
      return (
        <svg {...common}>
          <circle cx="7" cy="8" r="2.3" />
          <path d="M3.5 16c.7-2.7 1.9-4 3.5-4s2.8 1.3 3.5 4" />
          <path d="M15.5 6.5a3 3 0 0 1 0 6h-1l-2 2v-3.1a3 3 0 0 1 3-4.9Z" />
        </svg>
      );
    case 'skill-documentary':
      return (
        <svg {...common}>
          <path d="M4 5h16v14H4zM4 9h16" />
          <path d="M7 13h4M7 16h7M15.5 12.5h2v3h-2z" opacity=".7" />
          <path d="m5 5 3 4M10 5l3 4M15 5l3 4" />
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
