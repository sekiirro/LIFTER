'use client';

import { useState } from 'react';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { Bidi } from '../ui/Bidi';
import type { Locale } from '../../lib/design/preferences';
import { dirFor } from '../../lib/design/preferences';
import { getMessages } from '../../lib/i18n';
import type { DuplicateCandidate } from '../../lib/catalog/food-editor';
import styles from './FoodEditor.module.css';

export type DuplicateReviewProps = {
  locale: Locale;
  role: 'po' | 'workspace_owner' | 'trainer' | 'sales' | 'client';
  state: 'none' | 'exact' | 'near';
  candidates: readonly DuplicateCandidate[];
  onConfirm?: () => void;
  onCancel?: () => void;
};

export function DuplicateReview({
  locale,
  role,
  state,
  candidates,
  onConfirm,
  onCancel,
}: DuplicateReviewProps) {
  const m = getMessages(locale);
  const [confirmed, setConfirmed] = useState(false);
  if (state === 'none') return null;
  const exact = state === 'exact';
  const title = exact
    ? m['catalog.duplicateExactTitle']
    : m['catalog.duplicateNearTitle'];
  return (
    <section
      className={styles.editor}
      dir={dirFor(locale)}
      lang={locale}
      data-catalog-locale={locale}
      data-catalog-role={role}
      data-testid="duplicate-review"
      aria-labelledby="duplicate-review-title"
    >
      <h2 id="duplicate-review-title">{title}</h2>
      <Alert tone={exact ? 'error' : 'warning'} title={title}>
        {exact
          ? m['catalog.duplicateExactDescription']
          : m['catalog.duplicateNearDescription']}
      </Alert>
      {candidates.length ? (
        <ul className={styles.group} aria-label={title}>
          {candidates.map((candidate) => (
            <li key={candidate.id} className={styles.candidate}>
              <strong>
                <Bidi dir="auto">
                  {candidate.names[locale] ??
                    candidate.names.en ??
                    candidate.names.ar ??
                    '—'}
                </Bidi>
              </strong>
              <span>
                <Bidi dir="ltr">
                  {candidate.kcal} {m['catalog.foodKcalUnit']}
                </Bidi>{' '}
                /{' '}
                {candidate.basis === 'g'
                  ? m['catalog.foodPer100g']
                  : m['catalog.foodPer100ml']}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p>{m['catalog.duplicateNoCandidates']}</p>
      )}
      {exact ? (
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onCancel}>
            {m['catalog.duplicateCancel']}
          </Button>
        </div>
      ) : (
        <>
          <div className={styles.field}>
            <label>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.currentTarget.checked)}
              />{' '}
              {m['catalog.duplicateConfirm']}
            </label>
          </div>
          <div className={styles.actions}>
            <Button disabled={!confirmed} onClick={onConfirm}>
              {m['catalog.duplicateContinue']}
            </Button>
            <Button variant="secondary" onClick={onCancel}>
              {m['catalog.duplicateCancel']}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
