import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { WorkoutPrintDocument } from '../../../../../../../components/plans/export/WorkoutPrintDocument';
import { requireActor } from '../../../../../../../lib/auth/actor';
import {
  LOCALE_COOKIE,
  parseLocale,
} from '../../../../../../../lib/design/preferences';
import { selectPublishedWorkoutVersion } from '../../../../../../../lib/plans/export/workout-print-data';
import { serverWorkoutVersionLoader } from '../../../../../../../lib/plans/export/server-workout-version-loader';

export default async function WorkoutPlanPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ planId: string; version: string }>;
  searchParams?: Promise<{ locale?: string | string[] }>;
}) {
  const actor = await requireActor();
  const { planId, version: versionText } = await params;
  if (!/^[1-9]\d*$/.test(versionText)) notFound();
  const versionNumber = Number(versionText);
  const selected = await selectPublishedWorkoutVersion(
    serverWorkoutVersionLoader,
    actor,
    { planId, version: versionNumber },
  );
  if (!selected) notFound();

  const [preferences, query] = await Promise.all([
    cookies(),
    searchParams ?? Promise.resolve({} as { locale?: string | string[] }),
  ]);
  const requestedLocale = Array.isArray(query.locale)
    ? query.locale[0]
    : query.locale;
  const locale = parseLocale(
    requestedLocale ?? preferences.get(LOCALE_COOKIE)?.value,
  );

  return <WorkoutPrintDocument version={selected} locale={locale} />;
}
