import type { ReactNode } from 'react';

export function Bidi({
  children,
  dir = 'auto',
}: {
  children: ReactNode;
  dir?: 'ltr' | 'rtl' | 'auto';
}) {
  return <bdi dir={dir}>{children}</bdi>;
}
