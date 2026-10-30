import { cookies } from 'next/headers';
import { ClientStatus } from '../../../../components/registration-approval/ClientStatus';
import { LOCALE_COOKIE, parseLocale } from '../../../../lib/design/preferences';
import { getMessages } from '../../../../lib/i18n';
import { getClientSelfStatus } from '../../../../lib/client-access/status';
import styles from '../../../login/login.module.css';

export default async function ClientRegistrationStatusPage() {
  const [store, initialStatus] = await Promise.all([
    cookies(),
    getClientSelfStatus(),
  ]);
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);
  const messages = getMessages(locale);

  return (
    <main className={styles.main}>
      <h1>{messages['registrationApproval.clientStatus']}</h1>
      <ClientStatus
        initialStatus={initialStatus}
        locale={locale}
        messages={messages}
      />
    </main>
  );
}
