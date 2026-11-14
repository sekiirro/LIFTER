import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireActor } from '../../../../lib/auth/actor';
import { readClientPortalPlan } from '../../../../lib/client-access/portal';
import {
  isUuid,
  parseRevisionParam,
} from '../../../../lib/client-access/portal-projection';
import { LOCALE_COOKIE, parseLocale } from '../../../../lib/design/preferences';
import { getMessages } from '../../../../lib/i18n';
import { Alert } from '../../../../components/ui/Alert';
import { Bidi } from '../../../../components/ui/Bidi';
import { Button } from '../../../../components/ui/Button';
import { SubscriptionFacts } from '../../../../components/client-portal/SubscriptionFacts';
import {
  formatCount,
  formatPublishedAt,
} from '../../../../components/client-portal/format';
import styles from '../../../../components/client-portal/client-portal.module.css';

/**
 * One own delivered plan at the selected published revision. Every request
 * re-reads through `client_portal_plan`, so a stale page or URL cannot keep
 * access after F13 denies it. Plan body rendering belongs to the F17/F18
 * renderers, which are not on main yet (BLOCKED in the F22 PR).
 */
export default async function ClientPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ revision?: string | string[] }>;
}) {
  const [{ planId }, query] = await Promise.all([params, searchParams]);
  const revision = parseRevisionParam(query.revision);
  if (!isUuid(planId) || revision === 'invalid') notFound();
  const actor = await requireActor();
  if (actor.role !== null) notFound();
  const [store, result] = await Promise.all([
    cookies(),
    readClientPortalPlan(planId, revision),
  ]);
  if (result.status === 'denied' || result.status === 'not_found') notFound();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);
  const m = getMessages(locale);

  if (result.status === 'restricted')
    return (
      <main className={styles.main}>
        <h1>{m['client.portal.title']}</h1>
        <SubscriptionFacts
          subscription={result.subscription}
          locale={locale}
          messages={m}
        />
        <Alert
          tone="warning"
          title={m['client.portal.restricted']}
          data-testid="client-portal-restricted"
        />
      </main>
    );

  const { plan, revisions } = result;
  return (
    <main className={styles.main}>
      <Link className={styles.link} href="/plans">
        {m['client.portal.title']}
      </Link>
      <h1>
        {plan.kind === 'workout'
          ? m['client.portal.workout']
          : m['client.portal.nutrition']}
      </h1>
      <SubscriptionFacts
        subscription={result.subscription}
        locale={locale}
        messages={m}
      />
      <section className={styles.panel} data-testid="client-plan-revision">
        <p className={styles.meta}>
          {m['client.portal.revision']}{' '}
          <Bidi>{formatCount(plan.revisionNumber, locale)}</Bidi>
          {' · '}
          <time dateTime={plan.publishedAt}>
            <Bidi>{formatPublishedAt(plan.publishedAt, locale)}</Bidi>
          </time>
        </p>
        {revisions.length > 1 && (
          <form method="get" className={styles.form}>
            <div className={styles.control}>
              <label htmlFor="revision">{m['client.portal.revision']}</label>
              <select
                id="revision"
                name="revision"
                defaultValue={String(plan.revisionNumber)}
              >
                {revisions.map((r) => (
                  <option key={r.revisionNumber} value={r.revisionNumber}>
                    {formatCount(r.revisionNumber, locale)} ·{' '}
                    {formatPublishedAt(r.publishedAt, locale)}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="secondary">
              {m['client.portal.viewPlan']}
            </Button>
          </form>
        )}
      </section>
    </main>
  );
}
