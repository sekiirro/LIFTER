import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Alert } from '../../../../../components/ui/Alert';
import { requireActor } from '../../../../../lib/auth/actor';
import { exerciseDetail } from '../../../../../lib/catalog/server';
import { normalizeExerciseInput } from '../../../../../lib/catalog/schemas';
import {
  LOCALE_COOKIE,
  dirFor,
  parseLocale,
} from '../../../../../lib/design/preferences';
import { getMessages } from '../../../../../lib/i18n';
import { ExerciseAuthoringForm } from '../../ExerciseAuthoringForm';
import { exerciseInput } from '../page';
import styles from '../../exercise-library.module.css';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function EditExercisePage({
  params,
}: {
  params: Promise<{ exerciseId: string }>;
}) {
  const actor = await requireActor();
  if (actor.role !== 'platform_owner') notFound();
  const { exerciseId } = await params;
  if (!UUID.test(exerciseId)) notFound();
  const result = await exerciseDetail({ exerciseId });
  if (result.status === 'not_permitted') notFound();
  if (result.status !== 'ok' || !Array.isArray(result.data) || !result.data[0])
    notFound();
  const row = result.data[0];
  if (row.lifecycle_state !== 'active' || row.requested_id !== row.survivor_id)
    notFound();
  let exercise;
  try {
    exercise = normalizeExerciseInput(
      exerciseInput(row as unknown as Record<string, unknown>)!,
    );
  } catch {
    notFound();
  }
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const m = getMessages(locale);
  return (
    <main className={styles.main} dir={dirFor(locale)} lang={locale}>
      <header className={styles.header}>
        <div>
          <h1>{m['catalog.editAsNewVersion']}</h1>
          <p>
            {m['catalog.detailVersion']}: {row.version}
          </p>
        </div>
      </header>
      <ExerciseAuthoringForm
        locale={locale}
        role="po"
        scope="global"
        workspaceId={null}
        id={row.exercise_id}
        expectedVersion={row.version}
        exercise={exercise}
      />
    </main>
  );
}
