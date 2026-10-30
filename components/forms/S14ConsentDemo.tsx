'use client';

import { useState } from 'react';
import type { Locale } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import { Card } from '../ui/Card';
import type { TermsPolicy } from './TermsCard';
import { TermsCard } from './TermsCard';
import { HealthDataNotice } from './HealthDataNotice';
import styles from './S14ConsentDemo.module.css';

export function S14ConsentDemo({
  locale,
  sections,
  notice,
  view = 'terms',
}: {
  locale: Locale;
  sections: TermsPolicy['sections'];
  notice: { ar: string; en: string; title: { ar: string; en: string } };
  view?: 'terms' | 'welcome';
}) {
  const copy = getMessages(locale);
  const [accepted, setAccepted] = useState(false);
  const policy: TermsPolicy = {
    version: 'terms-draft-v1',
    isDraft: true,
    draftLabel: copy['forms.copyDraft'],
    sections,
  };
  const welcome = (
    <main className={styles.main}>
      <Card as="section" aria-labelledby="welcome-title" lang={locale}>
        <h1 id="welcome-title">{copy['forms.welcomeTitle']}</h1>
        <p>{copy['forms.welcomeBody']}</p>
        {process.env.NODE_ENV !== 'production' && (
          <p role="status">{copy['forms.welcomeDraftStatus']}</p>
        )}
      </Card>
    </main>
  );

  if (view === 'welcome') {
    return (
      <TermsCard
        locale={locale}
        policy={policy}
        labels={{
          title: copy['forms.termsCardTitle'],
          requiredTerms: copy['forms.requiredTerms'],
          optionalMarketing: copy['forms.optionalMarketing'],
          accept: copy['forms.acceptTerms'],
          unavailable: copy['forms.draftAcceptanceUnavailable'],
        }}
        onAccept={() => undefined}
        pendingMessage={copy['forms.intakeIncomplete']}
        acceptedContent={welcome}
        mockAcceptanceKey="f15-welcome-terms-mock-v1"
      />
    );
  }

  return (
    <main className={styles.main}>
      <TermsCard
        locale={locale}
        policy={policy}
        labels={{
          title: copy['forms.termsCardTitle'],
          requiredTerms: copy['forms.requiredTerms'],
          optionalMarketing: copy['forms.optionalMarketing'],
          accept: copy['forms.acceptTerms'],
          unavailable: copy['forms.draftAcceptanceUnavailable'],
        }}
        onAccept={() => setAccepted(true)}
      />
      {accepted && <p role="status">{copy['forms.draftAcceptanceMock']}</p>}
      <HealthDataNotice
        locale={locale}
        copy={notice}
        title={notice.title[locale]}
        draftLabel={copy['forms.copyDraft']}
      >
        <h2>{copy['forms.healthQuestionExample']}</h2>
      </HealthDataNotice>
    </main>
  );
}
