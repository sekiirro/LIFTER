import { cookies } from 'next/headers';
import { SubscriptionExpiredNotice } from '../../../components/plans/SubscriptionExpiredNotice';
import { LOCALE_COOKIE, parseLocale } from '../../../lib/design/preferences';
import { getMessages } from '../../../lib/i18n';
import styles from '../../login/login.module.css';

export default async function SubscriptionExpiredPage() {
  const store = await cookies();
  const locale = parseLocale(store.get(LOCALE_COOKIE)?.value);
  const messages = getMessages(locale);

  return (
    <main className={styles.main}>
      <SubscriptionExpiredNotice locale={locale} messages={messages} />
    </main>
  );
}
