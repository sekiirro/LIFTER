'use client';

import { useState, type FormEvent } from 'react';
import type { Locale } from '../../lib/design/preferences';
import { Bidi } from '../ui/Bidi';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

export type TermsPolicy = {
  version: string;
  isDraft: boolean;
  draftLabel: string;
  sections: readonly { title: string; body: string }[];
};

export type TermsCardLabels = {
  title: string;
  requiredTerms: string;
  optionalMarketing: string;
  accept: string;
  unavailable: string;
};

export type TermsAcceptance = {
  policyVersion: string;
  marketingAccepted: boolean;
};

export function canAcceptTerms(
  termsAccepted: boolean,
  isDraft = false,
  isDevelopment = process.env.NODE_ENV !== 'production',
) {
  return termsAccepted && (!isDraft || isDevelopment);
}

export function TermsCard({
  locale,
  policy,
  labels,
  onAccept,
}: {
  locale: Locale;
  policy: TermsPolicy;
  labels: TermsCardLabels;
  onAccept: (acceptance: TermsAcceptance) => void | Promise<void>;
}) {
  const [unavailable, setUnavailable] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const termsAccepted = form.get('terms') === 'accepted';
    if (!canAcceptTerms(termsAccepted, policy.isDraft)) {
      setUnavailable(true);
      return;
    }

    setUnavailable(false);
    void onAccept({
      policyVersion: policy.version,
      marketingAccepted: form.get('marketing') === 'accepted',
    });
  }

  return (
    <Card as="section" aria-labelledby="terms-card-title" lang={locale}>
      <h1 id="terms-card-title">{labels.title}</h1>
      {policy.isDraft && process.env.NODE_ENV !== 'production' && (
        <p role="status">{policy.draftLabel}</p>
      )}
      {policy.sections.map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          <p>
            <Bidi>{section.body}</Bidi>
          </p>
        </section>
      ))}
      <p>
        <Bidi dir="ltr">{policy.version}</Bidi>
      </p>
      <form onSubmit={submit}>
        <fieldset>
          <legend>{labels.title}</legend>
          <label>
            <input type="checkbox" name="terms" value="accepted" required />
            {labels.requiredTerms}
          </label>
          <label>
            <input type="checkbox" name="marketing" value="accepted" />
            {labels.optionalMarketing}
          </label>
        </fieldset>
        {unavailable && <p role="alert">{labels.unavailable}</p>}
        <Button type="submit">{labels.accept}</Button>
      </form>
    </Card>
  );
}
