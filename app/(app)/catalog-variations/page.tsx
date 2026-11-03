import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Alert } from '../../../components/ui/Alert';
import { EmptyState } from '../../../components/ui/States';
import { VideoVariationFlow } from '../../../components/catalog/VideoVariationFlow';
import { requireActor } from '../../../lib/auth/actor';
import { exerciseOptions } from '../../../lib/catalog/exercise-options';
import { authoringWorkspaces, search } from '../../../lib/catalog/server';
import { LOCALE_COOKIE, parseLocale } from '../../../lib/design/preferences';
import { getMessages } from '../../../lib/i18n';
import styles from './catalog-variations.module.css';

export default async function CatalogVariationsPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string | string[] }>;
}) {
  const actor = await requireActor();
  if (!actor.role) notFound();
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const messages = getMessages(locale);
  const workspaceResult = await authoringWorkspaces();
  if (workspaceResult.status !== 'ok')
    return (
      <main className={styles.main} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        <h1>{messages['catalog.videoVariationTitle']}</h1>
        <Alert
          tone="error"
          title={messages['catalog.errorTitle']}
        />
      </main>
    );
  const workspaces = workspaceResult.data.map(({ id, name }) => ({
    id,
    label: name,
  }));
  if (!workspaces.length)
    return (
      <main className={styles.main} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        <h1>{messages['catalog.videoVariationTitle']}</h1>
        <EmptyState title={messages['catalog.videoVariationNoWorkspace']} />
      </main>
    );
  const exerciseRows: unknown[] = [];
  let cursor: string | null = null;
  let exerciseStatus = 'ok';
  do {
    const page = await search({
      kind: 'exercise',
      query: '',
      filters: { page_size: 50 },
      cursor,
    });
    if (page.status !== 'ok') {
      exerciseStatus = page.status;
      break;
    }
    if (!Array.isArray(page.data)) {
      exerciseStatus = 'unavailable';
      break;
    }
    exerciseRows.push(...page.data);
    const last = page.data.at(-1) as Record<string, unknown> | undefined;
    cursor =
      page.data.length === 50 && typeof last?.result_id === 'string'
        ? last.result_id
        : null;
  } while (cursor);
  if (exerciseStatus !== 'ok')
    return (
      <main className={styles.main} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        <h1>{messages['catalog.videoVariationTitle']}</h1>
        <Alert
          tone="error"
          title={messages['catalog.errorTitle']}
        />
      </main>
    );
  const exercises = exerciseOptions(exerciseRows, locale);
  if (!exercises.length)
    return (
      <main className={styles.main} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        <h1>{messages['catalog.videoVariationTitle']}</h1>
        <EmptyState title={messages['catalog.videoVariationNoExercise']} />
      </main>
    );
  const requestedWorkspace = (await searchParams).workspace;
  const initialWorkspaceId =
    typeof requestedWorkspace === 'string' &&
    workspaces.some((workspace) => workspace.id === requestedWorkspace)
      ? requestedWorkspace
      : workspaces[0]!.id;
  return (
    <main className={styles.main} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <header>
        <h1>{messages['catalog.videoVariationTitle']}</h1>
      </header>
      <VideoVariationFlow
        locale={locale}
        workspaces={workspaces}
        exercises={exercises}
        initialWorkspaceId={initialWorkspaceId}
      />
    </main>
  );
}
