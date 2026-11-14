'use client';

import type { ReactNode } from 'react';
import type { Locale } from '../../lib/design/preferences';
import { TermsCard, type TermsCardLabels, type TermsPolicy } from './TermsCard';

export function WelcomeTermsCard({
  locale,
  policy,
  labels,
  pendingMessage,
  mockAcceptanceKey,
  children,
}: {
  locale: Locale;
  policy: TermsPolicy;
  labels: TermsCardLabels;
  pendingMessage: string;
  children?: ReactNode;
  mockAcceptanceKey: string;
}) {
  return (
    <TermsCard
      locale={locale}
      policy={policy}
      labels={labels}
      onAccept={() => undefined}
      pendingMessage={pendingMessage}
      acceptedContent={children}
      mockAcceptanceKey={mockAcceptanceKey}
    />
  );
}
