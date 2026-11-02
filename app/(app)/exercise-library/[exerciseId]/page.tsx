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
import {
  normalizeExerciseInput,
  type ExerciseInput,
} from '../../../../lib/catalog/schemas';
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

export function exerciseInput(
  row: Record<string, unknown>,
): ExerciseInput | null {
  const payload = row.payload as Record<string, unknown>;
  const equipment = Array.isArray(payload.equipment_codes)
    ? payload.equipment_codes[0]
    : null;
  const defaults =
    payload.defaults && typeof payload.defaults === 'object'
      ? (payload.defaults as Record<string, unknown>)
      : {};
  const reps =
    defaults.reps && typeof defaults.reps === 'object'
      ? (defaults.reps as Record<string, unknown>)
      : null;
  return {
    names: { ar: String(row.name_ar), en: String(row.name_en) },
    primaryMuscle: String(payload.primary_muscle_code),
    secondaryMuscles: Array.isArray(payload.secondary_muscle_codes)
      ? payload.secondary_muscle_codes.map(String)
      : [],
    equipment: String(equipment),
    lifecycleState: row.lifecycle_state === 'removed' ? 'removed' : 'active',
    defaults: {
      warmupSets:
        typeof defaults.warmup_sets === 'number'
          ? defaults.warmup_sets
          : undefined,
      workingSets:
        typeof defaults.working_sets === 'number'
          ? defaults.working_sets
          : undefined,
      reps:
        reps && typeof reps.min === 'number' && typeof reps.max === 'number'
          ? { kind: 'range', min: reps.min, max: reps.max }
          : reps && typeof reps.value === 'number'
            ? { kind: 'fixed', value: reps.value }
            : undefined,
      restSeconds:
        typeof defaults.rest_seconds === 'number'
          ? defaults.rest_seconds
          : undefined,
      rir:
        typeof defaults.rir === 'number' || defaults.rir === null
          ? defaults.rir
          : undefined,
      alternativeExerciseIds: Array.isArray(defaults.alternative_exercise_ids)
        ? defaults.alternative_exercise_ids.map(String)
        : [],
    },
  };
}

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
  if (actor.role !== 'platform_owner' || typeof query.workspace === 'string') {
    const workspaces = await authoringWorkspaces();
    if (workspaces.status !== 'ok') notFound();
    const allowed =
      actor.role === 'platform_owner'
        ? workspaces.data
        : workspaces.data.filter((item) =>
            actor.activeWorkspaceIds.includes(item.id),
          );
    workspaceOptions = allowed;
    const requested =
      typeof query.workspace === 'string' ? query.workspace : '';
    if (requested && !allowed.some((item) => item.id === requested)) notFound();
    workspaceId =
      requested ||
      (actor.role === 'platform_owner' ? null : (allowed[0]?.id ?? null));
    if (actor.role !== 'platform_owner' && !workspaceId) notFound();
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
