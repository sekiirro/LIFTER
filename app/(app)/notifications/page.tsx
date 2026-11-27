import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { requireActor } from '../../../lib/auth/actor';
import { LOCALE_COOKIE, parseLocale } from '../../../lib/design/preferences';
import { getMessages } from '../../../lib/i18n';
import { StaffNotifications } from '../../../components/shell/StaffNotifications';
import styles from './notifications-page.module.css';

export default async function NotificationsPage() {
  const actor = await requireActor();
  const isStaff =
    actor.role === 'platform_owner' ||
    actor.role === 'workspace_owner' ||
    actor.role === 'trainer';

  if (!isStaff) notFound();

  const locale = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const messages = getMessages(locale);

  return (
    <main className={styles.main}>
      <StaffNotifications
        messages={messages}
        locale={locale}
        isStandalone={true}
        className={styles.standaloneSurface}
      />
    </main>
  );
}
