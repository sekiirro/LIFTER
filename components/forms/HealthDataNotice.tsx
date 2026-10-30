import type { ReactNode } from 'react';
import type { Locale } from '../../lib/design/preferences';
import { Card } from '../ui/Card';

export function HealthDataNotice({
  locale,
  copy,
  draftLabel,
  children,
}: {
  locale: Locale;
  copy: { ar: string; en: string };
  draftLabel: string;
  children?: ReactNode;
}) {
  return (
    <div>
      <Card as="section" aria-label={draftLabel} lang={locale}>
        {process.env.NODE_ENV !== 'production' && (
          <p role="status">{draftLabel}</p>
        )}
        <p>{copy[locale]}</p>
      </Card>
      {children}
    </div>
  );
}
