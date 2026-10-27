import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { requireActor } from '../../../lib/auth/actor';
import { createSessionClient } from '../../../lib/supabase/server';
import { loadPackageManagement } from '../../../lib/packages/read';
import { isUuid } from '../../../lib/packages/validation';
import { LOCALE_COOKIE, parseLocale } from '../../../lib/design/preferences';
import { getMessages } from '../../../lib/i18n';
import { EmptyState } from '../../../components/ui/States';
import { Alert } from '../../../components/ui/Alert';
import { PackagesManager } from './PackagesManager';
import styles from './packages.module.css';
export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string | string[] }>;
}) {
  const actor = await requireActor();
  if (actor.role !== 'platform_owner') notFound();
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);
  const m = getMessages(locale);
  const failure = (
    <main className={styles.main}>
      <h1>{m['packages.title']}</h1>
      <Alert tone="error" title={m['packages.unavailable']} />
      <a href="/packages">{m['packages.retry']}</a>
    </main>
  );
  const workspaces = await loadWorkspaces();
  if (!workspaces) return failure;
  if (workspaces.length === 0)
    return (
      <main className={styles.main}>
        <h1>{m['packages.title']}</h1>
        <EmptyState title={m['packages.noWorkspace']} />
      </main>
    );
  const params = await searchParams;
  const workspaceId =
    params.workspace === undefined ? workspaces[0]!.id : params.workspace;
  if (!isUuid(workspaceId) || !workspaces.some((w) => w.id === workspaceId))
    return failure;
  const data = await loadPackageManagement(actor, workspaceId);
  if (data.status !== 'ok') return failure;
  return (
    <PackagesManager
      key={workspaceId}
      workspaceId={workspaceId}
      workspaces={workspaces}
      data={data}
      locale={locale}
    />
  );
}
async function loadWorkspaces(): Promise<
  { id: string; name: string }[] | null
> {
  try {
    const client = await createSessionClient();
    if (!client) return null;
    const result = await client
      .from('workspaces')
      .select('id,name')
      .order('name');
    return result.error ? null : result.data;
  } catch {
    return null;
  }
}
