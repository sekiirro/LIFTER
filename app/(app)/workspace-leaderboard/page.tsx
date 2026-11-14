import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { LeaderboardList } from '../../../components/leaderboard/LeaderboardList';
import styles from '../../../components/leaderboard/leaderboard.module.css';
import { EmptyState } from '../../../components/ui/States';
import { requireActor } from '../../../lib/auth/actor';
import { LOCALE_COOKIE, parseLocale } from '../../../lib/design/preferences';
import { getMessages } from '../../../lib/i18n';
import { canViewWorkspaceLeaderboard } from '../../../lib/leaderboard/authorization';
import { readWorkspaceLeaderboard } from '../../../lib/leaderboard/service';
import { WorkspacePicker } from './WorkspacePicker';
import { loadViewableWorkspaces, selectWorkspace } from './workspaces';

export const dynamic = 'force-dynamic';

/** FR-027 staff viewers: the current approved list of one authorized workspace. */
export default async function WorkspaceLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string | string[] }>;
}) {
  const actor = await requireActor();
  if (actor.role === null) notFound();
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const m = getMessages(locale);
  const workspaces = (await loadViewableWorkspaces(actor)) ?? [];
  const workspace = selectWorkspace(workspaces, (await searchParams).workspace);
  if (!workspace || !canViewWorkspaceLeaderboard(actor, workspace.id))
    notFound();
  const view = await readWorkspaceLeaderboard(actor, workspace.id);
  if (view.status === 'not_permitted') notFound();

  return (
    <main className={styles.main}>
      <h1>{m['leaderboard.title']}</h1>
      <WorkspacePicker
        workspaces={workspaces}
        selectedId={workspace.id}
        label={m['registrationApproval.workspace']}
        submitLabel={m['packages.select']}
      />
      {view.status === 'available' ? (
        <LeaderboardList
          periodMonth={view.periodMonth}
          entries={view.entries}
          locale={locale}
          messages={m}
        />
      ) : (
        <EmptyState title={m['leaderboard.empty']} />
      )}
    </main>
  );
}
