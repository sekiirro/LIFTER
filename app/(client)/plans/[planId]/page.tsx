import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireActor } from '../../../../lib/auth/actor';
import {
  readClientNutritionPlan,
  readClientPortalPlan,
} from '../../../../lib/client-access/portal';
import { renderNutritionPrintHtml } from '../../../../lib/plans/nutrition/export';
import { readClientWorkoutView } from '../../../../lib/workout-planner/client-export';
import { createSessionClient } from '../../../../lib/supabase/server';
import { WorkoutPrintView } from '../../../../components/workout-planner/WorkoutPrintView';
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
 * access after F13 denies it. The nutrition body is the F18 print renderer
 * (one renderer shared with print/export, S57-PO-9) over the client-wall read
 * `client_portal_nutrition_plan`; the workout body is the F17 `WorkoutPrintView`
 * over the client-wall read `client_portal_workout_plan` (no second renderer).
 */
export default async function ClientPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{
    revision?: string | string[];
    export?: string | string[];
  }>;
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
  const nutrition =
    plan.kind === 'nutrition'
      ? await readClientNutritionPlan(planId, plan.revisionNumber)
      : null;
  const workoutClient =
    plan.kind === 'workout' ? await createSessionClient() : null;
  const workout =
    plan.kind === 'workout'
      ? workoutClient
        ? await readClientWorkoutView(workoutClient, {
            planId,
            revisionNumber: plan.revisionNumber,
            locale,
          })
        : ({ status: 'denied' } as const)
      : null;
  const exportBase = `/plans/${planId}/export?revision=${plan.revisionNumber}`;
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
      {query.export === 'unavailable' && (
        <Alert
          tone="warning"
          title={m['client.portal.exportUnavailable']}
          data-testid="client-plan-export-unavailable"
        />
      )}
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
      {nutrition && nutrition.status !== 'ok' && (
        <Alert tone="error" title={m['states.error.title']}>
          <p>{m['states.error.description']}</p>
        </Alert>
      )}
      {workout && workout.status !== 'ok' && (
        <Alert tone="error" title={m['states.error.title']}>
          <p>{m['states.error.description']}</p>
        </Alert>
      )}
      {workout?.status === 'ok' && (
        <section
          className={styles.panel}
          aria-label={m['client.portal.workout']}
          data-testid="client-workout-plan"
        >
          <WorkoutPrintView payload={workout.payload} locale={locale} />
          <p className={styles.pager}>
            <a
              className={styles.link}
              href={`${exportBase}&format=pdf`}
              data-testid="client-plan-export-pdf"
            >
              {m['client.portal.exportPdf']}
            </a>
            <a
              className={styles.link}
              href={`${exportBase}&format=excel`}
              data-testid="client-plan-export-excel"
            >
              {m['client.portal.exportExcel']}
            </a>
          </p>
        </section>
      )}
      {nutrition?.status === 'ok' && (
        <section
          className={styles.panel}
          aria-label={m['client.portal.nutrition']}
          data-testid="client-nutrition-plan"
        >
          {/* F18 print document: static HTML + inline CSS, sandboxed (no scripts, forms or navigation). */}
          <iframe
            className={styles.planFrame}
            title={m['client.portal.nutrition']}
            sandbox=""
            srcDoc={renderNutritionPrintHtml(nutrition.projection, locale)}
          />
          <p className={styles.pager}>
            <a
              className={styles.link}
              href={`${exportBase}&format=pdf`}
              data-testid="client-plan-export-pdf"
            >
              {m['client.portal.exportPdf']}
            </a>
            <a
              className={styles.link}
              href={`${exportBase}&format=excel`}
              data-testid="client-plan-export-excel"
            >
              {m['client.portal.exportExcel']}
            </a>
          </p>
        </section>
      )}
    </main>
  );
}
