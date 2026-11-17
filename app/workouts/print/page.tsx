import { notFound } from 'next/navigation';
import { WorkoutPrintView } from '../../../components/workout-planner/WorkoutPrintView';
import { loadAuthorizedWorkoutExportPayload } from '../../../lib/workout-planner/export-reader';

export default async function WorkoutPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ revision?: string; locale?: string }>;
}) {
  const params = await searchParams;
  const revision = params.revision;
  const locale = params.locale === 'ar' ? 'ar' : 'en';
  if (!revision) notFound();

  const result = await loadAuthorizedWorkoutExportPayload({
    revisionId: revision,
    locale,
  });
  if (!result.ok) notFound();

  return <WorkoutPrintView payload={result.payload} locale={locale} />;
}
