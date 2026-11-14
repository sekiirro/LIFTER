import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { LeaderboardList } from '../../../../components/leaderboard/LeaderboardList';
import styles from '../../../../components/leaderboard/leaderboard.module.css';
import { EmptyState } from '../../../../components/ui/States';
import { requireActor } from '../../../../lib/auth/actor';
import { LOCALE_COOKIE, parseLocale } from '../../../../lib/design/preferences';
import { getMessages } from '../../../../lib/i18n';
import { canDecideLeaderboard } from '../../../../lib/leaderboard/authorization';
import { readPendingCandidate } from '../../../../lib/leaderboard/service';
import { approveLeaderboardAction } from '../actions';
import { WorkspacePicker } from '../WorkspacePicker';
import { loadViewableWorkspaces, selectWorkspace } from '../workspaces';
import { ApproveForm } from './ApproveForm';

export const dynamic = 'force-dynamic';

/**
 * FR-003/FR-028: Platform Owner review of the pending monthly candidate. It
 * shows rank and username only; the WhatsApp verification happens off-app.
 */
export default async function LeaderboardReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string | string[] }>;
}) {
  const actor = await requireActor();
  if (!canDecideLeaderboard(actor)) notFound();
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const m = getMessages(locale);
  const workspaces = (await loadViewableWorkspaces(actor)) ?? [];
  const workspace = selectWorkspace(workspaces, (await searchParams).workspace);
  if (!workspace) notFound();
  const pending = await readPendingCandidate(actor, workspace.id);
  if (pending.status === 'not_permitted') notFound();

  return (
    <main className={styles.main}>
      <h1>{m['leaderboard.publish.action']}</h1>
      <WorkspacePicker
        workspaces={workspaces}
        selectedId={workspace.id}
        label={m['registrationApproval.workspace']}
        submitLabel={m['packages.select']}
      />
      {pending.status === 'pending' && pending.entries.length > 0 ? (
        <>
          <LeaderboardList
            periodMonth={pending.periodMonth}
            entries={pending.entries}
            locale={locale}
            messages={m}
          />
          <ApproveForm
            action={approveLeaderboardAction}
            publicationId={pending.publicationId}
            label={m['leaderboard.publish.action']}
            approvedMessage={m['leaderboard.publish.approved']}
          />
        </>
      ) : (
        <EmptyState title={m['leaderboard.empty']} />
      )}
    </main>
  );
}
