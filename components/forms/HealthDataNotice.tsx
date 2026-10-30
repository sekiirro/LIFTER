import type { ReactNode } from 'react';
import type { Locale } from '../../lib/design/preferences';
import { Card } from '../ui/Card';

export function HealthDataNotice({
  locale,
  copy,
  title,
  draftLabel,
  children,
}: {
  locale: Locale;
  copy: { ar: string; en: string };
  title: string;
  draftLabel: string;
  children?: ReactNode;
}) {
  return (
    <div>
      <Card
        as="section"
        aria-labelledby="health-data-notice-title"
        lang={locale}
      >
        {process.env.NODE_ENV !== 'production' && (
          <p role="status">{draftLabel}</p>
        )}
        <h2 id="health-data-notice-title">{title}</h2>
        {title !== copy[locale] && <p>{copy[locale]}</p>}
      </Card>
      {children}
    </div>
  );
}
