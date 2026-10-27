import type { ReactNode } from 'react';

const paths = {
  home: (
    <>
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-8H9v8H4a1 1 0 0 1-1-1Z" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2" />
    </>
  ),
  dumbbell: (
    <>
      <path d="m6 6 12 12M3 8l5-5m8 18 5-5M2 5l3-3m14 20 3-3M4 10l6-6m4 16 6-6" />
    </>
  ),
  utensils: (
    <>
      <path d="M4 3v5a3 3 0 0 0 6 0V3M7 3v18M20 21V3c-4 0-5 5-5 9h5" />
    </>
  ),
  chart: (
    <>
      <path d="M4 3v18h17M8 16v-4m5 4V8m5 8V5" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  'alert-triangle': (
    <>
      <path d="m10.3 4-8 14a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0ZM12 9v4m0 4h.01" />
    </>
  ),
  'x-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6m0-6-6 6" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6m0-10h.01" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  inbox: (
    <>
      <path d="m3 4-2 10v6h22v-6L21 4ZM1 14h6l2 3h6l2-3h6" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 7a9 9 0 0 0-15-1L2 9m0-6v6h6m-4 8a9 9 0 0 0 15 1l3-3m0 6v-6h-6" />
    </>
  ),
  'chevron-start': <path d="m15 5-7 7 7 7" />,
  'chevron-end': <path d="m9 5 7 7-7 7" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1" />
    </>
  ),
  moon: <path d="M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z" />,
  monitor: (
    <>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8m-4-4v4" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18" />
    </>
  ),
  x: <path d="m6 6 12 12M6 18 18 6" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof paths;
export type IconProps = { name: IconName; label?: string; className?: string };

export function Icon({ name, label, className }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      data-icon-mirror={
        name === 'chevron-start' || name === 'chevron-end' ? '' : undefined
      }
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      {paths[name]}
    </svg>
  );
}
