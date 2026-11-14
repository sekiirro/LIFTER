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
 * F24 account-settings surface (FR-005, FR-007, FR-022). Only approved copy is
 * rendered; a page title key is not approved yet (PO-DECISION-NEEDED), so the
 * page is composed of the two approved section headings.
 */
export default async function ClientAccountSettingsPage() {
  const actor = await requireActor();
  if (actor.role !== null) notFound();
  const access = await authorizeClientAccess();
  if (!access.allowed) notFound();
  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const m = getMessages(locale);
  const self = await readClientLeaderboardSelf(actor);
  if (self.status !== 'ok') notFound();

  return (
    <main className={styles.main}>
      <Card as="section" className={styles.section}>
        <UsernameForm
          action={updateUsernameAction}
          currentUsername={self.username ?? ''}
          messages={{
            label: m['clientSignup.username'],
            save: m['clientNotes.saveChanges'],
            tooShort: m['accountSettings.username.tooShort'],
            tooLong: m['accountSettings.username.tooLong'],
            invalidChars: m['accountSettings.username.invalidChars'],
            reserved: m['accountSettings.username.reserved'],
            workspaceTaken: m['accountSettings.username.workspaceTaken'],
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
        {self.optedOut ? (
          <p>{m['leaderboard.optedOut']}</p>
        ) : (
          <>
            {!self.eligible && <p>{m['leaderboard.ineligible']}</p>}
            <OptOutForm
              action={optOutAction}
              label={m['leaderboard.optOut.turnOffParticipation']}
              successMessage={m['leaderboard.optOut.success']}
            />
          </>
        )}
      </Card>
    </main>
  );
}
