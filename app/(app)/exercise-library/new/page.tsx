import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Button } from '../../../../components/ui/Button';
import { requireActor } from '../../../../lib/auth/actor';
import {
  alternativeOptions,
  authoringWorkspaces,
} from '../../../../lib/catalog/server';
import {
  LOCALE_COOKIE,
  dirFor,
  parseLocale,
} from '../../../../lib/design/preferences';
import { getMessages } from '../../../../lib/i18n';
import { ExerciseAuthoringForm } from '../ExerciseAuthoringForm';
import styles from '../exercise-library.module.css';

type Props = {
  searchParams: Promise<{
    scope?: string | string[];
    workspace?: string | string[];
  }>;
};

export default async function NewExercisePage({ searchParams }: Props) {
  const actor = await requireActor();
  if (
    !actor.role ||
    !(['platform_owner', 'workspace_owner', 'trainer'] as string[]).includes(
      actor.role,
    )
  )
    notFound();
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const m = getMessages(locale);
  const params = await searchParams;
  const requestedScope =
    typeof params.scope === 'string' ? params.scope : 'global';
  const scope =
    actor.role === 'platform_owner' && requestedScope === 'global'
      ? 'global'
      : 'workspace';
  let workspaceId: string | null = null;
  let workspaces: { id: string; name: string }[] = [];
  if (scope === 'workspace') {
    const result = await authoringWorkspaces();
    if (result.status !== 'ok') notFound();
    workspaces =
      actor.role === 'platform_owner'
        ? result.data
        : result.data.filter((workspace) =>
            actor.activeWorkspaceIds.includes(workspace.id),
          );
    const hasRequestedWorkspace =
      params.workspace !== undefined &&
      !(typeof params.workspace === 'string' && params.workspace === '');
    if (
      hasRequestedWorkspace &&
      (typeof params.workspace !== 'string' ||
        !workspaces.some((item) => item.id === params.workspace))
    )
      notFound();
    const requested =
      typeof params.workspace === 'string' ? params.workspace : '';
    workspaceId = requested
      ? requested
      : actor.role === 'platform_owner'
        ? (workspaces[0]?.id ?? null)
        : (actor.activeWorkspaceIds.find((id) =>
            workspaces.some((item) => item.id === id),
          ) ?? null);
    if (!workspaceId) notFound();
  }
  const options = await alternativeOptions({ workspaceId });
  const alternatives = options.status === 'ok' ? options.data : [];
  return (
    <main className={styles.main} dir={dirFor(locale)} lang={locale}>
      <header className={styles.header}>
        <div>
          <h1>{m['catalog.addExercise']}</h1>
          {scope === 'workspace' ? (
            <p>{workspaces.find((item) => item.id === workspaceId)?.name}</p>
          ) : null}
        </div>
        {actor.role === 'platform_owner' ? (
          <form method="get" className={styles.scopeForm}>
            <label className={styles.scopeField} htmlFor="exercise-scope">
              <span>{m['catalog.editorScope']}</span>
              <select id="exercise-scope" name="scope" defaultValue={scope}>
                <option value="global">{m['catalog.editorGlobalScope']}</option>
                <option value="workspace">
                  {m['catalog.editorWorkspaceScope']}
                </option>
              </select>
            </label>
            {scope === 'workspace' ? (
              <label className={styles.scopeField} htmlFor="exercise-workspace">
                <span>{m['catalog.editorWorkspace']}</span>
                <select
                  id="exercise-workspace"
                  name="workspace"
                  defaultValue={workspaceId ?? ''}
                >
                  {workspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>
                      {workspace.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <Button type="submit" variant="secondary">
              {m['catalog.searchSubmit']}
            </Button>
          </form>
        ) : null}
      </header>
      <ExerciseAuthoringForm
        locale={locale}
        role={actor.role === 'platform_owner' ? 'po' : actor.role}
        scope={scope}
        workspaceId={workspaceId}
        alternatives={alternatives}
      />
    </main>
  );
}
