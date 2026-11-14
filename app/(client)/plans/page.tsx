import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireActor } from '../../../lib/auth/actor';
import { readClientPortalOverview } from '../../../lib/client-access/portal';
import { LOCALE_COOKIE, parseLocale } from '../../../lib/design/preferences';
import { getMessages } from '../../../lib/i18n';
import { Alert } from '../../../components/ui/Alert';
import { Bidi } from '../../../components/ui/Bidi';
import { EmptyState } from '../../../components/ui/States';
import { SubscriptionFacts } from '../../../components/client-portal/SubscriptionFacts';
import {
  formatCount,
  formatPublishedAt,
} from '../../../components/client-portal/format';
import styles from '../../../components/client-portal/client-portal.module.css';

export default async function ClientPlansPage() {
  const actor = await requireActor();
  if (actor.role !== null) notFound();
  const [store, overview] = await Promise.all([
    cookies(),
    readClientPortalOverview(),
  ]);
  if (overview.status === 'denied') notFound();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);
  const m = getMessages(locale);

  return (
    <main className={styles.main}>
      <h1>{m['client.portal.title']}</h1>
      <SubscriptionFacts
        subscription={overview.subscription}
        locale={locale}
        messages={m}
      />
      {overview.status === 'restricted' ? (
        <Alert
          tone="warning"
          title={m['client.portal.restricted']}
          data-testid="client-portal-restricted"
        />
      ) : (
        <section aria-labelledby="delivered-plans" className={styles.panel}>
          <h2 id="delivered-plans">{m['client.portal.deliveredPlans']}</h2>
          {overview.plans.length === 0 ? (
            <EmptyState title={m['client.portal.emptyPlans']} />
          ) : (
            <ul className={styles.list} data-testid="client-portal-plans">
              {overview.plans.map((plan) => (
                <li key={plan.planId} className={styles.panel}>
                  <strong>
                    {plan.kind === 'workout'
                      ? m['client.portal.workout']
                      : m['client.portal.nutrition']}
                  </strong>
                  <p className={styles.meta}>
                    {m['client.portal.revision']}{' '}
                    <Bidi>{formatCount(plan.revisionNumber, locale)}</Bidi>
                    {' · '}
                    <time dateTime={plan.publishedAt}>
                      <Bidi>{formatPublishedAt(plan.publishedAt, locale)}</Bidi>
                    </time>
                  </p>
                  <Link className={styles.link} href={`/plans/${plan.planId}`}>
                    {m['client.portal.viewPlan']}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
