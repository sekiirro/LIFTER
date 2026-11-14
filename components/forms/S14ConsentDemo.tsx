'use client';

import { useState } from 'react';
import type { Locale } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import { Card } from '../ui/Card';
import type { TermsPolicy } from './TermsCard';
import { TermsCard } from './TermsCard';
import { QuestionFlow, type FormsClientAdapter } from './QuestionFlow';
import styles from './S14ConsentDemo.module.css';

const healthDemoAdapter: FormsClientAdapter = {
  async reloadDraft() {
    return { status: 'loaded', revision: 1, answers: {} };
  },
  async saveDraft() {
    return { status: 'saved', revision: 2 };
  },
  async submit() {
    return { status: 'submitted', revision: 2 };
  },
  async correct() {
    return { status: 'saved', revision: 3 };
  },
};

export function S14ConsentDemo({
  locale,
  sections,
  view = 'terms',
}: {
  locale: Locale;
  sections: TermsPolicy['sections'];
  view?: 'terms' | 'welcome' | 'health';
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

  if (view === 'health') {
    return (
      <QuestionFlow
        locale={locale}
        questions={[
          {
            id: 'health-question-example',
            sectionId: 'health',
            type: 'longText',
            required: false,
            privacy: 'health',
            title: {
              en: copy['forms.healthQuestionExample'],
              ar: copy['forms.healthQuestionExample'],
            },
          },
        ]}
        adapter={healthDemoAdapter}
        assignmentId="s14-health-context-showcase"
      />
    );
  }

  if (view === 'welcome') return welcome;

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
    </main>
  );
}
