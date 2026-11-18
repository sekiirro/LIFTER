import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireActor } from '../../../lib/auth/actor';
import { readClientPortalOverview } from '../../../lib/client-access/portal';
import { readClientNotices } from '../../../lib/client-access/notices';
import { LOCALE_COOKIE, parseLocale } from '../../../lib/design/preferences';
import { getMessages } from '../../../lib/i18n';
import { takeLeaderboardDashboardNotice } from '../../../lib/leaderboard/service';
import { LeaderboardDashboardNotice } from '../../../components/leaderboard/DashboardNotice';
import { Alert } from '../../../components/ui/Alert';
import { Bidi } from '../../../components/ui/Bidi';
import { EmptyState } from '../../../components/ui/States';
import { SubscriptionFacts } from '../../../components/client-portal/SubscriptionFacts';
import { ClientNotices } from '../../../components/client-portal/ClientNotices';
import {
  formatCount,
  formatPublishedAt,
} from '../../../components/client-portal/format';
import styles from '../../../components/client-portal/client-portal.module.css';

export default async function ClientPlansPage() {
  const actor = await requireActor();
  if (actor.role !== null) notFound();
  const [store, overview, notices] = await Promise.all([
    cookies(),
    readClientPortalOverview(),
    readClientNotices(),
  ]);
  if (overview.status === 'denied') notFound();
  // F24 FR-005: shown once, when the client first becomes eligible.
  const leaderboardNotice =
    overview.status === 'ok'
      ? await takeLeaderboardDashboardNotice(actor)
      : 'not_shown';
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
      {leaderboardNotice === 'first_view' && (
        <LeaderboardDashboardNotice messages={m} />
      )}
      {/* FR-004: the restricted dashboard shows only status, end date and the restricted state. */}
      {overview.status === 'ok' && (
        <ClientNotices result={notices} locale={locale} messages={m} />
      )}
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
