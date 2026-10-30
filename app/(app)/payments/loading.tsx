import { cookies } from 'next/headers';
import { LOCALE_COOKIE, parseLocale } from '../../../lib/design/preferences';
import { getMessages } from '../../../lib/i18n';
import { Skeleton } from '../../../components/ui/States';
import styles from '../packages/packages.module.css';

export default async function Loading() {
  const store = await cookies();
  const m = getMessages(parseLocale(store.get(LOCALE_COOKIE)?.value));
  return (
    <main className={styles.main}>
      <h1>{m['registrationApproval.paymentTitle']}</h1>
      <div role="status" aria-busy="true">
        <span className="sr-only">{m['registrationApproval.loading']}</span>
        <Skeleton shape="card" />
      </div>
    </main>
  );
}
