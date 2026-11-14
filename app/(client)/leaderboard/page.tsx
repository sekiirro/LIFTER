import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { LeaderboardList } from '../../../components/leaderboard/LeaderboardList';
import styles from '../../../components/leaderboard/leaderboard.module.css';
import { EmptyState } from '../../../components/ui/States';
import { requireActor } from '../../../lib/auth/actor';
import { authorizeClientAccess } from '../../../lib/client-access/authorize';
import { LOCALE_COOKIE, parseLocale } from '../../../lib/design/preferences';
import { getMessages } from '../../../lib/i18n';
import { readClientLeaderboard } from '../../../lib/leaderboard/service';

export const dynamic = 'force-dynamic';

export default async function ClientLeaderboardPage() {
  const actor = await requireActor();
  if (actor.role !== null) notFound();
  const access = await authorizeClientAccess();
  if (!access.allowed) notFound();
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const messages = getMessages(locale);
  const view = await readClientLeaderboard(actor);
  if (view.status === 'not_permitted') notFound();

  return (
    <main className={styles.main}>
      <h1>{messages['leaderboard.title']}</h1>
      {view.status === 'available' ? (
        <LeaderboardList
          periodMonth={view.periodMonth}
          entries={view.entries}
          locale={locale}
          messages={messages}
        />
      ) : (
        // Empty and unavailable share the approved empty copy; no error copy is approved.
        <EmptyState title={messages['leaderboard.empty']} />
      )}
    </main>
  );
}
