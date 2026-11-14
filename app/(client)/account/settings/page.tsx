import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import styles from '../../../../components/leaderboard/leaderboard.module.css';
import { Card } from '../../../../components/ui/Card';
import { requireActor } from '../../../../lib/auth/actor';
import { authorizeClientAccess } from '../../../../lib/client-access/authorize';
import { LOCALE_COOKIE, parseLocale } from '../../../../lib/design/preferences';
import { getMessages } from '../../../../lib/i18n';
import { readClientLeaderboardSelf } from '../../../../lib/leaderboard/service';
import { optOutAction, updateUsernameAction } from './actions';
import { OptOutForm, UsernameForm } from './LeaderboardSettingsForms';

export const dynamic = 'force-dynamic';

/**
 * F24 account-settings surface (FR-005, FR-007, FR-022). The page title
 * `accountSettings.title` is approved copy (S57-PO-13, 2026-11-15).
 */
export default async function ClientAccountSettingsPage() {
  const actor = await requireActor();
  if (actor.role !== null) notFound();
  const access = await authorizeClientAccess();
  if (!access.allowed) notFound();
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const m = getMessages(locale);
  const self = await readClientLeaderboardSelf(actor);
  if (self.status === 'not_permitted') notFound();
  if (self.status !== 'ok') throw new Error('leaderboard_settings_unavailable');

  return (
    <main className={styles.main}>
      <h1>{m['accountSettings.title']}</h1>
      <Card as="section" className={styles.section}>
        <UsernameForm
          action={updateUsernameAction}
          currentUsername={self.username ?? ''}
          messages={{
            label: m['clientSignup.username'],
            save: m['clientNotes.saveChanges'],
            saved: m['clientNotes.editedToast'],
            failed: m['states.error.description'],
            tooShort: m['accountSettings.username.tooShort'],
            tooLong: m['accountSettings.username.tooLong'],
            invalidChars: m['accountSettings.username.invalidChars'],
            unavailable: m['accountSettings.username.unavailable'],
          }}
        />
      </Card>
      <Card
        as="section"
        className={styles.section}
        aria-labelledby="leaderboard-participation"
      >
        <h2 id="leaderboard-participation">
          {m['leaderboard.optOut.mayAppear']}
        </h2>
        <p>{m['leaderboard.optOut.mayAppearBody']}</p>
        {!self.optedOut && !self.eligible && (
          <p>{m['leaderboard.ineligible']}</p>
        )}
        <OptOutForm
          action={optOutAction}
          optedOut={self.optedOut}
          label={m['leaderboard.optOut.turnOffParticipation']}
          successMessage={m['leaderboard.optOut.success']}
          optedOutMessage={m['leaderboard.optedOut']}
          failedMessage={m['states.error.description']}
        />
      </Card>
    </main>
  );
}
