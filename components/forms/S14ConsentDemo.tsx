'use client';

import { useState } from 'react';
import type { Locale } from '../../lib/design/preferences';
import type { TermsPolicy } from './TermsCard';
import { TermsCard } from './TermsCard';
import { HealthDataNotice } from './HealthDataNotice';
import styles from './S14ConsentDemo.module.css';

const labels = {
  en: {
    title: 'Terms and conditions',
    requiredTerms: 'I accept the terms and conditions',
    optionalMarketing: 'I agree to receive marketing updates',
    accept: 'Continue',
    unavailable: 'This draft policy cannot be accepted in production.',
    draft: 'DRAFT — PO approval required before ship',
    accepted: 'Draft acceptance reached the mock adapter.',
    healthDraft: 'DRAFT — PO approval required',
    question: 'Health question example',
  },
  ar: {
    title: 'الشروط والأحكام',
    requiredTerms: 'أوافق على الشروط والأحكام',
    optionalMarketing: 'أوافق على تلقي تحديثات تسويقية',
    accept: 'متابعة',
    unavailable: 'لا يمكن قبول هذه المسودة في الإنتاج.',
    draft: 'مسودة — تتطلب موافقة مالك المنتج قبل النشر',
    accepted: 'وصل قبول المسودة إلى المحول الوهمي.',
    healthDraft: 'مسودة — تتطلب موافقة مالك المنتج',
    question: 'مثال على سؤال صحي',
  },
} as const;

export function S14ConsentDemo({
  locale,
  sections,
  notice,
}: {
  locale: Locale;
  sections: TermsPolicy['sections'];
  notice: { ar: string; en: string };
}) {
  const copy = labels[locale];
  const [accepted, setAccepted] = useState(false);
  const policy: TermsPolicy = {
    version: 'terms-draft-v1',
    isDraft: true,
    draftLabel: copy.draft,
    sections,
  };

  return (
    <main className={styles.main}>
      <TermsCard
        locale={locale}
        policy={policy}
        labels={copy}
        onAccept={() => setAccepted(true)}
      />
      {accepted && <p role="status">{copy.accepted}</p>}
      <HealthDataNotice
        locale={locale}
        copy={notice}
        title={notice[locale]}
        draftLabel={copy.healthDraft}
      >
        <h2>{copy.question}</h2>
      </HealthDataNotice>
    </main>
  );
}
