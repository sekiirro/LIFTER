import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { Alert } from '../../../components/ui/Alert';
import { EmptyState } from '../../../components/ui/States';
import { VideoVariationFlow } from '../../../components/catalog/VideoVariationFlow';
import { requireActor } from '../../../lib/auth/actor';
import { authoringWorkspaces, search } from '../../../lib/catalog/server';
import { LOCALE_COOKIE, parseLocale } from '../../../lib/design/preferences';
import { getMessages } from '../../../lib/i18n';
import styles from './catalog-variations.module.css';

function exerciseOptions(data: unknown, locale: 'ar' | 'en') {
  if (!Array.isArray(data)) return [];
  return data.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const row = value as Record<string, unknown>;
    if (
      typeof row.result_id !== 'string' ||
      !row.result_payload ||
      typeof row.result_payload !== 'object'
    )
      return [];
    const payload = row.result_payload as Record<string, unknown>;
    const names =
      payload.names && typeof payload.names === 'object'
        ? (payload.names as Record<string, unknown>)
        : {};
    const name = names[locale];
    const fallback = names[locale === 'ar' ? 'en' : 'ar'];
    const label =
      typeof name === 'string'
        ? name
        : typeof fallback === 'string'
          ? fallback
          : row.result_id;
    return [{ id: row.result_id, label }];
  });
}

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
  if (workspaceResult.status !== 'ok' || exerciseStatus !== 'ok')
    return (
      <main className={styles.main} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        <h1>{messages['catalog.videoVariationTitle']}</h1>
        <Alert
          tone="error"
          title={messages['catalog.videoVariationUnavailable']}
        />
      </main>
    );
  const workspaces = workspaceResult.data.map(({ id, name }) => ({
    id,
    label: name,
  }));
  const exercises = exerciseOptions(exerciseRows, locale);
  if (!workspaces.length)
    return (
      <main className={styles.main} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        <h1>{messages['catalog.videoVariationTitle']}</h1>
        <EmptyState title={messages['catalog.videoVariationNoWorkspace']} />
      </main>
    );
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
