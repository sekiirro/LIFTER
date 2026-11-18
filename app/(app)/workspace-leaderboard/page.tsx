import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LeaderboardList } from '../../../components/leaderboard/LeaderboardList';
import styles from '../../../components/leaderboard/leaderboard.module.css';
import { EmptyState } from '../../../components/ui/States';
import { requireActor } from '../../../lib/auth/actor';
import { LOCALE_COOKIE, parseLocale } from '../../../lib/design/preferences';
import { getMessages } from '../../../lib/i18n';
import {
  canDecideLeaderboard,
  canViewWorkspaceLeaderboard,
} from '../../../lib/leaderboard/authorization';
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
  if (view.status === 'unavailable') throw new Error('leaderboard_unavailable');

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
      {canDecideLeaderboard(actor) && (
        <p>
          <Link
            href={`/workspace-leaderboard/review?workspace=${encodeURIComponent(workspace.id)}`}
          >
            {m['leaderboard.publish.action']}
          </Link>
        </p>
      )}
    </main>
  );
}
