import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { requireActor } from '../../../../../lib/auth/actor';
import {
  isUuid,
  parseRevisionParam,
} from '../../../../../lib/client-access/portal-projection';
import {
  LOCALE_COOKIE,
  parseLocale,
} from '../../../../../lib/design/preferences';
import { createSessionClient } from '../../../../../lib/supabase/server';
import { exportClientWorkoutPlan } from '../../../../../lib/workout-planner/client-export';
import { WorkoutPrintView } from '../../../../../components/workout-planner/WorkoutPrintView';

/**
 * F22 US4: the F17 workout PDF is its print view printed. Rendering this page
 * is the audited export call (`exportClientWorkoutPlan`, fail-closed audit);
 * every denial, a foreign or unknown plan included, answers 404.
 */
export default async function ClientWorkoutPrintPage({
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
  const client = await createSessionClient();
  if (!client) notFound();
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const result = await exportClientWorkoutPlan(client, {
    planId,
    revisionNumber: revision,
    format: 'pdf',
    locale,
  });
  if (result.status !== 'ok' || result.format !== 'pdf') notFound();
  return <WorkoutPrintView payload={result.payload} locale={locale} />;
}
