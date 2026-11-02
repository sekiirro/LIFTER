import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Alert } from '../../../../components/ui/Alert';
import { Button } from '../../../../components/ui/Button';
import { ExerciseDetailView } from '../../../../components/catalog/ExerciseDetailView';
import { requireActor } from '../../../../lib/auth/actor';
import {
  authoringWorkspaces,
  exerciseDetail,
} from '../../../../lib/catalog/server';
import { normalizeExerciseInput } from '../../../../lib/catalog/schemas';
import { exerciseInput } from '../../../../lib/catalog/exercise-input';
import {
  LOCALE_COOKIE,
  dirFor,
  parseLocale,
} from '../../../../lib/design/preferences';
import { getMessages } from '../../../../lib/i18n';
import styles from '../exercise-library.module.css';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Props = {
  params: Promise<{ exerciseId: string }>;
  searchParams: Promise<{ workspace?: string | string[] }>;
};

export default async function ExerciseDetailPage({
  params,
  searchParams,
}: Props) {
  const actor = await requireActor();
  if (
    !actor.role ||
    !(['platform_owner', 'workspace_owner', 'trainer'] as string[]).includes(
      actor.role,
    )
  )
    notFound();
  const [{ exerciseId }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(exerciseId)) notFound();
  let workspaceId: string | null = null;
  let workspaceOptions: { id: string; name: string }[] = [];
  const workspaces = await authoringWorkspaces();
  if (workspaces.status !== 'ok') notFound();
  const allowed =
    actor.role === 'platform_owner'
      ? workspaces.data
      : workspaces.data.filter((item) =>
          actor.activeWorkspaceIds.includes(item.id),
        );
  const requested = typeof query.workspace === 'string' ? query.workspace : '';
  if (
    requested &&
    actor.role !== 'platform_owner' &&
    !actor.activeWorkspaceIds.includes(requested)
  )
    notFound();
  workspaceId =
    requested ||
    (actor.role === 'platform_owner'
      ? null
      : (actor.activeWorkspaceIds[0] ?? null));
  if (actor.role !== 'platform_owner' && !workspaceId) notFound();
  workspaceOptions = allowed;
  if (workspaceId && !allowed.some((item) => item.id === workspaceId)) {
    workspaceOptions = [...allowed, { id: workspaceId, name: workspaceId }];
  }
  const result = await exerciseDetail({ exerciseId, workspaceId });
  if (result.status === 'not_permitted') notFound();
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const m = getMessages(locale);
  const row =
    result.status === 'ok' && Array.isArray(result.data)
      ? (result.data[0] as Record<string, unknown> | undefined)
      : undefined;
  if (!row)
    return (
      <main className={styles.main} dir={dirFor(locale)} lang={locale}>
        <Alert tone="error" title={m['catalog.editorStatusError']}>
          {m['catalog.editorStatusErrorDescription']}
        </Alert>
      </main>
    );
  let exercise;
  try {
    exercise = normalizeExerciseInput(exerciseInput(row)!);
  } catch {
    notFound();
  }
  return (
    <main className={styles.main} dir={dirFor(locale)} lang={locale}>
      <header className={styles.header}>
        <div>
          <h1>{m['catalog.exerciseTitle']}</h1>
          <p>{exercise.names[locale] || exercise.names.en}</p>
        </div>
        {workspaceOptions.length ? (
          <form method="get" className={styles.scopeForm}>
            <label className={styles.scopeField} htmlFor="detail-workspace">
              <span>{m['catalog.editorWorkspace']}</span>
              <select
                id="detail-workspace"
                name="workspace"
                defaultValue={workspaceId ?? ''}
              >
                {actor.role === 'platform_owner' ? (
                  <option value="">{m['catalog.editorNone']}</option>
                ) : null}
                {workspaceOptions.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" variant="secondary">
              {m['catalog.searchSubmit']}
            </Button>
          </form>
        ) : null}
      </header>
      <ExerciseDetailView
        locale={locale}
        row={row as never}
        exercise={exercise}
        canEdit={actor.role === 'platform_owner'}
      />
    </main>
  );
}
