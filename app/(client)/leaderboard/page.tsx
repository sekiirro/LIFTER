import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { LeaderboardList } from '../../../components/leaderboard/LeaderboardList';
import { MyRank } from '../../../components/leaderboard/MyRank';
import styles from '../../../components/leaderboard/leaderboard.module.css';
import { EmptyState } from '../../../components/ui/States';
import { requireActor } from '../../../lib/auth/actor';
import { authorizeClientAccess } from '../../../lib/client-access/authorize';
import { LOCALE_COOKIE, parseLocale } from '../../../lib/design/preferences';
import { getMessages } from '../../../lib/i18n';
import {
  readClientLeaderboard,
  readClientMyRank,
} from '../../../lib/leaderboard/service';

export const dynamic = 'force-dynamic';

export default async function ClientLeaderboardPage() {
  const actor = await requireActor();
  if (actor.role !== null) notFound();
  const access = await authorizeClientAccess();
  if (!access.allowed) notFound();
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const messages = getMessages(locale);
  const [view, myRank] = await Promise.all([
    readClientLeaderboard(actor),
    readClientMyRank(actor),
  ]);
  if (view.status === 'not_permitted') notFound();
  // A failed read goes to the route error boundary (approved generic copy).
  if (view.status === 'unavailable') throw new Error('leaderboard_unavailable');

  return (
    <main className={styles.main}>
      <h1>{messages['leaderboard.title']}</h1>
      {/* Private rank: shown only when ranked; a failed read hides just this line. */}
      <MyRank
        view={myRank}
        template={messages['leaderboard.myRank']}
        locale={locale}
      />
      {view.status === 'available' ? (
        <LeaderboardList
          periodMonth={view.periodMonth}
          entries={view.entries}
          locale={locale}
          messages={messages}
        />
      ) : (
        <EmptyState title={messages['leaderboard.empty']} />
      )}
    </main>
  );
}
