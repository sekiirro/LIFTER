import { cookies } from 'next/headers';
import { Skeleton } from '../../../../components/ui/States';
import buttonStyles from '../../../../components/ui/Button.module.css';
import { LOCALE_COOKIE, parseLocale } from '../../../../lib/design/preferences';
import { getMessages } from '../../../../lib/i18n';
import styles from '../../../login/login.module.css';

export default async function ClientRegistrationStatusLoading() {
  const store = await cookies();
  const messages = getMessages(parseLocale(store.get(LOCALE_COOKIE)?.value));
  return (
    <main className={styles.main}>
      <h1>{messages['registrationApproval.clientStatus']}</h1>
      <div role="status" aria-busy="true">
        <span className={buttonStyles.srOnly}>
          {messages['registrationApproval.statusLoading']}
        </span>
        <Skeleton shape="card" />
      </div>
    </main>
  );
}
