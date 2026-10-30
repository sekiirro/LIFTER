'use client';

import {
  useCallback,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from 'react';
import type { Locale } from '../../lib/design/preferences';
import { Bidi } from '../ui/Bidi';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

const mockAcceptanceEvent = 'f15-mock-acceptance-change';

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
  acceptedContent,
  pendingMessage,
  mockAcceptanceKey,
}: {
  locale: Locale;
  policy: TermsPolicy;
  labels: TermsCardLabels;
  onAccept: (acceptance: TermsAcceptance) => void | Promise<void>;
  acceptedContent?: ReactNode;
  pendingMessage?: string;
  mockAcceptanceKey?: string;
}) {
  const [unavailable, setUnavailable] = useState(false);
  const subscribe = useCallback(
    (notify: () => void) => {
      if (!mockAcceptanceKey || process.env.NODE_ENV === 'production')
        return () => undefined;
      window.addEventListener('storage', notify);
      window.addEventListener(mockAcceptanceEvent, notify);
      return () => {
        window.removeEventListener('storage', notify);
        window.removeEventListener(mockAcceptanceEvent, notify);
      };
    },
    [mockAcceptanceKey],
  );
  const getAcceptanceSnapshot = useCallback(() => {
    if (!mockAcceptanceKey || process.env.NODE_ENV === 'production')
      return false;
    try {
      const stored = window.sessionStorage.getItem(mockAcceptanceKey);
      const acceptance = stored
        ? (JSON.parse(stored) as TermsAcceptance)
        : null;
      return acceptance?.policyVersion === policy.version;
    } catch {
      return false;
    }
  }, [mockAcceptanceKey, policy.version]);
  const accepted = useSyncExternalStore(
    subscribe,
    getAcceptanceSnapshot,
    () => false,
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const termsAccepted = form.get('terms') === 'accepted';
    if (!canAcceptTerms(termsAccepted, policy.isDraft)) {
      setUnavailable(true);
      return;
    }

    setUnavailable(false);
    const acceptance = {
      policyVersion: policy.version,
      marketingAccepted: form.get('marketing') === 'accepted',
    };
    void onAccept(acceptance);
    if (mockAcceptanceKey && process.env.NODE_ENV !== 'production') {
      window.sessionStorage.setItem(
        mockAcceptanceKey,
        JSON.stringify(acceptance),
      );
      window.dispatchEvent(new Event(mockAcceptanceEvent));
    }
  }

  if (accepted && acceptedContent) return acceptedContent;

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
        {pendingMessage && <p role="status">{pendingMessage}</p>}
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
